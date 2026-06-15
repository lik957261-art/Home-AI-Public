"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  BASELINE_DIAGNOSTICS,
  FORBIDDEN_OUTPUT,
  buildReport,
  renderMarkdown,
} = require("../scripts/production-self-diagnostics");

const REPO_ROOT = path.resolve(__dirname, "..");

function testReportIsComplete() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.diagnosticCount, 8);
  assert.equal(new Set(report.diagnostics.map((entry) => entry.id)).size, BASELINE_DIAGNOSTICS.length);
  assert.ok(report.diagnostics.every((entry) => entry.scriptExists));
  assert.ok(report.diagnostics.every((entry) => entry.sourceHarnessExists));
  assert.ok(report.diagnostics.every((entry) => entry.outputPolicy === "bounded metadata only"));
}

function testForbiddenOutputPolicyIsExplicit() {
  assert.ok(FORBIDDEN_OUTPUT.includes("raw Access Keys"));
  assert.ok(FORBIDDEN_OUTPUT.includes("full prompts"));
  assert.ok(FORBIDDEN_OUTPUT.includes("private file contents"));
}

function testCliJsonAndMarkdown() {
  const jsonOutput = execFileSync("node", ["scripts/production-self-diagnostics.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, true);

  const markdown = renderMarkdown(parsed);
  assert.match(markdown, /Production Self-Diagnostics/);
  assert.match(markdown, /production-status-smoke\.js/);
  assert.match(markdown, /macos-production-closure-validation\.js/);
}

testReportIsComplete();
testForbiddenOutputPolicyIsExplicit();
testCliJsonAndMarkdown();

console.log("production self-diagnostics tests passed");
