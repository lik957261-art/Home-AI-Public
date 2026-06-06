"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_EPOCH = "20260606-finance-attachment-mcp-v1";
const DEFAULT_GATEWAY_TOOL = "mcp_finance_add_transaction_attachment";
const DEFAULT_SERVICE_TOOL = "finance.add_transaction_attachment";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && index + 1 < process.argv.length) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function cleanList(values, fallback = []) {
  const source = Array.isArray(values) ? values : [values];
  const items = source.flatMap((value) => String(value || "").split(","));
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? Array.from(new Set(cleaned)) : fallback.slice();
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function includesAll(text, needles, label) {
  const missing = needles.filter((needle) => !String(text || "").includes(needle));
  if (missing.length) {
    throw new Error(`${label} missing required text: ${missing.join(", ")}`);
  }
}

function parseDocContains(value) {
  const text = String(value || "");
  const separator = text.indexOf("::");
  if (separator <= 0) {
    throw new Error(`Invalid --doc-contains value. Use <path>::<required-text>: ${text}`);
  }
  return {
    file: text.slice(0, separator).trim(),
    needle: text.slice(separator + 2).trim(),
  };
}

function parseNameValue(value, label) {
  const text = String(value || "");
  const separator = text.indexOf("=");
  if (separator <= 0) {
    throw new Error(`Invalid ${label} value. Use <name>=<value>: ${text}`);
  }
  return {
    name: text.slice(0, separator).trim(),
    value: text.slice(separator + 1).trim(),
  };
}

function serviceHeaders(options) {
  const headers = {};
  for (const item of options.serviceHeaders) {
    const parsed = parseNameValue(item, "--service-header");
    if (parsed.name) headers[parsed.name] = parsed.value;
  }
  for (const item of options.serviceHeaderFiles) {
    const parsed = parseNameValue(item, "--service-header-file");
    if (!parsed.name || !parsed.value) continue;
    headers[parsed.name] = readText(parsed.value).trim();
  }
  return headers;
}

function compactWorker(worker = {}) {
  return {
    worker: worker.worker || "",
    evidence: worker.evidence || "",
    toolCount: Number(worker.toolCount || 0),
    agentSchemaToolCount: Number(worker.agentSchemaToolCount || 0),
    enabledToolsets: Array.isArray(worker.agentSchemaEnabledToolsets) ? worker.agentSchemaEnabledToolsets : [],
  };
}

async function fetchJson(url, timeoutMs, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`service schema fetch failed: ${response.status} ${body.slice(0, 240)}`);
  }
  return await response.json();
}

async function checkServiceSchema(options) {
  if (!options.serviceSchemaUrl) {
    return { ok: true, skipped: true, reason: "service_schema_url_not_provided" };
  }
  const headers = serviceHeaders(options);
  const schema = await fetchJson(options.serviceSchemaUrl, options.timeoutMs, headers);
  const text = JSON.stringify(schema);
  includesAll(text, [...options.serviceTools, ...options.serviceContains], "service schema");
  return {
    ok: true,
    skipped: false,
    requiredTools: options.serviceTools,
    requiredText: options.serviceContains,
    headerNames: Object.keys(headers).sort(),
  };
}

function checkSourceFiles(options) {
  const instructionText = readText(options.instructionFile);
  const runtimeText = readText(options.runtimeFile);
  includesAll(instructionText, [options.epoch, ...options.gatewayTools], "Mobile instruction-service");
  includesAll(runtimeText, [options.epoch], "Mobile runtime schema epoch");
  return {
    ok: true,
    instructionFile: path.basename(options.instructionFile),
    runtimeFile: path.basename(options.runtimeFile),
    epoch: options.epoch,
    gatewayTools: options.gatewayTools,
  };
}

function checkDocs(options) {
  const checks = options.docContains.map(parseDocContains);
  for (const check of checks) {
    includesAll(readText(check.file), [check.needle], `doc ${check.file}`);
  }
  return {
    ok: true,
    checkedCount: checks.length,
    skipped: checks.length === 0,
  };
}

function gatewaySmokeArgs(options) {
  const args = [
    options.gatewaySmokeScript,
    "--manifest", options.manifest,
    "--profile", options.profile,
    "--schema-only",
    "--require", options.gatewayTools.join(","),
  ];
  if (options.telemetryRoot) args.push("--telemetry-root", options.telemetryRoot);
  if (options.agentSchemaMode) args.push("--agent-schema-mode", options.agentSchemaMode);
  if (options.runtimeSource) args.push("--runtime-source", options.runtimeSource);
  if (options.runtimeOverrides) args.push("--runtime-overrides", options.runtimeOverrides);
  if (options.runtimePython) args.push("--runtime-python", options.runtimePython);
  if (options.agentSchemaTimeoutMs) args.push("--agent-schema-timeout-ms", String(options.agentSchemaTimeoutMs));
  return args;
}

function checkGatewaySchema(options) {
  if (options.skipGateway || !options.manifest || !options.profile) {
    return { ok: true, skipped: true, reason: "gateway_manifest_or_profile_not_provided" };
  }
  const result = spawnSync(process.execPath, gatewaySmokeArgs(options), {
    cwd: options.repoRoot,
    encoding: "utf8",
    timeout: options.gatewayTimeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1000);
    throw new Error(`Gateway callable schema smoke failed: ${detail}`);
  }
  const parsed = JSON.parse(result.stdout);
  return {
    ok: true,
    skipped: false,
    requiredTools: parsed.requiredTools || options.gatewayTools,
    workers: (parsed.workers || []).map(compactWorker),
  };
}

async function main() {
  const repoRoot = path.resolve(argValue("--repo-root", path.resolve(__dirname, "..")));
  const options = {
    repoRoot,
    toolset: argValue("--toolset", "finance"),
    epoch: argValue("--epoch", DEFAULT_EPOCH),
    instructionFile: path.resolve(repoRoot, argValue("--instruction-file", "adapters/gateway-run-instruction-service.js")),
    runtimeFile: path.resolve(repoRoot, argValue("--runtime-file", "mobile-server-runtime.js")),
    serviceSchemaUrl: argValue("--service-schema-url", ""),
    serviceHeaders: argValues("--service-header"),
    serviceHeaderFiles: argValues("--service-header-file"),
    serviceTools: cleanList(argValues("--require-service-tool"), [DEFAULT_SERVICE_TOOL]),
    serviceContains: cleanList(argValues("--service-schema-contains"), []),
    gatewayTools: cleanList(argValues("--gateway-tool"), [DEFAULT_GATEWAY_TOOL]),
    docContains: argValues("--doc-contains"),
    skipGateway: hasFlag("--skip-gateway"),
    manifest: argValue("--manifest", ""),
    profile: argValue("--profile", ""),
    telemetryRoot: argValue("--telemetry-root", ""),
    gatewaySmokeScript: path.resolve(repoRoot, argValue("--gateway-smoke-script", "scripts/gateway-tool-schema-smoke.js")),
    agentSchemaMode: argValue("--agent-schema-mode", ""),
    runtimeSource: argValue("--runtime-source", ""),
    runtimeOverrides: argValue("--runtime-overrides", ""),
    runtimePython: argValue("--runtime-python", ""),
    agentSchemaTimeoutMs: Number(argValue("--agent-schema-timeout-ms", "60000")) || 60000,
    timeoutMs: Number(argValue("--timeout-ms", "30000")) || 30000,
    gatewayTimeoutMs: Number(argValue("--gateway-timeout-ms", "90000")) || 90000,
  };

  const source = checkSourceFiles(options);
  const docs = checkDocs(options);
  const service = await checkServiceSchema(options);
  const gateway = checkGatewaySchema(options);

  console.log(JSON.stringify({
    ok: true,
    toolset: options.toolset,
    epoch: options.epoch,
    source,
    docs,
    service,
    gateway,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
