"use strict";

const CHAT_COMPOSER_MODEL_ESM_PATH = "/vite-islands/chat-composer-model/chat-composer-model.js";
let chatComposerPendingSendModel = null;
let chatComposerPendingSendModelPromise = null;

function importChatComposerPendingSendModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerPendingSendModel) return Promise.resolve(chatComposerPendingSendModel);
  if (!chatComposerPendingSendModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerPendingSendModel === "function"
      ? rootRef.__homeAiImportChatComposerPendingSendModel
      : (path) => import(path);
    chatComposerPendingSendModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerPendingSendModel = model || null;
        return chatComposerPendingSendModel;
      })
      .catch((error) => {
        chatComposerPendingSendModelPromise = null;
        throw error;
      });
  }
  return chatComposerPendingSendModelPromise;
}

function currentChatComposerPendingSendModel() {
  return chatComposerPendingSendModel;
}

if (typeof window !== "undefined") {
  importChatComposerPendingSendModel().catch(() => null);
}

function composerPendingSendPlanInput(body = {}, extra = {}) {
  return Object.assign({
    body,
    viewMode: state.viewMode,
    singleWindowMode: state.singleWindowMode,
    activeChatTaskGroupId: state.viewMode === "single" && state.singleWindowMode === "chat" && typeof activeChatTaskGroupId === "function"
      ? activeChatTaskGroupId()
      : "",
  }, extra);
}

function optimisticSendTaskGroupId(body = {}) {
  const model = currentChatComposerPendingSendModel();
  if (typeof model?.optimisticSendTaskGroupId === "function") {
    return model.optimisticSendTaskGroupId(composerPendingSendPlanInput(body));
  }
  if (body.taskGroupId) return body.taskGroupId;
  if (state.viewMode === "single" && state.singleWindowMode === "chat" && typeof activeChatTaskGroupId === "function") {
    return activeChatTaskGroupId();
  }
  return "";
}

function optimisticSendShouldAppendAssistant(body = {}) {
  const model = currentChatComposerPendingSendModel();
  if (typeof model?.optimisticSendShouldAppendAssistant === "function") {
    return model.optimisticSendShouldAppendAssistant(composerPendingSendPlanInput(body));
  }
  return !(state.viewMode === "single" && state.singleWindowMode === "chat" && body.messageKind === "plain");
}

function appendOptimisticSendMessages(body = {}, text = "") {
  const thread = state.currentThread;
  if (!thread?.id || !Array.isArray(thread.messages)) return null;
  const nowMs = Date.now();
  const baseId = `local_send_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
  const model = currentChatComposerPendingSendModel();
  if (typeof model?.createOptimisticSendPlan === "function" && typeof model?.applyOptimisticSendPlan === "function") {
    const plan = model.createOptimisticSendPlan(composerPendingSendPlanInput(body, {
      threadId: thread.id,
      text,
      baseId,
      nowIso: new Date(nowMs).toISOString(),
      queuedAt: new Date(nowMs + 1).toISOString(),
      pendingArtifacts: Array.isArray(state.pendingArtifacts) ? state.pendingArtifacts : [],
    }));
    if (plan?.ok && Array.isArray(plan.messages)) {
      const appliedThread = model.applyOptimisticSendPlan(thread, plan);
      thread.messages = Array.isArray(appliedThread?.messages) ? Array.from(appliedThread.messages) : [...thread.messages, ...plan.messages];
      const viewport = plan.viewport || {};
      state.forceChatStickToBottomUntil = Date.now() + (Number(viewport.forceStickToBottomMs) || 12000);
      state.conversationViewportBottomFollowUntil = Date.now() + (Number(viewport.bottomFollowMs) || 5000);
      state.conversationViewportSettleUntil = Date.now() + (Number(viewport.settleMs) || 900);
      state.conversationPinnedToBottom = true;
      if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: true });
      if (typeof scheduleConversationBottomStick === "function" && typeof isSingleWindowChatView === "function" && isSingleWindowChatView()) {
        scheduleConversationBottomStick();
      }
      return {
        threadId: plan.token?.threadId || thread.id,
        ids: new Set(Array.isArray(plan.token?.ids) ? plan.token.ids : plan.messages.map((message) => message.id)),
        localPendingSendId: plan.token?.localPendingSendId || baseId,
      };
    }
  }
  const taskGroupId = optimisticSendTaskGroupId(body);
  const messageKind = body.messageKind || "";
  const userMessage = {
    id: `${baseId}_user`,
    role: "user",
    content: text,
    status: "done",
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    taskGroupId,
    messageKind,
    localPendingSend: true,
    localPendingSendId: baseId,
  };
  const messages = [userMessage];
  if (optimisticSendShouldAppendAssistant(body)) {
    messages.push({
      id: `${baseId}_assistant`,
      role: "assistant",
      content: "",
      status: "queued",
      createdAt: new Date(nowMs + 1).toISOString(),
      updatedAt: new Date(nowMs + 1).toISOString(),
      queuedAt: new Date(nowMs + 1).toISOString(),
      taskGroupId,
      localRunProgressEvents: [{
        event: "run.request_preparing",
        timestamp: (nowMs + 1) / 1000,
        preview: "\u6b63\u5728\u51c6\u5907\u6a21\u578b\u56de\u590d",
      }],
      localPendingSend: true,
      localPendingSendId: baseId,
    });
  }
  const ids = new Set(messages.map((message) => message.id));
  thread.messages = [...thread.messages, ...messages];
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationViewportBottomFollowUntil = Date.now() + 5000;
  state.conversationViewportSettleUntil = Date.now() + 900;
  state.conversationPinnedToBottom = true;
  if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: true });
  if (typeof scheduleConversationBottomStick === "function" && typeof isSingleWindowChatView === "function" && isSingleWindowChatView()) {
    scheduleConversationBottomStick();
  }
  return { threadId: thread.id, ids };
}

function clearOptimisticSendMessages(token, options = {}) {
  if (!token?.ids?.size || !state.currentThread || state.currentThread.id !== token.threadId) return false;
  const model = currentChatComposerPendingSendModel();
  if (typeof model?.clearOptimisticSendPlan === "function") {
    const before = state.currentThread.messages || [];
    const clearedThread = model.clearOptimisticSendPlan(state.currentThread, {
      threadId: token.threadId,
      ids: Array.from(token.ids),
      localPendingSendId: token.localPendingSendId || "",
    });
    const after = Array.isArray(clearedThread?.messages) ? Array.from(clearedThread.messages) : before;
    if (after.length === before.length) return false;
    state.currentThread.messages = after;
    if (options.render !== false && typeof renderCurrentThread === "function") {
      renderCurrentThread({ stickToBottom: true });
    }
    return true;
  }
  const before = state.currentThread.messages || [];
  const after = before.filter((message) => !token.ids.has(message.id));
  if (after.length === before.length) return false;
  state.currentThread.messages = after;
  if (options.render !== false && typeof renderCurrentThread === "function") {
    renderCurrentThread({ stickToBottom: true });
  }
  return true;
}
