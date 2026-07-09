"use strict";

export const AUTOMATION_VIEW_MODEL_VERSION = "20260708-workspace-console-view-model-v2";

const PLUGIN_MODES = ["wardrobe", "finance", "email", "health", "note", "growth", "moira", "music", "movie"];
const NEW_THREAD_HIDDEN_FLAGS = [
  "single",
  "tasks",
  "automation",
  "inbox",
  "systemConsole",
  "workspaceConsole",
  "capabilities",
  "learning",
  "directory",
  "todos",
  "wardrobe",
  "codex",
  "finance",
  "email",
  "health",
  "note",
  "growth",
  "moira",
  "music",
  "movie",
];

export function automationViewModeFlagsPlan(state = {}) {
  const viewMode = String(state.viewMode || "");
  const singleWindowMode = String(state.singleWindowMode || "");
  const flags = {
    single: viewMode === "single",
    tasks: viewMode === "tasks",
    directory: viewMode === "projects",
    automation: viewMode === "automation",
    inbox: viewMode === "inbox",
    systemConsole: viewMode === "system-console",
    workspaceConsole: viewMode === "workspace-console",
    capabilities: false,
    learning: false,
    todos: viewMode === "todos",
    wardrobe: viewMode === "wardrobe",
    codex: viewMode === "codex",
    finance: viewMode === "finance",
    email: viewMode === "email",
    health: viewMode === "health",
    note: viewMode === "note",
    growth: viewMode === "growth",
    moira: viewMode === "moira",
    music: viewMode === "music",
    movie: viewMode === "movie",
    singleWindowMode,
  };
  flags.chatSingle = flags.single && singleWindowMode === "chat";
  flags.taskSingle = flags.single && singleWindowMode === "task";
  flags.taskNavigationActive = flags.tasks || flags.taskSingle;
  flags.bottomPluginActive = PLUGIN_MODES.some((mode) => flags[mode]);
  return flags;
}

export function automationNewThreadPlan(flags = {}) {
  const hidden = NEW_THREAD_HIDDEN_FLAGS.some((name) => Boolean(flags[name]));
  return {
    hidden,
    disabled: hidden,
    text: flags.todos ? "新建看板卡片" : "新建话题",
  };
}

export function automationThreadSearchPlaceholderPlan(flags = {}) {
  if (flags.single) return flags.singleWindowMode === "chat" ? "Search chat" : "Search topic stream";
  if (flags.tasks) return "Search topics";
  if (flags.inbox) return "Search inbox";
  if (flags.todos) return "Search Kanban";
  if (flags.automation) return "Search automations";
  if (flags.systemConsole) return "Search system status";
  if (flags.workspaceConsole) return "Search workspaces";
  if (flags.learning || flags.growth) return "Search growth";
  if (flags.wardrobe) return "Search wardrobe";
  if (flags.email) return "Search email";
  if (flags.health) return "Search health";
  if (flags.note) return "Search notes";
  if (flags.moira) return "Search 星盘";
  if (flags.music) return "Search music";
  if (flags.movie) return "Search movie";
  return "Search directories";
}

export function automationLegacyViewRedirectPlan(viewMode) {
  const mode = String(viewMode || "");
  if (mode === "capabilities") return { viewMode: "tasks", storageKey: "hermesWebViewMode", storageValue: "tasks", redirected: true };
  if (mode === "learning") return { viewMode: "growth", storageKey: "hermesWebViewMode", storageValue: "growth", redirected: true };
  return { viewMode: mode, storageKey: "", storageValue: "", redirected: false };
}

export function automationLoadOptionsPlan(routeTargetPending) {
  return routeTargetPending
    ? { detail: "full", refresh: true, ignoreSearch: true, routeTarget: true }
    : {};
}
