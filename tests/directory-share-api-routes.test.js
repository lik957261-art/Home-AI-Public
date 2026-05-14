"use strict";

const assert = require("node:assert/strict");
const {
  DIRECTORY_SHARE_API_ROUTE_SPECS,
  createDirectoryShareApiRoutes,
} = require("../server-routes/directory-share-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    basename: [],
    cacheClear: 0,
    directoryRequestParams: [],
    findThread: [],
    invalidate: 0,
    normalizePermission: [],
    normalizeScope: [],
    normalizeTargets: [],
    publicShared: [],
    readBody: [],
    remove: [],
    resolve: [],
    rootProject: [],
    stat: [],
    update: [],
    upsert: [],
    workspaceAccess: [],
    workspacePrincipal: [],
  };
  const deps = Object.assign({
    readBody(req) {
      calls.readBody.push(req.body || {});
      return Promise.resolve(req.body || {});
    },
    sendJson,
    findDirectoryThreadForRequest(req, threadId) {
      calls.findThread.push({ threadId, key: req.headers?.["x-hermes-web-key"] || "" });
      if (threadId === "missing-thread") return null;
      return { id: threadId || "thread-a", workspaceId: "owner" };
    },
    resolveBrowserPathAsync(thread, params) {
      calls.resolve.push({ thread, params });
      if (params.path === "missing") return Promise.resolve(null);
      if (params.path === "file") {
        return Promise.resolve({
          displayPath: "Owner/File.txt",
          workspacePath: "File.txt",
          localPath: "C:\\Data\\File.txt",
          label: "File",
        });
      }
      return Promise.resolve({
        displayPath: "Owner/Project A",
        workspacePath: "Project A",
        localPath: "C:\\Data\\Project A",
        label: "Resolved Label",
      });
    },
    directoryRequestParams(body) {
      calls.directoryRequestParams.push(body);
      return { path: body.path || "" };
    },
    shareableRootProjectForPath(workspaceId, displayPath) {
      calls.rootProject.push({ workspaceId, displayPath });
      if (displayPath === "Owner/Blocked") return Promise.resolve(null);
      return Promise.resolve({ id: "project-a", label: "Project A" });
    },
    sharedDirectoryLabel(displayPath) {
      return `label:${displayPath}`;
    },
    statSync(localPath) {
      calls.stat.push(localPath);
      if (localPath.endsWith("Missing")) throw new Error("ENOENT");
      return { isDirectory: () => !localPath.endsWith("File.txt") };
    },
    basename(localPath) {
      calls.basename.push(localPath);
      return String(localPath).split("\\").pop();
    },
    upsertSharedDirectory(record) {
      calls.upsert.push(record);
      return Object.assign({ id: "share-a" }, record);
    },
    nowIso() {
      return "2026-05-14T14:00:00.000Z";
    },
    workspacePrincipal(workspaceId) {
      calls.workspacePrincipal.push(workspaceId);
      return `principal:${workspaceId}`;
    },
    normalizeSharePermission(value) {
      calls.normalizePermission.push(value);
      return value || "read";
    },
    normalizeShareScope(value, targets) {
      calls.normalizeScope.push({ value, targets });
      return value || "selected";
    },
    normalizeShareTargets(body) {
      calls.normalizeTargets.push(body.targetWorkspaceIds || body.targets || []);
      return body.targetWorkspaceIds || body.targets || [];
    },
    invalidateCatalogCache() {
      calls.invalidate += 1;
    },
    clearDynamicProjectCache() {
      calls.cacheClear += 1;
    },
    publicSharedDirectory(record, workspaceId) {
      calls.publicShared.push({ id: record.id, workspaceId });
      return {
        id: record.id,
        path: record.path,
        label: record.label,
        workspaceId,
        permission: record.permission,
      };
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    removeSharedDirectoryRecord(idOrPath, workspaceId) {
      calls.remove.push({ idOrPath, workspaceId });
      return { id: idOrPath, path: "Owner/Project A", label: "Project A" };
    },
    updateSharedDirectoryAccess(idOrPath, workspaceId, body) {
      calls.update.push({ idOrPath, workspaceId, body });
      return { id: idOrPath, path: "Owner/Project A", label: "Project A", permission: body.permission };
    },
  }, overrides);
  return { routes: createDirectoryShareApiRoutes(deps), calls };
}

async function request(routes, method, path, body = {}, options = {}) {
  const res = makeResponse();
  const context = Object.hasOwn(options, "auth") ? { auth: options.auth } : undefined;
  const result = await routes.handle(
    { method, url: path, headers: options.headers || {}, body },
    res,
    makeUrl(path),
    context,
  );
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(DIRECTORY_SHARE_API_ROUTE_SPECS.map((route) => route.id), [
    "directories-share-create",
    "directories-share-delete",
    "directories-share-update",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "POST", path: "/api/directories/share" }).id, "directories-share-create");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/unshare" }).id, "directories-share-delete");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/share/update" }).id, "directories-share-update");
  assert.equal(routes.match({ method: "GET", path: "/api/directories/share" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.byModule, { "directory-share": 3 });
  assert.deepEqual(summary.byAuthMode, { "access-key": 3 });
  assert.equal(JSON.stringify(summary).includes("/api/directories/share"), false);

  const listed = routes.list({ public: true });
  assert.equal(listed.every((route) => route.workspaceScoped), true);
  assert.equal(Object.hasOwn(listed[0], "path"), false);

  const miss = await request(routes, "POST", "/api/directories/delete", {});
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testShareSuccess() {
  const { routes, calls } = makeRoutes();
  const auth = { workspaceId: "owner", role: "owner" };
  const got = await request(routes, "POST", "/api/directories/share", {
    threadId: "thread-a",
    path: "project-a",
    permission: "write",
    scope: "selected",
    targetWorkspaceIds: ["child-a", "child-b"],
  }, {
    auth,
    headers: { "x-hermes-web-key": "test-key" },
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "directories-share-create");
  assert.deepEqual(got.result.auth, auth);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    ok: true,
    shared: {
      id: "share-a",
      path: "Owner/Project A",
      label: "Project A",
      workspaceId: "owner",
      permission: "write",
      displayPath: "Project A",
      workspacePath: "Project A",
      source: "hermes-web-shared-directory",
    },
  });
  assert.deepEqual(calls.findThread, [{ threadId: "thread-a", key: "test-key" }]);
  assert.deepEqual(calls.directoryRequestParams[0].path, "project-a");
  assert.deepEqual(calls.rootProject, [{ workspaceId: "owner", displayPath: "Owner/Project A" }]);
  assert.deepEqual(calls.stat, ["C:\\Data\\Project A"]);
  assert.deepEqual(calls.workspacePrincipal, ["owner"]);
  assert.deepEqual(calls.upsert, [{
    path: "Owner/Project A",
    label: "Project A",
    createdAt: "2026-05-14T14:00:00.000Z",
    createdBy: "owner",
    createdByPrincipalId: "principal:owner",
    permission: "write",
    scope: "selected",
    targetWorkspaceIds: ["child-a", "child-b"],
  }]);
  assert.equal(calls.invalidate, 1);
  assert.equal(calls.cacheClear, 1);
}

async function testShareValidationFailures() {
  const { routes, calls } = makeRoutes();

  const bodyError = await request(makeRoutes({
    readBody() {
      return Promise.reject(new Error("bad json"));
    },
  }).routes, "POST", "/api/directories/share", {});
  assert.equal(bodyError.res.statusCode, 400);
  assert.deepEqual(bodyError.body, { error: "bad json" });

  const missingThread = await request(routes, "POST", "/api/directories/share", { threadId: "missing-thread" });
  assert.equal(missingThread.res.statusCode, 404);
  assert.deepEqual(missingThread.body, { error: "Thread not found" });

  const missingDir = await request(routes, "POST", "/api/directories/share", { path: "missing" });
  assert.equal(missingDir.res.statusCode, 404);
  assert.deepEqual(missingDir.body, { error: "Directory not found or not allowed" });

  const notDirectory = await request(routes, "POST", "/api/directories/share", { path: "file" });
  assert.equal(notDirectory.res.statusCode, 400);
  assert.deepEqual(notDirectory.body, { error: "Only directories can be shared" });
  assert.deepEqual(calls.upsert, []);
  assert.equal(calls.invalidate, 0);
  assert.equal(calls.cacheClear, 0);
}

async function testUnshare() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/unshare", {
    id: "share-a",
    workspaceId: "child-a",
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "directories-share-delete");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    ok: true,
    removed: {
      id: "share-a",
      path: "Owner/Project A",
      label: "Project A",
      workspaceId: "child-a",
    },
  });
  assert.deepEqual(calls.workspaceAccess, ["child-a"]);
  assert.deepEqual(calls.remove, [{ idOrPath: "share-a", workspaceId: "child-a" }]);
  assert.equal(calls.invalidate, 1);
  assert.equal(calls.cacheClear, 1);

  const denied = await request(routes, "POST", "/api/directories/unshare", {
    id: "share-a",
    workspaceId: "blocked",
  });
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Workspace access is not allowed" });
  assert.equal(calls.remove.length, 1);
}

async function testUpdate() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/share/update", {
    path: "Owner/Project A",
    workspaceId: "child-a",
    permission: "read",
    scope: "all",
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "directories-share-update");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    ok: true,
    shared: {
      id: "Owner/Project A",
      path: "Owner/Project A",
      label: "Project A",
      workspaceId: "child-a",
      permission: "read",
    },
  });
  assert.deepEqual(calls.workspaceAccess, ["child-a"]);
  assert.deepEqual(calls.update, [{
    idOrPath: "Owner/Project A",
    workspaceId: "child-a",
    body: {
      path: "Owner/Project A",
      workspaceId: "child-a",
      permission: "read",
      scope: "all",
    },
  }]);
  assert.equal(calls.invalidate, 1);
  assert.equal(calls.cacheClear, 1);
}

async function testUnshareAndUpdateBusinessErrors() {
  const removeError = new Error("Shared directory not found");
  removeError.status = 404;
  const unshare = await request(makeRoutes({
    removeSharedDirectoryRecord() {
      throw removeError;
    },
  }).routes, "POST", "/api/directories/unshare", { id: "missing" });
  assert.equal(unshare.res.statusCode, 404);
  assert.deepEqual(unshare.body, { error: "Shared directory not found" });

  const updateError = new Error("Invalid permission");
  updateError.status = 400;
  const update = await request(makeRoutes({
    updateSharedDirectoryAccess() {
      throw updateError;
    },
  }).routes, "POST", "/api/directories/share/update", { id: "share-a" });
  assert.equal(update.res.statusCode, 400);
  assert.deepEqual(update.body, { error: "Invalid permission" });
}

function testDependencyValidation() {
  assert.throws(
    () => createDirectoryShareApiRoutes({}),
    /directory share api routes require readBody/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testShareSuccess();
  await testShareValidationFailures();
  await testUnshare();
  await testUpdate();
  await testUnshareAndUpdateBusinessErrors();
  testDependencyValidation();
  console.log("directory share api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
