"use strict";

const assert = require("node:assert/strict");
const {
  createHermesCodexMuxService,
  sanitizePayload,
} = require("../adapters/hermes-codex-mux-service");

function testTaskEventAndHeartbeatLoop() {
  const service = createHermesCodexMuxService();
  const task = service.upsertTask({
    taskId: "hermes-codex-mux-v1",
    title: "Mux bridge",
    status: "open",
    workspace: "C:\\Users\\xuxin\\Documents\\Agent",
    assignedWorker: "codex-hermes-main",
    capsule: { taskId: "hermes-codex-mux-v1", assignedWorker: "codex-hermes-main" },
  });
  assert.equal(task.taskId, "hermes-codex-mux-v1");

  assert.equal(service.listTasks({ assignedWorker: "codex-hermes-main", status: "open,running" }).length, 1);
  assert.equal(service.getTask("hermes-codex-mux-v1").capsule.assignedWorker, "codex-hermes-main");

  const heartbeat = service.recordHeartbeat("codex-hermes-main", {
    bridgeId: "hermes-mobile-codex-main",
    workspace: "C:\\Users\\xuxin\\Documents\\Agent",
    mode: "sticky",
    capabilities: ["codex.workspace.preflight"],
    currentTaskId: "hermes-codex-mux-v1",
  });
  assert.equal(heartbeat.currentTaskId, "hermes-codex-mux-v1");
  assert.equal(service.getHeartbeat("codex-hermes-main").capabilities[0], "codex.workspace.preflight");

  const event = service.appendEvent("hermes-codex-mux-v1", {
    type: "worker.preflight.completed",
    from: "codex",
    workerId: "codex-hermes-main",
    status: "ready",
    summary: "Preflight completed.",
    payload: { noSecrets: true, token: "raw-token" },
  });
  assert.equal(event.schema, "hermes-codex-mux.event.v1");
  assert.equal(event.payload.noSecrets, true);
  assert.equal(event.payload.token, "[redacted]");
  assert.equal(service.listEvents("hermes-codex-mux-v1").length, 1);
}

function testAssistanceEventPreservesRequestId() {
  const service = createHermesCodexMuxService();
  service.upsertTask({ taskId: "task-1", assignedWorker: "codex-hermes-main" });
  const event = service.appendEvent("task-1", {
    type: "assistance.requested",
    from: "codex",
    workerId: "codex-hermes-main",
    payload: {
      requestId: "req_1",
      capability: "hermes.production.status.query",
      constraints: {
        noSecrets: true,
        noFullLearnerContent: true,
        noLongLogs: true,
      },
    },
  });
  assert.equal(event.requestId, "req_1");
  assert.equal(event.payload.constraints.noSecrets, true);
}

function testUnsupportedEventTypeFailsClosed() {
  const service = createHermesCodexMuxService();
  service.upsertTask({ taskId: "task-1" });
  assert.throws(
    () => service.appendEvent("task-1", { type: "remote.shell", from: "hermes" }),
    /Unsupported Mux event type/,
  );
}

function testPayloadSanitizerBoundsValues() {
  const sanitized = sanitizePayload({
    AccessKey: "abc",
    noSecrets: true,
    nested: { password: "secret", keep: "x".repeat(5000) },
  });
  assert.equal(sanitized.AccessKey, "[redacted]");
  assert.equal(sanitized.noSecrets, true);
  assert.equal(sanitized.nested.password, "[redacted]");
  assert.match(sanitized.nested.keep, /\[truncated/);
}

function run() {
  testTaskEventAndHeartbeatLoop();
  testAssistanceEventPreservesRequestId();
  testUnsupportedEventTypeFailsClosed();
  testPayloadSanitizerBoundsValues();
  console.log("hermes-codex-mux-service tests passed");
}

run();
