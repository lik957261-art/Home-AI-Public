"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  BASELINE_DIAGNOSTICS,
  FORBIDDEN_OUTPUT,
} = require("./production-self-diagnostics");

const REPO_ROOT = path.resolve(__dirname, "..");

const DOCS_REQUIRED_FOR_EACH_DIAGNOSTIC = [
  "docs/MODULES/deployment.md",
  "docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md",
];

const FORBIDDEN_COMMAND_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]+/,
  /xox[baprs]-[A-Za-z0-9-]+/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\/Users\/[^\s]+/,
  /\/Volumes\/[^\s]+/,
  /[A-Za-z]:\\Users\\[^\s]+/,
  /refresh[_-]?token\s*[:=]/i,
  /access[_-]?token\s*[:=]/i,
  /client[_-]?secret\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
];

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkEntryShape(issues, entry, index) {
  const prefix = entry?.id || `index:${index}`;
  for (const field of ["id", "title", "script", "sourceHarness"]) {
    if (!String(entry?.[field] || "").trim()) {
      addIssue(issues, "diagnostic_field_missing", { id: prefix, field });
    }
  }
  if (!Array.isArray(entry.command) || entry.command.length === 0) {
    addIssue(issues, "diagnostic_command_missing", { id: prefix });
  }
  if (!Array.isArray(entry.requiredFor) || entry.requiredFor.length === 0) {
    addIssue(issues, "diagnostic_required_for_missing", { id: prefix });
  }
}

function checkFiles(issues, entry) {
  if (entry.script && !exists(entry.script)) {
    addIssue(issues, "diagnostic_script_missing", { id: entry.id, path: entry.script });
  }
  if (entry.sourceHarness && !exists(entry.sourceHarness)) {
    addIssue(issues, "diagnostic_source_harness_missing", { id: entry.id, path: entry.sourceHarness });
  }
}

function checkSourceHarnessCoverage(issues, entry) {
  if (!entry.sourceHarness || !exists(entry.sourceHarness)) return;
  const text = read(entry.sourceHarness);
  const scriptName = path.basename(entry.script || "");
  const diagnosticId = String(entry.id || "");
  if ((!scriptName || !text.includes(scriptName)) && (!diagnosticId || !text.includes(diagnosticId))) {
    addIssue(issues, "diagnostic_source_harness_unlinked", {
      id: entry.id,
      sourceHarness: entry.sourceHarness,
      script: scriptName,
    });
  }
}

function checkDocs(issues, entry) {
  for (const relativePath of DOCS_REQUIRED_FOR_EACH_DIAGNOSTIC) {
    const text = read(relativePath);
    const basename = path.basename(entry.script || "");
    if (!basename || !new RegExp(escapeRegExp(basename)).test(text)) {
      addIssue(issues, "diagnostic_doc_reference_missing", {
        id: entry.id,
        file: relativePath,
        script: basename,
      });
    }
  }
}

function checkCommandPolicy(issues, entry) {
  const commandText = Array.isArray(entry.command) ? entry.command.join(" ") : "";
  for (const pattern of FORBIDDEN_COMMAND_VALUE_PATTERNS) {
    if (pattern.test(commandText)) {
      addIssue(issues, "diagnostic_command_contains_secret_like_value", {
        id: entry.id,
        pattern: String(pattern),
      });
    }
  }
}

function buildReport(options = {}) {
  const diagnostics = Array.isArray(options.diagnostics) ? options.diagnostics : BASELINE_DIAGNOSTICS;
  const issues = [];
  const ids = new Set();
  for (const [index, entry] of diagnostics.entries()) {
    checkEntryShape(issues, entry, index);
    if (entry?.id) {
      if (ids.has(entry.id)) {
        addIssue(issues, "diagnostic_id_duplicate", entry.id);
      }
      ids.add(entry.id);
    }
    checkFiles(issues, entry);
    checkSourceHarnessCoverage(issues, entry);
    checkDocs(issues, entry);
    checkCommandPolicy(issues, entry);
  }
  if (!Array.isArray(FORBIDDEN_OUTPUT) || FORBIDDEN_OUTPUT.length < 6) {
    addIssue(issues, "forbidden_output_policy_too_small", { count: FORBIDDEN_OUTPUT?.length || 0 });
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    diagnosticCount: diagnostics.length,
    checkedDocs: DOCS_REQUIRED_FOR_EACH_DIAGNOSTIC,
    diagnostics: diagnostics.map((entry) => ({
      id: entry.id,
      script: entry.script,
      sourceHarness: entry.sourceHarness,
      commandLength: Array.isArray(entry.command) ? entry.command.length : 0,
      requiredForCount: Array.isArray(entry.requiredFor) ? entry.requiredFor.length : 0,
    })),
    issues,
  };
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--markdown")) {
    console.log("# Production Self-Diagnostics Coverage Audit");
    console.log("");
    console.log(`- ok: ${report.ok}`);
    console.log(`- diagnosticCount: ${report.diagnosticCount}`);
    console.log("");
    for (const entry of report.diagnostics) {
      console.log(`- ${entry.id}: ${entry.script}`);
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
  buildReport,
};
