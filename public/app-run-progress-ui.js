"use strict";

const RUN_EVENT_PREVIEW_MAX_CHARS = 180;
const RUN_PROGRESS_RENDER_THROTTLE_MS = 750;
const RUN_PROGRESS_FALLBACK_REFRESH_MS = 650;
const RUN_PROGRESS_START_EVENT_REVEAL_MS = 1000;
const RUN_PROGRESS_MAX_VISIBLE_EVENTS = 12;
const RUN_PROGRESS_TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);
const RUN_PROGRESS_START_EVENTS = new Set([
  "run.context_ready",
  "run.gateway_selected",
  "run.toolset_selection_started",
  "run.toolset_selection_done",
  "run.toolset_selection_failed",
  "run.toolset_escalation_required",
  "run.toolset_escalation_retrying",
  "run.permission_required",
  "run.request_sent",
  "run.model_stream_started",
  "run.model_first_byte_retrying",
  "run.model_output_started",
  "run.stream_closed_without_terminal",
  "run.stream_failed",
  "run.gateway_start_timeout",
  "run.liveness_stale",
  "run.tool_budget_exceeded",
]);
const RUN_PROGRESS_HIDDEN_EVENTS = new Set([
  "run.liveness_warning",
]);

function boundedRunEventPreview(value) {
  let text = "";
  if (value && typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch (_err) {
      text = String(value || "");
    }
  } else {
    text = String(value || "");
  }
  return text.length > RUN_EVENT_PREVIEW_MAX_CHARS ? text.slice(0, RUN_EVENT_PREVIEW_MAX_CHARS) : text;
}

function parseRunEventPreviewObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value || "").trim();
  if (!text || !text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function normalizeRunEvent(event = {}, fallbackRunId = "") {
  return {
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: String(event.runId || event.run_id || fallbackRunId || ""),
    tool: event.tool || null,
    preview: boundedRunEventPreview(event.preview || event.text || event.error || ""),
    duration: event.duration || null,
    error: Boolean(event.error),
  };
}

function runProgressTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value > 10_000_000_000 ? value : value * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function runEventKey(event) {
  return [
    event.runId || "",
    event.timestamp || "",
    event.event || "",
    event.tool || "",
    boundedRunEventPreview(event.preview || "").slice(0, 80),
  ].join("|");
}

function appendRunEventToCurrentThread(payload) {
  if (!state.currentThread || payload.threadId !== state.currentThread.id) return;
  const event = normalizeRunEvent(payload.event || {}, payload.runId || "");
  state.currentThread.events = Array.isArray(state.currentThread.events) ? state.currentThread.events : [];
  const key = runEventKey(event);
  if (!state.currentThread.events.some((item) => runEventKey(normalizeRunEvent(item)) === key)) {
    state.currentThread.events.push(event);
    state.currentThread.events = state.currentThread.events.slice(-80);
  }
  if (payload.thread) {
    state.currentThread.status = payload.thread.status || state.currentThread.status;
    state.currentThread.activeRunId = payload.thread.activeRunId;
    state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
    state.currentThread.updatedAt = payload.thread.updatedAt || state.currentThread.updatedAt;
  }
  if (scheduleRunProgressRenderForRun(event.runId || payload.runId || "")) {
    clearRunProgressFallbackThreadRefresh(payload.threadId);
  } else {
    scheduleRunProgressFallbackThreadRefresh(payload.threadId);
  }
}

function runEventPreviewField(event, fields = []) {
  const parsed = parseRunEventPreviewObject(event?.preview);
  for (const field of fields) {
    const value = parsed?.[field] || event?.[field];
    if (value) return String(value).trim();
  }
  const text = String(event?.preview || "");
  for (const field of fields) {
    const pattern = new RegExp(`["']${field}["']\\s*:\\s*["']([^"']+)["']`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function runEventSkillName(event) {
  return runEventPreviewField(event, ["name", "path", "skill", "id"])
    .replace(/^skills\//i, "")
    .replace(/\/SKILL\.md$/i, "")
    .trim();
}

function runEventFunctionName(event) {
  const parsed = parseRunEventPreviewObject(event?.preview);
  const fromPreview = String(
    parsed?.name
    || parsed?.function
    || parsed?.functionName
    || parsed?.function_name
    || parsed?.tool
    || "",
  ).trim();
  if (fromPreview && !/^(function_call|function_call_output|message|skill_view)$/i.test(fromPreview)) return fromPreview;
  const tool = String(event?.tool || "").trim();
  if (!tool || /^(function_call|function_call_output|message|skill_view)$/i.test(tool)) return "";
  return tool;
}

function runEventFunctionCallId(event) {
  return runEventPreviewField(event, ["callId", "call_id", "id"]);
}

function isFunctionRunEvent(event) {
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "function_call") return true;
  if (!String(event?.event || "").startsWith("response.output_item.")) return false;
  return Boolean(tool && !["function_call_output", "message", "skill_view"].includes(tool));
}

function runEventWithFunctionName(event, name, callId = "") {
  const functionName = String(name || "").trim();
  if (!functionName || runEventFunctionName(event)) return event;
  const parsed = parseRunEventPreviewObject(event?.preview) || {};
  const preview = Object.assign({}, parsed, { name: functionName });
  if (callId && !preview.callId && !preview.call_id) preview.callId = callId;
  return Object.assign({}, event, { preview: JSON.stringify(preview) });
}

function runProgressEventsWithFunctionNames(events = []) {
  const nameByCallId = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const name = runEventFunctionName(event);
    const callId = runEventFunctionCallId(event);
    if (name && callId) nameByCallId.set(callId, name);
  }
  let lastFunctionName = "";
  return (Array.isArray(events) ? events : []).map((event) => {
    const tool = String(event?.tool || "").trim().toLowerCase();
    const name = runEventFunctionName(event);
    const callId = runEventFunctionCallId(event);
    if (isFunctionRunEvent(event) && name) {
      lastFunctionName = name;
      if (callId) nameByCallId.set(callId, name);
      return event;
    }
    if (tool === "function_call_output" && !name) {
      const fallback = (callId && nameByCallId.get(callId)) || lastFunctionName;
      return runEventWithFunctionName(event, fallback, callId);
    }
    return event;
  });
}

function runEventOperationKind(event) {
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "skill_view") return "skill";
  if (tool === "function_call" || tool === "function_call_output") return "function";
  if (isFunctionRunEvent(event)) return "function";
  return "";
}

function runEventOperationName(event) {
  const kind = runEventOperationKind(event);
  if (kind === "skill") return runEventSkillName(event) || "Skill";
  if (kind === "function") return runEventFunctionName(event);
  return "";
}

function runEventOperationKey(event) {
  const kind = runEventOperationKind(event);
  if (!kind) return "";
  const callId = kind === "function" ? runEventFunctionCallId(event) : "";
  const name = runEventOperationName(event);
  return [kind, callId || name || String(event?.tool || "")].join("|");
}

function isRunOperationStartEvent(event) {
  const name = String(event?.event || "");
  if (name !== "response.output_item.added") return false;
  const kind = runEventOperationKind(event);
  if (!kind) return false;
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (kind === "function" && tool === "function_call_output") return false;
  return true;
}

function isRunOperationDoneEvent(event) {
  const name = String(event?.event || "");
  if (name !== "response.output_item.done") return false;
  const kind = runEventOperationKind(event);
  if (!kind) return false;
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (kind === "function" && tool === "function_call") return false;
  return true;
}

function runProgressCompactOperationEvents(events = []) {
  const out = [];
  const openByKey = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const tool = String(event?.tool || "").trim().toLowerCase();
    const eventName = String(event?.event || "");
    if (runEventOperationKind(event) === "function" && !runEventFunctionName(event)) continue;
    if (eventName === "response.output_item.done" && tool === "function_call") continue;
    if (eventName === "response.output_item.added" && tool === "function_call_output") continue;
    if (isRunOperationStartEvent(event)) {
      const key = runEventOperationKey(event);
      const row = Object.assign({}, event, {
        operationKind: runEventOperationKind(event),
        operationName: runEventOperationName(event),
        operationStartedAt: event.timestamp,
        operationDoneAt: null,
        operationStatus: "active",
      });
      out.push(row);
      if (key) openByKey.set(key, row);
      continue;
    }
    if (isRunOperationDoneEvent(event)) {
      const key = runEventOperationKey(event);
      const fallbackKey = [runEventOperationKind(event), runEventOperationName(event)].join("|");
      const row = (key ? openByKey.get(key) : null) || (fallbackKey ? openByKey.get(fallbackKey) : null);
      if (row) {
        row.operationDoneAt = event.timestamp;
        row.operationStatus = event.error ? "error" : "done";
        row.error = Boolean(row.error || event.error);
        if (!row.preview && event.preview) row.preview = event.preview;
        openByKey.delete(key);
      } else {
        out.push(Object.assign({}, event, {
          operationKind: runEventOperationKind(event),
          operationName: runEventOperationName(event),
          operationStartedAt: null,
          operationDoneAt: event.timestamp,
          operationStatus: event.error ? "error" : "done",
        }));
      }
      continue;
    }
    out.push(event);
  }
  return out;
}

function runProgressCompactPreflightEvents(events = []) {
  const toolsetTerminalRuns = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const name = String(event?.event || "");
    if (name === "run.toolset_selection_done" || name === "run.toolset_selection_failed") {
      toolsetTerminalRuns.add(String(event?.runId || "__run__"));
    }
  }
  if (!toolsetTerminalRuns.size) return Array.isArray(events) ? events : [];
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (String(event?.event || "") !== "run.toolset_selection_started") return true;
    return !toolsetTerminalRuns.has(String(event?.runId || "__run__"));
  });
}

function runEventToolLabel(event) {
  const tool = String(event?.tool || "").trim();
  const lower = tool.toLowerCase();
  if (lower === "skill_view") {
    const skillName = runEventSkillName(event);
    return skillName ? `Skill ${skillName}` : "Skill view";
  }
  if (lower === "function_call") {
    const functionName = runEventFunctionName(event);
    return functionName ? `Function ${functionName}` : "Function call";
  }
  if (lower === "function_call_output") {
    const functionName = runEventFunctionName(event);
    return functionName ? `Function result ${functionName}` : "Function result";
  }
  if (lower === "message") return "\u56de\u590d";
  return tool;
}

function runEventTitle(event) {
  if (event?.operationKind) {
    const prefix = event.operationKind === "skill" ? "Skill" : "Function";
    const name = String(event.operationName || "").trim();
    if (!name || name.toLowerCase() === prefix.toLowerCase()) return prefix;
    return `${prefix} ${name}`.trim();
  }
  const name = String(event?.event || "event");
  const tool = runEventToolLabel(event);
  if (name === "response.output_item.added") return tool ? `\u5f00\u59cb ${tool}` : "\u5f00\u59cb\u5904\u7406";
  if (name === "response.output_item.done") return tool ? `\u5b8c\u6210 ${tool}` : "\u9636\u6bb5\u5b8c\u6210";
  if (name === "response.output_text.done") return "\u751f\u6210\u56de\u590d";
  if (name === "run.final_message_started") return "\u5f00\u59cb\u751f\u6210\u56de\u590d";
  if (name === "run.final_message_done") return "\u56de\u590d\u5df2\u751f\u6210";
  if (name === "run.context_ready") return "\u4e0a\u4e0b\u6587\u5df2\u6574\u7406";
  if (name === "run.gateway_selected") return "Gateway \u5df2\u9009\u62e9";
  if (name === "run.toolset_selection_started") return "\u6b63\u5728\u68c0\u67e5\u6743\u9650\u4e0e\u5de5\u5177\u96c6";
  if (name === "run.toolset_selection_done") return "\u6743\u9650\u4e0e\u5de5\u5177\u96c6\u5df2\u786e\u8ba4";
  if (name === "run.toolset_selection_failed") return "\u6743\u9650\u4e0e\u5de5\u5177\u96c6\u68c0\u67e5\u56de\u9000";
  if (name === "run.toolset_escalation_required") return "\u9700\u8981\u8ffd\u52a0\u5de5\u5177\u96c6";
  if (name === "run.toolset_escalation_retrying") return "\u6b63\u5728\u8ffd\u52a0\u5de5\u5177\u5e76\u91cd\u65b0\u8fd0\u884c";
  if (name === "run.permission_required") return "\u9700\u8981 Owner \u6388\u6743";
  if (name === "run.request_sent") return "\u8bf7\u6c42\u5df2\u53d1\u9001";
  if (name === "run.model_stream_started") return "\u6a21\u578b\u6d41\u5df2\u8fde\u63a5";
  if (name === "run.model_first_byte_retrying") return "\u6a21\u578b\u65e0\u9996\u5305\uff0c\u6b63\u5728\u91cd\u8bd5";
  if (name === "run.model_output_started") return "\u6a21\u578b\u5df2\u5f00\u59cb\u8f93\u51fa";
  if (name === "run.stream_closed_without_terminal") return "\u6d41\u5f0f\u7ed3\u675f\u5df2\u5904\u7406";
  if (name === "run.stream_failed") return "\u6a21\u578b\u6d41\u5f0f\u8fde\u63a5\u5931\u8d25";
  if (name === "run.gateway_start_timeout") return "Gateway \u672a\u521b\u5efa\u8fd0\u884c";
  if (name === "run.liveness_stale") return "Gateway \u54cd\u5e94\u8d85\u65f6";
  if (name === "run.tool_budget_exceeded") return "\u5de5\u5177\u8c03\u7528\u8d85\u9650";
  if (name === "response.completed" || name === "run.completed") return "\u5904\u7406\u5b8c\u6210";
  if (name === "response.failed" || name === "run.failed") return "\u5904\u7406\u5931\u8d25";
  return tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "");
}

function runEventStatusLabel(event, startMs) {
  if (!event?.operationKind) return runEventTimeLabel(event, startMs);
  const start = runProgressTimestampMs(event.operationStartedAt || event.timestamp);
  const done = runProgressTimestampMs(event.operationDoneAt);
  if (event.operationStatus === "done" && start && done) {
    return `完成 · ${runProgressDurationText((done - start) / 1000, { allowZero: true })}`;
  }
  if (event.operationStatus === "error") {
    return done && start ? `失败 · ${runProgressDurationText((done - start) / 1000, { allowZero: true })}` : "失败";
  }
  return start ? `运行中 · ${runProgressDurationLabel(start)}` : "运行中";
}

function runEventRowClass(event) {
  const classes = ["run-progress-row"];
  if (event?.error || event?.operationStatus === "error") classes.push("error");
  if (event?.operationKind) classes.push("run-progress-operation", `run-progress-operation-${event.operationStatus || "active"}`);
  return classes.join(" ");
}

function runEventPreviewLabel(event) {
  if (event?.error) return boundedRunEventPreview(event.preview || "");
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "skill_view" || tool === "function_call" || tool === "function_call_output" || tool === "message") return "";
  const preview = boundedRunEventPreview(event?.preview || "");
  if (/^[\[{]/.test(preview.trim())) return "";
  return preview;
}

function runProgressEvents(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  if (!thread || !runSet.size) return [];
  return (Array.isArray(thread.events) ? thread.events : [])
    .map((event) => normalizeRunEvent(event))
    .filter((event) => !event.runId || runSet.has(String(event.runId)));
}

function isRunProgressStartEvent(event) {
  return RUN_PROGRESS_START_EVENTS.has(String(event?.event || ""));
}

function runProgressVisibleEvents(events = [], startMs = 0, now = Date.now()) {
  let startEventIndex = 0;
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (!isRunProgressStartEvent(event)) return true;
    const revealAt = startMs + (startEventIndex * RUN_PROGRESS_START_EVENT_REVEAL_MS);
    startEventIndex += 1;
    return now >= revealAt;
  });
}

function runProgressDisplayEvents(events = [], startMs = 0, options = {}) {
  const visible = runProgressVisibleEvents(events, startMs)
    .filter((event) => !RUN_PROGRESS_HIDDEN_EVENTS.has(String(event?.event || "")));
  if (options.all) return visible;
  return visible.slice(-RUN_PROGRESS_MAX_VISIBLE_EVENTS);
}

function shouldCompactRunProgressAfterOutput(allEvents = []) {
  const outputStartedMs = Math.max(0, ...allEvents
    .filter((event) => ["run.model_output_started", "run.final_message_started"].includes(String(event?.event || "")))
    .map((event) => runProgressTimestampMs(event.timestamp))
    .filter(Boolean));
  if (!outputStartedMs) return false;
  return !allEvents.some((event) => (
    runEventOperationKind(event)
    && runProgressTimestampMs(event.timestamp) > outputStartedMs
  ));
}

function normalizeRunProgressId(value) {
  return String(value || "").trim();
}

function uniqueRunProgressIds(values = []) {
  return [...new Set((values || []).map(normalizeRunProgressId).filter(Boolean))];
}

function messageOwnRunIds(message = {}) {
  return uniqueRunProgressIds([
    message.originalRunId,
    message.responseRunId,
    message.runId,
    message.taskId,
  ]);
}

function threadActiveRunIds(thread = {}) {
  return uniqueRunProgressIds([
    thread?.activeRunId,
    ...(Array.isArray(thread?.activeRunIds) ? thread.activeRunIds : []),
  ]);
}

function messageStatusCanHaveRunProgress(message = {}) {
  return ["queued", "running", "done", "failed", "cancelled"].includes(String(message?.status || ""));
}

function messageStatusIsActive(message = {}) {
  return ["queued", "running"].includes(String(message?.status || ""));
}

function runProgressMessageKey(thread, message = {}) {
  const threadId = normalizeRunProgressId(thread?.id);
  const messageId = normalizeRunProgressId(message?.id);
  return threadId && messageId ? `${threadId}:${messageId}` : "";
}

function runProgressExtraRunIdStore() {
  if (!state.runProgressMessageExtraRunIds) state.runProgressMessageExtraRunIds = new Map();
  return state.runProgressMessageExtraRunIds;
}

function rememberedMessageRunProgressIds(thread, message = {}) {
  const key = runProgressMessageKey(thread, message);
  if (!key || !state.runProgressMessageExtraRunIds) return [];
  return uniqueRunProgressIds(state.runProgressMessageExtraRunIds.get(key) || []);
}

function rememberMessageRunProgressId(thread, message = {}, runId) {
  const id = normalizeRunProgressId(runId);
  const key = runProgressMessageKey(thread, message);
  if (!id || !key || messageOwnRunIds(message).includes(id)) return;
  const store = runProgressExtraRunIdStore();
  store.set(key, uniqueRunProgressIds([...(store.get(key) || []), id]).slice(-4));
}

function messageRunProgressIds(thread, message = {}, options = {}) {
  return uniqueRunProgressIds([
    ...messageOwnRunIds(message),
    ...rememberedMessageRunProgressIds(thread, message),
    ...(Array.isArray(options.extraRunIds) ? options.extraRunIds : []),
  ]);
}

function runProgressActiveMessages(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  return (thread?.messages || [])
    .filter(messageStatusCanHaveRunProgress)
    .filter((message) => !runSet.size || messageOwnRunIds(message).some((id) => runSet.has(id)));
}

function runProgressStartMs(thread, runIds, events) {
  const values = [
    ...runProgressActiveMessages(thread, runIds).flatMap((message) => [
      message.queuedAt,
      message.startedAt,
      message.createdAt,
      message.updatedAt,
    ]),
    ...(events || []).map((event) => event.timestamp),
  ].map(runProgressTimestampMs).filter(Boolean);
  return values.length ? Math.min(...values) : Date.now();
}

function runProgressDurationText(seconds, options = {}) {
  const totalSeconds = Math.max(options.allowZero ? 0 : 1, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return `${hours}\u5c0f\u65f6${hourMinutes}\u5206`;
  }
  if (minutes) return `${minutes}\u5206${rest}\u79d2`;
  return `${rest}\u79d2`;
}

function runProgressDurationLabel(startMs, now = Date.now()) {
  if (!startMs) return "";
  return runProgressDurationText((now - startMs) / 1000);
}

function runProgressOffsetLabel(startMs, eventMs) {
  if (!startMs || !eventMs) return "";
  return runProgressDurationText((eventMs - startMs) / 1000, { allowZero: true });
}

function runEventTimeLabel(event, startMs) {
  return runProgressOffsetLabel(startMs, runProgressTimestampMs(event?.timestamp));
}

function runProgressTerminalMs(message = {}) {
  const values = [message.completedAt, message.failedAt, message.cancelledAt, message.updatedAt]
    .map(runProgressTimestampMs)
    .filter(Boolean);
  return values.length ? Math.max(...values) : 0;
}

function runProgressAgeLabel(timestampMs, now = Date.now()) {
  if (!timestampMs) return "";
  return `${runProgressDurationLabel(timestampMs, now)}\u524d`;
}

function renderRunProgressWaitingRow(startMs) {
  return `<div class="run-progress-row run-progress-waiting">
    <span class="run-progress-dot" aria-hidden="true"></span>
    <span class="run-progress-main">\u8bf7\u6c42\u5df2\u53d1\u9001</span>
    <span class="run-progress-time" data-run-progress-offset="${escapeHtml(String(startMs))}">${escapeHtml(runProgressOffsetLabel(startMs, Date.now()))}</span>
    <span class="run-progress-preview">\u7b49\u5f85\u6a21\u578b\u6216\u5de5\u5177\u8fd4\u56de</span>
  </div>`;
}

function renderRunProgressQuietRow(lastEventMs, startMs) {
  if (!lastEventMs || Date.now() - lastEventMs < 15000) return "";
  return `<div class="run-progress-row run-progress-quiet">
    <span class="run-progress-dot" aria-hidden="true"></span>
    <span class="run-progress-main">\u4ecd\u5728\u8fd0\u884c</span>
    <span class="run-progress-time">${escapeHtml(runProgressOffsetLabel(startMs, lastEventMs))}</span>
    <span class="run-progress-preview">\u6700\u8fd1\u65e0\u65b0\u4e8b\u4ef6\uff0c\u4ecd\u5728\u7b49\u5f85\u8fd4\u56de</span>
  </div>`;
}

function renderRunProgressPanel(thread, runIds, options = {}) {
  const ids = (runIds || []).filter(Boolean);
  if (!ids.length) return "";
  const allEvents = runProgressEvents(thread, ids);
  const startMs = runProgressStartMs(thread, ids, allEvents);
  const compactAfterOutput = !options.terminal && shouldCompactRunProgressAfterOutput(allEvents);
  const compactedEvents = runProgressCompactOperationEvents(runProgressCompactPreflightEvents(runProgressEventsWithFunctionNames(allEvents)));
  const events = options.terminal
    ? runProgressDisplayEvents(compactedEvents, startMs, { all: true })
    : (compactAfterOutput
      ? runProgressDisplayEvents(compactedEvents, startMs).slice(-2)
      : runProgressDisplayEvents(compactedEvents, startMs));
  const eventTimes = allEvents.map((event) => runProgressTimestampMs(event.timestamp)).filter(Boolean);
  const lastEventMs = eventTimes.length ? Math.max(...eventTimes) : 0;
  const quietRow = options.terminal ? "" : renderRunProgressQuietRow(lastEventMs, startMs);
  const rows = events.length
    ? `${quietRow}${events.map((event) => {
      const preview = runEventPreviewLabel(event);
      return `
      <div class="${escapeHtml(runEventRowClass(event))}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventStatusLabel(event, startMs))}</span>
        ${preview ? `<span class="run-progress-preview">${escapeHtml(preview)}</span>` : ""}
      </div>`;
    }).join("")}`
    : renderRunProgressWaitingRow(startMs);
  const elapsedLabel = options.terminal
    ? runProgressDurationLabel(startMs, options.terminalMs || Date.now())
    : runProgressDurationLabel(startMs);
  const elapsedAttr = options.terminal ? "" : ` data-run-progress-elapsed="${escapeHtml(String(startMs))}"`;
  return `<aside class="run-progress-panel${options.inline ? " inline" : ""}${options.terminal ? " terminal" : ""}${compactAfterOutput ? " compact-after-output" : ""}" aria-live="polite">
    <div class="run-progress-head">
      <span>${options.terminal ? "\u8fd0\u884c\u8bb0\u5f55" : "\u8fd0\u884c\u4e2d"}</span>
      <span${elapsedAttr}>${escapeHtml(elapsedLabel)}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function renderMessageRunProgress(thread, message = {}, options = {}) {
  if (message?.role !== "assistant") return "";
  const status = String(message.status || "");
  if (!messageStatusCanHaveRunProgress(message)) return "";
  if (RUN_PROGRESS_TERMINAL_STATUSES.has(status)) return "";
  const runIds = messageRunProgressIds(thread, message, options);
  if (!runIds.length) return "";
  return renderRunProgressPanel(thread, runIds, {
    inline: true,
    terminal: false,
  });
}

function renderMessageRunProgressHistory(thread, message = {}, options = {}) {
  if (message?.role !== "assistant") return "";
  const status = String(message.status || "");
  if (!RUN_PROGRESS_TERMINAL_STATUSES.has(status)) return "";
  if (!messageStatusCanHaveRunProgress(message)) return "";
  const runIds = messageRunProgressIds(thread, message, options);
  if (!runIds.length) return "";
  const allEvents = runProgressEvents(thread, runIds);
  if (!allEvents.length) return "";
  const terminalMs = runProgressTerminalMs(message);
  const startMs = runProgressStartMs(thread, runIds, allEvents);
  const elapsedLabel = runProgressDurationLabel(startMs, terminalMs || Date.now());
  const statusLabel = status === "failed"
    ? "\u5931\u8d25"
    : (status === "cancelled" ? "\u5df2\u53d6\u6d88" : "\u5b8c\u6210");
  const title = `\u6a21\u578b\u72b6\u6001: ${statusLabel} · ${elapsedLabel} · ${allEvents.length} events`;
  const panel = renderRunProgressPanel(thread, runIds, {
    inline: true,
    terminal: true,
    terminalMs,
  });
  return `<details class="run-progress-history" title="${escapeHtml(title)}">
    <summary aria-label="${escapeHtml(title)}">\u6a21\u578b\u72b6\u6001</summary>
    <div class="run-progress-history-details">${panel}</div>
  </details>`;
}

function updateExistingRunProgressPanel(existing, html) {
  if (!existing || !html) return false;
  if (existing.outerHTML === html) return true;
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    existing.outerHTML = html;
    return true;
  }
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const next = template.content?.firstElementChild;
  if (!next) return false;
  existing.className = next.className;
  existing.setAttribute("aria-live", next.getAttribute("aria-live") || "polite");
  const existingHead = existing.querySelector(".run-progress-head");
  const nextHead = next.querySelector(".run-progress-head");
  if (existingHead && nextHead && existingHead.innerHTML !== nextHead.innerHTML) {
    existingHead.innerHTML = nextHead.innerHTML;
  }
  const existingRows = existing.querySelector(".run-progress-rows");
  const nextRows = next.querySelector(".run-progress-rows");
  if (existingRows && nextRows && existingRows.innerHTML !== nextRows.innerHTML) {
    existingRows.innerHTML = nextRows.innerHTML;
  }
  return true;
}

function messageForRunProgress(thread, runId) {
  const id = normalizeRunProgressId(runId);
  if (!thread || !id) return null;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const direct = [...messages].reverse().find((message) => (
    message?.role === "assistant"
    && messageStatusCanHaveRunProgress(message)
    && messageOwnRunIds(message).includes(id)
  ));
  if (direct) return direct;
  const activeIds = new Set(threadActiveRunIds(thread));
  if (!activeIds.has(id)) return null;
  return [...messages].reverse().find((message) => (
    message?.role === "assistant"
    && messageStatusIsActive(message)
  )) || null;
}

function shouldKeepRunProgressPinnedToBottom(conversation = $("conversation")) {
  if (!conversation) return false;
  if (typeof conversationViewportRefreshApplies === "function" && !conversationViewportRefreshApplies()) return false;
  if (typeof shouldFollowConversationBottomDuringViewport === "function") {
    return shouldFollowConversationBottomDuringViewport();
  }
  if (typeof shouldForceChatStickToBottom === "function" && shouldForceChatStickToBottom()) return true;
  if (state.conversationPinnedToBottom) return true;
  if (typeof isNearBottom === "function") return isNearBottom(220);
  const bottomOffset = Math.max(0, conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight);
  return bottomOffset < 220;
}

function runProgressScrollMetrics(conversation) {
  if (!conversation) return null;
  const scrollHeight = Number(conversation.scrollHeight || 0);
  const scrollTop = Number(conversation.scrollTop || 0);
  const clientHeight = Number(conversation.clientHeight || 0);
  return {
    scrollHeight,
    scrollTop,
    clientHeight,
    bottomOffset: Math.max(0, scrollHeight - scrollTop - clientHeight),
  };
}

function stickRunProgressToConversationBottom(conversation, shouldStick, beforeMetrics = null) {
  if (!conversation || !shouldStick) return;
  const before = beforeMetrics || runProgressScrollMetrics(conversation);
  if (!before) return;
  const now = Date.now();
  state.conversationViewportBottomFollowUntil = Math.max(
    Number(state.conversationViewportBottomFollowUntil || 0),
    now + 2500
  );
  state.suppressConversationPinUntil = Math.max(
    Number(state.suppressConversationPinUntil || 0),
    now + 500
  );
  state.conversationPinnedToBottom = before.bottomOffset < 96;
  const stick = () => {
    const afterHeight = Number(conversation.scrollHeight || 0);
    const afterClientHeight = Number(conversation.clientHeight || 0);
    const maxTop = Math.max(0, afterHeight - afterClientHeight);
    const heightDelta = Math.max(0, afterHeight - before.scrollHeight);
    const targetTop = before.bottomOffset < 8
      ? maxTop
      : Math.max(0, Math.min(maxTop, before.scrollTop + heightDelta));
    conversation.scrollTop = targetTop;
    state.conversationPinnedToBottom = Math.max(0, afterHeight - targetTop - afterClientHeight) < 96;
    if (typeof scheduleMessageScrollButtonVisibility === "function") {
      scheduleMessageScrollButtonVisibility(conversation);
    }
  };
  stick();
  requestAnimationFrame(stick);
}

function renderMessageRunProgressInPlace(thread, message = {}, options = {}) {
  if (!thread || !message?.id) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  if (!article || !body) return false;
  const conversation = $("conversation");
  const shouldStick = shouldKeepRunProgressPinnedToBottom(conversation);
  const scrollMetrics = runProgressScrollMetrics(conversation);
  const existing = body.querySelector(".run-progress-panel.inline");
  const html = renderMessageRunProgress(thread, message, options);
  if (!html) {
    existing?.remove?.();
    syncRunProgressTicker(conversation);
    stickRunProgressToConversationBottom(conversation, shouldStick, scrollMetrics);
    return true;
  }
  if (existing) {
    updateExistingRunProgressPanel(existing, html);
  } else {
    const content = body.querySelector(".text-content");
    if (content) content.insertAdjacentHTML("afterend", html);
    else body.insertAdjacentHTML("afterbegin", html);
  }
  syncRunProgressTicker(conversation);
  stickRunProgressToConversationBottom(conversation, shouldStick, scrollMetrics);
  scheduleMessageScrollButtonVisibility(article);
  return true;
}

function scheduleRunProgressRenderForRun(runId) {
  const id = String(runId || "").trim();
  const thread = state.currentThread;
  const message = messageForRunProgress(thread, id);
  if (!id || !message?.id) return false;
  rememberMessageRunProgressId(thread, message, id);
  const key = `${thread?.id || ""}:${message.id}:${id}`;
  if (state.runProgressRenderScheduled.has(key)) return true;
  state.runProgressRenderScheduled.add(key);
  const lastAt = state.runProgressRenderLastAt.get(key) || 0;
  const delay = Math.max(0, RUN_PROGRESS_RENDER_THROTTLE_MS - (Date.now() - lastAt));
  const render = () => requestAnimationFrame(() => {
    state.runProgressRenderScheduled.delete(key);
    state.runProgressRenderLastAt.set(key, Date.now());
    if (state.currentThread?.id !== thread?.id) return;
    if (!renderMessageRunProgressInPlace(thread, message, { extraRunIds: [id] })) scheduleRenderCurrentThread();
  });
  if (delay) window.setTimeout(render, delay);
  else render();
  return true;
}

function clearRunProgressFallbackThreadRefresh(threadId = "") {
  const id = String(threadId || "").trim();
  if (!state.runProgressFallbackRefreshTimer) return;
  if (id && state.runProgressFallbackRefreshThreadId && state.runProgressFallbackRefreshThreadId !== id) return;
  window.clearTimeout(state.runProgressFallbackRefreshTimer);
  state.runProgressFallbackRefreshTimer = 0;
  state.runProgressFallbackRefreshThreadId = "";
}

function scheduleRunProgressFallbackThreadRefresh(threadId = "") {
  const id = String(threadId || "").trim();
  if (!id || !state.currentThread || id !== state.currentThread.id) return false;
  if (state.runProgressFallbackRefreshTimer) return true;
  state.runProgressFallbackRefreshThreadId = id;
  state.runProgressFallbackRefreshTimer = window.setTimeout(() => {
    state.runProgressFallbackRefreshTimer = 0;
    state.runProgressFallbackRefreshThreadId = "";
    if (!state.currentThread || state.currentThread.id !== id) return;
    if (typeof requestCurrentThreadRefresh === "function") {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 0 });
    } else if (typeof scheduleRenderCurrentThread === "function") {
      scheduleRenderCurrentThread();
    }
  }, RUN_PROGRESS_FALLBACK_REFRESH_MS);
  return true;
}

function updateRunProgressTicker(root = document) {
  root?.querySelectorAll?.("[data-run-progress-elapsed]").forEach((item) => {
    const startMs = Number(item.dataset.runProgressElapsed || 0);
    if (startMs) item.textContent = runProgressDurationLabel(startMs);
  });
  root?.querySelectorAll?.("[data-run-progress-age]").forEach((item) => {
    const timestampMs = Number(item.dataset.runProgressAge || 0);
    if (timestampMs) item.textContent = runProgressAgeLabel(timestampMs);
  });
  root?.querySelectorAll?.("[data-run-progress-offset]").forEach((item) => {
    const startMs = Number(item.dataset.runProgressOffset || 0);
    if (startMs) item.textContent = runProgressOffsetLabel(startMs, Date.now());
  });
}

function syncRunProgressTicker(root = document) {
  const hasPanel = Boolean(root?.querySelector?.(".run-progress-panel"));
  if (!hasPanel) {
    if (state.runProgressTicker) {
      window.clearInterval(state.runProgressTicker);
      state.runProgressTicker = 0;
    }
    return;
  }
  updateRunProgressTicker(root);
  if (state.runProgressTicker) return;
  state.runProgressTicker = window.setInterval(() => {
    const conversation = $("conversation");
    if (!conversation?.querySelector?.(".run-progress-panel")) {
      window.clearInterval(state.runProgressTicker);
      state.runProgressTicker = 0;
      return;
    }
    updateRunProgressTicker(conversation);
  }, 1000);
}
