"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-sqlite-maintenance-"));
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Command failed ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function createDb(dbPath) {
  const store = createMobileSqliteStore({ dbPath });
  try {
    store.replaceRuntimeState({
      schemaVersion: 1,
      threads: [
        {
          id: "thread_1",
          workspaceId: "owner",
          title: "Chat",
          messages: [
            {
              id: "msg_1",
              role: "user",
              content: "hello",
              status: "done",
              createdAt: "2026-05-07T00:00:00.000Z",
            },
          ],
        },
      ],
      pushReceipts: [
        {
          id: "receipt_1",
          principalId: "owner",
          messageType: "task_completed",
          shown: true,
          createdAt: "2026-05-07T00:00:01.000Z",
        },
      ],
    });
  } finally {
    store.close();
  }
}

function testCheckAndBackup() {
  const repo = path.resolve(__dirname, "..");
  const dir = tempDir();
  const dbPath = path.join(dir, "runtime.sqlite3");
  const backupDir = path.join(dir, "backups");
  const checkReport = path.join(dir, "check.json");
  const backupReport = path.join(dir, "backup.json");
  createDb(dbPath);

  runNode(["scripts/sqlite-maintenance.js", "--db", dbPath, "--check", "--report", checkReport], repo);
  const checked = JSON.parse(fs.readFileSync(checkReport, "utf8"));
  assert.equal(checked.integrity.ok, true);
  assert.equal(checked.integrity.counts.threads, 1);
  assert.equal(checked.integrity.counts.messages, 1);

  runNode([
    "scripts/sqlite-maintenance.js",
    "--db",
    dbPath,
    "--backup",
    "--backup-dir",
    backupDir,
    "--export-json",
    "--report",
    backupReport,
    "--label",
    "test",
  ], repo);
  const backed = JSON.parse(fs.readFileSync(backupReport, "utf8"));
  assert.equal(backed.integrity.ok, true);
  assert.equal(backed.backup.backupIntegrity.ok, true);
  assert.ok(fs.existsSync(backed.backup.sqlite.path));
  assert.ok(fs.existsSync(backed.backup.jsonSnapshot.path));
  fs.rmSync(dir, { recursive: true, force: true });
}

testCheckAndBackup();
console.log("sqlite-maintenance tests passed");
