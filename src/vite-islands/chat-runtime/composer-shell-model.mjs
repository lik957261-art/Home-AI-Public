const CHAT_COMPOSER_SHELL_MODEL_VERSION = "20260704-vite-chat-composer-shell-model-v1";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function cleanString(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function composerShellViewStatePlan(input = {}) {
  const state = asObject(input.state);
  const thread = asObject(state.currentThread);
  const viewMode = cleanString(state.viewMode, 80);
  const singleWindow = Boolean(thread.singleWindow);
  const currentSingleWindowLoaded = Boolean(
    thread
    && singleWindow
    && (thread.workspaceId === state.selectedWorkspaceId || input.selectedWorkspaceInThreadGroup)
  );
  const skillDetailView = Boolean(state.skillDetail);
  const taskWindowView = viewMode === "tasks" && singleWindow;
  const taskDetailView = !skillDetailView && taskWindowView && Boolean(state.currentTaskGroupId);
  const todoDetailView = viewMode === "todos" && Boolean(state.selectedTodoId);
  const automationDetailView = viewMode === "automation" && Boolean(state.selectedAutomationId);
  const actionInboxDetailView = viewMode === "inbox" && Boolean(state.selectedActionInboxItemId);
  return Object.freeze({
    version: CHAT_COMPOSER_SHELL_MODEL_VERSION,
    currentSingleWindowLoaded,
    skillDetailView,
    taskDetailView,
    todoDetailView,
    taskWindowView,
    taskListView: taskWindowView && !state.currentTaskGroupId,
    todoView: viewMode === "todos",
    automationView: viewMode === "automation",
    automationDetailView,
    actionInboxView: viewMode === "inbox",
    actionInboxDetailView,
    actionInboxCreateView: viewMode === "inbox" && Boolean(state.actionInboxCreateOpen),
    singleWindowView: viewMode === "single" && singleWindow,
    singleWindowChatView: viewMode === "single" && singleWindow && state.singleWindowMode === "chat",
  });
}

function sidebarBackActionPlan(input = {}) {
  const state = asObject(input.state);
  const view = asObject(input.viewState);
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "open_task_list_and_close_sidebar" });
  }
  if (view.todoDetailView) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "open_todo_list_and_close_sidebar" });
  }
  if (input.kanbanComposerOpen) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "open_todo_list_and_close_sidebar" });
  }
  if (input.automationDetailInboxReturnActive) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "close_automation_secondary_and_sidebar" });
  }
  if (view.automationDetailView) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "open_automation_list_and_close_sidebar" });
  }
  if (view.actionInboxDetailView) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "open_action_inbox_overview_and_close_sidebar" });
  }
  if (input.mobileLayout) {
    return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "close_sidebar" });
  }
  return Object.freeze({ version: CHAT_COMPOSER_SHELL_MODEL_VERSION, action: "reset_sidebar_scroll" });
}

function composerStopModePlan(input = {}) {
  const activeRunIds = arrayFrom(input.activeRunIds).filter(Boolean);
  const stopMode = Boolean(
    !input.chatSearchMode
    && activeRunIds.length
    && !(input.singleWindowView && input.hasDraft)
  );
  return Object.freeze({
    version: CHAT_COMPOSER_SHELL_MODEL_VERSION,
    stopMode,
  });
}

function composerActionViewPlan(input = {}) {
  const chatSearchMode = Boolean(input.chatSearchMode);
  const mentionAvailable = Boolean(input.mentionAvailable);
  if (chatSearchMode) {
    return Object.freeze({
      version: CHAT_COMPOSER_SHELL_MODEL_VERSION,
      chatSearchMode: true,
      closeMentionMenu: true,
      updateSourceControl: true,
      input: Object.freeze({
        enterkeyhint: "search",
        ariaLabel: "Search chat",
      }),
      composerClass: Object.freeze({ name: "chat-search-composer", enabled: true }),
      inputClass: Object.freeze({ name: "chat-search-editor", enabled: true }),
      attach: Object.freeze({
        text: "\u00d7",
        disabled: false,
        ariaLabel: "\u5173\u95ed\u641c\u7d22",
        title: "\u5173\u95ed\u641c\u7d22",
      }),
      searchButtons: Object.freeze({ hidePrevNext: false }),
      button: Object.freeze({
        label: "\u641c\u7d22",
        stopMode: false,
        disabled: !cleanString(input.chatSearchDraft, 4000),
      }),
      updateChatSearchStatus: true,
      renderComposerContext: true,
      refreshVoiceInputSendButton: true,
    });
  }
  const stopMode = Boolean(input.stopMode);
  return Object.freeze({
    version: CHAT_COMPOSER_SHELL_MODEL_VERSION,
    chatSearchMode: false,
    closeMentionMenu: !mentionAvailable,
    updateSourceControl: true,
    input: Object.freeze({
      enterkeyhint: "send",
      ariaLabel: "Message Home AI",
    }),
    composerClass: Object.freeze({ name: "chat-search-composer", enabled: false }),
    inputClass: Object.freeze({ name: "chat-search-editor", enabled: false }),
    attach: Object.freeze({
      text: "+",
      disabled: null,
      ariaLabel: "\u6dfb\u52a0\u6587\u4ef6",
      title: "\u6dfb\u52a0\u6587\u4ef6",
    }),
    searchButtons: Object.freeze({ hidePrevNext: true }),
    button: Object.freeze({
      label: stopMode ? "Stop" : "Send",
      stopMode,
      disabled: stopMode ? false : null,
    }),
    updateChatSearchStatus: true,
    renderComposerContext: true,
    refreshVoiceInputSendButton: true,
  });
}

export {
  CHAT_COMPOSER_SHELL_MODEL_VERSION,
  composerActionViewPlan,
  composerShellViewStatePlan,
  composerStopModePlan,
  sidebarBackActionPlan,
};
