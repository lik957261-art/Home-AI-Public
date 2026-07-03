"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_EPOCH = "20260629-wardrobe-wear-intent-v970";
const DEFAULT_GATEWAY_TOOL = "mcp_wardrobe_wardrobe_execute_outfit_wear_intent";
const DEFAULT_SERVICE_TOOL = "wardrobe.execute_outfit_wear_intent";
const FINANCE_ATTACHMENT_SERVICE_TOOL = "finance.add_transaction_attachment";
const FINANCE_ATTACHMENT_GATEWAY_TOOL = "mcp_finance_add_transaction_attachment";

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

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

function parseToolProperty(value, label) {
  const text = String(value || "");
  const separator = text.indexOf(":");
  if (separator <= 0) {
    throw new Error(`Invalid ${label} value. Use <tool>:<property>: ${text}`);
  }
  return {
    tool: text.slice(0, separator).trim(),
    property: text.slice(separator + 1).trim(),
  };
}

function parseSchemaPropertyMatch(value) {
  const text = String(value || "");
  const equals = text.indexOf("=");
  const colon = text.lastIndexOf(":");
  if (equals <= 0 || colon <= equals + 1 || colon >= text.length - 1) {
    throw new Error(`Invalid --require-schema-property-match value. Use <service-tool>=<gateway-tool>:<property>: ${text}`);
  }
  return {
    serviceTool: text.slice(0, equals).trim(),
    gatewayTool: text.slice(equals + 1, colon).trim(),
    property: text.slice(colon + 1).trim(),
  };
}

function uniqueToolProperties(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.tool}:${item.property}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function toolName(tool = {}) {
  return tool.name || tool?.function?.name || "";
}

function toolParameters(tool = {}) {
  return tool.parameters || tool.inputSchema || tool.input_schema || tool?.function?.parameters || {};
}

function schemaTools(schema) {
  if (Array.isArray(schema)) return schema;
  if (Array.isArray(schema?.tools)) return schema.tools;
  if (Array.isArray(schema?.schemas)) return schema.schemas;
  return [];
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
    observedTools: Array.isArray(worker.observedTools) ? worker.observedTools : undefined,
    sessionFound: typeof worker.sessionFound === "boolean" ? worker.sessionFound : undefined,
    rawContainsMarker: typeof worker.rawContainsMarker === "boolean" ? worker.rawContainsMarker : undefined,
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
  const tools = schemaTools(schema);
  for (const check of options.serviceToolProperties) {
    const tool = tools.find((candidate) => toolName(candidate) === check.tool);
    if (!tool) throw new Error(`service schema missing tool for property check: ${check.tool}`);
    const properties = toolParameters(tool)?.properties || {};
    if (!Object.prototype.hasOwnProperty.call(properties, check.property)) {
      const got = Object.keys(properties).sort().join(", ");
      throw new Error(`service schema tool ${check.tool} missing required property: ${check.property}; got ${got}`);
    }
  }
  return {
    ok: true,
    skipped: false,
    requiredTools: options.serviceTools,
    requiredText: options.serviceContains,
    requiredProperties: options.serviceToolProperties,
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
  if (options.allowMcpLogEvidence) args.push("--allow-mcp-log-evidence");
  if (options.gatewayToolProperties.length) {
    args.push("--require-tool-property", options.gatewayToolProperties.map((check) => `${check.tool}:${check.property}`).join(","));
  }
  return args;
}

function liveGatewaySmokeArgs(options) {
  const args = [
    options.liveGatewaySmokeScript,
    "--manifest", options.manifest,
    "--profile", options.profile,
    "--telemetry-root", options.telemetryRoot,
    "--timeout-ms", String(options.liveGatewayTimeoutMs),
  ];
  if (options.liveGatewayLogDelayMs) args.push("--log-delay-ms", String(options.liveGatewayLogDelayMs));
  for (const call of options.liveGatewayCalls) args.push("--call", call);
  return args;
}

function readPassword(options) {
  const file = cleanString(options.passwordFile);
  if (!file) return "";
  return fs.readFileSync(file, "utf8").split(/\r?\n/)[0] || "";
}

function runChild(command, args, options = {}) {
  if (!options.gatewaySudo) {
    return spawnSync(command, args, {
      cwd: options.repoRoot,
      encoding: "utf8",
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  const password = readPassword(options);
  return spawnSync("/usr/bin/sudo", ["-S", "-p", "", command, ...args], {
    cwd: options.repoRoot,
    encoding: "utf8",
    input: password ? `${password}\n` : "\n",
    timeout: options.timeout,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runGatewaySchemaSmoke(options) {
  const result = runChild(process.execPath, gatewaySmokeArgs(options), {
    repoRoot: options.repoRoot,
    gatewaySudo: options.gatewaySudo,
    passwordFile: options.passwordFile,
    timeout: options.gatewayTimeoutMs,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1000);
    throw new Error(`Gateway callable schema smoke failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function runLiveGatewaySmoke(options) {
  if (!options.liveGatewayCalls.length) return null;
  const result = runChild(process.execPath, liveGatewaySmokeArgs(options), {
    repoRoot: options.repoRoot,
    gatewaySudo: options.gatewaySudo,
    passwordFile: options.passwordFile,
    timeout: options.liveGatewayTimeoutMs + 10000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1000);
    throw new Error(`Gateway live runtime smoke failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function checkGatewaySchema(options) {
  if (options.skipGateway) {
    return { ok: true, skipped: true, reason: "skip_gateway_requested" };
  }
  if (!options.manifest || !options.profile) {
    if (!options.requireGateway) {
      return {
        ok: true,
        skipped: true,
        reason: "gateway_manifest_profile_not_provided_default_source_check",
      };
    }
    const missing = [];
    if (!options.manifest) missing.push("--manifest");
    if (!options.profile) missing.push("--profile");
    throw new Error(
      `Gateway callable schema closure requires ${missing.join(" and ")} for the selected profile, or explicit --skip-gateway for source/service-only checks.`,
    );
  }
  let parsed = null;
  let schemaError = "";
  if (!options.skipGatewaySchema) {
    try {
      parsed = runGatewaySchemaSmoke(options);
    } catch (err) {
      schemaError = err.message || String(err);
      if (!options.allowLiveGatewaySubstitute || !options.liveGatewayCalls.length) throw err;
    }
  }
  const liveParsed = runLiveGatewaySmoke(options);
  if (!parsed && !liveParsed) {
    throw new Error("Gateway closure requires schema smoke or explicit live runtime call smoke.");
  }
  const primary = parsed || liveParsed || {};
  return {
    ok: true,
    skipped: false,
    requiredTools: primary.requiredTools || options.gatewayTools,
    requiredProperties: options.gatewayToolProperties,
    workers: (primary.workers || []).map(compactWorker),
    schema: parsed ? {
      ok: true,
      workers: (parsed.workers || []).map(compactWorker),
    } : {
      ok: false,
      skipped: options.skipGatewaySchema,
      error: schemaError ? schemaError.slice(0, 1000) : (options.skipGatewaySchema ? "skip_gateway_schema_requested" : "not_run"),
    },
    live: liveParsed ? {
      ok: true,
      requiredTools: liveParsed.requiredTools || [],
      workers: (liveParsed.workers || []).map(compactWorker),
    } : {
      ok: false,
      skipped: true,
      reason: "live_gateway_calls_not_provided",
    },
  };
}

async function main() {
  const macosProductionDefaults = hasFlag("--macos-production") || hasFlag("--macos-production-defaults");
  const macRoot = cleanString(argValue("--mac-root"), "/Users/example/path");
  const profileArg = argValue("--profile", "");
  const defaultProfile = macosProductionDefaults ? "hm-owner-openai-1" : "";
  const profile = cleanString(profileArg, defaultProfile);
  const profileUser = profile.split("-").slice(0, 2).join("-");
  const defaultTelemetryRoot = macosProductionDefaults && profileUser
    ? `/Users/${profileUser}/HermesWorkspace/.hermes-gateway/profiles`
    : "";
  const repoRoot = path.resolve(argValue("--repo-root", macosProductionDefaults ? path.join(macRoot, "app") : path.resolve(__dirname, "..")));
  const serviceTools = cleanList(argValues("--require-service-tool"), [DEFAULT_SERVICE_TOOL]);
  const gatewayTools = cleanList(argValues("--gateway-tool"), [DEFAULT_GATEWAY_TOOL]);
  const defaultServiceToolProperties = serviceTools.includes(FINANCE_ATTACHMENT_SERVICE_TOOL)
    ? [`${FINANCE_ATTACHMENT_SERVICE_TOOL}:file_path`, `${FINANCE_ATTACHMENT_SERVICE_TOOL}:upload_path`]
    : [];
  const defaultGatewayToolProperties = gatewayTools.includes(FINANCE_ATTACHMENT_GATEWAY_TOOL)
    ? [`${FINANCE_ATTACHMENT_GATEWAY_TOOL}:file_path`, `${FINANCE_ATTACHMENT_GATEWAY_TOOL}:upload_path`]
    : [];
  const schemaPropertyMatches = cleanList(argValues("--require-schema-property-match"), [])
    .map(parseSchemaPropertyMatch);
  const serviceToolProperties = uniqueToolProperties([
    ...cleanList(argValues("--require-service-tool-property"), defaultServiceToolProperties)
      .map((value) => parseToolProperty(value, "--require-service-tool-property")),
    ...schemaPropertyMatches.map((match) => ({ tool: match.serviceTool, property: match.property })),
  ]);
  const gatewayToolProperties = uniqueToolProperties([
    ...cleanList(argValues("--require-gateway-tool-property"), defaultGatewayToolProperties)
      .map((value) => parseToolProperty(value, "--require-gateway-tool-property")),
    ...schemaPropertyMatches.map((match) => ({ tool: match.gatewayTool, property: match.property })),
  ]);
  const options = {
    repoRoot,
    toolset: argValue("--toolset", "wardrobe"),
    epoch: argValue("--epoch", DEFAULT_EPOCH),
    instructionFile: path.resolve(repoRoot, argValue("--instruction-file", "adapters/gateway-run-instruction-service.js")),
    runtimeFile: path.resolve(repoRoot, argValue("--runtime-file", "mobile-server-runtime.js")),
    serviceSchemaUrl: argValue("--service-schema-url", ""),
    serviceHeaders: argValues("--service-header"),
    serviceHeaderFiles: argValues("--service-header-file"),
    serviceTools,
    serviceContains: cleanList(argValues("--service-schema-contains"), []),
    serviceToolProperties,
    gatewayTools,
    gatewayToolProperties,
    schemaPropertyMatches,
    docContains: argValues("--doc-contains"),
    skipGateway: hasFlag("--skip-gateway"),
    requireGateway: hasFlag("--require-gateway"),
    skipGatewaySchema: hasFlag("--skip-gateway-schema"),
    allowLiveGatewaySubstitute: hasFlag("--allow-live-gateway-substitute"),
    allowMcpLogEvidence: hasFlag("--allow-mcp-log-evidence"),
    manifest: argValue("--manifest", macosProductionDefaults ? path.join(macRoot, "data/gateway-pool-manifest-mac.json") : ""),
    profile,
    telemetryRoot: argValue("--telemetry-root", defaultTelemetryRoot),
    gatewaySmokeScript: path.resolve(repoRoot, argValue("--gateway-smoke-script", "scripts/gateway-tool-schema-smoke.js")),
    liveGatewaySmokeScript: path.resolve(repoRoot, argValue("--live-gateway-smoke-script", "scripts/gateway-mcp-runtime-call-smoke.js")),
    liveGatewayCalls: argValues("--live-gateway-call"),
    liveGatewayTimeoutMs: Number(argValue("--live-gateway-timeout-ms", "120000")) || 120000,
    liveGatewayLogDelayMs: Number(argValue("--live-gateway-log-delay-ms", "1200")) || 1200,
    agentSchemaMode: argValue("--agent-schema-mode", macosProductionDefaults ? "native" : ""),
    runtimeSource: argValue("--runtime-source", macosProductionDefaults ? path.join(macRoot, "runtime/hermes-agent-official") : ""),
    runtimeOverrides: argValue("--runtime-overrides", macosProductionDefaults ? path.join(macRoot, "app/gateway-runtime-overrides") : ""),
    runtimePython: argValue("--runtime-python", macosProductionDefaults ? path.join(macRoot, "runtime/hermes-agent-official/venv/bin/python") : ""),
    agentSchemaTimeoutMs: Number(argValue("--agent-schema-timeout-ms", "60000")) || 60000,
    timeoutMs: Number(argValue("--timeout-ms", "30000")) || 30000,
    gatewayTimeoutMs: Number(argValue("--gateway-timeout-ms", "90000")) || 90000,
    passwordFile: cleanString(argValue("--password-file", argValue("--sudo-password-file", ""))),
    gatewaySudo: hasFlag("--gateway-sudo") || (macosProductionDefaults && Boolean(cleanString(argValue("--password-file", argValue("--sudo-password-file", ""))))),
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
    schemaPropertyMatches: options.schemaPropertyMatches,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
