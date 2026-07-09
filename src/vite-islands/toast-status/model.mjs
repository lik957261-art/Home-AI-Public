const TOAST_STATUS_MODEL_VERSION = "20260704-vite-toast-status-model-v1";

const VALID_TONES = new Set(["info", "success", "warning", "error"]);
const MIN_DURATION_MS = 800;
const MAX_DURATION_MS = 10000;
const DEFAULT_SUCCESS_DURATION_MS = 4200;
const DEFAULT_DURATION_MS = 6500;

function cleanString(value, max = 1000) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 1000));
}

function clampDurationMs(durationMs, tone = "info") {
  const fallback = tone === "success" ? DEFAULT_SUCCESS_DURATION_MS : DEFAULT_DURATION_MS;
  const numeric = Number(durationMs);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(numeric)));
}

function normalizeToastTone(tone = "info") {
  const value = cleanString(tone, 40).trim().toLowerCase();
  return VALID_TONES.has(value) ? value : "info";
}

function createToastState(message, options = {}, now = Date.now()) {
  const tone = normalizeToastTone(options.tone || options.kind || "info");
  const durationMs = clampDurationMs(options.durationMs, tone);
  const actionLabel = cleanString(options.actionLabel || "", 80).trim();
  const actionId = cleanString(options.actionId || "", 80).trim();
  const ariaLabel = cleanString(options.ariaLabel || message || "", 160).trim();
  return {
    version: TOAST_STATUS_MODEL_VERSION,
    id: cleanString(options.id || `toast_${Number(now) || Date.now()}`, 80),
    message: cleanString(message || options.message || "", 1000),
    tone,
    visible: true,
    actionable: Boolean(actionLabel || actionId),
    actionLabel,
    actionId,
    ariaLabel,
    createdAt: Number(now) || Date.now(),
    durationMs,
    expiresAt: (Number(now) || Date.now()) + durationMs,
    dismissedAt: null,
    clickCount: 0,
  };
}

function dismissToastState(state = {}, now = Date.now()) {
  return {
    ...state,
    visible: false,
    dismissedAt: Number(now) || Date.now(),
  };
}

function expireToastState(state = {}, now = Date.now()) {
  if (!state.visible) return state;
  if ((Number(now) || Date.now()) < Number(state.expiresAt || 0)) return state;
  return dismissToastState(state, now);
}

function recordToastAction(state = {}, now = Date.now()) {
  return {
    ...dismissToastState(state, now),
    clickCount: Number(state.clickCount || 0) + 1,
  };
}

function createStatusState(message, options = {}, now = Date.now()) {
  return {
    version: TOAST_STATUS_MODEL_VERSION,
    message: cleanString(message || options.message || "", 1000),
    tone: normalizeToastTone(options.tone || options.kind || "info"),
    detail: cleanString(options.detail || "", 1000),
    updatedAt: Number(now) || Date.now(),
  };
}

function createToastStatusPreviewState(options = {}) {
  const now = Number(options.now) || Date.now();
  const toast = createToastState(options.toastMessage || "已保存", {
    tone: options.toastTone || "success",
    actionLabel: options.actionLabel || "",
    actionId: options.actionId || "",
  }, now);
  const status = createStatusState(options.statusMessage || "连接正常", {
    tone: options.statusTone || "info",
    detail: options.statusDetail || "",
  }, now);
  return {
    version: TOAST_STATUS_MODEL_VERSION,
    toast,
    status,
    history: [toast],
    lastAction: "",
  };
}

function addToastToPreviewState(previewState = {}, toast = createToastState(""), maxHistory = 3) {
  const history = [toast, ...Array.isArray(previewState.history) ? previewState.history : []]
    .slice(0, Math.max(1, Number(maxHistory) || 3));
  return {
    ...previewState,
    toast,
    history,
    lastAction: "toast",
  };
}

function setStatusInPreviewState(previewState = {}, status = createStatusState("")) {
  return {
    ...previewState,
    status,
    lastAction: "status",
  };
}

export {
  DEFAULT_DURATION_MS,
  DEFAULT_SUCCESS_DURATION_MS,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  TOAST_STATUS_MODEL_VERSION,
  addToastToPreviewState,
  clampDurationMs,
  createStatusState,
  createToastState,
  createToastStatusPreviewState,
  dismissToastState,
  expireToastState,
  normalizeToastTone,
  recordToastAction,
  setStatusInPreviewState,
};
