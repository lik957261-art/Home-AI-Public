"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const EXPECTED_PHASES = [
  "system-preflight",
  "install-dependencies",
  "create-service-users",
  "create-directory-layout",
  "install-hermes-mobile",
  "install-official-hermes-runtime",
  "configure-owner",
  "configure-workspace-isolation",
  "configure-gateway-profiles",
  "install-gateway-launchd-services",
  "repair-gateway-worker-acl",
  "configure-cron",
  "configure-plugins",
  "plan-plugin-workspace-provisioning",
  "install-launchd-services",
  "run-first-start-preflight",
  "run-smoke-tests",
  "print-access-info",
];

const REQUIRED_DOCS = [
  "docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md",
  "docs/PUBLIC_INSTALLATION_CHECKLIST.md",
  "docs/MODULES/deployment.md",
  "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
];

const REQUIRED_TESTS = [
  "tests/install-macos-production.test.js",
  "tests/macos-first-start-preflight.test.js",
];

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunctionBody(source, functionName) {
  const marker = `${functionName}() {`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function extractPhaseArray(source) {
  const match = source.match(/PHASES=\(\n([\s\S]*?)\n\)/);
  if (!match) return [];
  return [...match[1].matchAll(/^\s*"([^"]+)"\s*$/gm)].map((item) => item[1]);
}

function extractCaseLabels(functionBody) {
  const labels = new Set();
  for (const match of functionBody.matchAll(/^\s{4}([a-z0-9-]+)\)\s*$/gm)) {
    labels.add(match[1]);
  }
  return [...labels];
}

function extractExecutableLabels(source) {
  const body = extractFunctionBody(source, "phase_executable");
  const match = body.match(/^\s{4}([a-z0-9-|]+)\)\s*$/m);
  if (!match) return [];
  return match[1].split("|").filter(Boolean);
}

function compareExact(issues, label, actual, expected = EXPECTED_PHASES) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  addIssue(issues, `${label}_mismatch`, {
    expected,
    actual,
    missing: expected.filter((phase) => !actual.includes(phase)),
    extra: actual.filter((phase) => !expected.includes(phase)),
  });
}

function compareCoverage(issues, label, actual, expected = EXPECTED_PHASES) {
  const missing = expected.filter((phase) => !actual.includes(phase));
  const extra = actual.filter((phase) => !expected.includes(phase));
  if (missing.length === 0 && extra.length === 0) return;
  addIssue(issues, `${label}_mismatch`, { expected, actual, missing, extra });
}

function requireEachPhaseMentioned(issues, relativePath, phases = EXPECTED_PHASES) {
  const text = read(relativePath);
  const missing = phases.filter((phase) => !new RegExp(`\\b${escapeRegExp(phase)}\\b`).test(text));
  if (missing.length > 0) {
    addIssue(issues, "phase_reference_missing", { file: relativePath, missing });
  }
}

function checkInstallScript(issues) {
  const source = read("scripts/install-macos-production.sh");
  compareExact(issues, "phase_array", extractPhaseArray(source));
  compareCoverage(issues, "phase_command_cases", extractCaseLabels(extractFunctionBody(source, "phase_command")));
  compareExact(issues, "phase_executable_allowlist", extractExecutableLabels(source));
  compareCoverage(issues, "run_phase_cases", extractCaseLabels(extractFunctionBody(source, "run_phase")));
}

function checkTestsAndDocs(issues) {
  for (const relativePath of REQUIRED_DOCS) {
    requireEachPhaseMentioned(issues, relativePath);
  }
  requireEachPhaseMentioned(issues, "tests/install-macos-production.test.js");
  const installTest = read("tests/install-macos-production.test.js");
  if (!/phaseCount,\s*18/.test(installTest)) {
    addIssue(issues, "install_test_missing_phase_count", "tests/install-macos-production.test.js must assert phaseCount 18");
  }
  for (const relativePath of REQUIRED_TESTS) {
    if (!fs.existsSync(path.join(REPO_ROOT, relativePath))) {
      addIssue(issues, "missing_test", relativePath);
    }
  }
}

function buildReport() {
  const issues = [];
  checkInstallScript(issues);
  checkTestsAndDocs(issues);
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    phaseCount: EXPECTED_PHASES.length,
    phases: EXPECTED_PHASES.map((id, index) => ({ order: index + 1, id })),
    checkedFiles: [
      "scripts/install-macos-production.sh",
      ...REQUIRED_DOCS,
      ...REQUIRED_TESTS,
    ],
    issues,
  };
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--markdown")) {
    console.log("# macOS Install Phase Coverage Audit");
    console.log("");
    console.log(`- ok: ${report.ok}`);
    console.log(`- phaseCount: ${report.phaseCount}`);
    console.log("");
    for (const phase of report.phases) {
      console.log(`${phase.order}. ${phase.id}`);
    }
    if (report.issues.length > 0) {
      console.log("");
      console.log("## Issues");
      for (const issue of report.issues) {
        console.log(`- ${issue.code}: ${JSON.stringify(issue.detail)}`);
      }
    }
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_PHASES,
  buildReport,
};
