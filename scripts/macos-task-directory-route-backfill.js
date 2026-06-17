"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROOT = "/Users/example/path";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dbPath: "",
    write: false,
    resetStateSnapshot: false,
    json: false,
    sampleLimit: 20,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--db") out.dbPath = argv[++index] || out.dbPath;
    else if (arg === "--write") out.write = true;
    else if (arg === "--reset-state-snapshot") out.resetStateSnapshot = true;
    else if (arg === "--sample-limit") out.sampleLimit = Number(argv[++index] || out.sampleLimit);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-task-directory-route-backfill.js [options]",
        "  --root <dir>          Mac production root, default /Users/example/path",
        "  --db <file>           SQLite DB path, default <root>/data/hermes-mobile.sqlite3",
        "  --write               Apply taskGroupMeta.directoryRoute updates",
        "  --reset-state-snapshot",
        "                        With --write, back up and remove <root>/data/state.json",
        "  --sample-limit <n>    Maximum samples in JSON output, default 20",
        "  --json                Print bounded JSON metadata",
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

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch (_) {
    return fallback;
  }
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "").replace(/\\/g, "/");
  if (!text) return "";
  const cleanRoot = String(root || DEFAULT_ROOT).replace(/\\/g, "/").replace(/\/+$/, "");
  return text
    .replace(`${cleanRoot}/data/drive/users/`, "$DRIVE/users/")
    .replace(cleanRoot, "<root>");
}

function routeHasPath(route) {
  return Boolean(route && typeof route === "object" && String(route.path || route.root || "").trim());
}

function normalizeRoute(route) {
  if (!route || typeof route !== "object" || Array.isArray(route)) return null;
  const out = {
    label: String(route.label || route.name || "").trim(),
    projectId: String(route.projectId || route.project_id || "").trim(),
    subprojectId: String(route.subprojectId || route.subproject_id || "").trim(),
    root: String(route.root || "").trim(),
    path: String(route.path || route.root || "").trim(),
  };
  if (!out.root && out.path) out.root = out.path;
  return routeHasPath(out) ? out : null;
}

function routePathExists(route) {
  const routePath = String(route?.path || route?.root || "").trim();
  if (!routePath) return false;
  if (!routePath.startsWith("/") && !path.isAbsolute(routePath) && !/^[A-Za-z]:[\\/]/.test(routePath)) return true;
  try {
    return fs.existsSync(routePath);
  } catch (_) {
    return false;
  }
}

function routeFromMessage(row) {
  const direct = normalizeRoute(parseJson(row.directory_route_json, null));
  if (direct && routePathExists(direct)) return direct;
  const aliases = parseJson(row.directory_aliases_json, []);
  if (Array.isArray(aliases)) {
    for (const alias of aliases) {
      const route = normalizeRoute(alias);
      if (route && routePathExists(route)) return route;
    }
  }
  return null;
}

function routeComplete(route) {
  return routeHasPath(route);
}

function copyIfExists(file, backupDir) {
  if (!fs.existsSync(file)) return "";
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, path.basename(file));
  fs.copyFileSync(file, target);
  return target;
}

function backupDatabaseFiles(dbPath, root, stamp) {
  const backupDir = path.join(root, "data", "backups", `task-directory-route-backfill-${stamp}`);
  const backups = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const copied = copyIfExists(`${dbPath}${suffix}`, backupDir);
    if (copied) backups.push(compactPath(copied, root));
  }
  return backups;
}

function resetStateSnapshot(root, stamp) {
  const statePath = path.join(root, "data", "state.json");
  if (!fs.existsSync(statePath)) return null;
  const backupDir = path.join(root, "data", "backups", `task-directory-route-backfill-${stamp}`);
  const backupPath = copyIfExists(statePath, backupDir);
  fs.rmSync(statePath, { force: true });
  return {
    removed: true,
    backupPath: compactPath(backupPath, root),
  };
}

function latestRoutesByThreadTask(db) {
  const rows = db.prepare(`
    SELECT id, thread_id, task_group_id, directory_route_json, directory_aliases_json, updated_at
    FROM messages
    WHERE COALESCE(task_group_id, '') <> ''
      AND COALESCE(task_group_id, '') NOT IN ('chat', 'group-chat', 'weixin-chat')
      AND (COALESCE(directory_route_json, '') <> '' OR COALESCE(directory_aliases_json, '') <> '')
    ORDER BY updated_at DESC
  `).all();
  const routes = new Map();
  for (const row of rows) {
    const threadId = String(row.thread_id || "").trim();
    const taskGroupId = String(row.task_group_id || "").trim();
    if (!threadId || !taskGroupId) continue;
    const key = `${threadId}\0${taskGroupId}`;
    if (routes.has(key)) continue;
    const route = routeFromMessage(row);
    if (route) {
      routes.set(key, {
        route,
        messageId: String(row.id || ""),
        updatedAt: String(row.updated_at || ""),
      });
    }
  }
  return routes;
}

function backfill(options) {
  const db = new DatabaseSync(options.dbPath, { open: true, readOnly: !options.write });
  const samples = [];
  const skipped = { noMeta: 0, existingRoute: 0, noMessageRoute: 0 };
  const stats = {
    scannedThreads: 0,
    scannedTaskGroups: 0,
    candidateTaskGroups: 0,
    changedThreads: 0,
    changedTaskGroups: 0,
  };
  const changedRows = [];
  try {
    const routes = latestRoutesByThreadTask(db);
    const threads = db.prepare(`
      SELECT id, workspace_id, title, task_group_meta_json, raw_json
      FROM threads
      WHERE COALESCE(task_group_meta_json, '') <> ''
      ORDER BY updated_at DESC
    `).all();
    for (const thread of threads) {
      stats.scannedThreads += 1;
      const meta = parseJson(thread.task_group_meta_json, {});
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
        skipped.noMeta += 1;
        continue;
      }
      let changed = false;
      const raw = parseJson(thread.raw_json, null);
      for (const [taskGroupId, value] of Object.entries(meta)) {
        stats.scannedTaskGroups += 1;
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        if (routeComplete(value.directoryRoute)) {
          skipped.existingRoute += 1;
          continue;
        }
        const key = `${thread.id}\0${taskGroupId}`;
        const candidate = routes.get(key);
        if (!candidate?.route) {
          skipped.noMessageRoute += 1;
          continue;
        }
        stats.candidateTaskGroups += 1;
        meta[taskGroupId] = Object.assign({}, value, { directoryRoute: candidate.route });
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const rawMeta = raw.taskGroupMeta && typeof raw.taskGroupMeta === "object" && !Array.isArray(raw.taskGroupMeta)
            ? raw.taskGroupMeta
            : {};
          rawMeta[taskGroupId] = Object.assign({}, rawMeta[taskGroupId] || {}, meta[taskGroupId]);
          raw.taskGroupMeta = rawMeta;
        }
        changed = true;
        stats.changedTaskGroups += 1;
        if (samples.length < options.sampleLimit) {
          samples.push({
            threadId: thread.id,
            workspaceId: thread.workspace_id,
            taskGroupId,
            title: String(value.title || "").slice(0, 80),
            messageId: candidate.messageId,
            route: {
              label: candidate.route.label,
              projectId: candidate.route.projectId,
              subprojectId: candidate.route.subprojectId,
              path: compactPath(candidate.route.path || candidate.route.root, options.root),
            },
          });
        }
      }
      if (changed) {
        stats.changedThreads += 1;
        changedRows.push({
          id: thread.id,
          taskGroupMetaJson: JSON.stringify(meta),
          rawJson: raw && typeof raw === "object" && !Array.isArray(raw) ? JSON.stringify(raw) : thread.raw_json,
        });
      }
    }
    let backups = [];
    let stateSnapshot = null;
    if (options.write && changedRows.length) {
      const stamp = timestamp();
      backups = backupDatabaseFiles(options.dbPath, options.root, stamp);
      db.exec("BEGIN IMMEDIATE");
      try {
        const update = db.prepare("UPDATE threads SET task_group_meta_json = ?, raw_json = ? WHERE id = ?");
        for (const row of changedRows) update.run(row.taskGroupMetaJson, row.rawJson, row.id);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch (_) {}
        throw error;
      }
      if (options.resetStateSnapshot) stateSnapshot = resetStateSnapshot(options.root, stamp);
    }
    return {
      ok: true,
      mode: options.write ? "write" : "dry-run",
      wrote: Boolean(options.write && changedRows.length),
      changed: changedRows.length > 0,
      dbPath: compactPath(options.dbPath, options.root),
      stats,
      skipped,
      backups,
      stateSnapshot,
      samples,
    };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = backfill(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`ok=${result.ok} changed=${result.changed} changedTaskGroups=${result.stats.changedTaskGroups}`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  backfill,
  compactPath,
  normalizeRoute,
  parseArgs,
  routeFromMessage,
};
