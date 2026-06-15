"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartEventService } = require("../adapters/gateway-run-start-event-service");

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    events: [],
  };
  const service = createGatewayRunStartEventService({
    nowMs: () => 1778806923000,
    addThreadEvent: (thread, event) => {
      thread.events = Array.isArray(thread.events) ? thread.events : [];
      thread.events.push(event);
      calls.events.push(event);
    },
    broadcast: (payload) => calls.broadcasts.push(payload),
    gatewayHealthDiagnosticService: overrides.gatewayHealthDiagnosticService,
    threadSummary: (thread) => ({ id: thread.id, status: thread.status }),
  });
  return { calls, service };
}

function testAppendGatewaySchedulerEventTriggersHealthDiagnosticOnlyForHealthFailures() {
  const diagnosticCalls = [];
  const { service } = makeHarness({
    gatewayHealthDiagnosticService: {
      triggerGatewayWorkerFailureDiagnostic: (input) => diagnosticCalls.push(input),
    },
  });
  const thread = { id: "thread_1", status: "running" };

  service.appendGatewaySchedulerEvent(thread, "run_2", {
    event: "run.gateway_worker_start_failed",
    profileId: "owner-low-1",
    failureCode: "invalid_key",
  });
  service.appendGatewaySchedulerEvent(thread, "run_3", {
    event: "run.gateway_worker_start_failed",
    profileId: "owner-low-2",
    failureCode: "health_check_failed",
  });

  assert.equal(diagnosticCalls.length, 1);
  assert.equal(diagnosticCalls[0].thread, thread);
  assert.equal(diagnosticCalls[0].runId, "run_3");
  assert.equal(diagnosticCalls[0].event.profileId, "owner-low-2");
}

function testAppendRunStartEventBroadcastsLatestThreadEvent() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };
  const assistant = { runId: "run_1" };

  service.appendRunStartEvent(thread, assistant, "run.context_ready", "ready");

  assert.deepEqual(calls.events[0], {
    event: "run.context_ready",
    timestamp: 1778806923,
    runId: "run_1",
    tool: "hermes_mobile",
    preview: "ready",
    error: false,
  });
  assert.deepEqual(calls.broadcasts[0], {
    type: "run.event",
    threadId: "thread_1",
    runId: "run_1",
    event: calls.events[0],
    thread: { id: "thread_1", status: "running" },
  });
}

function testAppendGatewaySchedulerEventKeepsBoundedDiagnostics() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };

  service.appendGatewaySchedulerEvent(thread, "run_2", { event: "worker_noise" });
  service.appendGatewaySchedulerEvent(thread, "run_2", {
    event: "run.gateway_worker_start_failed",
    timestampMs: 1778807000000,
    reason: "cold_start",
    profileId: "owner-low-1",
    provider: "openai",
    workspaceId: "owner",
    permissionTier: "low",
    state: "failed",
    queueDepth: 3,
    lastStartDurationMs: 2200,
    lastFailureCode: "invalid_key",
    diagnostic: "x".repeat(220),
  });

  assert.equal(calls.events.length, 1);
  const event = calls.events[0];
  assert.equal(event.event, "run.gateway_worker_start_failed");
  assert.equal(event.timestamp, 1778807000);
  assert.equal(event.error, true);
  const preview = JSON.parse(event.preview);
  assert.equal(preview.profileId, "owner-low-1");
  assert.equal(preview.queueDepth, 3);
  assert.equal(preview.lastStartDurationMs, 2200);
  assert.equal(preview.failureCode, "invalid_key");
  assert.equal(preview.diagnostic.length, 160);
}

function testAppendPluginCapabilityProbeEventsPublishesAvailableAndUnavailable() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };
  const assistant = { taskId: "run_3" };

  service.appendPluginCapabilityProbeEvents(thread, assistant, [
    { pluginId: "finance", toolset: "finance", ok: true, gatewayProfile: "finance-low", durationMs: 50 },
    { plugin_id: "wardrobe", toolset: "wardrobe", status: "missing", diagnostic: "gateway_worker_missing_toolset" },
    { pluginId: "", toolset: "ignored" },
  ]);

  assert.deepEqual(calls.events.map((event) => event.event), [
    "plugin_capability_activated",
    "plugin_capability_unavailable",
  ]);
  assert.equal(calls.events[0].error, false);
  assert.equal(JSON.parse(calls.events[0].preview).gatewayProfile, "finance-low");
  assert.equal(calls.events[1].error, true);
  assert.equal(JSON.parse(calls.events[1].preview).diagnostic, "gateway_worker_missing_toolset");
  assert.equal(calls.broadcasts.length, 2);
}

function testAppendRequiredSkillPreloadEventsSkipsMissingSkills() {
  const { calls, service } = makeHarness();
  const thread = { id: "thread_1", status: "running" };
  const assistant = { runId: "run_4" };

  service.appendRequiredSkillPreloadEvents(thread, assistant, {
    requiredSkillPreloads: [
      { path: "productivity/wardrobe-style-operations", profileId: "owner-full" },
      { path: "missing/skill", missing: true, error: "not found" },
    ],
  });

  assert.equal(calls.events.length, 1);
  assert.deepEqual(calls.events[0], {
    event: "run.skill_preloaded",
    timestamp: 1778806923,
    runId: "run_4",
    tool: "skill_view",
    preview: JSON.stringify({
      name: "productivity/wardrobe-style-operations",
      source: "required_preload",
    }),
    error: false,
  });
  assert.deepEqual(calls.broadcasts, [
    { type: "thread.updated", thread: { id: "thread_1", status: "running" } },
  ]);
}

function testPreviewAndRoutingProjectionHelpers() {
  const { service } = makeHarness();
  const selection = {
    reason: "model_selected",
    selectedToolsets: ["file", "web"],
    authorizedToolsets: ["file", "web", "finance"],
    durationMs: 35,
  };

  assert.equal(
    service.contextReadyPreview({ conversationHistorySummary: { messageCount: 3, estimatedChars: 42 } }),
    "\u4e0a\u4e0b\u6587 3 \u6761\uff0c\u7ea6 42 \u5b57",
  );
  assert.equal(
    service.gatewaySelectedPreview(
      { profile: "owner-low", provider: "openai" },
      { body: { model: "gpt-test" } },
    ),
    "owner-low \u00b7 gpt-test \u00b7 openai",
  );
  assert.deepEqual(service.toolsetSelectionRouting(selection, ["file", "web"]), {
    mode: "model_first",
    reason: "model_selected",
    selected_toolsets: ["file", "web"],
    omitted_authorized_toolsets: ["finance"],
    authorized_toolset_count: 3,
    duration_ms: 35,
    toolset_selection_disabled: false,
  });
  assert.deepEqual(JSON.parse(service.toolsetSelectionPreview(selection, ["file", "web"])), {
    selected_toolsets: ["file", "web"],
    duration_ms: 35,
    reason: "model_selected",
    toolset_selection_disabled: false,
  });
  assert.deepEqual(JSON.parse(service.toolsetSelectionFallbackPreview({
    reason: "selector_timeout",
    durationMs: 7000,
    error: "x".repeat(250),
  })), {
    reason: "selector_timeout",
    duration_ms: 7000,
    error: "x".repeat(180),
  });
  assert.equal(service.preflightResultEventName({}, true), "run.toolset_selection_done");
  assert.equal(service.preflightResultEventName({}, false), "run.toolset_selection_failed");
  assert.equal(
    service.preflightResultEventName({ toolsetSelectionDisabled: true }, true),
    "run.permission_preflight_done",
  );
  assert.deepEqual(JSON.parse(service.permissionSelectionPreview({
    elevationScope: "owner_maintenance",
    elevationReason: "needs_file_write",
    durationMs: 18,
  })), {
    scope: "owner_maintenance",
    reason: "needs_file_write",
    duration_ms: 18,
  });
}

testAppendRunStartEventBroadcastsLatestThreadEvent();
testAppendGatewaySchedulerEventKeepsBoundedDiagnostics();
testAppendGatewaySchedulerEventTriggersHealthDiagnosticOnlyForHealthFailures();
testAppendPluginCapabilityProbeEventsPublishesAvailableAndUnavailable();
testAppendRequiredSkillPreloadEventsSkipsMissingSkills();
testPreviewAndRoutingProjectionHelpers();

console.log("gateway run start event service tests passed");
