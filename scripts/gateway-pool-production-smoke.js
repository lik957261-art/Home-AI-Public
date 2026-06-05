"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const out = {
    base: process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    key: process.env.HERMES_WEB_KEY || "",
    keyFile: process.env.HERMES_WEB_AUTH_KEY_PATH || "",
    workspaceId: process.env.HERMES_MOBILE_SMOKE_WORKSPACE || "owner",
    model: process.env.HERMES_MOBILE_SMOKE_MODEL || "",
    provider: process.env.HERMES_MOBILE_SMOKE_PROVIDER || "",
    maintenance: false,
    elevationScope: "owner_high_privilege",
    expectedProfile: "",
    timeoutMs: Number(process.env.HERMES_MOBILE_SMOKE_TIMEOUT_MS || "180000"),
    pollMs: Number(process.env.HERMES_MOBILE_SMOKE_POLL_MS || "2500"),
    allowNoPool: false,
    keep: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--key") out.key = argv[++index] || out.key;
    else if (arg === "--key-file") out.keyFile = argv[++index] || out.keyFile;
    else if (arg === "--workspace") out.workspaceId = argv[++index] || out.workspaceId;
    else if (arg === "--model") out.model = argv[++index] || out.model;
    else if (arg === "--provider") out.provider = argv[++index] || out.provider;
    else if (arg === "--maintenance") out.maintenance = true;
    else if (arg === "--elevation-scope") out.elevationScope = argv[++index] || out.elevationScope;
    else if (arg === "--expected-profile") out.expectedProfile = argv[++index] || out.expectedProfile;
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--poll-ms") out.pollMs = Number(argv[++index] || out.pollMs);
    else if (arg === "--allow-no-pool") out.allowNoPool = true;
    else if (arg === "--keep") out.keep = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/gateway-pool-production-smoke.js [options]",
        "  --base <url>          Hermes Mobile base URL, default http://127.0.0.1:8797",
        "  --key <key>           Owner/workspace access key, not printed",
        "  --key-file <path>     File containing the access key",
        "  --workspace <id>      Workspace id, default owner",
        "  --model <model>       Optional model id, for example deepseek-chat",
        "  --provider <id>       Optional provider id, for example deepseek or xai-oauth",
        "  --maintenance         Request Owner maintenance routing through one-shot elevation",
        "  --elevation-scope <s> Owner maintenance scope, default owner_high_privilege",
        "  --expected-profile <p> Assert the completed run used this Gateway profile",
        "  --allow-no-pool       Permit single-Gateway fallback",
        "  --keep                Keep the temporary task for inspection",
      ].join("\n"));
      process.exit(0);
    }
  }
  out.base = String(out.base || "").replace(/\/+$/, "");
  return out;
}

function readKey(options) {
  if (options.key) return String(options.key).trim();
  const candidates = [
    options.keyFile,
    path.join(process.cwd(), ".hermes_web_secret_key"),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    } catch (_) {}
  }
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(options, apiPath, requestOptions = {}) {
  const headers = Object.assign({}, requestOptions.headers || {});
  if (options.key) headers["X-Hermes-Web-Key"] = options.key;
  if (requestOptions.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${options.base}${apiPath}`, Object.assign({}, requestOptions, { headers }));
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = {};
  }
  if (!response.ok) {
    const detail = payload?.error || `${response.status} ${response.statusText}`;
    const err = new Error(detail);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function findSmokeAssistant(thread, taskGroupId) {
  return (thread?.messages || []).find((message) => (
    message.role === "assistant"
    && message.taskGroupId === taskGroupId
  ));
}

async function cleanup(options, threadId, taskGroupId) {
  if (options.keep || !threadId || !taskGroupId) return;
  try {
    await api(options, `/api/threads/${encodeURIComponent(threadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.warn(`Cleanup skipped: ${err.message || String(err)}`);
  }
}

async function ownerElevationOnce(options) {
  if (!options.maintenance) return "";
  const result = await api(options, "/api/owner-elevation/once", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const token = String(result.ownerElevationOnce?.token || "").trim();
  if (!token) throw new Error("Owner maintenance smoke could not obtain one-shot elevation");
  return token;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.key = readKey(options);
  if (!options.key) throw new Error("Missing access key. Use --key-file or HERMES_WEB_AUTH_KEY_PATH.");

  const status = await api(options, "/api/status");
  const pool = status.gatewayPool || {};
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const healthy = workers.filter((worker) => worker.healthy === true).length;
  if (!options.allowNoPool && (!pool.enabled || !healthy)) {
    throw new Error(`Gateway Pool is not healthy enough for production smoke: enabled=${Boolean(pool.enabled)} healthy=${healthy}`);
  }

  const single = await api(options, "/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: options.workspaceId }),
  });
  const threadId = single.thread?.id;
  if (!threadId) throw new Error("Could not resolve single-window thread");

  const ownerElevationOnceToken = await ownerElevationOnce(options);
  const taskGroupId = `pool-smoke-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const text = "Reply with exactly this marker and no extra prose: HERMES_MOBILE_POOL_SMOKE_OK";
  const messageBody = {
    text,
    taskGroupId,
    singleWindowMode: "task",
    workspaceId: options.workspaceId,
    reasoning_effort: "low",
  };
  if (options.model) messageBody.model = options.model;
  if (options.provider) messageBody.provider = options.provider;
  if (options.maintenance) {
    messageBody.maintenanceMode = true;
    messageBody.elevationScope = options.elevationScope || "owner_high_privilege";
    messageBody.ownerElevationOnceToken = ownerElevationOnceToken;
  }
  await api(options, `/api/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: JSON.stringify(messageBody),
  });

  const deadline = Date.now() + Math.max(30000, options.timeoutMs || 180000);
  let assistant = null;
  let latestThread = null;
  while (Date.now() < deadline) {
    const read = await api(options, `/api/threads/${encodeURIComponent(threadId)}`);
    latestThread = read.thread;
    assistant = findSmokeAssistant(latestThread, taskGroupId);
    if (assistant && ["done", "failed", "cancelled"].includes(assistant.status)) break;
    await sleep(Math.max(500, options.pollMs || 2500));
  }

  try {
    if (!assistant) throw new Error("Smoke run did not create an assistant message");
    if (assistant.status !== "done") {
      throw new Error(`Smoke run ended as ${assistant.status}: ${assistant.error || "no error detail"}`);
    }
    const content = String(assistant.content || "");
    if (!content.includes("HERMES_MOBILE_POOL_SMOKE_OK")) {
      throw new Error("Smoke run completed but did not return the expected marker");
    }
    if (pool.enabled && !(assistant.gatewayName || assistant.gatewayProfile)) {
      throw new Error("Smoke run completed without non-secret Gateway worker metadata");
    }
    if (options.expectedProfile && assistant.gatewayProfile !== options.expectedProfile && assistant.gatewayName !== options.expectedProfile) {
      throw new Error(`Smoke run used unexpected Gateway profile: ${assistant.gatewayProfile || assistant.gatewayName || "unknown"}`);
    }
    console.log(JSON.stringify({
      ok: true,
      gatewayPool: {
        enabled: Boolean(pool.enabled),
        workerCount: Number(pool.workerCount || workers.length || 0),
        healthy,
      },
      request: {
        workspaceId: options.workspaceId,
        model: options.model || "",
        provider: options.provider || "",
        maintenance: Boolean(options.maintenance),
        expectedProfile: options.expectedProfile || "",
      },
      run: {
        status: assistant.status,
        gatewayName: assistant.gatewayName || "",
        gatewayProfile: assistant.gatewayProfile || "",
        gatewaySource: assistant.gatewaySource || "",
        gatewayMaintenance: Boolean(assistant.gatewayMaintenance),
        gatewayMaintenanceCategory: assistant.gatewayMaintenanceCategory || "",
      },
    }, null, 2));
  } finally {
    await cleanup(options, threadId, taskGroupId);
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
