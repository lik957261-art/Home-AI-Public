import {
  normalizeSingleWindowMode,
  normalizeViewMode,
} from "./model.mjs";
import { sanitizeRouteValue } from "./task-topic-action-model.mjs";

const PREVIEW_ROUTE_KEYS = Object.freeze([
  "view",
  "singleWindowMode",
  "workspaceId",
  "threadId",
  "taskGroupId",
  "pluginId",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function searchParamsFromRoute(route = {}) {
  const raw = cleanString(typeof route === "string" ? route : route.search || "", 2000);
  const query = raw.startsWith("?") ? raw.slice(1) : raw;
  try {
    return new URLSearchParams(query);
  } catch (_) {
    return new URLSearchParams();
  }
}

function firstParam(params, keys = []) {
  for (const key of keys) {
    const value = cleanString(params.get(key), 240);
    if (value) return value;
  }
  return "";
}

function routePatchFromParams(params = new URLSearchParams(), options = {}) {
  const viewParam = firstParam(params, ["view", "viewMode", "mode"]);
  const taskGroupId = sanitizeRouteValue(firstParam(params, ["taskGroupId", "taskId", "topicId"]), 160);
  const pluginId = sanitizeRouteValue(firstParam(params, ["pluginId"]), 80);
  const threadId = sanitizeRouteValue(firstParam(params, ["threadId", "thread_id"]), 160);
  const workspaceId = sanitizeRouteValue(firstParam(params, ["workspaceId", "workspace_id"]), 120);
  const hasRoute = Boolean(viewParam || taskGroupId || pluginId || threadId || workspaceId);
  if (!hasRoute) {
    return Object.freeze({
      hasRoute: false,
      routePatch: Object.freeze({}),
    });
  }

  const viewMode = normalizeViewMode(
    viewParam || (taskGroupId ? "tasks" : options.fallbackViewMode || "tasks"),
    options.fallbackViewMode || "tasks",
  );
  const singleWindowMode = normalizeSingleWindowMode(
    firstParam(params, ["singleWindowMode", "single_window_mode"]) || (viewMode === "tasks" ? "task" : ""),
  );
  const routePatch = {
    viewMode,
    singleWindowMode,
  };
  if (workspaceId) {
    routePatch.selectedWorkspaceId = workspaceId;
    routePatch.workspaceId = workspaceId;
  }
  if (threadId) {
    routePatch.currentThreadId = threadId;
    routePatch.threadId = threadId;
  }
  if (viewMode === "tasks") {
    routePatch.currentTaskGroupId = taskGroupId;
    routePatch.taskGroupId = taskGroupId;
  } else {
    routePatch.currentTaskGroupId = "";
    routePatch.taskGroupId = "";
  }
  if (viewMode === "tasks") {
    routePatch.pluginContextNavPluginId = pluginId;
    routePatch.pluginId = pluginId;
  } else {
    routePatch.pluginContextNavPluginId = "";
    routePatch.pluginId = "";
  }
  return Object.freeze({
    hasRoute: true,
    routePatch: Object.freeze(routePatch),
  });
}

function navigationRoutePatchFromCurrentRoute(route = {}, options = {}) {
  return routePatchFromParams(searchParamsFromRoute(route), options);
}

function routePatchFromState(state = {}) {
  const viewMode = normalizeViewMode(state.viewMode);
  const singleWindowMode = normalizeSingleWindowMode(state.singleWindowMode);
  const taskGroupId = sanitizeRouteValue(state.currentTaskGroupId || state.taskGroupId || "", 160);
  const pluginId = sanitizeRouteValue(state.pluginContextNavPluginId || state.pluginId || "", 80);
  const threadId = sanitizeRouteValue(
    viewMode === "tasks" && !taskGroupId
      ? state.taskListThreadId || state.currentThreadId || state.threadId || ""
      : state.currentThreadId || state.threadId || state.taskListThreadId || "",
    160,
  );
  const workspaceId = sanitizeRouteValue(state.selectedWorkspaceId || state.workspaceId || "", 120);
  const routePatch = {
    viewMode,
    singleWindowMode,
  };
  if (workspaceId) routePatch.workspaceId = workspaceId;
  if (threadId) routePatch.threadId = threadId;
  if (viewMode === "tasks" && taskGroupId) routePatch.taskGroupId = taskGroupId;
  if (viewMode === "tasks" && pluginId) routePatch.pluginId = pluginId;
  return Object.freeze(routePatch);
}

function navigationPreviewUrlForPatch(routePatch = {}, currentRoute = {}) {
  const pathname = cleanString(currentRoute.pathname || "/vite-navigation-shell-preview/", 400) || "/vite-navigation-shell-preview/";
  const params = new URLSearchParams();
  const viewMode = normalizeViewMode(routePatch.viewMode || routePatch.view);
  params.set("view", viewMode);
  const singleWindowMode = normalizeSingleWindowMode(routePatch.singleWindowMode);
  if (viewMode === "chat" || viewMode === "tasks" || singleWindowMode === "task") {
    params.set("singleWindowMode", singleWindowMode);
  }
  const safe = {
    workspaceId: sanitizeRouteValue(routePatch.workspaceId || routePatch.selectedWorkspaceId || "", 120),
    threadId: sanitizeRouteValue(routePatch.threadId || routePatch.currentThreadId || "", 160),
    taskGroupId: sanitizeRouteValue(routePatch.taskGroupId || routePatch.currentTaskGroupId || "", 160),
    pluginId: sanitizeRouteValue(routePatch.pluginId || routePatch.pluginContextNavPluginId || "", 80),
  };
  if (safe.workspaceId) params.set("workspaceId", safe.workspaceId);
  if (safe.threadId) params.set("threadId", safe.threadId);
  if (viewMode === "tasks" && safe.taskGroupId) params.set("taskGroupId", safe.taskGroupId);
  if (viewMode === "tasks" && safe.pluginId) params.set("pluginId", safe.pluginId);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

function previewRouteSummary(routePatch = {}) {
  const safe = routePatchFromState(routePatch);
  const summary = { view: safe.viewMode };
  return Object.freeze(PREVIEW_ROUTE_KEYS.reduce((summary, key) => {
    if (safe[key]) summary[key] = safe[key];
    return summary;
  }, summary));
}

export {
  PREVIEW_ROUTE_KEYS,
  cleanString,
  navigationPreviewUrlForPatch,
  navigationRoutePatchFromCurrentRoute,
  previewRouteSummary,
  routePatchFromParams,
  routePatchFromState,
  searchParamsFromRoute,
};
