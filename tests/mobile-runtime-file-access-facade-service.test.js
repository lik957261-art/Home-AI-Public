"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeFileAccessFacadeService } = require("../adapters/mobile-runtime-file-access-facade-service");

function createDeps(overrides = {}) {
  const calls = [];
  const deps = {
    allProjectsForWorkspaceSync: () => [],
    authenticateRequest(req) {
      calls.push(["authenticateRequest", req]);
      return req.auth || { workspaceId: "owner", owner: true };
    },
    authCanAccessWorkspace: () => true,
    chatGroupMemberWorkspaceIds: () => [],
    comparablePath: (value) => String(value || "").toLowerCase(),
    dedupe: (values) => [...new Set((values || []).filter(Boolean))],
    fileArtifactResolverService: {
      resolveArtifactForRequest(artifactId, auth) {
        calls.push(["resolveArtifactForRequest", artifactId, auth]);
        return { artifact: { id: artifactId } };
      },
      resolveFileForBrowserRequest(query, auth) {
        calls.push(["resolveFileForBrowserRequest", query, auth]);
        return { file: { name: "file.md" } };
      },
    },
    fileResponseService: {
      sendResolvedBridgeFile(res, file, query) {
        calls.push(["sendResolvedBridgeFile", res, file, query]);
        return "bridge-file";
      },
      sendResolvedBridgeFilePreview(res, file) {
        calls.push(["sendResolvedBridgeFilePreview", res, file]);
        return "bridge-preview";
      },
      sendResolvedFile(res, file, query) {
        calls.push(["sendResolvedFile", res, file, query]);
        return "file";
      },
      sendResolvedFilePreview(res, file) {
        calls.push(["sendResolvedFilePreview", res, file]);
        return "preview";
      },
    },
    findThreadForAuth(auth, threadId) {
      calls.push(["findThreadForAuth", auth, threadId]);
      return null;
    },
    getRuntimeStateNormalizationService: () => ({ normalizeTaskGroupMeta: (value) => value || {} }),
    getSingleWindowThreadService: () => ({ isKanbanCaseTopicThread: () => false }),
    isOwnerAuth: () => true,
    logicalDirectoryDisplayPath: (_thread, value) => String(value || ""),
    mimeFor: () => "text/plain",
    normalizeLocalPath: (value) => String(value || ""),
    pathDirectChildOfRoot: () => true,
    pathInsideAnyRoot: () => true,
    pathPolicyProvider: {
      assertChildPathInside: (_parent, child) => child,
      canBrowseDirectoryForThread: () => ({ allowed: true }),
    },
    policyForThread: () => ({}),
    runDirectoryBridge: () => ({ ok: true }),
    sharedDirectoryProvider: {},
    sharedDirectoryRoots: () => [],
  };
  return { calls, deps: Object.assign(deps, overrides) };
}

function testFacadeDelegatesFileAccess() {
  const { calls, deps } = createDeps();
  const service = createMobileRuntimeFileAccessFacadeService(deps);
  const query = new URLSearchParams({ path: "x" });
  const auth = { workspaceId: "owner" };
  const res = {};
  const file = { localPath: "file.md" };

  assert.deepEqual(service.resolveFileForBrowserRequest(query, auth), { file: { name: "file.md" } });
  assert.deepEqual(service.resolveArtifactForRequest("artifact_1", auth), { artifact: { id: "artifact_1" } });
  assert.equal(service.sendResolvedFile(res, file, query), "file");
  assert.equal(service.sendResolvedBridgeFile(res, file, query), "bridge-file");
  assert.equal(service.sendResolvedFilePreview(res, file), "preview");
  assert.equal(service.sendResolvedBridgeFilePreview(res, file), "bridge-preview");
  assert.deepEqual(calls.map((item) => item[0]), [
    "resolveFileForBrowserRequest",
    "resolveArtifactForRequest",
    "sendResolvedFile",
    "sendResolvedBridgeFile",
    "sendResolvedFilePreview",
    "sendResolvedBridgeFilePreview",
  ]);
}

function testDirectoryBoundaryIsLazyAndStable() {
  const { deps } = createDeps();
  const service = createMobileRuntimeFileAccessFacadeService(deps);
  const first = service.getDirectoryBrowserBoundaryService();
  const second = service.getDirectoryBrowserBoundaryService();
  assert.equal(first, second);
  assert.equal(typeof first.resolveBrowserPath, "function");
  assert.equal(typeof first.assertChildPathInside, "function");
}

function testFindDirectoryThreadReturnsExistingThread() {
  const existingThread = { id: "thread_dir", workspaceId: "owner" };
  const { calls, deps } = createDeps({
    findThreadForAuth(auth, threadId) {
      calls.push(["findThreadForAuth", auth, threadId]);
      return threadId === "thread_dir" ? existingThread : null;
    },
  });
  const service = createMobileRuntimeFileAccessFacadeService(deps);
  const req = { auth: { workspaceId: "owner", owner: true } };

  assert.equal(service.findDirectoryThreadForRequest(req, "thread_dir"), existingThread);
  assert.deepEqual(calls.map((item) => item[0]), ["authenticateRequest", "findThreadForAuth"]);
}

function testFindDirectoryThreadFallsBackForOwnerOnly() {
  const owner = createMobileRuntimeFileAccessFacadeService(createDeps().deps);
  const ownerFallback = owner.findDirectoryThreadForRequest({ auth: { workspaceId: "owner", owner: true } }, "missing");

  assert.deepEqual(ownerFallback, owner.ownerDirectoryBrowserThread());

  const nonOwner = createMobileRuntimeFileAccessFacadeService(createDeps({
    isOwnerAuth: () => false,
  }).deps);
  assert.equal(nonOwner.findDirectoryThreadForRequest({ auth: { workspaceId: "weixin_wuping" } }, "missing"), null);
}

function testRequiredDependencyGuard() {
  assert.throws(
    () => createMobileRuntimeFileAccessFacadeService(createDeps({ fileResponseService: null }).deps),
    /requires fileResponseService/,
  );
}

testFacadeDelegatesFileAccess();
testDirectoryBoundaryIsLazyAndStable();
testFindDirectoryThreadReturnsExistingThread();
testFindDirectoryThreadFallsBackForOwnerOnly();
testRequiredDependencyGuard();
console.log("mobile-runtime-file-access-facade-service tests passed");
