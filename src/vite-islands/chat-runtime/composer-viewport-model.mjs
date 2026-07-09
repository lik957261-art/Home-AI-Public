const CHAT_COMPOSER_VIEWPORT_MODEL_VERSION = "20260704-vite-chat-composer-viewport-model-v1";

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function composerTerminalReceiptStickToBottomPlan(input = {}) {
  const blockedByReadAnchor = Boolean(input.readAnchorActive);
  const blockedByUserScroll = Boolean(input.userScrollProtected);
  const stickToBottom = !blockedByReadAnchor
    && !blockedByUserScroll
    && (input.forceStickToBottom === true || input.nearBottom === true);
  return Object.freeze({
    version: CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
    stickToBottom,
    blockedByReadAnchor,
    blockedByUserScroll,
  });
}

function composerSendViewportLockPlan(input = {}) {
  const nowMs = finiteNumber(input.nowMs, 0);
  const shouldLock = input.applies === true;
  return Object.freeze({
    version: CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
    shouldLock,
    forceChatStickToBottomUntil: shouldLock ? nowMs + 12000 : 0,
    conversationViewportBottomFollowUntil: shouldLock ? nowMs + 5000 : 0,
    conversationViewportSettleUntil: shouldLock ? nowMs + 900 : 0,
    suppressChatAutoBottomUntil: 0,
    suppressConversationPinUntil: shouldLock ? nowMs + 700 : 0,
    conversationPinnedToBottom: shouldLock,
  });
}

export {
  CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
  composerSendViewportLockPlan,
  composerTerminalReceiptStickToBottomPlan,
};
