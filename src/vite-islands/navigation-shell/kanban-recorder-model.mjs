export const KANBAN_RECORDER_MODEL_VERSION = "20260706-kanban-recorder-model-v1";

export const DEFAULT_RECORDER_MIME_CANDIDATES = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
]);

const UNSUPPORTED_RECORDER_TEXT = "当前浏览器不支持直接录音。";

export function recordingExtensionPlan(mime = "") {
  const value = String(mime || "").toLowerCase();
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("wav")) return "wav";
  if (value.includes("ogg") || value.includes("opus")) return "ogg";
  return "webm";
}

export function recorderSafeIdPlan(id, fallbackId = "card") {
  return String(id || fallbackId).replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || fallbackId;
}

export function recordingFileNamePlan({
  prefix = "reading-recording",
  id = "",
  fallbackId = "card",
  mime = "",
  nowMs = 0,
} = {}) {
  const safePrefix = String(prefix || "recording").replace(/[^a-zA-Z0-9_-]+/g, "-") || "recording";
  const safeId = recorderSafeIdPlan(id, fallbackId);
  const timestamp = Math.max(0, Number(nowMs || 0) || 0);
  return `${safePrefix}-${safeId}-${timestamp}.${recordingExtensionPlan(mime)}`;
}

export function recordingDurationMsPlan(recording = {}, nowMs = 0) {
  const stored = Number(recording?.elapsedMs || 0) || 0;
  if (recording?.status === "recording" && recording.startedAt) {
    return Math.max(0, stored + Math.max(0, Number(nowMs || 0) - Number(recording.startedAt || 0)));
  }
  return Math.max(0, stored);
}

export function recordingDurationLabelPlan(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function recordingPermissionMessagePlan(error = {}) {
  const name = String(error?.name || "");
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
    return "麦克风权限未开启，请允许权限后重试。";
  }
  if (["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"].includes(name)) {
    return "未找到可用麦克风，请检查设备后重试。";
  }
  return "无法开始录音，请检查浏览器权限后重试。";
}

export function recordingStatusTextPlan(recording = {}, {
  supported = false,
  durationLabel = "",
  idleText = "点击红色录音按钮开始。",
  stoppingText = "正在生成录音...",
  readyPrefix = "已录好待提交",
  errorFallback = "录音不可用，请重试。",
} = {}) {
  const status = String(recording?.status || "");
  const label = String(durationLabel || "0:00");
  if (status === "requesting") return "正在请求麦克风权限...";
  if (status === "recording") return `正在录音 ${label}`;
  if (status === "stopping") return stoppingText;
  if (status === "ready") return `${readyPrefix} ${label}`;
  if (status === "unsupported") return UNSUPPORTED_RECORDER_TEXT;
  if (status === "error") return recording.error || errorFallback;
  return supported ? idleText : UNSUPPORTED_RECORDER_TEXT;
}

export function recordingChunksPlan(chunks = []) {
  return Array.isArray(chunks) ? chunks.filter((chunk) => chunk && chunk.size > 0) : [];
}

export function recordingFinishPlan(recording = {}, {
  nowMs = 0,
  noAudioError = "未录到声音，请重试。",
} = {}) {
  const chunks = recordingChunksPlan(recording?.chunks || []);
  const elapsedMs = Number(recording?.elapsedMs || 0) || recordingDurationMsPlan(recording, nowMs);
  if (!chunks.length) {
    return {
      ok: false,
      reason: "empty_recording",
      chunks,
      elapsedMs,
      errorPatch: { status: "error", error: noAudioError, elapsedMs },
    };
  }
  const mimeType = recording?.recorder?.mimeType || recording?.mimeType || chunks[0]?.type || "audio/webm";
  return {
    ok: true,
    chunks,
    elapsedMs,
    mimeType,
  };
}

export function recordingErrorPatchPlan(recording = {}, error = {}, { nowMs = 0 } = {}) {
  return {
    status: "error",
    elapsedMs: recordingDurationMsPlan(recording, nowMs),
    error: recordingPermissionMessagePlan(error),
  };
}

export function shouldClearSubmittedRecordingPlan(latest = {}, submittedFile = null) {
  return Boolean(latest?.file && latest.file === submittedFile);
}
