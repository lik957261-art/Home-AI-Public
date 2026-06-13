"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-run-progress-ui.js"), "utf8");

const testState = {
  runProgressRenderLastAt: new Map(),
  runProgressRenderScheduled: new Set(),
  runProgressTicker: 0,
  conversationPinnedToBottom: false,
  conversationViewportBottomFollowUntil: 0,
  suppressConversationPinUntil: 0,
};
let followConversationBottom = true;
let scrollCalls = 0;
let visibilityCalls = 0;
let fallbackRefreshCalls = 0;
let fallbackRefreshOptions = null;
let fullRenderCalls = 0;
const fakeConversation = {
  scrollHeight: 1000,
  scrollTop: 700,
  clientHeight: 300,
  querySelector(selector) {
    if (selector === ".run-progress-panel") return fakeBody.inserted ? {} : null;
    return null;
  },
  querySelectorAll() { return []; },
};
const fakeContent = {
  insertAdjacentHTML(_position, html) {
    fakeBody.inserted = html;
    fakeConversation.scrollHeight = 1250;
  },
};
const fakeBody = {
  inserted: "",
  querySelector(selector) {
    if (selector === ".run-progress-panel.inline") return null;
    if (selector === ".text-content") return fakeContent;
    return null;
  },
  insertAdjacentHTML(_position, html) {
    this.inserted = html;
    fakeConversation.scrollHeight = 1250;
  },
};
const fakeArticle = {
  querySelector(selector) {
    return selector === ".message-body" ? fakeBody : null;
  },
};

const context = {
  console,
  Date,
  document: {},
  state: testState,
  window: {
    clearInterval() {},
    clearTimeout() {},
    setInterval() { return 1; },
    setTimeout(fn) { fn(); return 1; },
  },
  requestAnimationFrame(fn) { fn(); },
  $() { return fakeConversation; },
  escapeHtml(value) {
    return String(value ?? "");
  },
  conversationViewportRefreshApplies() { return true; },
  shouldFollowConversationBottomDuringViewport() { return followConversationBottom; },
  scrollConversationToBottom() {
    scrollCalls += 1;
    fakeConversation.scrollTop = fakeConversation.scrollHeight;
    testState.conversationPinnedToBottom = true;
  },
  messageElementById(messageId) { return messageId === "msg_current" ? fakeArticle : null; },
  scheduleRenderCurrentThread() { fullRenderCalls += 1; },
  requestCurrentThreadRefresh(options = {}) {
    fallbackRefreshCalls += 1;
    fallbackRefreshOptions = options;
  },
  scheduleMessageScrollButtonVisibility() { visibilityCalls += 1; },
};

vm.createContext(context);
vm.runInContext(`${source}
globalThis.runProgressTestApi = {
  messageForRunProgress,
  renderMessageRunProgress,
  runProgressEvents,
  runProgressCompactPreflightEvents,
  runEventTitle,
  runGatewayWorkerPreviewLabel,
  messageOwnRunIds,
  threadActiveRunIds,
  messageRunProgressIds,
  rememberMessageRunProgressId,
  renderMessageRunProgressInPlace,
  renderMessageRunProgressHistory,
  appendRunEventToCurrentThread,
  scheduleRunProgressFallbackThreadRefresh,
  shouldKeepRunProgressPinnedToBottom,
};`, context);

const {
  messageForRunProgress,
  renderMessageRunProgress,
  runProgressEvents,
  runProgressCompactPreflightEvents,
  runEventTitle,
  runGatewayWorkerPreviewLabel,
  messageOwnRunIds,
  threadActiveRunIds,
  messageRunProgressIds,
  rememberMessageRunProgressId,
  renderMessageRunProgressInPlace,
  renderMessageRunProgressHistory,
  appendRunEventToCurrentThread,
  scheduleRunProgressFallbackThreadRefresh,
  shouldKeepRunProgressPinnedToBottom,
} = context.runProgressTestApi;

const thread = {
  id: "thread_current",
  activeRunId: "resp_current",
  activeRunIds: ["resp_current"],
  messages: [
    {
      id: "msg_old_terminal",
      role: "assistant",
      status: "done",
      runId: "resp_old",
      originalRunId: "web_old",
      responseRunId: "resp_old",
      createdAt: "2026-05-27T12:00:00.000Z",
    },
    {
      id: "msg_current",
      role: "assistant",
      status: "running",
      taskId: "web_current",
      originalRunId: "web_current",
      responseRunId: "resp_current",
      runId: "resp_current",
      createdAt: "2026-05-27T12:32:12.079Z",
      startedAt: "2026-05-27T12:32:12.894Z",
    },
  ],
  events: [
    {
      runId: "web_current",
      event: "run.context_ready",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:13.555Z",
      preview: "context",
    },
    {
      runId: "web_current",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:18.967Z",
      preview: "sent",
    },
    {
      runId: "web_current",
      event: "run.toolset_escalation_retrying",
      tool: "toolset",
      timestamp: "2026-05-27T12:32:19.200Z",
      preview: JSON.stringify({ selected_toolsets: ["web", "search", "browser"] }),
    },
    {
      runId: "resp_current",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:20.553Z",
      preview: "",
    },
    {
      runId: "resp_current",
      event: "run.liveness_warning",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:32:22.553Z",
      preview: "Gateway temporarily did not report this run; keep waiting",
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "skill_view",
      timestamp: "2026-05-27T12:32:24.423Z",
      preview: JSON.stringify({ name: "productivity/status-check" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "skill_view",
      timestamp: "2026-05-27T12:32:26.423Z",
      preview: JSON.stringify({ name: "productivity/status-check" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:32:28.423Z",
      preview: JSON.stringify({ name: "search_files", callId: "call_search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "function_call",
      timestamp: "2026-05-27T12:32:29.423Z",
      preview: JSON.stringify({ name: "search_files", callId: "call_search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "function_call_output",
      timestamp: "2026-05-27T12:32:38.423Z",
      preview: JSON.stringify({ callId: "call_search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "function_call_output",
      timestamp: "2026-05-27T12:32:39.423Z",
      preview: JSON.stringify({ callId: "call_search_files" }),
    },
    {
      runId: "resp_current",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:32:30.423Z",
      preview: { name: "image_edit", callId: "call_image_1" },
    },
    {
      runId: "resp_current",
      event: "response.output_item.done",
      tool: "function_call_output",
      timestamp: "2026-05-27T12:32:31.423Z",
      preview: { callId: "call_image_1" },
    },
  ],
};

assert.deepStrictEqual(Array.from(messageOwnRunIds(thread.messages[1])), ["web_current", "resp_current"]);
assert.deepStrictEqual(Array.from(threadActiveRunIds(thread)), ["resp_current"]);
assert.strictEqual(messageForRunProgress(thread, "resp_current")?.id, "msg_current");
assert.strictEqual(messageForRunProgress(thread, "web_current")?.id, "msg_current");

const fallbackThread = {
  id: "thread_pending",
  activeRunId: "resp_pending",
  activeRunIds: ["resp_pending"],
  messages: [
    { id: "msg_old_terminal", role: "assistant", status: "done", runId: "resp_old" },
    { id: "msg_active_pending_ids", role: "assistant", status: "running" },
  ],
};

assert.strictEqual(messageForRunProgress(fallbackThread, "resp_pending")?.id, "msg_active_pending_ids");
assert.strictEqual(messageForRunProgress(fallbackThread, "resp_missing"), null);

const currentRunEvents = runProgressEvents(thread, ["web_current", "resp_current"]);
assert.strictEqual(currentRunEvents.length, 13);

const html = renderMessageRunProgress(thread, thread.messages[1]);
assert.doesNotMatch(html, /\u7b49\u5f85\u6a21\u578b\u8fd4\u56de/);
assert.doesNotMatch(html, /Gateway temporarily did not report this run/);
assert.doesNotMatch(html, /Gateway \u72b6\u6001\u6682\u4e0d\u53ef\u89c1/);
assert.match(html, /Skill productivity\/status-check/);
assert.match(html, /Function search_files/);
assert.match(html, /Function image_edit/);
assert.doesNotMatch(html, /Function result search_files/);
assert.doesNotMatch(html, /Function result image_edit/);
assert.match(html, /\u5b8c\u6210 \u00b7 11\u79d2/);
assert.match(html, /完成 · 2秒/);
assert.match(html, /完成 · 1秒/);
assert.match(html, /run-progress-operation-done/);
assert.match(html, /\u8bf7\u6c42\u5df2\u53d1\u9001/);
assert.match(html, /\u6b63\u5728\u8ffd\u52a0\u5de5\u5177\u5e76\u91cd\u65b0\u8fd0\u884c/);
assert.match(html, /\u6a21\u578b\u6d41\u5df2\u8fde\u63a5/);
assert.doesNotMatch(html, /compact-after-output/);
assert.ok(html.indexOf("\u8bf7\u6c42\u5df2\u53d1\u9001") < html.indexOf("\u6a21\u578b\u6d41\u5df2\u8fde\u63a5"));
assert.ok(html.indexOf("\u6a21\u578b\u6d41\u5df2\u8fde\u63a5") < html.indexOf("Function search_files"));

const streamingOutputThread = {
  id: "thread_streaming_output",
  activeRunId: "resp_streaming_output",
  activeRunIds: ["resp_streaming_output"],
  messages: [
    {
      id: "msg_streaming_output",
      role: "assistant",
      status: "running",
      runId: "resp_streaming_output",
      responseRunId: "resp_streaming_output",
      startedAt: "2026-05-27T13:00:00.000Z",
      content: "\u5df2\u5f00\u59cb\u8f93\u51fa\u6b63\u6587",
    },
  ],
  events: [
    {
      runId: "resp_streaming_output",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:00:01.000Z",
      preview: "",
    },
    {
      runId: "resp_streaming_output",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:00:02.000Z",
      preview: "",
    },
    {
      runId: "resp_streaming_output",
      event: "run.model_output_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:00:03.000Z",
      preview: "",
    },
    {
      runId: "resp_streaming_output",
      event: "run.stream_closed_without_terminal",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:00:04.000Z",
      preview: "",
    },
  ],
};
const compactHtml = renderMessageRunProgress(streamingOutputThread, streamingOutputThread.messages[0]);
assert.match(compactHtml, /compact-after-output/);
assert.match(compactHtml, /\u6a21\u578b\u5df2\u5f00\u59cb\u8f93\u51fa/);
assert.match(compactHtml, /\u6d41\u5f0f\u7ed3\u675f\u5df2\u5904\u7406/);

const preflightCompacted = runProgressCompactPreflightEvents([
  { runId: "resp_preflight", event: "run.gateway_selected", timestamp: "2026-05-27T13:04:00.000Z" },
  { runId: "resp_preflight", event: "run.toolset_selection_started", timestamp: "2026-05-27T13:04:00.100Z" },
  { runId: "resp_preflight", event: "run.toolset_selection_done", timestamp: "2026-05-27T13:04:00.250Z" },
]);
assert.deepStrictEqual(preflightCompacted.map((event) => event.event), ["run.gateway_selected", "run.toolset_selection_done"]);

const permissionPreflightCompacted = runProgressCompactPreflightEvents([
  { runId: "resp_permission", event: "run.gateway_selected", timestamp: "2026-05-27T13:04:01.000Z" },
  { runId: "resp_permission", event: "run.toolset_selection_started", timestamp: "2026-05-27T13:04:01.100Z" },
  { runId: "resp_permission", event: "run.permission_preflight_fallback", timestamp: "2026-05-27T13:04:09.100Z" },
]);
assert.deepStrictEqual(permissionPreflightCompacted.map((event) => event.event), ["run.gateway_selected", "run.permission_preflight_fallback"]);
assert.match(runEventTitle({ event: "run.permission_preflight_fallback" }), /\u6743\u9650\u9884\u68c0/);
assert.match(runEventTitle({ event: "run.gateway_worker_starting" }), /\u542f\u52a8\u4e2d/);
const startingPreview = runGatewayWorkerPreviewLabel({
  event: "run.gateway_worker_starting",
  preview: JSON.stringify({ profileId: "lowgw13", provider: "openai-codex", reason: "worker_starting", queueDepth: 1 }),
});
assert.match(startingPreview, /\u542f\u52a8\u4e2d/);
assert.doesNotMatch(startingPreview, /queue|\u6392\u961f/);
assert.match(runGatewayWorkerPreviewLabel({
  event: "run.gateway_worker_queued",
  preview: JSON.stringify({ profileId: "lowgw13", provider: "openai-codex", reason: "workspace_capacity", queueDepth: 2 }),
}), /\u5de5\u4f5c\u533a\u901a\u9053\u5df2\u6ee1.*\u6392\u961f 2/);
assert.match(runGatewayWorkerPreviewLabel({
  event: "run.gateway_worker_start_failed",
  preview: JSON.stringify({ profileId: "lowgw13", provider: "openai-codex", reason: "worker_start_failed", failureCode: "health_check_failed" }),
}), /\u5065\u5eb7\u68c0\u67e5\u5931\u8d25/);

const coldStartThread = {
  id: "thread_cold_start",
  activeRunId: "web_cold_start",
  activeRunIds: ["web_cold_start"],
  messages: [
    {
      id: "msg_cold_start",
      role: "assistant",
      status: "running",
      runId: "web_cold_start",
      taskId: "web_cold_start",
      startedAt: "2026-05-27T13:04:00.000Z",
    },
  ],
  events: [
    {
      runId: "web_cold_start",
      event: "run.gateway_worker_starting",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:04:00.200Z",
      preview: JSON.stringify({ profileId: "lowgw2", provider: "openai-codex", reason: "worker_starting", state: "starting" }),
    },
    {
      runId: "web_cold_start",
      event: "run.gateway_worker_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:04:20.200Z",
      preview: JSON.stringify({ profileId: "lowgw2", provider: "openai-codex", reason: "worker_started", lastStartDurationMs: 20000 }),
    },
    {
      runId: "web_cold_start",
      event: "run.toolset_selection_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:04:21.000Z",
      preview: "",
    },
    {
      runId: "web_cold_start",
      event: "run.permission_preflight_fallback",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:04:31.000Z",
      preview: JSON.stringify({ reason: "permission_preflight_timeout", allowed_toolsets: ["web", "search", "file"] }),
    },
  ],
};
const coldStartHtml = renderMessageRunProgress(coldStartThread, coldStartThread.messages[0]);
assert.match(coldStartHtml, /run-progress-panel inline/);
assert.match(coldStartHtml, /\u8fd0\u884c\u4e2d/);
assert.match(coldStartHtml, /Gateway \u542f\u52a8\u4e2d/);
assert.match(coldStartHtml, /Gateway \u5df2\u542f\u52a8/);
assert.match(coldStartHtml, /\u6743\u9650\u9884\u68c0\u8d85\u65f6/);

const gatewayQueuedThread = {
  id: "thread_gateway_queued",
  activeRunId: "web_gateway_queued",
  activeRunIds: ["web_gateway_queued"],
  messages: [
    {
      id: "msg_gateway_queued",
      role: "assistant",
      status: "queued",
      runId: "web_gateway_queued",
      queuedAt: "2026-05-27T13:04:00.000Z",
    },
  ],
  events: [
    {
      runId: "web_gateway_queued",
      event: "run.gateway_worker_queued",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:04:00.100Z",
      preview: JSON.stringify({ profileId: "lowgw2", provider: "openai-codex", reason: "workspace_capacity", queueDepth: 1 }),
    },
  ],
};
const gatewayQueuedHtml = renderMessageRunProgress(gatewayQueuedThread, gatewayQueuedThread.messages[0]);
assert.match(gatewayQueuedHtml, /run-progress-panel inline/);
assert.match(gatewayQueuedHtml, /Gateway \u6392\u961f\u7b49\u5f85/);
assert.match(gatewayQueuedHtml, /\u5de5\u4f5c\u533a\u901a\u9053\u5df2\u6ee1/);
assert.match(gatewayQueuedHtml, /\u6392\u961f 1/);

const queuedBeforeRunIdThread = {
  id: "thread_queued_before_run_id",
  activeRunId: "",
  activeRunIds: [],
  messages: [
    {
      id: "msg_queued_before_run_id",
      role: "assistant",
      status: "queued",
      queuedAt: "2026-05-27T13:04:00.000Z",
    },
  ],
  events: [],
};
const queuedBeforeRunIdHtml = renderMessageRunProgress(queuedBeforeRunIdThread, queuedBeforeRunIdThread.messages[0]);
assert.match(queuedBeforeRunIdHtml, /run-progress-panel inline pending-run-id/);
assert.match(queuedBeforeRunIdHtml, /\u8bf7\u6c42\u5df2\u53d1\u9001/);
assert.match(queuedBeforeRunIdHtml, /\u7b49\u5f85\u6a21\u578b\u6216\u5de5\u5177\u8fd4\u56de/);

const localTodoIntakePendingThread = {
  id: "thread_local_todo_intake",
  messages: [
    {
      id: "msg_local_todo_intake",
      role: "assistant",
      status: "queued",
      queuedAt: "2026-05-27T13:04:00.000Z",
      localRunProgressEvents: [{
        event: "run.todo_intake_started",
        timestamp: "2026-05-27T13:04:00.000Z",
        preview: "\u6b63\u5728\u68c0\u67e5\u662f\u5426\u9700\u8981\u521b\u5efa\u5f85\u529e",
      }],
    },
  ],
  events: [],
};
const localTodoIntakePendingHtml = renderMessageRunProgress(localTodoIntakePendingThread, localTodoIntakePendingThread.messages[0]);
assert.match(localTodoIntakePendingHtml, /\u6b63\u5728\u8bc6\u522b\u610f\u56fe/);
assert.match(localTodoIntakePendingHtml, /\u6b63\u5728\u68c0\u67e5\u662f\u5426\u9700\u8981\u521b\u5efa\u5f85\u529e/);

const localTodoIntakeWithRunIdThread = {
  id: "thread_local_todo_intake_run",
  activeRunIds: ["run_local_todo_intake"],
  messages: [
    {
      id: "msg_local_todo_intake_run",
      role: "assistant",
      status: "running",
      runId: "run_local_todo_intake",
      queuedAt: "2026-05-27T13:04:00.000Z",
      localRunProgressEvents: [{
        event: "run.todo_intake_started",
        timestamp: "2026-05-27T13:04:00.000Z",
        preview: "\u6b63\u5728\u68c0\u67e5\u662f\u5426\u9700\u8981\u521b\u5efa\u5f85\u529e",
      }],
    },
  ],
  events: [],
};
const localTodoIntakeWithRunIdHtml = renderMessageRunProgress(localTodoIntakeWithRunIdThread, localTodoIntakeWithRunIdThread.messages[0]);
assert.match(localTodoIntakeWithRunIdHtml, /\u6b63\u5728\u8bc6\u522b\u610f\u56fe/);
assert.doesNotMatch(localTodoIntakeWithRunIdHtml, /\u7b49\u5f85\u6a21\u578b\u6216\u5de5\u5177\u8fd4\u56de/);

const terminalHistoryThread = {
  id: "thread_terminal_history",
  activeRunId: "",
  activeRunIds: [],
  messages: [
    {
      id: "msg_terminal_history",
      role: "assistant",
      status: "done",
      runId: "resp_terminal_history",
      responseRunId: "resp_terminal_history",
      startedAt: "2026-05-27T13:05:00.000Z",
      completedAt: "2026-05-27T13:05:08.000Z",
      content: "\u5b8c\u6210\u56de\u6267",
    },
  ],
  events: [
    {
      runId: "resp_terminal_history",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:05:00.500Z",
      preview: "first terminal row",
    },
    ...Array.from({ length: 13 }, (_value, index) => ({
      runId: "resp_terminal_history",
      event: "run.context_ready",
      tool: "hermes_mobile",
      timestamp: `2026-05-27T13:05:${String(index + 1).padStart(2, "0")}.200Z`,
      preview: `history row ${index + 1}`,
    })),
    {
      runId: "resp_terminal_history",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:05:01.000Z",
      preview: "",
    },
    {
      runId: "resp_terminal_history",
      event: "run.completed",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T13:05:08.000Z",
      preview: "",
    },
  ],
};
assert.strictEqual(renderMessageRunProgress(terminalHistoryThread, terminalHistoryThread.messages[0]), "");
const terminalHistoryHtml = renderMessageRunProgressHistory(terminalHistoryThread, terminalHistoryThread.messages[0]);
assert.match(terminalHistoryHtml, /run-progress-history/);
assert.match(terminalHistoryHtml, /\u6a21\u578b\u72b6\u6001/);
assert.match(terminalHistoryHtml, /run-progress-panel inline terminal/);
assert.match(terminalHistoryHtml, /\u8fd0\u884c\u8bb0\u5f55/);
assert.match(terminalHistoryHtml, /16 events/);
assert.match(terminalHistoryHtml, /first terminal row/);
assert.ok(terminalHistoryHtml.indexOf("first terminal row") < terminalHistoryHtml.indexOf("\u5904\u7406\u5b8c\u6210"));
assert.doesNotMatch(terminalHistoryHtml, /\u4ecd\u5728\u8fd0\u884c/);

const unnamedFunctionThread = {
  id: "thread_unnamed_function",
  activeRunId: "resp_unnamed_function",
  activeRunIds: ["resp_unnamed_function"],
  messages: [
    {
      id: "msg_unnamed_function",
      role: "assistant",
      status: "running",
      runId: "resp_unnamed_function",
      responseRunId: "resp_unnamed_function",
      startedAt: "2026-05-27T13:10:00.000Z",
    },
  ],
  events: [
    {
      runId: "resp_unnamed_function",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T13:10:01.000Z",
      preview: JSON.stringify({ callId: "call_missing_name" }),
    },
    {
      runId: "resp_unnamed_function",
      event: "response.output_item.done",
      tool: "function_call_output",
      timestamp: "2026-05-27T13:10:03.000Z",
      preview: JSON.stringify({ callId: "call_missing_name" }),
    },
  ],
};
const unnamedHtml = renderMessageRunProgress(unnamedFunctionThread, unnamedFunctionThread.messages[0]);
assert.doesNotMatch(unnamedHtml, />Function</);
assert.doesNotMatch(unnamedHtml, /Function Function/);

const unrelatedActiveThread = {
  id: "thread_unrelated_active",
  activeRunId: "resp_slow",
  activeRunIds: ["resp_slow"],
  messages: [
    {
      id: "msg_slow",
      role: "assistant",
      status: "running",
      runId: "resp_slow",
      responseRunId: "resp_slow",
      startedAt: "2026-05-27T12:00:00.000Z",
    },
    {
      id: "msg_fast",
      role: "assistant",
      status: "running",
      taskId: "web_fast",
      originalRunId: "web_fast",
      responseRunId: "resp_fast",
      runId: "resp_fast",
      startedAt: "2026-05-27T12:01:05.000Z",
    },
  ],
  events: [
    {
      runId: "resp_slow",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:00:30.000Z",
      preview: JSON.stringify({ name: "slow_search" }),
    },
    {
      runId: "web_fast",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:01:05.500Z",
    },
    {
      runId: "resp_fast",
      event: "response.output_item.added",
      tool: "function_call",
      timestamp: "2026-05-27T12:01:06.000Z",
      preview: JSON.stringify({ name: "wardrobe_test" }),
    },
  ],
};

const fastHtml = renderMessageRunProgress(unrelatedActiveThread, unrelatedActiveThread.messages[1]);
assert.match(fastHtml, /Function wardrobe_test/);
assert.doesNotMatch(fastHtml, /slow_search/);

const pendingThread = {
  id: "thread_pending_response",
  activeRunId: "resp_pending",
  activeRunIds: ["resp_pending"],
  messages: [
    {
      id: "msg_pending",
      role: "assistant",
      status: "running",
      taskId: "web_pending",
      originalRunId: "web_pending",
      runId: "web_pending",
      startedAt: "2026-05-27T12:02:00.000Z",
    },
  ],
  events: [
    {
      runId: "web_pending",
      event: "run.request_sent",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:02:00.500Z",
    },
    {
      runId: "resp_pending",
      event: "run.model_stream_started",
      tool: "hermes_mobile",
      timestamp: "2026-05-27T12:02:01.000Z",
    },
  ],
};

const pendingMessage = messageForRunProgress(pendingThread, "resp_pending");
assert.strictEqual(pendingMessage?.id, "msg_pending");
assert.deepStrictEqual(Array.from(messageRunProgressIds(pendingThread, pendingMessage)), ["web_pending"]);
rememberMessageRunProgressId(pendingThread, pendingMessage, "resp_pending");
assert.deepStrictEqual(Array.from(messageRunProgressIds(pendingThread, pendingMessage)), ["web_pending", "resp_pending"]);
assert.match(renderMessageRunProgress(pendingThread, pendingMessage), /\u6a21\u578b\u6d41\u5df2\u8fde\u63a5/);

fakeBody.inserted = "";
fakeConversation.scrollHeight = 1000;
fakeConversation.scrollTop = 700;
followConversationBottom = true;
scrollCalls = 0;
visibilityCalls = 0;
assert.strictEqual(shouldKeepRunProgressPinnedToBottom(fakeConversation), true);
assert.strictEqual(renderMessageRunProgressInPlace(thread, thread.messages[1]), true);
assert.match(fakeBody.inserted, /run-progress-panel/);
assert.strictEqual(scrollCalls, 0);
assert.strictEqual(fakeConversation.scrollTop, 950);
assert.strictEqual(testState.conversationPinnedToBottom, true);
assert.ok(testState.conversationViewportBottomFollowUntil >= Date.now());
assert.ok(visibilityCalls >= 1);

fakeBody.inserted = "";
fakeConversation.scrollHeight = 1000;
fakeConversation.scrollTop = 300;
testState.conversationPinnedToBottom = false;
testState.conversationViewportBottomFollowUntil = 0;
followConversationBottom = false;
scrollCalls = 0;
assert.strictEqual(shouldKeepRunProgressPinnedToBottom(fakeConversation), false);
assert.strictEqual(renderMessageRunProgressInPlace(thread, thread.messages[1]), true);
assert.strictEqual(scrollCalls, 0);
assert.strictEqual(fakeConversation.scrollTop, 300);

testState.currentThread = { id: "thread_fallback", messages: [], events: [] };
testState.runProgressFallbackRefreshTimer = 0;
testState.runProgressFallbackRefreshThreadId = "";
fallbackRefreshCalls = 0;
fallbackRefreshOptions = null;
assert.strictEqual(scheduleRunProgressFallbackThreadRefresh("thread_fallback"), true);
assert.strictEqual(fallbackRefreshCalls, 1);
assert.strictEqual(fallbackRefreshOptions?.stickToBottom, false);
assert.strictEqual(fallbackRefreshOptions?.delayMs, 0);
testState.runProgressFallbackRefreshTimer = 0;
testState.runProgressFallbackRefreshThreadId = "";

fallbackRefreshCalls = 0;
fullRenderCalls = 0;
testState.currentThread = { id: "thread_event_missing_message", messages: [], events: [] };
appendRunEventToCurrentThread({
  threadId: "thread_event_missing_message",
  runId: "resp_missing_message",
  event: { runId: "resp_missing_message", event: "run.gateway_selected", timestamp: "2026-05-27T13:12:00.000Z" },
});
assert.strictEqual(fallbackRefreshCalls, 1);
assert.strictEqual(fullRenderCalls, 0);

console.log("run progress UI behavior assertions passed");
