"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

const REPO_ROOT = path.resolve(__dirname, "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-json-sqlite-migration-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeDataDir() {
  const dir = tempDir();
  writeJson(path.join(dir, "state.json"), {
    threads: [
      {
        id: "thread_migration",
        workspaceId: "owner",
        messages: [
          { id: "msg_one", role: "user", content: "one", senderWorkspaceId: "owner", taskGroupId: "chat" },
        ],
      },
    ],
  });
  writeJson(path.join(dir, "workspaces.json"), {
    workspaces: [{ id: "owner", label: "Owner", role: "owner" }],
  });
  writeJson(path.join(dir, "access-keys.json"), {
    workspaceKeys: {},
  });
  return dir;
}

function runMigration(args) {
  return execFileSync(process.execPath, ["scripts/migrate-json-to-sqlite.js", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: Object.assign({}, process.env, { NODE_NO_WARNINGS: "1" }),
  });
}

function testDryRunDoesNotLeaveDb() {
  const dir = makeDataDir();
  const reportPath = path.join(dir, "dry-run-report.json");
  const output = runMigration(["--data-dir", dir, "--dry-run", "--report", reportPath]);
  assert.match(output, /mode=dry-run/);
  assert.match(output, /messages=1/);
  assert.equal(fs.existsSync(path.join(dir, "hermes-mobile.sqlite3")), false);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.mode, "dry-run");
  assert.equal(report.integrity.ok, true);
  assert.equal(report.integrity.counts.messages, 1);
}

function testWriteCreatesDbAndReport() {
  const dir = makeDataDir();
  const dbPath = path.join(dir, "mobile.sqlite3");
  const reportPath = path.join(dir, "write-report.json");
  const output = runMigration(["--data-dir", dir, "--db", dbPath, "--write", "--report", reportPath]);
  assert.match(output, /mode=write/);
  assert.equal(fs.existsSync(dbPath), true);

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.integrity.ok, true);
  assert.equal(report.integrity.counts.threads, 1);
  assert.equal(report.integrity.counts.messages, 1);

  const store = createMobileSqliteStore({ dbPath });
  const row = store.open().prepare("SELECT content FROM messages WHERE id = ?").get("msg_one");
  assert.equal(row.content, "one");
  store.close();
}

function testWorkspaceCatalogFileOverridesInference() {
  const dir = makeDataDir();
  const dbPath = path.join(dir, "catalog.sqlite3");
  const catalogPath = path.join(dir, "workspace-catalog.json");
  fs.writeFileSync(catalogPath, `${JSON.stringify({
    workspaces: [
      { id: "owner", label: "Owner", role: "owner", principalId: "owner", source: "catalog" },
      { id: "workspace_extra", label: "Extra", role: "workspace", principalId: "workspace_extra", source: "catalog" },
    ],
  }, null, 2)}\n`, "utf8");
  runMigration(["--data-dir", dir, "--db", dbPath, "--write", "--workspaces-file", catalogPath]);

  const store = createMobileSqliteStore({ dbPath });
  const rows = store.open().prepare("SELECT id, source FROM workspaces ORDER BY id").all()
    .map((row) => ({ id: row.id, source: row.source }));
  assert.deepEqual(rows, [
    { id: "owner", source: "catalog" },
    { id: "workspace_extra", source: "catalog" },
  ]);
  store.close();
}

testDryRunDoesNotLeaveDb();
testWriteCreatesDbAndReport();
testWorkspaceCatalogFileOverridesInference();
console.log("json-to-sqlite-migration tests passed");
