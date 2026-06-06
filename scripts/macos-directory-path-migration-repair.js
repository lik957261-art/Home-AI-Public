"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";

const LEGACY_DRIVE_PREFIXES = Object.freeze([
  "/mnt/c/ProgramData/HermesMobile/data/drive/users/",
  "C:/ProgramData/HermesMobile/data/drive/users/",
  "C:\\ProgramData\\HermesMobile\\data\\drive\\users\\",
]);

const LEGACY_DRIVE_SEARCH_PREFIXES = Object.freeze([
  ...LEGACY_DRIVE_PREFIXES,
  ...LEGACY_DRIVE_PREFIXES.map((prefix) => prefix.replace(/\\/g, "\\\\")),
]);

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dbPath: "",
    write: false,
    json: false,
    repairRootlessDrive: false,
    resetStateSnapshot: false,
    sampleLimit: 20,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--db") out.dbPath = argv[++index] || out.dbPath;
    else if (arg === "--write") out.write = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--repair-rootless-drive") out.repairRootlessDrive = true;
    else if (arg === "--reset-state-snapshot") out.resetStateSnapshot = true;
    else if (arg === "--sample-limit") out.sampleLimit = Number(argv[++index] || out.sampleLimit);
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-directory-path-migration-repair.js [options]",
        "  --root <dir>        Mac production root, default /Users/hermes-host/HermesMobile",
        "  --db <file>         SQLite DB path, default <root>/data/hermes-mobile.sqlite3",
        "  --write             Apply updates after copying DB/WAL/SHM backups",
        "  --repair-rootless-drive",
        "                      Also remap <root>/data/drive/<top>/... metadata",
        "                      when exactly one matching owner workspace path exists",
        "  --reset-state-snapshot",
        "                      With --write, back up and remove <root>/data/state.json",
        "                      so listener restart regenerates it from repaired SQLite",
        "  --sample-limit <n>  Maximum sample rows in JSON output, default 20",
        "  --json              Print bounded JSON metadata",
        "",
        "Dry-run is the default. The script rewrites persisted Windows/WSL",
        "drive metadata to the Mac live drive root; it does not modify user files.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  if (!out.dbPath) out.dbPath = path.join(out.root, "data", "hermes-mobile.sqlite3");
  if (!Number.isFinite(out.sampleLimit) || out.sampleLimit < 0) out.sampleLimit = 20;
  return out;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function macDriveUsersPrefix(root) {
  return `${String(root || DEFAULT_ROOT).replace(/\/+$/, "")}/data/drive/users/`.replace(/\\/g, "/");
}

function macDriveRootPrefix(root) {
  return `${String(root || DEFAULT_ROOT).replace(/\/+$/, "")}/data/drive/`.replace(/\\/g, "/");
}

function repairContext(rootOrOptions = DEFAULT_ROOT) {
  if (rootOrOptions && typeof rootOrOptions === "object") {
    return {
      root: String(rootOrOptions.root || DEFAULT_ROOT).replace(/\/+$/, ""),
      repairRootlessDrive: Boolean(rootOrOptions.repairRootlessDrive),
      rootlessCandidateCache: rootOrOptions.rootlessCandidateCache || new Map(),
    };
  }
  return {
    root: String(rootOrOptions || DEFAULT_ROOT).replace(/\/+$/, ""),
    repairRootlessDrive: false,
    rootlessCandidateCache: new Map(),
  };
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "");
  if (!text) return "";
  const cleanRoot = String(root || DEFAULT_ROOT).replace(/\/+$/, "");
  const macDrive = macDriveUsersPrefix(cleanRoot).replace(/users\/$/, "");
  const mappings = [
    [macDrive, "$DRIVE/"],
    ["/mnt/c/ProgramData/HermesMobile/data/drive/", "$WINDOWS_WSL_DRIFT/"],
    ["C:\\ProgramData\\HermesMobile\\data\\drive\\", "$WINDOWS_DRIFT/"],
    ["C:/ProgramData/HermesMobile/data/drive/", "$WINDOWS_DRIFT/"],
    [cleanRoot, "<root>"],
  ];
  for (const [prefix, replacement] of mappings) {
    if (text.startsWith(prefix)) return `${replacement}${text.slice(prefix.length).replace(/\\/g, "/")}`;
  }
  return text.replace(/\\/g, "/").split("/").filter(Boolean).slice(-6).join("/");
}

function containsLegacyDrivePath(value) {
  const text = String(value || "");
  return LEGACY_DRIVE_SEARCH_PREFIXES.some((prefix) => text.includes(prefix));
}

function containsRootlessDrivePath(value, root = DEFAULT_ROOT) {
  const text = String(value || "").replace(/\\+/g, "/").replace(/\/{2,}/g, "/");
  const rootlessPrefix = macDriveRootPrefix(root);
  let index = text.indexOf(rootlessPrefix);
  while (index >= 0) {
    const relative = text.slice(index + rootlessPrefix.length).replace(/^\/+/, "");
    if (relative && !relative.startsWith("users/")) return true;
    index = text.indexOf(rootlessPrefix, index + rootlessPrefix.length);
  }
  return false;
}

function containsRepairablePath(value, context) {
  return containsLegacyDrivePath(value)
    || (context.repairRootlessDrive && containsRootlessDrivePath(value, context.root));
}

function resolveRootlessDriveCandidate(value, context) {
  if (!context.repairRootlessDrive) return "";
  const input = String(value || "").replace(/\\/g, "/");
  const rootlessPrefix = macDriveRootPrefix(context.root);
  const usersPrefix = macDriveUsersPrefix(context.root);
  if (!input.startsWith(rootlessPrefix) || input.startsWith(usersPrefix)) return "";
  const relative = input.slice(rootlessPrefix.length).replace(/^\/+/, "");
  if (!relative || relative.startsWith("users/")) return "";
  if (context.rootlessCandidateCache.has(relative)) return context.rootlessCandidateCache.get(relative);

  const ownerUsersRoot = path.join(context.root, "data", "drive", "users", "owner");
  const matches = [];
  try {
    for (const entry of fs.readdirSync(ownerUsersRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(ownerUsersRoot, entry.name, relative);
      if (fs.existsSync(candidate)) matches.push(candidate.replace(/\\/g, "/"));
    }
  } catch (_) {}
  const resolved = matches.length === 1 ? matches[0] : "";
  context.rootlessCandidateCache.set(relative, resolved);
  return resolved;
}

function remapRootlessDriveString(value, context) {
  const input = String(value || "");
  const candidate = resolveRootlessDriveCandidate(input, context);
  if (!candidate || candidate === input) return { value: input, changed: false, replacements: [] };
  return {
    value: candidate,
    changed: true,
    replacements: [{ legacyPrefix: macDriveRootPrefix(context.root), offset: 0, kind: "rootless-drive" }],
  };
}

function remapLegacyDriveString(value, rootOrOptions = DEFAULT_ROOT) {
  const context = repairContext(rootOrOptions);
  const root = context.root;
  const input = String(value || "");
  if (!input) return { value: input, changed: false, replacements: [] };
  let output = input;
  const replacements = [];
  const targetPrefix = macDriveUsersPrefix(root);
  for (const legacyPrefix of LEGACY_DRIVE_PREFIXES) {
    let nextIndex = output.indexOf(legacyPrefix);
    while (nextIndex >= 0) {
      const before = output;
      output = `${output.slice(0, nextIndex)}${targetPrefix}${output.slice(nextIndex + legacyPrefix.length)}`;
      replacements.push({ legacyPrefix, offset: nextIndex });
      nextIndex = output.indexOf(legacyPrefix, nextIndex + targetPrefix.length);
      if (output === before) break;
    }
  }
  if (!replacements.length && context.repairRootlessDrive) {
    return remapRootlessDriveString(input, context);
  }
  if (!replacements.length) return { value: input, changed: false, replacements: [] };
  return {
    value: output.replace(/\\/g, "/"),
    changed: true,
    replacements,
  };
}

function parseJson(value) {
  if (!value) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function remapJsonValue(value, context, samples, sampleLimit, stats, location) {
  if (typeof value === "string") {
    const mapped = remapLegacyDriveString(value, context);
    if (!mapped.changed) return { value, changed: false };
    stats.valueReplacements += mapped.replacements.length;
    const exists = mapped.value.startsWith(macDriveUsersPrefix(context.root)) ? fs.existsSync(mapped.value) : null;
    if (exists === false) stats.missingAfterRemap += 1;
    if (samples.length < sampleLimit) {
      samples.push({
        location,
        before: compactPath(value, context.root),
        after: compactPath(mapped.value, context.root),
        exists,
      });
    }
    return { value: mapped.value, changed: true };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item, index) => {
      const mapped = remapJsonValue(item, context, samples, sampleLimit, stats, `${location}[${index}]`);
      if (mapped.changed) changed = true;
      return mapped.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = remapJsonValue(item, context, samples, sampleLimit, stats, `${location}.${key}`);
      if (mapped.changed) changed = true;
      next[key] = mapped.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function tableColumns(db, table) {
  if (!tableExists(db, table)) return [];
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function createBackups(dbPath) {
  const backupBase = `${dbPath}.${timestamp()}.bak`;
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const backups = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const suffix = file.slice(dbPath.length);
    const backup = `${backupBase}${suffix}`;
    fs.copyFileSync(file, backup);
    backups.push(backup);
  }
  return backups;
}

function resetStateSnapshot(options) {
  if (!options.write || !options.resetStateSnapshot) return null;
  const statePath = path.join(options.root, "data", "state.json");
  if (!fs.existsSync(statePath)) return { reset: false, reason: "missing" };
  const backup = `${statePath}.${timestamp()}.bak`;
  fs.copyFileSync(statePath, backup);
  fs.unlinkSync(statePath);
  return {
    reset: true,
    path: compactPath(statePath, options.root),
    backup: compactPath(backup, options.root),
  };
}

function emptyTableStats() {
  return {
    scannedRows: 0,
    affectedRows: 0,
    valueReplacements: 0,
    missingAfterRemap: 0,
    parseErrors: 0,
  };
}

function addStats(target, source) {
  target.scannedRows += source.scannedRows;
  target.affectedRows += source.affectedRows;
  target.valueReplacements += source.valueReplacements;
  target.missingAfterRemap += source.missingAfterRemap;
  target.parseErrors += source.parseErrors;
}

function scanJsonColumn(db, options, table, idColumn, column, samples, issues) {
  const stats = emptyTableStats();
  const rows = db.prepare(`SELECT ${idColumn} AS id, ${column} AS value FROM ${table} WHERE COALESCE(${column}, '') <> ''`).all();
  const updates = [];
  for (const row of rows) {
    stats.scannedRows += 1;
    if (!containsRepairablePath(row.value, options)) continue;
    const parsed = parseJson(row.value);
    if (!parsed.ok) {
      stats.parseErrors += 1;
      issues.push(`${table}.${column}.json_parse_failed:${row.id}`);
      continue;
    }
    const fieldStats = emptyTableStats();
    const mapped = remapJsonValue(parsed.value, options, samples, options.sampleLimit, fieldStats, `${table}.${column}:${row.id}`);
    addStats(stats, fieldStats);
    if (!mapped.changed) continue;
    stats.affectedRows += 1;
    updates.push({
      id: row.id,
      value: `${JSON.stringify(mapped.value)}\n`,
    });
  }
  if (options.write && updates.length) {
    const stmt = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`);
    for (const update of updates) stmt.run(update.value, update.id);
  }
  return stats;
}

function scanStringColumn(db, options, table, idColumn, column, samples) {
  const stats = emptyTableStats();
  const rows = db.prepare(`SELECT ${idColumn} AS id, ${column} AS value FROM ${table} WHERE COALESCE(${column}, '') <> ''`).all();
  const updates = [];
  for (const row of rows) {
    stats.scannedRows += 1;
    if (!containsRepairablePath(row.value, options)) continue;
    const mapped = remapLegacyDriveString(row.value, options);
    if (!mapped.changed) continue;
    stats.affectedRows += 1;
    stats.valueReplacements += mapped.replacements.length;
    const exists = mapped.value.startsWith(macDriveUsersPrefix(options.root)) ? fs.existsSync(mapped.value) : null;
    if (exists === false) stats.missingAfterRemap += 1;
    if (samples.length < options.sampleLimit) {
      samples.push({
        location: `${table}.${column}:${row.id}`,
        before: compactPath(row.value, options.root),
        after: compactPath(mapped.value, options.root),
        exists,
      });
    }
    updates.push({ id: row.id, value: mapped.value });
  }
  if (options.write && updates.length) {
    const stmt = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`);
    for (const update of updates) stmt.run(update.value, update.id);
  }
  return stats;
}

function repair(options) {
  const normalizedOptions = Object.assign({}, options, {
    root: String(options.root || DEFAULT_ROOT).replace(/\/+$/, ""),
    dbPath: options.dbPath || path.join(String(options.root || DEFAULT_ROOT).replace(/\/+$/, ""), "data", "hermes-mobile.sqlite3"),
    sampleLimit: Number.isFinite(options.sampleLimit) ? options.sampleLimit : 20,
    repairRootlessDrive: Boolean(options.repairRootlessDrive),
    resetStateSnapshot: Boolean(options.resetStateSnapshot),
    rootlessCandidateCache: new Map(),
  });
  const samples = [];
  const issues = [];
  const backups = normalizedOptions.write ? createBackups(normalizedOptions.dbPath) : [];
  const db = new DatabaseSync(normalizedOptions.dbPath);
  const results = {};
  let changed = false;
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    if (normalizedOptions.write) db.exec("BEGIN IMMEDIATE");
    const schema = {
      messages: tableColumns(db, "messages"),
      threads: tableColumns(db, "threads"),
      artifacts: tableColumns(db, "artifacts"),
    };
    const jobs = [
      ["messages", "id", "directory_route_json", "json"],
      ["messages", "id", "directory_aliases_json", "json"],
      ["messages", "id", "artifacts_json", "json"],
      ["threads", "id", "task_group_meta_json", "json"],
      ["artifacts", "id", "path", "string"],
      ["artifacts", "id", "raw_json", "json"],
    ];
    for (const [table, idColumn, column, type] of jobs) {
      const key = `${table}.${column}`;
      if (!schema[table]?.includes(idColumn) || !schema[table]?.includes(column)) {
        results[key] = Object.assign(emptyTableStats(), { skipped: true });
        continue;
      }
      const stats = type === "json"
        ? scanJsonColumn(db, normalizedOptions, table, idColumn, column, samples, issues)
        : scanStringColumn(db, normalizedOptions, table, idColumn, column, samples);
      results[key] = stats;
      if (stats.affectedRows || stats.valueReplacements) changed = true;
    }
    if (normalizedOptions.write) db.exec("COMMIT");
  } catch (error) {
    if (normalizedOptions.write) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
    }
    throw error;
  } finally {
    db.close();
  }
  const stateSnapshot = resetStateSnapshot(normalizedOptions);
  const totals = emptyTableStats();
  for (const stats of Object.values(results)) addStats(totals, stats);
  return {
    ok: issues.length === 0,
    mode: normalizedOptions.write ? "write" : "dry-run",
    repairRootlessDrive: normalizedOptions.repairRootlessDrive,
    resetStateSnapshot: normalizedOptions.resetStateSnapshot,
    wrote: Boolean(normalizedOptions.write && changed),
    changed,
    dbPath: compactPath(normalizedOptions.dbPath, normalizedOptions.root),
    macDriveUsers: compactPath(macDriveUsersPrefix(normalizedOptions.root), normalizedOptions.root),
    legacyDrivePrefixes: LEGACY_DRIVE_PREFIXES,
    backups: backups.map((item) => compactPath(item, normalizedOptions.root)),
    stateSnapshot,
    results,
    totals,
    samples,
    issues,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = repair(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.mode.toUpperCase()} ok=${result.ok} changed=${result.changed} wrote=${result.wrote}`);
      console.log(`rows=${result.totals.affectedRows} replacements=${result.totals.valueReplacements} missingAfterRemap=${result.totals.missingAfterRemap}`);
      if (result.backups.length) console.log(`backups=${result.backups.join(",")}`);
      if (result.issues.length) console.log(`issues=${result.issues.join(",")}`);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  LEGACY_DRIVE_PREFIXES,
  compactPath,
  containsLegacyDrivePath,
  macDriveUsersPrefix,
  parseArgs,
  remapLegacyDriveString,
  repair,
};
