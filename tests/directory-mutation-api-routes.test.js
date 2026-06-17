"use strict";

const assert = require("node:assert/strict");
const {
  DIRECTORY_MUTATION_API_ROUTE_SPECS,
  createDirectoryMutationApiRoutes,
} = require("../server-routes/directory-mutation-api-routes");

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

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function dirStat() {
  return { isDirectory: () => true };
}

function fileStat() {
  return { isDirectory: () => false };
}

function makeRoutes(overrides = {}) {
  const calls = {
    auth: [],
    clearDynamicProjectCache: [],
    directoryRequestParams: [],
    exists: [],
    findThread: [],
    invalidateCatalogCache: 0,
    mkdir: [],
    rename: [],
    remoteEntries: [],
    resolve: [],
    rmdir: [],
    rmDirRecursive: [],
    runDirectoryBridge: [],
    stat: [],
    unlink: [],
    write: [],
  };
  const thread = { id: "thread-1", workspaceId: "owner" };
  const localResolved = {
    label: "docs",
    displayPath: "C:\\Data\\docs",
    workspacePath: "/docs",
    localPath: "C:\\Data\\docs",
  };
  const remoteResolved = {
    label: "shared",
    displayPath: "/volume1/shared",
    workspacePath: "/shared",
    localPath: "",
    remote: "wsl",
    remotePath: "/volume1/shared",
    remoteEntry: { name: "shared", type: "directory" },
  };
  const deps = Object.assign({
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    sendJson,
    findDirectoryThreadForRequest(req, threadId) {
      calls.findThread.push({ threadId, url: req.url });
      return threadId === "missing" ? null : thread;
    },
    resolveBrowserPathAsync(foundThread, params) {
      calls.resolve.push({ thread: foundThread, params });
      if (params.get("path") === "missing") return Promise.resolve(null);
      if (params.get("path") === "/volume1/shared") return Promise.resolve(remoteResolved);
      return Promise.resolve(localResolved);
    },
    directoryRequestParams(body) {
      calls.directoryRequestParams.push(body);
      const params = new URLSearchParams();
      if (body.path) params.set("path", body.path);
      if (body.threadId) params.set("threadId", body.threadId);
      if (body.alias) params.set("alias", body.alias);
      return params;
    },
    runDirectoryBridge(payload) {
      calls.runDirectoryBridge.push(payload);
      if (payload.action === "mkdir") return Promise.resolve({ ok: true, entry: { name: payload.name, type: "directory" } });
      if (payload.action === "upload") return Promise.resolve({ ok: true, entry: { name: payload.filename, type: "file" } });
      if (payload.action === "delete") return Promise.resolve({ ok: true });
      if (payload.action === "rename") return Promise.resolve({ ok: true, entry: { name: payload.name, type: "directory" } });
      return Promise.resolve({ ok: false, error: "unsupported" });
    },
    isSharedDirectoryWriteAllowed() {
      return true;
    },
    isProtectedDirectoryRoot() {
      return false;
    },
    isDeletableWorkspaceRootChild() {
      return false;
    },
    isDirectoryBrowserPathAllowedForThread() {
      return true;
    },
    publicRemoteDirectoryEntry(foundThread, parentDisplayPath, entry) {
      calls.remoteEntries.push({ parentDisplayPath, entry });
      return { remote: true, name: entry.name, type: entry.type, parentDisplayPath };
    },
    publicManagedEntry(foundThread, parentDisplayPath, parentLocalPath, localPath) {
      return { local: true, parentDisplayPath, parentLocalPath, localPath };
    },
    uniqueChildPath(parent, filename) {
      return `${parent}\\${filename}`;
    },
    joinDisplayPath(parent, name) {
      const slash = String(parent).includes("/") && !String(parent).includes("\\") ? "/" : "\\";
      return `${String(parent).replace(/[\\/]+$/, "")}${slash}${name}`;
    },
    joinLocalPath(parent, name) {
      return `${String(parent).replace(/[\\/]+$/, "")}\\${name}`;
    },
    assertChildPathInside() {},
    safeDirectoryName(value) {
      const name = String(value || "").replace(/[\\/]/g, "").replace(/[. ]+$/g, "").trim();
      if (!name || name === "." || name === "..") return "";
      return name;
    },
    safeFileName(value) {
      return String(value || "").replace(/[\\/]/g, "").trim();
    },
    mimeFor(filename) {
      return filename.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    },
    invalidateCatalogCache() {
      calls.invalidateCatalogCache += 1;
    },
    clearDynamicProjectCache(workspaceId) {
      calls.clearDynamicProjectCache.push(workspaceId);
    },
    authenticateRequest(req) {
      calls.auth.push(req.headers || {});
      return req.auth || { ok: true, workspaceId: "owner" };
    },
    exists(targetPath) {
      calls.exists.push(targetPath);
      return false;
    },
    stat(targetPath) {
      calls.stat.push(targetPath);
      return dirStat();
    },
    mkdir(targetPath) {
      calls.mkdir.push(targetPath);
    },
    rename(from, to) {
      calls.rename.push({ from, to });
    },
    write(targetPath, buffer, options) {
      calls.write.push({ targetPath, text: buffer.toString("utf8"), options });
    },
    rmdir(targetPath) {
      calls.rmdir.push(targetPath);
    },
    rmDirRecursive(targetPath) {
      calls.rmDirRecursive.push(targetPath);
    },
    unlink(targetPath) {
      calls.unlink.push(targetPath);
    },
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner || auth?.workspaceId === "owner");
    },
    isOwnerElevationActive(auth) {
      return Boolean(auth?.ownerElevationActive);
    },
    consumeOwnerElevationOnce(auth, token) {
      return Boolean(auth?.consumeOwnerElevationOnce && token === "once-token");
    },
    maxUploadBytes: 1024,
  }, overrides);
  return { routes: createDirectoryMutationApiRoutes(deps), calls, deps, thread, localResolved, remoteResolved };
}

async function request(routes, method, path, body = {}, auth = { workspaceId: "owner" }) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: path, body, auth, headers: { "x-test": "yes" } }, res, makeUrl(path), { auth });
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(DIRECTORY_MUTATION_API_ROUTE_SPECS.map((route) => route.id), [
    "directories-create",
    "directories-upload",
    "directories-delete",
    "directories-rename",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "POST", path: "/api/directories/create" }).id, "directories-create");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/upload" }).id, "directories-upload");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/delete" }).id, "directories-delete");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/rename" }).id, "directories-rename");
  assert.equal(routes.match({ method: "GET", path: "/api/directories/create" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byModule, { "directory-mutation": 4 });
  assert.deepEqual(summary.byAuthMode, { "access-key": 4 });
  assert.equal(JSON.stringify(summary).includes("/api/directories/create"), false);

  const publicRoutes = routes.list({ public: true });
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.deepEqual(publicRoutes[0].resourceTypes, ["directory"]);

  const res = makeResponse();
  const result = await routes.handle({ method: "GET", url: "/api/status", headers: {} }, res, makeUrl("/api/status"), { auth: { workspaceId: "owner" } });
  assert.equal(result.handled, false);
  assert.equal(res.statusCode, 0);
}

async function testCreateLocal() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/create", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    name: "New Folder",
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "directories-create");
  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.stat, ["C:\\Data\\docs"]);
  assert.deepEqual(calls.exists, ["C:\\Data\\docs\\New Folder"]);
  assert.deepEqual(calls.mkdir, ["C:\\Data\\docs\\New Folder"]);
  assert.equal(calls.invalidateCatalogCache, 1);
  assert.deepEqual(calls.clearDynamicProjectCache, ["owner"]);
  assert.deepEqual(got.body.entry, {
    local: true,
    parentDisplayPath: "C:\\Data\\docs",
    parentLocalPath: "C:\\Data\\docs",
    localPath: "C:\\Data\\docs\\New Folder",
  });
}

async function testCreateRemote() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/create", {
    threadId: "thread-1",
    path: "/volume1/shared",
    name: "remote-child",
  });

  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.stat, []);
  assert.deepEqual(calls.runDirectoryBridge, [{ action: "mkdir", path: "/volume1/shared", name: "remote-child" }]);
  assert.equal(calls.invalidateCatalogCache, 1);
  assert.deepEqual(calls.clearDynamicProjectCache, ["owner"]);
  assert.deepEqual(got.body.entry, {
    remote: true,
    name: "remote-child",
    type: "directory",
    parentDisplayPath: "/volume1/shared",
  });
}

async function testUploadLocal() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/upload", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    filename: "note.txt",
    dataBase64: Buffer.from("hello").toString("base64"),
  });

  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.write, [{
    targetPath: "C:\\Data\\docs\\note.txt",
    text: "hello",
    options: { flag: "wx", contentType: "text/plain" },
  }]);
  assert.deepEqual(got.body.entry.localPath, "C:\\Data\\docs\\note.txt");
}

async function testUploadRemote() {
  const { routes, calls } = makeRoutes();
  const encoded = Buffer.from("remote").toString("base64");
  const got = await request(routes, "POST", "/api/directories/upload", {
    threadId: "thread-1",
    path: "/volume1/shared",
    filename: "remote.txt",
    dataBase64: encoded,
  });

  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.runDirectoryBridge, [{
    action: "upload",
    path: "/volume1/shared",
    filename: "remote.txt",
    dataBase64: encoded,
  }]);
  assert.deepEqual(calls.write, []);
  assert.deepEqual(got.body.entry.name, "remote.txt");
}

async function testDeleteLocalFile() {
  const { routes, calls } = makeRoutes({
    resolveBrowserPathAsync() {
      return Promise.resolve({
        displayPath: "C:\\Data\\docs\\note.txt",
        workspacePath: "/docs/note.txt",
        localPath: "C:\\Data\\docs\\note.txt",
      });
    },
    stat(targetPath) {
      calls.stat.push(targetPath);
      return fileStat();
    },
  });
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs\\note.txt",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.unlink, ["C:\\Data\\docs\\note.txt"]);
  assert.deepEqual(calls.rmdir, []);
  assert.deepEqual(got.body.deleted, {
    path: "C:\\Data\\docs\\note.txt",
    displayPath: "/docs/note.txt",
    workspacePath: "/docs/note.txt",
    name: "note.txt",
    type: "file",
  });
}

async function testDeleteLocalDirectory() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.rmdir, ["C:\\Data\\docs"]);
  assert.deepEqual(calls.unlink, []);
  assert.equal(got.body.deleted.type, "directory");
}

async function testDeleteNonEmptyLocalDirectoryRequiresOwnerElevation() {
  const { routes, calls } = makeRoutes({
    rmdir(targetPath) {
      calls.rmdir.push(targetPath);
      const err = new Error("directory not empty");
      err.code = "ENOTEMPTY";
      throw err;
    },
  });
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
  }, { isOwner: true, workspaceId: "owner" });

  assert.equal(got.res.statusCode, 409);
  assert.equal(got.body.code, "owner_high_privilege_required");
  assert.equal(got.body.elevationRequired, true);
  assert.equal(got.body.elevationScope, "owner_high_privilege");
  assert.deepEqual(calls.rmdir, ["C:\\Data\\docs"]);
  assert.deepEqual(calls.rmDirRecursive, []);
}

async function testDeleteNonEmptyLocalDirectoryWithOwnerElevation() {
  const { routes, calls } = makeRoutes({
    rmdir(targetPath) {
      calls.rmdir.push(targetPath);
      const err = new Error("directory not empty");
      err.code = "ENOTEMPTY";
      throw err;
    },
  });
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
  }, { isOwner: true, workspaceId: "owner", ownerElevationActive: true });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.rmdir, ["C:\\Data\\docs"]);
  assert.deepEqual(calls.rmDirRecursive, ["C:\\Data\\docs"]);
  assert.equal(got.body.deleted.type, "directory");
}

async function testDeleteNonEmptyLocalDirectoryWithOwnerElevationOnce() {
  const { routes, calls } = makeRoutes({
    rmdir(targetPath) {
      calls.rmdir.push(targetPath);
      const err = new Error("directory not empty");
      err.code = "ENOTEMPTY";
      throw err;
    },
  });
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    ownerElevationOnceToken: "once-token",
  }, { isOwner: true, workspaceId: "owner", consumeOwnerElevationOnce: true });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.rmDirRecursive, ["C:\\Data\\docs"]);
}

async function testDeleteRemote() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "/volume1/shared",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.runDirectoryBridge, [{ action: "delete", path: "/volume1/shared" }]);
  assert.deepEqual(got.body.deleted, {
    path: "/volume1/shared",
    displayPath: "/shared",
    workspacePath: "/shared",
    name: "shared",
    type: "directory",
  });
}

async function testRenameLocalFile() {
  const { routes, calls } = makeRoutes({
    resolveBrowserPathAsync() {
      return Promise.resolve({
        displayPath: "C:\\Data\\docs\\note.txt",
        workspacePath: "/docs/note.txt",
        localPath: "C:\\Data\\docs\\note.txt",
      });
    },
    stat(targetPath) {
      calls.stat.push(targetPath);
      return fileStat();
    },
  });
  const got = await request(routes, "POST", "/api/directories/rename", {
    threadId: "thread-1",
    path: "C:\\Data\\docs\\note.txt",
    name: "renamed.txt",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.stat, ["C:\\Data\\docs\\note.txt"]);
  assert.deepEqual(calls.exists, ["C:\\Data\\docs\\renamed.txt"]);
  assert.deepEqual(calls.rename, [{ from: "C:\\Data\\docs\\note.txt", to: "C:\\Data\\docs\\renamed.txt" }]);
  assert.equal(calls.invalidateCatalogCache, 1);
  assert.deepEqual(got.body.entry, {
    local: true,
    parentDisplayPath: "C:\\Data\\docs",
    parentLocalPath: "C:\\Data\\docs",
    localPath: "C:\\Data\\docs\\renamed.txt",
  });
}

async function testRenameLocalDirectory() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/rename", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    name: "docs2",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.rename, [{ from: "C:\\Data\\docs", to: "C:\\Data\\docs2" }]);
  assert.equal(got.body.entry.localPath, "C:\\Data\\docs2");
}

async function testRenameExistingTargetReturnsConflict() {
  const { routes, calls } = makeRoutes({
    resolveBrowserPathAsync() {
      return Promise.resolve({
        displayPath: "C:\\Data\\docs\\note.txt",
        workspacePath: "/docs/note.txt",
        localPath: "C:\\Data\\docs\\note.txt",
      });
    },
    stat(targetPath) {
      calls.stat.push(targetPath);
      return fileStat();
    },
    exists(targetPath) {
      calls.exists.push(targetPath);
      return true;
    },
  });
  const got = await request(routes, "POST", "/api/directories/rename", {
    threadId: "thread-1",
    path: "C:\\Data\\docs\\note.txt",
    name: "existing.txt",
  });

  assert.equal(got.res.statusCode, 409);
  assert.deepEqual(got.body, { error: "File already exists" });
  assert.deepEqual(calls.rename, []);
}

async function testRenameRemote() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/directories/rename", {
    threadId: "thread-1",
    path: "/volume1/shared",
    name: "renamed",
  });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.runDirectoryBridge, [{ action: "rename", path: "/volume1/shared", name: "renamed" }]);
  assert.deepEqual(got.body.entry, {
    remote: true,
    name: "renamed",
    type: "directory",
    parentDisplayPath: "/volume1",
  });
}

async function testDeleteNonEmptyRemoteDirectoryWithOwnerElevation() {
  const { routes, calls } = makeRoutes({
    runDirectoryBridge(payload) {
      calls.runDirectoryBridge.push(payload);
      if (payload.action === "delete" && !payload.recursive) {
        return Promise.resolve({ ok: false, error: "Directory not empty" });
      }
      if (payload.action === "delete" && payload.recursive) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, error: "unsupported" });
    },
  });
  const got = await request(routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "/volume1/shared",
  }, { isOwner: true, workspaceId: "owner", ownerElevationActive: true });

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.runDirectoryBridge, [
    { action: "delete", path: "/volume1/shared" },
    { action: "delete", path: "/volume1/shared", recursive: true },
  ]);
  assert.equal(got.body.deleted.type, "directory");
}

async function testReadOnlySharedDirectoryInterceptsMutation() {
  const { routes, calls } = makeRoutes({
    isSharedDirectoryWriteAllowed() {
      return false;
    },
  });
  const got = await request(routes, "POST", "/api/directories/create", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    name: "blocked",
  });

  assert.equal(got.res.statusCode, 403);
  assert.deepEqual(got.body, { error: "Shared directory is read-only" });
  assert.deepEqual(calls.mkdir, []);
  assert.deepEqual(calls.write, []);
  assert.deepEqual(calls.runDirectoryBridge, []);
}

async function testProtectedRootDeleteInterceptsLocalAndRemote() {
  const local = makeRoutes({
    isProtectedDirectoryRoot() {
      return true;
    },
    isDeletableWorkspaceRootChild() {
      return false;
    },
  });
  const localGot = await request(local.routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
  });
  assert.equal(localGot.res.statusCode, 400);
  assert.deepEqual(localGot.body, { error: "Cannot delete a project/workspace root directory" });
  assert.deepEqual(local.calls.rmdir, []);

  const remote = makeRoutes({
    isProtectedDirectoryRoot() {
      return true;
    },
    isDeletableWorkspaceRootChild() {
      return false;
    },
  });
  const remoteGot = await request(remote.routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "/volume1/shared",
  });
  assert.equal(remoteGot.res.statusCode, 400);
  assert.deepEqual(remoteGot.body, { error: "Cannot delete a project/workspace root directory" });
  assert.deepEqual(remote.calls.runDirectoryBridge, []);
}

async function testBodyParseError() {
  const { routes, calls } = makeRoutes({
    readBody() {
      return Promise.reject(new Error("bad json"));
    },
  });
  const got = await request(routes, "POST", "/api/directories/upload", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    filename: "note.txt",
    dataBase64: Buffer.from("hello").toString("base64"),
  });

  assert.equal(got.res.statusCode, 400);
  assert.deepEqual(got.body, { error: "bad json" });
  assert.deepEqual(calls.findThread, []);
  assert.deepEqual(calls.write, []);
}

async function testOtherValidationAndErrors() {
  const missingThread = makeRoutes();
  const missingThreadGot = await request(missingThread.routes, "POST", "/api/directories/create", {
    threadId: "missing",
    path: "C:\\Data\\docs",
    name: "new",
  });
  assert.equal(missingThreadGot.res.statusCode, 404);
  assert.deepEqual(missingThreadGot.body, { error: "Thread not found" });

  const missingPath = makeRoutes();
  const missingPathGot = await request(missingPath.routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "missing",
  });
  assert.equal(missingPathGot.res.statusCode, 404);
  assert.deepEqual(missingPathGot.body, { error: "Path not found or not allowed" });

  const invalidUpload = makeRoutes();
  const invalidUploadGot = await request(invalidUpload.routes, "POST", "/api/directories/upload", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    filename: "empty.txt",
    dataBase64: "",
  });
  assert.equal(invalidUploadGot.res.statusCode, 400);
  assert.deepEqual(invalidUploadGot.body, { error: "Missing dataBase64" });

  const invalidName = makeRoutes();
  const invalidNameGot = await request(invalidName.routes, "POST", "/api/directories/create", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    name: "..",
  });
  assert.equal(invalidNameGot.res.statusCode, 400);
  assert.deepEqual(invalidNameGot.body, { error: "Invalid directory name" });

  const existing = makeRoutes({
    exists() {
      return true;
    },
  });
  const existingGot = await request(existing.routes, "POST", "/api/directories/create", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
    name: "Already",
  });
  assert.equal(existingGot.res.statusCode, 409);
  assert.deepEqual(existingGot.body, { error: "Directory already exists" });

  const notEmpty = makeRoutes({
    rmdir() {
      const err = new Error("not empty");
      err.code = "ENOTEMPTY";
      throw err;
    },
  });
  const notEmptyGot = await request(notEmpty.routes, "POST", "/api/directories/delete", {
    threadId: "thread-1",
    path: "C:\\Data\\docs",
  }, { isOwner: true, workspaceId: "owner" });
  assert.equal(notEmptyGot.res.statusCode, 409);
  assert.equal(notEmptyGot.body.code, "owner_high_privilege_required");
  assert.equal(notEmptyGot.body.elevationRequired, true);
}

function testDependencyValidation() {
  assert.throws(
    () => createDirectoryMutationApiRoutes({}),
    /directory mutation api routes require readBody/,
  );
  const required = [
    "readBody",
    "sendJson",
    "findDirectoryThreadForRequest",
    "resolveBrowserPathAsync",
    "directoryRequestParams",
    "runDirectoryBridge",
    "isSharedDirectoryWriteAllowed",
    "isProtectedDirectoryRoot",
    "isDeletableWorkspaceRootChild",
    "isDirectoryBrowserPathAllowedForThread",
    "publicRemoteDirectoryEntry",
    "publicManagedEntry",
    "uniqueChildPath",
    "joinDisplayPath",
    "joinLocalPath",
    "assertChildPathInside",
    "safeDirectoryName",
    "safeFileName",
    "mimeFor",
    "invalidateCatalogCache",
    "clearDynamicProjectCache",
    "authenticateRequest",
    "exists",
    "stat",
    "mkdir",
    "write",
    "rmdir",
    "rmDirRecursive",
    "unlink",
    "rename",
    "isOwnerAuth",
    "isOwnerElevationActive",
    "consumeOwnerElevationOnce",
  ];
  const deps = Object.fromEntries(required.map((name) => [name, () => {}]));
  delete deps.rename;
  assert.throws(
    () => createDirectoryMutationApiRoutes(deps),
    /directory mutation api routes require rename/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testCreateLocal();
  await testCreateRemote();
  await testUploadLocal();
  await testUploadRemote();
  await testDeleteLocalFile();
  await testDeleteLocalDirectory();
  await testDeleteNonEmptyLocalDirectoryRequiresOwnerElevation();
  await testDeleteNonEmptyLocalDirectoryWithOwnerElevation();
  await testDeleteNonEmptyLocalDirectoryWithOwnerElevationOnce();
  await testDeleteRemote();
  await testRenameLocalFile();
  await testRenameLocalDirectory();
  await testRenameExistingTargetReturnsConflict();
  await testRenameRemote();
  await testDeleteNonEmptyRemoteDirectoryWithOwnerElevation();
  await testReadOnlySharedDirectoryInterceptsMutation();
  await testProtectedRootDeleteInterceptsLocalAndRemote();
  await testBodyParseError();
  await testOtherValidationAndErrors();
  testDependencyValidation();
  console.log("directory mutation api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
