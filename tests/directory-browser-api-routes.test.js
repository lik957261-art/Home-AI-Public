"use strict";

const assert = require("node:assert/strict");
const {
  DIRECTORY_BROWSER_API_ROUTE_SPECS,
  createDirectoryBrowserApiRoutes,
} = require("../server-routes/directory-browser-api-routes");

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
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    bridge: [],
    localEntry: [],
    remoteEntry: [],
    resolve: [],
    thread: [],
  };
  const thread = { id: "thread-1", workspaceId: "owner" };
  const resolvedLocal = {
    label: "Local",
    displayPath: "Project",
    workspacePath: "Project",
    localPath: "/safe/project",
  };
  const resolvedRemote = {
    label: "Remote",
    displayPath: "/mnt/share/project",
    workspacePath: "Share/project",
    localPath: "",
    remote: "wsl",
    remoteEntry: { type: "directory", mtime: "2026-05-14T00:00:00.000Z" },
  };
  const deps = Object.assign({
    compareDirectoryEntriesNewestFirst(left, right) {
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    },
    findDirectoryThreadForRequest(req, threadId) {
      calls.thread.push({ threadId });
      return threadId === "missing" ? null : thread;
    },
    publicDirectoryEntry(currentThread, displayPath, localPath, entry) {
      calls.localEntry.push({ currentThread, displayPath, localPath, entry });
      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        updatedAt: entry.updatedAt,
      };
    },
    publicRemoteDirectoryEntry(currentThread, displayPath, entry) {
      calls.remoteEntry.push({ currentThread, displayPath, entry });
      return entry ? Object.assign({}, entry) : null;
    },
    async resolveBrowserPathAsync(currentThread, searchParams) {
      const mode = String(searchParams.get("mode") || "local");
      calls.resolve.push({ currentThread, mode });
      if (mode === "missing") return null;
      if (mode === "remote") return resolvedRemote;
      if (mode === "remote-file") return Object.assign({}, resolvedRemote, { remoteEntry: { type: "file" } });
      if (mode === "local-file") return Object.assign({}, resolvedLocal, { localPath: "/safe/file.txt" });
      return resolvedLocal;
    },
    async runDirectoryBridge(args) {
      calls.bridge.push(args);
      if (args.path === "fail") return { ok: false, error: "bridge failed" };
      return {
        ok: true,
        updatedAt: "2026-05-14T01:00:00.000Z",
        entries: [
          { name: "old.md", type: "file", updatedAt: "2026-05-13T00:00:00.000Z" },
          { name: "new.md", type: "file", updatedAt: "2026-05-14T00:00:00.000Z" },
        ],
      };
    },
    sendJson,
    readdirSync() {
      return [
        { name: "old", updatedAt: "2026-05-13T00:00:00.000Z", isDirectory: () => true },
        { name: "new.txt", updatedAt: "2026-05-14T00:00:00.000Z", isDirectory: () => false },
      ];
    },
    statSync(localPath) {
      if (localPath === "/safe/file.txt") return { isDirectory: () => false, mtime: new Date("2026-05-14T00:00:00.000Z") };
      return { isDirectory: () => true, mtime: new Date("2026-05-14T00:00:00.000Z") };
    },
  }, overrides);
  return { routes: createDirectoryBrowserApiRoutes(deps), calls };
}

async function request(routes, method, path) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: path }, res, makeUrl(path), { auth: { workspaceId: "owner" } });
  return { result, res, body: res.body ? JSON.parse(res.body) : null };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(DIRECTORY_BROWSER_API_ROUTE_SPECS.map((route) => route.id), ["directories-preview"]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/directories/preview" }).id, "directories-preview");
  assert.equal(routes.match({ method: "POST", path: "/api/directories/preview" }), null);
  assert.equal(routes.summary({ public: true }).byModule.directory, 1);
  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
}

async function testLocalPreview() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/directories/preview?threadId=thread-1");
  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.body.path, "Project");
  assert.equal(got.body.localPath, "/safe/project");
  assert.equal(got.body.entryCount, 2);
  assert.deepEqual(got.body.entries.map((entry) => entry.name), ["new.txt", "old"]);
  assert.equal(calls.localEntry.length, 2);
}

async function testRemotePreview() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/directories/preview?threadId=thread-1&mode=remote");
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.body.remote, "wsl");
  assert.equal(got.body.localPath, "");
  assert.deepEqual(got.body.entries.map((entry) => entry.name), ["new.md", "old.md"]);
  assert.deepEqual(calls.bridge, [{ action: "preview", path: "/mnt/share/project" }]);
}

async function testErrors() {
  const { routes } = makeRoutes();
  const missingThread = await request(routes, "GET", "/api/directories/preview?threadId=missing");
  assert.equal(missingThread.res.statusCode, 404);
  assert.equal(missingThread.body.error, "Thread not found");

  const missingPath = await request(routes, "GET", "/api/directories/preview?mode=missing");
  assert.equal(missingPath.res.statusCode, 404);

  const localFile = await request(routes, "GET", "/api/directories/preview?mode=local-file");
  assert.equal(localFile.res.statusCode, 400);
  assert.equal(localFile.body.error, "Path is not a directory");

  const remoteFile = await request(routes, "GET", "/api/directories/preview?mode=remote-file");
  assert.equal(remoteFile.res.statusCode, 400);
  assert.equal(remoteFile.body.error, "Path is not a directory");
}

function testDependencyValidation() {
  assert.throws(
    () => createDirectoryBrowserApiRoutes({}),
    /directory browser api routes require compareDirectoryEntriesNewestFirst/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testLocalPreview();
  await testRemotePreview();
  await testErrors();
  testDependencyValidation();
  console.log("directory browser api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
