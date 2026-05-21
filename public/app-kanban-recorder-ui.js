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

function learningGrowthReflectionRecordingFile(todoId, blob, mime = "") {
  const extension = kanbanReadingRecordingExtension(mime);
  const safeId = String(todoId || "card").replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || "card";
  const filename = `growth-reflection-${safeId}-${Date.now()}.${extension}`;
  try {
    if (typeof File === "function") return new File([blob], filename, { type: mime || blob.type || "audio/webm" });
  } catch (_) {
    // Older WebViews can expose Blob without a usable File constructor.
  }
  blob.name = filename;
  blob.lastModified = Date.now();
  return blob;
}

function ensureLearningGrowthReflectionRecorderState() {
  state.todoLearningGrowthReflectionRecorders = state.todoLearningGrowthReflectionRecorders || {};
  state.todoLearningGrowthReflectionSubmitting = state.todoLearningGrowthReflectionSubmitting || {};
}

function learningGrowthReflectionRecordingStatusText(todoId) {
  const recording = state.todoLearningGrowthReflectionRecorders?.[todoId] || {};
  const duration = formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recording));
  if (recording.status === "requesting") return "正在请求麦克风权限...";
  if (recording.status === "recording") return `正在录音 ${duration}`;
  if (recording.status === "stopping") return "正在生成复盘录音...";
  if (recording.status === "ready") return `已录好复盘 ${duration}`;
  if (recording.status === "unsupported") return "当前浏览器不支持直接录音。";
  if (recording.status === "error") return recording.error || "复盘录音不可用，请重试。";
  return supportsKanbanReadingRecorder() ? "录音说明今天的主要错误、原因和下次检查方法。" : "当前浏览器不支持直接录音。";
}

function updateLearningGrowthReflectionRecordingStatus(todoId) {
  const text = learningGrowthReflectionRecordingStatusText(todoId);
  document.querySelectorAll("[data-learning-growth-reflection-status]").forEach((node) => {
    if (node.dataset.learningGrowthReflectionStatus === String(todoId)) node.textContent = text;
  });
}

function startLearningGrowthReflectionRecordingTimer(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  recording.timer = setInterval(() => updateLearningGrowthReflectionRecordingStatus(todoId), 1000);
  updateLearningGrowthReflectionRecordingStatus(todoId);
}

function finishLearningGrowthReflectionRecording(todoId, recording) {
  ensureLearningGrowthReflectionRecorderState();
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  if (recording.cancelled) return;
  const chunks = (recording.chunks || []).filter((chunk) => chunk && chunk.size > 0);
  const elapsedMs = Number(recording.elapsedMs || 0) || kanbanReadingRecordingDuration(recording);
  if (!chunks.length) {
    state.todoLearningGrowthReflectionRecorders[todoId] = { status: "error", error: "未录到声音，请重试。", elapsedMs };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const mime = recording.recorder?.mimeType || recording.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  const file = learningGrowthReflectionRecordingFile(todoId, blob, mime);
  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
  state.todoLearningGrowthReflectionRecorders[todoId] = {
    status: "ready",
    elapsedMs,
    mimeType: mime,
    file,
    url,
  };
  renderTodosAfterReadingRecorderChange();
}

function failLearningGrowthReflectionRecording(todoId, err) {
  ensureLearningGrowthReflectionRecorderState();
  const recording = state.todoLearningGrowthReflectionRecorders?.[todoId] || {};
  const elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  state.todoLearningGrowthReflectionRecorders[todoId] = {
    status: "error",
    elapsedMs,
    error: kanbanReadingRecordingPermissionMessage(err),
  };
  renderTodosAfterReadingRecorderChange();
}

async function startLearningGrowthReflectionRecording(todoId) {
  ensureLearningGrowthReflectionRecorderState();
  if (!todoId || state.todoLearningGrowthReflectionSubmitting?.[todoId]) return;
  const Recorder = kanbanReadingMediaRecorderApi();
  if (!supportsKanbanReadingRecorder() || !Recorder) {
    state.todoLearningGrowthReflectionRecorders[todoId] = { status: "unsupported" };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const current = state.todoLearningGrowthReflectionRecorders?.[todoId] || {};
  if (["requesting", "recording", "stopping"].includes(current.status)) return;
  revokeKanbanReadingRecordingUrl(current);
  state.todoLearningGrowthReflectionRecorders[todoId] = { status: "requesting", chunks: [], elapsedMs: 0, error: "" };
  renderTodosAfterReadingRecorderChange();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pending = state.todoLearningGrowthReflectionRecorders?.[todoId];
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
    recorder.addEventListener("stop", () => finishLearningGrowthReflectionRecording(todoId, recording));
    recorder.addEventListener("error", (event) => failLearningGrowthReflectionRecording(todoId, event.error || event));
    state.todoLearningGrowthReflectionRecorders[todoId] = recording;
    recorder.start();
    startLearningGrowthReflectionRecordingTimer(todoId, recording);
    renderTodosAfterReadingRecorderChange();
  } catch (err) {
    if (stream) stream.getTracks?.().forEach((track) => track.stop());
    failLearningGrowthReflectionRecording(todoId, err);
  }
}

function stopLearningGrowthReflectionRecording(todoId) {
  ensureLearningGrowthReflectionRecorderState();
  const recording = state.todoLearningGrowthReflectionRecorders?.[todoId];
  if (!recording || recording.status !== "recording") return;
  recording.elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.startedAt = 0;
  recording.status = "stopping";
  clearKanbanReadingRecordingTimer(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    } else {
      finishLearningGrowthReflectionRecording(todoId, recording);
    }
  } catch (err) {
    failLearningGrowthReflectionRecording(todoId, err);
  }
  renderTodosAfterReadingRecorderChange();
}

function cancelLearningGrowthReflectionRecording(todoId) {
  ensureLearningGrowthReflectionRecorderState();
  const recording = state.todoLearningGrowthReflectionRecorders?.[todoId];
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
  delete state.todoLearningGrowthReflectionRecorders[todoId];
  renderTodosAfterReadingRecorderChange();
}

function learningNativeGrowthSubmissionRecordingFile(taskCardId, blob, mime = "") {
  const extension = kanbanReadingRecordingExtension(mime);
  const safeId = String(taskCardId || "task").replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || "task";
  const filename = `growth-retell-${safeId}-${Date.now()}.${extension}`;
  try {
    if (typeof File === "function") return new File([blob], filename, { type: mime || blob.type || "audio/webm" });
  } catch (_) {
    // Older WebViews can expose Blob without a usable File constructor.
  }
  blob.name = filename;
  blob.lastModified = Date.now();
  return blob;
}

function ensureLearningNativeGrowthSubmissionRecorderState() {
  state.learningNativeGrowthSubmissionRecorders = state.learningNativeGrowthSubmissionRecorders || {};
  state.learningNativeGrowthSubmissionSubmitting = state.learningNativeGrowthSubmissionSubmitting || {};
}

function renderLearningGrowthAfterNativeRecorderChange() {
  if (typeof renderLearningCoinsView !== "function") {
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const scrollTop = $("conversation")?.scrollTop || 0;
  renderLearningCoinsView();
  if ($("conversation")) $("conversation").scrollTop = scrollTop;
}

function learningNativeGrowthSubmissionRecordingStatusText(taskCardId) {
  const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
  const duration = formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recording));
  if (recording.status === "requesting") return "\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650...";
  if (recording.status === "recording") return `\u6b63\u5728\u5f55\u97f3 ${duration}`;
  if (recording.status === "stopping") return "\u6b63\u5728\u751f\u6210\u590d\u8ff0\u5f55\u97f3...";
  if (recording.status === "ready") return `\u5df2\u5f55\u597d\u590d\u8ff0 ${duration}`;
  if (recording.status === "unsupported") return "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5f55\u97f3\u3002";
  if (recording.status === "error") return recording.error || "\u590d\u8ff0\u5f55\u97f3\u4e0d\u53ef\u7528\uff0c\u8bf7\u91cd\u8bd5\u3002";
  return supportsKanbanReadingRecorder() ? "\u9605\u8bfb\u6750\u6599\u540e\u5f55\u4e00\u6bb5\u82f1\u8bed\u590d\u8ff0\u3002" : "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5f55\u97f3\u3002";
}

function updateLearningNativeGrowthSubmissionRecordingStatus(taskCardId) {
  const text = learningNativeGrowthSubmissionRecordingStatusText(taskCardId);
  document.querySelectorAll("[data-learning-native-growth-record-status]").forEach((node) => {
    if (node.dataset.learningNativeGrowthRecordStatus === String(taskCardId)) node.textContent = text;
  });
  document.querySelectorAll("[data-learning-native-growth-reflection-record-status]").forEach((node) => {
    if (node.dataset.learningNativeGrowthReflectionRecordStatus === String(taskCardId)) node.textContent = text.replace("复述", "复盘");
  });
}

function startLearningNativeGrowthSubmissionRecordingTimer(taskCardId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  recording.timer = setInterval(() => updateLearningNativeGrowthSubmissionRecordingStatus(taskCardId), 1000);
  updateLearningNativeGrowthSubmissionRecordingStatus(taskCardId);
}

function finishLearningNativeGrowthSubmissionRecording(taskCardId, recording) {
  ensureLearningNativeGrowthSubmissionRecorderState();
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  if (recording.cancelled) return;
  const chunks = (recording.chunks || []).filter((chunk) => chunk && chunk.size > 0);
  const elapsedMs = Number(recording.elapsedMs || 0) || kanbanReadingRecordingDuration(recording);
  if (!chunks.length) {
    state.learningNativeGrowthSubmissionRecorders[taskCardId] = { status: "error", error: "\u672a\u5f55\u5230\u58f0\u97f3\uff0c\u8bf7\u91cd\u8bd5\u3002", elapsedMs };
    renderLearningGrowthAfterNativeRecorderChange();
    return;
  }
  const mime = recording.recorder?.mimeType || recording.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  const file = learningNativeGrowthSubmissionRecordingFile(taskCardId, blob, mime);
  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
  state.learningNativeGrowthSubmissionRecorders[taskCardId] = {
    status: "ready",
    elapsedMs,
    mimeType: mime,
    file,
    url,
  };
  renderLearningGrowthAfterNativeRecorderChange();
}

function failLearningNativeGrowthSubmissionRecording(taskCardId, err) {
  ensureLearningNativeGrowthSubmissionRecorderState();
  const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
  const elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  state.learningNativeGrowthSubmissionRecorders[taskCardId] = {
    status: "error",
    elapsedMs,
    error: kanbanReadingRecordingPermissionMessage(err),
  };
  renderLearningGrowthAfterNativeRecorderChange();
}

async function startLearningNativeGrowthSubmissionRecording(taskCardId) {
  ensureLearningNativeGrowthSubmissionRecorderState();
  if (!taskCardId || state.learningNativeGrowthSubmissionSubmitting?.[taskCardId]) return;
  const Recorder = kanbanReadingMediaRecorderApi();
  if (!supportsKanbanReadingRecorder() || !Recorder) {
    state.learningNativeGrowthSubmissionRecorders[taskCardId] = { status: "unsupported" };
    renderLearningGrowthAfterNativeRecorderChange();
    return;
  }
  const current = state.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
  if (["requesting", "recording", "stopping"].includes(current.status)) return;
  revokeKanbanReadingRecordingUrl(current);
  state.learningNativeGrowthSubmissionRecorders[taskCardId] = { status: "requesting", chunks: [], elapsedMs: 0, error: "" };
  renderLearningGrowthAfterNativeRecorderChange();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pending = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
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
    recorder.addEventListener("stop", () => finishLearningNativeGrowthSubmissionRecording(taskCardId, recording));
    recorder.addEventListener("error", (event) => failLearningNativeGrowthSubmissionRecording(taskCardId, event.error || event));
    state.learningNativeGrowthSubmissionRecorders[taskCardId] = recording;
    recorder.start();
    startLearningNativeGrowthSubmissionRecordingTimer(taskCardId, recording);
    renderLearningGrowthAfterNativeRecorderChange();
  } catch (err) {
    if (stream) stream.getTracks?.().forEach((track) => track.stop());
    failLearningNativeGrowthSubmissionRecording(taskCardId, err);
  }
}

function stopLearningNativeGrowthSubmissionRecording(taskCardId) {
  ensureLearningNativeGrowthSubmissionRecorderState();
  const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
  if (!recording || recording.status !== "recording") return;
  recording.elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.startedAt = 0;
  recording.status = "stopping";
  clearKanbanReadingRecordingTimer(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    } else {
      finishLearningNativeGrowthSubmissionRecording(taskCardId, recording);
    }
  } catch (err) {
    failLearningNativeGrowthSubmissionRecording(taskCardId, err);
  }
  renderLearningGrowthAfterNativeRecorderChange();
}

function cancelLearningNativeGrowthSubmissionRecording(taskCardId) {
  ensureLearningNativeGrowthSubmissionRecorderState();
  const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
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
  delete state.learningNativeGrowthSubmissionRecorders[taskCardId];
  renderLearningGrowthAfterNativeRecorderChange();
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
