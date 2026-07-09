"use strict";

const NAVIGATION_VIEW_MODEL_ESM_PATH = "/vite-islands/navigation-view-model/navigation-view-model.js";
let navigationViewModelPromise = null;
let navigationViewModel = null;

function importNavigationViewModel() {
  if (navigationViewModel) return Promise.resolve(navigationViewModel);
  if (!navigationViewModelPromise) {
    const importer = window.__homeAiImportNavigationViewModel || ((path) => import(path));
    navigationViewModelPromise = importer(NAVIGATION_VIEW_MODEL_ESM_PATH)
      .then((model) => {
        navigationViewModel = model || null;
        return navigationViewModel;
      })
      .catch((error) => {
        console.warn("Navigation view ESM model unavailable", error);
        navigationViewModelPromise = null;
        return null;
      });
  }
  return navigationViewModelPromise;
}

function currentNavigationViewModel() {
  return navigationViewModel;
}

importNavigationViewModel();

function fallbackTaskListOpenPlan(input = {}) {
  const restoreScrollTop = Math.max(0, Number(input.restoreScrollTop || 0) || 0);
  return {
    statePatch: {
      skillDetail: null,
      currentTaskGroupId: "",
    },
    restoreCacheOptions: { stickToBottom: false, restoreScrollTop },
    reloadTaskWindow: Boolean(input.reloadTaskWindow),
  };
}

function classicTaskListOpenPlan(input = {}) {
  const model = currentNavigationViewModel();
  if (model && typeof model.taskListOpenPlan === "function") return model.taskListOpenPlan(input);
  return fallbackTaskListOpenPlan(input);
}

function fallbackTodoListOpenPlan(input = {}) {
  return {
    statePatch: {
      skillDetail: null,
      selectedTodoId: "",
      todoCreateOpen: false,
      actionInboxStatusFilter: "todo",
      viewMode: input.hasOpenActionInboxList ? "" : "inbox",
    },
    action: input.hasOpenActionInboxList ? "open_action_inbox_list" : "render_action_inbox_view",
  };
}

function classicTodoListOpenPlan(input = {}) {
  const model = currentNavigationViewModel();
  if (model && typeof model.todoListOpenPlan === "function") return model.todoListOpenPlan(input);
  return fallbackTodoListOpenPlan(input);
}

function fallbackAutomationListOpenPlan() {
  return {
    statePatch: {
      skillDetail: null,
      selectedAutomationId: "",
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    },
  };
}

function classicAutomationListOpenPlan(input = {}) {
  const model = currentNavigationViewModel();
  if (model && typeof model.automationListOpenPlan === "function") return model.automationListOpenPlan(input);
  return fallbackAutomationListOpenPlan(input);
}

function classicAutomationReturnActivePlan(input = {}) {
  const model = currentNavigationViewModel();
  if (model && typeof model.automationReturnActivePlan === "function") return model.automationReturnActivePlan(input);
  const viewMode = String(input.viewMode || "");
  const returnRoute = String(input.automationReturnRoute || "");
  const returnScope = String(input.automationReturnScope || "");
  return {
    secondaryReturnActive: viewMode === "automation" && !input.automationDetailView && returnRoute === "inbox",
    detailInboxReturnActive: viewMode === "automation" && input.automationDetailView && returnRoute === "inbox" && returnScope === "detail",
  };
}

function classicAutomationSecondaryClosePlan() {
  const model = currentNavigationViewModel();
  if (model && typeof model.automationSecondaryClosePlan === "function") return model.automationSecondaryClosePlan();
  return {
    statePatch: {
      automationReturnRoute: "",
      automationReturnScope: "",
      automationReturnInboxItemId: "",
      selectedAutomationId: "",
      automationCreateOpen: false,
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    },
  };
}

function classicAutomationSurfaceOpenPlan(options = {}) {
  const model = currentNavigationViewModel();
  if (model && typeof model.automationSurfaceOpenPlan === "function") return model.automationSurfaceOpenPlan(options);
  const returnRoute = String(options.returnTo || "").trim();
  const returnScope = String(options.returnScope || "").trim();
  const automationReturnRoute = returnRoute === "inbox" ? "inbox" : "";
  return {
    statePatch: {
      viewMode: "automation",
      automationReturnRoute,
      automationReturnScope: automationReturnRoute && returnScope === "detail" ? "detail" : "",
      automationReturnInboxItemId: automationReturnRoute ? String(options.inboxItemId || "").trim() : "",
      currentTaskGroupId: "",
      currentThread: null,
      currentThreadId: "",
      skillDetail: null,
      selectedAutomationId: "",
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
      automationCreateOpen: false,
    },
    storage: { key: "hermesWebViewMode", value: "automation" },
    createAfterLoad: Boolean(options.create),
  };
}

function applyNavigationViewPatch(patch = {}) {
  if (!patch || typeof patch !== "object") return;
  for (const [key, value] of Object.entries(patch)) {
    state[key] = value;
  }
}

function openTaskList() {
  clearQuotedReply({ render: false });
  const reloadTaskWindow = currentTaskThreadIsSharedTopicThread();
  const restoreScrollTop = typeof taskListReturnScrollTop === "function" ? taskListReturnScrollTop() : 0;
  const plan = classicTaskListOpenPlan({ reloadTaskWindow, restoreScrollTop });
  applyNavigationViewPatch(plan.statePatch);
  if (restoreTaskListThreadFromCache(plan.restoreCacheOptions || { stickToBottom: false, restoreScrollTop })) {
    scheduleTaskListWindowRefresh();
    return;
  }
  if (plan.reloadTaskWindow) {
    loadSingleWindow({ groupChat: false, preserveTaskListScroll: true }).catch(showError);
    return;
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: false, restoreScrollTop });
  scheduleTaskListWindowRefresh();
}

function openTodoList() {
  const plan = classicTodoListOpenPlan({ hasOpenActionInboxList: typeof openActionInboxList === "function" });
  applyNavigationViewPatch(plan.statePatch);
  if (typeof openActionInboxList === "function") {
    openActionInboxList();
  } else {
    state.viewMode = "inbox";
    renderActionInboxView();
  }
}

function openAutomationList() {
  const plan = classicAutomationListOpenPlan();
  applyNavigationViewPatch(plan.statePatch);
  renderAutomationView();
}

function cancelAutomationViewLoads() {
  state.automationRequestSeq = (state.automationRequestSeq || 0) + 1;
  state.automationDetailRequestSeq = (state.automationDetailRequestSeq || 0) + 1;
  state.automationLoading = false;
  state.automationDetailLoading = false;
  state.automationRouteTargetPending = false;
  state.automationRouteTargetId = "";
}

function automationSecondaryReturnActive() {
  return classicAutomationReturnActivePlan({
    viewMode: state.viewMode,
    automationDetailView: isAutomationDetailView(),
    automationReturnRoute: state.automationReturnRoute,
    automationReturnScope: state.automationReturnScope,
  }).secondaryReturnActive;
}

function automationDetailInboxReturnActive() {
  return classicAutomationReturnActivePlan({
    viewMode: state.viewMode,
    automationDetailView: isAutomationDetailView(),
    automationReturnRoute: state.automationReturnRoute,
    automationReturnScope: state.automationReturnScope,
  }).detailInboxReturnActive;
}

function closeAutomationSecondarySurface() {
  const plan = classicAutomationSecondaryClosePlan();
  applyNavigationViewPatch(plan.statePatch);
  openActionInboxOverview();
}

async function openAutomationSurface(options = {}) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  const plan = classicAutomationSurfaceOpenPlan(options);
  applyNavigationViewPatch(plan.statePatch);
  if (plan.storage && plan.storage.key) localStorage.setItem(plan.storage.key, plan.storage.value);
  await loadSelectedView();
  if (plan.createAfterLoad) openAutomationCreate();
}

function openActionInboxOverview() {
  state.skillDetail = null;
  openActionInboxList();
}

function resetSidebarScroll() {
  const sidebar = $("sidebar");
  const threadList = $("threadList");
  if (sidebar) sidebar.scrollTop = 0;
  if (threadList) threadList.scrollTop = 0;
}
