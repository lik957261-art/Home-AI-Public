import {
  EDITABLE_ELEMENT_SELECTOR,
  composerInputVisibleForFocus,
  editableElementSelector,
  elementVisibleForFocus,
  eventTargetInsideFocusedEditable,
  focusedEditableState,
  isEditableElement,
} from "../../vite-app/runtime/focus-lifecycle-guard.mjs";

const CHAT_COMPOSER_DRAFT_MODEL_VERSION = "20260704-vite-chat-composer-draft-model-v1";

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampDuration(value, fallback, minimum) {
  return Math.max(minimum, numberOr(value, fallback));
}

function createComposerAutoFocusSuppressionPlan(input = {}) {
  const nowMs = numberOr(input.nowMs, 0);
  const durationMs = clampDuration(input.durationMs, 1200, 0);
  const currentSuppressUntil = numberOr(input.currentSuppressUntil, 0);
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    suppressUntil: Math.max(currentSuppressUntil, nowMs + durationMs),
    durationMs,
  });
}

function composerAutoFocusAllowed(input = {}) {
  return Boolean(
    input.visibilityState !== "hidden"
    && numberOr(input.nowMs, 0) >= numberOr(input.suppressUntil, 0)
  );
}

function createSystemFilePickerOpenPlan(input = {}) {
  const nowMs = numberOr(input.nowMs, 0);
  const durationMs = clampDuration(input.durationMs, 600000, 1000);
  const currentSuppressUntil = numberOr(input.currentSuppressUntil, 0);
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    activationAt: nowMs,
    nativePending: true,
    suppressUntil: Math.max(currentSuppressUntil, nowMs + durationMs),
    durationMs,
  });
}

function createSystemFilePickerReturnPlan(input = {}) {
  const nowMs = numberOr(input.nowMs, 0);
  const durationMs = clampDuration(input.durationMs, 2500, 500);
  const currentSuppressUntil = numberOr(input.currentSuppressUntil, 0);
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    nativePending: false,
    suppressUntil: Math.max(currentSuppressUntil, nowMs + durationMs),
    durationMs,
  });
}

function systemFilePickerForegroundSuppressionState(input = {}) {
  const nowMs = numberOr(input.nowMs, 0);
  const activationAt = numberOr(input.activationAt, 0);
  const suppressUntil = numberOr(input.suppressUntil, 0);
  const activationWindowMs = clampDuration(input.activationWindowMs, 1800, 0);
  const nativePending = Boolean(input.nativePending);
  const activeWindow = nowMs - activationAt < activationWindowMs;
  const suppressed = nativePending || nowMs < suppressUntil || activeWindow;
  let reason = "";
  if (nativePending) reason = "native_pending";
  else if (nowMs < suppressUntil) reason = "suppress_window";
  else if (activeWindow) reason = "activation_window";
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    suppressed,
    reason,
    nativePending,
    activeWindow,
    nowMs,
    activationAt,
    suppressUntil,
  });
}

function consumeSystemFilePickerForegroundSuppressionPlan(input = {}) {
  const state = systemFilePickerForegroundSuppressionState(input);
  if (!state.suppressed) {
    return Object.freeze({
      version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
      consumed: false,
      state,
      returnPlan: null,
    });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    consumed: true,
    state,
    returnPlan: createSystemFilePickerReturnPlan({
      nowMs: input.nowMs,
      durationMs: input.returnDurationMs,
      currentSuppressUntil: input.suppressUntil,
    }),
  });
}

function cleanDraftText(value) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
}

function composerHasDraftState(input = {}) {
  const pendingArtifacts = Array.isArray(input.pendingArtifacts) ? input.pendingArtifacts : [];
  const text = cleanDraftText(input.text || input.draftText || "");
  const hasDraft = !input.searchMode && Boolean(text || pendingArtifacts.length);
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_MODEL_VERSION,
    hasDraft,
    textLength: text.length,
    pendingArtifactCount: pendingArtifacts.length,
    searchMode: Boolean(input.searchMode),
  });
}

export {
  CHAT_COMPOSER_DRAFT_MODEL_VERSION,
  EDITABLE_ELEMENT_SELECTOR,
  composerAutoFocusAllowed,
  composerHasDraftState,
  composerInputVisibleForFocus,
  consumeSystemFilePickerForegroundSuppressionPlan,
  createComposerAutoFocusSuppressionPlan,
  createSystemFilePickerOpenPlan,
  createSystemFilePickerReturnPlan,
  editableElementSelector,
  elementVisibleForFocus,
  eventTargetInsideFocusedEditable,
  focusedEditableState,
  isEditableElement,
  systemFilePickerForegroundSuppressionState,
};
