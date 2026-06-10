"use strict";

const CLIENT_VERSION = document.documentElement?.dataset?.clientVersion
  || document.querySelector('meta[name="hermes-web-client-version"]')?.content
  || "dev";

const GENERIC_OWNER_TOPIC_ROUTE_PREFIXES = ["owner-"];
const GENERIC_OWNER_TOPIC_ROUTE_IDS = new Set(["hermes-sync-folder"]);
const VIRTUAL_GROUP_AI_MEMBER = Object.freeze({ workspaceId: "AI", label: "AI", virtual: true });
const FONT_SIZE_OPTIONS = Object.freeze([
  { id: "small", label: "小", scale: 0.92 },
  { id: "standard", label: "标准", scale: 1 },
  { id: "large", label: "大", scale: 1.1 },
  { id: "xlarge", label: "特大", scale: 1.2 },
  { id: "xxlarge", label: "超大", scale: 1.32 },
]);
const DEFAULT_FONT_SIZE = "standard";
const THEME_MODE_OPTIONS = Object.freeze([
  { id: "system", label: "跟随系统", description: "跟随当前设备" },
  { id: "light", label: "浅色", description: "白天阅读" },
  { id: "dark", label: "深色", description: "夜间低亮度" },
]);
const DEFAULT_THEME_MODE = "system";
const FONT_FAMILY_OPTIONS = Object.freeze([
  {
    id: "system",
    label: "系统",
    sample: "Aa",
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Aptos", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  {
    id: "sans",
    label: "微软雅黑",
    sample: "微",
    family: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Aptos", "Segoe UI", sans-serif',
  },
  {
    id: "serif",
    label: "宋体",
    sample: "宋",
    family: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "SimSun", "Microsoft YaHei", serif',
  },
  {
    id: "kai",
    label: "楷体",
    sample: "楷",
    family: '"Kaiti SC", "KaiTi", "STKaiti", "Microsoft YaHei", serif',
  },
]);
const DEFAULT_FONT_FAMILY = "system";
const DEFAULT_COMPOSER_MODEL_ID = "runtime-default";
const COMPOSER_MODEL_OPTIONS = Object.freeze([
  {
    id: DEFAULT_COMPOSER_MODEL_ID,
    label: "ChatGPT default",
    model: "",
    provider: "",
    mentionText: "@ChatGPT",
    aliases: ["ai", "chatgpt", "assistant", "default"],
    description: "Default runtime model",
  },
  {
    id: "grok-4.3",
    label: "Grok4.3",
    model: "grok-4.3",
    provider: "xai-oauth",
    mentionText: "@Grok4.3",
    aliases: ["grok", "grok4", "grok4.3", "grok43", "xai", "xaioauth"],
    description: "xAI OAuth Grok worker",
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek",
    model: "deepseek-chat",
    provider: "deepseek",
    mentionText: "@DeepSeek",
    aliases: ["deepseek", "deep", "ds", "deepseekchat", "deepseek-chat"],
    description: "DeepSeek direct API",
  },
]);
const CHAT_MESSAGE_INITIAL_LIMIT = 30;
const CHAT_MESSAGE_PAGE_LIMIT = 40;
const CHAT_MESSAGE_SEARCH_LIMIT = 120;
const CHAT_HISTORY_LOAD_TOP_PX = 220;
const COMPOSER_MAX_TEXT_CHARS = 240000;
const COMPOSER_MAX_BODY_BYTES = 1900000;
const TASK_MESSAGE_INITIAL_LIMIT = 300;
const TODO_AUTO_REFRESH_INTERVAL_MS = 8000;
const TODO_LIST_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS = 60 * 1000;
const CHAT_SCOPE_SESSION_STARTED_AT = Date.now();
const KANBAN_STORY_STATUS = "story";
const KANBAN_STORY_DEFAULT_VERSION = "20260513-story-tree";
const KANBAN_STORY_DETAIL_LOAD_LIMIT = 6;
const KANBAN_MULTI_AGENT_DEFAULT_PARALLEL = 3;
const KANBAN_MULTI_AGENT_MAX_PARALLEL = 8;
const LEARNING_GROWTH_DEFAULT_LEARNER_WORKSPACE_ID = "weixin_stephen";
const STARTUP_PERF_LOG_KEY = "hermesStartupPerfLast";
const TaskArtifactHelpers = window.HermesTaskArtifactHelpers || {};
const KanbanStoryHelpers = window.HermesKanbanStoryHelpers || {};
const LearningReadingUi = window.HermesLearningReadingUi || {};
const AppApiClient = window.HermesAppApiClient || {};

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function startupPerfStart(label = "startup") {
  const run = {
    label: String(label || "startup"),
    clientVersion: CLIENT_VERSION,
    startedAt: new Date().toISOString(),
    startMs: nowMs(),
    marks: [],
  };
  window.__hermesStartupPerf = run;
  return run;
}

function startupPerfRun() {
  return window.__hermesStartupPerf || startupPerfStart("startup");
}

function startupPerfMark(name, fields = {}) {
  const run = startupPerfRun();
  const elapsedMs = Math.round(nowMs() - run.startMs);
  const entry = Object.assign({
    name: String(name || "mark"),
    elapsedMs,
  }, fields || {});
  run.marks.push(entry);
  try {
    console.info("[Hermes startup]", entry.name, `${entry.elapsedMs}ms`, entry);
  } catch (_) {}
  return entry;
}

async function startupPerfStep(name, fn) {
  const started = nowMs();
  try {
    const value = await fn();
    startupPerfMark(name, { durationMs: Math.round(nowMs() - started), ok: true });
    return value;
  } catch (err) {
    startupPerfMark(name, {
      durationMs: Math.round(nowMs() - started),
      ok: false,
      error: String(err?.message || err || "").slice(0, 180),
    });
    throw err;
  }
}

function finishStartupPerf(status = "ok", fields = {}) {
  const run = startupPerfRun();
  run.status = status;
  run.finishedAt = new Date().toISOString();
  run.totalMs = Math.round(nowMs() - run.startMs);
  Object.assign(run, fields || {});
  try {
    localStorage.setItem(STARTUP_PERF_LOG_KEY, JSON.stringify({
      label: run.label,
      status: run.status,
      clientVersion: run.clientVersion,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      totalMs: run.totalMs,
      workspaceId: state.selectedWorkspaceId || "",
      viewMode: state.viewMode || "",
      singleWindowMode: state.singleWindowMode || "",
      threadId: state.currentThreadId || "",
      messageCount: Array.isArray(state.currentThread?.messages) ? state.currentThread.messages.length : 0,
      totalMessages: state.currentThread?.messagesPage?.total || 0,
      marks: run.marks || [],
    }));
  } catch (_) {}
  try {
    console.info("[Hermes startup] complete", {
      status: run.status,
      totalMs: run.totalMs,
      marks: run.marks,
      workspaceId: state.selectedWorkspaceId || "",
      viewMode: state.viewMode || "",
      messageCount: Array.isArray(state.currentThread?.messages) ? state.currentThread.messages.length : 0,
      totalMessages: state.currentThread?.messagesPage?.total || 0,
    });
    if (console.table) console.table(run.marks);
  } catch (_) {}
  return run;
}

function initialFontSizePreference(value) {
  const id = String(value || "").trim();
  return FONT_SIZE_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_SIZE;
}

function initialThemePreference(value) {
  const id = String(value || "").trim();
  return THEME_MODE_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_THEME_MODE;
}

function initialFontFamilyPreference(value) {
  const id = String(value || "").trim();
  return FONT_FAMILY_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_FAMILY;
}

function initialDefaultComposerModelPreference(value) {
  const id = String(value || "").trim();
  return COMPOSER_MODEL_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_COMPOSER_MODEL_ID;
}

function initialTodoKanbanStatus() {
  const stored = localStorage.getItem("hermesTodoKanbanStatus") || "";
  const migrated = localStorage.getItem("hermesTodoKanbanStoryDefaultVersion") === KANBAN_STORY_DEFAULT_VERSION;
  if (!migrated && (!stored || stored === "todo")) {
    localStorage.setItem("hermesTodoKanbanStoryDefaultVersion", KANBAN_STORY_DEFAULT_VERSION);
    return KANBAN_STORY_STATUS;
  }
  return stored || KANBAN_STORY_STATUS;
}

function todayDateInputValue() {
  const date = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function initialKanbanComposerMode() {
  const stored = localStorage.getItem("hermesKanbanComposerMode") || "";
  if (stored === "reading") return "study";
  if (["single", "multi", "study", "assessment"].includes(stored)) return stored;
  return localStorage.getItem("hermesKanbanComposerMultiAgent") === "1" ? "multi" : "single";
}

function normalizeKanbanComposerMaxParallel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return KANBAN_MULTI_AGENT_DEFAULT_PARALLEL;
  return Math.max(1, Math.min(KANBAN_MULTI_AGENT_MAX_PARALLEL, Math.floor(parsed)));
}

function initialKanbanMaxParallel() {
  return normalizeKanbanComposerMaxParallel(localStorage.getItem("hermesKanbanComposerMaxParallel"));
}

function initialKanbanReasoningEffort() {
  const effort = String(localStorage.getItem("hermesKanbanComposerReasoningEffort") || "").trim().toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
}

function defaultKanbanReadingDraft() {
  return {
    caseMode: "study-plan",
    studyTemplate: "reading",
    subjectDomain: "",
    activityTitle: "",
    learnerName: "",
    readerName: "",
    bookTitle: "",
    performerWorkspaceId: "",
    viewerWorkspaceIds: "",
    coverName: "",
    sessions: "10",
    startDate: todayDateInputValue(),
    timeOfDay: "21:00",
    scheduleFrequency: "daily",
    scheduleWeekdays: "1",
    scheduleMonthDay: "1",
    reminderLeadMinutes: "15",
  };
}

function defaultKanbanAssessmentDraft() {
  return {
    caseMode: "assessment-plan",
    subject: "数学",
    learnerName: "",
    courseLevel: "",
    planTitle: "",
    performerWorkspaceId: "",
    viewerWorkspaceIds: "",
    examCount: "10",
    questionCount: "20",
    durationMinutes: "30",
    passingScore: "80",
    intervalDays: "14",
    startDate: todayDateInputValue(),
    timeOfDay: "19:30",
    reminderLeadMinutes: "30",
    difficulty: "基础30% / 中等50% / 挑战20%",
  };
}

function isKanbanProgrammingStudyTemplate(value) {
  return String(value || "").trim().toLowerCase() === "programming";
}

function programmingAssessmentDraftFromStudyDraft(studyDraft = {}) {
  const draft = Object.assign(defaultKanbanReadingDraft(), studyDraft || {});
  const subject = String(draft.subjectDomain || "").trim() || "Python 编程";
  const title = String(draft.activityTitle || draft.bookTitle || "").trim() || `${subject} 编程测验计划`;
  return Object.assign(defaultKanbanAssessmentDraft(), {
    caseMode: "assessment-plan",
    subject,
    learnerName: draft.learnerName || draft.readerName || "",
    courseLevel: "编程练习",
    planTitle: title,
    performerWorkspaceId: draft.performerWorkspaceId || "",
    viewerWorkspaceIds: draft.viewerWorkspaceIds || "",
    examCount: draft.sessions || "10",
    questionCount: "10",
    durationMinutes: "30",
    passingScore: "80",
    intervalDays: "7",
    startDate: draft.startDate || todayDateInputValue(),
    timeOfDay: draft.timeOfDay || "21:00",
    scheduleFrequency: draft.scheduleFrequency || "daily",
    scheduleWeekdays: draft.scheduleWeekdays || "1",
    scheduleMonthDay: draft.scheduleMonthDay || "1",
    reminderLeadMinutes: draft.reminderLeadMinutes || "15",
    difficulty: "基础40% / 应用40% / 挑战20%",
  });
}

function parseWorkspaceIdList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s;，、]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function workspaceLabelById(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return "";
  const workspace = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .find((item) => String(item?.id || "") === id);
  return String(workspace?.label || id).trim();
}

function kanbanPlanBindingParts(draft = {}, kind = "study") {
  const source = draft && typeof draft === "object" ? draft : {};
  const learner = String(source.learnerName || source.readerName || "").trim();
  const title = String(source.activityTitle || source.bookTitle || source.planTitle || source.subject || "").trim();
  const performerId = String(source.performerWorkspaceId || "").trim();
  const viewerIds = parseWorkspaceIdList(source.viewerWorkspaceIds);
  return {
    learner,
    title,
    performerId,
    performerLabel: workspaceLabelById(performerId),
    viewerLabels: viewerIds.map(workspaceLabelById).filter(Boolean),
    kind,
  };
}

function renderKanbanPlanBindingPreview(draft = {}, kind = "study") {
  const parts = kanbanPlanBindingParts(draft, kind);
  const learner = parts.learner || "\u5b66\u4e60\u8005";
  const title = parts.title || (kind === "assessment" ? "\u8003\u8bd5\u8ba1\u5212" : "\u5b66\u4e60\u8ba1\u5212");
  const directoryText = `${learner} / \u5b66\u4e60\u8ba1\u5212 / ${title}`;
  const performerText = parts.performerLabel ? `\u6267\u884c\uff1a${parts.performerLabel}` : "\u672a\u6307\u5b9a\u6267\u884c\u8005";
  const viewerText = parts.viewerLabels.length ? `\u53ea\u8bfb\uff1a${parts.viewerLabels.join("\u3001")}` : "\u672a\u6307\u5b9a\u53ea\u8bfb\u67e5\u770b\u8005";
  return `<div class="kanban-plan-binding-preview" data-kanban-binding-preview data-kanban-binding-kind="${escapeHtml(kind)}">
    <strong>\u7ed1\u5b9a\u76ee\u5f55</strong>
    <span>${escapeHtml(directoryText)}</span>
    <small>${escapeHtml(performerText)} · ${escapeHtml(viewerText)}</small>
  </div>`;
}

function updateKanbanPlanBindingPreview(root = document, kind = "study") {
  const target = root.querySelector?.(`[data-kanban-binding-preview][data-kanban-binding-kind="${kind}"]`);
  if (!target) return;
  const draft = kind === "assessment"
    ? Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {})
    : Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  const marker = document.createElement("div");
  marker.innerHTML = renderKanbanPlanBindingPreview(draft, kind);
  const next = marker.firstElementChild;
  if (next) target.replaceWith(next);
}

function initialKanbanReadingDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem("hermesKanbanReadingDraft") || "{}");
    return Object.assign(defaultKanbanReadingDraft(), parsed && typeof parsed === "object" ? parsed : {}, { caseMode: "study-plan" });
  } catch (_) {
    return defaultKanbanReadingDraft();
  }
}

function initialKanbanAssessmentDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem("hermesKanbanAssessmentDraft") || "{}");
    return Object.assign(defaultKanbanAssessmentDraft(), parsed && typeof parsed === "object" ? parsed : {}, { caseMode: "assessment-plan" });
  } catch (_) {
    return defaultKanbanAssessmentDraft();
  }
}

function initialHermesViewMode() {
  const saved = localStorage.getItem("hermesWebViewMode") || "tasks";
  return saved === "todos" ? "capabilities" : saved;
}

const state = {
  key: localStorage.getItem("hermesWebKey") || "",
  auth: null,
  setupRequired: false,
  setupOwnerKey: "",
  setupError: "",
  clientVersion: CLIENT_VERSION,
  serverClientVersion: "",
  mobileBrowserShellBlocked: false,
  appUpdate: null,
  appUpdateChecking: false,
  appUpdateApplying: false,
  defaultReasoningEffort: "medium",
  defaultReasoningSource: "gateway-default",
  assistantLabel: "AI",
  defaultModel: "",
  defaultModelId: "",
  modelProvider: "",
  runtimeModelOptions: [],
  composerSearchSource: "local",
  composerSourceMenuOpen: false,
  reasoningOptions: [],
  gatewayPool: null,
  wardrobeAvailable: false,
  wardrobePluginManifest: null,
  wardrobePluginManifestFetchedAt: 0,
  wardrobePluginManifestFreshForFrame: false,
  wardrobePluginFrameUrl: "",
  wardrobePluginFrameOrigin: "",
  wardrobePluginShellNode: null,
  wardrobePluginCanGoBack: false,
  wardrobePluginNavigationRoute: null,
  wardrobePluginNavigationLastAt: 0,
  wardrobePluginBridgeBound: false,
  wardrobePluginFrameHealthSeq: 0,
  wardrobePluginLoading: false,
  wardrobePluginChecked: false,
  embeddedPlugins: {},
  pluginAdminOpen: false,
  pluginAdminLoading: false,
  pluginAdminError: "",
  pluginAdminPlugins: [],
  pluginAdminExpandedPluginId: "",
  concurrency: null,
  displayConfig: {
    ownerDriveRootNames: ["ChatGPT-Drive"],
    ownerRootFallbackLabel: "Owner",
  },
  refreshCheckTimer: null,
  refreshNoticeDismissedVersion: "",
  routeSnapshotTimer: 0,
  pendingAppRouteRestoreScrollTop: 0,
  pendingAppRouteRestoreMessageId: "",
  pushToastTimer: null,
  workspaces: [],
  projects: [],
  threads: [],
  todos: [],
  todoWorkspaceId: "",
  todoAssignees: [],
  todoSource: "",
  todoKanbanBoard: "",
  todoKanbanStatus: initialTodoKanbanStatus(),
  todoCompletedLoaded: false,
  todoCardDetails: {},
  kanbanStoryDetailQueued: {},
  kanbanStoryExpanded: {},
  todoCommentDrafts: {},
  todoRevisionDrafts: {},
  todoRevisionSubmitting: {},
  todoReadingSubmissionDrafts: {},
  todoReadingSubmitting: {},
  todoReadingSubmissionRefreshing: {},
  todoReadingSubmissionWatchdogs: {},
  todoReadingSubmissionProgress: {},
  todoReadingSubmissionFeedback: {},
  todoReadingRecorders: {},
  todoReadingQuizzes: {},
  todoReadingQuizAnswers: {},
  todoReadingQuizStep: {},
  todoReadingQuizSubmitting: {},
  todoReadingQuizReviewOpen: {},
  todoAssessmentExams: {},
  todoAssessmentAnswers: {},
  todoAssessmentStep: {},
  todoAssessmentSubmitting: {},
  todoAssessmentReviewOpen: {},
  todoAssessmentRequirementDrafts: {},
  todoLearningGuidance: {},
  todoLearningGuidanceDrafts: {},
  todoLearningGuidanceSubmitting: {},
  todoLearningGrowthSubmissionDrafts: {},
  todoLearningGrowthSubmissionSubmitting: {},
  todoLearningGrowthSubmissionFeedback: {},
  todoLearningGrowthSubmissionProgress: {},
  todoLearningGrowthSubmissionProgressTimers: {},
  todoLearningGrowthReflectionRecorders: {},
  todoLearningGrowthReflectionSubmitting: {},
  learningNativeGrowthSubmissionRecorders: {},
  learningNativeGrowthSubmissionSubmitting: {},
  pendingReadingQuizTodoId: "",
  pendingAssessmentExamTodoId: "",
  todoAutoRefreshTimer: 0,
  selectedTodoId: "",
  todoRouteMissingTargetId: "",
  todoCreateOpen: false,
  kanbanComposerText: localStorage.getItem("hermesKanbanComposerDraft") || "",
  kanbanComposerMode: initialKanbanComposerMode(),
  kanbanComposerMultiAgent: initialKanbanComposerMode() === "multi",
  kanbanReadingDraft: initialKanbanReadingDraft(),
  kanbanAssessmentDraft: initialKanbanAssessmentDraft(),
  kanbanReadingCoverFile: null,
  kanbanReadingCoverPreviewUrl: "",
  kanbanCoverObjectUrls: {},
  kanbanComposerDocuments: [],
  kanbanComposerDocumentUploading: false,
  kanbanComposerMaxParallel: initialKanbanMaxParallel(),
  kanbanComposerReasoningEffort: initialKanbanReasoningEffort(),
  kanbanComposerBusy: false,
  kanbanComposerProgressKind: "",
  kanbanComposerProgressStartedAt: 0,
  kanbanComposerProgressStep: 0,
  kanbanComposerProgressTimer: 0,
  kanbanComposerMessages: [],
  kanbanPlanDraft: null,
  kanbanPlanCreating: false,
  automations: [],
  automationSource: null,
  automationLoading: false,
  automationCacheKey: "",
  automationFullCacheKey: "",
  automationDetailLoading: false,
  automationDetailRequestSeq: 0,
  automationLastLoadedAt: 0,
  automationRequestSeq: 0,
  selectedAutomationId: "",
  automationReturnRoute: "",
  automationReturnScope: "",
  automationReturnInboxItemId: "",
  automationRouteTargetId: "",
  automationRouteTargetPending: false,
  automationCreateOpen: false,
  automationEditOpen: false,
  automationEditJobId: "",
  automationOutputHistoryOpen: false,
  actionInboxItems: [],
  actionInboxCounts: null,
  actionInboxSource: null,
  actionInboxLoading: false,
  actionInboxRequestSeq: 0,
  actionInboxStatusFilter: "open",
  actionInboxSourceFilter: "",
  selectedActionInboxItemId: "",
  actionInboxDetail: null,
  actionInboxCreateOpen: false,
  actionInboxCreateBusy: false,
  learningGrowth: null,
  learningGrowthWorkspaceId: "",
  learningCoins: null,
  learningCoinScopeKey: "",
  learningCoinsLoading: false,
  learningCoinsError: "",
  learningParentReport: null,
  learningParentReportLoading: false,
  learningParentReportError: "",
  learningAiSummary: null,
  learningAiSummaryScopeKey: "",
  learningAiSummaryLoading: false,
  learningAiSummaryError: "",
  learningAiSummaryProgress: "",
  learningAiSummaryProgressTimers: [],
  learningAiDraftCreatingId: "",
  learningGrowthActiveTab: "settings",
  learningCoinRequestSeq: 0,
  learningGrowthSettingsOpen: false,
  directoryThreadId: "",
  directoryThreadWorkspaceId: "",
  directoryPath: "",
  directoryRootPath: "",
  directoryReturnRoute: null,
  directoryPluginContextActive: false,
  directoryPreview: null,
  directoryLoading: false,
  directoryError: "",
  sharedDirectoryManagerOpen: false,
  sharedDirectories: [],
  sharedDirectoriesLoading: false,
  sharedDirectoriesError: "",
  sharedDirectoryAccessId: "",
  accessKeyManagerOpen: false,
  accessKeys: [],
  accessKeysAuth: null,
  accessKeysLoading: false,
  accessKeysError: "",
  generatedAccessKey: null,
  accessKeyRequiresLogin: false,
  accessKeyWorkspaceId: "",
  workspaceOnboardingPlan: null,
  workspaceOnboardingResult: null,
  workspaceOnboardingLoading: false,
  workspaceOnboardingError: "",
  workspaceOnboardingDraft: null,
  workspaceOnboardingRun: null,
  runtimeConfigOpen: false,
  runtimeConfig: null,
  runtimeConfigLoading: false,
  runtimeConfigError: "",
  runtimeConfigTestStatus: null,
  currentThread: null,
  currentThreadId: "",
  currentThreadRefreshInFlight: false,
  currentThreadRefreshPending: false,
  currentThreadRefreshTimer: 0,
  singleWindowRequestSeq: 0,
  currentTaskGroupId: "",
  taskListScrollTop: 0,
  directoryTopicRenderPending: false,
  directoryTopicRenderPendingSignature: "",
  directoryTopicCollectionsReadySignature: "",
  viewMode: initialHermesViewMode(),
  singleWindowMode: localStorage.getItem("hermesWebSingleWindowMode") || "chat",
  selectedWorkspaceId: localStorage.getItem("hermesWebWorkspace") || "owner",
  selectedProjectId: localStorage.getItem("hermesWebProject") || "general",
  selectedSubprojectId: localStorage.getItem("hermesWebSubproject") || "",
  events: null,
  pendingArtifacts: [],
  composerFocused: false,
  composerComposing: false,
  composerSendAfterComposition: false,
  composerSendAfterCompositionTimer: null,
  directoryTopicDraftSendInFlight: false,
  keyboardContextMode: false,
  keyboardContextTopPx: 0,
  keyboardViewportActive: false,
  renderScheduled: false,
  streamingMessageRenderScheduled: new Set(),
  streamingMessageRenderLastAt: new Map(),
  runProgressRenderScheduled: new Set(),
  runProgressRenderLastAt: new Map(),
  runProgressFallbackRefreshTimer: 0,
  runProgressFallbackRefreshThreadId: "",
  expandedLongMessageIds: new Set(),
  runProgressTicker: 0,
  shouldStickToBottom: true,
  preservedBottomOffset: 0,
  conversationPinnedToBottom: true,
  suppressConversationPinUntil: 0,
  suppressChatAutoBottomUntil: 0,
  conversationBottomStickTimer: 0,
  conversationViewportRefreshTimers: [],
  conversationViewportSettleUntil: 0,
  conversationViewportBottomFollowUntil: 0,
  conversationViewportLayerResetUntil: 0,
  conversationViewportRefreshTimer: 0,
  conversationViewportLayerResetDoneUntil: 0,
  messageScrollVisibilityRoot: null,
  routeScrollTaskGroupId: "",
  routeScrollMessageId: "",
  searchTimer: null,
  chatSearchOpen: false,
  chatSearchDraft: "",
  chatSearchComposerDraft: "",
  chatSearchDraftChangedSinceSearch: false,
  chatSearchQuery: "",
  chatSearchMatches: [],
  chatSearchIndex: 0,
  chatSearchLoading: false,
  chatSearchTotalMatches: 0,
  chatSearchScrollPending: false,
  chatSearchRefocus: false,
  olderChatMessagesLoading: false,
  suppressComposerFocusUntil: 0,
  suppressTransientActivationUntil: 0,
  attachFilePickerActivationAt: 0,
  topNavActivationAt: 0,
  privateChatThread: null,
  weixinChatOpen: localStorage.getItem("hermesWebWeixinChatOpen") === "1",
  weixinChatAvailable: false,
  weixinChatThread: null,
  weixinChatThreadId: "",
  groupChatOpen: localStorage.getItem("hermesWebGroupChatOpen") === "1",
  groupChatAvailable: false,
  groupChatThread: null,
  groupChatThreadId: "",
  taskListThread: null,
  taskListThreadId: "",
  taskListWindowRefreshLoading: false,
  caseTopicThreads: [],
  kanbanTopicCardSnapshotLoading: false,
  kanbanTopicCardSnapshotLoadedAt: 0,
  groupChatManagerOpen: false,
  groupChatMemberDraft: [],
  groupMentionOpen: false,
  groupMentionOptions: [],
  groupMentionIndex: 0,
  groupMentionToken: null,
  sidebarSwipe: null,
  directorySwipe: null,
  taskSwipe: null,
  scrollFeedback: null,
  backSwipe: null,
  pushStatus: null,
  pushSubscription: null,
  ownerElevation: null,
  ownerElevationDurationMinutes: Number(localStorage.getItem("hermesOwnerElevationMinutes") || "15") || 15,
  ownerElevationOnceToken: "",
  ownerElevationOnceExpiresAt: "",
  ownerElevationPromptedMessageIds: new Set(),
  ownerElevationRetryingMessageIds: new Set(),
  pwaInstallPrompt: null,
  pwaInstallOpen: false,
  pwaInstalled: false,
  pwaServiceWorkerReady: false,
  pwaServiceWorkerError: "",
  settingsOpen: false,
  settingsReturnToSidebar: false,
  themeMode: initialThemePreference(localStorage.getItem("hermesWebTheme") || DEFAULT_THEME_MODE),
  themePreferenceWatcherStarted: false,
  fontSize: initialFontSizePreference(localStorage.getItem("hermesWebFontSize") || DEFAULT_FONT_SIZE),
  fontFamily: initialFontFamilyPreference(localStorage.getItem("hermesWebFontFamily") || DEFAULT_FONT_FAMILY),
  defaultComposerModelId: initialDefaultComposerModelPreference(localStorage.getItem("hermesDefaultComposerModel") || DEFAULT_COMPOSER_MODEL_ID),
  readingFullscreen: false,
  transientProjectRoute: null,
  quotedReply: null,
  taskDirectoryFilter: null,
  pendingTaskDirectory: null,
  pendingTaskReasoningEffort: "",
  pendingTaskReasoningExplicit: false,
  skillDetail: null,
  draftThreadSeq: 0,
};

const MESSAGE_TIMESTAMP_FIELDS = [
  "submittedAt",
  "queuedAt",
  "startedAt",
  "firstFeedbackAt",
  "completedAt",
  "failedAt",
  "cancelledAt",
];

const $ = (id) => document.getElementById(id);
const TASK_SWIPE_REVEAL_PX = 88;
const TASK_SWIPE_OPEN_THRESHOLD_PX = 42;
const EDGE_SWIPE_HIT_PX = 32;
const TASK_REASONING_OPTIONS = [
  { value: "", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Xhigh" },
];
const KANBAN_PLAN_PROGRESS_STEPS = Object.freeze([
  "\u6574\u7406\u9700\u6c42",
  "\u5206\u6790\u4ea4\u4ed8\u76ee\u6807",
  "\u62c6\u5206\u6267\u884c\u987a\u5e8f",
  "\u751f\u6210\u5361\u7247\u8349\u6848",
]);
const KANBAN_CREATE_PROGRESS_STEPS = Object.freeze([
  "\u6821\u9a8c\u8349\u6848",
  "\u521b\u5efa\u5361\u7247",
  "\u8bbe\u7f6e\u4f9d\u8d56",
  "\u5237\u65b0\u770b\u677f",
]);
const KANBAN_READING_PROGRESS_STEPS = Object.freeze([
  "整理学习计划",
  "生成学习任务",
  "写入提醒时间",
  "刷新故事树",
]);
const KANBAN_ASSESSMENT_PROGRESS_STEPS = Object.freeze([
  "整理考试模板",
  "生成正式测试卡片",
  "写入考试时间和通过线",
  "刷新故事树",
]);
const KANBAN_STATUS_ORDER = Object.freeze(["triage", "todo", "ready", "running", "blocked", "done", "archived"]);
const KANBAN_TAB_ORDER = Object.freeze([KANBAN_STORY_STATUS, ...KANBAN_STATUS_ORDER]);
const KANBAN_STATUS_FALLBACK_ORDER = Object.freeze(["running", "blocked", "ready", "todo", "triage", "done", "archived"]);
const KANBAN_STATUS_META = Object.freeze({
  story: { label: "\u6545\u4e8b", shortLabel: "Story" },
  triage: { label: "\u5f85\u5206\u62e3", shortLabel: "Triage" },
  todo: { label: "\u5f85\u529e", shortLabel: "Todo" },
  ready: { label: "\u5c31\u7eea", shortLabel: "Ready" },
  running: { label: "\u8fd0\u884c\u4e2d", shortLabel: "Running" },
  blocked: { label: "\u963b\u585e", shortLabel: "Blocked" },
  done: { label: "\u5b8c\u6210", shortLabel: "Done" },
  archived: { label: "\u5f52\u6863", shortLabel: "Archived" },
});
const SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
const SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const GROUP_MESSAGE_REVOKED_TEXT = "\u6d88\u606f\u5df2\u64a4\u56de";
const GROUP_REVOKE_LABEL = "\u64a4\u56de";
const SHARE_IMAGE_WIDTH = 1440;
const SHARE_IMAGE_SCALE = 3;
const SHARE_IMAGE_MAX_PIXELS = 48000000;
const SHARE_IMAGE_MAX_DIMENSION = 24000;
