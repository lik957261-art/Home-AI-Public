#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveCodexMobileProfileRuntime } = require("./codex-mobile-profile-runtime");

const DEFAULT_MAC_ROOT = "/Users/example/path";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT,
    codexHome: "",
    profileFile: process.env.CODEX_MOBILE_PROFILE_FILE || "/Users/example/path",
    serviceUser: process.env.CODEX_MOBILE_SERVICE_USER || "xuxin",
    sharedAuthFile: "",
    backupDir: "",
    execute: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--codex-home") out.codexHome = argv[++index] || "";
    else if (arg === "--profile-file") out.profileFile = argv[++index] || "";
    else if (arg === "--service-user") out.serviceUser = argv[++index] || out.serviceUser;
    else if (arg === "--shared-auth-file") out.sharedAuthFile = argv[++index] || "";
    else if (arg === "--backup-dir") out.backupDir = argv[++index] || "";
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage:",
        "  node scripts/sync-openai-codex-shared-auth-from-codex-home.js --execute --json",
        "",
        "Copies the active Codex Home token block into Hermes shared-auth format.",
        "Raw token values are never printed.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = path.resolve(out.root);
  if (!out.sharedAuthFile) {
    out.sharedAuthFile = path.join(out.root, "gateway-worker", "telemetry", "profiles", "shared-auth", "auth.json");
  }
  if (!out.backupDir) {
    out.backupDir = path.join(out.root, "backups", "auth-repair");
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  let currentStat = null;
  try {
    currentStat = fs.statSync(filePath);
  } catch (_) {}
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (currentStat) {
    try {
      fs.chownSync(tmp, currentStat.uid, currentStat.gid);
    } catch (_) {}
    fs.chmodSync(tmp, currentStat.mode & 0o777);
  }
  fs.renameSync(tmp, filePath);
  if (currentStat) {
    try {
      fs.chownSync(filePath, currentStat.uid, currentStat.gid);
    } catch (_) {}
    fs.chmodSync(filePath, currentStat.mode & 0o777);
  }
}

function requiredToken(source, key) {
  const value = source?.tokens?.[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`codex_home_auth_missing_${key}`);
  return value;
}

function resolveSource(options) {
  if (options.codexHome) {
    return {
      codexHome: path.resolve(options.codexHome),
      source: "argument",
      activeProfileId: "",
      profileFile: options.profileFile || "",
    };
  }
  return resolveCodexMobileProfileRuntime({
    serviceUser: options.serviceUser,
    profileFile: options.profileFile,
  });
}

function syncDoc(target, source, sourceInfo, now) {
  const accessToken = requiredToken(source, "access_token");
  const refreshToken = requiredToken(source, "refresh_token");
  const tokens = Object.assign({}, source.tokens || {});
  const authMode = source.auth_mode || target?.providers?.["openai-codex"]?.auth_mode || "chatgpt";
  const lastRefresh = source.last_refresh || now;
  const next = target && typeof target === "object" && !Array.isArray(target) ? target : {};
  next.version = next.version || 1;
  next.updated_at = now;
  next.providers = next.providers && typeof next.providers === "object" && !Array.isArray(next.providers)
    ? next.providers
    : {};
  next.providers["openai-codex"] = Object.assign({}, next.providers["openai-codex"] || {}, {
    auth_mode: authMode,
    tokens,
    last_refresh: lastRefresh,
  });
  next.credential_pool = next.credential_pool && typeof next.credential_pool === "object" && !Array.isArray(next.credential_pool)
    ? next.credential_pool
    : {};
  const pool = Array.isArray(next.credential_pool["openai-codex"])
    ? next.credential_pool["openai-codex"]
    : [];
  const entry = Object.assign({
    id: "codex-home-active-profile",
    label: "Codex Home active profile",
    auth_type: authMode,
    priority: 0,
  }, pool[0] || {});
  entry.auth_type = entry.auth_type || authMode;
  entry.source = "codex-home-active-profile";
  entry.access_token = accessToken;
  entry.refresh_token = refreshToken;
  if (typeof tokens.id_token === "string") entry.id_token = tokens.id_token;
  if (typeof tokens.account_id === "string") entry.account_id = tokens.account_id;
  entry.last_refresh = lastRefresh;
  entry.last_error_code = null;
  entry.last_error_reason = null;
  entry.last_error_message = null;
  entry.last_error_reset_at = null;
  entry.codex_home_source = sourceInfo.source || "";
  entry.codex_profile_active_id = sourceInfo.activeProfileId || "";
  next.credential_pool["openai-codex"] = [entry, ...pool.slice(1)];
  return {
    doc: next,
    summary: {
      provider: "openai-codex",
      codexHome: sourceInfo.codexHome,
      codexHomeSource: sourceInfo.source || "",
      codexProfileActiveId: sourceInfo.activeProfileId || "",
      authMode,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      targetPoolSize: next.credential_pool["openai-codex"].length,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceInfo = resolveSource(options);
  const sourceAuthFile = path.join(sourceInfo.codexHome, "auth.json");
  const source = readJson(sourceAuthFile);
  const target = readJson(options.sharedAuthFile);
  const now = new Date().toISOString();
  const { doc, summary } = syncDoc(target, source, sourceInfo, now);
  let backupPath = "";
  if (options.execute) {
    fs.mkdirSync(options.backupDir, { recursive: true, mode: 0o700 });
    backupPath = path.join(options.backupDir, `${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-openai-codex-shared-auth.json`);
    fs.copyFileSync(options.sharedAuthFile, backupPath);
    fs.chmodSync(backupPath, 0o600);
    writeJsonAtomic(options.sharedAuthFile, doc);
  }
  const payload = {
    ok: true,
    mode: options.execute ? "execute" : "plan",
    sharedAuthFile: options.sharedAuthFile,
    sourceAuthFile,
    backupPath,
    updated: Boolean(options.execute),
    summary,
  };
  if (options.json || !options.execute) console.log(JSON.stringify(payload, null, 2));
  else console.log(`synced openai-codex shared auth from ${sourceInfo.codexHome}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  resolveSource,
  syncDoc,
};
