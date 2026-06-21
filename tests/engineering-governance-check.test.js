"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function testGovernanceCheckPasses() {
  const output = execFileSync("node", ["scripts/engineering-governance-check.js", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.issues, []);
}

function testProductizationRunsGovernanceCheck() {
  const source = read("scripts/productization-check.js");
  assert.match(source, /engineering-governance-check\.js/);
  assert.match(source, /public-install-preflight\.js/);
  assert.match(source, /plugin-provisioning-coverage-audit\.js/);
  assert.match(source, /macos-install-phase-coverage-audit\.js/);
  assert.match(source, /macos-fresh-install-rehearsal\.js/);
  assert.match(source, /macos-first-start-preflight\.js[\s\S]+--source-only/);
  assert.match(source, /macos-install-operator-closure-checklist\.js/);
  assert.match(source, /grok-xai-oauth-closure-checklist\.js/);
  assert.match(source, /windows-dev-services-boundary-checklist\.js/);
  assert.match(source, /macos-workspace-file-broker-boundary-checklist\.js/);
  assert.match(source, /codex-mobile-recovery-service\.test\.js/);
  assert.match(source, /codex-mobile-recovery-api-routes\.test\.js/);
  assert.match(source, /macos-web-push-production-audit\.js[\s\S]+--source-check/);
  assert.match(source, /production-self-diagnostics\.js/);
  assert.match(source, /production-self-diagnostics-coverage-audit\.js/);
  assert.match(source, /productization-acceptance-matrix\.js[\s\S]+--verify-docs/);
}

function testProductizationGateOrderIsPinned() {
  const source = read("scripts/productization-check.js");
  const labels = [
    "Engineering governance check",
    "Public install preflight source check",
    "Plugin provisioning coverage audit",
    "macOS install phase coverage audit",
    "macOS fresh install rehearsal",
    "macOS first-start preflight source check",
    "macOS install verification classification",
    "macOS install operator closure checklist",
    "Grok xAI OAuth closure checklist",
    "Windows development task boundary checklist",
    "macOS workspace file broker boundary checklist",
    "Codex Mobile recovery service test",
    "Codex Mobile recovery API route test",
    "macOS Web Push production audit source check",
    "Production self-diagnostics inventory",
    "Production self-diagnostics coverage audit",
    "Productization acceptance matrix docs verification",
    "runNpm([\"test\"])",
    "startupCheck()",
    "Whitespace diff check",
    "Staged whitespace diff check",
  ];
  let offset = 0;
  for (const label of labels) {
    const index = source.indexOf(label, offset);
    assert.notEqual(index, -1, `${label} must appear after the previous productization gate`);
    offset = index + label.length;
  }
}

function testGovernanceToolsAreIndexed() {
  const index = read("docs/DOCS_INDEX.md");
  assert.match(index, /public-install-preflight\.js/);
  assert.match(index, /plugin-provisioning-coverage-audit\.js/);
  assert.match(index, /install-macos-production\.sh/);
  assert.match(index, /macos-install-phase-coverage-audit\.js/);
  assert.match(index, /macos-fresh-install-rehearsal\.js/);
  assert.match(index, /macos-install-operator-closure-checklist\.js/);
  assert.match(index, /macos-first-start-preflight\.js/);
  assert.match(index, /production-self-diagnostics\.js/);
  assert.match(index, /production-self-diagnostics-coverage-audit\.js/);
  assert.match(index, /productization-acceptance-matrix\.js/);
}

function testGovernanceDocContainsRequiredSections() {
  const source = read("docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md");
  assert.match(source, /## CI-Enforced Constraints/);
  assert.match(source, /## Production Self-Diagnostics/);
  assert.match(source, /## Productization Acceptance Matrix/);
  assert.match(source, /public-install-preflight\.js/);
  assert.match(source, /plugin-provisioning-coverage-audit\.js/);
  assert.match(source, /install-macos-production\.sh/);
  assert.match(source, /macos-install-phase-coverage-audit\.js/);
  assert.match(source, /macos-fresh-install-rehearsal\.js/);
  assert.match(source, /macos-install-operator-closure-checklist\.js/);
  assert.match(source, /grok-xai-oauth-closure-checklist\.js/);
  assert.match(source, /windows-dev-services-boundary-checklist\.js/);
  assert.match(source, /macos-workspace-file-broker-boundary-checklist\.js/);
  assert.match(source, /macos-first-start-preflight\.js/);
  assert.match(source, /production-self-diagnostics\.js/);
  assert.match(source, /production-self-diagnostics-coverage-audit\.js/);
  assert.match(source, /productization-acceptance-matrix\.js/);
}

function testCodexMobileRecoveryGovernance() {
  const governance = read("scripts/engineering-governance-check.js");
  const pluginsDoc = read("docs/MODULES/plugins.md");
  const deploymentDoc = read("docs/MODULES/deployment.md");
  const testMatrix = read("docs/TEST_MATRIX.md");
  assert.match(governance, /checkCodexMobileRecovery/);
  assert.match(governance, /codex-mobile-recovery-service\.js/);
  assert.match(governance, /codex-mobile-recovery-api-routes\.js/);
  assert.match(governance, /codex-mobile-recovery-service\.test\.js/);
  assert.match(governance, /codex-mobile-recovery-api-routes\.test\.js/);
  assert.match(pluginsDoc, /\/api\/codex-mobile\/recovery\/status/);
  assert.match(pluginsDoc, /\/api\/codex-mobile\/recovery\/restore/);
  assert.match(deploymentDoc, /Codex Mobile has a narrower macOS host recovery path/);
  assert.match(testMatrix, /codex-mobile-recovery-service\.test\.js/);
  assert.match(testMatrix, /codex-mobile-recovery-api-routes\.test\.js/);
}

testGovernanceCheckPasses();
testProductizationRunsGovernanceCheck();
testProductizationGateOrderIsPinned();
testGovernanceToolsAreIndexed();
testGovernanceDocContainsRequiredSections();
testCodexMobileRecoveryGovernance();

console.log("engineering-governance-check tests passed");
