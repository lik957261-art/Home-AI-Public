#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const REQUIRED_FILES = Object.freeze([
  "docs/PLATFORM_CONTRACTS/fallback-governance-contract.md",
  "docs/IMPLEMENTATION_NOTES/fallback-registry.md",
  "docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md",
  "docs/DOCS_INDEX.md",
  "docs/TEST_MATRIX.md",
  "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md",
  "adapters/ai-operations-control-plane-service.js",
  "scripts/ai-ops-control-plane.js",
  "scripts/fallback-governance-check.js",
  "tests/fallback-governance-check.test.js",
]);

const REQUIRED_DOC_PATTERNS = Object.freeze([
  Object.freeze({
    file: "docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md",
    pattern: /No silent fallback[\s\S]+fallback registry[\s\S]+Task-Card Intake And Reply Rule/i,
    code: "root_cause_contract_missing_fallback_governance",
  }),
  Object.freeze({
    file: "docs/PLATFORM_CONTRACTS/fallback-governance-contract.md",
    pattern: /No silent fallback[\s\S]+No mitigation may be called closure[\s\S]+Fallback Registry/i,
    code: "fallback_contract_missing_core_rules",
  }),
  Object.freeze({
    file: "docs/IMPLEMENTATION_NOTES/fallback-registry.md",
    pattern: /Fallback Registry[\s\S]+fallback_id[\s\S]+removal_condition/i,
    code: "fallback_registry_missing_schema",
  }),
  Object.freeze({
    file: "docs/DOCS_INDEX.md",
    pattern: /fallback-governance-contract\.md[\s\S]+fallback-registry\.md[\s\S]+fallback-governance-check\.js/i,
    code: "docs_index_missing_fallback_governance",
  }),
  Object.freeze({
    file: "docs/TEST_MATRIX.md",
    pattern: /fallback-governance-check\.js[\s\S]+fallback-governance-check\.test\.js/i,
    code: "test_matrix_missing_fallback_governance",
  }),
  Object.freeze({
    file: "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md",
    pattern: /Fallback governance[\s\S]+fallback-governance-check\.js[\s\S]+fallback-governance-check\.test\.js/i,
    code: "architecture_map_missing_fallback_governance",
  }),
  Object.freeze({
    file: "adapters/ai-operations-control-plane-service.js",
    pattern: /rootCauseGovernance[\s\S]+fallback-governance-check\.js/i,
    code: "ai_ops_missing_root_cause_governance",
  }),
]);

const RISKY_ADDED_LINE_PATTERNS = Object.freeze([
  Object.freeze({
    code: "fallback_keyword",
    pattern: /\b(fallback|fall back|fallbacks)\b|兜底/i,
    message: "new fallback code must be removed or registered with fallback-governance:<fallback_id>",
  }),
  Object.freeze({
    code: "owner_default",
    pattern: /\|\|\s*["']owner["']|default(?:Workspace|WorkspaceId)?\s*[:=]\s*["']owner["']|workspaceId\s*[:=]\s*["']owner["']/i,
    message: "new Owner defaulting must prove actor/effective-workspace ownership and cannot be silent fallback",
  }),
  Object.freeze({
    code: "empty_catch",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    message: "empty catch blocks hide root cause and need explicit error/status handling",
  }),
  Object.freeze({
    code: "local_success_on_server_failure",
    pattern: /已保存到本机|server.*unavailable.*saved|saved.*local.*server/i,
    message: "local success on server failure must be mitigation-only and registered",
  }),
]);

const GOVERNANCE_INFRASTRUCTURE_PATHS = Object.freeze(new Set([
  "adapters/ai-operations-control-plane-service.js",
  "scripts/engineering-governance-check.js",
  "scripts/fallback-governance-check.js",
  "scripts/plugin-workspace-platform-contract-check.js",
  "scripts/productization-check.js",
]));

function parseArgs(argv) {
  const out = { changedFiles: [], json: false, staged: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") out.json = true;
    else if (arg === "--staged" || arg === "--cached") out.staged = true;
    else if (arg === "--changed-file") out.changedFiles.push(argv[++index] || "");
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function repoRoot(input = {}) {
  return path.resolve(input.repoRoot || REPO_ROOT);
}

function addIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function checkRequiredFiles(issues, input = {}) {
  const root = repoRoot(input);
  for (const relativePath of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      addIssue(issues, "missing_file", relativePath);
    }
  }
}

function checkRequiredDocs(issues, input = {}) {
  const root = repoRoot(input);
  for (const item of REQUIRED_DOC_PATTERNS) {
    const fullPath = path.join(root, item.file);
    if (!fs.existsSync(fullPath)) {
      addIssue(issues, "missing_file", item.file);
      continue;
    }
    const text = fs.readFileSync(fullPath, "utf8");
    if (!item.pattern.test(text)) addIssue(issues, item.code, item.file);
  }
}

function normalizeChangedFiles(files) {
  return [...new Set((files || [])
    .map((file) => String(file || "").trim().replace(/\\/g, "/"))
    .filter(Boolean))];
}

function isScannableCodePath(relativePath) {
  if (!relativePath) return false;
  if (/^(docs|tests|workspace\/public-export)\//.test(relativePath)) return false;
  if (/^(node_modules|public\/vendor)\//.test(relativePath)) return false;
  if (GOVERNANCE_INFRASTRUCTURE_PATHS.has(relativePath)) return false;
  return /\.(?:js|mjs|cjs|ts|tsx|jsx)$/.test(relativePath);
}

function gitDiffForFiles(files, input = {}) {
  const args = ["diff", "--unified=0"];
  if (input.staged) args.push("--cached");
  if (files.length) args.push("--", ...files);
  try {
    return execFileSync("git", args, {
      cwd: repoRoot(input),
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (err) {
    return String(err?.stdout || "");
  }
}

function parseAddedLines(diffText) {
  const rows = [];
  let currentFile = "";
  let newLine = 0;
  for (const line of String(diffText || "").split(/\r?\n/)) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    if (line.startsWith("@@")) {
      const hunk = line.match(/\+(\d+)(?:,(\d+))?/);
      newLine = hunk ? Number(hunk[1]) : 0;
      continue;
    }
    if (!currentFile || line.startsWith("+++")) continue;
    if (line.startsWith("+")) {
      rows.push({ file: currentFile, line: newLine || 0, text: line.slice(1) });
      newLine += 1;
      continue;
    }
    if (line.startsWith(" ")) newLine += 1;
  }
  return rows;
}

function lineHasGovernanceAnnotation(text) {
  return /fallback-governance:[A-Za-z0-9._-]+/.test(String(text || ""));
}

function scanChangedLines(issues, input = {}) {
  const files = normalizeChangedFiles(input.changedFiles).filter(isScannableCodePath);
  if (!files.length) return { scannedFiles: [], scannedAddedLineCount: 0 };
  const addedRows = parseAddedLines(gitDiffForFiles(files, input));
  let scannedAddedLineCount = 0;
  for (const row of addedRows) {
    if (!isScannableCodePath(row.file)) continue;
    scannedAddedLineCount += 1;
    if (lineHasGovernanceAnnotation(row.text)) continue;
    for (const risk of RISKY_ADDED_LINE_PATTERNS) {
      if (risk.pattern.test(row.text)) {
        addIssue(issues, risk.code, `${row.file}:${row.line}: ${risk.message}`);
        break;
      }
    }
  }
  return { scannedFiles: files, scannedAddedLineCount };
}

function runCheck(input = {}) {
  const issues = [];
  if (!input.skipRequiredDocs) {
    checkRequiredFiles(issues, input);
    checkRequiredDocs(issues, input);
  }
  const scan = scanChangedLines(issues, input);
  return {
    ok: issues.length === 0,
    issues,
    scannedFiles: scan.scannedFiles,
    scannedAddedLineCount: scan.scannedAddedLineCount,
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/fallback-governance-check.js [--changed-file <path>] [--staged] [--json]",
    "",
    "Default mode verifies the fallback governance contract, registry, docs index,",
    "AI Ops intake wiring, and test-map coverage.",
    "With --changed-file it also scans added code lines in git diff for high-risk",
    "silent fallback patterns that require fallback-governance:<fallback_id>.",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = runCheck(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log("fallback governance check passed");
  else {
    for (const issue of result.issues) console.error(`${issue.code}: ${issue.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  }
}

module.exports = {
  parseAddedLines,
  runCheck,
};
