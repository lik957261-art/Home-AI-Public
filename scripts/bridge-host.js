"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createBridgeCommandProvider } = require("../adapters/bridge-command-provider");

const TOOL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TODO_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "todo_bridge.py");
const DEFAULT_CRON_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "cron_bridge.py");
const DEFAULT_DIRECTORY_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "directory_bridge.py");
const HOST = process.env.HERMES_MOBILE_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.HERMES_MOBILE_BRIDGE_HOST_PORT || "8798");
const TIMEOUT_MS = Number(process.env.HERMES_MOBILE_BRIDGE_HOST_TIMEOUT_MS || "20000");
const STDOUT_LIMIT_BYTES = Number(process.env.HERMES_MOBILE_BRIDGE_HOST_STDOUT_LIMIT_BYTES || "50000000");
const KEY_PATH = process.env.HERMES_MOBILE_BRIDGE_HOST_KEY_PATH || process.env.HERMES_WEB_BRIDGE_HOST_KEY_PATH || "";
const KEY = String(process.env.HERMES_MOBILE_BRIDGE_HOST_KEY || process.env.HERMES_WEB_BRIDGE_HOST_KEY || readText(KEY_PATH)).trim();

function readText(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return "";
  }
}

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function compactText(value, max = 1200) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function windowsPathToWsl(value) {
  const text = String(value || "").trim();
  const driveMatch = text.match(/^([A-Za-z]):[\\/](.*)$/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2].replaceAll("\\", "/")}`;
  }
  return text.replaceAll("\\", "/");
}

function authorized(req) {
  if (!KEY) return false;
  const header = String(req.headers.authorization || req.headers["x-hermes-mobile-bridge-key"] || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim() === KEY;
  return header === KEY;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error(`Invalid JSON request: ${err.message || String(err)}`));
      }
    });
    req.on("error", reject);
  });
}

function bridgeCommand(kind) {
  const provider = createBridgeCommandProvider({
    wslDistro: () => process.env.HERMES_WEB_WSL_DISTRO || "Ubuntu-24.04",
    windowsPathToWsl,
  });
  if (kind === "todo") {
    return provider.python(process.env.HERMES_WEB_TODO_BRIDGE_SCRIPT || DEFAULT_TODO_BRIDGE_SCRIPT, [
      "HERMES_WEB_TODO_PLUGIN_NAME",
      "HERMES_WEB_TODO_PLUGIN_PATH",
    ]);
  }
  if (kind === "cron") {
    return provider.python(process.env.HERMES_WEB_CRON_BRIDGE_SCRIPT || DEFAULT_CRON_BRIDGE_SCRIPT, [
      "HERMES_WEB_CRON_JOBS_PATH",
      "HERMES_CRON_JOBS_PATH",
      "HERMES_WEB_CRON_JOBS_FALLBACK_PATH",
      "HERMES_WEB_CRON_OUTPUT_ROOT",
    ]);
  }
  if (kind === "directory") {
    return provider.python(process.env.HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT || DEFAULT_DIRECTORY_BRIDGE_SCRIPT, [
      "HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON",
    ]);
  }
  throw new Error(`Unknown bridge kind: ${kind}`);
}

function runBridge(kind, payload) {
  return new Promise((resolve, reject) => {
    const { command, args } = bridgeCommand(kind);
    const child = spawn(command, args, {
      cwd: TOOL_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${kind} bridge timed out`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > STDOUT_LIMIT_BYTES) stdout = stdout.slice(-STDOUT_LIMIT_BYTES);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(stdout.trim() || "{}");
      } catch (err) {
        reject(new Error(`${kind} bridge returned invalid JSON: ${err.message || String(err)}`));
        return;
      }
      if (code !== 0 && !parsed.error) {
        reject(new Error(stderr.trim() || `${kind} bridge exited with ${code}`));
        return;
      }
      if (stderr.trim()) parsed.stderr = compactText(stderr.trim());
      resolve(parsed);
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

async function handle(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "hermes-mobile-bridge-host" });
    return;
  }
  const routeKinds = {
    "/bridge/todo": "todo",
    "/bridge/cron": "cron",
    "/bridge/directory": "directory",
  };
  const kind = routeKinds[req.url || ""];
  if (req.method !== "POST" || !kind) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  try {
    const payload = await readBody(req);
    const result = await runBridge(kind, payload);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message || String(err) });
  }
}

if (!KEY) {
  console.error("Hermes Mobile bridge host key is not configured.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => sendJson(res, 500, { error: err.message || String(err) }));
});

server.listen(PORT, HOST, () => {
  console.log(`Hermes Mobile bridge host listening on http://${HOST}:${PORT}`);
});
