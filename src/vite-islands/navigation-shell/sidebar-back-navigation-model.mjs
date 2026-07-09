const PLUGIN_BACK_ORDER = Object.freeze([
  ["wardrobe", "wardrobe-plugin", "wardrobe-plugin-outer"],
  ["codex", "codex-plugin", "codex-plugin-outer"],
  ["finance", "finance-plugin", "finance-plugin-outer"],
  ["email", "email-plugin", "email-plugin-outer"],
  ["health", "health-plugin", "health-plugin-outer"],
  ["note", "note-plugin", "note-plugin-outer"],
  ["growth", "growth-plugin", "growth-plugin-outer"],
  ["moira", "moira-plugin", "moira-plugin-outer"],
  ["music", "music-plugin", "music-plugin-outer"],
  ["movie", "movie-plugin", "movie-plugin-outer"],
]);

function truthy(value) {
  return Boolean(value);
}

function text(value) {
  return String(value || "");
}

export function sidebarPluginBackTargetPlan(input = {}) {
  const pluginContextBack = truthy(input.pluginContextBack);
  for (const [key, innerTarget, outerTarget] of PLUGIN_BACK_ORDER) {
    if (truthy(input[`${key}PluginBackActive`])) return innerTarget;
    if (!pluginContextBack && truthy(input[`${key}PluginOuterBackActive`])) return outerTarget;
  }
  return "";
}

export function backSwipeTargetPlan(input = {}) {
  if (truthy(input.previewOpen)) return "artifact-preview";
  const pluginContextTarget = text(input.pluginContextTarget);
  if (truthy(input.skillDetail)) return "skill";
  if (truthy(input.taskDetail)) return truthy(input.pluginTopicDetail) && pluginContextTarget
    ? pluginContextTarget
    : "task";
  if (truthy(input.todoDetail) || truthy(input.kanbanComposerOpen)) {
    return truthy(input.todoDetail) ? "todo" : "todo-create";
  }
  const pluginTarget = sidebarPluginBackTargetPlan(input);
  if (pluginTarget) return pluginTarget;
  if (truthy(input.directoryTopicDraftActive)) return "directory-topic-draft";
  if (pluginContextTarget) return pluginContextTarget;
  if (truthy(input.automationDetailInboxReturnActive)) return "automation-secondary";
  if (truthy(input.automationDetail)) return "automation";
  if (truthy(input.automationSecondaryReturnActive)) return "automation-secondary";
  if (truthy(input.actionInboxDetail) || truthy(input.actionInboxCreate)) {
    return truthy(input.actionInboxCreate) ? "action-inbox-create" : "action-inbox";
  }
  if (truthy(input.projectsDirectoryActive)) return "directory";
  return "";
}

export function nativeBackQueryPlan(input = {}) {
  const target = text(input.target || backSwipeTargetPlan(input));
  return {
    target,
    hasTarget: Boolean(target),
    primaryBounce: truthy(input.primaryBounce),
  };
}
