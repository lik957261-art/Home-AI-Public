"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

function usage() {
  return [
    "Usage:",
    "  node scripts/sqlite-maintenance.js --db <sqlite> --check [--report <file>]",
    "  node scripts/sqlite-maintenance.js --db <sqlite> --backup --backup-dir <dir> [--export-json] [--report <file>] [--prune-days <days>]",
    "",
    "Options:",
    "  --db <file>          SQLite database to inspect or back up.",
    "  --check              Run SQLite quick_check, foreign_key_check, and table counts.",
    "  --backup             Create a consistent SQLite backup using VACUUM INTO.",
    "  --backup-dir <dir>   Directory for backup DB/report files.",
    "  --export-json        Also export a JSON runtime-state snapshot next to the DB backup.",
    "  --report <file>      Write the JSON report to this path.",
    "  --prune-days <days>  Delete backup DB/report/snapshot files older than this age.",
    "  --label <name>       Optional backup file label.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--db") out.db = argv[++i];
    else if (arg === "--backup-dir") out.backupDir = argv[++i];
    else if (arg === "--report") out.report = argv[++i];
    else if (arg === "--label") out.label = argv[++i];
    else if (arg === "--prune-days") out.pruneDays = Number(argv[++i]);
    else if (arg === "--check") out.check = true;
    else if (arg === "--backup") out.backup = true;
    else if (arg === "--export-json") out.exportJson = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function requireExistingFile(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} is not an existing file: ${resolved}`);
  }
  return resolved;
}

function ensureDir(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value) throw new Error(`${label} is required`);
  fs.mkdirSync(resolved, { recursive: true });
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`${label} is not a directory: ${resolved}`);
  return resolved;
}

function safeReportPath(value) {
  if (!value) return "";
  const resolved = path.resolve(String(value));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function timestampForFile(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function sanitizeLabel(value) {
  const text = String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return text ? `-${text.slice(0, 48)}` : "";
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fileInfo(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function summarize(report) {
  const counts = report.integrity?.counts || {};
  const lines = [
    `mode=${report.mode}`,
    `db=${report.dbPath}`,
    `ok=${report.integrity?.ok === true}`,
    `threads=${counts.threads || 0}`,
    `messages=${counts.messages || 0}`,
    `artifacts=${counts.artifacts || 0}`,
    `pushReceipts=${counts.push_receipts || 0}`,
  ];
  if (report.backup?.sqlite?.path) lines.push(`backup=${report.backup.sqlite.path}`);
  if (report.backup?.jsonSnapshot?.path) lines.push(`jsonSnapshot=${report.backup.jsonSnapshot.path}`);
  if (Array.isArray(report.pruned) && report.pruned.length) lines.push(`pruned=${report.pruned.length}`);
  return lines.join("\n");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pruneOldBackups(backupDir, pruneDays) {
  if (!Number.isFinite(pruneDays) || pruneDays <= 0) return [];
  const cutoff = Date.now() - pruneDays * 24 * 60 * 60 * 1000;
  const deleted = [];
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/^hermes-mobile-\d{8}-\d{6}/.test(entry.name)) continue;
    if (!/\.(sqlite3|json)$/.test(entry.name)) continue;
    const fullPath = path.join(backupDir, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs >= cutoff) continue;
    fs.rmSync(fullPath, { force: true });
    deleted.push(fullPath);
  }
  return deleted;
}

function runCheck(dbPath) {
  const store = createMobileSqliteStore({ dbPath });
  try {
    store.migrate();
    return store.integrityReport();
  } finally {
    store.close();
  }
}

function runBackup(dbPath, backupDir, options = {}) {
  const stamp = timestampForFile();
  const label = sanitizeLabel(options.label);
  const sqlitePath = path.join(backupDir, `hermes-mobile-${stamp}${label}.sqlite3`);
  const jsonPath = path.join(backupDir, `hermes-mobile-${stamp}${label}.state.json`);
  const store = createMobileSqliteStore({ dbPath });
  try {
    store.migrate();
    const before = store.integrityReport();
    if (!before.ok) {
      const err = new Error("Refusing backup because SQLite integrity check failed");
      err.integrity = before;
      throw err;
    }
    const db = store.open();
    db.exec("PRAGMA wal_checkpoint(PASSIVE);");
    if (fs.existsSync(sqlitePath)) throw new Error(`Backup already exists: ${sqlitePath}`);
    db.exec(`VACUUM INTO ${sqlString(sqlitePath)};`);
    const backupStore = createMobileSqliteStore({ dbPath: sqlitePath });
    let after;
    try {
      after = backupStore.integrityReport();
    } finally {
      backupStore.close();
    }
    if (!after.ok) {
      throw new Error(`Backup integrity check failed: ${sqlitePath}`);
    }
    const result = {
      sqlite: fileInfo(sqlitePath),
      sourceIntegrity: before,
      backupIntegrity: after,
    };
    if (options.exportJson) {
      writeJson(jsonPath, store.exportRuntimeState());
      result.jsonSnapshot = fileInfo(jsonPath);
    }
    return result;
  } finally {
    store.close();
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.check === args.backup) throw new Error("Choose exactly one of --check or --backup");
  const dbPath = requireExistingFile(args.db, "--db");
  const reportPath = safeReportPath(args.report);
  let report;

  if (args.check) {
    report = {
      mode: "check",
      generatedAt: new Date().toISOString(),
      dbPath,
      integrity: runCheck(dbPath),
    };
  } else {
    const backupDir = ensureDir(args.backupDir, "--backup-dir");
    const backup = runBackup(dbPath, backupDir, { exportJson: args.exportJson, label: args.label });
    const pruned = pruneOldBackups(backupDir, args.pruneDays);
    report = {
      mode: "backup",
      generatedAt: new Date().toISOString(),
      dbPath,
      backupDir,
      integrity: backup.sourceIntegrity,
      backup,
      pruned,
    };
  }

  if (reportPath) writeJson(reportPath, report);
  console.log(summarize(report));
  if (!report.integrity?.ok || (report.backup && !report.backup.backupIntegrity?.ok)) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (err) {
  if (err?.integrity) console.error(JSON.stringify({ integrity: err.integrity }, null, 2));
  console.error(err?.message || String(err));
  console.error(usage());
  process.exit(1);
}
