"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDirectoryBrowserBoundaryService } = require("../adapters/directory-browser-boundary-service");

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-dir-boundary-"));
  let result;
  try {
    result = fn(root);
  } catch (err) {
    fs.rmSync(root, { recursive: true, force: true });
    throw err;
  }
  if (result && typeof result.then === "function") {
    return result.finally(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
  }
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

function comparablePath(value) {
  return path.resolve(String(value || "")).replaceAll("\\", "/").toLowerCase();
}

function pathInsideAnyRoot(candidatePath, roots) {
  const candidate = comparablePath(candidatePath);
  return (roots || []).some((root) => {
    const base = comparablePath(root);
    return candidate === base || candidate.startsWith(`${base}/`);
  });
}

function pathDirectChildOfRoot(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !relative.includes(path.sep));
}

function makeService(root, overrides = {}) {
  const ownerRoot = path.join(root, "owner");
  const projectRoot = path.join(ownerRoot, "Project");
  fs.mkdirSync(projectRoot, { recursive: true });
  return createDirectoryBrowserBoundaryService(Object.assign({
    allProjectsForWorkspaceSync: () => [{
      id: "project",
      label: "Project",
      aliases: ["Alias"],
      root: projectRoot,
      source: "workspace-directory",
      children: [{ id: "child", label: "Child", root: path.join(projectRoot, "Child") }],
    }],
    authCanAccessWorkspace: (auth, workspaceId) => auth?.workspaceId === workspaceId,
    chatGroupMemberWorkspaceIds: (thread) => thread?.chatGroup?.memberWorkspaceIds || [],
    comparablePath,
    dedupe: (items) => [...new Set(items)],
    isKanbanCaseTopicThread: (thread) => thread?.chatGroup?.kind === "kanban-case-topic",
    isOwnerAuth: (auth) => auth?.workspaceId === "owner",
    logicalDirectoryDisplayPath: (_thread, rawPath, fallback) => `logical:${fallback || path.basename(rawPath)}`,
    mimeFor: (value) => path.extname(value) === ".txt" ? "text/plain" : "",
    normalizeLocalPath: (value) => String(value || ""),
    normalizeTaskGroupMeta: (value) => value || {},
    pathDirectChildOfRoot,
    pathInsideAnyRoot,
    pathPolicyProvider: {
      assertChildPathInside(parentPath, childPath) {
        if (!pathInsideAnyRoot(childPath, [parentPath])) throw new Error("outside parent");
      },
      canBrowseDirectoryForThread(_thread, localPath, originalPath) {
        return { allowed: pathInsideAnyRoot(localPath || originalPath, [ownerRoot]) || String(originalPath || "").startsWith("/volume1/") };
      },
    },
    policyForThread: () => ({
      default_workspace: ownerRoot,
      sync_root: path.join(ownerRoot, "Sync"),
      download_root: path.join(ownerRoot, "Downloads"),
      allowed_roots: [projectRoot],
      delivery_roots: [],
      cache_roots: [],
      principal_id: "user",
    }),
    runDirectoryBridge: async () => ({ ok: true, entry: { name: "remote", type: "directory", path: "/volume1/remote", mtime: "2026-05-15T00:00:00.000Z" } }),
    sharedDirectoryProvider: {
      isWriteAllowed: () => false,
    },
    sharedDirectoryRoots: () => [path.join(ownerRoot, "Shared")],
  }, overrides));
}

function testAliasAndLocalResolution() {
  withTempDir((root) => {
    const service = makeService(root);
    const thread = { id: "thread-1", workspaceId: "owner" };
    const resolved = service.resolveBrowserPath(thread, new URLSearchParams({ alias: "Alias" }));
    assert.equal(resolved.label, "Alias");
    assert.equal(resolved.workspacePath, "logical:Alias");

    const entryFile = path.join(resolved.localPath, "note.txt");
    fs.writeFileSync(entryFile, "hello", "utf8");
    const entry = service.publicDirectoryEntry(thread, resolved.displayPath, resolved.localPath, { name: "note.txt" });
    assert.equal(entry.type, "file");
    assert.equal(entry.mime, "text/plain");
    assert.equal(entry.path, path.join(resolved.displayPath, "note.txt"));
    const entryUrl = new URL(`http://local${entry.url}`);
    assert.equal(entryUrl.pathname, "/api/files");
    assert.equal(entryUrl.searchParams.get("threadId"), "thread-1");
    assert.equal(entryUrl.searchParams.get("path"), entry.path);
    assert.equal(service.publicDirectoryEntry(thread, resolved.displayPath, resolved.localPath, { name: ".hidden" }), null);
  });
}

async function testRemoteAndMutationPolicy() {
  await withTempDir(async (root) => {
    const service = makeService(root);
    const thread = {
      id: "thread-2",
      workspaceId: "owner",
      chatGroup: { kind: "kanban-case-topic", memberWorkspaceIds: ["learner"] },
      taskGroupMeta: {
        task: { caseDirectoryPath: path.join(root, "owner", "Learner", "study") },
      },
    };
    const remote = await service.resolveBrowserPathAsync(thread, new URLSearchParams({ path: "/volume1/remote" }));
    assert.equal(remote.remote, "wsl");
    assert.equal(remote.workspacePath, "logical:remote");
    const remoteEntry = service.publicRemoteDirectoryEntry(thread, "/volume1", { name: "remote", type: "directory", path: "/volume1/remote" });
    assert.equal(remoteEntry.url, "/directory-viewer.html?threadId=thread-2&path=%2Fvolume1%2Fremote");

    const ownerRoot = path.join(root, "owner");
    const child = path.join(ownerRoot, "LooseFolder");
    fs.mkdirSync(child, { recursive: true });
    assert.equal(service.isDeletableWorkspaceRootChild(thread, child, child), true);
    assert.equal(service.isProtectedDirectoryRoot(thread, path.join(ownerRoot, "Project")), true);
    assert.equal(service.isSharedDirectoryWriteAllowed(thread, path.join(ownerRoot, "Learner", "study", "x.txt"), "", { workspaceId: "learner" }), false);
  });
}

function testSortAndParams() {
  const service = makeService(os.tmpdir());
  const params = service.directoryRequestParams({ threadId: "t1", path: "p", alias: "a", ignored: "x" });
  assert.equal(params.toString(), "threadId=t1&path=p&alias=a");
  const rows = [
    { name: "b.txt", type: "file", mtime: "2026-05-14T00:00:00.000Z" },
    { name: "folder", type: "directory", mtime: "2026-05-13T00:00:00.000Z" },
    { name: "a.txt", type: "file", mtime: "2026-05-15T00:00:00.000Z" },
  ].sort(service.compareDirectoryEntriesNewestFirst);
  assert.deepEqual(rows.map((row) => row.name), ["folder", "a.txt", "b.txt"]);
}

function testDefaultWorkspaceRelativeResolution() {
  withTempDir((root) => {
    const service = makeService(root);
    const thread = { id: "thread-3", workspaceId: "owner" };
    const ownerRoot = path.join(root, "owner");
    const weixinRoot = path.join(ownerRoot, "微信入口附件");
    const dateRoot = path.join(weixinRoot, "20260617");
    fs.mkdirSync(dateRoot, { recursive: true });

    const defaultRoot = service.resolveBrowserPath(thread, new URLSearchParams());
    assert.equal(defaultRoot.localPath, ownerRoot);
    assert.equal(defaultRoot.displayPath, ownerRoot);

    const parent = service.resolveBrowserPath(thread, new URLSearchParams({ path: "微信入口附件" }));
    assert.equal(parent.localPath, weixinRoot);
    assert.equal(parent.displayPath, path.join(ownerRoot, "微信入口附件"));

    const dated = service.resolveBrowserPath(thread, new URLSearchParams({ path: "微信入口附件/20260617" }));
    assert.equal(dated.localPath, dateRoot);

    assert.equal(service.resolveBrowserPath(thread, new URLSearchParams({ path: "../outside" })), null);
  });
}

(async () => {
  testAliasAndLocalResolution();
  await testRemoteAndMutationPolicy();
  testSortAndParams();
  testDefaultWorkspaceRelativeResolution();
  console.log("directory browser boundary service tests passed");
})();
