"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  CHECKLIST_ITEMS,
  REQUIRED_REFERENCES,
  buildChecklist,
} = require("../scripts/macos-workspace-file-broker-boundary-checklist");

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
  assert.match(serialized, /Stage 1 OS-level workspace isolation remains the production minimum/);
  assert.match(serialized, /macos-worker-filesystem-access-harness\.js --root <mac-root> --json/);
  assert.match(serialized, /directory-browser-boundary-service\.test\.js/);
  assert.match(serialized, /file-artifact-access-service\.test\.js/);
  assert.match(serialized, /listener process filesystem capability/);
  assert.match(serialized, /per-workspace local file broker/);
  assert.match(serialized, /not proof that listener-side direct file access was removed/);
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
  const jsonOutput = execFileSync("node", ["scripts/macos-workspace-file-broker-boundary-checklist.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.itemCount, 4);

  const markdown = execFileSync("node", ["scripts/macos-workspace-file-broker-boundary-checklist.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /macOS Workspace File Broker Boundary Checklist/);
  assert.match(markdown, /Stage 1 OS-level workspace isolation remains the production minimum/);
  assert.match(markdown, /Stage 2 workspace file broker requirements stay explicit/);
  assert.match(markdown, /not a listener-side file broker/);
}

testChecklistShape();
testBoundaryCommandsAndEvidence();
testEveryItemHasEvidenceAndRiskBoundary();
testCliJsonAndMarkdown();

console.log("macOS workspace file broker boundary checklist tests passed");
