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
  if (state.viewMode === "learning") {
    renderLearningCoinsView();
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
  const result = await api(`/api/threads/${encodeURIComponent(sourceThreadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const enabled = Boolean(options.enabled);
  const searchMode = isChatSearchMode();
  if (!enabled && typeof clearKeyboardViewportMetrics === "function") clearKeyboardViewportMetrics();
  setComposerEditorEnabled(enabled || searchMode);
  setComposerPlaceholder(searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Hermes..."));
  $("attachFile").disabled = searchMode ? false : !enabled;
  $("sendMessage").disabled = searchMode ? !currentChatSearchDraft() : !enabled;
  updateComposerAction();
  renderQuotedReply();
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Hermes..." });
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
