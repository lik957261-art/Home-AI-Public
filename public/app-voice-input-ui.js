"use strict";

const VOICE_INPUT_LONG_PRESS_MS = 560;
const VOICE_INPUT_MIN_CLIENT_DURATION_MS = 300;
const VOICE_INPUT_PRESS_EVENTS_BOUND = "__homeAiVoiceInputPressEventsBound";

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

function voiceInputNativeComposerAvailable() {
  const composer = $("composer");
  const input = $("messageInput");
  const button = $("sendMessage");
  if (!composer || !input || !button) return false;
  const composerDisplay = window.getComputedStyle?.(composer)?.display || "";
  if (composerDisplay === "none") return false;
  if (button.disabled && !isComposerStopMode()) return false;
  if (input.disabled || input.readOnly) return false;
  if (isChatSearchMode() || isComposerStopMode()) return false;
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
    surfaceType: state.viewMode === "tasks" ? "topic_chat" : "chat",
    pluginId: "",
    threadId: state.currentThreadId || "",
    composerId: "home-ai-native",
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

function refreshVoiceInputSendButton() {
  const voice = ensureVoiceInputState();
  const button = $("sendMessage");
  if (!button) return;
  const active = ["pending", "checking", "requesting", "recording", "finalizing", "transcribing"].includes(voice.status);
  document.body?.classList?.toggle("voice-input-press-active", active || Boolean(voice.pressTimer));
  button.classList.toggle("voice-input-gesture", true);
  button.classList.toggle("voice-input-pending", voice.status === "pending" || voice.status === "checking" || voice.status === "requesting");
  button.classList.toggle("voice-input-recording", voice.status === "recording");
  button.classList.toggle("voice-input-busy", voice.status === "finalizing" || voice.status === "transcribing");
  if (!active) {
    button.textContent = isChatSearchMode() ? "搜索" : (isComposerStopMode() ? "Stop" : "Send");
    button.setAttribute("title", voiceInputNativeComposerAvailable() ? "按住录音，松开转写" : "Send");
    button.setAttribute("aria-label", voiceInputNativeComposerAvailable() ? "发送。按住可语音输入" : "Send");
    return;
  }
  if (voice.status === "recording") {
    const elapsed = Date.now() - Number(voice.recordingStartedAt || Date.now());
    button.textContent = voiceInputFormatDuration(elapsed);
    button.setAttribute("aria-label", "正在录音，松开后转写");
    button.setAttribute("title", "松开后转写");
    return;
  }
  button.textContent = voice.status === "transcribing" ? "转写" : "语音";
  button.setAttribute("aria-label", voiceInputStatusLabel(voice.status));
  button.setAttribute("title", voiceInputStatusLabel(voice.status));
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
      <div class="voice-input-title" data-voice-status></div>
      <button type="button" class="secondary-small voice-input-cancel" data-voice-action="cancel">取消</button>
    </div>
    <textarea class="voice-input-transcript" data-voice-transcript rows="4" aria-label="语音转写文本"></textarea>
    <div class="voice-input-corrections" data-voice-corrections hidden></div>
    <div class="voice-input-actions">
      <button type="button" class="secondary-small" data-voice-action="discard">丢弃</button>
      <button type="button" class="secondary-small" data-voice-action="replace">替换</button>
      <button type="button" class="primary-small" data-voice-action="append">插入</button>
    </div>
  `;
  overlay.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-voice-action]")?.dataset?.voiceAction || "";
    if (!action) return;
    event.preventDefault();
    if (action === "cancel") cancelVoiceInput();
    if (action === "discard") closeVoiceInputOverlay();
    if (action === "append") void insertVoiceInputTranscript("append");
    if (action === "replace") void insertVoiceInputTranscript("replace");
  });
  document.body.appendChild(overlay);
  return overlay;
}

function renderVoiceInputOverlay() {
  const voice = ensureVoiceInputState();
  const overlay = ensureVoiceInputOverlay();
  const status = overlay.querySelector("[data-voice-status]");
  const transcript = overlay.querySelector("[data-voice-transcript]");
  const corrections = overlay.querySelector("[data-voice-corrections]");
  const actionButtons = overlay.querySelector(".voice-input-actions");
  overlay.hidden = voice.status === "idle";
  overlay.classList.toggle("voice-input-overlay-active", !overlay.hidden);
  overlay.classList.toggle("voice-input-overlay-busy", ["checking", "requesting", "recording", "finalizing", "transcribing", "inserting"].includes(voice.status));
  overlay.classList.toggle("voice-input-overlay-error", voice.status === "failed");
  if (status) {
    const detail = voice.error || voiceInputStatusLabel(voice.status);
    status.textContent = voice.status === "recording"
      ? `${voiceInputStatusLabel(voice.status)} ${voiceInputFormatDuration(Date.now() - Number(voice.recordingStartedAt || Date.now()))}`
      : detail;
  }
  if (transcript) {
    transcript.hidden = !["ready", "inserted"].includes(voice.status) && !(voice.status === "failed" && Boolean(voice.transcript));
    transcript.disabled = voice.status !== "ready";
    if (voice.renderedTranscript !== voice.transcript) {
      transcript.value = voice.transcript || "";
      voice.renderedTranscript = voice.transcript || "";
    }
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
  if (actionButtons) actionButtons.hidden = voice.status !== "ready";
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
  if (!["pending", "checking", "requesting", "recording", "finalizing", "transcribing"].includes(voice.status)) {
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
  return Boolean(voice.pressTimer || ["pending", "checking", "requesting", "recording", "finalizing", "transcribing"].includes(voice.status));
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
}

function scheduleVoiceInputClickSuppressionClear() {
  const voice = ensureVoiceInputState();
  if (voice.suppressClickTimer) clearTimeout(voice.suppressClickTimer);
  voice.suppressClickTimer = setTimeout(() => {
    voice.suppressClickTimer = 0;
    voice.suppressNextClick = false;
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
  if (voice.statusCache && Date.now() - Number(voice.statusCache.loadedAt || 0) < 30000) return voice.statusCache;
  const payload = await api(`/api/voice-input/status?workspaceId=${encodeURIComponent(state.selectedWorkspaceId || "owner")}`, {
    method: "GET",
    timeoutMs: 15000,
  });
  voice.statusCache = Object.assign({ loadedAt: Date.now() }, payload || {});
  return voice.statusCache;
}

async function startVoiceInputRecording(event, options = {}) {
  const voice = ensureVoiceInputState();
  const target = options.target || { kind: "native" };
  const targetAvailable = target.kind === "embedded-plugin"
    ? voiceInputEmbeddedComposerAvailable(target.def)
    : voiceInputNativeComposerAvailable();
  if (!targetAvailable) {
    setVoiceInputStatus("failed", { error: "当前输入框不可写" });
    return;
  }
  voice.target = target;
  voice.suppressNextClick = target.kind === "native";
  if (voice.suppressNextClick) scheduleVoiceInputClickSuppressionClear();
  voice.cancelRequested = false;
  voice.pendingStopAfterStart = false;
  voice.chunks = [];
  event?.preventDefault?.();
  setVoiceInputStatus("checking");
  try {
    const serviceStatus = await voiceInputLoadStatus();
    if (!serviceStatus?.enabled) {
      setVoiceInputStatus("failed", { error: "语音转写服务未配置" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceInputStatus("failed", { error: "当前浏览器不支持录音" });
      return;
    }
    setVoiceInputStatus("requesting");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    setVoiceInputStatus("failed", { error: err?.message || "无法启动录音" });
  }
}

function stopVoiceInputRecording() {
  const voice = ensureVoiceInputState();
  voiceInputClearPressTimer();
  if (voice.maxTimer) clearTimeout(voice.maxTimer);
  voice.maxTimer = 0;
  if (voice.recordingTicker) clearInterval(voice.recordingTicker);
  voice.recordingTicker = 0;
  if (voice.status === "checking" || voice.status === "requesting") {
    voice.pendingStopAfterStart = true;
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
    setVoiceInputStatus("failed", { error: "录音时间太短" });
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
        durationMs,
        mimeType: blob.type || voice.mimeType || "audio/webm",
      })),
      timeoutMs: 90000,
    });
    setVoiceInputStatus("ready", {
      transcript: result?.text || "",
      voiceSessionId: result?.voiceSessionId || "",
      corrections: result?.corrections || null,
      error: "",
    });
    const overlay = ensureVoiceInputOverlay();
    overlay.querySelector("[data-voice-transcript]")?.focus();
  } catch (err) {
    setVoiceInputStatus("failed", { error: err?.message || "转写失败" });
  }
}

function voiceInputInsertedText(mode, text) {
  const current = getComposerText();
  if (mode === "replace" || !current) return text;
  const caret = composerCaretOffset();
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

async function insertVoiceInputTranscript(mode = "append") {
  const voice = ensureVoiceInputState();
  const overlay = ensureVoiceInputOverlay();
  const textarea = overlay.querySelector("[data-voice-transcript]");
  const text = String(textarea?.value || voice.transcript || "").trim();
  if (!text) {
    setVoiceInputStatus("failed", { error: "没有可插入的转写文本" });
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
  const next = voiceInputInsertedText(mode, text);
  setComposerText(next);
  const caret = mode === "replace" ? next.length : next.indexOf(text) + text.length;
  setComposerCaretOffset(caret);
  $("messageInput")?.focus();
  await commitVoiceInputSession(text);
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
  if (!voiceInputNativeComposerAvailable()) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  voiceInputClearPressTimer();
  voice.pointerId = event.pointerId;
  voice.suppressNextClick = false;
  voiceInputClearSelection();
  document.body?.classList?.add("voice-input-press-active");
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pressTimer = setTimeout(() => {
    event.preventDefault?.();
    event.stopPropagation?.();
    voiceInputClearSelection();
    voice.pressTimer = 0;
    void startVoiceInputRecording(event);
  }, VOICE_INPUT_LONG_PRESS_MS);
}

function handleVoiceInputPointerUp(event) {
  const voice = ensureVoiceInputState();
  if (voice.pointerId && event.pointerId !== voice.pointerId) return;
  try {
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
  } catch (_) {}
  voice.pointerId = 0;
  if (voice.pressTimer) {
    voiceInputClearPressTimer();
    return;
  }
  if (["checking", "requesting", "recording", "finalizing"].includes(voice.status)) {
    event.preventDefault();
    event.stopPropagation();
    stopVoiceInputRecording();
  }
}

function handleVoiceInputPointerCancel() {
  const voice = ensureVoiceInputState();
  if (voice.pressTimer) {
    voiceInputClearPressTimer();
    closeVoiceInputOverlay();
    return;
  }
  if (["checking", "requesting", "recording", "finalizing"].includes(voice.status)) cancelVoiceInput();
}

function suppressVoiceInputTextSelection(event) {
  const voice = ensureVoiceInputState();
  if (event.target?.closest?.("[data-voice-transcript]")) return;
  if (event.currentTarget?.id === "sendMessage" || voice.status !== "idle" || voice.pressTimer) {
    event.preventDefault?.();
    event.stopPropagation?.();
    voiceInputClearSelection();
  }
}

function handleVoiceInputSendClick(event) {
  const voice = ensureVoiceInputState();
  if (!voice.suppressNextClick) return false;
  voice.suppressNextClick = false;
  if (voice.suppressClickTimer) clearTimeout(voice.suppressClickTimer);
  voice.suppressClickTimer = 0;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  return true;
}

function initializeVoiceInputUi() {
  const button = $("sendMessage");
  if (!button || button.dataset.voiceInputBound === "1") return;
  button.dataset.voiceInputBound = "1";
  bindVoiceInputPressSelectionGuards();
  button.addEventListener("pointerdown", handleVoiceInputPointerDown);
  button.addEventListener("pointerup", handleVoiceInputPointerUp);
  button.addEventListener("pointercancel", handleVoiceInputPointerCancel);
  button.addEventListener("selectstart", suppressVoiceInputTextSelection);
  button.addEventListener("dragstart", suppressVoiceInputTextSelection);
  button.addEventListener("touchstart", () => voiceInputClearSelection(), { passive: true });
  button.addEventListener("contextmenu", (event) => {
    const voice = ensureVoiceInputState();
    if (voiceInputNativeComposerAvailable() || voice.status !== "idle" || voice.pressTimer) suppressVoiceInputTextSelection(event);
  });
  refreshVoiceInputSendButton();
}
