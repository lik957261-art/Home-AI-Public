"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunCompletionService,
  extractCompletedOutput,
  parsePluginConversationActionComments,
  usageWithRunMetadata,
} = require("../adapters/gateway-run-completion-service");

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    compacted: [],
    enqueued: [],
    failed: [],
    notified: [],
    pluginActions: [],
    quotaRetries: [],
    removed: [],
    saved: 0,
    scheduled: [],
    topicIndex: [],
    usage: [],
  };
  const thread = {
    id: "thread_1",
    activeRunIds: ["run_1"],
    events: [],
    messages: [
      { id: "user_1", role: "user", taskGroupId: "chat", content: "task" },
      {
        id: "assistant_1",
        role: "assistant",
        taskGroupId: "chat",
        runId: "run_1",
        status: "running",
        content: "partial",
        runOptions: {},
      },
    ],
    status: "running",
    updatedAt: "old",
  };
  const message = thread.messages[1];
  const service = createGatewayRunCompletionService(Object.assign({
    addThreadEvent: (targetThread, event) => {
      targetThread.events.push({
        event: event.event,
        runId: event.runId,
        tool: event.tool,
        preview: event.preview || "",
        error: Boolean(event.error),
      });
    },
    broadcast: (payload) => calls.broadcasts.push(payload),
    clearStreamingSaveTimer: () => { calls.cleared = true; },
    compactFullContent: (value) => String(value || ""),
    compactMessage: (targetMessage) => ({
      id: targetMessage.id,
      status: targetMessage.status,
      content: targetMessage.content,
      runId: targetMessage.runId,
    }),
    compactTerminalTopicContext: (targetThread, targetMessage, reason) => calls.compacted.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      reason,
    }),
    directoryTopicIndexService: overrides.directoryTopicIndexService || {
      upsertThreadTopicIndex: (targetThread, input) => calls.topicIndex.push({
        threadId: targetThread.id,
        taskGroupId: input.taskGroupId,
        messageId: input.message?.id || "",
      }),
    },
    enqueueExternalDeliveryForTerminalMessage: (targetThread, targetMessage, status) => calls.enqueued.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      status,
    }),
    markRunFailed: (threadId, messageId, runId, err) => {
      calls.failed.push({ threadId, messageId, runId, err });
      return { action: "failed" };
    },
    notifyTaskTerminal: (targetThread, targetMessage, status) => calls.notified.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      status,
    }),
    pluginConversationActionBridgeService: overrides.pluginConversationActionBridgeService || {
      createRequest: (payload) => {
        calls.pluginActions.push(payload);
        return {
          ok: true,
          inboxItem: { id: "ainb_plugin_action_1" },
        };
      },
    },
    nowIso: () => "2026-06-08T01:02:03.000Z",
    nowMs: () => 4000,
    registerArtifactsFromText: (_thread, _message, text) => (/MEDIA:/.test(text) ? [{ id: "artifact_1" }] : []),
    removeThreadActiveRun: (targetThread, runId, status) => {
      calls.removed.push({ threadId: targetThread.id, runId, status });
      targetThread.activeRunIds = (targetThread.activeRunIds || []).filter((item) => item !== runId);
      targetThread.status = status;
    },
    saveState: () => { calls.saved += 1; },
    scheduleNextQueuedRunForTaskGroup: (targetThread, taskGroupId) => calls.scheduled.push({
      threadId: targetThread.id,
      taskGroupId,
    }),
    startEscalatedToolsetRetry: overrides.startEscalatedToolsetRetry || (() => false),
    startQuotaFailoverRetry: overrides.startQuotaFailoverRetry || ((targetThread, targetMessage, input) => {
      calls.quotaRetries.push({
        threadId: targetThread.id,
        messageId: targetMessage.id,
        output: input.output,
        previousRunId: input.previousRunId,
      });
      return false;
    }),
    stripPermissionApprovalMarkers: (text) => String(text || "").replace(/HERMES_PERMISSION_APPROVAL_REQUIRED[^\n]*/g, "").trim(),
    supplementGatewayUsage: (usage, runId, targetMessage) => {
      calls.usage.push({ usage, runId, messageId: targetMessage.id });
      return Object.assign({ supplemented: true, runId }, usage || {});
    },
    threadSummary: (targetThread) => ({ id: targetThread.id, activeRunIds: targetThread.activeRunIds || [] }),
  }, overrides));
  return { calls, message, service, thread };
}

function completionContext(thread, message, overrides = {}) {
  return Object.assign({
    thread,
    message,
    runId: "run_1",
    originalRunId: "",
    responseRunId: "",
    stream: null,
  }, overrides);
}

function testPureCompletionHelpers() {
  assert.equal(extractCompletedOutput({
    response: {
      output: [
        { type: "message", content: [{ type: "output_text", text: "hello" }] },
        { type: "function_call", content: [{ type: "output_text", text: "skip" }] },
        { type: "message", content: [{ type: "output_text", text: "world" }] },
      ],
    },
  }), "hello\n\nworld");
  assert.deepEqual(usageWithRunMetadata(
    { input_tokens: 1 },
    { response: { model: "gpt-test", provider: "openai", reasoning: { effort: "high" } } },
    {},
  ), {
    input_tokens: 1,
    model: "gpt-test",
    provider: "openai",
    model_provider: "openai",
    reasoning_effort: "high",
    reasoningEffort: "high",
  });
  const parsedActions = parsePluginConversationActionComments([
    "Visible",
    "<!-- homeai-owner-task-request",
    "{\"title\":\"Fix platform gap\",\"summary\":\"bounded\",\"suggestedChange\":\"repair\",\"acceptance\":\"test\"}",
    "-->",
  ].join("\n"));
  assert.equal(parsedActions.length, 1);
  assert.equal(parsedActions[0].pluginId, "home-ai");
  assert.equal(parsedActions[0].requestType, "capability_gap");
  assert.equal(parsedActions[0].title, "Fix platform gap");
}

function testCompletedRunProjectsDoneState() {
  const { calls, message, service, thread } = makeHarness();

  const result = service.markRunCompleted(completionContext(thread, message), {
    response: {
      id: "run_1",
      usage: { output_tokens: 3 },
      output: [{ type: "message", content: [{ type: "output_text", text: "Final\nMEDIA:/tmp/report.md" }] }],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(message.status, "done");
  assert.equal(message.content, "Final\nMEDIA:/tmp/report.md");
  assert.deepEqual(message.artifacts, [{ id: "artifact_1" }]);
  assert.equal(message.usage.supplemented, true);
  assert.deepEqual(thread.activeRunIds, []);
  assert.equal(thread.status, "idle");
  assert.equal(calls.cleared, true);
  assert.deepEqual(calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
  assert.deepEqual(calls.scheduled, [{ threadId: "thread_1", taskGroupId: "chat" }]);
  assert.deepEqual(calls.compacted, [{ threadId: "thread_1", messageId: "assistant_1", reason: "run-completed" }]);
  assert.equal(calls.broadcasts.at(-1).type, "run.completed");
}

function testCompletedRunStoresWardrobeOutfitWearIntentAction() {
  const { message, service, thread } = makeHarness();
  const intent = {
    type: "outfit_wear_intent",
    schema_version: 1,
    plugin_id: "wardrobe",
    principal_id: "owner",
    workspace_id: "owner",
    wear_date: "2026-06-29",
    timezone: "Asia/Shanghai",
    items: [{ role: "Outer", code: "OUT-001" }],
    source_message: { message_id: "assistant_1", thread_id: "thread_1" },
    idempotency_key: "wardrobe:outfit_wear_intent:test",
    expires_at: "2026-06-30T00:00:00Z",
  };

  const result = service.markRunCompleted(completionContext(thread, message), {
    response: {
      id: "run_1",
      output: [
        { type: "function_call", name: "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent", call_id: "call_prepare" },
        { type: "function_call_output", call_id: "call_prepare", output: JSON.stringify({ structuredContent: { intent } }) },
        { type: "message", content: [{ type: "output_text", text: "已准备穿着入库动作。" }] },
      ],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(message.pluginActions.wardrobeOutfitWearIntent.status, "ready");
  assert.equal(message.pluginActions.wardrobeOutfitWearIntent.executable, true);
  assert.equal(message.pluginActions.wardrobeOutfitWearIntent.intent.idempotency_key, intent.idempotency_key);
}

function testToolsetEscalationRetryShortCircuitsTerminalCompletion() {
  const starts = [];
  const { calls, message, service, thread } = makeHarness({
    startEscalatedToolsetRetry: (targetThread, targetMessage, request, previousRunId) => {
      starts.push({ targetThread, targetMessage, request, previousRunId });
      return true;
    },
  });
  message.runOptions = {
    toolsetRouting: {
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web"],
    },
  };

  const result = service.markRunCompleted(completionContext(thread, message), {
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"],\"reason\":\"needs current data\"}",
  });

  assert.equal(result.action, "toolset_escalation_retrying");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].previousRunId, "run_1");
  assert.equal(thread.events.at(-1).event, "run.toolset_escalation_required");
  assert.equal(calls.broadcasts.at(-1).type, "run.event");
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts.some((payload) => payload.type === "run.completed"), false);
  assert.deepEqual(calls.notified, []);
}

function testOpenAiCodexQuotaFailoverShortCircuitsTerminalFailure() {
  const starts = [];
  const { calls, message, service, thread } = makeHarness({
    startQuotaFailoverRetry: (targetThread, targetMessage, input) => {
      starts.push({ targetThread, targetMessage, input });
      targetThread.events.push({
        event: "run.openai_codex_quota_failover_retrying",
        runId: input.previousRunId,
        tool: "gateway",
        preview: "{}",
        error: false,
      });
      return true;
    },
  });

  const result = service.markRunCompleted(completionContext(thread, message), {
    output: "API call failed after 3 retries: HTTP 429: The usage limit has been reached",
  });

  assert.equal(result.action, "openai_codex_quota_failover_retrying");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].input.previousRunId, "run_1");
  assert.equal(calls.failed.length, 0);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts.at(-1).type, "run.event");
  assert.equal(calls.broadcasts.some((payload) => payload.type === "run.completed"), false);
}

function testCompletedDirectoryRunUpdatesTopicIndex() {
  const { calls, message, service, thread } = makeHarness();
  message.taskGroupId = "task-directory";
  thread.taskGroupMeta = {
    "task-directory": {
      ownerWorkspaceId: "owner",
      directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
      directoryRouteKey: "owner|health||/health",
    },
  };

  const result = service.markRunCompleted(completionContext(thread, message), {
    response: {
      output: [{ type: "message", content: [{ type: "output_text", text: "目录话题回执摘要" }] }],
    },
  });

  assert.equal(result.action, "completed");
  assert.deepEqual(calls.topicIndex, [{
    threadId: "thread_1",
    taskGroupId: "task-directory",
    messageId: "assistant_1",
  }]);
}

testCompletedDirectoryRunUpdatesTopicIndex();

function testToolsetEscalationWithoutRetryCompletesWithDiagnostic() {
  const { calls, message, service, thread } = makeHarness();
  message.runOptions = {
    toolsetRouting: {
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web"],
    },
  };

  const result = service.markRunCompleted(completionContext(thread, message), {
    output: "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"],\"reason\":\"needs current data\"}",
  });

  assert.equal(result.action, "completed");
  assert.equal(message.status, "done");
  assert.equal(message.toolsetEscalationRequired, true);
  assert.deepEqual(message.toolsetEscalationToolsets, ["web"]);
  assert.equal(message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.notEqual(message.content.trim(), "");
  assert.equal(calls.broadcasts.at(-1).type, "run.completed");
}

function testWardrobeCompletionGateAdvisoryCompletesIncompleteResult() {
  const { calls, message, service, thread } = makeHarness();
  message.loadedSkills = [{ path: "productivity/wardrobe-style-operations" }];
  message.runOptions = {
    wardrobeOutfitWorkflowGate: {
      active: true,
      requiredSkillPath: "productivity/wardrobe-style-operations",
      completionGate: {
        enabled: true,
        requireWeatherCall: true,
        requireWardrobeMcpCall: true,
        requireMarkdownReceipt: true,
        requireWatchItem: true,
      },
    },
  };

  const result = service.markRunCompleted(completionContext(thread, message), {
    response: {
      output: [
        { type: "function_call", name: "mcp_wardrobe_wardrobe_search_items" },
        { type: "message", content: [{ type: "output_text", text: "A plain outfit answer." }] },
      ],
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(message.status, "done");
  assert.equal(message.content, "A plain outfit answer.");
  assert.equal(thread.events.some((item) => item.event === "run.wardrobe_outfit_completion_gate_failed"), false);
  assert.equal(calls.failed.length, 0);
  assert.equal(calls.broadcasts.some((payload) => payload.type === "run.completed"), true);
  assert.deepEqual(calls.enqueued, [{ threadId: "thread_1", messageId: "assistant_1", status: "done" }]);
}

function testPermissionApprovalProjectionStripsMarkerAndSetsElevation() {
  const { message, service, thread } = makeHarness({
    modelPermissionApprovalRequest: () => ({
      elevationScope: "owner_maintenance",
      elevationReason: "needs maintenance",
      elevationSource: "model_permission_marker",
    }),
  });

  service.markRunCompleted(completionContext(thread, message), {
    output: "Answer\nHERMES_PERMISSION_APPROVAL_REQUIRED {\"scope\":\"owner_maintenance\"}",
  });

  assert.equal(message.status, "done");
  assert.equal(message.content, "Answer");
  assert.equal(message.elevationRequired, true);
  assert.equal(message.elevationScope, "owner_maintenance");
  assert.equal(message.elevationReason, "needs maintenance");
  assert.equal(message.elevationSource, "model_permission_marker");
}

async function testCompletedRunSubmitsHiddenOwnerTaskRequestServerSide() {
  const { calls, message, service, thread } = makeHarness();
  thread.workspaceId = "owner";
  message.actorWorkspaceId = "owner";

  const result = service.markRunCompleted(completionContext(thread, message), {
    output: [
      "已准备给 Home AI 的 Owner 审批请求。",
      "<!-- homeai-owner-task-request",
      "{\"pluginId\":\"home-ai\",\"requestType\":\"capability_gap\",\"severity\":\"H2\",\"title\":\"低权限 Gateway 缺少 PPTX 生成工具\",\"summary\":\"bounded problem\",\"suggestedChange\":\"add tool\",\"acceptance\":\"fresh directory-bound run can submit\"}",
      "-->",
    ].join("\n"),
  });

  assert.equal(result.action, "completed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.pluginActions.length, 1);
  assert.equal(calls.pluginActions[0].pluginId, "home-ai");
  assert.equal(calls.pluginActions[0].requestType, "capability_gap");
  assert.equal(calls.pluginActions[0].sourceThreadId, "thread_1");
  assert.equal(calls.pluginActions[0].sourceTurnId, "assistant_1");
  assert.equal(calls.pluginActions[0].workspaceId, "owner");
  assert.equal(thread.events.some((item) => item.event === "run.plugin_conversation_action_request_created"), true);
}

async function testCompletedRunRecoversLegacyTaskCardClaimServerSide() {
  const { calls, message, service, thread } = makeHarness();
  message.actorWorkspaceId = "owner";

  const result = service.markRunCompleted(completionContext(thread, message), {
    output: [
      "已经重新发卡，这次卡片只要求 PPT / Office / PDF 工具能力一致。",
      "",
      "卡片 ID：t_6937cfb1",
      "标题：修复：Hermes Mobile Gateway 暴露并验证 PPT/Office 文档工具能力",
      "状态：ready",
      "指派：codex",
      "<!-- homeai-note",
      "title: 已重新发卡要求修复 Office 工具能力",
      "-->",
    ].join("\n"),
  });

  assert.equal(result.action, "completed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.pluginActions.length, 1);
  assert.equal(calls.pluginActions[0].pluginId, "home-ai");
  assert.equal(calls.pluginActions[0].requestType, "capability_gap");
  assert.equal(calls.pluginActions[0].title, "修复：Hermes Mobile Gateway 暴露并验证 PPT/Office 文档工具能力");
  assert.equal(calls.pluginActions[0].evidence.recovery, "legacy_task_card_claim_recovered");
  assert.deepEqual(calls.pluginActions[0].evidence.legacyCardIds, ["t_6937cfb1"]);
  assert.equal(calls.pluginActions[0].sourceThreadId, "thread_1");
  assert.equal(calls.pluginActions[0].sourceTurnId, "assistant_1");
  assert.equal(thread.events.some((item) => item.event === "run.plugin_conversation_action_request_recovered"), true);
}

testPureCompletionHelpers();
testCompletedRunProjectsDoneState();
testCompletedRunStoresWardrobeOutfitWearIntentAction();
testToolsetEscalationRetryShortCircuitsTerminalCompletion();
testOpenAiCodexQuotaFailoverShortCircuitsTerminalFailure();
testToolsetEscalationWithoutRetryCompletesWithDiagnostic();
testWardrobeCompletionGateAdvisoryCompletesIncompleteResult();
testPermissionApprovalProjectionStripsMarkerAndSetsElevation();

Promise.all([
  testCompletedRunSubmitsHiddenOwnerTaskRequestServerSide(),
  testCompletedRunRecoversLegacyTaskCardClaimServerSide(),
]).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
