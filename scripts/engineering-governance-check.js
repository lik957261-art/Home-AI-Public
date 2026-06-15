"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function requireFile(issues, relativePath) {
  if (!exists(relativePath)) {
    addIssue(issues, "missing_file", relativePath);
    return false;
  }
  return true;
}

function requireText(issues, relativePath, pattern, code, detail) {
  if (!requireFile(issues, relativePath)) return;
  const text = readText(relativePath);
  if (!pattern.test(text)) {
    addIssue(issues, code, detail || relativePath);
  }
}

function checkRequiredFiles(issues) {
  [
    ".github/workflows/ci.yml",
    "docs/DOCS_INDEX.md",
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/TEST_MATRIX.md",
    "docs/MODULES/deployment.md",
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    "scripts/productization-check.js",
    "scripts/production-self-diagnostics.js",
    "scripts/productization-acceptance-matrix.js",
    "scripts/production-status-smoke.js",
    "scripts/macos-production-profile-audit.js",
    "scripts/macos-worker-filesystem-access-harness.js",
    "scripts/macos-gateway-manifest-toolset-smoke.js",
    "scripts/macos-plugin-directory-production-smoke.js",
    "scripts/macos-bound-directory-preview-smoke.js",
    "scripts/macos-automation-cron-audit.js",
    "scripts/macos-production-closure-validation.js",
    "tests/production-self-diagnostics.test.js",
    "tests/productization-acceptance-matrix.test.js",
  ].forEach((relativePath) => requireFile(issues, relativePath));
}

function checkCiGate(issues) {
  requireText(
    issues,
    ".github/workflows/ci.yml",
    /npm\s+run\s+productization:check/,
    "ci_missing_productization_check",
    ".github/workflows/ci.yml must run npm run productization:check",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /runNpm\(\["test"\]\)/,
    "productization_missing_npm_test",
    "productization-check.js must run npm test",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /startupCheck\(\)/,
    "productization_missing_startup_check",
    "productization-check.js must run startupCheck()",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /engineering-governance-check\.js/,
    "productization_missing_governance_check",
    "productization-check.js must run engineering-governance-check.js",
  );
  requireText(
    issues,
    "scripts/productization-check.js",
    /git",\s*\["diff",\s*"--check"\]/,
    "productization_missing_diff_check",
    "productization-check.js must run git diff --check",
  );
}

function checkDocs(issues) {
  requireText(
    issues,
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    /## CI-Enforced Constraints[\s\S]+## Production Self-Diagnostics[\s\S]+## Productization Acceptance Matrix/,
    "governance_doc_missing_required_sections",
    "engineering-governance-gates.md must define the three governance sections",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /engineering-governance-gates\.md/,
    "docs_index_missing_governance_doc",
    "DOCS_INDEX must point to engineering-governance-gates.md",
  );
  requireText(
    issues,
    "docs/PRODUCT_REQUIREMENTS.md",
    /CI-enforced constraints[\s\S]+production self-diagnostics[\s\S]+productization\s+acceptance\s+matrix/i,
    "product_requirements_missing_governance_rule",
    "PRODUCT_REQUIREMENTS must include the engineering governance product rule",
  );
  requireText(
    issues,
    "docs/TEST_MATRIX.md",
    /engineering-governance-check\.js[\s\S]+production-self-diagnostics\.js[\s\S]+productization-acceptance-matrix\.js[\s\S]+Productization Acceptance Matrix/i,
    "test_matrix_missing_governance_gate",
    "TEST_MATRIX must include the governance check and productization matrix",
  );
  requireText(
    issues,
    "docs/DOCS_INDEX.md",
    /production-self-diagnostics\.js[\s\S]+productization-acceptance-matrix\.js/,
    "docs_index_missing_governance_tools",
    "DOCS_INDEX must point to the production diagnostics and productization matrix tools",
  );
  requireText(
    issues,
    "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
    /production-self-diagnostics\.js[\s\S]+productization-acceptance-matrix\.js/,
    "governance_doc_missing_executable_tools",
    "engineering-governance-gates.md must describe the executable governance tools",
  );
}

function checkProductionDiagnostics(issues) {
  const deploymentDoc = "docs/MODULES/deployment.md";
  [
    "production-status-smoke.js",
    "macos-production-profile-audit.js",
    "macos-worker-filesystem-access-harness.js",
    "macos-gateway-manifest-toolset-smoke.js",
    "macos-plugin-directory-production-smoke.js",
    "macos-bound-directory-preview-smoke.js",
    "macos-automation-cron-audit.js",
    "macos-production-closure-validation.js",
  ].forEach((scriptName) => {
    requireText(
      issues,
      deploymentDoc,
      new RegExp(scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "deployment_doc_missing_diagnostic",
      `${deploymentDoc} must reference ${scriptName}`,
    );
  });
}

function runCheck() {
  const issues = [];
  checkRequiredFiles(issues);
  checkCiGate(issues);
  checkDocs(issues);
  checkProductionDiagnostics(issues);
  return { ok: issues.length === 0, issues };
}

function main() {
  const result = runCheck();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    console.log("Engineering governance check passed.");
  } else {
    console.error("Engineering governance check failed:");
    for (const issue of result.issues) {
      console.error(`- ${issue.code}: ${issue.detail}`);
    }
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCheck };
