"use strict";

function renderSubprojects() {
  const subprojectSelect = $("subprojectSelect");
  const project = currentProject();
  const options = directoryRouteOptions(project);
  if (!options.length) {
    persistSelectedSubproject("");
    subprojectSelect.innerHTML = `<option value="">Root</option>`;
    subprojectSelect.disabled = true;
    return;
  }
  if (!options.some((item) => item.id === state.selectedSubprojectId)) {
    persistSelectedSubproject("");
  }
  subprojectSelect.disabled = false;
  subprojectSelect.innerHTML = renderDirectorySubprojectOptions(project);
  subprojectSelect.value = state.selectedSubprojectId || "";
}

function applyViewMode() {
  const single = state.viewMode === "single";
  const tasks = state.viewMode === "tasks";
  const directory = state.viewMode === "projects";
  const automation = state.viewMode === "automation";
  const inbox = state.viewMode === "inbox";
  const learning = state.viewMode === "learning";
  const todos = state.viewMode === "todos";
  const wardrobe = state.viewMode === "wardrobe";
  const codex = state.viewMode === "codex";
  const finance = state.viewMode === "finance";
  const email = state.viewMode === "email";
  const health = state.viewMode === "health";
  if (typeof updateWardrobeNavigationAvailability === "function") updateWardrobeNavigationAvailability();
  if (typeof updateCodexPluginNavigationAvailability === "function") updateCodexPluginNavigationAvailability();
  if (typeof updateFinancePluginNavigationAvailability === "function") updateFinancePluginNavigationAvailability();
  if (typeof updateEmailPluginNavigationAvailability === "function") updateEmailPluginNavigationAvailability();
  if (typeof updateHealthPluginNavigationAvailability === "function") updateHealthPluginNavigationAvailability();
  if (!(single && state.singleWindowMode === "chat")) renderChatScopeHeader(null);
  $("app")?.classList.toggle("todo-mode", todos);
  $("app")?.classList.toggle("inbox-mode", inbox);
  $("app")?.classList.toggle("automation-mode", automation);
  $("app")?.classList.toggle("learning-mode", learning);
  $("app")?.classList.toggle("projects-mode", directory);
  $("app")?.classList.toggle("wardrobe-mode", wardrobe);
  $("app")?.classList.toggle("codex-mode", codex);
  $("app")?.classList.toggle("finance-mode", finance);
  $("app")?.classList.toggle("email-mode", email);
  $("app")?.classList.toggle("health-mode", health);
  $("chatManagementMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("taskManagementMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("bottomChatMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("bottomInboxMode")?.classList.toggle("active", inbox);
  $("bottomTasksMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("singleMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("singleTaskMode")?.classList.toggle("active", single && state.singleWindowMode === "task");
  $("tasksMode")?.classList.toggle("active", tasks);
  $("projectsMode").classList.toggle("active", directory);
  $("bottomProjectsMode")?.classList.toggle("active", directory);
  $("automationMode")?.classList.toggle("active", automation);
  $("bottomAutomationMode")?.classList.toggle("active", automation);
  $("learningMode")?.classList.toggle("active", learning);
  $("bottomLearningMode")?.classList.toggle("active", learning);
  $("todosMode").classList.toggle("active", learning);
  $("bottomTodosMode")?.classList.toggle("active", learning);
  $("bottomPluginMode")?.classList.toggle("active", wardrobe || finance || email || health);
  $("bottomPluginWardrobeMode")?.classList.toggle("active", wardrobe);
  $("bottomWardrobeMode")?.classList.toggle("active", wardrobe);
  $("bottomCodexMode")?.classList.toggle("active", codex);
  $("bottomPluginFinanceMode")?.classList.toggle("active", finance);
  $("bottomFinanceMode")?.classList.toggle("active", finance);
  $("bottomPluginEmailMode")?.classList.toggle("active", email);
  $("bottomEmailMode")?.classList.toggle("active", email);
  $("bottomHealthMode")?.classList.toggle("active", health);
  $("taskModeControls")?.classList.add("hidden");
  $("routeFields").classList.add("hidden");
  $("directoryEntry")?.classList.add("hidden");
  $("directoryEntry")?.parentElement?.classList.add("hidden");
  $("newThread").classList.toggle("hidden", single || tasks || automation || inbox || learning || directory || todos || wardrobe || codex || finance || email || health);
  $("newThread").disabled = single || tasks || automation || inbox || learning || directory || todos || wardrobe || codex || finance || email || health;
  $("newThread").textContent = todos ? "新建看板卡片" : "新建话题";
  $("threadSearch").placeholder = single ? (state.singleWindowMode === "chat" ? "Search chat" : "Search topic stream") : tasks ? "Search topics" : inbox ? "Search inbox" : todos ? "Search Kanban" : automation ? "Search automations" : learning ? "Search growth" : wardrobe ? "Search wardrobe" : email ? "Search email" : health ? "Search health" : "Search directories";
  updateSearchButton();
}

async function loadSelectedView(options = {}) {
  const viewLoadId = (state.viewLoadSeq || 0) + 1;
  state.viewLoadSeq = viewLoadId;
  const currentViewStillSelected = () => state.viewLoadSeq === viewLoadId;
  if (typeof guardHermesOwnedSelectedDetailNavigation === "function") {
    guardHermesOwnedSelectedDetailNavigation();
  }
  if (state.viewMode !== "wardrobe" && typeof parkWardrobePluginShell === "function") {
    parkWardrobePluginShell();
  }
  if (state.viewMode !== "codex" && typeof parkCodexPluginShell === "function") {
    parkCodexPluginShell();
  }
  if (state.viewMode !== "finance" && typeof parkFinancePluginShell === "function") {
    parkFinancePluginShell();
  }
  if (state.viewMode !== "email" && typeof parkEmailPluginShell === "function") {
    parkEmailPluginShell();
  }
  if (state.viewMode !== "health" && typeof parkHealthPluginShell === "function") {
    parkHealthPluginShell();
  }
  if (state.viewMode !== "projects") state.directoryReturnRoute = null;
  if (state.viewMode !== "todos") clearTodoAutoRefresh();
  const leavingSkillDetail = Boolean(state.skillDetail && (state.viewMode !== "tasks" || !state.currentTaskGroupId));
  if (leavingSkillDetail) {
    state.skillDetail = null;
    const conversation = $("conversation");
    if (conversation) conversation.innerHTML = `<div class="empty-state small">Loading...</div>`;
  }
  applyViewMode();
  if (leavingSkillDetail) updateNavigationControls();
  if (state.viewMode !== "tasks") state.skillDetail = null;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (
      state.viewMode === "tasks"
      && !state.currentTaskGroupId
      && !options.forceTaskListReload
      && restoreTaskListThreadFromCache({ stickToBottom: true })
    ) {
      if (!options.skipTaskListWindowRefresh) scheduleTaskListWindowRefresh();
      return;
    }
    await loadSingleWindow();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "todos") {
    await loadTodos({ preferCache: true });
    if (!currentViewStillSelected()) return;
    if (state.pendingReadingQuizTodoId && state.pendingReadingQuizTodoId === state.selectedTodoId) {
      const todoId = state.pendingReadingQuizTodoId;
      state.pendingReadingQuizTodoId = "";
      await loadReadingQuiz(todoId);
      if (!currentViewStillSelected()) return;
    }
    if (state.pendingAssessmentExamTodoId && state.pendingAssessmentExamTodoId === state.selectedTodoId) {
      const todoId = state.pendingAssessmentExamTodoId;
      state.pendingAssessmentExamTodoId = "";
      await loadAssessmentExam(todoId);
      if (!currentViewStillSelected()) return;
    }
  } else if (state.viewMode === "automation") {
    await loadAutomations(state.automationRouteTargetPending
      ? { detail: "full", refresh: true, ignoreSearch: true, routeTarget: true }
      : {});
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "inbox") {
    await loadActionInbox();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "learning") {
    await loadLearningCoins();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "wardrobe") {
    renderWardrobeView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "codex") {
    renderCodexPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "finance") {
    renderFinancePluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "email") {
    renderEmailPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "health") {
    renderHealthPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "projects") {
    await loadDirectoryView();
    if (!currentViewStillSelected()) return;
  } else {
    await loadThreads();
    if (!currentViewStillSelected()) return;
  }
}

function renderAutomationPlaceholderView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) {
    list.innerHTML = `<div class="empty-state small">自动化管理入口已预留；后续接入 Hermes CRON / automation API。</div>`;
  }
  $("threadTitle").textContent = "自动化";
  $("threadMeta").textContent = "Automation management";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Automation management" });
  $("conversation").innerHTML = `
    <div class="empty-state">
      自动化入口已独立出来。当前版本尚未接入任务创建、暂停、运行接口；后续应直接桥接 Hermes CRON 的任务列表、运行状态和触发操作。
    </div>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}
