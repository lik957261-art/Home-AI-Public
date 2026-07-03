"use strict";


async function createThread() {
  clearQuotedReply({ render: false });
  if (state.viewMode === "single") {
    await loadSingleWindow();
    return;
  }
  if (state.viewMode === "todos") {
    state.selectedTodoId = "";
    if (!state.todoCreateOpen) {
      state.kanbanComposerMessages = [];
      state.kanbanPlanDraft = null;
      finishKanbanComposerProgress();
    }
    state.todoCreateOpen = true;
    await loadTodos();
    if (isMobileLayout()) closeSidebar();
    focusTodoFormSoon();
    return;
  }
  if (state.viewMode === "tasks") {
    state.currentTaskGroupId = "";
    if (isMobileLayout()) closeSidebar();
    if (isCurrentSingleWindowLoaded()) {
      renderThreads();
      renderCurrentThread({ stickToBottom: true });
      focusComposerSoon();
      return;
    }
    await loadSingleWindow();
    focusComposerSoon();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "projects") {
    await loadDirectoryView();
    return;
  }
  state.transientProjectRoute = null;
  if (isMobileLayout()) closeSidebar();
  const draft = createDraftThread();
  state.currentThread = draft;
  state.currentThreadId = draft.id;
  state.threads = [draft, ...state.threads.filter((thread) => !isDraftThread(thread))];
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  focusComposerSoon();
}

async function selectThread(threadId) {
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.currentThreadId = threadId;
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  if (isMobileLayout()) closeSidebar();
}

async function openProjectTask(sourceThreadId, taskGroupId) {
  if (!sourceThreadId || !taskGroupId) return;
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentThreadId = sourceThreadId;
  const params = new URLSearchParams({
    messageMode: "tasks",
    taskGroupId,
    messageLimit: String(typeof taskDetailMessageInitialLimit === "function" ? taskDetailMessageInitialLimit() : 30),
  });
  const result = await api(`/api/threads/${encodeURIComponent(sourceThreadId)}?${params.toString()}`);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const directoryTopicDraft = typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive();
  const taskListRoot = state.viewMode === "tasks" && !state.currentTaskGroupId && !directoryTopicDraft;
  const enabled = taskListRoot ? false : Boolean(options.enabled);
  const searchMode = isChatSearchMode();
  const hidden = taskListRoot || Boolean(options.hidden);
  const composer = $("composer");
  const shellLocked = Boolean(options.shellLocked) && !hidden && !searchMode;
  const visuallyEnabled = enabled || shellLocked || searchMode;
  if (composer && Boolean(hidden) && !searchMode) {
    composer.hidden = true;
    composer.setAttribute("aria-hidden", "true");
  }
  if (composer) {
    composer.classList.toggle("composer-shell-locked", shellLocked);
    composer.setAttribute("aria-busy", shellLocked ? "true" : "false");
  }
  if (!enabled && typeof clearKeyboardViewportMetrics === "function") clearKeyboardViewportMetrics();
  setComposerEditorEnabled(visuallyEnabled);
  if ((!visuallyEnabled || (Boolean(hidden) && !searchMode)) && typeof blurFocusedEditableIfStale === "function") {
    blurFocusedEditableIfStale("composer_hidden_or_disabled");
  }
  setComposerPlaceholder(searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Home AI..."));
  $("attachFile").disabled = searchMode ? false : !visuallyEnabled;
  $("sendMessage").disabled = searchMode ? !currentChatSearchDraft() : !visuallyEnabled;
  updateComposerAction();
  renderQuotedReply();
  if (composer && !(Boolean(hidden) && !searchMode)) {
    composer.hidden = false;
    composer.setAttribute("aria-hidden", "false");
  }
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Home AI..." });
}

function setComposerEditorEnabled(enabled) {
  const input = $("messageInput");
  if (!input) return;
  if ("disabled" in input) input.disabled = !enabled;
  else input.setAttribute("contenteditable", enabled ? "plaintext-only" : "false");
  input.dataset.disabled = enabled ? "" : "true";
  input.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setComposerPlaceholder(text) {
  const input = $("messageInput");
  if (input) {
    input.dataset.placeholder = text || "";
    if ("placeholder" in input) input.placeholder = text || "";
  }
}

function composerPlaceholder(fallback) {
  return isSingleWindowView() && !isSingleWindowChatView() && state.quotedReply ? "Reply to quoted task..." : fallback;
}
