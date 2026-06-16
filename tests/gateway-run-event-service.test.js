"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunEventService,
  extractCompletedOutput,
  findRunTargetInState,
} = require("../adapters/gateway-run-event-service");

function makeHarness(overrides = {}) {
  const thread = {
    id: "thread_1",
    workspaceId: "owner",
    status: "running",
    activeRunId: "public_run",
    activeRunIds: ["public_run"],
    updatedAt: "old",
    messages: [
      { id: "user_1", role: "user", content: "Prompt", status: "done", taskGroupId: "chat" },
      {
        id: "assistant_1",
        role: "assistant",
        content: "",
        status: "running",
        runId: "public_run",
        taskGroupId: "chat",
        artifacts: [],
      },
    ],
    events: [],
  };
  const state = { threads: [thread], artifacts: [] };
  const activeStreams = new Map([[
    "public_run",
    {
      threadId: thread.id,
      messageId: "assistant_1",
      startedAt: 1000,
      lastEventAt: 1000,
    },
  ]]);
  const calls = {
    broadcasts: [],
    enqueued: [],
    compacted: [],
    notified: [],
    scheduled: [],
    saved: 0,
    usage: [],
  };
  const service = createGatewayRunEventService(Object.assign({
    state: () => state,
    activeStreams,
    nowIso: () => "2026-05-15T01:02:03.000Z",
    nowMs: () => 2000,
    maxMessageChars: 50,
    streamingSaveThrottleMs: 0,
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, content: message.content, runId: message.runId }),
    threadSummary: (item) => ({ id: item.id, status: item.status, activeRunIds: item.activeRunIds || [] }),
    addThreadEvent: (item, event) => {
      item.events = item.events || [];
      item.events.push({
        event: event.event || event.type,
        runId: event.runId || event.run_id || "",
        tool: event.tool || null,
        preview: event.preview || event.text || event.error || "",
        error: Boolean(event.error),
      });
    },
    registerArtifactsFromText: (item, message, text) => (/MEDIA:/.test(text) ? [{ id: "artifact_1", name: "report.pdf" }] : []),
    supplementGatewayUsage: (usage, runId, message) => {
      calls.usage.push({ usage, runId, messageId: message.id });
      return Object.assign({ supplemented: true, runId }, usage || {});
    },
    modelPermissionApprovalRequest: overrides.modelPermissionApprovalRequest || (() => null),
    isOrdinaryToolSchemaElevationRequest: overrides.isOrdinaryToolSchemaElevationRequest || (() => false),
    stripPermissionApprovalMarkers: (text) => String(text || "").replace(/HERMES_PERMISSION_APPROVAL_REQUIRED[^\n]*/g, "").trim(),
    enqueueExternalDeliveryForTerminalMessage: (item, message, status) => calls.enqueued.push({ threadId: item.id, messageId: message.id, status }),
    notifyTaskTerminal: (item, message, status) => calls.notified.push({ threadId: item.id, messageId: message.id, status }),
    scheduleNextQueuedRunForTaskGroup: (item, taskGroupId) => calls.scheduled.push({ threadId: item.id, taskGroupId }),
    topicContextCompactionService: {
      compactTaskGroup: (item, taskGroupId, options) => calls.compacted.push({ threadId: item.id, taskGroupId, reason: options.reason }),
    },
  }, overrides));
  return { activeStreams, calls, message: thread.messages[1], service, state, thread };
}

function testPureTargetAndOutputHelpers() {
  const state = {
    threads: [
      { id: "t1", messages: [{ id: "m1", runId: "run_1" }] },
    ],
  };
  assert.deepEqual(findRunTargetInState(state, "run_1"), { threadId: "t1", messageId: "m1" });
  assert.equal(findRunTargetInState(state, "missing"), null);
  assert.equal(extractCompletedOutput({
    response: {
      output: [
        { type: "message", content: [{ type: "output_text", text: "hello" }] },
        { type: "tool_call", content: [{ type: "output_text", text: "skip" }] },
        { type: "message", content: [{ type: "output_text", text: "world" }] },
      ],
    },
  }), "hello\n\nworld");
}

function testResponseCreatedAliasesRunAndBroadcasts() {
  const { activeStreams, calls, message, service, thread } = makeHarness();
  const result = service.applyHermesRunEvent({
    event: "response.created",
    run_id: "public_run",
    response: { id: "real_response" },
  });

  assert.equal(result.action, "response_created");
  assert.equal(message.runId, "real_response");
  assert.equal(message.originalRunId, "public_run");
  assert.equal(message.responseRunId, "real_response");
  assert.equal(thread.activeRunId, "real_response");
  assert.deepEqual(thread.activeRunIds, ["real_response"]);
  assert.equal(activeStreams.get("real_response"), activeStreams.get("public_run"));
  assert.equal(activeStreams.get("public_run").realRunId, "real_response");
  assert.equal(activeStreams.get("public_run").lastEventAt, 2000);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "message.updated");
}

function testDeltaUpdatesMessageAndThread() {
  const { calls, message, service, thread } = makeHarness();
  const result = service.applyHermesRunEvent({ event: "message.delta", run_id: "public_run", delta: "partial" });

  assert.equal(result.action, "delta");
  assert.equal(message.content, "partial");
  assert.equal(message.firstFeedbackAt, "2026-05-15T01:02:03.000Z");
  assert.equal(thread.updatedAt, "2026-05-15T01:02:03.000Z");
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "message.delta");
  assert.equal(calls.broadcasts[0].delta, "partial");
}

function testStreamingDeltaSavesAreCoalesced() {
  let timerFn = null;
  let timerCleared = false;
  const harness = makeHarness({
    streamingSaveThrottleMs: 1200,
    setTimeout(fn, delay) {
      assert.equal(delay, 1200);
      timerFn = fn;
      return { unref() {} };
    },
    clearTimeout() {
      timerCleared = true;
      timerFn = null;
    },
  });
  harness.service.applyHermesRunEvent({ event: "message.delta", run_id: "public_run", delta: "a" });
  harness.service.applyHermesRunEvent({ event: "message.delta", run_id: "public_run", delta: "b" });
  assert.equal(harness.calls.saved, 0);
  assert.equal(harness.message.content, "ab");
  assert.equal(typeof timerFn, "function");
  timerFn();
  assert.equal(harness.calls.saved, 1);

  harness.service.applyHermesRunEvent({ event: "message.delta", run_id: "public_run", delta: "c" });
  assert.equal(harness.calls.saved, 1);
  harness.service.applyHermesRunEvent({ event: "response.completed", run_id: "public_run", output: "done" });
  assert.equal(timerCleared, true);
  assert.equal(harness.calls.saved, 2);
}

function testCompletedRunMutatesTerminalStateAndSchedulesQueue() {
  const { calls, message, service, thread } = makeHarness();
  message.content = "streamed fallback";
  const result = service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { output_tokens: 3 },
      output: [{ type: "message", content: [{ type: "output_text", text: "Final\nMEDIA:/tmp/report.pdf" }] }],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(message.status, "done");
  assert.equal(message.content, "Final\nMEDIA:/tmp/report.pdf");
  assert.deepEqual(message.artifacts, [{ id: "artifact_1", name: "report.pdf" }]);
  assert.deepEqual(thread.activeRunIds, []);
  assert.equal(thread.status, "idle");
  assert.equal(message.usage.supplemented, true);
  assert.deepEqual(calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
  assert.deepEqual(calls.compacted, [{ threadId: "thread_1", taskGroupId: "chat", reason: "run-completed" }]);
  assert.equal(calls.broadcasts.some((payload) => payload.type === "run.completed"), true);
}

function testDuplicateCompletedEventDoesNotNotifyTwice() {
  const { calls, service } = makeHarness();
  const first = service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      output: [{ type: "message", content: [{ type: "output_text", text: "Final" }] }],
    },
  });
  const second = service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      output: [{ type: "message", content: [{ type: "output_text", text: "Final" }] }],
    },
  });

  assert.equal(first.action, "completed");
  assert.equal(second.action, "terminal_ignored");
  assert.equal(calls.notified.length, 1);
  assert.equal(calls.enqueued.length, 1);
  assert.equal(calls.broadcasts.filter((payload) => payload.type === "run.completed").length, 1);
}

function testCompletedRunPersistsLoadedSkillReferences() {
  const { message, service, thread } = makeHarness();
  service.applyHermesRunEvent({
    event: "response.created",
    run_id: "public_run",
    response: { id: "real_response" },
  });
  thread.events.push({
    event: "response.output_item.added",
    runId: "public_run",
    tool: "skill_view",
    preview: "{\"name\":\"productivity/write\"}",
  });
  thread.events.push({
    event: "response.output_item.done",
    runId: "other_run",
    tool: "skill_view",
    preview: "{\"name\":\"productivity/ignore\"}",
  });

  const result = service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: { id: "real_response" },
    output: "Final",
  });

  assert.equal(result.action, "completed");
  assert.deepEqual(message.loadedSkills, [{
    id: "write",
    label: "write",
    path: "productivity/write",
    namespace: "productivity",
  }]);
}

function testOutputItemSkillPersistsBeforeCompletionAndSurvivesEventTrim() {
  const { message, service, thread } = makeHarness();

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      name: "skill_view",
      arguments: "{\"name\":\"productivity/write\"}",
    },
  });

  assert.deepEqual(message.loadedSkills, [{
    id: "write",
    label: "write",
    path: "productivity/write",
    namespace: "productivity",
  }]);

  thread.events = [];
  service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: { id: "public_run", usage: { input_tokens: 1, output_tokens: 2 } },
    output: "Final",
  });

  assert.deepEqual(message.loadedSkills, [{
    id: "write",
    label: "write",
    path: "productivity/write",
    namespace: "productivity",
  }]);
}

function testCompletedResponseOutputBackfillsLoadedSkillReferences() {
  const { message, service } = makeHarness();

  service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { input_tokens: 1, output_tokens: 2 },
      output: [
        { type: "function_call", name: "skill_view", arguments: "{\"name\":\"study-templates/english-weekly-challenge\"}" },
        { type: "message", content: [{ type: "output_text", text: "Final" }] },
      ],
    },
  });

  assert.deepEqual(message.loadedSkills, [{
    id: "english-weekly-challenge",
    label: "english-weekly-challenge",
    path: "study-templates/english-weekly-challenge",
    namespace: "study-templates",
  }]);
}

function testCompletedRunBackfillsLoadedToolsWithoutDefaultSkill() {
  const { message, service } = makeHarness();
  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      type: "function_call",
      name: "x_search",
      call_id: "call_1",
    },
  });
  service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { input_tokens: 1, output_tokens: 2 },
      output: [
        { type: "function_call", name: "x_search", call_id: "call_1" },
        { type: "message", content: [{ type: "output_text", text: "Final" }] },
      ],
    },
  });

  assert.deepEqual(message.loadedSkills, []);
  assert.deepEqual(message.loadedTools, [{ id: "x_search", name: "x_search", label: "x_search" }]);
}

function testHostedSearchOutputItemBackfillsToolTag() {
  const { message, service } = makeHarness();
  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      type: "web_search_call",
      id: "search_1",
    },
  });
  service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { input_tokens: 1, output_tokens: 2 },
      output: [
        { type: "web_search_call", id: "search_1" },
        { type: "message", content: [{ type: "output_text", text: "Final" }] },
      ],
    },
  });

  assert.deepEqual(message.loadedSkills, []);
  assert.deepEqual(message.loadedTools, [{ id: "web_search_call", name: "web_search_call", label: "web_search_call" }]);
}

function testCompletedRunUsageKeepsRequestedModelMetadata() {
  const { message, service } = makeHarness();
  message.runOptions = { model: "grok-4.3", provider: "xai-oauth", reasoning_effort: "xhigh" };

  service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { input_tokens: 1, output_tokens: 2 },
    },
    output: "Final",
  });

  assert.equal(message.usage.model, "grok-4.3");
  assert.equal(message.usage.provider, "xai-oauth");
  assert.equal(message.usage.model_provider, "xai-oauth");
  assert.equal(message.usage.reasoning_effort, "xhigh");
}

function testOutputItemEventsStoreReadableSummariesOnly() {
  const { service, thread } = makeHarness();
  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      type: "function_call_output",
      output: "[{\"type\":\"input_text\",\"text\":\"large raw tool output should not be stored\"}]",
    },
  });
  assert.equal(thread.events.at(-1).tool, "function_call_output");
  assert.equal(thread.events.at(-1).preview, "");

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      type: "function_call",
      name: "mobile_web_search",
      call_id: "call_search_1",
      arguments: "{\"query\":\"raw argument should not be stored\"}",
    },
  });
  assert.equal(thread.events.at(-1).tool, "function_call");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"mobile_web_search\",\"callId\":\"call_search_1\"}");
  assert(!thread.events.at(-1).preview.includes("raw argument"));

  service.applyHermesRunEvent({
    event: "response.output_item.done",
    run_id: "public_run",
    item: {
      type: "function_call_output",
      call_id: "call_search_1",
      output: "[{\"type\":\"input_text\",\"text\":\"large raw tool output should not be stored\"}]",
    },
  });
  assert.equal(thread.events.at(-1).tool, "function_call_output");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"mobile_web_search\",\"callId\":\"call_search_1\"}");
  assert(!thread.events.at(-1).preview.includes("large raw tool output"));

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    output_item: {
      type: "function_call",
      name: "schedule_task",
      call_id: "call_schedule_1",
      arguments: "{\"private\":\"raw argument should not be stored\"}",
    },
  });
  assert.equal(thread.events.at(-1).tool, "function_call");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"schedule_task\",\"callId\":\"call_schedule_1\"}");
  assert(!thread.events.at(-1).preview.includes("raw argument"));

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      name: "skill_view",
      arguments: "{\"name\":\"study-templates/learning-growth-card-creation\"}",
    },
  });
  assert.equal(thread.events.at(-1).tool, "skill_view");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"study-templates/learning-growth-card-creation\"}");

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      type: "function_call",
      name: "skill_view",
      arguments: "{\"name\":\"productivity/write\"}",
    },
  });
  assert.equal(thread.events.at(-1).tool, "skill_view");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"productivity/write\"}");
}

function testOutputItemEventsUseAliasedResponseRunId() {
  const { calls, message, service, thread } = makeHarness();
  service.applyHermesRunEvent({
    event: "response.created",
    run_id: "public_run",
    response: { id: "real_response" },
  });
  assert.equal(message.runId, "real_response");

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: {
      name: "skill_view",
      arguments: "{\"name\":\"productivity/write\"}",
    },
  });

  assert.equal(thread.events.at(-1).runId, "real_response");
  assert.equal(calls.broadcasts.at(-1).type, "run.event");
  assert.equal(calls.broadcasts.at(-1).runId, "real_response");
}

function testFinalMessageTelemetryDoesNotStoreResponseText() {
  const { service, thread } = makeHarness();

  service.applyHermesRunEvent({
    event: "response.output_item.added",
    run_id: "public_run",
    item: { type: "message", content: [{ type: "output_text", text: "private draft" }] },
  });
  assert.equal(thread.events.at(-2).event, "response.output_item.added");
  assert.equal(thread.events.at(-2).tool, "message");
  assert.equal(thread.events.at(-1).event, "run.final_message_started");
  assert.equal(thread.events.at(-1).preview, "");

  const result = service.applyHermesRunEvent({
    event: "response.output_text.done",
    run_id: "public_run",
    text: "private final response",
  });

  assert.equal(result.action, "final_message_done");
  assert.equal(thread.events.at(-1).event, "run.final_message_done");
  assert.equal(thread.events.at(-1).tool, "message");
  assert.equal(thread.events.at(-1).preview, "");
  assert.equal(thread.events.some((event) => /private/.test(event.preview || "")), false);
}

function testFailedAndCancelledRunsUseTerminalHelpers() {
  let harness = makeHarness();
  let result = harness.service.applyHermesRunEvent({ event: "run.failed", run_id: "public_run", error: { message: "gateway failed" } });
  assert.equal(result.action, "failed");
  assert.equal(harness.message.status, "failed");
  assert.equal(harness.message.error, "gateway failed");
  assert.equal(harness.thread.status, "failed");
  assert.equal(harness.calls.notified[0].status, "failed");
  assert.equal(harness.calls.scheduled[0].taskGroupId, "chat");

  harness = makeHarness();
  result = harness.service.applyHermesRunEvent({ event: "run.cancelled", run_id: "public_run" });
  assert.equal(result.action, "cancelled");
  assert.equal(harness.message.status, "cancelled");
  assert.equal(harness.message.cancelledAt, "2026-05-15T01:02:03.000Z");
  assert.equal(harness.thread.status, "idle");
  assert.equal(harness.calls.broadcasts[0].type, "run.cancelled");
}

function testFailedRunFormatsGatewayCapacityError() {
  const harness = makeHarness();

  const result = harness.service.applyHermesRunEvent({
    event: "run.failed",
    run_id: "public_run",
    error: {
      message: "Gateway worker queue timed out for workspace_capacity.",
      code: "gateway_elastic_queue_timeout",
      details: { reason: "workspace_capacity", queueDepth: 2 },
    },
  });

  assert.equal(result.action, "failed");
  assert.match(harness.message.error, /工作区的 AI 执行通道已满/);
  assert.doesNotMatch(harness.message.error, /workspace_capacity/);
}

function testResponseFailedWithoutDetailsDoesNotShowGenericRunFailed() {
  const harness = makeHarness();

  const result = harness.service.applyHermesRunEvent({
    event: "response.failed",
    run_id: "public_run",
    response: { id: "public_run" },
  });

  assert.equal(result.action, "failed");
  assert.match(harness.message.error, /模型通道失败/);
  assert.doesNotMatch(harness.message.error, /^run failed$/i);
  assert.doesNotMatch(harness.message.error, /Hermes run failed/i);
}

function testResponseFailedUsesNestedGatewayError() {
  const harness = makeHarness();

  const result = harness.service.applyHermesRunEvent({
    event: "response.failed",
    run_id: "public_run",
    response: {
      id: "public_run",
      error: {
        code: "gateway_elastic_worker_start_failed",
        message: "Gateway worker failed to start",
        details: { failureCode: "health_check_failed" },
      },
    },
  });

  assert.equal(result.action, "failed");
  assert.match(harness.message.error, /AI 执行通道启动后没有通过健康检查/);
  assert.doesNotMatch(harness.message.error, /health_check_failed/);
}

function testResponseFailedCanRequestOwnerElevation() {
  const harness = makeHarness({
    modelPermissionApprovalRequest: (text) => {
      if (!/Owner high-privilege approval is required/.test(text)) return null;
      return {
        elevationRequired: true,
        elevationScope: "owner_high_privilege",
        elevationReason: "Non-empty directory delete requested.",
        elevationSource: "model_permission_boundary_heuristic",
      };
    },
  });

  const result = harness.service.applyHermesRunEvent({
    event: "response.failed",
    run_id: "public_run",
    response: {
      id: "public_run",
      error: {
        code: "owner_high_privilege_required",
        message: "Owner high-privilege approval is required to delete a non-empty directory.",
      },
    },
  });

  assert.equal(result.action, "failed");
  assert.equal(harness.message.status, "failed");
  assert.equal(harness.message.elevationRequired, true);
  assert.equal(harness.message.elevationScope, "owner_high_privilege");
  assert.equal(harness.message.elevationReason, "Non-empty directory delete requested.");
}

function testSyntheticRunStatusDoesNotRefreshGatewayLastEventTime() {
  const { activeStreams, calls, service, thread } = makeHarness();
  const stream = activeStreams.get("public_run");
  stream.lastEventAt = 1000;

  const result = service.applyHermesRunEvent({
    event: "run.model_first_byte_retrying",
    run_id: "public_run",
    preview: "模型连接已等待首个流式事件",
    hermes_mobile_synthetic: true,
  });

  assert.equal(result.action, "event");
  assert.equal(stream.lastEventAt, 1000);
  assert.equal(thread.events.at(-1).event, "run.model_first_byte_retrying");
  assert.equal(thread.events.at(-1).preview, "模型连接已等待首个流式事件");
  assert.equal(calls.broadcasts.at(-1).type, "run.event");
}

function testApprovalMarkersAreHiddenButValidRequestIsStored() {
  const harness = makeHarness({
    modelPermissionApprovalRequest: () => ({
      elevationRequired: true,
      elevationScope: "owner_high_privilege",
      elevationReason: "needs owner",
      elevationSource: "model_permission_boundary",
    }),
  });
  harness.service.applyHermesRunEvent({
    event: "run.completed",
    run_id: "public_run",
    output: "visible\nHERMES_PERMISSION_APPROVAL_REQUIRED {\"scope\":\"owner_high_privilege\"}",
  });

  assert.equal(harness.message.content, "visible");
  assert.equal(harness.message.elevationRequired, true);
  assert.equal(harness.message.elevationScope, "owner_high_privilege");

  const stale = makeHarness({
    modelPermissionApprovalRequest: () => ({ elevationRequired: true, elevationScope: "owner_high_privilege" }),
    isOrdinaryToolSchemaElevationRequest: () => true,
  });
  stale.service.applyHermesRunEvent({ event: "run.completed", run_id: "public_run", output: "stale marker" });
  assert.equal(stale.message.elevationRequired, false);
}

function testToolsetEscalationMarkerIsHiddenAndStored() {
  const harness = makeHarness();
  harness.message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["weather", "wardrobe"],
    },
  };
  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"weather\",\"wardrobe\",\"terminal\"],\"reason\":\"needs current weather and closet state\"}",
  });

  assert.equal(result.action, "completed");
  assert.equal(harness.message.status, "done");
  assert.equal(harness.message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.equal(harness.message.toolsetEscalationRequired, true);
  assert.deepEqual(harness.message.toolsetEscalationToolsets, ["weather", "wardrobe"]);
  assert.equal(harness.message.toolsetEscalationReason, "needs current weather and closet state");
  assert.equal(harness.thread.events.at(-1).event, "run.toolset_escalation_required");
  assert.deepEqual(JSON.parse(harness.thread.events.at(-1).preview).toolsets, ["weather", "wardrobe"]);
}

function testStreamingToolsetEscalationMarkerIsSuppressedBeforeCompletion() {
  const harness = makeHarness({ maxMessageChars: 600 });
  harness.message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web", "search"],
    },
  };
  const rawMarker = "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"],\"reason\":\"needs public product page\"}";

  const delta = harness.service.applyHermesRunEvent({
    event: "message.delta",
    run_id: "public_run",
    delta: rawMarker,
  });

  assert.equal(delta.action, "delta_suppressed_toolset_escalation");
  assert.equal(harness.message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.equal(harness.message.pendingToolsetEscalationRequest.toolsets[0], "web");
  assert.equal(harness.calls.broadcasts.some((payload) => payload.type === "message.delta" && /HERMES_TOOLSET_ESCALATION_REQUIRED/.test(payload.delta || "")), false);

  const completed = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "",
  });

  assert.equal(completed.action, "completed");
  assert.equal(harness.message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.equal(harness.message.toolsetEscalationRequired, true);
  assert.deepEqual(harness.message.toolsetEscalationToolsets, ["web"]);
}

function testToolsetEscalationAutoRetriesWithExpandedAuthorizedToolsets() {
  const starts = [];
  const harness = makeHarness({
    setImmediate: (fn) => fn(),
    startToolsetEscalationRun: (thread, userMessage, assistantMessage, runOptions) => {
      starts.push({ thread, userMessage, assistantMessage, runOptions });
      return { status: "started" };
    },
  });
  harness.message.runOptions = {
    instructions: "existing run instruction",
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["wardrobe", "file"],
      omitted_authorized_toolsets: ["web", "search", "browser", "vision"],
    },
    access_policy_context: {
      allowed_toolsets: ["wardrobe", "file"],
      toolset_routing: {
        mode: "model_first",
        selected_toolsets: ["wardrobe", "file"],
        omitted_authorized_toolsets: ["web", "search", "browser", "vision"],
      },
    },
  };

  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\",\"search\"],\"reason\":\"needs public product photos\"}",
  });

  assert.equal(result.action, "toolset_escalation_retrying");
  assert.equal(harness.message.status, "queued");
  assert.equal(harness.message.content, "");
  assert.equal(harness.message.toolsetEscalationRequired, false);
  assert.equal(harness.message.toolsetEscalationAttempts, 1);
  assert.deepEqual(harness.thread.activeRunIds, []);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].userMessage.id, "user_1");
  assert.equal(starts[0].assistantMessage.id, "assistant_1");
  assert.equal(starts[0].runOptions.skipModelFirstToolsetSelection, true);
  assert.deepEqual(starts[0].runOptions.modelFirstToolsetSelection.selectedToolsets, ["wardrobe", "file", "web", "search", "browser"]);
  assert.deepEqual(starts[0].runOptions.modelFirstToolsetSelection.authorizedToolsets, ["wardrobe", "file", "web", "search", "browser", "vision"]);
  assert.deepEqual(
    starts[0].runOptions.modelFirstToolsetSelection.routing.omitted_authorized_toolsets,
    ["vision"],
  );
  assert.equal(harness.thread.events.at(-2).event, "run.toolset_escalation_required");
  assert.equal(harness.thread.events.at(-1).event, "run.toolset_escalation_retrying");
  assert.equal(harness.calls.broadcasts.some((payload) => payload.type === "run.completed"), false);
  assert.equal(JSON.stringify(harness.calls.broadcasts).includes("当前运行需要额外工具集"), false);
  assert.equal(JSON.stringify(harness.calls.broadcasts).includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.deepEqual(harness.calls.enqueued, []);
  assert.deepEqual(harness.calls.notified, []);
  assert.deepEqual(harness.calls.scheduled, []);
}

function testOutputItemFinalMessageCanTriggerToolsetEscalationRetryWithoutDeltas() {
  const starts = [];
  const harness = makeHarness({
    setImmediate: (fn) => fn(),
    startToolsetEscalationRun: (_thread, _userMessage, _assistantMessage, runOptions) => {
      starts.push(runOptions);
      return { status: "started" };
    },
  });
  harness.message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["wardrobe", "vision"],
    },
    access_policy_context: {
      allowed_toolsets: ["file"],
      toolset_routing: {
        mode: "model_first",
        selected_toolsets: ["file"],
        omitted_authorized_toolsets: ["wardrobe", "vision"],
      },
    },
  };

  harness.service.applyHermesRunEvent({
    event: "response.output_item.done",
    run_id: "public_run",
    item: {
      type: "message",
      content: [{
        type: "output_text",
        text: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"wardrobe\"],\"reason\":\"needs wardrobe write access\"}",
      }],
    },
  });

  const completed = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "",
  });

  assert.equal(completed.action, "toolset_escalation_retrying");
  assert.equal(harness.message.content, "");
  assert.equal(harness.message.status, "queued");
  assert.equal(harness.message.pendingToolsetEscalationRequest, undefined);
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].modelFirstToolsetSelection.selectedToolsets, ["file", "wardrobe"]);
}

function testToolsetEscalationRetryCapStopsAfterOneInternalRetry() {
  const starts = [];
  const harness = makeHarness({
    setImmediate: (fn) => fn(),
    startToolsetEscalationRun: (_thread, _userMessage, _assistantMessage, runOptions) => {
      starts.push(runOptions);
      return { status: "started" };
    },
  });
  harness.message.toolsetEscalationAttempts = 1;
  harness.message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["health"],
    },
    access_policy_context: {
      allowed_toolsets: ["file"],
      toolset_routing: {
        mode: "model_first",
        selected_toolsets: ["file"],
        omitted_authorized_toolsets: ["health"],
      },
    },
  };

  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"health\"],\"reason\":\"needs health MCP\"}",
  });

  assert.equal(result.action, "completed");
  assert.equal(starts.length, 0);
  assert.equal(harness.message.status, "done");
  assert.equal(harness.message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.match(harness.message.content, /当前运行需要额外工具集/);
  assert.equal(harness.message.toolsetEscalationRequired, true);
  assert.deepEqual(harness.message.toolsetEscalationToolsets, ["health"]);
  assert.equal(harness.calls.broadcasts.filter((payload) => payload.type === "run.completed").length, 1);
  assert.deepEqual(harness.calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(harness.calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
}

function testAlreadySelectedToolsetEscalationIsSanitizedWithoutRetry() {
  const starts = [];
  const harness = makeHarness({
    maxMessageChars: 600,
    setImmediate: (fn) => fn(),
    startToolsetEscalationRun: (_thread, _userMessage, _assistantMessage, runOptions) => {
      starts.push(runOptions);
      return { status: "started" };
    },
  });
  harness.message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["wardrobe", "skills"],
      omitted_authorized_toolsets: ["web", "search", "file", "vision"],
    },
    access_policy_context: {
      allowed_toolsets: ["wardrobe", "skills"],
      toolset_routing: {
        mode: "model_first",
        selected_toolsets: ["wardrobe", "skills"],
        omitted_authorized_toolsets: ["web", "search", "file", "vision"],
      },
    },
  };

  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"wardrobe\"],\"reason\":\"needs wardrobe history writeback\"}",
  });

  assert.equal(result.action, "completed");
  assert.equal(harness.message.status, "done");
  assert.equal(harness.message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.notEqual(harness.message.content.trim(), "");
  assert.equal(harness.message.toolsetEscalationRequired, true);
  assert.deepEqual(harness.message.toolsetEscalationToolsets, ["wardrobe"]);
  assert.equal(harness.message.toolsetEscalationSource, "model_toolset_schema_mismatch");
  assert.equal(starts.length, 0);
  const preview = JSON.parse(harness.thread.events.at(-1).preview);
  assert.deepEqual(preview.toolsets, ["wardrobe"]);
  assert.deepEqual(preview.retryable_toolsets, []);
}

function wardrobeOutfitGateRunOptions() {
  return {
    wardrobeOutfitWorkflowGate: {
      active: true,
      workflow: "wardrobe_outfit",
      requiredSkillPath: "productivity/wardrobe-style-operations",
      requiredToolsets: ["wardrobe", "vision", "file", "skills", "weather"],
      completionGate: {
        enabled: true,
        requireWeatherCall: true,
        requireWardrobeMcpCall: true,
        requireMarkdownReceipt: true,
        requireWatchItem: true,
      },
    },
  };
}

function testWardrobeOutfitCompletionGateKeepsIncompleteFinalResult() {
  const harness = makeHarness({ maxMessageChars: 800 });
  harness.message.taskGroupId = "plugin:wardrobe";
  harness.message.runOptions = wardrobeOutfitGateRunOptions();
  harness.message.loadedSkills = [{ path: "productivity/wardrobe-style-operations" }];

  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { output_tokens: 12 },
      output: [
        { type: "function_call", name: "mcp_wardrobe_wardrobe_search_items" },
        { type: "message", content: [{ type: "output_text", text: "\u5efa\u8bae\u767d\u886c\u886b\u914d\u7070\u88e4\u3002" }] },
      ],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(harness.message.status, "done");
  assert.match(harness.message.content, /\u767d\u886c\u886b/);
  assert.equal(harness.message.usage.supplemented, true);
  assert.equal(harness.thread.events.some((item) => item.event === "run.wardrobe_outfit_completion_gate_failed"), false);
  assert.equal(harness.calls.broadcasts.some((payload) => payload.type === "run.completed"), true);
  assert.equal(harness.calls.broadcasts.some((payload) => payload.type === "run.failed"), false);
  assert.deepEqual(harness.calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(harness.calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
}

function testWardrobeOutfitCompletionGatePassesGoodFinalResult() {
  const harness = makeHarness({ maxMessageChars: 800 });
  harness.message.taskGroupId = "plugin:wardrobe";
  harness.message.runOptions = wardrobeOutfitGateRunOptions();
  harness.message.loadedSkills = [{ path: "productivity/wardrobe-style-operations" }];

  const result = harness.service.applyHermesRunEvent({
    event: "response.completed",
    run_id: "public_run",
    response: {
      id: "public_run",
      usage: { output_tokens: 20 },
      output: [
        { type: "function_call", name: "weather" },
        { type: "function_call", name: "mcp_wardrobe_wardrobe_search_items" },
        { type: "function_call", name: "write_file" },
        { type: "message", content: [{ type: "output_text", text: "\u5305\u542b\u8155\u8868\u3002\nMEDIA:/tmp/outfit.md" }] },
      ],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(harness.message.status, "done");
  assert.match(harness.message.content, /MEDIA:\/tmp\/outfit\.md/);
  assert.equal(harness.message.loadedTools.some((tool) => tool.name === "weather"), true);
  assert.equal(harness.message.loadedTools.some((tool) => tool.name === "mcp_wardrobe_wardrobe_search_items"), true);
  assert.equal(harness.calls.broadcasts.some((payload) => payload.type === "run.completed"), true);
}

function testReconcileDetachedActiveRunsFailsMissingStreamsAndSchedulesQueued() {
  const { activeStreams, calls, service, state, thread } = makeHarness();
  activeStreams.clear();
  thread.messages.push({ id: "user_2", role: "user", status: "done", taskGroupId: "chat" });
  thread.messages.push({ id: "assistant_2", role: "assistant", status: "queued", runId: "", taskGroupId: "chat" });
  const changed = service.reconcileDetachedActiveRuns("detached");

  assert.equal(changed, true);
  assert.equal(state.threads[0].messages[1].status, "failed");
  assert.equal(state.threads[0].messages[1].error, "detached");
  assert.equal(calls.enqueued[0].status, "failed");
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
}

testPureTargetAndOutputHelpers();
testResponseCreatedAliasesRunAndBroadcasts();
testDeltaUpdatesMessageAndThread();
testStreamingDeltaSavesAreCoalesced();
testCompletedRunMutatesTerminalStateAndSchedulesQueue();
testDuplicateCompletedEventDoesNotNotifyTwice();
testCompletedRunPersistsLoadedSkillReferences();
testOutputItemSkillPersistsBeforeCompletionAndSurvivesEventTrim();
testCompletedResponseOutputBackfillsLoadedSkillReferences();
testCompletedRunBackfillsLoadedToolsWithoutDefaultSkill();
testHostedSearchOutputItemBackfillsToolTag();
testCompletedRunUsageKeepsRequestedModelMetadata();
testOutputItemEventsStoreReadableSummariesOnly();
testOutputItemEventsUseAliasedResponseRunId();
testFinalMessageTelemetryDoesNotStoreResponseText();
testFailedAndCancelledRunsUseTerminalHelpers();
testFailedRunFormatsGatewayCapacityError();
testResponseFailedWithoutDetailsDoesNotShowGenericRunFailed();
testResponseFailedUsesNestedGatewayError();
testResponseFailedCanRequestOwnerElevation();
testSyntheticRunStatusDoesNotRefreshGatewayLastEventTime();
testApprovalMarkersAreHiddenButValidRequestIsStored();
testToolsetEscalationMarkerIsHiddenAndStored();
testStreamingToolsetEscalationMarkerIsSuppressedBeforeCompletion();
testToolsetEscalationAutoRetriesWithExpandedAuthorizedToolsets();
testOutputItemFinalMessageCanTriggerToolsetEscalationRetryWithoutDeltas();
testToolsetEscalationRetryCapStopsAfterOneInternalRetry();
testAlreadySelectedToolsetEscalationIsSanitizedWithoutRetry();
testWardrobeOutfitCompletionGateKeepsIncompleteFinalResult();
testWardrobeOutfitCompletionGatePassesGoodFinalResult();
testReconcileDetachedActiveRunsFailsMissingStreamsAndSchedulesQueued();

console.log("gateway-run-event-service tests passed");
