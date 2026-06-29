"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSecretFile(filePath) {
  const text = cleanString(filePath);
  if (!text) return "";
  try {
    return fs.readFileSync(text, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function workerApiKey(worker = {}) {
  return cleanString(worker.api_key || worker.apiKey)
    || readSecretFile(worker.apiKeyFile || worker.api_key_file || worker.apiKeyPath || worker.api_key_path);
}

function workerTargets(manifest = {}, profile = "") {
  const workers = Array.isArray(manifest.workers) ? manifest.workers : [];
  const selected = cleanString(profile);
  if (selected) return workers.filter((worker) => cleanString(worker.profile) === selected);
  return workers.filter((worker) => worker.enabled !== false && worker.port);
}

function parseCall(value) {
  const text = String(value || "");
  const separator = text.indexOf("=");
  if (separator <= 0) {
    throw new Error(`Invalid --call value. Use <tool>=<json-args>: ${text}`);
  }
  const tool = text.slice(0, separator).trim();
  const rawArgs = text.slice(separator + 1).trim() || "{}";
  if (!tool) throw new Error(`Invalid --call tool: ${text}`);
  let args;
  try {
    args = JSON.parse(rawArgs);
  } catch (err) {
    throw new Error(`Invalid --call JSON for ${tool}: ${err.message}`);
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`Invalid --call JSON for ${tool}: expected object`);
  }
  return { tool, args };
}

function buildPrompt(marker, calls) {
  const lines = [
    `MCP runtime call smoke marker ${marker}.`,
    "Use only the explicitly requested MCP tools. Do not call any playback, device, profile, subtitle, audio, file-mutation, or destructive tools unless they are explicitly listed here.",
  ];
  calls.forEach((call, index) => {
    lines.push(`Step ${index + 1}: call ${call.tool} exactly once with ${JSON.stringify(call.args)}.`);
  });
  lines.push(`After the requested tool calls finish, reply exactly ${marker} ok.`);
  return lines.join(" ");
}

async function drainResponse(response) {
  if (!response.body?.getReader) return await response.text().catch(() => "");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw;
}

function logLineTimestampMs(line) {
  const match = String(line || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}),(\d{3})/);
  if (!match) return 0;
  const value = Date.parse(`${match[1]}T${match[2]}.${match[3]}+08:00`);
  return Number.isFinite(value) ? value : 0;
}

function recentLogLines(logPath, startedAt) {
  if (!fs.existsSync(logPath)) return [];
  const text = fs.readFileSync(logPath, "utf8");
  return text
    .split(/\r?\n/)
    .slice(-3000)
    .filter((line) => {
      const timestamp = logLineTimestampMs(line);
      return !timestamp || timestamp >= startedAt - 5000;
    });
}

function sessionIdForMarker(lines, marker) {
  for (const line of lines) {
    if (!line.includes(marker)) continue;
    const match = line.match(/\[([0-9a-f-]{36})\]/i);
    if (match) return match[1];
  }
  return "";
}

function observedToolsFromLines(lines, sessionId = "") {
  const relevant = sessionId
    ? lines.filter((line) => line.includes(`[${sessionId}]`) && line.includes("agent.tool_executor"))
    : lines.filter((line) => line.includes("agent.tool_executor"));
  return Array.from(new Set(relevant.map((line) => {
    const match = line.match(/tool (mcp_[A-Za-z0-9_]+)/);
    return match ? match[1] : "";
  }).filter(Boolean))).sort();
}

async function smokeWorker(worker, calls, options) {
  const port = Number(worker.port || 0);
  if (!port) throw new Error(`worker ${worker.profile || worker.name || "unknown"} has no port`);
  const apiBase = cleanString(worker.url || worker.gatewayUrl || worker.apiBase, `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const apiKey = workerApiKey(worker);
  const workerName = worker.profile || worker.name || String(port);
  const marker = `${options.markerPrefix}-${workerName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();
  const response = await fetch(`${apiBase}/v1/responses`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    ),
    body: JSON.stringify({
      input: buildPrompt(marker, calls),
      stream: true,
      store: true,
      conversation: marker,
      instructions: "This is a bounded MCP runtime smoke. Use only the requested tools, then reply with the exact marker.",
    }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const raw = await drainResponse(response);
  if (!response.ok) {
    throw new Error(`worker ${workerName} response failed: ${response.status} ${raw.slice(0, 240)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, options.logDelayMs));
  const telemetryProfile = cleanString(worker.telemetryProfile || worker.telemetry_profile || worker.profile);
  const logDir = path.join(options.telemetryRoot, telemetryProfile, "logs");
  const lines = recentLogLines(path.join(logDir, "agent.log"), startedAt);
  const sessionId = sessionIdForMarker(lines, marker);
  const observedTools = observedToolsFromLines(lines, sessionId);
  const requiredTools = Array.from(new Set(calls.map((call) => call.tool))).sort();
  const missingTools = requiredTools.filter((tool) => !observedTools.includes(tool));
  if (missingTools.length) {
    throw new Error(`worker ${workerName} missing runtime tool execution evidence: ${missingTools.join(", ")}`);
  }
  return {
    worker: workerName,
    evidence: "gateway-runtime-tool-executor",
    sessionFound: Boolean(sessionId),
    requiredTools,
    observedTools,
    responseBytes: raw.length,
    rawContainsMarker: raw.includes(marker),
  };
}

async function main() {
  const manifestPath = cleanString(argValue("--manifest"));
  if (!manifestPath) throw new Error("Missing --manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const profile = cleanString(argValue("--profile"));
  const calls = argValues("--call").map(parseCall);
  if (!calls.length) throw new Error("Missing --call");
  const telemetryRoot = cleanString(argValue("--telemetry-root"));
  if (!telemetryRoot) throw new Error("Missing --telemetry-root");
  const targets = workerTargets(manifest, profile);
  if (!targets.length) throw new Error("No matching Gateway worker found for runtime call smoke");
  const options = {
    telemetryRoot,
    timeoutMs: Number(argValue("--timeout-ms", "120000")) || 120000,
    logDelayMs: Number(argValue("--log-delay-ms", "1200")) || 1200,
    markerPrefix: cleanString(argValue("--marker-prefix"), "mcp-runtime-smoke"),
  };
  const workers = [];
  for (const worker of targets) {
    workers.push(await smokeWorker(worker, calls, options));
  }
  console.log(JSON.stringify({
    ok: true,
    requiredTools: Array.from(new Set(calls.map((call) => call.tool))).sort(),
    workers,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
