"use strict";

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "task" ? "task" : "chat";
}

function setSingleWindowMode(mode) {
  state.singleWindowMode = normalizeSingleWindowMode(mode);
  localStorage.setItem("hermesWebSingleWindowMode", state.singleWindowMode);
  if (state.singleWindowMode === "chat") clearQuotedReply({ render: false });
}

function reasoningEffortLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((item) => item.value === effort)?.label
    || TASK_REASONING_OPTIONS.find((item) => item.value === effort)?.label
    || (effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : "Medium");
}

function defaultReasoningLabel() {
  return reasoningEffortLabel(state.defaultReasoningEffort || "medium");
}

function defaultReasoningCompactLabel() {
  return fallbackReasoningCompactLabel(state.defaultReasoningEffort || "medium");
}

function taskReasoningCompactLabel(item) {
  if (!item?.value) return defaultReasoningCompactLabel();
  const effort = String(item.value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((option) => option.value === effort)?.shortLabel
    || fallbackReasoningCompactLabel(effort)
    || item.label
    || item.value;
}

function validTaskReasoningEffort(value) {
  const next = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().some((item) => item.value === next) ? next : "";
}

function currentTaskGroup() {
  if (!state.currentThread || !state.currentTaskGroupId) return null;
  return taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId) || null;
}

function taskReasoningEffort(group) {
  const messages = Array.isArray(group?.messages) ? group.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const effort = validTaskReasoningEffort(messages[index]?.reasoningEffort || messages[index]?.reasoning_effort || "");
    if (effort) return effort;
  }
  return "";
}

function taskReasoningControlValue() {
  if (state.pendingTaskReasoningExplicit) return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort)
    || (isTaskDetailView() ? taskReasoningEffort(currentTaskGroup()) : "")
    || "";
}

function selectedTaskReasoningEffort() {
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
}

function selectedComposerReasoningEffort(text = getComposerText()) {
  const mentionEffort = composerAiMentionInfo(text).reasoningEffort;
  if (mentionEffort) return mentionEffort;
  return state.viewMode === "tasks" ? selectedTaskReasoningEffort() : "";
}

function updateTaskReasoningControl() {
  renderComposerContext();
}

function ensureVerticalScrollAffordance(container = $("conversation")) {
  if (!container) return;
  [...container.children]
    .filter((item) => item.classList?.contains("scroll-affordance-spacer"))
    .forEach((item) => item.remove());
  const spacer = document.createElement("div");
  spacer.className = "scroll-affordance-spacer";
  spacer.setAttribute("aria-hidden", "true");
  container.appendChild(spacer);
  requestAnimationFrame(() => {
    const deficit = container.clientHeight - container.scrollHeight;
    spacer.style.height = `${Math.max(1, deficit + 18)}px`;
  });
}

function currentScrollFeedbackSurface(container = $("conversation")) {
  if (!isTaskListView()) return null;
  return container?.querySelector?.(".task-grid") || container?.querySelector?.(".empty-state") || null;
}

function clearScrollFeedbackSurface(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging", "scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
}

function applyScrollFeedback(surface, dy) {
  if (!surface) return 0;
  const sign = dy < 0 ? -1 : 1;
  const offset = sign * Math.min(48, Math.abs(dy) * 0.34);
  surface.classList.add("scroll-feedback-dragging");
  surface.style.transform = `translate3d(0, ${offset}px, 0)`;
  surface.style.opacity = String(1 - Math.min(0.16, Math.abs(offset) / 420));
  return offset;
}

function settleScrollFeedback(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging");
  surface.classList.add("scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => clearScrollFeedbackSurface(surface), prefersReducedMotion() ? 0 : 180);
}

function wireConversationScrollFeedback() {
  const container = $("conversation");
  if (!container || container.dataset.scrollFeedbackBound) return;
  container.dataset.scrollFeedbackBound = "1";
  container.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const surface = currentScrollFeedbackSurface(container);
    if (!surface) return;
    state.scrollFeedback = {
      surface,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      dragging: false,
    };
  }, { passive: true });
  container.addEventListener("touchmove", (event) => {
    const feedback = state.scrollFeedback;
    if (!feedback || !isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const dx = event.touches[0].clientX - feedback.startX;
    const dy = event.touches[0].clientY - feedback.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (!feedback.dragging) {
      if (vertical < 10 || vertical < horizontal * 1.2) return;
      feedback.dragging = true;
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const contentShort = (feedback.surface?.offsetHeight || 0) < container.clientHeight - 24;
    const atTopPull = container.scrollTop <= 0 && dy > 0;
    const atBottomPush = container.scrollTop >= maxScroll - 1 && dy < 0;
    const shortList = maxScroll <= 1 || contentShort;
    if (!shortList && !atTopPull && !atBottomPush) return;
    applyScrollFeedback(feedback.surface, dy);
    event.preventDefault();
  }, { passive: false });
  const endFeedback = () => {
    const feedback = state.scrollFeedback;
    state.scrollFeedback = null;
    if (feedback?.dragging) settleScrollFeedback(feedback.surface);
  };
  container.addEventListener("touchend", endFeedback, { passive: true });
  container.addEventListener("touchcancel", endFeedback, { passive: true });
}

function updateNavigationControls() {
  const app = $("app");
  const menuButton = $("openMenu");
  const edgeSwipeZone = $("edgeSwipeZone");
  const taskToolbar = $("taskDetailToolbar");
  const taskDetail = isTaskDetailView();
  const todoDetail = isTodoDetailView();
  const todoCreate = kanbanComposerOpen();
  const automationDetail = isAutomationDetailView();
  const automationSecondary = typeof automationSecondaryReturnActive === "function" && automationSecondaryReturnActive();
  const actionInboxDetail = isActionInboxDetailView();
  const actionInboxCreate = isActionInboxCreateView();
  const skillDetail = isSkillDetailView();
  const taskList = isTaskListView();
  const directoryBack = state.viewMode === "projects" && Boolean(directoryActivePath());
  const learningGrowthDetail = state.viewMode === "learning" && Boolean(state.selectedLearningTaskCardId);
  const learningGrowthSettings = state.viewMode === "learning" && Boolean(state.learningGrowthSettingsOpen);
  const mainBack = taskDetail || todoDetail || todoCreate || automationDetail || automationSecondary || actionInboxDetail || actionInboxCreate || skillDetail || directoryBack || learningGrowthDetail || learningGrowthSettings;
  const minimalWindow = isMinimalWindowView();
  const centeredTopTitle = (
    (state.viewMode === "single" && state.singleWindowMode === "chat")
    || (state.viewMode === "tasks" && !state.currentTaskGroupId)
    || (state.viewMode === "projects")
    || (state.viewMode === "todos" && !todoDetail)
    || (state.viewMode === "inbox" && !actionInboxDetail && !actionInboxCreate)
    || (state.viewMode === "automation" && !automationDetail)
    || state.viewMode === "learning"
  );
  app?.classList.toggle("minimal-window-mode", minimalWindow);
  app?.classList.toggle("task-detail-mode", taskDetail);
  app?.classList.toggle("todo-detail-mode", todoDetail);
  app?.classList.toggle("todo-create-mode", todoCreate);
  app?.classList.toggle("automation-detail-mode", automationDetail);
  app?.classList.toggle("action-inbox-detail-mode", actionInboxDetail);
  app?.classList.toggle("action-inbox-create-mode", actionInboxCreate);
  app?.classList.toggle("skill-detail-mode", skillDetail);
  app?.classList.toggle("task-list-mode", taskList);
  app?.classList.toggle("learning-mode", state.viewMode === "learning");
  app?.classList.toggle("learning-settings-mode", learningGrowthSettings);
  app?.classList.toggle("centered-top-title-mode", centeredTopTitle);
  app?.classList.toggle("main-back-visible", mainBack);
  app?.classList.toggle("reading-fullscreen-mode", state.readingFullscreen);
  if (typeof updateConversationJumpBottomButton === "function") updateConversationJumpBottomButton();
  if (taskToolbar) {
    taskToolbar.hidden = !taskDetail;
    if (!taskDetail) taskToolbar.innerHTML = "";
  }
  if (menuButton) {
    menuButton.classList.toggle("back-mode", mainBack);
    menuButton.setAttribute("aria-label", mainBack ? "Back" : "Open menu");
    menuButton.innerHTML = `<span class="top-nav-button-glyph" aria-hidden="true">${mainBack ? "&#10094;" : "&#9776;"}</span>`;
  }
  edgeSwipeZone?.classList.toggle("disabled", !isMobileLayout());
  updateComposerAction();
  const hiddenBottomTabs = new Set(["bottomAutomationMode"]);
  ["chatManagementMode", "taskManagementMode", "singleMode", "singleTaskMode", "tasksMode", "projectsMode", "todosMode", "automationMode", "bottomChatMode", "bottomInboxMode", "bottomTasksMode", "bottomProjectsMode", "bottomTodosMode", "bottomAutomationMode"].forEach((id) => {
    const node = $(id);
    if (node) {
      node.hidden = hiddenBottomTabs.has(id);
      node.disabled = false;
    }
  });
  updateTopMoreControls();
}

function updateTopMoreControls() {
  const wrap = $("topMoreWrap");
  const interrupt = $("interruptRun");
  if (!wrap || !interrupt) return;
  const directory = state.viewMode === "projects";
  const taskDetail = isTaskDetailView();
  const chatView = isSingleWindowView() && state.singleWindowMode === "chat";
  const taskStream = isSingleWindowView() && state.singleWindowMode === "task";
  const todoDetail = isTodoDetailView();
  const todoCreate = kanbanComposerOpen();
  const todoList = state.viewMode === "todos" && !todoDetail && !todoCreate;
  const learningView = state.viewMode === "learning";
  const learningGrowthDetail = learningView && Boolean(state.selectedLearningTaskCardId);
  const actionInboxDetail = isActionInboxDetailView();
  const actionInboxCreate = isActionInboxCreateView();
  const inboxView = state.viewMode === "inbox" && !actionInboxDetail && !actionInboxCreate;
  const automationDetail = isAutomationDetailView();
  const automationList = state.viewMode === "automation" && !automationDetail;
  const showTopMenu = chatView || isTaskListView() || taskDetail || taskStream || directory || todoDetail || todoList || inboxView || actionInboxDetail || learningView || automationList || automationDetail;
  wrap.classList.toggle("hidden", !showTopMenu);
  interrupt.classList.toggle("hidden", showTopMenu || chatView);
  if (!showTopMenu) {
    closeTopMoreMenu();
    return;
  }
  const toggleTaskView = $("topToggleTaskView");
  if (toggleTaskView) {
    toggleTaskView.hidden = !(isTaskListView() || taskStream);
    toggleTaskView.textContent = taskStream ? "话题列表" : "话题流";
  }
  const toggleSingleMode = $("topToggleSingleMode");
  if (toggleSingleMode) {
    toggleSingleMode.hidden = true;
  }
  const clearDirectoryFilter = $("topClearDirectoryFilter");
  if (clearDirectoryFilter) clearDirectoryFilter.hidden = !(isTaskListView() || taskStream) || !state.taskDirectoryFilter;
  const manageAccessKeys = $("topManageAccessKeys");
  if (manageAccessKeys) {
    manageAccessKeys.hidden = true;
    manageAccessKeys.disabled = true;
  }
  updatePwaInstallControls();
  const newDirectoryFolder = $("topNewDirectoryFolder");
  if (newDirectoryFolder) {
    newDirectoryFolder.hidden = !directory;
    newDirectoryFolder.disabled = !directory || !directoryCreateBasePath();
  }
  const manageSharedDirectories = $("topManageSharedDirectories");
  if (manageSharedDirectories) {
    const directoryRoot = directory && !directoryActivePath();
    manageSharedDirectories.hidden = !directoryRoot;
    manageSharedDirectories.disabled = !directoryRoot;
  }
  const newTodo = $("topNewTodo");
  if (newTodo) {
    newTodo.hidden = !todoList;
    newTodo.disabled = !todoList;
    newTodo.textContent = "\u65b0\u589e\u4efb\u52a1";
  }
  const newActionInbox = $("topNewActionInbox");
  if (newActionInbox) {
    newActionInbox.hidden = !inboxView;
    newActionInbox.disabled = !inboxView;
  }
  const learningOwnerAction = learningView && Boolean(state.auth?.isOwner);
  const learningSettings = $("topLearningSettings");
  if (learningSettings) {
    learningSettings.hidden = !learningOwnerAction;
    learningSettings.disabled = !learningOwnerAction;
  }
  const learningHistory = $("topLearningGrowthHistory");
  if (learningHistory) {
    learningHistory.hidden = !learningGrowthDetail;
    learningHistory.disabled = !learningGrowthDetail;
  }
  const openAutomation = $("topOpenAutomation");
  if (openAutomation) {
    openAutomation.hidden = !inboxView;
    openAutomation.disabled = !inboxView;
  }
  const newAutomation = $("topNewAutomation");
  if (newAutomation) {
    newAutomation.hidden = !(automationList || inboxView);
    newAutomation.disabled = !(automationList || inboxView);
  }
  const selectedInboxItem = typeof currentActionInboxItem === "function" ? currentActionInboxItem() : null;
  const selectedInboxItemLink = typeof actionInboxSourceDeepLink === "function" ? actionInboxSourceDeepLink(selectedInboxItem) : (selectedInboxItem?.deepLink || "");
  const inboxItemTerminal = !selectedInboxItem || ["done", "dismissed", "archived"].includes(String(selectedInboxItem.status || "").toLowerCase());
  const openInboxItem = $("topOpenActionInboxItem");
  if (openInboxItem) {
    openInboxItem.hidden = !actionInboxDetail || !selectedInboxItemLink;
    openInboxItem.disabled = !actionInboxDetail || !selectedInboxItemLink;
    openInboxItem.textContent = selectedInboxItem?.actionLabel || "\u6253\u5f00";
  }
  const completeInboxItem = $("topCompleteActionInboxItem");
  if (completeInboxItem) {
    completeInboxItem.hidden = !actionInboxDetail || inboxItemTerminal;
    completeInboxItem.disabled = !actionInboxDetail || inboxItemTerminal;
  }
  const snoozeInboxItem = $("topSnoozeActionInboxItem");
  if (snoozeInboxItem) {
    snoozeInboxItem.hidden = !actionInboxDetail || inboxItemTerminal;
    snoozeInboxItem.disabled = !actionInboxDetail || inboxItemTerminal;
  }
  const dismissInboxItem = $("topDismissActionInboxItem");
  if (dismissInboxItem) {
    dismissInboxItem.hidden = !actionInboxDetail || inboxItemTerminal;
    dismissInboxItem.disabled = !actionInboxDetail || inboxItemTerminal;
  }
  const copyNavDiagnostics = $("topCopyNavigationDiagnostics");
  if (copyNavDiagnostics) {
    copyNavDiagnostics.hidden = !actionInboxDetail && !automationDetail;
    copyNavDiagnostics.disabled = false;
  }
  const selectedAutomation = currentAutomation();
  const editAutomation = $("topEditAutomation");
  if (editAutomation) {
    editAutomation.hidden = !automationDetail;
    editAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const toggleAutomationPause = $("topToggleAutomationPause");
  if (toggleAutomationPause) {
    toggleAutomationPause.hidden = !automationDetail;
    toggleAutomationPause.disabled = !automationDetail || !selectedAutomation;
    toggleAutomationPause.textContent = selectedAutomation && automationStatusLabel(selectedAutomation) === "paused" ? "\u6062\u590d" : "\u6682\u505c";
  }
  const deleteAutomation = $("topDeleteAutomation");
  if (deleteAutomation) {
    deleteAutomation.hidden = !automationDetail;
    deleteAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const deleteTodo = $("topDeleteTodo");
  if (deleteTodo) {
    const selectedTodo = kanbanCardById(state.selectedTodoId);
    const storyCard = Boolean(selectedTodo && kanbanCardHasExplicitStoryCase(selectedTodo));
    deleteTodo.hidden = !todoDetail || storyCard || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
    deleteTodo.disabled = !todoDetail || storyCard || !state.selectedTodoId || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
  }
  const renameTask = $("topRenameTask");
  if (renameTask) {
    renameTask.hidden = !taskDetail;
    renameTask.disabled = !taskDetail || !state.currentTaskGroupId;
  }
  const toggleGroupChat = $("topToggleGroupChat");
  if (toggleGroupChat) {
    toggleGroupChat.hidden = true;
    toggleGroupChat.disabled = true;
  }
  const toggleWeixinChat = $("topToggleWeixinChat");
  if (toggleWeixinChat) {
    const canToggleWeixin = Boolean(chatView);
    toggleWeixinChat.hidden = !canToggleWeixin;
    toggleWeixinChat.disabled = !canToggleWeixin;
    toggleWeixinChat.textContent = isWeixinChatView() ? "\u666e\u901a\u804a\u5929" : "\u5fae\u4fe1";
  }
  const manageGroupMembers = $("topManageGroupMembers");
  if (manageGroupMembers) {
    const canManageGroupMembers = Boolean(state.auth?.isOwner && chatView && !isWeixinChatView() && state.currentThread && groupChatSelectable(state.currentThread));
    manageGroupMembers.hidden = !canManageGroupMembers;
    manageGroupMembers.disabled = !canManageGroupMembers || !state.currentThread;
  }
  const searchChat = $("topSearchChat");
  if (searchChat) {
    searchChat.hidden = !chatView;
    searchChat.disabled = !chatView || !state.currentThread;
  }
  const readingFullscreen = $("topToggleReadingFullscreen");
  if (readingFullscreen) {
    readingFullscreen.hidden = false;
    readingFullscreen.disabled = false;
    readingFullscreen.textContent = state.readingFullscreen ? "\u9000\u51fa\u5168\u5c4f" : "\u5168\u5c4f\u9605\u8bfb";
  }
  const menu = $("topMoreMenu");
  const hasVisibleAction = Boolean(menu && [...menu.querySelectorAll(".top-more-action")].some((button) => !button.hidden));
  wrap.classList.toggle("hidden", !hasVisibleAction);
  if (!hasVisibleAction) closeTopMoreMenu();
}

function closeTopMoreMenu() {
  const menu = $("topMoreMenu");
  const button = $("topMoreButton");
  if (menu) menu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}

function setReadingFullscreen(enabled) {
  state.readingFullscreen = Boolean(enabled);
  if (state.readingFullscreen) {
    closeTopMoreMenu();
    closeSidebar();
    blurComposerInput();
  }
  updateNavigationControls();
  applyViewMode();
  updateMobileBottomNavReservation();
  if (state.viewMode === "single" || state.viewMode === "tasks") scheduleConversationBottomStick();
}

function chatSearchAvailable() {
  return isSingleWindowChatView() && Boolean(state.currentThread);
}

function isChatSearchMode() {
  return state.chatSearchOpen && chatSearchAvailable();
}

function currentChatSearchQuery() {
  return String(state.chatSearchQuery || "").trim();
}

function currentChatSearchDraft() {
  return String(isChatSearchMode() ? getComposerText() : state.chatSearchDraft || "").trim();
}

function chatSearchContentForMessage(message) {
  const directoryAliases = extractDirectoryAliases(message?.content || "");
  const text = cleanDisplayText(directoryAliases.text || message?.content || "");
  const artifacts = Array.isArray(message?.artifacts)
    ? message.artifacts.map((artifact) => [artifact.name, artifact.path, artifact.mime].filter(Boolean).join(" ")).join("\n")
    : "";
  return [
    message?.role === "user" ? "You" : "Hermes",
    text,
    message?.error || "",
    artifacts,
  ].filter(Boolean).join("\n").toLowerCase();
}

function syncChatSearchMatches() {
  if (!chatSearchAvailable()) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const query = currentChatSearchQuery().toLowerCase();
  if (!query) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const matches = chatMessagesForThread(state.currentThread)
    .filter((message) => message?.id && chatSearchContentForMessage(message).includes(query))
    .map((message) => message.id);
  state.chatSearchMatches = matches;
  state.chatSearchTotalMatches = Math.max(state.chatSearchTotalMatches || 0, matches.length);
  if (!matches.length) {
    state.chatSearchIndex = 0;
  } else if (state.chatSearchIndex < 0 || state.chatSearchIndex >= matches.length) {
    state.chatSearchIndex = 0;
  }
  return matches;
}

function chatSearchClassForMessage(message) {
  if (!chatSearchAvailable() || !currentChatSearchQuery() || !message?.id) return "";
  const matchIndex = state.chatSearchMatches.indexOf(message.id);
  if (matchIndex < 0) return "";
  return matchIndex === state.chatSearchIndex ? " chat-search-match chat-search-current-match" : " chat-search-match";
}

function openChatSearch() {
  closeTopMoreMenu();
  if (!chatSearchAvailable()) return;
  if (!state.chatSearchOpen) {
    state.chatSearchComposerDraft = getComposerText();
    state.chatSearchDraft = state.chatSearchQuery || "";
  }
  state.chatSearchOpen = true;
  state.chatSearchRefocus = true;
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchScrollPending = false;
  renderCurrentThread({ stickToBottom: false });
  setComposerText(state.chatSearchDraft || "");
  focusChatSearchInput({ force: true });
  requestAnimationFrame(() => requestAnimationFrame(() => focusChatSearchInput({ force: true })));
}

function closeChatSearch(options = {}) {
  const restoreDraft = state.chatSearchComposerDraft || "";
  state.chatSearchOpen = false;
  state.chatSearchDraft = "";
  state.chatSearchComposerDraft = "";
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchQuery = "";
  state.chatSearchMatches = [];
  state.chatSearchIndex = 0;
  state.chatSearchLoading = false;
  state.chatSearchTotalMatches = 0;
  state.chatSearchScrollPending = false;
  state.chatSearchRefocus = false;
  if (options.render !== false) {
    renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
    setComposerText(restoreDraft);
  }
}

function updateChatSearchDraft(value) {
  state.chatSearchDraft = String(value || "");
  state.chatSearchDraftChangedSinceSearch = state.chatSearchDraft.trim() !== currentChatSearchQuery();
  updateComposerAction();
}

function performChatSearch() {
  performChatSearchAsync().catch(showError);
}

async function performChatSearchAsync() {
  if (!isChatSearchMode()) return;
  const draft = currentChatSearchDraft();
  state.chatSearchDraft = draft;
  const sameCommittedQuery = draft && draft === currentChatSearchQuery() && state.chatSearchMatches.length && !state.chatSearchDraftChangedSinceSearch;
  if (sameCommittedQuery) {
    moveChatSearch(1);
    return;
  }
  state.chatSearchQuery = draft;
  state.chatSearchIndex = 0;
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchLoading = Boolean(draft);
  if (state.chatSearchLoading) renderCurrentThread({ stickToBottom: false });
  try {
    if (draft && state.currentThreadId) {
      const params = chatMessagePageParams({ search: draft, limit: CHAT_MESSAGE_SEARCH_LIMIT });
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
      mergeCurrentThreadMessages(result.messages || [], null);
      state.chatSearchTotalMatches = Number(result.page?.totalMatches || 0) || 0;
    } else {
      state.chatSearchTotalMatches = 0;
    }
  } finally {
    state.chatSearchLoading = false;
  }
  syncChatSearchMatches();
  state.chatSearchRefocus = true;
  state.chatSearchScrollPending = Boolean(draft && state.chatSearchMatches.length);
  renderCurrentThread({ stickToBottom: false });
}

function moveChatSearch(delta) {
  if (isChatSearchMode() && state.chatSearchDraftChangedSinceSearch) {
    focusChatSearchInput();
    return;
  }
  syncChatSearchMatches();
  const total = state.chatSearchMatches.length;
  if (!total) {
    focusChatSearchInput();
    return;
  }
  state.chatSearchIndex = (state.chatSearchIndex + delta + total) % total;
  state.chatSearchScrollPending = true;
  state.chatSearchRefocus = true;
  renderCurrentThread({ stickToBottom: false });
}

function focusChatSearchInput(options = {}) {
  const input = $("messageInput");
  if (!input) return;
  if (!options.force && !composerAutoFocusAllowed()) return;
  input.focus({ preventScroll: true });
  const len = input.textContent.length;
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (_) {
    void len;
  }
}

function scrollToCurrentChatSearchMatch(conversation = $("conversation")) {
  if (!conversation || !state.chatSearchMatches.length) return;
  const currentId = state.chatSearchMatches[state.chatSearchIndex];
  const target = [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === currentId);
  if (!target) return;
  target.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function updateChatSearchStatus() {
  const status = $("chatSearchStatus");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const setNav = (visible, enabled) => {
    [prevSearch, nextSearch].forEach((button) => {
      if (!button) return;
      button.hidden = !visible;
      button.disabled = !enabled;
    });
  };
  if (!isChatSearchMode() || !currentChatSearchQuery()) {
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    setNav(false, false);
    return;
  }
  const changed = state.chatSearchDraftChangedSinceSearch;
  const total = state.chatSearchMatches.length;
  if (status) {
    status.hidden = changed;
    if (state.chatSearchLoading) {
      status.textContent = "searching";
    } else if (total && !changed) {
      const fullTotal = Math.max(total, Number(state.chatSearchTotalMatches || 0) || 0);
      status.textContent = fullTotal > total ? `${state.chatSearchIndex + 1}/${total}+` : `${state.chatSearchIndex + 1}/${total}`;
    } else {
      status.textContent = "0/0";
    }
  }
  setNav(!changed && total > 1, !changed && total > 1);
}

function wireChatSearchControls(root) {
  if (!root) return;
  if (state.chatSearchRefocus) {
    state.chatSearchRefocus = false;
    requestAnimationFrame(focusChatSearchInput);
  }
}
