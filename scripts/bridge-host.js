"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createBridgeCommandProvider } = require("../adapters/bridge-command-provider");
const { createHermesCodexMuxService } = require("../adapters/hermes-codex-mux-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

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
const DEFAULT_CODEX_MUX_WORKSPACE = "C:\\Users\\xuxin\\Documents\\Agent";
const DEFAULT_CODEX_MUX_WORKER = "codex-hermes-main";
const DEFAULT_CODEX_MUX_BRIDGE = "hermes-mobile-codex-main";
let codexMuxService = null;

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

function compactList(value, limit = 20) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function trimText(value, max = 4000) {
  const text = String(value == null ? "" : value).trim();
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

function mobileDbPath() {
  return path.resolve(
    process.env.HERMES_WEB_DB_PATH ||
      process.env.HERMES_MOBILE_DB_PATH ||
      path.join(process.env.HERMES_WEB_DATA_DIR || "C:\\ProgramData\\HermesMobile\\data", "hermes-mobile.sqlite3"),
  );
}

function getCodexMuxService() {
  if (!codexMuxService) {
    codexMuxService = createHermesCodexMuxService({
      mobileStore: createMobileSqliteStore({ dbPath: mobileDbPath() }),
    });
  }
  return codexMuxService;
}

function normalizeCodexMuxAction(value) {
  const action = String(value || "list_tasks").trim().toLowerCase();
  if (action === "create") return "create_task";
  if (action === "list") return "list_tasks";
  if (action === "get" || action === "read") return "get_task";
  if (action === "events") return "list_events";
  if (action === "append") return "append_event";
  if (action === "worker" || action === "heartbeat") return "worker_status";
  return action;
}

function buildCodexMuxTask(payload = {}) {
  const service = getCodexMuxService();
  const title = trimText(payload.title || "Hermes Mobile Codex task", 160);
  const instruction = trimText(payload.instruction || payload.request || payload.user_intent || payload.userIntent || "", 6000);
  if (!instruction) {
    const err = new Error("instruction is required");
    err.status = 400;
    throw err;
  }
  const assignedWorker = trimText(payload.assigned_worker || payload.assignedWorker || DEFAULT_CODEX_MUX_WORKER, 80);
  const bridgeId = trimText(payload.bridge_id || payload.bridgeId || DEFAULT_CODEX_MUX_BRIDGE, 80);
  const workspace = trimText(payload.workspace || DEFAULT_CODEX_MUX_WORKSPACE, 260);
  const source = payload.source && typeof payload.source === "object" ? payload.source : {};
  const capsule = {
    schema: "hermes-codex-mux.task.v1",
    title,
    workspace,
    bridgeId,
    assignedWorker,
    workerMode: "sticky",
    requiresSameThread: true,
    handoverAllowed: false,
    priority: trimText(payload.priority || "normal", 30),
    userIntent: instruction,
    requiredReads: compactList(payload.required_reads || payload.requiredReads, 20).map((item) => trimText(item, 260)),
    deliverables: compactList(payload.deliverables, 20).map((item) => trimText(item, 260)),
    constraints: compactList(payload.constraints, 20).map((item) => trimText(item, 260)),
    source: {
      channel: trimText(source.channel || payload.source_channel || "hermes-mobile", 80),
      threadId: trimText(source.threadId || source.thread_id || payload.source_thread_id || payload.sourceThreadId || "", 120),
      messageId: trimText(source.messageId || source.message_id || payload.source_message_id || payload.sourceMessageId || "", 120),
    },
    createdAt: new Date().toISOString(),
  };
  const taskId = trimText(payload.task_id || payload.taskId || "", 120);
  if (taskId) capsule.taskId = taskId;
  const task = service.upsertTask({
    taskId: taskId || undefined,
    title,
    status: "open",
    workspace,
    assignedWorker,
    sourceThreadId: capsule.source.threadId,
    capsule,
  });
  capsule.taskId = task.taskId;
  service.appendEvent(task.taskId, {
    type: "task.requested",
    from: "hermes-mobile",
    to: assignedWorker,
    workerId: assignedWorker,
    status: "open",
    summary: title,
    payload: {
      capsule,
      instruction,
    },
  });
  return { ok: true, action: "create_task", task };
}

function handleCodexMux(payload = {}) {
  const service = getCodexMuxService();
  const action = normalizeCodexMuxAction(payload.action);
  if (action === "create_task") return buildCodexMuxTask(payload);
  if (action === "list_tasks") {
    return {
      ok: true,
      action,
      tasks: service.listTasks({
        assignedWorker: payload.assigned_worker || payload.assignedWorker || DEFAULT_CODEX_MUX_WORKER,
        status: payload.status || "open,running,waiting,blocked",
        limit: payload.limit || 50,
      }),
    };
  }
  if (action === "get_task") {
    const taskId = trimText(payload.task_id || payload.taskId, 120);
    if (!taskId) throw new Error("task_id is required");
    return { ok: true, action, task: service.getTask(taskId) };
  }
  if (action === "list_events") {
    const taskId = trimText(payload.task_id || payload.taskId, 120);
    if (!taskId) throw new Error("task_id is required");
    return { ok: true, action, taskId, events: service.listEvents(taskId, { limit: payload.limit || 100 }) };
  }
  if (action === "append_event") {
    const taskId = trimText(payload.task_id || payload.taskId, 120);
    if (!taskId) throw new Error("task_id is required");
    const event = service.appendEvent(taskId, Object.assign({}, payload.event || {}, {
      type: payload.type || payload.event?.type || "progress",
      from: payload.from || payload.event?.from || "hermes-mobile",
      to: payload.to || payload.event?.to || "mux",
      summary: payload.summary || payload.event?.summary || "",
      payload: payload.payload || payload.event?.payload || {},
    }));
    return { ok: true, action, event };
  }
  if (action === "worker_status") {
    const workerId = trimText(payload.worker_id || payload.workerId || DEFAULT_CODEX_MUX_WORKER, 120);
    return { ok: true, action, worker: service.getHeartbeat(workerId) };
  }
  const err = new Error(`Unsupported codex_mobile action: ${action}`);
  err.status = 400;
  throw err;
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
  const directHandlers = {
    "/bridge/codex-mux": handleCodexMux,
  };
  const kind = routeKinds[req.url || ""];
  const directHandler = directHandlers[req.url || ""];
  if (req.method !== "POST" || (!kind && !directHandler)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  try {
    const payload = await readBody(req);
    const result = directHandler ? directHandler(payload) : await runBridge(kind, payload);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, err.status || 502, { ok: false, error: err.message || String(err) });
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
