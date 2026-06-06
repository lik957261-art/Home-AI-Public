"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  collectBoundDirectoryPaths,
  collectBoundDirectoryWorkspaceIds,
  compactPath,
  parseArgs,
  previewTargetForBoundDirectory,
  resolveUiDirectoryRoute,
  smoke,
  smokeAllWorkspaces,
} = require("../scripts/macos-bound-directory-preview-smoke");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-bound-dir-smoke-"));
const dbPath = path.join(root, "data", "hermes-mobile.sqlite3");
const secretPath = path.join(root, "data", "secrets", "owner-web-key.secret");
const okPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "Ok");
const badPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "Bad");
const chatPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "Chat");
const uiOkPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "UiOk");
const uiWrongRootPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "WrongRoot");
const boundThreadOnlyPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Projects", "BoundThreadOnly");
const wupingOkPath = path.join(root, "data", "drive", "users", "weixin_wuping", "Hermes-Wuping", "Projects", "Ok");
const xiaonanStalePath = path.join(root, "data", "drive", "users", "weixin_xiaonan", "Hermes-Xiaonan", "Projects", "Stale");

function setupDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.mkdirSync(okPath, { recursive: true });
  fs.mkdirSync(uiOkPath, { recursive: true });
  fs.mkdirSync(boundThreadOnlyPath, { recursive: true });
  fs.mkdirSync(wupingOkPath, { recursive: true });
  fs.mkdirSync(xiaonanStalePath, { recursive: true });
  fs.writeFileSync(secretPath, "test-key\n", "utf8");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE threads(id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE messages(
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      task_group_id TEXT,
      directory_route_json TEXT,
      directory_aliases_json TEXT,
      updated_at TEXT
    );
  `);
  db.prepare("INSERT INTO threads(id, workspace_id) VALUES (?, ?)").run("thread-owner", "owner");
  db.prepare("INSERT INTO threads(id, workspace_id) VALUES (?, ?)").run("thread-owner-bound", "owner");
  db.prepare("INSERT INTO threads(id, workspace_id) VALUES (?, ?)").run("thread-wuping", "weixin_wuping");
  db.prepare("INSERT INTO threads(id, workspace_id) VALUES (?, ?)").run("thread-xiaonan", "weixin_xiaonan");
  const insert = db.prepare(`
    INSERT INTO messages(id, thread_id, task_group_id, directory_route_json, directory_aliases_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run("msg-ok", "thread-owner", "plugin:wardrobe", JSON.stringify({ label: "Ok", path: okPath }), "[]", "2026-01-01T00:00:00Z");
  insert.run("msg-bad", "thread-owner", "plugin:finance", JSON.stringify({ label: "Bad", path: badPath }), "[]", "2026-01-01T00:00:01Z");
  insert.run("msg-ui-route", "thread-owner", "plugin:note", JSON.stringify({ label: "Ui mismatch", path: uiOkPath, projectId: "wrong-project" }), "[]", "2026-01-01T00:00:01Z");
  insert.run("msg-bound-thread", "thread-owner-bound", "task-bound", JSON.stringify({ label: "Bound thread only", path: boundThreadOnlyPath }), "[]", "2026-01-01T00:00:01Z");
  insert.run("msg-chat", "thread-owner", "chat", JSON.stringify({ label: "Chat", path: chatPath }), "[]", "2026-01-01T00:00:02Z");
  insert.run("msg-wuping-ok", "thread-wuping", "plugin:health", JSON.stringify({ label: "Wuping Ok", path: wupingOkPath }), "[]", "2026-01-01T00:00:03Z");
  insert.run("msg-xiaonan-stale", "thread-xiaonan", "plugin:health", JSON.stringify({ label: "Xiaonan Stale", path: xiaonanStalePath }), "[]", "2026-01-01T00:00:04Z");
  db.close();
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/single-window") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        if (parsed.workspaceId === "weixin_xiaonan") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Unknown workspace" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ thread: { id: parsed.workspaceId === "weixin_wuping" ? "thread-wuping" : "thread-owner" } }));
      });
      return;
    }
    if (url.pathname === "/api/projects") {
      if (url.searchParams.get("workspaceId") === "weixin_xiaonan") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown workspace" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        data: [
          { id: "ok-project", label: "Ok project", root: okPath },
          { id: "wrong-project", label: "Wrong project", root: uiWrongRootPath },
        ],
      }));
      return;
    }
    if (url.pathname === "/api/directories/preview") {
      const targetPath = url.searchParams.get("path") || "";
      const threadId = url.searchParams.get("threadId") || "";
      if (targetPath === okPath || targetPath === uiOkPath || targetPath === wupingOkPath
        || (targetPath === boundThreadOnlyPath && threadId === "thread-owner-bound")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ entryCount: 0 }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Directory not found or not allowed" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  try {
    setupDb();
    assert.equal(parseArgs(["--root", root, "--include-chat"]).includeChat, true);
    assert.equal(parseArgs(["--root", root, "--all-workspaces"]).allWorkspaces, true);
    assert.equal(parseArgs(["--root", root, "--simulate-ui-route"]).simulateUiRoute, true);
    assert.equal(parseArgs(["--root", root, "--use-bound-thread-context"]).useBoundThreadContext, true);
    assert.equal(compactPath(okPath, root), "$DRIVE/users/owner/Hermes-Owner/Projects/Ok");

    const defaultPaths = collectBoundDirectoryPaths({ root, dbPath, workspaceId: "owner", includeChat: false, limit: 100 });
    assert.deepEqual(defaultPaths.map((item) => item.label).sort(), ["Bad", "Bound thread only", "Ok", "Ui mismatch"]);
    assert.equal(defaultPaths.find((item) => item.label === "Bound thread only").threadId, "thread-owner-bound");
    const allPaths = collectBoundDirectoryPaths({ root, dbPath, workspaceId: "owner", includeChat: true, limit: 100 });
    assert.deepEqual(allPaths.map((item) => item.label).sort(), ["Bad", "Bound thread only", "Chat", "Ok", "Ui mismatch"]);
    const resolvedUi = resolveUiDirectoryRoute(
      { projectId: "wrong-project", path: uiOkPath },
      [{ projectId: "wrong-project", subprojectId: "", root: uiWrongRootPath }],
    );
    assert.equal(resolvedUi.reason, "project-subproject");
    const uiTarget = previewTargetForBoundDirectory(
      { projectId: "wrong-project", path: uiOkPath },
      [{ projectId: "wrong-project", subprojectId: "", root: uiWrongRootPath }],
      { root, simulateUiRoute: true },
    );
    assert.equal(uiTarget.path, uiWrongRootPath);
    const workspaceIds = collectBoundDirectoryWorkspaceIds({ root, dbPath, includeChat: false });
    assert.deepEqual(workspaceIds, ["owner", "weixin_wuping", "weixin_xiaonan"]);

    const server = await startServer();
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const result = await smoke({ root, dbPath, base, accessKeyFile: secretPath, workspaceId: "owner", includeChat: false, limit: 100 });
      assert.equal(result.ok, false);
      assert.equal(result.uniquePaths, 4);
      assert.equal(result.failed, 2);
      assert.equal(result.failures.find((item) => item.label === "Bad").path, "$DRIVE/users/owner/Hermes-Owner/Projects/Bad");
      assert.equal(result.failures.find((item) => item.label === "Bound thread only").threadId, "thread-owner");
      const boundThreadResult = await smoke({ root, dbPath, base, accessKeyFile: secretPath, workspaceId: "owner", includeChat: false, useBoundThreadContext: true, limit: 100 });
      assert.equal(boundThreadResult.ok, false);
      assert.equal(boundThreadResult.useBoundThreadContext, true);
      assert.equal(boundThreadResult.uniquePaths, 4);
      assert.equal(boundThreadResult.failed, 1);
      assert.equal(boundThreadResult.failures[0].label, "Bad");
      const uiResult = await smoke({ root, dbPath, base, accessKeyFile: secretPath, workspaceId: "owner", includeChat: false, simulateUiRoute: true, limit: 100 });
      assert.equal(uiResult.ok, false);
      assert.equal(uiResult.uniquePaths, 4);
      assert.equal(uiResult.failed, 3);
      const uiFailure = uiResult.failures.find((item) => item.label === "Ui mismatch");
      assert.equal(uiFailure.uiRoute.reason, "project-subproject");
      assert.equal(uiFailure.uiRoute.targetPath, "$DRIVE/users/owner/Hermes-Owner/Projects/WrongRoot");
      const allResult = await smokeAllWorkspaces({ root, dbPath, base, accessKeyFile: secretPath, includeChat: false, limit: 100 });
      assert.equal(allResult.ok, false);
      assert.equal(allResult.workspaceCount, 3);
      assert.deepEqual(allResult.results.map((item) => item.workspaceId), ["owner", "weixin_wuping", "weixin_xiaonan"]);
      assert.equal(allResult.results.find((item) => item.workspaceId === "weixin_wuping").ok, true);
      const skipped = allResult.results.find((item) => item.workspaceId === "weixin_xiaonan");
      assert.equal(skipped.ok, false);
      assert.equal(skipped.skipped, true);
      assert.equal(skipped.skipReason, "unknown-workspace");
      assert.equal(skipped.uniquePaths, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("macOS bound directory preview smoke harness tests passed");
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
