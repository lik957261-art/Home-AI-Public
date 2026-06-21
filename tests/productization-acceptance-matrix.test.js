"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  MATRIX_DIMENSIONS,
  PRODUCTION_DIAGNOSTIC_IDS,
  buildMatrix,
  renderMarkdown,
  verifyDocs,
} = require("../scripts/productization-acceptance-matrix");

const REPO_ROOT = path.resolve(__dirname, "..");

function testMatrixDimensions() {
  const matrix = buildMatrix();
  assert.equal(matrix.ok, true);
  assert.equal(matrix.dimensionCount, 9);
  assert.equal(new Set(matrix.dimensions.map((dimension) => dimension.id)).size, MATRIX_DIMENSIONS.length);
  assert.ok(matrix.dimensions.every((dimension) => dimension.evidence));
  const diagnosticDimension = matrix.dimensions.find((dimension) => dimension.id === "production-self-diagnostic");
  assert.deepEqual(diagnosticDimension.acceptedEvidenceIds, PRODUCTION_DIAGNOSTIC_IDS);
}

function testMarkdownTemplate() {
  const markdown = renderMarkdown();
  assert.match(markdown, /Productization Acceptance Matrix/);
  assert.match(markdown, /Owner workspace behavior/);
  assert.match(markdown, /Production self-diagnostic coverage/);
  assert.match(markdown, /\| Dimension \| Evidence \| Status \| Notes \|/);
}

function testDocsVerificationAndCli() {
  const docResult = verifyDocs();
  assert.equal(docResult.ok, true, JSON.stringify(docResult.issues, null, 2));

  const output = execFileSync("node", ["scripts/productization-acceptance-matrix.js", "--verify-docs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
}

function testDocsVerificationRejectsMissingDiagnosticIds() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-productization-matrix-"));
  const tmpDoc = path.join(tmpDir, "matrix.md");
  fs.writeFileSync(tmpDoc, [
    "owner-workspace Owner workspace behavior",
    "non-owner-workspace Non-Owner workspace behavior",
    "public-fresh-install Public fresh install behavior",
    "public-update Public update behavior",
    "migration-restore Migration or restore behavior",
    "backup-rollback Backup and rollback path",
    "permission-boundary Permission boundary",
    "ui-pwa-cache UI, PWA, and cache behavior",
    "production-self-diagnostic Production self-diagnostic coverage",
    "",
  ].join("\n"));
  const report = verifyDocs({ docs: [tmpDoc] });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((issue) => issue.code === "matrix_production_diagnostic_id_missing_from_doc"),
    JSON.stringify(report.issues, null, 2),
  );
}

testMatrixDimensions();
testMarkdownTemplate();
testDocsVerificationAndCli();
testDocsVerificationRejectsMissingDiagnosticIds();

console.log("productization acceptance matrix tests passed");
