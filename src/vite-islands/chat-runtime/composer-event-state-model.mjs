export const CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION = "20260704.composer-event-state.v1";

function cleanSearch(value = "") {
  return String(value || "").trim().toLowerCase();
}

function textIncludesSearch(value = "", search = "") {
  const needle = cleanSearch(search);
  if (!needle) return true;
  return String(value || "").toLowerCase().includes(needle);
}

export function threadMatchesSelectionPlan(input = {}) {
  if (!input.threadExists) return false;
  const selectedWorkspaceId = String(input.selectedWorkspaceId || "");
  if (
    selectedWorkspaceId
    && input.threadWorkspaceId !== selectedWorkspaceId
    && !Array.isArray(input.threadGroupMemberIds)
  ) {
    return false;
  }
  if (
    selectedWorkspaceId
    && input.threadWorkspaceId !== selectedWorkspaceId
    && !input.threadGroupMemberIds.includes(selectedWorkspaceId)
  ) {
    return false;
  }
  const viewMode = String(input.viewMode || "");
  const search = cleanSearch(input.search);
  if (viewMode === "single" || viewMode === "tasks") {
    if (!input.threadSingleWindow) return false;
    if (viewMode === "tasks" && input.currentThreadId === input.threadId) {
      return Boolean(input.taskGroupMatches);
    }
    return textIncludesSearch(`${input.threadTitle || ""}\n${input.threadPreview || ""}`, search);
  }
  if (input.selectedProjectId && input.threadProjectId !== input.selectedProjectId) return false;
  if (input.selectedSubprojectId && String(input.threadSubprojectId || "") !== String(input.selectedSubprojectId || "")) {
    return false;
  }
  return textIncludesSearch(`${input.threadTitle || ""}\n${input.threadPreview || ""}`, search);
}

export function threadSummaryUpsertPlan(input = {}) {
  if (!input.threadExists) {
    return {
      version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      action: "ignore",
      shouldRenderThreads: false,
    };
  }
  if (!input.matchesSelection) {
    return {
      version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      action: input.existingIndex >= 0 ? "remove" : "ignore",
      shouldRenderThreads: true,
    };
  }
  return {
    version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
    action: input.existingIndex >= 0 ? "merge" : "insert",
    shouldRenderThreads: true,
  };
}

export function currentMessageUpsertPlan(input = {}) {
  if (!input.currentThreadExists || !input.messageExists) {
    return {
      version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      shouldUpsert: false,
      shouldRememberTaskListThread: false,
      shouldOfferOwnerElevation: false,
      shouldRenderThreads: false,
      shouldInvalidateProjection: false,
    };
  }
  const tasksMode = input.viewMode === "tasks";
  return {
    version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
    shouldUpsert: true,
    shouldRememberTaskListThread: Boolean(tasksMode && input.currentThreadSingleWindow && !input.sharedTopicThread),
    shouldOfferOwnerElevation: true,
    shouldRenderThreads: tasksMode,
    shouldInvalidateProjection: true,
  };
}

export function cachedChatScopeMessagePlan(input = {}) {
  const hasThreadId = Boolean(input.threadId);
  const hasMessage = Boolean(input.messageExists);
  const shouldUpdateGroupChat = Boolean(hasThreadId && hasMessage && input.groupThreadMatches);
  const shouldUpdatePrivateChat = Boolean(hasThreadId && hasMessage && input.privateThreadMatches);
  const touched = shouldUpdateGroupChat || shouldUpdatePrivateChat;
  return {
    version: CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
    shouldUpdateGroupChat,
    shouldUpdatePrivateChat,
    touched,
    shouldRenderChatScopeHeader: Boolean(touched && input.singleWindowChatView),
  };
}
