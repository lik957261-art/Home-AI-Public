"use strict";

const CHAT_COMPOSER_EVENT_STATE_MODEL_ESM_PATH = "/vite-islands/chat-composer-event-state-model/chat-composer-event-state-model.js";
let chatComposerEventStateModel = null;
let chatComposerEventStateModelPromise = null;

function importChatComposerEventStateModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerEventStateModel) return Promise.resolve(chatComposerEventStateModel);
  if (!chatComposerEventStateModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerEventStateModel === "function"
      ? rootRef.__homeAiImportChatComposerEventStateModel
      : (path) => import(path);
    chatComposerEventStateModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_EVENT_STATE_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerEventStateModel = model || null;
        return chatComposerEventStateModel;
      })
      .catch((error) => {
        chatComposerEventStateModelPromise = null;
        throw error;
      });
  }
  return chatComposerEventStateModelPromise;
}

function currentChatComposerEventStateModel() {
  return chatComposerEventStateModel;
}

if (typeof window !== "undefined") {
  importChatComposerEventStateModel().catch(() => null);
}

function composerEventStateTaskGroupMatchesSearch(thread) {
  const search = currentSearchText().toLowerCase();
  return taskListGroupsForThread(state.currentThread).some((group) => {
    if (!taskMatchesDirectoryFilter(group)) return false;
    if (!search) return true;
    return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
  });
}

function threadMatchesSelection(thread) {
  const model = currentChatComposerEventStateModel();
  if (typeof model?.threadMatchesSelectionPlan === "function") {
    const viewMode = state.viewMode || "";
    const currentThreadMatches = viewMode === "tasks" && state.currentThread?.id === thread?.id;
    return Boolean(model.threadMatchesSelectionPlan({
      threadExists: Boolean(thread),
      selectedWorkspaceId: state.selectedWorkspaceId || "",
      threadWorkspaceId: thread?.workspaceId || "",
      threadGroupMemberIds: thread ? threadGroupMemberIds(thread) : [],
      viewMode,
      threadSingleWindow: Boolean(thread?.singleWindow),
      currentThreadId: state.currentThread?.id || "",
      threadId: thread?.id || "",
      taskGroupMatches: currentThreadMatches ? composerEventStateTaskGroupMatchesSearch(thread) : false,
      search: currentSearchText(),
      threadTitle: thread?.title || "",
      threadPreview: thread?.preview || "",
      selectedProjectId: state.selectedProjectId || "",
      threadProjectId: thread?.projectId || "",
      selectedSubprojectId: state.selectedSubprojectId || "",
      threadSubprojectId: thread?.subprojectId || "",
    }));
  }
  if (!thread) return false;
  if (
    state.selectedWorkspaceId
    && thread.workspaceId !== state.selectedWorkspaceId
    && !threadGroupMemberIds(thread).includes(state.selectedWorkspaceId)
  ) return false;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (!thread.singleWindow) return false;
    const search = currentSearchText().toLowerCase();
    if (state.viewMode === "tasks" && state.currentThread?.id === thread.id) {
      return taskListGroupsForThread(state.currentThread).some((group) => {
        if (!taskMatchesDirectoryFilter(group)) return false;
        if (!search) return true;
        return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
      });
    }
    if (!search) return true;
    return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
  }
  if (state.selectedProjectId && thread.projectId !== state.selectedProjectId) return false;
  if (state.selectedSubprojectId && (thread.subprojectId || "") !== state.selectedSubprojectId) return false;
  const search = currentSearchText().toLowerCase();
  if (!search) return true;
  return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
}

function upsertThreadSummary(thread) {
  if (!thread) return;
  const index = state.threads.findIndex((item) => item.id === thread.id);
  const matchesSelection = threadMatchesSelection(thread);
  const model = currentChatComposerEventStateModel();
  const plan = typeof model?.threadSummaryUpsertPlan === "function"
    ? model.threadSummaryUpsertPlan({
      threadExists: Boolean(thread),
      existingIndex: index,
      matchesSelection,
    })
    : {
      action: matchesSelection ? (index >= 0 ? "merge" : "insert") : (index >= 0 ? "remove" : "ignore"),
      shouldRenderThreads: true,
    };
  if (plan.action === "remove" || plan.action === "ignore") {
    if (index >= 0) state.threads.splice(index, 1);
    if (plan.shouldRenderThreads) renderThreads();
    return;
  }
  if (index >= 0) state.threads[index] = Object.assign({}, state.threads[index], thread);
  else state.threads.unshift(thread);
  state.threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (plan.shouldRenderThreads) renderThreads();
}

function upsertMessage(message) {
  const model = currentChatComposerEventStateModel();
  const plan = typeof model?.currentMessageUpsertPlan === "function"
    ? model.currentMessageUpsertPlan({
      currentThreadExists: Boolean(state.currentThread),
      messageExists: Boolean(message),
      viewMode: state.viewMode || "",
      currentThreadSingleWindow: Boolean(state.currentThread?.singleWindow),
      sharedTopicThread: typeof currentTaskThreadIsSharedTopicThread === "function" && currentTaskThreadIsSharedTopicThread(),
    })
    : {
      shouldUpsert: Boolean(state.currentThread && message),
      shouldRememberTaskListThread: Boolean(state.viewMode === "tasks" && state.currentThread?.singleWindow && !currentTaskThreadIsSharedTopicThread()),
      shouldOfferOwnerElevation: true,
      shouldRenderThreads: state.viewMode === "tasks",
      shouldInvalidateProjection: true,
    };
  if (!plan.shouldUpsert) return;
  const messages = (state.currentThread.messages || [])
    .filter((item) => !localPendingSendReplacedByIncoming(item, [message], state.currentThread.messages || []));
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
  else messages.push(message);
  state.currentThread.messages = sortedThreadMessages(messages);
  if (plan.shouldRememberTaskListThread) {
    rememberTaskListThread(state.currentThread);
  }
  const mergedMessage = index >= 0 ? state.currentThread.messages.find((item) => item.id === message.id) || message : message;
  if (plan.shouldOfferOwnerElevation) offerOwnerElevationForMessage(mergedMessage).catch(showError);
  if (plan.shouldRenderThreads) renderThreads();
  if (plan.shouldInvalidateProjection) {
    invalidateComposerMessageProjection(mergedMessage, {
      existingIndex: index,
      delayMs: 0,
    });
  }
}

function upsertCachedChatScopeMessage(threadId, message, threadSummary = null) {
  if (!threadId || !message) return false;
  const model = currentChatComposerEventStateModel();
  const plan = typeof model?.cachedChatScopeMessagePlan === "function"
    ? model.cachedChatScopeMessagePlan({
      threadId,
      messageExists: Boolean(message),
      groupThreadMatches: state.groupChatThread?.id === threadId,
      privateThreadMatches: state.privateChatThread?.id === threadId,
      singleWindowChatView: isSingleWindowChatView(),
    })
    : {
      shouldUpdateGroupChat: state.groupChatThread?.id === threadId,
      shouldUpdatePrivateChat: state.privateChatThread?.id === threadId,
      touched: Boolean(state.groupChatThread?.id === threadId || state.privateChatThread?.id === threadId),
      shouldRenderChatScopeHeader: Boolean((state.groupChatThread?.id === threadId || state.privateChatThread?.id === threadId) && isSingleWindowChatView()),
    };
  let touched = false;
  const update = (thread) => {
    const messages = (thread.messages || [])
      .filter((item) => !localPendingSendReplacedByIncoming(item, [message], thread.messages || []));
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
    else messages.push(message);
    touched = true;
    return Object.assign({}, thread, threadSummary || {}, {
      messages: sortedThreadMessages(messages),
      updatedAt: threadSummary?.updatedAt || message.updatedAt || thread.updatedAt,
    });
  };
  if (plan.shouldUpdateGroupChat) {
    state.groupChatThread = update(state.groupChatThread);
    state.groupChatAvailable = true;
    state.groupChatThreadId = state.groupChatThread.id;
  }
  if (plan.shouldUpdatePrivateChat) {
    state.privateChatThread = update(state.privateChatThread);
  }
  if (touched && plan.shouldRenderChatScopeHeader) renderChatScopeHeader(state.currentThread);
  return touched;
}
