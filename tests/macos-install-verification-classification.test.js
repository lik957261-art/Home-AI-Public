"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  EXPECTED_PHASES,
} = require("../scripts/macos-install-phase-coverage-audit");
const {
  REHEARSAL_PHASES,
} = require("../scripts/macos-fresh-install-rehearsal");
const {
  VERIFICATION_CLASSES,
  buildReport,
} = require("../scripts/macos-install-verification-classification");

const REPO_ROOT = path.resolve(__dirname, "..");

function testReportClassifiesEveryInstallerPhase() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.phaseCount, EXPECTED_PHASES.length);
  assert.deepEqual(report.phases.map((phase) => phase.id), EXPECTED_PHASES);
  assert.deepEqual(report.verificationClasses, VERIFICATION_CLASSES);
  assert.equal(report.phases.length, EXPECTED_PHASES.length);
  for (const verificationClass of VERIFICATION_CLASSES) {
    assert.ok(report.classCounts[verificationClass] > 0, verificationClass);
  }
}

function testFreshInstallRehearsalMatchesSourceRehearsedClass() {
  const report = buildReport();
  const sourceRehearsed = report.phases
    .filter((phase) => phase.verificationClass === "source_rehearsed")
    .map((phase) => phase.id);
  assert.deepEqual(sourceRehearsed, REHEARSAL_PHASES);
}

function testPrivilegedAndLivePhasesRemainExplicit() {
  const report = buildReport();
  const byId = Object.fromEntries(report.phases.map((phase) => [phase.id, phase]));
  assert.equal(byId["configure-workspace-isolation"].verificationClass, "privileged_apply");
  assert.equal(byId["repair-gateway-worker-acl"].verificationClass, "privileged_apply");
  assert.equal(byId["run-first-start-preflight"].verificationClass, "live_runtime");
  assert.equal(byId["run-smoke-tests"].verificationClass, "live_runtime");
  assert.equal(byId["install-launchd-services"].privilegedApplyGate, "HOMEAI_INSTALL_LAUNCHD_APPLY=1");
  assert.equal(byId["install-gateway-launchd-services"].privilegedApplyGate, "HOMEAI_INSTALL_LAUNCHD_APPLY=1");
}

function testCliJsonAndMarkdown() {
  const output = execFileSync("node", ["scripts/macos-install-verification-classification.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.phaseCount, EXPECTED_PHASES.length);

  const markdown = execFileSync("node", ["scripts/macos-install-verification-classification.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /macOS Install Verification Classification/);
  assert.match(markdown, /source_rehearsed/);
  assert.match(markdown, /privileged_apply/);
  assert.match(markdown, /run-smoke-tests: live_runtime/);
}

testReportClassifiesEveryInstallerPhase();
testFreshInstallRehearsalMatchesSourceRehearsedClass();
testPrivilegedAndLivePhasesRemainExplicit();
testCliJsonAndMarkdown();

console.log("macos install verification classification tests passed");
