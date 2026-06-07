"use strict";

function clearSidebarDragStyles() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  sidebar?.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  if (sidebar) sidebar.style.transform = "";
  if (overlay) {
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
  }
}

function sidebarDragWidth(sidebar = $("sidebar")) {
  return Math.max(240, sidebar?.getBoundingClientRect?.().width || 300);
}

function applySidebarDragProgress(progress) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  const clamped = clamp01(progress);
  const x = (clamped - 1) * sidebarDragWidth(sidebar);
  sidebar.classList.add("dragging");
  overlay?.classList.add("dragging");
  sidebar.style.transform = `translate3d(${x}px, 0, 0)`;
  if (overlay) {
    overlay.style.opacity = String(clamped);
    overlay.style.pointerEvents = clamped > 0.02 ? "auto" : "none";
  }
}

function settleSidebarDrag(open) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  sidebar.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  sidebar.getBoundingClientRect();
  sidebar.classList.toggle("open", open);
  overlay?.classList.toggle("open", open);
  requestAnimationFrame(() => {
    sidebar.style.transform = "";
    if (overlay) {
      overlay.style.opacity = "";
      overlay.style.pointerEvents = "";
    }
  });
  if (open) {
    resetSidebarScroll();
  } else {
    restoreTransientProjectRoute();
  }
}

function openSidebar(options = {}) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  clearSidebarDragStyles();
  sidebar.classList.add("open");
  overlay?.classList.add("open");
  if (options.resetScroll !== false) resetSidebarScroll();
  if (typeof updateTopicPluginDockChrome === "function") updateTopicPluginDockChrome(isTaskListView());
}

function closeSidebar() {
  clearSidebarDragStyles();
  $("sidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("open");
  restoreTransientProjectRoute();
  if (typeof updateTopicPluginDockChrome === "function") updateTopicPluginDockChrome(isTaskListView());
}

function pluginContextBackNavigationActive() {
  if (typeof pluginTopicDefForViewMode !== "function" || typeof pluginTopicBottomButtonId !== "function") return false;
  return Boolean(pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)));
}

function pluginContextBackTarget() {
  if (typeof pluginTopicDefForViewMode !== "function") return "";
  const def = pluginTopicDefForViewMode(state.viewMode);
  return def && !def.builtinKind ? "plugin-context-home" : "";
}

function isDirectoryTopicDraftActive() {
  return state.viewMode === "tasks"
    && !state.currentTaskGroupId
    && Boolean(state.pendingTaskDirectory?.projectId)
    && Boolean(state.directoryReturnRoute);
}

function discardDirectoryTopicDraftState() {
  state.pendingTaskDirectory = null;
  state.taskDirectoryFilter = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
}

function closeDirectoryTopicDraft() {
  if (!isDirectoryTopicDraftActive()) return false;
  discardDirectoryTopicDraftState();
  state.directoryTopicDraftSendInFlight = false;
  if (state.directoryReturnRoute) return restoreDirectoryReturnRoute();
  if (typeof openTaskList === "function") {
    openTaskList();
    return true;
  }
  return false;
}

function backSwipeTarget() {
  const pluginContextBack = pluginContextBackNavigationActive();
  if (isSkillDetailView()) return "skill";
  if (isTaskDetailView()) return "task";
  if (isTodoDetailView() || kanbanComposerOpen()) return isTodoDetailView() ? "todo" : "todo-create";
  if (state.viewMode === "learning" && (state.learningGrowthSettingsOpen || state.selectedLearningTaskCardId)) return state.learningGrowthSettingsOpen ? "learning-growth-settings" : "learning-growth-task";
  if (typeof wardrobePluginBackActive === "function" && wardrobePluginBackActive()) return "wardrobe-plugin";
  if (!pluginContextBack && typeof wardrobePluginOuterBackActive === "function" && wardrobePluginOuterBackActive()) return "wardrobe-plugin-outer";
  if (typeof codexPluginBackActive === "function" && codexPluginBackActive()) return "codex-plugin";
  if (!pluginContextBack && typeof codexPluginOuterBackActive === "function" && codexPluginOuterBackActive()) return "codex-plugin-outer";
  if (typeof financePluginBackActive === "function" && financePluginBackActive()) return "finance-plugin";
  if (!pluginContextBack && typeof financePluginOuterBackActive === "function" && financePluginOuterBackActive()) return "finance-plugin-outer";
  if (typeof emailPluginBackActive === "function" && emailPluginBackActive()) return "email-plugin";
  if (!pluginContextBack && typeof emailPluginOuterBackActive === "function" && emailPluginOuterBackActive()) return "email-plugin-outer";
  if (typeof healthPluginBackActive === "function" && healthPluginBackActive()) return "health-plugin";
  if (!pluginContextBack && typeof healthPluginOuterBackActive === "function" && healthPluginOuterBackActive()) return "health-plugin-outer";
  if (typeof notePluginBackActive === "function" && notePluginBackActive()) return "note-plugin";
  if (!pluginContextBack && typeof notePluginOuterBackActive === "function" && notePluginOuterBackActive()) return "note-plugin-outer";
  if (isDirectoryTopicDraftActive()) return "directory-topic-draft";
  const pluginContextTarget = pluginContextBackTarget();
  if (pluginContextTarget) return pluginContextTarget;
  if (typeof automationDetailInboxReturnActive === "function" && automationDetailInboxReturnActive()) return "automation-secondary";
  if (isAutomationDetailView()) return "automation";
  if (typeof automationSecondaryReturnActive === "function" && automationSecondaryReturnActive()) return "automation-secondary";
  if (isActionInboxDetailView() || isActionInboxCreateView()) return isActionInboxCreateView() ? "action-inbox-create" : "action-inbox";
  if (state.viewMode === "projects" && (directoryActivePath() || state.directoryReturnRoute)) return "directory";
  return "";
}

function backSwipeSurface(target) { return document.querySelector(target === "directory" ? ".directory-shell" : ".main"); }

function navigateDirectoryBackFromShell(options = {}) {
  if (typeof navigateDirectoryUp !== "function") return Promise.resolve(false);
  return navigateDirectoryUp(options);
}

function clearBackSwipeSurface(surface) {
  if (!surface) return;
  surface.classList.remove("page-back-dragging", "page-back-settling");
  surface.style.transform = ""; surface.style.opacity = "";
}

function applyBackSwipeDrag(swipe, dx) {
  const surface = swipe?.surface;
  if (!surface) return;
  const acceptDistance = Math.max(150, Math.min(window.innerWidth * 0.46, 190));
  const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
  swipe.offset = visualOffset;
  swipe.progress = clamp01(dx / acceptDistance);
  surface.classList.add("page-back-dragging");
  surface.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
  surface.style.opacity = "";
}

function performBackSwipeAction(target) {
  if (target === "skill") closeSkillDetail();
  else if (target === "task") openTaskList();
  else if (target === "todo" || target === "todo-create") openTodoList();
  else if (target === "learning-growth-settings") closeLearningGrowthSettingsPage();
  else if (target === "learning-growth-task") {
    state.selectedLearningTaskCardId = "";
    state.learningGrowthSettingsOpen = false;
    renderLearningCoinsView();
  }
  else if (target === "directory-topic-draft") closeDirectoryTopicDraft();
  else if (target === "directory") navigateDirectoryBackFromShell({ animateEntry: true }).catch(showError);
  else if (target === "wardrobe-plugin" && typeof sendWardrobePluginBack === "function") sendWardrobePluginBack();
  else if (target === "wardrobe-plugin-outer" && typeof restoreWardrobePluginReturnRoute === "function") restoreWardrobePluginReturnRoute();
  else if (target === "codex-plugin" && typeof sendCodexPluginBackOrReturn === "function") sendCodexPluginBackOrReturn();
  else if (target === "codex-plugin-outer" && typeof restoreCodexPluginReturnRoute === "function") restoreCodexPluginReturnRoute();
  else if (target === "finance-plugin" && typeof sendFinancePluginBackOrReturn === "function") sendFinancePluginBackOrReturn();
  else if (target === "finance-plugin-outer" && typeof restoreFinancePluginReturnRoute === "function") restoreFinancePluginReturnRoute();
  else if (target === "email-plugin" && typeof sendEmailPluginBackOrReturn === "function") sendEmailPluginBackOrReturn();
  else if (target === "email-plugin-outer" && typeof restoreEmailPluginReturnRoute === "function") restoreEmailPluginReturnRoute();
  else if (target === "health-plugin" && typeof sendHealthPluginBackOrReturn === "function") sendHealthPluginBackOrReturn();
  else if (target === "health-plugin-outer" && typeof restoreHealthPluginReturnRoute === "function") restoreHealthPluginReturnRoute();
  else if (target === "note-plugin" && typeof sendNotePluginBackOrReturn === "function") sendNotePluginBackOrReturn();
  else if (target === "note-plugin-outer" && typeof restoreNotePluginReturnRoute === "function") restoreNotePluginReturnRoute();
  else if (target === "plugin-context-home" && typeof exitPluginContextToTopicHome === "function") exitPluginContextToTopicHome();
  else if (target === "automation") openAutomationList();
  else if (target === "automation-secondary") closeAutomationSecondarySurface();
  else if (target === "action-inbox" || target === "action-inbox-create") openActionInboxOverview();
}

async function handleInAppBackNavigation(options = {}) {
  if ($("sidebar")?.classList.contains("open")) {
    closeSidebar();
    return true;
  }
  const target = backSwipeTarget();
  if (!target) return false;
  if (target === "directory-topic-draft") return closeDirectoryTopicDraft();
  if (target === "directory") await navigateDirectoryBackFromShell({ animateEntry: Boolean(options.animateEntry) });
  else performBackSwipeAction(target);
  return true;
}

function pushBackNavigationGuard() {
  try {
    window.history.pushState({ hermesWebBackGuard: true }, "", window.location.href);
    state.backNavigationGuardArmed = true;
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
}

function wireBackNavigationGuard() {
  if (state.backNavigationGuardBound) return;
  state.backNavigationGuardBound = true;
  try {
    const currentState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(currentState, "", window.location.href);
    pushBackNavigationGuard();
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
  window.addEventListener("popstate", () => {
    if (state.handlingBackNavigation) return;
    state.handlingBackNavigation = true;
    handleInAppBackNavigation({ animateEntry: true })
      .then((handled) => {
        if (handled) {
          pushBackNavigationGuard();
        } else {
          pushBackNavigationGuard();
        }
      })
      .catch((err) => {
        pushBackNavigationGuard();
        showError(err);
      })
      .finally(() => {
        state.handlingBackNavigation = false;
      });
  });
}

function settleBackSwipe(swipe, accepted) {
  const surface = swipe?.surface;
  const target = swipe?.target || "";
  if (!surface) return;
  surface.classList.remove("page-back-dragging");
  if (accepted) {
    surface.classList.add("page-back-settling");
    surface.style.transform = "";
    surface.style.opacity = "";
    requestAnimationFrame(() => {
      performBackSwipeAction(target);
      requestAnimationFrame(() => clearBackSwipeSurface(surface));
    });
    return;
  }
  surface.classList.add("page-back-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => {
    clearBackSwipeSurface(surface);
  }, prefersReducedMotion() ? 0 : 220);
}

function captureTransientTaskRoute() {
  if (!isTaskDetailView()) return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreTransientProjectRoute() {
  const route = state.transientProjectRoute;
  if (!route) return false;
  state.transientProjectRoute = null;
  state.viewMode = route.viewMode;
  state.selectedProjectId = route.selectedProjectId;
  state.selectedSubprojectId = route.selectedSubprojectId;
  state.currentThread = route.currentThread;
  state.currentThreadId = route.currentThreadId;
  state.currentTaskGroupId = route.currentTaskGroupId;
  state.threads = route.threads || [];
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return true;
}

function captureDirectoryReturnRoute() {
  if (state.viewMode === "projects") return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    selectedTodoId: state.selectedTodoId,
    selectedAutomationId: state.selectedAutomationId,
    automationReturnRoute: state.automationReturnRoute,
    automationEditOpen: state.automationEditOpen,
    automationEditJobId: state.automationEditJobId,
    automationOutputHistoryOpen: state.automationOutputHistoryOpen,
    skillDetail: state.skillDetail, learningGrowthWorkspaceId: state.learningGrowthWorkspaceId, selectedLearningTaskCardId: state.selectedLearningTaskCardId, learningGrowthBoardLane: state.learningGrowthBoardLane, learningGrowthSettingsOpen: state.learningGrowthSettingsOpen, learningGrowthActiveTab: state.learningGrowthActiveTab,
    conversationScrollTop: $("conversation")?.scrollTop || 0,
    searchText: $("threadSearch")?.value || "",
  };
}

function captureCurrentDirectoryRoute() {
  if (state.viewMode !== "projects") return captureDirectoryReturnRoute();
  return {
    viewMode: "projects",
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId || "",
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    directoryPath: state.directoryPath || "",
    directoryRootPath: state.directoryRootPath || "",
    sharedDirectoryManagerOpen: Boolean(state.sharedDirectoryManagerOpen),
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreDirectoryReturnRoute() {
  const route = state.directoryReturnRoute;
  if (!route) return false;
  state.directoryReturnRoute = null;
  state.directoryPath = route.directoryPath || "";
  state.directoryRootPath = route.directoryRootPath || "";
  state.directoryPreview = null;
  state.directoryError = "";
  state.sharedDirectoryManagerOpen = Boolean(route.sharedDirectoryManagerOpen);
  state.viewMode = route.viewMode || "single";
  state.selectedProjectId = route.selectedProjectId || state.selectedProjectId || "";
  state.selectedSubprojectId = route.selectedSubprojectId || "";
  state.currentThread = route.currentThread || null;
  state.currentThreadId = route.currentThreadId || "";
  state.currentTaskGroupId = route.currentTaskGroupId || "";
  state.threads = route.threads || state.threads || [];
  state.selectedTodoId = route.selectedTodoId || "";
  state.selectedAutomationId = route.selectedAutomationId || "";
  state.automationReturnRoute = route.automationReturnRoute || "";
  state.automationEditOpen = Boolean(route.automationEditOpen);
  state.automationEditJobId = route.automationEditJobId || "";
  state.automationOutputHistoryOpen = Boolean(route.automationOutputHistoryOpen);
  state.skillDetail = route.skillDetail || null;
  Object.assign(state, { learningGrowthWorkspaceId: route.learningGrowthWorkspaceId || state.learningGrowthWorkspaceId || "", selectedLearningTaskCardId: route.selectedLearningTaskCardId || "", learningGrowthBoardLane: route.learningGrowthBoardLane || state.learningGrowthBoardLane || "", learningGrowthSettingsOpen: Boolean(route.learningGrowthSettingsOpen), learningGrowthActiveTab: route.learningGrowthActiveTab || state.learningGrowthActiveTab || "" });
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  if (state.viewMode === "todos") renderTodos();
  else if (state.viewMode === "projects") {
    loadDirectoryView({ preserveScroll: true }).catch(showError);
  }
  else if (state.viewMode === "learning") {
    renderLearningCoinsView();
    const scrollTop = Number(route.conversationScrollTop || 0) || 0; if (scrollTop > 0) requestAnimationFrame(() => { const conversation = $("conversation"); if (conversation) conversation.scrollTop = scrollTop; });
  }
  else if (state.viewMode === "automation") renderAutomationView();
  else {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    if (!isSkillDetailView()) setComposerEnabled(state.viewMode === "single" || state.viewMode === "tasks");
  }
  updateNavigationControls();
  return true;
}

async function deleteTaskGroup(taskGroupId, options = {}) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const label = taskDisplayId(group) || taskGroupId;
  if (options.confirm !== false && !window.confirm(`删除话题“${label}”？磁盘文件不会被删除。`)) return;
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "DELETE",
  });
  state.currentThread = result.thread;
  if (state.currentTaskGroupId === taskGroupId) state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function selectTaskRenameInput(input) {
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  try {
    input.setSelectionRange(0, input.value.length);
  } catch (_) {
    input.select();
  }
  input.select();
}

function openTaskRenameDialog(currentTitle) {
  const overlay = $("taskRenameOverlay");
  if (!overlay) return Promise.resolve(window.prompt("修改话题名", currentTitle));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.removeEventListener("click", onBackdropClick);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(null);
    };
    const onBackdropClick = (event) => {
      if (event.target === overlay) finish(null);
    };
    overlay.innerHTML = `<form class="access-key-sheet task-rename-sheet" data-task-rename-form>
      <div class="access-key-header">
        <div>
          <div id="taskRenameTitle" class="access-key-title">修改话题名</div>
          <div class="access-key-subtitle">输入后保存为话题列表标题</div>
        </div>
        <button class="icon-button" type="button" data-task-rename-cancel aria-label="关闭">&#10005;</button>
      </div>
      <label class="task-rename-field">
        <span>话题名</span>
        <input id="taskRenameInput" type="text" value="${escapeHtml(currentTitle)}" autocomplete="off" autocapitalize="sentences">
      </label>
      <div class="task-rename-actions">
        <button type="button" data-task-rename-cancel>取消</button>
        <button class="primary" type="submit">保存</button>
      </div>
    </form>`;
    overlay.classList.remove("hidden");
    overlay.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeydown);
    const form = overlay.querySelector("[data-task-rename-form]");
    const input = overlay.querySelector("#taskRenameInput");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(input?.value ?? "");
    });
    overlay.querySelectorAll("[data-task-rename-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(null));
    });
    requestAnimationFrame(() => {
      selectTaskRenameInput(input);
      window.setTimeout(() => selectTaskRenameInput(input), 80);
    });
  });
}

async function renameTaskGroup(taskGroupId) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const currentTitle = String(group?.title || "").trim() || taskPrompt(group) || "";
  const nextTitle = await openTaskRenameDialog(currentTitle);
  if (nextTitle === null) return;
  const title = nextTitle.trim();
  if (!title) {
    window.alert("话题名不能为空");
    return;
  }
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  state.currentThread = result.thread;
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

function closeTaskCardMenus(root = document) {
  root.querySelectorAll(".task-card-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".task-card")?.classList.remove("menu-open");
    wrap.querySelector(".task-card-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".task-card-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleTaskCardMenu(button) {
  const wrap = button?.closest?.(".task-card-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeTaskCardMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".task-card")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".task-card-menu");
  if (menu) menu.hidden = false;
}

function wireTaskCardMenus(root) {
  root.querySelectorAll("[data-task-card-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTaskCardMenu(button);
    });
  });
  root.querySelectorAll(".task-card-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-rename-task]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTaskCardMenus();
      renameTaskGroup(button.dataset.renameTask).catch(showError);
    });
  });
}

function taskSwipeCommitDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  if (row?.dataset?.swipeCommit === "full") {
    return Math.min(Math.max(168, width * 0.78), Math.max(168, width - 16));
  }
  return Math.min(Math.max(144, width * 0.58), Math.max(144, width - 24));
}

function taskSwipeMaxDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  return Math.min(width, Math.max(TASK_SWIPE_REVEAL_PX, taskSwipeCommitDistance(row) + 42));
}

function taskSwipeContent(row) {
  return row?.querySelector?.("[data-swipe-content], [data-task-swipe-content]") || null;
}

function setTaskSwipeOffset(row, offset) {
  const content = taskSwipeContent(row);
  if (!content) return;
  const clamped = Math.max(0, Math.min(Number(offset) || 0, taskSwipeMaxDistance(row)));
  content.style.transform = clamped ? `translate3d(${-clamped}px, 0, 0)` : "";
  row.classList.toggle("task-swipe-open", clamped >= TASK_SWIPE_OPEN_THRESHOLD_PX);
}

function resetTaskSwipeRow(row) {
  if (!row) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging", "task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = "";
  row.dataset.taskSwipeMoved = "";
}

function closeTaskSwipeRows(root = document, except = null) {
  root.querySelectorAll?.("[data-swipe-row].task-swipe-open, [data-swipe-row].task-swipe-dragging, [data-task-swipe-card].task-swipe-open, [data-task-swipe-card].task-swipe-dragging").forEach((row) => {
    if (row !== except) resetTaskSwipeRow(row);
  });
}

function commitSwipeDelete(row, kind, itemId) {
  if (!row || !itemId) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging");
  row.classList.add("task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = `translate3d(${-Math.max(taskSwipeCommitDistance(row), row.clientWidth || 0)}px, 0, 0)`;
  window.setTimeout(() => {
    const action = kind === "todo" ? deleteTodoDirect(itemId)
      : kind === "kanban-story" ? deleteKanbanStoryCase(itemId)
        : kind === "action-inbox" ? (typeof completeActionInboxItemFromSwipe === "function" ? completeActionInboxItemFromSwipe(itemId) : Promise.reject(new Error("Action Inbox swipe handler unavailable")))
          : deleteTaskGroup(itemId, { confirm: false });
    action.then((deleted) => {
      if (kind === "kanban-story" && deleted === false) resetTaskSwipeRow(row);
    }).catch((err) => {
      resetTaskSwipeRow(row);
      showError(err);
    });
  }, prefersReducedMotion() ? 0 : 150);
}

function openTaskGroupFromList(taskGroupId) {
  if (!taskGroupId) return;
  if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
  rememberTaskListThread();
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentTaskGroupId = taskGroupId;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function openSharedTaskGroupFromList(threadId, taskGroupId) {
  if (!threadId || !taskGroupId) return;
  if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
  rememberTaskListThread();
  const params = new URLSearchParams({
    messageMode: "tasks",
    taskGroupId,
    messageLimit: String(TASK_MESSAGE_INITIAL_LIMIT),
  });
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}?${params}`);
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentThread = result.thread || null;
  state.currentThreadId = state.currentThread?.id || threadId;
  state.currentTaskGroupId = taskGroupId;
  state.threads = state.currentThread ? [summarizeThread(state.currentThread)] : state.threads;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function isTaskSwipeInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    "[data-delete-swipe], [data-delete-task], [data-complete-swipe], [data-action-inbox-actions-id], [data-action-inbox-menu-action], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-open-task], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']"
  ));
}

function openTaskDocumentLink(link) {
  const href = link?.href || link?.getAttribute?.("href") || "";
  if (!href) return;
  closeTaskSwipeRows(document);
  const previews = window.TaskDocumentPreviewUi || {};
  if (previews.isImagePreviewLink?.(link) && previews.openImagePreviewOverlay?.(link)) return;
  if (previews.isMarkdownPreviewLink?.(link) && previews.openMarkdownPreviewOverlay?.(link)) return;
  if (previews.isDocumentPreviewLink?.(link) && previews.openDocumentPreviewOverlay?.(link)) return;
  if (isMobileLayout()) {
    window.location.assign(href);
    return;
  }
  window.location.assign(href);
}

function wireTaskDocumentLinks(root) {
  root?.querySelectorAll?.("[data-task-doc]").forEach((link) => {
    if (link.dataset.taskDocBound) return;
    link.dataset.taskDocBound = "1";
    let touchStart = null;
    let lastTouchOpen = 0;
    link.addEventListener("touchstart", (event) => {
      if (!event.touches?.length) return;
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    link.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touchStart || !touch) return;
      const dx = Math.abs(touch.clientX - touchStart.x);
      const dy = Math.abs(touch.clientY - touchStart.y);
      touchStart = null;
      if (dx > 10 || dy > 10) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      lastTouchOpen = Date.now();
      openTaskDocumentLink(link);
    }, { passive: false });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (Date.now() - lastTouchOpen < 700) return;
      openTaskDocumentLink(link);
    }, true);
  });
}

function wireTaskSwipeActions(root) {
  root?.querySelectorAll?.("[data-swipe-row], [data-task-swipe-card]").forEach((row) => {
    if (row.dataset.taskSwipeBound) return;
    row.dataset.taskSwipeBound = "1";
    const itemKind = row.dataset.swipeKind || "task";
    const itemId = row.dataset.swipeId || row.dataset.taskId || "";
    row.querySelector("[data-delete-swipe], [data-delete-task], [data-complete-swipe]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commitSwipeDelete(row, itemKind, itemId);
    });
    row.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-complete-swipe], [data-action-inbox-actions-id], [data-action-inbox-menu-action], [data-task-card-menu], [data-rename-task], .task-card-menu")) return;
      if (event.target?.closest?.("[data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip")) return;
      if (row.dataset.taskSwipeMoved) {
        event.preventDefault();
        event.stopPropagation();
        row.dataset.taskSwipeMoved = "";
        if (row.classList.contains("task-swipe-open")) resetTaskSwipeRow(row);
        return;
      }
      if (row.classList.contains("task-swipe-open")) {
        event.preventDefault();
        event.stopPropagation();
        resetTaskSwipeRow(row);
      }
    }, true);
    if (row.hasAttribute("data-task-swipe-card")) {
      row.addEventListener("click", (event) => {
        if (event.defaultPrevented || !isTaskListView()) return;
        if (isTaskSwipeInteractiveTarget(event.target)) return;
        if (row.dataset.taskSwipeMoved || row.classList.contains("task-swipe-open")) return;
        openTaskGroupFromList(itemId);
      });
    }
    row.addEventListener("touchstart", (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) return;
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-complete-swipe], [data-action-inbox-actions-id], [data-action-inbox-menu-action], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']")) return;
      const content = taskSwipeContent(row);
      if (!content) return;
      closeTaskSwipeRows(document, row);
      state.taskSwipe = {
        row,
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        lastX: event.touches[0].clientX,
        lastOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        baseOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        dragging: false,
      };
    }, { passive: true });
    row.addEventListener("touchmove", (event) => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row || !isMobileLayout() || event.touches.length !== 1) return;
      const x = event.touches[0].clientX;
      const dx = x - swipe.startX;
      const dy = event.touches[0].clientY - swipe.startY;
      const horizontal = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (!swipe.dragging) {
        if (horizontal < 8 && vertical < 8) return;
        if (vertical > horizontal * 0.95) return;
        if (dx > 0 && !swipe.baseOffset) return;
        swipe.dragging = true;
        row.classList.add("task-swipe-dragging");
      }
      const nextOffset = Math.max(0, Math.min(swipe.baseOffset - dx, taskSwipeMaxDistance(row)));
      swipe.lastX = x;
      swipe.lastOffset = nextOffset;
      setTaskSwipeOffset(row, nextOffset);
      row.dataset.taskSwipeMoved = "1";
      event.preventDefault();
    }, { passive: false });
    const endSwipe = () => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row) return;
      state.taskSwipe = null;
      row.classList.remove("task-swipe-dragging");
      if (!swipe.dragging) return;
      const offset = swipe.lastOffset || 0;
      if (offset >= taskSwipeCommitDistance(row)) {
        commitSwipeDelete(row, itemKind, itemId);
      } else if (offset >= TASK_SWIPE_OPEN_THRESHOLD_PX) {
        setTaskSwipeOffset(row, TASK_SWIPE_REVEAL_PX);
        const content = taskSwipeContent(row);
        if (content) content.style.transform = "";
        row.classList.add("task-swipe-open");
      } else {
        resetTaskSwipeRow(row);
      }
      window.setTimeout(() => {
        if (row.dataset.taskSwipeMoved) row.dataset.taskSwipeMoved = "";
      }, 360);
    };
    row.addEventListener("touchend", endSwipe, { passive: true });
    row.addEventListener("touchcancel", () => {
      const swipe = state.taskSwipe;
      if (swipe?.row === row) state.taskSwipe = null;
      resetTaskSwipeRow(row);
    }, { passive: true });
  });
}
