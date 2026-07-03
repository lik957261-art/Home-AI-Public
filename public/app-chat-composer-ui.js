"use strict";

function sidebarBackToMenu() {
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    openTaskList();
    closeSidebar();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (kanbanComposerOpen()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (typeof automationDetailInboxReturnActive === "function" && automationDetailInboxReturnActive()) {
    closeAutomationSecondarySurface();
    closeSidebar();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    closeSidebar();
    return;
  }
  if (isActionInboxDetailView()) {
    openActionInboxOverview();
    closeSidebar();
    return;
  }
  if (isMobileLayout()) {
    closeSidebar();
    return;
  }
  resetSidebarScroll();
}

function isMobileLayout() {
  return true;
}

function isCurrentSingleWindowLoaded() {
  return Boolean(
    state.currentThread &&
    state.currentThread.singleWindow &&
    (state.currentThread.workspaceId === state.selectedWorkspaceId || selectedWorkspaceInThreadGroup(state.currentThread))
  );
}

function isSkillDetailView() {
  return Boolean(state.skillDetail);
}

function isTaskDetailView() {
  return !isSkillDetailView() && state.viewMode === "tasks" && Boolean(state.currentTaskGroupId) && Boolean(state.currentThread?.singleWindow);
}

function isTodoDetailView() {
  return state.viewMode === "todos" && Boolean(state.selectedTodoId);
}

function isTaskWindowView() {
  return state.viewMode === "tasks" && Boolean(state.currentThread?.singleWindow);
}

function isTaskListView() {
  return isTaskWindowView() && !state.currentTaskGroupId;
}

function isTodoView() {
  return state.viewMode === "todos";
}

function isAutomationView() {
  return state.viewMode === "automation";
}

function isAutomationDetailView() {
  return state.viewMode === "automation" && Boolean(state.selectedAutomationId);
}

function isActionInboxView() {
  return state.viewMode === "inbox";
}

function isActionInboxDetailView() {
  return state.viewMode === "inbox" && Boolean(state.selectedActionInboxItemId);
}

function isActionInboxCreateView() {
  return state.viewMode === "inbox" && Boolean(state.actionInboxCreateOpen);
}

function isSingleWindowView() {
  return state.viewMode === "single" && Boolean(state.currentThread?.singleWindow);
}

function isSingleWindowChatView() {
  return isSingleWindowView() && state.singleWindowMode === "chat";
}

function isComposerStopMode() {
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
  return true;
}

function setComposerActionButtonVisualLabel(button, label) {
  if (!button) return;
  if (typeof voiceInputSetButtonVisualLabel === "function") {
    voiceInputSetButtonVisualLabel(button, label);
    return;
  }
  if (String(label || "") === "Stop") {
    button.classList.add("voice-input-label-proxy", "voice-input-stop-proxy");
    button.dataset.voiceInputVisualLabel = "";
    button.textContent = "";
    return;
  }
  button.classList.remove("voice-input-label-proxy", "voice-input-stop-proxy");
  delete button.dataset.voiceInputVisualLabel;
  button.textContent = String(label || "");
}

function updateComposerAction() {
  const button = $("sendMessage");
  if (!button) return;
  const composer = $("composer");
  const attach = $("attachFile");
  const input = $("messageInput");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  composer?.classList.toggle("chat-search-composer", searchMode);
  input?.classList.toggle("chat-search-editor", searchMode);
  if (searchMode || !composerMentionAvailable()) closeGroupMentionMenu();
  updateComposerSourceControl();
  if (input) {
    input.setAttribute("enterkeyhint", searchMode ? "search" : "send");
    input.setAttribute("aria-label", searchMode ? "Search chat" : "Message Home AI");
  }
  if (searchMode) {
    if (attach) {
      attach.textContent = "×";
      attach.disabled = false;
      attach.setAttribute("aria-label", "关闭搜索");
      attach.setAttribute("title", "关闭搜索");
    }
    const draft = currentChatSearchDraft();
    setComposerActionButtonVisualLabel(button, "搜索");
    button.classList.remove("stop-mode");
    button.disabled = !draft;
    updateChatSearchStatus();
    renderComposerContext();
    if (typeof refreshVoiceInputSendButton === "function") refreshVoiceInputSendButton();
    return;
  }
  if (prevSearch) {
    prevSearch.hidden = true;
    prevSearch.disabled = true;
  }
  if (nextSearch) {
    nextSearch.hidden = true;
    nextSearch.disabled = true;
  }
  if (attach) {
    attach.textContent = "+";
    attach.setAttribute("aria-label", "添加文件");
    attach.setAttribute("title", "添加文件");
  }
  updateChatSearchStatus();
  const stopMode = isComposerStopMode();
  setComposerActionButtonVisualLabel(button, stopMode ? "Stop" : "Send");
  button.classList.toggle("stop-mode", stopMode);
  if (stopMode) button.disabled = false;
  renderComposerContext();
  if (typeof refreshVoiceInputSendButton === "function") refreshVoiceInputSendButton();
}
