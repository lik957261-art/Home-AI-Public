"use strict";

const fs = require("node:fs");

const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_BASE = "http://127.0.0.1:8797";
const AUTH_HEADER = "X-Hermes-Web-Key";
const PLUGIN_FOLDERS = Object.freeze(["衣橱", "记账", "邮箱", "健康", "笔记"]);

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    base: process.env.HERMES_MOBILE_SMOKE_BASE || DEFAULT_BASE,
    accessKeyFile: "",
    timeoutMs: 15000,
    workspaces: [],
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--access-key-file" || arg === "--key-file") out.accessKeyFile = argv[++index] || out.accessKeyFile;
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--workspace") out.workspaces.push(argv[++index] || "");
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-plugin-directory-production-smoke.js [options]",
        "  --root <dir>              Mac production root, default /Users/example/path",
        "  --base <url>              Home AI origin, default http://127.0.0.1:8797",
        "  --access-key-file <file>  Owner Web key file; path and contents are not printed",
        "  --workspace <id>          Optional workspace filter; may be repeated",
        "  --timeout-ms <n>          HTTP timeout, default 15000",
        "  --json                    Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  out.base = String(out.base || DEFAULT_BASE).replace(/\/+$/, "");
  out.accessKeyFile = out.accessKeyFile || `${out.root}/data/secrets/owner-web-key.secret`;
  out.workspaces = out.workspaces.map((item) => String(item || "").trim()).filter(Boolean);
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 15000;
  return out;
}

function readAccessKey(filePath) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    throw new Error("macos_plugin_directory_smoke_key_file_unreadable");
  }
  const key = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!key) throw new Error("macos_plugin_directory_smoke_key_file_empty");
  return key;
}

async function fetchJson(url, options, body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const payload = body ? JSON.stringify(body) : null;
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: Object.assign({}, options.headers || {}, payload ? {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(payload)),
      } : {}),
      body: payload,
      signal: controller.signal,
    });
    let json = {};
    try {
      json = await response.json();
    } catch (_err) {}
    return { status: response.status, ok: response.ok, json };
  } catch (err) {
    return { status: 0, ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function pluginJoin(basePath, ...segments) {
  const root = String(basePath || "").replace(/[\\/]+$/g, "");
  return [
    root,
    ...segments.map((item) => String(item || "").replace(/^[\\/]+|[\\/]+$/g, "")),
  ].filter(Boolean).join(root.includes("\\") ? "\\" : "/");
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "");
  if (!text) return "";
  const driveRoot = `${String(root || DEFAULT_ROOT).replace(/\/+$/, "")}/data/drive`;
  const mappings = [
    [driveRoot, "$DRIVE"],
    ["/mnt/c/ProgramData/HermesMobile/data/drive", "$WINDOWS_WSL_DRIFT"],
    ["C:\\ProgramData\\HermesMobile\\data\\drive", "$WINDOWS_DRIFT"],
    ["C:/ProgramData/HermesMobile/data/drive", "$WINDOWS_DRIFT"],
  ];
  for (const [prefix, replacement] of mappings) {
    if (text.startsWith(prefix)) return `${replacement}${text.slice(prefix.length).replace(/\\/g, "/")}`;
  }
  return text.replace(/\\/g, "/").split("/").filter(Boolean).slice(-4).join("/");
}

function compactError(value, root = DEFAULT_ROOT) {
  const text = String(value || "").trim();
  if (!text) return "";
  const driveRoot = `${String(root || DEFAULT_ROOT).replace(/\/+$/, "")}/data/drive`;
  return text
    .split(driveRoot).join("$DRIVE")
    .split(String(root || DEFAULT_ROOT)).join("<HERMES_MOBILE_ROOT>")
    .split("/mnt/c/ProgramData/HermesMobile/data/drive").join("$WINDOWS_WSL_DRIFT")
    .split("C:\\ProgramData\\HermesMobile\\data\\drive").join("$WINDOWS_DRIFT")
    .split("C:/ProgramData/HermesMobile/data/drive").join("$WINDOWS_DRIFT")
    .replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9._-]{12,}\b/g, "<redacted-token>")
    .slice(0, 500);
}

function mutationOk(result) {
  return result.status === 201 || result.status === 409;
}

function workspaceBasePath(workspace, projects) {
  return String(workspace?.defaultWorkspace || projects.find((item) => item.id === "general")?.root || "").trim();
}

async function run(options) {
  const key = readAccessKey(options.accessKeyFile);
  const headers = { [AUTH_HEADER]: key };
  const workspaceFilter = new Set(options.workspaces);
  const workspacesResult = await fetchJson(`${options.base}/api/workspaces`, { headers, timeoutMs: options.timeoutMs });
  const workspaces = (workspacesResult.json?.data || [])
    .filter((workspace) => !workspaceFilter.size || workspaceFilter.has(String(workspace.id || "")));
  const rows = [];

  for (const workspace of workspaces) {
    const workspaceId = String(workspace.id || "");
    const projectsResult = await fetchJson(
      `${options.base}/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
      { headers, timeoutMs: options.timeoutMs },
    );
    const projects = Array.isArray(projectsResult.json?.data) ? projectsResult.json.data.filter((item) => !item.hidden) : [];
    const singleResult = await fetchJson(
      `${options.base}/api/single-window`,
      { method: "POST", headers, timeoutMs: options.timeoutMs },
      { workspaceId },
    );
    const threadId = singleResult.json?.thread?.id || "";
    const basePath = workspaceBasePath(workspace, projects);
    const row = {
      workspaceId,
      label: workspace.label || workspaceId,
      projectsStatus: projectsResult.status,
      projectCount: projects.length,
      singleWindowStatus: singleResult.status,
      hasThread: Boolean(threadId),
      base: compactPath(basePath, options.root),
      rootCreate: null,
      pluginCreates: [],
      preview: null,
      ok: false,
    };

    if (threadId && basePath) {
      const rootCreate = await fetchJson(
        `${options.base}/api/directories/create`,
        { method: "POST", headers, timeoutMs: options.timeoutMs },
        { threadId, path: basePath, name: "插件" },
      );
      row.rootCreate = {
        status: rootCreate.status,
        ok: mutationOk(rootCreate),
        error: compactError(rootCreate.json?.error || rootCreate.error || "", options.root),
      };
      const pluginRoot = pluginJoin(basePath, "插件");
      for (const folder of PLUGIN_FOLDERS) {
        const create = await fetchJson(
          `${options.base}/api/directories/create`,
          { method: "POST", headers, timeoutMs: options.timeoutMs },
          { threadId, path: pluginRoot, name: folder },
        );
        row.pluginCreates.push({
          folder,
          status: create.status,
          ok: mutationOk(create),
          error: compactError(create.json?.error || create.error || "", options.root),
        });
      }
      const preview = await fetchJson(
        `${options.base}/api/directories/preview?threadId=${encodeURIComponent(threadId)}&path=${encodeURIComponent(pluginRoot)}`,
        { headers, timeoutMs: options.timeoutMs },
      );
      const names = Array.isArray(preview.json?.entries)
        ? preview.json.entries.map((item) => item.name).filter((name) => PLUGIN_FOLDERS.includes(name)).sort()
        : [];
      row.preview = {
        status: preview.status,
        entryCount: preview.json?.entryCount ?? null,
        names,
        error: compactError(preview.json?.error || preview.error || "", options.root),
      };
    }

    row.ok = Boolean(
      row.hasThread
      && row.base
      && row.rootCreate?.ok
      && row.pluginCreates.length === PLUGIN_FOLDERS.length
      && row.pluginCreates.every((item) => item.ok)
      && row.preview?.status === 200
      && row.preview.names.length === PLUGIN_FOLDERS.length
    );
    rows.push(row);
  }

  return {
    ok: Boolean(workspacesResult.ok) && rows.length > 0 && rows.every((row) => row.ok),
    authHeader: AUTH_HEADER,
    workspaceCount: rows.length,
    pluginFolders: [...PLUGIN_FOLDERS],
    rows,
  };
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    try {
      const summary = await run(options);
      if (options.json) console.log(JSON.stringify(summary, null, 2));
      else console.log(`ok=${summary.ok} workspaceCount=${summary.workspaceCount}`);
      if (!summary.ok) process.exit(1);
    } catch (err) {
      console.error(compactError(err?.message || String(err), DEFAULT_ROOT));
      process.exit(1);
    }
  })();
}

module.exports = {
  AUTH_HEADER,
  PLUGIN_FOLDERS,
  compactError,
  compactPath,
  parseArgs,
  run,
};
