"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { backfill } = require("../scripts/backfill-directory-topic-index");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-directory-topic-index-"));
const dbPath = path.join(tmp, "test.sqlite3");
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    task_group_meta_json TEXT,
    raw_json TEXT,
    updated_at TEXT
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    position INTEGER,
    role TEXT,
    status TEXT,
    task_group_id TEXT,
    content TEXT,
    directory_route_json TEXT,
    created_at TEXT,
    updated_at TEXT,
    completed_at TEXT,
    raw_json TEXT
  )
`);
db.prepare("INSERT INTO meta(key, value, updated_at) VALUES (?, ?, ?)").run(
  "lastRuntimeStateSave",
  JSON.stringify({ savedAt: "2026-06-18T01:00:00.000Z", counts: { threads: 1 } }),
  "2026-06-18T01:00:00.000Z",
);

const thread = {
  id: "thread-1",
  workspaceId: "owner",
  taskGroupMeta: {
    sleep: { title: "睡眠日志" },
  },
  messages: [{
    id: "m1",
    role: "assistant",
    content: "睡眠日志摘要内容不应该完整出现在脚本输出里",
    taskGroupId: "sleep",
    completedAt: "2026-06-18T02:00:00.000Z",
    directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
  }],
};
const sqliteOnlyFinalReceiptThread = {
  id: "thread-sqlite-final",
  workspaceId: "owner",
  taskGroupMeta: {
    analysis: {
      title: "科技目录",
      ownerWorkspaceId: "owner",
      directoryRoute: { projectId: "tech", label: "科技", root: "/tech", path: "/tech", ownerWorkspaceId: "owner" },
      directoryRouteKey: "owner|tech||/tech",
      lastUserPromptTitle: "分析一下股票",
      lastUserPromptAt: "2026-06-18T03:00:00.000Z",
      lastMessageId: "sqlite-user",
      updatedAt: "2026-06-18T03:00:00.000Z",
    },
  },
  messages: [{
    id: "sqlite-user",
    role: "user",
    content: "分析一下股票",
    taskGroupId: "analysis",
    createdAt: "2026-06-18T03:00:00.000Z",
    directoryRoute: { projectId: "tech", label: "科技", root: "/tech", path: "/tech", ownerWorkspaceId: "owner" },
  }],
};
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
fs.writeFileSync(path.join(tmp, "data", "state.json"), JSON.stringify({ threads: [thread, sqliteOnlyFinalReceiptThread] }, null, 2), "utf8");
db.prepare("INSERT INTO threads(id, workspace_id, task_group_meta_json, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)").run(
  "thread-1",
  "owner",
  JSON.stringify(thread.taskGroupMeta),
  JSON.stringify(thread),
  "2026-06-18T02:00:00.000Z",
);
db.prepare("INSERT INTO threads(id, workspace_id, task_group_meta_json, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)").run(
  "thread-sqlite-final",
  "owner",
  JSON.stringify(sqliteOnlyFinalReceiptThread.taskGroupMeta),
  JSON.stringify(sqliteOnlyFinalReceiptThread),
  "2026-06-18T03:00:00.000Z",
);
db.prepare("INSERT INTO messages(id, thread_id, position, role, status, task_group_id, content, directory_route_json, created_at, updated_at, completed_at, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
  "sqlite-final-assistant",
  "thread-sqlite-final",
  2,
  "assistant",
  "done",
  "analysis",
  "这是很长的一段最终回执，列表不应该显示这整段开头。\n\n<!-- homeai-note\ntitle: 科技目录股票分析概要\n-->",
  null,
  "2026-06-18T03:02:00.000Z",
  "2026-06-18T03:02:00.000Z",
  "2026-06-18T03:02:00.000Z",
  "",
);
db.close();

const dryRun = backfill({ root: tmp, dbPath, write: false, sampleLimit: 5, scanLimitPerThread: 100 });
assert.equal(dryRun.changed, true);
assert.equal(dryRun.stats.changedThreads, 2);
assert.equal(dryRun.stats.changedIndexRows, 2);
assert.equal(JSON.stringify(dryRun).includes("睡眠日志摘要内容不应该完整出现在脚本输出里"), false);

const writeRun = backfill({ root: tmp, dbPath, write: true, sampleLimit: 5, scanLimitPerThread: 100 });
assert.equal(writeRun.wrote, true);
assert.equal(writeRun.backups.length >= 1, true);
assert.equal(writeRun.stateSync.changed, true);
assert.equal(writeRun.stateSync.changedThreads, 2);
assert.equal(writeRun.runtimeStateMeta.checked, true);
assert.equal(writeRun.runtimeStateMeta.changed, true);
assert.equal(writeRun.runtimeStateMeta.counts.threads, 2);

const readDb = new DatabaseSync(dbPath, { readOnly: true });
const row = readDb.prepare("SELECT task_group_meta_json, raw_json FROM threads WHERE id = ?").get("thread-1");
const sqliteFinalRow = readDb.prepare("SELECT task_group_meta_json, raw_json FROM threads WHERE id = ?").get("thread-sqlite-final");
const runtimeMeta = readDb.prepare("SELECT value FROM meta WHERE key = ?").get("lastRuntimeStateSave");
readDb.close();
const meta = JSON.parse(row.task_group_meta_json);
const raw = JSON.parse(row.raw_json);
const sqliteFinalMeta = JSON.parse(sqliteFinalRow.task_group_meta_json);
const sqliteFinalRaw = JSON.parse(sqliteFinalRow.raw_json);
const parsedRuntimeMeta = JSON.parse(runtimeMeta.value);
const state = JSON.parse(fs.readFileSync(path.join(tmp, "data", "state.json"), "utf8"));
assert.equal(meta.sleep.directoryRouteKey, "owner|health||/health");
assert.equal(raw.taskGroupMeta.sleep.directoryRouteKey, "owner|health||/health");
assert.equal(sqliteFinalMeta.analysis.lastMessageId, "sqlite-final-assistant");
assert.equal(sqliteFinalMeta.analysis.lastReceiptTitle, "科技目录股票分析概要");
assert.equal(sqliteFinalRaw.taskGroupMeta.analysis.lastMessageId, "sqlite-final-assistant");
assert.equal(state.threads.find((item) => item.id === "thread-sqlite-final").taskGroupMeta.analysis.lastReceiptTitle, "科技目录股票分析概要");
assert.equal(Boolean(parsedRuntimeMeta.savedAt), true);
assert.equal(parsedRuntimeMeta.counts.threads, 2);
assert.equal(state.threads[0].taskGroupMeta.sleep.directoryRouteKey, "owner|health||/health");

const secondDryRun = backfill({ root: tmp, dbPath, write: false, sampleLimit: 5, scanLimitPerThread: 100 });
assert.equal(secondDryRun.changed, false);
assert.equal(secondDryRun.stats.changedThreads, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("backfill-directory-topic-index tests passed");
