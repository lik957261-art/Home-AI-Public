"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  migrateKanbanCaseDeliverables,
  replacePathStrings,
  userFacingDeliverableFile,
} = require("../scripts/migrate-kanban-case-deliverables");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run() {
  assert.equal(userFacingDeliverableFile("report.md"), true);
  assert.equal(userFacingDeliverableFile("latest-assessment-exam.json"), false);
  assert.deepEqual(replacePathStrings({ a: "C:\\old\\a.md" }, new Map([[path.resolve("C:\\old\\a.md"), "C:\\new\\a.md"]])), {
    a: "C:\\new\\a.md",
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-case-deliverable-migration-"));
  const dataDir = path.join(root, "data");
  const artifactRoot = path.join(dataDir, "artifacts", "kanban-reading");
  const sharePath = path.join(dataDir, "kanban-case-shares.json");
  const caseDirectory = path.join(root, "bound", "case-a");
  const reportPath = path.join(artifactRoot, "owner", "case-a", "card-1", "report.md");
  const statePath = path.join(artifactRoot, "owner", "case-a", "card-1", "latest-reading-submission.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, "# report", "utf8");
  writeJson(statePath, { analysisPath: reportPath, nested: { path: reportPath } });
  writeJson(sharePath, {
    schemaVersion: 1,
    cases: {
      "owner::case-a": {
        ownerWorkspaceId: "owner",
        caseId: "case-a",
        caseDirectoryPath: caseDirectory,
      },
    },
  });

  const summary = migrateKanbanCaseDeliverables({
    paths: { dataDir, artifactRoot, sharePath, deliverableFolderName: "deliverables" },
  });
  assert.equal(summary.shares, 1);
  assert.equal(summary.casesScanned, 1);
  assert.equal(summary.filesCopied, 1);
  assert.equal(summary.stateFilesUpdated, 1);
  const copiedPath = path.join(caseDirectory, "deliverables", "card-1", "report.md");
  assert.equal(fs.existsSync(copiedPath), true);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(state.analysisPath, copiedPath);
  assert.equal(state.nested.path, copiedPath);
  assert.equal(fs.existsSync(path.join(caseDirectory, "deliverables", "card-1", "latest-reading-submission.json")), false);
}

run();
console.log("kanban case deliverable migration tests passed");
