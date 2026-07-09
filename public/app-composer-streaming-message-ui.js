"use strict";

const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000;
const STREAMING_MESSAGE_RENDER_THROTTLE_MS = 90;
const CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_ESM_PATH = "/vite-islands/chat-composer-streaming-message-model/chat-composer-streaming-message-model.js";
let chatComposerStreamingMessageModel = null;
let chatComposerStreamingMessageModelPromise = null;

function importChatComposerStreamingMessageModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerStreamingMessageModel) return Promise.resolve(chatComposerStreamingMessageModel);
  if (!chatComposerStreamingMessageModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerStreamingMessageModel === "function"
      ? rootRef.__homeAiImportChatComposerStreamingMessageModel
      : (path) => import(path);
    chatComposerStreamingMessageModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerStreamingMessageModel = model || null;
        return chatComposerStreamingMessageModel;
      })
      .catch((error) => {
        chatComposerStreamingMessageModelPromise = null;
        throw error;
      });
  }
  return chatComposerStreamingMessageModelPromise;
}

function currentChatComposerStreamingMessageModel() {
  return chatComposerStreamingMessageModel;
}

if (typeof window !== "undefined") {
  importChatComposerStreamingMessageModel().catch(() => null);
}

function appendStreamingMessageBounded(current, delta) {
  const model = currentChatComposerStreamingMessageModel();
  if (typeof model?.appendStreamingMessageBoundedPlan === "function") {
    return model.appendStreamingMessageBoundedPlan({
      current,
      delta,
      maxChars: STREAMING_MESSAGE_LIVE_BUFFER_CHARS,
    }).content;
  }
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= STREAMING_MESSAGE_LIVE_BUFFER_CHARS) return next;
  const tailChars = Math.floor(STREAMING_MESSAGE_LIVE_BUFFER_CHARS * 0.75);
  const tail = next.slice(-tailChars);
  return `[live content truncated: ${next.length} chars total]\n\n${tail}`;
}

function renderStreamingMessageContent(message) {
  const model = currentChatComposerStreamingMessageModel();
  const eligibility = typeof model?.streamingMessageRenderEligibilityPlan === "function"
    ? model.streamingMessageRenderEligibilityPlan({
      message,
      chatSearchMode: isChatSearchMode(),
      chatSearchQuery: currentChatSearchQuery(),
    })
    : null;
  if (eligibility && !eligibility.shouldRender) return false;
  if (!eligibility && (!message?.id || message.role !== "assistant")) return false;
  if (!eligibility && isChatSearchMode() && currentChatSearchQuery()) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  const content = body?.querySelector?.(".text-content");
  if (!article || !body || !content || (!eligibility && message.revokedAt)) return false;
  const conversation = $("conversation");
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const keepPinned = typeof shouldKeepRunProgressPinnedToBottom === "function"
    ? shouldKeepRunProgressPinnedToBottom(conversation)
    : false;
  const fallbackStick = typeof shouldKeepRunProgressPinnedToBottom !== "function"
    ? (shouldForceChatStickToBottom() || isNearBottom())
    : false;
  const shouldStick = typeof model?.streamingMessageStickToBottomPlan === "function"
    ? model.streamingMessageStickToBottomPlan({
      readAnchorActive,
      userScrollProtected,
      keepPinned,
      forceStick: fallbackStick,
      nearBottom: fallbackStick,
    }).shouldStick
    : !readAnchorActive && !userScrollProtected && (keepPinned || fallbackStick);
  const scrollMetrics = typeof runProgressScrollMetrics === "function"
    ? runProgressScrollMetrics(conversation)
    : null;
  const messageStatus = String(message.status || "");
  const active = eligibility
    ? eligibility.active
    : (typeof model?.streamingMessageActivePlan === "function"
      ? model.streamingMessageActivePlan({ status: messageStatus }).active
      : ["queued", "running"].includes(messageStatus));
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
  const lastAt = state.streamingMessageRenderLastAt.get(id) || 0;
  const model = currentChatComposerStreamingMessageModel();
  const nowMs = Date.now();
  const delay = typeof model?.streamingMessageRenderDelayPlan === "function"
    ? model.streamingMessageRenderDelayPlan({
      contentLength,
      activeMessageRichRenderLimit: ACTIVE_MESSAGE_RICH_RENDER_LIMIT,
      throttleMs: STREAMING_MESSAGE_RENDER_THROTTLE_MS,
      richRenderDelayMs: 180,
      lastRenderedAtMs: lastAt,
      nowMs,
    }).delayMs
    : Math.max(0, (contentLength > ACTIVE_MESSAGE_RICH_RENDER_LIMIT ? 180 : STREAMING_MESSAGE_RENDER_THROTTLE_MS) - (nowMs - lastAt));
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
  const model = currentChatComposerStreamingMessageModel();
  const plan = typeof model?.appendStreamingDeltaPlan === "function"
    ? model.appendStreamingDeltaPlan({
      thread: state.currentThread,
      threadId,
      messageId,
      delta,
      payload,
      nowIso: new Date().toISOString(),
      maxChars: STREAMING_MESSAGE_LIVE_BUFFER_CHARS,
    })
    : null;
  if (plan && !plan.shouldApply) return;
  if (!plan && (!state.currentThread || state.currentThread.id !== threadId)) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = plan?.updatedAt || payload.updatedAt || new Date().toISOString();
  message.content = plan?.content || appendStreamingMessageBounded(message.content || "", delta || "");
  if (!message.firstFeedbackAt) message.firstFeedbackAt = plan?.firstFeedbackAt || payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (!scheduleStreamingMessageRender(message)) scheduleRenderCurrentThread();
}
