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
  assert.match(source, /fallback-governance-check\.js[\s\S]+--json/);
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
  assert.match(source, /runNpm\(\["test"\]\)/);
  assert.match(source, /runNpm\(\["run",\s*"test:install-lane"\]\)/);
}

function testProductizationGateOrderIsPinned() {
  const source = read("scripts/productization-check.js");
  const labels = [
    "Engineering governance check",
    "Fallback governance check",
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
    "runNpm([\"run\", \"test:install-lane\"])",
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
  assert.match(index, /fallback-governance-contract\.md/);
  assert.match(index, /fallback-registry\.md/);
  assert.match(index, /fallback-governance-check\.js/);
  assert.match(index, /audit-thread-governance-contract\.md/);
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
  assert.match(source, /fallback-governance-check\.js/);
  assert.match(source, /fallback-governance-check\.test\.js/);
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

function testAuditThreadGovernanceIsPinned() {
  const contract = read("docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md");
  const rootCause = read("docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md");
  const pluginContract = read("docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md");
  const automation = read("docs/MODULES/automation.md");
  const governance = read("scripts/engineering-governance-check.js");
  assert.match(contract, /Home AI Platform Audit/);
  assert.match(contract, /Plugin Workspace Audit/);
  assert.match(contract, /must not read[\s\S]+\.agent-context\/HANDOFF\.md/);
  assert.match(contract, /Contract lane/);
  assert.match(contract, /Architecture lane/);
  assert.match(contract, /architecture lane is mandatory/);
  assert.match(contract, /unclear domain contracts/);
  assert.match(contract, /duplicated state derivation/);
  assert.match(contract, /Return Card Required/);
  assert.match(contract, /Every audit card should remind the target thread to return a card/);
  assert.match(rootCause, /Return Card Required/);
  assert.match(rootCause, /source thread cannot\s+close/);
  assert.match(rootCause, /silently consumed/);
  assert.match(pluginContract, /Return Card Required/);
  assert.match(pluginContract, /Silent consumption is a contract violation/);
  assert.match(contract, /Scheduled automation may create an audit request card/);
  assert.match(contract, /discover the current audit thread dynamically/);
  assert.match(contract, /must not persist or hard-code Codex audit\s+thread ids/);
  assert.match(contract, /[Ss]end exactly one task card to that central audit thread/);
  assert.match(contract, /must not fan out to plugin implementation threads/);
  assert.match(automation, /audit-thread-governance-contract\.md/);
  assert.match(automation, /must not run deep host\/plugin audits[\s\S]+directly/);
  assert.match(governance, /audit_thread_governance_contract_incomplete/);
  assert.match(governance, /root_cause_contract_missing_return_card_closure/);
  assert.match(governance, /plugin_contract_missing_return_card_closure/);
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
  assert.match(governance, /fallback-governance-check\.js/);
  assert.match(governance, /fallback-governance-check\.test\.js/);
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
testAuditThreadGovernanceIsPinned();
testCodexMobileRecoveryGovernance();

console.log("engineering-governance-check tests passed");
