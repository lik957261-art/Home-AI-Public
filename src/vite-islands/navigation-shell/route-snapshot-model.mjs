const RETURN_ROUTE_FIELDS = Object.freeze([
  ["returnPluginContextNavPluginId", "pluginContextNavPluginId", 180],
  ["returnSingleWindowMode", "singleWindowMode", 180],
  ["returnTaskGroupId", "currentTaskGroupId", 180],
  ["returnThreadId", "currentThreadId", 180],
  ["returnProjectId", "selectedProjectId", 180],
  ["returnSubprojectId", "selectedSubprojectId", 180],
  ["returnTodoId", "selectedTodoId", 180],
  ["returnAutomationId", "selectedAutomationId", 180],
  ["returnInboxItemId", "selectedActionInboxItemId", 180],
  ["returnLearningTaskCardId", "selectedLearningTaskCardId", 180],
  ["returnDirectoryPath", "directoryPath", 600],
  ["returnDirectoryRoot", "directoryRootPath", 600],
  ["returnSearchText", "searchText", 180],
]);

const RETURN_ROUTE_FLAGS = Object.freeze([
  ["returnTodoCreate", "todoCreateOpen"],
  ["returnAutomationCreate", "automationCreateOpen"],
  ["returnAutomationEdit", "automationEditOpen"],
  ["returnInboxCreate", "actionInboxCreateOpen"],
  ["returnLearningSettings", "learningGrowthSettingsOpen"],
  ["returnSharedDirectoryManager", "sharedDirectoryManagerOpen"],
]);

const EXPLICIT_LAUNCH_TARGET_KEYS = Object.freeze([
  "view",
  "viewMode",
  "automationId",
  "inboxItemId",
  "actionInboxItemId",
  "todoId",
  "taskCardId",
  "taskGroupId",
  "taskId",
  "messageId",
  "pluginActionId",
  "pluginRoute",
  "pluginItemId",
  "pluginThreadId",
  "pluginTaskId",
  "sourceTurnId",
  "projectId",
  "subprojectId",
  "directoryPath",
]);

export function boundedRouteSnapshotValuePlan(value = "", max = 180) {
  return String(value || "").trim().slice(0, Math.max(0, Number(max || 0) || 0));
}

export function enabledRouteSnapshotFlag(value = "") {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function paramsGet(params, key) {
  if (!params) return "";
  if (typeof params.get === "function") return params.get(key) || "";
  if (Object.prototype.hasOwnProperty.call(params, key)) return params[key] || "";
  return "";
}

export function embeddedPluginReturnRouteSnapshotEntries(route = null) {
  if (!route || typeof route !== "object") return { ok: false, entries: [] };
  const viewMode = boundedRouteSnapshotValuePlan(route.viewMode || "");
  if (!viewMode) return { ok: false, entries: [] };
  const entries = [["returnView", viewMode]];
  for (const [key, field, max] of RETURN_ROUTE_FIELDS) {
    const text = boundedRouteSnapshotValuePlan(route[field] || "", max);
    if (text) entries.push([key, text]);
  }
  for (const [key, field] of RETURN_ROUTE_FLAGS) {
    if (route[field]) entries.push([key, "1"]);
  }
  const scrollTop = Math.max(0, Math.round(Number(route.conversationScrollTop || 0) || 0));
  if (scrollTop) entries.push(["returnConversationScrollTop", String(scrollTop)]);
  return { ok: true, entries };
}

export function embeddedPluginReturnRouteFromSnapshotParamsPlan(params, options = {}) {
  const normalizedView = boundedRouteSnapshotValuePlan(options.normalizedView || "");
  const returnView = boundedRouteSnapshotValuePlan(paramsGet(params, "returnView") || "");
  if (!returnView) {
    return normalizedView === "codex" ? { viewMode: "tasks", singleWindowMode: "chat" } : null;
  }
  return {
    viewMode: returnView,
    pluginContextNavPluginId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnPluginContextNavPluginId") || ""),
    singleWindowMode: boundedRouteSnapshotValuePlan(paramsGet(params, "returnSingleWindowMode") || "chat"),
    selectedProjectId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnProjectId") || ""),
    selectedSubprojectId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnSubprojectId") || ""),
    currentThread: null,
    currentThreadId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnThreadId") || ""),
    currentTaskGroupId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnTaskGroupId") || ""),
    threads: [],
    selectedTodoId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnTodoId") || ""),
    todoCreateOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnTodoCreate")),
    selectedAutomationId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnAutomationId") || ""),
    automationCreateOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnAutomationCreate")),
    automationEditOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnAutomationEdit")),
    selectedActionInboxItemId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnInboxItemId") || ""),
    actionInboxCreateOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnInboxCreate")),
    selectedLearningTaskCardId: boundedRouteSnapshotValuePlan(paramsGet(params, "returnLearningTaskCardId") || ""),
    learningGrowthSettingsOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnLearningSettings")),
    directoryPath: boundedRouteSnapshotValuePlan(paramsGet(params, "returnDirectoryPath") || "", 600),
    directoryRootPath: boundedRouteSnapshotValuePlan(paramsGet(params, "returnDirectoryRoot") || "", 600),
    sharedDirectoryManagerOpen: enabledRouteSnapshotFlag(paramsGet(params, "returnSharedDirectoryManager")),
    conversationScrollTop: Math.max(0, Math.round(Number(paramsGet(params, "returnConversationScrollTop") || 0) || 0)),
    searchText: boundedRouteSnapshotValuePlan(paramsGet(params, "returnSearchText") || ""),
  };
}

export function routeParamsHaveExplicitLaunchTargetPlan(params) {
  return EXPLICIT_LAUNCH_TARGET_KEYS.some((key) => boundedRouteSnapshotValuePlan(paramsGet(params, key) || ""));
}
