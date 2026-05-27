"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const userSkill = path.join(
  process.env.USERPROFILE || "C:\\Users\\xuxin",
  ".codex",
  "skills",
  "hermes-codegraph-harness-discipline",
  "SKILL.md",
);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const harnessMatrix = read("docs/IMPLEMENTATION_NOTES/harness-required-matrix.md");
const testMatrix = read("docs/TEST_MATRIX.md");

assert.match(harnessMatrix, /bounded context-read budget/);
assert.match(harnessMatrix, /no more than three CodeGraph structural queries/);
assert.match(harnessMatrix, /Open no more than four source files/);
assert.match(harnessMatrix, /80-120 surrounding lines/);
assert.match(harnessMatrix, /route-first query/);
assert.match(harnessMatrix, /one targeted `rg` pass/);
assert.match(harnessMatrix, /Gateway Toolset Selection And Run Telemetry/);
assert.match(harnessMatrix, /must not hard-prune callable toolsets before the model/);
assert.match(harnessMatrix, /compact capability\s+catalog/);
assert.match(harnessMatrix, /explicit escalation path/);
assert.match(harnessMatrix, /final-message start\/end/);

assert.match(testMatrix, /CodeGraph-First Read Budget/);
assert.match(testMatrix, /three CodeGraph structural queries/);
assert.match(testMatrix, /four source files/);
assert.match(testMatrix, /80-120 lines/);
assert.match(testMatrix, /targeted `rg`/);
assert.match(testMatrix, /model-first\s+contract/);
assert.match(testMatrix, /Do not hard-prune callable toolsets/);
assert.match(testMatrix, /selected narrow execution/);
assert.match(testMatrix, /final-message start\/end/);

if (fs.existsSync(userSkill)) {
  const skillText = fs.readFileSync(userSkill, "utf8");
  assert.match(skillText, /Context Read Budget/);
  assert.match(skillText, /no more than three CodeGraph structural\s+queries/);
  assert.match(skillText, /no more than four source files/);
  assert.match(skillText, /route-first/);
  assert.match(skillText, /80-120 lines/);
  assert.match(skillText, /model-first toolset selection/);
  assert.match(skillText, /Do not\s+hard-prune callable toolsets/);
  assert.match(skillText, /explicit escalation path/);
  assert.match(skillText, /final-message start\/end/);
}
