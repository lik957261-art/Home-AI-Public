"use strict";

const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000;
const STREAMING_MESSAGE_RENDER_THROTTLE_MS = 90;

function appendStreamingMessageBounded(current, delta) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= STREAMING_MESSAGE_LIVE_BUFFER_CHARS) return next;
  const tailChars = Math.floor(STREAMING_MESSAGE_LIVE_BUFFER_CHARS * 0.75);
  const tail = next.slice(-tailChars);
  return `[live content truncated: ${next.length} chars total]\n\n${tail}`;
}

function renderStreamingMessageContent(message) {
  if (!message?.id || message.role !== "assistant") return false;
  if (isChatSearchMode() && currentChatSearchQuery()) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  const content = body?.querySelector?.(".text-content");
  if (!article || !body || !content || message.revokedAt) return false;
  const conversation = $("conversation");
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const shouldStick = typeof shouldKeepRunProgressPinnedToBottom === "function"
    ? !readAnchorActive && !userScrollProtected && shouldKeepRunProgressPinnedToBottom(conversation)
    : !readAnchorActive && !userScrollProtected && (shouldForceChatStickToBottom() || isNearBottom());
  const scrollMetrics = typeof runProgressScrollMetrics === "function"
    ? runProgressScrollMetrics(conversation)
    : null;
  const messageStatus = String(message.status || "");
  const active = ["queued", "running"].includes(messageStatus);
  try {
    article.classList.toggle("streaming-active", active);
    content.outerHTML = renderText(message.content || "", message);
    if (typeof hydrateInlineMarkdownImages === "function") hydrateInlineMarkdownImages(article);
    if (typeof updateRunProgressPromptReserveClass === "function") {
      updateRunProgressPromptReserveClass(article, state.currentThread, message);
    }
  } catch (err) {
    console.warn("renderStreamingMessageContent failed", err);
    content.className = "text-content plain-text";
    content.textContent = String(message.content || "");
  }
  if (shouldStick) {
    if (typeof stickRunProgressToConversationBottom === "function") {
      stickRunProgressToConversationBottom(conversation, shouldStick, scrollMetrics);
    } else if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
    state.conversationPinnedToBottom = true;
    if (isSingleWindowChatView()) scheduleConversationBottomStick();
  } else {
    state.conversationPinnedToBottom = false;
  }
  scheduleMessageScrollButtonVisibility($("conversation"));
  if (!active) {
    scheduleMessageScrollButtonVisibilitySettle(article, [120, 360]);
  }
  return true;
}

function scheduleStreamingMessageRender(message) {
  if (!message?.id) return false;
  const id = String(message.id);
  if (state.streamingMessageRenderScheduled.has(id)) return true;
  state.streamingMessageRenderScheduled.add(id);
  const contentLength = String(message.content || "").length;
  const minDelay = contentLength > ACTIVE_MESSAGE_RICH_RENDER_LIMIT ? 180 : STREAMING_MESSAGE_RENDER_THROTTLE_MS;
  const lastAt = state.streamingMessageRenderLastAt.get(id) || 0;
  const delay = minDelay ? Math.max(0, minDelay - (Date.now() - lastAt)) : 0;
  const render = () => requestAnimationFrame(() => {
    state.streamingMessageRenderScheduled.delete(id);
    state.streamingMessageRenderLastAt.set(id, Date.now());
    if (!renderStreamingMessageContent(message)) scheduleRenderCurrentThread();
  });
  if (delay) window.setTimeout(render, delay);
  else render();
  return true;
}

function appendDelta(threadId, messageId, delta, payload = {}) {
  if (!state.currentThread || state.currentThread.id !== threadId) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = payload.updatedAt || new Date().toISOString();
  message.content = appendStreamingMessageBounded(message.content || "", delta || "");
  if (!message.firstFeedbackAt) message.firstFeedbackAt = payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (!scheduleStreamingMessageRender(message)) scheduleRenderCurrentThread();
}
