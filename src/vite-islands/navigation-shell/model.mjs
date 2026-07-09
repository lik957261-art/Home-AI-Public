import { buildTaskTopicShellModel } from "./task-topic-shell-model.mjs";
import { buildTaskTopicCompatibilityState } from "./task-topic-compatibility-adapter.mjs";
import { buildTaskTopicActionModel } from "./task-topic-action-model.mjs";

const DEFAULT_VIEW_MODE = "tasks";
const DEFAULT_SINGLE_WINDOW_MODE = "chat";
const MAX_PARAM_LENGTH = 120;

const VIEW_MODES = Object.freeze([
  {
    id: "chat",
    viewMode: "chat",
    label: "聊天",
    surface: "chat",
    description: "当前对话和 Composer 仍由 classic runtime 承载。",
  },
  {
    id: "inbox",
    viewMode: "inbox",
    label: "收件箱",
    surface: "inbox",
    description: "展示需要 Owner 处理的任务卡和请求。",
  },
  {
    id: "tasks",
    viewMode: "tasks",
    label: "话题",
    surface: "topics",
    description: "话题根、任务列表和目录绑定话题的迁移边界。",
  },
  {
    id: "directories",
    viewMode: "directories",
    label: "目录",
    surface: "directories",
    description: "目录入口和文件上下文仍保留兼容路由边界。",
  },
  {
    id: "automation",
    viewMode: "automation",
    label: "自动化",
    surface: "automation",
    description: "自动化面板当前只在预览中保留导航状态。",
  },
  {
    id: "growth",
    viewMode: "growth",
    label: "成长",
    surface: "growth",
    description: "成长和学习面板仍保留兼容路由边界。",
  },
  {
    id: "system-console",
    viewMode: "system-console",
    label: "系统控制台",
    surface: "owner_system_console",
    description: "Owner-only operational console; non-Owner shells must fail closed.",
    ownerOnly: true,
  },
]);

const VIEW_MODE_ALIASES = Object.freeze({
  capabilities: "tasks",
  chat: "chat",
  conversation: "chat",
  directory: "directories",
  directories: "directories",
  files: "directories",
  inbox: "inbox",
  learning: "growth",
  projects: "directories",
  single: "chat",
  system: "system-console",
  "system-console": "system-console",
  tasks: "tasks",
  topic: "tasks",
  topics: "tasks",
  automation: "automation",
  growth: "growth",
});

const SAFE_ROUTE_PARAMS = Object.freeze([
  "view",
  "mode",
  "singleWindowMode",
  "workspaceId",
  "threadId",
  "taskGroupId",
  "pluginId",
  "topicId",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function viewModeIds() {
  return new Set(VIEW_MODES.map((mode) => mode.viewMode));
}

function normalizeViewMode(value, fallback = DEFAULT_VIEW_MODE) {
  const raw = cleanString(value, 80).toLowerCase();
  const mapped = VIEW_MODE_ALIASES[raw] || raw;
  if (viewModeIds().has(mapped)) return mapped;
  return viewModeIds().has(fallback) ? fallback : DEFAULT_VIEW_MODE;
}

function normalizeSingleWindowMode(value) {
  const raw = cleanString(value, 40).toLowerCase();
  if (raw === "task" || raw === "topic" || raw === "tasks") return "task";
  return DEFAULT_SINGLE_WINDOW_MODE;
}

function sanitizeRouteValue(value) {
  return cleanString(value, MAX_PARAM_LENGTH)
    .replace(/[\\/]+/g, "")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .replace(/[^\w.:-]/g, "");
}

function safeRouteParams(input = {}) {
  const params = {};
  for (const key of SAFE_ROUTE_PARAMS) {
    const value = sanitizeRouteValue(input[key]);
    if (value) params[key] = value;
  }
  return Object.freeze(params);
}

function classicFallbackHref(input = {}) {
  const viewMode = normalizeViewMode(input.viewMode || input.view);
  const singleWindowMode = normalizeSingleWindowMode(input.singleWindowMode);
  const params = new URLSearchParams();
  params.set("view", viewMode);
  if (viewMode === "chat" || singleWindowMode === "task") {
    params.set("singleWindowMode", singleWindowMode);
  }
  const safe = safeRouteParams(input);
  for (const key of ["workspaceId", "threadId", "taskGroupId", "pluginId", "topicId"]) {
    if (safe[key]) params.set(key, safe[key]);
  }
  return `/?${params.toString()}`;
}

function selectedModeDefinition(viewMode) {
  return VIEW_MODES.find((mode) => mode.viewMode === viewMode) || VIEW_MODES.find((mode) => mode.viewMode === DEFAULT_VIEW_MODE);
}

function buildNavigationTabs(state = {}, options = {}) {
  const viewMode = normalizeViewMode(state.viewMode || options.viewMode);
  const isOwner = Boolean(state.auth?.isOwner || options.isOwner);
  return VIEW_MODES.map((mode) => {
    const disabled = Boolean(mode.ownerOnly && !isOwner);
    return {
      id: mode.id,
      viewMode: mode.viewMode,
      label: mode.label,
      surface: mode.surface,
      selected: mode.viewMode === viewMode,
      disabled,
      ownerOnly: Boolean(mode.ownerOnly),
      description: mode.description,
      href: disabled ? "" : classicFallbackHref(Object.assign({}, state, { viewMode: mode.viewMode })),
    };
  });
}

function cachedShellStatus(state = {}) {
  const hasTaskListCache = Boolean(state.taskListRootCache?.signature || state.cachedTaskListRoot?.signature);
  const hasTopicCache = Boolean(state.topicRootCache?.signature || state.cachedTopicRoot?.signature);
  const hasThreadCache = Boolean(state.threadCache?.threadId || state.cachedCurrentThread?.id);
  const cacheCount = [hasTaskListCache, hasTopicCache, hasThreadCache].filter(Boolean).length;
  return Object.freeze({
    status: cacheCount > 0 ? "available" : "preview_only",
    cacheCount,
    taskListRoot: hasTaskListCache ? "cached" : "not_collected",
    topicRoot: hasTopicCache ? "cached" : "not_collected",
    currentThread: hasThreadCache ? "cached" : "not_collected",
  });
}

function buildNavigationShellViewModel(state = {}, options = {}) {
  const viewMode = normalizeViewMode(state.viewMode || options.viewMode);
  const singleWindowMode = normalizeSingleWindowMode(state.singleWindowMode || options.singleWindowMode);
  const selected = selectedModeDefinition(viewMode);
  const routeParams = safeRouteParams(Object.assign({}, state, {
    view: viewMode,
    singleWindowMode,
  }));
  const isOwner = Boolean(state.auth?.isOwner || options.isOwner);
  const tabs = buildNavigationTabs(Object.assign({}, state, {
    viewMode,
    singleWindowMode,
    auth: Object.assign({}, state.auth || {}, { isOwner }),
  }), { isOwner });
  const taskTopicCompatibility = buildTaskTopicCompatibilityState(state, options);
  const compatibleState = taskTopicCompatibility.state;
  const cache = cachedShellStatus(compatibleState);
  const taskTopicShell = buildTaskTopicShellModel(
    taskTopicCompatibility.selectedThread || compatibleState.currentThread || {},
    compatibleState,
    {
      directoryTopicCollectionsReady: options.directoryTopicCollectionsReady,
      search: options.search,
      taskDirectoryFilter: options.taskDirectoryFilter,
    },
  );
  const taskTopicActions = buildTaskTopicActionModel(taskTopicShell, {
    workspaceId: compatibleState.selectedWorkspaceId || state.selectedWorkspaceId || "owner",
    threadId: taskTopicShell.threadId,
  });
  return Object.freeze({
    viewMode,
    singleWindowMode,
    surface: selected.surface,
    label: selected.label,
    description: selected.description,
    isOwner,
    routeParams,
    classicFallbackHref: classicFallbackHref(Object.assign({}, routeParams, {
      viewMode,
      singleWindowMode,
    })),
    productionDefaultShell: "vite",
    migrationStatus: "development_preview",
    cache,
    taskTopicShell,
    taskTopicActions,
    taskTopicCompatibility: Object.freeze({
      source: taskTopicCompatibility.source,
      threadId: taskTopicCompatibility.threadId,
      usedTaskListThreadCache: taskTopicCompatibility.usedTaskListThreadCache,
      topicCount: taskTopicCompatibility.topicCount,
      cacheSignature: taskTopicCompatibility.cacheSignature,
    }),
    tabs,
    warnings: Object.freeze([
      "当前预览不替换生产根 shell。",
      "Chat detail、Composer 和 SSE 将留到 Phase 5。",
      "生产切换需要 Owner 单独批准。",
    ]),
  });
}

export {
  DEFAULT_SINGLE_WINDOW_MODE,
  DEFAULT_VIEW_MODE,
  SAFE_ROUTE_PARAMS,
  VIEW_MODES,
  buildNavigationShellViewModel,
  buildNavigationTabs,
  cachedShellStatus,
  classicFallbackHref,
  cleanString,
  normalizeSingleWindowMode,
  normalizeViewMode,
  safeRouteParams,
};
