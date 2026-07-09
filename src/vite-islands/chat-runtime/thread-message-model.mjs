const THREAD_MESSAGE_MODEL_VERSION = "20260705-vite-thread-message-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function createThreadActionPlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const viewMode = cleanString(state.viewMode, 80);
  const currentSingleWindowLoaded = Boolean(input.currentSingleWindowLoaded);
  const mobileLayout = Boolean(input.mobileLayout);
  const todoCreateOpen = Boolean(state.todoCreateOpen);
  const action = viewMode === "single"
    ? "load_single_window"
    : viewMode === "todos"
      ? "open_todo_create"
      : viewMode === "tasks"
        ? (currentSingleWindowLoaded ? "render_task_root" : "load_task_root")
        : viewMode === "automation"
          ? "render_automation"
          : viewMode === "projects"
            ? "load_directory"
            : "create_draft_thread";
  return Object.freeze({
    version: THREAD_MESSAGE_MODEL_VERSION,
    action,
    clearQuotedReply: true,
    clearTransientProjectRoute: action === "create_draft_thread",
    clearCurrentTaskGroupId: action === "render_task_root" || action === "load_task_root",
    closeSidebar: mobileLayout && ["open_todo_create", "render_task_root", "load_task_root", "create_draft_thread"].includes(action),
    resetTodoSelection: action === "open_todo_create",
    resetKanbanComposer: action === "open_todo_create" && !todoCreateOpen,
    setTodoCreateOpen: action === "open_todo_create",
    loadTodos: action === "open_todo_create",
    loadSingleWindow: action === "load_single_window" || action === "load_task_root",
    renderThreads: action === "render_task_root" || action === "create_draft_thread",
    renderCurrentThread: action === "render_task_root" || action === "create_draft_thread",
    renderCurrentThreadOptions: Object.freeze({ stickToBottom: true }),
    enableComposer: action === "render_task_root" || action === "create_draft_thread",
    focusTarget: action === "open_todo_create" ? "todo_form" : ["render_task_root", "load_task_root", "create_draft_thread"].includes(action) ? "composer" : "",
  });
}

function selectThreadRequestPlan(threadId = "") {
  const id = cleanString(threadId, 240);
  return Object.freeze({
    version: THREAD_MESSAGE_MODEL_VERSION,
    ok: Boolean(id),
    threadId: id,
    path: id ? `/api/threads/${encodeURIComponent(id)}` : "",
    renderOptions: Object.freeze({ stickToBottom: true }),
  });
}

function openProjectTaskRequestPlan(input = {}) {
  const sourceThreadId = cleanString(input.sourceThreadId, 240);
  const taskGroupId = cleanString(input.taskGroupId, 240);
  const messageLimit = Math.max(1, Number(input.messageLimit || 30) || 30);
  const params = new URLSearchParams({
    messageMode: "tasks",
    taskGroupId,
    messageLimit: String(messageLimit),
  });
  return Object.freeze({
    version: THREAD_MESSAGE_MODEL_VERSION,
    ok: Boolean(sourceThreadId && taskGroupId),
    sourceThreadId,
    taskGroupId,
    viewMode: "tasks",
    storage: Object.freeze({ key: "hermesWebViewMode", value: "tasks" }),
    path: sourceThreadId && taskGroupId ? `/api/threads/${encodeURIComponent(sourceThreadId)}?${params.toString()}` : "",
    renderOptions: Object.freeze({ stickToBottom: true }),
  });
}

function composerPlaceholderPlan(input = {}) {
  const singleWindowView = Boolean(input.singleWindowView);
  const singleWindowChatView = Boolean(input.singleWindowChatView);
  const quotedReply = Boolean(input.quotedReply);
  const defaultPlaceholder = cleanString(input.defaultPlaceholder || "Message Home AI...", 240) || "Message Home AI...";
  return Object.freeze({
    version: THREAD_MESSAGE_MODEL_VERSION,
    placeholder: singleWindowView && !singleWindowChatView && quotedReply ? "Reply to quoted task..." : defaultPlaceholder,
  });
}

function composerStatePlan(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const options = input.options && typeof input.options === "object" ? input.options : {};
  const viewMode = cleanString(state.viewMode, 80);
  const taskGroupId = cleanString(state.currentTaskGroupId, 180);
  const directoryTopicDraft = Boolean(input.directoryTopicDraft);
  const taskListRoot = viewMode === "tasks" && !taskGroupId && !directoryTopicDraft;
  const searchMode = Boolean(input.searchMode);
  const enabled = taskListRoot ? false : Boolean(options.enabled);
  const hidden = taskListRoot || Boolean(options.hidden);
  const shellLocked = Boolean(options.shellLocked) && !hidden && !searchMode;
  const visuallyEnabled = enabled || shellLocked || searchMode;
  const basePlaceholder = cleanString(options.placeholder || input.defaultPlaceholder || "Message Home AI...", 240) || "Message Home AI...";
  const placeholder = searchMode
    ? "搜索聊天"
    : composerPlaceholderPlan({
      singleWindowView: input.singleWindowView,
      singleWindowChatView: input.singleWindowChatView,
      quotedReply: state.quotedReply,
      defaultPlaceholder: basePlaceholder,
    }).placeholder;
  return Object.freeze({
    version: THREAD_MESSAGE_MODEL_VERSION,
    taskListRoot,
    enabled,
    hidden,
    searchMode,
    shellLocked,
    visuallyEnabled,
    editorEnabled: visuallyEnabled,
    shouldHideBeforeUpdate: hidden && !searchMode,
    shouldShowAfterUpdate: !hidden || searchMode,
    shouldClearKeyboardViewportMetrics: !enabled,
    shouldBlurFocusedEditable: !visuallyEnabled || (hidden && !searchMode),
    blurReason: "composer_hidden_or_disabled",
    ariaBusy: shellLocked ? "true" : "false",
    placeholder,
    attachDisabled: searchMode ? false : !visuallyEnabled,
    sendDisabled: searchMode ? !cleanString(input.chatSearchDraft, 4000) : !visuallyEnabled,
  });
}

export {
  THREAD_MESSAGE_MODEL_VERSION,
  composerPlaceholderPlan,
  composerStatePlan,
  createThreadActionPlan,
  openProjectTaskRequestPlan,
  selectThreadRequestPlan,
};
