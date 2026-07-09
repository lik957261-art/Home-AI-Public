"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { createRemoteManagedWorkspaceService } = require("../adapters/remote-managed-workspace-service");
const { createRemoteManagedWorkspaceApiRoutes } = require("../server-routes/remote-managed-workspace-api-routes");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 200000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function jsonRequest(baseUrl, method, path, body = null, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.assign(
      body == null ? {} : { "Content-Type": "application/json" },
      headers,
    ),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    payload,
  };
}

function createCentralServer() {
  let nowMs = Date.parse("2026-07-08T00:00:00.000Z");
  let seq = 0;
  const backingState = {};
  const service = createRemoteManagedWorkspaceService({
    enrollments: {
      "son-vite-game": {
        token: "enroll-secret",
        nodeId: "node-a",
        nodeName: "remote-node",
      },
    },
    env: {},
    makeId(prefix) {
      seq += 1;
      return `${prefix}_${seq}`;
    },
    nowIso() {
      return new Date(nowMs).toISOString();
    },
    nowMs() {
      return nowMs;
    },
    saveState() {},
    staleAfterMs: 300000,
    state() {
      return backingState;
    },
  });
  const routes = createRemoteManagedWorkspaceApiRoutes({
    readBody: readJsonBody,
    remoteManagedWorkspaceService: service,
    requireOwner(req, res) {
      if (req.headers["x-test-owner"] === "true") return { ok: true, workspaceId: "owner", owner: true };
      sendJson(res, 403, { ok: false, error: "Owner required" });
      return null;
    },
    sendJson,
  });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const nodeResult = await routes.handleNode(req, res, url);
      if (nodeResult.handled) return;
      const ownerResult = await routes.handle(req, res, url, { auth: { workspaceId: "owner", owner: true } });
      if (ownerResult.handled) return;
      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err.message || err).slice(0, 200) });
    }
  });
  return { server, service, tick: (ms) => { nowMs += ms; } };
}

function createRemoteNodeSimulator() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname !== "/run") {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return;
      }
      const centralUrl = url.searchParams.get("centralUrl");
      const nodeHeaders = { authorization: "Bearer enroll-secret" };
      const ownerHeaders = { "x-test-owner": "true" };

      const register = await jsonRequest(centralUrl, "POST", "/api/remote-managed-workspaces/register", {
        workspaceId: "son-vite-game",
        nodeId: "node-a",
        nodeName: "remote-node",
        projectType: "vite_game",
        centralUrl,
        projectRoot: "/Users/example/path",
        capabilities: ["task_cards", "task_card_heartbeat", "terminal_return", "daily_summary", "escalation"],
      }, nodeHeaders);
      const waitingPoll = jsonRequest(centralUrl, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll?waitMs=5000", null, nodeHeaders);
      const dispatch = await jsonRequest(centralUrl, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards", {
        taskCardId: "rmw_card_1",
        idempotencyKey: "owner-request-1",
        title: "Implement bounded local change",
        summary: "Harness task card",
        bodyMarkdown: "Local task body.",
      }, ownerHeaders);
      const duplicateDispatch = await jsonRequest(centralUrl, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards", {
        taskCardId: "rmw_card_duplicate",
        idempotencyKey: "owner-request-1",
        title: "Duplicate task",
      }, ownerHeaders);
      const poll = await waitingPoll;
      const taskCardId = poll.payload.taskCards?.[0]?.taskCardId;
      const ack = await jsonRequest(centralUrl, "POST", `/api/remote-managed-workspaces/son-vite-game/task-cards/${taskCardId}/ack`, {
        leaseId: "lease-1",
      }, nodeHeaders);
      const heartbeat = await jsonRequest(centralUrl, "POST", `/api/remote-managed-workspaces/son-vite-game/task-cards/${taskCardId}/heartbeat`, {
        progress: {
          step: "running",
          rawLogs: "private raw log",
        },
      }, nodeHeaders);
      const terminal = await jsonRequest(centralUrl, "POST", `/api/remote-managed-workspaces/son-vite-game/task-cards/${taskCardId}/return`, {
        status: "completed",
        summary: "Harness task completed",
        evidence: {
          tests: ["npm test"],
          accessKey: "private",
        },
      }, nodeHeaders);
      const summary = await jsonRequest(centralUrl, "POST", "/api/remote-managed-workspaces/son-vite-game/daily-summary", {
        summary: "Daily summary from remote node.",
        cookie: "private",
      }, nodeHeaders);
      const escalation = await jsonRequest(centralUrl, "POST", "/api/remote-managed-workspaces/son-vite-game/escalations", {
        severity: "medium",
        summary: "Bounded central review requested.",
        endpointBody: "private",
      }, nodeHeaders);
      const afterReturnPoll = await jsonRequest(centralUrl, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll", null, nodeHeaders);
      const status = await jsonRequest(centralUrl, "GET", "/api/remote-managed-workspaces/status", null, ownerHeaders);

      sendJson(res, 200, {
        ok: true,
        statuses: {
          register: register.status,
          dispatch: dispatch.status,
          duplicateDispatch: duplicateDispatch.status,
          poll: poll.status,
          ack: ack.status,
          heartbeat: heartbeat.status,
          terminal: terminal.status,
          summary: summary.status,
          escalation: escalation.status,
          afterReturnPoll: afterReturnPoll.status,
          status: status.status,
        },
        sessionDesign: status.payload.controlPlane?.sessionDesign || "",
        registerSessionState: register.payload.workspace?.session?.state || "",
        registerCentralUrl: register.payload.workspace?.session?.centralUrl || "",
        pollMode: poll.payload.poll?.mode || "",
        pollNotified: Boolean(poll.payload.poll?.notified),
        duplicateSuppressed: Boolean(duplicateDispatch.payload.duplicate),
        polledTaskCardId: taskCardId,
        afterReturnPollCount: afterReturnPoll.payload.count,
        heartbeatRedactions: heartbeat.payload.privacy?.redacted || 0,
        terminalRedactions: terminal.payload.privacy?.redacted || 0,
        summaryRedactions: summary.payload.dailySummary?.privacy?.redacted || 0,
        escalationCount: status.payload.workspaces?.[0]?.escalationCount || 0,
        latestDailySummary: status.payload.workspaces?.[0]?.latestDailySummary?.summary || "",
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err.message || err).slice(0, 200) });
    }
  });
  return { server };
}

async function run() {
  const central = createCentralServer();
  const remote = createRemoteNodeSimulator();
  const centralAddr = await listen(central.server);
  const remoteAddr = await listen(remote.server);
  try {
    assert.notEqual(centralAddr.port, 8787);
    assert.notEqual(remoteAddr.port, 8787);
    const centralUrl = `http://${centralAddr.address}:${centralAddr.port}`;
    const remoteUrl = `http://${remoteAddr.address}:${remoteAddr.port}`;
    const result = await jsonRequest(remoteUrl, "GET", `/run?centralUrl=${encodeURIComponent(centralUrl)}`);

    assert.equal(result.status, 200);
    assert.equal(result.payload.ok, true);
    assert.deepEqual(result.payload.statuses, {
      register: 201,
      dispatch: 202,
      duplicateDispatch: 202,
      poll: 200,
      ack: 200,
      heartbeat: 200,
      terminal: 200,
      summary: 200,
      escalation: 202,
      afterReturnPoll: 200,
      status: 200,
    });
    assert.equal(result.payload.sessionDesign, "bounded_long_poll");
    assert.equal(result.payload.registerSessionState, "connecting");
    assert.equal(result.payload.registerCentralUrl, centralUrl);
    assert.equal(result.payload.pollMode, "long_poll");
    assert.equal(result.payload.pollNotified, true);
    assert.equal(result.payload.duplicateSuppressed, true);
    assert.equal(result.payload.polledTaskCardId, "rmw_card_1");
    assert.equal(result.payload.afterReturnPollCount, 0);
    assert.equal(result.payload.heartbeatRedactions >= 1, true);
    assert.equal(result.payload.terminalRedactions >= 1, true);
    assert.equal(result.payload.summaryRedactions >= 1, true);
    assert.equal(result.payload.escalationCount, 1);
    assert.equal(result.payload.latestDailySummary, "Daily summary from remote node.");
    console.log("remote managed workspace integration tests passed");
  } finally {
    await close(remote.server);
    await close(central.server);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
