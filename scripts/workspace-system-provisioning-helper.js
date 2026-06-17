"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  createWorkspaceSystemProvisioningExecutorService,
} = require("../adapters/workspace-system-provisioning-executor-service");

const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_SOCKET = `${DEFAULT_ROOT}/data/run/workspace-system-provisioning-helper.sock`;
const DEFAULT_SOCKET_USER = "hermes-host";

function text(value) {
  return String(value || "").trim();
}

function boundedError(value, fallback = "workspace_system_helper_failed") {
  return text(value).replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function sendJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body)));
  res.end(body);
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) reject(new Error("request_too_large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function userIds(user) {
  const uid = spawnSync("/usr/bin/id", ["-u", user], { encoding: "utf8" });
  const gid = spawnSync("/usr/bin/id", ["-g", user], { encoding: "utf8" });
  const uidValue = Number(String(uid.stdout || "").trim());
  const gidValue = Number(String(gid.stdout || "").trim());
  if (uid.status !== 0 || gid.status !== 0 || !Number.isFinite(uidValue) || !Number.isFinite(gidValue)) {
    throw new Error("workspace_system_helper_socket_user_invalid");
  }
  return { uid: uidValue, gid: gidValue };
}

function prepareSocket(socketPath, socketUser) {
  const dir = path.dirname(socketPath);
  const ids = userIds(socketUser);
  fs.mkdirSync(dir, { recursive: true });
  fs.chownSync(dir, ids.uid, ids.gid);
  fs.chmodSync(dir, 0o700);
  try {
    const stat = fs.lstatSync(socketPath);
    if (!stat.isSocket()) throw new Error("workspace_system_helper_socket_path_not_socket");
    fs.unlinkSync(socketPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return ids;
}

function createWorkspaceSystemProvisioningHelperHandler(options = {}) {
  const executor = options.executor || createWorkspaceSystemProvisioningExecutorService({
    enabled: true,
    forceEnabled: true,
    fs,
    liveRoot: options.liveRoot || process.env.HERMES_MOBILE_ROOT || process.env.HERMES_WEB_ROOT || DEFAULT_ROOT,
    path,
    platform: process.platform,
    useSudoWrites: false,
  });

  return async function handleWorkspaceSystemProvisioningHelper(req, res) {
    if (req.method === "GET" && req.url === "/health") return sendJson(res, 200, { ok: true, service: "workspace-system-provisioning-helper" });
    if (req.method !== "POST" || req.url !== "/run-step") return sendJson(res, 404, { ok: false, error: "not_found" });
    try {
      const body = await readJsonBody(req);
      const result = await executor.runStep(body.action, body.context || {});
      return sendJson(res, 200, result && typeof result === "object" ? result : { ok: false, error: "workspace_system_helper_empty_result" });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: boundedError(err?.message) });
    }
  };
}

function createWorkspaceSystemProvisioningHelperServer(options = {}) {
  return http.createServer(createWorkspaceSystemProvisioningHelperHandler(options));
}

function main() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    console.error(JSON.stringify({ ok: false, error: "workspace_system_helper_requires_root" }));
    process.exit(1);
  }
  const socketPath = text(process.env.HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET || process.env.HERMES_WEB_WORKSPACE_SYSTEM_HELPER_SOCKET) || DEFAULT_SOCKET;
  const socketUser = text(process.env.HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET_USER || process.env.HERMES_WEB_WORKSPACE_SYSTEM_HELPER_SOCKET_USER) || DEFAULT_SOCKET_USER;
  const ids = prepareSocket(socketPath, socketUser);
  const server = createWorkspaceSystemProvisioningHelperServer();
  server.listen(socketPath, () => {
    fs.chownSync(socketPath, ids.uid, ids.gid);
    fs.chmodSync(socketPath, 0o600);
    console.log(JSON.stringify({ ok: true, service: "workspace-system-provisioning-helper", socketPath, socketUser }));
  });
  server.on("error", (err) => {
    console.error(JSON.stringify({ ok: false, error: boundedError(err?.message) }));
    process.exit(1);
  });
}

if (require.main === module) main();

module.exports = {
  DEFAULT_SOCKET,
  createWorkspaceSystemProvisioningHelperHandler,
  createWorkspaceSystemProvisioningHelperServer,
  prepareSocket,
  userIds,
};
