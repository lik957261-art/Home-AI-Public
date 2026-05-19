"use strict";

const RUN_EVENT_PREVIEW_MAX_CHARS = 180;

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
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function runEventTimeLabel(event) {
  const date = new Date(runProgressTimestampMs(event?.timestamp));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function runEventSkillName(event) {
  const parsed = parseRunEventPreviewObject(event?.preview);
  const value = parsed?.name || parsed?.path || parsed?.skill || parsed?.id || "";
  return String(value || "").replace(/^skills\//i, "").replace(/\/SKILL\.md$/i, "").trim();
}

function runEventToolLabel(event) {
  const tool = String(event?.tool || "").trim();
  const lower = tool.toLowerCase();
  if (lower === "skill_view") {
    const skillName = runEventSkillName(event);
    return skillName ? `Skill ${skillName}` : "Skill view";
  }
  if (lower === "function_call") return "Function call";
  if (lower === "function_call_output") return "Function result";
  if (lower === "message") return "\u56de\u590d";
  return tool;
}

function runEventTitle(event) {
  const name = String(event?.event || "event");
  const tool = runEventToolLabel(event);
  if (name === "response.output_item.added") return tool ? `\u5f00\u59cb ${tool}` : "\u5f00\u59cb\u5904\u7406";
  if (name === "response.output_item.done") return tool ? `\u5b8c\u6210 ${tool}` : "\u9636\u6bb5\u5b8c\u6210";
  if (name === "response.output_text.done") return "\u751f\u6210\u56de\u590d";
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
    .filter((event) => !event.runId || runSet.has(String(event.runId)))
    .slice(-4);
}

function runProgressActiveMessages(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  return (thread?.messages || [])
    .filter((message) => ["queued", "running"].includes(String(message?.status || "")))
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

function runProgressDurationLabel(startMs, now = Date.now()) {
  if (!startMs) return "";
  const seconds = Math.max(0, Math.round((now - startMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return `${hours}\u5c0f\u65f6${hourMinutes}\u5206`;
  }
  if (minutes) return `${minutes}\u5206${rest}\u79d2`;
  return `${Math.max(1, rest)}\u79d2`;
}

function runProgressAgeLabel(timestampMs, now = Date.now()) {
  if (!timestampMs) return "";
  return `${runProgressDurationLabel(timestampMs, now)}\u524d`;
}

function renderRunProgressWaitingRow(startMs) {
  return `<div class="run-progress-row run-progress-waiting">
    <span class="run-progress-dot" aria-hidden="true"></span>
    <span class="run-progress-main">\u8bf7\u6c42\u5df2\u53d1\u9001</span>
    <span class="run-progress-time" data-run-progress-age="${escapeHtml(String(startMs))}">${escapeHtml(runProgressAgeLabel(startMs))}</span>
    <span class="run-progress-preview">\u7b49\u5f85\u6a21\u578b\u6216\u5de5\u5177\u8fd4\u56de</span>
  </div>`;
}

function renderRunProgressQuietRow(lastEventMs) {
  if (!lastEventMs || Date.now() - lastEventMs < 15000) return "";
  return `<div class="run-progress-row run-progress-quiet">
    <span class="run-progress-dot" aria-hidden="true"></span>
    <span class="run-progress-main">\u4ecd\u5728\u8fd0\u884c</span>
    <span class="run-progress-time" data-run-progress-age="${escapeHtml(String(lastEventMs))}">${escapeHtml(runProgressAgeLabel(lastEventMs))}</span>
    <span class="run-progress-preview">\u6700\u8fd1\u65e0\u65b0\u4e8b\u4ef6\uff0c\u754c\u9762\u672a\u5361\u6b7b</span>
  </div>`;
}

function renderRunProgressPanel(thread, runIds, options = {}) {
  const ids = (runIds || []).filter(Boolean);
  if (!ids.length) return "";
  const events = runProgressEvents(thread, ids);
  const startMs = runProgressStartMs(thread, ids, events);
  const eventTimes = events.map((event) => runProgressTimestampMs(event.timestamp)).filter(Boolean);
  const lastEventMs = eventTimes.length ? Math.max(...eventTimes) : 0;
  const quietRow = renderRunProgressQuietRow(lastEventMs);
  const rows = events.length
    ? `${quietRow}${events.slice().reverse().slice(0, 3).map((event) => {
      const preview = runEventPreviewLabel(event);
      return `
      <div class="run-progress-row${event.error ? " error" : ""}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventTimeLabel(event))}</span>
        ${preview ? `<span class="run-progress-preview">${escapeHtml(preview)}</span>` : ""}
      </div>`;
    }).join("")}`
    : renderRunProgressWaitingRow(startMs);
  return `<aside class="run-progress-panel${options.inline ? " inline" : ""}" aria-live="polite">
    <div class="run-progress-head">
      <span>\u8fd0\u884c\u4e2d</span>
      <span data-run-progress-elapsed="${escapeHtml(String(startMs))}">${escapeHtml(runProgressDurationLabel(startMs))}</span>
      <span>${escapeHtml(ids.length > 1 ? `${ids.length} runs` : shortTaskDisplayId(ids[0]))}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function renderMessageRunProgress(thread, message = {}) {
  if (message?.role !== "assistant") return "";
  if (!["queued", "running"].includes(String(message.status || ""))) return "";
  const runId = String(message.runId || thread?.activeRunId || "").trim();
  if (!runId) return "";
  return renderRunProgressPanel(thread, [runId], { inline: true });
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
  }, 5000);
}
