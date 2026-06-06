"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_BASE = "http://127.0.0.1:8797";
const DEFAULT_EXPECTED_ORIGIN = "http://127.0.0.1:8765";
const DEFAULT_LEGACY_ORIGIN = "http://192.168.10.99:8765";
const AUTH_HEADER = "X-Hermes-Web-Key";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    base: process.env.HERMES_MOBILE_SMOKE_BASE || DEFAULT_BASE,
    accessKeyFile: "",
    expectedOrigin: process.env.HERMES_MOBILE_WARDROBE_EXPECTED_ORIGIN || DEFAULT_EXPECTED_ORIGIN,
    legacyOrigin: process.env.HERMES_MOBILE_WARDROBE_LEGACY_ORIGIN || DEFAULT_LEGACY_ORIGIN,
    workspaces: [],
    minItemCount: 1,
    timeoutMs: 15000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--access-key-file" || arg === "--key-file") out.accessKeyFile = argv[++index] || out.accessKeyFile;
    else if (arg === "--expected-origin") out.expectedOrigin = argv[++index] || out.expectedOrigin;
    else if (arg === "--legacy-origin") out.legacyOrigin = argv[++index] || out.legacyOrigin;
    else if (arg === "--workspace") out.workspaces.push(argv[++index] || "");
    else if (arg === "--min-item-count") out.minItemCount = Number(argv[++index] || out.minItemCount);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-wardrobe-binding-production-smoke.js [options]",
        "  --root <dir>              Mac production root, default /Users/hermes-host/HermesMobile",
        "  --base <url>              Home AI origin, default http://127.0.0.1:8797",
        "  --access-key-file <file>  Owner Web key file; path and contents are not printed",
        "  --expected-origin <url>   Expected Wardrobe plugin origin, default http://127.0.0.1:8765",
        "  --legacy-origin <url>     Legacy origin that must not appear in live bindings",
        "  --workspace <id>          Workspace to launch through Home proxy; may be repeated",
        "  --min-item-count <n>      Minimum bootstrap item_count for launched workspaces, default 1",
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
  out.expectedOrigin = String(out.expectedOrigin || DEFAULT_EXPECTED_ORIGIN).replace(/\/+$/, "");
  out.legacyOrigin = String(out.legacyOrigin || DEFAULT_LEGACY_ORIGIN).replace(/\/+$/, "");
  out.accessKeyFile = out.accessKeyFile || path.posix.join(out.root, "data", "secrets", "owner-web-key.secret");
  out.workspaces = out.workspaces.map((item) => String(item || "").trim()).filter(Boolean);
  if (!out.workspaces.length) out.workspaces = ["weixin_wuping"];
  if (!Number.isFinite(out.minItemCount) || out.minItemCount < 0) out.minItemCount = 1;
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 15000;
  return out;
}

function readAccessKey(filePath) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    throw new Error("macos_wardrobe_binding_smoke_key_file_unreadable");
  }
  const key = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!key) throw new Error("macos_wardrobe_binding_smoke_key_file_empty");
  return key;
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "").replace(/\\/g, "/");
  const normalizedRoot = String(root || DEFAULT_ROOT).replace(/\/+$/, "");
  return text.startsWith(normalizedRoot)
    ? `<HERMES_MOBILE_ROOT>${text.slice(normalizedRoot.length)}`
    : text.split("/").filter(Boolean).slice(-6).join("/");
}

function compactUrl(value = "") {
  try {
    const parsed = new URL(String(value || ""), DEFAULT_BASE);
    return {
      origin: parsed.origin,
      path: parsed.pathname,
      searchKeys: [...parsed.searchParams.keys()].sort(),
      hasLaunchParam: parsed.searchParams.has("launch"),
    };
  } catch (_err) {
    return { origin: "", path: "", searchKeys: [], hasLaunchParam: false };
  }
}

function absoluteUrl(value, base = DEFAULT_BASE) {
  try {
    return new URL(String(value || ""), base).toString();
  } catch (_err) {
    return "";
  }
}

function findWardrobeConfigs(root) {
  const base = path.posix.join(root, "data", "drive", "users");
  const rows = [];
  function walk(dir, depth) {
    if (depth > 10) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".hermes-cache") continue;
      const current = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".hermes-wardrobe") {
          const configPath = path.posix.join(current, "config.json");
          if (fs.existsSync(configPath)) rows.push(configPath);
          continue;
        }
        walk(current, depth + 1);
      }
    }
  }
  walk(base, 0);
  return rows;
}

function readWardrobeBindingRows(options) {
  return findWardrobeConfigs(options.root).map((configPath) => {
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (err) {
      return {
        path: compactPath(configPath, options.root),
        configReadable: false,
        error: String(err?.message || err).slice(0, 160),
        ok: false,
      };
    }
    const keyPath = path.posix.join(path.posix.dirname(configPath), "access-key.txt");
    let keyShape = { present: false, prefixOk: false };
    try {
      const key = fs.readFileSync(keyPath, "utf8").trim();
      keyShape = { present: Boolean(key), prefixOk: key.startsWith("wd_live_") };
    } catch (_err) {}
    const apiBaseUrl = String(config.api_base_url || config.apiBaseUrl || "");
    const legacyOriginPresent = Boolean(options.legacyOrigin && apiBaseUrl.includes(options.legacyOrigin));
    return {
      path: compactPath(configPath, options.root),
      configReadable: true,
      workspaceId: String(config.workspace_id || config.workspaceId || ""),
      hermesWorkspaceId: String(config.hermes_workspace_id || config.hermesWorkspaceId || ""),
      apiBaseOrigin: compactUrl(apiBaseUrl).origin,
      keyShape,
      legacyOriginPresent,
      ok: keyShape.present && keyShape.prefixOk && !legacyOriginPresent,
    };
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    let json = {};
    try {
      json = await response.json();
    } catch (_err) {}
    return { status: response.status, ok: response.ok, json, headers: response.headers };
  } catch (err) {
    return { status: 0, ok: false, json: {}, error: String(err?.message || err).slice(0, 160), headers: null };
  }
}

async function fetchText(url, options = {}, timeoutMs = 15000) {
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, ok: response.ok, bytes: buffer.length, contentType: response.headers.get("content-type") || "", headers: response.headers };
  } catch (err) {
    return { status: 0, ok: false, bytes: 0, contentType: "", error: String(err?.message || err).slice(0, 160), headers: null };
  }
}

function cookiePairsFromHeaders(headers) {
  if (!headers) return "";
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  return values
    .flatMap((value) => String(value || "").split(/,\s*(?=[^=;,]+=)/))
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean);
}

function mergeCookieHeader(current = "", pairs = []) {
  const merged = new Map();
  for (const pair of String(current || "").split(";").map((item) => item.trim()).filter(Boolean)) {
    const name = pair.split("=")[0];
    if (name) merged.set(name, pair);
  }
  for (const pair of pairs || []) {
    const name = String(pair || "").split("=")[0];
    if (name) merged.set(name, pair);
  }
  return [...merged.values()].join("; ");
}

function setCookieHeader(headers) {
  return cookiePairsFromHeaders(headers).join("; ");
}

async function fetchTextWithCookies(url, options = {}, timeoutMs = 15000) {
  let currentUrl = url;
  let cookieHeader = "";
  for (let index = 0; index < 5; index += 1) {
    const headers = Object.assign({}, options.headers || {}, cookieHeader ? { Cookie: cookieHeader } : {});
    const response = await fetchWithTimeout(currentUrl, Object.assign({}, options, {
      headers,
      redirect: "manual",
    }), timeoutMs);
    cookieHeader = mergeCookieHeader(cookieHeader, cookiePairsFromHeaders(response.headers));
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      currentUrl = absoluteUrl(response.headers.get("location"), currentUrl);
      if (!currentUrl) break;
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      ok: response.ok,
      bytes: buffer.length,
      contentType: response.headers.get("content-type") || "",
      headers: response.headers,
      cookieHeader,
    };
  }
  return { status: 0, ok: false, bytes: 0, contentType: "", headers: null, cookieHeader, error: "redirect_limit_exceeded" };
}

async function smokeWorkspace(workspaceId, key, options) {
  const headers = { [AUTH_HEADER]: key, Accept: "application/json" };
  const manifestUrl = `${options.base}/api/hermes-plugins/wardrobe/manifest?workspaceId=${encodeURIComponent(workspaceId)}&appOrigin=${encodeURIComponent(options.base)}`;
  const manifest = await fetchJson(manifestUrl, { headers }, options.timeoutMs);
  const entryUrl = manifest.json?.entry?.url || manifest.json?.embed?.url || "";
  const entryAbsoluteUrl = absoluteUrl(entryUrl, options.base);
  const entry = entryAbsoluteUrl
    ? await fetchTextWithCookies(entryAbsoluteUrl, { headers: { [AUTH_HEADER]: key } }, options.timeoutMs)
    : { status: 0, ok: false, bytes: 0, contentType: "", headers: null };
  const cookie = entry.cookieHeader || setCookieHeader(entry.headers);
  const bootstrapHeaders = Object.assign({}, headers, cookie ? { Cookie: cookie } : {});
  const bootstrap = await fetchJson(
    `${options.base}/api/hermes-plugins/wardrobe/proxy/api/bootstrap-status?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers: bootstrapHeaders },
    options.timeoutMs,
  );
  const itemCount = Number(bootstrap.json?.item_count ?? -1);
  const row = {
    workspaceId,
    manifest: {
      status: manifest.status,
      available: Boolean(manifest.json?.available),
      tokenStatus: manifest.json?.embed?.tokenStatus || "",
      programApiOrigin: manifest.json?.programApi?.origin || "",
      entry: compactUrl(entryUrl),
    },
    entry: {
      status: entry.status,
      bytes: entry.bytes,
      contentType: entry.contentType,
      error: entry.error || "",
    },
    bootstrap: {
      status: bootstrap.status,
      itemCount,
      error: bootstrap.error || bootstrap.json?.error || "",
    },
  };
  row.ok = Boolean(
    manifest.ok
    && row.manifest.available
    && row.manifest.tokenStatus === "launch_token_issued"
    && row.manifest.programApiOrigin === options.expectedOrigin
    && row.manifest.entry.hasLaunchParam
    && entry.ok
    && entry.bytes > 0
    && bootstrap.ok
    && itemCount >= options.minItemCount
  );
  return row;
}

async function run(options) {
  const key = readAccessKey(options.accessKeyFile);
  const bindingRows = readWardrobeBindingRows(options);
  const workspaceRows = [];
  for (const workspaceId of options.workspaces) {
    workspaceRows.push(await smokeWorkspace(workspaceId, key, options));
  }
  return {
    ok: bindingRows.length > 0 && bindingRows.every((row) => row.ok) && workspaceRows.every((row) => row.ok),
    authHeader: AUTH_HEADER,
    expectedOrigin: options.expectedOrigin,
    legacyOrigin: options.legacyOrigin,
    bindingCount: bindingRows.length,
    bindings: bindingRows,
    workspaces: workspaceRows,
  };
}

if (require.main === module) {
  (async () => {
    try {
      const options = parseArgs(process.argv.slice(2));
      const result = await run(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`ok=${result.ok} bindingCount=${result.bindingCount} workspaceCount=${result.workspaces.length}`);
      }
      if (!result.ok) process.exit(1);
    } catch (err) {
      console.error(String(err?.message || err));
      process.exit(1);
    }
  })();
}

module.exports = {
  AUTH_HEADER,
  compactPath,
  compactUrl,
  parseArgs,
  readWardrobeBindingRows,
  run,
  setCookieHeader,
  mergeCookieHeader,
  cookiePairsFromHeaders,
  absoluteUrl,
};
