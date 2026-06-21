"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  BASELINE_DIAGNOSTICS,
} = require("./production-self-diagnostics");

const REPO_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_DIAGNOSTIC_IDS = BASELINE_DIAGNOSTICS.map((entry) => entry.id);

const MATRIX_DIMENSIONS = [
  {
    id: "owner-workspace",
    label: "Owner workspace behavior",
    evidence: "focused unit/integration test, production smoke, or explicit not-applicable note",
  },
  {
    id: "non-owner-workspace",
    label: "Non-Owner workspace behavior",
    evidence: "workspace-scoped test or explicit surface-is-owner-only note",
  },
  {
    id: "public-fresh-install",
    label: "Public fresh install behavior",
    evidence: "public installer/export check, first-start preflight, or explicit server-only not-applicable note",
  },
  {
    id: "public-update",
    label: "Public update behavior",
    evidence: "clean fast-forward/update path or explicit no-runtime-update-impact note",
  },
  {
    id: "migration-restore",
    label: "Migration or restore behavior",
    evidence: "migration dry-run, backup restore note, or no-persisted-state note",
  },
  {
    id: "backup-rollback",
    label: "Backup and rollback path",
    evidence: "backup path, rollback command, or no-production-data-mutation note",
  },
  {
    id: "permission-boundary",
    label: "Permission boundary",
    evidence: "auth/workspace/Gateway/Skill/Memory/Soul/filesystem boundary test or explicit no-boundary-change note",
  },
  {
    id: "ui-pwa-cache",
    label: "UI, PWA, and cache behavior",
    evidence: "visual/static-cache harness or explicit no-static-client-impact note",
  },
  {
    id: "production-self-diagnostic",
    label: "Production self-diagnostic coverage",
    evidence: "existing diagnostic id from production-self-diagnostics or new bounded diagnostic",
    acceptedEvidenceIds: PRODUCTION_DIAGNOSTIC_IDS,
  },
];

function readDocText(doc) {
  const docPath = path.isAbsolute(doc) ? doc : path.join(REPO_ROOT, doc);
  return fs.readFileSync(docPath, "utf8");
}

function buildMatrix() {
  return {
    ok: true,
    schemaVersion: 1,
    dimensionCount: MATRIX_DIMENSIONS.length,
    dimensions: MATRIX_DIMENSIONS,
  };
}

function renderMarkdown(matrix = buildMatrix()) {
  const lines = [
    "# Productization Acceptance Matrix",
    "",
    "Use this checklist for product-facing Home AI changes. Each row needs evidence or an explicit not-applicable reason.",
    "",
    "| Dimension | Evidence | Status | Notes |",
    "| --- | --- | --- | --- |",
  ];
  for (const dimension of matrix.dimensions) {
    lines.push(`| ${dimension.label} | ${dimension.evidence} | pending |  |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function verifyDocs(options = {}) {
  const docs = Array.isArray(options.docs) ? options.docs : [
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    "docs/TEST_MATRIX.md",
  ];
  const issues = [];
  for (const doc of docs) {
    const text = readDocText(doc);
    for (const dimension of MATRIX_DIMENSIONS) {
      if (!text.includes(dimension.id)) {
        issues.push({ code: "matrix_dimension_id_missing_from_doc", doc, id: dimension.id });
      }
      if (!text.includes(dimension.label)) {
        issues.push({ code: "matrix_dimension_label_missing_from_doc", doc, id: dimension.id, label: dimension.label });
      }
      if (dimension.id === "production-self-diagnostic") {
        for (const diagnosticId of PRODUCTION_DIAGNOSTIC_IDS) {
          if (!text.includes(diagnosticId)) {
            issues.push({
              code: "matrix_production_diagnostic_id_missing_from_doc",
              doc,
              id: dimension.id,
              diagnosticId,
            });
          }
        }
      }
    }
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    checkedDocs: docs,
    dimensionCount: MATRIX_DIMENSIONS.length,
    productionDiagnosticIdCount: PRODUCTION_DIAGNOSTIC_IDS.length,
    issues,
  };
}

function main() {
  if (process.argv.includes("--markdown")) {
    process.stdout.write(renderMarkdown());
    return;
  }
  const result = process.argv.includes("--verify-docs") ? verifyDocs() : buildMatrix();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MATRIX_DIMENSIONS,
  PRODUCTION_DIAGNOSTIC_IDS,
  buildMatrix,
  renderMarkdown,
  verifyDocs,
};
