"use strict";

function composerTerminalReceiptStickToBottom() {
  const conversation = $("conversation");
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  if (readAnchorActive || userScrollProtected) return false;
  if (typeof shouldForceChatStickToBottom === "function" && shouldForceChatStickToBottom()) return true;
  if (typeof isNearBottom === "function" && isNearBottom(220)) return true;
  return false;
}

function lockComposerSendToBottom() {
  if (!conversationViewportRefreshApplies()) return;
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationViewportBottomFollowUntil = Date.now() + 5000;
  state.conversationViewportSettleUntil = Date.now() + 900;
  state.suppressChatAutoBottomUntil = 0;
  state.suppressConversationPinUntil = Date.now() + 700;
  state.conversationPinnedToBottom = true;
  requestAnimationFrame(() => {
    scrollConversationToBottom();
    requestAnimationFrame(scrollConversationToBottom);
  });
}
