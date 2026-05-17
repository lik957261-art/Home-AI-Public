"use strict";

function kanbanReadingMediaRecorderApi() {
  if (typeof window !== "undefined" && typeof window.MediaRecorder === "function") return window.MediaRecorder;
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder === "function") return MediaRecorder;
  return null;
}

function supportsKanbanReadingRecorder() {
  return Boolean(
    kanbanReadingMediaRecorderApi()
    && typeof navigator !== "undefined"
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function preferredKanbanReadingRecorderMimeType() {
  const Recorder = kanbanReadingMediaRecorderApi();
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
  return candidates.find((mime) => {
    try {
      return Recorder.isTypeSupported(mime);
    } catch (_) {
      return false;
    }
  }) || "";
}

function kanbanReadingRecordingExtension(mime = "") {
  const value = String(mime || "").toLowerCase();
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("wav")) return "wav";
  if (value.includes("ogg") || value.includes("opus")) return "ogg";
  return "webm";
}

function kanbanReadingRecordingFile(todoId, blob, mime = "") {
  const extension = kanbanReadingRecordingExtension(mime);
  const safeId = String(todoId || "card").replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || "card";
  const filename = `reading-recording-${safeId}-${Date.now()}.${extension}`;
  try {
    if (typeof File === "function") return new File([blob], filename, { type: mime || blob.type || "audio/webm" });
  } catch (_) {
    // Older WebViews can expose Blob without a usable File constructor.
  }
  blob.name = filename;
  blob.lastModified = Date.now();
  return blob;
}

function kanbanReadingRecordingDuration(recording = {}) {
  const stored = Number(recording.elapsedMs || 0) || 0;
  if (recording.status === "recording" && recording.startedAt) {
    return Math.max(0, stored + Date.now() - Number(recording.startedAt || 0));
  }
  return Math.max(0, stored);
}

function formatKanbanReadingRecordingDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function kanbanReadingRecordingPermissionMessage(err) {
  const name = String(err?.name || "");
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return "麦克风权限未开启，请允许权限后重试。";
  if (["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"].includes(name)) return "未找到可用麦克风，请检查设备后重试。";
  return "无法开始录音，请检查浏览器权限后重试。";
}

function kanbanReadingRecordingStatusText(todoId) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const duration = formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recording));
  if (recording.status === "requesting") return "正在请求麦克风权限...";
  if (recording.status === "recording") return `正在录音 ${duration}`;
  if (recording.status === "stopping") return "正在生成录音...";
  if (recording.status === "ready") return `已录好待提交 ${duration}`;
  if (recording.status === "unsupported") return "当前浏览器不支持直接录音。";
  if (recording.status === "error") return recording.error || "录音不可用，请重试。";
  return supportsKanbanReadingRecorder() ? "点击红色录音按钮开始。" : "当前浏览器不支持直接录音。";
}

function renderKanbanReadingRecorderControls(todo, submitting = false) {
  return LearningReadingUi.renderKanbanReadingRecorderControls(todo, learningReadingUiOptions({ submitting }));
}

function revokeKanbanReadingRecordingUrl(recording = {}) {
  if (!recording?.url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(recording.url);
  } catch (_) {
    // Object URL cleanup should not block recorder state changes.
  }
}

function clearKanbanReadingRecordingTimer(recording = {}) {
  if (recording.timer) {
    clearInterval(recording.timer);
    recording.timer = 0;
  }
}

function stopKanbanReadingRecordingTracks(recording = {}) {
  const tracks = recording.stream?.getTracks?.() || [];
  for (const track of tracks) {
    try {
      track.stop();
    } catch (_) {
      // Ignore cleanup errors from already-stopped tracks.
    }
  }
}

function renderTodosAfterReadingRecorderChange() {
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

function updateKanbanReadingRecordingStatus(todoId) {
  const text = kanbanReadingRecordingStatusText(todoId);
  document.querySelectorAll("[data-reading-record-status]").forEach((node) => {
    if (node.dataset.readingRecordStatus === String(todoId)) node.textContent = text;
  });
}

function startKanbanReadingRecordingTimer(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  recording.timer = setInterval(() => updateKanbanReadingRecordingStatus(todoId), 1000);
  updateKanbanReadingRecordingStatus(todoId);
}

function finishKanbanReadingRecording(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  if (recording.cancelled) return;
  const chunks = (recording.chunks || []).filter((chunk) => chunk && chunk.size > 0);
  const elapsedMs = Number(recording.elapsedMs || 0) || kanbanReadingRecordingDuration(recording);
  if (!chunks.length) {
    state.todoReadingRecorders[todoId] = { status: "error", error: "未录到声音，请重试。", elapsedMs };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const mime = recording.recorder?.mimeType || recording.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  const file = kanbanReadingRecordingFile(todoId, blob, mime);
  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
  state.todoReadingRecorders[todoId] = {
    status: "ready",
    elapsedMs,
    mimeType: mime,
    file,
    url,
  };
  renderTodosAfterReadingRecorderChange();
}

function failKanbanReadingRecording(todoId, err) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  state.todoReadingRecorders[todoId] = {
    status: "error",
    elapsedMs,
    error: kanbanReadingRecordingPermissionMessage(err),
  };
  renderTodosAfterReadingRecorderChange();
}

async function startKanbanReadingRecording(todoId) {
  if (!todoId || state.todoReadingSubmitting?.[todoId]) return;
  const Recorder = kanbanReadingMediaRecorderApi();
  if (!supportsKanbanReadingRecorder() || !Recorder) {
    state.todoReadingRecorders[todoId] = { status: "unsupported" };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const current = state.todoReadingRecorders?.[todoId] || {};
  if (["requesting", "recording", "stopping"].includes(current.status)) return;
  revokeKanbanReadingRecordingUrl(current);
  state.todoReadingRecorders[todoId] = { status: "requesting", chunks: [], elapsedMs: 0, error: "" };
  renderTodosAfterReadingRecorderChange();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pending = state.todoReadingRecorders?.[todoId];
    if (!pending || pending.status !== "requesting") {
      stream.getTracks?.().forEach((track) => track.stop());
      return;
    }
    const mimeType = preferredKanbanReadingRecorderMimeType();
    const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    const recording = {
      status: "recording",
      recorder,
      stream,
      chunks: [],
      startedAt: Date.now(),
      elapsedMs: 0,
      mimeType: recorder.mimeType || mimeType || "",
      error: "",
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) recording.chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => finishKanbanReadingRecording(todoId, recording));
    recorder.addEventListener("error", (event) => failKanbanReadingRecording(todoId, event.error || event));
    state.todoReadingRecorders[todoId] = recording;
    recorder.start();
    startKanbanReadingRecordingTimer(todoId, recording);
    renderTodosAfterReadingRecorderChange();
  } catch (err) {
    if (stream) stream.getTracks?.().forEach((track) => track.stop());
    failKanbanReadingRecording(todoId, err);
  }
}

function stopKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording || recording.status !== "recording") return;
  recording.elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.startedAt = 0;
  recording.status = "stopping";
  clearKanbanReadingRecordingTimer(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    } else {
      finishKanbanReadingRecording(todoId, recording);
    }
  } catch (err) {
    failKanbanReadingRecording(todoId, err);
  }
  renderTodosAfterReadingRecorderChange();
}

function cancelKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording) return;
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  revokeKanbanReadingRecordingUrl(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") recording.recorder.stop();
  } catch (_) {
    // Ignore cancellation stop errors.
  }
  delete state.todoReadingRecorders[todoId];
  renderTodosAfterReadingRecorderChange();
}

async function submitRecordedReadingSubmission(todoId, notes = "") {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording?.file) throw new Error("请先停止录音");
  const file = recording.file;
  await submitReadingSubmission(todoId, file, notes);
  const latest = state.todoReadingRecorders?.[todoId];
  if (latest?.file === file) {
    revokeKanbanReadingRecordingUrl(latest);
    delete state.todoReadingRecorders[todoId];
  }
}

function renderKanbanReadingSubmissionPanel(todo) {
  return LearningReadingUi.renderKanbanReadingSubmissionPanel(todo, learningReadingUiOptions());
}
