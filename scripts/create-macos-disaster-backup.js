#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_OPERATOR_HOME = "/Users/xuxin";
const SQLITE_EXT_RE = /\.(sqlite|sqlite3|db)$/i;

const COMMON_RSYNC_EXCLUDES = [
  ".DS_Store",
  ".git/",
  ".codegraph/",
  ".codex/",
  ".agent-context/archive/",
  "node_modules/",
  ".venv/",
  "venv/",
  "__pycache__/",
  "logs/",
  "log/",
  "tmp/",
  "temp/",
  "cache/",
  ".cache/",
  "sessions/",
  "sandboxes/",
  "run/",
  "audio_cache/",
  "image_cache/",
  "run-logs/",
  "run-artifacts/",
  "local-backups/",
  "local-db-backups/",
  "sqlite-backups/",
  "backups/",
  "preupdate-backups/",
  ".deploy-backups/",
];

const SQLITE_EXCLUDES = [
  "*.sqlite",
  "*.sqlite*",
  "*.sqlite-shm",
  "*.sqlite-wal",
  "*.sqlite3",
  "*.sqlite3*",
  "*.sqlite3-shm",
  "*.sqlite3-wal",
  "*.db",
  "*.db*",
  "*.db-shm",
  "*.db-wal",
];

function parseArgs(argv) {
  const args = {
    root: process.env.HOMEAI_PRODUCTION_ROOT || DEFAULT_ROOT,
    destination: process.env.HOMEAI_DISASTER_BACKUP_DESTINATION || "",
    operatorHome: process.env.HOMEAI_DISASTER_BACKUP_OPERATOR_HOME || DEFAULT_OPERATOR_HOME,
    receiptDir: process.env.HOMEAI_DISASTER_BACKUP_RECEIPT_DIR || "",
    label: process.env.HOMEAI_DISASTER_BACKUP_LABEL || "daily",
    checkOnly: false,
    json: false,
    includeOperatorState: process.env.HOMEAI_DISASTER_BACKUP_INCLUDE_OPERATOR_STATE !== "0",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") args.root = requireValue(argv, ++i, arg);
    else if (arg === "--destination") args.destination = requireValue(argv, ++i, arg);
    else if (arg === "--operator-home") args.operatorHome = requireValue(argv, ++i, arg);
    else if (arg === "--receipt-dir") args.receiptDir = requireValue(argv, ++i, arg);
    else if (arg === "--label") args.label = requireValue(argv, ++i, arg);
    else if (arg === "--check-only" || arg === "--dry-run") args.checkOnly = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--skip-operator-state") args.includeOperatorState = false;
    else if (arg === "--include-operator-state") args.includeOperatorState = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.root = path.resolve(args.root);
  if (args.destination) args.destination = path.resolve(args.destination);
  if (args.operatorHome) args.operatorHome = path.resolve(args.operatorHome);
  if (!args.receiptDir) args.receiptDir = path.join(args.root, "data", "backups", "disaster-recovery-receipts");
  else args.receiptDir = path.resolve(args.receiptDir);
  args.label = sanitizeLabel(args.label);
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/create-macos-disaster-backup.js --destination <nas-path> [--check-only] [--json]",
    "",
    "Required:",
    "  --destination <path>  NAS-mounted or sync-backed disaster backup root.",
    "",
    "Options:",
    "  --root <path>          Home AI production root. Default: /Users/hermes-host/HermesMobile",
    "  --operator-home <path> Operator home for Codex/Hermes Agent custom stores. Default: /Users/xuxin",
    "  --skip-operator-state  Skip operator-home Codex/Hermes Agent state coverage.",
    "  --receipt-dir <path>   Receipt directory. Default: <root>/data/backups/disaster-recovery-receipts",
    "  --label <name>         Label used in the backup id. Default: daily",
    "  --check-only           Build and validate the plan without writing.",
    "  --json                 Print JSON result only.",
  ].join("\n"));
}

function sanitizeLabel(input) {
  return String(input || "daily").replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "daily";
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "T",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    "Z",
  ].join("");
}

function pathExists(item) {
  try {
    fs.lstatSync(item);
    return true;
  } catch {
    return false;
  }
}

function ensureUnderRoot(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Refusing to write outside backup root: ${targetPath}`);
  }
}

function ensureDir(dir, options) {
  if (options.checkOnly) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function runCommand(command, args, options) {
  if (options.checkOnly) return { status: 0, skipped: true };
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(`${command} failed with status ${result.status}: ${result.stderr || result.stdout || ""}`.trim());
    err.status = result.status;
    throw err;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function rsyncDirectory(step, source, target, options, extraExcludes = []) {
  if (!pathExists(source)) {
    return { name: step, ok: true, skipped: true, reason: "missing", source, target };
  }
  ensureUnderRoot(options.destination, target);
  ensureDir(target, options);
  const excludes = [...COMMON_RSYNC_EXCLUDES, ...extraExcludes];
  const args = [
    "-rlpt",
    "--delete",
    "--links",
    "--safe-links",
    "--inplace",
    ...excludes.flatMap((item) => ["--exclude", item]),
    `${source.replace(/\/$/, "")}/`,
    `${target.replace(/\/$/, "")}/`,
  ];
  if (options.checkOnly) args.unshift("--dry-run");
  const commandResult = runCommand("/usr/bin/rsync", args, options);
  return {
    name: step,
    ok: true,
    skipped: false,
    dryRun: Boolean(options.checkOnly),
    source,
    target,
    excludes,
    command: ["/usr/bin/rsync", ...args],
    commandStatus: commandResult.status,
  };
}

function copyFile(step, source, targetDir, options) {
  if (!pathExists(source)) {
    return { name: step, ok: true, skipped: true, reason: "missing", source, targetDir };
  }
  ensureUnderRoot(options.destination, targetDir);
  ensureDir(targetDir, options);
  const target = path.join(targetDir, path.basename(source));
  if (!options.checkOnly) fs.copyFileSync(source, target);
  return { name: step, ok: true, skipped: false, dryRun: Boolean(options.checkOnly), source, target };
}

function listDirectoryEntries(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function isSqliteManagedFileName(name) {
  return /\.(sqlite|sqlite3|db)(?:$|[.-])/i.test(name);
}

function copyProductionDataFile(step, source, targetDir, options) {
  if (isSqliteManagedFileName(path.basename(source))) {
    return {
      name: step,
      ok: true,
      skipped: true,
      reason: "sqlite-snapshot-managed",
      source,
      targetDir,
    };
  }
  return copyFile(step, source, targetDir, options);
}

function appendSplitDirectorySteps(steps, sourceRoot, targetRoot, stepPrefix, options, extraExcludes = [], splitDepth = 0) {
  if (!pathExists(sourceRoot)) {
    steps.push(namedStep(stepPrefix, () => ({
      name: stepPrefix,
      ok: true,
      skipped: true,
      reason: "missing",
      source: sourceRoot,
      target: targetRoot,
    })));
    return;
  }

  if (splitDepth <= 0) {
    steps.push(namedStep(stepPrefix, () => rsyncDirectory(stepPrefix, sourceRoot, targetRoot, options, extraExcludes)));
    return;
  }

  const entries = listDirectoryEntries(sourceRoot);
  if (entries.length === 0) {
    steps.push(namedStep(`${stepPrefix}:empty`, () => {
      ensureUnderRoot(options.destination, targetRoot);
      ensureDir(targetRoot, options);
      return { name: `${stepPrefix}:empty`, ok: true, skipped: false, source: sourceRoot, target: targetRoot };
    }));
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    if (entry.isDirectory() && shouldSkipWalkDir(entry.name)) continue;
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    const childStep = `${stepPrefix}:${entry.name}`;
    if (entry.isDirectory()) {
      appendSplitDirectorySteps(steps, source, target, childStep, options, extraExcludes, splitDepth - 1);
    } else if (entry.isFile()) {
      steps.push(namedStep(childStep, () => copyProductionDataFile(childStep, source, targetRoot, options)));
    } else if (entry.isSymbolicLink()) {
      steps.push(namedStep(childStep, () => copyFile(childStep, source, targetRoot, options)));
    }
  }
}

function appendProductionDataSteps(steps, dataRoot, targetRoot, options) {
  if (!pathExists(dataRoot)) {
    steps.push(namedStep("production-data", () => ({
      name: "production-data",
      ok: true,
      skipped: true,
      reason: "missing",
      source: dataRoot,
      target: targetRoot,
    })));
    return;
  }

  for (const entry of listDirectoryEntries(dataRoot)) {
    if (entry.name === ".DS_Store") continue;
    if (entry.isDirectory() && shouldSkipWalkDir(entry.name)) continue;
    const source = path.join(dataRoot, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "drive") {
        appendSplitDirectorySteps(steps, source, path.join(targetRoot, entry.name), `production-data:${entry.name}`, options, SQLITE_EXCLUDES, 4);
      } else {
        steps.push(namedStep(`production-data:${entry.name}`, () => rsyncDirectory(`production-data:${entry.name}`, source, path.join(targetRoot, entry.name), options, SQLITE_EXCLUDES)));
      }
    } else if (entry.isFile()) {
      steps.push(namedStep(`production-data-file:${entry.name}`, () => copyProductionDataFile(`production-data-file:${entry.name}`, source, targetRoot, options)));
    } else if (entry.isSymbolicLink()) {
      steps.push(namedStep(`production-data-link:${entry.name}`, () => copyFile(`production-data-link:${entry.name}`, source, targetRoot, options)));
    }
  }
}

function walkFiles(root, visitor, options = {}) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (shouldSkipWalkDir(entry.name)) continue;
      walkFiles(full, visitor, options);
    } else if (entry.isFile()) {
      visitor(full);
    }
  }
}

function shouldSkipWalkDir(name) {
  return new Set([
    ".git",
    ".codegraph",
    ".cache",
    "cache",
    "logs",
    "log",
    "run",
    "tmp",
    "temp",
    "backups",
    "local-backups",
    "local-db-backups",
    "sqlite-backups",
    "preupdate-backups",
    ".deploy-backups",
    "node_modules",
    "hermes-agent",
    ".venv",
    "venv",
  ]).has(name);
}

function discoverSqliteFiles(root) {
  const files = [];
  if (!pathExists(root)) return files;
  walkFiles(root, (file) => {
    if (!SQLITE_EXT_RE.test(file)) return;
    files.push(file);
  });
  return files.sort();
}

function sqliteSnapshot(step, source, target, options) {
  ensureUnderRoot(options.destination, target);
  ensureDir(path.dirname(target), options);
  if (options.checkOnly) {
    return { name: step, ok: true, skipped: false, dryRun: true, source, target };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-sqlite-backup-"));
  const tempTarget = path.join(tempDir, path.basename(target));
  const code = [
    "import sqlite3, sys",
    "src, dst = sys.argv[1], sys.argv[2]",
    "source = sqlite3.connect(src)",
    "target = sqlite3.connect(dst)",
    "try:",
    "    source.backup(target)",
    "    cur = target.execute('PRAGMA quick_check')",
    "    result = cur.fetchone()[0]",
    "    if result != 'ok':",
    "        raise SystemExit('quick_check failed: ' + str(result))",
    "finally:",
    "    target.close()",
    "    source.close()",
  ].join("\n");
  try {
    const result = childProcess.spawnSync("/usr/bin/python3", ["-c", code, source, tempTarget], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(`sqlite backup failed for ${source}: ${result.stderr || result.stdout || ""}`.trim());
    }
    fs.copyFileSync(tempTarget, target);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return { name: step, ok: true, skipped: false, source, target };
}

function relativeUnder(root, item) {
  return path.relative(root, item).split(path.sep).join("/");
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function collectSoulFiles(root, operatorHome) {
  const roots = [
    path.join(root, "data", "hermes-home"),
    path.join(root, "gateway-worker", "telemetry", "profiles"),
    path.join(root, "data", "skill-profiles"),
  ];
  if (operatorHome) {
    roots.push(path.join(operatorHome, ".hermes"));
  }
  const files = [];
  for (const scanRoot of roots) {
    if (!pathExists(scanRoot)) continue;
    walkFiles(scanRoot, (file) => {
      if (path.basename(file).toLowerCase() === "soul.md" || path.basename(file).toLowerCase().includes("soul")) {
        const stat = fs.statSync(file);
        files.push({
          path: file,
          size: stat.size,
          sha256: stat.size <= 1024 * 1024 ? sha256File(file) : "",
        });
      }
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function buildSteps(options, backupId) {
  const currentRoot = path.join(options.destination, "current");
  const steps = [];
  const root = options.root;
  const dataRoot = path.join(root, "data");
  const pluginRoot = path.join(root, "plugins");
  const operatorHome = options.includeOperatorState ? options.operatorHome : "";

  steps.push(namedStep("production-app", () => rsyncDirectory("production-app", path.join(root, "app"), path.join(currentRoot, "production", "app"), options, SQLITE_EXCLUDES)));
  appendProductionDataSteps(steps, dataRoot, path.join(currentRoot, "production", "data"), options);
  steps.push(namedStep("production-plugins-all", () => rsyncDirectory("production-plugins-all", pluginRoot, path.join(currentRoot, "production", "plugins"), options, SQLITE_EXCLUDES)));
  steps.push(namedStep("production-gateway-worker", () => rsyncDirectory("production-gateway-worker", path.join(root, "gateway-worker"), path.join(currentRoot, "production", "gateway-worker"), options, SQLITE_EXCLUDES)));
  steps.push(namedStep("production-config", () => rsyncDirectory("production-config", path.join(root, "config"), path.join(currentRoot, "production", "config"), options)));
  steps.push(namedStep("launchd-home-ai-plists", () => copyFile("launchd-home-ai-plists", "/Library/LaunchDaemons/com.hermesmobile.home-ai.plist", path.join(currentRoot, "production", "launchd"), options)));
  steps.push(namedStep("launchd-cron-plist", () => copyFile("launchd-cron-plist", "/Library/LaunchDaemons/com.hermesmobile.cron.plist", path.join(currentRoot, "production", "launchd"), options)));

  if (operatorHome) {
    const hermesHome = path.join(operatorHome, ".hermes");
    steps.push(namedStep("operator-hermes-agent-custom-store", () => rsyncDirectory("operator-hermes-agent-custom-store", hermesHome, path.join(currentRoot, "operator-home", path.basename(operatorHome), ".hermes"), options, [
      "hermes-agent/",
      "node_modules/",
      "sessions/",
      "logs/",
      "log/",
      "cache/",
      "tmp/",
      "sandboxes/",
      "output/",
      "run-logs/",
      "run-artifacts/",
      "audio_cache/",
      "image_cache/",
      "backups/",
      "local-backups/",
      "openwebui/",
      "pairing/",
      "backup-receipts/",
      "weixin-mobile-ingress/",
      "worker-pool/",
      "node/",
      "auth.json",
      "auth.lock",
      "skills",
      "profiles/*/auth.json",
      "profiles/*/auth.lock",
      "profiles/*/skills",
      "profiles/*/memories",
      "memories/memories",
    ])));
    steps.push(namedStep("operator-codex-skills-memory-config", () => rsyncDirectory("operator-codex-skills-memory-config", path.join(operatorHome, ".codex"), path.join(currentRoot, "operator-home", path.basename(operatorHome), ".codex"), options, [
      "sessions/",
      "archived_sessions/",
      "logs/",
      "log/",
      "cache/",
      "tmp/",
      "sandboxes/",
      "uploads/",
      "generated_images/",
      "computer-use/",
      "computer-use-turn-ended/",
      "browser/",
      "shell_snapshots/",
      "node_repl/",
      ".sandbox/",
      "*.sqlite-shm",
      "*.sqlite-wal",
      "*.db-shm",
      "*.db-wal",
      "logs_*.sqlite*",
    ])));
    steps.push(namedStep("operator-codex-mobile-state", () => rsyncDirectory("operator-codex-mobile-state", path.join(operatorHome, ".codex-mobile-web"), path.join(currentRoot, "operator-home", path.basename(operatorHome), ".codex-mobile-web"), options, [
      "uploads/",
      "generated-images/",
      "thread-detail-projections/",
      "logs/",
      "tmp/",
      "cache/",
    ])));
  }

  const sqliteRoots = [dataRoot, pluginRoot, path.join(root, "gateway-worker")];
  const sqliteFiles = sqliteRoots.flatMap(discoverSqliteFiles);
  for (const sqliteFile of sqliteFiles) {
    const rel = relativeUnder(root, sqliteFile);
    steps.push(namedStep(`sqlite-snapshot:${rel}`, () => sqliteSnapshot(`sqlite-snapshot:${rel}`, sqliteFile, path.join(currentRoot, "production", "sqlite-snapshots", rel), options)));
  }

  return { currentRoot, steps, sqliteFiles, backupId };
}

function namedStep(name, fn) {
  fn.stepName = name;
  return fn;
}

function writeJson(file, payload, options) {
  ensureUnderRoot(options.destination, file);
  ensureDir(path.dirname(file), options);
  if (!options.checkOnly) {
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

function writeText(file, text, options) {
  ensureDir(path.dirname(file), options);
  if (!options.checkOnly) fs.writeFileSync(file, text, "utf8");
}

function runBackup(options) {
  if (!options.destination) {
    throw new Error("Missing --destination or HOMEAI_DISASTER_BACKUP_DESTINATION for NAS disaster backup root");
  }
  ensureUnderRoot(options.destination, options.destination);
  const backupId = `${timestamp()}-${options.label}`;
  const { currentRoot, steps, sqliteFiles } = buildSteps(options, backupId);
  const results = [];
  const failures = [];

  for (const runStep of steps) {
    try {
      results.push(runStep());
    } catch (error) {
      failures.push(error.message);
      results.push({ name: runStep.stepName || "unknown", ok: false, error: error.message });
    }
  }

  const soulFiles = collectSoulFiles(options.root, options.includeOperatorState ? options.operatorHome : "");
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    backupId,
    checkOnly: options.checkOnly,
    host: os.hostname(),
    sourceRoot: options.root,
    destinationRoot: options.destination,
    currentRoot,
    purpose: "Home AI Mac production disaster recovery backup including all installed plugins, workspace data, Skills stores, Memory stores, and Soul files.",
    includes: [
      "Home AI production app files",
      "Home AI production data and user drive files",
      "All installed plugin code and plugin data directories",
      "Online-consistent SQLite snapshots from production data, plugin data, and Gateway worker state",
      "Gateway worker state and profile Soul files",
      "Home AI workspace Skill stores under data/skill-profiles/*/skills",
      "Home AI workspace Memory stores under data/skill-profiles/*/memories",
      "Per-user Memory Soul files discovered under production and optional operator Hermes Agent state",
      "Hermes Agent custom operator Skills and Memory store when readable",
      "Codex and Codex Mobile local skills/memory/config state when readable",
      "LaunchDaemon plist files needed to reconstruct production services",
    ],
    excludes: [
      "runtime binaries and package caches, which are recorded by version and rebuilt or backed up at lower frequency",
      "node_modules and virtualenv directories",
      "logs, temp, cache, sandboxes, run artifacts, and old local backup directories",
      "live SQLite files copied as raw files; SQLite is captured through online snapshots instead",
    ],
    runtimeReference: {
      path: path.join(options.root, "runtime"),
      policy: "not copied by this daily backup; record/rebuild runtime separately because it is large and reproducible",
    },
    sqliteFileCount: sqliteFiles.length,
    soulFiles,
    steps: results,
    failures,
  };

  const manifestPath = path.join(currentRoot, "DISASTER-RECOVERY-MANIFEST.json");
  const readmePath = path.join(currentRoot, "RESTORE-README.md");
  const receiptPath = path.join(options.receiptDir, `disaster-recovery-receipt-${backupId}.md`);

  writeJson(manifestPath, manifest, options);
  writeText(readmePath, restoreReadme(), options);
  writeText(receiptPath, receiptText(manifest), options);

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "success" : "partial",
    checkOnly: options.checkOnly,
    backupId,
    destinationRoot: options.destination,
    currentRoot,
    manifestPath,
    receiptPath,
    stepCount: results.length,
    failureCount: failures.length,
    sqliteFileCount: sqliteFiles.length,
    soulFileCount: soulFiles.length,
    coverage: {
      plugins: true,
      workspaceSkillStores: true,
      workspaceMemoryStores: true,
      memorySoulFiles: true,
      hermesAgentCustomSkillsStore: Boolean(options.includeOperatorState),
    },
  };
}

function restoreReadme() {
  return [
    "# Home AI Mac Disaster Recovery Backup",
    "",
    "This folder is intended to restore Home AI Mac production on a replacement machine.",
    "",
    "It contains production app files, production data, all installed plugin directories, online SQLite snapshots, Gateway worker state, workspace Skills and Memory stores, Soul files, and selected operator Codex/Hermes Agent state when readable.",
    "",
    "Do not publish this backup. It contains production secrets, account state, user data, and private memory files.",
    "",
  ].join("\n");
}

function receiptText(manifest) {
  return [
    "# Home AI Mac Disaster Recovery Backup Receipt",
    "",
    `- Status: ${manifest.failures.length === 0 ? "success" : "partial"}`,
    `- Time: ${manifest.createdAt}`,
    `- Backup ID: ${manifest.backupId}`,
    `- Destination: ${manifest.destinationRoot}`,
    `- Current backup directory: ${manifest.currentRoot}`,
    `- Step count: ${manifest.steps.length}`,
    `- Failed steps: ${manifest.failures.length}`,
    `- SQLite snapshots: ${manifest.sqliteFileCount}`,
    `- Soul files recorded: ${manifest.soulFiles.length}`,
    "- Includes: Home AI app/data, all plugins, Gateway state, workspace Skills stores, workspace Memory stores, Memory Soul files, and selected operator Hermes Agent/Codex state.",
    "- Excludes: runtime binaries, node_modules, virtualenvs, logs, temp/cache, sandboxes, and old local backups.",
    "",
  ].join("\n");
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runBackup(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Home AI Mac disaster backup ${result.status}: ${result.backupId}`);
      console.log(`Destination: ${result.destinationRoot}`);
      console.log(`Current: ${result.currentRoot}`);
      console.log(`Soul files recorded: ${result.soulFileCount}`);
      console.log(`SQLite snapshots: ${result.sqliteFileCount}`);
      if (result.checkOnly) console.log("Check-only mode: no files were written.");
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  buildSteps,
  collectSoulFiles,
  discoverSqliteFiles,
  runBackup,
};
