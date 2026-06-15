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
}

function testGovernanceDocContainsRequiredSections() {
  const source = read("docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md");
  assert.match(source, /## CI-Enforced Constraints/);
  assert.match(source, /## Production Self-Diagnostics/);
  assert.match(source, /## Productization Acceptance Matrix/);
}

testGovernanceCheckPasses();
testProductizationRunsGovernanceCheck();
testGovernanceDocContainsRequiredSections();

console.log("engineering-governance-check tests passed");
