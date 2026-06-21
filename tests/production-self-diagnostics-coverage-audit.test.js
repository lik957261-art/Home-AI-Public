"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const { buildReport } = require("../scripts/production-self-diagnostics-coverage-audit");
const { BASELINE_DIAGNOSTICS } = require("../scripts/production-self-diagnostics");

const REPO_ROOT = path.resolve(__dirname, "..");

function testCoverageAuditPasses() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.diagnosticCount, BASELINE_DIAGNOSTICS.length);
  assert.equal(report.diagnostics.length, BASELINE_DIAGNOSTICS.length);
  assert.ok(report.diagnostics.every((entry) => entry.commandLength > 0));
  assert.ok(report.diagnostics.every((entry) => entry.requiredForCount > 0));
}

function testCoverageAuditRejectsUnlinkedSourceHarness() {
  const productionClosure = BASELINE_DIAGNOSTICS.find((entry) => entry.id === "production-closure");
  assert.ok(productionClosure);
  const report = buildReport({
    diagnostics: [{
      ...productionClosure,
      sourceHarness: "tests/public-install-preflight.test.js",
    }],
  });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((issue) => issue.code === "diagnostic_source_harness_unlinked"),
    JSON.stringify(report.issues, null, 2),
  );
}

function testCoverageAuditRejectsLocalAbsoluteCommandPaths() {
  const productionClosure = BASELINE_DIAGNOSTICS.find((entry) => entry.id === "production-closure");
  assert.ok(productionClosure);
  const report = buildReport({
    diagnostics: [{
      ...productionClosure,
      command: [
        "sudo",
        "/Users/example/path",
        "/Users/example/path",
        "--json",
      ],
    }],
  });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((issue) => issue.code === "diagnostic_command_contains_secret_like_value"),
    JSON.stringify(report.issues, null, 2),
  );
}

function testCliJsonAndMarkdown() {
  const output = execFileSync("node", ["scripts/production-self-diagnostics-coverage-audit.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.ok(parsed.diagnostics.some((entry) => entry.id === "production-closure"));

  const markdown = execFileSync("node", ["scripts/production-self-diagnostics-coverage-audit.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /Production Self-Diagnostics Coverage Audit/);
  assert.match(markdown, /production-closure/);
}

testCoverageAuditPasses();
testCoverageAuditRejectsUnlinkedSourceHarness();
testCoverageAuditRejectsLocalAbsoluteCommandPaths();
testCliJsonAndMarkdown();

console.log("production self-diagnostics coverage audit tests passed");
