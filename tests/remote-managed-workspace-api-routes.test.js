"use strict";

const assert = require("node:assert/strict");
const { createRemoteManagedWorkspaceService } = require("../adapters/remote-managed-workspace-service");
const { createRemoteManagedWorkspaceApiRoutes } = require("../server-routes/remote-managed-workspace-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, this.headers, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function createHarness(options = {}) {
  let nowMs = Date.parse("2026-07-08T00:00:00.000Z");
  let seq = 0;
  const backingState = {};
  const service = createRemoteManagedWorkspaceService({
    enrollments: options.enrollments || {
      "son-vite-game": {
        token: "enroll-secret",
        nodeId: "node-a",
        nodeName: "son-macbook",
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
    staleAfterMs: 1000,
    state() {
      return backingState;
    },
  });
  const routes = createRemoteManagedWorkspaceApiRoutes({
    readBody(req) {
      if (req.bodyError) return Promise.reject(new Error("invalid json"));
      return Promise.resolve(req.body || {});
    },
    remoteManagedWorkspaceService: service,
    requireOwner(req, res) {
      if (req.owner) return { ok: true, workspaceId: "owner", owner: true };
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Owner required" }));
      return null;
    },
    sendJson(res, status, payload) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
  });
  return { routes, service };
}

async function callNode(routes, method, path, body = {}, headers = {}) {
  const req = { method, url: path, headers, body };
  const res = makeResponse();
  const result = await routes.handleNode(req, res, new URL(path, "http://localhost"));
  return { result, res, body: parseBody(res) };
}

async function callOwner(routes, method, path, body = {}, owner = true) {
  const req = { method, url: path, headers: {}, body, owner };
  const res = makeResponse();
  const result = await routes.handle(req, res, new URL(path, "http://localhost"), {
    auth: owner ? { workspaceId: "owner", owner: true } : { workspaceId: "child", owner: false },
  });
  return { result, res, body: parseBody(res) };
}

async function testMissingEnrollmentConfigReturns503() {
  const { routes } = createHarness({ enrollments: {} });
  const response = await callNode(routes, "POST", "/api/remote-managed-workspaces/register", {
    workspaceId: "son-vite-game",
    nodeId: "node-a",
  });

  assert.equal(response.result.handled, true);
  assert.equal(response.res.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "remote_managed_workspace_enrollment_token_unconfigured");
}

async function testNodeTokenRoutesFailClosedOnBadToken() {
  const { routes } = createHarness();
  const response = await callNode(routes, "POST", "/api/remote-managed-workspaces/register", {
    workspaceId: "son-vite-game",
    nodeId: "node-a",
  }, { "x-homeai-remote-workspace-token": "bad-token" });

  assert.equal(response.res.statusCode, 403);
  assert.equal(response.body.code, "remote_managed_workspace_token_invalid");
}

async function testFullNodeAndOwnerRouteFlow() {
  const { routes } = createHarness();
  const tokenHeaders = { authorization: "Bearer enroll-secret" };
  const register = await callNode(routes, "POST", "/api/remote-managed-workspaces/register", {
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    nodeName: "son-macbook",
    centralUrl: "https://home-ai.example.com/control?token=private",
    projectRoot: "/Users/example/game",
    capabilities: ["task_cards", "daily_summary"],
  }, tokenHeaders);

  assert.equal(register.res.statusCode, 201);
  assert.equal(register.body.ok, true);
  assert.equal(register.body.workspace.projectRootLabel, "game");
  assert.equal(register.body.workspace.session.centralUrl, "https://home-ai.example.com/control");

  const dispatch = await callOwner(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards", {
    taskCardId: "rmw_card_1",
    idempotencyKey: "owner-request-1",
    title: "Implement local feature",
    bodyMarkdown: "Bounded task body",
  });
  const duplicateDispatch = await callOwner(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards", {
    taskCardId: "rmw_card_2",
    idempotencyKey: "owner-request-1",
    title: "Duplicate",
  });

  assert.equal(dispatch.res.statusCode, 202);
  assert.equal(dispatch.body.taskCard.taskCardId, "rmw_card_1");
  assert.equal(duplicateDispatch.body.duplicate, true);
  assert.equal(duplicateDispatch.body.taskCard.taskCardId, "rmw_card_1");

  const poll = await callNode(routes, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll?limit=4", {}, tokenHeaders);
  assert.equal(poll.res.statusCode, 200);
  assert.equal(poll.body.count, 1);
  assert.equal(poll.body.taskCards[0].bodyMarkdown, "Bounded task body");
  assert.equal(poll.body.session.state, "connected");
  assert.equal(poll.body.poll.mode, "poll");

  const ack = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards/rmw_card_1/ack", {
    leaseId: "lease-1",
  }, tokenHeaders);
  assert.equal(ack.body.taskCard.status, "acknowledged");

  const heartbeat = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards/rmw_card_1/heartbeat", {
    progress: { step: "running", rawLogs: "private log" },
  }, tokenHeaders);
  assert.equal(heartbeat.body.privacy.redacted >= 1, true);

  const terminal = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards/rmw_card_1/return", {
    status: "completed",
    summary: "Done",
    evidence: { tests: ["npm test"], endpointBody: "private body" },
  }, tokenHeaders);
  assert.equal(terminal.body.taskCard.status, "completed");
  assert.equal(terminal.body.privacy.redacted >= 1, true);

  const summary = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/daily-summary", {
    summary: "Daily bounded summary",
    accessKey: "private",
  }, tokenHeaders);
  assert.equal(summary.body.dailySummary.privacy.redacted >= 1, true);

  const escalation = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/escalations", {
    severity: "high",
    summary: "Needs architecture help",
    screenshot: "private",
  }, tokenHeaders);
  assert.equal(escalation.res.statusCode, 202);
  assert.equal(escalation.body.escalationCount, 1);

  const status = await callOwner(routes, "GET", "/api/remote-managed-workspaces/status");
  assert.equal(status.body.count, 1);
  assert.equal(status.body.workspaces[0].activeTaskCardCount, 0);
  assert.equal(status.body.controlPlane.sessionDesign, "bounded_long_poll");
  assert.equal(status.body.controlPlane.enrollment.state, "ok");
  assert.equal(status.body.workspaces[0].latestDailySummary.summary, "Daily bounded summary");
  assert.equal(status.body.workspaces[0].escalationCount, 1);
}

async function testLongPollRouteWaitsAndDispatchWakesNodeSession() {
  const { routes } = createHarness();
  const tokenHeaders = { authorization: "Bearer enroll-secret" };
  await callNode(routes, "POST", "/api/remote-managed-workspaces/register", {
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    nodeName: "son-macbook",
    centralUrl: "https://home-ai.example.com",
    capabilities: ["task_cards"],
  }, tokenHeaders);

  const waitingPoll = callNode(routes, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll?limit=4&waitMs=1000", {}, tokenHeaders);
  const waitingStatus = await callOwner(routes, "GET", "/api/remote-managed-workspaces/status");
  assert.equal(waitingStatus.body.workspaces[0].workspace.session.state, "connected");
  assert.equal(waitingStatus.body.workspaces[0].workspace.session.activeLongPollCount, 1);

  await callOwner(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards", {
    taskCardId: "rmw_card_long_poll",
    title: "Wake long poll",
    bodyMarkdown: "Wake via owner dispatch.",
  });
  const poll = await waitingPoll;
  assert.equal(poll.res.statusCode, 200);
  assert.equal(poll.body.count, 1);
  assert.equal(poll.body.taskCards[0].taskCardId, "rmw_card_long_poll");
  assert.equal(poll.body.poll.mode, "long_poll");
  assert.equal(poll.body.poll.notified, true);
  assert.equal(poll.body.session.activeLongPollCount, 0);
  await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/task-cards/rmw_card_long_poll/ack", {
    leaseId: "lease-long-poll",
  }, tokenHeaders);

  const timedOut = await callNode(routes, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll?waitMs=5", {}, tokenHeaders);
  assert.equal(timedOut.body.count, 0);
  assert.equal(timedOut.body.poll.timedOut, true);
  assert.equal(timedOut.body.poll.mode, "long_poll");
}

async function testSessionConfigInvalidAndAuthFailureAreBounded() {
  const { routes } = createHarness();
  const tokenHeaders = { authorization: "Bearer enroll-secret" };
  const register = await callNode(routes, "POST", "/api/remote-managed-workspaces/register", {
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    centralUrl: "not-a-url",
  }, tokenHeaders);
  assert.equal(register.body.workspace.session.state, "config_invalid");
  assert.equal(register.body.workspace.session.centralUrl, "");

  const repaired = await callNode(routes, "POST", "/api/remote-managed-workspaces/son-vite-game/node-heartbeat", {
    centralUrl: "https://home-ai.example.com",
  }, tokenHeaders);
  assert.equal(repaired.body.workspace.session.state, "connected");
  assert.equal(repaired.body.workspace.session.configIssueCode, "");

  const badPoll = await callNode(routes, "GET", "/api/remote-managed-workspaces/son-vite-game/task-cards/poll", {}, {
    authorization: "Bearer wrong",
  });
  assert.equal(badPoll.res.statusCode, 403);
  assert.equal(badPoll.body.code, "remote_managed_workspace_token_invalid");
  const status = await callOwner(routes, "GET", "/api/remote-managed-workspaces/son-vite-game/status");
  assert.equal(status.body.workspaces[0].workspace.session.state, "auth_failed");
  assert.equal(status.body.workspaces[0].workspace.session.failureCode, "remote_managed_workspace_token_invalid");
  assert.doesNotMatch(JSON.stringify(status.body), /enroll-secret|Bearer wrong/);
}

async function testOwnerRoutesRequireOwnerAndNodeHandlerSkipsOwnerStatus() {
  const { routes } = createHarness();
  const nodeAttempt = await callNode(routes, "GET", "/api/remote-managed-workspaces/status", {}, {
    authorization: "Bearer enroll-secret",
  });
  assert.equal(nodeAttempt.result.handled, false);
  assert.equal(nodeAttempt.res.statusCode, 0);

  const ownerDenied = await callOwner(routes, "GET", "/api/remote-managed-workspaces/status", {}, false);
  assert.equal(ownerDenied.result.handled, true);
  assert.equal(ownerDenied.res.statusCode, 403);
  assert.equal(ownerDenied.body.error, "Owner required");
}

async function run() {
  await testMissingEnrollmentConfigReturns503();
  await testNodeTokenRoutesFailClosedOnBadToken();
  await testFullNodeAndOwnerRouteFlow();
  await testLongPollRouteWaitsAndDispatchWakesNodeSession();
  await testSessionConfigInvalidAndAuthFailureAreBounded();
  await testOwnerRoutesRequireOwnerAndNodeHandlerSkipsOwnerStatus();
  console.log("remote managed workspace api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
