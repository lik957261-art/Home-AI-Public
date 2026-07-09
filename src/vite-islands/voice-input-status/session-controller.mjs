import {
  CANCELLABLE_STATUSES,
  LONG_PRESS_MS,
  PENDING_GUARD_MS,
  isTerminalStatus,
  normalizeNativeStatus,
  normalizeStatus,
  pendingGuardOutcome,
  terminalHideDelay,
} from "./model.mjs";

export {
  isActiveStatus,
  statusLabel,
  terminalHideDelay,
} from "./model.mjs";

const VOICE_INPUT_SESSION_CONTROLLER_VERSION = "20260702-vite-voice-session-controller-v1";
const RELEASE_STOPS_STATUSES = Object.freeze(["checking", "requesting", "preparing", "recording", "finalizing"]);

function safeNow(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
}

function cloneState(state = {}) {
  return Object.assign({}, state);
}

function statusDetailFor(status, detail = "") {
  if (detail) return String(detail);
  if (status === "pending") return "等待长按阈值";
  if (status === "checking") return "检查语音服务";
  if (status === "recording") return "正在录音";
  if (status === "cancelled") return "语音手势已取消";
  if (status === "inserted") return "等待编辑或发送";
  if (status === "failed") return "语音输入失败";
  return "";
}

function createVoiceSessionState(fields = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const status = normalizeStatus(fields.status || "idle");
  return Object.freeze(Object.assign({
    version: VOICE_INPUT_SESSION_CONTROLLER_VERSION,
    status,
    statusDetail: statusDetailFor(status, fields.statusDetail || ""),
    panelOpenedAt: status === "idle" ? 0 : currentNow,
    pressStartedAt: 0,
    statusUpdatedAt: currentNow,
    pointerActive: false,
    longPressArmed: false,
    longPressTriggered: false,
    terminalHideAt: isTerminalStatus(status) ? currentNow + terminalHideDelay(status) : 0,
    hidden: status === "idle",
    lastAction: "initial",
  }, fields, {
    status,
    statusUpdatedAt: Number(fields.statusUpdatedAt || currentNow) || currentNow,
  }));
}

function withStatus(state = {}, statusValue, fields = {}, now = Date.now(), action = "status") {
  const currentNow = safeNow(now);
  const status = normalizeStatus(statusValue);
  const terminalDelay = terminalHideDelay(status);
  const previous = cloneState(state);
  return Object.freeze(Object.assign(previous, fields, {
    version: VOICE_INPUT_SESSION_CONTROLLER_VERSION,
    status,
    statusDetail: statusDetailFor(status, fields.statusDetail || ""),
    statusUpdatedAt: currentNow,
    panelOpenedAt: Number(previous.panelOpenedAt || 0) || currentNow,
    terminalHideAt: terminalDelay ? currentNow + terminalDelay : 0,
    hidden: false,
    lastAction: action,
  }));
}

function beginVoicePressSession(state = {}, fields = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const next = withStatus(state, "pending", Object.assign({}, fields, {
    panelOpenedAt: currentNow,
    pressStartedAt: currentNow,
    pointerActive: true,
    longPressArmed: true,
    longPressTriggered: false,
  }), currentNow, "begin_press");
  return Object.freeze({
    state: next,
    effects: Object.freeze({
      action: "begin_press",
      scheduleLongPressMs: LONG_PRESS_MS,
      schedulePendingGuardMs: PENDING_GUARD_MS,
      startRecording: false,
      stopRecording: false,
      cancelRecording: false,
    }),
  });
}

function triggerVoiceLongPress(state = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const status = normalizeStatus(state.status);
  if (!state.longPressArmed || status !== "pending") {
    return Object.freeze({
      state: createVoiceSessionState(state, currentNow),
      effects: Object.freeze({ action: "long_press_ignored", startRecording: false }),
    });
  }
  const next = withStatus(state, "checking", {
    longPressArmed: false,
    longPressTriggered: true,
    pointerActive: true,
  }, currentNow, "long_press");
  return Object.freeze({
    state: next,
    effects: Object.freeze({
      action: "long_press",
      clearLongPress: true,
      startRecording: true,
      stopRecording: false,
      cancelRecording: false,
    }),
  });
}

function releaseVoicePressSession(state = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const status = normalizeStatus(state.status);
  if (state.longPressArmed && status === "pending") {
    const next = withStatus(state, "cancelled", {
      pointerActive: false,
      longPressArmed: false,
      longPressTriggered: false,
    }, currentNow, "release_pending");
    return Object.freeze({
      state: next,
      effects: Object.freeze({
        action: "cancel_pending",
        clearLongPress: true,
        clearPendingGuard: true,
        startRecording: false,
        stopRecording: false,
        cancelRecording: false,
        scheduleTerminalHideMs: terminalHideDelay("cancelled"),
      }),
    });
  }
  if (RELEASE_STOPS_STATUSES.includes(status)) {
    const next = withStatus(state, "finalizing", {
      pointerActive: false,
      longPressArmed: false,
    }, currentNow, "release_recording");
    return Object.freeze({
      state: next,
      effects: Object.freeze({
        action: "stop_recording",
        clearLongPress: true,
        clearPendingGuard: true,
        startRecording: false,
        stopRecording: true,
        cancelRecording: false,
      }),
    });
  }
  return Object.freeze({
    state: createVoiceSessionState(Object.assign({}, state, {
      pointerActive: false,
      longPressArmed: false,
    }), currentNow),
    effects: Object.freeze({ action: "release_ignored", clearLongPress: true }),
  });
}

function cancelVoiceSession(state = {}, now = Date.now(), detail = "语音手势已取消") {
  const currentNow = safeNow(now);
  const status = normalizeStatus(state.status);
  if (!CANCELLABLE_STATUSES.includes(status)) {
    return Object.freeze({
      state: createVoiceSessionState(state, currentNow),
      effects: Object.freeze({ action: "cancel_ignored", cancelRecording: false }),
    });
  }
  const next = withStatus(state, "cancelled", {
    statusDetail: detail,
    pointerActive: false,
    longPressArmed: false,
    longPressTriggered: false,
  }, currentNow, "cancel");
  return Object.freeze({
    state: next,
    effects: Object.freeze({
      action: status === "pending" ? "cancel_pending" : "cancel_recording",
      clearLongPress: true,
      clearPendingGuard: true,
      startRecording: false,
      stopRecording: false,
      cancelRecording: status !== "pending",
      scheduleTerminalHideMs: terminalHideDelay("cancelled"),
    }),
  });
}

function applyVoiceSessionStatus(state = {}, payload = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const status = normalizeNativeStatus(payload.status || payload.state || payload);
  const fields = {
    nativeStatus: typeof payload === "object" ? Object.assign({}, payload, { source: payload.source || "native-shell" }) : state.nativeStatus,
    statusCache: payload.statusCache || state.statusCache,
    target: payload.target || state.target,
    statusDetail: payload.statusDetail || payload.detail || "",
    error: status === "failed" ? String(payload.error || payload.message || "语音输入失败") : "",
    voiceSessionId: String(payload.voiceSessionId || payload.voice_session_id || state.voiceSessionId || "").slice(0, 160),
    partialCount: Number(state.partialCount || 0) + (payload.partialText || payload.text ? 1 : 0),
  };
  if (payload.recordingStartedAt) fields.recordingStartedAt = Number(payload.recordingStartedAt) || currentNow;
  else if (status === "recording" && !state.recordingStartedAt) fields.recordingStartedAt = currentNow;
  return Object.freeze({
    state: withStatus(state, status, fields, currentNow, "native_status"),
    effects: Object.freeze({
      action: "native_status",
      scheduleTerminalHideMs: terminalHideDelay(status),
    }),
  });
}

function evaluateVoiceSessionTimeouts(state = {}, now = Date.now()) {
  const currentNow = safeNow(now);
  const guard = pendingGuardOutcome(state, currentNow);
  if (guard.shouldCancel) {
    const next = withStatus(state, "cancelled", {
      statusDetail: guard.reason,
      pointerActive: false,
      longPressArmed: false,
    }, currentNow, "pending_guard");
    return Object.freeze({
      state: next,
      effects: Object.freeze({
        action: "pending_guard_cancel",
        reason: guard.reason,
        clearLongPress: true,
        clearPendingGuard: true,
        cancelRecording: false,
        scheduleTerminalHideMs: terminalHideDelay("cancelled"),
      }),
    });
  }
  const terminalHideAt = Number(state.terminalHideAt || 0);
  if (terminalHideAt && currentNow >= terminalHideAt) {
    const next = createVoiceSessionState({
      status: "idle",
      hidden: true,
      panelOpenedAt: 0,
      pressStartedAt: 0,
      pointerActive: false,
      longPressArmed: false,
      lastAction: "terminal_auto_hide",
    }, currentNow);
    return Object.freeze({
      state: next,
      effects: Object.freeze({ action: "terminal_auto_hide" }),
    });
  }
  return Object.freeze({
    state: createVoiceSessionState(state, currentNow),
    effects: Object.freeze({ action: "no_timeout" }),
  });
}

function createVoiceInputSessionController(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const setTimer = typeof options.setTimer === "function" ? options.setTimer : null;
  const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : null;
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  let state = createVoiceSessionState(options.initialState || {}, now());
  const timers = { longPress: null, pendingGuard: null, terminalHide: null };

  function clearTimerSlot(name) {
    if (timers[name] && clearTimer) clearTimer(timers[name]);
    timers[name] = null;
  }

  function scheduleTerminalHide(ms) {
    clearTimerSlot("terminalHide");
    if (!setTimer || !ms) return;
    timers.terminalHide = setTimer(() => {
      commit(evaluateVoiceSessionTimeouts(state, now()));
    }, ms);
  }

  function commit(result) {
    state = result.state;
    if (result.effects?.clearLongPress) clearTimerSlot("longPress");
    if (result.effects?.clearPendingGuard) clearTimerSlot("pendingGuard");
    if (result.effects?.scheduleLongPressMs && setTimer) {
      clearTimerSlot("longPress");
      timers.longPress = setTimer(() => {
        commit(triggerVoiceLongPress(state, now()));
      }, result.effects.scheduleLongPressMs);
    }
    if (result.effects?.schedulePendingGuardMs && setTimer) {
      clearTimerSlot("pendingGuard");
      timers.pendingGuard = setTimer(() => {
        commit(evaluateVoiceSessionTimeouts(state, now()));
      }, result.effects.schedulePendingGuardMs);
    }
    if (result.effects?.scheduleTerminalHideMs) scheduleTerminalHide(result.effects.scheduleTerminalHideMs);
    onChange(state, result.effects);
    return result;
  }

  return Object.freeze({
    version: VOICE_INPUT_SESSION_CONTROLLER_VERSION,
    snapshot: () => state,
    beginPress: (fields = {}) => commit(beginVoicePressSession(state, fields, now())),
    triggerLongPress: () => commit(triggerVoiceLongPress(state, now())),
    releasePress: () => commit(releaseVoicePressSession(state, now())),
    cancel: (detail) => commit(cancelVoiceSession(state, now(), detail)),
    applyStatus: (payload = {}) => commit(applyVoiceSessionStatus(state, payload, now())),
    evaluateTimeouts: () => commit(evaluateVoiceSessionTimeouts(state, now())),
    dispose() {
      clearTimerSlot("longPress");
      clearTimerSlot("pendingGuard");
      clearTimerSlot("terminalHide");
    },
  });
}

export {
  RELEASE_STOPS_STATUSES,
  VOICE_INPUT_SESSION_CONTROLLER_VERSION,
  applyVoiceSessionStatus,
  beginVoicePressSession,
  cancelVoiceSession,
  createVoiceInputSessionController,
  createVoiceSessionState,
  evaluateVoiceSessionTimeouts,
  releaseVoicePressSession,
  triggerVoiceLongPress,
};
