const PLATFORM_MODEL_VERSION = "20260705-vite-platform-model-v1";

const DETAIL_TARGET_KEYS = Object.freeze([
  "automationId",
  "inboxItemId",
  "actionInboxItemId",
  "sourceInboxItemId",
  "todoId",
  "taskCardId",
  "taskGroupId",
  "taskId",
  "messageId",
  "projectId",
  "subprojectId",
  "directoryPath",
  "directoryRoot",
]);

const DEFAULT_KNOWN_PLUGIN_TOPICS = Object.freeze([
  "wardrobe",
  "finance",
  "email",
  "health",
  "note",
  "growth",
  "moira",
]);

function cleanPlatformString(value = "", max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function paramsGet(params, key) {
  if (!params) return "";
  if (typeof params.get === "function") return params.get(key) || "";
  if (Object.prototype.hasOwnProperty.call(params, key)) return params[key] || "";
  return "";
}

function boolRouteFlag(value = "") {
  return ["1", "true", "yes"].includes(cleanPlatformString(value, 32).toLowerCase());
}

function normalizedRouteViewPlan(value, fallback = "") {
  const view = cleanPlatformString(value, 80).toLowerCase();
  if (view === "inbox" || view === "action-inbox" || view === "actions") return "inbox";
  if (view === "capability" || view === "capabilities" || view === "ability" || view === "abilities") return "tasks";
  if (view === "automation" || view === "automations" || view === "cron") return "automation";
  if (view === "system-console" || view === "owner-console" || view === "console" || view === "system") return "system-console";
  if (view === "learning" || view === "coins" || view === "rewards" || view === "redeem") return "learning";
  if (view === "wardrobe" || view === "closet" || view === "outfit") return "wardrobe";
  if (view === "codex" || view === "codex-mobile") return "codex";
  if (view === "finance" || view === "accounting" || view === "ledger") return "finance";
  if (view === "email" || view === "mail" || view === "mailbox") return "email";
  if (view === "health") return "health";
  if (view === "note" || view === "notes") return "note";
  if (view === "growth" || view === "education") return "growth";
  if (view === "moira") return "moira";
  if (view === "todo" || view === "todos") return "tasks";
  if (view === "directory" || view === "directories" || view === "projects") return "projects";
  if (view === "task" || view === "tasks") return "tasks";
  if (view === "single" || view === "stream") return "single";
  return fallback;
}

function pluginContextIdFromTaskGroupIdPlan(taskGroupId = "") {
  const match = cleanPlatformString(taskGroupId, 240).match(/^plugin:(.+)$/);
  return match ? match[1].trim() : "";
}

function routePluginContextCandidatesPlan(input = {}) {
  return [
    input.explicit,
    pluginContextIdFromTaskGroupIdPlan(input.taskGroupId),
    input.pluginId,
    input.routeView,
  ].map((value) => cleanPlatformString(value, 120)).filter(Boolean);
}

function routePluginContextIdPlan(input = {}) {
  const known = new Set(
    (Array.isArray(input.knownPluginTopics) ? input.knownPluginTopics : DEFAULT_KNOWN_PLUGIN_TOPICS)
      .map((value) => cleanPlatformString(value, 80))
      .filter(Boolean),
  );
  const candidates = routePluginContextCandidatesPlan(input);
  for (const candidate of candidates) {
    const id = candidate === "codex-mobile" || candidate === "codex" ? "" : candidate;
    if (id && known.has(id)) return id;
  }
  return "";
}

function sameOriginRouteUrlPlan(input = {}) {
  try {
    const origin = cleanPlatformString(input.origin || "http://home-ai.local", 4000) || "http://home-ai.local";
    const parsed = new URL(input.value || "/", origin);
    if (parsed.origin !== origin) return { ok: false, href: "", pathname: "", search: "", hash: "" };
    return {
      ok: true,
      href: parsed.href,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    };
  } catch (_) {
    return { ok: false, href: "", pathname: "", search: "", hash: "" };
  }
}

function normalizeHermesAppShellPathPlan(pathname = "") {
  const value = cleanPlatformString(pathname || "/", 2000) || "/";
  if (value === "/" || value === "/index.html") return "/";
  const clean = value.split(/[?#]/)[0] || "/";
  if (clean.includes(".")) return "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function hermesAppShellPathPlan(input = {}) {
  const current = normalizeHermesAppShellPathPlan(input.currentPathname || "/");
  const requestedValue = cleanPlatformString(input.pathname || "", 2000);
  if (!requestedValue || requestedValue === "/" || requestedValue === "/index.html") return current;
  const requested = normalizeHermesAppShellPathPlan(requestedValue);
  return requested === "/" && current !== "/" ? current : requested;
}

function hermesAppShellRouteForSearchPlan(input = {}) {
  const params = new URLSearchParams(input.search || "");
  if (!params.has("source")) params.set("source", "pwa");
  const search = params.toString();
  return `${hermesAppShellPathPlan(input)}${search ? `?${search}` : ""}${input.hash || ""}`;
}

function routeParamsHaveHermesOwnedDetailTargetPlan(params) {
  return DETAIL_TARGET_KEYS.some((key) => cleanPlatformString(paramsGet(params, key) || "", 800));
}

function startupErrorMessagePlan(input = {}) {
  const message = cleanPlatformString(input.message || input.errorMessage || "", 1000);
  const stage = cleanPlatformString(input.stage || "", 120);
  const stageText = stage ? `（${stage}）` : "";
  if (/unauthorized/i.test(message)) return message;
  if (/failed to fetch|network|load failed|request timed out|timeout/i.test(message)) {
    return `无法载入工作区${stageText}，请检查网络后重试。`;
  }
  return message
    ? `无法载入工作区${stageText}：${message}`
    : `无法载入工作区${stageText}，请重试。`;
}

function startupAutoResetPlan(input = {}) {
  const message = cleanPlatformString(input.message || input.errorMessage || "", 1000);
  if (/unauthorized/i.test(message)) return { shouldReset: false, reason: "unauthorized" };
  const targetVersion = cleanPlatformString(input.targetVersion || "", 120);
  const clientVersion = cleanPlatformString(input.clientVersion || "", 120);
  if (targetVersion && targetVersion === clientVersion) {
    return { shouldReset: false, reason: "target_version_active" };
  }
  if (input.alreadyReset) return { shouldReset: false, reason: "already_reset" };
  return { shouldReset: true, reason: "startup_failure" };
}

function mobileBrowserShellDetectionPlan(input = {}) {
  if (input.standalone) return false;
  const ua = cleanPlatformString(input.userAgent || "", 1000);
  const maxTouchPoints = Number(input.maxTouchPoints || 0) || 0;
  const mobileUa = /iPad|iPhone|iPod|Android|Mobile/i.test(ua)
    || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  const coarsePointer = Boolean(input.coarsePointer);
  const touchCapable = Boolean(input.touchCapable || maxTouchPoints > 0);
  const widths = (Array.isArray(input.widths) ? input.widths : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const narrowViewport = widths.length ? Math.min(...widths) <= 900 : false;
  return Boolean(mobileUa || coarsePointer || touchCapable || narrowViewport);
}

function mobileBrowserShellDiagnosticTextPlan(input = {}) {
  const mode = input.standalone ? "standalone" : "browser";
  const width = Math.round(Number(input.width || 0) || 0);
  const touch = Number(input.maxTouchPoints || 0) || 0;
  return `client=${cleanPlatformString(input.clientVersion || "", 120)} mode=${mode} width=${width} touch=${touch}`;
}

function routeApplyInputsPlan(params) {
  const automationId = cleanPlatformString(paramsGet(params, "automationId") || "");
  const inboxItemId = cleanPlatformString(paramsGet(params, "inboxItemId") || paramsGet(params, "actionInboxItemId") || "");
  const todoId = cleanPlatformString(paramsGet(params, "todoId") || "");
  const taskCardId = cleanPlatformString(paramsGet(params, "taskCardId") || "");
  const taskGroupId = cleanPlatformString(paramsGet(params, "taskGroupId") || paramsGet(params, "taskId") || "");
  const groupChatRequested = boolRouteFlag(paramsGet(params, "groupChat") || paramsGet(params, "group_chat"));
  const readingQuizRequested = boolRouteFlag(paramsGet(params, "readingQuiz") || paramsGet(params, "reading_quiz"));
  const assessmentExamRequested = boolRouteFlag(paramsGet(params, "assessmentExam") || paramsGet(params, "assessment_exam"));
  return Object.freeze({
    automationId,
    inboxItemId,
    todoId,
    taskCardId,
    taskGroupId,
    groupChatRequested,
    readingQuizRequested,
    assessmentExamRequested,
    routeView: normalizedRouteViewPlan(
      paramsGet(params, "view") || paramsGet(params, "viewMode"),
      inboxItemId ? "inbox"
        : automationId ? "automation"
          : taskCardId ? "learning"
            : todoId ? "todos"
              : taskGroupId ? "tasks"
                : groupChatRequested ? "single"
                  : "",
    ),
  });
}

export {
  DEFAULT_KNOWN_PLUGIN_TOPICS,
  DETAIL_TARGET_KEYS,
  PLATFORM_MODEL_VERSION,
  cleanPlatformString,
  hermesAppShellPathPlan,
  hermesAppShellRouteForSearchPlan,
  mobileBrowserShellDetectionPlan,
  mobileBrowserShellDiagnosticTextPlan,
  normalizeHermesAppShellPathPlan,
  normalizedRouteViewPlan,
  pluginContextIdFromTaskGroupIdPlan,
  routeApplyInputsPlan,
  routeParamsHaveHermesOwnedDetailTargetPlan,
  routePluginContextCandidatesPlan,
  routePluginContextIdPlan,
  sameOriginRouteUrlPlan,
  startupAutoResetPlan,
  startupErrorMessagePlan,
};
