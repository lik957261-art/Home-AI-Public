"use strict";
const AUTOMATION_VIEW_MODEL_ESM_PATH = "/vite-islands/automation-view-model/automation-view-model.js";
let automationViewModelPromise = null;
let automationViewModel = null;
function importAutomationViewModel() {
  if (automationViewModel) return Promise.resolve(automationViewModel);
  if (!automationViewModelPromise) {
    automationViewModelPromise = import(AUTOMATION_VIEW_MODEL_ESM_PATH)
      .then((model) => {
        automationViewModel = model || null;
        return automationViewModel;
      })
      .catch(() => null);
  }
  return automationViewModelPromise;
}
function currentAutomationViewModel() {
  return automationViewModel;
}
function automationViewModelFunction(name) {
  const model = currentAutomationViewModel();
  const fn = model && model[name];
  return typeof fn === "function" ? fn : null;
}
if (typeof window !== "undefined") importAutomationViewModel().catch(() => null);

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
  const flagsPlan = automationViewModelFunction("automationViewModeFlagsPlan");
  const flags = flagsPlan ? flagsPlan(state) : {
    single: state.viewMode === "single",
    tasks: state.viewMode === "tasks",
    directory: state.viewMode === "projects",
    automation: state.viewMode === "automation",
    inbox: state.viewMode === "inbox",
    systemConsole: state.viewMode === "system-console",
    workspaceConsole: state.viewMode === "workspace-console",
    capabilities: false,
    learning: false,
    todos: state.viewMode === "todos",
    wardrobe: state.viewMode === "wardrobe",
    codex: state.viewMode === "codex",
    finance: state.viewMode === "finance",
    email: state.viewMode === "email",
    health: state.viewMode === "health",
    note: state.viewMode === "note",
    growth: state.viewMode === "growth",
    moira: state.viewMode === "moira",
    music: state.viewMode === "music",
    movie: state.viewMode === "movie",
    singleWindowMode: state.singleWindowMode,
  };
  const {
    single,
    tasks,
    directory,
    automation,
    inbox,
    systemConsole,
    workspaceConsole,
    capabilities,
    learning,
    todos,
    wardrobe,
    codex,
    finance,
    email,
    health,
    note,
    growth,
    moira,
    music,
    movie,
  } = flags;
  const ownerWorkspaceConsoleAvailable = Boolean(state.auth?.isOwner);
  if ($("bottomWorkspaceMode")) {
    $("bottomWorkspaceMode").hidden = !ownerWorkspaceConsoleAvailable;
    $("bottomWorkspaceMode").setAttribute("aria-hidden", ownerWorkspaceConsoleAvailable ? "false" : "true");
  }
  if (workspaceConsole && !ownerWorkspaceConsoleAvailable) {
    state.viewMode = "inbox";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    if (typeof loadSelectedView === "function") {
      queueMicrotask(() => loadSelectedView().catch((err) => {
        if (typeof showError === "function") showError(err?.message || err || "工作区控制台不可用");
      }));
    }
    return;
  }
  if (typeof updateWardrobeNavigationAvailability === "function") updateWardrobeNavigationAvailability();
  if (typeof updateCodexPluginNavigationAvailability === "function") updateCodexPluginNavigationAvailability();
  if (typeof updateFinancePluginNavigationAvailability === "function") updateFinancePluginNavigationAvailability();
  if (typeof updateEmailPluginNavigationAvailability === "function") updateEmailPluginNavigationAvailability();
  if (typeof updateHealthPluginNavigationAvailability === "function") updateHealthPluginNavigationAvailability();
  if (typeof updateNotePluginNavigationAvailability === "function") updateNotePluginNavigationAvailability();
  if (typeof updateGrowthPluginNavigationAvailability === "function") updateGrowthPluginNavigationAvailability();
  if (typeof updateMoiraPluginNavigationAvailability === "function") updateMoiraPluginNavigationAvailability();
  if (typeof updateMusicPluginNavigationAvailability === "function") updateMusicPluginNavigationAvailability();
  if (typeof updateMoviePluginNavigationAvailability === "function") updateMoviePluginNavigationAvailability();
  if (!(single && state.singleWindowMode === "chat")) renderChatScopeHeader(null);
  $("app")?.classList.toggle("todo-mode", todos);
  $("app")?.classList.toggle("inbox-mode", inbox);
  $("app")?.classList.toggle("automation-mode", automation);
  $("app")?.classList.toggle("system-console-mode", systemConsole);
  $("app")?.classList.toggle("workspace-console-mode", workspaceConsole);
  $("app")?.classList.toggle("capability-mode", capabilities);
  $("app")?.classList.toggle("learning-mode", learning);
  $("app")?.classList.toggle("projects-mode", directory);
  $("app")?.classList.toggle("wardrobe-mode", wardrobe);
  $("app")?.classList.toggle("codex-mode", codex);
  $("app")?.classList.toggle("finance-mode", finance);
  $("app")?.classList.toggle("email-mode", email);
  $("app")?.classList.toggle("health-mode", health);
  $("app")?.classList.toggle("note-mode", note);
  $("app")?.classList.toggle("growth-plugin-mode", growth);
  $("app")?.classList.toggle("moira-mode", moira);
  $("app")?.classList.toggle("music-mode", music);
  $("app")?.classList.toggle("movie-mode", movie);
  $("chatManagementMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("inboxManagementMode")?.classList.toggle("active", inbox);
  $("taskManagementMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("bottomChatMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("bottomInboxMode")?.classList.toggle("active", inbox);
  $("bottomWorkspaceMode")?.classList.toggle("active", workspaceConsole);
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
  $("todosMode").classList.toggle("active", capabilities);
  $("bottomTodosMode")?.classList.toggle("active", capabilities);
  $("bottomPluginMode")?.classList.toggle("active", wardrobe || finance || email || health || note || growth || moira || music || movie);
  $("bottomPluginWardrobeMode")?.classList.toggle("active", wardrobe);
  $("bottomWardrobeMode")?.classList.toggle("active", wardrobe);
  $("bottomCodexMode")?.classList.toggle("active", codex);
  $("bottomPluginFinanceMode")?.classList.toggle("active", finance);
  $("bottomFinanceMode")?.classList.toggle("active", finance);
  $("bottomPluginEmailMode")?.classList.toggle("active", email);
  $("bottomEmailMode")?.classList.toggle("active", email);
  $("bottomHealthMode")?.classList.toggle("active", health);
  $("bottomNoteMode")?.classList.toggle("active", note);
  $("bottomGrowthMode")?.classList.toggle("active", growth);
  $("bottomMoiraMode")?.classList.toggle("active", moira);
  $("bottomMusicMode")?.classList.toggle("active", music);
  $("bottomMovieMode")?.classList.toggle("active", movie);
  if (typeof syncEmbeddedPluginHostGlobalClasses === "function") syncEmbeddedPluginHostGlobalClasses();
  $("taskModeControls")?.classList.add("hidden");
  $("routeFields").classList.add("hidden");
  $("directoryEntry")?.classList.add("hidden");
  $("directoryEntry")?.parentElement?.classList.add("hidden");
  const newThreadPlan = automationViewModelFunction("automationNewThreadPlan");
  const newThreadState = newThreadPlan ? newThreadPlan(flags) : {
    hidden: single || tasks || automation || inbox || systemConsole || workspaceConsole || capabilities || learning || directory || todos || wardrobe || codex || finance || email || health || note || growth || moira || music || movie,
    disabled: single || tasks || automation || inbox || systemConsole || workspaceConsole || capabilities || learning || directory || todos || wardrobe || codex || finance || email || health || note || growth || moira || music || movie,
    text: todos ? "新建看板卡片" : "新建话题",
  };
  $("newThread").classList.toggle("hidden", Boolean(newThreadState.hidden));
  $("newThread").disabled = Boolean(newThreadState.disabled);
  $("newThread").textContent = newThreadState.text;
  const placeholderPlan = automationViewModelFunction("automationThreadSearchPlaceholderPlan");
  $("threadSearch").placeholder = placeholderPlan
    ? placeholderPlan(flags)
    : (single ? (state.singleWindowMode === "chat" ? "Search chat" : "Search topic stream") : tasks ? "Search topics" : inbox ? "Search inbox" : todos ? "Search Kanban" : automation ? "Search automations" : systemConsole ? "Search system status" : workspaceConsole ? "Search workspaces" : learning || growth ? "Search growth" : wardrobe ? "Search wardrobe" : email ? "Search email" : health ? "Search health" : note ? "Search notes" : moira ? "Search 星盘" : music ? "Search music" : movie ? "Search movie" : "Search directories");
  updateSearchButton();
  if (typeof updateTopMoreControls === "function") updateTopMoreControls();
}

async function loadSelectedView(options = {}) {
  const redirectPlan = automationViewModelFunction("automationLegacyViewRedirectPlan");
  const redirect = redirectPlan ? redirectPlan(state.viewMode) : {
    viewMode: state.viewMode === "capabilities" ? "tasks" : (state.viewMode === "learning" ? "growth" : state.viewMode),
    redirected: state.viewMode === "capabilities" || state.viewMode === "learning",
    storageKey: "hermesWebViewMode",
  };
  if (redirect.redirected) {
    state.viewMode = redirect.viewMode;
    localStorage.setItem(redirect.storageKey || "hermesWebViewMode", redirect.storageValue || state.viewMode);
  }
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
  if (state.viewMode !== "note" && typeof parkNotePluginShell === "function") {
    parkNotePluginShell();
  }
  if (state.viewMode !== "growth" && typeof parkGrowthPluginShell === "function") {
    parkGrowthPluginShell();
  }
  if (state.viewMode !== "moira" && typeof parkMoiraPluginShell === "function") {
    parkMoiraPluginShell();
  }
  if (state.viewMode !== "music" && typeof parkMusicPluginShell === "function") {
    parkMusicPluginShell();
  }
  if (state.viewMode !== "movie" && typeof parkMoviePluginShell === "function") {
    parkMoviePluginShell();
  }
  const directoryTopicDraft = typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive();
  if (state.viewMode !== "projects" && !directoryTopicDraft) state.directoryReturnRoute = null;
  if (state.viewMode !== "todos") clearTodoAutoRefresh();
  const leavingSkillDetail = Boolean(state.skillDetail && (state.viewMode !== "tasks" || !state.currentTaskGroupId));
  if (leavingSkillDetail) {
    state.skillDetail = null;
    const conversation = $("conversation");
    if (conversation) conversation.innerHTML = `<div class="empty-state small">Loading...</div>`;
  }
  applyViewMode();
  if (typeof scheduleGlobalPluginDockRefresh === "function") scheduleGlobalPluginDockRefresh("selected_view");
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
    await loadSingleWindow({
      skipSingleWindowCache: Boolean(options.skipSingleWindowCache || state.routeScrollMessageId),
    });
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
    const loadOptionsPlan = automationViewModelFunction("automationLoadOptionsPlan");
    await loadAutomations(loadOptionsPlan
      ? loadOptionsPlan(state.automationRouteTargetPending)
      : (state.automationRouteTargetPending
        ? { detail: "full", refresh: true, ignoreSearch: true, routeTarget: true }
        : {}));
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "inbox") {
    await loadActionInbox();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "system-console") {
    if (typeof renderOwnerSystemConsoleView === "function") renderOwnerSystemConsoleView();
    if (typeof loadOwnerSystemConsole === "function") await loadOwnerSystemConsole();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "workspace-console") {
    if (typeof renderWorkspaceConsoleView === "function") renderWorkspaceConsoleView();
    if (typeof loadWorkspaceConsole === "function") await loadWorkspaceConsole();
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
  } else if (state.viewMode === "note") {
    renderNotePluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "growth") {
    renderGrowthPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "moira") {
    renderMoiraPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "music") {
    renderMusicPluginView();
    if (!currentViewStillSelected()) return;
  } else if (state.viewMode === "movie") {
    renderMoviePluginView();
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
    list.innerHTML = `<div class="empty-state small">自动化管理入口已预留；后续接入 automation API。</div>`;
  }
  $("threadTitle").textContent = "自动化";
  $("threadMeta").textContent = "Automation management";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Automation management" });
  $("conversation").innerHTML = `
    <div class="empty-state">
      自动化入口已独立出来。当前版本尚未接入任务创建、暂停、运行接口；后续应直接桥接自动化任务列表、运行状态和触发操作。
    </div>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}
