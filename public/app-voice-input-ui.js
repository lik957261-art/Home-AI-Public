"use strict";

const VOICE_INPUT_LONG_PRESS_MS = 420;
const VOICE_INPUT_MIN_CLIENT_DURATION_MS = 300;
const VOICE_INPUT_PRESS_EVENTS_BOUND = "__homeAiVoiceInputPressEventsBound";
const VOICE_INPUT_MIC_GRANTED_KEY = "homeAiVoiceInputMicGranted";
const VOICE_INPUT_EMBEDDED_INSERT_MAX_ATTEMPTS = 3;
const VOICE_INPUT_STREAMING_CHUNK_TARGET_MS = 300;
const VOICE_INPUT_STATUS_PANEL_KEY = "homeAiVoiceInputStatusPanel";

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
    cancelled: "已取消",
    no_speech: "未形成有效语音",
    failed: "语音输入失败",
  };
  return labels[status] || labels.idle;
}

function voiceInputNativeShellActive() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("nativeShell") === "ios"
      || document.documentElement?.dataset?.nativeShell === "ios"
      || localStorage.getItem("homeAI.nativeShell") === "ios";
  } catch (_) {
    return document.documentElement?.dataset?.nativeShell === "ios";
  }
}

function voiceInputNativeBridgeAvailable() {
  if (!voiceInputNativeShellActive()) return false;
  try {
    const capability = window.HomeAINativeVoiceInputCapability || {};
    const declared = capability.voiceCapture === true
      || document.documentElement?.dataset?.nativeVoiceInput === "1"
      || localStorage.getItem("homeAI.nativeVoiceInput") === "1";
    if (!declared) return false;
    return typeof window.webkit?.messageHandlers?.homeAI?.postMessage === "function";
  } catch (_) {
    return false;
  }
}

function voiceInputPostNativeBridge(type, fields = {}) {
  if (!voiceInputNativeBridgeAvailable()) return false;
  const voice = ensureVoiceInputState();
  const payload = Object.assign({
    type,
    protocolVersion: 1,
    requestId: voice.nativeRequestId || voiceInputRequestId("voice_native"),
  }, fields);
  voice.nativeRequestId = payload.requestId;
  try {
    window.webkit.messageHandlers.homeAI.postMessage(payload);
    return true;
  } catch (err) {
    console.warn("[voice-input] native bridge post failed", err?.message || err);
    return false;
  }
}

function voiceInputStatusPanelExpanded() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const query = params.get("voiceStatusPanel");
    if (query === "0") return false;
    if (query === "1") return true;
    const stored = localStorage.getItem(VOICE_INPUT_STATUS_PANEL_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch (_) {}
  return voiceInputNativeShellActive();
}

function voiceInputDebugStatusEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("voiceStatusDebug") === "1") return true;
    return localStorage.getItem("homeAiVoiceInputStatusDebug") === "1";
  } catch (_) {
    return false;
  }
}

function voiceInputStatusDetail(voice = ensureVoiceInputState()) {
  if (voice.error) return voice.error;
  if (voice.statusDetail) return voice.statusDetail;
  if (voice.status === "pending") return "等待长按阈值";
  if (voice.status === "checking") return "检查本地 ASR 与权限状态";
  if (voice.status === "requesting") return "等待系统麦克风权限";
  if (voice.status === "preparing") return "打开本地麦克风";
  if (voice.status === "recording") return voiceInputFormatDuration(Date.now() - Number(voice.recordingStartedAt || Date.now()));
  if (voice.status === "finalizing") return "整理音频片段";
  if (voice.status === "transcribing") return "等待 ASR 返回";
  if (voice.status === "inserting") return "写入当前 Composer";
  if (voice.status === "inserted") return "等待编辑或发送";
  if (voice.status === "cancelled") return "等待下一次语音输入";
  if (voice.status === "no_speech") return "没有写入 Composer";
  return "";
}

function voiceInputStatusMeta(voice = ensureVoiceInputState()) {
  const parts = [];
  const provider = voice.statusCache?.provider?.backend || voice.statusCache?.provider?.id || "";
  if (provider) parts.push(`ASR ${provider}`);
  const sessionId = voice.streaming?.voiceSessionId || voice.voiceSessionId || "";
  if (sessionId) parts.push(`session ${String(sessionId).slice(-8)}`);
  const source = voice.nativeStatus?.source || voice.target?.kind || "";
  if (source) parts.push(String(source));
  if (voice.partialCount) parts.push(`partial ${voice.partialCount}`);
  if (voice.streaming?.sequence) parts.push(`chunk ${voice.streaming.sequence}`);
  if (voice.statusUpdatedAt) parts.push(new Date(voice.statusUpdatedAt).toLocaleTimeString([], { hour12: false }));
  return parts.join(" · ");
}

function voiceInputRequestId(prefix = "voice") {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function voiceInputNativeComposerAvailable(composer = voiceInputMainComposerDefinition(), options = {}) {
  return voiceInputNativeComposerUnavailableReason(composer, options) === "";
}

function voiceInputShouldAllowStopModeForPress(button, composer) {
  return Boolean(
    button?.id === "sendMessage"
    && composer?.kind === "main"
    && typeof activeComposerRunIds === "function"
    && activeComposerRunIds().length,
  );
}

function voiceInputNativeComposerUnavailableReason(composer = voiceInputMainComposerDefinition(), options = {}) {
  const allowStopMode = Boolean(options.allowStopMode);
  if (!composer?.container || !composer?.input || !composer?.button) return "composer_missing";
  if (!voiceInputElementVisible(composer.container)) return "composer_hidden";
  if (composer.button.disabled && composer.kind !== "main") return "button_disabled";
  if (composer.kind === "main" && composer.button.disabled && !isComposerStopMode()) return "main_button_disabled";
  if (composer.input.disabled) return "input_disabled";
  if (composer.input.readOnly) return "input_readonly";
  if (composer.kind === "main" && isChatSearchMode()) return "chat_search_mode";
  if (composer.kind === "main" && isComposerStopMode() && !allowStopMode) return "stop_mode_requires_voice_hold";
  if (document.body?.classList?.contains("embedded-plugin-preview-fullscreen-active")) return "fullscreen_preview";
  return "";
}

function voiceInputComposerUnavailableMessage(reason) {
  if (reason === "composer_hidden") return "当前输入框不可写：输入框未显示";
  if (reason === "button_disabled" || reason === "main_button_disabled") return "当前输入框不可写：发送按钮暂不可用";
  if (reason === "input_disabled") return "当前输入框不可写：输入框暂不可用";
  if (reason === "input_readonly") return "当前输入框不可写：输入框只读";
  if (reason === "chat_search_mode") return "当前输入框不可写：搜索模式不支持语音输入";
  if (reason === "stop_mode_requires_voice_hold") return "当前输入框不可写：当前是 Stop 状态，请长按 Stop 按钮录音";
  if (reason === "fullscreen_preview") return "当前输入框不可写：全屏预览中";
  if (reason === "composer_missing") return "当前输入框不可写：没有找到当前输入框";
  return "当前输入框不可写";
}

function voiceInputFreshNativeComposer(composer) {
  if (!composer || composer.kind !== "main" || composer.id !== "home-ai-native") return composer;
  return voiceInputMainComposerDefinition();
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

function voiceInputStartNativeBridgeCapture(target) {
  if (target?.kind !== "native" || !voiceInputNativeBridgeAvailable()) return false;
  const voice = ensureVoiceInputState();
  const requestId = voiceInputRequestId("voice_native");
  voice.nativeRequestId = requestId;
  voice.nativeCapture = {
    active: true,
    requestId,
    started: false,
    postedAt: Date.now(),
  };
  setVoiceInputStatus("preparing", { statusDetail: "交给 iOS 原生麦克风" });
  const ok = voiceInputPostNativeBridge("voiceInput.start", Object.assign({}, voiceInputRequestScope(), {
    requestId,
    mode: "append",
  }));
  if (!ok) {
    voice.nativeCapture = null;
    voice.nativeRequestId = "";
    return false;
  }
  return true;
}

function voiceInputStopNativeBridgeCapture(action = "stop") {
  const voice = ensureVoiceInputState();
  if (!voice.nativeCapture?.active) return false;
  const type = action === "cancel" ? "voiceInput.cancel" : "voiceInput.stop";
  const ok = voiceInputPostNativeBridge(type, {
    requestId: voice.nativeCapture.requestId || voice.nativeRequestId || voiceInputRequestId("voice_native"),
  });
  if (action === "cancel") {
    voice.nativeCapture = null;
    setVoiceInputStatus("cancelled", { statusDetail: "录音已取消" });
  } else {
    setVoiceInputStatus("finalizing", { statusDetail: "等待原生转写" });
  }
  return ok;
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

function voiceInputStreamingConfigured(serviceStatus) {
  return Boolean(serviceStatus?.provider?.streaming?.configured);
}

function voiceInputStreamingSampleRate(serviceStatus) {
  return Math.max(8000, Number(serviceStatus?.provider?.streaming?.sampleRate || 16000) || 16000);
}

function voiceInputBytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, input.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function voiceInputDownsampleToPcm16(input, sourceRate, targetRate) {
  const source = input instanceof Float32Array ? input : new Float32Array(input || []);
  const fromRate = Math.max(1, Number(sourceRate || targetRate || 16000) || 16000);
  const toRate = Math.max(8000, Number(targetRate || 16000) || 16000);
  const ratio = fromRate / toRate;
  const outputLength = Math.max(0, Math.floor(source.length / ratio));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end && cursor < source.length; cursor += 1) {
      sum += source[cursor];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

function voiceInputResetProvisionalComposer() {
  const voice = ensureVoiceInputState();
  voice.provisionalComposer = null;
  voice.provisionalBaseText = "";
  voice.provisionalText = "";
  voice.provisionalCaret = 0;
  voice.provisionalLocked = false;
}

function voiceInputApplyProvisionalTranscript(text) {
  const voice = ensureVoiceInputState();
  const value = String(text || "").trim();
  if (!value) return;
  if (voice.target?.kind === "embedded-plugin") {
    if (typeof sendEmbeddedPluginVoiceInputAction === "function") {
      sendEmbeddedPluginVoiceInputAction("provisional_text", {
        text: value,
        voiceSessionId: voice.streaming?.voiceSessionId || voice.voiceSessionId || "",
        composerId: voice.target.composerId || "default",
      }, voice.target.def);
    }
    return;
  }
  if (voice.target?.kind !== "native") return;
  const composer = voiceInputFreshNativeComposer(voice.target?.composer) || voiceInputMainComposerDefinition();
  if (!composer?.setText || voice.provisionalLocked) return;
  if (!voice.provisionalComposer) {
    const current = composer.getText?.() || "";
    voice.provisionalComposer = composer;
    voice.provisionalBaseText = current;
    voice.provisionalCaret = composer.caret?.() ?? current.length;
    voice.provisionalText = "";
  }
  const currentText = composer.getText?.() || "";
  const expected = voice.provisionalText
    ? voiceInputInsertedTextForComposer({
        getText: () => voice.provisionalBaseText,
        caret: () => voice.provisionalCaret,
      }, "append", voice.provisionalText)
    : voice.provisionalBaseText;
  if (currentText !== expected) {
    voice.provisionalLocked = true;
    return;
  }
  voice.provisionalText = value;
  const next = voiceInputInsertedTextForComposer({
    getText: () => voice.provisionalBaseText,
    caret: () => voice.provisionalCaret,
  }, "append", value);
  composer.setText(next);
  const caret = next.indexOf(value) + value.length;
  composer.setCaret?.(caret);
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

function voiceInputStreamIsLive(stream) {
  try {
    const tracks = stream?.getAudioTracks?.() || stream?.getTracks?.() || [];
    return tracks.some((track) => track && track.readyState !== "ended");
  } catch (_) {
    return false;
  }
}

function voiceInputAttachMicHoldStream(stream) {
  const voice = ensureVoiceInputState();
  if (!stream) return null;
  if (voice.micHoldStream && voice.micHoldStream !== stream) {
    try {
      voice.micHoldStream.getTracks?.().forEach((track) => track.stop());
    } catch (_) {}
  }
  voice.micHoldStream = stream;
  voice.stream = stream;
  voice.micHoldLostAt = 0;
  try {
    stream.getAudioTracks?.().forEach((track) => {
      if (track.__homeAiVoiceInputHoldBound) return;
      try {
        track.__homeAiVoiceInputHoldBound = true;
      } catch (_) {}
      track.addEventListener?.("ended", () => {
        const current = ensureVoiceInputState();
        if (current.micHoldStream === stream) {
          current.micHoldLostAt = Date.now();
          current.micHoldStream = null;
          if (current.stream === stream) current.stream = null;
        }
      }, { once: true });
    });
  } catch (_) {}
  return stream;
}

function voiceInputReleaseMicHold() {
  const voice = ensureVoiceInputState();
  const stream = voice.micHoldStream || voice.stream;
  voice.micHoldStream = null;
  voice.stream = null;
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch (_) {}
}

function voiceInputClearRecordingStream(options = {}) {
  const voice = ensureVoiceInputState();
  const releaseHold = Boolean(options.releaseHold);
  if (releaseHold) {
    voiceInputReleaseMicHold();
    return;
  }
  if (!options.keepHold) {
    voiceInputReleaseMicHold();
    return;
  }
  if (voice.stream && voice.stream !== voice.micHoldStream) {
    try {
      voice.stream.getTracks?.().forEach((track) => track.stop());
    } catch (_) {}
  }
  voice.stream = voiceInputStreamIsLive(voice.micHoldStream) ? voice.micHoldStream : null;
}

async function voiceInputAcquireMicrophoneStream(options = {}) {
  const voice = ensureVoiceInputState();
  if (voiceInputStreamIsLive(voice.micHoldStream)) {
    voice.stream = voice.micHoldStream;
    return voice.micHoldStream;
  }
  const userGesture = Boolean(options.userGesture);
  if (!userGesture) {
    const permissionState = await voiceInputMicrophonePermissionState();
    if (permissionState !== "granted" && !voiceInputMicWasGranted()) return null;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voiceInputRememberMicGranted();
  return voiceInputAttachMicHoldStream(stream);
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

function voiceInputSetButtonVisualLabel(button, label) {
  if (!button) return;
  const normalized = String(label || "");
  button.classList.toggle("voice-input-stop-proxy", normalized === "Stop");
  button.dataset.voiceInputVisualLabel = normalized === "Stop" ? "" : normalized;
  button.classList.add("voice-input-label-proxy");
  button.textContent = "";
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
      const label = isChatSearchMode() ? "搜索" : (isComposerStopMode() ? "Stop" : "Send");
      voiceInputSetButtonVisualLabel(button, label);
      button.setAttribute("title", voiceInputNativeComposerAvailable(mainComposer) ? "按住录音，松开转写" : "Send");
      button.setAttribute("aria-label", voiceInputNativeComposerAvailable(mainComposer) ? "发送。按住可语音输入" : "Send");
    } else if (voice.status === "recording") {
      const elapsed = Date.now() - Number(voice.recordingStartedAt || Date.now());
      voiceInputSetButtonVisualLabel(button, voiceInputFormatDuration(elapsed));
      button.setAttribute("aria-label", "正在录音，松开后转写");
      button.setAttribute("title", "松开后转写");
    } else {
      voiceInputSetButtonVisualLabel(button, voice.status === "transcribing" ? "转写" : "语音");
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
    <span class="voice-input-mic-indicator" aria-hidden="true"></span>
    <span class="voice-input-status-copy">
      <span class="voice-input-status-title" data-voice-status-title></span>
      <span class="voice-input-status-detail" data-voice-status-detail></span>
      <span class="voice-input-status-meta" data-voice-status-meta hidden></span>
    </span>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function voiceInputRecordingVisible(voice = ensureVoiceInputState()) {
  return Boolean(voice.panelVisible || voice.status !== "idle");
}

function voiceInputRestoreAttachMicIndicator() {
  const attach = $("attachFile");
  if (!attach?.classList?.contains("voice-input-attach-indicator")) return;
  const previousHtml = attach.dataset.voiceInputPreviousHtml || "";
  const previousAria = attach.dataset.voiceInputPreviousAria || "添加文件";
  const previousTitle = attach.dataset.voiceInputPreviousTitle || previousAria;
  const previousDisabled = attach.dataset.voiceInputPreviousDisabled === "true";
  attach.innerHTML = previousHtml || "+";
  attach.disabled = previousDisabled;
  attach.setAttribute("aria-label", previousAria);
  attach.setAttribute("title", previousTitle);
  attach.classList.remove("voice-input-attach-indicator", "voice-input-attach-recording", "voice-input-attach-error");
  delete attach.dataset.voiceInputPreviousHtml;
  delete attach.dataset.voiceInputPreviousAria;
  delete attach.dataset.voiceInputPreviousTitle;
  delete attach.dataset.voiceInputPreviousDisabled;
}

function voiceInputRenderAttachMicIndicator(voice = ensureVoiceInputState()) {
  voiceInputRestoreAttachMicIndicator();
  return false;
}

function renderVoiceInputOverlay() {
  const voice = ensureVoiceInputState();
  const overlay = ensureVoiceInputOverlay();
  const expanded = voiceInputStatusPanelExpanded();
  const debug = voiceInputDebugStatusEnabled();
  const title = overlay.querySelector("[data-voice-status-title]");
  const detail = overlay.querySelector("[data-voice-status-detail]");
  const meta = overlay.querySelector("[data-voice-status-meta]");
  voiceInputRenderAttachMicIndicator(voice);
  overlay.hidden = !voiceInputRecordingVisible(voice);
  overlay.classList.toggle("voice-input-overlay-active", !overlay.hidden);
  overlay.classList.toggle("voice-input-status-panel-expanded", expanded);
  overlay.classList.toggle("voice-input-status-panel-debug", debug);
  overlay.classList.toggle("voice-input-overlay-busy", ["checking", "requesting", "preparing", "recording", "finalizing", "transcribing", "inserting"].includes(voice.status));
  overlay.classList.toggle("voice-input-overlay-recording", voice.status === "recording");
  overlay.classList.toggle("voice-input-overlay-error", voice.status === "failed");
  overlay.classList.toggle("voice-input-overlay-terminal", ["inserted", "cancelled", "no_speech", "failed"].includes(voice.status));
  if (title) title.textContent = voiceInputStatusLabel(voice.status);
  if (detail) detail.textContent = voiceInputStatusDetail(voice);
  if (meta) {
    const metaText = voiceInputStatusMeta(voice);
    meta.textContent = metaText;
    meta.hidden = !debug || !metaText;
  }
  overlay.setAttribute("aria-label", voiceInputStatusLabel(voice.status));
  overlay.setAttribute("title", [voiceInputStatusLabel(voice.status), voiceInputStatusDetail(voice)].filter(Boolean).join(" · "));
  refreshVoiceInputSendButton();
}

function closeVoiceInputOverlay() {
  const voice = ensureVoiceInputState();
  if (voice.embeddedFinalInsert?.timer) clearTimeout(voice.embeddedFinalInsert.timer);
  if (voice.maxTimer) clearTimeout(voice.maxTimer);
  if (voice.recordingTicker) clearInterval(voice.recordingTicker);
  voice.embeddedFinalInsert = null;
  voice.status = "idle";
  voice.error = "";
  voice.transcript = "";
  voice.voiceSessionId = "";
  voice.corrections = null;
  voice.target = null;
  voice.streaming = null;
  voice.panelVisible = false;
  voice.statusDetail = "";
  voice.statusUpdatedAt = 0;
  voice.nativeStatus = null;
  voice.partialCount = 0;
  voice.maxTimer = 0;
  voice.recordingTicker = 0;
  voiceInputResetProvisionalComposer();
  document.body?.classList?.remove("voice-input-press-active");
  renderVoiceInputOverlay();
}

function setVoiceInputStatus(status, fields = {}) {
  const voice = ensureVoiceInputState();
  if (voice.dismissedByUser && status !== "idle" && !fields.forceVisible) return;
  Object.assign(voice, fields, {
    status,
    panelVisible: status !== "idle" || Boolean(fields.panelVisible),
    statusUpdatedAt: Date.now(),
  });
  renderVoiceInputOverlay();
}

function voiceInputOpenStatusPanel(status = "pending", fields = {}) {
  const voice = ensureVoiceInputState();
  Object.assign(voice, fields, {
    dismissedByUser: false,
    panelVisible: true,
    status,
    statusUpdatedAt: Date.now(),
  });
  if (!voice.panelOpenedAt) voice.panelOpenedAt = Date.now();
  renderVoiceInputOverlay();
}

function voiceInputDismissStatusPanel() {
  const voice = ensureVoiceInputState();
  voice.dismissedByUser = true;
  voice.cancelRequested = true;
  if (voice.pressTimer) voiceInputClearPressTimer();
  if (voice.recorder && voice.recorder.state !== "inactive") {
    try {
      voice.recorder.stop();
    } catch (_) {}
  }
  voice.recorder = null;
  void voiceInputCancelStreamingSession();
  voiceInputClearRecordingStream();
  closeVoiceInputOverlay();
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
  document.addEventListener("touchstart", handleVoiceInputTouchStart, { capture: true, passive: false });
  document.addEventListener("touchend", handleVoiceInputTouchEnd, { capture: true, passive: false });
  document.addEventListener("touchcancel", handleVoiceInputTouchCancel, { capture: true, passive: false });
  document.addEventListener("click", suppressVoiceInputClickEvent, true);
  window.addEventListener("pagehide", () => {
    const voice = ensureVoiceInputState();
    if (voice.recorder && voice.recorder.state !== "inactive") {
      try {
        voice.recorder.stop();
      } catch (_) {}
    }
  });
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

function cancelVoiceInput() {
  const voice = ensureVoiceInputState();
  if (voice.nativeCapture?.active) {
    voiceInputStopNativeBridgeCapture("cancel");
    document.body?.classList?.remove("voice-input-press-active");
    return;
  }
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
  void voiceInputCancelStreamingSession();
  voiceInputClearRecordingStream();
  document.body?.classList?.remove("voice-input-press-active");
  setVoiceInputStatus("cancelled", { statusDetail: "录音已取消" });
}

async function voiceInputLoadStatus(options = {}) {
  const voice = ensureVoiceInputState();
  const force = Boolean(options.force);
  if (!force && voice.statusCache && Date.now() - Number(voice.statusCache.loadedAt || 0) < 300000) return voice.statusCache;
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

async function voiceInputStartStreamingSession(stream, serviceStatus) {
  const voice = ensureVoiceInputState();
  if (!stream || !voiceInputStreamingConfigured(serviceStatus)) return false;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return false;
  const sampleRate = voiceInputStreamingSampleRate(serviceStatus);
  const started = await api("/api/voice-input/stream/start", {
    method: "POST",
    body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
      sampleRate,
    })),
    timeoutMs: 15000,
  });
  if (!started?.voiceSessionId) return false;
  if (voice.cancelRequested || !["recording", "finalizing"].includes(voice.status)) {
    try {
      await api("/api/voice-input/stream/cancel", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
          voiceSessionId: started.voiceSessionId,
        })),
        timeoutMs: 8000,
      });
    } catch (_) {}
    return false;
  }
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  voice.streaming = {
    active: true,
    audioContext,
    buffer: [],
    bufferedSamples: 0,
    chunkInFlight: false,
    failed: false,
    processor,
    sampleRate,
    sequence: 0,
    source,
    voiceSessionId: started.voiceSessionId,
  };
  processor.onaudioprocess = (audioEvent) => {
    const current = ensureVoiceInputState();
    const streaming = current.streaming;
    if (!streaming?.active || streaming.failed) return;
    try {
      const output = audioEvent.outputBuffer?.getChannelData?.(0);
      if (output) output.fill(0);
      const input = audioEvent.inputBuffer?.getChannelData?.(0);
      if (!input?.length) return;
      const pcm = voiceInputDownsampleToPcm16(input, audioContext.sampleRate, streaming.sampleRate);
      if (!pcm.length) return;
      streaming.buffer.push(pcm);
      streaming.bufferedSamples = Math.max(0, Number(streaming.bufferedSamples || 0) + Math.floor(pcm.length / 2));
      voiceInputMaybeFlushStreamingChunks();
    } catch (err) {
      streaming.failed = true;
      console.warn("[voice-input] streaming capture failed", err?.message || err);
    }
  };
  source.connect(processor);
  processor.connect(audioContext.destination);
  return true;
}

function voiceInputTakeStreamingChunk(streaming) {
  if (!streaming?.buffer?.length) return null;
  const total = streaming.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!total) return null;
  const merged = new Uint8Array(total);
  let offset = 0;
  streaming.buffer.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  streaming.buffer = [];
  streaming.bufferedSamples = 0;
  return merged;
}

function voiceInputStreamingTargetSamples(streaming) {
  const sampleRate = Math.max(8000, Number(streaming?.sampleRate || 16000) || 16000);
  return Math.max(1600, Math.floor(sampleRate * VOICE_INPUT_STREAMING_CHUNK_TARGET_MS / 1000));
}

function voiceInputMaybeFlushStreamingChunks(options = {}) {
  const voice = ensureVoiceInputState();
  const streaming = voice.streaming;
  if (!streaming?.active || streaming.failed || streaming.chunkInFlight) return;
  if (!options.force && Number(streaming.bufferedSamples || 0) < voiceInputStreamingTargetSamples(streaming)) return;
  const chunk = voiceInputTakeStreamingChunk(streaming);
  if (!chunk?.length) return;
  streaming.chunkInFlight = true;
  const sequence = streaming.sequence + 1;
  streaming.sequence = sequence;
  api("/api/voice-input/stream/chunk", {
    method: "POST",
    body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
      voiceSessionId: streaming.voiceSessionId,
      audioBase64: voiceInputBytesToBase64(chunk),
      sampleRate: streaming.sampleRate,
      sequence,
    })),
    timeoutMs: 15000,
  }).then((result) => {
    if (result?.text) {
      voice.transcript = result.text;
      voice.corrections = result.corrections || null;
      voiceInputApplyProvisionalTranscript(result.text);
      renderVoiceInputOverlay();
    }
  }).catch((err) => {
    streaming.failed = true;
    console.warn("[voice-input] streaming chunk failed", err?.message || err);
  }).finally(() => {
    streaming.chunkInFlight = false;
    if (streaming.active && streaming.buffer?.length) voiceInputMaybeFlushStreamingChunks();
  });
}

async function voiceInputStopStreamingCapture() {
  const voice = ensureVoiceInputState();
  const streaming = voice.streaming;
  if (!streaming) return null;
  voice.streaming = null;
  streaming.active = false;
  try {
    streaming.processor?.disconnect?.();
  } catch (_) {}
  try {
    streaming.source?.disconnect?.();
  } catch (_) {}
  try {
    await streaming.audioContext?.close?.();
  } catch (_) {}
  return streaming;
}

async function voiceInputCancelStreamingSession() {
  const streaming = await voiceInputStopStreamingCapture();
  if (!streaming?.voiceSessionId) return;
  try {
    await api("/api/voice-input/stream/cancel", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
        voiceSessionId: streaming.voiceSessionId,
      })),
      timeoutMs: 8000,
    });
  } catch (_) {}
}

async function voiceInputFinishStreamingSession(durationMs) {
  const voice = ensureVoiceInputState();
  const streaming = await voiceInputStopStreamingCapture();
  if (!streaming?.voiceSessionId || streaming.failed) return null;
  let guard = 0;
  while (streaming.chunkInFlight && guard < 40) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    guard += 1;
  }
  const pending = voiceInputTakeStreamingChunk(streaming);
  if (pending?.length) {
    await api("/api/voice-input/stream/chunk", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
        voiceSessionId: streaming.voiceSessionId,
        audioBase64: voiceInputBytesToBase64(pending),
        sampleRate: streaming.sampleRate,
        sequence: streaming.sequence + 1,
      })),
      timeoutMs: 15000,
    });
  }
  return api("/api/voice-input/stream/final", {
    method: "POST",
    body: JSON.stringify(Object.assign({}, voiceInputRequestScope(), {
      voiceSessionId: streaming.voiceSessionId,
      durationMs,
      sampleRate: streaming.sampleRate,
    })),
    timeoutMs: 90000,
  });
}

function handleVoiceInputStopButtonPointerDown(event, button) {
  const voice = ensureVoiceInputState();
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  voiceInputClearPressTimer();
  voice.pointerId = event.pointerId;
  voice.pointerButton = button;
  voice.pointerComposer = null;
  voice.stopButtonPressActive = true;
  voice.stopButtonLongPressTriggered = false;
  voice.suppressNextClick = true;
  voice.suppressClickButton = button;
  scheduleVoiceInputClickSuppressionClear();
  voiceInputClearSelection();
  document.body?.classList?.add("voice-input-press-active");
  if (voiceInputStatusPanelExpanded()) {
    voiceInputOpenStatusPanel("pending", { statusDetail: "按住 Stop 进入语音输入" });
  }
  try {
    button?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pressTimer = setTimeout(() => {
    voice.pressTimer = 0;
    voice.stopButtonLongPressTriggered = true;
    voice.suppressNextClick = true;
    voice.suppressClickButton = button;
    scheduleVoiceInputClickSuppressionClear();
    voiceInputClearSelection();
    void startVoiceInputRecording(event, {
      target: {
        kind: "native",
        composer: voiceInputMainComposerDefinition(),
        button,
        allowStopMode: true,
      },
    });
  }, VOICE_INPUT_LONG_PRESS_MS);
}

function endVoiceInputStopButtonPress(event, options = {}) {
  const voice = ensureVoiceInputState();
  const longPress = Boolean(voice.stopButtonLongPressTriggered);
  const button = voice.pointerButton || event?.target?.closest?.("button") || voice.suppressClickButton || null;
  if (voice.pressTimer) voiceInputClearPressTimer();
  if (options.pointerId) {
    try {
      voice.pointerButton?.releasePointerCapture?.(options.pointerId);
    } catch (_) {}
  }
  voice.pointerId = 0;
  voice.pointerButton = null;
  voice.pointerComposer = null;
  voice.stopButtonPressActive = false;
  voice.stopButtonLongPressTriggered = false;
  document.body?.classList?.remove("voice-input-press-active");
  voice.suppressNextClick = true;
  voice.suppressClickButton = button;
  scheduleVoiceInputClickSuppressionClear();
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  voiceInputClearSelection();
  if (longPress && ["checking", "requesting", "preparing", "recording", "finalizing"].includes(voice.status)) {
    stopVoiceInputRecording();
    return;
  }
  if (!longPress && typeof sendMessage === "function") {
    void sendMessage(event);
  }
}

async function startVoiceInputRecording(event, options = {}) {
  const voice = ensureVoiceInputState();
  const target = options.target || { kind: "native" };
  if (target.kind === "native") {
    target.composer = voiceInputFreshNativeComposer(target.composer) || voiceInputMainComposerDefinition();
  }
  const targetAvailable = target.kind === "embedded-plugin"
    ? voiceInputEmbeddedComposerAvailable(target.def)
    : voiceInputNativeComposerAvailable(target.composer || voiceInputMainComposerDefinition(), {
      allowStopMode: Boolean(target.allowStopMode),
    });
  if (!targetAvailable) {
    const reason = target.kind === "embedded-plugin"
      ? "当前插件输入框不可写"
      : voiceInputComposerUnavailableMessage(voiceInputNativeComposerUnavailableReason(target.composer || voiceInputMainComposerDefinition(), {
        allowStopMode: Boolean(target.allowStopMode),
      }));
    setVoiceInputStatus("failed", { error: reason });
    return;
  }
  voice.target = target;
  if (target.kind === "native" && !target.button) target.button = target.composer?.button || $("sendMessage");
  voice.dismissedByUser = false;
  voice.suppressNextClick = target.kind === "native";
  voice.suppressClickButton = target.kind === "native" ? target.button : null;
  if (voice.suppressNextClick) scheduleVoiceInputClickSuppressionClear();
  voice.cancelRequested = false;
  voice.pendingStopAfterStart = false;
  voice.chunks = [];
  voiceInputResetProvisionalComposer();
  event?.preventDefault?.();
  setVoiceInputStatus("checking", { statusDetail: "检查本地 ASR 与权限状态" });
  if (voiceInputStartNativeBridgeCapture(target)) return;
  try {
    const permissionStatePromise = voiceInputMicrophonePermissionState();
    const serviceStatus = await voiceInputLoadStatus();
    if (voice.cancelRequested) {
      setVoiceInputStatus("cancelled", { statusDetail: "录音已取消" });
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
    setVoiceInputStatus(permissionState === "granted" ? "preparing" : "requesting", {
      statusDetail: permissionState === "granted" ? "打开本地麦克风" : "等待系统麦克风权限",
    });
    const stream = await voiceInputAcquireMicrophoneStream({ userGesture: true });
    if (voice.cancelRequested) {
      voiceInputClearRecordingStream();
      setVoiceInputStatus("cancelled", { statusDetail: "录音已取消" });
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
    setVoiceInputStatus("recording", { recordingStartedAt: voice.recordingStartedAt, statusDetail: "" });
    if (voiceInputStreamingConfigured(serviceStatus)) {
      voiceInputStartStreamingSession(stream, serviceStatus).catch((streamErr) => {
        const current = ensureVoiceInputState();
        current.streaming = Object.assign({}, current.streaming || {}, { failed: true });
        console.warn("[voice-input] streaming start failed", streamErr?.message || streamErr);
      });
    }
    voice.recordingTicker = setInterval(renderVoiceInputOverlay, 500);
    const maxDurationMs = Math.max(1000, Number(serviceStatus?.limits?.maxDurationMs || 30000) || 30000);
    voice.maxTimer = setTimeout(() => stopVoiceInputRecording(), maxDurationMs);
    if (voice.pendingStopAfterStart) setTimeout(() => stopVoiceInputRecording(), 120);
  } catch (err) {
    voiceInputClearRecordingStream({ releaseHold: ["NotAllowedError", "SecurityError"].includes(String(err?.name || "")) });
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
  if (voice.nativeCapture?.active) {
    voiceInputStopNativeBridgeCapture("stop");
    return;
  }
  if (voice.status === "checking" || voice.status === "requesting" || voice.status === "preparing") {
    voice.cancelRequested = true;
    voice.pendingStopAfterStart = false;
    setVoiceInputStatus("cancelled", { statusDetail: "麦克风尚未开始录音" });
    return;
  }
  if (voice.recorder && voice.recorder.state !== "inactive") {
    setVoiceInputStatus("finalizing");
    try {
      voice.recorder.stop();
    } catch (err) {
      voiceInputClearRecordingStream();
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
    voiceInputClearRecordingStream();
    setVoiceInputStatus("cancelled", { statusDetail: "录音已取消" });
    return;
  }
  if (voice.maxTimer) clearTimeout(voice.maxTimer);
  voice.maxTimer = 0;
  if (voice.recordingTicker) clearInterval(voice.recordingTicker);
  voice.recordingTicker = 0;
  let streamingResult = null;
  try {
    streamingResult = await voiceInputFinishStreamingSession(durationMs);
  } catch (streamErr) {
    console.warn("[voice-input] streaming final failed; falling back to full clip", streamErr?.message || streamErr);
  }
  voiceInputClearRecordingStream();
  const chunks = voice.chunks || [];
  voice.chunks = [];
  if (!chunks.length || durationMs < VOICE_INPUT_MIN_CLIENT_DURATION_MS) {
    setVoiceInputStatus("no_speech", { statusDetail: "录音太短或没有音频片段" });
    return;
  }
  try {
    setVoiceInputStatus("transcribing", { statusDetail: "等待 ASR 返回" });
    if (streamingResult?.text) {
      if (typeof voiceLearningHandleTranscribeResult === "function") {
        voiceLearningHandleTranscribeResult(streamingResult);
      }
      setVoiceInputStatus("inserting", {
        transcript: streamingResult.text || "",
        voiceSessionId: streamingResult.voiceSessionId || "",
        corrections: streamingResult.corrections || null,
        error: "",
      });
      await insertVoiceInputTranscript("append");
      return;
    }
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

function failEmbeddedVoiceInputFinalInsert(message = "语音已转写，但插件输入框暂时未接收，请重试") {
  const voice = ensureVoiceInputState();
  if (voice.embeddedFinalInsert?.timer) clearTimeout(voice.embeddedFinalInsert.timer);
  voice.embeddedFinalInsert = null;
  setVoiceInputStatus("failed", { error: message });
}

function retryEmbeddedVoiceInputFinalInsert() {
  const voice = ensureVoiceInputState();
  const pending = voice.embeddedFinalInsert;
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  if (pending.attempts >= VOICE_INPUT_EMBEDDED_INSERT_MAX_ATTEMPTS) {
    failEmbeddedVoiceInputFinalInsert();
    return;
  }
  if (typeof requestEmbeddedPluginVoiceInputCapability === "function") {
    requestEmbeddedPluginVoiceInputCapability(pending.def);
  }
  pending.timer = setTimeout(() => {
    pending.timer = 0;
    sendEmbeddedVoiceInputFinalInsert(pending);
  }, pending.attempts ? 650 : 250);
}

function sendEmbeddedVoiceInputFinalInsert(pending) {
  const voice = ensureVoiceInputState();
  if (!pending) return false;
  pending.attempts = Number(pending.attempts || 0) + 1;
  voice.embeddedFinalInsert = pending;
  const ok = typeof sendEmbeddedPluginVoiceInputAction === "function" && sendEmbeddedPluginVoiceInputAction(pending.action, {
    action: pending.action,
    requestId: pending.requestId,
    text: pending.text,
    voiceSessionId: pending.voiceSessionId || "",
    composerId: pending.composerId || "default",
  }, pending.def);
  if (!ok) {
    retryEmbeddedVoiceInputFinalInsert();
    return false;
  }
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pending.timer = 0;
    retryEmbeddedVoiceInputFinalInsert();
  }, 1200);
  setVoiceInputStatus("inserting", { transcript: pending.text, error: "" });
  return true;
}

function handleVoiceInputEmbeddedInsertResult(def, payload = {}) {
  const action = String(payload.action || payload.insertAction || payload.insert_action || "").trim();
  if (action === "provisional_text") return true;
  const voice = ensureVoiceInputState();
  const pending = voice.embeddedFinalInsert;
  if (!pending) return false;
  const requestId = String(payload.requestId || payload.request_id || "").trim();
  if (requestId && requestId !== pending.requestId) return false;
  if (def?.id && pending.def?.id && def.id !== pending.def.id) return false;
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = 0;
  if (payload.ok === false) {
    retryEmbeddedVoiceInputFinalInsert();
    return true;
  }
  voice.embeddedFinalInsert = null;
  setVoiceInputStatus("inserted", { transcript: pending.text, error: "" });
  return true;
}

async function insertVoiceInputTranscript(mode = "append") {
  const voice = ensureVoiceInputState();
  const text = String(voice.transcript || "").trim();
  if (!text) {
    setVoiceInputStatus("no_speech", { statusDetail: "没有可写入的转写文本" });
    return;
  }
  setVoiceInputStatus("inserting");
  if (voice.target?.kind === "embedded-plugin") {
    const action = mode === "replace" ? "replace_draft" : "append_text";
    const pending = {
      requestId: voiceInputRequestId("voice_insert"),
      action,
      text,
      voiceSessionId: voice.voiceSessionId || "",
      composerId: voice.target.composerId || "default",
      def: voice.target.def,
      attempts: 0,
      timer: 0,
    };
    sendEmbeddedVoiceInputFinalInsert(pending);
    return;
  }
  const composer = voiceInputFreshNativeComposer(voice.target?.composer) || voiceInputMainComposerDefinition();
  const unavailableReason = voiceInputNativeComposerUnavailableReason(composer, { allowStopMode: Boolean(voice.target?.allowStopMode) });
  if (unavailableReason) {
    setVoiceInputStatus("failed", { error: voiceInputComposerUnavailableMessage(unavailableReason) });
    return;
  }
  if (voice.provisionalText && !voice.provisionalLocked && voice.provisionalBaseText != null) {
    composer.setText?.(voice.provisionalBaseText);
    composer.setCaret?.(voice.provisionalCaret ?? voice.provisionalBaseText.length);
  }
  const next = voiceInputInsertedTextForComposer(composer, mode, text);
  composer.setText?.(next);
  const caret = mode === "replace" ? next.length : next.indexOf(text) + text.length;
  composer.setCaret?.(caret);
  composer.focus?.();
  trackPendingVoiceInputCommit(text);
  voiceInputResetProvisionalComposer();
  setVoiceInputStatus("inserted", { transcript: text });
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

function beginVoiceInputPressGesture(event, button, composer, options = {}) {
  const voice = ensureVoiceInputState();
  const allowStopMode = Boolean(options.allowStopMode || voiceInputShouldAllowStopModeForPress(button, composer));
  voiceInputClearPressTimer();
  voice.pointerButton = button;
  voice.pointerComposer = composer;
  voice.suppressNextClick = false;
  voice.suppressClickButton = null;
  voiceInputClearSelection();
  document.body?.classList?.add("voice-input-press-active");
  if (voiceInputStatusPanelExpanded()) {
    voiceInputOpenStatusPanel("pending", { statusDetail: "等待长按阈值" });
  }
  voiceInputPrewarmStatus();
  if (options.pointerId) {
    voice.pointerId = options.pointerId;
    try {
      button?.setPointerCapture?.(options.pointerId);
    } catch (_) {}
  } else {
    voice.pointerId = 0;
  }
  voice.pressTimer = setTimeout(() => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    voiceInputClearSelection();
    voice.pressTimer = 0;
    void startVoiceInputRecording(event, { target: { kind: "native", composer, button, allowStopMode } });
  }, VOICE_INPUT_LONG_PRESS_MS);
}

function endVoiceInputPressGesture(event, options = {}) {
  const voice = ensureVoiceInputState();
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
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (options.stopImmediate !== false) event?.stopImmediatePropagation?.();
    stopVoiceInputRecording();
  }
}

function handleVoiceInputPointerDown(event) {
  const voice = ensureVoiceInputState();
  if (voice.touchFallbackActive) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const button = event.target?.closest?.("button");
  if (button?.id === "sendMessage" && isComposerStopMode()) {
    handleVoiceInputStopButtonPointerDown(event, button);
    return;
  }
  const composer = voiceInputComposerForButton(button);
  const allowStopMode = voiceInputShouldAllowStopModeForPress(button, composer);
  if (!voiceInputNativeComposerAvailable(composer, { allowStopMode })) return;
  beginVoiceInputPressGesture(event, button, composer, { pointerId: event.pointerId, allowStopMode });
}

function handleVoiceInputPointerUp(event) {
  const voice = ensureVoiceInputState();
  if (voice.touchFallbackActive) return;
  if (voice.pointerId && event.pointerId !== voice.pointerId) return;
  if (voice.stopButtonPressActive || (voice.pointerButton?.id === "sendMessage" && isComposerStopMode())) {
    endVoiceInputStopButtonPress(event, { pointerId: event.pointerId });
    return;
  }
  try {
    voice.pointerButton?.releasePointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pointerId = 0;
  endVoiceInputPressGesture(event, { stopImmediate: false });
}

function handleVoiceInputPointerCancel(event) {
  const voice = ensureVoiceInputState();
  if (voice.pointerId && event?.pointerId && event.pointerId !== voice.pointerId) return;
  voice.pointerId = 0;
  voice.pointerButton = null;
  voice.pointerComposer = null;
  voice.stopButtonPressActive = false;
  voice.stopButtonLongPressTriggered = false;
  if (voice.pressTimer) {
    voiceInputClearPressTimer();
    setVoiceInputStatus("cancelled", { statusDetail: "语音手势已取消" });
    return;
  }
  if (voice.suppressNextClick && voice.suppressClickButton) {
    document.body?.classList?.remove("voice-input-press-active");
  }
  if (["checking", "requesting", "preparing", "recording", "finalizing"].includes(voice.status)) cancelVoiceInput();
}

function handleVoiceInputTouchStart(event) {
  const voice = ensureVoiceInputState();
  if (event.touches && event.touches.length !== 1) return;
  const button = event.target?.closest?.("button");
  if (button?.id === "sendMessage" && isComposerStopMode()) {
    voice.touchFallbackActive = true;
    handleVoiceInputStopButtonPointerDown(event, button);
    return;
  }
  const composer = voiceInputComposerForButton(button);
  const allowStopMode = voiceInputShouldAllowStopModeForPress(button, composer);
  if (!voiceInputNativeComposerAvailable(composer, { allowStopMode })) return;
  voice.touchFallbackActive = true;
  beginVoiceInputPressGesture(event, button, composer, { allowStopMode });
}

function handleVoiceInputTouchEnd(event) {
  const voice = ensureVoiceInputState();
  if (!voice.touchFallbackActive) return;
  voice.touchFallbackActive = false;
  if (voice.stopButtonPressActive || (voice.pointerButton?.id === "sendMessage" && isComposerStopMode())) {
    endVoiceInputStopButtonPress(event);
    return;
  }
  endVoiceInputPressGesture(event);
}

function handleVoiceInputTouchCancel(event) {
  const voice = ensureVoiceInputState();
  if (!voice.touchFallbackActive) return;
  voice.touchFallbackActive = false;
  handleVoiceInputPointerCancel(event);
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
  const suppressed = suppressVoiceInputClickEvent(event);
  if (!suppressed) voiceInputDismissStatusPanel();
  return suppressed;
}

function dismissVoiceInputStatusPanelFromComposer(event) {
  if (!voiceInputRecordingVisible()) return;
  if (!event?.target?.closest?.("#messageInput, textarea, input, [contenteditable='true']")) return;
  if (event.target?.closest?.("#voiceInputOverlay")) return;
  voiceInputDismissStatusPanel();
}

function bindVoiceInputStatusPanelDismissGuards() {
  if (document.__homeAiVoiceInputStatusDismissBound) return;
  document.__homeAiVoiceInputStatusDismissBound = true;
  document.addEventListener("pointerdown", dismissVoiceInputStatusPanelFromComposer, true);
  document.addEventListener("touchstart", dismissVoiceInputStatusPanelFromComposer, { capture: true, passive: true });
}

function voiceInputNormalizeNativeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  const map = {
    started: "recording",
    start: "recording",
    recording: "recording",
    permission: "requesting",
    requesting: "requesting",
    preparing: "preparing",
    uploading: "finalizing",
    finalizing: "finalizing",
    transcribing: "transcribing",
    partial: "transcribing",
    final: "inserting",
    inserting: "inserting",
    inserted: "inserted",
    failed: "failed",
    error: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };
  return map[normalized] || normalized || "pending";
}

function updateVoiceInputFromNative(payload = {}, fallbackStatus = "pending") {
  const voice = ensureVoiceInputState();
  const requestId = String(payload.requestId || "").trim();
  if (requestId && voice.nativeRequestId && requestId !== voice.nativeRequestId) return;
  const status = voiceInputNormalizeNativeStatus(payload.status || payload.state || fallbackStatus);
  voice.nativeStatus = Object.assign({}, payload, { source: "native-shell" });
  if (voice.nativeCapture?.active && ["recording", "transcribing", "finalizing", "inserting"].includes(status)) {
    voice.nativeCapture.started = true;
  }
  voice.partialCount = Number(voice.partialCount || 0) + (status === "transcribing" && payload.text ? 1 : 0);
  setVoiceInputStatus(status, {
    panelVisible: true,
    statusDetail: String(payload.detail || payload.message || "").slice(0, 120),
    error: status === "failed" ? String(payload.error || payload.message || "原生语音输入失败").slice(0, 180) : "",
    transcript: payload.text ? String(payload.text) : voice.transcript,
    voiceSessionId: String(payload.voiceSessionId || payload.voice_session_id || voice.voiceSessionId || "").slice(0, 160),
    corrections: payload.corrections || voice.corrections || null,
  });
}

function initializeNativeVoiceInputBridge() {
  const existing = window.HomeAINativeVoiceInput && typeof window.HomeAINativeVoiceInput === "object"
    ? window.HomeAINativeVoiceInput
    : {};
  window.HomeAINativeVoiceInput = Object.assign(existing, {
    capabilityResult(payload = {}) {
      updateVoiceInputFromNative(payload, payload.available === false ? "failed" : "pending");
      return true;
    },
    started(payload = {}) {
      updateVoiceInputFromNative(payload, "recording");
      return true;
    },
    status(payload = {}) {
      updateVoiceInputFromNative(payload, payload.status || "pending");
      return true;
    },
    partial(payload = {}) {
      updateVoiceInputFromNative(Object.assign({}, payload, { status: "partial" }), "transcribing");
      return true;
    },
    async final(payload = {}) {
      updateVoiceInputFromNative(Object.assign({}, payload, { status: "final" }), "inserting");
      const voice = ensureVoiceInputState();
      if (!voice.target) {
        voice.target = { kind: "native", composer: voiceInputMainComposerDefinition(), button: $("sendMessage") };
      }
      if (payload.text) await insertVoiceInputTranscript(String(payload.mode || "append") === "replace" ? "replace" : "append");
      voice.nativeCapture = null;
      return true;
    },
    failed(payload = {}) {
      updateVoiceInputFromNative(Object.assign({}, payload, { status: "failed" }), "failed");
      ensureVoiceInputState().nativeCapture = null;
      return true;
    },
    cancelled(payload = {}) {
      updateVoiceInputFromNative(Object.assign({}, payload, { status: "cancelled" }), "cancelled");
      ensureVoiceInputState().nativeCapture = null;
      return true;
    },
  });
}

function initializeVoiceInputUi() {
  bindVoiceInputPressSelectionGuards();
  bindVoiceInputStatusPanelDismissGuards();
  initializeNativeVoiceInputBridge();
  refreshVoiceInputSendButton();
}
