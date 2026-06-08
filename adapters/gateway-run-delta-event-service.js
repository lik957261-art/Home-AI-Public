"use strict";

const {
  parseToolsetEscalationRequest,
  sanitizeToolsetEscalationVisibleText,
} = require("./gateway-run-toolset-escalation-service");

function compactFallback(value) {
  return value;
}

function defaultAppendBounded(current, delta, maxChars = 12000) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  const side = Math.floor(maxChars * 0.45);
  return `${next.slice(0, side)}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-side)}`;
}

function createGatewayRunDeltaEventService(options = {}) {
  const appendBounded = typeof options.appendBounded === "function" ? options.appendBounded : defaultAppendBounded;
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const broadcastMessageUpdated = typeof options.broadcastMessageUpdated === "function"
    ? options.broadcastMessageUpdated
    : (() => {});
  const maxMessageChars = Math.max(1, Number(options.maxMessageChars || 12000) || 12000);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const scheduleStreamingStateSave = typeof options.scheduleStreamingStateSave === "function"
    ? options.scheduleStreamingStateSave
    : (() => {});
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;

  function applyDelta(context = {}, event = {}) {
    const { thread, message } = context;
    const delta = String(event.delta || event.text || "");
    if (!delta) return { action: "empty_delta" };
    const feedbackAt = nowIso();
    const previousContent = String(message.content || "");
    const combinedContent = appendBounded(previousContent, delta, maxMessageChars);
    const sanitized = sanitizeToolsetEscalationVisibleText(combinedContent);
    if (sanitized.found) {
      const pendingRequest = parseToolsetEscalationRequest(combinedContent, message);
      if (pendingRequest) message.pendingToolsetEscalationRequest = pendingRequest;
      message.content = sanitized.text;
    } else {
      message.content = combinedContent;
    }
    if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
    message.updatedAt = feedbackAt;
    thread.updatedAt = feedbackAt;
    scheduleStreamingStateSave();
    const visibleDelta = sanitized.found && message.content.startsWith(previousContent)
      ? message.content.slice(previousContent.length)
      : delta;
    if (sanitized.found && !visibleDelta) {
      broadcastMessageUpdated(thread, message);
      return { action: "delta_suppressed_toolset_escalation" };
    }
    broadcast({
      type: "message.delta",
      threadId: thread.id,
      messageId: message.id,
      delta: visibleDelta,
      firstFeedbackAt: message.firstFeedbackAt,
      updatedAt: message.updatedAt,
      thread: threadSummary(thread),
    });
    return { action: sanitized.found ? "delta_sanitized_toolset_escalation" : "delta", delta: visibleDelta };
  }

  return Object.freeze({
    applyDelta,
  });
}

module.exports = {
  createGatewayRunDeltaEventService,
};
