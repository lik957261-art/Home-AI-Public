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
  assert.equal(report.diagnosticCount, 24);
  assert.equal(new Set(report.diagnostics.map((entry) => entry.id)).size, BASELINE_DIAGNOSTICS.length);
  assert.ok(report.diagnostics.some((entry) => entry.id === "deployment-drift-gate"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "first-start-preflight"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "macos-install-phase-coverage"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "macos-fresh-install-rehearsal"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "macos-install-verification-classification"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "macos-install-operator-closure"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "production-self-diagnostics-coverage"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "grok-xai-oauth-metadata"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "grok-xai-oauth-closure"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "windows-dev-services-boundary"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "workspace-file-broker-boundary"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "production-drift-reconcile"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "production-drift-watchdog"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "web-push-production-audit"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "plugin-workspace-audit"));
  assert.ok(report.diagnostics.some((entry) => entry.id === "plugin-provisioning-coverage"));
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
  assert.match(markdown, /macos-first-start-preflight\.js/);
  assert.match(markdown, /macos-install-phase-coverage-audit\.js/);
  assert.match(markdown, /macos-fresh-install-rehearsal\.js/);
  assert.match(markdown, /macos-install-verification-classification\.js/);
  assert.match(markdown, /macos-install-operator-closure-checklist\.js/);
  assert.match(markdown, /production-self-diagnostics-coverage-audit\.js/);
  assert.match(markdown, /grok-auth-metadata-smoke\.js/);
  assert.match(markdown, /grok-xai-oauth-closure-checklist\.js/);
  assert.match(markdown, /windows-dev-services-boundary-checklist\.js/);
  assert.match(markdown, /macos-workspace-file-broker-boundary-checklist\.js/);
  assert.match(markdown, /macos-production-drift-reconcile\.js/);
  assert.match(markdown, /homeai-production-drift-audit-watchdog\.sh/);
  assert.match(markdown, /macos-web-push-production-audit\.js/);
  assert.match(markdown, /plugin-workspace-audit-runner\.js/);
  assert.match(markdown, /plugin-provisioning-coverage-audit\.js/);
  assert.match(markdown, /macos-production-closure-validation\.js/);
}

testReportIsComplete();
testForbiddenOutputPolicyIsExplicit();
testCliJsonAndMarkdown();

console.log("production self-diagnostics tests passed");
