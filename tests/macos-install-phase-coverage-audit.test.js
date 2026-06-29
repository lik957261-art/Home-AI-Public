"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  EXPECTED_PHASES,
  buildReport,
} = require("../scripts/macos-install-phase-coverage-audit");

const REPO_ROOT = path.resolve(__dirname, "..");

function testReportPassesAndListsEveryPhase() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.phaseCount, EXPECTED_PHASES.length);
  assert.deepEqual(report.phases.map((phase) => phase.id), EXPECTED_PHASES);
  assert.ok(report.checkedFiles.includes("scripts/install-macos-production.sh"));
  assert.ok(report.checkedFiles.includes("docs/PUBLIC_INSTALLATION_CHECKLIST.md"));
  assert.deepEqual(report.issues, []);
}

function testCliJsonAndMarkdown() {
  const output = execFileSync("node", ["scripts/macos-install-phase-coverage-audit.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.phaseCount, EXPECTED_PHASES.length);

  const markdown = execFileSync("node", ["scripts/macos-install-phase-coverage-audit.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /macOS Install Phase Coverage Audit/);
  assert.match(markdown, /plan-plugin-workspace-provisioning/);
  assert.match(markdown, /run-first-start-preflight/);
}

testReportPassesAndListsEveryPhase();
testCliJsonAndMarkdown();

console.log("macos install phase coverage audit tests passed");
