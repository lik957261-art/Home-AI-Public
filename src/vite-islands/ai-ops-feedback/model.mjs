const DEFAULT_CATEGORY = "plugin_issue";
const MAX_NOTE_LENGTH = 260;

const FEEDBACK_CATEGORIES = Object.freeze([
  { id: "plugin_issue", label: "插件内问题" },
  { id: "visual_mismatch", label: "画面不对" },
  { id: "action_unresponsive", label: "按钮没反应" },
  { id: "save_failed", label: "保存失败" },
  { id: "content_missing", label: "内容缺失" },
  { id: "stuck_loading", label: "卡住/加载不出" },
  { id: "other", label: "其他" },
]);

const SAFE_ROUTE_PARAMS = new Set([
  "view",
  "workspaceId",
  "pluginId",
  "pluginRoute",
  "taskId",
  "threadId",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function categoryIds() {
  return new Set(FEEDBACK_CATEGORIES.map((category) => category.id));
}

function normalizeCategory(value) {
  const category = cleanString(value, 80);
  return categoryIds().has(category) ? category : DEFAULT_CATEGORY;
}

function sanitizeNote(value) {
  return cleanString(value, MAX_NOTE_LENGTH);
}

function safeRoute(route = {}) {
  const pathname = cleanString(route.pathname || "/", 200) || "/";
  const search = cleanString(route.search || "", 1000);
  if (!search) return pathname;
  let params;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch (_error) {
    return pathname;
  }
  const kept = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (SAFE_ROUTE_PARAMS.has(key)) kept.set(key, cleanString(value, 120));
  }
  const query = kept.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function ownerConsoleAvailable(state = {}, capabilities = {}) {
  return Boolean(state.auth?.isOwner && capabilities.ownerSystemConsole === true);
}

function ownerConsoleLabel(state = {}, capabilities = {}) {
  if (ownerConsoleAvailable(state, capabilities)) return "系统控制台";
  if (!state.auth?.isOwner) return "仅 Owner 可用";
  return "系统控制台未就绪";
}

function buildFeedbackPayload(input = {}) {
  const state = input.state || {};
  const route = safeRoute(input.route || {});
  const category = normalizeCategory(input.category);
  const note = sanitizeNote(input.note);
  return {
    source_surface: "vite-ai-ops-feedback-preview",
    plugin_id: cleanString(input.pluginId || state.pluginContextNavPluginId || "home-ai", 80) || "home-ai",
    category,
    diagnostic_type: `user_report_${category}`,
    severity_hint: cleanString(input.severityHint || "H3", 12) || "H3",
    evidence_confidence: 0.62,
    route,
    workspaceId: cleanString(input.workspaceId || state.selectedWorkspaceId || "owner", 120) || "owner",
    summary: note || `Vite feedback preview: ${category}`,
    context: {
      surface: "ai_ops_feedback_menu",
      preview: true,
      owner_console_available: ownerConsoleAvailable(state, input.capabilities || {}),
      native_shell: Boolean(input.native?.isNativeShell),
      ios_shell: Boolean(input.native?.isIosShell),
    },
    frontend_state: {
      viewMode: cleanString(state.viewMode || "", 80),
      singleWindowMode: cleanString(state.singleWindowMode || "", 80),
      pluginContextNavPluginId: cleanString(state.pluginContextNavPluginId || "", 80),
      viteIsland: "ai-ops-feedback",
    },
  };
}

function summarizeSubmissionResult(result = {}) {
  const caseId = cleanString(result.case_id || result.caseId || "", 120);
  const status = cleanString(result.status || "", 80);
  if (caseId) return `已记录：${caseId}`;
  if (status) return `已记录：${status}`;
  return "已记录";
}

export {
  DEFAULT_CATEGORY,
  FEEDBACK_CATEGORIES,
  MAX_NOTE_LENGTH,
  buildFeedbackPayload,
  normalizeCategory,
  ownerConsoleAvailable,
  ownerConsoleLabel,
  safeRoute,
  sanitizeNote,
  summarizeSubmissionResult,
};
