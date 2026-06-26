"use strict";

const fs = require("node:fs");

const AUTH_HEADER = "X-Hermes-Web-Key";
const WRONG_AUTH_HEADER = "X-Hermes-Access-Key";

function parseArgs(argv) {
  const out = {
    base: process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    accessKeyFile: process.env.HERMES_WEB_AUTH_KEY_PATH || "",
    expectedVersion: "",
    maxActiveGlobal: 0,
    timeoutMs: 8000,
    assertOriginIdentity: true,
    assertWrongHeaderDenied: true,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--access-key-file" || arg === "--key-file") out.accessKeyFile = argv[++index] || "";
    else if (arg === "--expected-version") out.expectedVersion = argv[++index] || "";
    else if (arg === "--max-active-global") out.maxActiveGlobal = Number(argv[++index] || "0");
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--skip-origin-check") out.assertOriginIdentity = false;
    else if (arg === "--skip-wrong-header-check") out.assertWrongHeaderDenied = false;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/production-status-smoke.js --access-key-file <file> [options]",
        "  --base <url>                Hermes Mobile origin, default http://127.0.0.1:8797",
        "  --access-key-file <file>    Owner access key file; path and contents are not printed",
        "  Auth contract: send the key with X-Hermes-Web-Key only",
        "  Negative check: X-Hermes-Access-Key must be rejected",
        "  --expected-version <value>  Optional clientVersion.version assertion",
        "  --max-active-global <n>     Maximum allowed activeGlobal, default 0",
        "  --skip-origin-check         Do not assert /api/public-config identifies Home AI",
        "  --skip-wrong-header-check   Do not assert X-Hermes-Access-Key is rejected",
        "  Note: document file tool closure (docx/office/pdf/audio/archive) requires gateway-tool-schema-smoke or macos-production-closure-validation",
        "  --json                      Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.base = String(out.base || "").replace(/\/+$/, "");
  if (!out.base) throw new Error("production_status_smoke_base_missing");
  if (!out.accessKeyFile) throw new Error("production_status_smoke_access_key_file_missing");
  if (!Number.isFinite(out.maxActiveGlobal) || out.maxActiveGlobal < 0) out.maxActiveGlobal = 0;
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 8000;
  return out;
}

function readAccessKey(filePath) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    throw new Error("production_status_smoke_access_key_file_unreadable");
  }
  const key = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!key) throw new Error("production_status_smoke_access_key_file_empty");
  return key;
}

async function fetchJson(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    let body = {};
    try {
      body = await response.json();
    } catch (_err) {}
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

function boundedStatusPayload(result) {
  const body = result.body || {};
  return {
    status: result.status,
    ok: Boolean(body.ok),
    activeGlobal: body.concurrency?.activeGlobal ?? null,
    clientVersion: body.clientVersion?.version || "",
    gatewayPool: body.gatewayPool ? {
      enabled: Boolean(body.gatewayPool.enabled),
      mode: body.gatewayPool.mode || "",
      workerCount: body.gatewayPool.workerCount ?? null,
    } : null,
    gatewayWorkerPolicyContract: body.gatewayWorkerPolicyContract ? {
      ok: Boolean(body.gatewayWorkerPolicyContract.ok),
      issues: Array.isArray(body.gatewayWorkerPolicyContract.issues)
        ? body.gatewayWorkerPolicyContract.issues.slice(0, 20)
        : [],
      overrides: body.gatewayWorkerPolicyContract.overrides || {},
      effective: body.gatewayWorkerPolicyContract.effective || {},
    } : null,
  };
}

async function run(options) {
  const key = readAccessKey(options.accessKeyFile);
  let originIdentity = null;
  if (options.assertOriginIdentity) {
    const originResult = await fetchJson(`${options.base}/api/public-config`, {}, options.timeoutMs);
    const title = String(originResult.body?.title || "");
    if (!originResult.ok || title !== "Home AI") {
      const err = new Error("production_origin_identity_mismatch");
      err.payload = {
        originStatus: originResult.status,
        originTitle: title,
      };
      throw err;
    }
    originIdentity = {
      status: originResult.status,
      title,
      setupRequired: Boolean(originResult.body?.setupRequired),
      ownerKeyConfigured: Boolean(originResult.body?.ownerKeyConfigured ?? originResult.body?.ownerConfigured),
      ownerKeySource: originResult.body?.ownerKeySource || "",
    };
  }
  const statusUrl = `${options.base}/api/status?detail=1`;
  const result = await fetchJson(statusUrl, { [AUTH_HEADER]: key }, options.timeoutMs);
  const payload = boundedStatusPayload(result);
  payload.authHeader = AUTH_HEADER;
  payload.wrongAuthHeader = WRONG_AUTH_HEADER;
  if (originIdentity) payload.originIdentity = originIdentity;
  if (!result.ok || !payload.ok) {
    const err = new Error("production_status_smoke_status_failed");
    err.payload = payload;
    throw err;
  }
  if (options.expectedVersion && payload.clientVersion !== options.expectedVersion) {
    const err = new Error("production_status_smoke_version_mismatch");
    err.payload = Object.assign({}, payload, { expectedVersion: options.expectedVersion });
    throw err;
  }
  const active = Number(payload.activeGlobal || 0);
  if (active > options.maxActiveGlobal) {
    const err = new Error("production_status_smoke_active_runs_present");
    err.payload = payload;
    throw err;
  }
  if (!payload.gatewayWorkerPolicyContract || !payload.gatewayWorkerPolicyContract.ok) {
    const err = new Error("production_status_smoke_gateway_worker_policy_mismatch");
    err.payload = payload;
    throw err;
  }
  if (options.assertWrongHeaderDenied) {
    const wrong = await fetchJson(statusUrl, { [WRONG_AUTH_HEADER]: key }, options.timeoutMs);
    if (wrong.ok) {
      const err = new Error("production_status_smoke_wrong_header_accepted");
      err.payload = Object.assign({}, payload, { wrongHeaderStatus: wrong.status });
      throw err;
    }
    payload.wrongHeaderDenied = true;
    payload.wrongHeaderStatus = wrong.status;
  }
  return payload;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    try {
      const payload = await run(options);
      if (options.json) {
        console.log(JSON.stringify(Object.assign({ ok: true }, payload), null, 2));
      } else {
        console.log(`ok activeGlobal=${payload.activeGlobal} clientVersion=${payload.clientVersion}`);
      }
    } catch (err) {
      if (options.json && err?.payload) {
        console.error(JSON.stringify(Object.assign({}, err.payload, { ok: false, error: err.message }), null, 2));
      } else {
        console.error(err?.message || String(err));
      }
      process.exit(1);
    }
  })();
}

module.exports = {
  AUTH_HEADER,
  WRONG_AUTH_HEADER,
  parseArgs,
  run,
};
