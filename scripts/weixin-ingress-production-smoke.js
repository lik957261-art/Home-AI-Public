"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const INGRESS_AUTH_HEADER = "X-Hermes-Mobile-Ingress-Key";
const WRONG_AUTH_HEADER = "X-Hermes-Web-Key";
const DEFAULT_WORKSPACES = ["weixin_wuping", "weixin_stephen", "weixin_test_1"];

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const out = {
    base: process.env.HERMES_MOBILE_WEIXIN_SMOKE_BASE || process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    ingressKeyFile: process.env.HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH || process.env.HERMES_WEB_WEIXIN_INGRESS_KEY_PATH || "",
    workspaces: DEFAULT_WORKSPACES,
    timeoutMs: 10000,
    assertOriginIdentity: true,
    assertWrongHeaderDenied: true,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--ingress-key-file" || arg === "--key-file") out.ingressKeyFile = argv[++index] || "";
    else if (arg === "--workspaces") out.workspaces = splitCsv(argv[++index] || "");
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--skip-origin-check") out.assertOriginIdentity = false;
    else if (arg === "--skip-wrong-header-check") out.assertWrongHeaderDenied = false;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/weixin-ingress-production-smoke.js --ingress-key-file <file> [options]",
        "  --base <url>                  Home AI origin, default http://127.0.0.1:8797",
        "  --ingress-key-file <file>     Weixin ingress key file; path and contents are not printed",
        "  --workspaces <ids>            Comma-separated route workspaces; default weixin_wuping,weixin_stephen,weixin_test_1",
        "  --timeout-ms <n>              Request timeout, default 10000",
        "  --skip-origin-check           Do not assert /api/public-config identifies Home AI",
        "  --skip-wrong-header-check     Do not assert X-Hermes-Web-Key is rejected for ingress",
        "  --json                        Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.base = String(out.base || "").replace(/\/+$/, "");
  out.workspaces = [...new Set(out.workspaces.map((item) => String(item || "").trim()).filter(Boolean))];
  if (!out.base) throw new Error("weixin_ingress_smoke_base_missing");
  if (!out.ingressKeyFile) throw new Error("weixin_ingress_smoke_key_file_missing");
  if (!out.workspaces.length) throw new Error("weixin_ingress_smoke_workspaces_missing");
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 10000;
  return out;
}

function readIngressKey(filePath) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    throw new Error("weixin_ingress_smoke_key_file_unreadable");
  }
  const key = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!key) throw new Error("weixin_ingress_smoke_key_file_empty");
  return key;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 10000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let body = {};
    try {
      body = await response.json();
    } catch (_err) {}
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

function syntheticEvent(workspaceId, sequence, now = new Date()) {
  const safeWorkspace = String(workspaceId || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  const nonce = crypto.randomBytes(6).toString("hex");
  return {
    eventId: `wxsmoke_${Date.now().toString(36)}_${sequence}_${safeWorkspace}_${nonce}`,
    accountId: "homeai-smoke",
    chatId: `homeai-smoke-${safeWorkspace}`,
    userId: `homeai-smoke-${safeWorkspace}`,
    principalId: workspaceId,
    workspaceId,
    senderLabel: "Home AI smoke",
    text: "#",
    timestamp: now.toISOString(),
  };
}

function compactResult(workspaceId, result) {
  const body = result.body || {};
  return {
    workspaceId,
    status: result.status,
    ok: Boolean(body.ok),
    heartbeat: Boolean(body.heartbeat),
    skipped: Boolean(body.skipped),
    reason: body.reason || "",
    eventId: body.eventId || "",
    responseWorkspaceId: body.workspaceId || "",
    awakenedOutboundCount: Number(body.awakenedOutbound?.count || 0),
    hasRun: Boolean(body.run),
    hasThread: Boolean(body.thread),
    hasMessage: Boolean(body.message),
  };
}

async function assertOrigin(options) {
  const result = await fetchJson(`${options.base}/api/public-config`, { timeoutMs: options.timeoutMs });
  const title = String(result.body?.title || "");
  if (!result.ok || title !== "Home AI") {
    const err = new Error("weixin_ingress_smoke_origin_identity_mismatch");
    err.payload = { originStatus: result.status, originTitle: title };
    throw err;
  }
  return {
    status: result.status,
    title,
    setupRequired: Boolean(result.body?.setupRequired),
    ownerKeyConfigured: Boolean(result.body?.ownerKeyConfigured ?? result.body?.ownerConfigured),
  };
}

async function run(options) {
  let originIdentity = null;
  if (options.assertOriginIdentity) originIdentity = await assertOrigin(options);
  const key = readIngressKey(options.ingressKeyFile);
  const eventUrl = `${options.base}/api/ingress/weixin/events`;
  const payload = {
    ok: true,
    mode: "heartbeat",
    ingressAuthHeader: INGRESS_AUTH_HEADER,
    wrongAuthHeader: WRONG_AUTH_HEADER,
    workspaces: [],
  };
  if (originIdentity) payload.originIdentity = originIdentity;

  if (options.assertWrongHeaderDenied) {
    const wrong = await fetchJson(eventUrl, {
      method: "POST",
      timeoutMs: options.timeoutMs,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        [WRONG_AUTH_HEADER]: key,
      },
      body: syntheticEvent(options.workspaces[0], "wrong-header"),
    });
    if (wrong.ok) {
      const err = new Error("weixin_ingress_smoke_wrong_header_accepted");
      err.payload = Object.assign({}, payload, { wrongHeaderStatus: wrong.status });
      throw err;
    }
    payload.wrongHeaderDenied = true;
    payload.wrongHeaderStatus = wrong.status;
  }

  for (let index = 0; index < options.workspaces.length; index += 1) {
    const workspaceId = options.workspaces[index];
    const event = syntheticEvent(workspaceId, String(index + 1));
    const result = await fetchJson(eventUrl, {
      method: "POST",
      timeoutMs: options.timeoutMs,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        [INGRESS_AUTH_HEADER]: key,
      },
      body: event,
    });
    const row = compactResult(workspaceId, result);
    payload.workspaces.push(row);
    if (!result.ok || !row.ok || !row.heartbeat || row.skipped || row.reason !== "weixin_ingress_heartbeat") {
      const err = new Error("weixin_ingress_smoke_route_failed");
      err.payload = Object.assign({}, payload, { failedWorkspace: row });
      throw err;
    }
    if (row.responseWorkspaceId !== workspaceId || row.hasRun || row.hasThread || row.hasMessage) {
      const err = new Error("weixin_ingress_smoke_heartbeat_contract_failed");
      err.payload = Object.assign({}, payload, { failedWorkspace: row });
      throw err;
    }
  }
  return payload;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    try {
      const payload = await run(options);
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`ok mode=${payload.mode} workspaces=${payload.workspaces.length} authHeader=${payload.ingressAuthHeader}`);
      }
    } catch (err) {
      if (options.json && err?.payload) {
        console.error(JSON.stringify(Object.assign({ ok: false, error: err.message }, err.payload), null, 2));
      } else {
        console.error(err?.message || String(err));
      }
      process.exit(1);
    }
  })();
}

module.exports = {
  DEFAULT_WORKSPACES,
  INGRESS_AUTH_HEADER,
  WRONG_AUTH_HEADER,
  parseArgs,
  run,
  syntheticEvent,
};
