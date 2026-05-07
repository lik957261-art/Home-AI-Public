"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

function usage() {
  return [
    "Usage:",
    "  node scripts/migrate-json-to-sqlite.js --data-dir <dir> --db <sqlite> --dry-run [--report <file>]",
    "  node scripts/migrate-json-to-sqlite.js --data-dir <dir> --db <sqlite> --write [--report <file>]",
    "",
    "Options:",
    "  --data-dir <dir>     Existing Hermes Mobile JSON data directory.",
    "  --db <file>          Target SQLite database path. Defaults to <data-dir>/hermes-mobile.sqlite3.",
    "  --dry-run            Import into a temporary SQLite file and delete it after reporting.",
    "  --write              Import into --db and leave the database in place.",
    "  --no-reset           Do not clear imported tables before import.",
    "  --report <file>      Write a JSON report with counts and integrity status.",
    "  --workspaces-file <file>",
    "                       Optional workspace catalog JSON exported from /api/workspaces or an admin catalog.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { reset: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--data-dir") out.dataDir = argv[++i];
    else if (arg === "--db") out.db = argv[++i];
    else if (arg === "--report") out.report = argv[++i];
    else if (arg === "--workspaces-file") out.workspacesFile = argv[++i];
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--write") out.write = true;
    else if (arg === "--no-reset") out.reset = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function readOptionalJsonFile(value, label) {
  if (!value) return null;
  const resolved = path.resolve(String(value));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} is not an existing file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function requireExistingDir(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} is not an existing directory: ${resolved}`);
  }
  return resolved;
}

function safeReportPath(value) {
  if (!value) return "";
  const resolved = path.resolve(String(value));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function summarize(report) {
  const counts = report.integrity?.counts || {};
  return [
    `mode=${report.mode}`,
    `db=${report.dbPath}`,
    `ok=${report.integrity?.ok === true}`,
    `workspaces=${counts.workspaces || 0}`,
    `threads=${counts.threads || 0}`,
    `messages=${counts.messages || 0}`,
    `artifacts=${counts.artifacts || 0}`,
    `pushSubscriptions=${counts.push_subscriptions || 0}`,
    `pushReceipts=${counts.push_receipts || 0}`,
    `pushDeliveries=${counts.push_deliveries || 0}`,
    `sharedDirectories=${counts.shared_directories || 0}`,
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.dryRun === args.write) {
    throw new Error("Choose exactly one of --dry-run or --write");
  }
  const dataDir = requireExistingDir(args.dataDir, "--data-dir");
  const tempDir = args.dryRun ? fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-sqlite-dry-run-")) : "";
  const dbPath = args.dryRun
    ? path.join(tempDir, "hermes-mobile.sqlite3")
    : path.resolve(args.db || path.join(dataDir, "hermes-mobile.sqlite3"));
  const reportPath = safeReportPath(args.report);
  const workspaceCatalog = readOptionalJsonFile(args.workspacesFile, "--workspaces-file");

  const store = createMobileSqliteStore({ dbPath });
  let report;
  try {
    const importManifest = store.importFromDataDir(dataDir, {
      reset: args.reset,
      dataDirKind: args.dryRun ? "dry-run-json-data-dir" : "json-data-dir",
      workspaceCatalog,
    });
    const integrity = store.integrityReport();
    store.audit("json_import_completed", {
      actorWorkspaceId: "system",
      actorPrincipalId: "system",
      targetType: "sqlite",
      targetId: path.basename(dbPath),
      payload: {
        dryRun: Boolean(args.dryRun),
        counts: integrity.counts,
        warnings: importManifest.warnings,
      },
    });
    report = {
      mode: args.dryRun ? "dry-run" : "write",
      generatedAt: new Date().toISOString(),
      dataDir,
      dbPath,
      reset: args.reset,
      import: importManifest,
      integrity: store.integrityReport(),
    };
  } finally {
    store.close();
  }

  if (reportPath) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(summarize(report));

  if (args.dryRun) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (!report.integrity?.ok) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (err) {
  console.error(err?.message || String(err));
  console.error(usage());
  process.exit(1);
}
