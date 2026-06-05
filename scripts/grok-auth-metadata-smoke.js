"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const out = {
    profileAuthFile: process.env.HERMES_GROK_GATEWAY_AUTH_PATH || "",
    sharedAuthFile: process.env.HERMES_GROK_GATEWAY_SHARED_AUTH_PATH
      || process.env.HERMES_MOBILE_GROK_SHARED_AUTH_PATH
      || process.env.HERMES_WEB_GROK_SHARED_AUTH_PATH
      || "",
    requireAccessToken: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile-auth-file") out.profileAuthFile = argv[++index] || "";
    else if (arg === "--shared-auth-file") out.sharedAuthFile = argv[++index] || "";
    else if (arg === "--require-access-token") out.requireAccessToken = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/grok-auth-metadata-smoke.js [options]",
        "  --profile-auth-file <file>   Grok profile auth.json; path is not printed",
        "  --shared-auth-file <file>    Shared auth.json fallback; path is not printed",
        "  --require-access-token       Exit non-zero when no xAI OAuth access_token exists",
        "  --json                       Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function summarizeAuthJson(value) {
  const out = {
    exists: false,
    topLevelKeys: [],
    providerKeys: [],
    credentialPoolKeys: [],
    xai: {
      present: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      hasExpires: false,
    },
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  out.exists = true;
  out.topLevelKeys = Object.keys(value).sort();
  const providers = value.providers && typeof value.providers === "object" && !Array.isArray(value.providers)
    ? value.providers
    : {};
  const pool = value.credential_pool && typeof value.credential_pool === "object" && !Array.isArray(value.credential_pool)
    ? value.credential_pool
    : {};
  out.providerKeys = Object.keys(providers).sort();
  out.credentialPoolKeys = Object.keys(pool).sort();
  const xai = providers["xai-oauth"] || providers.xai_oauth || pool["xai-oauth"] || pool.xai_oauth || {};
  out.xai.present = Boolean(xai && typeof xai === "object" && !Array.isArray(xai) && Object.keys(xai).length);
  out.xai.hasAccessToken = Boolean(xai.access_token || xai.accessToken);
  out.xai.hasRefreshToken = Boolean(xai.refresh_token || xai.refreshToken);
  out.xai.hasExpires = Boolean(xai.expires_at || xai.expiresAt || xai.expires_in || xai.expiresIn);
  return out;
}

function readStore(file) {
  if (!file) return { exists: false, error: "not_configured" };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return summarizeAuthJson(parsed);
  } catch (err) {
    return { exists: false, error: err && err.name ? err.name : "read_failed" };
  }
}

function buildReport(options = {}) {
  const stores = {};
  if (options.profileAuthFile) stores.profileLocal = readStore(options.profileAuthFile);
  if (options.sharedAuthFile) stores.sharedAuth = readStore(options.sharedAuthFile);
  const storeValues = Object.values(stores);
  const anyXaiAccessToken = storeValues.some((store) => Boolean(store?.xai?.hasAccessToken));
  const anyXaiRefreshToken = storeValues.some((store) => Boolean(store?.xai?.hasRefreshToken));
  const anyXaiProvider = storeValues.some((store) => Boolean(store?.xai?.present));
  const report = {
    ok: !options.requireAccessToken || anyXaiAccessToken,
    xai: {
      providerPresent: anyXaiProvider,
      hasAccessToken: anyXaiAccessToken,
      hasRefreshToken: anyXaiRefreshToken,
    },
    stores,
  };
  if (!report.ok) report.error = "grok_xai_oauth_access_token_missing";
  return report;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) {
    const stream = report.ok ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.ok) {
    console.log(`ok xaiProvider=${report.xai.providerPresent} hasAccessToken=${report.xai.hasAccessToken}`);
  } else {
    console.error(report.error || "grok_auth_metadata_smoke_failed");
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  buildReport,
  parseArgs,
  summarizeAuthJson,
};
