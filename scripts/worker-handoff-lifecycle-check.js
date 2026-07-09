#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ACTIVE_DIR = ".agent-context/worker-handoffs/active";
const MAX_DELTA_BYTES = 128 * 1024;
const REQUIRED_FIELDS = [
  "taskCardId",
  "sourceThreadId",
  "targetThreadId",
  "status",
  "mergeDisposition",
  "expiresAfter",
];
const VALID_MERGE_DISPOSITIONS = new Set(["pending", "merged", "archived", "discardable"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "blocked",
  "redirected",
  "rejected",
  "partially_completed",
  "superseded",
  "cancelled",
  "canceled",
  "failed",
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: path.resolve(__dirname, ".."),
    activeDir: DEFAULT_ACTIVE_DIR,
    json: false,
    now: new Date(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      index += 1;
      options.root = path.resolve(requireValue(argv[index], "--root"));
    } else if (arg === "--active-dir") {
      index += 1;
      options.activeDir = requireValue(argv[index], "--active-dir");
    } else if (arg === "--now") {
      index += 1;
      const value = requireValue(argv[index], "--now");
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid --now value: ${value}`);
      }
      options.now = parsed;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function usage() {
  return [
    "Usage: node scripts/worker-handoff-lifecycle-check.js [--json] [--root <path>] [--active-dir <path>] [--now <iso>]",
    "",
    "Scans .agent-context/worker-handoffs/active for bounded Worker delta files.",
  ].join("\n");
}

function resolveActiveDir(root, activeDir) {
  return path.isAbsolute(activeDir) ? activeDir : path.resolve(root, activeDir);
}

function relativePath(root, filePath) {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return filePath;
  }
  return relative.split(path.sep).join("/");
}

function listFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function readBoundedText(filePath) {
  const stat = fs.statSync(filePath);
  const byteLength = Math.min(stat.size, MAX_DELTA_BYTES);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(byteLength);
    fs.readSync(fd, buffer, 0, byteLength, 0);
    return {
      text: buffer.toString("utf8"),
      truncated: stat.size > MAX_DELTA_BYTES,
      size: stat.size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeFieldName(name) {
  const key = String(name || "")
    .toLowerCase()
    .replace(/[`*_ -]/g, "");
  if (key === "taskcardid" || key === "taskcard") return "taskCardId";
  if (key === "sourcethreadid" || key === "sourcethread") return "sourceThreadId";
  if (key === "targetthreadid" || key === "targetthread") return "targetThreadId";
  if (key === "status") return "status";
  if (key === "mergedisposition" || key === "disposition") return "mergeDisposition";
  if (key === "expiresafter" || key === "expiresat") return "expiresAfter";
  return "";
}

function cleanFieldValue(value) {
  return String(value || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+#.*$/u, "")
    .trim();
}

function parseWorkerHandoffDelta(content) {
  const fields = {};
  for (const line of String(content || "").split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?([A-Za-z][A-Za-z0-9 _-]*)(?:\*\*)?\s*[:=]\s*(.+?)\s*$/u);
    if (!match) continue;
    const fieldName = normalizeFieldName(match[1]);
    if (!fieldName || fields[fieldName]) continue;
    fields[fieldName] = cleanFieldValue(match[2]);
  }
  return fields;
}

function issue(code, file, extra = {}) {
  return { code, file, ...extra };
}

function validateDelta({ fields, file, now }) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      issues.push(issue("worker_handoff_missing_field", file, { field }));
    }
  }

  const mergeDisposition = String(fields.mergeDisposition || "").toLowerCase();
  if (fields.mergeDisposition && !VALID_MERGE_DISPOSITIONS.has(mergeDisposition)) {
    issues.push(issue("worker_handoff_invalid_merge_disposition", file, { field: "mergeDisposition" }));
  }
  if (mergeDisposition && mergeDisposition !== "pending") {
    issues.push(issue("worker_handoff_non_pending_left_active", file, { field: "mergeDisposition" }));
  }

  const expiresAfter = fields.expiresAfter ? new Date(fields.expiresAfter) : null;
  if (fields.expiresAfter && Number.isNaN(expiresAfter.getTime())) {
    issues.push(issue("worker_handoff_invalid_expires_after", file, { field: "expiresAfter" }));
  } else if (expiresAfter && expiresAfter.getTime() <= now.getTime()) {
    issues.push(issue("worker_handoff_expired_active_delta", file, { field: "expiresAfter" }));
  }

  return issues;
}

function runCheck(options = {}) {
  const root = path.resolve(options.root || path.resolve(__dirname, ".."));
  const activeDir = resolveActiveDir(root, options.activeDir || DEFAULT_ACTIVE_DIR);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const issues = [];

  if (!fs.existsSync(activeDir)) {
    return {
      ok: true,
      activeDir: relativePath(root, activeDir),
      checkedFileCount: 0,
      issues,
    };
  }

  const activeStat = fs.statSync(activeDir);
  if (!activeStat.isDirectory()) {
    return {
      ok: false,
      activeDir: relativePath(root, activeDir),
      checkedFileCount: 0,
      issues: [issue("worker_handoff_active_path_not_directory", relativePath(root, activeDir))],
    };
  }

  const files = listFilesRecursive(activeDir);
  for (const filePath of files) {
    const file = relativePath(root, filePath);
    const read = readBoundedText(filePath);
    if (read.truncated) {
      issues.push(issue("worker_handoff_delta_too_large", file, { maxBytes: MAX_DELTA_BYTES }));
    }
    const fields = parseWorkerHandoffDelta(read.text);
    issues.push(...validateDelta({ fields, file, now }));
    const status = String(fields.status || "").toLowerCase();
    if (TERMINAL_STATUSES.has(status) && String(fields.mergeDisposition || "").toLowerCase() === "pending") {
      // Terminal returns may remain active only while awaiting coordinator merge.
      // The expiresAfter rule above is the bounded cleanup guard.
    }
  }

  return {
    ok: issues.length === 0,
    activeDir: relativePath(root, activeDir),
    checkedFileCount: files.length,
    issues,
  };
}

function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = runCheck(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`worker handoff lifecycle check passed (${result.checkedFileCount} active files)`);
    } else {
      console.log(`worker handoff lifecycle check failed (${result.issues.length} issues)`);
      for (const item of result.issues) {
        console.log(`${item.code}: ${item.file}${item.field ? ` ${item.field}` : ""}`);
      }
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const result = {
      ok: false,
      error: "worker_handoff_lifecycle_check_failed",
      message: error && error.message ? error.message : String(error),
    };
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_ACTIVE_DIR,
  parseArgs,
  parseWorkerHandoffDelta,
  runCheck,
  validateDelta,
};
