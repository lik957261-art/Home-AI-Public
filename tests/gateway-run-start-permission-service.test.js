"use strict";

const assert = require("node:assert/strict");

const {
  createGatewayRunStartPermissionService,
} = require("../adapters/gateway-run-start-permission-service");

function testCompleteModelPermissionRequestProjectsTerminalElevationState() {
  const calls = [];
  const service = createGatewayRunStartPermissionService({
    nowIso: () => "2026-06-08T00:00:00.000Z",
    removeThreadActiveRun: (thread, runId, idleStatus) => calls.push({ type: "remove", threadId: thread.id, runId, idleStatus }),
    appendRunStartEvent: (thread, assistant, event, preview) => calls.push({ type: "event", threadId: thread.id, assistantId: assistant.id, event, preview }),
    permissionSelectionPreview: (selection) => JSON.stringify({ scope: selection.elevationScope, reason: selection.elevationReason }),
    saveState: (next, options) => calls.push({ type: "save", next, options }),
    broadcastMessageUpdated: (thread, assistant) => calls.push({ type: "broadcast", threadId: thread.id, status: assistant.status }),
  });
  const thread = { id: "thread_1", status: "running" };
  const assistant = { id: "assistant_1", status: "running" };

  const result = service.completeModelPermissionRequest({
    thread,
    assistantMessage: assistant,
    taskId: "run_1",
    selection: {
      elevationScope: "owner_high_privilege",
      elevationReason: "outside current workspace",
      elevationSource: "model_toolset_permission_selector",
    },
    gatewayUrl: "http://worker.gateway",
    gatewayTarget: {
      name: "lowgw1",
      profile: "lowgw1",
      source: "worker_pool",
    },
  });

  assert.deepEqual(result, {
    run_id: "run_1",
    status: "needs_elevation",
    engine: "responses",
    gatewayUrl: "http://worker.gateway",
    gatewayName: "lowgw1",
    gatewayProfile: "lowgw1",
    gatewaySource: "worker_pool",
  });
  assert.equal(thread.status, "idle");
  assert.equal(thread.updatedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(assistant.status, "done");
  assert.equal(assistant.elevationRequired, true);
  assert.equal(assistant.elevationScope, "owner_high_privilege");
  assert.equal(assistant.elevationReason, "outside current workspace");
  assert.equal(assistant.elevationSource, "model_toolset_permission_selector");
  assert.equal(assistant.firstFeedbackAt, "2026-06-08T00:00:00.000Z");
  assert.equal(assistant.completedAt, "2026-06-08T00:00:00.000Z");
  assert.match(assistant.content, /Owner \u6388\u6743/);
  assert.deepEqual(calls.map((item) => item.type), ["remove", "event", "save", "broadcast"]);
  assert.deepEqual(calls[0], { type: "remove", threadId: "thread_1", runId: "run_1", idleStatus: "idle" });
  assert.equal(calls[1].event, "run.permission_required");
  assert.equal(calls[2].options.reason, "run-request-preparing");
  assert.equal(calls[2].options.skipSqliteRuntimeReplace, true);
}

function testCompleteModelPermissionRequestUsesDefaultsAndPreservesFirstFeedbackAt() {
  const service = createGatewayRunStartPermissionService({
    nowIso: () => "2026-06-08T00:00:00.000Z",
  });
  const assistant = { firstFeedbackAt: "2026-06-07T00:00:00.000Z" };

  const result = service.completeModelPermissionRequest({
    thread: {},
    assistantMessage: assistant,
    taskId: "run_2",
    selection: {},
  });

  assert.equal(result.status, "needs_elevation");
  assert.equal(result.gatewayUrl, "");
  assert.equal(assistant.elevationScope, "owner_high_privilege");
  assert.equal(assistant.elevationReason, "This request needs Owner approval before Hermes Mobile can run it.");
  assert.equal(assistant.elevationSource, "model_toolset_permission_selector");
  assert.equal(assistant.firstFeedbackAt, "2026-06-07T00:00:00.000Z");
}

testCompleteModelPermissionRequestProjectsTerminalElevationState();
testCompleteModelPermissionRequestUsesDefaultsAndPreservesFirstFeedbackAt();
console.log("gateway run start permission service tests passed");
