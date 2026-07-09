"use strict";

const assert = require("node:assert/strict");
const {
  RemoteManagedWorkspaceError,
  createRemoteManagedWorkspaceService,
} = require("../adapters/remote-managed-workspace-service");

function createHarness(options = {}) {
  let nowMs = Date.parse("2026-07-08T00:00:00.000Z");
  let seq = 0;
  let saveCount = 0;
  const backingState = options.backingState || {};
  const service = createRemoteManagedWorkspaceService({
    enrollments: options.enrollments || {
      "son-vite-game": {
        token: "enroll-secret",
        nodeId: "node-a",
        nodeName: "son-macbook",
        projectType: "vite_game",
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
    saveState() {
      saveCount += 1;
    },
    staleAfterMs: options.staleAfterMs || 1000,
    offlineAfterMs: options.offlineAfterMs || 4000,
    defaultLongPollWaitMs: options.defaultLongPollWaitMs || 25,
    state() {
      return backingState;
    },
  });
  return {
    backingState,
    credential: { token: "enroll-secret" },
    saveCount: () => saveCount,
    service,
    tick(ms) {
      nowMs += ms;
    },
  };
}

function assertRemoteError(fn, status, code) {
  assert.throws(
    fn,
    (err) => {
      assert.ok(err instanceof RemoteManagedWorkspaceError);
      assert.equal(err.status, status);
      assert.equal(err.code, code);
      return true;
    },
  );
}

function testMissingEnrollmentConfigFailsClosed() {
  const service = createRemoteManagedWorkspaceService({
    env: {},
    state: () => ({}),
  });

  assertRemoteError(
    () => service.registerNode({ workspaceId: "son-vite-game", nodeId: "node-a" }, { token: "anything" }),
    503,
    "remote_managed_workspace_enrollment_token_unconfigured",
  );
}

function testRegisterStoresBoundedWorkspaceMetadataOnly() {
  const harness = createHarness();
  const result = harness.service.registerNode({
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    nodeName: "son-macbook",
    projectType: "vite_game",
    projectRoot: "/Users/example/path",
    centralUrl: "https://home-ai.example.com/control?enrollmentToken=private",
    roles: ["external_project_main", "external_project_worker", "external_project_worker"],
    capabilities: ["task_cards", "daily_summary", "vite_preview"],
    contractVersion: "remote-managed-workspace-v1",
  }, harness.credential);

  assert.equal(result.ok, true);
  assert.equal(result.workspace.workspaceId, "son-vite-game");
  assert.equal(result.workspace.status, "online");
  assert.equal(result.workspace.session.state, "connecting");
  assert.equal(result.workspace.session.centralUrl, "https://home-ai.example.com/control");
  assert.equal(result.workspace.projectRootLabel, "game");
  assert.deepEqual(result.workspace.roles, ["external_project_main", "external_project_worker"]);
  assert.equal(JSON.stringify(harness.backingState.remoteManagedWorkspaces).includes("/Users/example/path"), false);
  assert.equal(harness.saveCount() > 0, true);
}

function testInvalidTokenAndNodeMismatchFailClosed() {
  const harness = createHarness();
  assertRemoteError(
    () => harness.service.registerNode({ workspaceId: "son-vite-game", nodeId: "node-a" }, { token: "wrong" }),
    403,
    "remote_managed_workspace_token_invalid",
  );
  assertRemoteError(
    () => harness.service.registerNode({ workspaceId: "son-vite-game", nodeId: "node-b" }, harness.credential),
    403,
    "remote_managed_workspace_node_mismatch",
  );
}

function testTaskCardLifecycleAndIdempotency() {
  const harness = createHarness();
  harness.service.registerNode({
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    capabilities: ["task_cards", "task_card_heartbeat"],
  }, harness.credential);

  const firstDispatch = harness.service.dispatchTaskCard("son-vite-game", {
    taskCardId: "rmw_card_1",
    idempotencyKey: "owner-request-1",
    title: "Implement local game feature",
    summary: "Bounded local task",
    bodyMarkdown: "Use local project only.",
  }, { ownerWorkspaceId: "owner" });
  const duplicateDispatch = harness.service.dispatchTaskCard("son-vite-game", {
    taskCardId: "rmw_card_duplicate",
    idempotencyKey: "owner-request-1",
    title: "Duplicate",
  }, { ownerWorkspaceId: "owner" });

  assert.equal(firstDispatch.ok, true);
  assert.equal(firstDispatch.duplicate, false);
  assert.equal(duplicateDispatch.duplicate, true);
  assert.equal(duplicateDispatch.taskCard.taskCardId, "rmw_card_1");

  const poll = harness.service.pollTaskCards("son-vite-game", { limit: 10 }, harness.credential);
  assert.equal(poll.count, 1);
  assert.equal(poll.taskCards[0].bodyMarkdown, "Use local project only.");
  assert.equal(poll.poll.mode, "poll");
  assert.equal(poll.session.state, "connected");

  const ack = harness.service.ackTaskCard("son-vite-game", "rmw_card_1", { leaseId: "lease-1" }, harness.credential);
  assert.equal(ack.taskCard.status, "acknowledged");
  assert.equal(ack.taskCard.executionLease.leaseId, "lease-1");

  const heartbeat = harness.service.heartbeatTaskCard("son-vite-game", "rmw_card_1", {
    progress: {
      step: "running tests",
      rawLogs: "private log body",
      path: "/Users/example/path",
    },
  }, harness.credential);
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.privacy.redacted >= 1, true);

  const terminal = harness.service.returnTaskCard("son-vite-game", "rmw_card_1", {
    status: "completed",
    title: "Completed",
    summary: "Local task finished",
    evidence: {
      tests: ["npm test"],
      secretToken: "must-not-return",
      artifactPath: "/Users/example/path",
    },
  }, harness.credential);
  assert.equal(terminal.taskCard.status, "completed");
  assert.equal(terminal.privacy.redacted >= 1, true);

  const duplicateReturn = harness.service.returnTaskCard("son-vite-game", "rmw_card_1", {
    status: "blocked",
    summary: "Should not overwrite",
  }, harness.credential);
  assert.equal(duplicateReturn.duplicate, true);
  assert.equal(duplicateReturn.taskCard.status, "completed");

  const afterReturnPoll = harness.service.pollTaskCards("son-vite-game", { limit: 10 }, harness.credential);
  assert.equal(afterReturnPoll.count, 0);
}

function testDailySummaryEscalationAndStaleStatus() {
  const harness = createHarness();
  harness.service.registerNode({
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    projectRootLabel: "Game",
    capabilities: ["daily_summary", "escalation"],
  }, harness.credential);
  harness.service.recordDailySummary("son-vite-game", {
    summary: "Implemented two low-risk local tweaks.",
    rawLogs: "private log body",
  }, harness.credential);
  harness.service.recordEscalation("son-vite-game", {
    severity: "high",
    summary: "Architecture review requested.",
    cookie: "private-cookie",
  }, harness.credential);

  let status = harness.service.status("son-vite-game");
  assert.equal(status.count, 1);
  assert.equal(status.workspaces[0].workspace.status, "online");
  assert.equal(status.workspaces[0].latestDailySummary.privacy.redacted >= 1, true);
  assert.equal(status.workspaces[0].escalationCount, 1);
  assert.equal(status.workspaces[0].latestEscalation.privacy.redacted >= 1, true);

  harness.tick(1500);
  status = harness.service.status("son-vite-game");
  assert.equal(status.workspaces[0].workspace.status, "stale");
  assert.equal(status.workspaces[0].workspace.session.state, "stale");

  harness.tick(3000);
  status = harness.service.status("son-vite-game");
  assert.equal(status.workspaces[0].workspace.session.state, "offline");
}

async function testLongPollSessionWakesOnDispatchAndTimeoutFallsBack() {
  const harness = createHarness();
  harness.service.registerNode({
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    centralUrl: "https://home-ai.example.com",
    capabilities: ["task_cards"],
  }, harness.credential);

  const waiting = harness.service.pollTaskCards("son-vite-game", { limit: 3, waitMs: 1000 }, harness.credential);
  assert.equal(typeof waiting.then, "function");

  let status = harness.service.status("son-vite-game");
  assert.equal(status.controlPlane.outboundOnly, true);
  assert.equal(status.controlPlane.sessionDesign, "bounded_long_poll");
  assert.equal(status.controlPlane.pollFallback, true);
  assert.equal(status.workspaces[0].workspace.session.state, "connected");
  assert.equal(status.workspaces[0].workspace.session.activeLongPollCount, 1);

  harness.service.dispatchTaskCard("son-vite-game", {
    taskCardId: "rmw_card_long_poll",
    title: "Long poll wake",
  });
  const awakened = await waiting;
  assert.equal(awakened.count, 1);
  assert.equal(awakened.taskCards[0].taskCardId, "rmw_card_long_poll");
  assert.equal(awakened.poll.mode, "long_poll");
  assert.equal(awakened.poll.notified, true);
  assert.equal(awakened.session.state, "connected");
  harness.service.ackTaskCard("son-vite-game", "rmw_card_long_poll", { leaseId: "lease-long-poll" }, harness.credential);

  const timeoutPoll = await harness.service.pollTaskCards("son-vite-game", { waitMs: 5 }, harness.credential);
  assert.equal(timeoutPoll.count, 0);
  assert.equal(timeoutPoll.poll.timedOut, true);
  assert.equal(timeoutPoll.poll.mode, "long_poll");
}

function testSessionAuthFailedAndConfigInvalidAreVisible() {
  const harness = createHarness();
  const invalidCentral = harness.service.registerNode({
    workspaceId: "son-vite-game",
    nodeId: "node-a",
    centralUrl: "not a url",
  }, harness.credential);
  assert.equal(invalidCentral.workspace.session.state, "config_invalid");
  assert.equal(invalidCentral.workspace.session.configIssueCode, "remote_managed_workspace_central_url_invalid");

  const repaired = harness.service.nodeHeartbeat("son-vite-game", {
    centralUrl: "https://home-ai.example.com",
  }, harness.credential);
  assert.equal(repaired.workspace.session.state, "connected");
  assert.equal(repaired.workspace.session.configIssueCode, "");

  assertRemoteError(
    () => harness.service.pollTaskCards("son-vite-game", {}, { token: "wrong" }),
    403,
    "remote_managed_workspace_token_invalid",
  );
  const status = harness.service.status("son-vite-game");
  assert.equal(status.workspaces[0].workspace.session.state, "auth_failed");
  assert.equal(status.workspaces[0].workspace.session.failureCode, "remote_managed_workspace_token_invalid");
}

async function run() {
  testMissingEnrollmentConfigFailsClosed();
  testRegisterStoresBoundedWorkspaceMetadataOnly();
  testInvalidTokenAndNodeMismatchFailClosed();
  testTaskCardLifecycleAndIdempotency();
  testDailySummaryEscalationAndStaleStatus();
  await testLongPollSessionWakesOnDispatchAndTimeoutFallsBack();
  testSessionAuthFailedAndConfigInvalidAreVisible();
  console.log("remote managed workspace service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
