"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const {
  parseWorkerHandoffDelta,
  runCheck,
} = require("../scripts/worker-handoff-lifecycle-check");

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-worker-handoff-"));
}

function writeDelta(root, name, body) {
  const activeDir = path.join(root, ".agent-context", "worker-handoffs", "active");
  fs.mkdirSync(activeDir, { recursive: true });
  const filePath = path.join(activeDir, name);
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

function validDelta(overrides = {}) {
  const fields = {
    taskCardId: "ttc_test123",
    sourceThreadId: "source-thread",
    targetThreadId: "target-thread",
    status: "running",
    mergeDisposition: "pending",
    expiresAfter: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
  return [
    "# Worker Handoff Delta",
    "",
    `taskCardId: ${fields.taskCardId}`,
    `sourceThreadId: ${fields.sourceThreadId}`,
    `targetThreadId: ${fields.targetThreadId}`,
    `status: ${fields.status}`,
    `mergeDisposition: ${fields.mergeDisposition}`,
    `expiresAfter: ${fields.expiresAfter}`,
    "",
    "Summary: bounded worker status only.",
  ].join("\n");
}

{
  const parsed = parseWorkerHandoffDelta(validDelta({ taskCardId: "`ttc_marked`" }));
  assert.equal(parsed.taskCardId, "ttc_marked");
  assert.equal(parsed.mergeDisposition, "pending");
}

{
  const root = createTempRoot();
  const result = runCheck({ root, now: new Date("2026-07-04T00:00:00.000Z") });
  assert.equal(result.ok, true);
  assert.equal(result.checkedFileCount, 0);
  assert.deepEqual(result.issues, []);
}

{
  const root = createTempRoot();
  writeDelta(root, "ttc_test123.md", validDelta());
  const result = runCheck({ root, now: new Date("2026-07-04T00:00:00.000Z") });
  assert.equal(result.ok, true);
  assert.equal(result.checkedFileCount, 1);
}

{
  const root = createTempRoot();
  writeDelta(root, "ttc_missing.md", [
    "# Worker Handoff Delta",
    "taskCardId: ttc_missing",
    "status: running",
    "mergeDisposition: pending",
  ].join("\n"));
  const result = runCheck({ root, now: new Date("2026-07-04T00:00:00.000Z") });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "worker_handoff_missing_field" && item.field === "sourceThreadId"));
  assert.ok(result.issues.some((item) => item.code === "worker_handoff_missing_field" && item.field === "expiresAfter"));
}

{
  const root = createTempRoot();
  writeDelta(root, "ttc_merged.md", validDelta({
    taskCardId: "ttc_merged",
    status: "completed",
    mergeDisposition: "merged",
  }));
  const result = runCheck({ root, now: new Date("2026-07-04T00:00:00.000Z") });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "worker_handoff_non_pending_left_active"));
}

{
  const root = createTempRoot();
  writeDelta(root, "ttc_expired.md", validDelta({
    taskCardId: "ttc_expired",
    status: "completed",
    expiresAfter: "2026-07-03T00:00:00.000Z",
  }));
  const result = runCheck({ root, now: new Date("2026-07-04T00:00:00.000Z") });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "worker_handoff_expired_active_delta"));
}

{
  const root = createTempRoot();
  writeDelta(root, "ttc_cli.md", validDelta({ taskCardId: "ttc_cli" }));
  const output = execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "worker-handoff-lifecycle-check.js"),
      "--root",
      root,
      "--now",
      "2026-07-04T00:00:00.000Z",
      "--json",
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.checkedFileCount, 1);
}

console.log("worker handoff lifecycle check tests passed");
