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
assert.match(harnessMatrix, /must not hard-prune\s+callable toolsets before the model/);
assert.match(harnessMatrix, /compact capability\s+catalog/);
assert.match(harnessMatrix, /explicit escalation path/);
assert.match(harnessMatrix, /run\.toolset_escalation_retrying/);
assert.match(harnessMatrix, /same model-side\s+preflight/);
assert.match(harnessMatrix, /HERMES_PERMISSION_APPROVAL_REQUIRED/);
assert.match(harnessMatrix, /internal JSON-only preflight/);
assert.match(harnessMatrix, /no tool-role messages/);
assert.match(harnessMatrix, /repeated or duplicated JSON candidates/);
assert.match(harnessMatrix, /actual Gateway session or worker log/);
assert.match(harnessMatrix, /final-message start\/end/);
assert.match(harnessMatrix, /Any Hermes Mobile UI change must include visual verification evidence/);
assert.match(harnessMatrix, /Playwright mobile viewport\s+screenshot plus measured bounding rectangles/);
assert.match(harnessMatrix, /text or controls can overlap, drift, disappear, or become\s+untappable/);

assert.match(testMatrix, /CodeGraph-First Read Budget/);
assert.match(testMatrix, /three CodeGraph structural queries/);
assert.match(testMatrix, /four source files/);
assert.match(testMatrix, /80-120 lines/);
assert.match(testMatrix, /targeted `rg`/);
assert.match(testMatrix, /model-first\s+contract/);
assert.match(testMatrix, /Do not hard-prune callable toolsets/);
assert.match(testMatrix, /full-authorized execution/);
assert.match(testMatrix, /best-effort cancellation/);
assert.match(testMatrix, /(?:local natural-language permission routing|natural-language permission routing before the model)/);
assert.match(testMatrix, /(?:internal JSON-only preflight|selector\/preflight is an internal JSON-only step)/);
assert.match(testMatrix, /live (?:selector|preflight) probes do not contain\s+tool-role messages/);
assert.match(testMatrix, /repeated JSON candidates/);
assert.match(testMatrix, /actual Gateway session or worker log model/);
assert.match(testMatrix, /final-message start\/end/);
assert.match(testMatrix, /All Hermes Mobile UI changes require visual verification evidence/);
assert.match(testMatrix, /Playwright mobile viewport check that\s+captures a screenshot and records relevant bounding rectangles/);
assert.match(testMatrix, /Static DOM\/unit assertions are necessary but not sufficient/);

if (fs.existsSync(userSkill)) {
  const skillText = fs.readFileSync(userSkill, "utf8");
  assert.match(skillText, /Context Read Budget/);
  assert.match(skillText, /no more than three CodeGraph structural\s+queries/);
  assert.match(skillText, /no more than four source files/);
  assert.match(skillText, /route-first/);
  assert.match(skillText, /80-120 lines/);
  assert.match(skillText, /model-first toolset selection/);
  assert.match(skillText, /Do not\s+hard-prune callable toolsets/);
  assert.match(skillText, /same model-side\s+preflight/);
  assert.match(skillText, /HERMES_PERMISSION_APPROVAL_REQUIRED/);
  assert.match(skillText, /internal JSON-only preflight/);
  assert.match(skillText, /live selector sessions contain no tool-role/);
  assert.match(skillText, /repeated streamed JSON candidates/);
  assert.match(skillText, /Gateway session\/log evidence/);
  assert.match(skillText, /explicit escalation path/);
  assert.match(skillText, /run\.toolset_escalation_retrying/);
  assert.match(skillText, /final-message start\/end/);
}
