"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function cleanList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function forbidToolsFromArgs() {
  return cleanList(argValue("--forbid", ""));
}

function cleanToolDescriptionChecks(value) {
  return cleanList(value).map((item) => {
    const index = item.indexOf(":");
    if (index <= 0) throw new Error(`Invalid --require-tool-description item: ${item}`);
    return {
      tool: item.slice(0, index).trim(),
      pattern: item.slice(index + 1).trim(),
    };
  }).filter((item) => item.tool && item.pattern);
}

function cleanToolPropertyChecks(value) {
  return cleanList(value).map((item) => {
    const index = item.indexOf(":");
    if (index <= 0) throw new Error(`Invalid --require-tool-property item: ${item}`);
    return {
      tool: item.slice(0, index).trim(),
      property: item.slice(index + 1).trim(),
    };
  }).filter((item) => item.tool && item.property);
}

function defaultManifestPaths() {
  return [
    "C:/ProgramData/HermesMobile/data/gateway-pool-manifest.json",
    "C:/ProgramData/HermesMobile/data/config/gateway-pool-manifest.json",
    "C:/ProgramData/HermesMobile/gateway-worker/gateway-pool-manifest.json",
  ];
}

function findManifestPath() {
  const explicit = argValue("--manifest");
  if (explicit) return explicit;
  return defaultManifestPaths().find((candidate) => fs.existsSync(candidate)) || "";
}

function parseSseFrame(frame) {
  const dataLines = [];
  for (const raw of String(frame || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    return JSON.parse(dataLines.join("\n"));
  } catch (_) {
    return null;
  }
}

async function drainResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body?.getReader) {
    return await response.text().catch(() => "");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      parseSseFrame(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
    }
  }
  return raw;
}

function newestMatchingSession(sessionDir, marker, sinceMs) {
  if (!fs.existsSync(sessionDir)) return null;
  const files = fs.readdirSync(sessionDir)
    .filter((name) => /^session_.*\.json$/i.test(name))
    .map((name) => {
      const full = path.join(sessionDir, name);
      const stat = fs.statSync(full);
      return { full, mtimeMs: stat.mtimeMs };
    })
    .filter((entry) => entry.mtimeMs >= sinceMs - 5000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const entry of files) {
    const text = fs.readFileSync(entry.full, "utf8");
    if (text.includes(marker)) return entry.full;
  }
  return null;
}

function toolsFromSession(sessionPath) {
  const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  return Array.isArray(parsed.tools) ? parsed.tools : [];
}

function toolDefinitionsFromNames(names) {
  return Array.from(new Set(names.filter(Boolean).sort())).map((name) => ({ name }));
}

function toolNamesFromText(text) {
  return Array.from(String(text || "").matchAll(/\bmcp_[A-Za-z0-9]+_[A-Za-z0-9_]+\b/g)).map((match) => match[0]);
}

function hasMcpToolRequirement(requiredTools) {
  return requiredTools.some((tool) => String(tool || "").startsWith("mcp_"));
}

function toolNamesFromDefinitions(toolDefinitions) {
  return toolDefinitions
    .map((tool) => tool?.function?.name || tool?.name || "")
    .filter(Boolean)
    .sort();
}

function toolParameters(tool = {}) {
  return tool?.function?.parameters || tool?.parameters || tool?.input_schema || tool?.inputSchema || {};
}

function readSecretFile(filePath) {
  const text = String(filePath || "").trim();
  if (!text) return "";
  try {
    return fs.readFileSync(text, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function workerApiKey(worker = {}) {
  return String(worker.api_key || worker.apiKey || "").trim()
    || readSecretFile(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path);
}

function validateToolDefinitions(worker, toolDefinitions, requiredTools, forbiddenTools, requiredDescriptionChecks, requiredPropertyChecks, evidence) {
  const tools = toolNamesFromDefinitions(toolDefinitions);
  const missing = requiredTools.filter((tool) => !tools.includes(tool));
  if (missing.length) {
    throw new Error(`worker ${worker.profile || worker.name} missing tools in ${evidence}: ${missing.join(", ")}; got ${tools.join(", ")}`);
  }
  const forbiddenPresent = forbiddenTools.filter((tool) => tools.includes(tool));
  if (forbiddenPresent.length) {
    throw new Error(`worker ${worker.profile || worker.name} has forbidden tools in ${evidence}: ${forbiddenPresent.join(", ")}; got ${tools.join(", ")}`);
  }
  for (const check of requiredDescriptionChecks) {
    const tool = toolDefinitions.find((definition) => (
      (definition?.function?.name || definition?.name || "") === check.tool
    ));
    const description = String(tool?.function?.description || tool?.description || "");
    if (!description.includes(check.pattern)) {
      throw new Error(`worker ${worker.profile || worker.name} tool ${check.tool} description missing required text in ${evidence}: ${check.pattern}`);
    }
  }
  for (const check of requiredPropertyChecks) {
    const tool = toolDefinitions.find((definition) => (
      (definition?.function?.name || definition?.name || "") === check.tool
    ));
    const properties = toolParameters(tool)?.properties || {};
    if (!Object.prototype.hasOwnProperty.call(properties, check.property)) {
      const got = Object.keys(properties).sort().join(", ");
      throw new Error(`worker ${worker.profile || worker.name} tool ${check.tool} missing required property in ${evidence}: ${check.property}; got ${got}`);
    }
  }
  return tools;
}

function windowsPathToWslPath(value) {
  const text = String(value || "").replace(/\\/g, "/");
  const driveMatch = text.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  return text;
}

function bashSingleQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\"'\"'")}'`;
}

function writeTempBashScript(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-agent-schema-"));
  const scriptPath = path.join(dir, "probe.sh");
  fs.writeFileSync(scriptPath, content, { encoding: "utf8" });
  return scriptPath;
}

function parseProbeJson(stdout) {
  const lines = String(stdout || "").split(/\r?\n/);
  let next = false;
  for (const line of lines) {
    if (line.trim() === "HERMES_AGENT_SCHEMA_PROBE_JSON_START") {
      next = true;
      continue;
    }
    if (next && line.trim().startsWith("{")) return JSON.parse(line);
  }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) return JSON.parse(line);
  }
  throw new Error("agent schema probe did not return JSON");
}

function runAgentSchemaProbe(worker, options) {
  const telemetryProfile = String(worker.telemetryProfile || worker.telemetry_profile || worker.profile || "").trim();
  if (!telemetryProfile) throw new Error(`worker ${worker.profile || worker.name || "unknown"} has no telemetry profile for agent schema probe`);
  const profileHome = path.join(options.telemetryRoot, telemetryProfile);
  const useWsl = options.agentSchemaMode === "wsl" || (options.agentSchemaMode === "auto" && process.platform === "win32");
  const pathForProbe = (value) => (useWsl ? windowsPathToWslPath(value) : String(value || ""));
  const deepseekKeyPath = pathForProbe(options.deepseekApiKeyPath || "");
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd ${bashSingleQuote(pathForProbe(options.runtimeSource))}
export HERMES_HOME=${bashSingleQuote(pathForProbe(profileHome))}
export HERMES_PROFILE=${bashSingleQuote(worker.profile || telemetryProfile)}
export PYTHONPATH=${bashSingleQuote(`${pathForProbe(options.runtimeOverrides)}:${pathForProbe(options.runtimeSource)}`)}"\${PYTHONPATH:+:\$PYTHONPATH}"
if [ -n ${bashSingleQuote(deepseekKeyPath)} ] && [ -s ${bashSingleQuote(deepseekKeyPath)} ]; then
  export DEEPSEEK_API_KEY="$(tr -d '\\r\\n' < ${bashSingleQuote(deepseekKeyPath)})"
fi
${bashSingleQuote(pathForProbe(options.runtimePython))} - <<'PY'
import json

from gateway.run import _load_gateway_config, _resolve_gateway_model, _resolve_runtime_agent_kwargs
from hermes_cli.tools_config import _get_platform_tools
from run_agent import AIAgent

agent = None
try:
    cfg = _load_gateway_config()
    enabled_toolsets = sorted(_get_platform_tools(cfg, "api_server"))
    agent = AIAgent(
        model=_resolve_gateway_model(),
        **_resolve_runtime_agent_kwargs(),
        quiet_mode=True,
        enabled_toolsets=enabled_toolsets,
        max_iterations=1,
    )
    print("HERMES_AGENT_SCHEMA_PROBE_JSON_START")
    print(json.dumps({
        "enabled_toolsets": enabled_toolsets,
        "tools": agent.tools or [],
    }, ensure_ascii=False))
finally:
    if agent is not None:
        agent.close()
PY
`;
  const tempScript = writeTempBashScript(script);
  try {
    const result = useWsl ? spawnSync("wsl.exe", [
      "-d",
      options.wslDistro,
      "--",
      "bash",
      windowsPathToWslPath(tempScript),
    ], {
      encoding: "utf8",
      timeout: options.agentSchemaTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    }) : spawnSync("bash", [tempScript], {
      encoding: "utf8",
      timeout: options.agentSchemaTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`agent schema probe failed for ${worker.profile || worker.name}: ${String(result.stderr || result.stdout || "").slice(0, 1000)}`);
    }
    const parsed = parseProbeJson(result.stdout);
    const toolDefinitions = Array.isArray(parsed.tools) ? parsed.tools : [];
    return {
      evidence: "agent-schema-probe",
      enabledToolsets: Array.isArray(parsed.enabled_toolsets) ? parsed.enabled_toolsets : [],
      toolDefinitions,
    };
  } finally {
    try {
      fs.rmSync(path.dirname(tempScript), { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup failure for temporary probe script
    }
  }
}

function logLineTimestampMs(line) {
  const match = String(line || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}),(\d{3})/);
  if (!match) return 0;
  const value = Date.parse(`${match[1]}T${match[2]}.${match[3]}+08:00`);
  return Number.isFinite(value) ? value : 0;
}

function newestRegisteredToolsFromLogs(logDir, sinceMs) {
  if (!fs.existsSync(logDir)) return [];
  const candidates = ["agent.log", "gateway.log"]
    .map((name) => path.join(logDir, name))
    .filter((file) => fs.existsSync(file));
  const freshTools = [];
  let latestTools = [];
  for (const file of candidates) {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("registered") || !line.includes("tool")) continue;
      const names = toolNamesFromText(line);
      if (names.length) latestTools = names;
      const timestampMs = logLineTimestampMs(line);
      if (timestampMs && timestampMs < sinceMs - 10000) continue;
      freshTools.push(...names);
    }
  }
  const tools = freshTools.length ? freshTools : latestTools;
  return Array.from(new Set(tools)).sort();
}

function workerTargets(manifest) {
  const profile = argValue("--profile");
  const allUserWorkers = hasFlag("--all-user-workers");
  const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
  if (profile) return workers.filter((worker) => String(worker.profile || "") === profile);
  if (allUserWorkers) {
    return workers.filter((worker) => (
      worker.enabled !== false
      && String(worker.securityLevel || worker.security_level || "").toLowerCase() === "user"
      && worker.port
    ));
  }
  const first = workers.find((worker) => String(worker.profile || "") === "lowgw1")
    || workers.find((worker) => worker.enabled !== false && String(worker.securityLevel || worker.security_level || "").toLowerCase() === "user" && worker.port);
  return first ? [first] : [];
}

async function smokeWorker(worker, requiredTools, forbiddenTools, requiredDescriptionChecks, requiredPropertyChecks, options) {
  const marker = `hermes-mobile-tool-schema-smoke-${worker.profile || worker.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const port = Number(worker.port || 0);
  if (!port) throw new Error(`worker ${worker.name || worker.profile || "unknown"} has no port`);
  const apiBase = String(worker.url || worker.gatewayUrl || worker.apiBase || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const startedAt = Date.now();
  const requiresMcpEvidence = hasMcpToolRequirement(requiredTools);
  const apiKey = workerApiKey(worker);
  const agentSchema = (options.schemaOnly || options.requireAgentSchema || (requiresMcpEvidence && !options.allowMcpRuntimeLogEvidence))
    ? runAgentSchemaProbe(worker, options)
    : null;
  if (agentSchema) {
    const agentSchemaTools = validateToolDefinitions(
      worker,
      agentSchema.toolDefinitions,
      requiredTools,
      forbiddenTools,
      requiredDescriptionChecks,
      requiredPropertyChecks,
      agentSchema.evidence,
    );
    if (options.schemaOnly) {
      return {
        worker: worker.profile || worker.name || String(port),
        sessionPath: "",
        tools: agentSchemaTools,
        evidence: agentSchema.evidence,
        agentSchemaToolCount: agentSchemaTools.length,
        agentSchemaEnabledToolsets: agentSchema.enabledToolsets,
      };
    }
  }
  const response = await fetch(`${apiBase}/v1/responses`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    ),
    body: JSON.stringify({
      input: `Tool schema smoke marker ${marker}. Reply exactly OK.`,
      stream: true,
      store: true,
      conversation: marker,
      instructions: "Reply exactly OK. Do not call tools.",
    }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`worker ${worker.profile || worker.name} response failed: ${response.status} ${detail.slice(0, 500)}`);
  }
  const streamText = await drainResponse(response);

  const telemetryRoot = options.telemetryRoot;
  const telemetryProfile = String(worker.telemetryProfile || worker.telemetry_profile || worker.profile || "").trim();
  const sessionDir = path.join(telemetryRoot, telemetryProfile, "sessions");
  const sessionPath = newestMatchingSession(sessionDir, marker, startedAt);
  const logDir = path.join(telemetryRoot, telemetryProfile, "logs");
  let evidence = "runtime-log";
  let toolDefinitions = [];
  if (sessionPath) {
    evidence = "session";
    toolDefinitions = toolsFromSession(sessionPath);
  } else if (agentSchema) {
    evidence = agentSchema.evidence;
    toolDefinitions = agentSchema.toolDefinitions;
  } else {
    toolDefinitions = toolDefinitionsFromNames([
      ...newestRegisteredToolsFromLogs(logDir, startedAt),
      ...toolNamesFromText(streamText),
    ]);
  }
  if (!sessionPath && toolDefinitions.length === 0) {
    throw new Error(`worker ${worker.profile || worker.name} did not write a matching session under ${sessionDir} and no registered tools were observed in ${logDir}`);
  }
  if (requiresMcpEvidence && evidence === "runtime-log" && !options.allowMcpRuntimeLogEvidence) {
    throw new Error(`worker ${worker.profile || worker.name} only has runtime-log MCP evidence. Registration logs are not enough; use --require-agent-schema or keep the default agent schema probe enabled.`);
  }
  const tools = validateToolDefinitions(
    worker,
    toolDefinitions,
    requiredTools,
    forbiddenTools,
    requiredDescriptionChecks,
    requiredPropertyChecks,
    evidence,
  );
  return {
    worker: worker.profile || worker.name || String(port),
    sessionPath,
    tools,
    evidence,
    agentSchemaToolCount: agentSchema ? toolNamesFromDefinitions(agentSchema.toolDefinitions).length : 0,
    agentSchemaEnabledToolsets: agentSchema ? agentSchema.enabledToolsets : [],
  };
}

async function main() {
  const manifestPath = findManifestPath();
  if (!manifestPath) throw new Error("Gateway pool manifest not found. Use --manifest <path>.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const targets = workerTargets(manifest);
  if (!targets.length) throw new Error("No matching Gateway worker found for schema smoke.");
  const requiredTools = cleanList(argValue(
    "--require",
    "http_request,weather,mobile_web_search,mobile_web_extract,image_generate,chatgpt_image_edit,chatgpt_image_erase,docx_extract_text,audio_transcribe",
  ));
  const forbiddenTools = forbidToolsFromArgs();
  const requiredDescriptionChecks = cleanToolDescriptionChecks(argValue("--require-tool-description", ""));
  const requiredPropertyChecks = cleanToolPropertyChecks(argValue("--require-tool-property", ""));
  const options = {
    telemetryRoot: argValue("--telemetry-root", "C:/ProgramData/HermesMobile/gateway-worker/telemetry/profiles"),
    timeoutMs: Number(argValue("--timeout-ms", "120000")) || 120000,
    schemaOnly: hasFlag("--schema-only"),
    requireAgentSchema: hasFlag("--require-agent-schema"),
    allowMcpRuntimeLogEvidence: hasFlag("--allow-mcp-log-evidence"),
    agentSchemaMode: ["wsl", "native"].includes(argValue("--agent-schema-mode", "").toLowerCase())
      ? argValue("--agent-schema-mode", "").toLowerCase()
      : "auto",
    wslDistro: argValue("--wsl-distro", "Ubuntu-24.04"),
    runtimeSource: argValue("--runtime-source", "/opt/hermes-gateway-runtime/official-clean"),
    runtimeOverrides: argValue("--runtime-overrides", "/opt/hermes-gateway-runtime/runtime-overrides"),
    runtimePython: argValue("--runtime-python", "/opt/hermes-gateway-runtime/venv/bin/python"),
    deepseekApiKeyPath: argValue("--deepseek-api-key-path", "C:/ProgramData/HermesMobile/data/secrets/deepseek-api-key.secret"),
    agentSchemaTimeoutMs: Number(argValue("--agent-schema-timeout-ms", "60000")) || 60000,
  };
  const results = [];
  for (const worker of targets) {
    results.push(await smokeWorker(worker, requiredTools, forbiddenTools, requiredDescriptionChecks, requiredPropertyChecks, options));
  }
  console.log(JSON.stringify({
    ok: true,
    manifestPath,
    requiredTools,
    forbiddenTools,
    requiredToolProperties: requiredPropertyChecks,
    workers: results.map((result) => ({
      worker: result.worker,
      sessionPath: result.sessionPath,
      evidence: result.evidence,
      toolCount: result.tools.length,
      agentSchemaToolCount: result.agentSchemaToolCount,
      agentSchemaEnabledToolsets: result.agentSchemaEnabledToolsets,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
