"use strict";

function openTaskList() {
  clearQuotedReply({ render: false });
  state.skillDetail = null;
  const reloadTaskWindow = currentTaskThreadIsSharedTopicThread();
  const restoreScrollTop = typeof taskListReturnScrollTop === "function" ? taskListReturnScrollTop() : 0;
  state.currentTaskGroupId = "";
  if (reloadTaskWindow) {
    if (restoreTaskListThreadFromCache({ stickToBottom: false, restoreScrollTop })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false, preserveTaskListScroll: true }).catch(showError);
    return;
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: false, restoreScrollTop });
}

function openTodoList() {
  state.skillDetail = null;
  state.selectedTodoId = "";
  state.todoCreateOpen = false;
  state.actionInboxStatusFilter = "todo";
  if (typeof openActionInboxList === "function") {
    openActionInboxList();
  } else {
    state.viewMode = "inbox";
    renderActionInboxView();
  }
}

function openAutomationList() {
  state.skillDetail = null;
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
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
  return state.viewMode === "automation" && !isAutomationDetailView() && String(state.automationReturnRoute || "") === "inbox";
}

function automationDetailInboxReturnActive() {
  return state.viewMode === "automation"
    && isAutomationDetailView()
    && String(state.automationReturnRoute || "") === "inbox"
    && String(state.automationReturnScope || "") === "detail";
}

function closeAutomationSecondarySurface() {
  state.automationReturnRoute = "";
  state.automationReturnScope = "";
  state.automationReturnInboxItemId = "";
  state.selectedAutomationId = "";
  state.automationCreateOpen = false;
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  openActionInboxOverview();
}

async function openAutomationSurface(options = {}) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  const returnRoute = String(options.returnTo || "").trim();
  const returnScope = String(options.returnScope || "").trim();
  state.viewMode = "automation";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.automationReturnRoute = returnRoute === "inbox" ? "inbox" : "";
  state.automationReturnScope = state.automationReturnRoute && returnScope === "detail" ? "detail" : "";
  state.automationReturnInboxItemId = state.automationReturnRoute ? String(options.inboxItemId || "").trim() : "";
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  state.skillDetail = null;
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  state.automationCreateOpen = false;
  await loadSelectedView();
  if (options.create) openAutomationCreate();
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
