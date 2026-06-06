"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dbPath: "",
    base: process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    accessKeyFile: process.env.HERMES_WEB_AUTH_KEY_PATH || "",
    workspaceId: process.env.HERMES_MOBILE_SMOKE_WORKSPACE || "owner",
    includeChat: false,
    limit: 1000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--db") out.dbPath = argv[++index] || out.dbPath;
    else if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--access-key-file") out.accessKeyFile = argv[++index] || out.accessKeyFile;
    else if (arg === "--workspace") out.workspaceId = argv[++index] || out.workspaceId;
    else if (arg === "--include-chat") out.includeChat = true;
    else if (arg === "--limit") out.limit = Number(argv[++index] || out.limit);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-bound-directory-preview-smoke.js [options]",
        "  --root <dir>             Mac production root",
        "  --db <file>              SQLite DB path, default <root>/data/hermes-mobile.sqlite3",
        "  --base <url>             Hermes Mobile base URL",
        "  --access-key-file <file> Access key file; key contents are never printed",
        "  --workspace <id>         Workspace to inspect, default owner",
        "  --include-chat           Also test chat/group-chat directory references",
        "  --limit <n>              Maximum unique bound paths to test",
        "  --json                   Print bounded JSON evidence",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  if (!out.dbPath) out.dbPath = path.join(out.root, "data", "hermes-mobile.sqlite3");
  out.base = String(out.base || "http://127.0.0.1:8797").replace(/\/+$/, "");
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 1000;
  return out;
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "").replace(/\\/g, "/");
  if (!text) return "";
  const cleanRoot = String(root || DEFAULT_ROOT).replace(/\\/g, "/").replace(/\/+$/, "");
  return text
    .replace(`${cleanRoot}/data/drive/users/`, "$DRIVE/users/")
    .replace(cleanRoot, "<root>");
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch (_) {
    return fallback;
  }
}

function addRoute(target, route, source, row, root) {
  if (!route || typeof route !== "object") return;
  const routePath = String(route.path || route.root || "").trim();
  if (!routePath || !routePath.replace(/\\/g, "/").startsWith(root.replace(/\\/g, "/"))) return;
  const key = routePath.replace(/\\/g, "/");
  if (!target.has(key)) {
    target.set(key, {
      path: routePath,
      label: String(route.label || ""),
      projectId: String(route.projectId || ""),
      subprojectId: String(route.subprojectId || ""),
      count: 0,
      examples: [],
    });
  }
  const item = target.get(key);
  item.count += 1;
  if (item.examples.length < 3) {
    item.examples.push({
      messageId: row.id,
      taskGroupId: row.task_group_id || "",
      source,
    });
  }
}

function collectBoundDirectoryPaths(options) {
  const db = new DatabaseSync(options.dbPath, { open: true, readOnly: true });
  try {
    const chatFilter = options.includeChat
      ? ""
      : "AND COALESCE(m.task_group_id, '') NOT IN ('chat', 'group-chat')";
    const rows = db.prepare(`
      SELECT m.id, m.task_group_id, m.directory_route_json, m.directory_aliases_json
      FROM messages m
      LEFT JOIN threads t ON t.id = m.thread_id
      WHERE t.workspace_id = ?
        ${chatFilter}
        AND (COALESCE(m.directory_route_json, '') <> '' OR COALESCE(m.directory_aliases_json, '') <> '')
      ORDER BY m.updated_at DESC
    `).all(options.workspaceId);
    const paths = new Map();
    for (const row of rows) {
      addRoute(paths, parseJson(row.directory_route_json, null), "route", row, options.root);
      const aliases = parseJson(row.directory_aliases_json, []);
      if (Array.isArray(aliases)) {
        for (const alias of aliases) addRoute(paths, alias, "alias", row, options.root);
      }
    }
    return [...paths.values()].slice(0, options.limit);
  } finally {
    db.close();
  }
}

function readAccessKey(options) {
  const candidates = [
    options.accessKeyFile,
    path.join(options.root, "data", "secrets", "owner-web-key.secret"),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    } catch (_) {}
  }
  return "";
}

async function api(options, apiPath, requestOptions = {}) {
  const headers = Object.assign({}, requestOptions.headers || {});
  if (options.accessKey) headers["X-Hermes-Web-Key"] = options.accessKey;
  if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${options.base}${apiPath}`, Object.assign({}, requestOptions, { headers }));
  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {}
  return { response, payload };
}

async function smoke(options) {
  const normalized = Object.assign({}, options, { accessKey: readAccessKey(options) });
  if (!normalized.accessKey) throw new Error("Missing access key. Use --access-key-file or HERMES_WEB_AUTH_KEY_PATH.");
  const single = await api(normalized, "/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: normalized.workspaceId }),
  });
  const threadId = String(single.payload?.thread?.id || "");
  if (!single.response.ok || !threadId) throw new Error("Could not resolve directory smoke thread.");
  const boundPaths = collectBoundDirectoryPaths(normalized);
  const failures = [];
  let okCount = 0;
  for (const item of boundPaths) {
    const params = new URLSearchParams({ threadId, path: item.path });
    const result = await api(normalized, `/api/directories/preview?${params.toString()}`);
    if (result.response.ok) {
      okCount += 1;
      continue;
    }
    failures.push({
      label: item.label,
      projectId: item.projectId,
      subprojectId: item.subprojectId,
      path: compactPath(item.path, normalized.root),
      count: item.count,
      examples: item.examples,
      status: result.response.status,
      error: result.payload?.error || "",
    });
  }
  return {
    ok: failures.length === 0,
    workspaceId: normalized.workspaceId,
    includeChat: Boolean(normalized.includeChat),
    uniquePaths: boundPaths.length,
    okCount,
    failed: failures.length,
    failures,
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  smoke(options).then((result) => {
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`ok=${result.ok} uniquePaths=${result.uniquePaths} failed=${result.failed}`);
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  collectBoundDirectoryPaths,
  compactPath,
  parseArgs,
  smoke,
};
