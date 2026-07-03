"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-upgrade-lane-closure-smoke.js");

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function testDefaultSmokePasses() {
  const report = parse(run(["--json"]));
  assert.equal(report.ok, true);
  assert.equal(report.deployCard.validRequestOk, true);
  assert.equal(report.deployCard.terminalReceiptRejected, true);
  assert.equal(report.deployLaneLock.ok, true);
  assert.equal(report.publicUpgrade.coverage.hermesAgent, true);
  assert.equal(report.publicUpgrade.coverage.sourceAdoption, true);
}

function testSmokeFailsBrokenRehearsalJson() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-deploy-upgrade-smoke-"));
  const filePath = path.join(dir, "rehearsal.json");
  fs.writeFileSync(filePath, JSON.stringify({
    ok: true,
    tempRemoved: true,
    steps: [
      { type: "public-source-preflight", result: { ok: true }, summary: { ok: true } },
      { type: "validate-missing-source-fail-closed", ok: true, detail: { ok: true, missingSourceBlockerCount: 1 } },
      { type: "validate-operator-clone-gate-plan", ok: true, detail: { ok: true, cloneActionCount: 1, deployActionCount: 1, movieOperatorAuthenticated: true, closureValidationPresent: true } },
    ],
  }), "utf8");
  const result = run(["--json", "--rehearsal-json", filePath]);
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.issues[0].code, "public_upgrade_hermes_runtime_repair_required_missing");
}

function runTests() {
  testDefaultSmokePasses();
  testSmokeFailsBrokenRehearsalJson();
}

runTests();
