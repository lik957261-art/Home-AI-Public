"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
    await response.text().catch(() => "");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      parseSseFrame(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
    }
  }
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

async function smokeWorker(worker, requiredTools, forbiddenTools, requiredDescriptionChecks, options) {
  const marker = `hermes-mobile-tool-schema-smoke-${worker.profile || worker.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const port = Number(worker.port || 0);
  if (!port) throw new Error(`worker ${worker.name || worker.profile || "unknown"} has no port`);
  const apiBase = String(worker.url || worker.gatewayUrl || worker.apiBase || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const startedAt = Date.now();
  const response = await fetch(`${apiBase}/v1/responses`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      worker.api_key || worker.apiKey ? { Authorization: `Bearer ${worker.api_key || worker.apiKey}` } : {},
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
  await drainResponse(response);

  const telemetryRoot = options.telemetryRoot;
  const telemetryProfile = String(worker.telemetryProfile || worker.telemetry_profile || worker.profile || "").trim();
  const sessionDir = path.join(telemetryRoot, telemetryProfile, "sessions");
  const sessionPath = newestMatchingSession(sessionDir, marker, startedAt);
  if (!sessionPath) throw new Error(`worker ${worker.profile || worker.name} did not write a matching session under ${sessionDir}`);
  const toolDefinitions = toolsFromSession(sessionPath);
  const tools = toolDefinitions
    .map((tool) => tool?.function?.name || tool?.name || "")
    .filter(Boolean)
    .sort();
  const missing = requiredTools.filter((tool) => !tools.includes(tool));
  if (missing.length) {
    throw new Error(`worker ${worker.profile || worker.name} missing tools in live session schema: ${missing.join(", ")}; got ${tools.join(", ")}`);
  }
  const forbiddenPresent = forbiddenTools.filter((tool) => tools.includes(tool));
  if (forbiddenPresent.length) {
    throw new Error(`worker ${worker.profile || worker.name} has forbidden tools in live session schema: ${forbiddenPresent.join(", ")}; got ${tools.join(", ")}`);
  }
  for (const check of requiredDescriptionChecks) {
    const tool = toolDefinitions.find((definition) => (
      (definition?.function?.name || definition?.name || "") === check.tool
    ));
    const description = String(tool?.function?.description || tool?.description || "");
    if (!description.includes(check.pattern)) {
      throw new Error(`worker ${worker.profile || worker.name} tool ${check.tool} description missing required text: ${check.pattern}`);
    }
  }
  return { worker: worker.profile || worker.name || String(port), sessionPath, tools };
}

async function main() {
  const manifestPath = findManifestPath();
  if (!manifestPath) throw new Error("Gateway pool manifest not found. Use --manifest <path>.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const targets = workerTargets(manifest);
  if (!targets.length) throw new Error("No matching Gateway worker found for schema smoke.");
  const requiredTools = cleanList(argValue(
    "--require",
    "http_request,codex_mobile,weather,mobile_web_search,mobile_web_extract,image_generate,chatgpt_image_edit,chatgpt_image_erase,docx_extract_text,audio_transcribe",
  ));
  const forbiddenTools = forbidToolsFromArgs();
  const requiredDescriptionChecks = cleanToolDescriptionChecks(argValue("--require-tool-description", ""));
  const options = {
    telemetryRoot: argValue("--telemetry-root", "C:/ProgramData/HermesMobile/gateway-worker/telemetry/profiles"),
    timeoutMs: Number(argValue("--timeout-ms", "120000")) || 120000,
  };
  const results = [];
  for (const worker of targets) {
    results.push(await smokeWorker(worker, requiredTools, forbiddenTools, requiredDescriptionChecks, options));
  }
  console.log(JSON.stringify({
    ok: true,
    manifestPath,
    requiredTools,
    forbiddenTools,
    workers: results.map((result) => ({
      worker: result.worker,
      sessionPath: result.sessionPath,
      toolCount: result.tools.length,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
