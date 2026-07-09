const RUN_PROGRESS_MODEL_VERSION = "20260705-vite-run-progress-model-v1";
const RUN_EVENT_PREVIEW_MAX_CHARS = 180;
const RUN_PROGRESS_START_EVENT_REVEAL_MS = 1000;
const RUN_PROGRESS_MAX_VISIBLE_EVENTS = 12;

const RUN_PROGRESS_TERMINAL_STATUSES = Object.freeze(["done", "failed", "cancelled"]);
const RUN_PROGRESS_TERMINAL_EVENTS = Object.freeze([
  "response.completed",
  "run.completed",
  "response.failed",
  "run.failed",
  "response.incomplete",
  "run.cancelled",
  "run.canceled",
  "cancelled",
  "canceled",
]);
const RUN_PROGRESS_START_EVENTS = Object.freeze([
  "run.request_preparing",
  "run.todo_intake_started",
  "run.context_ready",
  "run.gateway_worker_queued",
  "run.gateway_worker_starting",
  "run.gateway_worker_started",
  "run.gateway_worker_reused",
  "run.gateway_worker_start_failed",
  "run.gateway_selected",
  "run.toolset_selection_started",
  "run.toolset_selection_done",
  "run.toolset_selection_failed",
  "run.permission_preflight_done",
  "run.permission_preflight_fallback",
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
const RUN_PROGRESS_HIDDEN_EVENTS = Object.freeze(["run.liveness_warning"]);

function boundedRunEventPreviewPlan(value) {
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
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    preview: text.length > RUN_EVENT_PREVIEW_MAX_CHARS ? text.slice(0, RUN_EVENT_PREVIEW_MAX_CHARS) : text,
  });
}

function parseRunEventPreviewObjectPlan(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, value });
  }
  const text = String(value || "").trim();
  if (!text || !text.startsWith("{")) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, value: null });
  try {
    const parsed = JSON.parse(text);
    return Object.freeze({
      version: RUN_PROGRESS_MODEL_VERSION,
      value: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null,
    });
  } catch (_err) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, value: null });
  }
}

function normalizeRunEventPlan(input = {}) {
  const event = input.event && typeof input.event === "object" ? input.event : {};
  const timestamp = event.timestamp || input.nowSeconds || 0;
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    event: Object.freeze({
      event: String(event.event || event.type || "event"),
      timestamp,
      runId: String(event.runId || event.run_id || input.fallbackRunId || ""),
      tool: event.tool || null,
      preview: boundedRunEventPreviewPlan(event.preview || event.text || event.error || "").preview,
      duration: event.duration || null,
      error: Boolean(event.error),
    }),
  });
}

function normalizeRunProgressIdPlan(value) {
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, id: String(value || "").trim() });
}

function uniqueRunProgressIdsPlan(values = []) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    ids: Object.freeze([...new Set((values || []).map((value) => normalizeRunProgressIdPlan(value).id).filter(Boolean))]),
  });
}

function messageOwnRunIdsPlan(message = {}) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    ids: uniqueRunProgressIdsPlan([
      message.originalRunId,
      message.responseRunId,
      message.runId,
      message.taskId,
    ]).ids,
  });
}

function threadActiveRunIdsPlan(thread = {}) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    ids: uniqueRunProgressIdsPlan([
      thread?.activeRunId,
      ...(Array.isArray(thread?.activeRunIds) ? thread.activeRunIds : []),
    ]).ids,
  });
}

function messageStatusCanHaveRunProgressPlan(message = {}) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    canHaveRunProgress: ["queued", "running", "done", "failed", "cancelled"].includes(String(message?.status || "")),
  });
}

function messageStatusIsActivePlan(message = {}) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    active: ["queued", "running"].includes(String(message?.status || "")),
  });
}

function messageRunProgressIdsPlan(input = {}) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    ids: uniqueRunProgressIdsPlan([
      ...messageOwnRunIdsPlan(input.message).ids,
      ...(Array.isArray(input.rememberedRunIds) ? input.rememberedRunIds : []),
      ...(Array.isArray(input.extraRunIds) ? input.extraRunIds : []),
    ]).ids,
  });
}

function runProgressEventsPlan(input = {}) {
  const runSet = new Set((input.runIds || []).map(String).filter(Boolean));
  if (!input.thread || !runSet.size) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, events: Object.freeze([]) });
  }
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    events: Object.freeze((Array.isArray(input.thread.events) ? input.thread.events : [])
      .map((event) => normalizeRunEventPlan({ event }).event)
      .filter((event) => !event.runId || runSet.has(String(event.runId)))),
  });
}

function runProgressTimestampMsPlan(value) {
  if (!value) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, timestampMs: 0 });
  if (typeof value === "number") {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, timestampMs: value > 10_000_000_000 ? value : value * 1000 });
  }
  const parsed = new Date(value).getTime();
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, timestampMs: Number.isFinite(parsed) ? parsed : 0 });
}

function runProgressActiveMessagesPlan(input = {}) {
  const runSet = new Set((input.runIds || []).map(String).filter(Boolean));
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    messages: Object.freeze((input.thread?.messages || [])
      .filter((message) => messageStatusCanHaveRunProgressPlan(message).canHaveRunProgress)
      .filter((message) => !runSet.size || messageOwnRunIdsPlan(message).ids.some((id) => runSet.has(id)))),
  });
}

function runProgressStartMsPlan(input = {}) {
  const values = [
    ...runProgressActiveMessagesPlan(input).messages.flatMap((message) => [
      message.queuedAt,
      message.startedAt,
      message.createdAt,
      message.updatedAt,
    ]),
    ...(input.events || []).map((event) => event.timestamp),
  ].map((value) => runProgressTimestampMsPlan(value).timestampMs).filter(Boolean);
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    startMs: values.length ? Math.min(...values) : Math.max(0, Number(input.nowMs) || 0),
  });
}

function runProgressDurationTextPlan(input = {}) {
  const totalSeconds = Math.max(input.allowZero ? 0 : 1, Math.round(Number(input.seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, text: `${hours}小时${hourMinutes}分` });
  }
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    text: minutes ? `${minutes}分${rest}秒` : `${rest}秒`,
  });
}

function runProgressDurationLabelPlan(input = {}) {
  const startMs = Number(input.startMs) || 0;
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    label: startMs ? runProgressDurationTextPlan({ seconds: ((Number(input.nowMs) || 0) - startMs) / 1000 }).text : "",
  });
}

function runProgressOffsetLabelPlan(input = {}) {
  const startMs = Number(input.startMs) || 0;
  const eventMs = Number(input.eventMs) || 0;
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    label: startMs && eventMs ? runProgressDurationTextPlan({ seconds: (eventMs - startMs) / 1000, allowZero: true }).text : "",
  });
}

function runEventPreviewField(event, fields = []) {
  const parsed = parseRunEventPreviewObjectPlan(event?.preview).value;
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
  const parsed = parseRunEventPreviewObjectPlan(event?.preview).value;
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

function isFunctionRunEventPlan(event) {
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "function_call") return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, isFunction: true });
  if (!String(event?.event || "").startsWith("response.output_item.")) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, isFunction: false });
  }
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    isFunction: Boolean(tool && !["function_call_output", "message", "skill_view"].includes(tool)),
  });
}

function runEventWithFunctionName(event, name, callId = "") {
  const functionName = String(name || "").trim();
  if (!functionName || runEventFunctionName(event)) return event;
  const parsed = parseRunEventPreviewObjectPlan(event?.preview).value || {};
  const preview = Object.assign({}, parsed, { name: functionName });
  if (callId && !preview.callId && !preview.call_id) preview.callId = callId;
  return Object.assign({}, event, { preview: JSON.stringify(preview) });
}

function runProgressEventsWithFunctionNamesPlan(events = []) {
  const nameByCallId = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const name = runEventFunctionName(event);
    const callId = runEventFunctionCallId(event);
    if (name && callId) nameByCallId.set(callId, name);
  }
  let lastFunctionName = "";
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    events: Object.freeze((Array.isArray(events) ? events : []).map((event) => {
      const tool = String(event?.tool || "").trim().toLowerCase();
      const name = runEventFunctionName(event);
      const callId = runEventFunctionCallId(event);
      if (isFunctionRunEventPlan(event).isFunction && name) {
        lastFunctionName = name;
        if (callId) nameByCallId.set(callId, name);
        return event;
      }
      if (tool === "function_call_output" && !name) {
        const fallback = (callId && nameByCallId.get(callId)) || lastFunctionName;
        return runEventWithFunctionName(event, fallback, callId);
      }
      return event;
    })),
  });
}

function runEventOperationKind(event) {
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "skill_view") return "skill";
  if (tool === "function_call" || tool === "function_call_output") return "function";
  if (isFunctionRunEventPlan(event).isFunction) return "function";
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

function isRunOperationStartEventPlan(event) {
  const name = String(event?.event || "");
  const kind = runEventOperationKind(event);
  const tool = String(event?.tool || "").trim().toLowerCase();
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    start: Boolean(name === "response.output_item.added" && kind && !(kind === "function" && tool === "function_call_output")),
  });
}

function isRunOperationDoneEventPlan(event) {
  const name = String(event?.event || "");
  const kind = runEventOperationKind(event);
  const tool = String(event?.tool || "").trim().toLowerCase();
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    done: Boolean(name === "response.output_item.done" && kind && !(kind === "function" && tool === "function_call")),
  });
}

function runProgressCompactOperationEventsPlan(events = []) {
  const out = [];
  const openByKey = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const tool = String(event?.tool || "").trim().toLowerCase();
    const eventName = String(event?.event || "");
    if (runEventOperationKind(event) === "function" && !runEventFunctionName(event)) continue;
    if (eventName === "response.output_item.done" && tool === "function_call") continue;
    if (eventName === "response.output_item.added" && tool === "function_call_output") continue;
    if (isRunOperationStartEventPlan(event).start) {
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
    if (isRunOperationDoneEventPlan(event).done) {
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
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, events: Object.freeze(out) });
}

function runProgressCompactPreflightEventsPlan(events = []) {
  const toolsetTerminalRuns = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const name = String(event?.event || "");
    if (
      name === "run.toolset_selection_done"
      || name === "run.toolset_selection_failed"
      || name === "run.permission_preflight_done"
      || name === "run.permission_preflight_fallback"
    ) {
      toolsetTerminalRuns.add(String(event?.runId || "__run__"));
    }
  }
  if (!toolsetTerminalRuns.size) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, events: Object.freeze(Array.isArray(events) ? events : []) });
  }
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    events: Object.freeze((Array.isArray(events) ? events : []).filter((event) => {
      if (String(event?.event || "") !== "run.toolset_selection_started") return true;
      return !toolsetTerminalRuns.has(String(event?.runId || "__run__"));
    })),
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
  if (lower === "message") return "回复";
  return tool;
}

function runEventTitlePlan(event) {
  if (event?.operationKind) {
    const prefix = event.operationKind === "skill" ? "Skill" : "Function";
    const name = String(event.operationName || "").trim();
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, title: (!name || name.toLowerCase() === prefix.toLowerCase()) ? prefix : `${prefix} ${name}`.trim() });
  }
  const name = String(event?.event || "event");
  const tool = runEventToolLabel(event);
  const titleByEvent = {
    "response.output_text.done": "生成回复",
    "run.final_message_started": "开始生成回复",
    "run.final_message_done": "回复已生成",
    "run.request_preparing": "正在准备运行",
    "run.todo_intake_started": "正在识别意图",
    "run.context_ready": "上下文已整理",
    "run.gateway_worker_queued": "Gateway 排队等待",
    "run.gateway_worker_starting": "Gateway 启动中",
    "run.gateway_worker_started": "Gateway 已启动",
    "run.gateway_worker_reused": "Gateway 已复用",
    "run.gateway_worker_start_failed": "Gateway 启动失败",
    "run.gateway_selected": "Gateway 已选择",
    "run.toolset_selection_started": "正在检查权限与工具集",
    "run.toolset_selection_done": "权限与工具集已确认",
    "run.toolset_selection_failed": "权限与工具集检查回退",
    "run.permission_preflight_done": "权限预检已通过",
    "run.permission_preflight_fallback": "权限预检超时，已按确定性权限继续",
    "run.toolset_escalation_required": "需要追加工具集",
    "run.toolset_escalation_retrying": "正在追加工具并重新运行",
    "run.permission_required": "需要 Owner 授权",
    "run.request_sent": "请求已发送",
    "run.model_stream_started": "模型流已连接",
    "run.model_first_byte_retrying": "模型无首包，正在重试",
    "run.model_output_started": "模型已开始输出",
    "run.stream_closed_without_terminal": "流式结束已处理",
    "run.stream_failed": "模型流式连接失败",
    "run.gateway_start_timeout": "Gateway 未创建运行",
    "run.liveness_stale": "Gateway 响应超时",
    "run.tool_budget_exceeded": "工具调用超限",
    "response.completed": "处理完成",
    "run.completed": "处理完成",
    "response.failed": "处理失败",
    "run.failed": "处理失败",
  };
  if (name === "response.output_item.added") return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, title: tool ? `开始 ${tool}` : "开始处理" });
  if (name === "response.output_item.done") return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, title: tool ? `完成 ${tool}` : "阶段完成" });
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, title: titleByEvent[name] || (tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "")) });
}

function runEventStatusLabelPlan(input = {}) {
  const event = input.event || {};
  const startMs = Number(input.startMs) || 0;
  if (!event?.operationKind) {
    return Object.freeze({
      version: RUN_PROGRESS_MODEL_VERSION,
      label: runProgressOffsetLabelPlan({ startMs, eventMs: runProgressTimestampMsPlan(event?.timestamp).timestampMs }).label,
    });
  }
  const start = runProgressTimestampMsPlan(event.operationStartedAt || event.timestamp).timestampMs;
  const done = runProgressTimestampMsPlan(event.operationDoneAt).timestampMs;
  if (event.operationStatus === "done" && start && done) {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: `完成 · ${runProgressDurationTextPlan({ seconds: (done - start) / 1000, allowZero: true }).text}` });
  }
  if (event.operationStatus === "error") {
    return Object.freeze({
      version: RUN_PROGRESS_MODEL_VERSION,
      label: done && start ? `失败 · ${runProgressDurationTextPlan({ seconds: (done - start) / 1000, allowZero: true }).text}` : "失败",
    });
  }
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    label: start ? `运行中 · ${runProgressDurationLabelPlan({ startMs: start, nowMs: input.nowMs }).label}` : "运行中",
  });
}

function runEventRowClassPlan(event) {
  const classes = ["run-progress-row"];
  if (event?.error || event?.operationStatus === "error") classes.push("error");
  if (event?.operationKind) classes.push("run-progress-operation", `run-progress-operation-${event.operationStatus || "active"}`);
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, className: classes.join(" ") });
}

function runGatewayWorkerReasonLabel(reason) {
  const value = String(reason || "").trim();
  if (value === "global_capacity") return "全局通道已满";
  if (value === "workspace_capacity") return "工作区通道已满";
  if (value === "profile_affinity") return "匹配通道暂不可用";
  if (value === "worker_start_failed") return "启动失败";
  if (value === "health_check_failed") return "健康检查失败";
  if (value === "port_busy") return "端口被占用";
  if (value === "start_worker_unavailable") return "启动脚本不可用";
  return "";
}

function runGatewayWorkerPreviewLabelPlan(event) {
  const name = String(event?.event || "");
  if (!name.startsWith("run.gateway_worker_")) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: "" });
  const parsed = parseRunEventPreviewObjectPlan(event?.preview).value || {};
  const parts = [];
  const profile = String(parsed.profileId || "").trim();
  const provider = String(parsed.provider || "").trim();
  const reason = String(parsed.failureCode || parsed.reason || "").trim();
  const queueDepth = Number(parsed.queueDepth || 0) || 0;
  const reusableUntil = String(parsed.idleExpiresAt || parsed.warmUntil || "").trim();
  if (profile || provider) parts.push([provider, profile].filter(Boolean).join(" / "));
  const reasonLabel = name === "run.gateway_worker_starting"
    ? "启动中"
    : (runGatewayWorkerReasonLabel(reason) || (name === "run.gateway_worker_queued" ? "排队" : reason.replaceAll("_", " ")));
  if (name === "run.gateway_worker_queued" && queueDepth) {
    if (reasonLabel && reasonLabel !== "排队") parts.push(reasonLabel);
    parts.push(`排队 ${queueDepth}`);
  } else if (reasonLabel) {
    parts.push(reasonLabel);
  }
  if (queueDepth && name !== "run.gateway_worker_queued" && name !== "run.gateway_worker_starting") parts.push(`排队 ${queueDepth}`);
  if (reusableUntil) parts.push(`warm until ${reusableUntil}`);
  if (parsed.diagnostic) parts.push(String(parsed.diagnostic).slice(0, 80));
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: boundedRunEventPreviewPlan(parts.join(" · ")).preview });
}

function runEventPreviewLabelPlan(event) {
  const gatewayPreview = runGatewayWorkerPreviewLabelPlan(event).label;
  if (gatewayPreview) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: gatewayPreview });
  if (event?.error) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: boundedRunEventPreviewPlan(event.preview || "").preview });
  const tool = String(event?.tool || "").trim().toLowerCase();
  if (tool === "skill_view" || tool === "function_call" || tool === "function_call_output" || tool === "message") {
    return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: "" });
  }
  const preview = boundedRunEventPreviewPlan(event?.preview || "").preview;
  if (/^[\[{]/.test(preview.trim())) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: "" });
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, label: preview });
}

function isRunProgressStartEventPlan(event) {
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    start: RUN_PROGRESS_START_EVENTS.includes(String(event?.event || "")),
  });
}

function runProgressVisibleEventsPlan(input = {}) {
  let startEventIndex = 0;
  const startMs = Number(input.startMs) || 0;
  const nowMs = Number(input.nowMs) || 0;
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    events: Object.freeze((Array.isArray(input.events) ? input.events : []).filter((event) => {
      if (!isRunProgressStartEventPlan(event).start) return true;
      const revealAt = startMs + (startEventIndex * RUN_PROGRESS_START_EVENT_REVEAL_MS);
      startEventIndex += 1;
      return nowMs >= revealAt;
    })),
  });
}

function runProgressDisplayEventsPlan(input = {}) {
  const visible = runProgressVisibleEventsPlan(input).events
    .filter((event) => !RUN_PROGRESS_HIDDEN_EVENTS.includes(String(event?.event || "")));
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    events: Object.freeze(input.all ? visible : visible.slice(-RUN_PROGRESS_MAX_VISIBLE_EVENTS)),
  });
}

function shouldCompactRunProgressAfterOutputPlan(allEvents = []) {
  const outputStartedMs = Math.max(0, ...allEvents
    .filter((event) => ["run.model_output_started", "run.final_message_started"].includes(String(event?.event || "")))
    .map((event) => runProgressTimestampMsPlan(event.timestamp).timestampMs)
    .filter(Boolean));
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    compact: Boolean(outputStartedMs && !allEvents.some((event) => (
      runEventOperationKind(event)
      && runProgressTimestampMsPlan(event.timestamp).timestampMs > outputStartedMs
    ))),
  });
}

function runProgressTerminalMsPlan(message = {}) {
  const values = [message.completedAt, message.failedAt, message.cancelledAt, message.updatedAt]
    .map((value) => runProgressTimestampMsPlan(value).timestampMs)
    .filter(Boolean);
  return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, terminalMs: values.length ? Math.max(...values) : 0 });
}

function messageForRunProgressPlan(input = {}) {
  const id = normalizeRunProgressIdPlan(input.runId).id;
  if (!input.thread || !id) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, message: null });
  const messages = Array.isArray(input.thread.messages) ? input.thread.messages : [];
  const direct = [...messages].reverse().find((message) => (
    message?.role === "assistant"
    && messageStatusCanHaveRunProgressPlan(message).canHaveRunProgress
    && messageOwnRunIdsPlan(message).ids.includes(id)
  ));
  if (direct) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, message: direct });
  const activeIds = new Set(threadActiveRunIdsPlan(input.thread).ids);
  if (!activeIds.has(id)) return Object.freeze({ version: RUN_PROGRESS_MODEL_VERSION, message: null });
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    message: [...messages].reverse().find((message) => (
      message?.role === "assistant"
      && messageStatusIsActivePlan(message).active
    )) || null,
  });
}

function runProgressPanelPlan(input = {}) {
  const ids = uniqueRunProgressIdsPlan(input.runIds || []).ids;
  const allEvents = runProgressEventsPlan({ thread: input.thread, runIds: ids }).events;
  const startMs = runProgressStartMsPlan({
    thread: input.thread,
    runIds: ids,
    events: allEvents,
    nowMs: input.nowMs,
  }).startMs;
  const compactAfterOutput = !input.terminal && shouldCompactRunProgressAfterOutputPlan(allEvents).compact;
  const compactedEvents = runProgressCompactOperationEventsPlan(
    runProgressCompactPreflightEventsPlan(runProgressEventsWithFunctionNamesPlan(allEvents).events).events,
  ).events;
  const events = input.terminal
    ? runProgressDisplayEventsPlan({ events: compactedEvents, startMs, nowMs: input.nowMs, all: true }).events
    : (compactAfterOutput
      ? runProgressDisplayEventsPlan({ events: compactedEvents, startMs, nowMs: input.nowMs }).events.slice(-2)
      : runProgressDisplayEventsPlan({ events: compactedEvents, startMs, nowMs: input.nowMs }).events);
  const eventTimes = allEvents.map((event) => runProgressTimestampMsPlan(event.timestamp).timestampMs).filter(Boolean);
  return Object.freeze({
    version: RUN_PROGRESS_MODEL_VERSION,
    ids,
    allEventCount: allEvents.length,
    startMs,
    compactAfterOutput,
    events: Object.freeze(events),
    lastEventMs: eventTimes.length ? Math.max(...eventTimes) : 0,
  });
}

export {
  RUN_PROGRESS_MODEL_VERSION,
  RUN_PROGRESS_TERMINAL_EVENTS,
  RUN_PROGRESS_TERMINAL_STATUSES,
  boundedRunEventPreviewPlan,
  isFunctionRunEventPlan,
  isRunOperationDoneEventPlan,
  isRunOperationStartEventPlan,
  isRunProgressStartEventPlan,
  messageForRunProgressPlan,
  messageOwnRunIdsPlan,
  messageRunProgressIdsPlan,
  messageStatusCanHaveRunProgressPlan,
  messageStatusIsActivePlan,
  normalizeRunEventPlan,
  normalizeRunProgressIdPlan,
  parseRunEventPreviewObjectPlan,
  runEventPreviewLabelPlan,
  runEventRowClassPlan,
  runEventStatusLabelPlan,
  runEventTitlePlan,
  runGatewayWorkerPreviewLabelPlan,
  runProgressCompactOperationEventsPlan,
  runProgressCompactPreflightEventsPlan,
  runProgressDisplayEventsPlan,
  runProgressDurationLabelPlan,
  runProgressDurationTextPlan,
  runProgressActiveMessagesPlan,
  runProgressEventsPlan,
  runProgressEventsWithFunctionNamesPlan,
  runProgressOffsetLabelPlan,
  runProgressPanelPlan,
  runProgressStartMsPlan,
  runProgressTerminalMsPlan,
  runProgressTimestampMsPlan,
  shouldCompactRunProgressAfterOutputPlan,
  threadActiveRunIdsPlan,
  uniqueRunProgressIdsPlan,
};
