const LONG_PRESS_MS = 420;
const PENDING_GUARD_MS = LONG_PRESS_MS + 1100;

const STATUS_LABELS = Object.freeze({
  idle: "按住发送录音",
  pending: "继续按住开始录音",
  checking: "检查语音服务",
  requesting: "请求麦克风权限",
  preparing: "准备麦克风",
  recording: "正在录音",
  finalizing: "整理录音",
  transcribing: "正在转写",
  ready: "转写完成",
  inserting: "正在插入",
  inserted: "已插入",
  cancelled: "已取消",
  no_speech: "未形成有效语音",
  failed: "语音输入失败",
});

const ACTIVE_STATUSES = Object.freeze([
  "pending",
  "checking",
  "requesting",
  "preparing",
  "recording",
  "finalizing",
  "transcribing",
  "inserting",
]);

const BUSY_STATUSES = Object.freeze([
  "checking",
  "requesting",
  "preparing",
  "recording",
  "finalizing",
  "transcribing",
  "inserting",
]);

const CANCELLABLE_STATUSES = Object.freeze([
  "pending",
  "checking",
  "requesting",
  "preparing",
  "recording",
  "finalizing",
  "transcribing",
]);

const TERMINAL_STATUSES = Object.freeze([
  "inserted",
  "cancelled",
  "no_speech",
  "failed",
]);

const TERMINAL_HIDE_MS = Object.freeze({
  inserted: 1400,
  cancelled: 1400,
  no_speech: 1800,
  failed: 4200,
});

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return STATUS_LABELS[value] ? value : "idle";
}

function normalizeNativeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  const map = {
    started: "recording",
    start: "recording",
    recording: "recording",
    permission: "requesting",
    requesting: "requesting",
    preparing: "preparing",
    transcribing: "transcribing",
    partial: "transcribing",
    final: "inserting",
    inserting: "inserting",
    inserted: "inserted",
    complete: "inserted",
    completed: "inserted",
    done: "inserted",
    failed: "failed",
    error: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };
  return map[normalized] || normalizeStatus(normalized || "pending");
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.idle;
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(normalizeStatus(status));
}

function isBusyStatus(status) {
  return BUSY_STATUSES.includes(normalizeStatus(status));
}

function isCancellableStatus(status) {
  return CANCELLABLE_STATUSES.includes(normalizeStatus(status));
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(normalizeStatus(status));
}

function terminalHideDelay(status) {
  return TERMINAL_HIDE_MS[normalizeStatus(status)] || 0;
}

function formatDuration(ms) {
  const totalMs = Math.max(0, Number(ms || 0) || 0);
  const seconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function statusDetail(voice = {}, now = Date.now()) {
  if (voice.error) return String(voice.error);
  if (voice.statusDetail) return String(voice.statusDetail);
  const status = normalizeStatus(voice.status);
  if (status === "pending") return "等待长按阈值";
  if (status === "checking") return "检查本地 ASR 与权限状态";
  if (status === "requesting") return "等待系统麦克风权限";
  if (status === "preparing") return "打开本地麦克风";
  if (status === "recording") return formatDuration(now - Number(voice.recordingStartedAt || now));
  if (status === "finalizing") return "整理音频片段";
  if (status === "transcribing") return "等待 ASR 返回";
  if (status === "inserting") return "写入当前 Composer";
  if (status === "inserted") return "等待编辑或发送";
  if (status === "cancelled") return "等待下一次语音输入";
  if (status === "no_speech") return "没有写入 Composer";
  return "";
}

function statusMeta(voice = {}, now = Date.now()) {
  const parts = [];
  const provider = voice.statusCache?.provider?.backend || voice.statusCache?.provider?.id || "";
  if (provider) parts.push(`ASR ${String(provider)}`);
  const sessionId = voice.streaming?.voiceSessionId || voice.voiceSessionId || "";
  if (sessionId) parts.push(`session ${String(sessionId).slice(-8)}`);
  const source = voice.nativeStatus?.source || voice.target?.kind || "";
  if (source) parts.push(String(source));
  if (voice.partialCount) parts.push(`partial ${Number(voice.partialCount) || 0}`);
  if (voice.streaming?.sequence) parts.push(`chunk ${Number(voice.streaming.sequence) || 0}`);
  if (voice.statusUpdatedAt) {
    const date = new Date(Number(voice.statusUpdatedAt) || now);
    parts.push(date.toLocaleTimeString([], { hour12: false }));
  }
  return parts.join(" · ");
}

function pendingGuardOutcome(voice = {}, now = Date.now()) {
  const status = normalizeStatus(voice.status);
  if (status !== "pending") return { shouldCancel: false, reason: "" };
  const startedAt = Number(voice.panelOpenedAt || voice.statusUpdatedAt || voice.pressStartedAt || now) || now;
  if (now - startedAt < PENDING_GUARD_MS) return { shouldCancel: false, reason: "" };
  return { shouldCancel: true, reason: "未检测到持续按住" };
}

function buildVoiceStatusViewModel(voice = {}, options = {}) {
  const now = Number(options.now || Date.now()) || Date.now();
  const status = normalizeStatus(voice.status);
  const expanded = Boolean(options.expanded);
  const debug = Boolean(options.debug);
  return {
    status,
    label: statusLabel(status),
    detail: statusDetail(Object.assign({}, voice, { status }), now),
    meta: statusMeta(Object.assign({}, voice, { status }), now),
    visible: isActiveStatus(status),
    expanded,
    debug,
    busy: isBusyStatus(status),
    recording: status === "recording",
    terminal: isTerminalStatus(status),
    canCancel: isCancellableStatus(status),
    terminalHideMs: terminalHideDelay(status),
    pendingGuardMs: status === "pending" ? PENDING_GUARD_MS : 0,
    pendingGuard: pendingGuardOutcome(Object.assign({}, voice, { status }), now),
  };
}

export {
  ACTIVE_STATUSES,
  BUSY_STATUSES,
  CANCELLABLE_STATUSES,
  LONG_PRESS_MS,
  PENDING_GUARD_MS,
  STATUS_LABELS,
  TERMINAL_HIDE_MS,
  TERMINAL_STATUSES,
  buildVoiceStatusViewModel,
  formatDuration,
  isActiveStatus,
  isBusyStatus,
  isCancellableStatus,
  isTerminalStatus,
  normalizeNativeStatus,
  normalizeStatus,
  pendingGuardOutcome,
  statusDetail,
  statusLabel,
  statusMeta,
  terminalHideDelay,
};
