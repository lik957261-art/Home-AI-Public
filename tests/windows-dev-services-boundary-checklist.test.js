"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  CHECKLIST_ITEMS,
  REQUIRED_REFERENCES,
  buildChecklist,
} = require("../scripts/windows-dev-services-boundary-checklist");

const REPO_ROOT = path.resolve(__dirname, "..");

function testChecklistShape() {
  const report = buildChecklist();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.itemCount, CHECKLIST_ITEMS.length);
  assert.equal(report.itemCount, 4);
  assert.deepEqual(report.checkedReferences, REQUIRED_REFERENCES.map((entry) => entry.file));
}

function testBoundaryCommandsAndEvidence() {
  const report = buildChecklist();
  const serialized = JSON.stringify(report);
  assert.match(serialized, /Windows tasks are local development services/);
  assert.match(serialized, /not cited as a Mac production rollback or closure proof/);
  assert.match(serialized, /no-window-command-harness\.test\.js/);
  assert.match(serialized, /startup-scripts\.test\.js/);
  assert.match(serialized, /productization-acceptance-matrix\.js --verify-docs/);
  assert.match(serialized, /-WindowStyle Hidden/);
}

function testEveryItemHasEvidenceAndRiskBoundary() {
  const report = buildChecklist();
  for (const item of report.items) {
    assert.ok(item.command.length > 0, item.id);
    assert.ok(item.evidenceRequired.length > 0, item.id);
    assert.ok(item.riskBoundary.length > 0, item.id);
  }
}

function testCliJsonAndMarkdown() {
  const jsonOutput = execFileSync("node", ["scripts/windows-dev-services-boundary-checklist.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.itemCount, 4);

  const markdown = execFileSync("node", ["scripts/windows-dev-services-boundary-checklist.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /Windows Development Services Boundary Checklist/);
  assert.match(markdown, /Mac production remains the authoritative Home AI runtime/);
  assert.match(markdown, /Windows tasks are local development services/);
  assert.match(markdown, /-WindowStyle Hidden/);
}

testChecklistShape();
testBoundaryCommandsAndEvidence();
testEveryItemHasEvidenceAndRiskBoundary();
testCliJsonAndMarkdown();

console.log("windows dev services boundary checklist tests passed");
