"use strict";

const VOICE_INPUT_LONG_PRESS_MS = 420;
const VOICE_INPUT_MIN_CLIENT_DURATION_MS = 300;
const VOICE_INPUT_PRESS_EVENTS_BOUND = "__homeAiVoiceInputPressEventsBound";
const VOICE_INPUT_MIC_GRANTED_KEY = "homeAiVoiceInputMicGranted";

function ensureVoiceInputState() {
  if (!state.voiceInput || typeof state.voiceInput !== "object") {
    state.voiceInput = {};
  }
  const voice = state.voiceInput;
  if (!voice.status) voice.status = "idle";
  if (!Array.isArray(voice.chunks)) voice.chunks = [];
  return voice;
}

function voiceInputStatusLabel(status = ensureVoiceInputState().status) {
  const labels = {
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
    failed: "语音输入失败",
  };
  return labels[status] || labels.idle;
}

function voiceInputInputValue(input) {
  return String(input?.value || "");
}

function voiceInputSetInputValue(input, value) {
  if (!input) return;
  input.value = String(value || "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function voiceInputInputCaretOffset(input) {
  if (!input || typeof input.selectionStart !== "number") return voiceInputInputValue(input).length;
  return input.selectionStart;
}

function voiceInputSetInputCaretOffset(input, offset) {
  if (!input || typeof input.setSelectionRange !== "function") return;
  const value = voiceInputInputValue(input);
  const next = Math.max(0, Math.min(value.length, Number(offset) || 0));
  input.setSelectionRange(next, next);
}

function voiceInputElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle?.(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function voiceInputMainSurfaceType() {
  return state.viewMode === "tasks" ? "topic_chat" : "chat";
}

function voiceInputMainComposerDefinition() {
  const composer = $("composer");
  const input = $("messageInput");
  const button = $("sendMessage");
  return {
    kind: "main",
    id: "home-ai-native",
    surfaceType: voiceInputMainSurfaceType(),
    threadId: state.currentThreadId || "",
    input,
    button,
    container: composer,
    getText: () => getComposerText(),
    setText: (value) => setComposerText(value),
    caret: () => composerCaretOffset(),
    setCaret: (offset) => setComposerCaretOffset(offset),
    focus: () => $("messageInput")?.focus(),
  };
}

function voiceInputTextAreaComposerDefinition({ id, surfaceType, form, input, button, threadId = "" }) {
  return {
    kind: "host-form",
    id,
    surfaceType,
    threadId,
    input,
    button,
    container: form,
    getText: () => voiceInputInputValue(input),
    setText: (value) => voiceInputSetInputValue(input, value),
    caret: () => voiceInputInputCaretOffset(input),
    setCaret: (offset) => voiceInputSetInputCaretOffset(input, offset),
    focus: () => input?.focus?.(),
  };
}

function voiceInputComposerForButton(button) {
  if (!button || button.closest?.("[data-voice-action]")) return null;
  if (button.id === "sendMessage") return voiceInputMainComposerDefinition();

  const kanbanForm = button.closest?.("#kanbanComposerForm");
  if (kanbanForm && button.matches?.("button[type='submit'], button:not([type])")) {
    return voiceInputTextAreaComposerDefinition({
      id: "kanban-create",
      surfaceType: "kanban_composer",
      form: kanbanForm,
      input: kanbanForm.querySelector("#kanbanComposerText"),
      button,
    });
  }

  const automationCreateForm = button.closest?.("#automationCreateForm");
  if (automationCreateForm && button.matches?.("button[type='submit'], button:not([type])")) {
    return voiceInputTextAreaComposerDefinition({
      id: "automation-create",
      surfaceType: "automation_composer",
      form: automationCreateForm,
      input: automationCreateForm.querySelector("#automationNaturalText"),
      button,
    });
  }

  const automationEditForm = button.closest?.("#automationEditForm");
  if (automationEditForm && button.matches?.("button[type='submit'], button:not([type])")) {
    return voiceInputTextAreaComposerDefinition({
      id: `automation-edit:${String(automationEditForm.dataset?.automationEditId || "").slice(0, 80)}`,
      surfaceType: "automation_composer",
      form: automationEditForm,
      input: automationEditForm.querySelector("#automationEditPrompt"),
      button,
    });
  }

  const todoCommentForm = button.closest?.("[data-todo-comment-form]");
  if (todoCommentForm && button.closest?.(".todo-comment-actions")) {
    return voiceInputTextAreaComposerDefinition({
      id: `todo-comment:${String(todoCommentForm.dataset?.todoCommentForm || "").slice(0, 80)}`,
      surfaceType: "todo_comment",
      form: todoCommentForm,
      input: todoCommentForm.querySelector("#todoCommentText"),
      button,
      threadId: String(todoCommentForm.dataset?.todoCommentForm || "").slice(0, 160),
    });
  }

  const todoRevisionForm = button.closest?.("[data-todo-revision-form]");
  if (todoRevisionForm && button.matches?.("button[type='submit'], button:not([type])")) {
    return voiceInputTextAreaComposerDefinition({
      id: `todo-revision:${String(todoRevisionForm.dataset?.todoRevisionForm || "").slice(0, 80)}`,
      surfaceType: "todo_revision",
      form: todoRevisionForm,
      input: todoRevisionForm.querySelector("#todoRevisionText"),
      button,
      threadId: String(todoRevisionForm.dataset?.todoRevisionForm || "").slice(0, 160),
    });
  }

  const growthCheckForm = button.closest?.("[data-learning-growth-teaching-check-form]");
  if (growthCheckForm && button.matches?.("button[type='submit'], button:not([type])")) {
    return voiceInputTextAreaComposerDefinition({
      id: `growth-teaching-check:${String(growthCheckForm.dataset?.learningGrowthTeachingCheckForm || "").slice(0, 80)}`,
      surfaceType: "growth_teaching_check",
      form: growthCheckForm,
      input: growthCheckForm.querySelector("[data-field='quickCheckText']"),
      button,
      threadId: String(growthCheckForm.dataset?.learningGrowthTeachingCheckForm || "").slice(0, 160),
    });
  }

  return null;
}

function voiceInputHostComposerButtons() {
  return Array.from(document.querySelectorAll([
    "#sendMessage",
    "#kanbanComposerForm button[type='submit']",
    "#automationCreateForm button[type='submit']",
    "#automationEditForm button[type='submit']",
    "[data-todo-comment-form] .todo-comment-actions button",
    "[data-todo-revision-form] button[type='submit']",
    "[data-learning-growth-teaching-check-form] button[type='submit']",
  ].join(", "))).filter((button) => voiceInputComposerForButton(button));
}

function voiceInputNativeComposerAvailable(composer = voiceInputMainComposerDefinition()) {
  if (!composer?.container || !composer?.input || !composer?.button) return false;
  if (!voiceInputElementVisible(composer.container)) return false;
  if (composer.button.disabled && composer.kind !== "main") return false;
  if (composer.kind === "main" && composer.button.disabled && !isComposerStopMode()) return false;
  if (composer.input.disabled || composer.input.readOnly) return false;
  if (composer.kind === "main" && (isChatSearchMode() || isComposerStopMode())) return false;
  if (document.body?.classList?.contains("embedded-plugin-preview-fullscreen-active")) return false;
  return true;
}

function voiceInputRequestScope() {
  const voice = ensureVoiceInputState();
  if (voice.target?.kind === "embedded-plugin") {
    return {
      workspaceId: state.selectedWorkspaceId || "owner",
      surfaceType: "embedded_plugin",
      pluginId: voice.target.pluginId || "",
      threadId: voice.target.threadId || "",
      composerId: voice.target.composerId || "default",
    };
  }
  return {
    workspaceId: state.selectedWorkspaceId || "owner",
    surfaceType: voice.target?.composer?.surfaceType || voiceInputMainSurfaceType(),
    pluginId: "",
    threadId: voice.target?.composer?.threadId || state.currentThreadId || "",
    composerId: voice.target?.composer?.id || "home-ai-native",
  };
}

function voiceInputEmbeddedComposerAvailable(def) {
  return Boolean(def && typeof embeddedPluginVoiceInputAvailable === "function" && embeddedPluginVoiceInputAvailable(def));
}

function voiceInputPreferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported?.(type);
    } catch (_) {
      return false;
    }
  }) || "";
}

function voiceInputFormatDuration(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function voiceInputRememberMicGranted() {
  try {
    localStorage.setItem(VOICE_INPUT_MIC_GRANTED_KEY, "1");
  } catch (_) {}
}

function voiceInputForgetMicGranted() {
  try {
    localStorage.removeItem(VOICE_INPUT_MIC_GRANTED_KEY);
  } catch (_) {}
}

function voiceInputMicWasGranted() {
  try {
    return localStorage.getItem(VOICE_INPUT_MIC_GRANTED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

async function voiceInputMicrophonePermissionState() {
  try {
    if (!navigator.permissions?.query) return voiceInputMicWasGranted() ? "granted" : "unknown";
    const status = await navigator.permissions.query({ name: "microphone" });
    const value = String(status?.state || "");
    if (value === "granted") voiceInputRememberMicGranted();
    if (value === "denied") voiceInputForgetMicGranted();
    return value || (voiceInputMicWasGranted() ? "granted" : "unknown");
  } catch (_) {
    return voiceInputMicWasGranted() ? "granted" : "unknown";
  }
}

function voiceInputStartErrorMessage(err) {
  const name = String(err?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError") {
    voiceInputForgetMicGranted();
    return "麦克风权限未开启";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "麦克风暂时被系统或其他语音输入占用，请稍后再试";
  }
  return err?.message || "无法启动录音";
}

function voiceInputRememberButtonLabel(button) {
  if (!button || button.id === "sendMessage") return;
  if (!button.dataset.voiceInputDefaultLabel) button.dataset.voiceInputDefaultLabel = button.textContent || "";
  if (!button.dataset.voiceInputDefaultTitle) button.dataset.voiceInputDefaultTitle = button.getAttribute("title") || "";
  if (!button.dataset.voiceInputDefaultAriaLabel) button.dataset.voiceInputDefaultAriaLabel = button.getAttribute("aria-label") || "";
}

function voiceInputRestoreButtonLabel(button) {
  if (!button || button.id === "sendMessage") return;
  if (button.dataset.voiceInputDefaultLabel) button.textContent = button.dataset.voiceInputDefaultLabel;
}

function applyVoiceInputButtonState(button, composer, active) {
  if (!button) return;
  button.classList.toggle("voice-input-gesture", true);
  button.classList.toggle("voice-input-pending", active && ["pending", "checking", "requesting", "preparing"].includes(ensureVoiceInputState().status));
  button.classList.toggle("voice-input-recording", active && ensureVoiceInputState().status === "recording");
  button.classList.toggle("voice-input-busy", active && ["finalizing", "transcribing"].includes(ensureVoiceInputState().status));
  if (!active) {
    voiceInputRestoreButtonLabel(button);
    const available = voiceInputNativeComposerAvailable(composer);
    button.setAttribute("title", available ? "按住录音，松开转写" : (button.dataset.voiceInputDefaultTitle || button.getAttribute("title") || ""));
    button.setAttribute("aria-label", available ? `${button.textContent || "发送"}。按住可语音输入` : (button.dataset.voiceInputDefaultAriaLabel || button.textContent || "发送"));
    return;
  }
  voiceInputRememberButtonLabel(button);
  const voice = ensureVoiceInputState();
  if (voice.status === "recording") {
    button.textContent = voiceInputFormatDuration(Date.now() - Number(voice.recordingStartedAt || Date.now()));
    button.setAttribute("aria-label", "正在录音，松开后转写");
    button.setAttribute("title", "松开后转写");
    return;
  }
  button.textContent = voice.status === "transcribing" ? "转写" : "语音";
  button.setAttribute("aria-label", voiceInputStatusLabel(voice.status));
  button.setAttribute("title", voiceInputStatusLabel(voice.status));
}

function refreshVoiceInputSendButton() {
  const voice = ensureVoiceInputState();
  const button = $("sendMessage");
  const active = ["pending", "checking", "requesting", "preparing", "recording", "finalizing", "transcribing"].includes(voice.status);
  const activeButton = voice.target?.kind === "native" ? voice.target.button : null;
  document.body?.classList?.toggle("voice-input-press-active", active || Boolean(voice.pressTimer));
  if (button) {
    const mainComposer = voiceInputMainComposerDefinition();
    const mainActive = active && activeButton === button;
    button.classList.toggle("voice-input-gesture", true);
    button.classList.toggle("voice-input-pending", mainActive && (voice.status === "pending" || voice.status === "checking" || voice.status === "requesting" || voice.status === "preparing"));
    button.classList.toggle("voice-input-recording", mainActive && voice.status === "recording");
    button.classList.toggle("voice-input-busy", mainActive && (voice.status === "finalizing" || voice.status === "transcribing"));
    if (!mainActive) {
      button.textContent = isChatSearchMode() ? "搜索" : (isComposerStopMode() ? "Stop" : "Send");
      button.setAttribute("title", voiceInputNativeComposerAvailable(mainComposer) ? "按住录音，松开转写" : "Send");
      button.setAttribute("aria-label", voiceInputNativeComposerAvailable(mainComposer) ? "发送。按住可语音输入" : "Send");
    } else if (voice.status === "recording") {
      const elapsed = Date.now() - Number(voice.recordingStartedAt || Date.now());
      button.textContent = voiceInputFormatDuration(elapsed);
      button.setAttribute("aria-label", "正在录音，松开后转写");
      button.setAttribute("title", "松开后转写");
    } else {
      button.textContent = voice.status === "transcribing" ? "转写" : "语音";
      button.setAttribute("aria-label", voiceInputStatusLabel(voice.status));
      button.setAttribute("title", voiceInputStatusLabel(voice.status));
    }
  }
  voiceInputHostComposerButtons().forEach((hostButton) => {
    if (hostButton.id === "sendMessage") return;
    const composer = voiceInputComposerForButton(hostButton);
    applyVoiceInputButtonState(hostButton, composer, active && activeButton === hostButton);
  });
}

function ensureVoiceInputOverlay() {
  let overlay = $("voiceInputOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("section");
  overlay.id = "voiceInputOverlay";
  overlay.className = "voice-input-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="voice-input-head">
      <div class="voice-input-status-line">
        <span class="voice-input-mic-indicator" aria-hidden="true"></span>
        <div class="voice-input-title" data-voice-status></div>
      </div>
      <button type="button" class="secondary-small voice-input-cancel" data-voice-action="cancel">取消</button>
    </div>
    <div class="voice-input-corrections" data-voice-corrections hidden></div>
  `;
  overlay.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-voice-action]")?.dataset?.voiceAction || "";
    if (!action) return;
    event.preventDefault();
    if (action === "cancel") cancelVoiceInput();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function renderVoiceInputOverlay() {
  const voice = ensureVoiceInputState();
  const overlay = ensureVoiceInputOverlay();
  const status = overlay.querySelector("[data-voice-status]");
  const corrections = overlay.querySelector("[data-voice-corrections]");
  overlay.hidden = voice.status === "idle";
  overlay.classList.toggle("voice-input-overlay-active", !overlay.hidden);
  overlay.classList.toggle("voice-input-overlay-busy", ["checking", "requesting", "preparing", "recording", "finalizing", "transcribing", "inserting"].includes(voice.status));
  overlay.classList.toggle("voice-input-overlay-recording", voice.status === "recording");
  overlay.classList.toggle("voice-input-overlay-error", voice.status === "failed");
  if (status) {
    const detail = voice.error || voiceInputStatusLabel(voice.status);
    status.textContent = voice.status === "recording"
      ? `${voiceInputStatusLabel(voice.status)} ${voiceInputFormatDuration(Date.now() - Number(voice.recordingStartedAt || Date.now()))}`
      : detail;
  }
  if (corrections) {
    const applied = voice.corrections?.applied || [];
    const suggestions = voice.corrections?.suggestions || [];
    const parts = [];
    if (applied.length) parts.push(`已按个人习惯修正 ${applied.length} 处`);
    if (suggestions.length) parts.push(`有 ${suggestions.length} 处候选修正`);
    corrections.textContent = parts.join("，");
    corrections.hidden = !parts.length;
  }
  refreshVoiceInputSendButton();
}

function closeVoiceInputOverlay() {
  const voice = ensureVoiceInputState();
  voice.status = "idle";
  voice.error = "";
  voice.transcript = "";
  voice.voiceSessionId = "";
  voice.corrections = null;
  voice.target = null;
  document.body?.classList?.remove("voice-input-press-active");
  renderVoiceInputOverlay();
}

function setVoiceInputStatus(status, fields = {}) {
  const voice = ensureVoiceInputState();
  Object.assign(voice, fields, { status });
  renderVoiceInputOverlay();
}

function voiceInputClearPressTimer() {
  const voice = ensureVoiceInputState();
  if (voice.pressTimer) clearTimeout(voice.pressTimer);
  voice.pressTimer = 0;
  if (!["pending", "checking", "requesting", "preparing", "recording", "finalizing", "transcribing"].includes(voice.status)) {
    document.body?.classList?.remove("voice-input-press-active");
  }
}

function voiceInputClearSelection() {
  try {
    document.getSelection?.()?.removeAllRanges?.();
  } catch (_) {}
}

function voiceInputPressSelectionSuppressed() {
  const voice = ensureVoiceInputState();
  return Boolean(voice.pressTimer || ["pending", "checking", "requesting", "preparing", "recording", "finalizing", "transcribing"].includes(voice.status));
}

function suppressVoiceInputSelectionEvent(event) {
  if (event?.target?.closest?.("[data-voice-transcript]")) return;
  if (!voiceInputPressSelectionSuppressed()) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  voiceInputClearSelection();
}

function suppressVoiceInputSelectionChange() {
  if (!voiceInputPressSelectionSuppressed()) return;
  voiceInputClearSelection();
}

function bindVoiceInputPressSelectionGuards() {
  if (document[VOICE_INPUT_PRESS_EVENTS_BOUND]) return;
  document[VOICE_INPUT_PRESS_EVENTS_BOUND] = true;
  document.addEventListener("selectstart", suppressVoiceInputSelectionEvent, true);
  document.addEventListener("selectionchange", suppressVoiceInputSelectionChange, true);
  document.addEventListener("contextmenu", suppressVoiceInputSelectionEvent, true);
  document.addEventListener("dragstart", suppressVoiceInputSelectionEvent, true);
  document.addEventListener("touchmove", suppressVoiceInputSelectionEvent, { capture: true, passive: false });
  document.addEventListener("pointerdown", handleVoiceInputPointerDown, true);
  document.addEventListener("pointerup", handleVoiceInputPointerUp, true);
  document.addEventListener("pointercancel", handleVoiceInputPointerCancel, true);
  document.addEventListener("click", suppressVoiceInputClickEvent, true);
}

function scheduleVoiceInputClickSuppressionClear() {
  const voice = ensureVoiceInputState();
  if (voice.suppressClickTimer) clearTimeout(voice.suppressClickTimer);
  voice.suppressClickTimer = setTimeout(() => {
    voice.suppressClickTimer = 0;
    voice.suppressNextClick = false;
    voice.suppressClickButton = null;
  }, 1200);
}

function voiceInputStopTracks() {
  const voice = ensureVoiceInputState();
  const stream = voice.stream;
  voice.stream = null;
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch (_) {}
}

function cancelVoiceInput() {
  const voice = ensureVoiceInputState();
  voice.cancelRequested = true;
  voice.pendingStopAfterStart = false;
  voice.chunks = [];
  voiceInputClearPressTimer();
  if (voice.recorder && voice.recorder.state !== "inactive") {
    try {
      voice.recorder.stop();
    } catch (_) {}
  }
  voice.recorder = null;
  voiceInputStopTracks();
  document.body?.classList?.remove("voice-input-press-active");
  closeVoiceInputOverlay();
}

async function voiceInputLoadStatus() {
  const voice = ensureVoiceInputState();
  if (voice.statusCache && Date.now() - Number(voice.statusCache.loadedAt || 0) < 300000) return voice.statusCache;
  if (voice.statusPromise) return voice.statusPromise;
  voice.statusPromise = api(`/api/voice-input/status?workspaceId=${encodeURIComponent(state.selectedWorkspaceId || "owner")}`, {
    method: "GET",
    timeoutMs: 15000,
  }).then((payload) => {
    voice.statusCache = Object.assign({ loadedAt: Date.now() }, payload || {});
    return voice.statusCache;
  }).finally(() => {
    voice.statusPromise = null;
  });
  return voice.statusPromise;
}

function voiceInputPrewarmStatus() {
  voiceInputLoadStatus().catch(() => {});
}

function handleVoiceInputStopButtonPointerDown(event, button) {
  const voice = ensureVoiceInputState();
  voiceInputClearPressTimer();
  voice.pointerId = event.pointerId;
  voice.pointerButton = button;
  voice.pointerComposer = null;
  voice.suppressNextClick = false;
  voice.suppressClickButton = null;
  voiceInputClearSelection();
  document.body?.classList?.add("voice-input-press-active");
  try {
    button?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pressTimer = setTimeout(() => {
    voice.pressTimer = 0;
    voice.suppressNextClick = true;
    voice.suppressClickButton = button;
    scheduleVoiceInputClickSuppressionClear();
    voiceInputClearSelection();
  }, VOICE_INPUT_LONG_PRESS_MS);
}

async function startVoiceInputRecording(event, options = {}) {
  const voice = ensureVoiceInputState();
  const target = options.target || { kind: "native" };
  const targetAvailable = target.kind === "embedded-plugin"
    ? voiceInputEmbeddedComposerAvailable(target.def)
    : voiceInputNativeComposerAvailable(target.composer || voiceInputMainComposerDefinition());
  if (!targetAvailable) {
    setVoiceInputStatus("failed", { error: "当前输入框不可写" });
    return;
  }
  voice.target = target;
  if (target.kind === "native" && !target.button) target.button = target.composer?.button || $("sendMessage");
  voice.suppressNextClick = target.kind === "native";
  voice.suppressClickButton = target.kind === "native" ? target.button : null;
  if (voice.suppressNextClick) scheduleVoiceInputClickSuppressionClear();
  voice.cancelRequested = false;
  voice.pendingStopAfterStart = false;
  voice.chunks = [];
  event?.preventDefault?.();
  setVoiceInputStatus("checking");
  try {
    const permissionStatePromise = voiceInputMicrophonePermissionState();
    const serviceStatus = await voiceInputLoadStatus();
    if (voice.cancelRequested) {
      closeVoiceInputOverlay();
      return;
    }
    if (!serviceStatus?.enabled) {
      setVoiceInputStatus("failed", { error: "语音转写服务未配置" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceInputStatus("failed", { error: "当前浏览器不支持录音" });
      return;
    }
    const permissionState = await permissionStatePromise;
    if (permissionState === "denied") {
      setVoiceInputStatus("failed", { error: "麦克风权限未开启" });
      return;
    }
    setVoiceInputStatus(permissionState === "granted" ? "preparing" : "requesting");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceInputRememberMicGranted();
    if (voice.cancelRequested) {
      stream.getTracks?.().forEach((track) => track.stop());
      closeVoiceInputOverlay();
      return;
    }
    const mimeType = voiceInputPreferredMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    voice.stream = stream;
    voice.recorder = recorder;
    voice.mimeType = mimeType || recorder.mimeType || "audio/webm";
    voice.recordingStartedAt = Date.now();
    recorder.addEventListener("dataavailable", (chunkEvent) => {
      if (chunkEvent.data && chunkEvent.data.size > 0) voice.chunks.push(chunkEvent.data);
    });
    recorder.addEventListener("stop", () => {
      void finalizeVoiceInputRecording();
    }, { once: true });
    recorder.start();
    setVoiceInputStatus("recording", { recordingStartedAt: voice.recordingStartedAt });
    voice.recordingTicker = setInterval(renderVoiceInputOverlay, 500);
    const maxDurationMs = Math.max(1000, Number(serviceStatus?.limits?.maxDurationMs || 30000) || 30000);
    voice.maxTimer = setTimeout(() => stopVoiceInputRecording(), maxDurationMs);
    if (voice.pendingStopAfterStart) setTimeout(() => stopVoiceInputRecording(), 120);
  } catch (err) {
    voiceInputStopTracks();
    setVoiceInputStatus("failed", { error: voiceInputStartErrorMessage(err) });
  }
}

function stopVoiceInputRecording() {
  const voice = ensureVoiceInputState();
  voiceInputClearPressTimer();
  if (voice.maxTimer) clearTimeout(voice.maxTimer);
  voice.maxTimer = 0;
  if (voice.recordingTicker) clearInterval(voice.recordingTicker);
  voice.recordingTicker = 0;
  if (voice.status === "checking" || voice.status === "requesting" || voice.status === "preparing") {
    voice.cancelRequested = true;
    voice.pendingStopAfterStart = false;
    closeVoiceInputOverlay();
    return;
  }
  if (voice.recorder && voice.recorder.state !== "inactive") {
    setVoiceInputStatus("finalizing");
    try {
      voice.recorder.stop();
    } catch (err) {
      voiceInputStopTracks();
      setVoiceInputStatus("failed", { error: err?.message || "无法停止录音" });
    }
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.split(",").pop() : text);
    };
    reader.onerror = () => reject(reader.error || new Error("无法读取录音"));
    reader.readAsDataURL(blob);
  });
}

async function finalizeVoiceInputRecording() {
  const voice = ensureVoiceInputState();
  const startedAt = Number(voice.recordingStartedAt || Date.now());
  const durationMs = Math.max(0, Date.now() - startedAt);
  if (voice.cancelRequested) {
    voiceInputStopTracks();
    closeVoiceInputOverlay();
    return;
  }
  if (voice.maxTimer) clearTimeout(voice.maxTimer);
  voice.maxTimer = 0;
  if (voice.recordingTicker) clearInterval(voice.recordingTicker);
  voice.recordingTicker = 0;
  voiceInputStopTracks();
  const chunks = voice.chunks || [];
  voice.chunks = [];
  if (!chunks.length || durationMs < VOICE_INPUT_MIN_CLIENT_DURATION_MS) {
    closeVoiceInputOverlay();
    return;
  }
  try {
    setVoiceInputStatus("transcribing");
    const blob = new Blob(chunks, { type: voice.mimeType || chunks[0]?.type || "audio/webm" });
    const audioBase64 = await blobToBase64(blob);
    const result = await api("/api/voice-input/transcribe", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
        audioBase64,
        comparison: typeof voiceLearningModeActive === "function" && voiceLearningModeActive(),
        durationMs,
        mimeType: blob.type || voice.mimeType || "audio/webm",
      })),
      timeoutMs: 90000,
    });
    if (typeof voiceLearningHandleTranscribeResult === "function") {
      voiceLearningHandleTranscribeResult(result);
    }
    setVoiceInputStatus("inserting", {
      transcript: result?.text || "",
      voiceSessionId: result?.voiceSessionId || "",
      corrections: result?.corrections || null,
      error: "",
    });
    await insertVoiceInputTranscript("append");
  } catch (err) {
    setVoiceInputStatus("failed", { error: err?.message || "转写失败" });
  }
}

function voiceInputInsertedTextForComposer(composer, mode, text) {
  const current = composer?.getText?.() || "";
  if (mode === "replace" || !current) return text;
  const caret = composer?.caret?.() ?? current.length;
  const before = current.slice(0, caret);
  const after = current.slice(caret);
  const separatorBefore = before && !/[\s\n]$/.test(before) ? "\n" : "";
  const separatorAfter = after && !/^[\s\n]/.test(after) ? "\n" : "";
  return `${before}${separatorBefore}${text}${separatorAfter}${after}`;
}

async function commitVoiceInputSession(finalText) {
  const voice = ensureVoiceInputState();
  if (!voice.voiceSessionId || !finalText) return;
  try {
    await api("/api/voice-input/commit", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
        voiceSessionId: voice.voiceSessionId,
        finalText,
      })),
      timeoutMs: 15000,
    });
  } catch (err) {
    console.warn("[voice-input] correction commit failed", err?.message || err);
  }
}

function trackPendingVoiceInputCommit(finalText) {
  const voice = ensureVoiceInputState();
  if (!voice.voiceSessionId || !finalText || voice.target?.kind !== "native") return;
  state.pendingVoiceInputCommit = {
    voiceSessionId: voice.voiceSessionId,
    insertedText: String(finalText || "").trim(),
    scope: voiceInputRequestScope(),
  };
}

function commitPendingVoiceInputFinalText(finalText, body = {}) {
  const pending = state.pendingVoiceInputCommit;
  const text = String(finalText || "").trim();
  if (!pending?.voiceSessionId || !text) return;
  state.pendingVoiceInputCommit = null;
  const scope = Object.assign({}, pending.scope || {});
  if (body?.taskGroupId && typeof pluginTopicDefForGroupId === "function") {
    const pluginTopicDef = pluginTopicDefForGroupId(body.taskGroupId);
    if (pluginTopicDef?.id) scope.pluginId = pluginTopicDef.id;
  }
  api("/api/voice-input/commit", {
    method: "POST",
    body: JSON.stringify(Object.assign({}, scope, {
      workspaceId: scope.workspaceId || state.selectedWorkspaceId || "owner",
      voiceSessionId: pending.voiceSessionId,
      finalText: text,
    })),
    timeoutMs: 15000,
  }).catch((err) => {
    console.warn("[voice-input] final correction commit failed", err?.message || err);
  });
}

async function insertVoiceInputTranscript(mode = "append") {
  const voice = ensureVoiceInputState();
  const text = String(voice.transcript || "").trim();
  if (!text) {
    closeVoiceInputOverlay();
    return;
  }
  setVoiceInputStatus("inserting");
  if (voice.target?.kind === "embedded-plugin") {
    const action = mode === "replace" ? "replace_draft" : "append_text";
    const ok = typeof sendEmbeddedPluginVoiceInputAction === "function" && sendEmbeddedPluginVoiceInputAction(action, {
      text,
      voiceSessionId: voice.voiceSessionId || "",
      composerId: voice.target.composerId || "default",
    }, voice.target.def);
    if (!ok) {
      setVoiceInputStatus("failed", { error: "插件输入框暂时不可写" });
      return;
    }
    setVoiceInputStatus("inserted", { transcript: text });
    setTimeout(closeVoiceInputOverlay, 650);
    return;
  }
  const composer = voice.target?.composer || voiceInputMainComposerDefinition();
  if (!voiceInputNativeComposerAvailable(composer)) {
    setVoiceInputStatus("failed", { error: "当前输入框不可写" });
    return;
  }
  const next = voiceInputInsertedTextForComposer(composer, mode, text);
  composer.setText?.(next);
  const caret = mode === "replace" ? next.length : next.indexOf(text) + text.length;
  composer.setCaret?.(caret);
  composer.focus?.();
  trackPendingVoiceInputCommit(text);
  setVoiceInputStatus("inserted", { transcript: text });
  setTimeout(closeVoiceInputOverlay, 650);
}

function startVoiceInputFromEmbeddedPlugin(def, payload = {}) {
  if (!def) return false;
  const target = {
    kind: "embedded-plugin",
    def,
    pluginId: def.id,
    composerId: String(payload.composerId || payload.composer_id || "default").slice(0, 120),
    threadId: String(payload.threadId || payload.thread_id || "").slice(0, 160),
  };
  void startVoiceInputRecording(null, { target });
  return true;
}

function stopVoiceInputFromEmbeddedPlugin(def) {
  const voice = ensureVoiceInputState();
  if (voice.target?.kind === "embedded-plugin" && voice.target.pluginId && def?.id && voice.target.pluginId !== def.id) return false;
  stopVoiceInputRecording();
  return true;
}

function commitVoiceInputPluginResult(def, payload = {}) {
  const voiceSessionId = String(payload.voiceSessionId || payload.voice_session_id || "").slice(0, 160);
  const finalText = String(payload.finalText || payload.final_text || payload.text || "").trim();
  if (!def || !voiceSessionId || !finalText) return false;
  api("/api/voice-input/commit", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId || "owner",
      surfaceType: "embedded_plugin",
      pluginId: def.id,
      threadId: String(payload.threadId || payload.thread_id || "").slice(0, 160),
      composerId: String(payload.composerId || payload.composer_id || "default").slice(0, 120),
      voiceSessionId,
      finalText,
    }),
    timeoutMs: 15000,
  }).catch((err) => {
    console.warn("[voice-input] plugin commit failed", err?.message || err);
  });
  return true;
}

function handleVoiceInputPointerDown(event) {
  const voice = ensureVoiceInputState();
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const button = event.target?.closest?.("button");
  if (button?.id === "sendMessage" && isComposerStopMode()) {
    handleVoiceInputStopButtonPointerDown(event, button);
    return;
  }
  const composer = voiceInputComposerForButton(button);
  if (!voiceInputNativeComposerAvailable(composer)) return;
  voiceInputClearPressTimer();
  voice.pointerId = event.pointerId;
  voice.pointerButton = button;
  voice.pointerComposer = composer;
  voice.suppressNextClick = false;
  voice.suppressClickButton = null;
  voiceInputClearSelection();
  document.body?.classList?.add("voice-input-press-active");
  voiceInputPrewarmStatus();
  try {
    button?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pressTimer = setTimeout(() => {
    event.preventDefault?.();
    event.stopPropagation?.();
    voiceInputClearSelection();
    voice.pressTimer = 0;
    void startVoiceInputRecording(event, { target: { kind: "native", composer, button } });
  }, VOICE_INPUT_LONG_PRESS_MS);
}

function handleVoiceInputPointerUp(event) {
  const voice = ensureVoiceInputState();
  if (voice.pointerId && event.pointerId !== voice.pointerId) return;
  try {
    voice.pointerButton?.releasePointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pointerId = 0;
  const button = voice.pointerButton;
  voice.pointerButton = null;
  voice.pointerComposer = null;
  if (voice.pressTimer) {
    voiceInputClearPressTimer();
    return;
  }
  if (voice.suppressNextClick && voice.suppressClickButton === button) {
    document.body?.classList?.remove("voice-input-press-active");
  }
  if (["checking", "requesting", "preparing", "recording", "finalizing"].includes(voice.status)) {
    event.preventDefault();
    event.stopPropagation();
    stopVoiceInputRecording();
  }
}

function handleVoiceInputPointerCancel(event) {
  const voice = ensureVoiceInputState();
  if (voice.pointerId && event?.pointerId && event.pointerId !== voice.pointerId) return;
  voice.pointerId = 0;
  voice.pointerButton = null;
  voice.pointerComposer = null;
  if (voice.pressTimer) {
    voiceInputClearPressTimer();
    closeVoiceInputOverlay();
    return;
  }
  if (voice.suppressNextClick && voice.suppressClickButton) {
    document.body?.classList?.remove("voice-input-press-active");
  }
  if (["checking", "requesting", "preparing", "recording", "finalizing"].includes(voice.status)) cancelVoiceInput();
}

function suppressVoiceInputTextSelection(event) {
  const voice = ensureVoiceInputState();
  if (event.target?.closest?.("[data-voice-transcript]")) return;
  if (voiceInputComposerForButton(event.target?.closest?.("button")) || voice.status !== "idle" || voice.pressTimer) {
    event.preventDefault?.();
    event.stopPropagation?.();
    voiceInputClearSelection();
  }
}

function suppressVoiceInputClickEvent(event) {
  const voice = ensureVoiceInputState();
  if (!voice.suppressNextClick) return false;
  const button = event?.target?.closest?.("button");
  if (!voiceInputComposerForButton(button)) return false;
  if (voice.suppressClickButton && button !== voice.suppressClickButton) return false;
  voice.suppressNextClick = false;
  voice.suppressClickButton = null;
  if (voice.suppressClickTimer) clearTimeout(voice.suppressClickTimer);
  voice.suppressClickTimer = 0;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  return true;
}

function handleVoiceInputSendClick(event) {
  return suppressVoiceInputClickEvent(event);
}

function initializeVoiceInputUi() {
  bindVoiceInputPressSelectionGuards();
  refreshVoiceInputSendButton();
}
