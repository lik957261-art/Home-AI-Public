"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  backfill,
  normalizeRoute,
  parseArgs,
  routeFromMessage,
} = require("../scripts/macos-task-directory-route-backfill");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-task-dir-backfill-"));
const dbPath = path.join(root, "data", "hermes-mobile.sqlite3");
const healthPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Health");
const financePath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Finance");
const missingPath = path.join(root, "data", "drive", "users", "owner", "Hermes-Owner", "Missing");
const statePath = path.join(root, "data", "state.json");

function setupDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(healthPath, { recursive: true });
  fs.mkdirSync(financePath, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ ok: true }), "utf8");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE threads(
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      title TEXT,
      task_group_meta_json TEXT,
      raw_json TEXT,
      updated_at TEXT
    );
    CREATE TABLE messages(
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      task_group_id TEXT,
      directory_route_json TEXT,
      directory_aliases_json TEXT,
      updated_at TEXT
    );
  `);
  const taskMeta = {
    "task-health": { title: "Health" },
    "task-existing": {
      title: "Existing",
      directoryRoute: {
        label: "Existing route",
        projectId: "existing-root",
        subprojectId: "",
        root: financePath,
        path: financePath,
      },
    },
    "task-direct-existing": {
      title: "Direct existing",
      directoryRoute: {
        label: "Direct existing route",
        root: financePath,
        path: financePath,
      },
    },
    "task-missing": { title: "Missing" },
  };
  db.prepare("INSERT INTO threads(id, workspace_id, title, task_group_meta_json, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    "thread-a",
    "owner",
    "Single Window",
    JSON.stringify(taskMeta),
    JSON.stringify({ taskGroupMeta: { "task-health": { title: "Health" } } }),
    "2026-01-01T00:00:00Z",
  );
  const insertMessage = db.prepare("INSERT INTO messages(id, thread_id, task_group_id, directory_route_json, directory_aliases_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertMessage.run("msg-old", "thread-a", "task-health", JSON.stringify({
    label: "Old Health",
    projectId: "old-health-root",
    subprojectId: "",
    root: financePath,
    path: financePath,
  }), "[]", "2026-01-01T00:00:01Z");
  insertMessage.run("msg-new", "thread-a", "task-health", JSON.stringify({
    label: "Health",
    projectId: "health-root",
    subprojectId: "",
    root: healthPath,
    path: healthPath,
  }), "[]", "2026-01-01T00:00:02Z");
  insertMessage.run("msg-existing", "thread-a", "task-existing", JSON.stringify({
    label: "Should not overwrite",
    projectId: "health-root",
    root: healthPath,
    path: healthPath,
  }), "[]", "2026-01-01T00:00:03Z");
  insertMessage.run("msg-direct-existing", "thread-a", "task-direct-existing", JSON.stringify({
    label: "Should not overwrite direct",
    projectId: "health-root",
    root: healthPath,
    path: healthPath,
  }), "[]", "2026-01-01T00:00:03Z");
  insertMessage.run("msg-missing", "thread-a", "task-missing", JSON.stringify({
    label: "Missing",
    projectId: "missing-root",
    root: missingPath,
    path: missingPath,
  }), "[]", "2026-01-01T00:00:04Z");
  db.close();
}

function readThread() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("SELECT task_group_meta_json, raw_json FROM threads WHERE id = ?").get("thread-a");
  } finally {
    db.close();
  }
}

try {
  setupDb();

  assert.equal(parseArgs(["--root", root, "--write"]).write, true);
  assert.deepEqual(normalizeRoute({ project_id: "p", subproject_id: "s", name: "N", root: healthPath }), {
    label: "N",
    projectId: "p",
    subprojectId: "s",
    root: healthPath,
    path: healthPath,
  });
  assert.equal(routeFromMessage({
    directory_route_json: JSON.stringify({ projectId: "missing", path: missingPath }),
    directory_aliases_json: JSON.stringify([{ label: "Health", projectId: "health-root", path: healthPath }]),
  }).projectId, "health-root");

  const dryRun = backfill({ root, dbPath, write: false, resetStateSnapshot: false, sampleLimit: 10 });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.changed, true);
  assert.equal(dryRun.wrote, false);
  assert.equal(dryRun.stats.changedTaskGroups, 1);
  assert.equal(JSON.parse(readThread().task_group_meta_json)["task-health"].directoryRoute, undefined);

  const wrote = backfill({ root, dbPath, write: true, resetStateSnapshot: true, sampleLimit: 10 });
  assert.equal(wrote.ok, true);
  assert.equal(wrote.wrote, true);
  assert.equal(wrote.stats.changedTaskGroups, 1);
  assert.ok(wrote.backups.length >= 1);
  assert.equal(wrote.stateSnapshot.removed, true);
  assert.equal(fs.existsSync(statePath), false);

  const row = readThread();
  const meta = JSON.parse(row.task_group_meta_json);
  assert.equal(meta["task-health"].directoryRoute.projectId, "health-root");
  assert.equal(meta["task-health"].directoryRoute.path, healthPath);
  assert.equal(meta["task-existing"].directoryRoute.projectId, "existing-root");
  assert.equal(meta["task-direct-existing"].directoryRoute.label, "Direct existing route");
  assert.equal(meta["task-missing"].directoryRoute, undefined);
  const raw = JSON.parse(row.raw_json);
  assert.equal(raw.taskGroupMeta["task-health"].directoryRoute.projectId, "health-root");

  const clean = backfill({ root, dbPath, write: false, resetStateSnapshot: false, sampleLimit: 10 });
  assert.equal(clean.changed, false);
  assert.equal(clean.stats.changedTaskGroups, 0);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("macOS task directory route backfill tests passed");
