"use strict";

const assert = require("node:assert/strict");
const { createSharedDirectoryProjectionService } = require("../adapters/shared-directory-projection-service");

function makeService(overrides = {}) {
  const calls = {
    assertRoot: [],
    remote: [],
    setDynamic: [],
  };
  const dynamicCache = new Map();
  const sharedDirectoryProvider = Object.assign({
    directoriesForWorkspace(workspaceId) {
      return [
        { id: "share-a", path: "/shared/a" },
        { id: "hidden", path: "/shared/hidden" },
      ].map((item) => Object.assign({ workspaceId }, item));
    },
    label(rawPath) {
      return String(rawPath || "").split(/[\\/]/).filter(Boolean).pop() || "Shared";
    },
    normalizePermission(value) {
      return value === "read_only" ? "read_only" : "read_write";
    },
    normalizeScope(value) {
      return value || "all_workspaces";
    },
    normalizeTargets(value) {
      return value?.targetWorkspaceIds || [];
    },
    projectsForWorkspace(workspaceId) {
      return [{ id: `dir-${workspaceId}`, workspaceId, root: "/shared/a" }];
    },
    publicRecord(record, workspaceId) {
      if (record.id === "hidden") return null;
      return { id: record.id, path: record.path, workspaceId };
    },
    removeRecord(identifier, workspaceId) {
      return { id: identifier, workspaceId };
    },
    roots(workspaceId, actorPrincipalOverride) {
      return [`${workspaceId}:${actorPrincipalOverride}`];
    },
    updateAccess(identifier, workspaceId, updates) {
      return { id: identifier, workspaceId, permission: updates.permission };
    },
    upsert(record) {
      return Object.assign({ id: "share-new" }, record);
    },
  }, overrides.sharedDirectoryProvider || {});

  const service = createSharedDirectoryProjectionService(Object.assign({
    sharedDirectoryProvider,
    assertRootNotProtected(root, message) {
      calls.assertRoot.push({ root, message });
    },
    cachedDynamicProjectsForWorkspace(workspaceId) {
      return dynamicCache.get(workspaceId) || [];
    },
    comparablePath(value) {
      return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
    },
    dedupeProjects(projects) {
      const seen = new Set();
      return (projects || []).filter((project) => {
        const key = project.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    isShareableRootProject(project) {
      return project?.shareable !== false;
    },
    loadCatalog() {
      return {
        workspaces: [
          { id: "owner", policy: { access_mode: "unrestricted" } },
          { id: "local", defaultWorkspace: "/local", policy: { access_mode: "restricted" } },
          { id: "nas", defaultWorkspace: "/volume1/Hermes/Nas", policy: { access_mode: "restricted" } },
        ],
        projects: [
          { id: "owner-a", workspaceId: "owner", root: "/owner/a" },
          { id: "local-a", workspaceId: "local", root: "/local/a" },
          { id: "nas-base", workspaceId: "nas", root: "/volume1/Hermes/Nas/Base" },
        ],
      };
    },
    remoteWorkspaceDirectoryProjects(workspace) {
      calls.remote.push(workspace.id);
      return Promise.resolve([
        { id: "nas-dynamic", workspaceId: workspace.id, root: "/volume1/Hermes/Nas/Dynamic" },
        { id: "nas-base", workspaceId: workspace.id, root: "/volume1/Hermes/Nas/Base" },
      ]);
    },
    setDynamicProjectsForWorkspace(workspaceId, projects) {
      calls.setDynamic.push({ workspaceId, ids: projects.map((project) => project.id) });
      dynamicCache.set(workspaceId, projects);
    },
  }, overrides.options || {}));
  return { service, calls };
}

async function testPublicProjectsUseDynamicRemoteProjectionForNasWorkspaces() {
  const { service, calls } = makeService();
  const first = await service.publicProjectsForWorkspace("nas");

  assert.deepEqual(first.map((project) => project.id), ["nas-dynamic", "nas-base", "dir-nas"]);
  assert.deepEqual(calls.remote, ["nas"]);
  assert.deepEqual(calls.setDynamic, [{
    workspaceId: "nas",
    ids: ["nas-dynamic", "nas-base"],
  }]);

  const second = await service.publicProjectsForWorkspace("nas");
  assert.deepEqual(second.map((project) => project.id), ["nas-dynamic", "nas-base", "dir-nas"]);
  assert.deepEqual(calls.remote, ["nas"]);
}

async function testLocalAndOwnerProjectsSkipRemoteLookup() {
  const { service, calls } = makeService();
  assert.deepEqual((await service.publicProjectsForWorkspace("owner")).map((item) => item.id), ["owner-a", "dir-owner"]);
  assert.deepEqual((await service.publicProjectsForWorkspace("local")).map((item) => item.id), ["local-a", "dir-local"]);
  assert.deepEqual(calls.remote, []);
}

async function testPublicProjectsIncludeSharedDirectoryRoots() {
  const { service } = makeService();
  const projects = await service.publicProjectsForWorkspace("local");
  const shared = projects.find((project) => project.id === "dir-local");
  assert.equal(shared.workspaceId, "local");
  assert.equal(shared.root, "/shared/a");
}

async function testShareableRootProjectUsesPublicProjection() {
  const { service } = makeService();
  const match = await service.shareableRootProjectForPath("nas", "/volume1/Hermes/Nas/Dynamic/");
  assert.equal(match.id, "nas-dynamic");
  assert.equal(await service.shareableRootProjectForPath("nas", ""), null);
}

function testSharedDirectoryProjectionAndMutationWrappers() {
  const { service, calls } = makeService();
  assert.deepEqual(service.listPublicSharedDirectories("child"), [
    { id: "share-a", path: "/shared/a", workspaceId: "child" },
  ]);
  assert.equal(service.sharedDirectoryLabel("/shared/a"), "a");
  assert.deepEqual(service.roots("child", "principal-child"), ["child:principal-child"]);
  assert.deepEqual(service.sharedDirectoryProjectsForWorkspace("child"), [{
    id: "dir-child",
    workspaceId: "child",
    root: "/shared/a",
  }]);

  const record = service.upsertSharedDirectory({ path: "/shared/new", label: "New" });
  assert.equal(record.id, "share-new");
  assert.deepEqual(calls.assertRoot, [{
    root: "/shared/new",
    message: "Shared directory is blocked by the Hermes Mobile security boundary",
  }]);
  assert.deepEqual(service.removeSharedDirectoryRecord("share-a", "child"), { id: "share-a", workspaceId: "child" });
  assert.deepEqual(service.updateSharedDirectoryAccess("share-a", "child", { permission: "read_only" }), {
    id: "share-a",
    workspaceId: "child",
    permission: "read_only",
  });
}

function testDependencyValidation() {
  assert.throws(
    () => createSharedDirectoryProjectionService({}),
    /sharedDirectoryProvider\.directoriesForWorkspace/,
  );
}

async function run() {
  await testPublicProjectsUseDynamicRemoteProjectionForNasWorkspaces();
  await testLocalAndOwnerProjectsSkipRemoteLookup();
  await testPublicProjectsIncludeSharedDirectoryRoots();
  await testShareableRootProjectUsesPublicProjection();
  testSharedDirectoryProjectionAndMutationWrappers();
  testDependencyValidation();
  console.log("shared directory projection service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
