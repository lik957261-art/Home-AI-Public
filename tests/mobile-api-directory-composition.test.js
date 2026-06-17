"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileApiDirectoryComposition } = require("../server-routes/mobile-api-directory-composition");

function assertRouteContract(route, name) {
  assert.equal(typeof route.handle, "function", `${name}.handle`);
  assert.equal(typeof route.list, "function", `${name}.list`);
  assert.equal(typeof route.match, "function", `${name}.match`);
  assert.equal(typeof route.summary, "function", `${name}.summary`);
}

function createDeps(options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hm-directory-composition-"));
  fs.writeFileSync(path.join(tmp, "receipt.md"), "ok", "utf8");
  let boundaryCalls = [];
  const boundaryService = {
    assertChildPathInside: () => true,
    compareDirectoryEntriesNewestFirst: () => 0,
    directoryRequestParams: (input) => input || {},
    isDeletableWorkspaceRootChild: () => true,
    isProtectedDirectoryRoot: () => false,
    isSharedDirectoryWriteAllowed: () => true,
    joinDisplayPath: (...parts) => parts.filter(Boolean).join("/"),
    publicDirectoryEntry: (thread, displayPath, localPath, entry) => {
      boundaryCalls.push({ method: "publicDirectoryEntry", name: entry.name });
      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: `${displayPath}/${entry.name}`,
        localPath: path.join(localPath, entry.name),
      };
    },
    publicManagedEntry: () => ({}),
    publicRemoteDirectoryEntry: () => ({}),
    resolveBrowserPathAsync: async () => {
      boundaryCalls.push({ method: "resolveBrowserPathAsync" });
      return {
        label: "Documents",
        displayPath: "/Documents",
        workspacePath: "Documents",
        localPath: tmp,
      };
    },
  };
  const sharedDirectoryProjectionService = {
    normalizeSharePermission: (value) => value,
    normalizeShareScope: (value) => value,
    normalizeShareTargets: (value) => value,
    publicSharedDirectory: (value) => value,
    removeSharedDirectoryRecord: () => ({ ok: true }),
    shareableRootProjectForPath: () => ({ id: "root", label: "Documents" }),
    sharedDirectoryLabel: () => "Documents",
    updateSharedDirectoryAccess: () => ({ ok: true }),
    upsertSharedDirectory: () => ({ ok: true }),
  };
  const injectedNoteReceiptSaveService = options.noteReceiptSaveService || { saveReceipt: async () => ({ ok: true }) };
  return {
    tmp,
    getBoundaryCalls: () => boundaryCalls.slice(),
    deps: {
      authenticateRequest: () => ({ ok: true, workspaceId: "owner" }),
      basename: path.basename,
      clearDynamicProjectCache: () => {},
      clearDynamicProjectCacheForWorkspace: () => {},
      consumeOwnerElevationOnce: () => false,
      contentDisposition: () => "inline",
      dataDir: tmp,
      env: {},
      exists: fs.existsSync,
      extractDocxText: () => ({ text: "", totalChars: 0, truncated: false }),
      findDirectoryThreadForRequest: () => ({ id: "thread_dir", workspaceId: "owner" }),
      getDirectoryBrowserBoundaryService: () => boundaryService,
      getRuntimeStateThreadService: () => ({
        findThreadForRequest: () => ({ id: "thread_1", workspaceId: "owner", messages: [{ id: "msg_1" }] }),
      }),
      getSharedDirectoryProjectionService: () => sharedDirectoryProjectionService,
      invalidateCatalogCache: () => {},
      isDirectoryBrowserPathAllowedForThread: () => true,
      isOwnerAuth: () => true,
      isOwnerElevationActive: () => false,
      joinLocalPath: path.join,
      maxUploadBytes: 1024,
      mimeFor: () => "text/markdown",
      mkdir: async (target) => fs.promises.mkdir(target, { recursive: true }),
      noteReceiptSaveService: injectedNoteReceiptSaveService,
      nowIso: () => "2026-06-07T00:00:00.000Z",
	      readBody: async () => ({ threadId: "thread_1", messageId: "msg_1" }),
	      readdir: fs.promises.readdir,
	      requireWorkspaceAccess: () => "owner",
      rename: fs.renameSync,
      resolveArtifactForRequest: () => ({ artifact: null }),
      resolveFileForBrowserRequest: () => ({ file: null, status: 404, error: "missing" }),
      rmdir: fs.promises.rmdir,
      rmDirRecursive: fs.promises.rm,
      runDirectoryBridge: async () => ({ ok: true, entries: [] }),
      safeDirectoryName: (value) => String(value || "folder"),
      safeFileName: (value) => String(value || "file"),
      sendJson: (res, status, payload) => {
        res.status = status;
        res.payload = payload;
      },
      statSync: fs.statSync,
      textFilePreview: () => ({ text: "", totalChars: 0, truncated: false }),
      uniqueChildPath: (target) => target,
      unlink: fs.promises.unlink,
      workspacePrincipal: () => ({ workspaceId: "owner" }),
      writeFile: fs.promises.writeFile,
    },
  };
}

async function testCompositionContract() {
  const injectedNoteReceiptSaveService = { saveReceipt: async () => ({ ok: true, injected: true }) };
  const { deps } = createDeps({ noteReceiptSaveService: injectedNoteReceiptSaveService });
  const composition = createMobileApiDirectoryComposition(deps);

  assert.deepEqual(Object.keys(composition.routes).sort(), [
    "directoryBrowserApiRoutes",
    "directoryMutationApiRoutes",
    "directoryShareApiRoutes",
    "fileArtifactApiRoutes",
    "noteReceiptApiRoutes",
  ]);
  assert.deepEqual(Object.keys(composition.services).sort(), ["noteReceiptSaveService"]);
  assert.equal(composition.services.noteReceiptSaveService, injectedNoteReceiptSaveService);
  for (const [name, route] of Object.entries(composition.routes)) assertRouteContract(route, name);
}

async function testDirectoryBrowserDelegatesThroughBoundaryFacade() {
  const { deps, getBoundaryCalls } = createDeps();
  const composition = createMobileApiDirectoryComposition(deps);
  const res = {};

  const result = await composition.routes.directoryBrowserApiRoutes.handle(
    { method: "GET", url: "/api/directories/preview" },
    res,
    new URL("http://localhost/api/directories/preview?threadId=thread_dir"),
    { auth: { workspaceId: "owner" } },
  );

  assert.equal(result.handled, true);
  assert.equal(res.status, 200);
  assert.equal(res.payload.entryCount, 1);
  assert.equal(res.payload.entries[0].name, "receipt.md");
  assert.deepEqual(getBoundaryCalls().map((call) => call.method), [
    "resolveBrowserPathAsync",
    "publicDirectoryEntry",
  ]);
}

async function main() {
  await testCompositionContract();
  await testDirectoryBrowserDelegatesThroughBoundaryFacade();
  console.log("mobile API directory composition tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
