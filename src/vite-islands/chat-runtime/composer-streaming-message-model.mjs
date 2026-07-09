const CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION = "20260704-vite-chat-composer-streaming-message-model-v1";
const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000;
const STREAMING_MESSAGE_RENDER_THROTTLE_MS = 90;
const STREAMING_MESSAGE_RICH_RENDER_DELAY_MS = 180;
const STREAMING_MESSAGE_TAIL_RATIO = 0.75;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function appendStreamingMessageBoundedPlan(input = {}) {
  const maxChars = Math.max(1000, finiteNumber(input.maxChars, STREAMING_MESSAGE_LIVE_BUFFER_CHARS));
  const next = `${input.current || ""}${input.delta || ""}`;
  if (next.length <= maxChars) {
    return Object.freeze({
      version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
      content: next,
      truncated: false,
      totalLength: next.length,
    });
  }
  const tailChars = Math.floor(maxChars * STREAMING_MESSAGE_TAIL_RATIO);
  const tail = next.slice(-tailChars);
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    content: `[live content truncated: ${next.length} chars total]\n\n${tail}`,
    truncated: true,
    totalLength: next.length,
  });
}

function streamingMessageActivePlan(input = {}) {
  const status = cleanString(input.message?.status || input.status, 80);
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    active: status === "queued" || status === "running",
  });
}

function streamingMessageRenderEligibilityPlan(input = {}) {
  const message = input.message && typeof input.message === "object" ? input.message : null;
  let reason = "";
  if (!message?.id) reason = "missing_message_id";
  else if (message.role !== "assistant") reason = "not_assistant";
  else if (input.chatSearchMode && cleanString(input.chatSearchQuery, 400)) reason = "chat_search_active";
  else if (message.revokedAt) reason = "message_revoked";
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    shouldRender: !reason,
    reason,
    active: streamingMessageActivePlan({ message }).active,
    messageId: cleanString(message?.id, 180),
  });
}

function streamingMessageStickToBottomPlan(input = {}) {
  const blocked = Boolean(input.readAnchorActive || input.userScrollProtected);
  const shouldStick = !blocked && Boolean(input.keepPinned || input.forceStick || input.nearBottom);
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    shouldStick,
    blockedByReadAnchor: Boolean(input.readAnchorActive),
    blockedByUserScroll: Boolean(input.userScrollProtected),
  });
}

function streamingMessageRenderDelayPlan(input = {}) {
  const contentLength = Math.max(0, finiteNumber(input.contentLength, 0));
  const richLimit = Math.max(0, finiteNumber(input.activeMessageRichRenderLimit, 0));
  const throttleMs = Math.max(0, finiteNumber(input.throttleMs, STREAMING_MESSAGE_RENDER_THROTTLE_MS));
  const richRenderDelayMs = Math.max(0, finiteNumber(input.richRenderDelayMs, STREAMING_MESSAGE_RICH_RENDER_DELAY_MS));
  const minDelay = richLimit && contentLength > richLimit ? richRenderDelayMs : throttleMs;
  const nowMs = finiteNumber(input.nowMs, 0);
  const lastRenderedAtMs = finiteNumber(input.lastRenderedAtMs, 0);
  const elapsed = Math.max(0, nowMs - lastRenderedAtMs);
  const delayMs = minDelay ? Math.max(0, minDelay - elapsed) : 0;
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    minDelayMs: minDelay,
    delayMs,
  });
}

function appendStreamingDeltaPlan(input = {}) {
  const thread = input.thread && typeof input.thread === "object" ? input.thread : null;
  const threadId = cleanString(input.threadId, 180);
  const messageId = cleanString(input.messageId, 180);
  if (!thread || cleanString(thread.id, 180) !== threadId || !messageId) {
    return Object.freeze({
      version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
      shouldApply: false,
      reason: "thread_scope_mismatch",
      messageId,
    });
  }
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const message = messages.find((item) => cleanString(item?.id, 180) === messageId);
  if (!message) {
    return Object.freeze({
      version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
      shouldApply: false,
      reason: "message_not_found",
      messageId,
    });
  }
  const updatedAt = cleanString(input.payload?.updatedAt || input.nowIso || new Date(0).toISOString(), 80);
  const firstFeedbackAt = message.firstFeedbackAt || cleanString(input.payload?.firstFeedbackAt || updatedAt, 80);
  const content = appendStreamingMessageBoundedPlan({
    current: message.content || "",
    delta: input.delta || "",
    maxChars: input.maxChars,
  }).content;
  return Object.freeze({
    version: CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
    shouldApply: true,
    reason: "",
    messageId,
    content,
    firstFeedbackAt,
    updatedAt,
  });
}

export {
  CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
  STREAMING_MESSAGE_LIVE_BUFFER_CHARS,
  STREAMING_MESSAGE_RENDER_THROTTLE_MS,
  appendStreamingDeltaPlan,
  appendStreamingMessageBoundedPlan,
  streamingMessageActivePlan,
  streamingMessageRenderDelayPlan,
  streamingMessageRenderEligibilityPlan,
  streamingMessageStickToBottomPlan,
};
