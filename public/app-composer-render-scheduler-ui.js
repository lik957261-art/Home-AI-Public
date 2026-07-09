"use strict";

const CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_ESM_PATH = "/vite-islands/chat-composer-render-scheduler-model/chat-composer-render-scheduler-model.js";
let chatComposerRenderSchedulerModel = null;
let chatComposerRenderSchedulerModelPromise = null;

function importChatComposerRenderSchedulerModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerRenderSchedulerModel) return Promise.resolve(chatComposerRenderSchedulerModel);
  if (!chatComposerRenderSchedulerModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerRenderSchedulerModel === "function"
      ? rootRef.__homeAiImportChatComposerRenderSchedulerModel
      : (path) => import(path);
    chatComposerRenderSchedulerModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerRenderSchedulerModel = model || null;
        return chatComposerRenderSchedulerModel;
      })
      .catch((error) => {
        chatComposerRenderSchedulerModelPromise = null;
        throw error;
      });
  }
  return chatComposerRenderSchedulerModelPromise;
}

function currentChatComposerRenderSchedulerModel() {
  return chatComposerRenderSchedulerModel;
}

if (typeof window !== "undefined") {
  importChatComposerRenderSchedulerModel().catch(() => null);
}

function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  if (!conversation) return;
  const routeSnapshot = currentThreadRouteSnapshot();
  const model = currentChatComposerRenderSchedulerModel();
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const schedulePlan = typeof model?.composerRenderSchedulePlan === "function"
    ? model.composerRenderSchedulePlan({
      renderScheduled: state.renderScheduled,
      hasConversation: Boolean(conversation),
      userScrollProtected,
      forceStickToBottom: shouldForceChatStickToBottom(),
      nearBottom: isNearBottom(),
      scrollHeight: conversation.scrollHeight,
      scrollTop: conversation.scrollTop,
    })
    : {
      shouldSchedule: true,
      shouldStickToBottom: !userScrollProtected && (shouldForceChatStickToBottom() || isNearBottom()),
      preservedBottomOffset: conversation.scrollHeight - conversation.scrollTop,
    };
  if (!schedulePlan.shouldSchedule) return;
  state.shouldStickToBottom = schedulePlan.shouldStickToBottom;
  state.preservedBottomOffset = schedulePlan.preservedBottomOffset;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    const framePlan = typeof model?.composerRenderFramePlan === "function"
      ? model.composerRenderFramePlan({
        routeMatches: currentThreadRouteMatches(routeSnapshot),
        shouldStickToBottom: state.shouldStickToBottom,
      })
      : {
        shouldRender: currentThreadRouteMatches(routeSnapshot),
        renderOptions: { stickToBottom: state.shouldStickToBottom },
      };
    if (!framePlan.shouldRender) return;
    renderCurrentThread(framePlan.renderOptions || { stickToBottom: state.shouldStickToBottom });
  });
}
