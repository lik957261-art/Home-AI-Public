const CHAT_COMPOSER_EDITOR_MODEL_VERSION = "20260704-vite-chat-composer-editor-model-v1";
const COMPOSER_SEND_AFTER_COMPOSITION_FALLBACK_MS = 450;
const COMPOSER_EDITOR_MIN_HEIGHT_PX = 44;
const COMPOSER_EDITOR_MAX_HEIGHT_PX = 180;

function normalizeComposerText(value = "") {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ");
}

function utf8ByteLengthForText(value = "") {
  const text = String(value || "");
  if (!text) return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return encodeURIComponent(text).replace(/%[0-9A-F]{2}/gi, "x").length;
}

function composerRequestSizeErrorPlan(input = {}) {
  const text = String(input.text || "");
  const serializedBody = String(input.serializedBody || "");
  const maxTextChars = Math.max(0, Number(input.maxTextChars) || 0);
  const maxBodyBytes = Math.max(0, Number(input.maxBodyBytes) || 0);
  if (maxTextChars > 0 && text.length > maxTextChars) {
    return Object.freeze({
      version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
      error: "内容太长，单条消息最多约 24 万字，请拆成几条发送，或作为文件上传。",
      reason: "text_char_limit",
      textLength: text.length,
      bodyByteLength: utf8ByteLengthForText(serializedBody),
    });
  }
  const bodyByteLength = utf8ByteLengthForText(serializedBody);
  if (maxBodyBytes > 0 && bodyByteLength > maxBodyBytes) {
    return Object.freeze({
      version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
      error: "内容太长，当前消息包超过发送上限，请拆成几条发送，或作为文件上传。",
      reason: "body_byte_limit",
      textLength: text.length,
      bodyByteLength,
    });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    error: "",
    reason: "",
    textLength: text.length,
    bodyByteLength,
  });
}

function composerSendAfterCompositionFallbackPlan(input = {}) {
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    delayMs: Math.max(0, Number(input.delayMs) || COMPOSER_SEND_AFTER_COMPOSITION_FALLBACK_MS),
    shouldSendWhenTimerFires: Boolean(input.sendAfterComposition),
  });
}

function composerSuccessfulSendClearPlan(input = {}) {
  const normalizedCurrent = normalizeComposerText(input.currentText || "").trim();
  const normalizedSent = normalizeComposerText(input.sentText || "").trim();
  const shouldClear = !normalizedCurrent || normalizedCurrent === normalizedSent;
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    shouldClear,
    reason: shouldClear ? "sent_text_matches_current" : "current_text_changed",
  });
}

function composerEditorHeightPlan(input = {}) {
  const scrollHeight = Number(input.scrollHeight);
  const minHeight = Math.max(0, Number(input.minHeightPx) || COMPOSER_EDITOR_MIN_HEIGHT_PX);
  const maxHeight = Math.max(minHeight, Number(input.maxHeightPx) || COMPOSER_EDITOR_MAX_HEIGHT_PX);
  const measuredHeight = Number.isFinite(scrollHeight) ? scrollHeight : minHeight;
  const heightPx = Math.min(maxHeight, Math.max(minHeight, measuredHeight));
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    resetHeight: "auto",
    height: `${heightPx}px`,
    heightPx,
  });
}

function composerPlainTextPastePlan(input = {}) {
  const value = String(input.value || "");
  const text = String(input.text || "");
  const start = Math.max(0, Number(input.selectionStart ?? value.length) || 0);
  const end = Math.max(start, Number(input.selectionEnd ?? start) || start);
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    text,
    selectionStart: start,
    selectionEnd: end,
    value: `${value.slice(0, start)}${text}${value.slice(end)}`,
    caretOffset: start + text.length,
  });
}

function composerCaretOffsetPlan(input = {}) {
  const fallbackLength = normalizeComposerText(input.text || "").length;
  const selectionStart = Number(input.selectionStart);
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    offset: Number.isFinite(selectionStart) ? Math.max(0, selectionStart) : Math.max(0, fallbackLength),
  });
}

function composerSetCaretOffsetPlan(input = {}) {
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    offset: Math.max(0, Number(input.offset) || 0),
  });
}

function composerKeydownActionPlan(input = {}) {
  const key = String(input.key || "");
  const modifier = Boolean(input.shiftKey || input.altKey || input.ctrlKey || input.metaKey || input.isComposing);
  if (input.mentionAvailable && input.groupMentionOpen) {
    if (key === "ArrowDown") return Object.freeze({ version: CHAT_COMPOSER_EDITOR_MODEL_VERSION, action: "mention_move", delta: 1, preventDefault: true });
    if (key === "ArrowUp") return Object.freeze({ version: CHAT_COMPOSER_EDITOR_MODEL_VERSION, action: "mention_move", delta: -1, preventDefault: true });
    if (key === "Escape") return Object.freeze({ version: CHAT_COMPOSER_EDITOR_MODEL_VERSION, action: "mention_close", preventDefault: true });
    if ((key === "Enter" || key === "Tab") && !modifier) {
      return Object.freeze({ version: CHAT_COMPOSER_EDITOR_MODEL_VERSION, action: "mention_choose", preventDefault: true });
    }
  }
  if (key !== "Enter" || modifier) {
    return Object.freeze({ version: CHAT_COMPOSER_EDITOR_MODEL_VERSION, action: "none", preventDefault: false });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_EDITOR_MODEL_VERSION,
    action: input.chatSearchMode ? "chat_search" : "send_message",
    preventDefault: true,
  });
}

export {
  CHAT_COMPOSER_EDITOR_MODEL_VERSION,
  COMPOSER_EDITOR_MAX_HEIGHT_PX,
  COMPOSER_EDITOR_MIN_HEIGHT_PX,
  COMPOSER_SEND_AFTER_COMPOSITION_FALLBACK_MS,
  composerCaretOffsetPlan,
  composerEditorHeightPlan,
  composerKeydownActionPlan,
  composerPlainTextPastePlan,
  composerRequestSizeErrorPlan,
  composerSendAfterCompositionFallbackPlan,
  composerSetCaretOffsetPlan,
  composerSuccessfulSendClearPlan,
  normalizeComposerText,
  utf8ByteLengthForText,
};
