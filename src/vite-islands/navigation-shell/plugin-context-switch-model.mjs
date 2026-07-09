const DEFAULT_KNOWN_PLUGIN_VIEW_MODES = Object.freeze([
  ["codex-mobile", "codex"],
  ["wardrobe", "wardrobe"],
  ["finance", "finance"],
  ["email", "email"],
  ["health", "health"],
  ["note", "note"],
  ["growth", "growth"],
  ["moira", "moira"],
  ["music", "music"],
  ["movie", "movie"],
]);

function cleanPluginContextValue(value = "", max = 120) {
  return String(value || "").trim().slice(0, Math.max(0, Number(max) || 0));
}

function normalizePluginContextId(value = "") {
  return cleanPluginContextValue(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pluginContextGroupId(pluginId = "") {
  const id = normalizePluginContextId(pluginId);
  return id ? `plugin:${id}` : "";
}

function knownPluginViewModeMap(defs = DEFAULT_KNOWN_PLUGIN_VIEW_MODES) {
  const map = new Map();
  for (const entry of Array.isArray(defs) ? defs : []) {
    if (Array.isArray(entry)) {
      const id = normalizePluginContextId(entry[0]);
      const viewMode = cleanPluginContextValue(entry[1] || id, 80);
      if (id && viewMode) map.set(viewMode, id);
      continue;
    }
    if (entry && typeof entry === "object" && !entry.builtinKind) {
      const id = normalizePluginContextId(entry.id);
      const viewMode = cleanPluginContextValue(entry.viewMode || id, 80);
      if (id && viewMode) map.set(viewMode, id);
    }
  }
  return map;
}

function pluginContextSwitchTargetPlan(state = {}, options = {}) {
  const source = state && typeof state === "object" ? state : {};
  const viewMode = cleanPluginContextValue(source.viewMode, 80);
  const taskGroupId = cleanPluginContextValue(source.currentTaskGroupId || source.taskGroupId, 160);
  const explicitPluginId = normalizePluginContextId(source.pluginContextNavPluginId || source.pluginId);
  const viewModeMap = knownPluginViewModeMap(options.pluginDefs || options.knownPluginViewModes);
  const appPluginId = viewModeMap.get(viewMode) || "";
  if (appPluginId && !taskGroupId) {
    return Object.freeze({
      available: true,
      action: "open_topic",
      pluginId: appPluginId,
      from: "plugin_app",
      targetTaskGroupId: pluginContextGroupId(appPluginId),
      ariaLabel: "打开当前插件对话",
      visibleLabel: "对话",
    });
  }
  if (viewMode === "tasks" && taskGroupId.startsWith("plugin:")) {
    const groupPluginId = normalizePluginContextId(taskGroupId.slice("plugin:".length));
    const pluginId = explicitPluginId || groupPluginId;
    if (pluginId && taskGroupId === pluginContextGroupId(pluginId)) {
      return Object.freeze({
        available: true,
        action: "open_app",
        pluginId,
        from: "plugin_topic",
        targetTaskGroupId: "",
        ariaLabel: "返回当前插件",
        visibleLabel: "插件",
      });
    }
  }
  return Object.freeze({
    available: false,
    action: "",
    pluginId: "",
    from: "",
    targetTaskGroupId: "",
    ariaLabel: "",
    visibleLabel: "",
  });
}

function pluginContextSwitchDownGesturePlan(input = {}, thresholds = {}) {
  const dx = Number(input.dx || 0);
  const dy = Number(input.dy || 0);
  const elapsed = Math.max(1, Number(input.elapsedMs || input.elapsed || 1) || 1);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const directionRatio = Math.max(1, Number(thresholds.directionRatio || 1.45) || 1.45);
  const triggerDistance = Math.max(1, Number(thresholds.triggerDistancePx || 28) || 28);
  const velocityMinDistance = Math.max(1, Number(thresholds.velocityMinDistancePx || 24) || 24);
  const velocityThreshold = Math.max(0.01, Number(thresholds.velocityPxMs || 0.45) || 0.45);
  const velocity = dy / elapsed;
  const vertical = absY > absX * directionRatio;
  const distanceTriggered = dy > triggerDistance;
  const velocityTriggered = absY >= velocityMinDistance && velocity > velocityThreshold;
  return Object.freeze({
    ok: Boolean(vertical && dy > 0 && (distanceTriggered || velocityTriggered)),
    direction: vertical ? (dy > 0 ? "down" : "up") : (absX > absY ? "horizontal" : ""),
    dx,
    dy,
    elapsedMs: elapsed,
    velocity,
    distanceTriggered,
    velocityTriggered,
  });
}

export {
  DEFAULT_KNOWN_PLUGIN_VIEW_MODES,
  cleanPluginContextValue,
  normalizePluginContextId,
  pluginContextGroupId,
  pluginContextSwitchDownGesturePlan,
  pluginContextSwitchTargetPlan,
};
