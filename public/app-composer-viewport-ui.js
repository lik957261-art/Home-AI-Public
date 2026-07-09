"use strict";

const CHAT_COMPOSER_VIEWPORT_MODEL_ESM_PATH = "/vite-islands/chat-composer-viewport-model/chat-composer-viewport-model.js";
let chatComposerViewportModel = null;
let chatComposerViewportModelPromise = null;

function importChatComposerViewportModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerViewportModel) return Promise.resolve(chatComposerViewportModel);
  if (!chatComposerViewportModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerViewportModel === "function"
      ? rootRef.__homeAiImportChatComposerViewportModel
      : (path) => import(path);
    chatComposerViewportModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_VIEWPORT_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerViewportModel = model || null;
        return chatComposerViewportModel;
      })
      .catch((error) => {
        chatComposerViewportModelPromise = null;
        throw error;
      });
  }
  return chatComposerViewportModelPromise;
}

function currentChatComposerViewportModel() {
  return chatComposerViewportModel;
}

if (typeof window !== "undefined") {
  importChatComposerViewportModel().catch(() => null);
}

function composerTerminalReceiptStickToBottom() {
  const conversation = $("conversation");
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const forceStickToBottom = typeof shouldForceChatStickToBottom === "function" && shouldForceChatStickToBottom();
  const nearBottom = typeof isNearBottom === "function" && isNearBottom(220);
  const model = currentChatComposerViewportModel();
  const plan = typeof model?.composerTerminalReceiptStickToBottomPlan === "function"
    ? model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive,
      userScrollProtected,
      forceStickToBottom,
      nearBottom,
    })
    : {
      stickToBottom: !readAnchorActive && !userScrollProtected && (forceStickToBottom || nearBottom),
    };
  return Boolean(plan.stickToBottom);
}

function lockComposerSendToBottom() {
  const applies = conversationViewportRefreshApplies();
  const nowMs = Date.now();
  const model = currentChatComposerViewportModel();
  const lockPlan = typeof model?.composerSendViewportLockPlan === "function"
    ? model.composerSendViewportLockPlan({ applies, nowMs })
    : {
      shouldLock: applies,
      forceChatStickToBottomUntil: nowMs + 12000,
      conversationViewportBottomFollowUntil: nowMs + 5000,
      conversationViewportSettleUntil: nowMs + 900,
      suppressChatAutoBottomUntil: 0,
      suppressConversationPinUntil: nowMs + 700,
      conversationPinnedToBottom: true,
    };
  if (!lockPlan.shouldLock) return;
  state.forceChatStickToBottomUntil = lockPlan.forceChatStickToBottomUntil;
  state.conversationViewportBottomFollowUntil = lockPlan.conversationViewportBottomFollowUntil;
  state.conversationViewportSettleUntil = lockPlan.conversationViewportSettleUntil;
  state.suppressChatAutoBottomUntil = lockPlan.suppressChatAutoBottomUntil;
  state.suppressConversationPinUntil = lockPlan.suppressConversationPinUntil;
  state.conversationPinnedToBottom = lockPlan.conversationPinnedToBottom;
  requestAnimationFrame(() => {
    scrollConversationToBottom();
    requestAnimationFrame(scrollConversationToBottom);
  });
}
