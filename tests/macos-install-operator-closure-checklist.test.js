"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  EXPECTED_PHASES,
} = require("../scripts/macos-install-phase-coverage-audit");
const {
  PHASE_VERIFICATION,
} = require("../scripts/macos-install-verification-classification");
const {
  OPERATOR_CLOSURE_CLASSES,
  buildChecklist,
} = require("../scripts/macos-install-operator-closure-checklist");

const REPO_ROOT = path.resolve(__dirname, "..");

function testChecklistCoversEveryInstallerPhase() {
  const report = buildChecklist();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.phaseCount, EXPECTED_PHASES.length);
  assert.deepEqual(report.items.map((item) => item.id), EXPECTED_PHASES);
  assert.equal(report.operatorClosureCount, 8);
}

function testEveryOperatorClosurePhaseHasEvidenceAndCommands() {
  const report = buildChecklist();
  const expectedOperatorPhases = EXPECTED_PHASES.filter((phase) =>
    OPERATOR_CLOSURE_CLASSES.has(PHASE_VERIFICATION[phase].verificationClass),
  );
  assert.deepEqual(report.operatorItems.map((item) => item.id), expectedOperatorPhases);
  for (const item of report.operatorItems) {
    assert.equal(item.actionRequired, true, item.id);
    assert.ok(item.commands.length > 0, item.id);
    assert.ok(item.evidenceRequired.length > 0, item.id);
    assert.ok(item.operatorInput.length > 0, item.id);
    assert.ok(item.riskBoundary.length > 0, item.id);
  }
}

function testSourceRehearsedPhasesStayOutOfOperatorClosure() {
  const report = buildChecklist();
  for (const item of report.items) {
    if (item.verificationClass === "source_rehearsed") {
      assert.equal(item.requiresOperatorClosure, false, item.id);
      assert.equal(item.actionRequired, false, item.id);
      assert.equal(item.closureType, "source-rehearsed", item.id);
    }
  }
}

function testPrivilegedGatesRemainExplicit() {
  const report = buildChecklist();
  const byId = Object.fromEntries(report.operatorItems.map((item) => [item.id, item]));
  assert.match(byId["create-service-users"].commands.join("\n"), /HOMEAI_INSTALL_ALLOW_USER_CREATE=1/);
  assert.match(byId["configure-workspace-isolation"].commands.join("\n"), /HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1/);
  assert.match(byId["repair-gateway-worker-acl"].commands.join("\n"), /HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1/);
  assert.match(byId["run-first-start-preflight"].commands.join("\n"), /--network-mode direct\|proxy/);
  assert.match(byId["run-smoke-tests"].commands.join("\n"), /macos-production-closure-validation\.js/);
}

function testCliJsonAndMarkdown() {
  const output = execFileSync("node", ["scripts/macos-install-operator-closure-checklist.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.operatorClosureCount, 8);

  const markdown = execFileSync("node", ["scripts/macos-install-operator-closure-checklist.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /macOS Install Operator Closure Checklist/);
  assert.match(markdown, /create-service-users/);
  assert.match(markdown, /HOMEAI_INSTALL_ALLOW_USER_CREATE=1/);
  assert.match(markdown, /run-smoke-tests/);
}

testChecklistCoversEveryInstallerPhase();
testEveryOperatorClosurePhaseHasEvidenceAndCommands();
testSourceRehearsedPhasesStayOutOfOperatorClosure();
testPrivilegedGatesRemainExplicit();
testCliJsonAndMarkdown();

console.log("macos install operator closure checklist tests passed");
