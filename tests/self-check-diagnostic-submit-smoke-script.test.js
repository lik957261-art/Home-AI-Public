"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function runJson(args = []) {
  const output = execFileSync(process.execPath, ["scripts/self-check-diagnostic-submit-smoke.js", "--json", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function testCliJsonOutput() {
  const result = runJson(["--now", "2026-07-01T00:00:00.000Z"]);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "source_safe_temp_store");
  assert.equal(result.externalMutation, false);
  assert.equal(result.selfCheck.ok, true);
  assert.equal(result.selfCheck.submitClosure.ok, true);
  assert.equal(result.selfCheck.submitClosure.eventCount, 2);
  assert.equal(result.selfCheck.submitClosure.rows[0].task_card_id, "ttc_smoke_1");
  assert.equal(result.selfCheck.submitClosure.rows[1].signalId, "system_resource_health");
  assert.equal(result.selfCheck.submitClosure.rows[1].task_card_id, "ttc_smoke_2");
  assert.equal(result.featureRequestGate.ok, true);
  assert.equal(result.featureRequestGate.ownerNotified, true);
  assert.equal(result.featureRequestGate.autoDispatched, false);
  assert.equal(result.privacy.outputPolicy, "bounded metadata only");
}

function testCliTextOutput() {
  const output = execFileSync(process.execPath, [
    "scripts/self-check-diagnostic-submit-smoke.js",
    "--now",
    "2026-07-01T00:00:00.000Z",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.match(output, /ok=true/);
  assert.match(output, /selfCheck=true/);
  assert.match(output, /featureRequestGate=true/);
}

testCliJsonOutput();
testCliTextOutput();

console.log("self-check diagnostic submit smoke script tests passed");
