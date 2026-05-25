"use strict";

const RUN_EVENT_PREVIEW_MAX_CHARS = 180;
const RUN_PROGRESS_RENDER_THROTTLE_MS = 750;
const RUN_PROGRESS_START_EVENT_REVEAL_MS = 1000;
const RUN_PROGRESS_TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);
const RUN_PROGRESS_START_EVENTS = new Set([
  "run.context_ready",
  "run.gateway_selected",
  "run.request_sent",
]);

function boundedRunEventPreview(value) {
  const text = String(value || "");
  return text.length > RUN_EVENT_PREVIEW_MAX_CHARS ? text.slice(0, RUN_EVENT_PREVIEW_MAX_CHARS) : text;
}

function parseRunEventPreviewObject(value) {
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
  if (!scheduleRunProgressRenderForRun(event.runId || payload.runId || "")) scheduleRenderCurrentThread();
}

function runEventSkillName(event) {
  const parsed = parseRunEventPreviewObject(event?.preview);
  const value = parsed?.name || parsed?.path || parsed?.skill || parsed?.id || "";
  return String(value || "").replace(/^skills\//i, "").replace(/\/SKILL\.md$/i, "").trim();
}

function runEventFunctionName(event) {
  const parsed = parseRunEventPreviewObject(event?.preview);
  const fromPreview = parsed?.name || parsed?.function || parsed?.tool || "";
  if (fromPreview) return String(fromPreview).trim();
  const tool = String(event?.tool || "").trim();
  if (!tool || /^(function_call|function_call_output|message|skill_view)$/i.test(tool)) return "";
  return tool;
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
  const name = String(event?.event || "event");
  const tool = runEventToolLabel(event);
  if (name === "response.output_item.added") return tool ? `\u5f00\u59cb ${tool}` : "\u5f00\u59cb\u5904\u7406";
  if (name === "response.output_item.done") return tool ? `\u5b8c\u6210 ${tool}` : "\u9636\u6bb5\u5b8c\u6210";
  if (name === "response.output_text.done") return "\u751f\u6210\u56de\u590d";
  if (name === "run.context_ready") return "\u4e0a\u4e0b\u6587\u5df2\u6574\u7406";
  if (name === "run.gateway_selected") return "Gateway \u5df2\u9009\u62e9";
  if (name === "run.request_sent") return "\u8bf7\u6c42\u5df2\u53d1\u9001";
  if (name === "response.completed" || name === "run.completed") return "\u5904\u7406\u5b8c\u6210";
  if (name === "response.failed" || name === "run.failed") return "\u5904\u7406\u5931\u8d25";
  return tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "");
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

function runProgressDisplayEvents(events = [], startMs = 0) {
  const visible = runProgressVisibleEvents(events, startMs);
  const startEvents = visible.filter(isRunProgressStartEvent);
  const runtimeEvents = visible.filter((event) => !isRunProgressStartEvent(event)).slice(-3);
  return [...startEvents, ...runtimeEvents];
}

function runProgressActiveMessages(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  return (thread?.messages || [])
    .filter((message) => ["queued", "running", "done", "failed", "cancelled"].includes(String(message?.status || "")))
    .filter((message) => !runSet.size || runSet.has(String(message?.runId || "")));
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
  const events = runProgressDisplayEvents(allEvents, startMs);
  const eventTimes = allEvents.map((event) => runProgressTimestampMs(event.timestamp)).filter(Boolean);
  const lastEventMs = eventTimes.length ? Math.max(...eventTimes) : 0;
  const quietRow = renderRunProgressQuietRow(lastEventMs, startMs);
  const rows = events.length
    ? `${quietRow}${events.map((event) => {
      const preview = runEventPreviewLabel(event);
      return `
      <div class="run-progress-row${event.error ? " error" : ""}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventTimeLabel(event, startMs))}</span>
        ${preview ? `<span class="run-progress-preview">${escapeHtml(preview)}</span>` : ""}
      </div>`;
    }).join("")}`
    : renderRunProgressWaitingRow(startMs);
  const elapsedLabel = options.terminal
    ? runProgressDurationLabel(startMs, options.terminalMs || Date.now())
    : runProgressDurationLabel(startMs);
  const elapsedAttr = options.terminal ? "" : ` data-run-progress-elapsed="${escapeHtml(String(startMs))}"`;
  return `<aside class="run-progress-panel${options.inline ? " inline" : ""}${options.terminal ? " terminal" : ""}" aria-live="polite">
    <div class="run-progress-head">
      <span>${options.terminal ? "\u8fd0\u884c\u8bb0\u5f55" : "\u8fd0\u884c\u4e2d"}</span>
      <span${elapsedAttr}>${escapeHtml(elapsedLabel)}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function renderMessageRunProgress(thread, message = {}) {
  if (message?.role !== "assistant") return "";
  const status = String(message.status || "");
  if (!["queued", "running", "done", "failed", "cancelled"].includes(status)) return "";
  const runIds = [
    message.originalRunId,
    message.responseRunId,
    message.runId,
    thread?.activeRunId,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (!runIds.length) return "";
  if (RUN_PROGRESS_TERMINAL_STATUSES.has(status) && !runProgressEvents(thread, runIds).length) return "";
  return renderRunProgressPanel(thread, runIds, {
    inline: true,
    terminal: RUN_PROGRESS_TERMINAL_STATUSES.has(status),
    terminalMs: runProgressTerminalMs(message),
  });
}

function messageForRunProgress(thread, runId) {
  const id = String(runId || "").trim();
  if (!thread || !id) return null;
  return (thread.messages || []).find((message) => (
    message?.role === "assistant"
    && ["queued", "running", "done", "failed", "cancelled"].includes(String(message.status || ""))
    && [
      message.runId,
      message.originalRunId,
      message.responseRunId,
      thread.activeRunId,
    ].map((value) => String(value || "").trim()).includes(id)
  )) || null;
}

function renderMessageRunProgressInPlace(thread, message = {}) {
  if (!thread || !message?.id) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  if (!article || !body) return false;
  const existing = body.querySelector(".run-progress-panel.inline");
  const html = renderMessageRunProgress(thread, message);
  if (!html) {
    existing?.remove?.();
    syncRunProgressTicker($("conversation"));
    return true;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    const content = body.querySelector(".text-content");
    if (content) content.insertAdjacentHTML("afterend", html);
    else body.insertAdjacentHTML("afterbegin", html);
  }
  syncRunProgressTicker($("conversation"));
  scheduleMessageScrollButtonVisibility(article);
  return true;
}

function scheduleRunProgressRenderForRun(runId) {
  const id = String(runId || "").trim();
  const thread = state.currentThread;
  const message = messageForRunProgress(thread, id);
  if (!id || !message?.id) return false;
  const key = `${thread?.id || ""}:${message.id}:${id}`;
  if (state.runProgressRenderScheduled.has(key)) return true;
  state.runProgressRenderScheduled.add(key);
  const lastAt = state.runProgressRenderLastAt.get(key) || 0;
  const delay = Math.max(0, RUN_PROGRESS_RENDER_THROTTLE_MS - (Date.now() - lastAt));
  const render = () => requestAnimationFrame(() => {
    state.runProgressRenderScheduled.delete(key);
    state.runProgressRenderLastAt.set(key, Date.now());
    if (state.currentThread?.id !== thread?.id) return;
    if (!renderMessageRunProgressInPlace(thread, message)) scheduleRenderCurrentThread();
  });
  if (delay) window.setTimeout(render, delay);
  else render();
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
