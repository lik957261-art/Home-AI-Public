"use strict";

const HERMES_ROUTE_SNAPSHOT_KEY = "hermesWebRouteSnapshot";
const HERMES_ROUTE_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function boundedRouteSnapshotValue(value = "", max = 180) {
  return String(value || "").trim().slice(0, max);
}

function visibleRouteSnapshotMessageId() {
  const conversation = $("conversation");
  if (!conversation) return "";
  const items = [...conversation.querySelectorAll("[data-message-id]")];
  if (!items.length) return "";
  const viewportTop = conversation.getBoundingClientRect?.().top || 0;
  let best = null;
  let bestDistance = Infinity;
  items.forEach((item) => {
    const id = boundedRouteSnapshotValue(item.dataset.messageId || "");
    if (!id) return;
    const rect = item.getBoundingClientRect?.();
    if (!rect) return;
    const distance = Math.abs(rect.top - viewportTop);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  });
  return best || "";
}

function pluginRouteSnapshotForView(viewMode = "") {
  const mode = String(viewMode || "").trim();
  if (mode === "wardrobe") return state.wardrobePluginOpenRoute || null;
  const pluginId = mode === "codex" ? "codex-mobile" : mode;
  const record = state.embeddedPlugins?.[pluginId] || null;
  return record?.openRoute || null;
}

function currentAppRouteSnapshotParams() {
  const params = new URLSearchParams();
  const view = normalizedRouteView(state.viewMode || "", "");
  if (!view) return null;
  params.set("view", view);
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  const pluginContextId = boundedRouteSnapshotValue(state.pluginContextNavPluginId || "");
  if (pluginContextId) params.set("pluginContextNavPluginId", pluginContextId);
  if (view === "tasks") {
    if (state.currentTaskGroupId) {
      params.set("taskGroupId", boundedRouteSnapshotValue(state.currentTaskGroupId));
      const messageId = visibleRouteSnapshotMessageId();
      if (messageId) params.set("messageId", messageId);
    }
  } else if (view === "single") {
    if (state.weixinChatOpen) params.set("weixinChat", "1");
    if (state.groupChatOpen) params.set("groupChat", "1");
    if (state.currentThreadId) params.set("threadId", boundedRouteSnapshotValue(state.currentThreadId));
    const messageId = visibleRouteSnapshotMessageId();
    if (messageId) params.set("messageId", messageId);
  } else if (view === "todos") {
    if (state.selectedTodoId) params.set("todoId", boundedRouteSnapshotValue(state.selectedTodoId));
  } else if (view === "automation") {
    if (state.selectedAutomationId) params.set("automationId", boundedRouteSnapshotValue(state.selectedAutomationId));
  } else if (view === "inbox") {
    if (state.selectedActionInboxItemId) params.set("inboxItemId", boundedRouteSnapshotValue(state.selectedActionInboxItemId));
  } else if (view === "learning") {
    if (state.selectedLearningTaskCardId) params.set("taskCardId", boundedRouteSnapshotValue(state.selectedLearningTaskCardId));
  } else if (view === "projects") {
    if (state.selectedProjectId) params.set("projectId", boundedRouteSnapshotValue(state.selectedProjectId));
    if (state.selectedSubprojectId) params.set("subprojectId", boundedRouteSnapshotValue(state.selectedSubprojectId));
    if (state.directoryPath) params.set("directoryPath", boundedRouteSnapshotValue(state.directoryPath, 600));
    if (state.directoryRootPath) params.set("directoryRoot", boundedRouteSnapshotValue(state.directoryRootPath, 600));
  } else if (["wardrobe", "codex", "finance", "email", "health", "note"].includes(view)) {
    const pluginId = view === "codex" ? "codex-mobile" : view;
    params.set("pluginId", pluginId);
    const route = pluginRouteSnapshotForView(view);
    if (route && typeof route === "object") {
      ["pluginRoute", "pluginItemId", "pluginThreadId", "pluginTaskId", "sourceTurnId"].forEach((key) => {
        const text = boundedRouteSnapshotValue(route[key] || "");
        if (text) params.set(key, text);
      });
    }
  }
  return params;
}

function persistAppRouteSnapshot(reason = "state") {
  try {
    const params = currentAppRouteSnapshotParams();
    if (!params) return false;
    const conversation = $("conversation");
    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      reason: boundedRouteSnapshotValue(reason, 60),
      route: hermesAppShellRouteForParams(params),
      scrollTop: Math.max(0, Math.round(Number(conversation?.scrollTop || 0) || 0)),
    };
    localStorage.setItem(HERMES_ROUTE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleAppRouteSnapshot(reason = "state", delay = 160) {
  if (state.routeSnapshotTimer) window.clearTimeout(state.routeSnapshotTimer);
  state.routeSnapshotTimer = window.setTimeout(() => {
    state.routeSnapshotTimer = 0;
    persistAppRouteSnapshot(reason);
  }, Math.max(0, Number(delay || 0)));
}

function routeParamsHaveExplicitLaunchTarget(params) {
  if (!params) return false;
  return [
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
    "pluginRoute",
    "pluginItemId",
    "pluginThreadId",
    "pluginTaskId",
    "sourceTurnId",
    "projectId",
    "subprojectId",
    "directoryPath",
  ].some((key) => boundedRouteSnapshotValue(params.get(key) || ""));
}

function readAppRouteSnapshot() {
  try {
    const raw = localStorage.getItem(HERMES_ROUTE_SNAPSHOT_KEY) || "";
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object") return null;
    const savedAt = Number(snapshot.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > HERMES_ROUTE_SNAPSHOT_MAX_AGE_MS) return null;
    const parsed = sameOriginRouteUrl(snapshot.route || "");
    if (!parsed) return null;
    return { parsed, scrollTop: Math.max(0, Math.round(Number(snapshot.scrollTop || 0) || 0)) };
  } catch (_) {
    return null;
  }
}

function applyRestoredAppRouteSnapshot() {
  const currentParams = new URLSearchParams(window.location.search || "");
  if (routeParamsHaveExplicitLaunchTarget(currentParams)) return false;
  const snapshot = readAppRouteSnapshot();
  if (!snapshot) return false;
  const params = new URLSearchParams(snapshot.parsed.search || "");
  if (!requireHermesAppWindowForRoute(params)) return false;
  if (!applyRouteParams(params)) return false;
  state.pendingAppRouteRestoreScrollTop = snapshot.scrollTop;
  state.pendingAppRouteRestoreMessageId = boundedRouteSnapshotValue(params.get("messageId") || "");
  return true;
}

function restoreAppRouteSnapshotPosition() {
  const scrollTop = Math.max(0, Number(state.pendingAppRouteRestoreScrollTop || 0) || 0);
  const messageId = boundedRouteSnapshotValue(state.pendingAppRouteRestoreMessageId || "");
  state.pendingAppRouteRestoreScrollTop = 0;
  state.pendingAppRouteRestoreMessageId = "";
  if (messageId && typeof scrollRouteMessageIntoViewStable === "function") {
    scrollRouteMessageIntoViewStable(messageId, "start");
    return true;
  }
  if (!scrollTop) return false;
  const applyScroll = () => {
    const conversation = $("conversation");
    if (conversation) conversation.scrollTop = Math.min(scrollTop, Math.max(0, conversation.scrollHeight - conversation.clientHeight));
  };
  requestAnimationFrame(applyScroll);
  window.setTimeout(applyScroll, 180);
  window.setTimeout(applyScroll, 560);
  return true;
}
