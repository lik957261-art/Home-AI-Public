const CHAT_ATTACHMENT_FILE_INPUT_CONTROLLER_VERSION = "20260704-vite-chat-attachment-file-input-controller-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function fileName(file = {}, index = 0) {
  return cleanString(file.name || file.filename || `file-${index + 1}`, 220) || `file-${index + 1}`;
}

function normalizeSelectedFile(file = {}, index = 0) {
  const name = fileName(file, index);
  const size = Number(file.size || file.sizeBytes || 0);
  return Object.freeze({
    index,
    name,
    type: cleanString(file.type || file.mime || "", 300),
    size: Number.isFinite(size) && size > 0 ? size : 0,
  });
}

function snapshotFileList(files = [], options = {}) {
  const maxFiles = Math.max(1, Math.min(20, Number(options.maxFiles || 20) || 20));
  return Object.freeze(Array.from(files || [])
    .filter(Boolean)
    .slice(0, maxFiles)
    .map((file, index) => Object.freeze({
      file,
      metadata: normalizeSelectedFile(file, index),
    })));
}

function selectionEvidence(snapshot = []) {
  return Object.freeze([
    `selected_count=${snapshot.length}`,
    `file_names=${snapshot.map((entry) => entry.metadata.name).join(",").slice(0, 240)}`,
  ]);
}

function clearInputValue(input) {
  if (!input || !("value" in input)) return false;
  try {
    input.value = "";
    return true;
  } catch {
    return false;
  }
}

function stopSelectionEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function createAttachmentFileInputController(options = {}) {
  let input = options.input || null;
  const events = options.events || { emit() {} };
  let selectedSnapshot = snapshotFileList(options.initialFiles || [], options);

  function emit(type, payload = {}) {
    events.emit?.(type, payload);
  }

  function setInput(nextInput) {
    input = nextInput || null;
    return input;
  }

  function handleChange(event = {}) {
    stopSelectionEvent(event);
    const target = event.target || input || {};
    const snapshot = snapshotFileList(target.files || [], options);
    selectedSnapshot = snapshot;
    const inputCleared = clearInputValue(target);
    const payload = Object.freeze({
      status: snapshot.length ? "selected" : "empty",
      count: snapshot.length,
      inputCleared,
      evidence: selectionEvidence(snapshot),
      files: Object.freeze(snapshot.map((entry) => entry.metadata)),
    });
    emit("chat-runtime-preview:attachment-file-input", payload);
    if (typeof options.onSelection === "function") options.onSelection(payload);
    return payload;
  }

  function getSelectedFiles() {
    return Object.freeze(selectedSnapshot.map((entry) => entry.file));
  }

  function getSelectedMetadata() {
    return Object.freeze(selectedSnapshot.map((entry) => entry.metadata));
  }

  function clearSelection(reason = "manual_clear") {
    const count = selectedSnapshot.length;
    selectedSnapshot = Object.freeze([]);
    const inputCleared = clearInputValue(input);
    const payload = Object.freeze({
      status: "cleared",
      reason: cleanString(reason, 120),
      count,
      inputCleared,
    });
    emit("chat-runtime-preview:attachment-file-input", payload);
    return payload;
  }

  function bind(nextInput = input) {
    setInput(nextInput);
    input?.addEventListener?.("change", handleChange, { capture: true });
    return () => {
      input?.removeEventListener?.("change", handleChange, { capture: true });
    };
  }

  return Object.freeze({
    version: CHAT_ATTACHMENT_FILE_INPUT_CONTROLLER_VERSION,
    bind,
    clearSelection,
    getSelectedFiles,
    getSelectedMetadata,
    handleChange,
    setInput,
  });
}

export {
  CHAT_ATTACHMENT_FILE_INPUT_CONTROLLER_VERSION,
  clearInputValue,
  createAttachmentFileInputController,
  normalizeSelectedFile,
  selectionEvidence,
  snapshotFileList,
  stopSelectionEvent,
};
