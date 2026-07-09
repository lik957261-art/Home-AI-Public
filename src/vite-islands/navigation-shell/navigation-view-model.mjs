const NAVIGATION_VIEW_MODEL_VERSION = "20260704-navigation-view-model-v1";

function text(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function truthy(value) {
  return Boolean(value);
}

function numberOrZero(value) {
  const number = Number(value || 0) || 0;
  return Number.isFinite(number) ? number : 0;
}

export function taskListOpenPlan(input = {}) {
  const restoreScrollTop = Math.max(0, numberOrZero(input.restoreScrollTop));
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    statePatch: Object.freeze({
      skillDetail: null,
      currentTaskGroupId: "",
    }),
    restoreCacheOptions: Object.freeze({
      stickToBottom: false,
      restoreScrollTop,
    }),
    reloadTaskWindow: truthy(input.reloadTaskWindow),
    cacheHitAction: "schedule_task_list_window_refresh",
    reloadAction: "load_single_window",
    fallbackAction: "render_task_list",
  });
}

export function todoListOpenPlan(input = {}) {
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    statePatch: Object.freeze({
      skillDetail: null,
      selectedTodoId: "",
      todoCreateOpen: false,
      actionInboxStatusFilter: "todo",
      viewMode: truthy(input.hasOpenActionInboxList) ? "" : "inbox",
    }),
    action: truthy(input.hasOpenActionInboxList) ? "open_action_inbox_list" : "render_action_inbox_view",
  });
}

export function automationListOpenPlan() {
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    statePatch: Object.freeze({
      skillDetail: null,
      selectedAutomationId: "",
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    }),
    action: "render_automation_view",
  });
}

export function automationReturnActivePlan(input = {}) {
  const viewMode = text(input.viewMode, 80);
  const returnRoute = text(input.automationReturnRoute, 80);
  const returnScope = text(input.automationReturnScope, 80);
  const detailView = truthy(input.automationDetailView);
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    secondaryReturnActive: viewMode === "automation" && !detailView && returnRoute === "inbox",
    detailInboxReturnActive: viewMode === "automation" && detailView && returnRoute === "inbox" && returnScope === "detail",
  });
}

export function automationSecondaryClosePlan() {
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    statePatch: Object.freeze({
      automationReturnRoute: "",
      automationReturnScope: "",
      automationReturnInboxItemId: "",
      selectedAutomationId: "",
      automationCreateOpen: false,
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    }),
    action: "open_action_inbox_overview",
  });
}

export function automationSurfaceOpenPlan(options = {}) {
  const returnRoute = text(options.returnTo, 80);
  const returnScope = text(options.returnScope, 80);
  const normalizedReturnRoute = returnRoute === "inbox" ? "inbox" : "";
  return Object.freeze({
    version: NAVIGATION_VIEW_MODEL_VERSION,
    statePatch: Object.freeze({
      viewMode: "automation",
      automationReturnRoute: normalizedReturnRoute,
      automationReturnScope: normalizedReturnRoute && returnScope === "detail" ? "detail" : "",
      automationReturnInboxItemId: normalizedReturnRoute ? text(options.inboxItemId, 240) : "",
      currentTaskGroupId: "",
      currentThread: null,
      currentThreadId: "",
      skillDetail: null,
      selectedAutomationId: "",
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
      automationCreateOpen: false,
    }),
    storage: Object.freeze({
      key: "hermesWebViewMode",
      value: "automation",
    }),
    createAfterLoad: truthy(options.create),
  });
}

export {
  NAVIGATION_VIEW_MODEL_VERSION,
};
