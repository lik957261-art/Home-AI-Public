"use strict";

const fs = require("node:fs");
const { createGatewayRunner } = require("../adapters/gateway-runner");

function parseArgs(argv) {
  const out = {
    apiBase: process.env.HERMES_WEB_HERMES_API_BASE || process.env.HERMES_API_BASE || "http://127.0.0.1:8642",
    apiKey: process.env.HERMES_WEB_HERMES_API_KEY || process.env.HERMES_API_KEY || "",
    apiKeyPath: process.env.HERMES_WEB_HERMES_API_KEY_PATH || "",
    timeoutMs: Number(process.env.HERMES_COMPAT_SMOKE_TIMEOUT_MS || "12000"),
    runModel: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--api-base") out.apiBase = argv[++index] || out.apiBase;
    else if (arg === "--api-key") out.apiKey = argv[++index] || out.apiKey;
    else if (arg === "--api-key-file") out.apiKeyPath = argv[++index] || out.apiKeyPath;
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--run-model") out.runModel = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/official-hermes-compat-smoke.js [options]",
        "  --api-base <url>       Gateway URL, default HERMES_WEB_HERMES_API_BASE or http://127.0.0.1:8642",
        "  --api-key <key>        Gateway API key, not printed",
        "  --api-key-file <path>  File containing the Gateway API key",
        "  --run-model            Also create a tiny /v1/responses run",
      ].join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function readKey(options) {
  if (options.apiKey) return String(options.apiKey).trim();
  if (options.apiKeyPath && fs.existsSync(options.apiKeyPath)) {
    return fs.readFileSync(options.apiKeyPath, "utf8").trim();
  }
  return "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.apiKey = readKey(options);
  const runner = createGatewayRunner({
    apiBase: options.apiBase,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
  });
  const status = await runner.status();
  if (!status.ok) throw new Error(status.error || "Gateway status failed");

  const result = {
    ok: true,
    apiBase: runner.apiBase(),
    health: status.health?.status || status.health?.ok || "ok",
    detailedStatus: status.detailed?.status || status.detailed?.health || "ok",
    capabilities: status.capabilities && !status.capabilities.error ? "available" : "unavailable",
    modelRun: "not_run",
  };

  if (options.runModel) {
    const response = await runner.request("/v1/responses", {
      method: "POST",
      body: {
        input: "Reply exactly: HERMES_OFFICIAL_COMPAT_OK",
        stream: false,
        store: false,
      },
      timeoutMs: Math.max(options.timeoutMs, 120000),
    });
    const text = JSON.stringify(response || {});
    if (!text.includes("HERMES_OFFICIAL_COMPAT_OK")) {
      throw new Error("Compatibility model run did not return expected marker");
    }
    result.modelRun = "ok";
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
