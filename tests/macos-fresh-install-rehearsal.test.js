"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  REHEARSAL_PHASES,
  REQUIRED_ARTIFACTS,
  buildReport,
  productionServiceUserIssue,
} = require("../scripts/macos-fresh-install-rehearsal");

const REPO_ROOT = path.resolve(__dirname, "..");

function testRehearsalBuildsFreshInstallArtifacts() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.phaseCount, REHEARSAL_PHASES.length);
  assert.equal(report.temporaryRoot, true);
  assert.equal(report.tempRemoved, true);
  assert.equal(fs.existsSync(report.root), false);
  assert.deepEqual(report.phases.map((phase) => phase.phase), REHEARSAL_PHASES);
  assert.ok(report.phases.every((phase) => phase.ok));
  assert.deepEqual(report.artifacts.map((artifact) => artifact.path), REQUIRED_ARTIFACTS);
  assert.ok(report.artifacts.every((artifact) => artifact.exists));
}

function testCliCanUseExplicitRootAndKeepArtifacts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-rehearsal-test-"));
  try {
    const output = execFileSync("node", [
      "scripts/macos-fresh-install-rehearsal.js",
      "--root",
      root,
      "--json",
    ], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
    assert.equal(parsed.root, root);
    assert.equal(parsed.temporaryRoot, false);
    assert.equal(parsed.tempRemoved, false);
    for (const relativePath of REQUIRED_ARTIFACTS) {
      assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testProductionRehearsalRequiresServiceUser() {
  const issue = productionServiceUserIssue({
    repoRoot: "/Users/example/path",
    productionAppRoot: "/Users/example/path",
    username: "xuxin",
  });
  assert.equal(issue.code, "production_rehearsal_requires_service_user");
  assert.equal(issue.requiredUser, "hermes-host");
  assert.equal(productionServiceUserIssue({
    repoRoot: "/Users/example/path",
    productionAppRoot: "/Users/example/path",
    username: "hermes-host",
  }), null);
  assert.equal(productionServiceUserIssue({
    repoRoot: REPO_ROOT,
    productionAppRoot: "/Users/example/path",
    username: "xuxin",
  }), null);
}

testRehearsalBuildsFreshInstallArtifacts();
testCliCanUseExplicitRootAndKeepArtifacts();
testProductionRehearsalRequiresServiceUser();

console.log("macos fresh install rehearsal tests passed");
