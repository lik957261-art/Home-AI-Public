"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { createDataContextService } = require("../adapters/data-context-service");

const repoRoot = path.resolve(__dirname, "..");

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-data-context-"));
  const dbPath = path.join(dir, "hermes-mobile.sqlite3");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '');
    CREATE TABLE threads(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', position INTEGER DEFAULT 0);
    CREATE TABLE messages(
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT '',
      position INTEGER DEFAULT 0,
      role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      message_kind TEXT NOT NULL DEFAULT '',
      sender_label TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE artifacts(
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `);
  db.prepare("INSERT INTO workspaces(id, label) VALUES (?, ?)").run("owner", "徐欣");
  db.prepare("INSERT INTO threads(id, workspace_id, title) VALUES (?, ?, ?)").run("thread-1", "owner", "Daily work");
  db.prepare("INSERT INTO messages(id, thread_id, workspace_id, position, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "m1", "thread-1", "owner", 1, "user", "昨天讨论了自动化日报需要读取结构化数据。", "2026-06-12T02:00:00.000Z",
  );
  db.prepare("INSERT INTO messages(id, thread_id, workspace_id, position, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "m2", "thread-1", "owner", 2, "assistant", "建议通过 Home AI 数据上下文接口生成数据包。", "2026-06-12T02:01:00.000Z",
  );
  db.prepare("INSERT INTO messages(id, thread_id, workspace_id, position, role, status, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    "m3", "thread-1", "owner", 3, "user", "withdrawn", "should not appear", "2026-06-12T02:02:00.000Z",
  );
  db.prepare("INSERT INTO artifacts(id, thread_id, workspace_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "a1", "thread-1", "owner", "report.md", "text/markdown", 123, "2026-06-12T02:03:00.000Z",
  );
  db.close();
  return { dir, dbPath };
}

{
  const fixture = makeDb();
  const service = createDataContextService({ dbPath: fixture.dbPath });
  const result = service.prepare({ type: "discussion_activity_daily", date: "2026-06-12" });
  assert.equal(result.ok, true);
  assert.equal(result.context.audit.includedMessageCount, 2);
  assert.equal(result.context.audit.excludedNoiseOrOutOfScopeCount, 1);
  assert.equal(result.context.workspaces[0].workspaceId, "owner");
  assert.match(result.markdown, /数据上下文接口/);
  assert.doesNotMatch(result.markdown, /should not appear/);
}

{
  const fixture = makeDb();
  const outPath = path.join(fixture.dir, "context.md");
  const result = childProcess.spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "automation-data-context-cli.js"),
    "--db", fixture.dbPath,
    "--type", "discussion_activity_daily",
    "--date", "2026-06-12",
    "--out", outPath,
    "--json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.audit.includedMessageCount, 2);
  assert.equal(fs.existsSync(outPath), true);
}

console.log("data context service tests passed");
