const DEFAULT_SINGLE_WINDOW_MODE = "task";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function sanitizeRouteValue(value, max = 160) {
  return cleanString(value, max)
    .replace(/[\\/]+/g, "")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .replace(/[^\w.:-]/g, "");
}

function taskTopicActionId(kind = "", id = "") {
  const normalizedKind = sanitizeRouteValue(kind, 80) || "topic";
  const normalizedId = sanitizeRouteValue(id, 160) || "unknown";
  return `${normalizedKind}:${normalizedId}`;
}

function taskTopicClassicHref(routePatch = {}) {
  const params = new URLSearchParams();
  params.set("view", "tasks");
  params.set("singleWindowMode", DEFAULT_SINGLE_WINDOW_MODE);
  for (const key of ["workspaceId", "threadId", "taskGroupId", "pluginId", "topicId"]) {
    const value = sanitizeRouteValue(routePatch[key], 160);
    if (value) params.set(key, value);
  }
  return `/?${params.toString()}`;
}

function enabledTaskGroupAction({ kind, id, threadId, workspaceId, pluginId = "" }) {
  const taskGroupId = sanitizeRouteValue(id, 160);
  const routePatch = Object.freeze({
    viewMode: "tasks",
    singleWindowMode: DEFAULT_SINGLE_WINDOW_MODE,
    currentTaskGroupId: taskGroupId,
    taskGroupId,
    currentThreadId: sanitizeRouteValue(threadId, 160),
    threadId: sanitizeRouteValue(threadId, 160),
    selectedWorkspaceId: sanitizeRouteValue(workspaceId, 120),
    workspaceId: sanitizeRouteValue(workspaceId, 120),
    pluginContextNavPluginId: sanitizeRouteValue(pluginId, 80),
    pluginId: sanitizeRouteValue(pluginId, 80),
  });
  return Object.freeze({
    actionId: taskTopicActionId(kind, taskGroupId || pluginId),
    kind,
    enabled: Boolean(taskGroupId),
    disabledReason: taskGroupId ? "" : "missing_task_group_id",
    routePatch,
    classicFallbackHref: taskTopicClassicHref(routePatch),
  });
}

function disabledTopicAction(kind = "", id = "", disabledReason = "unavailable") {
  return Object.freeze({
    actionId: taskTopicActionId(kind, id),
    kind,
    enabled: false,
    disabledReason,
    routePatch: Object.freeze({}),
    classicFallbackHref: "",
  });
}

function directoryTopicActions(taskTopicShell = {}, context = {}) {
  return (taskTopicShell.directoryCollections || []).map((item) => {
    const defaultGroupId = sanitizeRouteValue(item.defaultGroupId || item.groupIds?.[0] || "", 160);
    const action = defaultGroupId
      ? enabledTaskGroupAction({
        kind: "directory_topic",
        id: defaultGroupId,
        threadId: taskTopicShell.threadId,
        workspaceId: context.workspaceId,
      })
      : disabledTopicAction("directory_topic", item.key || item.label, "missing_default_topic");
    return Object.freeze(Object.assign({}, item, { action }));
  });
}

function regularTopicActions(taskTopicShell = {}, context = {}) {
  return (taskTopicShell.visibleRegularGroups || []).map((item) => Object.freeze(Object.assign({}, item, {
    action: enabledTaskGroupAction({
      kind: "regular_topic",
      id: item.id,
      threadId: taskTopicShell.threadId,
      workspaceId: context.workspaceId,
    }),
  })));
}

function pluginTopicActions(taskTopicShell = {}, context = {}) {
  return (taskTopicShell.pluginCards || []).map((item) => Object.freeze(Object.assign({}, item, {
    action: enabledTaskGroupAction({
      kind: "plugin_topic",
      id: item.id,
      threadId: taskTopicShell.threadId,
      workspaceId: context.workspaceId,
      pluginId: item.pluginId,
    }),
  })));
}

function buildTaskTopicActionModel(taskTopicShell = {}, context = {}) {
  const normalizedContext = Object.freeze({
    workspaceId: sanitizeRouteValue(context.workspaceId || context.selectedWorkspaceId || "owner", 120) || "owner",
    threadId: sanitizeRouteValue(context.threadId || taskTopicShell.threadId || "", 160),
  });
  return Object.freeze({
    context: normalizedContext,
    directoryCollections: Object.freeze(directoryTopicActions(taskTopicShell, normalizedContext)),
    visibleRegularGroups: Object.freeze(regularTopicActions(taskTopicShell, normalizedContext)),
    pluginCards: Object.freeze(pluginTopicActions(taskTopicShell, normalizedContext)),
  });
}

function findTaskTopicAction(actionModel = {}, actionId = "") {
  const id = cleanString(actionId, 240);
  if (!id) return null;
  const all = [
    ...(actionModel.directoryCollections || []),
    ...(actionModel.visibleRegularGroups || []),
    ...(actionModel.pluginCards || []),
  ];
  return all.find((item) => item?.action?.actionId === id)?.action || null;
}

export {
  buildTaskTopicActionModel,
  cleanString,
  disabledTopicAction,
  enabledTaskGroupAction,
  findTaskTopicAction,
  sanitizeRouteValue,
  taskTopicActionId,
  taskTopicClassicHref,
};
