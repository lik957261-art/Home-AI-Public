"use strict";

function optimisticSendTaskGroupId(body = {}) {
  if (body.taskGroupId) return body.taskGroupId;
  if (state.viewMode === "single" && state.singleWindowMode === "chat" && typeof activeChatTaskGroupId === "function") {
    return activeChatTaskGroupId();
  }
  return "";
}

function optimisticSendShouldAppendAssistant(body = {}) {
  return !(state.viewMode === "single" && state.singleWindowMode === "chat" && body.messageKind === "plain");
}

function appendOptimisticSendMessages(body = {}, text = "") {
  const thread = state.currentThread;
  if (!thread?.id || !Array.isArray(thread.messages)) return null;
  const nowMs = Date.now();
  const baseId = `local_send_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
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
  const before = state.currentThread.messages || [];
  const after = before.filter((message) => !token.ids.has(message.id));
  if (after.length === before.length) return false;
  state.currentThread.messages = after;
  if (options.render !== false && typeof renderCurrentThread === "function") {
    renderCurrentThread({ stickToBottom: true });
  }
  return true;
}
