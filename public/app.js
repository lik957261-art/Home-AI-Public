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
const FONT_FAMILY_OPTIONS = Object.freeze([
  {
    id: "system",
    label: "系统",
    sample: "Aa",
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Aptos", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  {
    id: "sans",
    label: "黑体",
    sample: "黑",
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
const CHAT_MESSAGE_INITIAL_LIMIT = 60;
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
const TaskArtifactHelpers = window.HermesTaskArtifactHelpers || {};
const KanbanStoryHelpers = window.HermesKanbanStoryHelpers || {};
const LearningReadingUi = window.HermesLearningReadingUi || {};
const AppApiClient = window.HermesAppApiClient || {};

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

const state = {
  key: localStorage.getItem("hermesWebKey") || "",
  auth: null,
  setupRequired: false,
  setupOwnerKey: "",
  setupError: "",
  clientVersion: CLIENT_VERSION,
  serverClientVersion: "",
  appUpdate: null,
  appUpdateChecking: false,
  appUpdateApplying: false,
  defaultReasoningEffort: "medium",
  defaultReasoningSource: "gateway-default",
  assistantLabel: "AI",
  defaultModel: "",
  modelProvider: "",
  reasoningOptions: [],
  gatewayPool: null,
  concurrency: null,
  displayConfig: {
    ownerDriveRootNames: ["ChatGPT-Drive"],
    ownerRootFallbackLabel: "Hermes Owner",
  },
  refreshCheckTimer: null,
  refreshNoticeDismissedVersion: "",
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
  automationLastLoadedAt: 0,
  automationRequestSeq: 0,
  selectedAutomationId: "",
  automationCreateOpen: false,
  automationEditOpen: false,
  automationEditJobId: "",
  automationOutputHistoryOpen: false,
  learningCoins: null,
  learningCoinScopeKey: "",
  learningCoinsLoading: false,
  learningCoinsError: "",
  learningCoinRequestSeq: 0,
  directoryThreadId: "",
  directoryThreadWorkspaceId: "",
  directoryPath: "",
  directoryRootPath: "",
  directoryReturnRoute: null,
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
  currentTaskGroupId: "",
  viewMode: localStorage.getItem("hermesWebViewMode") || "single",
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
  keyboardContextMode: false,
  keyboardContextTopPx: 0,
  keyboardViewportActive: false,
  renderScheduled: false,
  streamingMessageRenderScheduled: new Set(),
  shouldStickToBottom: true,
  preservedBottomOffset: 0,
  conversationPinnedToBottom: true,
  suppressConversationPinUntil: 0,
  conversationBottomStickTimer: 0,
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
  fontSize: normalizeFontSizePreference(localStorage.getItem("hermesWebFontSize") || DEFAULT_FONT_SIZE),
  fontFamily: normalizeFontFamilyPreference(localStorage.getItem("hermesWebFontFamily") || DEFAULT_FONT_FAMILY),
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
  { value: "", label: "Hermes default" },
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

function isSingleWindowConversationTaskGroupId(value) {
  const id = String(value || "");
  return id === SINGLE_WINDOW_CHAT_TASK_GROUP_ID || id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function splitConfigList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,，;；]+/g);
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function joinConfigList(value) {
  return splitConfigList(value).join("\n");
}

function workspaceCreateInputs(root = document) {
  return {
    id: root.querySelector?.("#newWorkspaceId") || null,
    label: root.querySelector?.("#newWorkspaceLabel") || null,
    root: root.querySelector?.("#newWorkspaceRoot") || null,
    allowedRoots: root.querySelector?.("#newWorkspaceAllowedRoots") || null,
    toolsets: root.querySelector?.("#newWorkspaceToolsets") || null,
  };
}

function setWorkspaceAutoValue(input, value) {
  if (!input || input.dataset.manual === "1") return;
  input.value = value || "";
  input.dataset.autofilled = "1";
}

function workspaceDefaultUsername(value) {
  return String(value || "").trim();
}

let workspaceDefaultRequestSeq = 0;

async function refreshWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  const username = workspaceDefaultUsername(inputs.id?.value || "");
  if (!username) {
    Object.values(inputs).forEach((input) => {
      if (input && input !== inputs.id && input.dataset.manual !== "1") input.value = "";
    });
    return;
  }
  const seq = ++workspaceDefaultRequestSeq;
  const params = new URLSearchParams({ username });
  const labelValue = inputs.label?.dataset.manual === "1" ? inputs.label.value.trim() : "";
  if (labelValue) params.set("label", labelValue);
  const result = await api(`/api/workspaces/defaults?${params}`);
  if (seq !== workspaceDefaultRequestSeq) return;
  const defaults = result.defaults || {};
  setWorkspaceAutoValue(inputs.label, defaults.label || username);
  setWorkspaceAutoValue(inputs.root, defaults.defaultWorkspace || "");
  setWorkspaceAutoValue(inputs.allowedRoots, joinConfigList(defaults.allowedRoots || defaults.defaultWorkspace || ""));
  setWorkspaceAutoValue(inputs.toolsets, splitConfigList(defaults.allowedToolsets || []).join(", "));
  const hint = root.querySelector?.("#newWorkspaceDefaultsHint");
  if (hint) hint.textContent = defaults.workspaceId ? `ID: ${defaults.workspaceId}` : "";
}

function wireWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  [inputs.label, inputs.root, inputs.allowedRoots, inputs.toolsets].forEach((input) => {
    input?.addEventListener("input", () => {
      input.dataset.manual = "1";
    });
  });
  let timer = null;
  inputs.id?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      refreshWorkspaceCreateDefaults(root).catch(showError);
    }, 180);
  });
  inputs.label?.addEventListener("blur", () => {
    refreshWorkspaceCreateDefaults(root).catch(showError);
  });
}

function formatElapsedDuration(startValue, endValue) {
  const start = new Date(startValue || "").getTime();
  const end = new Date(endValue || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

function messageDisplayTimestamp(message) {
  if (!message) return "";
  if (message.role === "user") return message.submittedAt || message.createdAt || message.updatedAt || "";
  if (message.completedAt) return message.completedAt;
  if (message.failedAt) return message.failedAt;
  if (message.cancelledAt) return message.cancelledAt;
  return "";
}

function messageDisplayTimeLabel(message) {
  const timestamp = messageDisplayTimestamp(message);
  if (timestamp) {
    const label = formatTime(timestamp);
    if (message?.role === "assistant") {
      const elapsed = formatElapsedDuration(message.queuedAt || message.startedAt || message.createdAt, timestamp);
      return elapsed ? `${label} · 耗时${elapsed}` : label;
    }
    return label;
  }
  if (message?.role === "assistant" && ["queued", "running"].includes(String(message.status || ""))) return "等待反馈";
  return "";
}

function messageTimelineTimestamp(message) {
  return messageDisplayTimestamp(message) || message?.submittedAt || message?.updatedAt || message?.createdAt || "";
}

function formatBytes(bytes) {
  return TaskArtifactHelpers.formatBytes(bytes);
}

function compactDisplayText(value, max = 180) {
  return TaskArtifactHelpers.compactDisplayText(value, max, { rewriteDirectoryPathsForDisplay });
}

function taskGroupsForThread(thread) {
  return TaskArtifactHelpers.taskGroupsForThread(thread);
}

function messageOwnerWorkspaceId(message, fallback = "") {
  return TaskArtifactHelpers.messageOwnerWorkspaceId(message, fallback);
}

function taskGroupOwnerWorkspaceId(group, fallback = "") {
  return TaskArtifactHelpers.taskGroupOwnerWorkspaceId(group, fallback);
}

function taskListGroupsForThread(thread) {
  return TaskArtifactHelpers.taskListGroupsForThread(thread, {
    selectedWorkspaceId: state.selectedWorkspaceId,
    isConversationTaskGroupId: isSingleWindowConversationTaskGroupId,
  });
}

function sharedCaseTopicGroupsForTaskList(currentThread) {
  return (Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : [])
    .filter((thread) => thread?.id && thread.id !== currentThread?.id)
    .flatMap((thread) => taskListGroupsForThread(thread).map((group) => Object.assign({}, group, {
      sourceThreadId: thread.id,
      sourceThreadTitle: thread.title || "",
      sharedTopic: true,
    })));
}

function kanbanStoryCaseId(group) {
  const first = (group?.cards || [])[0]?.todo || {};
  return String(group?.id || first.kanbanCaseId || "").trim();
}

function kanbanStoryGroupForCaseId(caseId) {
  const id = String(caseId || "").trim();
  if (!id) return null;
  return kanbanStoryCases(state.todos || []).find((group) => (
    kanbanStoryCaseId(group) === id
    || (group.cards || []).some((item) => String(item?.todo?.kanbanCaseId || "") === id)
  )) || null;
}

function kanbanStoryGroupForTopicGroup(group) {
  return kanbanStoryGroupForCaseId(group?.kanbanCaseId || "");
}

function kanbanBoundTopicForStoryGroup(group) {
  const caseId = kanbanStoryCaseId(group);
  if (!caseId) return null;
  for (const thread of Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : []) {
    const meta = thread?.taskGroupMeta && typeof thread.taskGroupMeta === "object" ? thread.taskGroupMeta : {};
    for (const [taskGroupId, value] of Object.entries(meta)) {
      if (String(value?.kanbanCaseId || "").trim() === caseId) {
        return { threadId: thread.id, taskGroupId, thread, meta: value };
      }
    }
  }
  return null;
}

function sharedTopicChatDisabledForSelectedWorkspace(group) {
  if (!group?.sharedTopic) return false;
  const workspaceId = String(state.selectedWorkspaceId || "").trim();
  if (!workspaceId || state.auth?.isOwner) return false;
  const performers = new Set((group.performerWorkspaceIds || []).map(String));
  const viewers = new Set((group.viewerWorkspaceIds || []).map(String));
  return !performers.has(workspaceId) && !viewers.has(workspaceId);
}

function selectedSharedTopicGroup() {
  if (state.viewMode !== "tasks" || !state.currentTaskGroupId || !state.currentThread?.singleWindow) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId && group.sharedTopic) || null;
}

function currentTaskThreadIsSharedTopicThread() {
  if (state.viewMode !== "tasks" || !state.currentThreadId || !Array.isArray(state.caseTopicThreads)) return false;
  return state.caseTopicThreads.some((thread) => thread?.id === state.currentThreadId);
}

function rememberTaskListThread(thread = state.currentThread) {
  if (state.viewMode !== "tasks" || !thread?.singleWindow || !thread.id) return;
  const isSharedTopicThread = (Array.isArray(state.caseTopicThreads) ? state.caseTopicThreads : [])
    .some((item) => item?.id === thread.id);
  if (isSharedTopicThread) return;
  state.taskListThread = thread;
  state.taskListThreadId = thread.id;
}

function restoreTaskListThreadFromCache(options = {}) {
  const cached = state.taskListThread;
  if (!cached?.id) return false;
  const workspaceId = String(state.selectedWorkspaceId || "").trim();
  if (workspaceId && cached.workspaceId !== workspaceId && !threadGroupMemberIds(cached).includes(workspaceId)) return false;
  state.currentThread = cached;
  state.currentThreadId = cached.id;
  state.threads = [summarizeThread(cached)];
  state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
  setComposerEnabled(true);
  return true;
}

function scheduleTaskListWindowRefresh() {
  if (state.taskListWindowRefreshLoading) return;
  state.taskListWindowRefreshLoading = true;
  window.setTimeout(() => {
    if (state.viewMode !== "tasks" || state.currentTaskGroupId) {
      state.taskListWindowRefreshLoading = false;
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false })
      .catch(showError)
      .finally(() => {
        state.taskListWindowRefreshLoading = false;
      });
  }, 0);
}

function activeChatTaskGroupId() {
  return isGroupChatView() ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function chatMessagesForThread(thread, taskGroupId = activeChatTaskGroupId()) {
  const groupId = String(taskGroupId || SINGLE_WINDOW_CHAT_TASK_GROUP_ID);
  return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === groupId);
}

function sortedThreadMessages(messages) {
  return (messages || []).slice().sort((a, b) => {
    const timeCompare = String(messageTimelineTimestamp(a) || "").localeCompare(String(messageTimelineTimestamp(b) || ""));
    if (timeCompare) return timeCompare;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function chatMessagePageParams(extra = {}) {
  const params = new URLSearchParams();
  params.set("messageMode", "chat");
  params.set("limit", String(extra.limit || CHAT_MESSAGE_PAGE_LIMIT));
  params.set("groupChat", isGroupChatView() ? "1" : "0");
  if (extra.before) params.set("before", extra.before);
  if (extra.search) params.set("search", extra.search);
  return params;
}

function mergeMessagesPage(existingPage = null, incomingPage = null, messages = []) {
  const merged = Object.assign({}, existingPage || {}, incomingPage || {});
  const sameScope = !existingPage || !incomingPage
    || (
      String(existingPage.mode || "") === String(incomingPage.mode || "")
      && String(existingPage.taskGroupId || "") === String(incomingPage.taskGroupId || "")
    );
  merged.loaded = messages.length;
  merged.oldestMessageId = messages[0]?.id || "";
  merged.newestMessageId = messages[messages.length - 1]?.id || "";
  if ((sameScope && existingPage?.hasMoreBefore === false) || incomingPage?.hasMoreBefore === false) {
    merged.hasMoreBefore = false;
  }
  return merged;
}

function mergeCurrentThreadMessages(messages = [], page = null) {
  if (!state.currentThread || !Array.isArray(messages) || !messages.length) return;
  const current = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  for (const message of messages) {
    current.set(message.id, mergeServerMessage(current.get(message.id), message));
  }
  const mergedMessages = sortedThreadMessages([...current.values()]);
  state.currentThread.messages = mergedMessages;
  if (page) {
    state.currentThread.messagesPage = mergeMessagesPage(state.currentThread.messagesPage, page, chatMessagesForThread(state.currentThread));
  }
}

function oldestLoadedChatMessageId(thread = state.currentThread) {
  return chatMessagesForThread(thread)[0]?.id || "";
}

function activeChatRunIds(thread = state.currentThread) {
  return chatMessagesForThread(thread)
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function taskStatus(group) {
  return TaskArtifactHelpers.taskStatus(group);
}

function taskDisplayId(group) {
  return TaskArtifactHelpers.taskDisplayId(group);
}

function messageTaskDisplayId(message) {
  const group = messageTaskGroup(message);
  return taskDisplayId(group) || message?.taskId || message?.runId || message?.taskGroupId || "task";
}

function shortTaskDisplayId(value) {
  return TaskArtifactHelpers.shortTaskDisplayId(value);
}

function taskPrompt(group) {
  return TaskArtifactHelpers.taskPrompt(group, { rewriteDirectoryPathsForDisplay });
}

function taskSummary(group) {
  return TaskArtifactHelpers.taskSummary(group, { rewriteDirectoryPathsForDisplay });
}

function taskTitle(group) {
  return TaskArtifactHelpers.taskTitle(group, { rewriteDirectoryPathsForDisplay });
}

function taskArtifacts(group) {
  return TaskArtifactHelpers.taskArtifacts(group);
}

function isTaskListPrimaryDocument(artifact) {
  return TaskArtifactHelpers.isTaskListPrimaryDocument(artifact);
}

function isMarkdownArtifact(artifact) {
  return TaskArtifactHelpers.isMarkdownArtifact(artifact);
}

function latestTaskListDocument(group) {
  return TaskArtifactHelpers.latestTaskListDocument(group);
}

function normalizeSkillPath(value) {
  return TaskArtifactHelpers.normalizeSkillPath(value);
}

function skillEntryFromText(value) {
  return TaskArtifactHelpers.skillEntryFromText(value);
}

function taskSkills(group) {
  return TaskArtifactHelpers.taskSkills(group);
}

function renderTaskSkillChips(skills, options = {}) {
  if (!skills?.length) return "";
  return `<div class="task-skills${options.compact ? " compact" : ""}" aria-label="Topic skills">
    ${skills.map((skill) => {
      const title = skill.namespace ? `${skill.namespace}/${skill.label}` : skill.label;
      return `<button class="task-skill-chip" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(`Skill ${title}`)}" data-skill-path="${escapeHtml(skill.path)}" data-skill-label="${escapeHtml(skill.label)}" data-skill-namespace="${escapeHtml(skill.namespace || "")}">
        <span class="task-skill-icon" aria-hidden="true">S</span>
      </button>`;
    }).join("")}
  </div>`;
}

function skillTitle(skill) {
  if (!skill) return "Skill";
  return skill.namespace ? `${skill.namespace}/${skill.label || skill.id || "Skill"}` : (skill.label || skill.id || "Skill");
}

function closeSkillDetail() {
  state.skillDetail = null;
  renderCurrentThread({ stickToBottom: false });
}

async function openSkillDetail(skill) {
  if (!skill?.path) return;
  state.skillDetail = {
    id: skill.id || skill.label || "",
    label: skill.label || skill.id || "",
    namespace: skill.namespace || "",
    path: skill.path,
    loading: true,
    error: "",
    content: "",
    totalChars: 0,
    truncated: false,
  };
  renderSkillDetailPanel();
  try {
    const result = await api(`/api/skills/detail?skill=${encodeURIComponent(skill.path)}`);
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, result.data || {}, { loading: false, error: "" });
    renderSkillDetailPanel();
  } catch (err) {
    if (!state.skillDetail || state.skillDetail.path !== skill.path) return;
    state.skillDetail = Object.assign({}, state.skillDetail, { loading: false, error: err.message || String(err) });
    renderSkillDetailPanel();
  }
}

function wireSkillLinks(root) {
  root?.querySelectorAll?.("[data-skill-path]").forEach((button) => {
    if (button.dataset.skillBound) return;
    button.dataset.skillBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSkillDetail({
        path: button.dataset.skillPath || "",
        label: button.dataset.skillLabel || "",
        namespace: button.dataset.skillNamespace || "",
      }).catch(showError);
    });
  });
}

function renderSkillDetailPanel() {
  const conversation = $("conversation");
  if (!conversation || !state.skillDetail) return;
  const skill = state.skillDetail;
  const title = skillTitle(skill);
  $("threadTitle").textContent = "";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Skill" });
  const body = skill.loading
    ? `<div class="empty-state small">Loading Skill...</div>`
    : skill.error
      ? `<div class="automation-error">${escapeHtml(skill.error)}</div>`
      : `<pre class="skill-detail-content">${escapeHtml(skill.content || "")}</pre>`;
  conversation.innerHTML = `<section class="skill-detail-shell">
    <article class="skill-detail-card">
      <div class="skill-detail-head">
        <span class="task-skill-icon skill-detail-icon" aria-hidden="true">S</span>
        <div>
          <div class="skill-detail-eyebrow">Skill</div>
          <h2>${escapeHtml(title)}</h2>
          <div class="skill-detail-path">${escapeHtml(skill.path || "")}</div>
        </div>
      </div>
      ${body}
      ${skill.truncated ? `<div class="skill-detail-note">Content truncated.</div>` : ""}
    </article>
  </section>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function shortArtifactName(name) {
  return TaskArtifactHelpers.shortArtifactName(name);
}

function artifactKind(artifact) {
  return TaskArtifactHelpers.artifactKind(artifact);
}

function artifactDisplayName(artifact) {
  return TaskArtifactHelpers.artifactDisplayName(artifact);
}

function artifactStem(artifact) {
  return TaskArtifactHelpers.artifactStem(artifact);
}

function artifactDisplayRank(artifact) {
  return TaskArtifactHelpers.artifactDisplayRank(artifact);
}

function displayArtifacts(artifacts) {
  return TaskArtifactHelpers.displayArtifacts(artifacts);
}

function currentViewerReturnUrl() {
  const params = new URLSearchParams();
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (state.viewMode === "automation") {
    params.set("view", "automation");
    if (state.selectedAutomationId) params.set("automationId", state.selectedAutomationId);
  } else if (state.viewMode === "learning") {
    params.set("view", "learning");
  } else if (state.viewMode === "todos") {
    params.set("view", "todos");
    if (state.selectedTodoId) params.set("todoId", state.selectedTodoId);
  } else if (state.viewMode === "tasks" || isTaskDetailView()) {
    params.set("view", "tasks");
    if (state.currentTaskGroupId) params.set("taskGroupId", state.currentTaskGroupId);
  } else if (state.viewMode === "projects") {
    params.set("view", "directory");
    if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
    if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
    const directoryPath = directoryActivePath();
    if (directoryPath) params.set("directoryPath", directoryPath);
    const directoryRoot = state.directoryRootPath || directoryRootForPath(directoryPath, "");
    if (directoryRoot) params.set("directoryRoot", directoryRoot);
  } else if (state.viewMode === "single") {
    params.set("view", "single");
    if (isWeixinChatView()) params.set("weixinChat", "1");
    if (isGroupChatView()) params.set("groupChat", "1");
  } else {
    return `${location.pathname}${location.search}`;
  }
  return `/?${params.toString()}`;
}

function artifactHref(artifact) {
  const url = String(artifact?.url || "#");
  if (!url || url === "#") return url;
  const kind = artifactKind(artifact);
  const query = new URLSearchParams({
    src: url,
    name: artifact?.name || artifact?.id || "document",
    mime: artifact?.mime || "",
    size: String(artifact?.size || 0),
    return: currentViewerReturnUrl(),
  });
  if (state.selectedWorkspaceId) query.set("workspaceId", state.selectedWorkspaceId);
  if (state.currentThreadId) query.set("threadId", state.currentThreadId);
  if (kind === "html") return url;
  if (kind === "pdf") return `/pdf-viewer.html?${query.toString()}`;
  return `/file-viewer.html?${query.toString()}`;
}

function artifactLocalPath(artifact) {
  return String(artifact?.path || artifact?.localPath || artifact?.sourcePath || "").trim();
}

function artifactDirectoryPath(artifact) {
  const localPath = artifactLocalPath(artifact);
  return localPath ? parentDirectoryFromFilePath(localPath) : "";
}

function renderArtifactDirectoryButton(artifact, options = {}) {
  const directoryPath = artifactDirectoryPath(artifact);
  if (!directoryPath) return "";
  const label = artifact?.name || "交付目录";
  return `<button class="artifact-directory-button${options.compact ? " compact" : ""}" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(label)}" aria-label="打开交付目录" title="打开交付目录">...</button>`;
}

function renderArtifactWeixinButton(artifact) {
  if (isWeixinChatView()) return "";
  if (!artifact?.id) return "";
  return `<button class="artifact-weixin-button" type="button" data-forward-artifact-weixin="${escapeHtml(artifact.id)}" aria-label="转发到微信" title="转发到微信">微</button>`;
}

function openTaskList() {
  clearQuotedReply({ render: false });
  state.skillDetail = null;
  const reloadTaskWindow = currentTaskThreadIsSharedTopicThread();
  state.currentTaskGroupId = "";
  if (reloadTaskWindow) {
    if (restoreTaskListThreadFromCache({ stickToBottom: true })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false }).catch(showError);
    return;
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function openTodoList() {
  state.skillDetail = null;
  state.selectedTodoId = "";
  state.todoCreateOpen = false;
  renderTodos();
}

function openAutomationList() {
  state.skillDetail = null;
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  renderAutomationView();
}

function resetSidebarScroll() {
  const sidebar = $("sidebar");
  const threadList = $("threadList");
  if (sidebar) sidebar.scrollTop = 0;
  if (threadList) threadList.scrollTop = 0;
}

function sidebarBackToMenu() {
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    openTaskList();
    closeSidebar();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (kanbanComposerOpen()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    closeSidebar();
    return;
  }
  if (isMobileLayout()) {
    closeSidebar();
    return;
  }
  resetSidebarScroll();
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 1099px)").matches;
}

function isMobileLandscapeCompactLayout() {
  return window.matchMedia("(max-width: 1099px) and (orientation: landscape) and (max-height: 620px)").matches;
}

function isCurrentSingleWindowLoaded() {
  return Boolean(
    state.currentThread &&
    state.currentThread.singleWindow &&
    (state.currentThread.workspaceId === state.selectedWorkspaceId || selectedWorkspaceInThreadGroup(state.currentThread))
  );
}

function suppressComposerAutoFocus(ms = 1200) {
  state.suppressComposerFocusUntil = Math.max(state.suppressComposerFocusUntil || 0, Date.now() + ms);
}

function composerAutoFocusAllowed() {
  return document.visibilityState !== "hidden" && Date.now() >= (state.suppressComposerFocusUntil || 0);
}

function blurComposerInput() {
  const input = $("messageInput");
  if (input && document.activeElement === input) input.blur();
  closeGroupMentionMenu();
}

function handleAppBackgrounded() {
  suppressComposerAutoFocus(1800);
  blurComposerInput();
  clearTodoAutoRefresh();
}

function handleAppForegrounded() {
  suppressComposerAutoFocus(900);
  blurComposerInput();
  if (state.viewMode === "todos") scheduleTodoAutoRefresh();
}

function focusComposerSoon(options = {}) {
  window.requestAnimationFrame(() => {
    if (!options.force && !composerAutoFocusAllowed()) return;
    $("messageInput")?.focus({ preventScroll: true });
  });
}

function isSkillDetailView() {
  return Boolean(state.skillDetail);
}

function isTaskDetailView() {
  return !isSkillDetailView() && state.viewMode === "tasks" && Boolean(state.currentTaskGroupId) && Boolean(state.currentThread?.singleWindow);
}

function isTodoDetailView() {
  return state.viewMode === "todos" && Boolean(state.selectedTodoId);
}

function isTaskWindowView() {
  return state.viewMode === "tasks" && Boolean(state.currentThread?.singleWindow);
}

function isTaskListView() {
  return isTaskWindowView() && !state.currentTaskGroupId;
}

function isTodoView() {
  return state.viewMode === "todos";
}

function isAutomationView() {
  return state.viewMode === "automation";
}

function isAutomationDetailView() {
  return state.viewMode === "automation" && Boolean(state.selectedAutomationId);
}

function isSingleWindowView() {
  return state.viewMode === "single" && Boolean(state.currentThread?.singleWindow);
}

function isSingleWindowChatView() {
  return isSingleWindowView() && state.singleWindowMode === "chat";
}

function threadGroupMemberIds(thread = state.currentThread) {
  return Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : [];
}

function isThreadGroupChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.chatGroup?.enabled && threadGroupMemberIds(thread).length);
}

function selectedWorkspaceInThreadGroup(thread = state.currentThread) {
  return isThreadGroupChat(thread) && threadGroupMemberIds(thread).includes(state.selectedWorkspaceId);
}

function isThreadWeixinChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
}

function isWeixinChatView() {
  return isSingleWindowChatView() && state.weixinChatOpen && isThreadWeixinChat(state.currentThread);
}

function isGroupChatView() {
  return isSingleWindowChatView() && !isWeixinChatView() && state.groupChatOpen && selectedWorkspaceInThreadGroup(state.currentThread);
}

function groupChatSelectable(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && (
    selectedWorkspaceInThreadGroup(thread)
    || state.groupChatAvailable
    || state.auth?.isOwner
  ));
}

function mergeChatScopeThread(existingThread, incomingThread) {
  if (!incomingThread) return existingThread || null;
  if (!existingThread || existingThread.id !== incomingThread.id) return incomingThread;
  const existingPage = existingThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const existingMessages = new Map((existingThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of existingThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  const sortedMessages = sortedThreadMessages(messages);
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, sortedMessages)
    : null;
  return Object.assign({}, existingThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function rememberChatScopeThread(thread) {
  if (!thread?.singleWindow) return;
  if (isThreadWeixinChat(thread)) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, thread);
    state.weixinChatThreadId = state.weixinChatThread?.id || thread.id || "";
    state.weixinChatAvailable = true;
    return;
  }
  if (selectedWorkspaceInThreadGroup(thread)) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, thread);
    state.groupChatThreadId = state.groupChatThread?.id || thread.id || "";
    state.groupChatAvailable = true;
    return;
  }
  if (thread.workspaceId === state.selectedWorkspaceId) {
    state.privateChatThread = mergeChatScopeThread(state.privateChatThread, thread);
  }
}

function chatScopeThread(thread, scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "weixin") {
    if (thread?.id && thread.id === state.weixinChatThread?.id) return thread;
    return state.weixinChatThread || (isThreadWeixinChat(thread) ? thread : null);
  }
  if (normalized === "group") {
    if (thread?.id && thread.id === state.groupChatThread?.id) return thread;
    return state.groupChatThread || (selectedWorkspaceInThreadGroup(thread) ? thread : null);
  }
  if (thread?.id && thread.id === state.privateChatThread?.id) return thread;
  return state.privateChatThread || (!selectedWorkspaceInThreadGroup(thread) && !isThreadWeixinChat(thread) ? thread : null);
}

function chatScopeTaskGroupId(scope) {
  return String(scope || "").trim().toLowerCase() === "group"
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function activeChatScope() {
  if (isWeixinChatView()) return "weixin";
  return isGroupChatView() ? "group" : "chat";
}

function chatScopeReadStorageKey(scope) {
  const normalized = String(scope || "chat").trim().toLowerCase() || "chat";
  return `hermesChatScopeRead:${state.selectedWorkspaceId || "owner"}:${normalized}:${chatScopeTaskGroupId(scope)}`;
}

function chatScopeMessageTimeMs(message) {
  const parsed = Date.parse(String(messageTimelineTimestamp(message) || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestChatScopeMessageTimeMs(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  return Math.max(0, ...chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope)).map(chatScopeMessageTimeMs));
}

function chatScopeReadAt(scope) {
  const value = Number(localStorage.getItem(chatScopeReadStorageKey(scope)) || "0");
  return Number.isFinite(value) && value > 0 ? value : CHAT_SCOPE_SESSION_STARTED_AT;
}

function setChatScopeReadAt(scope, value) {
  const timestamp = Math.max(0, Number(value) || 0);
  if (timestamp) localStorage.setItem(chatScopeReadStorageKey(scope), String(timestamp));
}

function ensureChatScopeReadBaselines(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  // Missing read markers intentionally fall back to the page-load timestamp.
  // That avoids counting old group messages while preserving badges for new SSE messages.
}

function markActiveChatScopeRead(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  const scope = activeChatScope();
  const latest = latestChatScopeMessageTimeMs(thread, scope);
  if (latest) setChatScopeReadAt(scope, latest);
}

function isOwnChatScopeMessage(message) {
  if (message?.role !== "user") return false;
  const ownerWorkspaceId = messageOwnerWorkspaceId(message, "");
  return Boolean(ownerWorkspaceId && ownerWorkspaceId === state.selectedWorkspaceId);
}

function unreadChatScopeCount(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  if (!isSingleWindowChatView() || !sourceThread) return 0;
  const readAt = chatScopeReadAt(scope);
  if (!readAt) return 0;
  return chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope))
    .filter((message) => chatScopeMessageTimeMs(message) > readAt)
    .filter((message) => !isOwnChatScopeMessage(message))
    .length;
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  const labels = members.length ? members.map((item) => item.label || item.workspaceId).filter(Boolean) : threadGroupMemberIds(thread).map((workspaceId) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    return workspace?.label || workspaceId;
  }).filter(Boolean);
  return [...new Set([...labels, assistantDisplayLabel()])];
}

function groupChatMentionMembers(thread = state.currentThread, options = {}) {
  const members = Array.isArray(thread?.chatGroup?.members) && thread.chatGroup.members.length
    ? thread.chatGroup.members
    : threadGroupMemberIds(thread).map((workspaceId) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return { workspaceId, label: workspace?.label || workspaceId };
    });
  const realMembers = members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
  if (options.includeAi === false) return realMembers;
  return [virtualAssistantMember(), ...realMembers];
}

function normalizeMentionSearch(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function fallbackReasoningCompactLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptions(items) {
  const source = Array.isArray(items) && items.length
    ? items
    : TASK_REASONING_OPTIONS.filter((item) => item.value);
  const seen = new Set();
  return source
    .map((item) => {
      const value = String(item?.value || "").trim().toLowerCase();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = String(item?.label || item?.value || "").trim() || value;
      return {
        value,
        label,
        shortLabel: String(item?.shortLabel || item?.short_label || fallbackReasoningCompactLabel(value)).trim(),
      };
    })
    .filter(Boolean);
}

function configuredReasoningOptions() {
  return normalizeReasoningOptions(state.reasoningOptions);
}

function assistantDisplayLabel() {
  return String(state.assistantLabel || state.modelProvider || state.defaultModel || VIRTUAL_GROUP_AI_MEMBER.label || "AI").trim() || "AI";
}

function virtualAssistantMember() {
  const label = assistantDisplayLabel();
  return Object.assign({}, VIRTUAL_GROUP_AI_MEMBER, {
    label,
    mentionText: `@${label}`,
    description: [state.defaultModel, defaultReasoningLabel()].filter(Boolean).join(" / ") || "\u9ed8\u8ba4\u63a8\u7406",
  });
}

function composerAiMentionOptions() {
  const label = assistantDisplayLabel();
  const modelLabel = state.defaultModel || label;
  const defaultEffort = validTaskReasoningEffort(state.defaultReasoningEffort) || "medium";
  const options = [{
    workspaceId: "assistant-default",
    label,
    virtual: true,
    mentionText: `@${label}`,
    description: [modelLabel, `\u9ed8\u8ba4 ${defaultReasoningLabel()}`].filter(Boolean).join(" / "),
    reasoningEffort: "",
  }];
  for (const option of configuredReasoningOptions()) {
    if (option.value === defaultEffort) continue;
    const shortLabel = option.shortLabel || option.label || option.value;
    options.push({
      workspaceId: `assistant-${option.value}`,
      label: `${label} ${shortLabel}`,
      virtual: true,
      mentionText: `@${label} ${shortLabel}`,
      description: [modelLabel, reasoningEffortLabel(option.value)].filter(Boolean).join(" / "),
      reasoningEffort: option.value,
    });
  }
  return options;
}

function assistantMentionAliases() {
  return new Set([
    "ai",
    assistantDisplayLabel(),
    state.defaultModel,
    state.modelProvider,
    "chatgpt",
  ].map(normalizeMentionSearch).filter(Boolean));
}

function reasoningEffortFromAiAlias(value) {
  const alias = normalizeMentionSearch(value).replace(/[-_:\uFF1A]/g, "");
  if (!alias) return "";
  for (const option of configuredReasoningOptions()) {
    const aliases = [
      option.value,
      option.label,
      option.shortLabel,
    ].map((item) => normalizeMentionSearch(item).replace(/[-_:\uFF1A]/g, "")).filter(Boolean);
    if (aliases.includes(alias)) return option.value;
  }
  if (alias === "low" || alias === "\u4f4e" || alias === "\u4f4e\u63a8\u7406") return "low";
  if (alias === "medium" || alias === "med" || alias === "mid" || alias === "standard" || alias === "\u4e2d" || alias === "\u4e2d\u63a8\u7406" || alias === "\u9ed8\u8ba4" || alias === "\u6807\u51c6" || alias === "\u6a19\u6e96") return "medium";
  if (alias === "high" || alias === "\u9ad8" || alias === "\u9ad8\u63a8\u7406") return "high";
  if (alias === "xhi" || alias === "xhigh" || alias === "highest" || alias === "max" || alias === "maximum" || alias === "\u6781\u9ad8" || alias === "\u6975\u9ad8" || alias === "\u6700\u9ad8" || alias === "\u6700\u9ad8\u63a8\u7406") return "xhigh";
  return "";
}

function composerAiMentionInfo(text) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const aliases = assistantMentionAliases();
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    if (!aliases.has(normalizeMentionSearch(match[2]))) continue;
    mentionsAi = true;
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort };
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
}

function isMinimalWindowView() {
  return isTaskDetailView() || isTodoDetailView() || isSkillDetailView();
}

function activeThreadRunIds(thread = state.currentThread) {
  if (!thread) return [];
  return thread.activeRunIds || (thread.activeRunId ? [thread.activeRunId] : []);
}

function activeTaskRunIds() {
  if (!isTaskDetailView()) return [];
  const selected = taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId);
  return (selected?.messages || [])
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function activeComposerRunIds() {
  if (isTaskDetailView()) return activeTaskRunIds();
  if (isSingleWindowChatView()) return activeChatRunIds();
  if (isSingleWindowView()) return activeThreadRunIds();
  return [];
}

function composerWorkspaceLabel() {
  const workspace = currentWorkspace();
  return String(workspace?.label || workspace?.id || state.selectedWorkspaceId || "").trim();
}

function composerPermissionLabel() {
  if (state.auth?.isOwner) return "Owner";
  if (state.auth?.workspaceId) return "\u4f4e\u6743\u9650";
  return "\u672a\u767b\u5f55";
}

function composerTargetLabel() {
  if (isChatSearchMode()) return "";
  if (isWeixinChatView()) return "\u5fae\u4fe1";
  if (isGroupChatView()) return "\u7fa4\u804a";
  if (isSingleWindowChatView()) return "\u804a\u5929";
  if (isSingleWindowView()) return "\u4efb\u52a1\u6d41";
  if (state.viewMode === "tasks") return state.currentTaskGroupId ? "话题回复" : "新话题";
  return "";
}

function composerReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const explicit = selectedComposerReasoningEffort(getComposerText());
  const compact = explicit ? taskReasoningCompactLabel({ value: explicit }) : defaultReasoningCompactLabel();
  return `\u63a8\u7406 ${compact}`;
}

function messageUsesHighPermissionGateway(message = {}) {
  const securityLevel = String(message.gatewaySecurityLevel || message.gateway_security_level || "").trim();
  return Boolean(
    message.gatewayMaintenance
    || message.gateway_maintenance
    || /^owner[-_]maintenance$/i.test(securityLevel)
  );
}

function activeRunGatewayPermissionLabel() {
  const active = [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
  ));
  if (!active) return null;
  return messageUsesHighPermissionGateway(active)
    ? { label: "Gateway 权限 高", tone: "active" }
    : { label: "Gateway 权限 低" };
}

function composerGatewayPermissionLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeLabel = activeRunGatewayPermissionLabel();
  if (activeLabel) return activeLabel;
  if (ownerElevationComposerAvailable() && ownerElevationOnceTagInfo(getComposerText())) {
    return { label: "Gateway 权限 高（本次）", tone: "active" };
  }
  if (ownerElevationActive()) {
    return { label: "Gateway 权限 高（限时）", tone: "active" };
  }
  return { label: "Gateway 权限 低" };
}

function composerDirectoryLabel() {
  if (state.pendingTaskDirectory?.projectId) {
    return String(state.pendingTaskDirectory.label || state.pendingTaskDirectory.projectId || "").trim();
  }
  if (isTaskListView() && state.taskDirectoryFilter?.projectId) {
    return taskDirectoryFilterLabel(state.taskDirectoryFilter);
  }
  return "";
}

function composerStatusMessages() {
  if (isTaskDetailView()) return currentTaskGroup()?.messages || [];
  if (isTaskWindowView()) return state.currentThread?.messages || [];
  if (isSingleWindowChatView()) return chatMessagesForThread(state.currentThread);
  if (isSingleWindowView()) return state.currentThread?.messages || [];
  return [];
}

function composerRunCounts() {
  const counts = { queued: 0, running: 0 };
  composerStatusMessages().forEach((message) => {
    if (message?.status === "running") counts.running += 1;
    if (message?.status === "queued") counts.queued += 1;
  });
  const activeFallback = activeComposerRunIds().length;
  if (!counts.running && activeFallback) counts.running = activeFallback;
  return counts;
}

function nativeKeyboardGeometry() {
  const keyboard = navigator.virtualKeyboard;
  const rect = keyboard?.boundingRect;
  if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
  const top = Number.isFinite(rect.y) ? rect.y : rect.top;
  if (!Number.isFinite(top) || top <= 0) return null;
  return { top, height: rect.height };
}

function visualViewportKeyboardMetrics() {
  const viewport = window.visualViewport;
  if (!viewport) return null;
  const layoutHeight = Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0,
    0,
  );
  const height = Math.round(viewport.height || 0);
  if (!layoutHeight || !height) return null;
  const offsetTop = Math.max(0, Math.round(viewport.offsetTop || 0));
  const bottomInset = Math.max(0, Math.round(layoutHeight - height - offsetTop));
  const keyboardLikely = bottomInset > 80 || height < layoutHeight * 0.82;
  return { height, offsetTop, bottomInset, keyboardLikely };
}

function updateKeyboardViewportMetrics() {
  const root = document.documentElement;
  const metrics = visualViewportKeyboardMetrics();
  const active = Boolean(state.composerFocused && isMobileLayout() && metrics?.keyboardLikely);
  state.keyboardViewportActive = active;
  root.classList.toggle("keyboard-viewport-active", active);
  if (active) {
    root.style.setProperty("--app-viewport-height", `${Math.max(240, metrics.height)}px`);
    root.style.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
    root.style.setProperty("--keyboard-bottom-inset", `${metrics.bottomInset}px`);
    if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  } else {
    root.style.removeProperty("--app-viewport-height");
    root.style.removeProperty("--app-viewport-offset-top");
    root.style.removeProperty("--keyboard-bottom-inset");
  }
  return active;
}

function updateMobileBottomNavReservation() {
  const root = document.documentElement;
  const nav = $("bottomNav");
  if (!nav || !isMobileLayout()) {
    root.style.removeProperty("--mobile-bottom-nav-reserved-height-runtime");
    return;
  }
  const rectHeight = Math.ceil(nav.getBoundingClientRect?.().height || 0);
  const contentHeight = Math.ceil(nav.scrollHeight || 0);
  const compact = isMobileLandscapeCompactLayout();
  const reserve = compact
    ? Math.max(62, rectHeight + 8, contentHeight + 8)
    : Math.max(96, rectHeight + 12, contentHeight + 12);
  root.style.setProperty("--mobile-bottom-nav-reserved-height-runtime", `${reserve}px`);
}

function refreshKeyboardViewportSoon(delay = 0) {
  window.setTimeout(() => {
    const active = updateKeyboardViewportMetrics();
    if (active) scheduleConversationBottomStick();
  }, Math.max(0, delay));
}

function refreshKeyboardViewportDuringFocus() {
  [0, 80, 180, 360, 700, 1100].forEach(refreshKeyboardViewportSoon);
}

function updateKeyboardContextMetrics() {
  const geometry = nativeKeyboardGeometry();
  const top = geometry ? Math.max(8, Math.round(geometry.top - 44)) : 0;
  state.keyboardContextTopPx = top;
  state.keyboardContextMode = Boolean(state.composerFocused && isMobileLayout() && geometry);
  document.documentElement.style.setProperty("--keyboard-context-top", `${top}px`);
  $("composer")?.classList.toggle("keyboard-context-mode", state.keyboardContextMode);
}

function refreshComposerContextSoon(delay = 0) {
  window.setTimeout(() => {
    updateKeyboardContextMetrics();
    renderComposerContext();
  }, Math.max(0, delay));
}

function composerContextItems(counts = composerRunCounts()) {
  if (isChatSearchMode()) return [];
  const items = [];
  const workspaceLabel = composerWorkspaceLabel();
  if (workspaceLabel) {
    items.push({ label: `${workspaceLabel} \u00b7 ${composerPermissionLabel()}`, tone: "primary" });
  }
  const targetLabel = composerTargetLabel();
  if (targetLabel) items.push({ label: targetLabel });
  const gatewayPermissionLabel = composerGatewayPermissionLabel();
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
  const reasoningLabel = composerReasoningLabel();
  if (reasoningLabel) items.push({ label: reasoningLabel });
  const directoryLabel = composerDirectoryLabel();
  if (directoryLabel) items.push({ label: `\u76ee\u5f55 ${directoryLabel}`, tone: "directory" });
  if (state.pendingArtifacts.length) {
    items.push({ label: `\u9644\u4ef6 ${state.pendingArtifacts.length}`, tone: "active" });
  }
  if (state.quotedReply) items.push({ label: "\u5f15\u7528\u56de\u590d", tone: "active" });
  if (counts.running) items.push({ label: `\u8fd0\u884c\u4e2d ${counts.running}`, tone: "active" });
  if (counts.queued) items.push({ label: `\u6392\u961f ${counts.queued}`, tone: "active" });
  return items.slice(0, 8);
}

function shouldShowComposerContext(items, counts) {
  if (!items.length || isChatSearchMode()) return false;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return false;
  return Boolean(
    state.composerFocused
    || composerHasDraft()
    || state.pendingArtifacts.length
    || state.quotedReply
    || state.pendingTaskDirectory?.projectId
    || (isTaskListView() && state.taskDirectoryFilter?.projectId)
    || counts.running
    || counts.queued
  );
}

function renderComposerContext() {
  const bar = $("composerContext");
  const composer = $("composer");
  if (!bar || !composer) return;
  updateKeyboardContextMetrics();
  const counts = composerRunCounts();
  const items = composerContextItems(counts);
  const visible = shouldShowComposerContext(items, counts);
  composer.classList.toggle("context-visible", visible);
  composer.classList.toggle("keyboard-context-mode", visible && state.keyboardContextMode);
  if (!visible) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = items.map((item) => {
    const tone = item.tone ? ` ${item.tone}` : "";
    return `<span class="composer-context-chip${tone}" title="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span></span>`;
  }).join("");
}

function normalizeRunEvent(event = {}, fallbackRunId = "") {
  return {
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: String(event.runId || event.run_id || fallbackRunId || ""),
    tool: event.tool || null,
    preview: String(event.preview || event.text || event.error || ""),
    duration: event.duration || null,
    error: Boolean(event.error),
  };
}

function runEventKey(event) {
  return [
    event.runId || "",
    event.timestamp || "",
    event.event || "",
    event.tool || "",
    event.preview || "",
  ].join("|");
}

function appendRunEventToCurrentThread(payload) {
  if (!state.currentThread || payload.threadId !== state.currentThread.id) return;
  const event = normalizeRunEvent(payload.event || {}, payload.runId || "");
  state.currentThread.events = Array.isArray(state.currentThread.events) ? state.currentThread.events : [];
  const key = runEventKey(event);
  if (!state.currentThread.events.some((item) => runEventKey(normalizeRunEvent(item)) === key)) {
    state.currentThread.events.push(event);
    state.currentThread.events = state.currentThread.events.slice(-80);
  }
  if (payload.thread) {
    state.currentThread.status = payload.thread.status || state.currentThread.status;
    state.currentThread.activeRunId = payload.thread.activeRunId;
    state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
    state.currentThread.updatedAt = payload.thread.updatedAt || state.currentThread.updatedAt;
  }
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function runEventTimeLabel(event) {
  const raw = Number(event?.timestamp || 0);
  const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function runEventTitle(event) {
  const name = String(event?.event || "event");
  const tool = String(event?.tool || "").trim();
  if (name === "response.output_item.added") return tool ? `开始 ${tool}` : "开始处理";
  if (name === "response.output_item.done") return tool ? `完成 ${tool}` : "阶段完成";
  if (name === "response.output_text.done") return "生成回复";
  if (name === "response.completed" || name === "run.completed") return "处理完成";
  if (name === "response.failed" || name === "run.failed") return "处理失败";
  return tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "");
}

function runProgressEvents(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  if (!thread || !runSet.size) return [];
  return (Array.isArray(thread.events) ? thread.events : [])
    .map((event) => normalizeRunEvent(event))
    .filter((event) => !event.runId || runSet.has(String(event.runId)))
    .slice(-4);
}

function renderRunProgressPanel(thread, runIds) {
  return "";
  const ids = (runIds || []).filter(Boolean);
  if (!ids.length) return "";
  const events = runProgressEvents(thread, ids);
  const rows = events.length
    ? events.slice().reverse().map((event) => `
      <div class="run-progress-row${event.error ? " error" : ""}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventTimeLabel(event))}</span>
        ${event.preview ? `<span class="run-progress-preview">${escapeHtml(event.preview)}</span>` : ""}
      </div>`).join("")
    : `<div class="run-progress-row"><span class="run-progress-dot" aria-hidden="true"></span><span class="run-progress-main">等待模型反馈</span></div>`;
  return `<aside class="run-progress-panel" aria-live="polite">
    <div class="run-progress-head">
      <span>运行中</span>
      <span>${escapeHtml(ids.length > 1 ? `${ids.length} runs` : shortTaskDisplayId(ids[0]))}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function composerHasDraft() {
  if (isChatSearchMode()) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

function isComposerStopMode() {
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
  return true;
}

function updateComposerAction() {
  const button = $("sendMessage");
  if (!button) return;
  const composer = $("composer");
  const attach = $("attachFile");
  const input = $("messageInput");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  composer?.classList.toggle("chat-search-composer", searchMode);
  input?.classList.toggle("chat-search-editor", searchMode);
  if (searchMode || !composerMentionAvailable()) closeGroupMentionMenu();
  if (input) {
    input.setAttribute("enterkeyhint", searchMode ? "search" : "send");
    input.setAttribute("aria-label", searchMode ? "Search chat" : "Message Hermes");
  }
  if (searchMode) {
    if (attach) {
      attach.textContent = "×";
      attach.disabled = false;
      attach.setAttribute("aria-label", "关闭搜索");
      attach.setAttribute("title", "关闭搜索");
    }
    const draft = currentChatSearchDraft();
    button.textContent = "搜索";
    button.classList.remove("stop-mode");
    button.disabled = !draft;
    updateChatSearchStatus();
    renderComposerContext();
    return;
  }
  if (prevSearch) {
    prevSearch.hidden = true;
    prevSearch.disabled = true;
  }
  if (nextSearch) {
    nextSearch.hidden = true;
    nextSearch.disabled = true;
  }
  if (attach) {
    attach.textContent = "+";
    attach.setAttribute("aria-label", "添加文件");
    attach.setAttribute("title", "添加文件");
  }
  updateChatSearchStatus();
  const stopMode = isComposerStopMode();
  button.textContent = stopMode ? "Stop" : "Send";
  button.classList.toggle("stop-mode", stopMode);
  if (stopMode) button.disabled = false;
  renderComposerContext();
}

function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "task" ? "task" : "chat";
}

function setSingleWindowMode(mode) {
  state.singleWindowMode = normalizeSingleWindowMode(mode);
  localStorage.setItem("hermesWebSingleWindowMode", state.singleWindowMode);
  if (state.singleWindowMode === "chat") clearQuotedReply({ render: false });
}

function reasoningEffortLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((item) => item.value === effort)?.label
    || TASK_REASONING_OPTIONS.find((item) => item.value === effort)?.label
    || (effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : "Medium");
}

function defaultReasoningLabel() {
  return reasoningEffortLabel(state.defaultReasoningEffort || "medium");
}

function defaultReasoningCompactLabel() {
  return fallbackReasoningCompactLabel(state.defaultReasoningEffort || "medium");
}

function taskReasoningCompactLabel(item) {
  if (!item?.value) return defaultReasoningCompactLabel();
  const effort = String(item.value || "").trim().toLowerCase();
  return configuredReasoningOptions().find((option) => option.value === effort)?.shortLabel
    || fallbackReasoningCompactLabel(effort)
    || item.label
    || item.value;
}

function validTaskReasoningEffort(value) {
  const next = String(value || "").trim().toLowerCase();
  return configuredReasoningOptions().some((item) => item.value === next) ? next : "";
}

function currentTaskGroup() {
  if (!state.currentThread || !state.currentTaskGroupId) return null;
  return taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId) || null;
}

function taskReasoningEffort(group) {
  const messages = Array.isArray(group?.messages) ? group.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const effort = validTaskReasoningEffort(messages[index]?.reasoningEffort || messages[index]?.reasoning_effort || "");
    if (effort) return effort;
  }
  return "";
}

function taskReasoningControlValue() {
  if (state.pendingTaskReasoningExplicit) return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort)
    || (isTaskDetailView() ? taskReasoningEffort(currentTaskGroup()) : "")
    || "";
}

function selectedTaskReasoningEffort() {
  return validTaskReasoningEffort(state.pendingTaskReasoningEffort);
}

function selectedComposerReasoningEffort(text = getComposerText()) {
  const mentionEffort = composerAiMentionInfo(text).reasoningEffort;
  if (mentionEffort) return mentionEffort;
  return state.viewMode === "tasks" ? selectedTaskReasoningEffort() : "";
}

function updateTaskReasoningControl() {
  renderComposerContext();
}

function ensureVerticalScrollAffordance(container = $("conversation")) {
  if (!container) return;
  [...container.children]
    .filter((item) => item.classList?.contains("scroll-affordance-spacer"))
    .forEach((item) => item.remove());
  const spacer = document.createElement("div");
  spacer.className = "scroll-affordance-spacer";
  spacer.setAttribute("aria-hidden", "true");
  container.appendChild(spacer);
  requestAnimationFrame(() => {
    const deficit = container.clientHeight - container.scrollHeight;
    spacer.style.height = `${Math.max(1, deficit + 18)}px`;
  });
}

function currentScrollFeedbackSurface(container = $("conversation")) {
  if (!isTaskListView()) return null;
  return container?.querySelector?.(".task-grid") || container?.querySelector?.(".empty-state") || null;
}

function clearScrollFeedbackSurface(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging", "scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
}

function applyScrollFeedback(surface, dy) {
  if (!surface) return 0;
  const sign = dy < 0 ? -1 : 1;
  const offset = sign * Math.min(48, Math.abs(dy) * 0.34);
  surface.classList.add("scroll-feedback-dragging");
  surface.style.transform = `translate3d(0, ${offset}px, 0)`;
  surface.style.opacity = String(1 - Math.min(0.16, Math.abs(offset) / 420));
  return offset;
}

function settleScrollFeedback(surface) {
  if (!surface) return;
  surface.classList.remove("scroll-feedback-dragging");
  surface.classList.add("scroll-feedback-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => clearScrollFeedbackSurface(surface), prefersReducedMotion() ? 0 : 180);
}

function wireConversationScrollFeedback() {
  const container = $("conversation");
  if (!container || container.dataset.scrollFeedbackBound) return;
  container.dataset.scrollFeedbackBound = "1";
  container.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const surface = currentScrollFeedbackSurface(container);
    if (!surface) return;
    state.scrollFeedback = {
      surface,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      dragging: false,
    };
  }, { passive: true });
  container.addEventListener("touchmove", (event) => {
    const feedback = state.scrollFeedback;
    if (!feedback || !isMobileLayout() || event.touches.length !== 1 || !isTaskListView()) return;
    const dx = event.touches[0].clientX - feedback.startX;
    const dy = event.touches[0].clientY - feedback.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (!feedback.dragging) {
      if (vertical < 10 || vertical < horizontal * 1.2) return;
      feedback.dragging = true;
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const contentShort = (feedback.surface?.offsetHeight || 0) < container.clientHeight - 24;
    const atTopPull = container.scrollTop <= 0 && dy > 0;
    const atBottomPush = container.scrollTop >= maxScroll - 1 && dy < 0;
    const shortList = maxScroll <= 1 || contentShort;
    if (!shortList && !atTopPull && !atBottomPush) return;
    applyScrollFeedback(feedback.surface, dy);
    event.preventDefault();
  }, { passive: false });
  const endFeedback = () => {
    const feedback = state.scrollFeedback;
    state.scrollFeedback = null;
    if (feedback?.dragging) settleScrollFeedback(feedback.surface);
  };
  container.addEventListener("touchend", endFeedback, { passive: true });
  container.addEventListener("touchcancel", endFeedback, { passive: true });
}

function updateNavigationControls() {
  const app = $("app");
  const menuButton = $("openMenu");
  const edgeSwipeZone = $("edgeSwipeZone");
  const taskToolbar = $("taskDetailToolbar");
  const taskDetail = isTaskDetailView();
  const todoDetail = isTodoDetailView();
  const todoCreate = kanbanComposerOpen();
  const automationDetail = isAutomationDetailView();
  const skillDetail = isSkillDetailView();
  const taskList = isTaskListView();
  const directoryBack = state.viewMode === "projects" && Boolean(directoryActivePath());
  const mainBack = taskDetail || todoDetail || todoCreate || automationDetail || skillDetail || directoryBack;
  const minimalWindow = isMinimalWindowView();
  const centeredTopTitle = (
    (state.viewMode === "single" && state.singleWindowMode === "chat")
    || (state.viewMode === "tasks" && !state.currentTaskGroupId)
    || (state.viewMode === "projects")
    || (state.viewMode === "todos" && !todoDetail)
    || (state.viewMode === "automation" && !automationDetail)
    || state.viewMode === "learning"
  );
  app?.classList.toggle("minimal-window-mode", minimalWindow);
  app?.classList.toggle("task-detail-mode", taskDetail);
  app?.classList.toggle("todo-detail-mode", todoDetail);
  app?.classList.toggle("todo-create-mode", todoCreate);
  app?.classList.toggle("automation-detail-mode", automationDetail);
  app?.classList.toggle("skill-detail-mode", skillDetail);
  app?.classList.toggle("task-list-mode", taskList);
  app?.classList.toggle("centered-top-title-mode", centeredTopTitle);
  app?.classList.toggle("main-back-visible", mainBack);
  app?.classList.toggle("reading-fullscreen-mode", state.readingFullscreen);
  if (taskToolbar) {
    taskToolbar.hidden = !taskDetail;
    if (!taskDetail) taskToolbar.innerHTML = "";
  }
  if (menuButton) {
    menuButton.classList.toggle("back-mode", mainBack);
    menuButton.setAttribute("aria-label", mainBack ? "Back" : "Open menu");
    menuButton.innerHTML = `<span class="top-nav-button-glyph" aria-hidden="true">${mainBack ? "&#10094;" : "&#9776;"}</span>`;
  }
  edgeSwipeZone?.classList.toggle("disabled", !isMobileLayout());
  updateComposerAction();
  updateTopMoreControls();
}

function updateTopMoreControls() {
  const wrap = $("topMoreWrap");
  const interrupt = $("interruptRun");
  if (!wrap || !interrupt) return;
  const directory = state.viewMode === "projects";
  const taskDetail = isTaskDetailView();
  const chatView = isSingleWindowView() && state.singleWindowMode === "chat";
  const taskStream = isSingleWindowView() && state.singleWindowMode === "task";
  const todoDetail = isTodoDetailView();
  const todoCreate = kanbanComposerOpen();
  const todoList = state.viewMode === "todos" && !todoDetail && !todoCreate;
  const automationDetail = isAutomationDetailView();
  const automationList = state.viewMode === "automation" && !automationDetail;
  const showTopMenu = chatView || isTaskListView() || taskDetail || taskStream || directory || todoDetail || todoList || automationList || automationDetail;
  wrap.classList.toggle("hidden", !showTopMenu);
  interrupt.classList.toggle("hidden", showTopMenu || chatView);
  if (!showTopMenu) {
    closeTopMoreMenu();
    return;
  }
  const toggleTaskView = $("topToggleTaskView");
  if (toggleTaskView) {
    toggleTaskView.hidden = !(isTaskListView() || taskStream);
    toggleTaskView.textContent = taskStream ? "话题列表" : "话题流";
  }
  const toggleSingleMode = $("topToggleSingleMode");
  if (toggleSingleMode) {
    toggleSingleMode.hidden = true;
  }
  const clearDirectoryFilter = $("topClearDirectoryFilter");
  if (clearDirectoryFilter) clearDirectoryFilter.hidden = !(isTaskListView() || taskStream) || !state.taskDirectoryFilter;
  const manageAccessKeys = $("topManageAccessKeys");
  if (manageAccessKeys) {
    manageAccessKeys.hidden = true;
    manageAccessKeys.disabled = true;
  }
  updatePwaInstallControls();
  const newDirectoryFolder = $("topNewDirectoryFolder");
  if (newDirectoryFolder) {
    newDirectoryFolder.hidden = !directory;
    newDirectoryFolder.disabled = !directory || !directoryCreateBasePath();
  }
  const manageSharedDirectories = $("topManageSharedDirectories");
  if (manageSharedDirectories) {
    const directoryRoot = directory && !directoryActivePath();
    manageSharedDirectories.hidden = !directoryRoot;
    manageSharedDirectories.disabled = !directoryRoot;
  }
  const newTodo = $("topNewTodo");
  if (newTodo) {
    newTodo.hidden = !todoList;
    newTodo.disabled = !todoList;
    newTodo.textContent = "\u65b0\u589e\u4efb\u52a1";
  }
  const newAutomation = $("topNewAutomation");
  if (newAutomation) {
    newAutomation.hidden = !automationList;
    newAutomation.disabled = !automationList;
  }
  const selectedAutomation = currentAutomation();
  const editAutomation = $("topEditAutomation");
  if (editAutomation) {
    editAutomation.hidden = !automationDetail;
    editAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const toggleAutomationPause = $("topToggleAutomationPause");
  if (toggleAutomationPause) {
    toggleAutomationPause.hidden = !automationDetail;
    toggleAutomationPause.disabled = !automationDetail || !selectedAutomation;
    toggleAutomationPause.textContent = selectedAutomation && automationStatusLabel(selectedAutomation) === "paused" ? "\u6062\u590d" : "\u6682\u505c";
  }
  const deleteAutomation = $("topDeleteAutomation");
  if (deleteAutomation) {
    deleteAutomation.hidden = !automationDetail;
    deleteAutomation.disabled = !automationDetail || !selectedAutomation;
  }
  const deleteTodo = $("topDeleteTodo");
  if (deleteTodo) {
    const selectedTodo = kanbanCardById(state.selectedTodoId);
    const storyCard = Boolean(selectedTodo && kanbanCardHasExplicitStoryCase(selectedTodo));
    deleteTodo.hidden = !todoDetail || storyCard || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
    deleteTodo.disabled = !todoDetail || storyCard || !state.selectedTodoId || Boolean(selectedTodo && !kanbanCan(selectedTodo, "canDelete"));
  }
  const renameTask = $("topRenameTask");
  if (renameTask) {
    renameTask.hidden = !taskDetail;
    renameTask.disabled = !taskDetail || !state.currentTaskGroupId;
  }
  const toggleGroupChat = $("topToggleGroupChat");
  if (toggleGroupChat) {
    toggleGroupChat.hidden = true;
    toggleGroupChat.disabled = true;
  }
  const toggleWeixinChat = $("topToggleWeixinChat");
  if (toggleWeixinChat) {
    const canToggleWeixin = Boolean(chatView);
    toggleWeixinChat.hidden = !canToggleWeixin;
    toggleWeixinChat.disabled = !canToggleWeixin;
    toggleWeixinChat.textContent = isWeixinChatView() ? "\u666e\u901a\u804a\u5929" : "\u5fae\u4fe1";
  }
  const manageGroupMembers = $("topManageGroupMembers");
  if (manageGroupMembers) {
    const canManageGroupMembers = Boolean(state.auth?.isOwner && chatView && !isWeixinChatView() && state.currentThread && groupChatSelectable(state.currentThread));
    manageGroupMembers.hidden = !canManageGroupMembers;
    manageGroupMembers.disabled = !canManageGroupMembers || !state.currentThread;
  }
  const searchChat = $("topSearchChat");
  if (searchChat) {
    searchChat.hidden = !chatView;
    searchChat.disabled = !chatView || !state.currentThread;
  }
  const readingFullscreen = $("topToggleReadingFullscreen");
  if (readingFullscreen) {
    readingFullscreen.hidden = false;
    readingFullscreen.disabled = false;
    readingFullscreen.textContent = state.readingFullscreen ? "\u9000\u51fa\u5168\u5c4f" : "\u5168\u5c4f\u9605\u8bfb";
  }
  const menu = $("topMoreMenu");
  const hasVisibleAction = Boolean(menu && [...menu.querySelectorAll(".top-more-action")].some((button) => !button.hidden));
  wrap.classList.toggle("hidden", !hasVisibleAction);
  if (!hasVisibleAction) closeTopMoreMenu();
}

function closeTopMoreMenu() {
  const menu = $("topMoreMenu");
  const button = $("topMoreButton");
  if (menu) menu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}

function setReadingFullscreen(enabled) {
  state.readingFullscreen = Boolean(enabled);
  if (state.readingFullscreen) {
    closeTopMoreMenu();
    closeSidebar();
    blurComposerInput();
  }
  updateNavigationControls();
  applyViewMode();
  updateMobileBottomNavReservation();
  if (state.viewMode === "single" || state.viewMode === "tasks") scheduleConversationBottomStick();
}

function chatSearchAvailable() {
  return isSingleWindowChatView() && Boolean(state.currentThread);
}

function isChatSearchMode() {
  return state.chatSearchOpen && chatSearchAvailable();
}

function currentChatSearchQuery() {
  return String(state.chatSearchQuery || "").trim();
}

function currentChatSearchDraft() {
  return String(isChatSearchMode() ? getComposerText() : state.chatSearchDraft || "").trim();
}

function chatSearchContentForMessage(message) {
  const directoryAliases = extractDirectoryAliases(message?.content || "");
  const text = cleanDisplayText(directoryAliases.text || message?.content || "");
  const artifacts = Array.isArray(message?.artifacts)
    ? message.artifacts.map((artifact) => [artifact.name, artifact.path, artifact.mime].filter(Boolean).join(" ")).join("\n")
    : "";
  return [
    message?.role === "user" ? "You" : "Hermes",
    text,
    message?.error || "",
    artifacts,
  ].filter(Boolean).join("\n").toLowerCase();
}

function syncChatSearchMatches() {
  if (!chatSearchAvailable()) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const query = currentChatSearchQuery().toLowerCase();
  if (!query) {
    state.chatSearchMatches = [];
    state.chatSearchIndex = 0;
    state.chatSearchTotalMatches = 0;
    return [];
  }
  const matches = chatMessagesForThread(state.currentThread)
    .filter((message) => message?.id && chatSearchContentForMessage(message).includes(query))
    .map((message) => message.id);
  state.chatSearchMatches = matches;
  state.chatSearchTotalMatches = Math.max(state.chatSearchTotalMatches || 0, matches.length);
  if (!matches.length) {
    state.chatSearchIndex = 0;
  } else if (state.chatSearchIndex < 0 || state.chatSearchIndex >= matches.length) {
    state.chatSearchIndex = 0;
  }
  return matches;
}

function chatSearchClassForMessage(message) {
  if (!chatSearchAvailable() || !currentChatSearchQuery() || !message?.id) return "";
  const matchIndex = state.chatSearchMatches.indexOf(message.id);
  if (matchIndex < 0) return "";
  return matchIndex === state.chatSearchIndex ? " chat-search-match chat-search-current-match" : " chat-search-match";
}

function openChatSearch() {
  closeTopMoreMenu();
  if (!chatSearchAvailable()) return;
  if (!state.chatSearchOpen) {
    state.chatSearchComposerDraft = getComposerText();
    state.chatSearchDraft = state.chatSearchQuery || "";
  }
  state.chatSearchOpen = true;
  state.chatSearchRefocus = true;
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchScrollPending = false;
  renderCurrentThread({ stickToBottom: false });
  setComposerText(state.chatSearchDraft || "");
  focusChatSearchInput({ force: true });
  requestAnimationFrame(() => requestAnimationFrame(() => focusChatSearchInput({ force: true })));
}

function closeChatSearch(options = {}) {
  const restoreDraft = state.chatSearchComposerDraft || "";
  state.chatSearchOpen = false;
  state.chatSearchDraft = "";
  state.chatSearchComposerDraft = "";
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchQuery = "";
  state.chatSearchMatches = [];
  state.chatSearchIndex = 0;
  state.chatSearchLoading = false;
  state.chatSearchTotalMatches = 0;
  state.chatSearchScrollPending = false;
  state.chatSearchRefocus = false;
  if (options.render !== false) {
    renderCurrentThread({ stickToBottom: options.stickToBottom !== false });
    setComposerText(restoreDraft);
  }
}

function updateChatSearchDraft(value) {
  state.chatSearchDraft = String(value || "");
  state.chatSearchDraftChangedSinceSearch = state.chatSearchDraft.trim() !== currentChatSearchQuery();
  updateComposerAction();
}

function performChatSearch() {
  performChatSearchAsync().catch(showError);
}

async function performChatSearchAsync() {
  if (!isChatSearchMode()) return;
  const draft = currentChatSearchDraft();
  state.chatSearchDraft = draft;
  const sameCommittedQuery = draft && draft === currentChatSearchQuery() && state.chatSearchMatches.length && !state.chatSearchDraftChangedSinceSearch;
  if (sameCommittedQuery) {
    moveChatSearch(1);
    return;
  }
  state.chatSearchQuery = draft;
  state.chatSearchIndex = 0;
  state.chatSearchDraftChangedSinceSearch = false;
  state.chatSearchLoading = Boolean(draft);
  if (state.chatSearchLoading) renderCurrentThread({ stickToBottom: false });
  try {
    if (draft && state.currentThreadId) {
      const params = chatMessagePageParams({ search: draft, limit: CHAT_MESSAGE_SEARCH_LIMIT });
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
      mergeCurrentThreadMessages(result.messages || [], null);
      state.chatSearchTotalMatches = Number(result.page?.totalMatches || 0) || 0;
    } else {
      state.chatSearchTotalMatches = 0;
    }
  } finally {
    state.chatSearchLoading = false;
  }
  syncChatSearchMatches();
  state.chatSearchRefocus = true;
  state.chatSearchScrollPending = Boolean(draft && state.chatSearchMatches.length);
  renderCurrentThread({ stickToBottom: false });
}

function moveChatSearch(delta) {
  if (isChatSearchMode() && state.chatSearchDraftChangedSinceSearch) {
    focusChatSearchInput();
    return;
  }
  syncChatSearchMatches();
  const total = state.chatSearchMatches.length;
  if (!total) {
    focusChatSearchInput();
    return;
  }
  state.chatSearchIndex = (state.chatSearchIndex + delta + total) % total;
  state.chatSearchScrollPending = true;
  state.chatSearchRefocus = true;
  renderCurrentThread({ stickToBottom: false });
}

function focusChatSearchInput(options = {}) {
  const input = $("messageInput");
  if (!input) return;
  if (!options.force && !composerAutoFocusAllowed()) return;
  input.focus({ preventScroll: true });
  const len = input.textContent.length;
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (_) {
    void len;
  }
}

function scrollToCurrentChatSearchMatch(conversation = $("conversation")) {
  if (!conversation || !state.chatSearchMatches.length) return;
  const currentId = state.chatSearchMatches[state.chatSearchIndex];
  const target = [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === currentId);
  if (!target) return;
  target.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function updateChatSearchStatus() {
  const status = $("chatSearchStatus");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const setNav = (visible, enabled) => {
    [prevSearch, nextSearch].forEach((button) => {
      if (!button) return;
      button.hidden = !visible;
      button.disabled = !enabled;
    });
  };
  if (!isChatSearchMode() || !currentChatSearchQuery()) {
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    setNav(false, false);
    return;
  }
  const changed = state.chatSearchDraftChangedSinceSearch;
  const total = state.chatSearchMatches.length;
  if (status) {
    status.hidden = changed;
    if (state.chatSearchLoading) {
      status.textContent = "searching";
    } else if (total && !changed) {
      const fullTotal = Math.max(total, Number(state.chatSearchTotalMatches || 0) || 0);
      status.textContent = fullTotal > total ? `${state.chatSearchIndex + 1}/${total}+` : `${state.chatSearchIndex + 1}/${total}`;
    } else {
      status.textContent = "0/0";
    }
  }
  setNav(!changed && total > 1, !changed && total > 1);
}

function wireChatSearchControls(root) {
  if (!root) return;
  if (state.chatSearchRefocus) {
    state.chatSearchRefocus = false;
    requestAnimationFrame(focusChatSearchInput);
  }
}

function clearSidebarDragStyles() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  sidebar?.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  if (sidebar) sidebar.style.transform = "";
  if (overlay) {
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
  }
}

function sidebarDragWidth(sidebar = $("sidebar")) {
  return Math.max(240, sidebar?.getBoundingClientRect?.().width || 300);
}

function applySidebarDragProgress(progress) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  const clamped = clamp01(progress);
  const x = (clamped - 1) * sidebarDragWidth(sidebar);
  sidebar.classList.add("dragging");
  overlay?.classList.add("dragging");
  sidebar.style.transform = `translate3d(${x}px, 0, 0)`;
  if (overlay) {
    overlay.style.opacity = String(clamped);
    overlay.style.pointerEvents = clamped > 0.02 ? "auto" : "none";
  }
}

function settleSidebarDrag(open) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  sidebar.classList.remove("dragging");
  overlay?.classList.remove("dragging");
  sidebar.getBoundingClientRect();
  sidebar.classList.toggle("open", open);
  overlay?.classList.toggle("open", open);
  requestAnimationFrame(() => {
    sidebar.style.transform = "";
    if (overlay) {
      overlay.style.opacity = "";
      overlay.style.pointerEvents = "";
    }
  });
  if (open) {
    resetSidebarScroll();
  } else {
    restoreTransientProjectRoute();
  }
}

function openSidebar(options = {}) {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (!sidebar) return;
  clearSidebarDragStyles();
  sidebar.classList.add("open");
  overlay?.classList.add("open");
  if (options.resetScroll !== false) resetSidebarScroll();
}

function closeSidebar() {
  clearSidebarDragStyles();
  $("sidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("open");
  restoreTransientProjectRoute();
}

function backSwipeTarget() {
  if (isSkillDetailView()) return "skill";
  if (isTaskDetailView()) return "task";
  if (isTodoDetailView()) return "todo";
  if (isAutomationDetailView()) return "automation";
  if (state.viewMode === "projects" && directoryActivePath()) return "directory";
  return "";
}

function backSwipeSurface(target) {
  if (target === "directory") return document.querySelector(".directory-shell");
  return document.querySelector(".main");
}

function clearBackSwipeSurface(surface) {
  if (!surface) return;
  surface.classList.remove("page-back-dragging", "page-back-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
}

function applyBackSwipeDrag(swipe, dx) {
  const surface = swipe?.surface;
  if (!surface) return;
  const acceptDistance = Math.max(150, Math.min(window.innerWidth * 0.46, 190));
  const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
  swipe.offset = visualOffset;
  swipe.progress = clamp01(dx / acceptDistance);
  surface.classList.add("page-back-dragging");
  surface.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
  surface.style.opacity = "";
}

function performBackSwipeAction(target) {
  if (target === "skill") closeSkillDetail();
  else if (target === "task") openTaskList();
  else if (target === "todo") openTodoList();
  else if (target === "automation") openAutomationList();
}

async function handleInAppBackNavigation(options = {}) {
  if ($("sidebar")?.classList.contains("open")) {
    closeSidebar();
    return true;
  }
  const target = backSwipeTarget();
  if (!target) return false;
  if (target === "directory") {
    await navigateDirectoryUp({ animateEntry: Boolean(options.animateEntry) });
  } else {
    performBackSwipeAction(target);
  }
  return true;
}

function pushBackNavigationGuard() {
  try {
    window.history.pushState({ hermesWebBackGuard: true }, "", window.location.href);
    state.backNavigationGuardArmed = true;
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
}

function wireBackNavigationGuard() {
  if (state.backNavigationGuardBound) return;
  state.backNavigationGuardBound = true;
  try {
    const currentState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(currentState, "", window.location.href);
    pushBackNavigationGuard();
  } catch (_) {
    state.backNavigationGuardArmed = false;
  }
  window.addEventListener("popstate", () => {
    if (state.handlingBackNavigation) return;
    state.handlingBackNavigation = true;
    handleInAppBackNavigation({ animateEntry: true })
      .then((handled) => {
        if (handled) {
          pushBackNavigationGuard();
        } else {
          pushBackNavigationGuard();
        }
      })
      .catch((err) => {
        pushBackNavigationGuard();
        showError(err);
      })
      .finally(() => {
        state.handlingBackNavigation = false;
      });
  });
}

function settleBackSwipe(swipe, accepted) {
  const surface = swipe?.surface;
  const target = swipe?.target || "";
  if (!surface) return;
  surface.classList.remove("page-back-dragging");
  if (accepted) {
    surface.classList.add("page-back-settling");
    surface.style.transform = "";
    surface.style.opacity = "";
    requestAnimationFrame(() => {
      performBackSwipeAction(target);
      requestAnimationFrame(() => clearBackSwipeSurface(surface));
    });
    return;
  }
  surface.classList.add("page-back-settling");
  surface.style.transform = "";
  surface.style.opacity = "";
  window.setTimeout(() => {
    clearBackSwipeSurface(surface);
  }, prefersReducedMotion() ? 0 : 220);
}

function captureTransientTaskRoute() {
  if (!isTaskDetailView()) return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreTransientProjectRoute() {
  const route = state.transientProjectRoute;
  if (!route) return false;
  state.transientProjectRoute = null;
  state.viewMode = route.viewMode;
  state.selectedProjectId = route.selectedProjectId;
  state.selectedSubprojectId = route.selectedSubprojectId;
  state.currentThread = route.currentThread;
  state.currentThreadId = route.currentThreadId;
  state.currentTaskGroupId = route.currentTaskGroupId;
  state.threads = route.threads || [];
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return true;
}

function captureDirectoryReturnRoute() {
  if (state.viewMode === "projects") return null;
  return {
    viewMode: state.viewMode,
    selectedProjectId: state.selectedProjectId,
    selectedSubprojectId: state.selectedSubprojectId,
    currentThread: state.currentThread,
    currentThreadId: state.currentThreadId,
    currentTaskGroupId: state.currentTaskGroupId,
    threads: state.threads,
    selectedTodoId: state.selectedTodoId,
    selectedAutomationId: state.selectedAutomationId,
    automationEditOpen: state.automationEditOpen,
    automationEditJobId: state.automationEditJobId,
    automationOutputHistoryOpen: state.automationOutputHistoryOpen,
    skillDetail: state.skillDetail,
    searchText: $("threadSearch")?.value || "",
  };
}

function restoreDirectoryReturnRoute() {
  const route = state.directoryReturnRoute;
  if (!route) return false;
  state.directoryReturnRoute = null;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.directoryError = "";
  state.sharedDirectoryManagerOpen = false;
  state.viewMode = route.viewMode || "single";
  state.selectedProjectId = route.selectedProjectId || state.selectedProjectId || "";
  state.selectedSubprojectId = route.selectedSubprojectId || "";
  state.currentThread = route.currentThread || null;
  state.currentThreadId = route.currentThreadId || "";
  state.currentTaskGroupId = route.currentTaskGroupId || "";
  state.threads = route.threads || state.threads || [];
  state.selectedTodoId = route.selectedTodoId || "";
  state.selectedAutomationId = route.selectedAutomationId || "";
  state.automationEditOpen = Boolean(route.automationEditOpen);
  state.automationEditJobId = route.automationEditJobId || "";
  state.automationOutputHistoryOpen = Boolean(route.automationOutputHistoryOpen);
  state.skillDetail = route.skillDetail || null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  if (state.viewMode === "todos") renderTodos();
  else if (state.viewMode === "automation") renderAutomationView();
  else {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    if (!isSkillDetailView()) setComposerEnabled(state.viewMode === "single" || state.viewMode === "tasks");
  }
  updateNavigationControls();
  return true;
}

async function deleteTaskGroup(taskGroupId, options = {}) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const label = taskDisplayId(group) || taskGroupId;
  if (options.confirm !== false && !window.confirm(`Delete topic ${label}? Files on disk will not be deleted.`)) return;
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "DELETE",
  });
  state.currentThread = result.thread;
  if (state.currentTaskGroupId === taskGroupId) state.currentTaskGroupId = "";
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function selectTaskRenameInput(input) {
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  try {
    input.setSelectionRange(0, input.value.length);
  } catch (_) {
    input.select();
  }
  input.select();
}

function openTaskRenameDialog(currentTitle) {
  const overlay = $("taskRenameOverlay");
  if (!overlay) return Promise.resolve(window.prompt("修改话题名", currentTitle));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.removeEventListener("click", onBackdropClick);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(null);
    };
    const onBackdropClick = (event) => {
      if (event.target === overlay) finish(null);
    };
    overlay.innerHTML = `<form class="access-key-sheet task-rename-sheet" data-task-rename-form>
      <div class="access-key-header">
        <div>
          <div id="taskRenameTitle" class="access-key-title">修改话题名</div>
          <div class="access-key-subtitle">输入后保存为话题列表标题</div>
        </div>
        <button class="icon-button" type="button" data-task-rename-cancel aria-label="关闭">&#10005;</button>
      </div>
      <label class="task-rename-field">
        <span>话题名</span>
        <input id="taskRenameInput" type="text" value="${escapeHtml(currentTitle)}" autocomplete="off" autocapitalize="sentences">
      </label>
      <div class="task-rename-actions">
        <button type="button" data-task-rename-cancel>取消</button>
        <button class="primary" type="submit">保存</button>
      </div>
    </form>`;
    overlay.classList.remove("hidden");
    overlay.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeydown);
    const form = overlay.querySelector("[data-task-rename-form]");
    const input = overlay.querySelector("#taskRenameInput");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(input?.value ?? "");
    });
    overlay.querySelectorAll("[data-task-rename-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(null));
    });
    requestAnimationFrame(() => {
      selectTaskRenameInput(input);
      window.setTimeout(() => selectTaskRenameInput(input), 80);
    });
  });
}

async function renameTaskGroup(taskGroupId) {
  if (!state.currentThreadId || !taskGroupId) return;
  const group = taskListGroupsForThread(state.currentThread).find((item) => item.id === taskGroupId);
  const currentTitle = String(group?.title || "").trim() || taskPrompt(group) || "";
  const nextTitle = await openTaskRenameDialog(currentTitle);
  if (nextTitle === null) return;
  const title = nextTitle.trim();
  if (!title) {
    window.alert("话题名不能为空");
    return;
  }
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/tasks/${encodeURIComponent(taskGroupId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  state.currentThread = result.thread;
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

function closeTaskCardMenus(root = document) {
  root.querySelectorAll(".task-card-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".task-card")?.classList.remove("menu-open");
    wrap.querySelector(".task-card-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".task-card-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleTaskCardMenu(button) {
  const wrap = button?.closest?.(".task-card-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeTaskCardMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".task-card")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".task-card-menu");
  if (menu) menu.hidden = false;
}

function wireTaskCardMenus(root) {
  root.querySelectorAll("[data-task-card-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTaskCardMenu(button);
    });
  });
  root.querySelectorAll(".task-card-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-rename-task]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTaskCardMenus();
      renameTaskGroup(button.dataset.renameTask).catch(showError);
    });
  });
}

function taskSwipeCommitDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  return Math.min(Math.max(144, width * 0.58), Math.max(144, width - 24));
}

function taskSwipeMaxDistance(row) {
  const width = Math.max(1, row?.clientWidth || 1);
  return Math.min(width, Math.max(TASK_SWIPE_REVEAL_PX, taskSwipeCommitDistance(row) + 42));
}

function taskSwipeContent(row) {
  return row?.querySelector?.("[data-swipe-content], [data-task-swipe-content]") || null;
}

function setTaskSwipeOffset(row, offset) {
  const content = taskSwipeContent(row);
  if (!content) return;
  const clamped = Math.max(0, Math.min(Number(offset) || 0, taskSwipeMaxDistance(row)));
  content.style.transform = clamped ? `translate3d(${-clamped}px, 0, 0)` : "";
  row.classList.toggle("task-swipe-open", clamped >= TASK_SWIPE_OPEN_THRESHOLD_PX);
}

function resetTaskSwipeRow(row) {
  if (!row) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging", "task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = "";
  row.dataset.taskSwipeMoved = "";
}

function closeTaskSwipeRows(root = document, except = null) {
  root.querySelectorAll?.("[data-swipe-row].task-swipe-open, [data-swipe-row].task-swipe-dragging, [data-task-swipe-card].task-swipe-open, [data-task-swipe-card].task-swipe-dragging").forEach((row) => {
    if (row !== except) resetTaskSwipeRow(row);
  });
}

function commitSwipeDelete(row, kind, itemId) {
  if (!row || !itemId) return;
  row.classList.remove("task-swipe-open", "task-swipe-dragging");
  row.classList.add("task-swipe-committing");
  const content = taskSwipeContent(row);
  if (content) content.style.transform = `translate3d(${-Math.max(taskSwipeCommitDistance(row), row.clientWidth || 0)}px, 0, 0)`;
  window.setTimeout(() => {
    const action = kind === "todo"
      ? deleteTodoDirect(itemId)
      : (kind === "kanban-story"
        ? deleteKanbanStoryCase(itemId)
        : deleteTaskGroup(itemId, { confirm: false }));
    action.then((deleted) => {
      if (kind === "kanban-story" && deleted === false) resetTaskSwipeRow(row);
    }).catch((err) => {
      resetTaskSwipeRow(row);
      showError(err);
    });
  }, prefersReducedMotion() ? 0 : 150);
}

function commitTaskSwipeDelete(row, taskGroupId) {
  commitSwipeDelete(row, "task", taskGroupId);
}

function openTaskGroupFromList(taskGroupId) {
  if (!taskGroupId) return;
  rememberTaskListThread();
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentTaskGroupId = taskGroupId;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function openSharedTaskGroupFromList(threadId, taskGroupId) {
  if (!threadId || !taskGroupId) return;
  rememberTaskListThread();
  const params = new URLSearchParams({
    messageMode: "tasks",
    taskGroupId,
    messageLimit: String(TASK_MESSAGE_INITIAL_LIMIT),
  });
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}?${params}`);
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  clearRouteScrollTarget();
  state.currentThread = result.thread || null;
  state.currentThreadId = state.currentThread?.id || threadId;
  state.currentTaskGroupId = taskGroupId;
  state.threads = state.currentThread ? [summarizeThread(state.currentThread)] : state.threads;
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function isTaskSwipeInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    "[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-open-task], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']"
  ));
}

function openTaskDocumentLink(link) {
  const href = link?.href || link?.getAttribute?.("href") || "";
  if (!href) return;
  closeTaskSwipeRows(document);
  if (isMobileLayout()) {
    window.location.assign(href);
    return;
  }
  window.open(href, link.getAttribute("target") || "_blank", "noopener");
}

function wireTaskDocumentLinks(root) {
  root?.querySelectorAll?.("[data-task-doc]").forEach((link) => {
    if (link.dataset.taskDocBound) return;
    link.dataset.taskDocBound = "1";
    let touchStart = null;
    let lastTouchOpen = 0;
    link.addEventListener("touchstart", (event) => {
      if (!event.touches?.length) return;
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }, { passive: true });
    link.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touchStart || !touch) return;
      const dx = Math.abs(touch.clientX - touchStart.x);
      const dy = Math.abs(touch.clientY - touchStart.y);
      touchStart = null;
      if (dx > 10 || dy > 10) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      lastTouchOpen = Date.now();
      openTaskDocumentLink(link);
    }, { passive: false });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (Date.now() - lastTouchOpen < 700) return;
      openTaskDocumentLink(link);
    }, true);
  });
}

function wireTaskSwipeActions(root) {
  root?.querySelectorAll?.("[data-swipe-row], [data-task-swipe-card]").forEach((row) => {
    if (row.dataset.taskSwipeBound) return;
    row.dataset.taskSwipeBound = "1";
    const itemKind = row.dataset.swipeKind || "task";
    const itemId = row.dataset.swipeId || row.dataset.taskId || "";
    row.querySelector("[data-delete-swipe], [data-delete-task]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commitSwipeDelete(row, itemKind, itemId);
    });
    row.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu")) return;
      if (event.target?.closest?.("[data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip")) return;
      if (row.dataset.taskSwipeMoved) {
        event.preventDefault();
        event.stopPropagation();
        row.dataset.taskSwipeMoved = "";
        if (row.classList.contains("task-swipe-open")) resetTaskSwipeRow(row);
        return;
      }
      if (row.classList.contains("task-swipe-open")) {
        event.preventDefault();
        event.stopPropagation();
        resetTaskSwipeRow(row);
      }
    }, true);
    if (row.hasAttribute("data-task-swipe-card")) {
      row.addEventListener("click", (event) => {
        if (event.defaultPrevented || !isTaskListView()) return;
        if (isTaskSwipeInteractiveTarget(event.target)) return;
        if (row.dataset.taskSwipeMoved || row.classList.contains("task-swipe-open")) return;
        openTaskGroupFromList(itemId);
      });
    }
    row.addEventListener("touchstart", (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) return;
      if (event.target?.closest?.("[data-delete-swipe], [data-delete-task], [data-task-card-menu], [data-rename-task], .task-card-menu, [data-task-doc], [data-directory-path-open], .task-skill-chip, .directory-alias-chip, input, select, textarea, [contenteditable='true']")) return;
      const content = taskSwipeContent(row);
      if (!content) return;
      closeTaskSwipeRows(document, row);
      state.taskSwipe = {
        row,
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        lastX: event.touches[0].clientX,
        lastOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        baseOffset: row.classList.contains("task-swipe-open") ? TASK_SWIPE_REVEAL_PX : 0,
        dragging: false,
      };
    }, { passive: true });
    row.addEventListener("touchmove", (event) => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row || !isMobileLayout() || event.touches.length !== 1) return;
      const x = event.touches[0].clientX;
      const dx = x - swipe.startX;
      const dy = event.touches[0].clientY - swipe.startY;
      const horizontal = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (!swipe.dragging) {
        if (horizontal < 8 && vertical < 8) return;
        if (vertical > horizontal * 0.95) return;
        if (dx > 0 && !swipe.baseOffset) return;
        swipe.dragging = true;
        row.classList.add("task-swipe-dragging");
      }
      const nextOffset = Math.max(0, Math.min(swipe.baseOffset - dx, taskSwipeMaxDistance(row)));
      swipe.lastX = x;
      swipe.lastOffset = nextOffset;
      setTaskSwipeOffset(row, nextOffset);
      row.dataset.taskSwipeMoved = "1";
      event.preventDefault();
    }, { passive: false });
    const endSwipe = () => {
      const swipe = state.taskSwipe;
      if (!swipe || swipe.row !== row) return;
      state.taskSwipe = null;
      row.classList.remove("task-swipe-dragging");
      if (!swipe.dragging) return;
      const offset = swipe.lastOffset || 0;
      if (offset >= taskSwipeCommitDistance(row)) {
        commitSwipeDelete(row, itemKind, itemId);
      } else if (offset >= TASK_SWIPE_OPEN_THRESHOLD_PX) {
        setTaskSwipeOffset(row, TASK_SWIPE_REVEAL_PX);
        const content = taskSwipeContent(row);
        if (content) content.style.transform = "";
        row.classList.add("task-swipe-open");
      } else {
        resetTaskSwipeRow(row);
      }
      window.setTimeout(() => {
        if (row.dataset.taskSwipeMoved) row.dataset.taskSwipeMoved = "";
      }, 360);
    };
    row.addEventListener("touchend", endSwipe, { passive: true });
    row.addEventListener("touchcancel", () => {
      const swipe = state.taskSwipe;
      if (swipe?.row === row) state.taskSwipe = null;
      resetTaskSwipeRow(row);
    }, { passive: true });
  });
}

function conversationBottomOffset(el = $("conversation")) {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

function isNearBottom(threshold = 96) {
  return conversationBottomOffset() < threshold;
}

function shouldStickConversationOnViewportChange() {
  if (isChatSearchMode()) return false;
  return isSingleWindowChatView() || isTaskDetailView();
}

function scrollConversationToBottom() {
  const conversation = $("conversation");
  if (!conversation) return;
  conversation.scrollTop = conversation.scrollHeight;
  state.conversationPinnedToBottom = true;
}

function scheduleConversationBottomStick() {
  window.clearTimeout(state.conversationBottomStickTimer);
  state.suppressConversationPinUntil = Date.now() + 700;
  const stick = () => {
    if (!shouldStickConversationOnViewportChange()) return;
    scrollConversationToBottom();
    scheduleMessageScrollButtonVisibility($("conversation"));
  };
  requestAnimationFrame(() => {
    stick();
    requestAnimationFrame(stick);
  });
  state.conversationBottomStickTimer = window.setTimeout(stick, 260);
}

function handleConversationScrollState() {
  if (Date.now() < state.suppressConversationPinUntil) return;
  state.conversationPinnedToBottom = isNearBottom();
  maybeLoadOlderChatMessages();
}

function maybeLoadOlderChatMessages() {
  const conversation = $("conversation");
  if (!conversation || !isSingleWindowChatView() || isChatSearchMode()) return;
  if (state.olderChatMessagesLoading) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  if (!oldestLoadedChatMessageId()) return;
  if (conversation.scrollTop > CHAT_HISTORY_LOAD_TOP_PX) return;
  loadOlderChatMessages().catch(showError);
}

async function loadOlderChatMessages() {
  if (!state.currentThreadId || !isSingleWindowChatView() || state.olderChatMessagesLoading) return;
  const before = oldestLoadedChatMessageId();
  if (!before) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  state.olderChatMessagesLoading = true;
  renderCurrentThread({ stickToBottom: false });
  try {
    const params = chatMessagePageParams({ before, limit: CHAT_MESSAGE_PAGE_LIMIT });
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
    mergeCurrentThreadMessages(result.messages || [], result.page || null);
  } finally {
    state.olderChatMessagesLoading = false;
    renderCurrentThread({ stickToBottom: false });
  }
}

function handleViewportLayoutChange() {
  updateKeyboardViewportMetrics();
  updateMobileBottomNavReservation();
  updateNavigationControls();
  refreshComposerContextSoon(0);
  scheduleMessageScrollButtonVisibility($("conversation"));
  if (!shouldStickConversationOnViewportChange()) return;
  if (!state.conversationPinnedToBottom && !isNearBottom(160)) return;
  scheduleConversationBottomStick();
}

function messageElementById(messageId) {
  const conversation = $("conversation");
  if (!conversation || !messageId) return null;
  return [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === messageId) || null;
}

function clearRouteScrollTarget() {
  state.routeScrollTaskGroupId = "";
  state.routeScrollMessageId = "";
}

function setRouteScrollTarget(taskGroupId, messageId = "") {
  state.routeScrollTaskGroupId = String(taskGroupId || "").trim();
  state.routeScrollMessageId = String(messageId || "").trim();
}

function routeScrollMessageIdForTaskGroup(group) {
  if (!group || !state.routeScrollTaskGroupId || state.routeScrollTaskGroupId !== group.id) return "";
  const messages = Array.isArray(group.messages) ? group.messages : [];
  const requested = state.routeScrollMessageId;
  if (requested && messages.some((message) => message.id === requested)) return requested;
  return [...messages].reverse().find((message) => message?.id)?.id || "";
}

function consumeTaskRouteScrollTarget(group) {
  const messageId = routeScrollMessageIdForTaskGroup(group);
  if (!messageId) return false;
  clearRouteScrollTarget();
  requestAnimationFrame(() => {
    scrollMessageIntoView(messageId, "start");
  });
  return true;
}

function scrollMessageIntoView(messageId, position = "start") {
  const conversation = $("conversation");
  const target = messageElementById(messageId);
  if (!conversation || !target) return;
  const conversationRect = conversation.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
  const rawTop = position === "end"
    ? conversation.scrollTop + targetRect.bottom - conversationRect.top - conversation.clientHeight + 8
    : conversation.scrollTop + targetRect.top - conversationRect.top - 8;
  const top = Math.max(0, Math.min(maxTop, rawTop));
  conversation.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function renderMessageScrollButton(message, position) {
  if (message?.role !== "assistant" || !message?.id) return "";
  const end = position === "end";
  return `<button class="message-scroll-button" type="button" data-scroll-message="${escapeHtml(message.id)}" data-scroll-position="${end ? "end" : "start"}" aria-label="${end ? "Jump to reply end" : "Jump to reply start"}" title="${end ? "End" : "Start"}"><span class="message-scroll-glyph">${end ? "&#8595;" : "&#8593;"}</span></button>`;
}

function canUseMessageReplyActions(message) {
  return Boolean(message?.role === "assistant" && message?.id && !message.revokedAt);
}

function renderMessageCopyButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-copy-message="${escapeHtml(message.id)}" aria-label="Copy full reply" title="Copy full reply"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="5" width="11" height="11" rx="2.5"></rect><rect x="5" y="8" width="11" height="11" rx="2.5"></rect></svg></button>`;
}

function renderMessageImageButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-share-message-image="${escapeHtml(message.id)}" aria-label="Share reply image" title="Share reply image"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11"></path><path d="M8.5 7.5 12 4l3.5 3.5"></path><path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path></svg></button>`;
}

function renderMessageActionStrip(message, scrollPosition) {
  const controls = [
    renderMessageScrollButton(message, scrollPosition),
    renderMessageCopyButton(message),
    renderMessageImageButton(message),
  ].filter(Boolean).join("");
  return controls ? `<span class="message-action-strip">${controls}</span>` : "";
}

function renderMessageGatewayDiagnostic(message) {
  return "";
}

function renderMessageFooter(message, usage) {
  const actions = renderMessageActionStrip(message, "start");
  const gatewayDiagnostic = renderMessageGatewayDiagnostic(message);
  if (!actions && !usage && !gatewayDiagnostic) return "";
  return `<div class="message-footer-row">${actions}${gatewayDiagnostic}${usage}</div>`;
}

function eventClientPoint(event) {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function suppressTransientActivations(ms = 700) {
  state.suppressTransientActivationUntil = Math.max(state.suppressTransientActivationUntil || 0, Date.now() + ms);
}

function transientActivationSuppressed() {
  return Date.now() < (state.suppressTransientActivationUntil || 0);
}

function suppressTransientActivationEvent(event) {
  if (!transientActivationSuppressed()) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  return true;
}

function eventInAttachFileHitZone(event) {
  const button = $("attachFile");
  if (!button || button.disabled) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const rect = button.getBoundingClientRect();
  const slop = 6;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function eventInTopNavHitZone(event) {
  const button = $("openMenu");
  if (!button || button.disabled || button.hidden) return false;
  const rect = button.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const slop = 10;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function activateTopNavButton() {
  if (isSkillDetailView()) {
    closeSkillDetail();
    return;
  }
  if (isTaskDetailView()) {
    openTaskList();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    return;
  }
  if (kanbanComposerOpen()) {
    openTodoList();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    return;
  }
  if (state.viewMode === "projects" && directoryActivePath()) {
    navigateDirectoryUp({ animateEntry: true }).catch(showError);
    return;
  }
  openSidebar();
}

function handleTopNavActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInTopNavHitZone(event)) return false;
  const recentActivation = Date.now() - (state.topNavActivationAt || 0) < 500;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (recentActivation) return true;
  state.topNavActivationAt = Date.now();
  activateTopNavButton();
  return true;
}

function openAttachFilePicker() {
  const input = $("fileInput");
  if (!input) return;
  state.attachFilePickerActivationAt = Date.now();
  input.value = "";
  input.click();
}

function handleAttachFileActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInAttachFileHitZone(event)) return false;
  const recentActivation = Date.now() - (state.attachFilePickerActivationAt || 0) < 650;
  if (recentActivation && !state.chatSearchOpen) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return true;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (state.chatSearchOpen) {
    $("attachFile").dataset.searchCloseHandled = "1";
    closeChatSearch();
    return true;
  }
  openAttachFilePicker();
  return true;
}

function wireMessageScrollButtons(root) {
  root?.querySelectorAll?.("[data-scroll-message]").forEach((button) => {
    if (button.dataset.boundScrollMessage) return;
    button.dataset.boundScrollMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollMessageIntoView(button.dataset.scrollMessage || "", button.dataset.scrollPosition || "start");
    });
  });
}

function currentMessageById(messageId) {
  const id = String(messageId || "");
  if (!id) return null;
  return (state.currentThread?.messages || []).find((message) => message?.id === id) || null;
}

function wireMessageReplyActionButtons(root) {
  root?.querySelectorAll?.("[data-copy-message]").forEach((button) => {
    if (button.dataset.boundCopyMessage) return;
    button.dataset.boundCopyMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await copyMessageContent(button.dataset.copyMessage || "");
      } catch (err) {
        showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
  root?.querySelectorAll?.("[data-share-message-image]").forEach((button) => {
    if (button.dataset.boundShareMessageImage) return;
    button.dataset.boundShareMessageImage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await shareMessageImage(button.dataset.shareMessageImage || "");
      } catch (err) {
        if (err?.name !== "AbortError") showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function forwardArtifactToWeixin(button) {
  const artifactId = String(button?.dataset?.forwardArtifactWeixin || "").trim();
  if (!artifactId) return;
  const result = await api("/api/weixin/forward-file", {
    method: "POST",
    body: JSON.stringify({
      artifactId,
      threadId: state.currentThreadId || "",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  });
  if (result?.thread) rememberChatScopeThread(result.thread);
  if (result?.message) {
    const resultThreadId = result?.thread?.id || result?.delivery?.threadId || "";
    if (resultThreadId && resultThreadId !== state.currentThreadId) {
      upsertCachedChatScopeMessage(resultThreadId, result.message, result.thread || null);
    } else {
      upsertMessage(result.message);
    }
  }
  showPushToast("\u5df2\u52a0\u5165\u5fae\u4fe1\u8f6c\u53d1\u961f\u5217", "success");
}

function wireArtifactWeixinButtons(root) {
  root?.querySelectorAll?.("[data-forward-artifact-weixin]").forEach((button) => {
    if (button.dataset.boundForwardArtifactWeixin) return;
    button.dataset.boundForwardArtifactWeixin = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await forwardArtifactToWeixin(button);
      } catch (err) {
        showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function positionUsagePanel(details) {
  if (!details?.open) return;
  const panel = details.querySelector(".usage-details");
  if (!panel) return;
  panel.style.setProperty("--usage-panel-shift", "0px");
  requestAnimationFrame(() => {
    if (!details.open) return;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    if (!viewportWidth) return;
    const rect = panel.getBoundingClientRect();
    const margin = 10;
    let shift = 0;
    if (rect.right > viewportWidth - margin) shift -= rect.right - (viewportWidth - margin);
    if (rect.left + shift < margin) shift += margin - (rect.left + shift);
    panel.style.setProperty("--usage-panel-shift", `${Math.round(shift)}px`);
  });
}

function closeOpenUsagePanels(root = document) {
  root.querySelectorAll?.(".usage[open]")?.forEach((details) => {
    details.open = false;
  });
}

function wireUsageOutsideDismiss() {
  if (document.documentElement.dataset.usageOutsideDismissBound) return;
  document.documentElement.dataset.usageOutsideDismissBound = "1";
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".usage")) return;
    closeOpenUsagePanels();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenUsagePanels();
  });
}

function wireUsagePanels(root) {
  wireUsageOutsideDismiss();
  root?.querySelectorAll?.(".usage").forEach((details) => {
    if (details.dataset.boundUsagePanel) return;
    details.dataset.boundUsagePanel = "1";
    details.addEventListener("toggle", () => positionUsagePanel(details));
  });
}

function updateMessageScrollButtonVisibility(root) {
  const conversation = $("conversation");
  if (!conversation || !root?.querySelectorAll) return;
  const viewportHeight = Math.max(0, conversation.clientHeight || window.innerHeight || 0);
  root.querySelectorAll(".message[data-message-id]").forEach((article) => {
    const messageHeight = article.getBoundingClientRect().height || article.offsetHeight || 0;
    const shouldShow = viewportHeight > 0 && messageHeight > Math.max(420, viewportHeight - 28);
    article.querySelectorAll(".message-scroll-button").forEach((button) => {
      button.classList.toggle("hidden", !shouldShow);
      button.tabIndex = shouldShow ? 0 : -1;
      button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
  });
}

function scheduleMessageScrollButtonVisibility(root) {
  updateMessageScrollButtonVisibility(root);
  requestAnimationFrame(() => updateMessageScrollButtonVisibility(root));
}

const hermesApiClient = AppApiClient.createApiClient({
  getAccessKey: () => state.key,
  getClientVersion: () => state.clientVersion,
  onClientVersion: (payload, source) => handleClientVersion(payload, source),
  onUnauthorized: () => {
    clearStoredAccessKey();
    showLogin("Access Key 已失效，请重新输入。");
  },
});

async function api(path, options = {}) {
  return hermesApiClient(path, options);
}

function clearStoredAccessKey() {
  state.key = "";
  localStorage.removeItem("hermesWebKey");
  document.cookie = "hermes_web_key=; Path=/; Max-Age=0; SameSite=Lax";
}

function storeAccessKey(key) {
  const value = String(key || "").trim();
  if (!value) return;
  state.key = value;
  localStorage.setItem("hermesWebKey", value);
  document.cookie = `hermes_web_key=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function handleClientVersionFromResponse(response) {
  return AppApiClient.handleClientVersionFromResponse(response, {
    getClientVersion: () => state.clientVersion,
    onClientVersion: (payload, source) => handleClientVersion(payload, source),
    source: "response",
  });
}

function setBootSplashText(message = "正在载入工作区") {
  const text = $("bootSplashText");
  if (text) text.textContent = message;
}

function showBootSplash(message = "正在载入工作区") {
  setBootSplashText(message);
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("bootSplash")?.classList.remove("hidden");
}

function hideBootSplash() {
  $("bootSplash")?.classList.add("hidden");
}

async function hasCookieSession() {
  const res = await fetch("/api/status", { cache: "no-store" });
  return res.status !== 401;
}

function showLogin(message = "") {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginError").textContent = message;
}

function showApp() {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  updateMobileBottomNavReservation();
  restoreVisibleAppScroll();
}

function showSetup(message = "") {
  hideBootSplash();
  $("app")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("setup")?.classList.remove("hidden");
  state.setupError = message || "";
  renderSetup();
}

function renderSetup() {
  const error = $("setupError");
  if (error) error.textContent = state.setupError || "";
  const result = $("setupResult");
  const key = $("setupKey");
  if (result) result.hidden = !state.setupOwnerKey;
  if (key) key.textContent = state.setupOwnerKey || "";
  const submit = $("setupSubmit");
  if (submit) submit.hidden = Boolean(state.setupOwnerKey);
}

async function createOwnerSetup() {
  state.setupError = "";
  renderSetup();
  const result = await fetch("/api/setup/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then(async (res) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Owner setup failed");
    return payload;
  });
  state.setupOwnerKey = result.key || "";
  storeAccessKey(state.setupOwnerKey);
  renderSetup();
}

async function enterAfterSetup() {
  if (!state.setupOwnerKey) return;
  showBootSplash("正在打开 Hermes Mobile");
  await bootstrap();
  showApp();
}

async function login(key) {
  await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Access key is not valid");
  });
  storeAccessKey(key);
  showBootSplash("正在打开 Hermes Mobile");
  try {
    await bootstrap();
    showApp();
  } catch (err) {
    showLogin(err.message || String(err));
  }
}

async function bootstrap() {
  renderClientVersion();
  await loadStatus();
  await checkClientVersion("bootstrap").catch(() => {});
  checkAppUpdate("login").catch(() => {});
  await loadPushStatus().catch(() => updatePushButton());
  await loadWorkspaces();
  if (!applyInitialRouteFromUrl()) applyDefaultLaunchView();
  await syncPushSubscriptionContext().catch(() => {});
  await loadProjects();
  await loadSelectedView();
  startClientRefreshChecks();
  connectEvents();
}

function normalizedRouteView(value, fallback = "") {
  const view = String(value || "").trim().toLowerCase();
  if (view === "automation" || view === "automations" || view === "cron") return "automation";
  if (view === "learning" || view === "coins" || view === "rewards" || view === "redeem") return "learning";
  if (view === "todo" || view === "todos") return "todos";
  if (view === "directory" || view === "directories" || view === "projects") return "projects";
  if (view === "task" || view === "tasks") return "tasks";
  if (view === "single" || view === "stream") return "single";
  return fallback;
}

function sameOriginRouteUrl(value) {
  try {
    const parsed = new URL(value || "/", window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch (_) {
    return null;
  }
}

function applyRouteParams(params) {
  const automationId = String(params.get("automationId") || "").trim();
  const todoId = String(params.get("todoId") || "").trim();
  const taskGroupId = String(params.get("taskGroupId") || params.get("taskId") || "").trim();
  const messageId = String(params.get("messageId") || "").trim();
  const projectId = String(params.get("projectId") || "").trim();
  const subprojectId = String(params.get("subprojectId") || "").trim();
  const directoryPath = String(params.get("directoryPath") || "").trim();
  const directoryRoot = String(params.get("directoryRoot") || "").trim();
  const readingQuizRequested = ["1", "true", "yes"].includes(String(params.get("readingQuiz") || params.get("reading_quiz") || "").trim().toLowerCase());
  const assessmentExamRequested = ["1", "true", "yes"].includes(String(params.get("assessmentExam") || params.get("assessment_exam") || "").trim().toLowerCase());
  const weixinChatRequested = ["1", "true", "yes"].includes(String(params.get("weixinChat") || params.get("weixin_chat") || "").trim().toLowerCase());
  const groupChatRequested = ["1", "true", "yes"].includes(String(params.get("groupChat") || params.get("group_chat") || "").trim().toLowerCase());
  const routeView = normalizedRouteView(params.get("view") || params.get("viewMode"), automationId ? "automation" : todoId ? "todos" : taskGroupId ? "tasks" : (groupChatRequested || weixinChatRequested) ? "single" : "");
  const workspaceId = String(params.get("workspaceId") || "").trim();
  if (workspaceId && state.workspaces.some((item) => item.id === workspaceId)) {
    state.selectedWorkspaceId = workspaceId;
    localStorage.setItem("hermesWebWorkspace", workspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = workspaceId;
  }
  if (routeView) {
    state.viewMode = routeView;
    localStorage.setItem("hermesWebViewMode", routeView);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
  }
  if (routeView === "automation" && automationId) {
    state.selectedAutomationId = automationId;
    state.automationOutputHistoryOpen = false;
  }
  if (routeView === "todos" && todoId) {
    state.selectedTodoId = todoId;
    state.todoRouteMissingTargetId = "";
    state.pendingReadingQuizTodoId = readingQuizRequested ? todoId : "";
    state.pendingAssessmentExamTodoId = assessmentExamRequested ? todoId : "";
  } else if (routeView) {
    state.pendingReadingQuizTodoId = "";
    state.pendingAssessmentExamTodoId = "";
  }
  if (routeView === "projects") {
    state.directoryReturnRoute = null;
    state.sharedDirectoryManagerOpen = false;
    if (projectId) {
      state.selectedProjectId = projectId;
      localStorage.setItem("hermesWebProject", projectId);
      if ($("projectSelect")) $("projectSelect").value = projectId;
    }
    if (subprojectId || params.has("subprojectId")) {
      persistSelectedSubproject(subprojectId);
    }
    if (directoryPath) {
      resetDirectoryPath(directoryPath, { rootPath: directoryRoot || directoryRootForPath(directoryPath, directoryPath) });
    } else {
      resetDirectoryPath();
    }
  }
  if (routeView === "tasks" && taskGroupId) {
    state.currentTaskGroupId = taskGroupId;
    setRouteScrollTarget(taskGroupId, messageId);
  } else if (routeView && routeView !== "tasks") {
    clearRouteScrollTarget();
  }
  if (routeView === "single") {
    setSingleWindowMode("chat");
    if (weixinChatRequested) {
      state.weixinChatOpen = true;
      state.groupChatOpen = false;
      localStorage.setItem("hermesWebWeixinChatOpen", "1");
      localStorage.setItem("hermesWebGroupChatOpen", "0");
    } else if (groupChatRequested) {
      state.weixinChatOpen = false;
      state.groupChatOpen = true;
      localStorage.setItem("hermesWebWeixinChatOpen", "0");
      localStorage.setItem("hermesWebGroupChatOpen", "1");
    } else {
      state.weixinChatOpen = false;
      localStorage.setItem("hermesWebWeixinChatOpen", "0");
    }
  }
  return Boolean(routeView || automationId || todoId || taskGroupId || groupChatRequested || weixinChatRequested || readingQuizRequested || assessmentExamRequested);
}

function applyRouteFromUrl(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return false;
  return applyRouteParams(new URLSearchParams(parsed.search || ""));
}

function applyInitialRouteFromUrl() {
  return applyRouteFromUrl(window.location.href);
}

function replaceTodoDetailRouteFlag(todoId, flagName) {
  const id = String(todoId || "").trim();
  const flag = String(flagName || "").trim();
  if (!id || !flag || state.viewMode !== "todos") return;
  try {
    const params = new URLSearchParams(window.location.search || "");
    params.set("view", "todos");
    params.set("workspaceId", state.selectedWorkspaceId || "owner");
    params.set("todoId", id);
    if (flag === "assessmentExam") params.delete("readingQuiz");
    if (flag === "readingQuiz") params.delete("assessmentExam");
    params.set(flag, "1");
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", `/?${params.toString()}`);
  } catch (_) {}
}

async function openNotificationRoute(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return;
  if (!applyRouteParams(new URLSearchParams(parsed.search || ""))) return;
  suppressComposerAutoFocus(1200);
  blurComposerInput();
  closeSidebar();
  closeTopMoreMenu();
  try {
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", `${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch (_) {
    // Route state is already applied; URL replacement is only for reload/back consistency.
  }
  await loadSelectedView();
}

function applyDefaultLaunchView() {
  state.viewMode = "single";
  setSingleWindowMode("chat");
  state.weixinChatOpen = false;
  state.currentTaskGroupId = "";
  state.skillDetail = null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
}

function restoreVisibleAppScroll() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isSingleWindowChatView()) return;
      const conversation = $("conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  });
}

function applyReasoningInfo(info = {}) {
  if (!info || typeof info !== "object") return;
  const options = normalizeReasoningOptions(info.efforts || info.options || []);
  state.reasoningOptions = options;
  const defaultEffort = String(info.defaultEffort || "").trim().toLowerCase();
  state.defaultReasoningEffort = options.some((item) => item.value === defaultEffort)
    ? defaultEffort
    : (state.defaultReasoningEffort || "medium");
  state.defaultReasoningSource = String(info.source || state.defaultReasoningSource || "");
  state.assistantLabel = String(info.assistantLabel || info.model?.label || state.assistantLabel || "AI").trim() || "AI";
  state.defaultModel = String(info.model?.default || info.defaultModel || state.defaultModel || "").trim();
  state.modelProvider = String(info.model?.provider || info.provider || state.modelProvider || "").trim();
  updateTaskReasoningControl();
  renderComposerContext();
}

async function loadStatus() {
  const status = await api("/api/status").catch((err) => ({ ok: false, error: err.message }));
  $("connectionState").textContent = status.ok ? "Hermes OK" : `Hermes unavailable: ${status.error || "unknown"}`;
  if (status.clientVersion) handleClientVersion(status.clientVersion, "status");
  state.gatewayPool = status.gatewayPool || null;
  state.concurrency = status.concurrency || null;
  state.ownerElevation = status.ownerElevation || state.ownerElevation || null;
  if (status.display && typeof status.display === "object") {
    const names = Array.isArray(status.display.ownerDriveRootNames)
      ? status.display.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    state.displayConfig = {
      ownerDriveRootNames: names.length ? names : state.displayConfig.ownerDriveRootNames,
      ownerRootFallbackLabel: String(status.display.ownerRootFallbackLabel || state.displayConfig.ownerRootFallbackLabel || "Hermes Owner"),
    };
  }
  if (status.reasoning) applyReasoningInfo(status.reasoning);
  if (status.push) {
    state.pushStatus = status.push;
    updatePushButton();
  }
}

function normalizeClientVersion(value) {
  return String(value || "").trim();
}

function compactClientVersion(value) {
  const version = normalizeClientVersion(value);
  const match = version.match(/^\d{8}-(\d{4})$/);
  if (match) return match[1];
  if (version.length > 8) return version.slice(-8);
  return version;
}

function renderClientVersion() {
  const badge = $("clientVersion");
  if (!badge) return;
  const version = normalizeClientVersion(state.clientVersion);
  const update = state.appUpdate || {};
  const updateAvailable = Boolean(update.updateAvailable);
  badge.textContent = updateAvailable ? "更新" : (version ? `v${compactClientVersion(version)}` : "");
  badge.title = updateAvailable
    ? `Update available: ${update.latestVersion || update.latestCommit || "latest"}`
    : (version ? `Client version ${version}` : "");
  badge.classList.toggle("update-available", updateAvailable);
  badge.toggleAttribute("data-update-available", updateAvailable);
}

async function checkAppUpdate(reason = "login") {
  if (!state.auth?.isOwner || state.appUpdateChecking) return null;
  state.appUpdateChecking = true;
  try {
    const query = new URLSearchParams({ reason });
    const result = await api(`/api/app-update/status?${query.toString()}`);
    state.appUpdate = result;
    renderClientVersion();
    return result;
  } catch (err) {
    state.appUpdate = { ok: false, updateAvailable: false, warning: err.message || String(err) };
    renderClientVersion();
    return null;
  } finally {
    state.appUpdateChecking = false;
  }
}

function isSelfUpdateUnsupported(result) {
  const message = String(result?.warning || result?.error || "");
  return result?.repository?.available === false || /not a git checkout/i.test(message);
}

function appUpdateToastKind(result) {
  if (!result) return "";
  if (result.ok && (result.updated || result.upToDate)) return "success";
  if (isSelfUpdateUnsupported(result)) return "";
  if (result.error || result.warning || result.repository?.clean === false) return "error";
  return "";
}

function appUpdateMessage(result) {
  if (!result) return "Update status is unavailable.";
  if (isSelfUpdateUnsupported(result)) return "当前安装方式不支持应用内更新。";
  if (result.error) return result.error;
  if (result.warning) return result.warning;
  if (result.updated) return result.message || "Updated.";
  if (result.upToDate) return "Already up to date.";
  if (!result.updateAvailable) return "No update is available.";
  if (result.repository && result.repository.clean === false) return "Working tree is not clean; update was not applied.";
  return "Update is not available for this installation.";
}

async function applyAppUpdateFromBadge() {
  if (!state.auth?.isOwner || state.appUpdateApplying) return;
  if (!state.appUpdate?.updateAvailable) {
    await checkAppUpdate("manual");
    if (!state.appUpdate?.updateAvailable) {
      showPushToast(appUpdateMessage(state.appUpdate), appUpdateToastKind(state.appUpdate));
      return;
    }
  }
  state.appUpdateApplying = true;
  renderClientVersion();
  try {
    const result = await api("/api/app-update/apply", { method: "POST", body: JSON.stringify({}) });
    state.appUpdate = result;
    renderClientVersion();
    showPushToast(appUpdateMessage(result), appUpdateToastKind(result));
    if (result.updated) {
      await checkClientVersion("update-applied").catch(() => {});
    }
  } catch (err) {
    showPushToast(err.message || "Update failed.", "error");
  } finally {
    state.appUpdateApplying = false;
    renderClientVersion();
  }
}

function gatewayPoolSummary(pool = state.gatewayPool) {
  if (!pool || typeof pool !== "object") return { label: "Gateway Pool: unknown", detail: "" };
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const healthy = workers.filter((worker) => worker.healthy === true).length;
  const workerCount = Number(pool.workerCount ?? workers.length) || workers.length;
  if (!pool.enabled) {
    return {
      label: "Gateway Pool: fallback",
      detail: pool.error || pool.reason || pool.fallbackApiBase || "",
      healthy,
      workerCount,
    };
  }
  return {
    label: `Gateway Pool: ${healthy}/${workerCount} healthy`,
    detail: pool.mode ? `mode ${pool.mode}` : "",
    healthy,
    workerCount,
  };
}

function concurrencySummary(concurrency = state.concurrency) {
  if (!concurrency || typeof concurrency !== "object") return "";
  const active = Number(concurrency.activeGlobal || 0);
  const maxGlobal = Number(concurrency.maxGlobal || 0);
  const maxPerWorkspace = Number(concurrency.maxPerWorkspace || 0);
  const parts = [`active ${active}`];
  if (maxGlobal) parts.push(`global ${maxGlobal}`);
  if (maxPerWorkspace) parts.push(`workspace ${maxPerWorkspace}`);
  return parts.join(" / ");
}

function renderGatewayPoolMiniStatus(pool = state.gatewayPool, concurrency = state.concurrency) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const summary = gatewayPoolSummary(pool);
  const concurrencyText = concurrencySummary(concurrency);
  return `<section class="workspace-gateway-status">
    <div class="workspace-gateway-title">${escapeHtml(summary.label)}</div>
    ${summary.detail ? `<div class="workspace-gateway-meta">${escapeHtml(summary.detail)}</div>` : ""}
    ${concurrencyText ? `<div class="workspace-gateway-meta">Run limit: ${escapeHtml(concurrencyText)}</div>` : ""}
  </section>`;
}

function ownerElevationDurationOptions() {
  const options = Array.isArray(state.ownerElevation?.durationOptionsMinutes)
    ? state.ownerElevation.durationOptionsMinutes.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
  return options.length ? options : [5, 15, 30, 60];
}

function ownerElevationActive() {
  const elevation = state.ownerElevation || {};
  const expiresAt = Date.parse(elevation.expiresAt || "");
  return Boolean(
    state.auth?.isOwner
    && state.selectedWorkspaceId === "owner"
    && elevation.active
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

function ownerElevationRemainingLabel() {
  if (!ownerElevationActive()) return "";
  const expiresAt = Date.parse(state.ownerElevation?.expiresAt || "");
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
  return `${minutes} 分钟后到期`;
}

function ownerElevationSelectedDuration() {
  const options = ownerElevationDurationOptions();
  const raw = Number($("ownerElevationDuration")?.value || state.ownerElevationDurationMinutes || state.ownerElevation?.defaultDurationMinutes || options[0]);
  return options.includes(raw) ? raw : (state.ownerElevation?.defaultDurationMinutes || options[0]);
}

function renderOwnerElevationPanel() {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const elevation = state.ownerElevation || {};
  const available = elevation.available !== false;
  const active = ownerElevationActive();
  const durationOptions = ownerElevationDurationOptions();
  if (!durationOptions.includes(state.ownerElevationDurationMinutes)) {
    state.ownerElevationDurationMinutes = elevation.defaultDurationMinutes || durationOptions[0];
  }
  const selectedDuration = state.ownerElevationDurationMinutes;
  const label = active ? "高权限运行" : "普通权限";
  const meta = active
    ? `后续 Owner 请求会路由到 maintenance Gateway，${ownerElevationRemainingLabel()}。`
    : "后续 Owner 请求默认走普通低权限 Gateway。";
  const options = durationOptions.map((minutes) => (
    `<option value="${escapeHtml(minutes)}"${minutes === selectedDuration ? " selected" : ""}>${escapeHtml(minutes)} 分钟</option>`
  )).join("");
  const disabled = available ? "" : " disabled";
  const reason = !available && elevation.reason ? `<div class="workspace-permission-warning">${escapeHtml(elevation.reason)}</div>` : "";
  return `<section class="workspace-permission-panel ${active ? "active" : ""}">
    <div class="workspace-permission-head">
      <div>
        <div class="workspace-permission-title">当前权限</div>
        <div class="workspace-permission-state">${escapeHtml(label)}</div>
      </div>
      <span class="workspace-permission-badge">${active ? "HIGH" : "LOW"}</span>
    </div>
    <div class="workspace-permission-meta">${escapeHtml(meta)}</div>
    <div class="workspace-permission-actions">
      <select id="ownerElevationDuration" class="workspace-permission-select"${disabled}>${options}</select>
      <button class="workspace-permission-primary" type="button" data-owner-elevation-grant${disabled}>高权限运行</button>
      ${active ? `<button class="workspace-permission-secondary" type="button" data-owner-elevation-revoke>结束</button>` : ""}
    </div>
    <div class="workspace-permission-hint">只在授权时间内生效；到期后自动恢复普通权限。</div>
    ${reason}
  </section>`;
}

function wireOwnerElevationPanel(root) {
  root.querySelector("#ownerElevationDuration")?.addEventListener("change", (event) => {
    const minutes = Number(event.target.value || 0);
    if (Number.isFinite(minutes) && minutes > 0) {
      state.ownerElevationDurationMinutes = minutes;
      localStorage.setItem("hermesOwnerElevationMinutes", String(minutes));
    }
  });
  root.querySelector("[data-owner-elevation-grant]")?.addEventListener("click", () => activateOwnerElevation().catch(showError));
  root.querySelector("[data-owner-elevation-revoke]")?.addEventListener("click", () => revokeOwnerElevation().catch(showError));
}

function openOwnerElevationApprovalDialog(options = {}) {
  const overlay = $("ownerElevationApprovalOverlay");
  if (!overlay) return Promise.resolve(false);
  const title = String(options.title || "Owner Approval");
  const message = String(options.message || "This request needs Owner approval.");
  const detail = String(options.detail || "").trim();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(Boolean(value));
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    overlay.innerHTML = `<section class="access-key-sheet owner-elevation-approval-sheet">
      <header class="access-key-header">
        <div>
          <div id="ownerElevationApprovalTitle" class="access-key-title">${escapeHtml(title)}</div>
          <div class="access-key-subtitle">High-privilege Gateway approval</div>
        </div>
      </header>
      <div class="owner-elevation-approval-body">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
      ${detail ? `<div class="owner-elevation-approval-detail">${escapeHtml(detail)}</div>` : ""}
      <div class="owner-elevation-approval-actions">
        <button class="owner-elevation-cancel" type="button" data-owner-elevation-approval-cancel>Cancel</button>
        <button class="owner-elevation-approve" type="button" data-owner-elevation-approval-approve>Approve</button>
      </div>
    </section>`;
    overlay.classList.remove("hidden");
    overlay.querySelector("[data-owner-elevation-approval-approve]")?.addEventListener("click", () => finish(true));
    overlay.querySelector("[data-owner-elevation-approval-cancel]")?.addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKeydown);
  });
}

async function activateOwnerElevation(durationMinutes = ownerElevationSelectedDuration(), options = {}) {
  if (!state.auth?.isOwner) throw new Error("Owner access is required");
  const minutes = Number(durationMinutes) || ownerElevationSelectedDuration();
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: `Approve high-privilege Gateway routing for ${minutes} minutes? Owner requests during this window will use the maintenance Gateway.`,
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation", {
    method: "POST",
    body: JSON.stringify({ durationMinutes: minutes }),
  });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("高权限运行已授权", "success");
  return true;
}

async function revokeOwnerElevation() {
  const result = await api("/api/owner-elevation", { method: "DELETE" });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("已恢复普通权限", "success");
}

function clearOwnerElevationOnce() {
  state.ownerElevationOnceToken = "";
  state.ownerElevationOnceExpiresAt = "";
}

function ownerElevationOnceActive() {
  const expiresAt = Date.parse(state.ownerElevationOnceExpiresAt || "");
  return Boolean(
    state.ownerElevationOnceToken
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

async function activateOwnerElevationOnce(options = {}) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") {
    throw new Error("Owner access is required");
  }
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: "Approve high-privilege Gateway routing for this message only? The approval is consumed after this send.",
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation/once", { method: "POST", body: JSON.stringify({}) });
  const grant = result.ownerElevationOnce || {};
  state.ownerElevationOnceToken = String(grant.token || "");
  state.ownerElevationOnceExpiresAt = String(grant.expiresAt || "");
  if (!state.ownerElevationOnceToken) throw new Error("Owner high-privilege authorization token was not returned");
  return true;
}

function refreshNoticeText(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  return version ? `客户端已更新到 v${version}` : "客户端已更新";
}

function showRefreshNotice(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  if (!version || version === state.refreshNoticeDismissedVersion) return;
  const notice = $("refreshNotice");
  if (!notice) return;
  $("refreshNoticeText").textContent = refreshNoticeText(version);
  notice.classList.remove("hidden");
}

function hideRefreshNotice() {
  $("refreshNotice")?.classList.add("hidden");
}

function handleClientVersion(info, source = "") {
  const serverVersion = normalizeClientVersion(info?.version || info?.clientVersion || "");
  if (!serverVersion) return;
  state.serverClientVersion = serverVersion;
  const clientVersion = normalizeClientVersion(state.clientVersion);
  if (clientVersion && serverVersion !== clientVersion) {
    showRefreshNotice(serverVersion, source);
    return;
  }
  hideRefreshNotice();
}

async function checkClientVersion(reason = "manual") {
  const query = new URLSearchParams();
  if (state.clientVersion) query.set("clientVersion", state.clientVersion);
  if (reason) query.set("reason", reason);
  const info = await api(`/api/client-version?${query.toString()}`);
  handleClientVersion(info, "poll");
  if (info.reasoning) applyReasoningInfo(info.reasoning);
  return info;
}

function startClientRefreshChecks() {
  if (state.refreshCheckTimer) clearInterval(state.refreshCheckTimer);
  state.refreshCheckTimer = setInterval(() => {
    checkClientVersion("timer").catch(() => {});
  }, 60000);
}

function waitForServiceWorkerControllerChange(timeoutMs = 3500) {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

function reloadWithoutBfcache() {
  const url = new URL(window.location.href);
  url.searchParams.set("_hmv", String(Date.now()));
  window.location.replace(url.href);
}

function reloadForClientUpdate() {
  showBootSplash("正在更新客户端");
  if (!("serviceWorker" in navigator)) {
    reloadWithoutBfcache();
    return;
  }
  navigator.serviceWorker.getRegistration("/")
    .then(async (registration) => {
      if (!registration) return;
      await registration.update?.();
      const worker = registration.waiting || registration.installing;
      if (worker) {
        try {
          worker.postMessage({ type: "HERMES_SKIP_WAITING" });
        } catch (_) {
          // Continue with a timed reload if the worker cannot receive the message.
        }
      }
      await waitForServiceWorkerControllerChange();
    })
    .catch(() => {})
    .finally(reloadWithoutBfcache);
}

function isStandalonePwa() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigator.standalone === true,
  );
}

function pwaPlatformHint() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return "在 iPhone/iPad 上，用 Safari 打开本页，点系统分享按钮，然后选择“添加到主屏幕”。安装后再从桌面图标打开。";
  }
  if (/Android/i.test(ua)) {
    return "在 Android 上，用 Chrome 或 Edge 打开本页，点浏览器菜单里的“安装应用”或“添加到主屏幕”。";
  }
  return "在支持 PWA 的浏览器里打开本页，使用地址栏或浏览器菜单中的“安装应用”。";
}

function pwaRequirementHint() {
  if (isStandalonePwa()) return "当前已经以桌面应用模式运行。";
  if (!window.isSecureContext) return "当前连接不是安全上下文。多数浏览器要求 HTTPS 或 localhost 才能安装 PWA 和启用 Service Worker。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker，不能完整安装为 PWA。";
  if (state.pwaServiceWorkerReady) return "Service Worker 已就绪，应用壳可缓存，离线时可以打开登录页和静态界面。";
  if (state.pwaServiceWorkerError) return state.pwaServiceWorkerError;
  return "正在准备 PWA 安装能力。";
}

async function ensurePwaServiceWorker(options = {}) {
  if (!("serviceWorker" in navigator)) {
    state.pwaServiceWorkerError = "当前浏览器不支持 Service Worker。";
    updateTopMoreControls();
    return null;
  }
  try {
    const registration = await withTimeout(
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }),
      options.timeoutMs || 8000,
      "Service Worker 注册超时",
    );
    registration.update().catch(() => {});
    state.pwaServiceWorkerReady = true;
    state.pwaServiceWorkerError = "";
    updateTopMoreControls();
    return registration;
  } catch (err) {
    state.pwaServiceWorkerReady = false;
    state.pwaServiceWorkerError = err.message || String(err);
    updateTopMoreControls();
    return null;
  }
}

function pwaInstallButtonLabel() {
  if (isStandalonePwa() || state.pwaInstalled) return "已安装";
  return state.pwaInstallPrompt ? "安装应用" : "安装说明";
}

function updatePwaInstallControls() {
  const button = $("topInstallPwa");
  if (!button) return;
  button.hidden = false;
  button.disabled = Boolean(isStandalonePwa() || state.pwaInstalled);
  button.textContent = pwaInstallButtonLabel();
}

function renderPwaInstallOverlay() {
  const overlay = $("pwaInstallOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.pwaInstallOpen);
  if (!state.pwaInstallOpen) {
    overlay.innerHTML = "";
    return;
  }
  const canPrompt = Boolean(state.pwaInstallPrompt && !isStandalonePwa());
  overlay.innerHTML = `<section class="access-key-sheet pwa-install-sheet">
    <header class="access-key-header">
      <div>
        <div id="pwaInstallTitle" class="access-key-title">安装 Hermes Mobile</div>
        <div class="access-key-subtitle">${escapeHtml(pwaRequirementHint())}</div>
      </div>
      <button class="access-key-close" type="button" data-close-pwa-install>完成</button>
    </header>
    <section class="pwa-install-panel">
      <div class="pwa-install-icon" aria-hidden="true">H</div>
      <div>
        <div class="access-key-row-title">桌面应用模式</div>
        <div class="access-key-row-meta">安装后可以从主屏幕/桌面打开，使用独立窗口，并继续使用 Hermes Mobile 的通知和离线应用壳。</div>
      </div>
    </section>
    ${canPrompt ? `<button class="pwa-install-primary" type="button" data-run-pwa-install>安装应用</button>` : ""}
    <section class="pwa-install-instructions">
      <div class="access-key-row-title">手动安装</div>
      <div class="access-key-note">${escapeHtml(pwaPlatformHint())}</div>
    </section>
  </section>`;
  overlay.querySelector("[data-close-pwa-install]")?.addEventListener("click", closePwaInstall);
  overlay.querySelector("[data-run-pwa-install]")?.addEventListener("click", () => runPwaInstallPrompt().catch(showError));
}

function openPwaInstall() {
  closeTopMoreMenu();
  state.pwaInstallOpen = true;
  renderPwaInstallOverlay();
}

function closePwaInstall() {
  state.pwaInstallOpen = false;
  renderPwaInstallOverlay();
}

async function runPwaInstallPrompt() {
  const prompt = state.pwaInstallPrompt;
  if (!prompt) {
    showPushToast(pwaPlatformHint(), "");
    return;
  }
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  state.pwaInstallPrompt = null;
  if (choice?.outcome === "accepted") {
    state.pwaInstalled = true;
    closePwaInstall();
    showPushToast("Hermes Mobile 已提交安装。", "success");
  } else {
    renderPwaInstallOverlay();
  }
  updateTopMoreControls();
}

function fontSizeOption(value) {
  const normalized = normalizeFontSizePreference(value);
  return FONT_SIZE_OPTIONS.find((option) => option.id === normalized) || FONT_SIZE_OPTIONS[1];
}

function normalizeFontSizePreference(value) {
  const id = String(value || "").trim();
  return FONT_SIZE_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_SIZE;
}

function fontFamilyOption(value) {
  const normalized = normalizeFontFamilyPreference(value);
  return FONT_FAMILY_OPTIONS.find((option) => option.id === normalized) || FONT_FAMILY_OPTIONS[0];
}

function normalizeFontFamilyPreference(value) {
  const id = String(value || "").trim();
  return FONT_FAMILY_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_FAMILY;
}

function applyFontSizePreference(value = state.fontSize) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  document.documentElement.dataset.fontSize = option.id;
  document.documentElement.style.setProperty("--app-font-scale", String(option.scale));
  window.setTimeout(updateMobileBottomNavReservation, 0);
}

function applyFontFamilyPreference(value = state.fontFamily) {
  const option = fontFamilyOption(value);
  state.fontFamily = option.id;
  document.documentElement.dataset.fontFamily = option.id;
  document.documentElement.style.setProperty("--app-font-family", option.family);
}

function setFontSizePreference(value) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  localStorage.setItem("hermesWebFontSize", option.id);
  applyFontSizePreference(option.id);
  renderSettingsOverlay();
}

function setFontFamilyPreference(value) {
  const option = fontFamilyOption(value);
  state.fontFamily = option.id;
  localStorage.setItem("hermesWebFontFamily", option.id);
  applyFontFamilyPreference(option.id);
  renderSettingsOverlay();
}

function renderSettingsOverlay() {
  const overlay = $("settingsOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.settingsOpen);
  if (!state.settingsOpen) {
    overlay.innerHTML = "";
    return;
  }
  const current = normalizeFontSizePreference(state.fontSize);
  const currentFamily = normalizeFontFamilyPreference(state.fontFamily);
  const options = FONT_SIZE_OPTIONS.map((option) => {
    const active = option.id === current;
    return `<button class="font-size-option${active ? " active" : ""}" type="button" data-font-size-option="${escapeHtml(option.id)}" style="--font-preview-scale:${option.scale}">
      <span class="font-size-option-name">${escapeHtml(option.label)}</span>
      <span class="font-size-option-sample">Aa</span>
    </button>`;
  }).join("");
  const familyOptions = FONT_FAMILY_OPTIONS.map((option) => {
    const active = option.id === currentFamily;
    return `<button class="font-family-option${active ? " active" : ""}" type="button" data-font-family-option="${escapeHtml(option.id)}" style="--font-preview-family:${escapeHtml(option.family)}">
      <span class="font-family-option-sample">${escapeHtml(option.sample)}</span>
      <span class="font-family-option-name">${escapeHtml(option.label)}</span>
    </button>`;
  }).join("");
  overlay.innerHTML = `<section class="access-key-sheet settings-sheet">
    <header class="access-key-header">
      <div>
        <div id="settingsTitle" class="access-key-title">设置</div>
        <div class="access-key-subtitle">当前设备显示偏好</div>
      </div>
      <button class="access-key-close" type="button" data-close-settings>完成</button>
    </header>
    <section class="settings-panel">
      <div class="settings-row-title">字体大小</div>
      <div class="font-size-options" role="group" aria-label="字体大小">
        ${options}
      </div>
      <div class="settings-row-title">字体</div>
      <div class="font-family-options" role="group" aria-label="字体">
        ${familyOptions}
      </div>
      <div class="settings-preview">
        <div class="settings-preview-title">Hermes Mobile</div>
        <div class="settings-preview-body">聊天、话题、目录、看板、Markdown 阅读和自动化页面会使用这个显示偏好。</div>
      </div>
    </section>
  </section>`;
  if (!overlay.dataset.settingsBackdropBound) {
    overlay.dataset.settingsBackdropBound = "1";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettings();
    });
  }
  overlay.querySelector("[data-close-settings]")?.addEventListener("click", closeSettings);
  overlay.querySelectorAll("[data-font-size-option]").forEach((button) => {
    button.addEventListener("click", () => setFontSizePreference(button.dataset.fontSizeOption || DEFAULT_FONT_SIZE));
  });
  overlay.querySelectorAll("[data-font-family-option]").forEach((button) => {
    button.addEventListener("click", () => setFontFamilyPreference(button.dataset.fontFamilyOption || DEFAULT_FONT_FAMILY));
  });
}

function openSettings() {
  closeTopMoreMenu();
  closeSidebar();
  state.settingsOpen = true;
  renderSettingsOverlay();
}

function closeSettings() {
  state.settingsOpen = false;
  renderSettingsOverlay();
}

function pushSupported() {
  return Boolean(
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window,
  );
}

function pushUnavailableReason() {
  if (!window.isSecureContext) return "当前链接不是 HTTPS 安全上下文，Web Push 不可用。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker。";
  if (!("PushManager" in window)) return "当前浏览器或安装方式不支持 Web Push。iOS 需要从 Safari 添加到主屏幕后使用。";
  if (!("Notification" in window)) return "当前浏览器不支持通知权限。";
  if (state.pushStatus && (!state.pushStatus.enabled || !state.pushStatus.publicKey)) return "服务端 Web Push 尚未配置。";
  if (Notification.permission === "denied") return "通知权限已被系统拒绝，需要在浏览器或 iOS 设置里重新允许。";
  return "";
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message || "操作超时")), timeoutMs);
    }),
  ]);
}

function showPushToast(message, kind = "") {
  const toast = $("pushToast");
  if (!toast) return;
  if (state.pushToastTimer) clearTimeout(state.pushToastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  if (kind) toast.classList.add(kind);
  if (kind !== "error") {
    state.pushToastTimer = window.setTimeout(() => toast.classList.add("hidden"), kind === "success" ? 4200 : 6500);
  }
}

function setPushProgress(message, kind = "") {
  $("connectionState").textContent = message;
  showPushToast(message, kind);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getServiceWorkerRegistration(options = {}) {
  const progress = options.onProgress || (() => {});
  progress("正在准备通知服务");
  const registration = await ensurePwaServiceWorker({ timeoutMs: 8000 });
  if (!registration) throw new Error(state.pwaServiceWorkerError || "Service Worker 注册失败");
  try {
    progress("正在等待通知服务");
    return await withTimeout(navigator.serviceWorker.ready, 8000, "Service Worker 启动超时");
  } catch (_) {
    return registration;
  }
}

async function loadPushStatus() {
  state.pushStatus = await api("/api/push/vapid-public-key");
  if (pushSupported()) {
    try {
      const registration = await getServiceWorkerRegistration();
      state.pushSubscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
    } catch (_) {
      state.pushSubscription = null;
    }
  }
  updatePushButton();
}

async function syncPushSubscriptionContext() {
  if (!pushSupported()) return null;
  if (!state.pushSubscription || Notification.permission !== "granted") return null;
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) return null;
  const result = await withTimeout(api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: state.pushSubscription.toJSON(),
      deviceLabel: navigator.platform || navigator.userAgent || "device",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  }), 8000, "同步通知订阅超时");
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  return result;
}

function updatePushButton() {
  const button = $("pushToggle");
  if (!button) return;
  button.hidden = false;
  button.disabled = false;
  button.classList.remove("enabled", "warning");
  const unavailableReason = pushUnavailableReason();
  if (unavailableReason) {
    button.textContent = "!";
    button.title = unavailableReason;
    button.setAttribute("aria-label", unavailableReason);
    button.classList.add("warning");
    return;
  }
  if (Notification.permission === "granted" && state.pushSubscription) {
    button.textContent = "🔔";
    button.title = "重新启用通知";
    button.setAttribute("aria-label", "重新启用通知");
    button.classList.add("enabled");
    return;
  }
  button.textContent = "🔔";
  button.title = "启用通知";
  button.setAttribute("aria-label", "启用通知");
}

async function enablePushNotifications(options = {}) {
  const forceRenew = Boolean(options.forceRenew);
  const progress = options.onProgress || (() => {});
  if (!pushSupported()) throw new Error("Web Push requires HTTPS, Service Worker, PushManager, and Notification support.");
  progress("正在检查通知权限");
  const permission = Notification.permission === "granted"
    ? "granted"
    : await withTimeout(Notification.requestPermission(), 15000, "通知权限请求超时");
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  progress("正在读取推送配置");
  if (!state.pushStatus?.publicKey) await withTimeout(loadPushStatus(), 10000, "读取推送配置超时");
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) throw new Error("Web Push is not configured on the server.");
  const registration = await getServiceWorkerRegistration({ onProgress: progress });
  progress("正在读取当前订阅");
  let subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
  let previousSubscription = null;
  if (forceRenew && subscription) {
    previousSubscription = subscription;
    progress("正在更新旧订阅");
    try {
      await withTimeout(previousSubscription.unsubscribe(), 8000, "浏览器旧订阅取消超时");
      subscription = null;
    } catch (_) {
      subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "重新读取通知订阅超时").catch(() => previousSubscription);
    }
  }
  if (!subscription) {
    progress("正在创建新订阅");
    subscription = await withTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.pushStatus.publicKey),
    }), 15000, "创建通知订阅超时，请关闭后重新打开 Hermes Mobile 再试");
  }
  state.pushSubscription = subscription;
  progress("正在同步订阅");
  await syncPushSubscriptionContext();
  if (previousSubscription?.endpoint && previousSubscription.endpoint !== subscription.endpoint) {
    await withTimeout(api("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: previousSubscription.endpoint }),
    }), 8000, "同步旧订阅删除超时").catch(() => null);
  }
  return subscription;
}

async function testPushNotification() {
  const result = await api("/api/push/test", { method: "POST", body: JSON.stringify({ workspaceId: state.selectedWorkspaceId || "owner" }) });
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  const delivery = result.result || {};
  const attempted = Number(delivery.attempted || 0);
  const sent = Number(delivery.sent || 0);
  const failed = Number(delivery.failed || 0);
  if (!attempted) {
    throw new Error(`当前工作区没有可用通知订阅：${result?.target?.principalId || state.selectedWorkspaceId || "unknown"}`);
  }
  if (failed || sent < attempted) {
    throw new Error(`测试通知发送不完整：${sent}/${attempted}，失败 ${failed}`);
  }
  return result;
}

function pushTestResultText(result) {
  const delivery = result?.result || {};
  return `测试已交给系统通知：${delivery.sent || 0}/${delivery.attempted || 0}`;
}

function shouldRunLocalPushProbe() {
  return /Android/i.test(navigator.userAgent || "");
}

async function runLocalNotificationProbe(result) {
  if (!shouldRunLocalPushProbe()) return { skipped: true };
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return { skipped: true, error: "通知权限不是 granted" };
  }
  const registration = await getServiceWorkerRegistration();
  const workspaceId = result?.target?.workspaceId || state.selectedWorkspaceId || "owner";
  const testId = result?.target?.testId || `local_${Date.now()}`;
  await registration.showNotification("\u672c\u673a\u901a\u77e5\u6d4b\u8bd5", {
    body: "如果这条只在下拉菜单里，请把 Android 通知类别设为提醒/弹出，而不是静默。",
    tag: `hermes-web-local-probe-${testId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    data: {
      messageType: "local-probe",
      workspaceId,
      url: `/?view=tasks&workspaceId=${encodeURIComponent(workspaceId)}`,
    },
  });
  return { shown: true };
}

function pushCompletionText(result, localProbe) {
  let text = pushTestResultText(result);
  if (localProbe?.shown) text += "；Android 本机通知探测已调用";
  if (localProbe?.error) text += `；本机通知探测失败：${localProbe.error}`;
  return text;
}

function handleForegroundPushMessage(eventData = {}) {
  const payload = eventData.payload || {};
  const messageType = payload?.data?.messageType || payload?.data?.data?.messageType;
  if (eventData.notification?.shown === false) {
    showPushToast(`系统通知展示失败：${eventData.notification.error || "unknown"}`, "error");
    return;
  }
  if (messageType === "test") {
    showPushToast("前台已收到测试推送；系统通知应同时出现在通知栏。", "success");
  }
}

const handleForegroundPushMessageBase = handleForegroundPushMessage;
handleForegroundPushMessage = function handleForegroundPushMessageWithBusinessToast(eventData = {}) {
  handleForegroundPushMessageBase(eventData);
  if (eventData.notification?.shown === false) return;
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const messageType = data.messageType || nestedData.messageType;
  const pushThreadId = String(data.threadId || nestedData.threadId || "").trim();
  const pushWorkspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  if (
    ["task_completed", "task_failed"].includes(messageType)
    && (
      currentThreadHasPendingMessages()
      || (pushThreadId && pushThreadId === state.currentThreadId)
      || (!pushThreadId && state.currentThreadId && (!pushWorkspaceId || pushWorkspaceId === state.selectedWorkspaceId))
    )
  ) {
    requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 80 });
  }
  // Do not duplicate real Web Push notifications with an in-app toast.
  // The system notification is the user-visible delivery surface; this handler
  // only refreshes current views when the push relates to the open thread.
};

async function handlePushButton() {
  const button = $("pushToggle");
  if (!button || button.disabled) return;
  const previous = {
    text: button.textContent,
    title: button.title,
    aria: button.getAttribute("aria-label") || "",
  };
  button.disabled = true;
  button.textContent = "...";
  button.title = "Working";
  button.setAttribute("aria-label", "Working");
  button.classList.add("active");
  try {
    const unavailableReason = pushUnavailableReason();
    if (unavailableReason) {
      $("connectionState").textContent = unavailableReason;
      showPushToast(unavailableReason, "error");
      window.alert(unavailableReason);
    } else if (Notification.permission === "granted" && state.pushSubscription) {
      await enablePushNotifications({ forceRenew: true, onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已重新启用，${pushCompletionText(result, localProbe)}`, "success");
    } else {
      await enablePushNotifications({ onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已启用，${pushCompletionText(result, localProbe)}`, "success");
    }
  } catch (err) {
    showPushToast(err.message || String(err), "error");
    showError(err);
  } finally {
    button.disabled = false;
    button.classList.remove("active");
    if (button.textContent === "...") {
      button.textContent = previous.text;
      button.title = previous.title;
      button.setAttribute("aria-label", previous.aria);
    }
    updatePushButton();
  }
}

async function loadWorkspaces() {
  const result = await api("/api/workspaces");
  state.workspaces = result.data || [];
  state.auth = result.auth || null;
  if (!state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = state.workspaces[0]?.id || "";
  }
  const select = $("workspaceSelect");
  select.innerHTML = state.workspaces.map((ws) => `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.label || ws.id)}</option>`).join("");
  select.value = state.selectedWorkspaceId;
  renderWorkspaceAccessPanel();
  renderComposerContext();
}

async function loadProjects() {
  const result = await api(`/api/projects?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  state.projects = (result.data || []).filter((project) => !project.hidden);
  if (!state.projects.some((item) => item.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || "";
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
  }
  const select = $("projectSelect");
  select.innerHTML = state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(projectDisplayLabel(project))}</option>`).join("");
  select.value = state.selectedProjectId;
  renderSubprojects();
}

function currentProject() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function currentSubproject() {
  const project = currentProject();
  return (project?.children || []).find((item) => item.id === state.selectedSubprojectId) || null;
}

function currentWorkspace() {
  return state.workspaces.find((item) => item.id === state.selectedWorkspaceId) || null;
}

function ownerWorkspaceSelected() {
  if (state.auth?.isOwner) return true;
  const workspace = currentWorkspace();
  return Boolean(workspace && (workspace.id === "owner" || workspace.role === "owner" || workspace.role === "admin"));
}

function pathTailName(value) {
  const text = String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!text) return "";
  const parts = text.split("/").filter(Boolean);
  return parts[parts.length - 1] || text;
}

function workspaceRootDirectoryName(workspace) {
  const dirs = Array.isArray(workspace?.workDirectories) ? workspace.workDirectories : [];
  const root = String(workspace?.defaultWorkspace || dirs[0]?.path || dirs[0] || "").trim();
  return pathTailName(root) || "未配置";
}

function workspaceAccountSummary(workspace) {
  return String(workspace?.principalId || workspace?.accessKey || workspace?.id || "").trim();
}

function workspaceAccessKeyStatusLabel(workspace) {
  const status = workspace?.accessKeyStatus || {};
  const stateText = status.hasKey ? "已生成" : "未生成";
  if (status.kind === "owner" && status.source) return `${stateText} · ${status.source}`;
  return stateText;
}

function workspaceOutboundStatusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return "";
  if (value === "verified") return "已验证";
  if (value === "adapter_registered") return "已注册";
  if (value === "adapter_registered_context_token_missing") return "已注册";
  return value;
}

function workspaceBindingChips(workspace) {
  const bindings = workspace?.bindings || {};
  const chips = [];
  (bindings.channels || []).forEach((channel) => {
    const state = [];
    const outbound = workspaceOutboundStatusLabel(channel.outboundStatus);
    if (outbound) state.push(outbound);
    if (channel.contextTokenAvailable === true) state.push("Context 已绑定");
    if (channel.contextTokenAvailable === false) state.push("Context 未绑定");
    chips.push(`${channel.label || channel.type || "通道"}${state.length ? ` · ${state.join(" · ")}` : ""}`);
  });
  (bindings.interfaces || []).forEach((item) => {
    const detail = [item.category, item.detail].filter(Boolean).join(" · ");
    chips.push(`${item.label || item.id}${detail ? ` · ${detail}` : ""}`);
  });
  if (!chips.length) return "";
  return `<div class="workspace-access-bindings">${chips.map((item) => (
    `<span class="workspace-access-binding-chip">${escapeHtml(item)}</span>`
  )).join("")}</div>`;
}

function workspaceAccessRows() {
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const selectedWorkspaceId = state.selectedWorkspaceId || "";
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  if (selectedWorkspace) return [selectedWorkspace];
  const ownWorkspaceId = state.auth?.workspaceId || "";
  const ownWorkspace = workspaces.find((workspace) => workspace.id === ownWorkspaceId);
  if (ownWorkspace) return [ownWorkspace];
  return workspaces.slice(0, 1);
}

function renderWorkspaceAccessPanel() {
  const panel = $("workspaceAccessPanel");
  if (!panel) return;
  const accessRows = workspaceAccessRows();
  const show = accessRows.length > 0;
  panel.hidden = !show;
  if (!show) {
    panel.innerHTML = "";
    return;
  }
  const canManageOwnerSettings = Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner");
  const rows = accessRows.map((workspace) => {
    const account = workspaceAccountSummary(workspace);
    const rootDirectory = workspaceRootDirectoryName(workspace);
    const accessKeyStatus = workspaceAccessKeyStatusLabel(workspace);
    const bindings = workspaceBindingChips(workspace);
    const accessKeyLine = canManageOwnerSettings
      ? `<div class="workspace-access-key-row">
        <div class="workspace-access-line"><span>Access Key</span>${escapeHtml(accessKeyStatus)}</div>
        <button class="workspace-access-key-button" type="button" data-open-access-keys data-access-key-workspace="owner">管理</button>
      </div>`
      : "";
    return `<section class="workspace-access-row">
      <div class="workspace-access-name">${escapeHtml(workspace.label || workspace.id)}</div>
      ${canManageOwnerSettings && account ? `<div class="workspace-access-line"><span>账号</span>${escapeHtml(account)}</div>` : ""}
      <div class="workspace-access-line"><span>根目录</span>${escapeHtml(rootDirectory)}</div>
      ${accessKeyLine}
      ${bindings}
    </section>`;
  }).join("");
  const runtimeConfigButton = canManageOwnerSettings
    ? `<button class="workspace-access-key-button workspace-runtime-config-button" type="button" data-open-runtime-config>运行配置</button>`
    : "";
  panel.innerHTML = `${renderOwnerElevationPanel()}
  <details>
    <summary>账号 / 根目录 / 接口</summary>
    <div class="workspace-access-list">${rows}</div>
    ${renderGatewayPoolMiniStatus()}
    ${runtimeConfigButton}
  </details>`;
  wireOwnerElevationPanel(panel);
  panel.querySelectorAll("[data-open-access-keys]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openAccessKeyManager({ workspaceId: button.dataset.accessKeyWorkspace || state.selectedWorkspaceId }).catch(showError);
    });
  });
  panel.querySelector("[data-open-runtime-config]")?.addEventListener("click", (event) => {
    event.preventDefault();
    openRuntimeConfigManager().catch(showError);
  });
}

function renderRuntimeConfigManager() {
  const overlay = $("runtimeConfigOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.runtimeConfigOpen);
  if (!state.runtimeConfigOpen) {
    overlay.innerHTML = "";
    return;
  }
  const config = state.runtimeConfig || {};
  const status = state.runtimeConfigTestStatus;
  const keyState = config.hermesApiKeyConfigured ? `${config.hermesApiKeySource || "configured"}` : "未配置";
  const pushState = config.webPushConfigured ? "已配置" : (config.webPushEnabled ? "未配置" : "已禁用");
  const testBlock = status
    ? `<section class="runtime-config-status ${status.ok ? "ok" : "error"}">
        <div class="access-key-row-title">${status.ok ? "Gateway 可用" : "Gateway 不可用"}</div>
        <div class="access-key-row-meta">${escapeHtml(status.status?.apiBase || config.hermesApiBase || "")}</div>
        ${status.status?.error ? `<div class="runtime-config-error">${escapeHtml(status.status.error)}</div>` : ""}
      </section>`
    : "";
  const gatewayStatusBlock = renderGatewayPoolMiniStatus(
    status?.status?.gatewayPool || state.gatewayPool,
    status?.status?.concurrency || state.concurrency,
  );
  const errorBlock = state.runtimeConfigError
    ? `<div class="access-key-empty error">${escapeHtml(state.runtimeConfigError)}</div>`
    : "";
  const body = state.runtimeConfigLoading && !state.runtimeConfig
    ? `<div class="access-key-empty">正在读取运行配置...</div>`
    : `<section class="runtime-config-form">
          <label>
            <span>Hermes Gateway URL</span>
            <input id="runtimeHermesApiBase" type="url" autocomplete="off" value="${escapeHtml(config.hermesApiBase || "")}" placeholder="http://127.0.0.1:8642">
          </label>
          <label>
            <span>Hermes API Key 文件路径</span>
            <input id="runtimeHermesApiKeyPath" type="text" autocomplete="off" value="${escapeHtml(config.hermesApiKeyPath || "")}" placeholder="可留空，继续使用环境变量或默认路径">
          </label>
          <div class="runtime-config-subtitle">Web Push / VAPID</div>
          <label>
            <span>Web Push subject</span>
            <input id="runtimeWebPushSubject" type="text" autocomplete="off" value="${escapeHtml(config.webPushSubjectOverride || "")}" placeholder="mailto:admin@example.com">
          </label>
          <label>
            <span>VAPID 文件路径</span>
            <input id="runtimeWebPushVapidPath" type="text" autocomplete="off" value="${escapeHtml(config.webPushVapidPath || "")}" placeholder="可留空，使用默认 runtime 文件">
          </label>
          <div class="runtime-config-meta">
            <div>默认 URL：${escapeHtml(config.hermesApiBaseDefault || "")}</div>
            <div>API Key：${escapeHtml(keyState)}${config.hermesApiKeyResolvedPath ? ` · ${escapeHtml(config.hermesApiKeyResolvedPath)}` : ""}</div>
            <div>Web Push：${escapeHtml(pushState)} · 订阅 ${escapeHtml(config.webPushSubscriptionCount || 0)}</div>
            <div>VAPID：${escapeHtml(config.webPushVapidExists ? "文件存在" : "文件不存在")}${config.webPushVapidResolvedPath ? ` · ${escapeHtml(config.webPushVapidResolvedPath)}` : ""}</div>
            <div>Subject：${escapeHtml(config.webPushSubject || "")}</div>
            ${config.updatedAt ? `<div>更新：${escapeHtml(formatTime(config.updatedAt))}${config.updatedBy ? ` · ${escapeHtml(config.updatedBy)}` : ""}</div>` : ""}
          </div>
          <div class="runtime-config-actions">
            <button type="button" data-save-runtime-config>保存</button>
            <button type="button" data-test-runtime-config>测试连接</button>
            <button type="button" data-reload-web-push-config>重载推送</button>
            <button type="button" data-generate-web-push-vapid>生成 VAPID</button>
          </div>
        </section>`;
  overlay.innerHTML = `
    <div class="access-key-sheet runtime-config-sheet">
      <header class="access-key-header">
        <div>
          <div id="runtimeConfigTitle" class="access-key-title">运行配置</div>
          <div class="access-key-subtitle">只保存 Gateway URL 和 API key 文件路径；不在 Web 配置里保存 API key 明文。</div>
        </div>
        <button class="access-key-close" type="button" data-close-runtime-config>完成</button>
      </header>
      ${errorBlock}
      ${body}
      ${gatewayStatusBlock}
      ${testBlock}
    </div>`;
  overlay.querySelector("[data-close-runtime-config]")?.addEventListener("click", closeRuntimeConfigManager);
  overlay.querySelector("[data-save-runtime-config]")?.addEventListener("click", () => saveRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-test-runtime-config]")?.addEventListener("click", () => testRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-reload-web-push-config]")?.addEventListener("click", () => reloadWebPushRuntimeConfig().catch(showError));
  overlay.querySelector("[data-generate-web-push-vapid]")?.addEventListener("click", () => generateWebPushVapidFromRuntimeConfig().catch(showError));
}

async function loadRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config");
    state.runtimeConfig = result.config || {};
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function openRuntimeConfigManager() {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if (state.selectedWorkspaceId !== "owner") {
    showError(new Error("Switch to Owner workspace to manage runtime configuration"));
    return;
  }
  state.runtimeConfigOpen = true;
  await loadRuntimeConfigManager();
}

function closeRuntimeConfigManager() {
  state.runtimeConfigOpen = false;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
}

async function saveRuntimeConfigManager() {
  const hermesApiBase = $("runtimeHermesApiBase")?.value?.trim() || "";
  const hermesApiKeyPath = $("runtimeHermesApiKeyPath")?.value?.trim() || "";
  const webPushSubject = $("runtimeWebPushSubject")?.value?.trim() || "";
  const webPushVapidPath = $("runtimeWebPushVapidPath")?.value?.trim() || "";
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config", {
      method: "PATCH",
      body: JSON.stringify({ hermesApiBase, hermesApiKeyPath, webPushSubject, webPushVapidPath }),
    });
    state.runtimeConfig = result.config || {};
    state.pushStatus = result.push || state.pushStatus;
    await loadStatus();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function reloadWebPushRuntimeConfig() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/reload", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function generateWebPushVapidFromRuntimeConfig() {
  const exists = Boolean(state.runtimeConfig?.webPushVapidExists);
  if (exists && !window.confirm("重新生成 VAPID 会让已有浏览器推送订阅失效，需要用户重新启用通知。继续？")) return;
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/generate", {
      method: "POST",
      body: JSON.stringify({ overwrite: exists }),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function testRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfigTestStatus = result;
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.gatewayPool = result.status?.gatewayPool || state.gatewayPool;
    state.concurrency = result.status?.concurrency || state.concurrency;
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

function renderAccessKeyManagerLegacy() {
  const overlay = $("accessKeyOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.accessKeyManagerOpen);
  if (!state.accessKeyManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const selectedWorkspaceId = state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  const selectedWorkspace = (state.workspaces || []).find((workspace) => workspace.id === selectedWorkspaceId) || currentWorkspace();
  const isOwnerAccessManager = Boolean(state.accessKeysAuth?.isOwner);
  const ownerWideAccessKeyList = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const selectedAccessKeys = (state.accessKeys || []).filter((item) => ownerWideAccessKeyList || !selectedWorkspace?.id || item.workspaceId === selectedWorkspace.id);
  const showOwnerKey = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const localWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.id !== "owner" && workspace.source !== "local-workspace")
    : [];
  const workspaceRootLabel = (workspace) => workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "";
  const workspaceToolsets = (workspace) => workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  const renderWorkspaceAdminRow = (workspace, options = {}) => {
    const editable = Boolean(options.editable);
    const root = workspaceRootLabel(workspace);
    const toolsets = workspaceToolsets(workspace);
    return `<article class="workspace-admin-row">
      <div class="workspace-admin-main">
        <div class="workspace-admin-title">${escapeHtml(workspace.label || workspace.id)}</div>
        <div class="workspace-admin-meta">${escapeHtml(workspace.id)}${root ? ` · ${escapeHtml(root)}` : ""}</div>
        ${toolsets.length ? `<div class="workspace-admin-meta">接口：${escapeHtml(toolsets.join(", "))}</div>` : ""}
      </div>
      ${editable ? `<button type="button" data-edit-workspace="${escapeHtml(workspace.id)}">编辑</button>` : `<span class="workspace-admin-readonly">只读</span>`}
      <button type="button" data-manage-workspace="${escapeHtml(workspace.id)}">Key</button>
      ${editable ? `<button type="button" data-delete-workspace="${escapeHtml(workspace.id)}">删除</button>` : ""}
    </article>`;
  };
  const generatedAccessKeyBlock = (target = {}) => {
    if (!state.generatedAccessKey) return "";
    const generatedKind = state.generatedAccessKey.kind || "workspace";
    const targetKind = target.kind || "workspace";
    const generatedWorkspaceId = String(state.generatedAccessKey.workspaceId || "");
    const targetWorkspaceId = String(target.workspaceId || "");
    if (generatedKind !== targetKind) return "";
    if (targetKind === "workspace" && targetWorkspaceId && generatedWorkspaceId !== targetWorkspaceId) return "";
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}">
        <div class="access-key-result-label">${escapeHtml(state.generatedAccessKey.label || "New Access Key")}</div>
        <div class="access-key-value-row">
          <code>${escapeHtml(state.generatedAccessKey.key || "")}</code>
          <button type="button" data-copy-access-key>复制</button>
        </div>
        <div class="access-key-note">明文 key 只在本次生成后显示一次。${state.accessKeyRequiresLogin ? "复制后需要重新登录。" : ""}</div>
        ${state.accessKeyRequiresLogin ? `<button class="access-key-login-button" type="button" data-relogin-after-access-key>重新登录</button>` : ""}
      </section>`;
  };
  const generatedKind = state.generatedAccessKey?.kind || "workspace";
  const generatedWorkspaceId = String(state.generatedAccessKey?.workspaceId || "");
  const generatedInRow = Boolean(generatedKind === "workspace" && generatedWorkspaceId && selectedAccessKeys.some((item) => String(item.workspaceId || "") === generatedWorkspaceId));
  const generatedInOwner = Boolean(generatedKind === "owner" && showOwnerKey);
  const fallbackGenerated = state.generatedAccessKey && !generatedInRow && !generatedInOwner
    ? generatedAccessKeyBlock({ kind: generatedKind })
    : "";
  const rows = selectedAccessKeys.length ? selectedAccessKeys.map((item) => {
    const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
    return `<article class="access-key-row">
      <div class="access-key-row-main">
        <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
        <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · 更新 ${escapeHtml(updated)}` : ""}</div>
      </div>
      <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
      <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换" : "生成"}</button>
      ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
      ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
    </article>`;
  }).join("") : `<div class="access-key-empty">当前工作区没有可管理的工作区 Access Key。</div>`;
  const body = state.accessKeysLoading
    ? `<div class="access-key-empty">正在读取 Access Key...</div>`
    : state.accessKeysError
      ? `<div class="access-key-empty error">${escapeHtml(state.accessKeysError)}</div>`
      : `<div class="access-key-list">${rows}</div>`;
  const workspaceCreateForm = state.accessKeysAuth?.isOwner ? `<section class="access-key-create-workspace">
        <div class="access-key-row-title">创建 / 配置用户工作区</div>
        <div class="workspace-create-help">先填用户名，显示名、根目录和访问目录会自动预填。</div>
        <div class="access-key-create-grid">
          <label>
            <span>用户名</span>
            <input id="newWorkspaceId" type="text" autocomplete="off" placeholder="zhangsan / 张三">
          </label>
          <label>
            <span>显示名</span>
            <input id="newWorkspaceLabel" type="text" autocomplete="off" placeholder="自动生成">
          </label>
          <label class="workspace-create-full">
            <span>根目录</span>
            <input id="newWorkspaceRoot" type="text" autocomplete="off" placeholder="自动生成，可修改">
          </label>
        </div>
        <div id="newWorkspaceDefaultsHint" class="workspace-create-hint"></div>
        <label class="workspace-create-field">
          <span>允许访问目录</span>
          <textarea id="newWorkspaceAllowedRoots" rows="3" placeholder="自动使用根目录；每行一个"></textarea>
        </label>
        <label class="workspace-create-field">
          <span>额外接口 / toolsets</span>
          <input id="newWorkspaceToolsets" type="text" autocomplete="off" placeholder="可留空，逗号分隔">
        </label>
        <button type="button" data-create-workspace>保存工作区</button>
      </section>` : "";
  const workspaceAdminList = isOwnerAccessManager ? `<section class="access-key-workspace-admin">
        <div class="access-key-row-title">本地用户工作区</div>
        ${localWorkspaces.length ? localWorkspaces.map((workspace) => {
          return renderWorkspaceAdminRow(workspace, { editable: true });
        }).join("") : `<div class="access-key-empty">还没有管理员创建的本地用户工作区。</div>`}
        ${deploymentWorkspaces.length ? `
          <div class="access-key-row-title workspace-admin-subtitle">部署账号 / 只读</div>
          ${deploymentWorkspaces.map((workspace) => renderWorkspaceAdminRow(workspace, { editable: false })).join("")}
        ` : ""}
      </section>` : "";
  const subtitle = isOwnerAccessManager
    ? "Owner 可查看全部账号；生产部署账号在这里只读，Access Key 仍可管理。"
    : "只能查看并更换当前账号的 Hermes Mobile 登录 key。";
  overlay.innerHTML = `
    <div class="access-key-sheet">
      <header class="access-key-header">
        <div>
          <div id="accessKeyTitle" class="access-key-title">Access Key${selectedWorkspace ? ` · ${escapeHtml(selectedWorkspace.label || selectedWorkspace.id)}` : ""}</div>
          <div class="access-key-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="access-key-close" type="button" data-close-access-keys>完成</button>
      </header>
      ${workspaceCreateForm}
      ${workspaceAdminList}
      ${showOwnerKey ? `<section class="access-key-web">
        <div>
          <div class="access-key-row-title">Hermes Mobile Owner Key</div>
          <div class="access-key-row-meta">当前来源：${escapeHtml(state.accessKeysAuth?.source || "unknown")}</div>
        </div>
        <button type="button" data-rotate-web-key${state.accessKeysAuth?.canRotateGlobal === false ? " disabled" : ""}>更换</button>
        ${generatedAccessKeyBlock({ kind: "owner" })}
      </section>` : ""}
      ${fallbackGenerated}
      ${body}
    </div>`;
  overlay.querySelector("[data-close-access-keys]")?.addEventListener("click", closeAccessKeyManager);
  overlay.querySelector("[data-rotate-web-key]")?.addEventListener("click", () => rotateWebAccessKey().catch(showError));
  overlay.querySelector("[data-create-workspace]")?.addEventListener("click", () => createWorkspaceFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  overlay.querySelectorAll("[data-edit-workspace]").forEach((button) => {
    button.addEventListener("click", () => fillWorkspaceConfigForm(button.dataset.editWorkspace || ""));
  });
  overlay.querySelectorAll("[data-manage-workspace]").forEach((button) => {
    button.addEventListener("click", () => loadAccessKeyManager({ workspaceId: button.dataset.manageWorkspace || "" }).catch(showError));
  });
  overlay.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspaceFromAccessKeyManager(button.dataset.deleteWorkspace || "").catch(showError));
  });
  overlay.querySelectorAll("[data-generate-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => generateWorkspaceAccessKey(button.dataset.generateWorkspaceKey).catch(showError));
  });
  overlay.querySelectorAll("[data-revoke-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => revokeWorkspaceAccessKey(button.dataset.revokeWorkspaceKey || "").catch(showError));
  });
}

function renderAccessKeyManager() {
  const overlay = $("accessKeyOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.accessKeyManagerOpen);
  if (!state.accessKeyManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const isOwnerAccessManager = Boolean(state.accessKeysAuth?.isOwner || state.auth?.isOwner);
  const allWorkspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const localWorkspaces = isOwnerAccessManager
    ? allWorkspaces.filter((workspace) => workspace.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? allWorkspaces.filter((workspace) => workspace.id !== "owner" && workspace.source !== "local-workspace")
    : [];
  const accessKeys = Array.isArray(state.accessKeys) ? state.accessKeys : [];
  const accessKeyByWorkspaceId = new Map(
    accessKeys.map((item) => [String(item.workspaceId || ""), item]).filter(([workspaceId]) => workspaceId),
  );
  const workspaceIds = new Set(allWorkspaces.map((workspace) => String(workspace.id || "")).filter(Boolean));

  const generatedAccessKeyBlock = (target = {}) => {
    if (!state.generatedAccessKey) return "";
    const generatedKind = state.generatedAccessKey.kind || "workspace";
    const targetKind = target.kind || "workspace";
    const generatedWorkspaceId = String(state.generatedAccessKey.workspaceId || "");
    const targetWorkspaceId = String(target.workspaceId || "");
    if (generatedKind !== targetKind) return "";
    if (targetKind === "workspace" && targetWorkspaceId && generatedWorkspaceId !== targetWorkspaceId) return "";
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}">
        <div class="access-key-result-label">${escapeHtml(state.generatedAccessKey.label || "New Access Key")}</div>
        <div class="access-key-value-row">
          <code>${escapeHtml(state.generatedAccessKey.key || "")}</code>
          <button type="button" data-copy-access-key>复制</button>
        </div>
        <div class="access-key-note">明文 key 只显示一次。${state.accessKeyRequiresLogin ? "复制后需要重新登录。" : ""}</div>
        ${state.accessKeyRequiresLogin ? `<button class="access-key-login-button" type="button" data-relogin-after-access-key>重新登录</button>` : ""}
      </section>`;
  };

  const workspaceRootLabel = (workspace) => workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "";
  const workspaceToolsets = (workspace) => workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  const workspaceKeyRecord = (workspace) => {
    const workspaceId = String(workspace?.id || "");
    return accessKeyByWorkspaceId.get(workspaceId) || {
      workspaceId,
      workspaceLabel: workspace?.label || workspaceId,
      hasKey: Boolean(workspace?.accessKeyStatus?.hasKey),
      updatedAt: workspace?.accessKeyStatus?.updatedAt || "",
    };
  };
  const renderWorkspaceKeyCard = (workspace, options = {}) => {
    const workspaceId = String(workspace?.id || "");
    if (!workspaceId) return "";
    const editable = Boolean(options.editable);
    const keyRecord = workspaceKeyRecord(workspace);
    const root = workspaceRootLabel(workspace);
    const toolsets = workspaceToolsets(workspace);
    const updated = keyRecord.updatedAt ? formatTime(keyRecord.updatedAt) : "";
    const keyLabel = keyRecord.hasKey ? "已生成" : "未生成";
    return `<article class="owner-workspace-card ${editable ? "local" : "deployment"}">
      <div class="owner-workspace-card-head">
        <div class="owner-workspace-main">
          <div class="owner-workspace-title">${escapeHtml(workspace?.label || workspaceId)}</div>
          <div class="owner-workspace-id">${escapeHtml(workspaceId)}</div>
        </div>
        <span class="owner-workspace-badge">${editable ? "本地账号" : "部署账号"}</span>
      </div>
      <dl class="owner-workspace-facts">
        <div><dt>Key</dt><dd>${escapeHtml(keyLabel)}${updated ? ` · ${escapeHtml(updated)}` : ""}</dd></div>
        ${root ? `<div><dt>根目录</dt><dd>${escapeHtml(root)}</dd></div>` : ""}
        ${toolsets.length ? `<div><dt>接口</dt><dd>${escapeHtml(toolsets.join(", "))}</dd></div>` : ""}
      </dl>
      <div class="owner-workspace-actions">
        ${editable ? `<button type="button" data-edit-workspace="${escapeHtml(workspaceId)}">编辑</button>` : ""}
        <button type="button" data-generate-workspace-key="${escapeHtml(workspaceId)}">${keyRecord.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${keyRecord.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(workspaceId)}">撤销</button>` : ""}
        ${editable ? `<button class="danger" type="button" data-delete-workspace="${escapeHtml(workspaceId)}">删除</button>` : ""}
      </div>
      ${generatedAccessKeyBlock({ kind: "workspace", workspaceId })}
    </article>`;
  };
  const renderWorkspaceSection = (title, workspaces, options = {}) => {
    if (!workspaces.length) return "";
    return `<section class="access-key-section">
      <div class="access-key-section-head">
        <div class="access-key-section-title">${escapeHtml(title)}</div>
        <div class="access-key-section-count">${escapeHtml(workspaces.length)}</div>
      </div>
      <div class="owner-workspace-grid">
        ${workspaces.map((workspace) => renderWorkspaceKeyCard(workspace, options)).join("")}
      </div>
    </section>`;
  };

  const generatedKind = state.generatedAccessKey?.kind || "workspace";
  const generatedWorkspaceId = String(state.generatedAccessKey?.workspaceId || "");
  const generatedInRow = Boolean(generatedKind === "workspace" && generatedWorkspaceId && workspaceIds.has(generatedWorkspaceId));
  const generatedInOwner = Boolean(generatedKind === "owner" && isOwnerAccessManager);
  const fallbackGenerated = state.generatedAccessKey && !generatedInRow && !generatedInOwner
    ? generatedAccessKeyBlock({ kind: generatedKind })
    : "";
  const orphanAccessKeys = isOwnerAccessManager
    ? accessKeys.filter((item) => item.workspaceId && !workspaceIds.has(String(item.workspaceId)))
    : [];
  const orphanKeySection = orphanAccessKeys.length ? `<section class="access-key-section">
    <div class="access-key-section-head">
      <div class="access-key-section-title">其他 Key 记录</div>
      <div class="access-key-section-count">${escapeHtml(orphanAccessKeys.length)}</div>
    </div>
    <div class="access-key-list">
      ${orphanAccessKeys.map((item) => {
    const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
    return `<article class="access-key-row">
        <div class="access-key-row-main">
          <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
          <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · ${escapeHtml(updated)}` : ""}</div>
        </div>
        <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
        <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
        ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
      </article>`;
  }).join("")}
    </div>
  </section>` : "";

  const loadingBlock = state.accessKeysLoading
    ? `<div class="access-key-empty">正在读取账号和 Key...</div>`
    : "";
  const errorBlock = state.accessKeysError
    ? `<div class="access-key-empty error">${escapeHtml(state.accessKeysError)}</div>`
    : "";
  const ownerKeySection = isOwnerAccessManager ? `<section class="access-key-section owner-key-section">
    <div class="access-key-section-head">
      <div class="access-key-section-title">Owner Key</div>
      <div class="access-key-section-count">${escapeHtml(state.accessKeysAuth?.source || "configured")}</div>
    </div>
    <article class="access-key-web owner-key-card">
      <div>
        <div class="access-key-row-title">Hermes Mobile Owner Key</div>
        <div class="access-key-row-meta">管理员入口 Key</div>
      </div>
      <button type="button" data-rotate-web-key${state.accessKeysAuth?.canRotateGlobal === false ? " disabled" : ""}>更换</button>
      ${generatedAccessKeyBlock({ kind: "owner" })}
    </article>
  </section>` : "";
  const workspaceCreateForm = isOwnerAccessManager ? `<details class="access-key-section access-key-create-section" data-workspace-config-section>
    <summary class="access-key-section-summary">
      <span>新建 / 编辑本地账号</span>
      <span>本地工作区</span>
    </summary>
    <section class="access-key-create-workspace">
      <div class="access-key-row-title">创建 / 配置用户工作区</div>
      <div class="workspace-create-help">先填用户名，显示名、根目录和访问目录会自动预填。</div>
      <div class="access-key-create-grid">
        <label>
          <span>用户名</span>
          <input id="newWorkspaceId" type="text" autocomplete="off" placeholder="zhangsan / 张三">
        </label>
        <label>
          <span>显示名</span>
          <input id="newWorkspaceLabel" type="text" autocomplete="off" placeholder="自动生成">
        </label>
        <label class="workspace-create-full">
          <span>根目录</span>
          <input id="newWorkspaceRoot" type="text" autocomplete="off" placeholder="自动生成，可修改">
        </label>
      </div>
      <div id="newWorkspaceDefaultsHint" class="workspace-create-hint"></div>
      <label class="workspace-create-field">
        <span>允许访问目录</span>
        <textarea id="newWorkspaceAllowedRoots" rows="3" placeholder="默认使用根目录；每行一个"></textarea>
      </label>
      <label class="workspace-create-field">
        <span>额外接口 / toolsets</span>
        <input id="newWorkspaceToolsets" type="text" autocomplete="off" placeholder="可留空，逗号分隔">
      </label>
      <button type="button" data-create-workspace>保存工作区</button>
    </section>
  </details>` : "";
  const localWorkspaceSection = renderWorkspaceSection("本地用户", localWorkspaces, { editable: true });
  const deploymentWorkspaceSection = renderWorkspaceSection("部署账号", deploymentWorkspaces, { editable: false });
  const workspaceAdminList = isOwnerAccessManager
    ? `${localWorkspaceSection}
       ${workspaceCreateForm}
       ${deploymentWorkspaceSection}
       ${!localWorkspaces.length && !deploymentWorkspaces.length ? `<section class="access-key-section"><div class="access-key-empty">还没有可管理的账号。</div></section>` : ""}
       ${orphanKeySection}`
    : `<section class="access-key-section"><div class="access-key-list">${accessKeys.map((item) => {
      const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
      return `<article class="access-key-row">
        <div class="access-key-row-main">
          <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
          <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · ${escapeHtml(updated)}` : ""}</div>
        </div>
        <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
        <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
        ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
      </article>`;
    }).join("")}</div></section>`;
  const subtitle = isOwnerAccessManager
    ? "账号、根目录、接口和登录 Key"
    : "只能查看并更换当前账号的 Hermes Mobile 登录 Key。";

  overlay.innerHTML = `
    <div class="access-key-sheet owner-admin-sheet">
      <header class="access-key-header">
        <div>
          <div id="accessKeyTitle" class="access-key-title">${isOwnerAccessManager ? "Owner 管理" : "Access Key"}</div>
          <div class="access-key-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="access-key-close" type="button" data-close-access-keys>完成</button>
      </header>
      ${loadingBlock}
      ${errorBlock}
      ${ownerKeySection}
      ${workspaceAdminList}
      ${fallbackGenerated}
    </div>`;

  overlay.querySelector("[data-close-access-keys]")?.addEventListener("click", closeAccessKeyManager);
  overlay.querySelector("[data-rotate-web-key]")?.addEventListener("click", () => rotateWebAccessKey().catch(showError));
  overlay.querySelector("[data-create-workspace]")?.addEventListener("click", () => createWorkspaceFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  overlay.querySelectorAll("[data-edit-workspace]").forEach((button) => {
    button.addEventListener("click", () => fillWorkspaceConfigForm(button.dataset.editWorkspace || ""));
  });
  overlay.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspaceFromAccessKeyManager(button.dataset.deleteWorkspace || "").catch(showError));
  });
  overlay.querySelectorAll("[data-generate-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => generateWorkspaceAccessKey(button.dataset.generateWorkspaceKey).catch(showError));
  });
  overlay.querySelectorAll("[data-revoke-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => revokeWorkspaceAccessKey(button.dataset.revokeWorkspaceKey || "").catch(showError));
  });
}

async function loadAccessKeyManager(options = {}) {
  state.accessKeyWorkspaceId = options.workspaceId || state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  state.accessKeysLoading = true;
  state.accessKeysError = "";
  if (!options.keepGenerated) state.generatedAccessKey = null;
  renderAccessKeyManager();
  try {
    const params = new URLSearchParams();
    const requestAllWorkspaceKeys = String(state.accessKeyWorkspaceId || "") === "owner";
    if (state.accessKeyWorkspaceId && !requestAllWorkspaceKeys) params.set("workspaceId", state.accessKeyWorkspaceId);
    const query = params.toString();
    const result = await api(`/api/access-keys${query ? `?${query}` : ""}`);
    const showAllOwnerKeys = Boolean(result.auth?.isOwner && requestAllWorkspaceKeys);
    state.accessKeys = (result.data || []).filter((item) => showAllOwnerKeys || !state.accessKeyWorkspaceId || item.workspaceId === state.accessKeyWorkspaceId);
    state.accessKeysAuth = result.auth || null;
  } catch (err) {
    state.accessKeysError = err.message || String(err);
  } finally {
    state.accessKeysLoading = false;
    renderAccessKeyManager();
  }
}

async function openAccessKeyManager(options = {}) {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if ((options.workspaceId || state.selectedWorkspaceId || "") !== "owner") {
    showError(new Error("Switch to Owner workspace to manage Access Keys"));
    return;
  }
  state.accessKeyManagerOpen = true;
  await loadAccessKeyManager({ workspaceId: "owner" });
}

function fillWorkspaceConfigForm(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace) return;
  const configSection = $("accessKeyOverlay")?.querySelector("[data-workspace-config-section]");
  if (configSection) configSection.open = true;
  const localConfig = workspace.localConfig || {};
  const inputs = workspaceCreateInputs();
  if (inputs.id) {
    inputs.id.value = workspace.id || "";
    inputs.id.dataset.manual = "1";
  }
  if (inputs.label) {
    inputs.label.value = workspace.label || workspace.id || "";
    inputs.label.dataset.manual = "1";
  }
  if (inputs.root) {
    inputs.root.value = localConfig.defaultWorkspace || workspace.defaultWorkspace || "";
    inputs.root.dataset.manual = "1";
  }
  if (inputs.allowedRoots) {
    inputs.allowedRoots.value = joinConfigList(localConfig.allowedRoots || []);
    inputs.allowedRoots.dataset.manual = "1";
  }
  if (inputs.toolsets) {
    inputs.toolsets.value = splitConfigList(localConfig.allowedToolsets || workspace.bindings?.allowedToolsets || []).join(", ");
    inputs.toolsets.dataset.manual = "1";
  }
  const hint = $("newWorkspaceDefaultsHint");
  if (hint) hint.textContent = workspace.id ? `ID: ${workspace.id}` : "";
  window.requestAnimationFrame(() => {
    configSection?.scrollIntoView({ block: "start", behavior: "smooth" });
    $("newWorkspaceLabel")?.focus();
  });
}

async function createWorkspaceFromAccessKeyManager() {
  const workspaceId = $("newWorkspaceId")?.value?.trim() || "";
  const label = $("newWorkspaceLabel")?.value?.trim() || workspaceId;
  const defaultWorkspace = $("newWorkspaceRoot")?.value?.trim() || "";
  const allowedRoots = splitConfigList($("newWorkspaceAllowedRoots")?.value || "");
  const allowedToolsets = splitConfigList($("newWorkspaceToolsets")?.value || "");
  if (!workspaceId) throw new Error("请输入用户 ID");
  const result = await api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ workspaceId, label, defaultWorkspace, allowedRoots, allowedToolsets }),
  });
  const createdId = result.workspace?.id || workspaceId;
  state.selectedWorkspaceId = createdId;
  localStorage.setItem("hermesWebWorkspace", createdId);
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: createdId });
}

async function deleteWorkspaceFromAccessKeyManager(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace || workspace.source !== "local-workspace") return;
  const label = workspace.label || workspace.id;
  if (!window.confirm(`删除本地用户工作区 ${label}？该账号的 Workspace Access Key 也会撤销。历史消息不会被删除。`)) return;
  await api(`/api/workspaces/${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
  if (state.selectedWorkspaceId === workspace.id) {
    state.selectedWorkspaceId = "owner";
    localStorage.setItem("hermesWebWorkspace", "owner");
  }
  if (state.accessKeyWorkspaceId === workspace.id) state.accessKeyWorkspaceId = state.selectedWorkspaceId;
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || state.selectedWorkspaceId || "owner" });
}

function closeAccessKeyManager() {
  const requiresLogin = state.accessKeyRequiresLogin;
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (requiresLogin) showLogin("Access Key 已更新，请输入新 key。");
}

function finishAccessKeyRelogin() {
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  showLogin("Access Key 已更新，请输入新 key。");
}

async function generateWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId) return;
  if (target?.hasKey && !window.confirm(`更换 ${label} 的 Hermes Mobile Access Key？旧 key 会立即失效。`)) return;
  const result = await api("/api/access-keys/workspace", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.generatedAccessKey = {
    kind: "workspace",
    key: result.key || "",
    label: `${label} Hermes Mobile Access Key`,
    workspaceId,
    focus: true,
  };
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ keepGenerated: true, workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function revokeWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId || !target?.hasKey) return;
  if (!window.confirm(`撤销 ${label} 的 Hermes Mobile Access Key？该账号会在下次请求时需要重新登录。`)) return;
  const result = await api(`/api/access-keys/workspace/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function rotateWebAccessKey() {
  if (!window.confirm("更换 Hermes Mobile Owner Access Key？旧 Owner key 会立即失效。")) return;
  const result = await api("/api/access-keys/web", { method: "POST", body: JSON.stringify({}) });
  storeAccessKey(result.key || "");
  state.generatedAccessKey = {
    kind: "owner",
    key: result.key || "",
    label: "Hermes Mobile Owner Access Key",
    workspaceId: "owner",
    focus: true,
  };
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (result.key) copyTextToClipboard(result.key).catch(() => {});
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
  } else {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showPushToast("已复制到剪贴板", "success");
}

function messageShareText(message) {
  if (!message) return "";
  const content = cleanDisplayText(rewriteDirectoryPathsForDisplay(message.content || ""));
  const error = message.error ? `Error: ${message.error}` : "";
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts
      .map((artifact) => String(artifact?.name || artifact?.id || "").trim())
      .filter(Boolean)
    : [];
  const artifactText = artifacts.length ? `Attachments:\n${artifacts.map((name) => `- ${name}`).join("\n")}` : "";
  return [content, error, artifactText].filter(Boolean).join("\n\n").trim();
}

async function copyMessageContent(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no copyable content");
  await copyTextToClipboard(text);
}

function messageShareTitle(message) {
  if (!message) return "Hermes Mobile";
  if (message.taskGroupId && !isSingleWindowConversationTaskGroupId(message.taskGroupId)) {
    return `Hermes Mobile - ${shortTaskDisplayId(messageTaskDisplayId(message))}`;
  }
  return "Hermes Mobile";
}

function stripInlineMarkdownForShare(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function shareImageBlocksFromText(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let paragraph = [];
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: stripInlineMarkdownForShare(paragraph.join(" ")) });
    paragraph = [];
  };
  const pushTextBlock = (type, value, extra = {}) => {
    const textValue = stripInlineMarkdownForShare(value);
    if (textValue) blocks.push(Object.assign({ type, text: textValue }, extra));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      pushTextBlock("heading", heading[2], { level: heading[1].length });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      pushTextBlock("list", bullet[1], { marker: "-" });
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      pushTextBlock("list", numbered[2], { marker: `${numbered[1]}.` });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      pushTextBlock("quote", quote[1]);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "code", text: trimmed });
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
  flushParagraph();
  return blocks.length ? blocks : [{ type: "paragraph", text: "No content." }];
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const sourceLine of String(text || "").split(/\r?\n/)) {
    const chars = Array.from(sourceLine);
    let line = "";
    for (const char of chars) {
      const next = `${line}${char}`;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else {
        line = next;
      }
    }
    if (line) lines.push(line.trimEnd());
    else if (!chars.length) lines.push("");
  }
  return lines;
}

function setShareImageFont(ctx, size, weight = 400, family = "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Aptos\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Segoe UI\", sans-serif") {
  ctx.font = `${weight} ${size}px ${family}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function layoutShareImage(ctx, message, text) {
  const width = SHARE_IMAGE_WIDTH;
  const margin = 96;
  const contentWidth = width - margin * 2;
  const items = [];
  let y = 72;
  const title = messageShareTitle(message);
  const meta = [messageDisplayTimeLabel(message), state.currentThread?.title || ""].filter(Boolean).join(" - ");

  setShareImageFont(ctx, 36, 800);
  items.push({ type: "brand", x: margin, y, text: "Hermes Mobile", size: 36, weight: 800 });
  y += 58;
  setShareImageFont(ctx, 62, 760);
  const titleLines = wrapCanvasText(ctx, title, contentWidth);
  items.push({ type: "text", x: margin, y, lines: titleLines, size: 62, weight: 760, lineHeight: 76, color: "#142027" });
  y += titleLines.length * 76 + 18;
  if (meta) {
    setShareImageFont(ctx, 34, 500);
    const metaLines = wrapCanvasText(ctx, meta, contentWidth);
    items.push({ type: "text", x: margin, y, lines: metaLines, size: 34, weight: 500, lineHeight: 46, color: "#6f6a5f" });
    y += metaLines.length * 46 + 32;
  }
  items.push({ type: "rule", x: margin, y, width: contentWidth });
  y += 48;

  for (const block of shareImageBlocksFromText(text)) {
    if (block.type === "heading") {
      const size = block.level <= 1 ? 64 : block.level === 2 ? 58 : 54;
      const lineHeight = block.level <= 1 ? 84 : block.level === 2 ? 78 : 74;
      setShareImageFont(ctx, size, 780);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size, weight: 780, lineHeight, color: "#182833" });
      y += lines.length * lineHeight + 28;
    } else if (block.type === "list") {
      setShareImageFont(ctx, 52, 500);
      const markerWidth = 66;
      const lines = wrapCanvasText(ctx, block.text, contentWidth - markerWidth);
      items.push({ type: "list", x: margin, y, marker: block.marker || "-", lines, size: 52, weight: 500, lineHeight: 80, markerWidth, color: "#182833" });
      y += lines.length * 80 + 14;
    } else if (block.type === "quote") {
      setShareImageFont(ctx, 48, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 68);
      const height = lines.length * 74 + 42;
      items.push({ type: "quote", x: margin, y, width: contentWidth, height, lines, size: 48, weight: 500, lineHeight: 74, color: "#374742" });
      y += height + 28;
    } else if (block.type === "code") {
      setShareImageFont(ctx, 40, 500, "\"Cascadia Mono\", Consolas, monospace");
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 56);
      const height = lines.length * 58 + 44;
      items.push({ type: "code", x: margin, y, width: contentWidth, height, lines, size: 40, weight: 500, lineHeight: 58, color: "#22302d" });
      y += height + 28;
    } else {
      setShareImageFont(ctx, 54, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size: 54, weight: 500, lineHeight: 84, color: "#182833" });
      y += lines.length * 84 + 30;
    }
  }

  y += 32;
  items.push({ type: "footer", x: margin, y, text: "Shared from Hermes Mobile", size: 30, weight: 500 });
  y += 72;
  return { width, height: Math.max(640, Math.ceil(y)), items };
}

function drawShareImage(ctx, layout) {
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, layout.width, layout.height);
  fillRoundRect(ctx, 28, 28, layout.width - 56, layout.height - 56, 24, "rgba(255, 252, 246, 0.84)");
  ctx.strokeStyle = "rgba(95, 83, 63, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, 28, 28, layout.width - 56, layout.height - 56, 24);
  ctx.stroke();

  for (const item of layout.items) {
    if (item.type === "brand") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "rule") {
      ctx.strokeStyle = "rgba(135, 111, 60, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.width, item.y);
      ctx.stroke();
      continue;
    }
    if (item.type === "footer") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#8a8478";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "quote") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(235, 229, 216, 0.72)");
      ctx.fillStyle = "#b28b47";
      ctx.fillRect(item.x + 20, item.y + 18, 5, item.height - 36);
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 44, item.y + 24 + item.lineHeight * (index + 0.75)));
      continue;
    }
    if (item.type === "code") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(226, 231, 225, 0.82)");
      setShareImageFont(ctx, item.size, item.weight, "\"Cascadia Mono\", Consolas, monospace");
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 22, item.y + 18 + item.lineHeight * (index + 0.78)));
      continue;
    }
    if (item.type === "list") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.marker, item.x, item.y + item.lineHeight * 0.78);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + item.markerWidth, item.y + item.lineHeight * (index + 0.78)));
      continue;
    }
    setShareImageFont(ctx, item.size, item.weight);
    ctx.fillStyle = item.color;
    item.lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + item.lineHeight * (index + 0.78)));
  }
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render image"));
    }, type);
  });
}

function shareImageRenderScale(layout) {
  const width = Math.max(1, Number(layout?.width || 1));
  const height = Math.max(1, Number(layout?.height || 1));
  const maxByPixels = Math.sqrt(SHARE_IMAGE_MAX_PIXELS / (width * height));
  const maxByDimension = Math.min(SHARE_IMAGE_MAX_DIMENSION / width, SHARE_IMAGE_MAX_DIMENSION / height);
  return Math.max(1, Math.min(SHARE_IMAGE_SCALE, maxByPixels, maxByDimension));
}

async function renderMessageShareImageBlob(message) {
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no image content");
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const layout = layoutShareImage(measureCtx, message, text);
  if (layout.height > 30000) throw new Error("Reply is too long for one image");
  const scale = shareImageRenderScale(layout);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawShareImage(ctx, layout);
  return canvasToBlob(canvas, "image/png");
}

async function copyImageBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem || !window.isSecureContext) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  showPushToast("\u56fe\u7247\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f", "success");
  return true;
}

function openImageBlobPreview(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  if (!opened) throw new Error("Could not open image preview");
  showPushToast("\u5df2\u751f\u6210\u56fe\u7247\u9884\u89c8", "success");
}

async function shareMessageImage(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const blob = await renderMessageShareImageBlob(message);
  const title = messageShareTitle(message);
  if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], `hermes-reply-${Date.now().toString(36)}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  }
  if (await copyImageBlobToClipboard(blob)) return;
  openImageBlobPreview(blob);
}

function isDraftThread(thread) {
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

function createDraftThread() {
  const now = new Date().toISOString();
  state.draftThreadSeq += 1;
  return {
    id: `draft_${Date.now()}_${state.draftThreadSeq}`,
    title: "New thread",
    workspaceId: state.selectedWorkspaceId,
    projectId: state.selectedProjectId,
    subprojectId: state.selectedSubprojectId || "",
    singleWindow: false,
    draft: true,
    hermesSessionId: "",
    status: "draft",
    activeRunId: null,
    activeRunIds: [],
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    preview: "",
  };
}

async function materializeCurrentThread() {
  if (!isDraftThread(state.currentThread)) return state.currentThread;
  const result = await api("/api/threads", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.currentThread.workspaceId,
      projectId: state.currentThread.projectId,
      subprojectId: state.currentThread.subprojectId || "",
      title: state.currentThread.title || "New thread",
    }),
  });
  const draftId = state.currentThread.id;
  state.currentThread = result.thread;
  state.currentThreadId = result.thread.id;
  state.threads = state.threads.map((thread) => thread.id === draftId ? summarizeThread(result.thread) : thread);
  if (!state.threads.some((thread) => thread.id === result.thread.id)) state.threads.unshift(summarizeThread(result.thread));
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return state.currentThread;
}

function isSharedProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}

function sharedProjectOwnerLabel(project) {
  return String(project?.sharedByLabel || project?.createdByLabel || project?.sharedBy || project?.createdBy || "").trim();
}

function sharedProjectRootOwnerLabel(project) {
  const root = String(project?.root || "").replaceAll("\\", "/");
  const parts = root.split("/").filter(Boolean);
  const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
  if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0) return state.displayConfig.ownerRootFallbackLabel || "Hermes Owner";
  return "";
}

function projectDisplayLabel(project) {
  return project?.label || project?.id || "Project";
}

function routeLabelParts(label) {
  return String(label || "")
    .split(/\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeChildParts(child) {
  const parts = routeLabelParts(child?.label || child?.id);
  const subProject = parts[0] || child?.label || child?.id || "Item";
  return { subProject };
}

function routeGroups(project = currentProject()) {
  const groups = new Map();
  for (const child of project?.children || []) {
    const parts = routeChildParts(child);
    const key = directoryAliasKey(parts.subProject);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: parts.subProject,
        rootChild: null,
      });
    }
    const group = groups.get(key);
    if (
      !group.rootChild ||
      comparableDirectoryPath(child.root).length < comparableDirectoryPath(group.rootChild.root).length
    ) {
      group.rootChild = child;
    }
  }
  return [...groups.values()];
}

function selectDefaultRouteItem(group) {
  if (!group) return "";
  return group.rootChild?.id || "";
}

function persistSelectedSubproject(value) {
  state.selectedSubprojectId = value || "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
}

function currentSearchText() {
  return $("threadSearch")?.value.trim() || "";
}

function updateSearchButton() {
  const button = $("searchButton");
  if (!button) return;
  const search = currentSearchText();
  button.classList.toggle("active", Boolean(search));
  button.textContent = search ? "⌕*" : "⌕";
  button.title = search ? `Search: ${search}` : "Search";
}

async function openSearchPrompt() {
  const next = window.prompt("Search", currentSearchText());
  if (next == null) return;
  $("threadSearch").value = String(next || "").trim();
  updateSearchButton();
  await loadSelectedView();
}

function focusWorkspaceEntry() {
  const select = $("workspaceSelect");
  select?.scrollIntoView({ block: "center", behavior: "smooth" });
  select?.focus();
}

function currentDirectoryTarget() {
  const project = currentProject();
  const target = currentSubproject() || project;
  if (target?.root) return target;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return null;
}

async function openCurrentDirectoryEntry() {
  const target = currentDirectoryTarget();
  if (!target?.root) throw new Error("No directory is selected.");
  await openDirectoryPathInManager(target.root, target.label || target.id || "");
}

function directoryRouteOptions(project = currentProject()) {
  return routeGroups(project)
    .map((group) => ({ id: selectDefaultRouteItem(group), label: group.label }))
    .filter((item) => item.id);
}

function renderDirectorySubprojectOptions(project = currentProject()) {
  const options = directoryRouteOptions(project);
  return [
    `<option value="">Root</option>`,
    ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ].join("");
}

function resetDirectoryPath(path = "", options = {}) {
  state.directoryPath = path || "";
  state.directoryRootPath = Object.prototype.hasOwnProperty.call(options, "rootPath") ? (options.rootPath || "") : (path || "");
  state.directoryPreview = null;
  state.directoryError = "";
  if (!options.keepSharedManager) state.sharedDirectoryManagerOpen = false;
}

function directoryActivePath() {
  return state.directoryPreview?.path || state.directoryPath || "";
}

function directoryParentPath(pathText) {
  const normalized = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!normalized || normalized === "/") return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") || "/";
}

function directoryRootCreateBasePath() {
  const workspace = currentWorkspace();
  const workspaceRoot = String(workspace?.defaultWorkspace || "").trim();
  const rootProjects = directoryRootProjects().filter((project) => {
    if (!project?.root || project.hidden || project.singleWindow || isDirectorySharedRootProject(project)) return false;
    if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
    const source = String(project.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory/.test(source)
      || project.remote === "wsl";
  });
  if (workspaceRoot && rootProjects.some((project) => pathMatchesDirectoryRoot(project.root, workspaceRoot))) {
    return workspaceRoot;
  }
  const parentCounts = new Map();
  for (const project of rootProjects) {
    const parent = directoryParentPath(project.root);
    if (!parent) continue;
    const key = comparableDirectoryPath(parent);
    if (!key) continue;
    const existing = parentCounts.get(key) || { path: parent, count: 0 };
    existing.count += 1;
    parentCounts.set(key, existing);
  }
  const commonParent = [...parentCounts.values()].sort((a, b) => b.count - a.count || a.path.length - b.path.length)[0];
  return commonParent?.path || workspaceRoot || "";
}

function directoryCreateBasePath() {
  return directoryActivePath() || directoryRootCreateBasePath();
}

function matchingDirectoryProject(pathText) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  const selected = currentProject();
  if (selected?.root && pathMatchesDirectoryRoot(active, selected.root)) return selected;
  return (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(active, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
}

function ensureDirectoryRootForPath(pathText) {
  const active = String(pathText || "").trim();
  if (!active) {
    state.directoryRootPath = "";
    return;
  }
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) return;
  const project = matchingDirectoryProject(active);
  state.directoryRootPath = project?.root || currentDirectoryTarget()?.root || active;
}

function directoryRootForPath(pathText, fallbackPath = "") {
  const active = String(pathText || "").trim();
  if (!active) return fallbackPath || "";
  const project = matchingDirectoryProject(active);
  if (project?.root) return project.root;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return workspace.defaultWorkspace;
  }
  const target = currentDirectoryTarget();
  if (target?.root && pathMatchesDirectoryRoot(active, target.root)) return target.root;
  return fallbackPath || active;
}

function isDirectoryAtRouteRoot(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  if (!target?.root) return true;
  const active = comparableDirectoryPath(pathText);
  const root = comparableDirectoryPath(target.root);
  return !active || active === root;
}

function directoryBoundaryTarget(pathText = directoryActivePath()) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) {
    const project = (state.projects || []).find((item) => comparableDirectoryPath(item?.root) === comparableDirectoryPath(state.directoryRootPath));
    return {
      id: project?.id || "directory-root",
      label: project?.label || project?.id || "Directory",
      root: state.directoryRootPath,
    };
  }
  const project = matchingDirectoryProject(active);
  if (project?.root) return project;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return currentDirectoryTarget();
}

function parentDirectoryPath(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  const active = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!active || !target?.root || isDirectoryAtRouteRoot(pathText)) return "";
  const parts = active.split("/");
  if (parts.length <= 1) return "";
  const parent = parts.slice(0, -1).join("/") || "/";
  if (!pathMatchesDirectoryRoot(parent, target.root)) return target.root;
  return parent;
}

function shouldAnimateDirectoryNavigation() {
  return isMobileLayout() && !prefersReducedMotion();
}

function resetDirectorySwipeShell(shell) {
  if (!shell) return;
  shell.classList.remove("directory-dragging", "directory-settling", "directory-entering");
  shell.style.transform = "";
  shell.style.opacity = "";
}

function settleDirectorySwipeShell(shell, accepted) {
  if (!shell) return Promise.resolve();
  if (accepted) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  if (!shouldAnimateDirectoryNavigation()) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  shell.classList.remove("directory-dragging");
  shell.classList.add("directory-settling");
  shell.style.transform = "";
  shell.style.opacity = "";
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resetDirectorySwipeShell(shell);
      resolve();
    }, 180);
  });
}

function animateDirectoryEntry() {
  if (!shouldAnimateDirectoryNavigation()) return;
  requestAnimationFrame(() => {
    const shell = document.querySelector(".directory-shell");
    if (!shell) return;
    shell.classList.add("directory-entering");
    window.setTimeout(() => shell.classList.remove("directory-entering"), 320);
  });
}

async function navigateDirectoryUp(options = {}) {
  if (state.viewMode !== "projects" || state.directoryLoading) return false;
  if (!directoryActivePath()) return false;
  const exitShell = options.exitShell || (options.animateEntry ? document.querySelector(".directory-shell") : null);
  if (exitShell) {
    await settleDirectorySwipeShell(exitShell, true);
  }
  if (state.directoryReturnRoute && isDirectoryAtRouteRoot()) {
    restoreDirectoryReturnRoute();
    return true;
  }
  if (isDirectoryAtRouteRoot()) {
    state.directoryPath = "";
    state.directoryRootPath = "";
    state.directoryPreview = null;
    state.directoryError = "";
    state.sharedDirectoryManagerOpen = false;
    persistSelectedSubproject("");
    await loadDirectoryView();
    if (options.animateEntry) animateDirectoryEntry();
    return true;
  }
  const parent = parentDirectoryPath();
  state.directoryPath = parent || "";
  if (parent) {
    ensureDirectoryRootForPath(parent);
    syncDirectoryRouteFromPath(parent);
  } else {
    state.directoryRootPath = "";
    persistSelectedSubproject("");
  }
  await loadDirectoryView();
  if (options.animateEntry) animateDirectoryEntry();
  return true;
}

async function ensureDirectoryThread() {
  if (state.directoryThreadId && state.directoryThreadWorkspaceId === state.selectedWorkspaceId) {
    return state.directoryThreadId;
  }
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  state.directoryThreadId = result.thread?.id || "";
  state.directoryThreadWorkspaceId = state.selectedWorkspaceId;
  if (!state.directoryThreadId) throw new Error("Directory thread is unavailable.");
  return state.directoryThreadId;
}

function renderDirectorySidebar() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
}

function scrollDirectoryViewToStart() {
  requestAnimationFrame(() => {
    const conversation = $("conversation");
    if (conversation) conversation.scrollTop = 0;
    const shell = document.querySelector(".directory-shell");
    if (shell) shell.scrollTop = 0;
  });
}

async function loadDirectoryView(options = {}) {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (options.resetPath || !state.directoryPath) {
    resetDirectoryPath();
  } else {
    state.sharedDirectoryManagerOpen = false;
  }
  renderDirectorySidebar();
  setComposerEnabled(false);
  if (!state.directoryPath) {
    state.directoryPreview = null;
    state.directoryLoading = false;
    state.directoryError = "";
    renderDirectoryView();
    if (!options.preserveScroll) scrollDirectoryViewToStart();
    return;
  }
  const requestedWorkspaceId = state.selectedWorkspaceId;
  const requestedPath = state.directoryPath;
  state.directoryLoading = true;
  state.directoryError = "";
  renderDirectoryView();
  try {
    const threadId = await ensureDirectoryThread();
    const params = new URLSearchParams({ threadId, path: requestedPath });
    const result = await api(`/api/directories/preview?${params.toString()}`);
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = result;
    state.directoryPath = result.path || requestedPath;
  } catch (err) {
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = null;
    state.directoryError = err.message || String(err);
  } finally {
    if (state.viewMode === "projects" && state.selectedWorkspaceId === requestedWorkspaceId) {
      state.directoryLoading = false;
      renderDirectorySidebar();
      renderDirectoryView();
      if (!options.preserveScroll) scrollDirectoryViewToStart();
    }
  }
}

function directoryHeaderDisplayPath() {
  if (!directoryActivePath()) return "";
  const preview = state.directoryPreview;
  if (preview?.workspacePath || preview?.displayPath) return preview.workspacePath || preview.displayPath;
  const target = currentDirectoryTarget();
  return logicalDirectoryDisplayPath(directoryActivePath(), target?.label || target?.id || "Directory");
}

function syncDirectoryRouteFromPath(pathText) {
  const value = String(pathText || "").trim();
  if (!value) {
    persistSelectedSubproject("");
    return;
  }
  const project = (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  if (!project) return;
  state.selectedProjectId = project.id;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const child = (project.children || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  persistSelectedSubproject(child?.id || "");
  renderSubprojects();
}

function directoryAttachmentFromRoute(projectId, subprojectId = "", pathText = "", label = "") {
  const project = (state.projects || []).find((item) => item.id === projectId);
  if (!project?.root) return null;
  const child = subprojectId ? (project.children || []).find((item) => item.id === subprojectId) : null;
  const routeRoot = child?.root || project.root;
  const requestedPath = String(pathText || "").trim();
  const directoryPath = requestedPath && pathMatchesDirectoryRoot(requestedPath, routeRoot) ? requestedPath : routeRoot;
  const routeLabel = label || directoryRouteDisplayPath(
    { projectId: project.id, subprojectId: child?.id || "", label: child?.label || project.label || project.id, root: routeRoot },
    child ? `${projectDisplayLabel(project)} / ${child.label || child.id}` : projectDisplayLabel(project),
  );
  return {
    projectId: project.id,
    subprojectId: child?.id || "",
    label: routeLabel,
    path: directoryPath,
    root: routeRoot,
  };
}

function directoryAttachmentForFilter(filter = state.taskDirectoryFilter) {
  if (!filter?.projectId) return null;
  if (filter.directory?.projectId && (filter.directory.root || filter.directory.path)) {
    return filter.directory;
  }
  return directoryAttachmentFromRoute(filter.projectId, filter.subprojectId || "", "", filter.label || "");
}

function directoryBreadcrumbItems() {
  const items = [{ label: "目录", path: "" }];
  const active = directoryActivePath();
  if (!active) return items;
  const normalizedActive = String(active || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  const projectMatches = (state.projects || [])
    .filter((project) => project?.root && pathMatchesDirectoryRoot(normalizedActive, project.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const project = projectMatches[0] || null;
  if (!project) {
    items.push({ label: logicalDirectoryDisplayPath(normalizedActive, "Directory"), path: normalizedActive });
    return items;
  }
  items.push({ label: projectDisplayLabel(project), path: project.root });
  const childMatches = (project.children || [])
    .filter((child) => child?.root && pathMatchesDirectoryRoot(normalizedActive, child.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const child = childMatches[0] || null;
  const baseRoot = child?.root || project.root;
  if (child) items.push({ label: child.label || child.id || "Folder", path: child.root });
  const tail = relativeDisplayTailForDirectory(normalizedActive, baseRoot);
  const pathParts = relativeDisplayTailForDirectory(normalizedActive, baseRoot)
    ? String(normalizedActive).slice(String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "").length + 1).split("/").filter(Boolean)
    : [];
  let cursor = String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "");
  for (const segment of pathParts) {
    cursor = `${cursor}/${segment}`;
    items.push({ label: segment, path: cursor });
  }
  if (!tail && items.length === 1) items.push({ label: projectDisplayLabel(project), path: project.root });
  return items;
}

function renderDirectoryBreadcrumb() {
  const items = directoryBreadcrumbItems();
  const crumbs = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const label = escapeHtml(item.label || "Directory");
    return `${index ? `<span class="directory-breadcrumb-separator">/</span>` : ""}<button type="button" data-directory-crumb="${escapeHtml(item.path || "")}"${isLast ? " disabled" : ""}>${label}</button>`;
  }).join("");
  return `<nav class="directory-breadcrumb" aria-label="Directory path">${crumbs}</nav>`;
}

function renderDirectoryControls() {
  const uploadDisabled = directoryActivePath() ? "" : " disabled";
  return `<section class="directory-commandbar">
    ${renderDirectoryBreadcrumb()}
    <div class="directory-command-actions" aria-label="Directory actions">
      <button class="directory-icon-action" type="button" data-directory-refresh aria-label="刷新" title="刷新"><span aria-hidden="true">&#8635;</span></button>
      <button class="directory-icon-action directory-upload-action" type="button" data-directory-upload${uploadDisabled} aria-label="上传" title="上传"><span aria-hidden="true">&#8679;</span></button>
    </div>
    <input id="directoryUploadInput" class="hidden" type="file" multiple>
  </section>`;
}

function directoryEntryKind(entry) {
  if (entry?.type === "directory") return "dir";
  return artifactKind({ name: entry?.name, mime: entry?.mime });
}

function directoryEntryHref(entry) {
  if (entry?.type === "directory") return "#";
  return artifactHref({ url: entry?.url, name: entry?.name, mime: entry?.mime, size: entry?.size });
}

function directoryEntryMeta(entry) {
  if (entry?.type === "directory") return formatTime(entry?.mtime);
  return [formatBytes(entry?.size), formatTime(entry?.mtime)].filter(Boolean).join(" | ");
}

function directorySearchMatches(entry, search) {
  if (!search) return true;
  return [
    entry?.name,
    entry?.displayPath,
    entry?.workspacePath,
    entry?.mime,
  ].filter(Boolean).join("\n").toLowerCase().includes(search);
}

function isDirectorySharedRootProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared)
    || source === "hermes-web-shared-directory"
    || /^shared-allowed-root/.test(source);
}

function orderDirectoryRootProjects(projects) {
  return (projects || [])
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const labelDelta = String(directoryRootProjectLabel(a.project))
        .localeCompare(String(directoryRootProjectLabel(b.project)), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
      return labelDelta || a.index - b.index;
    })
    .map((item) => item.project);
}

function directoryRootProjects() {
  const projects = state.projects || [];
  const managed = projects.filter((project) => {
    const source = String(project?.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory|^shared-allowed-root/.test(source)
      || source === "hermes-web-shared-directory"
      || project?.remote === "wsl";
  });
  const special = projects.filter((project) => project?.source === "acl" && ["sync", "download"].includes(project?.id));
  if (managed.length) return orderDirectoryRootProjects([...managed, ...special]);
  const visible = projects.filter((project) => project?.source !== "workspace-default");
  return orderDirectoryRootProjects(visible.length ? visible : projects);
}

function directoryRootProjectLabel(project) {
  if (project?.id === "sync") return "同步文件夹";
  if (project?.id === "download") return "下载";
  return projectDisplayLabel(project);
}

function renderDirectorySharedBadge(project) {
  return isDirectorySharedRootProject(project) ? `<span class="directory-shared-badge">共享</span>` : "";
}

function isShareableRootProject(project) {
  if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  const source = String(project.source || "");
  return source === "project-directory-map"
    || source === "project-directory-map-top"
    || source === "workspace-directory"
    || source === "workspace-directory-wsl";
}

function canDeleteDirectoryRootProject(project) {
  if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  const source = String(project.source || "");
  return source === "workspace-directory" || source === "workspace-directory-wsl";
}

function renderDirectoryRootProjectMenu(project) {
  const canStartTask = Boolean(project?.root && !project.hidden && !project.singleWindow && !["general", "sync", "download"].includes(String(project.id || "")));
  const canShare = isShareableRootProject(project);
  const canDelete = canDeleteDirectoryRootProject(project);
  if (!canStartTask && !canShare && !canDelete) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${canStartTask ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-project="${escapeHtml(project.id || "")}">开启话题</button>` : ""}
      ${canShare ? `<button class="directory-entry-menu-item" type="button" data-share-root-project="${escapeHtml(project.id || "")}">共享</button>` : ""}
      ${canDelete ? `<button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${escapeHtml(project.root || "")}" data-delete-directory-name="${escapeHtml(directoryRootProjectLabel(project))}" data-delete-directory-type="directory">删除</button>` : ""}
    </div>
  </div>`;
}

function renderDirectoryProjectEntries() {
  const search = currentSearchText().toLowerCase();
  const rootProjects = directoryRootProjects();
  const projects = rootProjects.filter((project) => {
    if (!search) return true;
    return [
      directoryRootProjectLabel(project),
      project.id,
      ...(project.aliases || []),
    ].filter(Boolean).join("\n").toLowerCase().includes(search);
  });
  if (!projects.length) {
    return `<div class="directory-status">${rootProjects.length && search ? "No matching directories." : "No directories."}</div>`;
  }
  return `<div class="directory-entry-list">${projects.map((project) => {
    const sharedClass = isDirectorySharedRootProject(project) ? " shared-root" : "";
    return `<article class="directory-entry dir${sharedClass}">
      <button class="directory-entry-main" type="button" data-open-project-directory="${escapeHtml(project.id || "")}">
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${renderDirectorySharedBadge(project)}<span class="directory-entry-label">${escapeHtml(directoryRootProjectLabel(project))}</span></span>
        </span>
        <span class="directory-entry-chevron">›</span>
      </button>
      ${renderDirectoryRootProjectMenu(project)}
    </article>`;
  }).join("")}</div>`;
}

function renderSharedDirectoryManager() {
  if (state.sharedDirectoriesLoading) {
    return `<section class="shared-directory-manager"><div class="directory-status">Loading shared directories...</div></section>`;
  }
  if (state.sharedDirectoriesError) {
    return `<section class="shared-directory-manager"><div class="directory-status error">${escapeHtml(state.sharedDirectoriesError)}</div></section>`;
  }
  const items = Array.isArray(state.sharedDirectories) ? state.sharedDirectories : [];
  const rows = items.length ? items.map((item) => {
    const targetIds = new Set(Array.isArray(item.targetWorkspaceIds) ? item.targetWorkspaceIds : []);
    const allWorkspaces = item.scope === "all_workspaces";
    const workspaceChoices = state.workspaces.map((workspace) => {
      const checked = targetIds.has(workspace.id) ? " checked" : "";
      return `<label class="shared-directory-target">
        <input type="checkbox" value="${escapeHtml(workspace.id || "")}" data-share-target${checked}>
        <span>${escapeHtml(workspace.label || workspace.id)}</span>
      </label>`;
    }).join("");
    const editingAccess = state.sharedDirectoryAccessId === item.id;
    const controls = item.canManage && editingAccess
      ? `<div class="shared-directory-controls" data-share-controls>
          <label class="shared-directory-field">
            <span>权限</span>
            <select data-share-permission>
              <option value="read_write"${item.permission !== "read_only" ? " selected" : ""}>读写</option>
              <option value="read_only"${item.permission === "read_only" ? " selected" : ""}>只读</option>
            </select>
          </label>
          <label class="shared-directory-target all">
            <input type="checkbox" data-share-all${allWorkspaces ? " checked" : ""}>
            <span>所有工作区</span>
          </label>
          <div class="shared-directory-targets"${allWorkspaces ? " hidden" : ""}>${workspaceChoices}</div>
          <button class="shared-directory-save" type="button" data-save-share-directory-id="${escapeHtml(item.id || "")}">保存权限</button>
        </div>`
      : "";
    const permissionAction = item.canManage
      ? `<button class="shared-directory-permission" type="button" data-edit-share-directory-id="${escapeHtml(item.id || "")}">${editingAccess ? "收起" : "权限"}</button>`
      : "";
    const action = item.canUnshare
      ? `<button class="shared-directory-unshare" type="button" data-unshare-directory-id="${escapeHtml(item.id || "")}">取消共享</button>`
      : "";
    return `<article class="shared-directory-row">
      <span class="directory-entry-icon" aria-hidden="true"></span>
      <span class="shared-directory-text">
        <span class="shared-directory-name">${escapeHtml(item.label || "共享目录")}</span>
        <span class="shared-directory-meta">共享者：${escapeHtml(item.createdByLabel || item.createdBy || "Unknown")}</span>
        <span class="shared-directory-meta">权限：${escapeHtml(item.permissionLabel || "所有工作区 · 读写")}</span>
        ${Array.isArray(item.targetLabels) && item.targetLabels.length ? `<span class="shared-directory-meta">共享给：${escapeHtml(item.targetLabels.join("、"))}</span>` : ""}
        ${controls}
      </span>
      <span class="shared-directory-actions">${permissionAction}${action}</span>
    </article>`;
  }).join("") : `<div class="directory-status">暂无共享目录</div>`;
  return `<section class="shared-directory-manager">
    <header class="shared-directory-header">
      <div>
        <div class="shared-directory-title">共享目录</div>
        <div class="shared-directory-subtitle">仅 Owner 或原共享者可以取消共享。</div>
      </div>
      <button class="shared-directory-close" type="button" data-close-shared-directory-manager>完成</button>
    </header>
    <div class="shared-directory-list">${rows}</div>
  </section>`;
}

function renderDirectoryEntryMenu(entry) {
  const itemPath = escapeHtml(entry.path || "");
  const itemName = escapeHtml(entry.name || "item");
  const itemType = escapeHtml(entry.type || "file");
  const taskAction = entry.type === "directory"
    ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-path="${itemPath}" data-start-directory-task-label="${itemName}">开启话题</button>`
    : "";
  const deleteAction = `<button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${itemPath}" data-delete-directory-name="${itemName}" data-delete-directory-type="${itemType}">删除</button>`;
  if (!taskAction && !deleteAction) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${taskAction}
      ${deleteAction}
    </div>
  </div>`;
}

function renderDirectoryEntries() {
  if (state.directoryLoading) return `<div class="directory-status">${escapeHtml(state.directoryError || "Loading directory...")}</div>`;
  if (state.directoryError) return `<div class="directory-status error">${escapeHtml(state.directoryError)}</div>`;
  if (!directoryActivePath()) return state.sharedDirectoryManagerOpen ? renderSharedDirectoryManager() : renderDirectoryProjectEntries();
  const preview = state.directoryPreview;
  const entries = Array.isArray(preview?.entries) ? preview.entries : [];
  const search = currentSearchText().toLowerCase();
  const visible = entries.filter((entry) => directorySearchMatches(entry, search));
  if (!visible.length) {
    return `<div class="directory-status">${entries.length && search ? "No matching items." : "空目录"}</div>`;
  }
  return `<div class="directory-entry-list">${visible.map((entry) => {
    const kind = directoryEntryKind(entry);
    const meta = directoryEntryMeta(entry);
    const main = entry.type === "directory"
      ? `<button class="directory-entry-main" type="button" data-open-directory-path="${escapeHtml(entry.path || "")}">`
      : `<a class="directory-entry-main" href="${escapeHtml(directoryEntryHref(entry))}" target="_self" rel="noopener">`;
    const close = entry.type === "directory" ? "</button>" : "</a>";
    return `<article class="directory-entry ${escapeHtml(kind)}">
      ${main}
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${escapeHtml(entry.name || "item")}</span>
          ${meta ? `<span class="directory-entry-meta">${escapeHtml(meta)}</span>` : ""}
        </span>
        <span class="directory-entry-chevron">›</span>
      ${close}
      ${renderDirectoryEntryMenu(entry)}
    </article>`;
  }).join("")}</div>`;
}

function renderDirectoryView() {
  if (state.viewMode !== "projects") return;
  const conversation = $("conversation");
  $("threadTitle").textContent = "目录";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  configureComposer({ enabled: false, placeholder: "Directory management" });
  conversation.innerHTML = `<section class="directory-shell">
    ${renderDirectoryControls()}
    ${renderDirectoryEntries()}
  </section>`;
  wireDirectoryView(conversation);
  ensureVerticalScrollAffordance(conversation);
}

async function createDirectoryFolder() {
  const name = window.prompt("新建目录名称");
  if (!name || !name.trim()) return;
  const basePath = directoryCreateBasePath();
  if (!basePath) throw new Error("No directory is selected.");
  const creatingAtRoot = !directoryActivePath();
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/create", {
    method: "POST",
    body: JSON.stringify({ threadId, path: basePath, name: name.trim() }),
  });
  if (creatingAtRoot) {
    await loadProjects();
    resetDirectoryPath();
  }
  await loadDirectoryView();
}

async function uploadDirectoryFiles(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  const threadId = await ensureDirectoryThread();
  try {
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      state.directoryLoading = true;
      state.directoryError = `Uploading ${index + 1}/${list.length}: ${file.name}`;
      renderDirectoryView();
      await api("/api/directories/upload", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          path: directoryActivePath(),
          filename: file.name,
          dataBase64: await fileToBase64(file),
        }),
      });
    }
  } catch (err) {
    state.directoryError = err.message || String(err);
    renderDirectoryView();
    throw err;
  } finally {
    state.directoryLoading = false;
  }
  await loadDirectoryView();
}

function deletedDirectoryWasRootListProject(pathText) {
  const target = comparableDirectoryPath(pathText);
  if (!target) return false;
  return (state.projects || []).some((project) =>
    canDeleteDirectoryRootProject(project) && comparableDirectoryPath(project.root) === target);
}

async function deleteDirectoryEntry(button) {
  const path = button?.dataset?.deleteDirectoryPath || "";
  if (!path) return;
  const wasRootListProject = deletedDirectoryWasRootListProject(path);
  const name = button.dataset.deleteDirectoryName || "item";
  const type = button.dataset.deleteDirectoryType || "file";
  const message = type === "directory"
    ? `删除目录“${name}”？如果目录非空，需要 Owner 高权限批准后才会递归删除。`
    : `删除文件“${name}”？`;
  if (!window.confirm(message)) return;
  const threadId = await ensureDirectoryThread();
  const body = { threadId, path };
  try {
    await api("/api/directories/delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (!shouldOfferOwnerElevation(err)) throw err;
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: ownerElevationConfirmMessage(err),
      detail: err.elevationReason || "",
    });
    if (!ok) return;
    let ownerElevationOnceRequested = false;
    try {
      let onceToken = "";
      if (!ownerElevationActive()) {
        await activateOwnerElevationOnce({ confirm: false });
        onceToken = state.ownerElevationOnceToken;
        ownerElevationOnceRequested = true;
      }
      const elevatedBody = Object.assign({}, body);
      if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
      await api("/api/directories/delete", {
        method: "POST",
        body: JSON.stringify(elevatedBody),
      });
    } finally {
      if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    }
  }
  if (!directoryActivePath() || wasRootListProject) await loadProjects();
  await loadDirectoryView();
}

function closeDirectoryEntryMenus(root = document) {
  root.querySelectorAll(".directory-entry-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".directory-entry")?.classList.remove("menu-open");
    wrap.querySelector(".directory-entry-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".directory-entry-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleDirectoryEntryMenu(button) {
  const wrap = button?.closest?.(".directory-entry-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeDirectoryEntryMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".directory-entry")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".directory-entry-menu");
  if (menu) menu.hidden = false;
}

async function loadSharedDirectories() {
  state.sharedDirectoriesLoading = true;
  state.sharedDirectoriesError = "";
  renderDirectoryView();
  try {
    const result = await api(`/api/directories/shared?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
    state.sharedDirectories = result.data || [];
    if (state.sharedDirectoryAccessId && !state.sharedDirectories.some((item) => item.id === state.sharedDirectoryAccessId)) {
      state.sharedDirectoryAccessId = "";
    }
  } catch (err) {
    state.sharedDirectoriesError = err.message || String(err);
  } finally {
    state.sharedDirectoriesLoading = false;
    renderDirectoryView();
  }
}

async function openSharedDirectoryManager() {
  closeTopMoreMenu();
  if (state.viewMode !== "projects") return;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function closeSharedDirectoryManager() {
  state.sharedDirectoryManagerOpen = false;
  state.sharedDirectoriesError = "";
  state.sharedDirectoryAccessId = "";
  renderDirectoryView();
}

async function shareRootDirectoryProject(button) {
  const projectId = button?.dataset?.shareRootProject || "";
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.root || !isShareableRootProject(project)) return;
  const name = directoryRootProjectLabel(project);
  if (!window.confirm(`共享目录“${name}”？共享后所有工作区都能看到这个目录。`)) return;
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/share", {
    method: "POST",
    body: JSON.stringify({ threadId, path: project.root, name }),
  });
  await loadProjects();
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function selectDirectoryAttachmentRoute(attachment) {
  if (!attachment?.projectId) return;
  state.selectedProjectId = attachment.projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  persistSelectedSubproject(attachment.subprojectId || "");
  renderSubprojects();
}

async function openTaskComposerForDirectoryAttachment(attachment) {
  if (!attachment?.projectId) return;
  closeDirectoryEntryMenus();
  clearQuotedReply({ render: false });
  selectDirectoryAttachmentRoute(attachment);
  state.pendingTaskDirectory = attachment;
  state.taskDirectoryFilter = {
    projectId: attachment.projectId,
    subprojectId: attachment.subprojectId || "",
    label: attachment.label || "",
    directory: attachment,
  };
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  applyViewMode();
  await loadSingleWindow();
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function startTaskFromRootProject(button) {
  const projectId = button?.dataset?.startDirectoryTaskProject || "";
  const project = (state.projects || []).find((item) => item.id === projectId);
  const attachment = directoryAttachmentFromRoute(project?.id || "", "", project?.root || "", project ? directoryRootProjectLabel(project) : "");
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function startTaskFromDirectoryPath(button) {
  const pathText = button?.dataset?.startDirectoryTaskPath || "";
  const label = button?.dataset?.startDirectoryTaskLabel || "";
  const route = resolveDirectoryProjectRoute({ label, path: pathText });
  if (!route) throw new Error("No directory route is available for this folder.");
  const attachment = directoryAttachmentFromRoute(route.projectId, route.subprojectId || "", pathText, logicalDirectoryDisplayPath(pathText, label));
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function unshareDirectory(button) {
  const id = button?.dataset?.unshareDirectoryId || "";
  if (!id) return;
  if (!window.confirm("取消共享这个目录？其他工作区将不再看到它。")) return;
  await api("/api/directories/unshare", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, id }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function toggleSharedDirectoryAccess(button) {
  const id = button?.dataset?.editShareDirectoryId || "";
  state.sharedDirectoryAccessId = state.sharedDirectoryAccessId === id ? "" : id;
  renderDirectoryView();
}

function toggleShareTargetControls(input) {
  const controls = input?.closest?.("[data-share-controls]");
  const targets = controls?.querySelector?.(".shared-directory-targets");
  if (targets) targets.hidden = Boolean(input.checked);
}

async function updateSharedDirectoryAccess(button) {
  const id = button?.dataset?.saveShareDirectoryId || "";
  const controls = button?.closest?.("[data-share-controls]");
  if (!id || !controls) return;
  const allWorkspaces = Boolean(controls.querySelector("[data-share-all]")?.checked);
  const targetWorkspaceIds = [...controls.querySelectorAll("[data-share-target]:checked")]
    .map((input) => input.value)
    .filter(Boolean);
  await api("/api/directories/share/update", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      id,
      permission: controls.querySelector("[data-share-permission]")?.value || "read_write",
      scope: allWorkspaces ? "all_workspaces" : "selected_workspaces",
      targetWorkspaceIds,
    }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function wireDirectorySwipe(root) {
  const shell = root.querySelector(".directory-shell");
  if (!shell) return;
  if (shell.dataset.directorySwipeBound) return;
  shell.dataset.directorySwipeBound = "1";
  const interactiveSelector = ".directory-entry-menu-wrap, .directory-commandbar, input, select, textarea, [contenteditable='true']";
  const clearSwipe = () => {
    state.directorySwipe = null;
  };
  const canSwipeDirectoryUp = () => (
    isMobileLayout()
    && state.viewMode === "projects"
    && !state.directoryLoading
    && Boolean(directoryActivePath())
  );
  shell.addEventListener("touchstart", (event) => {
    if (!canSwipeDirectoryUp() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      clearSwipe();
      return;
    }
    const point = event.touches[0];
    state.directorySwipe = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      dragging: false,
      accepted: false,
      shell,
    };
  }, { passive: true });
  shell.addEventListener("touchmove", (event) => {
    const swipe = state.directorySwipe;
    if (!swipe || !canSwipeDirectoryUp() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - swipe.startX;
    const dy = point.clientY - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    swipe.dragging = true;
    swipe.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const velocity = dx / elapsed;
    swipe.accepted = dx > 58 || velocity > 0.55;
    const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
    shell.classList.add("directory-dragging");
    shell.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
    shell.style.opacity = "";
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false });
  shell.addEventListener("touchend", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (!swipe?.dragging) return;
    if (swipe.accepted) {
      navigateDirectoryUp({ exitShell: swipe.shell, animateEntry: true }).catch(showError);
    } else {
      settleDirectorySwipeShell(swipe.shell, false);
    }
  }, { passive: true });
  shell.addEventListener("touchcancel", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (swipe?.dragging) settleDirectorySwipeShell(swipe.shell, false);
  }, { passive: true });
}

function wireDirectoryView(root) {
  wireDirectorySwipe(root);
  root.querySelector("[data-directory-refresh]")?.addEventListener("click", () => loadDirectoryView().catch(showError));
  root.querySelector("[data-directory-new]")?.addEventListener("click", () => createDirectoryFolder().catch(showError));
  const uploadInput = root.querySelector("#directoryUploadInput");
  root.querySelector("[data-directory-upload]")?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", () => uploadDirectoryFiles(uploadInput.files).catch(showError));
  root.querySelectorAll("[data-directory-entry-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDirectoryEntryMenu(button);
    });
  });
  root.querySelectorAll(".directory-entry-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-directory-crumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.directoryCrumb || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-project-directory]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.openProjectDirectory || "";
      const project = state.projects.find((item) => item.id === projectId);
      if (!project?.root) return;
      state.selectedProjectId = project.id;
      localStorage.setItem("hermesWebProject", state.selectedProjectId);
      if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
      persistSelectedSubproject("");
      renderSubprojects();
      state.directoryPath = project.root;
      state.directoryRootPath = project.root;
      state.sharedDirectoryManagerOpen = false;
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-directory-path]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.openDirectoryPath || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-share-root-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      shareRootDirectoryProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromRootProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromDirectoryPath(button).catch(showError);
    });
  });
  root.querySelector("[data-close-shared-directory-manager]")?.addEventListener("click", () => {
    closeSharedDirectoryManager();
  });
  root.querySelectorAll("[data-unshare-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      unshareDirectory(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-edit-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSharedDirectoryAccess(button);
    });
  });
  root.querySelectorAll("[data-share-all]").forEach((input) => {
    input.addEventListener("change", () => toggleShareTargetControls(input));
  });
  root.querySelectorAll("[data-save-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateSharedDirectoryAccess(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-delete-directory-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      deleteDirectoryEntry(button).catch(showError);
    });
  });
}

function renderSubprojects() {
  const subprojectSelect = $("subprojectSelect");
  const project = currentProject();
  const options = directoryRouteOptions(project);
  if (!options.length) {
    persistSelectedSubproject("");
    subprojectSelect.innerHTML = `<option value="">Root</option>`;
    subprojectSelect.disabled = true;
    return;
  }
  if (!options.some((item) => item.id === state.selectedSubprojectId)) {
    persistSelectedSubproject("");
  }
  subprojectSelect.disabled = false;
  subprojectSelect.innerHTML = renderDirectorySubprojectOptions(project);
  subprojectSelect.value = state.selectedSubprojectId || "";
}

function applyViewMode() {
  const single = state.viewMode === "single";
  const tasks = state.viewMode === "tasks";
  const directory = state.viewMode === "projects";
  const automation = state.viewMode === "automation";
  const learning = state.viewMode === "learning";
  const todos = state.viewMode === "todos";
  if (!(single && state.singleWindowMode === "chat")) renderChatScopeHeader(null);
  $("app")?.classList.toggle("todo-mode", todos);
  $("app")?.classList.toggle("automation-mode", automation);
  $("app")?.classList.toggle("learning-mode", learning);
  $("app")?.classList.toggle("projects-mode", directory);
  $("chatManagementMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("taskManagementMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("bottomChatMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("bottomTasksMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("singleMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("singleTaskMode")?.classList.toggle("active", single && state.singleWindowMode === "task");
  $("tasksMode")?.classList.toggle("active", tasks);
  $("projectsMode").classList.toggle("active", directory);
  $("bottomProjectsMode")?.classList.toggle("active", directory);
  $("automationMode")?.classList.toggle("active", automation);
  $("bottomAutomationMode")?.classList.toggle("active", automation);
  $("learningMode")?.classList.toggle("active", learning);
  $("bottomLearningMode")?.classList.toggle("active", learning);
  $("todosMode").classList.toggle("active", todos);
  $("bottomTodosMode")?.classList.toggle("active", todos);
  $("taskModeControls")?.classList.add("hidden");
  $("routeFields").classList.add("hidden");
  $("directoryEntry")?.classList.add("hidden");
  $("directoryEntry")?.parentElement?.classList.add("hidden");
  $("newThread").classList.toggle("hidden", single || tasks || automation || learning || directory || todos);
  $("newThread").disabled = single || tasks || automation || learning || directory || todos;
  $("newThread").textContent = todos ? "新建看板卡片" : "新建话题";
  $("threadSearch").placeholder = single ? (state.singleWindowMode === "chat" ? "Search chat" : "Search topic stream") : tasks ? "Search topics" : todos ? "Search Kanban" : automation ? "Search automations" : learning ? "Search coins" : "Search directories";
  updateSearchButton();
}

async function loadSelectedView() {
  if (state.viewMode !== "projects") state.directoryReturnRoute = null;
  if (state.viewMode !== "todos") clearTodoAutoRefresh();
  applyViewMode();
  if (state.viewMode !== "tasks") state.skillDetail = null;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (state.viewMode === "tasks" && !state.currentTaskGroupId && restoreTaskListThreadFromCache({ stickToBottom: true })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    await loadSingleWindow();
  } else if (state.viewMode === "todos") {
    await loadTodos({ preferCache: true });
    if (state.pendingReadingQuizTodoId && state.pendingReadingQuizTodoId === state.selectedTodoId) {
      const todoId = state.pendingReadingQuizTodoId;
      state.pendingReadingQuizTodoId = "";
      await loadReadingQuiz(todoId);
    }
    if (state.pendingAssessmentExamTodoId && state.pendingAssessmentExamTodoId === state.selectedTodoId) {
      const todoId = state.pendingAssessmentExamTodoId;
      state.pendingAssessmentExamTodoId = "";
      await loadAssessmentExam(todoId);
    }
  } else if (state.viewMode === "automation") {
    await loadAutomations();
  } else if (state.viewMode === "learning") {
    await loadLearningCoins();
  } else if (state.viewMode === "projects") {
    await loadDirectoryView();
  } else {
    await loadThreads();
  }
}

function renderAutomationPlaceholderView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) {
    list.innerHTML = `<div class="empty-state small">自动化管理入口已预留；后续接入 Hermes CRON / automation API。</div>`;
  }
  $("threadTitle").textContent = "自动化";
  $("threadMeta").textContent = "Automation management";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Automation management" });
  $("conversation").innerHTML = `
    <div class="empty-state">
      自动化入口已独立出来。当前版本尚未接入任务创建、暂停、运行接口；后续应直接桥接 Hermes CRON 的任务列表、运行状态和触发操作。
    </div>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function learningCoinStudentId() {
  return state.selectedWorkspaceId || "owner";
}

function learningCoinRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("studentId", learningCoinStudentId());
  params.set("limit", String(options.limit || 30));
  return params;
}

function learningCoinCurrentScopeKey() {
  return `${state.selectedWorkspaceId || "owner"}:${learningCoinStudentId()}`;
}

function resetLearningCoinsState() {
  state.learningCoinRequestSeq += 1;
  state.learningCoins = null;
  state.learningCoinsError = "";
  state.learningCoinScopeKey = learningCoinCurrentScopeKey();
}

function formatCoins(value) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount : 0} 金币`;
}

function formatRmbCents(cents) {
  if (cents === null || cents === undefined || cents === "") return "人民币规则待设置";
  const value = Number(cents);
  if (!Number.isFinite(value)) return "人民币规则待设置";
  return `¥${(value / 100).toFixed(2)}`;
}

function learningCoinRewardCards(summary) {
  const rewards = summary?.rewards || [];
  if (!rewards.length) {
    return `<div class="learning-coin-empty">奖励池还没有配置。Owner 可以先添加可兑换项目，人民币结算规则后续再细化。</div>`;
  }
  const available = Number(summary?.balances?.availableCoins || 0);
  return rewards.map((reward) => {
    const affordable = available >= Number(reward.coinCost || 0);
    return `<article class="learning-reward-card">
      <div class="learning-reward-main">
        <div class="learning-reward-title">${escapeHtml(reward.title || "奖励")}</div>
        ${reward.description ? `<div class="learning-reward-description">${escapeHtml(reward.description)}</div>` : ""}
      </div>
      <div class="learning-reward-meta">
        <span>${escapeHtml(formatCoins(reward.coinCost))}</span>
        <span>${escapeHtml(formatRmbCents(reward.rmbCents))}</span>
      </div>
      <button class="learning-coin-primary" type="button" data-learning-redeem="${escapeHtml(reward.id)}" ${affordable ? "" : "disabled"}>${affordable ? "申请兑换" : "金币不足"}</button>
    </article>`;
  }).join("");
}

function learningCoinLedgerRows(summary) {
  const ledger = summary?.ledger || [];
  if (!ledger.length) return `<div class="learning-coin-empty">暂无金币流水。</div>`;
  return ledger.map((entry) => {
    const positive = Number(entry.coinDelta || 0) >= 0;
    return `<div class="learning-ledger-row">
      <div>
        <div class="learning-ledger-title">${escapeHtml(entry.reason || entry.type || "金币记录")}</div>
        <div class="learning-ledger-meta">${escapeHtml([entry.sourceType, entry.sourceId, formatTime(entry.createdAt)].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="learning-ledger-amount ${positive ? "positive" : "negative"}">${positive ? "+" : ""}${escapeHtml(formatCoins(entry.coinDelta))}</div>
    </div>`;
  }).join("");
}

function learningCoinRedemptionRows(summary) {
  const redemptions = summary?.redemptions || [];
  if (!redemptions.length) return `<div class="learning-coin-empty">暂无兑换申请。</div>`;
  return redemptions.map((item) => `<div class="learning-redemption-row">
    <div>
      <div class="learning-ledger-title">${escapeHtml(item.rewardTitle || item.rewardId || "兑换申请")}</div>
      <div class="learning-ledger-meta">${escapeHtml([item.status, formatTime(item.requestedAt)].filter(Boolean).join(" · "))}</div>
    </div>
    <div class="learning-ledger-amount negative">${escapeHtml(formatCoins(item.coinCost))}</div>
  </div>`).join("");
}

function learningCoinDailyBars(growth) {
  const days = Array.isArray(growth?.recentDays) ? growth.recentDays : [];
  if (!days.length) return `<div class="learning-coin-empty">暂无最近 7 天记录。</div>`;
  const maxCoins = Math.max(1, ...days.map((day) => Number(day.coins || 0)));
  return `<div class="learning-growth-days">${days.map((day) => {
    const coins = Number(day.coins || 0);
    const pct = Math.max(4, Math.round((coins / maxCoins) * 100));
    return `<div class="learning-growth-day">
      <div class="learning-growth-bar" style="height:${pct}%"></div>
      <span>${escapeHtml(String(day.date || "").slice(5) || "--")}</span>
      <strong>${escapeHtml(String(coins))}</strong>
    </div>`;
  }).join("")}</div>`;
}

function learningCoinRewardProgress(growth) {
  const bestReward = growth?.bestRewardProgress || null;
  const allRewards = Array.isArray(growth?.rewardProgress) ? growth.rewardProgress : [];
  const rewards = bestReward
    ? [bestReward].concat(allRewards.filter((reward) => reward?.id !== bestReward.id)).slice(0, 4)
    : allRewards;
  if (!rewards.length) return `<div class="learning-coin-empty">配置奖励后会显示兑换进度。</div>`;
  return rewards.map((reward) => {
    const pct = Math.max(0, Math.min(100, Number(reward.progressPct || 0)));
    const status = reward.affordable ? "可兑换" : `还差 ${formatCoins(reward.remainingCoins)}`;
    return `<div class="learning-growth-reward">
      <div class="learning-growth-reward-top">
        <strong>${escapeHtml(reward.title || reward.id || "奖励")}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <div class="learning-growth-progress" aria-label="${escapeHtml(`${pct}%`)}"><span style="width:${pct}%"></span></div>
      <div class="learning-ledger-meta">${escapeHtml(`${formatCoins(reward.coinCost)} · ${formatRmbCents(reward.rmbCents)}`)}</div>
    </div>`;
  }).join("");
}

function learningCoinGrowthPanel(summary) {
  const growth = summary?.growth || {};
  const level = growth.level || {};
  const current = level.current || {};
  const next = level.next || null;
  const levelTitle = current.title ? `Lv.${current.level} ${current.title}` : "Lv.1 新手探险家";
  const nextText = next ? `距离 Lv.${next.level} ${next.title} 还差 ${formatCoins(level.toNextLevelCoins)}` : "已达到当前最高等级";
  const progress = Math.max(0, Math.min(100, Number(level.progressPct || 0)));
  return `<section class="learning-coin-panel learning-growth-panel">
    <div class="learning-section-heading">
      <h3>成长档案</h3>
      <span>最近 7 天</span>
    </div>
    <div class="learning-growth-summary">
      <div class="learning-growth-level">
        <div class="learning-coin-eyebrow">${escapeHtml(levelTitle)}</div>
        <strong>${escapeHtml(formatCoins(growth.totalEarnedCoins))}</strong>
        <div class="learning-growth-progress" aria-label="${escapeHtml(`${progress}%`)}"><span style="width:${progress}%"></span></div>
        <small>${escapeHtml(nextText)}</small>
      </div>
      <div class="learning-growth-metrics">
        <span><strong>${escapeHtml(formatCoins(growth.sevenDayCoins))}</strong><small>7 天获得</small></span>
        <span><strong>${escapeHtml(String(growth.activeDaysInLast7 || 0))} 天</strong><small>7 天活跃</small></span>
        <span><strong>${escapeHtml(String(growth.streakDays || 0))} 天</strong><small>连续获得</small></span>
      </div>
    </div>
    ${learningCoinDailyBars(growth)}
    <div class="learning-growth-rewards">
      <div class="learning-section-heading compact"><h3>兑换进度</h3><span>按差额排序</span></div>
      ${learningCoinRewardProgress(growth)}
    </div>
  </section>`;
}

function learningCoinOwnerForm() {
  if (!state.auth?.isOwner) return "";
  return `<section class="learning-coin-panel learning-coin-owner-panel">
    <div class="learning-section-heading">
      <h3>奖励池</h3>
      <span>Owner</span>
    </div>
    <form id="learningRewardForm" class="learning-reward-form">
      <input id="learningRewardTitle" class="input" type="text" placeholder="奖励名称" autocomplete="off">
      <input id="learningRewardCost" class="input" type="number" min="1" step="1" placeholder="金币">
      <input id="learningRewardRmb" class="input" type="number" min="0" step="0.01" placeholder="人民币，可留空">
      <textarea id="learningRewardDescription" class="input" rows="2" placeholder="说明，可留空"></textarea>
      <button class="learning-coin-primary" type="submit">保存奖励</button>
    </form>
  </section>`;
}

function renderLearningCoinsView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = `<div class="empty-state small">金币、奖励和兑换集中在这个标签。</div>`;
  $("threadTitle").textContent = "金币";
  $("threadMeta").textContent = "Learning coins";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "金币与兑换" });
  const summary = state.learningCoins || {};
  const balances = summary.balances || {};
  const loading = state.learningCoinsLoading ? `<div class="learning-coin-loading">正在刷新金币...</div>` : "";
  const error = state.learningCoinsError ? `<div class="automation-error">${escapeHtml(state.learningCoinsError)}</div>` : "";
  $("conversation").innerHTML = `<div class="learning-coin-view">
    <section class="learning-coin-hero">
      <div>
        <div class="learning-coin-eyebrow">${escapeHtml(summary.studentId || learningCoinStudentId())}</div>
        <h2>${escapeHtml(formatCoins(balances.availableCoins))}</h2>
        <p>可用金币。兑换申请会先冻结金币，Owner 审核后再结算。</p>
      </div>
      <div class="learning-coin-stats">
        <span><strong>${escapeHtml(formatCoins(balances.heldCoins))}</strong><small>冻结中</small></span>
        <span><strong>${escapeHtml(formatCoins(balances.earnedCoins))}</strong><small>累计获得</small></span>
        <span><strong>${escapeHtml(formatCoins(balances.spentCoins))}</strong><small>已结算</small></span>
      </div>
    </section>
    ${loading}
    ${error}
    ${learningCoinGrowthPanel(summary)}
    <section class="learning-coin-panel">
      <div class="learning-section-heading">
        <h3>兑换</h3>
        <span>${escapeHtml(summary?.settlement?.currency || "CNY")}</span>
      </div>
      <div class="learning-reward-list">${learningCoinRewardCards(summary)}</div>
    </section>
    <section class="learning-coin-grid">
      <div class="learning-coin-panel">
        <div class="learning-section-heading"><h3>金币流水</h3><span>最近记录</span></div>
        ${learningCoinLedgerRows(summary)}
      </div>
      <div class="learning-coin-panel">
        <div class="learning-section-heading"><h3>兑换申请</h3><span>审核状态</span></div>
        ${learningCoinRedemptionRows(summary)}
      </div>
    </section>
    ${learningCoinOwnerForm()}
  </div>`;
  wireLearningCoinsView();
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

async function loadLearningCoins(options = {}) {
  const seq = ++state.learningCoinRequestSeq;
  const scopeKey = learningCoinCurrentScopeKey();
  if (state.learningCoinScopeKey !== scopeKey) {
    state.learningCoins = null;
    state.learningCoinScopeKey = scopeKey;
  }
  state.learningCoinsLoading = true;
  state.learningCoinsError = "";
  renderLearningCoinsView();
  try {
    const result = await api(`/api/learning-coins/summary?${learningCoinRequestParams(options)}`);
    if (seq !== state.learningCoinRequestSeq || scopeKey !== learningCoinCurrentScopeKey()) return;
    state.learningCoins = result;
  } catch (err) {
    if (seq !== state.learningCoinRequestSeq || scopeKey !== learningCoinCurrentScopeKey()) return;
    state.learningCoinsError = err.message || String(err);
  } finally {
    if (seq === state.learningCoinRequestSeq) {
      state.learningCoinsLoading = false;
      renderLearningCoinsView();
    }
  }
}

async function requestLearningCoinRedemption(rewardId) {
  const body = {
    workspaceId: state.selectedWorkspaceId || "owner",
    studentId: learningCoinStudentId(),
    rewardId,
    idempotencyKey: `redeem:${learningCoinStudentId()}:${rewardId}:${Date.now()}`,
  };
  await api("/api/learning-coins/redemptions", { method: "POST", body: JSON.stringify(body) });
  showPushToast("兑换申请已提交", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningRewardForm(event) {
  event?.preventDefault?.();
  const title = $("learningRewardTitle")?.value?.trim() || "";
  const coinCost = Number($("learningRewardCost")?.value || 0);
  const rmbValue = $("learningRewardRmb")?.value;
  const description = $("learningRewardDescription")?.value?.trim() || "";
  if (!title || !coinCost) {
    showPushToast("奖励名称和金币数不能为空", "error");
    return;
  }
  const body = {
    title,
    coinCost,
    description,
    rmbCents: rmbValue === "" ? null : Math.round(Number(rmbValue) * 100),
  };
  await api("/api/learning-coins/rewards", { method: "POST", body: JSON.stringify(body) });
  showPushToast("奖励已保存", "success");
  await loadLearningCoins({ limit: 30 });
}

function wireLearningCoinsView() {
  $("conversation")?.querySelectorAll("[data-learning-redeem]").forEach((button) => {
    button.addEventListener("click", () => requestLearningCoinRedemption(button.dataset.learningRedeem).catch(showError));
  });
  $("learningRewardForm")?.addEventListener("submit", (event) => {
    submitLearningRewardForm(event).catch(showError);
  });
}

function automationRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("includeDisabled", "1");
  params.set("limit", "200");
  const search = currentSearchText();
  if (search) params.set("search", search);
  if (options.refresh) params.set("refresh", "1");
  return params;
}

function automationRequestCacheKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  return copy.toString();
}

async function loadAutomations(options = {}) {
  const params = automationRequestParams(options);
  const cacheKey = automationRequestCacheKey(params);
  const cacheFresh = state.automationCacheKey === cacheKey
    && state.automationLastLoadedAt
    && Date.now() - state.automationLastLoadedAt < 10000;
  if (!options.refresh && cacheFresh) {
    renderAutomationView();
    setComposerEnabled(false);
    return;
  }
  const seq = ++state.automationRequestSeq;
  state.automationLoading = true;
  if (state.automations.length) {
    $("connectionState").textContent = "刷新 CRON";
  }
  renderAutomationView();
  let result;
  try {
    result = await api(`/api/automations?${params}`);
  } catch (err) {
    if (seq === state.automationRequestSeq) {
      state.automationLoading = false;
      renderAutomationView();
    }
    throw err;
  }
  if (seq !== state.automationRequestSeq) return;
  state.automations = result.data || [];
  state.automationSource = Object.assign({}, result.source || {}, { warning: result.warning || "" });
  state.automationCacheKey = cacheKey;
  state.automationLastLoadedAt = Date.now();
  state.automationLoading = false;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (state.selectedAutomationId && !state.automations.some((job) => job.id === state.selectedAutomationId)) {
    state.selectedAutomationId = "";
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.automationOutputHistoryOpen = false;
  }
  updateSearchButton();
  renderAutomationView();
  setComposerEnabled(false);
  $("connectionState").textContent = "Hermes OK";
}

function automationStatusLabel(job) {
  const status = String(job?.status || "");
  if (status === "error") return "error";
  if (status === "paused") return "paused";
  if (status === "completed") return "done";
  return "scheduled";
}

function automationStatusDotTone(job, status = automationStatusLabel(job)) {
  const current = String(status || "").toLowerCase();
  const last = String(job?.lastStatus || job?.last_status || "").toLowerCase();
  if (
    current === "error" ||
    last === "error" ||
    last === "failed" ||
    last === "failure" ||
    job?.lastError ||
    job?.lastDeliveryError
  ) {
    return "error";
  }
  const normalCurrent = ["scheduled", "running", "ok", "done", "completed", "success", "succeeded"];
  const normalLast = ["", "ok", "done", "completed", "success", "succeeded"];
  if (normalCurrent.includes(current) && normalLast.includes(last)) return "ok";
  return "info";
}

function renderAutomationStatusSummary(job, status = automationStatusLabel(job)) {
  const tone = automationStatusDotTone(job, status);
  const lastRun = formatTime(job?.lastRunAt) || "--";
  const label = `${status} | ${lastRun}`;
  return `<span class="automation-state automation-state-summary ${escapeHtml(tone)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <span class="automation-state-time">${escapeHtml(lastRun)}</span>
    <span class="automation-state-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
  </span>`;
}

function currentAutomation() {
  return state.automations.find((job) => job.id === state.selectedAutomationId) || null;
}

function automationTitle(job) {
  return compactDisplayText(job?.name || job?.id || "Cron job", 120);
}

function automationGoalLine(job, max = 190) {
  const goal = compactDisplayText(
    job?.promptPreview || job?.goal || job?.description || job?.name || "",
    max,
  );
  return goal || automationTitle(job);
}

function automationScheduleLine(job) {
  const schedule = job?.schedule || "unscheduled";
  const repeat = job?.repeat || "";
  return repeat ? `${schedule} | ${repeat}` : schedule;
}

function automationTimeParts(job) {
  return [
    job?.lastRunAt ? ["上次执行", formatTime(job.lastRunAt)] : null,
    job?.nextRunAt ? ["下次执行", formatTime(job.nextRunAt)] : null,
  ].filter(Boolean);
}

function automationTimeLine(job) {
  const parts = automationTimeParts(job);
  return parts.length ? parts.map(([label, value]) => `${label} ${value}`).join(" | ") : "暂无执行时间";
}

function automationSourceLine() {
  const source = state.automationSource || {};
  if (source.available === false) return "Hermes CRON source unavailable";
  const count = Number(source.jobCount ?? state.automations.length);
  return `Hermes CRON | ${count} job${count === 1 ? "" : "s"}`;
}

function automationLatestDocument(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  return docs[0] || null;
}

function automationOutputHref(doc) {
  try {
    const url = new URL(doc?.url || "#", window.location.origin);
    if (url.pathname === "/api/automations/output" || url.pathname === "/api/automations/deliverable") {
      url.searchParams.set("workspaceId", state.selectedWorkspaceId || "owner");
    }
    return artifactHref(Object.assign({}, doc, { url: `${url.pathname}${url.search}` }));
  } catch (_) {
    return "#";
  }
}

function renderAutomationDocumentPreview(doc, options = {}) {
  if (!doc) return "";
  const kind = artifactKind(doc);
  const name = doc.name || "document";
  const meta = [formatBytes(doc.size), formatTime(doc.updatedAt)].filter(Boolean).join(" | ");
  const classes = [
    "automation-doc-preview",
    `doc-${kind}`,
    options.compact ? "compact" : "",
    options.history ? "history" : "",
  ].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(classes)}" href="${escapeHtml(automationOutputHref(doc))}" target="_self" aria-label="${escapeHtml(`预览 ${name}`)}">
    <span class="automation-doc-icon" aria-hidden="true"></span>
    <span class="automation-doc-copy">
      <span class="automation-doc-label">${escapeHtml(options.label || "最后交付")}</span>
      <span class="automation-doc-name">${escapeHtml(name)}</span>
      ${meta && !options.compact ? `<span class="automation-doc-meta">${escapeHtml(meta)}</span>` : ""}
    </span>
  </a>`;
}

function renderAutomationLoading(message = "正在刷新 Hermes CRON") {
  return `<div class="automation-loading" role="status" aria-live="polite">
    <span class="automation-loading-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  </div>`;
}

function renderAutomationList() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
  return;
}

function renderAutomationView() {
  applyViewMode();
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  renderAutomationList();
  renderAutomationPanel();
}

function renderAutomationPanel() {
  const conversation = $("conversation");
  const selected = currentAutomation();
  $("threadTitle").textContent = "Hermes CRON";
  $("threadMeta").textContent = selected ? automationSourceLine() : "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Hermes CRON" });
  updateNavigationControls();
  const warning = state.automationSource?.available === false || state.automationSource?.warning
    ? `<div class="automation-warning">${escapeHtml(state.automationSource?.warning || "Hermes CRON source is unavailable.")}</div>`
    : "";
  const loading = state.automationLoading ? renderAutomationLoading(selected ? "正在刷新任务状态" : "正在刷新自动化列表") : "";
  conversation.innerHTML = `
    <section class="automation-shell">
      ${warning}
      ${loading}
      ${selected ? "" : renderAutomationCreatePanel()}
      ${selected && state.automationEditOpen && state.automationEditJobId === selected.id ? renderAutomationEditPanel(selected) : ""}
      ${selected ? renderAutomationDetail(selected) : renderAutomationSections()}
    </section>
  `;
  conversation.querySelectorAll("[data-automation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.automationId || "";
      if (state.selectedAutomationId !== nextId) state.automationOutputHistoryOpen = false;
      state.selectedAutomationId = nextId;
      state.automationEditOpen = false;
      state.automationEditJobId = "";
      renderAutomationView();
    });
  });
  conversation.querySelector("[data-toggle-automation-output-history]")?.addEventListener("click", () => {
    state.automationOutputHistoryOpen = !state.automationOutputHistoryOpen;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-create]")?.addEventListener("click", () => {
    state.automationCreateOpen = false;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-edit]")?.addEventListener("click", () => {
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    renderAutomationView();
  });
  conversation.querySelector("#automationCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createAutomationFromForm(conversation).catch(showError);
  });
  conversation.querySelector("#automationEditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateAutomationFromForm(conversation).catch(showError);
  });
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function renderAutomationCreatePanel() {
  if (!state.automationCreateOpen) return "";
  return `<form id="automationCreateForm" class="automation-create">
    <label class="automation-create-label" for="automationNaturalText">新建自动化</label>
    <textarea id="automationNaturalText" class="automation-create-input" rows="4" placeholder="用自然语言描述要做什么、什么时候执行、需要生成什么交付文件"></textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-create>取消</button>
      <button class="primary-small" type="submit">创建</button>
    </div>
  </form>`;
}

function renderAutomationEditPanel(job) {
  const prompt = job?.prompt || job?.promptPreview || "";
  const schedule = job?.scheduleText || job?.schedule || "";
  return `<form id="automationEditForm" class="automation-create automation-edit" data-automation-edit-id="${escapeHtml(job?.id || "")}">
    <label class="automation-create-label" for="automationEditName">${"\u4fee\u6539\u81ea\u52a8\u5316"}</label>
    <input id="automationEditName" class="automation-create-line" type="text" value="${escapeHtml(job?.name || automationTitle(job))}" placeholder="${"\u540d\u79f0"}">
    <input id="automationEditSchedule" class="automation-create-line" type="text" value="${escapeHtml(schedule)}" placeholder="0 8 * * *">
    <textarea id="automationEditPrompt" class="automation-create-input" rows="4" placeholder="${"\u4efb\u52a1\u76ee\u6807"}">${escapeHtml(prompt)}</textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-edit>${"\u53d6\u6d88"}</button>
      <button class="primary-small" type="submit">${"\u4fdd\u5b58"}</button>
    </div>
  </form>`;
}

function renderAutomationSections() {
  if (!state.automations.length) {
    return `<div class="empty-state">No Hermes CRON jobs are available.</div>`;
  }
  const active = state.automations.filter((job) => automationStatusLabel(job) !== "paused");
  const paused = state.automations.filter((job) => automationStatusLabel(job) === "paused");
  return `
    <div class="automation-section">
      <div class="automation-section-title">Active / scheduled | ${active.length}</div>
      <div class="automation-card-list">${active.map(renderAutomationCard).join("") || `<div class="empty-state small">No active CRON jobs.</div>`}</div>
    </div>
    <div class="automation-section automation-section-muted">
      <div class="automation-section-title">Paused | ${paused.length}</div>
      <div class="automation-card-list">${paused.map(renderAutomationCard).join("") || `<div class="empty-state small">No paused CRON jobs.</div>`}</div>
    </div>
  `;
}

function renderAutomationCard(job) {
  const status = automationStatusLabel(job);
  const latestDoc = automationLatestDocument(job);
  return `<article class="automation-card ${escapeHtml(status)}">
    <button class="automation-card-main" type="button" data-automation-id="${escapeHtml(job.id)}">
      <span class="automation-card-title">${escapeHtml(automationTitle(job))}</span>
    </button>
    ${renderAutomationStatusSummary(job, status)}
    ${latestDoc ? `<div class="automation-card-doc">${renderAutomationDocumentPreview(latestDoc, { compact: true })}</div>` : ""}
  </article>`;
}

function renderAutomationOutputLinks(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  if (!docs.length) return "";
  const latestDoc = docs[0];
  const history = docs.slice(1);
  const historyOpen = state.automationOutputHistoryOpen && history.length;
  return `<section class="automation-output-docs">
    <div class="automation-output-title">${"\u4ea4\u4ed8\u6587\u4ef6"}</div>
    <div class="automation-output-current">
      ${renderAutomationDocumentPreview(latestDoc)}
      <button class="automation-output-folder" type="button" data-toggle-automation-output-history aria-label="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" title="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" aria-expanded="${historyOpen ? "true" : "false"}" ${history.length ? "" : "disabled"}></button>
    </div>
    ${historyOpen ? `<div class="automation-output-history">
      ${history.map((doc) => renderAutomationDocumentPreview(doc, { label: "\u5386\u53f2\u4ea4\u4ed8", history: true })).join("")}
    </div>` : ""}
  </section>`;
}

function renderAutomationDetailLegacy(job) {
  const status = automationStatusLabel(job);
  const rows = [
    ["任务 ID", job.id],
    ["状态", status],
    ["计划", automationScheduleLine(job)],
    ["上次执行", job.lastRunAt ? formatTime(job.lastRunAt) : ""],
    ["下次执行", job.nextRunAt ? formatTime(job.nextRunAt) : ""],
    ["上次结果", job.lastStatus || ""],
    ["投递", job.deliver || ""],
    ["负责人", job.ownerPrincipalId || ""],
    ["模型", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["技能", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${automationTimeParts(job).map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("") || `<div><strong>执行时间</strong><span>暂无执行记录</span></div>`}
    </div>
    <div class="automation-detail-grid">
      ${rows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview">${escapeHtml(job.promptPreview)}</div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function renderAutomationDetail(job) {
  const status = automationStatusLabel(job);
  const meta = [
    automationScheduleLine(job),
    job.ownerPrincipalId ? `Owner ${job.ownerPrincipalId}` : "",
    job.deliver ? `Deliver ${job.deliver}` : "",
  ].filter(Boolean).join(" | ");
  const timeRows = [
    ["\u4e0a\u6b21\u6267\u884c", job.lastRunAt ? formatTime(job.lastRunAt) : "\u6682\u65e0"],
    ["\u4e0b\u6b21\u6267\u884c", job.nextRunAt ? formatTime(job.nextRunAt) : "\u6682\u65e0"],
    ["\u4e0a\u6b21\u7ed3\u679c", job.lastStatus || status],
  ];
  const detailRows = [
    ["ID", job.id],
    ["\u6a21\u578b", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["Skill", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
        ${meta ? `<div class="automation-detail-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${timeRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${detailRows.length ? `<div class="automation-detail-grid">
      ${detailRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>` : ""}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview"><strong>${"\u76ee\u6807"}</strong><span>${escapeHtml(job.promptPreview)}</span></div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function focusAutomationCreateSoon() {
  setTimeout(() => {
    $("automationNaturalText")?.focus();
  }, 40);
}

function openAutomationCreate() {
  closeTopMoreMenu();
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  state.automationCreateOpen = true;
  renderAutomationView();
  focusAutomationCreateSoon();
}

async function createAutomationFromForm(root) {
  const input = root.querySelector("#automationNaturalText");
  const text = input?.value?.trim() || "";
  if (!text) throw new Error("请输入自动化任务描述");
  const submit = root.querySelector("#automationCreateForm button[type='submit']");
  if (submit) submit.disabled = true;
  $("connectionState").textContent = "正在理解自动化";
  try {
    const result = await api("/api/automations", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        text,
      }),
    });
    state.automationCreateOpen = false;
    state.selectedAutomationId = result?.job?.id || result?.data?.id || "";
    await loadAutomations();
    $("connectionState").textContent = "Hermes OK";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function focusAutomationEditSoon() {
  setTimeout(() => {
    $("automationEditName")?.focus();
  }, 40);
}

function openAutomationEdit() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  state.automationCreateOpen = false;
  state.automationEditOpen = true;
  state.automationEditJobId = job.id;
  renderAutomationView();
  focusAutomationEditSoon();
}

async function postAutomationAction(jobId, action, payload = {}) {
  if (!jobId || !action) return null;
  $("connectionState").textContent = "Hermes CRON...";
  try {
    const result = await api(`/api/automations/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify(Object.assign({ workspaceId: state.selectedWorkspaceId || "owner" }, payload)),
    });
    $("connectionState").textContent = "Hermes OK";
    return result;
  } catch (err) {
    $("connectionState").textContent = "Hermes error";
    throw err;
  }
}

async function toggleAutomationPause() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const action = automationStatusLabel(job) === "paused" ? "resume" : "pause";
  await postAutomationAction(job.id, action);
  state.selectedAutomationId = job.id;
  await loadAutomations();
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  await loadAutomations();
}

async function updateAutomationFromForm(root) {
  const form = root.querySelector("#automationEditForm");
  const jobId = form?.dataset?.automationEditId || state.automationEditJobId || state.selectedAutomationId;
  if (!jobId) return;
  const name = root.querySelector("#automationEditName")?.value?.trim() || "";
  const schedule = root.querySelector("#automationEditSchedule")?.value?.trim() || "";
  const prompt = root.querySelector("#automationEditPrompt")?.value?.trim() || "";
  if (!name) throw new Error("\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0");
  if (!schedule) throw new Error("\u8bf7\u8f93\u5165\u6267\u884c\u8ba1\u5212");
  if (!prompt) throw new Error("\u8bf7\u8f93\u5165\u4efb\u52a1\u76ee\u6807");
  const submit = root.querySelector("#automationEditForm button[type='submit']");
  if (submit) submit.disabled = true;
  try {
    const result = await postAutomationAction(jobId, "update", { name, schedule, prompt });
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.selectedAutomationId = result?.job?.id || jobId;
    await loadAutomations();
  } finally {
    if (submit) submit.disabled = false;
  }
}

function summarizeThread(thread) {
  const messages = thread?.messages || [];
  const last = [...messages].reverse().find((msg) => msg.content);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: thread.activeRunIds || [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    chatGroup: thread.chatGroup || null,
    preview: last ? last.content.slice(0, 180) : "",
  };
}

function mergeServerMessage(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = Object.assign({}, existing, incoming);
  const existingContent = String(existing.content || "");
  const incomingContent = String(incoming.content || "");
  const incomingStatus = String(incoming.status || "");
  const shouldKeepLiveContent =
    existingContent &&
    (!incomingContent || (incomingStatus === "running" && incomingContent.length < existingContent.length));
  if (shouldKeepLiveContent) merged.content = existingContent;
  if (incoming.revokedAt) {
    merged.content = incomingContent || GROUP_MESSAGE_REVOKED_TEXT;
    merged.artifacts = [];
    merged.usage = incoming.usage || null;
    merged.error = incoming.error || null;
  }
  if (!incoming.revokedAt && Array.isArray(existing.artifacts) && existing.artifacts.length && !merged.artifacts?.length) {
    merged.artifacts = existing.artifacts;
  }
  if (!incoming.revokedAt && existing.usage && !incoming.usage) merged.usage = existing.usage;
  for (const field of MESSAGE_TIMESTAMP_FIELDS) {
    if (existing[field] && !incoming[field]) merged[field] = existing[field];
  }
  return merged;
}

function mergeCurrentThread(incomingThread) {
  if (!incomingThread) return state.currentThread;
  if (!state.currentThread || state.currentThread.id !== incomingThread.id) return incomingThread;
  const existingPage = state.currentThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of state.currentThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  const sortedMessages = sortedThreadMessages(messages);
  const chatMessages = incomingPage?.mode === "chat" || existingPage?.mode === "chat"
    ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
    : sortedMessages;
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, chatMessages)
    : null;
  return Object.assign({}, state.currentThread, incomingThread, { messages: sortedMessages, messagesPage });
}

async function loadSingleWindow(options = {}) {
  const weixinChat = Boolean(options.weixinChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.weixinChatOpen
  ));
  const groupChat = weixinChat ? false : (options.groupChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.groupChatOpen
  ));
  const messageMode = isSingleWindowChatView()
    ? "chat"
    : (state.viewMode === "tasks" || state.singleWindowMode === "task" ? "tasks" : "");
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      groupChat,
      weixinChat,
      messageMode,
      taskGroupId: messageMode === "tasks" ? state.currentTaskGroupId : "",
      messageLimit: messageMode === "tasks" ? TASK_MESSAGE_INITIAL_LIMIT : CHAT_MESSAGE_INITIAL_LIMIT,
    }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  if (result.groupChatThread) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, result.groupChatThread);
    state.groupChatThreadId = state.groupChatThread?.id || result.groupChatThreadId || "";
  }
  if (result.weixinChatThread) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, result.weixinChatThread);
    state.weixinChatThreadId = state.weixinChatThread?.id || result.weixinChatThreadId || "";
  }
  state.caseTopicThreads = Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads : [];
  if (messageMode === "tasks") scheduleKanbanTopicCardSnapshotRefresh();
  state.groupChatAvailable = Boolean(result.groupChatAvailable || selectedWorkspaceInThreadGroup(state.currentThread));
  state.weixinChatAvailable = Boolean(result.weixinChatAvailable || isThreadWeixinChat(state.currentThread));
  rememberChatScopeThread(state.currentThread);
  if (weixinChat && !isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
  }
  if (isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = true;
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "1");
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  if (groupChat && !selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (messageMode === "tasks") rememberTaskListThread(state.currentThread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

async function selectChatScope(scope) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  if (String(scope || "").trim().toLowerCase() !== "group") {
    state.groupChatOpen = false;
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    await loadSingleWindow({ groupChat: false, weixinChat: false });
    return;
  }
  if (isGroupChatView()) {
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  state.weixinChatOpen = false;
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
  await loadSingleWindow({ groupChat: true, weixinChat: false });
  if (selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = true;
    localStorage.setItem("hermesWebGroupChatOpen", "1");
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (!state.auth?.isOwner) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    throw new Error("当前账号还没有可加入的群聊");
  }
  const ownerId = state.currentThread?.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, state.selectedWorkspaceId || ownerId].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatOpen = true;
  localStorage.setItem("hermesWebGroupChatOpen", "1");
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function toggleGroupChat() {
  await selectChatScope(isGroupChatView() ? "chat" : "group");
}

async function selectWeixinChat(open = true) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  state.weixinChatOpen = Boolean(open);
  state.groupChatOpen = false;
  localStorage.setItem("hermesWebWeixinChatOpen", state.weixinChatOpen ? "1" : "0");
  localStorage.setItem("hermesWebGroupChatOpen", "0");
  await loadSingleWindow({ weixinChat: state.weixinChatOpen, groupChat: false });
}

async function toggleWeixinChat() {
  await selectWeixinChat(!isWeixinChatView());
}

function renderGroupChatManager() {
  const overlay = $("groupChatOverlay");
  if (!overlay) return;
  if (!state.groupChatManagerOpen) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }
  const thread = state.currentThread;
  const fixedOwnerId = thread?.workspaceId || state.selectedWorkspaceId || "owner";
  const selected = new Set(state.groupChatMemberDraft.length ? state.groupChatMemberDraft : threadGroupMemberIds(thread));
  selected.add(fixedOwnerId);
  const canEdit = Boolean(state.auth?.isOwner);
  const workspaces = canEdit
    ? (state.workspaces || [])
    : (Array.isArray(thread?.chatGroup?.members)
      ? thread.chatGroup.members.map((member) => ({ id: member.workspaceId, label: member.label }))
      : []);
  const rows = workspaces.map((workspace) => {
    const checked = selected.has(workspace.id);
    const disabled = !canEdit || workspace.id === fixedOwnerId;
    return `<label class="group-member-option">
      <input type="checkbox" value="${escapeHtml(workspace.id)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
      <span>${escapeHtml(workspace.label || workspace.id)}</span>
    </label>`;
  }).join("");
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="access-key-sheet group-chat-sheet">
      <header class="access-key-header">
        <div>
          <div id="groupChatTitle" class="access-key-title">群聊成员</div>
          <div class="access-key-subtitle">${canEdit ? "Owner 可以选择加入这个群聊的工作区账号。" : "当前账号只能查看群聊成员。"}</div>
        </div>
        <button class="access-key-close" type="button" data-close-group-chat>关闭</button>
      </header>
      <div class="group-member-list">${rows}</div>
      <div class="group-member-actions">
        ${canEdit ? `<button class="primary-button" type="button" data-save-group-chat>保存</button>` : ""}
      </div>
    </div>`;
  overlay.querySelector("[data-close-group-chat]")?.addEventListener("click", closeGroupChatManager);
  overlay.querySelector("[data-save-group-chat]")?.addEventListener("click", () => saveGroupChatMembers().catch(showError));
}

async function openGroupChatMembers() {
  closeTopMoreMenu();
  if (!state.auth?.isOwner) return;
  if (!isGroupChatView()) await toggleGroupChat();
  if (!isGroupChatView()) return;
  state.groupChatManagerOpen = true;
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  renderGroupChatManager();
}

function closeGroupChatManager() {
  state.groupChatManagerOpen = false;
  state.groupChatMemberDraft = [];
  renderGroupChatManager();
}

async function saveGroupChatMembers() {
  if (!state.currentThread?.id) return;
  const overlay = $("groupChatOverlay");
  const checked = [...(overlay?.querySelectorAll?.(".group-member-option input:checked") || [])].map((input) => input.value);
  const ownerId = state.currentThread.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, ...checked].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  closeGroupChatManager();
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

async function loadThreads() {
  const params = new URLSearchParams();
  if (state.selectedWorkspaceId) params.set("workspaceId", state.selectedWorkspaceId);
  if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
  if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
  const search = currentSearchText();
  if (search) params.set("search", search);
  const result = await api(`/api/threads?${params}`);
  state.threads = result.data || [];
  updateSearchButton();
  renderThreads();
}

async function refreshCaseTopicThreadsForWorkspace() {
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId || "owner",
      messageMode: "tasks",
    }),
  });
  if (Array.isArray(result.caseTopicThreads)) state.caseTopicThreads = result.caseTopicThreads;
  return state.caseTopicThreads;
}

async function refreshKanbanTopicCardSnapshot() {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  const workspaceId = state.selectedWorkspaceId || "owner";
  const params = new URLSearchParams({
    workspaceId,
    limit: "500",
    includeCompleted: "1",
    scope: "mine",
  });
  const result = await api(`${boardCollectionApiPath()}?${params.toString()}`);
  applyTodoListResult(result, true, workspaceId);
  state.kanbanTopicCardSnapshotLoadedAt = Date.now();
}

function scheduleKanbanTopicCardSnapshotRefresh(options = {}) {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  if (state.kanbanTopicCardSnapshotLoading) return;
  const now = Date.now();
  const maxAge = Number(options.maxAgeMs ?? KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS);
  if (!options.force && state.kanbanTopicCardSnapshotLoadedAt && now - state.kanbanTopicCardSnapshotLoadedAt < maxAge) return;
  state.kanbanTopicCardSnapshotLoading = true;
  window.setTimeout(() => {
    refreshKanbanTopicCardSnapshot()
      .catch(() => {})
      .finally(() => {
        state.kanbanTopicCardSnapshotLoading = false;
        if (state.viewMode === "tasks" && !state.currentTaskGroupId) renderCurrentThread({ stickToBottom: false });
      });
  }, 0);
}

function kanbanStatusNeedsCompleted(status) {
  return status === KANBAN_STORY_STATUS || KANBAN_STATUS_ORDER.includes(status);
}

function shouldLoadCompletedTodos(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "includeCompleted")) return Boolean(options.includeCompleted);
  if (currentSearchText()) return true;
  if (state.selectedTodoId) return true;
  return kanbanStatusNeedsCompleted(String(state.todoKanbanStatus || "").trim().toLowerCase());
}

function kanbanComposerOpen() {
  return state.viewMode === "todos" && isKanbanTodoSource() && state.todoCreateOpen && !state.selectedTodoId;
}

function kanbanComposerFocused() {
  const active = document.activeElement;
  return Boolean(active && (active.id === "kanbanComposerText" || active.closest?.("#kanbanComposerForm")));
}

function kanbanCardById(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return null;
  return (state.todos || []).find((todo) => String(todo?.id || "") === id) || null;
}

function kanbanCardWorkspaceId(todoOrId) {
  const todo = typeof todoOrId === "string" ? kanbanCardById(todoOrId) : todoOrId;
  return String(
    todo?.workspaceId
    || todo?.kanbanWorkspaceId
    || todo?.actorWorkspaceId
    || todo?.senderWorkspaceId
    || state.selectedWorkspaceId
    || "owner"
  ).trim() || "owner";
}

function kanbanCardActionBody(todoOrId, extra = {}) {
  return JSON.stringify(Object.assign({ workspaceId: kanbanCardWorkspaceId(todoOrId) }, extra || {}));
}

function kanbanCaseMode(todo) {
  return String(todo?.kanbanCaseMode || "").trim();
}

function kanbanCardHasExplicitStoryCase(todo) {
  const mode = kanbanCaseMode(todo);
  if (mode === "single-card") return false;
  return Boolean(String(todo?.kanbanCaseId || "").trim() || mode);
}

function kanbanCaseTemplate(todo) {
  return String(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind || "").trim().toLowerCase();
}

function isKanbanStudyCase(todo) {
  return kanbanCaseMode(todo) === "study-plan";
}

function isKanbanAssessmentCase(todo) {
  return kanbanCaseMode(todo) === "assessment-plan";
}

function isKanbanReadingPlanCase(todo) {
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "reading";
}

function isKanbanFinalStudyAssessment(todo) {
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "final-assessment";
}

function isKanbanAssessmentCard(todo) {
  return isKanbanAssessmentCase(todo) || isKanbanFinalStudyAssessment(todo);
}

function isKanbanProgrammingAssessmentCard(todo) {
  if (!isKanbanAssessmentCard(todo)) return false;
  const summary = todo?.assessmentExam && typeof todo.assessmentExam === "object" ? todo.assessmentExam : {};
  const text = [
    kanbanCaseTemplate(todo),
    todo?.kanbanStudyKind,
    todo?.kanbanAssessmentKind,
    todo?.kanbanCaseSummary,
    todo?.content,
    summary.subject,
    summary.subjectId,
  ].filter(Boolean).join("\n");
  return /programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|编程|程式|程序|代码|代碼|算法|开发|開發/i.test(text);
}

function kanbanStudyLabels(todo) {
  const reading = isKanbanReadingPlanCase(todo);
  return {
    plan: "学习计划",
    item: reading ? "阅读" : "学习",
    submit: reading ? "提交录音" : "提交学习记录",
    upload: reading ? "上传复述录音" : "上传学习成果",
    recording: reading ? "复述录音" : "学习成果",
    analysis: reading ? "转写与分析" : "整理与分析",
    quiz: reading ? "练习考卷" : "学习测验",
    completed: reading ? "本次阅读已完成。" : "本次学习已完成。",
    receipt: reading ? "阅读回执" : "学习回执",
  };
}

function kanbanActorRole(todo) {
  return String(todo?.kanbanActorRole || "").trim().toLowerCase();
}

function kanbanActorPermissions(todo) {
  return todo?.kanbanActorPermissions && typeof todo.kanbanActorPermissions === "object"
    ? todo.kanbanActorPermissions
    : null;
}

function kanbanCan(todo, key) {
  const permissions = kanbanActorPermissions(todo);
  if (permissions && typeof permissions[key] === "boolean") return permissions[key];
  const role = kanbanActorRole(todo);
  if (!role || role === "manager") return true;
  if (role === "viewer") return key === "canView";
  if (role === "performer") return ["canView", "canSubmitStudy", "canAnswerQuiz"].includes(key);
  return true;
}

function kanbanComposerProgressSteps() {
  if (state.kanbanComposerProgressKind === "assessment") return KANBAN_ASSESSMENT_PROGRESS_STEPS;
  if (state.kanbanComposerProgressKind === "reading") return KANBAN_READING_PROGRESS_STEPS;
  return state.kanbanComposerProgressKind === "create"
    ? KANBAN_CREATE_PROGRESS_STEPS
    : KANBAN_PLAN_PROGRESS_STEPS;
}

function clearKanbanComposerProgressTimer() {
  window.clearInterval(state.kanbanComposerProgressTimer);
  state.kanbanComposerProgressTimer = 0;
}

function beginKanbanComposerProgress(kind) {
  clearKanbanComposerProgressTimer();
  state.kanbanComposerProgressKind = kind || "plan";
  state.kanbanComposerProgressStartedAt = Date.now();
  state.kanbanComposerProgressStep = 0;
  state.kanbanComposerProgressTimer = window.setInterval(() => {
    if (!state.kanbanComposerBusy && !state.kanbanPlanCreating) {
      clearKanbanComposerProgressTimer();
      return;
    }
    const steps = kanbanComposerProgressSteps();
    state.kanbanComposerProgressStep = Math.min(steps.length - 1, state.kanbanComposerProgressStep + 1);
    if (kanbanComposerOpen()) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }, 2200);
}

function finishKanbanComposerProgress() {
  clearKanbanComposerProgressTimer();
  state.kanbanComposerProgressKind = "";
  state.kanbanComposerProgressStartedAt = 0;
  state.kanbanComposerProgressStep = 0;
}

function syncKanbanComposerDraftFromDom() {
  const input = $("kanbanComposerText");
  if (!input) return;
  state.kanbanComposerText = input.value || "";
  if (state.kanbanComposerText) localStorage.setItem("hermesKanbanComposerDraft", state.kanbanComposerText);
  else localStorage.removeItem("hermesKanbanComposerDraft");
}

function syncKanbanReadingDraftFromDom(root = document) {
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  const viewerInputs = Array.from(root.querySelectorAll?.("[data-kanban-study-viewer-workspace]") || []);
  const selectedViewers = viewerInputs.length
    ? viewerInputs.filter((input) => input.checked).map((input) => input.value).filter(Boolean).join(",")
    : root.querySelector?.("#kanbanStudyViewerWorkspaces")?.value;
  const fields = {
    caseMode: "study-plan",
    studyTemplate: root.querySelector?.("#kanbanStudyTemplate")?.value,
    subjectDomain: root.querySelector?.("#kanbanStudySubject")?.value,
    activityTitle: root.querySelector?.("#kanbanStudyTitle")?.value,
    learnerName: root.querySelector?.("#kanbanStudyLearner")?.value,
    readerName: root.querySelector?.("#kanbanReadingReader")?.value,
    bookTitle: root.querySelector?.("#kanbanReadingBook")?.value,
    performerWorkspaceId: root.querySelector?.("#kanbanStudyPerformerWorkspace")?.value,
    viewerWorkspaceIds: selectedViewers,
    sessions: root.querySelector?.("#kanbanReadingSessions")?.value,
    startDate: root.querySelector?.("#kanbanReadingStartDate")?.value,
    timeOfDay: root.querySelector?.("#kanbanReadingTime")?.value,
    scheduleFrequency: normalizeKanbanStudyScheduleFrequency(root.querySelector?.("#kanbanStudyScheduleFrequency")?.value),
    scheduleWeekdays: selectedKanbanStudyWeekdays(root) || draft.scheduleWeekdays || "1",
    scheduleMonthDay: root.querySelector?.("#kanbanStudyScheduleMonthDay")?.value,
    reminderLeadMinutes: root.querySelector?.("#kanbanReadingReminder")?.value,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) draft[key] = value || "";
  }
  if (fields.learnerName !== undefined) draft.readerName = draft.learnerName || draft.readerName || "";
  if (fields.activityTitle !== undefined) draft.bookTitle = draft.activityTitle || draft.bookTitle || "";
  state.kanbanReadingDraft = draft;
  localStorage.setItem("hermesKanbanReadingDraft", JSON.stringify(draft));
  updateKanbanPlanBindingPreview(root, "study");
}

function syncKanbanAssessmentDraftFromDom(root = document) {
  const draft = Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
  const viewerInputs = Array.from(root.querySelectorAll?.("[data-kanban-assessment-viewer-workspace]") || []);
  const selectedViewers = viewerInputs.length
    ? viewerInputs.filter((input) => input.checked).map((input) => input.value).filter(Boolean).join(",")
    : root.querySelector?.("#kanbanAssessmentViewerWorkspaces")?.value;
  const fields = {
    caseMode: "assessment-plan",
    subject: root.querySelector?.("#kanbanAssessmentSubject")?.value,
    learnerName: root.querySelector?.("#kanbanAssessmentLearner")?.value,
    courseLevel: root.querySelector?.("#kanbanAssessmentLevel")?.value,
    planTitle: root.querySelector?.("#kanbanAssessmentTitle")?.value,
    performerWorkspaceId: root.querySelector?.("#kanbanAssessmentPerformerWorkspace")?.value,
    viewerWorkspaceIds: selectedViewers,
    examCount: root.querySelector?.("#kanbanAssessmentExamCount")?.value,
    questionCount: root.querySelector?.("#kanbanAssessmentQuestionCount")?.value,
    durationMinutes: root.querySelector?.("#kanbanAssessmentDuration")?.value,
    passingScore: root.querySelector?.("#kanbanAssessmentPassingScore")?.value,
    intervalDays: root.querySelector?.("#kanbanAssessmentIntervalDays")?.value,
    startDate: root.querySelector?.("#kanbanAssessmentStartDate")?.value,
    timeOfDay: root.querySelector?.("#kanbanAssessmentTime")?.value,
    reminderLeadMinutes: root.querySelector?.("#kanbanAssessmentReminder")?.value,
    difficulty: root.querySelector?.("#kanbanAssessmentDifficulty")?.value,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) draft[key] = value || "";
  }
  state.kanbanAssessmentDraft = draft;
  localStorage.setItem("hermesKanbanAssessmentDraft", JSON.stringify(draft));
  updateKanbanPlanBindingPreview(root, "assessment");
}

function setKanbanReadingCoverFile(file) {
  if (state.kanbanReadingCoverPreviewUrl) URL.revokeObjectURL(state.kanbanReadingCoverPreviewUrl);
  state.kanbanReadingCoverFile = file || null;
  state.kanbanReadingCoverPreviewUrl = file ? URL.createObjectURL(file) : "";
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  draft.coverName = file?.name || "";
  state.kanbanReadingDraft = draft;
  localStorage.setItem("hermesKanbanReadingDraft", JSON.stringify(draft));
}

function normalizeKanbanStudyScheduleFrequency(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (["weekly", "week", "\u6bcf\u5468"].includes(text)) return "weekly";
  if (["monthly", "month", "\u6bcf\u6708"].includes(text)) return "monthly";
  return "daily";
}

function parseKanbanStudyWeekdays(value = "") {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s;，、]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const number = Number(item);
    const normalized = number === 0 ? 7 : number;
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 7 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function selectedKanbanStudyWeekdays(root = document) {
  const checked = Array.from(root.querySelectorAll("[data-kanban-study-weekday]:checked"))
    .map((item) => item.value);
  return parseKanbanStudyWeekdays(checked).join(",");
}

function saveKanbanComposerMode(mode) {
  const normalized = mode === "reading" ? "study" : mode;
  const next = ["single", "multi", "study", "assessment"].includes(normalized) ? normalized : "single";
  state.kanbanComposerMode = next;
  state.kanbanComposerMultiAgent = next === "multi";
  localStorage.setItem("hermesKanbanComposerMode", next);
  localStorage.setItem("hermesKanbanComposerMultiAgent", next === "multi" ? "1" : "0");
}

function saveKanbanComposerMaxParallel(value) {
  const next = normalizeKanbanComposerMaxParallel(value);
  state.kanbanComposerMaxParallel = next;
  localStorage.setItem("hermesKanbanComposerMaxParallel", String(next));
  return next;
}

function saveKanbanComposerReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  const next = ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
  state.kanbanComposerReasoningEffort = next;
  if (next) localStorage.setItem("hermesKanbanComposerReasoningEffort", next);
  else localStorage.removeItem("hermesKanbanComposerReasoningEffort");
  return next;
}

function kanbanComposerDocumentContext() {
  const docs = Array.isArray(state.kanbanComposerDocuments) ? state.kanbanComposerDocuments : [];
  return docs
    .slice(0, 3)
    .filter((item) => String(item?.text || "").trim())
    .map((item, index) => {
      const text = String(item.text || "").trim();
      const limited = text.length > 60000 ? `${text.slice(0, 60000)}\n\n[document truncated in composer: ${text.length} chars total]` : text;
      return [
        `Document ${index + 1}: ${item.name || "kanban-source"}`,
        limited,
      ].join("\n\n");
    })
    .join("\n\n---\n\n");
}

function kanbanComposerSubmissionText(rawText = "") {
  return [String(rawText || "").trim(), kanbanComposerDocumentContext()].filter(Boolean).join("\n\n");
}

function clearKanbanComposerDocuments() {
  state.kanbanComposerDocuments = [];
  state.kanbanComposerDocumentUploading = false;
}

function todoRefreshShouldYieldToKanbanComposer(options = {}) {
  if (!kanbanComposerOpen() || options.forceRender) return false;
  if (options.autoRefresh || options.freshServer) return true;
  return kanbanComposerFocused();
}

function clearTodoAutoRefresh() {
  window.clearTimeout(state.todoAutoRefreshTimer);
  state.todoAutoRefreshTimer = 0;
}

function scheduleTodoAutoRefresh() {
  clearTodoAutoRefresh();
  if (state.viewMode !== "todos") return;
  if (document.visibilityState === "hidden") return;
  state.todoAutoRefreshTimer = window.setTimeout(() => {
    state.todoAutoRefreshTimer = 0;
    if (state.viewMode !== "todos" || document.visibilityState === "hidden") return;
    if (kanbanComposerOpen()) {
      scheduleTodoAutoRefresh();
      return;
    }
    loadTodos({ preserveScroll: true, autoRefresh: true }).catch(() => scheduleTodoAutoRefresh());
  }, TODO_AUTO_REFRESH_INTERVAL_MS);
}

function todoListCacheKey(workspaceId, includeCompleted) {
  return `hermesTodoList:${CLIENT_VERSION}:${workspaceId || "owner"}:${includeCompleted ? "all" : "open"}`;
}

function readTodoListCache(workspaceId, includeCompleted) {
  try {
    const raw = localStorage.getItem(todoListCacheKey(workspaceId, includeCompleted));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > TODO_LIST_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(parsed.todos)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeTodoListCache(workspaceId, includeCompleted) {
  try {
    localStorage.setItem(todoListCacheKey(workspaceId, includeCompleted), JSON.stringify({
      savedAt: Date.now(),
      todos: state.todos,
      assignees: state.todoAssignees,
      source: state.todoSource,
      board: state.todoKanbanBoard,
    }));
  } catch (_) {}
}

function clearTodoListCache(workspaceId = state.selectedWorkspaceId || "owner") {
  try {
    localStorage.removeItem(todoListCacheKey(workspaceId, false));
    localStorage.removeItem(todoListCacheKey(workspaceId, true));
  } catch (_) {}
}

function applyTodoListResult(result, includeCompleted, workspaceId = state.selectedWorkspaceId || "owner") {
  state.todos = result.data || result.todos || [];
  state.todoWorkspaceId = workspaceId || "owner";
  state.todoAssignees = result.assignees || [];
  state.todoSource = result.source || result.result?.source || "";
  state.todoKanbanBoard = result.result?.board || result.board || state.todos.find((todo) => todo.kanbanBoard)?.kanbanBoard || "";
  state.todoCompletedLoaded = includeCompleted;
}

async function loadTodos(options = {}) {
  if (todoRefreshShouldYieldToKanbanComposer(options)) {
    scheduleTodoAutoRefresh();
    return;
  }
  const workspaceId = state.selectedWorkspaceId || "owner";
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);
  params.set("limit", "120");
  const includeCompleted = shouldLoadCompletedTodos(options);
  const targetTodoId = String(options.targetId || state.selectedTodoId || "").trim();
  if (includeCompleted) params.set("includeCompleted", "1");
  params.set("scope", "mine");
  if (targetTodoId) params.set("targetId", targetTodoId);
  if (options.freshServer || targetTodoId) params.set("fresh", "1");
  const search = targetTodoId ? "" : currentSearchText();
  if (search) params.set("search", search);
  const conversation = $("conversation");
  const restoreScrollTop = options.preserveScroll && conversation ? conversation.scrollTop : null;
  const useCache = !options.autoRefresh && !options.skipCache && !search && state.viewMode === "todos" && !state.selectedTodoId;
  const cached = useCache ? readTodoListCache(workspaceId, includeCompleted) : null;
  if (cached) {
    applyTodoListResult(cached, includeCompleted, workspaceId);
    updateSearchButton();
    renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop });
    setComposerEnabled(false);
  } else if (useCache && state.todos.length && state.todoWorkspaceId === workspaceId && state.todoCompletedLoaded === includeCompleted) {
    updateSearchButton();
    renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop });
    setComposerEnabled(false);
  }
  const result = await api(`${boardCollectionApiPath()}?${params}`);
  if (options.autoRefresh && state.viewMode !== "todos") return;
  const yieldToComposer = todoRefreshShouldYieldToKanbanComposer(options);
  applyTodoListResult(result, includeCompleted, workspaceId);
  if (!search) writeTodoListCache(workspaceId, includeCompleted);
  if (yieldToComposer) {
    scheduleTodoAutoRefresh();
    return;
  }
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  if (state.selectedTodoId && !state.todos.some((todo) => todo.id === state.selectedTodoId)) {
    state.todoRouteMissingTargetId = state.selectedTodoId;
    state.selectedTodoId = "";
  } else if (targetTodoId) {
    state.todoRouteMissingTargetId = "";
  }
  updateSearchButton();
  const finalRestoreScrollTop = options.preserveScroll && conversation ? conversation.scrollTop : restoreScrollTop;
  renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop: finalRestoreScrollTop });
  if (result?.cache?.hit && !options.freshServer && !options.autoRefresh && state.viewMode === "todos") {
    window.setTimeout(() => {
      if (state.viewMode === "todos" && !kanbanComposerOpen()) loadTodos({ preserveScroll: true, skipCache: true, freshServer: true }).catch(showError);
    }, 0);
  }
  setComposerEnabled(false);
  scheduleTodoAutoRefresh();
}

async function loadKanbanCardDetail(todoId, options = {}) {
  const id = String(todoId || "").trim();
  if (!id || !isKanbanTodoSource()) return;
  const existing = todoCardDetailState(id);
  if (existing?.loading) return;
  if (existing && !options.force) return;
  state.todoCardDetails[id] = Object.assign({}, existing || {}, { loading: true, error: "" });
  if (!options.silent) renderTodos({ preserveScroll: true });
  try {
    const params = new URLSearchParams();
    params.set("workspaceId", kanbanCardWorkspaceId(id));
    params.set("logTail", "4000");
    const result = await api(`/api/kanban/cards/${encodeURIComponent(id)}/detail?${params.toString()}`);
    state.todoCardDetails[id] = Object.assign({}, result.detail || {}, { loading: false, error: "" });
  } catch (err) {
    state.todoCardDetails[id] = Object.assign({}, existing || {}, { loading: false, error: err.message || String(err) });
  }
  renderTodos({ preserveScroll: true });
}

function todoStatusLabel(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function todoStatusText(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未完成";
}

function normalizedKanbanStatus(todo) {
  const status = String(todo?.kanbanStatus || todo?.kanban_status || "").trim().toLowerCase();
  if (isKanbanAssessmentCard(todo)) {
    const workflow = todoWorkflowState(todo);
    const phase = String(workflow?.phase || "").trim().toLowerCase();
    if (phase === "archived") return "archived";
    if (phase === "locked") return "blocked";
    if (phase === "exam_open") return "todo";
    if (phase === "in_progress" || phase === "retake_required") return "running";
  }
  if (
    isKanbanAssessmentCard(todo)
    && status === "done"
    && !assessmentExamCompleted(todo)
  ) {
    return "blocked";
  }
  if (KANBAN_STATUS_ORDER.includes(status)) return status;
  const compatible = String(todo?.status || "").trim().toLowerCase();
  if (
    isKanbanAssessmentCard(todo)
    && compatible === "completed"
    && !assessmentExamCompleted(todo)
  ) {
    return "blocked";
  }
  if (compatible === "completed") return "done";
  if (compatible === "cancelled") return "archived";
  return "todo";
}

function kanbanStatusMeta(todoOrStatus) {
  const status = typeof todoOrStatus === "string" ? todoOrStatus : normalizedKanbanStatus(todoOrStatus);
  return KANBAN_STATUS_META[status] || { label: status || "Todo", shortLabel: status || "todo" };
}

function kanbanStatusText(todo) {
  const status = normalizedKanbanStatus(todo);
  const meta = kanbanStatusMeta(status);
  return `${meta.label} / ${meta.shortLabel}`;
}

function currentTodoKanbanStatus(grouped) {
  const selected = String(state.todoKanbanStatus || "").trim().toLowerCase();
  if (selected === KANBAN_STORY_STATUS) return KANBAN_STORY_STATUS;
  if (KANBAN_STATUS_ORDER.includes(selected)) return selected;
  const fallback = KANBAN_STATUS_FALLBACK_ORDER.find((status) => (grouped?.get(status) || []).length)
    || KANBAN_STORY_STATUS;
  state.todoKanbanStatus = fallback;
  localStorage.setItem("hermesTodoKanbanStatus", fallback);
  return fallback;
}

function isKanbanTodoSource() {
  return true;
}

function boardCollectionApiPath() {
  return "/api/kanban/cards";
}

function boardActionApiPath(todoId, action = "") {
  return `${boardCollectionApiPath()}/${encodeURIComponent(todoId)}/${action}`;
}

function todoBoardLabel() {
  return state.todoKanbanBoard || state.todos.find((todo) => todo.kanbanBoard)?.kanbanBoard || "default";
}

function todoPriorityLabel(todo) {
  const priority = Number(todo?.kanbanPriority || 0);
  return Number.isFinite(priority) && priority > 0 ? `P${priority}` : "";
}

function todoTimestampLabel(value) {
  return formatTime(value) || String(value || "");
}

function todoSortTimestamp(todo) {
  const candidates = [
    todo?.kanbanCompletedAt,
    todo?.completedAt,
    todo?.cancelledAt,
    todo?.updatedAt,
    todo?.createdAt,
    todo?.dueAt,
    todo?.dueLocal,
  ];
  for (const value of candidates) {
    const parsed = Date.parse(String(value || "").replace(" ", "T"));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sortArchivedKanbanCards(items) {
  return [...(items || [])].sort((left, right) => {
    const delta = todoSortTimestamp(right) - todoSortTimestamp(left);
    if (delta) return delta;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function cleanKanbanInternalResultLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:MEDIA:|Audio file:|Analysis file:)\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanKanbanReadingResultText(text) {
  let value = String(text || "").trim();
  const aiMatch = value.match(/(?:^|\n)AI analysis:\s*/i);
  if (aiMatch) {
    value = value.slice((aiMatch.index || 0) + aiMatch[0].length);
  } else {
    const transcriptMatch = value.match(/(?:^|\n)Transcript:\s*/i);
    if (transcriptMatch) value = value.slice(0, transcriptMatch.index || 0);
  }
  value = value.replace(/^\s*Reading (?:submission|retelling) analysis completed[^\n]*\.?\s*$/gmi, "");
  return cleanKanbanInternalResultLines(value);
}

function kanbanDisplayResultText(todo, text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (isKanbanAssessmentCard(todo) && !assessmentHasVisibleResult(todo)) return "";
  return isKanbanReadingCard(todo)
    ? cleanKanbanReadingResultText(raw)
    : cleanKanbanInternalResultLines(raw);
}

function kanbanStoryHelperOptions(extra = {}) {
  return Object.assign({
    allTodos: state.todos || [],
    statusOrder: KANBAN_STATUS_ORDER,
    todoSortTimestamp,
    todoTitle,
    compactDisplayText,
    isKanbanReadingCard,
    isKanbanAssessmentCard,
    normalizedKanbanStatus,
    kanbanStatusMeta,
    assessmentExamSummary,
    assessmentExamCompleted,
    assessmentCardAcceptsStart,
    readingSubmissionHasAnalysis,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    kanbanDisplayResultText,
    todoCardDetailState,
    kanbanCardOutputs,
    isKanbanTodoSource,
  }, extra || {});
}

function isReadingPlanWaitingCard(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  if (normalizedKanbanStatus(todo) !== "blocked") return false;
  const reason = String(todo?.kanbanBlockReason || "").toLowerCase();
  if (reason.includes("previous reading session") || reason.includes("future reading")) return true;
  return arrayFromKanbanField(todo?.kanbanCaseDependsOn, 12).length > 0 && !String(todo?.kanbanResult || "").trim();
}

function kanbanReadingCaseKey(todo) {
  return KanbanStoryHelpers.kanbanReadingCaseKey(todo);
}

function kanbanVisibleReadingTodoIds(todos) {
  return KanbanStoryHelpers.kanbanVisibleReadingTodoIds(todos, kanbanStoryHelperOptions());
}

function kanbanReadingRevisionOriginal(group, item) {
  return KanbanStoryHelpers.kanbanReadingRevisionOriginal(group, item);
}

function isKanbanReadingRevision(itemOrTodo) {
  return KanbanStoryHelpers.isKanbanReadingRevision(itemOrTodo);
}

function kanbanReadingDisplayCardIndex(group, item) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardIndex(group, item);
}

function kanbanRevisionSortTimestamp(item) {
  return KanbanStoryHelpers.kanbanRevisionSortTimestamp(item, kanbanStoryHelperOptions());
}

function kanbanLatestRevisionReplacementItems(group, predicate = null) {
  return KanbanStoryHelpers.kanbanLatestRevisionReplacementItems(group, predicate, kanbanStoryHelperOptions());
}

function kanbanAssessmentVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanAssessmentStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingBaseCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingBaseCardItems(group);
}

function kanbanReadingDisplayCardCount(group) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardCount(group);
}

function kanbanVisibleBoardTodos(todos) {
  return KanbanStoryHelpers.kanbanVisibleBoardTodos(todos, kanbanStoryHelperOptions());
}

function kanbanReadingStartTime(todo) {
  const value = String(todo?.dueAt || todo?.dueLocal || "").trim();
  if (!value) return NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function todoWorkflowState(todo) {
  const workflow = todo?.workflowState && typeof todo.workflowState === "object" ? todo.workflowState : null;
  if (!workflow) return null;
  if (
    ["reading", "study", "assessment", "final-assessment"].includes(String(workflow.kind || ""))
    && workflow.priorContextAvailable === false
  ) {
    return null;
  }
  return workflow;
}

function readingCardAcceptsSubmission(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canSubmitStudy")) return Boolean(workflow.canSubmitStudy);
  const status = normalizedKanbanStatus(todo);
  if (status === "done" || status === "archived") return false;
  if (status === "blocked" && !readingCasePriorComplete(todo)) return false;
  return true;
}

function assessmentExamSummary(todo) {
  return todo?.assessmentExam && typeof todo.assessmentExam === "object"
    ? todo.assessmentExam
    : null;
}

function assessmentExamCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "assessment" || workflow.kind === "final-assessment")) return Boolean(workflow.completed);
  const summary = assessmentExamSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function assessmentHasVisibleResult(todo) {
  const summary = assessmentExamSummary(todo);
  return Boolean(summary?.lastAttempt) || assessmentExamCompleted(todo);
}

function kanbanCasePriorCards(todo, predicate) {
  return KanbanStoryHelpers.kanbanCasePriorCards(todo, predicate, kanbanStoryHelperOptions());
}

function readingCasePriorComplete(todo) {
  return KanbanStoryHelpers.readingCasePriorComplete(todo, kanbanStoryHelperOptions());
}

function learningReadingUiOptions(extra = {}) {
  return Object.assign({
    state,
    todos: state.todos || [],
    escapeHtml,
    isKanbanReadingCard,
    normalizedKanbanStatus,
    kanbanStudyLabels,
    readingSubmissionFeedback,
    readingSubmissionHasAnalysis,
    readingQuizState,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    readingSubmissionSummary,
    isKanbanReadingPlanCase,
    renderLearningGuidancePanel,
    renderAnswerReviewGate,
    supportsKanbanReadingRecorder,
    kanbanReadingRecordingStatusText,
    todoMatchesOpen,
    renderKanbanReadingRecorderControls,
  }, extra);
}

function nextReadingCaseTodo(todo) {
  return LearningReadingUi.nextReadingCaseTodo(todo, learningReadingUiOptions());
}

function assessmentPriorComplete(todo) {
  return KanbanStoryHelpers.assessmentPriorComplete(todo, kanbanStoryHelperOptions());
}

function assessmentCardAcceptsStart(todo) {
  if (!isKanbanAssessmentCard(todo) || assessmentExamCompleted(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canStartExam")) {
    return Boolean(workflow.canStartExam || workflow.canAnswerQuiz);
  }
  const status = normalizedKanbanStatus(todo);
  if (status === "archived") return false;
  return assessmentPriorComplete(todo);
}

function kanbanAssessmentCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanAssessmentCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function kanbanReadingCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanReadingCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function stableDisplayHash(value) {
  return KanbanStoryHelpers.stableDisplayHash(value);
}

function arrayFromKanbanField(value, limit = 8) {
  return KanbanStoryHelpers.arrayFromKanbanField(value, limit);
}

function kanbanDescriptionSection(description, heading) {
  return KanbanStoryHelpers.kanbanDescriptionSection(description, heading);
}

function kanbanDescriptionList(description, heading, limit = 8) {
  return KanbanStoryHelpers.kanbanDescriptionList(description, heading, limit);
}

function parsedKanbanPlanDescription(todo) {
  return KanbanStoryHelpers.parsedKanbanPlanDescription(todo);
}

function kanbanCardCaseInfo(todo) {
  return KanbanStoryHelpers.kanbanCardCaseInfo(todo);
}

function kanbanArchiveCases(items) {
  return KanbanStoryHelpers.kanbanArchiveCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCases(items) {
  return KanbanStoryHelpers.kanbanStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseFullyArchived(group) {
  return KanbanStoryHelpers.kanbanStoryCaseFullyArchived(group, kanbanStoryHelperOptions());
}

function kanbanActiveStoryCases(items) {
  return KanbanStoryHelpers.kanbanActiveStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseKey(group) {
  return KanbanStoryHelpers.kanbanStoryCaseKey(group);
}

function kanbanStoryCaseExpanded(group) {
  const key = kanbanStoryCaseKey(group);
  return Boolean(key && state.kanbanStoryExpanded && state.kanbanStoryExpanded[key]);
}

function kanbanStoryToggleAttrs(group, expanded) {
  const key = kanbanStoryCaseKey(group);
  return key
    ? ` data-kanban-story-case="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"`
    : "";
}

function kanbanStoryCaseBodyOpen(group, options = {}) {
  return !options.collapsible || kanbanStoryCaseExpanded(group);
}

function kanbanStoryCaseRenderState(group, options = {}) {
  const collapsible = Boolean(options.collapsible);
  const expanded = kanbanStoryCaseBodyOpen(group, options);
  return {
    expanded,
    caseClass: collapsible && !expanded ? " story-collapsed" : "",
    toggleClass: collapsible ? " kanban-archive-case-toggle" : "",
    toggleAttrs: collapsible ? kanbanStoryToggleAttrs(group, expanded) : "",
  };
}

function kanbanStoryCaseArchiveItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseArchiveItems(group, kanbanStoryHelperOptions());
}

function renderKanbanStoryArchiveButton(group, options = {}) {
  if (!options.archiveAction) return "";
  const items = kanbanStoryCaseArchiveItems(group);
  if (!items.length) return "";
  const key = kanbanStoryCaseKey(group);
  return `<button class="kanban-archive-case-action" type="button" data-archive-kanban-story-case="${escapeHtml(key)}">${"\u5f52\u6863"}</button>`;
}

function kanbanStoryCaseDeleteItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseDeleteItems(group, kanbanStoryHelperOptions());
}

function kanbanStoryCaseCanDelete(group, options = {}) {
  return KanbanStoryHelpers.kanbanStoryCaseCanDelete(group, kanbanStoryHelperOptions(options));
}

function kanbanStorySwipeRenderState(group, options = {}) {
  const key = kanbanStoryCaseKey(group);
  const swipable = Boolean(key && kanbanStoryCaseCanDelete(group, options));
  return {
    articleClass: swipable ? " task-swipe-row kanban-story-swipe" : "",
    articleAttrs: swipable ? ` data-swipe-row data-swipe-kind="kanban-story" data-swipe-id="${escapeHtml(key)}"` : "",
    contentClass: swipable ? "task-swipe-content kanban-story-swipe-content" : "kanban-story-swipe-content",
    contentAttrs: swipable ? " data-swipe-content" : "",
    deleteButton: swipable
      ? `<button class="task-swipe-delete kanban-story-swipe-delete" type="button" data-delete-swipe aria-label="\u5220\u9664\u6545\u4e8b">\u5220\u9664</button>`
      : "",
  };
}

function kanbanArchiveStatusSummary(group) {
  return KanbanStoryHelpers.kanbanArchiveStatusSummary(group, kanbanStoryHelperOptions());
}

function kanbanArchiveConclusion(group) {
  return KanbanStoryHelpers.kanbanArchiveConclusion(group, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedback(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedback(todo, kanbanStoryHelperOptions());
}

function kanbanCardNeedsStoryDetail(todo) {
  return KanbanStoryHelpers.kanbanCardNeedsStoryDetail(todo, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedbackLine(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedbackLine(todo, kanbanStoryHelperOptions());
}

function scheduleKanbanStoryDetailLoads(items) {
  if (!isKanbanTodoSource() || state.selectedTodoId || kanbanComposerOpen()) return;
  if (String(state.todoKanbanStatus || "").trim().toLowerCase() !== KANBAN_STORY_STATUS) return;
  const queued = state.kanbanStoryDetailQueued || {};
  const ids = [];
  for (const group of kanbanActiveStoryCases(items).filter(kanbanStoryCaseExpanded).slice(0, 4)) {
    const cardItems = group.mode === "study-plan"
      ? [kanbanReadingCaseCurrentItem(group)].filter(Boolean)
      : group.mode === "assessment-plan"
        ? kanbanAssessmentStoryVisibleCardItems(group)
      : (group.cards || []).slice(0, 10);
    for (const item of cardItems) {
      const id = String(item?.todo?.id || "").trim();
      if (!id || queued[id] || !kanbanCardNeedsStoryDetail(item.todo)) continue;
      queued[id] = Date.now();
      ids.push(id);
      if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
    }
    if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
  }
  state.kanbanStoryDetailQueued = queued;
  ids.forEach((id, index) => {
    window.setTimeout(() => {
      loadKanbanCardDetail(id, { silent: true }).catch(showError);
    }, index * 120);
  });
}

function renderKanbanReadingArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const baseCards = kanbanReadingBaseCardItems(group);
  const visibleCards = kanbanReadingStoryVisibleCardItems(group);
  const first = cards[0]?.todo || {};
  const labels = kanbanStudyLabels(first);
  const current = kanbanReadingCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const currentId = String(currentTodo?.id || "");
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = baseCards.filter((item) => ["done", "archived"].includes(normalizedKanbanStatus(item.todo))).length;
  const total = kanbanReadingDisplayCardCount(group) || baseCards.length || cards.length;
  const progress = `${completed}/${total} \u5df2\u5b8c\u6210${statusSummary ? ` | ${statusSummary}` : ""}`;
  const conclusion = kanbanArchiveConclusion(group);
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = visibleCards.map((item) => {
    const todo = item.todo || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const outputCount = kanbanCardOutputs(todo).length;
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      outputCount ? `\u4ea4\u4ed8 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "\u5f53\u524d" : "",
      todo?.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "",
    ].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case study-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml([labels.plan, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u8fdb\u5ea6</strong>
        <p>${escapeHtml(progress)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function stripAssessmentConfigText(text = "") {
  return String(text || "")
    .replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assessmentTemplateDisplayText(group, currentTodo, firstTodo) {
  const summary = assessmentExamSummary(currentTodo) || assessmentExamSummary(firstTodo) || {};
  const questionCount = Number(summary.questionCount || currentTodo?.assessmentExam?.questionCount || firstTodo?.assessmentExam?.questionCount || 0) || 0;
  const durationMinutes = Number(summary.durationMinutes || currentTodo?.assessmentExam?.durationMinutes || firstTodo?.assessmentExam?.durationMinutes || 0) || 0;
  const passingScore = Number(summary.passingScore || currentTodo?.assessmentExam?.passingScore || firstTodo?.assessmentExam?.passingScore || 0) || 0;
  const source = compactDisplayText(stripAssessmentConfigText(group?.sourceText || firstTodo?.kanbanCaseSourceText || ""), 180);
  const revision = compactDisplayText(currentTodo?.kanbanRevisionRequest || "", 160);
  const parts = [
    questionCount && durationMinutes ? `${questionCount}\u9898/${durationMinutes}\u5206\u949f` : "",
    passingScore ? `\u901a\u8fc7\u7ebf ${passingScore}` : "",
    summary.finalExam ? "\u7ec8\u8003" : "",
    revision ? `\u672c\u6b21\u4fee\u6539\uff1a${revision}` : "",
    source,
  ].filter(Boolean);
  return parts.join(" | ") || "\u56fa\u5b9a\u6b63\u5f0f\u6d4b\u8bd5\u6a21\u677f";
}

function renderKanbanAssessmentArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const visibleCards = kanbanAssessmentVisibleCardItems(group);
  const visibleGroup = Object.assign({}, group, { cards: visibleCards });
  const first = visibleCards[0]?.todo || cards[0]?.todo || {};
  const current = kanbanAssessmentCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const requirement = assessmentTemplateDisplayText(group, currentTodo, first);
  const statusSummary = kanbanArchiveStatusSummary(visibleGroup);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = visibleCards.filter((item) => assessmentExamCompleted(item.todo)).length;
  const total = Number(first.kanbanCaseCardCount || visibleCards.length || cards.length || 0) || visibleCards.length || cards.length;
  const summary = assessmentExamSummary(currentTodo) || {};
  const storyCards = kanbanAssessmentStoryVisibleCardItems(group);
  const currentId = String(currentTodo?.id || "");
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = storyCards.map((item) => {
    const todo = item.todo || {};
    const itemSummary = assessmentExamSummary(todo) || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const attempt = itemSummary.lastAttempt || null;
    const outputCount = kanbanCardOutputs(todo).length;
    const resultLine = attempt
      ? `${attempt.passed ? "已通过" : "未通过"} ${Number(attempt.score || 0)}/100`
      : "";
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      itemSummary.questionCount ? `${itemSummary.questionCount}题/${itemSummary.durationMinutes || 30}分钟` : "",
      itemSummary.passingScore ? `通过线 ${itemSummary.passingScore}` : "",
      resultLine,
      outputCount ? `交付 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "当前" : "",
      todo?.kanbanRevisionOf ? "修改任务" : "",
    ].filter(Boolean).join(" | ");
    const feedback = kanbanCardStoryFeedbackLine(todo);
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case assessment-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["考试计划", statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "考试计划")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    <div class="kanban-archive-story-grid">
      <section>
        <strong>考试模板</strong>
        <p>${escapeHtml(requirement || "固定正式测试模板")}</p>
      </section>
      <section>
        <strong>进度</strong>
        <p>${escapeHtml(`${completed}/${total} 已通过${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>规则</strong>
        <p>${escapeHtml("正式测试高于日常小测；低于通过线则保持重考，直到通过。")}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveCase(group, options = {}) {
  if (group.mode === "assessment-plan") return renderKanbanAssessmentArchiveCase(group, options);
  if (group.mode === "study-plan") return renderKanbanReadingArchiveCase(group, options);
  const cards = group.cards || [];
  const first = cards[0]?.todo || {};
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const conclusion = kanbanArchiveConclusion(group);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const modeLabel = group.mode === "multi-agent" ? "\u591a Agent" : "\u5355\u5361";
  const titleByCardId = new Map(cards.map(({ todo, info }, index) => [
    info.cardId || `card-${info.cardIndex || index + 1}`,
    todo.content || info.cardId || todo.id || "",
  ]));
  const cardRows = cards.slice(0, 8).map(({ todo, info }, index) => {
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const goal = compactDisplayText(info.cardGoal || todo.description || todo.content || "", 160);
    const sequence = info.cardIndex || index + 1;
    const revisionLabel = todo.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "";
    const dependencies = (info.dependsOn || [])
      .map((id) => titleByCardId.get(id) || id)
      .filter(Boolean)
      .join(" / ");
    const outputCount = kanbanCardOutputs(todo).length;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const meta = [status, revisionLabel, dependencies ? `\u4f9d\u8d56\uff1a${dependencies}` : "", goal].filter(Boolean).join(" | ");
    const feedbackLine = [feedback, outputCount ? `\u4ea4\u4ed8 ${outputCount}` : ""].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(sequence))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedbackLine ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedbackLine)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  const more = cards.length > 8 ? `<li class="kanban-archive-more">+${cards.length - 8}</li>` : "";
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const modeClass = group.mode === "single-card"
    ? " single-card-case"
    : (group.mode === "multi-agent" ? " multi-agent-case" : "");
  return `<article class="kanban-archive-case${modeClass}${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["\u4efb\u52a1\u6545\u4e8b", modeLabel, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u62c6\u89e3</strong>
        <p>${escapeHtml(`${cards.length} \u5f20\u5361\u7247${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${cardRows}${more}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveStories(items) {
  const cases = kanbanArchiveCases(items);
  if (!cases.length) return `<div class="empty-state small">No archived cases.</div>`;
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, deleteAction: true })).join("")}</div>`;
}

function renderKanbanStoryTree(items) {
  const cases = kanbanActiveStoryCases(items);
  if (!cases.length) {
    return `<div class="empty-state small">\u6682\u65e0\u6545\u4e8b\u6811\u3002\u5b66\u4e60\u8ba1\u5212\u3001\u8003\u8bd5\u8ba1\u5212\u6216\u591a Agent \u62c6\u89e3\u4f1a\u5728\u8fd9\u91cc\u805a\u5408\uff1b\u666e\u901a\u5355\u4efb\u52a1\u7559\u5728\u5bf9\u5e94\u72b6\u6001\u5217\u3002</div>`;
  }
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, archiveAction: true, deleteAction: true })).join("")}</div>`;
}

function todoDueLabel(todo) {
  return todo?.dueLocal || formatTime(todo?.dueAt) || "No due time";
}

function todoTitle(todo) {
  return compactDisplayText(todo?.content || todo?.id || "Kanban card", 120);
}

function todoMatchesOpen(todo) {
  return String(todo?.status || "") === "open";
}

function defaultTodoAssignee() {
  return state.todoAssignees.some((item) => item.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (state.todoAssignees[0]?.id || state.selectedWorkspaceId || "owner");
}

function renderTodoAssigneeOptions(selected = "") {
  const current = selected || defaultTodoAssignee();
  return (state.todoAssignees || []).map((item) => {
    const value = item.id || "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(item.label || value)}</option>`;
  }).join("");
}

function localDateTimeInputValue(value = null) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todoDueInputValue(todo) {
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return todo?.dueAt ? localDateTimeInputValue(todo.dueAt) : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

function renderTodoList() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
  return;
}

function renderTodos(options = {}) {
  applyViewMode();
  renderTodoList();
  renderTodoPanel(options);
}

function renderTodoRouteMissingNotice() {
  const targetId = String(state.todoRouteMissingTargetId || "").trim();
  if (!targetId || state.selectedTodoId) return "";
  return `<div class="empty-state small">\u672a\u627e\u5230\u63a8\u9001\u5bf9\u5e94\u7684\u5f85\u529e\u5361\u7247\uff0c\u5df2\u5237\u65b0\u770b\u677f\u5217\u8868\u3002</div>`;
}

function renderTodoPanel(options = {}) {
  const conversation = $("conversation");
  const previousScrollTop = conversation ? conversation.scrollTop : 0;
  const active = document.activeElement;
  const restoreKanbanComposerFocus = Boolean(active && state.todoCreateOpen && active.closest?.("#kanbanComposerForm"));
  const restoreTodoDraftFocus = Boolean(active && (active.id === "todoCommentText" || active.id === "todoRevisionText" || active.id === "todoReadingSubmissionNotes"));
  const kanbanComposerSelection = restoreKanbanComposerFocus
    ? { id: active.id || "kanbanComposerText", start: active.selectionStart, end: active.selectionEnd }
    : null;
  const todoDraftFocus = restoreTodoDraftFocus
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd }
    : null;
  if (restoreKanbanComposerFocus) {
    syncKanbanComposerDraftFromDom();
    syncKanbanReadingDraftFromDom(active.closest?.("#kanbanComposerForm") || document);
  }
  if (restoreTodoDraftFocus) syncTodoDetailDraftFromDom(active);
  const selected = state.todos.find((todo) => todo.id === state.selectedTodoId) || null;
  const creating = kanbanComposerOpen();
  $("threadTitle").textContent = creating ? "\u65b0\u589e\u4efb\u52a1" : (selected ? "看板详情" : "看板");
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  const openTodos = state.todos.filter(todoMatchesOpen);
  const closedTodos = state.todos.filter((todo) => !todoMatchesOpen(todo));
  const todoBody = selected
    ? renderTodoDetail(selected)
    : (creating
      ? renderKanbanCreatePage()
      : (isKanbanTodoSource() ? renderTodoKanbanBoard(state.todos) : renderTodoSections(openTodos, closedTodos)));
  conversation.innerHTML = `
    <section class="todo-shell">
      ${selected || creating ? "" : renderTodoCreatePanel()}
      ${selected || creating ? "" : renderTodoRouteMissingNotice()}
      ${todoBody}
    </section>
  `;
  wireTodoPanel(conversation);
  loadKanbanCoverImages(conversation).catch(() => {});
  ensureVerticalScrollAffordance(conversation);
  if (restoreKanbanComposerFocus) {
    const input = $(kanbanComposerSelection?.id || "kanbanComposerText") || $("kanbanComposerText");
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        input.focus();
      }
      if (kanbanComposerSelection && typeof input.setSelectionRange === "function") {
        try {
          input.setSelectionRange(kanbanComposerSelection.start, kanbanComposerSelection.end);
        } catch (_) {}
      }
    }
  }
  if (restoreTodoDraftFocus) restoreTodoDetailDraftFocus(todoDraftFocus);
  if (shouldAutoLoadKanbanDetail(selected)) {
    window.setTimeout(() => loadKanbanCardDetail(selected.id).catch(showError), 0);
  }
  if (!selected && !creating) {
    window.setTimeout(() => scheduleKanbanStoryDetailLoads(state.todos), 0);
  }
  if (options.preserveScroll) {
    const nextScrollTop = Number.isFinite(options.restoreScrollTop) ? options.restoreScrollTop : previousScrollTop;
    conversation.scrollTop = nextScrollTop;
  } else {
    conversation.scrollTop = 0;
  }
}

function renderTodoCreatePanel() {
  if (isKanbanTodoSource()) return "";
  if (!state.todoCreateOpen) {
    return `<button class="todo-create-toggle" type="button" data-open-todo-create>新增卡片</button>`;
  }
  return `<form id="todoCreateForm" class="todo-create">
    <div class="todo-create-grid">
      <input id="todoContent" class="todo-input todo-content-input" type="text" placeholder="卡片内容">
      <input id="todoDue" class="todo-input" type="datetime-local">
      <select id="todoAssignee" class="todo-input">${renderTodoAssigneeOptions()}</select>
      <select id="todoRecurrence" class="todo-input">
        <option value="none">不重复</option>
        <option value="daily">每天</option>
        <option value="weekly">每周</option>
      </select>
    </div>
    <div class="todo-create-actions">
      <input id="todoRecurrenceDays" class="todo-input" type="text" placeholder="每周日期，例如 Mon/Wed/Fri">
      <div class="todo-create-buttons">
        <button class="secondary-small" type="button" data-close-todo-create>收起</button>
        <button class="primary-small" type="submit">添加卡片</button>
      </div>
    </div>
  </form>`;
}

function syncTodoDetailDraftFromDom(input = null) {
  const target = input || document.activeElement;
  if (!target || !["todoCommentText", "todoRevisionText", "todoReadingSubmissionNotes"].includes(target.id)) return;
  const form = target.closest?.("[data-todo-comment-form], [data-todo-revision-form], [data-reading-submission-form]");
  const commentId = form?.dataset?.todoCommentForm || "";
  const revisionId = form?.dataset?.todoRevisionForm || "";
  const readingId = form?.dataset?.readingSubmissionForm || "";
  if (target.id === "todoCommentText" && commentId) state.todoCommentDrafts[commentId] = target.value || "";
  if (target.id === "todoRevisionText" && revisionId) state.todoRevisionDrafts[revisionId] = target.value || "";
  if (target.id === "todoReadingSubmissionNotes" && readingId) state.todoReadingSubmissionDrafts[readingId] = target.value || "";
}

function restoreTodoDetailDraftFocus(focus = null) {
  if (!focus?.id) return;
  const input = $(focus.id);
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  if (typeof input.setSelectionRange === "function") {
    const start = Number.isFinite(focus.start) ? focus.start : input.value.length;
    const end = Number.isFinite(focus.end) ? focus.end : start;
    input.setSelectionRange(start, end);
  }
}

function renderKanbanComposerMessage(message) {
  const role = String(message?.role || "assistant");
  const label = role === "user" ? "\u4f60" : "Hermes";
  return `<article class="kanban-composer-message ${escapeHtml(role)}">
    <strong>${escapeHtml(label)}</strong>
    <p>${escapeHtml(message?.content || "").replace(/\n/g, "<br>")}</p>
  </article>`;
}

function kanbanPlanDependencyLabels(card, plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const byId = new Map(cards.map((item, index) => [String(item.clientId || `card-${index + 1}`), item]));
  return (Array.isArray(card?.dependsOn) ? card.dependsOn : [])
    .map((id) => byId.get(String(id || ""))?.title || String(id || "").trim())
    .filter(Boolean);
}

function renderKanbanPlanDraft(plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const disabled = state.kanbanPlanCreating ? " disabled" : "";
  const cardItems = cards.map((card, index) => {
    const deps = kanbanPlanDependencyLabels(card, plan);
    const status = card.initialRunnable
      ? "\u9996\u6279\u6267\u884c"
      : deps.length
        ? "\u7b49\u5f85\u4f9d\u8d56"
        : "\u7b49\u5f85\u5e76\u884c\u4f4d";
    const deliverables = Array.isArray(card.deliverables) ? card.deliverables.filter(Boolean).slice(0, 4) : [];
    const acceptance = Array.isArray(card.acceptance) ? card.acceptance.filter(Boolean).slice(0, 4) : [];
    return `<article class="kanban-plan-card">
      <div class="kanban-plan-card-head">
        <span>${index + 1}</span>
        <strong>${escapeHtml(card.title || `Card ${index + 1}`)}</strong>
        <em>${escapeHtml(status)}</em>
      </div>
      ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ""}
      ${deps.length ? `<small>${escapeHtml("\u4f9d\u8d56\uff1a" + deps.join(" / "))}</small>` : ""}
      ${deliverables.length ? `<ul>${deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${acceptance.length ? `<small>${escapeHtml("\u9a8c\u6536\uff1a" + acceptance.join(" / "))}</small>` : ""}
    </article>`;
  }).join("");
  const maxParallel = normalizeKanbanComposerMaxParallel(plan?.maxParallel || state.kanbanComposerMaxParallel);
  return `<section class="kanban-plan-draft">
    <div class="kanban-plan-draft-head">
      <div>
        <strong>\u591a Agent \u62c6\u89e3\u8349\u6848</strong>
        <span>${escapeHtml(plan?.summary || "")}</span>
      </div>
      <small>\u6700\u5927\u5e76\u884c ${maxParallel}</small>
    </div>
    <div class="kanban-plan-card-list">${cardItems}</div>
    <div class="kanban-plan-actions">
      <button type="button" data-clear-kanban-plan${disabled}>\u6e05\u7a7a\u8349\u6848</button>
      <button type="button" data-create-kanban-plan${disabled}>\u786e\u8ba4\u6267\u884c ${cards.length} \u5f20\u4efb\u52a1</button>
    </div>
  </section>`;
}

function renderKanbanReasoningOptions(selected = "") {
  const known = new Map();
  const add = (item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    if (known.has(value)) return;
    known.set(value, item);
  };
  TASK_REASONING_OPTIONS.forEach(add);
  configuredReasoningOptions().forEach(add);
  return [...known.values()].map((item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    const label = value ? reasoningEffortLabel(value) : `Hermes default (${defaultReasoningLabel()})`;
    return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function renderKanbanMultiAgentControls(disabled = false) {
  const attr = disabled ? " disabled" : "";
  const maxParallel = normalizeKanbanComposerMaxParallel(state.kanbanComposerMaxParallel);
  const rawReasoningEffort = String(state.kanbanComposerReasoningEffort || "").trim().toLowerCase();
  const reasoningEffort = ["low", "medium", "high", "xhigh"].includes(rawReasoningEffort) ? rawReasoningEffort : "";
  return `<div class="kanban-multi-agent-controls">
    <label>
      <span>\u6700\u5927 Agent \u6570</span>
      <input id="kanbanComposerMaxParallel" class="todo-input" type="number" min="1" max="${KANBAN_MULTI_AGENT_MAX_PARALLEL}" step="1" value="${escapeHtml(String(maxParallel))}"${attr}>
    </label>
    <label>
      <span>\u63a8\u7406\u7b49\u7ea7</span>
      <select id="kanbanComposerReasoningEffort" class="todo-input"${attr}>${renderKanbanReasoningOptions(reasoningEffort)}</select>
    </label>
  </div>`;
}

function renderKanbanComposerDocumentPanel(disabled = false) {
  const attr = disabled ? " disabled" : "";
  const docs = Array.isArray(state.kanbanComposerDocuments) ? state.kanbanComposerDocuments : [];
  const items = docs.map((item, index) => `<li>
    <div>
      <strong>${escapeHtml(item.name || `Document ${index + 1}`)}</strong>
      <small>${escapeHtml([item.mime || item.kind || "", item.size ? formatBytes(item.size) : "", item.truncated ? "\u5df2\u622a\u65ad" : ""].filter(Boolean).join(" | "))}</small>
      <p>${escapeHtml(compactDisplayText(item.text || "", 180) || "\u5df2\u63d0\u53d6\u6587\u6863\u5185\u5bb9")}</p>
    </div>
    <button type="button" data-remove-kanban-composer-document="${index}"${attr}>\u79fb\u9664</button>
  </li>`).join("");
  const uploading = state.kanbanComposerDocumentUploading ? `<small class="kanban-document-upload-status">\u6587\u6863\u6b63\u5728\u89e3\u6790...</small>` : "";
  return `<section class="kanban-document-source">
    <label class="kanban-document-picker">
      <span>\u4e0a\u4f20\u6587\u6863\u4f5c\u4e3a\u9700\u6c42\u6765\u6e90</span>
      <input id="kanbanComposerDocument" type="file" accept=".txt,.md,.markdown,.csv,.json,.docx,text/*,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"${attr}>
    </label>
    ${uploading}
    ${items ? `<ul class="kanban-document-source-list">${items}</ul>` : ""}
  </section>`;
}

function renderKanbanComposerProgress() {
  if (!state.kanbanComposerBusy && !state.kanbanPlanCreating) return "";
  const steps = kanbanComposerProgressSteps();
  const current = Math.max(0, Math.min(steps.length - 1, Number(state.kanbanComposerProgressStep || 0)));
  const elapsed = state.kanbanComposerProgressStartedAt
    ? Math.max(1, Math.round((Date.now() - state.kanbanComposerProgressStartedAt) / 1000))
    : 0;
  const title = state.kanbanComposerProgressKind === "reading"
    ? "正在创建学习计划"
    : (state.kanbanComposerProgressKind === "assessment"
      ? "正在创建考试计划"
      : (state.kanbanComposerProgressKind === "create" ? "\u6b63\u5728\u521b\u5efa\u5e76\u542f\u52a8\u4efb\u52a1" : "\u6b63\u5728\u62c6\u89e3\u4efb\u52a1"));
  return `<section class="kanban-create-progress" aria-live="polite">
    <div class="kanban-create-progress-head">
      <strong>${title}</strong>
      <span>${elapsed}s</span>
    </div>
    <ol>
      ${steps.map((step, index) => {
        const stateClass = index < current ? " done" : (index === current ? " active" : "");
        return `<li class="${stateClass.trim()}"><span>${index + 1}</span><em>${escapeHtml(step)}</em></li>`;
      }).join("")}
    </ol>
  </section>`;
}

function kanbanComposerMode() {
  if (state.kanbanComposerMode === "reading") return "study";
  if (["single", "multi", "study", "assessment"].includes(state.kanbanComposerMode)) return state.kanbanComposerMode;
  return state.kanbanComposerMultiAgent ? "multi" : "single";
}

function renderKanbanReadingFields(disabled = false) {
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  const attr = disabled ? " disabled" : "";
  const rawTemplate = String(draft.studyTemplate || "").trim().toLowerCase();
  const template = rawTemplate === "custom" ? "custom" : (rawTemplate === "programming" ? "programming" : "reading");
  const programmingTemplate = template === "programming";
  const activityTitle = draft.activityTitle || draft.bookTitle || "";
  const learnerName = draft.learnerName || draft.readerName || "";
  const scheduleFrequency = normalizeKanbanStudyScheduleFrequency(draft.scheduleFrequency);
  const scheduleWeekdays = new Set(parseKanbanStudyWeekdays(draft.scheduleWeekdays || "1"));
  const scheduleMonthDay = Math.max(1, Math.min(31, Number(draft.scheduleMonthDay || "1") || 1));
  const selectedPerformer = String(draft.performerWorkspaceId || "").trim();
  const selectedViewers = new Set(parseWorkspaceIdList(draft.viewerWorkspaceIds));
  const currentWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  const shareWorkspaces = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .filter((workspace) => String(workspace?.id || "").trim() && String(workspace.id) !== currentWorkspaceId);
  const performerControl = shareWorkspaces.length
    ? `<select id="kanbanStudyPerformerWorkspace" class="todo-input"${attr}>
        <option value="">不指定执行工作区</option>
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          return `<option value="${escapeHtml(id)}"${selectedPerformer === id ? " selected" : ""}>${escapeHtml(workspace.label || id)} (${escapeHtml(id)})</option>`;
        }).join("")}
      </select>`
    : `<input id="kanbanStudyPerformerWorkspace" class="todo-input" type="text" value="${escapeHtml(selectedPerformer)}" placeholder="workspace id"${attr}>`;
  const viewerControl = shareWorkspaces.length
    ? `<div class="kanban-study-share-list">
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          const disabledViewer = id === selectedPerformer || disabled;
          return `<span class="kanban-study-share-option">
            <input type="checkbox" data-kanban-study-viewer-workspace value="${escapeHtml(id)}"${selectedViewers.has(id) ? " checked" : ""}${disabledViewer ? " disabled" : ""}>
            <span>${escapeHtml(workspace.label || id)} <small>${escapeHtml(id)}</small></span>
          </span>`;
        }).join("")}
      </div>
      <input id="kanbanStudyViewerWorkspaces" type="hidden" value="${escapeHtml(Array.from(selectedViewers).join(","))}">`
    : `<input id="kanbanStudyViewerWorkspaces" class="todo-input" type="text" value="${escapeHtml(draft.viewerWorkspaceIds || "")}" placeholder="多个 id 用逗号分隔"${attr}>`;
  const coverPreview = state.kanbanReadingCoverPreviewUrl
    ? `<img src="${escapeHtml(state.kanbanReadingCoverPreviewUrl)}" alt="cover preview">`
    : `<span class="kanban-reading-cover-placeholder">${escapeHtml(draft.coverName || "可选上传封面图")}</span>`;
  return `<div class="kanban-reading-fields">
    <label>
      <span>学习模板</span>
      <select id="kanbanStudyTemplate" class="todo-input"${attr}>
        <option value="reading"${template === "reading" ? " selected" : ""}>阅读复述</option>
        <option value="programming"${template === "programming" ? " selected" : ""}>编程测验</option>
        <option value="custom"${template === "custom" ? " selected" : ""}>通用学习</option>
      </select>
    </label>
    <label>
      <span>学科 / 领域</span>
      <input id="kanbanStudySubject" class="todo-input" type="text" value="${escapeHtml(draft.subjectDomain || (programmingTemplate ? "Python 编程" : ""))}" placeholder="${escapeHtml(programmingTemplate ? "Python 编程、JavaScript、算法..." : "英语、数学、科学...")}"${attr}>
    </label>
    <label>
      <span>学习者 / 目标</span>
      <input id="kanbanStudyLearner" class="todo-input" type="text" value="${escapeHtml(learnerName)}" placeholder="姓名或目标对象"${attr}>
      <input id="kanbanReadingReader" type="hidden" value="${escapeHtml(draft.readerName || learnerName)}">
    </label>
    <label>
      <span>内容标题</span>
      <input id="kanbanStudyTitle" class="todo-input" type="text" value="${escapeHtml(activityTitle)}" placeholder="${escapeHtml(programmingTemplate ? "Python 基础测验、循环练习、项目实战..." : "书名、章节、主题或活动")}"${attr}>
      <input id="kanbanReadingBook" type="hidden" value="${escapeHtml(draft.bookTitle || activityTitle)}">
    </label>
    <label>
      <span>执行工作区</span>
      ${performerControl}
    </label>
    <label>
      <span>只读查看工作区</span>
      ${viewerControl}
    </label>
    ${renderKanbanPlanBindingPreview(draft, "study")}
    <label>
      <span>次数</span>
      <input id="kanbanReadingSessions" class="todo-input" type="number" min="1" max="31" step="1" value="${escapeHtml(draft.sessions || "10")}"${attr}>
    </label>
    <label>
      <span>开始日期</span>
      <input id="kanbanReadingStartDate" class="todo-input" type="date" value="${escapeHtml(draft.startDate || todayDateInputValue())}"${attr}>
    </label>
    <label>
      <span>每天时间</span>
      <input id="kanbanReadingTime" class="todo-input" type="time" value="${escapeHtml(draft.timeOfDay || "21:00")}"${attr}>
    </label>
    <label>
      <span>执行频率</span>
      <select id="kanbanStudyScheduleFrequency" class="todo-input"${attr}>
        <option value="daily"${scheduleFrequency === "daily" ? " selected" : ""}>每日</option>
        <option value="weekly"${scheduleFrequency === "weekly" ? " selected" : ""}>每周几</option>
        <option value="monthly"${scheduleFrequency === "monthly" ? " selected" : ""}>每月</option>
      </select>
    </label>
    <div class="kanban-study-schedule-weekdays" data-kanban-study-weekdays${scheduleFrequency === "weekly" ? "" : " hidden"}>
      <span>每周执行日</span>
      ${[
        [1, "周一"],
        [2, "周二"],
        [3, "周三"],
        [4, "周四"],
        [5, "周五"],
        [6, "周六"],
        [7, "周日"],
      ].map(([value, label]) => `<label class="kanban-study-schedule-option">
        <input type="checkbox" data-kanban-study-weekday value="${value}"${scheduleWeekdays.has(value) ? " checked" : ""}${attr}>
        <span>${label}</span>
      </label>`).join("")}
    </div>
    <label data-kanban-study-month-day${scheduleFrequency === "monthly" ? "" : " hidden"}>
      <span>每月日期</span>
      <input id="kanbanStudyScheduleMonthDay" class="todo-input" type="number" min="1" max="31" step="1" value="${escapeHtml(String(scheduleMonthDay))}"${attr}>
    </label>
    <label>
      <span>提前提醒</span>
      <input id="kanbanReadingReminder" class="todo-input" type="number" min="0" max="1440" step="5" value="${escapeHtml(draft.reminderLeadMinutes || "15")}"${attr}>
    </label>
    ${programmingTemplate ? "" : `<label class="kanban-reading-cover-field">
      <span>封面图</span>
      <input id="kanbanReadingCover" class="todo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"${attr}>
      <span class="kanban-reading-cover-preview">${coverPreview}</span>
    </label>`}
  </div>`;
}

function renderKanbanAssessmentFields(disabled = false) {
  const draft = Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
  const attr = disabled ? " disabled" : "";
  const selectedSubject = String(draft.subject || "").trim();
  const assessmentSubjects = ["数学", "Python 编程", "英语", "科学", "历史", "中文"];
  if (selectedSubject && !assessmentSubjects.includes(selectedSubject)) assessmentSubjects.push(selectedSubject);
  const selectedPerformer = String(draft.performerWorkspaceId || "").trim();
  const selectedViewers = new Set(parseWorkspaceIdList(draft.viewerWorkspaceIds));
  const currentWorkspaceId = String(state.selectedWorkspaceId || "").trim();
  const shareWorkspaces = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .filter((workspace) => String(workspace?.id || "").trim() && String(workspace.id) !== currentWorkspaceId);
  const performerControl = shareWorkspaces.length
    ? `<select id="kanbanAssessmentPerformerWorkspace" class="todo-input"${attr}>
        <option value="">不指定执行工作区</option>
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          return `<option value="${escapeHtml(id)}"${selectedPerformer === id ? " selected" : ""}>${escapeHtml(workspace.label || id)} (${escapeHtml(id)})</option>`;
        }).join("")}
      </select>`
    : `<input id="kanbanAssessmentPerformerWorkspace" class="todo-input" type="text" value="${escapeHtml(selectedPerformer)}" placeholder="workspace id"${attr}>`;
  const viewerControl = shareWorkspaces.length
    ? `<div class="kanban-study-share-list">
        ${shareWorkspaces.map((workspace) => {
          const id = String(workspace.id || "");
          const disabledViewer = id === selectedPerformer || disabled;
          return `<span class="kanban-study-share-option">
            <input type="checkbox" data-kanban-assessment-viewer-workspace value="${escapeHtml(id)}"${selectedViewers.has(id) ? " checked" : ""}${disabledViewer ? " disabled" : ""}>
            <span>${escapeHtml(workspace.label || id)} <small>${escapeHtml(id)}</small></span>
          </span>`;
        }).join("")}
      </div>
      <input id="kanbanAssessmentViewerWorkspaces" type="hidden" value="${escapeHtml(Array.from(selectedViewers).join(","))}">`
    : `<input id="kanbanAssessmentViewerWorkspaces" class="todo-input" type="text" value="${escapeHtml(draft.viewerWorkspaceIds || "")}" placeholder="多个 id 用逗号分隔"${attr}>`;
  return `<div class="kanban-reading-fields kanban-assessment-fields">
    <label>
      <span>科目</span>
      <select id="kanbanAssessmentSubject" class="todo-input"${attr}>
        ${assessmentSubjects.map((subject) => `<option value="${escapeHtml(subject)}"${selectedSubject === subject ? " selected" : ""}>${escapeHtml(subject)}</option>`).join("")}
      </select>
    </label>
    <label>
      <span>学习者</span>
      <input id="kanbanAssessmentLearner" class="todo-input" type="text" value="${escapeHtml(draft.learnerName || "")}" placeholder="姓名或目标对象"${attr}>
    </label>
    <label>
      <span>阶段 / 课程</span>
      <input id="kanbanAssessmentLevel" class="todo-input" type="text" value="${escapeHtml(draft.courseLevel || "")}" placeholder="本学期、AMC8、A-Level..."${attr}>
    </label>
    <label>
      <span>计划标题</span>
      <input id="kanbanAssessmentTitle" class="todo-input" type="text" value="${escapeHtml(draft.planTitle || "")}" placeholder="本学期数学能力检测"${attr}>
    </label>
    <label>
      <span>执行工作区</span>
      ${performerControl}
    </label>
    <label>
      <span>只读查看工作区</span>
      ${viewerControl}
    </label>
    ${renderKanbanPlanBindingPreview(draft, "assessment")}
    <label>
      <span>考试次数</span>
      <input id="kanbanAssessmentExamCount" class="todo-input" type="number" min="1" max="30" step="1" value="${escapeHtml(draft.examCount || "10")}"${attr}>
    </label>
    <label>
      <span>每次题量</span>
      <input id="kanbanAssessmentQuestionCount" class="todo-input" type="number" min="5" max="40" step="1" value="${escapeHtml(draft.questionCount || "20")}"${attr}>
    </label>
    <label>
      <span>时长分钟</span>
      <input id="kanbanAssessmentDuration" class="todo-input" type="number" min="5" max="180" step="5" value="${escapeHtml(draft.durationMinutes || "30")}"${attr}>
    </label>
    <label>
      <span>通过线</span>
      <input id="kanbanAssessmentPassingScore" class="todo-input" type="number" min="50" max="100" step="1" value="${escapeHtml(draft.passingScore || "80")}"${attr}>
    </label>
    <label>
      <span>间隔天数</span>
      <input id="kanbanAssessmentIntervalDays" class="todo-input" type="number" min="1" max="60" step="1" value="${escapeHtml(draft.intervalDays || "14")}"${attr}>
    </label>
    <label>
      <span>首次日期</span>
      <input id="kanbanAssessmentStartDate" class="todo-input" type="date" value="${escapeHtml(draft.startDate || todayDateInputValue())}"${attr}>
    </label>
    <label>
      <span>考试时间</span>
      <input id="kanbanAssessmentTime" class="todo-input" type="time" value="${escapeHtml(draft.timeOfDay || "19:30")}"${attr}>
    </label>
    <label>
      <span>提前提醒</span>
      <input id="kanbanAssessmentReminder" class="todo-input" type="number" min="0" max="1440" step="5" value="${escapeHtml(draft.reminderLeadMinutes || "30")}"${attr}>
    </label>
    <label>
      <span>难度分布</span>
      <input id="kanbanAssessmentDifficulty" class="todo-input" type="text" value="${escapeHtml(draft.difficulty || "")}" placeholder="基础30% / 中等50% / 挑战20%"${attr}>
    </label>
  </div>`;
}

function renderKanbanComposerPanel() {
  if (!isKanbanTodoSource()) return "";
  const busy = state.kanbanComposerBusy || state.kanbanPlanCreating;
  const messages = state.kanbanComposerMessages.slice(-10).map(renderKanbanComposerMessage).join("");
  const draft = state.kanbanPlanDraft ? renderKanbanPlanDraft(state.kanbanPlanDraft) : "";
  if (!state.todoCreateOpen && !busy) return "";
  const mode = kanbanComposerMode();
  const singleActive = mode === "single";
  const multiActive = mode === "multi";
  const studyActive = mode === "study";
  const assessmentActive = mode === "assessment";
  const programmingStudyActive = studyActive && isKanbanProgrammingStudyTemplate(state.kanbanReadingDraft?.studyTemplate);
  const modeButton = (mode, label, active) => `<button class="kanban-create-mode-button${active ? " active" : ""}" type="button" data-kanban-composer-mode="${mode}" aria-pressed="${active ? "true" : "false"}"${busy ? " disabled" : ""}>${label}</button>`;
  const submitLabel = assessmentActive
    ? "\u521b\u5efa\u8003\u8bd5\u8ba1\u5212"
    : (studyActive
      ? (programmingStudyActive ? "\u521b\u5efa\u7f16\u7a0b\u6d4b\u9a8c\u8ba1\u5212" : "\u521b\u5efa\u5b66\u4e60\u8ba1\u5212")
      : (multiActive
        ? (state.kanbanPlanDraft ? "\u91cd\u65b0\u62c6\u89e3" : "\u62c6\u89e3\u4efb\u52a1")
        : "\u521b\u5efa\u4efb\u52a1"));
  const placeholder = assessmentActive
    ? "\u8865\u5145\u8003\u8bd5\u8303\u56f4\u3001\u9898\u578b\u6bd4\u4f8b\u3001\u6559\u6750\u7ae0\u8282\u6216\u8584\u5f31\u70b9"
    : (studyActive
      ? (programmingStudyActive ? "\u8865\u5145\u7f16\u7a0b\u9879\u76ee\u3001\u8bfe\u5802\u91cd\u70b9\u3001\u7ec3\u4e60\u8303\u56f4\u6216\u51fa\u9898\u8981\u6c42\uff0c\u6216\u7559\u7a7a" : "\u8865\u5145\u5b66\u4e60\u8303\u56f4\u3001\u5206\u6bb5\u8981\u6c42\u3001\u8bc4\u4ef7\u91cd\u70b9\uff0c\u6216\u7559\u7a7a")
      : "\u8f93\u5165\u4efb\u52a1\u9700\u6c42");
  const caption = assessmentActive
    ? "\u56fa\u5b9a\u6b63\u5f0f\u8003\u8bd5\u6a21\u677f\uff1b\u672a\u8fbe\u901a\u8fc7\u7ebf\u4f1a\u4fdd\u7559\u91cd\u8003"
    : (studyActive
      ? (programmingStudyActive ? "\u6309\u5b66\u4e60\u8ba1\u5212\u65e5\u671f\u5f00\u653e\u7f16\u7a0b\u6d4b\u9a8c\u5361\uff1b\u6bcf\u5f20\u5361\u5f00\u653e\u540e\u586b\u5199\u672c\u6b21\u8981\u6c42\u518d\u51fa\u9898" : "\u6bcf\u6b21\u5b66\u4e60\u4e00\u5f20\u5361\u7247\uff0c\u6bcf\u65e5\u5c0f\u6d4b\u901a\u8fc7\u540e\u5b8c\u6210\uff1b\u6700\u540e\u6709\u7efc\u5408\u8003\u8bd5")
      : (multiActive ? `\u6700\u5927\u5e76\u884c ${KANBAN_MULTI_AGENT_MAX_PARALLEL}` : "\u76f4\u63a5\u8fdb\u5165 todo"));
  return `<section class="kanban-composer-panel">
    <form id="kanbanComposerForm" class="kanban-composer-form">
      <div class="kanban-create-mode" role="group" aria-label="\u4efb\u52a1\u521b\u5efa\u65b9\u5f0f">
        ${modeButton("single", "\u5355\u4efb\u52a1", singleActive)}
        ${modeButton("multi", "\u62c6\u89e3", multiActive)}
        ${modeButton("study", "\u5b66\u4e60\u8ba1\u5212", studyActive)}
        ${modeButton("assessment", "\u8003\u8bd5\u8ba1\u5212", assessmentActive)}
      </div>
      ${studyActive ? renderKanbanReadingFields(busy) : ""}
      ${assessmentActive ? renderKanbanAssessmentFields(busy) : ""}
      ${multiActive ? renderKanbanMultiAgentControls(busy) : ""}
      ${renderKanbanComposerDocumentPanel(busy)}
      <textarea id="kanbanComposerText" class="kanban-composer-input" rows="${studyActive || assessmentActive ? "4" : "7"}" placeholder="${escapeHtml(placeholder)}"${busy ? " disabled" : ""}>${escapeHtml(state.kanbanComposerText)}</textarea>
      <div class="kanban-composer-toolbar">
        <span class="kanban-create-mode-caption">${escapeHtml(caption)}</span>
        <span class="kanban-composer-buttons">
          <button type="button" data-close-todo-create${busy ? " disabled" : ""}>\u8fd4\u56de\u770b\u677f</button>
          <button type="submit"${busy ? " disabled" : ""}>${submitLabel}</button>
        </span>
      </div>
    </form>
    ${renderKanbanComposerProgress()}
    ${(messages || draft) ? `<div class="kanban-composer-thread">${messages}${draft}</div>` : ""}
  </section>`;
}

function renderKanbanCreatePage() {
  return `<div class="kanban-create-page">
    ${renderKanbanComposerPanel()}
  </div>`;
}

function renderTodoKanbanBoard(todos) {
  const grouped = new Map(KANBAN_STATUS_ORDER.map((status) => [status, []]));
  const boardTodos = kanbanVisibleBoardTodos(todos);
  for (const todo of boardTodos) {
    const status = normalizedKanbanStatus(todo);
    if (!grouped.has(status)) grouped.set(status, []);
    grouped.get(status).push(todo);
  }
  grouped.set("done", sortArchivedKanbanCards(grouped.get("done") || []));
  grouped.set("archived", sortArchivedKanbanCards(grouped.get("archived") || []));
  const selectedStatus = currentTodoKanbanStatus(grouped);
  const selectedMeta = kanbanStatusMeta(selectedStatus);
  const selectedItems = grouped.get(selectedStatus) || [];
  const storyCases = state.todoCompletedLoaded ? kanbanActiveStoryCases(todos) : [];
  const tabs = KANBAN_TAB_ORDER.map((status) => {
    const meta = kanbanStatusMeta(status);
    const items = grouped.get(status) || [];
    const active = status === selectedStatus ? " active" : "";
    const count = status === KANBAN_STORY_STATUS
      ? (state.todoCompletedLoaded ? String(storyCases.length) : "\u2026")
      : (!state.todoCompletedLoaded && kanbanStatusNeedsCompleted(status) ? "\u2026" : String(items.length));
    return `<button class="todo-kanban-tab${active} status-${escapeHtml(status)}" type="button" data-kanban-status="${escapeHtml(status)}" aria-pressed="${active ? "true" : "false"}">
      <span class="todo-kanban-tab-label">${escapeHtml(meta.label)}</span>
      <span class="todo-kanban-tab-count">${escapeHtml(count)}</span>
    </button>`;
  }).join("");
  const laneBody = selectedStatus === KANBAN_STORY_STATUS
    ? renderKanbanStoryTree(todos)
    : (selectedStatus === "archived" ? renderKanbanArchiveStories(selectedItems) : (selectedItems.map(renderTodoKanbanCard).join("") || `<div class="empty-state small">No items.</div>`));
  return `
    <div class="todo-kanban-board">
      <nav class="todo-kanban-switcher" aria-label="Kanban status">${tabs}</nav>
      <section class="todo-kanban-lane todo-kanban-current status-${escapeHtml(selectedStatus)}" aria-label="${escapeHtml(selectedMeta.shortLabel)}" role="list">
        <header class="todo-kanban-lane-header">
          <div>
            <div class="todo-kanban-lane-title">${escapeHtml(selectedMeta.label)}</div>
            <div class="todo-kanban-lane-code">${escapeHtml(selectedMeta.shortLabel)}</div>
          </div>
          <span>${selectedStatus === KANBAN_STORY_STATUS ? storyCases.length : selectedItems.length}</span>
        </header>
        <div class="todo-kanban-cards">${laneBody}</div>
      </section>
    </div>
  `;
}

function renderTodoKanbanCard(todo) {
  const status = normalizedKanbanStatus(todo);
  const meta = kanbanStatusMeta(status);
  const assignee = todo.kanbanAssignee || todo.assigneeLabel || todo.assignee || "";
  const priority = todoPriorityLabel(todo);
  const tenant = todo.kanbanTenant || "";
  const due = todoDueLabel(todo);
  const skills = Array.isArray(todo.kanbanSkills) ? todo.kanbanSkills.slice(0, 3) : [];
  const chips = [
    priority,
    assignee ? `@${assignee}` : "",
    tenant && tenant !== assignee ? tenant : "",
    todo.kanbanWorkspaceKind || "",
  ].filter(Boolean);
  return `<article class="todo-kanban-card status-${escapeHtml(status)}" role="listitem">
    <button class="todo-kanban-card-button" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <span class="todo-kanban-card-status">${escapeHtml(meta.shortLabel)}</span>
      <span class="todo-kanban-card-title">${escapeHtml(todo.content || todo.id)}</span>
      <span class="todo-kanban-card-meta">${escapeHtml(due)}</span>
      ${chips.length ? `<span class="todo-kanban-card-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</span>` : ""}
      ${skills.length ? `<span class="todo-kanban-card-skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</span>` : ""}
    </button>
  </article>`;
}

function renderTodoSections(openTodos, closedTodos) {
  return `
    <div class="todo-section">
      <div class="todo-section-title">未完成 · ${openTodos.length}</div>
      <div class="todo-card-list">${openTodos.map(renderTodoCard).join("") || `<div class="empty-state small">No open cards.</div>`}</div>
    </div>
    <div class="todo-section todo-section-muted">
      <div class="todo-section-title">已完成 / 已取消 · ${closedTodos.length}</div>
      <div class="todo-card-list">${closedTodos.slice(0, 30).map(renderTodoCard).join("") || `<div class="empty-state small">No completed cards.</div>`}</div>
    </div>
  `;
}

function renderTodoCard(todo) {
  const status = todoStatusLabel(todo);
  return `<article class="todo-card task-swipe-row ${escapeHtml(status)}" data-swipe-row data-swipe-kind="todo" data-swipe-id="${escapeHtml(todo.id)}">
    <button class="task-swipe-delete" type="button" data-delete-swipe="${escapeHtml(todo.id)}" aria-label="删除看板卡片">删除</button>
    <div class="task-swipe-content" data-swipe-content>
      <button class="todo-card-main" type="button" data-todo-id="${escapeHtml(todo.id)}">
      <span class="todo-card-title">${escapeHtml(todo.content || todo.id)}</span>
      <span class="todo-card-meta">${escapeHtml(todo.assigneeLabel || todo.assignee || "")} · ${escapeHtml(todoDueLabel(todo))}</span>
      <span class="todo-card-status">${escapeHtml(todoStatusText(todo))}${todo.recurrenceLabel ? ` | ${escapeHtml(todo.recurrenceLabel)}` : ""}</span>
      </button>
    </div>
  </article>`;
}

function renderTodoDetailGridItem(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function todoCardDetailState(todoId) {
  return state.todoCardDetails?.[todoId] || null;
}

function dedupeKanbanOutputs(outputs) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(outputs) ? outputs : []) {
    const key = String(item?.url || item?.path || item?.name || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function kanbanCardOutputs(todo) {
  const detail = todoCardDetailState(todo?.id || "");
  const readingOutput = todo?.readingSubmission?.analysisOutput ? [todo.readingSubmission.analysisOutput] : [];
  const outputs = dedupeKanbanOutputs([
    ...(Array.isArray(todo?.kanbanOutputs) ? todo.kanbanOutputs : []),
    ...readingOutput,
    ...(Array.isArray(detail?.outputs) ? detail.outputs : []),
  ]);
  if (isKanbanAssessmentCard(todo)) {
    const summary = assessmentExamSummary(todo) || {};
    if (!summary.lastAttempt && !assessmentExamCompleted(todo)) return [];
    return outputs.filter((item) => {
      const name = String(item?.name || item?.path || "").toLowerCase();
      return !name.includes("answer_key") && !name.includes("sample_answers");
    });
  }
  return outputs;
}

function shouldAutoLoadKanbanDetail(todo) {
  if (!todo || !isKanbanTodoSource() || todoCardDetailState(todo.id)) return false;
  return !String(todo?.kanbanResult || "").trim() && !kanbanCardOutputs(todo).length;
}

function renderKanbanOutputLinks(outputs, className = "todo-detail-outputs") {
  const items = Array.isArray(outputs) ? outputs : [];
  if (!items.length) return "";
  return `<div class="${escapeHtml(className)}">
    ${items.map((item) => `<a href="${escapeHtml(kanbanOutputHref(item))}" target="_self" rel="noopener">
      <span>${escapeHtml(item.name || "output")}</span>
      <small>${escapeHtml(item.displayPath || item.path || "")}</small>
    </a>`).join("")}
  </div>`;
}

function renderKanbanDeliveryFiles(todo) {
  const outputs = kanbanCardOutputs(todo);
  if (!outputs.length) return "";
  return `<section class="todo-detail-deliverables">
    <div class="todo-detail-deliverables-head">
      <strong>\u4ea4\u4ed8\u6587\u4ef6</strong>
      <span>${outputs.length}</span>
    </div>
    ${renderKanbanOutputLinks(outputs)}
  </section>`;
}

function kanbanOutputHref(item) {
  return artifactHref({
    url: item?.url || "#",
    name: item?.name || "output",
    mime: item?.mime || "",
    size: item?.size || 0,
  });
}

function kanbanCaseCover(todo) {
  return todo?.kanbanCaseCover && typeof todo.kanbanCaseCover === "object" ? todo.kanbanCaseCover : null;
}

function renderKanbanCaseCover(cover, options = {}) {
  if (!cover?.url) return "";
  const compact = options.compact ? " compact" : "";
  const title = cover.name || "book cover";
  return `<a class="kanban-reading-cover${compact}" href="${escapeHtml(kanbanOutputHref(cover))}" target="_self" aria-label="${escapeHtml(`预览 ${title}`)}">
    <span class="kanban-reading-cover-frame">
      <img data-kanban-cover-img data-cover-url="${escapeHtml(cover.url)}" alt="${escapeHtml(title)}">
    </span>
    ${options.hideLabel ? "" : `<span>${escapeHtml(title)}</span>`}
  </a>`;
}

async function loadKanbanCoverImages(root = document) {
  const nodes = [...(root.querySelectorAll?.("img[data-kanban-cover-img][data-cover-url]") || [])];
  for (const img of nodes) {
    const url = String(img.dataset.coverUrl || "");
    if (!url || img.dataset.coverLoaded === "1") continue;
    if (state.kanbanCoverObjectUrls[url]) {
      img.src = state.kanbanCoverObjectUrls[url];
      img.dataset.coverLoaded = "1";
      continue;
    }
    try {
      const headers = {};
      if (state.key) headers["X-Hermes-Web-Key"] = state.key;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      state.kanbanCoverObjectUrls[url] = objectUrl;
      if (img.isConnected) {
        img.src = objectUrl;
        img.dataset.coverLoaded = "1";
      }
    } catch (_) {
      img.dataset.coverLoaded = "error";
    }
  }
}

function renderKanbanProcessRows(detail) {
  const events = Array.isArray(detail?.events) ? detail.events.filter((event) => event.preview || event.kind).slice(-6) : [];
  const runs = Array.isArray(detail?.runs) ? detail.runs.filter((run) => run.summary || run.status || run.outcome).slice(-3) : [];
  const eventRows = events.map((event) => `<li><strong>${escapeHtml(event.kind || "event")}</strong><span>${escapeHtml(event.preview || "")}</span></li>`);
  const runRows = runs.map((run) => `<li><strong>${escapeHtml([run.profile, run.outcome || run.status].filter(Boolean).join(" / ") || "run")}</strong><span>${escapeHtml(run.summary || "")}</span></li>`);
  const rows = [...eventRows, ...runRows];
  return rows.length ? `<ul class="todo-detail-process">${rows.join("")}</ul>` : "";
}

function renderKanbanDetailReport(todo) {
  if (!isKanbanTodoSource()) return "";
  if (isKanbanAssessmentCard(todo) && !assessmentHasVisibleResult(todo)) return "";
  const detail = todoCardDetailState(todo.id);
  const summary = kanbanDisplayResultText(todo, todo.kanbanResult || detail?.summary || "");
  const readingCard = isKanbanReadingCard(todo);
  const labels = kanbanStudyLabels(todo);
  if (readingCard && kanbanCardOutputs(todo).length) return "";
  const processRows = detail && !readingCard ? renderKanbanProcessRows(detail) : "";
  const loading = detail?.loading;
  const error = detail?.error || "";
  const actionLabel = loading ? "\u52a0\u8f7d\u4e2d" : (detail ? "\u5237\u65b0\u8fc7\u7a0b" : "\u52a0\u8f7d\u8fc7\u7a0b");
  const title = readingCard ? labels.receipt : "\u56de\u6267 / \u8fc7\u7a0b";
  const emptyText = readingCard && kanbanCardOutputs(todo).length
    ? "\u5b8c\u6574\u5206\u6790\u5df2\u5728\u4e0a\u65b9\u4ea4\u4ed8\u6587\u4ef6\u4e2d\u3002"
    : "\u6682\u65e0\u56de\u6267\u6458\u8981\u3002";
  return `<section class="todo-detail-result">
    <div class="todo-detail-result-head">
      <strong>${escapeHtml(title)}</strong>
      <button type="button" data-load-kanban-detail="${escapeHtml(todo.id)}"${loading ? " disabled" : ""}>${actionLabel}</button>
    </div>
    ${loading ? `<p class="todo-detail-muted">正在加载官方看板过程...</p>` : ""}
    ${error ? `<p class="todo-detail-error">${escapeHtml(error)}</p>` : ""}
    ${summary ? `<pre>${escapeHtml(summary)}</pre>` : (!loading && !error ? `<p class="todo-detail-muted">${escapeHtml(emptyText)}</p>` : "")}
    ${processRows}
  </section>`;
}

function isKanbanReadingCard(todo) {
  return isKanbanStudyCase(todo) && !isKanbanFinalStudyAssessment(todo);
}

function readingSubmissionSummary(todo) {
  return todo?.readingSubmission && typeof todo.readingSubmission === "object"
    ? todo.readingSubmission
    : null;
}

function readingSubmissionHasAnalysis(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) {
    return ["quiz_pending", "completed"].includes(String(workflow.phase || ""));
  }
  const summary = readingSubmissionSummary(todo);
  return Boolean(
    summary?.quizAvailable
    || summary?.analysisOutput
    || readingQuizState(todo?.id || "")?.quiz
    || kanbanCardOutputs(todo).length,
  );
}

function readingSubmissionCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) return Boolean(workflow.completed);
  const summary = readingSubmissionSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function readingSubmissionFeedback(todoId) {
  return state.todoReadingSubmissionFeedback?.[todoId] || null;
}

function setReadingSubmissionFeedback(todoId, feedback = {}) {
  if (!todoId) return;
  state.todoReadingSubmissionFeedback[todoId] = Object.assign({ updatedAt: Date.now() }, feedback);
}

function clearReadingSubmissionWatchdog(todoId) {
  const timer = state.todoReadingSubmissionWatchdogs?.[todoId];
  if (timer) {
    window.clearTimeout(timer);
    delete state.todoReadingSubmissionWatchdogs[todoId];
  }
}

function clearReadingSubmissionPendingState(todoId) {
  if (!todoId) return;
  clearReadingSubmissionWatchdog(todoId);
  delete state.todoReadingSubmitting[todoId];
  delete state.todoReadingSubmissionRefreshing[todoId];
  delete state.todoReadingSubmissionProgress[todoId];
}

function answerDraftHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function answerDraftStorageId(value) {
  return encodeURIComponent(String(value || ""));
}

function answerDraftStoragePrefix(kind, workspaceId, todoId) {
  return `hermes${kind}AnswerDraft:${answerDraftStorageId(workspaceId || "owner")}:${answerDraftStorageId(todoId)}:`;
}

function answerDraftStorageKey(kind, workspaceId, todoId, fingerprint) {
  return `${answerDraftStoragePrefix(kind, workspaceId, todoId)}${answerDraftHash(fingerprint)}`;
}

function answerDraftFingerprint(source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const questionKey = questions.map((question, index) => [
    question?.id || `q${index + 1}`,
    question?.prompt || "",
    Array.isArray(question?.choices) ? question.choices.length : 0,
  ].join(":")).join("|");
  return [
    source.startedAt || "",
    source.quizTargetingVersion || "",
    source.verification || "",
    source.status || "",
    questions.length,
    questionKey,
  ].join("|");
}

function validAnswerChoice(value, question = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  const choices = Array.isArray(question.choices) ? question.choices : [];
  return Number.isInteger(parsed) && parsed >= 0 && parsed < choices.length ? parsed : null;
}

function serializeAnswerDraftAnswers(answers = [], questions = []) {
  return questions.map((question, index) => validAnswerChoice(answers[index], question));
}

function restoreAnswerDraftAnswers(answers = [], questions = []) {
  const restored = [];
  questions.forEach((question, index) => {
    const value = validAnswerChoice(answers[index], question);
    if (value !== null) restored[index] = value;
  });
  return restored;
}

function answerDraftAnsweredCount(answers = [], questions = []) {
  return serializeAnswerDraftAnswers(answers, questions).filter((value) => value !== null).length;
}

function clearAnswerDrafts(kind, workspaceId, todoId, keepKey = "") {
  const prefix = answerDraftStoragePrefix(kind, workspaceId, todoId);
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(prefix) && key !== keepKey) localStorage.removeItem(key);
    }
  } catch (_) {}
}

function readAnswerDraft(kind, workspaceId, todoId, source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return { answers: [], step: 0 };
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  clearAnswerDrafts(kind, workspaceId, todoId, key);
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (!raw || typeof raw !== "object") return { answers: [], step: 0 };
    const answers = restoreAnswerDraftAnswers(Array.isArray(raw.answers) ? raw.answers : [], questions);
    const maxStep = Math.max(0, questions.length - 1);
    const step = Math.max(0, Math.min(maxStep, Number(raw.step || 0) || 0));
    return { answers, step };
  } catch (_) {
    return { answers: [], step: 0 };
  }
}

function writeAnswerDraft(kind, workspaceId, todoId, source = {}, answers = [], step = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return;
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  const payload = {
    updatedAt: new Date().toISOString(),
    answers: serializeAnswerDraftAnswers(answers, questions),
    step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(step || 0) || 0)),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    clearAnswerDrafts(kind, workspaceId, todoId, key);
  } catch (_) {}
}

function applyAnswerDraft(kind, workspaceId, todoId, source = {}, existingAnswers = [], existingStep = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const existingCount = answerDraftAnsweredCount(existingAnswers, questions);
  if (existingCount > 0) {
    return {
      answers: restoreAnswerDraftAnswers(existingAnswers, questions),
      step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(existingStep || 0) || 0)),
    };
  }
  return readAnswerDraft(kind, workspaceId, todoId, source);
}

function readingSubmissionReady(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return false;
  const quiz = readingQuizState(id)?.quiz;
  if (quiz && Array.isArray(quiz.questions) && quiz.questions.length) return true;
  return readingSubmissionHasAnalysis(kanbanCardById(id));
}

function readReadingQuizDraft(todoId, quiz = {}) {
  return readAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz);
}

function writeReadingQuizDraft(todoId) {
  const quiz = state.todoReadingQuizzes[todoId]?.quiz || null;
  if (!quiz) return;
  writeAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz, state.todoReadingQuizAnswers[todoId] || [], state.todoReadingQuizStep[todoId] || 0);
}

function clearReadingQuizDrafts(todoId) {
  clearAnswerDrafts("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId);
}

function applyReadingQuizResult(todoId, result = {}) {
  const originalId = String(todoId || "").trim();
  const canonicalId = String(result.canonicalCardId || originalId || "").trim() || originalId;
  if (!canonicalId || !result?.quiz) return originalId;
  if (canonicalId !== originalId) {
    delete state.todoReadingQuizzes[originalId];
    state.selectedTodoId = canonicalId;
  }
  state.todoReadingQuizzes[canonicalId] = {
    quiz: result.quiz,
    quizUrl: result.quizUrl || "",
    status: result.status || "quiz_pending",
  };
  const draft = applyAnswerDraft(
    "ReadingQuiz",
    kanbanCardWorkspaceId(canonicalId),
    canonicalId,
    result.quiz,
    state.todoReadingQuizAnswers[canonicalId] || [],
    state.todoReadingQuizStep[canonicalId] || 0,
  );
  state.todoReadingQuizAnswers[canonicalId] = draft.answers;
  state.todoReadingQuizStep[canonicalId] = draft.step;
  return canonicalId;
}

async function refreshReadingSubmissionStatus(todoId, options = {}) {
  const id = String(todoId || "").trim();
  if (!id || state.todoReadingSubmissionRefreshing?.[id]) return false;
  const card = kanbanCardById(id);
  const labels = kanbanStudyLabels(card || {});
  state.todoReadingSubmissionRefreshing[id] = true;
  state.todoReadingSubmissionProgress[id] = "transcribing";
  setReadingSubmissionFeedback(id, {
    kind: "info",
    message: options.fromWatchdog
      ? "正在重新检查后台处理结果。"
      : "正在刷新处理结果。",
  });
  if (!options.silent) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });

  let canonicalId = id;
  let ready = false;
  let quizError = null;
  let refreshError = null;
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(id) });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(id)}/reading-quiz?${params.toString()}`);
    canonicalId = applyReadingQuizResult(id, result);
    const questions = result?.quiz?.questions;
    ready = Array.isArray(questions) && questions.length > 0;
  } catch (err) {
    quizError = err;
  }

  try {
    const workspaceId = kanbanCardWorkspaceId(canonicalId || id);
    clearTodoListCache(workspaceId);
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, preserveScroll: true });
    if (state.todos.some((todo) => todo.id === canonicalId)) state.selectedTodoId = canonicalId;
    else if (state.todos.some((todo) => todo.id === id)) state.selectedTodoId = id;
    delete state.todoCardDetails[id];
    if (canonicalId !== id) delete state.todoCardDetails[canonicalId];
    await loadKanbanCardDetail(canonicalId || id, { force: true, silent: true });
  } catch (err) {
    refreshError = err;
  }

  ready = ready || readingSubmissionReady(canonicalId) || readingSubmissionReady(id);
  if (ready) {
    clearReadingSubmissionPendingState(id);
    if (canonicalId && canonicalId !== id) clearReadingSubmissionPendingState(canonicalId);
    delete state.todoReadingSubmissionDrafts[id];
    setReadingSubmissionFeedback(canonicalId || id, {
      kind: "success",
      message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
    });
    if (!options.silentToast) showPushToast(`${labels.analysis}和${labels.quiz}已生成；请开始答卷。`, "success");
  } else if (quizError && refreshError) {
    setReadingSubmissionFeedback(id, {
      kind: "error",
      message: "刷新处理状态失败；请检查网络后重试。",
    });
  } else {
    setReadingSubmissionFeedback(id, {
      kind: "info",
      message: "后台仍在处理；稍后会继续刷新，也可以再次点刷新处理结果。",
    });
  }
  if (!ready && state.todoReadingSubmitting?.[id]) scheduleReadingSubmissionRecovery(id);
  delete state.todoReadingSubmissionRefreshing[id];
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  return ready;
}

function scheduleReadingSubmissionRecovery(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return;
  clearReadingSubmissionWatchdog(id);
  state.todoReadingSubmissionWatchdogs[id] = window.setTimeout(() => {
    if (!state.todoReadingSubmitting?.[id]) return;
    refreshReadingSubmissionStatus(id, { fromWatchdog: true, silentToast: true }).catch((err) => {
      setReadingSubmissionFeedback(id, {
        kind: "error",
        message: err?.message || "刷新处理状态失败；请手动刷新。",
      });
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  }, 45000);
}

function renderKanbanReadingWorkflowPanel(todo) {
  return LearningReadingUi.renderKanbanReadingWorkflowPanel(todo, learningReadingUiOptions());
}

function readingQuizState(todoId) {
  return state.todoReadingQuizzes?.[todoId] || null;
}

function renderKanbanReadingQuizPanel(todo) {
  return LearningReadingUi.renderKanbanReadingQuizPanel(todo, learningReadingUiOptions());
}

function assessmentExamState(todoId) {
  return state.todoAssessmentExams?.[todoId] || null;
}

function readAssessmentExamDraft(todoId, exam = {}) {
  return readAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam);
}

function writeAssessmentExamDraft(todoId) {
  const exam = state.todoAssessmentExams[todoId]?.exam || null;
  if (!exam) return;
  writeAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam, state.todoAssessmentAnswers[todoId] || [], state.todoAssessmentStep[todoId] || 0);
}

function clearAssessmentExamDrafts(todoId) {
  clearAnswerDrafts("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId);
}

function learningGuidanceKey(todoId, mode) {
  return `${String(todoId || "")}:${String(mode || "")}`;
}

function learningGuidanceDraftKey(todoId, mode, index) {
  return `${learningGuidanceKey(todoId, mode)}:${Number(index) || 0}`;
}

function learningGuidanceQuestionRecord(todoId, mode, question, index) {
  const session = state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance || null;
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const questionId = String(question?.id || `q${Number(index || 0) + 1}`);
  return questions.find((item) => String(item.questionId || "") === questionId)
    || questions.find((item) => Number(item.questionIndex || 0) === Number(index || 0))
    || null;
}

function learningGuidanceModeForAssessment(todo) {
  return isKanbanProgrammingAssessmentCard(todo) ? "programming-assessment" : "assessment-exam";
}

function selectedLearningAnswer(todoId, mode, index) {
  const answers = mode === "reading-quiz"
    ? state.todoReadingQuizAnswers?.[todoId]
    : state.todoAssessmentAnswers?.[todoId];
  const value = Array.isArray(answers) ? Number(answers[index]) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function learningGuidanceQuestionPayload(question = {}, index = 0) {
  return {
    id: String(question.id || `q${Number(index || 0) + 1}`),
    index: Number(index) || 0,
    skill: String(question.skill || ""),
    prompt: String(question.prompt || ""),
    choices: Array.isArray(question.choices) ? question.choices.map((choice) => String(choice || "")) : [],
  };
}

function learningGuidanceReflectionValue(todoId, mode, index, record = null) {
  const key = learningGuidanceDraftKey(todoId, mode, index);
  if (Object.prototype.hasOwnProperty.call(state.todoLearningGuidanceDrafts, key)) {
    return state.todoLearningGuidanceDrafts[key] || "";
  }
  return record?.reflection || "";
}

function renderLearningGuidancePanel(todoId, mode, index, question, options = {}) {
  const record = learningGuidanceQuestionRecord(todoId, mode, question, index);
  const selected = selectedLearningAnswer(todoId, mode, index);
  const draft = learningGuidanceReflectionValue(todoId, mode, index, record);
  const submitKey = learningGuidanceDraftKey(todoId, mode, index);
  const submitting = Boolean(state.todoLearningGuidanceSubmitting?.[submitKey]);
  const disabled = Boolean(options.disabled);
  const hint = record?.lastHint || "";
  const reflectionSaved = Boolean(record?.reflection);
  const reviewed = Boolean(record?.reviewedAt);
  return `<div class="learning-guidance-panel" data-learning-guidance-panel="${escapeHtml(submitKey)}">
    <div class="learning-guidance-head">
      <strong>${escapeHtml(options.title || "\u601d\u8def\u4e0e\u63d0\u793a")}</strong>
      <span>${escapeHtml(reviewed ? "\u5df2\u590d\u6838" : (reflectionSaved ? "\u5df2\u8bb0\u5f55\u601d\u8def" : "\u53ef\u5148\u5199\u601d\u8def"))}</span>
    </div>
    ${hint ? `<div class="learning-guidance-hint" role="status">${escapeHtml(hint)}</div>` : ""}
    <textarea class="todo-input learning-guidance-reflection" rows="2" data-learning-guidance-reflection="${escapeHtml(submitKey)}" placeholder="${escapeHtml("\u5199\u4e00\u53e5\uff1a\u6211\u4e3a\u4ec0\u4e48\u8fd9\u6837\u9009\uff1f\u54ea\u4e2a\u5730\u65b9\u8fd8\u4e0d\u786e\u5b9a\uff1f")}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(draft)}</textarea>
    <div class="learning-guidance-actions">
      <button type="button" data-learning-guidance-action="hint" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(submitting ? "\u5904\u7406\u4e2d..." : "\u7ed9\u6211\u63d0\u793a")}</button>
      <button type="button" data-learning-guidance-action="reflection" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml("\u4fdd\u5b58\u601d\u8def")}</button>
      <button type="button" data-learning-guidance-action="review" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting || selected === null ? " disabled" : ""}>${escapeHtml(reviewed ? "\u66f4\u65b0\u590d\u6838" : "\u52a0\u5165\u590d\u6838")}</button>
    </div>
  </div>`;
}

function renderAnswerReviewGate(todoId, mode, answeredCount, total, open) {
  if (!total || answeredCount < total) return "";
  const reviewedCount = (state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance?.questions || [])
    .filter((item) => item.reviewedAt).length;
  if (open) {
    return `<div class="learning-answer-review open" role="status">
      <strong>${escapeHtml("\u63d0\u4ea4\u524d\u590d\u6838")}</strong>
      <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\uff1b\u5df2\u6807\u8bb0\u590d\u6838 ${reviewedCount}/${total}\u3002\u53ef\u4ee5\u8fd4\u56de\u4fee\u6539\uff0c\u786e\u8ba4\u540e\u518d\u5224\u5377\u3002`)}</p>
    </div>`;
  }
  return `<div class="learning-answer-review" role="status">
    <strong>${escapeHtml("\u5148\u590d\u6838\uff0c\u518d\u5224\u5377")}</strong>
    <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\u3002\u70b9\u51fb\u590d\u6838\u540e\uff0c\u518d\u505a\u6700\u7ec8\u63d0\u4ea4\u3002`)}</p>
  </div>`;
}

function questionForLearningGuidance(todoId, mode, index) {
  const source = mode === "reading-quiz"
    ? state.todoReadingQuizzes?.[todoId]?.quiz
    : state.todoAssessmentExams?.[todoId]?.exam;
  const questions = Array.isArray(source?.questions) ? source.questions : [];
  return questions[Math.max(0, Number(index) || 0)] || null;
}

async function requestLearningGuidance(todoId, mode, action, index) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  const questionIndex = Math.max(0, Number(index) || 0);
  const question = questionForLearningGuidance(normalizedTodoId, normalizedMode, questionIndex);
  if (!normalizedTodoId || !question) return;
  const submitKey = learningGuidanceDraftKey(normalizedTodoId, normalizedMode, questionIndex);
  if (state.todoLearningGuidanceSubmitting?.[submitKey]) return;
  state.todoLearningGuidanceSubmitting[submitKey] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
        mode: normalizedMode,
        action,
        question: learningGuidanceQuestionPayload(question, questionIndex),
        reflection: state.todoLearningGuidanceDrafts?.[submitKey] || "",
        selectedAnswerIndex: selectedLearningAnswer(normalizedTodoId, normalizedMode, questionIndex),
      }),
    });
    state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
    if (action === "hint") showPushToast("\u5df2\u751f\u6210\u63d0\u793a", "success");
    if (action === "reflection") showPushToast("\u5df2\u4fdd\u5b58\u601d\u8def", "success");
  } finally {
    delete state.todoLearningGuidanceSubmitting[submitKey];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadLearningGuidanceSession(todoId, mode) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  if (!normalizedTodoId || !normalizedMode) return;
  const params = new URLSearchParams({
    workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
    mode: normalizedMode,
  });
  const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance?${params.toString()}`);
  state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
}

function renderKanbanAssessmentExamPanel(todo) {
  if (!isKanbanAssessmentCard(todo)) return "";
  const canAnswer = kanbanCan(todo, "canAnswerQuiz");
  const summary = assessmentExamSummary(todo) || {};
  const examState = assessmentExamState(todo.id);
  const submitting = Boolean(state.todoAssessmentSubmitting?.[todo.id]);
  const passed = assessmentExamCompleted(todo);
  const startable = assessmentCardAcceptsStart(todo);
  const workflow = todoWorkflowState(todo);
  const workflowPhase = String(workflow?.phase || "").trim().toLowerCase();
  if (!examState) {
    const last = summary.lastAttempt;
    const examAvailable = Boolean(
      summary.examAvailable
      || passed
      || workflowPhase === "in_progress"
      || workflowPhase === "retake_required"
      || workflow?.canAnswerQuiz
    );
    const text = last
      ? `上次 ${last.score}/100，通过线 ${last.passingScore || summary.passingScore || 80}；${last.passed ? "已通过" : "需要重考"}。`
      : (examAvailable ? "考试已生成，可继续查看或答题。" : (startable ? "考试已开放。开始后会生成正式单选考卷。" : "考试尚未开放，需要先通过前一张考试卡。"));
    const canOpenExam = (startable || examAvailable) && (canAnswer || passed);
    const programming = isKanbanProgrammingAssessmentCard(todo);
    const draft = state.todoAssessmentRequirementDrafts?.[todo.id] || "";
    const action = programming && !examAvailable && startable && canAnswer
      ? `<form class="todo-assessment-requirement-form" data-assessment-requirement-form="${escapeHtml(todo.id)}">
        <label class="todo-panel-label" for="todoAssessmentRequirementText">本次编程要求</label>
        <textarea id="todoAssessmentRequirementText" class="todo-input todo-comment-textarea" rows="4" data-assessment-requirement-input="${escapeHtml(todo.id)}" placeholder="填写老师教学重点、课堂表现、项目目标、想测试的知识点或代码练习要求">${escapeHtml(draft)}</textarea>
        <button type="submit" data-start-assessment-exam="${escapeHtml(todo.id)}">生成编程测验</button>
      </form>`
      : (canOpenExam
        ? `<button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">${escapeHtml(examAvailable ? "查看考卷" : "开始考试")}</button>`
        : `<div class="todo-assessment-waiting-action" role="status">${escapeHtml(startable ? "当前账号无答题权限" : "等待前序考试通过")}</div>`);
    const heading = programming ? "编程测验" : (summary.finalExam ? "最终综合考试" : "正式检测");
    return `<section class="todo-comment-panel todo-assessment-panel">
      <div class="todo-detail-deliverables-head">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(`${summary.questionCount || 20}题 / ${summary.durationMinutes || 30}分钟`)}</span>
      </div>
      <p class="todo-detail-muted">${escapeHtml(text)}</p>
      ${action}
    </section>`;
  }
  if (examState.loading) {
    return `<section class="todo-comment-panel todo-assessment-panel"><p class="todo-detail-muted">正在生成正式考卷...</p></section>`;
  }
  if (examState.error) {
    return `<section class="todo-comment-panel todo-assessment-panel">
      <p class="todo-detail-error">${escapeHtml(examState.error)}</p>
      <button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">重新加载</button>
    </section>`;
  }
  const exam = examState.exam || {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  if (!questions.length) return "";
  const answers = state.todoAssessmentAnswers?.[todo.id] || [];
  const step = Math.max(0, Math.min(questions.length - 1, Number(state.todoAssessmentStep?.[todo.id] || 0)));
  const question = questions[step] || questions[0];
  const selected = Number(answers[step]);
  const result = examState.result || null;
  const resultItems = result && Array.isArray(result.results) ? result.results : [];
  const currentResult = resultItems[step] || null;
  const currentWrong = result && !result.passed && currentResult && !currentResult.correct;
  const choices = (question.choices || []).map((choice, index) => {
    const id = `assessmentExam_${todo.id}_${step}_${index}`.replace(/[^\w-]/g, "_");
    return `<label class="reading-quiz-choice" for="${escapeHtml(id)}">
      <input id="${escapeHtml(id)}" type="radio" name="assessmentExamChoice_${escapeHtml(todo.id)}" value="${index}" data-assessment-exam-choice="${escapeHtml(todo.id)}" data-question-index="${step}"${selected === index ? " checked" : ""}${submitting || passed || !canAnswer ? " disabled" : ""}>
      <span>${escapeHtml(choice)}</span>
    </label>`;
  }).join("");
  const canPrev = step > 0;
  const canNext = step < questions.length - 1;
  const answeredCount = answers.filter((value) => Number.isInteger(Number(value))).length;
  const guidanceMode = learningGuidanceModeForAssessment(todo);
  const reviewOpen = Boolean(state.todoAssessmentReviewOpen?.[todo.id]);
  const status = result
    ? (result.passed ? `已通过：${result.score}/100` : `本次 ${result.score}/100，未达通过线，请修正后重考。`)
    : (passed ? "已通过，可查看题目。" : `已答 ${answeredCount}/${questions.length}；通过线 ${exam.passingScore || summary.passingScore || 80}`);
  const wrongHint = currentWrong
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题需要复习</strong>
      <p>${escapeHtml(currentResult.explanation || "这题需要重新检查。")}</p>
    </div>`
    : "";
  const passedExplanation = result?.passed && currentResult?.explanation
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题讲解</strong>
      <p>${escapeHtml(currentResult.explanation)}</p>
    </div>`
    : "";
  const guidanceBlock = renderLearningGuidancePanel(todo.id, guidanceMode, step, question, {
    disabled: submitting || passed || !canAnswer,
    title: "\u6d4b\u9a8c\u5f15\u5bfc",
  });
  const reviewBlock = renderAnswerReviewGate(todo.id, guidanceMode, answeredCount, questions.length, reviewOpen);
  const submitControls = passed
    ? `<button type="submit" disabled>${escapeHtml("\u5df2\u901a\u8fc7")}</button>`
    : (reviewOpen
      ? `<button type="submit"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml(submitting ? "\u6b63\u5728\u5224\u5377..." : "\u786e\u8ba4\u63d0\u4ea4")}</button>`
      : `<button type="button" data-assessment-exam-review="${escapeHtml(todo.id)}"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml("\u590d\u6838\u7b54\u6848")}</button>`);
  return `<form class="todo-comment-panel todo-assessment-panel" data-assessment-exam-form="${escapeHtml(todo.id)}">
    <div class="todo-detail-deliverables-head">
      <strong>${escapeHtml(exam.title || "正式检测")}</strong>
      <span>${step + 1}/${questions.length}</span>
    </div>
    <p class="todo-detail-muted">${escapeHtml(status)}</p>
    <article class="reading-quiz-question">
      <small>${escapeHtml(question.skill || "")}</small>
      <strong>${escapeHtml(question.prompt || "")}</strong>
      <div class="reading-quiz-choices">${choices}</div>
    </article>
    ${wrongHint}
    ${passedExplanation}
    ${guidanceBlock}
    ${reviewBlock}
    <div class="todo-comment-actions">
      <button type="button" data-assessment-exam-prev="${escapeHtml(todo.id)}"${canPrev && !submitting ? "" : " disabled"}>上一题</button>
      <button type="button" data-assessment-exam-next="${escapeHtml(todo.id)}"${canNext && (passed || Number.isInteger(selected)) && !submitting ? "" : " disabled"}>下一题</button>
      ${submitControls}
    </div>
  </form>`;
}

function kanbanReadingMediaRecorderApi() {
  if (typeof window !== "undefined" && typeof window.MediaRecorder === "function") return window.MediaRecorder;
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder === "function") return MediaRecorder;
  return null;
}

function supportsKanbanReadingRecorder() {
  return Boolean(
    kanbanReadingMediaRecorderApi()
    && typeof navigator !== "undefined"
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function preferredKanbanReadingRecorderMimeType() {
  const Recorder = kanbanReadingMediaRecorderApi();
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
  return candidates.find((mime) => {
    try {
      return Recorder.isTypeSupported(mime);
    } catch (_) {
      return false;
    }
  }) || "";
}

function kanbanReadingRecordingExtension(mime = "") {
  const value = String(mime || "").toLowerCase();
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("wav")) return "wav";
  if (value.includes("ogg") || value.includes("opus")) return "ogg";
  return "webm";
}

function kanbanReadingRecordingFile(todoId, blob, mime = "") {
  const extension = kanbanReadingRecordingExtension(mime);
  const safeId = String(todoId || "card").replace(/[^a-zA-Z0-9_-]+/g, "").slice(-24) || "card";
  const filename = `reading-recording-${safeId}-${Date.now()}.${extension}`;
  try {
    if (typeof File === "function") return new File([blob], filename, { type: mime || blob.type || "audio/webm" });
  } catch (_) {
    // Older WebViews can expose Blob without a usable File constructor.
  }
  blob.name = filename;
  blob.lastModified = Date.now();
  return blob;
}

function kanbanReadingRecordingDuration(recording = {}) {
  const stored = Number(recording.elapsedMs || 0) || 0;
  if (recording.status === "recording" && recording.startedAt) {
    return Math.max(0, stored + Date.now() - Number(recording.startedAt || 0));
  }
  return Math.max(0, stored);
}

function formatKanbanReadingRecordingDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function kanbanReadingRecordingPermissionMessage(err) {
  const name = String(err?.name || "");
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return "麦克风权限未开启，请允许权限后重试。";
  if (["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"].includes(name)) return "未找到可用麦克风，请检查设备后重试。";
  return "无法开始录音，请检查浏览器权限后重试。";
}

function kanbanReadingRecordingStatusText(todoId) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const duration = formatKanbanReadingRecordingDuration(kanbanReadingRecordingDuration(recording));
  if (recording.status === "requesting") return "正在请求麦克风权限...";
  if (recording.status === "recording") return `正在录音 ${duration}`;
  if (recording.status === "stopping") return "正在生成录音...";
  if (recording.status === "ready") return `已录好待提交 ${duration}`;
  if (recording.status === "unsupported") return "当前浏览器不支持直接录音。";
  if (recording.status === "error") return recording.error || "录音不可用，请重试。";
  return supportsKanbanReadingRecorder() ? "点击红色录音按钮开始。" : "当前浏览器不支持直接录音。";
}

function renderKanbanReadingRecorderControls(todo, submitting = false) {
  return LearningReadingUi.renderKanbanReadingRecorderControls(todo, learningReadingUiOptions({ submitting }));
}

function revokeKanbanReadingRecordingUrl(recording = {}) {
  if (!recording?.url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(recording.url);
  } catch (_) {
    // Object URL cleanup should not block recorder state changes.
  }
}

function clearKanbanReadingRecordingTimer(recording = {}) {
  if (recording.timer) {
    clearInterval(recording.timer);
    recording.timer = 0;
  }
}

function stopKanbanReadingRecordingTracks(recording = {}) {
  const tracks = recording.stream?.getTracks?.() || [];
  for (const track of tracks) {
    try {
      track.stop();
    } catch (_) {
      // Ignore cleanup errors from already-stopped tracks.
    }
  }
}

function renderTodosAfterReadingRecorderChange() {
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

function updateKanbanReadingRecordingStatus(todoId) {
  const text = kanbanReadingRecordingStatusText(todoId);
  document.querySelectorAll("[data-reading-record-status]").forEach((node) => {
    if (node.dataset.readingRecordStatus === String(todoId)) node.textContent = text;
  });
}

function startKanbanReadingRecordingTimer(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  recording.timer = setInterval(() => updateKanbanReadingRecordingStatus(todoId), 1000);
  updateKanbanReadingRecordingStatus(todoId);
}

function finishKanbanReadingRecording(todoId, recording) {
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  if (recording.cancelled) return;
  const chunks = (recording.chunks || []).filter((chunk) => chunk && chunk.size > 0);
  const elapsedMs = Number(recording.elapsedMs || 0) || kanbanReadingRecordingDuration(recording);
  if (!chunks.length) {
    state.todoReadingRecorders[todoId] = { status: "error", error: "未录到声音，请重试。", elapsedMs };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const mime = recording.recorder?.mimeType || recording.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  const file = kanbanReadingRecordingFile(todoId, blob, mime);
  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
  state.todoReadingRecorders[todoId] = {
    status: "ready",
    elapsedMs,
    mimeType: mime,
    file,
    url,
  };
  renderTodosAfterReadingRecorderChange();
}

function failKanbanReadingRecording(todoId, err) {
  const recording = state.todoReadingRecorders?.[todoId] || {};
  const elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  state.todoReadingRecorders[todoId] = {
    status: "error",
    elapsedMs,
    error: kanbanReadingRecordingPermissionMessage(err),
  };
  renderTodosAfterReadingRecorderChange();
}

async function startKanbanReadingRecording(todoId) {
  if (!todoId || state.todoReadingSubmitting?.[todoId]) return;
  const Recorder = kanbanReadingMediaRecorderApi();
  if (!supportsKanbanReadingRecorder() || !Recorder) {
    state.todoReadingRecorders[todoId] = { status: "unsupported" };
    renderTodosAfterReadingRecorderChange();
    return;
  }
  const current = state.todoReadingRecorders?.[todoId] || {};
  if (["requesting", "recording", "stopping"].includes(current.status)) return;
  revokeKanbanReadingRecordingUrl(current);
  state.todoReadingRecorders[todoId] = { status: "requesting", chunks: [], elapsedMs: 0, error: "" };
  renderTodosAfterReadingRecorderChange();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pending = state.todoReadingRecorders?.[todoId];
    if (!pending || pending.status !== "requesting") {
      stream.getTracks?.().forEach((track) => track.stop());
      return;
    }
    const mimeType = preferredKanbanReadingRecorderMimeType();
    const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    const recording = {
      status: "recording",
      recorder,
      stream,
      chunks: [],
      startedAt: Date.now(),
      elapsedMs: 0,
      mimeType: recorder.mimeType || mimeType || "",
      error: "",
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) recording.chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => finishKanbanReadingRecording(todoId, recording));
    recorder.addEventListener("error", (event) => failKanbanReadingRecording(todoId, event.error || event));
    state.todoReadingRecorders[todoId] = recording;
    recorder.start();
    startKanbanReadingRecordingTimer(todoId, recording);
    renderTodosAfterReadingRecorderChange();
  } catch (err) {
    if (stream) stream.getTracks?.().forEach((track) => track.stop());
    failKanbanReadingRecording(todoId, err);
  }
}

function stopKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording || recording.status !== "recording") return;
  recording.elapsedMs = kanbanReadingRecordingDuration(recording);
  recording.startedAt = 0;
  recording.status = "stopping";
  clearKanbanReadingRecordingTimer(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") {
      recording.recorder.stop();
    } else {
      finishKanbanReadingRecording(todoId, recording);
    }
  } catch (err) {
    failKanbanReadingRecording(todoId, err);
  }
  renderTodosAfterReadingRecorderChange();
}

function cancelKanbanReadingRecording(todoId) {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording) return;
  recording.cancelled = true;
  clearKanbanReadingRecordingTimer(recording);
  stopKanbanReadingRecordingTracks(recording);
  revokeKanbanReadingRecordingUrl(recording);
  try {
    if (recording.recorder && recording.recorder.state !== "inactive") recording.recorder.stop();
  } catch (_) {
    // Ignore cancellation stop errors.
  }
  delete state.todoReadingRecorders[todoId];
  renderTodosAfterReadingRecorderChange();
}

async function submitRecordedReadingSubmission(todoId, notes = "") {
  const recording = state.todoReadingRecorders?.[todoId];
  if (!recording?.file) throw new Error("请先停止录音");
  const file = recording.file;
  await submitReadingSubmission(todoId, file, notes);
  const latest = state.todoReadingRecorders?.[todoId];
  if (latest?.file === file) {
    revokeKanbanReadingRecordingUrl(latest);
    delete state.todoReadingRecorders[todoId];
  }
}

function renderKanbanReadingSubmissionPanel(todo) {
  return LearningReadingUi.renderKanbanReadingSubmissionPanel(todo, learningReadingUiOptions());
}

function renderTodoDetail(todo) {
  const open = todoMatchesOpen(todo);
  const kanban = isKanbanTodoSource();
  const kanbanStatus = normalizedKanbanStatus(todo);
  const blocked = kanbanStatus === "blocked";
  const completed = kanban && (kanbanStatus === "done" || todo.status === "completed");
  const readingCard = kanban && isKanbanReadingCard(todo);
  const assessmentCard = kanban && isKanbanAssessmentCard(todo);
  const canManage = !kanban || kanbanCan(todo, "canManage");
  const canRevise = !kanban || kanbanCan(todo, "canRevise");
  const canComment = !kanban || kanbanCan(todo, "canComment");
  const canCommentAndManage = canComment && canManage;
  const statusText = kanban ? kanbanStatusText(todo) : todoStatusText(todo);
  const gridItems = [
    renderTodoDetailGridItem("负责人", todo.assigneeLabel || todo.assignee || ""),
    renderTodoDetailGridItem("截止", todoDueLabel(todo)),
    renderTodoDetailGridItem("提醒", `${String(todo.reminderLeadMinutes || 0)} 分钟前`),
    renderTodoDetailGridItem("重复", todo.recurrenceLabel || todo.recurrence || "不重复"),
    kanban ? renderTodoDetailGridItem("看板", todo.kanbanBoard || todoBoardLabel()) : "",
    kanban ? renderTodoDetailGridItem("状态", kanbanStatusText(todo)) : "",
    kanban ? renderTodoDetailGridItem("官方执行者", todo.kanbanAssignee || "") : "",
    kanban ? renderTodoDetailGridItem("租户", todo.kanbanTenant || "") : "",
    kanban ? renderTodoDetailGridItem("优先级", todoPriorityLabel(todo)) : "",
    kanban ? renderTodoDetailGridItem("工作区", todo.kanbanWorkspaceKind || "") : "",
    kanban ? renderTodoDetailGridItem("创建者", todo.kanbanCreatedBy || "") : "",
    renderTodoDetailGridItem("创建", todoTimestampLabel(todo.createdAt)),
    renderTodoDetailGridItem("更新", todoTimestampLabel(todo.updatedAt)),
    kanban ? renderTodoDetailGridItem("开始", todoTimestampLabel(todo.kanbanStartedAt)) : "",
    kanban ? renderTodoDetailGridItem("完成", todoTimestampLabel(todo.kanbanCompletedAt || todo.completedAt)) : "",
  ].filter(Boolean).join("");
  const skillRows = kanban && Array.isArray(todo.kanbanSkills) && todo.kanbanSkills.length
    ? `<div class="todo-detail-skills">${todo.kanbanSkills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>`
    : "";
  const coverBlock = kanban ? renderKanbanCaseCover(kanbanCaseCover(todo)) : "";
  const deliveryBlock = kanban ? renderKanbanDeliveryFiles(todo) : "";
  const readingWorkflowBlock = kanban ? renderKanbanReadingWorkflowPanel(todo) : "";
  const readingQuizBlock = kanban ? renderKanbanReadingQuizPanel(todo) : "";
  const assessmentExamBlock = kanban ? renderKanbanAssessmentExamPanel(todo) : "";
  const resultBlock = kanban ? renderKanbanDetailReport(todo) : "";
  const readingPanel = kanban ? renderKanbanReadingSubmissionPanel(todo) : "";
  const metaBlock = kanban
    ? `<details class="todo-detail-meta">
      <summary>卡片信息</summary>
      ${gridItems ? `<div class="todo-detail-grid">${gridItems}</div>` : ""}
      ${skillRows}
    </details>`
    : `<div class="todo-detail-grid">${gridItems}</div>${skillRows}`;
  const showGenericCommentPanel = !readingCard && !assessmentCard;
  const commentPanel = kanban && open && canComment && showGenericCommentPanel
    ? `<form class="todo-comment-panel" data-todo-comment-form="${escapeHtml(todo.id)}">
      <textarea id="todoCommentText" class="todo-input todo-comment-textarea" rows="4" placeholder="写评论、完成说明或执行记录，可留空">${escapeHtml(state.todoCommentDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-comment-todo="${escapeHtml(todo.id)}">添加评论</button>
        ${canManage ? `<button type="button" data-comment-complete-todo="${escapeHtml(todo.id)}">完成并记录</button>` : ""}
        ${blocked && canCommentAndManage ? `<button type="button" data-comment-unblock-todo="${escapeHtml(todo.id)}">评论并解除阻塞</button>` : ""}
      </div>
    </form>`
    : "";
  const revisionPanel = completed && canRevise
    ? `<form class="todo-comment-panel todo-revision-panel" data-todo-revision-form="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? 'aria-busy="true"' : ""}>
      <label class="todo-panel-label" for="todoRevisionText">要求修改</label>
      <textarea id="todoRevisionText" class="todo-input todo-comment-textarea" rows="4" placeholder="写清楚需要修改的地方、验收要求或补充材料" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${escapeHtml(state.todoRevisionDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-revise-todo="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${state.todoRevisionSubmitting?.[todo.id] ? "正在创建..." : "创建修改任务"}</button>
      </div>
      ${state.todoRevisionSubmitting?.[todo.id] ? `<p class="todo-detail-muted">正在创建修改任务，请勿重复提交。</p>` : ""}
    </form>`
    : "";
  const managementPanel = open && canManage
    ? `<details class="todo-admin-panel"${readingCard || assessmentCard ? "" : " open"}>
      <summary>
        <span>卡片管理</span>
        <small>阻塞、取消、延期</small>
      </summary>
      <div class="todo-admin-panel-body">
        <div class="todo-detail-actions">
          ${readingCard || assessmentCard ? "" : `<button type="button" data-complete-todo="${escapeHtml(todo.id)}">完成</button>`}
          ${kanban && !blocked ? `<button type="button" data-block-todo="${escapeHtml(todo.id)}">标记阻塞</button>` : ""}
          ${kanban && blocked ? `<button type="button" data-unblock-todo="${escapeHtml(todo.id)}">解除阻塞</button>` : ""}
          <button type="button" data-cancel-todo="${escapeHtml(todo.id)}">取消</button>
        </div>
        <div class="todo-postpone-panel">
          <div class="todo-postpone-row">
            <label class="todo-postpone-field" for="todoPostponeDue">
              <span>延期到</span>
              <input id="todoPostponeDue" class="todo-input" type="datetime-local" value="${escapeHtml(todoDueInputValue(todo))}">
            </label>
            <button type="button" data-postpone-todo="${escapeHtml(todo.id)}">保存延期</button>
          </div>
          <div class="todo-postpone-quick">
            <button type="button" data-postpone-minutes="60" data-postpone-todo="${escapeHtml(todo.id)}">1 小时后</button>
            <button type="button" data-postpone-minutes="1440" data-postpone-todo="${escapeHtml(todo.id)}">明天</button>
          </div>
        </div>
      </div>
    </details>`
    : "";
  return `<article class="todo-detail-card ${escapeHtml(todoStatusLabel(todo))}">
    <div class="todo-detail-head">
      <div>
        <div class="todo-detail-id">${escapeHtml(todo.id)}</div>
        <h2>${escapeHtml(todo.content || "Kanban card")}</h2>
      </div>
      <span class="todo-state status-${escapeHtml(kanbanStatus)}">${escapeHtml(statusText)}</span>
    </div>
    ${coverBlock}
    ${readingWorkflowBlock}
    ${deliveryBlock}
    ${resultBlock}
    ${readingPanel}
    ${readingQuizBlock}
    ${assessmentExamBlock}
    ${metaBlock}
    ${commentPanel}
    ${revisionPanel}
    ${managementPanel}
  </article>`;
}

function wireTodoPanel(root) {
  root.querySelector("[data-open-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = true;
    renderTodos();
    focusTodoFormSoon();
  });
  root.querySelector("[data-close-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = false;
    renderTodos();
  });
  root.querySelector("#todoCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createTodoFromForm(root).catch(showError);
  });
  const kanbanComposerText = root.querySelector("#kanbanComposerText");
  kanbanComposerText?.addEventListener("input", () => {
    state.kanbanComposerText = kanbanComposerText.value || "";
    if (state.kanbanComposerText) localStorage.setItem("hermesKanbanComposerDraft", state.kanbanComposerText);
    else localStorage.removeItem("hermesKanbanComposerDraft");
  });
  root.querySelectorAll("[data-kanban-composer-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = String(button.dataset.kanbanComposerMode || "");
      saveKanbanComposerMode(mode);
      state.kanbanPlanDraft = null;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
      focusTodoFormSoon();
    });
  });
  root.querySelector("#kanbanComposerMaxParallel")?.addEventListener("input", (event) => {
    saveKanbanComposerMaxParallel(event.target?.value);
  });
  root.querySelector("#kanbanComposerReasoningEffort")?.addEventListener("change", (event) => {
    saveKanbanComposerReasoningEffort(event.target?.value);
  });
  root.querySelector("#kanbanComposerDocument")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0] || null;
    const currentText = root.querySelector("#kanbanComposerText")?.value || "";
    state.kanbanComposerText = currentText;
    if (currentText) localStorage.setItem("hermesKanbanComposerDraft", currentText);
    uploadKanbanComposerDocument(file).catch(showError);
    event.target.value = "";
  });
  root.querySelectorAll("[data-remove-kanban-composer-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeKanbanComposerDocument);
      if (Number.isFinite(index)) {
        state.kanbanComposerDocuments = (state.kanbanComposerDocuments || []).filter((_, itemIndex) => itemIndex !== index);
        renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
      }
    });
  });
  root.querySelectorAll("#kanbanStudyTemplate, #kanbanStudySubject, #kanbanStudyTitle, #kanbanStudyLearner, #kanbanStudyPerformerWorkspace, #kanbanStudyViewerWorkspaces, #kanbanReadingReader, #kanbanReadingBook, #kanbanReadingSessions, #kanbanReadingStartDate, #kanbanReadingTime, #kanbanStudyScheduleFrequency, #kanbanStudyScheduleMonthDay, #kanbanReadingReminder, [data-kanban-study-viewer-workspace], [data-kanban-study-weekday]").forEach((input) => {
    input.addEventListener("input", () => syncKanbanReadingDraftFromDom(root));
    input.addEventListener("change", () => syncKanbanReadingDraftFromDom(root));
  });
  root.querySelector("#kanbanStudyTemplate")?.addEventListener("change", () => {
    syncKanbanReadingDraftFromDom(root);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("#kanbanStudyScheduleFrequency")?.addEventListener("change", () => {
    syncKanbanReadingDraftFromDom(root);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelectorAll("#kanbanAssessmentSubject, #kanbanAssessmentLearner, #kanbanAssessmentLevel, #kanbanAssessmentTitle, #kanbanAssessmentPerformerWorkspace, #kanbanAssessmentViewerWorkspaces, #kanbanAssessmentExamCount, #kanbanAssessmentQuestionCount, #kanbanAssessmentDuration, #kanbanAssessmentPassingScore, #kanbanAssessmentIntervalDays, #kanbanAssessmentStartDate, #kanbanAssessmentTime, #kanbanAssessmentReminder, #kanbanAssessmentDifficulty, [data-kanban-assessment-viewer-workspace]").forEach((input) => {
    input.addEventListener("input", () => syncKanbanAssessmentDraftFromDom(root));
    input.addEventListener("change", () => syncKanbanAssessmentDraftFromDom(root));
  });
  root.querySelector("#kanbanReadingCover")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0] || null;
    setKanbanReadingCoverFile(file);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("#kanbanComposerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitKanbanComposer(root).catch(showError);
  });
  root.querySelector("[data-clear-kanban-plan]")?.addEventListener("click", () => {
    state.kanbanPlanDraft = null;
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("[data-create-kanban-plan]")?.addEventListener("click", () => {
    createKanbanPlanFromDraft().catch(showError);
  });
  root.querySelectorAll("[data-kanban-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const status = String(button.dataset.kanbanStatus || "").trim().toLowerCase();
      if (!KANBAN_TAB_ORDER.includes(status)) return;
      state.todoKanbanStatus = status;
      localStorage.setItem("hermesTodoKanbanStatus", status);
      if (kanbanStatusNeedsCompleted(status) && !state.todoCompletedLoaded) {
        loadTodos({ includeCompleted: true }).catch(showError);
        return;
      }
      renderTodos();
    });
  });
  root.querySelectorAll("[data-kanban-story-case]").forEach((button) => {
    const toggle = () => {
      const key = String(button.dataset.kanbanStoryCase || "").trim();
      if (!key) return;
      state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, {
        [key]: !state.kanbanStoryExpanded?.[key],
      });
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
  });
  root.querySelectorAll("[data-archive-kanban-story-case]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      archiveKanbanStoryCase(button.dataset.archiveKanbanStoryCase || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTodoId = button.dataset.todoId || "";
      renderTodos();
    });
  });
  root.querySelectorAll("[data-load-kanban-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      loadKanbanCardDetail(button.dataset.loadKanbanDetail || "", { force: true }).catch(showError);
    });
  });
  root.querySelector("[data-clear-todo-selection]")?.addEventListener("click", () => {
    state.selectedTodoId = "";
    renderTodos();
  });
  root.querySelectorAll("[data-complete-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const todoId = button.dataset.completeTodo || "";
      const commentForm = [...root.querySelectorAll("[data-todo-comment-form]")]
        .find((form) => form.dataset.todoCommentForm === todoId);
      const comment = commentForm?.querySelector("#todoCommentText")?.value || state.todoCommentDrafts?.[todoId] || "";
      completeTodo(todoId, comment).catch(showError);
    });
  });
  root.querySelectorAll("[data-cancel-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelTodo(button.dataset.cancelTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-block-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      blockTodo(button.dataset.blockTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-unblock-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      unblockTodo(button.dataset.unblockTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-comment-form]").forEach((form) => {
    form.querySelector("#todoCommentText")?.addEventListener("input", (event) => {
      const todoId = form.dataset.todoCommentForm || "";
      if (todoId) state.todoCommentDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.todoCommentForm || form.querySelector("[data-comment-todo]")?.dataset?.commentTodo || "";
      commentTodo(todoId, form.querySelector("#todoCommentText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-comment-complete-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.commentCompleteTodo || "";
      const form = button.closest("[data-todo-comment-form]") || root;
      const comment = form.querySelector("#todoCommentText")?.value || state.todoCommentDrafts?.[todoId] || "";
      completeTodo(todoId, comment).catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-revision-form]").forEach((form) => {
    form.querySelector("#todoRevisionText")?.addEventListener("input", (event) => {
      const todoId = form.dataset.todoRevisionForm || "";
      if (todoId) state.todoRevisionDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.todoRevisionForm || form.querySelector("[data-revise-todo]")?.dataset?.reviseTodo || "";
      requestTodoRevision(todoId, form.querySelector("#todoRevisionText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-reading-submission-form]").forEach((form) => {
    const resolveReadingSubmissionTodoId = () => form.dataset.readingSubmissionForm || form.querySelector("[data-submit-reading]")?.dataset?.submitReading || "";
    const syncReadingSubmissionNotes = () => {
      const todoId = resolveReadingSubmissionTodoId();
      const notes = form.querySelector("#todoReadingSubmissionNotes")?.value || "";
      if (todoId) state.todoReadingSubmissionDrafts[todoId] = notes;
      return { todoId, notes };
    };
    form.querySelector("[data-reading-record-toggle]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { todoId } = syncReadingSubmissionNotes();
      if (state.todoReadingRecorders?.[todoId]?.status === "recording") {
        stopKanbanReadingRecording(todoId);
      } else {
        startKanbanReadingRecording(todoId).catch(showError);
      }
    });
    form.querySelector("#todoReadingSubmissionNotes")?.addEventListener("input", (event) => {
      const todoId = form.dataset.readingSubmissionForm || "";
      if (todoId) state.todoReadingSubmissionDrafts[todoId] = event.target.value || "";
    });
    form.querySelector("[data-refresh-reading-submission]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { todoId } = syncReadingSubmissionNotes();
      refreshReadingSubmissionStatus(todoId).catch(showError);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.readingSubmissionForm || form.querySelector("[data-submit-reading]")?.dataset?.submitReading || "";
      const notes = form.querySelector("#todoReadingSubmissionNotes")?.value || "";
      submitRecordedReadingSubmission(todoId, notes).catch(showError);
    });
  });
  root.querySelectorAll("[data-load-reading-quiz]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadReadingQuiz(button.dataset.loadReadingQuiz || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-reading-quiz-choice]").forEach((input) => {
    input.addEventListener("change", () => {
      const todoId = input.dataset.readingQuizChoice || "";
      const index = Number(input.dataset.questionIndex || 0);
      if (!todoId || !Number.isFinite(index)) return;
      if (!Array.isArray(state.todoReadingQuizAnswers[todoId])) state.todoReadingQuizAnswers[todoId] = [];
      state.todoReadingQuizAnswers[todoId][index] = Number(input.value);
      delete state.todoReadingQuizReviewOpen[todoId];
      writeReadingQuizDraft(todoId);
      if (state.todoReadingQuizzes[todoId]?.result && !state.todoReadingQuizzes[todoId]?.result?.passed) {
        state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId], { result: null });
      }
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-prev]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizPrev || "";
      state.todoReadingQuizStep[todoId] = Math.max(0, Number(state.todoReadingQuizStep[todoId] || 0) - 1);
      writeReadingQuizDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-next]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizNext || "";
      const quiz = state.todoReadingQuizzes[todoId]?.quiz || {};
      const total = Array.isArray(quiz.questions) ? quiz.questions.length : 10;
      state.todoReadingQuizStep[todoId] = Math.min(total - 1, Number(state.todoReadingQuizStep[todoId] || 0) + 1);
      writeReadingQuizDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-review]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizReview || "";
      if (todoId) state.todoReadingQuizReviewOpen[todoId] = true;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitReadingQuiz(form.dataset.readingQuizForm || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-load-assessment-exam]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadAssessmentExam(button.dataset.loadAssessmentExam || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-assessment-requirement-form]").forEach((form) => {
    const todoId = form.dataset.assessmentRequirementForm || "";
    form.querySelector("[data-assessment-requirement-input]")?.addEventListener("input", (event) => {
      if (todoId) state.todoAssessmentRequirementDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const requirement = form.querySelector("[data-assessment-requirement-input]")?.value || "";
      if (todoId) state.todoAssessmentRequirementDrafts[todoId] = requirement;
      loadAssessmentExam(todoId, { requirement }).catch(showError);
    });
  });
  root.querySelectorAll("[data-assessment-exam-choice]").forEach((input) => {
    input.addEventListener("change", () => {
      const todoId = input.dataset.assessmentExamChoice || "";
      const index = Number(input.dataset.questionIndex || 0);
      if (!todoId || !Number.isFinite(index)) return;
      if (!Array.isArray(state.todoAssessmentAnswers[todoId])) state.todoAssessmentAnswers[todoId] = [];
      state.todoAssessmentAnswers[todoId][index] = Number(input.value);
      delete state.todoAssessmentReviewOpen[todoId];
      writeAssessmentExamDraft(todoId);
      if (state.todoAssessmentExams[todoId]?.result && !state.todoAssessmentExams[todoId]?.result?.passed) {
        state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId], { result: null });
      }
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-prev]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamPrev || "";
      state.todoAssessmentStep[todoId] = Math.max(0, Number(state.todoAssessmentStep[todoId] || 0) - 1);
      writeAssessmentExamDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-next]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamNext || "";
      const exam = state.todoAssessmentExams[todoId]?.exam || {};
      const total = Array.isArray(exam.questions) ? exam.questions.length : 20;
      state.todoAssessmentStep[todoId] = Math.min(total - 1, Number(state.todoAssessmentStep[todoId] || 0) + 1);
      writeAssessmentExamDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-review]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamReview || "";
      if (todoId) state.todoAssessmentReviewOpen[todoId] = true;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitAssessmentExam(form.dataset.assessmentExamForm || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-learning-guidance-reflection]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.learningGuidanceReflection || "";
      if (key) state.todoLearningGuidanceDrafts[key] = input.value || "";
    });
  });
  root.querySelectorAll("[data-learning-guidance-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestLearningGuidance(
        button.dataset.learningGuidanceTodo || "",
        button.dataset.learningGuidanceMode || "",
        button.dataset.learningGuidanceAction || "",
        Number(button.dataset.questionIndex || 0),
      ).catch(showError);
    });
  });
  root.querySelectorAll("[data-comment-unblock-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const form = button.closest("[data-todo-comment-form]") || root;
      commentAndUnblockTodo(button.dataset.commentUnblockTodo, form.querySelector("#todoCommentText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-postpone-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const minutes = button.dataset.postponeMinutes;
      if (minutes) {
        postponeTodoQuick(button.dataset.postponeTodo, Number(minutes)).catch(showError);
      } else {
        postponeTodoFromDetail(root, button.dataset.postponeTodo).catch(showError);
      }
    });
  });
  wireTaskSwipeActions(root);
}

function pushKanbanComposerMessage(role, content) {
  state.kanbanComposerMessages.push({
    id: `kanban-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: String(content || ""),
    at: new Date().toISOString(),
  });
  state.kanbanComposerMessages = state.kanbanComposerMessages.slice(-20);
}

function kanbanPlanSummaryText(plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const firstWave = cards.filter((card) => card.initialRunnable).length;
  const maxParallel = normalizeKanbanComposerMaxParallel(plan?.maxParallel || state.kanbanComposerMaxParallel);
  return `\u5df2\u751f\u6210 ${cards.length} \u5f20\u5361\u7247\u7684\u591a Agent \u62c6\u89e3\u8349\u6848\uff1b\u9996\u6279\u6267\u884c ${firstWave}\uff0c\u6700\u5927\u5e76\u884c ${maxParallel}\u3002`;
}

async function uploadKanbanComposerDocument(file) {
  if (!file) return;
  if (state.kanbanComposerDocumentUploading) return;
  state.kanbanComposerDocumentUploading = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const dataBase64 = await fileToBase64(file);
    const result = await api("/api/kanban/cards/document-preview", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        filename: file.name || "kanban-source.txt",
        type: file.type || "",
        dataBase64,
      }),
    });
    const doc = result.document || {};
    state.kanbanComposerDocuments = [
      ...(state.kanbanComposerDocuments || []),
      {
        name: doc.name || file.name || "kanban-source",
        mime: doc.mime || file.type || "",
        kind: doc.kind || "",
        size: doc.size || file.size || 0,
        text: result.text || "",
        totalChars: result.totalChars || 0,
        truncated: Boolean(result.truncated),
      },
    ];
    showPushToast("\u6587\u6863\u5df2\u89e3\u6790\uff0c\u5c06\u4f5c\u4e3a\u770b\u677f\u9700\u6c42\u4e0a\u4e0b\u6587", "success");
  } finally {
    state.kanbanComposerDocumentUploading = false;
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function submitKanbanComposer(root) {
  if (state.kanbanComposerBusy || state.kanbanPlanCreating) return;
  const input = root.querySelector("#kanbanComposerText");
  const rawText = String(input?.value || state.kanbanComposerText || "").trim();
  const text = kanbanComposerSubmissionText(rawText);
  const mode = kanbanComposerMode();
  const multiAgent = mode === "multi";
  const studyPlan = mode === "study";
  const assessmentPlan = mode === "assessment";
  if (!text && !studyPlan && !assessmentPlan) throw new Error("????????");
  if (studyPlan) syncKanbanReadingDraftFromDom(root);
  if (assessmentPlan) syncKanbanAssessmentDraftFromDom(root);
  const programmingStudyAssessment = studyPlan && isKanbanProgrammingStudyTemplate(state.kanbanReadingDraft?.studyTemplate);
  if (studyPlan && !String(state.kanbanReadingDraft?.activityTitle || state.kanbanReadingDraft?.bookTitle || "").trim()) throw new Error("????????");
  if (assessmentPlan && !String(state.kanbanAssessmentDraft?.planTitle || state.kanbanAssessmentDraft?.subject || "").trim()) throw new Error("????????");
  const maxParallel = saveKanbanComposerMaxParallel(root.querySelector("#kanbanComposerMaxParallel")?.value || state.kanbanComposerMaxParallel);
  const reasoningEffort = saveKanbanComposerReasoningEffort(root.querySelector("#kanbanComposerReasoningEffort")?.value || state.kanbanComposerReasoningEffort);
  const documentNames = (state.kanbanComposerDocuments || []).map((item) => item.name).filter(Boolean).join(", ");
  state.kanbanComposerText = rawText;
  if (rawText) localStorage.setItem("hermesKanbanComposerDraft", rawText);
  else localStorage.removeItem("hermesKanbanComposerDraft");
  saveKanbanComposerMode(mode);
  state.kanbanComposerBusy = true;
  state.kanbanPlanDraft = null;
  pushKanbanComposerMessage("user", studyPlan
    ? `${state.kanbanReadingDraft.activityTitle || state.kanbanReadingDraft.bookTitle || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim()
    : (assessmentPlan ? `${state.kanbanAssessmentDraft.planTitle || state.kanbanAssessmentDraft.subject || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim() : (rawText || (documentNames ? `Documents: ${documentNames}` : text))));
  beginKanbanComposerProgress((assessmentPlan || programmingStudyAssessment) ? "assessment" : (studyPlan ? "reading" : (multiAgent ? "plan" : "create")));
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    if (assessmentPlan || programmingStudyAssessment) {
      const draft = programmingStudyAssessment
        ? programmingAssessmentDraftFromStudyDraft(state.kanbanReadingDraft || {})
        : Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/assessment-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          subject: draft.subject,
          learnerName: draft.learnerName,
          courseLevel: draft.courseLevel,
          title: draft.planTitle,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          scheduleFrequency: draft.scheduleFrequency,
          scheduleWeekdays: draft.scheduleWeekdays,
          scheduleMonthDay: draft.scheduleMonthDay,
          sourceText: text,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ??????????????????`);
      state.kanbanComposerText = "";
      if (programmingStudyAssessment) state.kanbanReadingDraft = defaultKanbanReadingDraft();
      else state.kanbanAssessmentDraft = defaultKanbanAssessmentDraft();
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem(programmingStudyAssessment ? "hermesKanbanReadingDraft" : "hermesKanbanAssessmentDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (studyPlan) {
      const coverFile = state.kanbanReadingCoverFile;
      const coverImage = coverFile
        ? {
          filename: coverFile.name || "book-cover.jpg",
          mime: coverFile.type || "",
          dataBase64: await fileToBase64(coverFile),
        }
        : null;
      const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
      const activityTitle = String(draft.activityTitle || draft.bookTitle || "").trim();
      const learnerName = String(draft.learnerName || draft.readerName || "").trim();
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/study-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          caseMode: "study-plan",
          studyTemplate: String(draft.studyTemplate || "").trim() === "custom" ? "custom" : "reading",
          bookTitle: activityTitle,
          readerName: learnerName,
          activityTitle,
          learnerName,
          target: learnerName,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          sourceText: text,
          coverImage,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ???????????????????????????????`);
      state.kanbanComposerText = "";
      state.kanbanReadingDraft = defaultKanbanReadingDraft();
      clearKanbanComposerDocuments();
      setKanbanReadingCoverFile(null);
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem("hermesKanbanReadingDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (multiAgent) {
      const result = await api("/api/kanban/cards/plan", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          text,
          maxParallel,
          reasoning_effort: reasoningEffort,
        }),
      });
      state.kanbanPlanDraft = result.plan || null;
      pushKanbanComposerMessage("assistant", kanbanPlanSummaryText(state.kanbanPlanDraft));
      finishKanbanComposerProgress();
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    } else {
      const singleContent = rawText || (documentNames ? `Create Kanban task from document: ${documentNames}` : text);
      const result = await api(boardCollectionApiPath(), {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          assignee: defaultTodoAssignee(),
          content: singleContent,
          description: text,
          sourceText: text,
        }),
      });
      const card = result.card || result.todo || result.result || {};
      pushKanbanComposerMessage("assistant", `????????${card.id || ""} ${card.content || text}`.trim());
      state.kanbanComposerText = "";
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = "todo";
      localStorage.setItem("hermesTodoKanbanStatus", "todo");
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true });
    }
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `???????${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanComposerBusy = false;
    if (!state.kanbanPlanCreating) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function createKanbanPlanFromDraft() {
  if (!state.kanbanPlanDraft || state.kanbanPlanCreating) return;
  state.kanbanPlanCreating = true;
  beginKanbanComposerProgress("create");
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api("/api/kanban/cards/batch", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        plan: state.kanbanPlanDraft,
        maxParallel: normalizeKanbanComposerMaxParallel(state.kanbanPlanDraft?.maxParallel || state.kanbanComposerMaxParallel),
        reasoning_effort: state.kanbanPlanDraft?.reasoningEffort || state.kanbanComposerReasoningEffort || "",
      }),
    });
    const cards = Array.isArray(result.cards) ? result.cards : [];
    const blocked = cards.filter((item) => item.blocked).length;
    pushKanbanComposerMessage("assistant", `\u5df2\u521b\u5efa ${cards.length} \u5f20\u591a Agent \u770b\u677f\u5361\u7247\uff1b${Math.max(0, cards.length - blocked)} \u5f20\u9996\u6279\u6267\u884c\uff0c${blocked} \u5f20\u7b49\u5f85\u4f9d\u8d56\u6216\u5e76\u884c\u4f4d\u3002`);
    state.kanbanPlanDraft = null;
    state.kanbanComposerText = "";
    clearKanbanComposerDocuments();
    localStorage.removeItem("hermesKanbanComposerDraft");
    finishKanbanComposerProgress();
    clearTodoListCache();
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    state.todoCreateOpen = false;
    await loadTodos({ skipCache: true });
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `\u6279\u91cf\u521b\u5efa\u5931\u8d25\uff1a${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanPlanCreating = false;
    if (!state.kanbanComposerBusy) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function createTodoFromForm(root) {
  const content = root.querySelector("#todoContent")?.value?.trim() || "";
  const dueValue = root.querySelector("#todoDue")?.value || "";
  const kanban = isKanbanTodoSource();
  if (!content) throw new Error("Kanban card content is required");
  if (!kanban && !dueValue) throw new Error("Todo due time is required");
  const dueTime = dueValue.replace("T", " ");
  await api(boardCollectionApiPath(), {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      assignee: root.querySelector("#todoAssignee")?.value || defaultTodoAssignee(),
      content,
      dueTime,
      recurrence: root.querySelector("#todoRecurrence")?.value || "none",
      recurrenceDays: root.querySelector("#todoRecurrenceDays")?.value || "",
    }),
  });
  clearTodoListCache();
  state.todoCreateOpen = false;
  if (kanban) {
    state.todoKanbanStatus = "todo";
    localStorage.setItem("hermesTodoKanbanStatus", "todo");
  }
  await loadTodos();
}

async function completeTodo(todoId, comment = "") {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to manage this card");
  const commentText = String(comment || state.todoCommentDrafts?.[todoId] || "").trim();
  await api(boardActionApiPath(todoId, "complete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, commentText ? { comment: commentText } : {}),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  delete state.todoCommentDrafts[todoId];
  state.selectedTodoId = "";
  await loadTodos();
}

async function cancelTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to cancel this card");
  if (!window.confirm(`取消看板卡片 ${todoId}？`)) return;
  await api(boardActionApiPath(todoId, "cancel"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  state.selectedTodoId = "";
  await loadTodos();
}

async function archiveKanbanStoryCase(caseKey) {
  const key = String(caseKey || "").trim();
  if (!key) return;
  const group = kanbanActiveStoryCases(state.todos).find((item) => kanbanStoryCaseKey(item) === key);
  const items = kanbanStoryCaseArchiveItems(group);
  if (!group || !items.length) throw new Error("No completed story cards can be archived.");
  if (!window.confirm(`归档故事：${group.title || key}？`)) return;
  for (const item of items) {
    await api(boardActionApiPath(item.todo.id, "cancel"), {
      method: "POST",
      body: kanbanCardActionBody(item.todo),
    });
  }
  clearTodoListCache();
  state.selectedTodoId = "";
  state.todoKanbanStatus = "archived";
  localStorage.setItem("hermesTodoKanbanStatus", "archived");
  state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, { [key]: false });
  showPushToast(`已归档 ${items.length} 张卡片`, "success");
  await loadTodos({ skipCache: true, freshServer: true });
}

async function deleteKanbanStoryCase(caseKey) {
  const key = String(caseKey || "").trim();
  if (!key) return false;
  const group = kanbanStoryCases(state.todos).find((item) => kanbanStoryCaseKey(item) === key);
  const items = kanbanStoryCaseDeleteItems(group);
  if (!group || !items.length) throw new Error("No deletable cards in this story.");
  const title = group.title || key;
  if (!window.confirm(`\u5220\u9664\u6545\u4e8b\uff1a${title}\n\u5c06\u4e00\u6b21\u5220\u9664 ${items.length} \u5f20\u770b\u677f\u5361\u7247\uff0c\u4e0d\u53ef\u901a\u8fc7\u5355\u5361\u5165\u53e3\u64a4\u9500\u3002`)) return false;
  let boundTopic = kanbanBoundTopicForStoryGroup(group);
  if (!boundTopic) {
    await refreshCaseTopicThreadsForWorkspace().catch(() => []);
    boundTopic = kanbanBoundTopicForStoryGroup(group);
  }
  for (const item of items) {
    await api(boardActionApiPath(item.todo.id, "delete"), {
      method: "POST",
      body: kanbanCardActionBody(item.todo),
    });
  }
  let topicCleanupError = "";
  if (boundTopic?.threadId && boundTopic?.taskGroupId) {
    try {
      await api(`/api/threads/${encodeURIComponent(boundTopic.threadId)}/tasks/${encodeURIComponent(boundTopic.taskGroupId)}`, {
        method: "DELETE",
      });
      state.caseTopicThreads = (state.caseTopicThreads || []).map((thread) => {
        if (thread.id !== boundTopic.threadId) return thread;
        const taskGroupMeta = Object.assign({}, thread.taskGroupMeta || {});
        delete taskGroupMeta[boundTopic.taskGroupId];
        const messages = (thread.messages || []).filter((message) => message.taskGroupId !== boundTopic.taskGroupId);
        return Object.assign({}, thread, { taskGroupMeta, messages });
      });
    } catch (err) {
      topicCleanupError = err.message || String(err);
    }
  }
  clearTodoListCache();
  closeTopMoreMenu();
  state.selectedTodoId = "";
  state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, { [key]: false });
  showPushToast(
    topicCleanupError
      ? `已删除 ${items.length} 张故事卡片；绑定话题清理失败：${compactDisplayText(topicCleanupError, 80)}`
      : `已删除 ${items.length} 张故事卡片${boundTopic ? "，并清理绑定话题" : ""}`,
    topicCleanupError ? "error" : "success",
  );
  await loadTodos({ skipCache: true, freshServer: true, includeCompleted: true });
  return true;
}

async function blockTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to block this card");
  await api(boardActionApiPath(todoId, "block"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      reason: "Blocked from Hermes Mobile Kanban view.",
    }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  renderTodos();
}

async function unblockTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to unblock this card");
  await api(boardActionApiPath(todoId, "unblock"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  renderTodos();
}

async function commentTodo(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) throw new Error("No permission to comment on this card");
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写评论内容");
  await api(boardActionApiPath(todoId, "comment"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      comment: text,
    }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  delete state.todoCommentDrafts[todoId];
  showPushToast("评论已添加", "success");
  renderTodos();
}

async function commentAndUnblockTodo(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && (!kanbanCan(card, "canComment") || !kanbanCan(card, "canManage"))) throw new Error("No permission to comment and unblock this card");
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写评论内容");
  await api(boardActionApiPath(todoId, "comment"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      comment: text,
    }),
  });
  await api(boardActionApiPath(todoId, "unblock"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  delete state.todoCommentDrafts[todoId];
  showPushToast("评论已添加，已解除阻塞", "success");
  renderTodos();
}

async function requestTodoRevision(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canRevise")) throw new Error("No permission to request revision for this card");
  if (state.todoRevisionSubmitting?.[todoId]) return;
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写修改要求");
  state.todoRevisionDrafts[todoId] = text;
  state.todoRevisionSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const response = await api(boardActionApiPath(todoId, "revise"), {
      method: "POST",
      body: kanbanCardActionBody(todoId, {
        comment: text,
      }),
    });
    const result = response.result || {};
    const revisionId = result.revisionId || result.revisionCard?.id || result.id || "";
    clearTodoListCache();
    state.todoKanbanStatus = "todo";
    localStorage.setItem("hermesTodoKanbanStatus", "todo");
    await loadTodos({ skipCache: true });
    state.selectedTodoId = revisionId || todoId;
    delete state.todoRevisionDrafts[todoId];
    showPushToast(revisionId ? `已创建修改任务 ${revisionId}` : "修改请求已提交", "success");
  } finally {
    delete state.todoRevisionSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function submitReadingSubmission(todoId, file, notes = "") {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  const labels = kanbanStudyLabels(card || {});
  if (card && !kanbanCan(card, "canSubmitStudy")) throw new Error("No permission to submit this study card");
  if (state.todoReadingSubmitting?.[todoId]) return;
  if (!file) throw new Error(`请先选择${labels.recording}文件`);
  state.todoReadingSubmissionDrafts[todoId] = notes || "";
  state.todoReadingSubmitting[todoId] = true;
  state.todoReadingSubmissionProgress[todoId] = "uploading";
  setReadingSubmissionFeedback(todoId, {
    kind: "info",
    message: `正在上传${labels.recording}。`,
  });
  showPushToast(`${labels.recording}已开始上传，正在${labels.analysis}`);
  scheduleReadingSubmissionRecovery(todoId);
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const dataBase64 = await fileToBase64(file);
    state.todoReadingSubmissionProgress[todoId] = "transcribing";
    setReadingSubmissionFeedback(todoId, {
      kind: "info",
      message: `${labels.recording}已上传，正在转写语音、生成${labels.analysis}和${labels.quiz}。`,
    });
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-submission`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: kanbanCardWorkspaceId(todoId),
        filename: file.name || "reading-audio.m4a",
        type: file.type || "audio/mp4",
        dataBase64,
        notes,
      }),
    });
    if (result?.quiz) applyReadingQuizResult(todoId, result);
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true });
    state.selectedTodoId = todoId;
    delete state.todoReadingSubmissionDrafts[todoId];
    delete state.todoCardDetails[todoId];
    await loadKanbanCardDetail(todoId, { force: true, silent: true });
    setReadingSubmissionFeedback(todoId, {
      kind: "success",
      message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
    });
    showPushToast(`${labels.analysis}和${labels.quiz}已生成；10 题全对后完成卡片。`, "success");
  } catch (err) {
    if (readingSubmissionReady(todoId)) {
      setReadingSubmissionFeedback(todoId, {
        kind: "success",
        message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
      });
      return;
    }
    setReadingSubmissionFeedback(todoId, {
      kind: "error",
      message: err?.message || `${labels.recording}提交失败，请重试。`,
    });
    throw err;
  } finally {
    clearReadingSubmissionPendingState(todoId);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadReadingQuiz(todoId) {
  if (!todoId) return;
  state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId] || {}, { loading: true, error: "" });
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(todoId) });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-quiz?${params.toString()}`);
    applyReadingQuizResult(todoId, result);
    const canonicalId = String(result.canonicalCardId || todoId || "").trim() || todoId;
    const completed = String(result.status || "").trim().toLowerCase() === "completed"
      || (Array.isArray(result.attempts) && result.attempts.some((attempt) => attempt?.passed));
    if (completed) {
      clearTodoListCache(kanbanCardWorkspaceId(canonicalId));
      await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, preserveScroll: true });
      state.selectedTodoId = canonicalId;
    }
    await loadLearningGuidanceSession(canonicalId, "reading-quiz").catch(() => {});
    replaceTodoDetailRouteFlag(canonicalId, "readingQuiz");
  } catch (err) {
    state.todoReadingQuizzes[todoId] = { loading: false, error: err.message || String(err) };
  }
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

async function submitReadingQuiz(todoId) {
  if (!todoId || state.todoReadingQuizSubmitting?.[todoId]) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canAnswerQuiz")) throw new Error("No permission to answer this quiz");
  const answers = state.todoReadingQuizAnswers[todoId] || [];
  state.todoReadingQuizSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-quiz`, {
      method: "POST",
      body: JSON.stringify({ workspaceId: kanbanCardWorkspaceId(todoId), answers }),
    });
    state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId] || {}, { result, status: result.status || "" });
    delete state.todoReadingQuizReviewOpen[todoId];
    const canonicalId = String(result.canonicalCardId || todoId || "").trim() || todoId;
    if (result.passed) {
      clearTodoListCache(kanbanCardWorkspaceId(todoId));
      clearReadingQuizDrafts(canonicalId);
      if (canonicalId !== todoId) clearReadingQuizDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true });
      state.selectedTodoId = state.todos.some((todo) => todo.id === canonicalId) ? canonicalId : todoId;
      showPushToast("考卷 10/10，全对，阅读卡片已完成。", "success");
    } else {
      const wrongIndex = Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1;
      if (wrongIndex >= 0) state.todoReadingQuizStep[todoId] = wrongIndex;
      writeReadingQuizDraft(todoId);
      showPushToast(`考卷 ${result.correctCount || 0}/${result.total || 10}，请订正后再提交。`, "error");
    }
  } finally {
    delete state.todoReadingQuizSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadAssessmentExam(todoId, options = {}) {
  if (!todoId) return;
  const card = kanbanCardById(todoId) || {};
  state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId] || {}, { loading: true, error: "" });
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(todoId) });
    const requirement = String(options.requirement || "").trim();
    const result = requirement
      ? await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId: kanbanCardWorkspaceId(todoId),
          generateOnly: true,
          requirement,
        }),
      })
      : await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam?${params.toString()}`);
    state.todoAssessmentExams[todoId] = { exam: result.exam, status: result.status || "", attempts: result.attempts || [], result: result.result || null };
    replaceTodoDetailRouteFlag(todoId, "assessmentExam");
    const draft = applyAnswerDraft(
      "AssessmentExam",
      kanbanCardWorkspaceId(todoId),
      todoId,
      result.exam || {},
      state.todoAssessmentAnswers[todoId] || [],
      state.todoAssessmentStep[todoId] || 0,
    );
    state.todoAssessmentAnswers[todoId] = draft.answers;
    state.todoAssessmentStep[todoId] = draft.step;
    await loadLearningGuidanceSession(todoId, learningGuidanceModeForAssessment(card || { id: todoId })).catch(() => {});
    if (requirement) delete state.todoAssessmentRequirementDrafts[todoId];
  } catch (err) {
    state.todoAssessmentExams[todoId] = { loading: false, error: err.message || String(err) };
  }
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

async function submitAssessmentExam(todoId) {
  if (!todoId || state.todoAssessmentSubmitting?.[todoId]) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canAnswerQuiz")) throw new Error("No permission to answer this exam");
  const answers = state.todoAssessmentAnswers[todoId] || [];
  state.todoAssessmentSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam`, {
      method: "POST",
      body: JSON.stringify({ workspaceId: kanbanCardWorkspaceId(todoId), answers }),
    });
    state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId] || {}, { result, status: result.status || "" });
    delete state.todoAssessmentReviewOpen[todoId];
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    if (result.passed) {
      clearAssessmentExamDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true });
      state.selectedTodoId = todoId;
      showPushToast(`考试通过：${result.score || 0}/100`, "success");
    } else {
      const wrongIndex = Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1;
      if (wrongIndex >= 0) state.todoAssessmentStep[todoId] = wrongIndex;
      writeAssessmentExamDraft(todoId);
      showPushToast(`考试 ${result.score || 0}/100，未达通过线，请重考。`, "error");
    }
  } finally {
    delete state.todoAssessmentSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function deleteTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canDelete")) throw new Error("No permission to delete this card");
  if (card && kanbanCardHasExplicitStoryCase(card)) throw new Error("This card belongs to a story. Delete the story from the Story view.");
  if (!window.confirm(`删除看板卡片 ${todoId}？`)) return;
  await api(boardActionApiPath(todoId, "delete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  closeTopMoreMenu();
  state.selectedTodoId = "";
  await loadTodos();
}

async function deleteTodoDirect(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canDelete")) throw new Error("No permission to delete this card");
  if (card && kanbanCardHasExplicitStoryCase(card)) throw new Error("This card belongs to a story. Delete the story from the Story view.");
  await api(boardActionApiPath(todoId, "delete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  if (state.selectedTodoId === todoId) state.selectedTodoId = "";
  await loadTodos();
}

async function postponeTodo(todoId, dueTime) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to postpone this card");
  if (!dueTime) throw new Error("请选择新的截止时间");
  await api(boardActionApiPath(todoId, "postpone"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, { dueTime }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
}

async function postponeTodoFromDetail(root, todoId) {
  const value = root.querySelector("#todoPostponeDue")?.value || "";
  await postponeTodo(todoId, value.replace("T", " "));
}

async function postponeTodoQuick(todoId, minutes) {
  const offset = Number.isFinite(minutes) ? minutes : 60;
  const value = localDateTimeInputValue(new Date(Date.now() + Math.max(1, offset) * 60 * 1000));
  await postponeTodo(todoId, value.replace("T", " "));
}

function focusTodoFormSoon() {
  setTimeout(() => {
    ($("kanbanStudyTitle") || $("kanbanReadingBook") || $("kanbanComposerText") || $("todoContent"))?.focus();
  }, 40);
}

function openTodoCreate() {
  closeTopMoreMenu();
  state.selectedTodoId = "";
  if (!state.todoCreateOpen) {
    state.kanbanComposerMessages = [];
    state.kanbanPlanDraft = null;
    finishKanbanComposerProgress();
  }
  state.todoCreateOpen = true;
  renderTodos();
  focusTodoFormSoon();
}

async function createThread() {
  clearQuotedReply({ render: false });
  if (state.viewMode === "single") {
    await loadSingleWindow();
    return;
  }
  if (state.viewMode === "todos") {
    state.selectedTodoId = "";
    if (!state.todoCreateOpen) {
      state.kanbanComposerMessages = [];
      state.kanbanPlanDraft = null;
      finishKanbanComposerProgress();
    }
    state.todoCreateOpen = true;
    await loadTodos();
    if (isMobileLayout()) closeSidebar();
    focusTodoFormSoon();
    return;
  }
  if (state.viewMode === "tasks") {
    state.currentTaskGroupId = "";
    if (isMobileLayout()) closeSidebar();
    if (isCurrentSingleWindowLoaded()) {
      renderThreads();
      renderCurrentThread({ stickToBottom: true });
      focusComposerSoon();
      return;
    }
    await loadSingleWindow();
    focusComposerSoon();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "learning") {
    renderLearningCoinsView();
    return;
  }
  if (state.viewMode === "projects") {
    await loadDirectoryView();
    return;
  }
  state.transientProjectRoute = null;
  if (isMobileLayout()) closeSidebar();
  const draft = createDraftThread();
  state.currentThread = draft;
  state.currentThreadId = draft.id;
  state.threads = [draft, ...state.threads.filter((thread) => !isDraftThread(thread))];
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  focusComposerSoon();
}

async function selectThread(threadId) {
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.currentThreadId = threadId;
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  if (isMobileLayout()) closeSidebar();
}

async function openProjectTask(sourceThreadId, taskGroupId) {
  if (!sourceThreadId || !taskGroupId) return;
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentThreadId = sourceThreadId;
  const result = await api(`/api/threads/${encodeURIComponent(sourceThreadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const enabled = Boolean(options.enabled);
  const searchMode = isChatSearchMode();
  setComposerEditorEnabled(enabled || searchMode);
  setComposerPlaceholder(searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Hermes..."));
  $("attachFile").disabled = searchMode ? false : !enabled;
  $("sendMessage").disabled = searchMode ? !currentChatSearchDraft() : !enabled;
  updateComposerAction();
  renderQuotedReply();
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Hermes..." });
}

function setComposerEditorEnabled(enabled) {
  const input = $("messageInput");
  if (!input) return;
  if ("disabled" in input) input.disabled = !enabled;
  else input.setAttribute("contenteditable", enabled ? "plaintext-only" : "false");
  input.dataset.disabled = enabled ? "" : "true";
  input.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setComposerPlaceholder(text) {
  const input = $("messageInput");
  if (input) {
    input.dataset.placeholder = text || "";
    if ("placeholder" in input) input.placeholder = text || "";
  }
}

function composerPlaceholder(fallback) {
  return isSingleWindowView() && !isSingleWindowChatView() && state.quotedReply ? "Reply to quoted task..." : fallback;
}

function renderThreads() {
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "learning") {
    renderLearningCoinsView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoList();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectorySidebar();
    return;
  }
  const list = $("threadList");
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    list.innerHTML = "";
    return;
  }
  if (!state.threads.length) {
    list.innerHTML = `<div class="empty-state small">${state.viewMode === "single" ? (state.singleWindowMode === "chat" ? "聊天为空。" : "话题流为空。") : "No threads in this project."}</div>`;
    return;
  }
  list.innerHTML = state.threads.map((thread) => {
    const active = thread.id === state.currentThreadId ? " active" : "";
    if (thread.singleWindowTask) {
      return `<button class="thread-card project-task-card${active}" type="button" data-project-task-thread="${escapeHtml(thread.sourceThreadId || "")}" data-project-task-group="${escapeHtml(thread.taskGroupId || "")}">
        <div class="thread-card-title">${escapeHtml(thread.title || thread.taskGroupId || "Topic")}</div>
        <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
        <div class="thread-card-meta">${escapeHtml(`topic | ${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
      </button>`;
    }
    return `<button class="thread-card${active}" type="button" data-thread="${escapeHtml(thread.id)}">
      <div class="thread-card-title">${escapeHtml(thread.title || thread.id)}</div>
      <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
      <div class="thread-card-meta">${escapeHtml(`${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
    </button>`;
  }).join("");
  list.querySelectorAll("[data-project-task-thread]").forEach((button) => {
    button.addEventListener("click", () => openProjectTask(button.dataset.projectTaskThread, button.dataset.projectTaskGroup).catch(showError));
  });
  list.querySelectorAll("[data-thread]").forEach((button) => {
    button.addEventListener("click", () => selectThread(button.dataset.thread).catch(showError));
  });
}

function renderChatScopeHeader(thread) {
  const header = $("chatScopeHeader");
  if (!header) return;
  if (!isSingleWindowChatView() || !thread || isWeixinChatView()) {
    if (thread && isWeixinChatView()) markActiveChatScopeRead(thread);
    header.hidden = true;
    header.innerHTML = "";
    return;
  }
  ensureChatScopeReadBaselines(thread);
  markActiveChatScopeRead(thread);
  const groupSelected = isGroupChatView();
  const canSelectGroup = groupSelected || groupChatSelectable(thread);
  const scopeButton = (scope, label, selected, canSelect) => {
    const unread = selected ? 0 : unreadChatScopeCount(thread, scope);
    const unreadText = unread > 99 ? "99+" : String(unread);
    const unreadBadge = unread
      ? `<span class="chat-scope-header-badge">${escapeHtml(unreadText)}</span>`
      : "";
    const ariaLabel = unread ? `${label}\uff0c${unreadText}\u6761\u672a\u8bfb` : label;
    return `<button class="chat-scope-header-button${selected ? " active" : ""}" type="button" role="tab" aria-selected="${selected ? "true" : "false"}" aria-label="${escapeHtml(ariaLabel)}" data-chat-scope="${escapeHtml(scope)}" ${canSelect ? "" : "disabled"}>
      ${escapeHtml(label)}${unreadBadge}
    </button>`;
  };
  header.hidden = false;
  header.innerHTML = `<div class="chat-scope-segment" role="tablist" aria-label="${"\u804a\u5929\u5207\u6362"}">
    ${scopeButton("chat", "\u804a\u5929", !groupSelected, true)}
    ${scopeButton("group", "\u7fa4", groupSelected, canSelectGroup)}
  </div>`;
  wireChatScopeHeader(header);
}

function renderChatHistoryPager(thread) {
  if (!isSingleWindowChatView()) return "";
  const page = thread?.messagesPage || {};
  const hasMore = page.hasMoreBefore !== false && Boolean(page.oldestMessageId || page.total > chatMessagesForThread(thread).length);
  if (!hasMore && !state.olderChatMessagesLoading) return "";
  return `<div class="chat-history-pager">
    <button type="button" data-load-older-chat ${state.olderChatMessagesLoading ? "disabled" : ""}>
      ${state.olderChatMessagesLoading ? "Loading..." : "Load earlier messages"}
    </button>
  </div>`;
}

function wireChatHistoryPager(root) {
  root?.querySelector?.("[data-load-older-chat]")?.addEventListener("click", () => {
    loadOlderChatMessages().catch(showError);
  });
}

function wireChatScopeHeader(root) {
  root?.querySelectorAll?.("[data-chat-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      selectChatScope(button.dataset.chatScope).catch(showError);
    });
  });
}

function renderCurrentThread(options = {}) {
  renderChatScopeHeader(null);
  if (isSkillDetailView()) {
    renderSkillDetailPanel();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoPanel();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectoryView();
    return;
  }
  const thread = state.currentThread;
  const conversation = $("conversation");
  let bottomOffset = state.preservedBottomOffset;
  if (!options.stickToBottom && conversation.scrollHeight) {
    bottomOffset = conversation.scrollHeight - conversation.scrollTop;
  }
  if (!thread) {
    $("threadTitle").textContent = "Select or create a thread";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "Message Hermes..." });
    conversation.innerHTML = `<div class="empty-state">Create a thread to start a zero-context Hermes task.</div>`;
    updateNavigationControls();
    ensureVerticalScrollAffordance(conversation);
    return;
  }
  if (state.viewMode === "tasks" && thread.singleWindow) {
    renderTaskWindow(thread, conversation, options, bottomOffset);
    return;
  }
  updateNavigationControls();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
  const infoStream = isSingleWindowView();
  const weixinChat = isWeixinChatView();
  const groupChat = isGroupChatView();
  $("threadTitle").textContent = infoStream
    ? (state.singleWindowMode === "chat" ? (groupChat ? "群聊" : "聊天") : "话题流")
    : (thread.title || thread.id);
  renderChatScopeHeader(thread);
  if (isSingleWindowChatView()) $("threadTitle").textContent = "";
  if (weixinChat) $("threadTitle").textContent = "\u5fae\u4fe1";
  const project = state.projects.find((item) => item.id === thread.projectId);
  const subproject = (project?.children || []).find((item) => item.id === thread.subprojectId);
  const displayMessages = isSingleWindowChatView() ? chatMessagesForThread(thread) : (thread.messages || []);
  const activeRuns = isSingleWindowChatView() ? activeChatRunIds(thread) : activeThreadRunIds(thread);
  const projectScope = project ? projectDisplayLabel(project) : "";
  const scope = infoStream || thread.singleWindow
    ? ""
    : subproject
    ? `${projectScope || thread.projectId} / ${subproject.label || subproject.id}`
    : (projectScope || thread.projectId || "general");
  $("threadMeta").textContent = groupChat
    ? groupChatMemberLabels(thread).join(" · ")
    : (scope ? `${scope} | session ${thread.hermesSessionId || ""}` : "");
  $("interruptRun").disabled = !activeRuns.length;
  if (isSingleWindowChatView()) $("threadMeta").textContent = "";
  if (isSingleWindowChatView()) {
    syncChatSearchMatches();
  }
  const progressPanel = renderRunProgressPanel(thread, activeRuns);
  const historyPager = renderChatHistoryPager(thread);
  conversation.innerHTML = `${historyPager}${progressPanel}${displayMessages.map(renderMessage).join("") || `<div class="empty-state">No messages yet.</div>`}`;
  wireChatHistoryPager(conversation);
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
  wireUsagePanels(conversation);
  wireChatSearchControls(conversation);
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  if (state.chatSearchScrollPending) {
    state.chatSearchScrollPending = false;
    requestAnimationFrame(() => scrollToCurrentChatSearchMatch(conversation));
  } else if (options.stickToBottom) {
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
}

function renderTaskWindow(thread, conversation, options, bottomOffset) {
  const allGroups = taskListGroupsForThread(thread)
    .concat(sharedCaseTopicGroupsForTaskList(thread))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const displayGroups = allGroups.slice();
  const search = currentSearchText().toLowerCase();
  const groups = displayGroups.filter((group) => {
    if (!taskMatchesDirectoryFilter(group)) return false;
    if (!search) return true;
    const skillText = taskSkills(group).map((skill) => `${skill.label} ${skill.path}`).join("\n");
    return `${taskDisplayId(group)}\n${taskTitle(group)}\n${taskPrompt(group)}\n${taskSummary(group)}\n${skillText}`.toLowerCase().includes(search);
  });
  const selected = allGroups.find((group) => group.id === state.currentTaskGroupId) || null;
  const allActiveRuns = activeThreadRunIds(thread);

  if (state.currentTaskGroupId && !selected) {
    if (state.routeScrollTaskGroupId === state.currentTaskGroupId) clearRouteScrollTarget();
    state.currentTaskGroupId = "";
  }
  if (!state.currentTaskGroupId) {
    $("threadTitle").textContent = "话题列表";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !allActiveRuns.length;
    configureComposer({ enabled: true, placeholder: "New topic..." });
    const filterBanner = renderTaskDirectoryFilterBanner();
    const progressPanel = renderRunProgressPanel(thread, allActiveRuns);
    conversation.innerHTML = groups.length
      ? `${filterBanner}${progressPanel}<div class="task-grid">${groups.map(renderTaskCard).join("")}</div>`
      : `${filterBanner}${progressPanel}<div class="empty-state">${state.taskDirectoryFilter ? "No topics in this directory." : "No topics yet. Send a message to create one."}</div>`;
    conversation.querySelectorAll("[data-open-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const sourceThreadId = String(button.dataset.openTaskThread || "");
        if (sourceThreadId && sourceThreadId !== state.currentThreadId) {
          openSharedTaskGroupFromList(sourceThreadId, button.dataset.openTask).catch(showError);
          return;
        }
        openTaskGroupFromList(button.dataset.openTask);
      });
    });
    wireTaskDocumentLinks(conversation);
    wireTaskSwipeActions(conversation);
    wireTaskCardMenus(conversation);
    wireTaskDirectoryFilterControls(conversation);
    wireSkillLinks(conversation);
  } else {
    const groupActiveRuns = (selected.messages || [])
      .filter((message) => ["queued", "running"].includes(message.status))
      .map((message) => message.runId)
      .filter(Boolean);
    $("threadTitle").textContent = "";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !groupActiveRuns.length;
    const sharedChatDisabled = sharedTopicChatDisabledForSelectedWorkspace(selected);
    configureComposer({
      enabled: !sharedChatDisabled,
      placeholder: sharedChatDisabled
        ? "\u65e0\u6743\u53d1\u8a00"
        : (selected.sharedTopic ? "\u53d1\u5230\u5b66\u4e60\u8bdd\u9898\uff1b@ChatGPT \u624d\u4f1a\u8c03\u7528 AI" : "Reply in this task..."),
    });
    const progressPanel = renderRunProgressPanel(thread, groupActiveRuns);
    conversation.innerHTML = `${progressPanel}${(selected.messages || []).map(renderMessage).join("") || `<div class="empty-state">No task messages yet.</div>`}`;
    renderTaskDetailToolbar(selected);
  }
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireSkillLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
  wireUsagePanels(conversation);
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);

  if (selected && consumeTaskRouteScrollTarget(selected)) {
    return;
  }
  if (options.stickToBottom) {
    conversation.scrollTop = state.currentTaskGroupId ? conversation.scrollHeight : 0;
    state.conversationPinnedToBottom = Boolean(state.currentTaskGroupId);
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
}

function messageDirectoryAliases(message) {
  const aliases = [];
  if (Array.isArray(message?.directoryAliases)) aliases.push(...message.directoryAliases);
  if (message?.directoryRoute) aliases.push(message.directoryRoute);
  return aliases
    .map((item) => ({
      label: item?.label || item?.name || "",
      path: item?.path || item?.root || "",
      projectId: item?.projectId || "",
      subprojectId: item?.subprojectId || "",
      source: "bound",
    }))
    .filter((item) => item.label || item.path);
}

function extractedTaskDirectoryAliases(group) {
  const aliases = [];
  for (const message of group?.messages || []) {
    aliases.push(...messageExtractedDirectoryAliases(message));
  }
  return aliases;
}

function messageExtractedDirectoryAliases(message) {
  const aliases = [];
  const extracted = extractDirectoryAliases(message?.content || "");
  for (const alias of extracted.aliases || []) {
    aliases.push(Object.assign({ messageId: message?.id || "", source: "extracted" }, alias));
  }
  aliases.push(...extractMediaDirectoryAliases(message?.content || "", message?.id || ""));
  return aliases;
}

function explicitTaskDirectoryAliases(group) {
  const aliases = [];
  if (group?.directoryRoute) aliases.push(Object.assign({ source: "bound" }, group.directoryRoute));
  for (const message of group?.messages || []) {
    aliases.push(...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)));
  }
  return aliases;
}

function uniqueAliases(aliases) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
}

function directoryAliasItemKey(item) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return route.projectId
    ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
    : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
}

function aliasFromDirectoryItem(item, extra = {}) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return Object.assign({}, displayAlias, {
    projectId: route.projectId || displayAlias.projectId || "",
    subprojectId: route.subprojectId || displayAlias.subprojectId || "",
    path: displayAlias.path || route.root || "",
  }, extra);
}

function isDeliveryDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  const projectId = String(route?.projectId || alias?.projectId || "");
  return Boolean(
    alias?.referenceKind === "delivery"
    || projectId === "hermes-sync-folder"
    || pathValue.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939")
    || label.includes("\u4e3b\u4ea4\u4ed8")
    || label.includes("\u540c\u6b65\u6839")
    || label.includes("\u9644\u52a0\u4efb\u52a1\u76ee\u5f55")
    || /sync(root|directory|folder)/i.test(label)
  );
}

function isTaskBindingDirectoryItem(item) {
  return Boolean(
    item?.route
    && !isDeliveryDirectoryAlias(item.displayAlias, item.route)
    && !isGenericDefaultDirectoryAlias(item.displayAlias)
    && !isOperationalTaskDirectoryAlias(item.displayAlias, item.route)
  );
}

function usableTaskBindingAliases(aliases) {
  return (aliases || []).filter((alias) => (
    alias
    && !alias.referenceKind
    && !isDeliveryDirectoryAlias(alias)
    && !isGenericDefaultDirectoryAlias(alias)
    && !isOperationalTaskDirectoryAlias(alias)
  ));
}

function selectTaskBindingAlias(candidates, context) {
  const items = directoryAliasItemsForAliases(candidates, context, { includeGenericDefault: false });
  const bindingItems = items.filter(isTaskBindingDirectoryItem);
  const primary = bindingItems.find((item) => isContextAnchorDirectoryRoute(item.route)) || bindingItems[0] || null;
  if (primary) return aliasFromDirectoryItem(primary, { source: "bound" });
  const fallback = usableTaskBindingAliases(candidates).find((alias) => alias.label || alias.path);
  return fallback ? Object.assign({}, fallback, { source: "bound" }) : null;
}

function taskPrimaryDirectoryAlias(group) {
  const context = taskDirectoryContext(group);
  for (const message of group?.messages || []) {
    const candidates = usableTaskBindingAliases([
      ...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)),
      ...messageExtractedDirectoryAliases(message),
    ]);
    const primary = selectTaskBindingAlias(candidates, context);
    if (primary) return primary;
  }
  const candidates = [
    ...explicitTaskDirectoryAliases(group),
    ...usableTaskBindingAliases(extractedTaskDirectoryAliases(group)),
  ];
  return selectTaskBindingAlias(candidates, context);
}

function taskDirectoryAliases(group) {
  const primary = taskPrimaryDirectoryAlias(group);
  return primary ? [primary] : [];
}

function taskReferenceDirectoryAliases(group) {
  const context = taskDirectoryContext(group);
  const primaryKeys = new Set(directoryAliasItemsForAliases(taskDirectoryAliases(group), context, { includeGenericDefault: false }).map(directoryAliasItemKey));
  const referenceAliases = extractedTaskDirectoryAliases(group)
    .filter((alias) => alias.referenceKind || isDeliveryDirectoryAlias(alias));
  const referenceItems = directoryAliasItemsForAliases(referenceAliases, context, { coalesce: false });
  return uniqueAliases(referenceItems
    .filter((item) => !primaryKeys.has(directoryAliasItemKey(item)))
    .map((item) => aliasFromDirectoryItem(item, { source: "reference", referenceKind: item.displayAlias?.referenceKind || "reference" })));
}

function directoryAliasItemsForAliases(aliases, context = null, options = {}) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  const items = [...unique.values()].map((alias) => {
    const genericDefault = isGenericDefaultDirectoryAlias(alias);
    const genericCurrentBound = isGenericCurrentBoundDirectoryAlias(alias);
    if (genericDefault && options.includeGenericDefault === false) return null;
    const boundRoute = genericCurrentBound ? explicitDirectoryRouteForContext(context) : null;
    if (genericCurrentBound && !boundRoute) return null;
    const semanticRoute = genericDefault ? semanticDirectoryRouteForMessage(context) : null;
    if (genericDefault && !semanticRoute) return null;
    const contextRoute = boundRoute || semanticRoute;
    const displayAlias = Object.assign({}, alias, contextRoute ? { label: contextRoute.label, path: contextRoute.root } : null);
    const route = contextRoute || resolveDirectoryProjectRoute(displayAlias);
    return { displayAlias, route };
  }).filter(Boolean);
  return uniqueDirectoryAliasItems(options.coalesce === false ? items : coalesceDirectoryAliasItems(items));
}

function directoryRoutesForAliases(aliases, context = null) {
  return directoryAliasItemsForAliases(aliases, context).filter((item) => item.route);
}

function taskDirectoryRoutes(group) {
  return directoryRoutesForAliases(taskDirectoryAliases(group), taskDirectoryContext(group)).map((item) => item.route);
}

function taskDirectoryRouteMatchesFilter(route, filter = state.taskDirectoryFilter) {
  if (!filter || !route) return true;
  if (String(route.projectId || "") !== String(filter.projectId || "")) return false;
  if (!filter.subprojectId) return true;
  return String(route.subprojectId || "") === String(filter.subprojectId || "");
}

function taskMatchesDirectoryFilter(group) {
  if (!state.taskDirectoryFilter) return true;
  return taskDirectoryRoutes(group).some((route) => taskDirectoryRouteMatchesFilter(route));
}

function taskDirectoryFilterLabel(filter = state.taskDirectoryFilter) {
  if (!filter) return "";
  if (filter.label) return filter.label;
  const project = state.projects.find((item) => item.id === filter.projectId);
  const subproject = (project?.children || []).find((item) => item.id === filter.subprojectId);
  if (project && subproject) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: subproject.id, label: projectDisplayLabel(project), root: subproject.root || project.root },
      `${projectDisplayLabel(project)} / ${subproject.label || subproject.id}`
    );
  }
  if (project) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: "", label: projectDisplayLabel(project), root: project.root },
      projectDisplayLabel(project)
    );
  }
  return filter.projectId || "";
}

function setTaskDirectoryFilter(projectId, subprojectId = "", label = "") {
  if (!projectId) return;
  const attachment = directoryAttachmentFromRoute(projectId, subprojectId || "", "", label || "");
  state.taskDirectoryFilter = { projectId, subprojectId: subprojectId || "", label: label || "", directory: attachment };
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  closeTopMoreMenu();
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function clearTaskDirectoryFilter(options = {}) {
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  closeTopMoreMenu();
  if (options.render !== false) {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
  }
}

function renderTaskDirectoryFilterBanner() {
  if (!state.taskDirectoryFilter) return "";
  return `<div class="task-filter-banner">
    <span class="task-filter-label">资料目录：${escapeHtml(taskDirectoryFilterLabel())}</span>
    <span class="task-filter-actions">
      <button type="button" data-clear-task-directory-filter>清除</button>
    </span>
  </div>`;
}

function wireTaskDirectoryFilterControls(root) {
  root?.querySelectorAll?.("[data-task-reasoning-effort]").forEach((select) => {
    if (select.dataset.boundTaskReasoningEffort) return;
    select.dataset.boundTaskReasoningEffort = "1";
    select.addEventListener("change", () => {
      state.pendingTaskReasoningEffort = select.value || "";
    });
  });
  root?.querySelectorAll?.("[data-clear-task-directory-filter]").forEach((button) => {
    if (button.dataset.boundClearTaskDirectoryFilter) return;
    button.dataset.boundClearTaskDirectoryFilter = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTaskDirectoryFilter();
    });
  });
}

function taskDirectoryContext(group) {
  return {
    taskGroupId: group?.id || "",
    content: (group?.messages || []).map((message) => message.content || "").join("\n"),
  };
}

function renderTaskDirectoryBadges(group, options = {}) {
  const context = taskDirectoryContext(group);
  const rendered = renderDirectoryAliases(taskDirectoryAliases(group), context);
  if (!rendered && options.empty) {
    return `<div class="task-card-directories task-card-directories-empty"><span>未绑定目录</span></div>`;
  }
  if (!rendered) return "";
  return `<div class="task-card-directories${options.compact ? " compact" : ""}">${rendered}</div>`;
}

function renderTaskDetailToolbar(group) {
  const toolbar = $("taskDetailToolbar");
  if (!toolbar) return;
  const sharedTopic = Boolean(group?.sharedTopic);
  const context = Object.assign({ toolbar: true }, taskDirectoryContext(group));
  const aliasButtons = renderDirectoryAliases(taskDirectoryAliases(group), context);
  const skillChips = renderTaskSkillChips(taskSkills(group), { compact: true });
  toolbar.innerHTML = `
    <div class="task-toolbar-meta">
      <div class="task-toolbar-directories">${aliasButtons || ""}</div>
      ${skillChips}
    </div>
    ${sharedTopic ? "" : `<div class="task-more-wrap">
      <button class="task-more-button" type="button" data-task-more aria-label="Topic menu" aria-expanded="false">...</button>
      <div class="task-more-menu" hidden>
        <button class="task-more-delete" type="button" data-delete-current-task>Delete</button>
      </div>
    </div>`}
  `;
  const moreButton = toolbar.querySelector("[data-task-more]");
  const moreMenu = toolbar.querySelector(".task-more-menu");
  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = Boolean(moreMenu?.hidden);
    if (moreMenu) moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  moreMenu?.addEventListener("click", (event) => event.stopPropagation());
  toolbar.querySelector("[data-delete-current-task]")?.addEventListener("click", () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
    deleteTaskGroup(group.id).catch(showError);
  });
  wireDirectoryProjectLinks(toolbar);
  wireSkillLinks(toolbar);
}

function kanbanStoryProgressItems(group) {
  if (!group) return [];
  if (group.mode === "assessment-plan") return kanbanAssessmentVisibleCardItems(group);
  if (group.mode === "study-plan") return kanbanReadingBaseCardItems(group);
  return group.cards || [];
}

function kanbanStoryCurrentItemForTopic(group) {
  if (!group) return null;
  if (group.mode === "assessment-plan") return kanbanAssessmentCaseCurrentItem(group);
  if (group.mode === "study-plan") return kanbanReadingCaseCurrentItem(group);
  return (group.cards || []).find((item) => !["done", "archived"].includes(normalizedKanbanStatus(item.todo))) || (group.cards || [])[0] || null;
}

function kanbanStoryItemCompletedForProgress(group, item) {
  const todo = item?.todo || {};
  if (group?.mode === "assessment-plan") return assessmentExamCompleted(todo);
  if (group?.mode === "study-plan") return readingSubmissionCompleted(todo);
  return ["done", "archived"].includes(normalizedKanbanStatus(todo));
}

function kanbanStoryTopicOutputs(group) {
  const items = group?.mode === "assessment-plan"
    ? kanbanAssessmentStoryVisibleCardItems(group)
    : (group?.cards || []);
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    for (const output of kanbanCardOutputs(item.todo)) {
      const key = String(output?.url || output?.path || output?.name || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(output);
    }
  }
  return out;
}

function renderKanbanTopicOutputChips(outputs) {
  const items = (outputs || []).slice(0, 3);
  if (!items.length) return "";
  const chips = items.map((output) => {
    const label = artifactDisplayName(output);
    return `<a class="kanban-topic-output-chip" href="${escapeHtml(artifactHref(output))}" data-task-doc title="${escapeHtml(label)}">${escapeHtml(iconForArtifact(output))} ${escapeHtml(compactDisplayText(label, 28))}</a>`;
  }).join("");
  const extra = outputs.length > items.length ? `<span class="kanban-topic-output-more">+${outputs.length - items.length}</span>` : "";
  return `<div class="kanban-topic-outputs">${chips}${extra}</div>`;
}

function renderTaskCard(group) {
  const sharedTopic = Boolean(group.sharedTopic || group.sourceThreadId);
  const latestArtifact = sharedTopic ? null : latestTaskListDocument(group);
  const skills = sharedTopic ? [] : taskSkills(group);
  const artifactChips = latestArtifact ? `<span class="task-doc-item">
    <a class="task-doc-icon doc-${escapeHtml(artifactKind(latestArtifact))}" href="${escapeHtml(artifactHref(latestArtifact))}" target="_blank" rel="noopener" data-task-doc title="${escapeHtml(artifactDisplayName(latestArtifact))}" aria-label="${escapeHtml(artifactDisplayName(latestArtifact))}">
      ${escapeHtml(iconForArtifact(latestArtifact))}
    </a>
    ${renderArtifactDirectoryButton(latestArtifact, { compact: true })}
  </span>` : "";
  const skillChips = renderTaskSkillChips(skills, { compact: true });
  const sourceThreadAttr = group.sourceThreadId ? ` data-open-task-thread="${escapeHtml(group.sourceThreadId)}"` : "";
  const sharedBadge = sharedTopic ? `<span class="task-row-shared">${escapeHtml(group.sourceThreadTitle || "\u5171\u4eab\u5b66\u4e60\u8bdd\u9898")}</span>` : "";
  return `<article class="task-card task-card-collapsed task-swipe-row${sharedTopic ? " shared-topic-card" : ""}" data-task-swipe-card data-task-id="${escapeHtml(group.id)}">
    ${sharedTopic ? "" : `<button class="task-swipe-delete" type="button" data-delete-task="${escapeHtml(group.id)}" aria-label="Delete topic">&#21024;&#38500;</button>`}
    <div class="task-swipe-content" data-task-swipe-content>
      ${sharedTopic ? "" : `<div class="task-card-menu-wrap">
        <button class="task-card-menu-button" type="button" data-task-card-menu="${escapeHtml(group.id)}" aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
        <div class="task-card-menu" hidden>
          <button class="task-card-menu-item" type="button" data-rename-task="${escapeHtml(group.id)}">修改话题名</button>
        </div>
      </div>`}
      <button class="task-card-main" type="button" data-open-task="${escapeHtml(group.id)}"${sourceThreadAttr}>
        <span class="task-title-line">${escapeHtml(taskTitle(group) || "Untitled topic")}</span>
        <span class="task-row-meta">${escapeHtml(formatTime(group.updatedAt))}${sharedBadge}</span>
      </button>
      ${sharedTopic ? "" : `<div class="task-card-assets">
        <div class="task-docs${artifactChips ? "" : " empty"}" aria-label="Topic documents">
          ${artifactChips}
        </div>
        ${skillChips}
        ${renderTaskDirectoryBadges(group, { empty: true })}
      </div>`}
    </div>
  </article>`;
}

function messageTaskGroup(message) {
  if (!message?.taskGroupId || !state.currentThread) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === message.taskGroupId) || null;
}

function quotePreviewForMessage(message, group = null) {
  return compactDisplayText(message?.content || "", 92)
    || taskSummary(group)
    || taskTitle(group)
    || "Quoted topic";
}

function renderMessageQuoteAction(message) {
  if (!isSingleWindowView() || isSingleWindowChatView() || message?.role !== "assistant" || !message?.taskGroupId) return "";
  const taskId = messageTaskDisplayId(message);
  return `<button class="message-quote-button" type="button" data-quote-message="${escapeHtml(message.id)}" title="引用 ${escapeHtml(taskId)}">引用 ${escapeHtml(shortTaskDisplayId(taskId))}</button>`;
}

function canRevokeGroupMessage(message) {
  if (!isGroupChatView() || !message || message.revokedAt) return false;
  if (message.role !== "user" || message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (state.auth?.isOwner) return true;
  return Boolean(state.auth?.workspaceId && state.auth.workspaceId === message.senderWorkspaceId);
}

function renderMessageRevokeAction(message) {
  if (!canRevokeGroupMessage(message)) return "";
  return `<button class="message-revoke-button" type="button" data-revoke-message="${escapeHtml(message.id || "")}" title="${escapeHtml(GROUP_REVOKE_LABEL)}">${escapeHtml(GROUP_REVOKE_LABEL)}</button>`;
}

function renderExternalDeliveryStatus(message) {
  if (isWeixinChatView()) return "";
  const delivery = message?.externalDelivery || null;
  if (!delivery || delivery.source !== "weixin") return "";
  if (delivery.terminalStatus !== "manual_forward") return "";
  const status = String(delivery.status || "").toLowerCase();
  if (status !== "sent") return "";
  const label = {
    sent: "\u5fae\u4fe1\u5df2\u8f6c\u53d1",
  }[status] || "\u5fae\u4fe1\u8f6c\u53d1";
  const error = delivery.error ? `: ${delivery.error}` : "";
  return `<div class="external-delivery-status status-${escapeHtml(status || "unknown")}">${escapeHtml(label + error)}</div>`;
}

function messageUsesSenderLabel(message) {
  if (isGroupChatView()) return true;
  return Boolean(messageTaskGroup(message)?.sharedTopic);
}

function userMessageSenderLabel(message) {
  return message?.senderLabel
    || workspaceLabelById(message?.senderWorkspaceId || message?.actorWorkspaceId || "")
    || "You";
}

function renderMessage(message) {
  const revoked = Boolean(message.revokedAt);
  const useSenderLabel = messageUsesSenderLabel(message);
  const roleLabel = useSenderLabel && message.role === "user"
    ? userMessageSenderLabel(message)
    : (message.role === "user" ? "You" : "Hermes");
  const kindLabel = useSenderLabel && message.role === "user" && message.messageKind === "ai" ? " · AI" : "";
  const status = !revoked && message.status && message.status !== "done" ? ` - ${message.status}` : "";
  const timeLabel = messageDisplayTimeLabel(message);
  const usage = !revoked && message.usage ? renderUsage(message.usage, message) : "";
  const footer = renderMessageFooter(message, usage);
  const error = !revoked && message.error ? `<div class="error-box">${escapeHtml(message.error)}</div>` : "";
  const artifacts = !revoked && Array.isArray(message.artifacts) && message.artifacts.length ? renderArtifacts(message.artifacts) : "";
  const externalDelivery = !revoked ? renderExternalDeliveryStatus(message) : "";
  const searchClass = chatSearchClassForMessage(message);
  const body = revoked ? `<div class="message-revoked-text">${escapeHtml(GROUP_MESSAGE_REVOKED_TEXT)}</div>` : renderText(message.content || "", message);
  return `<article class="message ${escapeHtml(message.role || "assistant")}${searchClass}${revoked ? " revoked" : ""}" data-message-id="${escapeHtml(message.id || "")}">
    <div class="message-head">
      <div class="message-head-main-wrap">
        <span class="message-head-main">${escapeHtml(roleLabel)}${escapeHtml(kindLabel)}${escapeHtml(status)}</span>
      </div>
      <div class="message-head-actions">
        ${renderMessageQuoteAction(message)}
        ${renderMessageRevokeAction(message)}
        <span>${escapeHtml(timeLabel)}</span>
      </div>
    </div>
    <div class="message-body">${body}${error}${artifacts}${externalDelivery}${footer}</div>
  </article>`;
}

function wireQuoteButtons(root) {
  root?.querySelectorAll?.("[data-quote-message]").forEach((button) => {
    if (button.dataset.boundQuoteMessage) return;
    button.dataset.boundQuoteMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const message = (state.currentThread?.messages || []).find((item) => item.id === button.dataset.quoteMessage);
      setQuotedReply(message);
    });
  });
}

function wireMessageRevokeButtons(root) {
  root?.querySelectorAll?.("[data-revoke-message]").forEach((button) => {
    if (button.dataset.boundRevokeMessage) return;
    button.dataset.boundRevokeMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const messageId = String(button.dataset.revokeMessage || "");
      const threadId = state.currentThread?.id || "";
      if (!messageId || !threadId) return;
      if (!window.confirm("\u64a4\u56de\u8fd9\u6761\u7fa4\u804a\u6d88\u606f\uff1f")) return;
      button.disabled = true;
      try {
        const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/revoke`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (result?.thread) state.currentThread = mergeCurrentThread(result.thread);
        if (Array.isArray(result?.messages)) {
          for (const message of result.messages) upsertMessage(message);
        }
        renderCurrentThread({ stickToBottom: false });
      } catch (err) {
        showError(err.message || String(err));
      } finally {
        button.disabled = false;
      }
    });
  });
}

function setQuotedReply(message) {
  if (!isSingleWindowView() || isSingleWindowChatView() || !message?.taskGroupId) return;
  const group = messageTaskGroup(message);
  state.quotedReply = {
    taskGroupId: message.taskGroupId,
    messageId: message.id,
    label: messageTaskDisplayId(message),
    shortLabel: shortTaskDisplayId(messageTaskDisplayId(message)),
    preview: quotePreviewForMessage(message, group),
  };
  renderQuotedReply();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
  focusComposerSoon();
}

function clearQuotedReply(options = {}) {
  state.quotedReply = null;
  if (options.render !== false) {
    renderQuotedReply();
    configureComposer({ enabled: Boolean(state.currentThreadId), placeholder: "Message Hermes..." });
  }
}

function renderQuotedReply() {
  let panel = $("quotedReply");
  const composer = $("composer");
  const input = $("messageInput");
  if (!panel && composer && input) {
    panel = document.createElement("div");
    panel.id = "quotedReply";
    panel.className = "quoted-reply hidden";
    composer.insertBefore(panel, input);
  }
  if (!panel) return;
  const quote = isSingleWindowView() && !isSingleWindowChatView() ? state.quotedReply : null;
  if (!quote) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    delete panel.dataset.messageId;
    delete panel.dataset.taskGroupId;
    return;
  }
  panel.classList.remove("hidden");
  panel.dataset.messageId = quote.messageId || "";
  panel.dataset.taskGroupId = quote.taskGroupId || "";
  panel.innerHTML = `
    <div class="quoted-reply-text" title="Topic ID: ${escapeHtml(quote.label || "topic")}">
      <strong>Topic ID: ${escapeHtml(quote.shortLabel || shortTaskDisplayId(quote.label) || "topic")}</strong>
      <span>${escapeHtml(quote.preview || "")}</span>
    </div>
    <button class="quoted-reply-clear" type="button" aria-label="Clear quoted reply">×</button>
  `;
  panel.querySelector(".quoted-reply-clear")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearQuotedReply();
  });
}

function activeQuotedReplyForSend() {
  if (isSingleWindowChatView()) return null;
  const quote = state.viewMode === "single" ? state.quotedReply : null;
  if (!quote?.taskGroupId || !quote?.messageId) return null;
  const panel = $("quotedReply");
  if (!panel || panel.classList.contains("hidden")) return null;
  if (panel.dataset.messageId !== quote.messageId) return null;
  if (panel.dataset.taskGroupId !== quote.taskGroupId) return null;
  return quote;
}

function renderText(text, message = {}) {
  const directoryAliases = extractDirectoryAliases(text || "");
  const cleaned = cleanDisplayText(rewriteDirectoryPathsForDisplay(directoryAliases.text));
  const aliases = renderDirectoryAliases(directoryAliases.aliases, message);
  if (message?.role === "assistant") {
    return `<div class="text-content message-prose">${aliases}${renderRichText(cleaned)}</div>`;
  }
  return `<div class="text-content plain-text">${aliases}${escapeHtml(cleaned)}</div>`;
}

function cleanDisplayText(value) {
  return String(value || "")
    .split(/\n/)
    .filter((line) => !/^\s*MEDIA:\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function renderTable(lines) {
  const rows = lines
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()))
    .filter((row) => row.length > 1);
  if (!rows.length) return "";
  const isSeparator = (row) => row.every((cell) => /^:?-{3,}:?$/.test(cell));
  const hasHeader = rows.length > 1 && isSeparator(rows[1]);
  const header = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(2) : rows;
  const headerHtml = header.length ? `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>` : "";
  const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<div class="prose-table-wrap"><table>${headerHtml}${bodyHtml}</table></div>`;
}

function renderRichText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let tableLines = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    out.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listType = "";
    listItems = [];
  };
  const flushTable = () => {
    if (!tableLines.length) return;
    out.push(renderTable(tableLines));
    tableLines = [];
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushBlocks();
      out.push("<hr>");
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      out.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (codeLines) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushBlocks();
  return out.join("") || "";
}

function extractDirectoryAliases(text) {
  const aliases = [];
  const lines = String(text || "").split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)(?:[-*]\s*)?目录别名\s*[:：]\s*(.*)$/);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const prefix = match[1].trim();
    const tail = match[2] || "";
    const hasPath = tail.includes("=");
    const endIndex = hasPath ? tail.indexOf("。") : -1;
    const aliasBlock = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
    const remainder = endIndex >= 0 ? tail.slice(endIndex + 1).trimStart() : "";
    aliases.push(...parseDirectoryAliasEntries(aliasBlock));
    const restored = [prefix, remainder].filter(Boolean).join(" ");
    if (restored) cleaned.push(restored);
  }
  return { text: cleaned.join("\n").replace(/^\s+/, ""), aliases };
}

function parentDirectoryFromFilePath(pathText) {
  const value = String(pathText || "").trim().replace(/^`+|`+$/g, "");
  if (!value) return "";
  return value.replace(/[\\/][^\\/]+$/g, "");
}

function extractMediaDirectoryAliases(text, messageId = "") {
  const aliases = [];
  const mediaPattern = /^MEDIA:\s*(`?)(.+?)\1\s*$/gm;
  let match = null;
  while ((match = mediaPattern.exec(String(text || "")))) {
    const mediaPath = String(match[2] || "").trim();
    const directoryPath = parentDirectoryFromFilePath(mediaPath);
    if (!directoryPath) continue;
    aliases.push({
      messageId,
      label: "\u4ea4\u4ed8\u76ee\u5f55",
      path: directoryPath,
      source: "reference",
      referenceKind: "delivery",
    });
  }
  return aliases;
}

function parseDirectoryAliasEntries(block) {
  const blockHasExplicitPath = String(block || "").includes("=");
  return String(block || "")
    .split(/[;；]/)
    .map((entry) => {
      const [rawLabel, ...pathParts] = entry.split("=");
      const label = cleanDirectoryAliasLabel(rawLabel);
      const rawPath = pathParts.join("=").trim();
      const pathValue = rawPath.replace(/^`+|`+$/g, "").replace(/[。.,，]+$/g, "").trim();
      return { label, path: pathValue };
    })
    .filter((entry) => entry.label && (!blockHasExplicitPath || entry.path) && !isSkillLibraryAliasEntry(entry) && !/主交付|交付目录|交付文件|同步根|delivery|sync\s*root/i.test(entry.label));
}

function cleanDirectoryAliasLabel(value) {
  return String(value || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function isSkillLibraryAliasEntry(entry) {
  const label = directoryAliasKey(entry?.label || "");
  const pathValue = comparableDirectoryPath(entry?.path || "");
  return pathValue.includes(".hermes/skills") || label.includes("\u6280\u80fd\u5e93") || label.includes("skilllibrary");
}

function shortDirectoryAliasLabel(label) {
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(label || "").trim();
}

function directoryAliasKey(value) {
  return String(value || "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function comparableDirectoryPath(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function configuredOwnerDriveRootNames() {
  const names = Array.isArray(state.displayConfig?.ownerDriveRootNames)
    ? state.displayConfig.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return names.length ? names : ["ChatGPT-Drive"];
}

function ownerDriveRootIndexForParts(parts) {
  const names = new Set(configuredOwnerDriveRootNames().map((item) => item.toLowerCase()));
  return (parts || []).findIndex((part) => names.has(String(part || "").toLowerCase()));
}

function pathContainsOwnerDriveRoot(rawPath) {
  const parts = String(rawPath || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  return ownerDriveRootIndexForParts(parts) >= 0;
}

function pathMatchesDirectoryRoot(candidatePath, rootPath) {
  const candidate = comparableDirectoryPath(candidatePath);
  const root = comparableDirectoryPath(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function relativeDisplayTailForDirectory(rawPath, rootPath) {
  const raw = String(rawPath || "").trim().replaceAll("\\", "/");
  const root = String(rootPath || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  const comparableRaw = comparableDirectoryPath(rawPath);
  const comparableRoot = comparableDirectoryPath(rootPath);
  if (comparableRaw && comparableRoot && comparableRaw.startsWith(`${comparableRoot}/`)) {
    return comparableRaw.slice(comparableRoot.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function logicalUserPathFallback(rawPath, fallbackLabel = "") {
  const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
  const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
  if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
  const documentsIndex = lowerParts.findIndex((part) => part === "documents");
  const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
  if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
  if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
  const usersIndex = lowerParts.findIndex((part) => part === "users");
  if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["用户目录", ...parts.slice(usersIndex + 2)].join(" / ");
  return fallbackLabel || parts[parts.length - 1] || "";
}

function projectLabelCandidates(project, parentLabel = "") {
  const labels = [
    project?.label,
    ...(project?.aliases || []),
  ].filter(Boolean);
  if (parentLabel && project?.label) labels.push(`${parentLabel} / ${project.label}`);
  const expanded = [];
  for (const label of labels) {
    expanded.push(label, shortDirectoryAliasLabel(label));
  }
  return expanded.filter(Boolean);
}

function directoryProjectCandidates() {
  const candidates = [];
  for (const project of state.projects || []) {
    if (!project || project.hidden) continue;
    candidates.push({
      projectId: project.id,
      subprojectId: "",
      label: project.label || project.id,
      root: project.root || "",
      labels: projectLabelCandidates(project),
    });
    for (const child of project.children || []) {
      candidates.push({
        projectId: project.id,
        subprojectId: child.id,
        label: child.label || child.id,
        root: child.root || "",
        labels: projectLabelCandidates(child, project.label || ""),
      });
    }
  }
  return candidates;
}

function directoryRouteDisplayPath(route, fallbackLabel = "") {
  const project = (state.projects || []).find((item) => item.id === route?.projectId);
  const child = route?.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
  const projectLabel = project ? projectDisplayLabel(project) : (route?.label || fallbackLabel || "");
  if (child) return `${projectLabel} / ${child.label || child.id || route.label || fallbackLabel}`;
  return projectLabel || route?.label || fallbackLabel || "";
}

function logicalDirectoryDisplayPath(rawPath, fallbackLabel = "") {
  const value = String(rawPath || "").trim();
  if (!value) return fallbackLabel || "";
  const matches = directoryProjectCandidates()
    .filter((candidate) => candidate.root && pathMatchesDirectoryRoot(value, candidate.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  if (matches.length) {
    const route = matches[0];
    const base = directoryRouteDisplayPath(route, route.label || fallbackLabel);
    const tail = relativeDisplayTailForDirectory(value, route.root);
    return [base, tail].filter(Boolean).join(" / ");
  }
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(value, workspace.defaultWorkspace)) {
    const tail = relativeDisplayTailForDirectory(value, workspace.defaultWorkspace);
    return [workspace.label || "工作区", tail].filter(Boolean).join(" / ");
  }
  return logicalUserPathFallback(value, fallbackLabel);
}

function rewriteDirectoryPathsForDisplay(text) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\[^\\\s]+\\|\/\/wsl(?:\.localhost|\$)?\/[^/\s]+\/)[^\s`<>"']+/gi;
  return String(text || "").replace(pathPattern, (match) => {
    const suffixMatch = match.match(/[)\].,;:，。；、）】》]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const core = suffix ? match.slice(0, -suffix.length) : match;
    const logical = logicalDirectoryDisplayPath(core);
    return logical ? `${logical}${suffix}` : match;
  });
}

function isGenericDefaultDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "默认目录",
    "默认资料根",
    "资料根",
    "资料根目录",
    "defaultdirectory",
    "defaultdataroot",
  ].includes(label);
}

function isOperationalTaskDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  return Boolean(
    (label.includes("agent") && (label.includes("workspace") || label.includes("工作区")))
    || label.includes("hermesweb")
    || pathValue.includes("/documents/agent")
    || pathValue.includes("/documents/hermes-mobile-source")
    || pathValue.includes("/programdata/hermesmobile/app")
    || pathValue.includes("/workspace/hermes-web")
    || pathValue.includes("/tools/cli/hermes-web")
  );
}

function isGenericCurrentBoundDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "\u5f53\u524d\u7ed1\u5b9a\u76ee\u5f55",
    "\u5f53\u524d\u7ed1\u5b9a\u5de5\u4f5c\u533a",
    "\u7ed1\u5b9a\u76ee\u5f55",
    "\u4efb\u52a1\u7ed1\u5b9a\u76ee\u5f55",
    "\u672c\u4efb\u52a1\u76ee\u5f55",
    "currentbounddirectory",
    "bounddirectory",
    "attacheddirectory",
    "currentdirectory",
  ].includes(label);
}

function explicitDirectoryRouteForContext(context = null) {
  const aliases = [];
  const isChatContext = isSingleWindowConversationTaskGroupId(context?.taskGroupId);
  if (!isChatContext && context?.taskGroupId && state.currentThread) {
    const group = taskGroupsForThread(state.currentThread).find((item) => item.id === context.taskGroupId);
    if (group) aliases.push(...explicitTaskDirectoryAliases(group));
  }
  aliases.push(...messageDirectoryAliases(context));
  for (const alias of aliases) {
    if (isGenericDefaultDirectoryAlias(alias) || isGenericCurrentBoundDirectoryAlias(alias) || isDeliveryDirectoryAlias(alias)) continue;
    const route = resolveDirectoryProjectRoute(alias);
    if (route) return route;
  }
  return null;
}

function messageTaskSearchText(message) {
  const group = isSingleWindowConversationTaskGroupId(message?.taskGroupId) ? null : messageTaskGroup(message);
  return [message?.content || "", ...(group?.messages || []).map((item) => item.content || "")]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function semanticDirectoryRouteForMessage(message) {
  const text = messageTaskSearchText(message);
  if (!text) return null;
  const matches = [];
  for (const candidate of directoryProjectCandidates()) {
    for (const label of candidate.labels || []) {
      const key = directoryAliasKey(label);
      if (key.length >= 2 && text.includes(key)) {
        matches.push({
          candidate,
          score: key.length * 100 + comparableDirectoryPath(candidate.root).length,
        });
      }
    }
  }
  if (!matches.length) return null;
  return matches.sort((a, b) => b.score - a.score)[0].candidate;
}

function resolveDirectoryProjectRoute(alias) {
  const aliasLabel = directoryAliasKey(alias?.label);
  const aliasPath = alias?.path || "";
  const candidates = directoryProjectCandidates();
  const requestedProjectId = String(alias?.projectId || "").trim();
  const requestedSubprojectId = String(alias?.subprojectId || "").trim();
  if (requestedProjectId) {
    const exactProject = candidates.find((candidate) =>
      candidate.projectId === requestedProjectId && String(candidate.subprojectId || "") === requestedSubprojectId);
    if (exactProject) return exactProject;
    if (!requestedSubprojectId) {
      const rootProject = candidates.find((candidate) =>
        candidate.projectId === requestedProjectId && !candidate.subprojectId);
      if (rootProject) return rootProject;
    }
    const projectMatches = candidates
      .filter((candidate) => candidate.projectId === requestedProjectId && (!requestedSubprojectId || candidate.subprojectId === requestedSubprojectId))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
    if (projectMatches.length) return projectMatches[0];
  }
  const pathMatches = aliasPath
    ? candidates
      .filter((candidate) => pathMatchesDirectoryRoot(aliasPath, candidate.root))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)
    : [];
  if (pathMatches.length) return pathMatches[0];

  if (!aliasLabel) return null;
  const exact = candidates.filter((candidate) =>
    candidate.labels.some((label) => directoryAliasKey(label) === aliasLabel));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0];
  }
  return null;
}

function isGenericOwnerTopicRoute(route) {
  const projectId = String(route?.projectId || "");
  return GENERIC_OWNER_TOPIC_ROUTE_IDS.has(projectId)
    || GENERIC_OWNER_TOPIC_ROUTE_PREFIXES.some((prefix) => projectId.startsWith(prefix));
}

function isContextAnchorDirectoryRoute(route) {
  if (!route?.root) return false;
  if (route.subprojectId) return false;
  if (route.projectId === "single-window") return false;
  if (isGenericOwnerTopicRoute(route)) return false;
  return true;
}

function coalesceDirectoryAliasItems(items) {
  const anchors = (items || []).filter((item) => isContextAnchorDirectoryRoute(item.route));
  if (!anchors.length) return items || [];
  return (items || []).filter((item) => {
    if (!isGenericOwnerTopicRoute(item.route)) return true;
    return anchors.some((anchor) => pathMatchesDirectoryRoot(item.route.root, anchor.route.root));
  });
}

function uniqueDirectoryAliasItems(items) {
  const unique = new Map();
  for (const item of items || []) {
    const route = item.route || {};
    const displayAlias = item.displayAlias || {};
    const key = route.projectId
      ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
      : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function renderDirectoryAliases(aliases, message, options = {}) {
  const items = directoryAliasItemsForAliases(aliases, message, { coalesce: options.reference ? false : undefined });
  if (!items.length) return "";
  return `<div class="directory-aliases">${items.map(({ displayAlias, route }) => {
    let directoryPath = displayAlias.path || route?.root || "";
    if (route?.root && directoryPath && !pathMatchesDirectoryRoot(directoryPath, route.root)) directoryPath = route.root;
    const reference = Boolean(options.reference || displayAlias.referenceKind || displayAlias.source === "reference");
    const chipClass = `directory-alias-chip${reference ? " directory-alias-chip-reference" : ""}`;
    if (route) {
      const pathIsNested = Boolean(
        route.root
        && directoryPath
        && pathMatchesDirectoryRoot(directoryPath, route.root)
        && comparableDirectoryPath(directoryPath) !== comparableDirectoryPath(route.root)
      );
      const baseLabel = pathIsNested && displayAlias.label
        ? displayAlias.label
        : (reference || pathIsNested
        ? logicalDirectoryDisplayPath(directoryPath, route.label || displayAlias.label)
        : directoryRouteDisplayPath(route, route.label || displayAlias.label));
      const label = reference ? `\u4ea4\u4ed8 \u00b7 ${baseLabel}` : baseLabel;
      return `<span class="${chipClass} directory-alias-chip-mapped" title="${escapeHtml(label)}">
        <button class="directory-alias-open" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}" aria-label="打开目录管理">
          <span class="directory-alias-icon">DIR</span>
        </button>
        <button class="directory-alias-project" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}">
          ${escapeHtml(label)}
        </button>
      </span>`;
    }
    const fallbackLabel = reference ? `\u4ea4\u4ed8 \u00b7 ${shortDirectoryAliasLabel(displayAlias.label)}` : shortDirectoryAliasLabel(displayAlias.label);
    return `<button class="${chipClass}" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(displayAlias.label || "")}">
      <span class="directory-alias-icon">DIR</span>
      <span>${escapeHtml(fallbackLabel)}</span>
    </button>`;
  }).join("")}</div>`;
}

async function openDirectoryProjectRoute(projectId, subprojectId = "", pathText = "") {
  if (!projectId) return;
  if (!state.projects.some((project) => project.id === projectId)) return;
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.selectedProjectId = projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const project = currentProject();
  const hasSubproject = Boolean(subprojectId && (project?.children || []).some((item) => item.id === subprojectId));
  state.selectedSubprojectId = hasSubproject ? subprojectId : "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
  renderSubprojects();
  const directoryTarget = currentDirectoryTarget();
  const directoryRoot = project?.root || directoryTarget?.root || "";
  const requestedPath = String(pathText || "").trim();
  const targetPath = requestedPath && (!directoryRoot || pathMatchesDirectoryRoot(requestedPath, directoryRoot))
    ? requestedPath
    : (directoryTarget?.root || directoryRoot);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, directoryRoot || targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

async function openDirectoryPathInManager(pathText, label = "") {
  const targetPath = String(pathText || "").trim();
  if (!targetPath) throw new Error("No directory path is available.");
  const route = resolveDirectoryProjectRoute({ label, path: targetPath });
  if (route?.projectId) {
    await openDirectoryProjectRoute(route.projectId, route.subprojectId || "", targetPath);
    return;
  }
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  syncDirectoryRouteFromPath(targetPath);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

function wireDirectoryProjectLinks(root) {
  root?.querySelectorAll?.("[data-directory-project]").forEach((button) => {
    if (button.dataset.boundDirectoryProject) return;
    button.dataset.boundDirectoryProject = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryProjectRoute(
        button.dataset.projectId,
        button.dataset.subprojectId || "",
        button.dataset.directoryPath || ""
      ).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-directory-path-open]").forEach((button) => {
    if (button.dataset.boundDirectoryPathOpen) return;
    button.dataset.boundDirectoryPathOpen = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryPathInManager(button.dataset.directoryPath || "", button.dataset.directoryLabel || "").catch(showError);
    });
  });
}

function renderArtifacts(artifacts) {
  return `<div class="artifacts">${displayArtifacts(artifacts).map((artifact) => `<div class="artifact-row">
    <a class="artifact-card doc-${escapeHtml(artifactKind(artifact))}" href="${escapeHtml(artifactHref(artifact))}" target="_blank" rel="noopener" data-task-doc>
      <div class="artifact-icon">${escapeHtml(iconForArtifact(artifact))}</div>
      <div>
        <div class="artifact-name">${escapeHtml(artifactDisplayName(artifact))}</div>
        <div class="artifact-meta">${escapeHtml(`${artifact.mime || "file"} | ${formatBytes(artifact.size)}`)}</div>
      </div>
    </a>
    ${renderArtifactDirectoryButton(artifact)}
    ${renderArtifactWeixinButton(artifact)}
  </div>`).join("")}</div>`;
}

function iconForArtifact(artifact) {
  const kind = artifactKind(artifact);
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "DOC";
  if (kind === "markdown") return "MD";
  if (kind === "html") return "HTML";
  if (kind === "text") return "TXT";
  return iconForMime(artifact?.mime);
}

function iconForMime(mime) {
  if (/pdf/i.test(mime || "")) return "PDF";
  if (/image/i.test(mime || "")) return "IMG";
  if (/video/i.test(mime || "")) return "VID";
  if (/audio/i.test(mime || "")) return "AUD";
  return "FILE";
}

function uniqueUsageLabels(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeUsageModelCalls(usage = {}) {
  const rows = [
    usage.api_call_model_routes,
    usage.api_call_models,
    usage.apiCallModelRoutes,
  ].find(Array.isArray) || [];
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      model: String(item.model || item.model_name || item.response_model || "").trim(),
      reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || item.effort || "").trim(),
    }));
}

function usageModelLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.model
    || usage.model_name
    || usage.response_model
    || message.model
    || message.modelName
    || "",
  ).trim();
  const models = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.model),
    ...modelRows.map((item) => item.model),
  ]);
  return models.length ? models.join(", ") : (state.defaultModel || state.assistantLabel || "");
}

function usageReasoningLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.reasoning_effort
    || usage.reasoningEffort
    || usage.reasoning
    || message.reasoningEffort
    || message.reasoning_effort
    || "",
  ).trim();
  const efforts = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.reasoningEffort),
    ...modelRows.map((item) => item.reasoningEffort),
  ]);
  const labels = efforts.length ? efforts : [state.defaultReasoningEffort || "medium"];
  return labels.map((item) => reasoningEffortLabel(item)).join(", ");
}

function renderUsage(usage, message = {}) {
  const normalized = normalizeUsage(usage);
  const total = normalized.total || 0;
  if (!total) return "";
  const apiCallRows = normalizeUsageApiCalls(usage);
  const explicitApiCallCount = numericUsageValue(usage.api_calls, usage.api_call_count);
  const apiCallCount = explicitApiCallCount !== null
    ? explicitApiCallCount
    : (apiCallRows.length ? apiCallRows.length : null);
  const apiCost = normalizeUsageCost(usage);
  const rows = [
    ["Model", usageModelLabel(usage, message, apiCallRows)],
    ["Reasoning", usageReasoningLabel(usage, message, apiCallRows)],
    normalized.uncachedInput !== null ? ["Uncached input", normalized.uncachedInput] : null,
    ["Cached input", normalized.cachedInput !== null ? normalized.cachedInput : "Not reported"],
    ["Input total", normalized.input],
    ["Output", normalized.output],
    ["Reasoning output", normalized.reasoningOutput],
    ["API calls", apiCallCount !== null ? apiCallCount : "Not reported"],
    apiCost !== null ? ["API cost", apiCost] : null,
    ["Total", normalized.total],
  ].filter((row) => row && row[1] !== null && row[1] !== undefined);
  const detailRows = rows.map(([label, value]) => `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${formatUsageValue(value)}</strong></div>`).join("");
  const apiDetails = apiCallRows.length ? `<div class="usage-api-calls">
    <div class="usage-api-title">API calls</div>
    ${apiCallRows.map((call, index) => `<div class="usage-api-row">
      <div class="usage-api-main">#${index + 1} ${escapeHtml([call.model, call.reasoningEffort].filter(Boolean).join(" / ") || "API call")}</div>
      <div class="usage-api-meta">
        <span>in ${formatTokenCount(call.input)}</span>
        <span>cached ${formatTokenCount(call.cachedInput)}</span>
        <span>out ${formatTokenCount(call.output)}</span>
        <span>total ${formatTokenCount(call.total)}</span>
      </div>
    </div>`).join("")}
  </div>` : "";
  return `<details class="usage" title="Usage: ${formatTokenCount(total)} tokens"><summary aria-label="Usage: ${formatTokenCount(total)} tokens">Usage</summary><div class="usage-details">${detailRows}${apiDetails}</div></details>`;
}

function numericUsageValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeUsage(usage = {}) {
  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};
  const input = numericUsageValue(usage.input_tokens, usage.prompt_tokens, usage.input, usage.prompt);
  const output = numericUsageValue(usage.output_tokens, usage.completion_tokens, usage.output, usage.completion);
  const total = numericUsageValue(usage.total_tokens, usage.total, (input || 0) + (output || 0));
  const explicitCachedInput = numericUsageValue(
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_read_tokens,
    usage.cached_tokens,
    inputDetails.cached_tokens,
    inputDetails.cache_read_tokens,
  );
  const cacheWriteInput = numericUsageValue(
    usage.cache_write_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_creation_tokens,
    inputDetails.cache_write_tokens,
    inputDetails.cache_creation_tokens,
  ) || 0;
  const reasoningOutput = numericUsageValue(usage.reasoning_tokens, outputDetails.reasoning_tokens);
  const cachedRemainder = total !== null
    ? Math.max(0, total - (input || 0) - (output || 0) - (reasoningOutput || 0) - cacheWriteInput)
    : 0;
  const shouldInferCachedInput = explicitCachedInput === null
    ? cachedRemainder > 0
    : (explicitCachedInput === 0 && cachedRemainder > 0);
  const inferredCachedInput = shouldInferCachedInput ? cachedRemainder : 0;
  const cachedInput = shouldInferCachedInput ? inferredCachedInput : explicitCachedInput;
  const explicitUncached = numericUsageValue(
    usage.uncached_input_tokens,
    usage.input_tokens_uncached,
    usage.uncached_tokens,
    inputDetails.uncached_tokens,
  );
  const inputIncludesCached = !shouldInferCachedInput && explicitCachedInput !== null && input !== null && input >= cachedInput;
  const uncachedInput = explicitUncached !== null
    ? explicitUncached
    : (cachedInput !== null && input !== null ? Math.max(0, inputIncludesCached ? input - cachedInput : input) : null);
  const inputTotal = explicitUncached !== null
    ? explicitUncached + cachedInput
    : (inputIncludesCached ? input : ((input || 0) + (cachedInput || 0)));
  return {
    input: inputTotal,
    output,
    total,
    cachedInput,
    uncachedInput,
    reasoningOutput,
  };
}

function normalizeUsageApiCalls(usage = {}) {
  const rows = [
    usage.api_call_usage_routes,
    usage.api_call_usage,
    usage.api_calls_detail,
    usage.apiCalls,
  ].find(Array.isArray) || [];
  const modelRows = normalizeUsageModelCalls(usage);
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const modelRow = modelRows[index] || {};
      const input = numericUsageValue(item.input_tokens, item.prompt_tokens, item.input, item.prompt) || 0;
      const cachedInput = numericUsageValue(
        item.cache_read_tokens,
        item.cached_input_tokens,
        item.cache_read_input_tokens,
        item.cached_tokens,
      ) || 0;
      const output = numericUsageValue(item.output_tokens, item.completion_tokens, item.output, item.completion) || 0;
      return {
        model: String(item.model || item.model_name || modelRow.model || "").trim(),
        reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || modelRow.reasoningEffort || "").trim(),
        input,
        cachedInput,
        output,
        total: numericUsageValue(item.total_tokens, item.total, input + cachedInput + output) || 0,
      };
    });
}

function normalizeUsageCost(usage = {}) {
  const status = String(usage.cost_status || usage.billing_status || "").trim().toLowerCase();
  const mode = String(usage.billing_mode || "").trim().toLowerCase();
  const actual = numericCostValue(usage.actual_cost_usd, usage.api_cost_usd, usage.cost_usd);
  const estimated = numericCostValue(usage.estimated_cost_usd, usage.estimated_api_cost_usd);
  const cost = actual !== null ? actual : estimated;
  if (status === "included" || mode === "subscription_included") return "Included";
  if (cost === null) return null;
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function numericCostValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatUsageValue(value) {
  if (typeof value === "string") return escapeHtml(value);
  return formatTokenCount(value);
}

function scheduleRenderCurrentThread() {
  if (state.renderScheduled) return;
  const conversation = $("conversation");
  state.shouldStickToBottom = isNearBottom();
  state.preservedBottomOffset = conversation.scrollHeight - conversation.scrollTop;
  state.renderScheduled = true;
  requestAnimationFrame(() => {
    state.renderScheduled = false;
    renderCurrentThread({ stickToBottom: state.shouldStickToBottom });
  });
}

function renderStreamingMessageContent(message) {
  if (!message?.id || message.role !== "assistant") return false;
  if (isChatSearchMode() && currentChatSearchQuery()) return false;
  const article = messageElementById(message.id);
  const body = article?.querySelector?.(".message-body");
  const content = body?.querySelector?.(".text-content");
  if (!article || !body || !content || message.revokedAt) return false;
  const shouldStick = isNearBottom();
  content.outerHTML = renderText(message.content || "", message);
  if (shouldStick) {
    const conversation = $("conversation");
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
  } else {
    state.conversationPinnedToBottom = false;
  }
  scheduleMessageScrollButtonVisibility($("conversation"));
  return true;
}

function scheduleStreamingMessageRender(message) {
  if (!message?.id) return false;
  const id = String(message.id);
  if (state.streamingMessageRenderScheduled.has(id)) return true;
  state.streamingMessageRenderScheduled.add(id);
  requestAnimationFrame(() => {
    state.streamingMessageRenderScheduled.delete(id);
    if (!renderStreamingMessageContent(message)) scheduleRenderCurrentThread();
  });
  return true;
}

function threadMatchesSelection(thread) {
  if (!thread) return false;
  if (
    state.selectedWorkspaceId
    && thread.workspaceId !== state.selectedWorkspaceId
    && !threadGroupMemberIds(thread).includes(state.selectedWorkspaceId)
  ) return false;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (!thread.singleWindow) return false;
    const search = currentSearchText().toLowerCase();
    if (state.viewMode === "tasks" && state.currentThread?.id === thread.id) {
      return taskListGroupsForThread(state.currentThread).some((group) => {
        if (!taskMatchesDirectoryFilter(group)) return false;
        if (!search) return true;
        return `${taskDisplayId(group)}\n${taskPrompt(group)}\n${taskSummary(group)}`.toLowerCase().includes(search);
      });
    }
    if (!search) return true;
    return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
  }
  if (state.selectedProjectId && thread.projectId !== state.selectedProjectId) return false;
  if (state.selectedSubprojectId && (thread.subprojectId || "") !== state.selectedSubprojectId) return false;
  const search = currentSearchText().toLowerCase();
  if (!search) return true;
  return `${thread.title || ""}\n${thread.preview || ""}`.toLowerCase().includes(search);
}

function upsertThreadSummary(thread) {
  if (!thread) return;
  const index = state.threads.findIndex((item) => item.id === thread.id);
  if (!threadMatchesSelection(thread)) {
    if (index >= 0) state.threads.splice(index, 1);
    renderThreads();
    return;
  }
  if (index >= 0) state.threads[index] = Object.assign({}, state.threads[index], thread);
  else state.threads.unshift(thread);
  state.threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  renderThreads();
}

function upsertMessage(message) {
  if (!state.currentThread || !message) return;
  const messages = state.currentThread.messages || [];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
  else messages.push(message);
  state.currentThread.messages = messages;
  if (state.viewMode === "tasks" && state.currentThread?.singleWindow && !currentTaskThreadIsSharedTopicThread()) {
    rememberTaskListThread(state.currentThread);
  }
  const mergedMessage = index >= 0 ? messages[index] : message;
  offerOwnerElevationForMessage(mergedMessage).catch(showError);
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function upsertCachedChatScopeMessage(threadId, message, threadSummary = null) {
  if (!threadId || !message) return false;
  let touched = false;
  const update = (thread) => {
    const messages = thread.messages || [];
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0) messages[index] = mergeServerMessage(messages[index], message);
    else messages.push(message);
    touched = true;
    return Object.assign({}, thread, threadSummary || {}, {
      messages: sortedThreadMessages(messages),
      updatedAt: threadSummary?.updatedAt || message.updatedAt || thread.updatedAt,
    });
  };
  if (state.groupChatThread?.id === threadId) {
    state.groupChatThread = update(state.groupChatThread);
    state.groupChatAvailable = true;
    state.groupChatThreadId = state.groupChatThread.id;
  }
  if (state.weixinChatThread?.id === threadId) {
    state.weixinChatThread = update(state.weixinChatThread);
    state.weixinChatAvailable = true;
    state.weixinChatThreadId = state.weixinChatThread.id;
  }
  if (state.privateChatThread?.id === threadId) {
    state.privateChatThread = update(state.privateChatThread);
  }
  if (touched && isSingleWindowChatView()) renderChatScopeHeader(state.currentThread);
  return touched;
}

function currentThreadHasPendingMessages(thread = state.currentThread) {
  return Boolean(
    thread
    && (
      activeThreadRunIds(thread).length
      || (thread.messages || []).some((message) => (
        message?.role === "assistant"
        && ["queued", "running"].includes(String(message.status || ""))
      ))
    )
  );
}

function summaryHasActiveRun(summary) {
  return Boolean(
    (Array.isArray(summary?.activeRunIds) && summary.activeRunIds.length)
    || summary?.activeRunId
    || ["queued", "running"].includes(String(summary?.status || ""))
  );
}

function shouldRefreshCurrentThreadForSummary(summary) {
  if (!summary || !state.currentThread || summary.id !== state.currentThread.id) return false;
  const summaryUpdated = String(summary.updatedAt || "");
  const currentUpdated = String(state.currentThread.updatedAt || "");
  if (summaryUpdated && currentUpdated && summaryUpdated > currentUpdated) return true;
  return currentThreadHasPendingMessages() && !summaryHasActiveRun(summary);
}

async function refreshCurrentThreadFromServer(options = {}) {
  const threadId = state.currentThreadId || state.currentThread?.id || "";
  if (!threadId || !["single", "tasks"].includes(state.viewMode)) return;
  if (state.currentThreadRefreshInFlight) {
    state.currentThreadRefreshPending = true;
    return;
  }
  state.currentThreadRefreshInFlight = true;
  state.currentThreadRefreshPending = false;
  const stickToBottom = Object.prototype.hasOwnProperty.call(options, "stickToBottom")
    ? Boolean(options.stickToBottom)
    : isNearBottom();
  try {
    const params = isSingleWindowChatView()
      ? `?${chatMessagePageParams({ limit: CHAT_MESSAGE_INITIAL_LIMIT })}`
      : isTaskWindowView()
        ? `?messageMode=tasks&messageLimit=${TASK_MESSAGE_INITIAL_LIMIT}`
      : "";
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}${params}`);
    if ((state.currentThreadId || state.currentThread?.id || "") !== threadId) return;
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || threadId;
    upsertThreadSummary(summarizeThread(state.currentThread));
    renderCurrentThread({ stickToBottom });
  } catch (err) {
    if (options.reportError) showError(err);
  } finally {
    state.currentThreadRefreshInFlight = false;
    if (state.currentThreadRefreshPending) {
      state.currentThreadRefreshPending = false;
      requestCurrentThreadRefresh(Object.assign({}, options, { delayMs: 180 }));
    }
  }
}

function requestCurrentThreadRefresh(options = {}) {
  if (!state.currentThreadId || !["single", "tasks"].includes(state.viewMode)) return;
  window.clearTimeout(state.currentThreadRefreshTimer);
  const delayMs = Math.max(0, Number(options.delayMs || 120));
  state.currentThreadRefreshTimer = window.setTimeout(() => {
    state.currentThreadRefreshTimer = 0;
    refreshCurrentThreadFromServer(options).catch(() => {});
  }, delayMs);
}

function appendDelta(threadId, messageId, delta, payload = {}) {
  if (!state.currentThread || state.currentThread.id !== threadId) return;
  const message = (state.currentThread.messages || []).find((item) => item.id === messageId);
  if (!message) return;
  const updatedAt = payload.updatedAt || new Date().toISOString();
  message.content = `${message.content || ""}${delta || ""}`;
  if (!message.firstFeedbackAt) message.firstFeedbackAt = payload.firstFeedbackAt || updatedAt;
  message.updatedAt = updatedAt;
  if (!scheduleStreamingMessageRender(message)) scheduleRenderCurrentThread();
}

function applyEvent(payload) {
  if (!payload || !payload.type) return;
  if (payload.clientVersion) handleClientVersion(payload.clientVersion, payload.type);
  if (payload.type === "client.version") return;
  if (payload.type === "todos.updated") {
    if (state.viewMode === "todos" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadTodos().catch(showError);
    }
    return;
  }
  if (payload.type === "learning-coins.updated") {
    if (state.viewMode === "learning" && (!payload.workspaceId || payload.workspaceId === state.selectedWorkspaceId)) {
      loadLearningCoins({ limit: 30 }).catch(showError);
    }
    return;
  }
  if (payload.type === "snapshot") {
    const drafts = state.threads.filter(isDraftThread).filter(threadMatchesSelection);
    const incoming = (payload.threads || state.threads).filter(threadMatchesSelection);
    const currentSummary = incoming.find((thread) => thread.id === state.currentThreadId);
    state.threads = [
      ...drafts,
      ...incoming.filter((thread) => !drafts.some((draft) => draft.id === thread.id)),
    ];
    renderThreads();
    if (shouldRefreshCurrentThreadForSummary(currentSummary)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 80 });
    }
    return;
  }
  if (payload.thread) upsertThreadSummary(payload.thread);
  if (payload.type === "thread.updated" && state.currentThread && payload.thread?.id === state.currentThread.id) {
    state.currentThread = mergeCurrentThread(payload.thread);
    renderCurrentThread({ stickToBottom: false });
    if (shouldRefreshCurrentThreadForSummary(payload.thread)) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 120 });
    }
    return;
  }
  if (payload.type === "message.delta") {
    appendDelta(payload.threadId, payload.messageId, payload.delta || "", payload);
    return;
  }
  if (payload.type === "run.event") {
    appendRunEventToCurrentThread(payload);
    return;
  }
  if (payload.type === "task.deleted" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    if (state.currentTaskGroupId === payload.taskGroupId) state.currentTaskGroupId = "";
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (payload.type === "task.renamed" && state.currentThread && payload.threadId === state.currentThread.id) {
    state.currentThread = payload.thread || state.currentThread;
    renderThreads();
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  if (payload.message) upsertCachedChatScopeMessage(payload.threadId, payload.message, payload.thread);
  if (payload.message && state.currentThread && payload.threadId === state.currentThread.id) {
    upsertMessage(payload.message);
    if (payload.thread) {
      state.currentThread.status = payload.thread.status;
      state.currentThread.activeRunId = payload.thread.activeRunId;
      state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
      state.currentThread.updatedAt = payload.thread.updatedAt;
    }
  }
}

function connectEvents() {
  if (state.events) state.events.close();
  const params = new URLSearchParams();
  if (state.key) params.set("key", state.key);
  if (state.clientVersion) params.set("clientVersion", state.clientVersion);
  const query = params.toString() ? `?${params.toString()}` : "";
  state.events = new EventSource(`/api/events${query}`);
  state.events.onmessage = (event) => {
    try {
      applyEvent(JSON.parse(event.data));
    } catch (err) {
      showError(err);
    }
  };
  state.events.onerror = () => {
    $("connectionState").textContent = "Reconnecting";
  };
}

async function sendMessage(event) {
  event?.preventDefault?.();
  if (state.composerComposing) {
    state.composerSendAfterComposition = true;
    $("messageInput")?.blur();
    scheduleComposerSendAfterCompositionFallback();
    return;
  }
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  if (isComposerStopMode()) {
    const button = $("sendMessage");
    button.disabled = true;
    try {
      await interruptRun();
    } finally {
      button.disabled = false;
      updateComposerAction();
    }
    return;
  }
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (!state.currentThreadId) return;
  let text = getComposerText().trim();
  const originalText = text;
  const ownerElevationOnceTag = ownerElevationComposerAvailable() ? ownerElevationOnceTagInfo(text) : null;
  let ownerElevationOnceRequested = false;
  if (ownerElevationOnceTag) {
    text = stripOwnerElevationOnceTags(text);
  }
  if (!text && !state.pendingArtifacts.length) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  const aiMention = composerAiMentionInfo(text);
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) {
    if (ownerElevationOnceTag) clearOwnerElevationOnce();
    return;
  }
  if (ownerElevationOnceTag) {
    clearOwnerElevationOnce();
    const ok = await activateOwnerElevationOnce({ confirm: false });
    if (!ok) return;
    ownerElevationOnceRequested = true;
  }
  closeGroupMentionMenu();
  $("sendMessage").disabled = true;
  let requestBody = null;
  let createsNewTask = false;
  let consumedPendingDirectory = false;
  try {
    const body = { text, artifacts: state.pendingArtifacts, workspaceId: state.selectedWorkspaceId };
    if (ownerElevationActive() || ownerElevationOnceTag) {
      body.maintenanceMode = true;
      body.maintenance_mode = true;
      body.elevationScope = "owner_high_privilege";
      if (ownerElevationOnceTag) {
        body.ownerElevationOnceToken = state.ownerElevationOnceToken;
      }
    }
    if (state.viewMode === "single") {
      body.singleWindowMode = state.singleWindowMode === "chat" ? "chat" : "task";
      if (state.singleWindowMode === "chat") {
        body.taskGroupId = isGroupChatView()
          ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
          : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
        body.messageLimit = CHAT_MESSAGE_INITIAL_LIMIT;
      }
      if (isGroupChatView()) body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
    }
    if (state.viewMode === "tasks" && state.currentTaskGroupId) {
      body.taskGroupId = state.currentTaskGroupId;
      const sharedTopicGroup = selectedSharedTopicGroup();
      if (sharedTopicGroup) {
        body.singleWindowMode = "chat";
        body.messageKind = aiMention.mentionsAi ? "ai" : "plain";
        body.messageLimit = TASK_MESSAGE_INITIAL_LIMIT;
      }
    }
    const reasoningEffort = selectedComposerReasoningEffort(text);
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    const quotedReply = activeQuotedReplyForSend();
    if (quotedReply) {
      body.taskGroupId = quotedReply.taskGroupId;
      body.replyToMessageId = quotedReply.messageId;
    }
    createsNewTask = state.viewMode === "tasks" && !body.taskGroupId;
    consumedPendingDirectory = Boolean(state.pendingTaskDirectory?.projectId);
    if (createsNewTask) {
      const directory = state.pendingTaskDirectory;
      if (directory?.projectId) body.directory = directory;
    }
    requestBody = body;
    const serializedBody = JSON.stringify(body);
    const sizeError = composerRequestSizeError(text, serializedBody);
    if (sizeError) {
      showError(new Error(sizeError));
      return;
    }
    setComposerText("");
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
      method: "POST",
      body: serializedBody,
    });
    handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
  } catch (err) {
    if (shouldOfferOwnerElevation(err) && requestBody) {
      const prompt = ownerElevationConfirmMessage(err);
      const ok = await openOwnerElevationApprovalDialog({
        title: "Owner Approval",
        message: prompt,
        detail: err.elevationReason || "",
      });
      if (ok) {
        try {
          let onceToken = "";
          if (!ownerElevationActive()) {
            await activateOwnerElevationOnce({ confirm: false });
            onceToken = state.ownerElevationOnceToken;
            ownerElevationOnceRequested = true;
          }
          const elevatedBody = Object.assign({}, requestBody, {
            maintenanceMode: true,
            maintenance_mode: true,
            elevationScope: err.elevationScope || err.code || "shared_skill_write",
          });
          if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
          const serializedElevatedBody = JSON.stringify(elevatedBody);
          const elevatedSizeError = composerRequestSizeError(elevatedBody.text || "", serializedElevatedBody);
          if (elevatedSizeError) throw new Error(elevatedSizeError);
          const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages`, {
            method: "POST",
            body: serializedElevatedBody,
          });
          handleSendMessageResult(result, createsNewTask, consumedPendingDirectory);
          return;
        } catch (elevatedErr) {
          setComposerText(originalText);
          showError(elevatedErr);
          return;
        }
      }
      setComposerText(originalText);
      showError(new Error("已取消 Owner 提权，未执行这次越权请求。"));
      return;
    }
    setComposerText(originalText);
    showError(err);
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    $("sendMessage").disabled = false;
    updateComposerAction();
  }
}

async function uploadFiles(files) {
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId || !files || !files.length) return;
  $("attachFile").disabled = true;
  $("connectionState").textContent = "Uploading";
  try {
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/uploads`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, type: file.type, dataBase64, workspaceId: state.selectedWorkspaceId || "owner" }),
      });
      if (result.artifact) state.pendingArtifacts.push(result.artifact);
    }
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Hermes OK";
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function renderPendingArtifacts() {
  let panel = $("pendingArtifacts");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pendingArtifacts";
    panel.className = "pending-artifacts";
    $("composer").insertBefore(panel, $("messageInput"));
  }
  if (!state.pendingArtifacts.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    updateComposerAction();
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = state.pendingArtifacts.map((artifact, index) => `<button type="button" class="pending-artifact doc-${escapeHtml(artifactKind(artifact))}" data-remove-artifact="${index}">
    <span class="pending-artifact-icon" aria-hidden="true"></span>
    <span class="pending-artifact-name">${escapeHtml(artifact.name || artifact.id)}</span>
  </button>`).join("");
  panel.querySelectorAll("[data-remove-artifact]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingArtifacts.splice(Number(button.dataset.removeArtifact), 1);
      renderPendingArtifacts();
      updateComposerAction();
    });
  });
}

async function interruptRun() {
  if (!state.currentThreadId) return;
  const body = state.viewMode === "tasks" && state.currentTaskGroupId ? { taskGroupId: state.currentTaskGroupId } : {};
  await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/interrupt`, {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(showError);
}

function sidebarScrollTarget(target) {
  const sidebar = $("sidebar");
  if (!sidebar) return null;
  const element = target?.closest ? target : target?.parentElement;
  const threadList = element?.closest?.(".thread-list");
  if (threadList && threadList.scrollHeight > threadList.clientHeight + 1) return threadList;
  return sidebar;
}

function wireSidebarTouchScroll() {
  const sidebar = $("sidebar");
  if (!sidebar) return;
  let gesture = null;
  sidebar.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    gesture = {
      startY: event.touches[0].clientY,
      lastY: event.touches[0].clientY,
      target: sidebarScrollTarget(event.target),
    };
  }, { passive: true });
  sidebar.addEventListener("touchmove", (event) => {
    if (!gesture || !isMobileLayout() || event.touches.length !== 1) return;
    const x = event.touches[0].clientX;
    const dx = x - (state.sidebarSwipe?.startX ?? x);
    const dyFromSwipe = event.touches[0].clientY - (state.sidebarSwipe?.startY ?? event.touches[0].clientY);
    if (state.sidebarSwipe?.mode === "close" && Math.abs(dx) > Math.abs(dyFromSwipe) * 1.15 && Math.abs(dx) > 12) {
      return;
    }
    const y = event.touches[0].clientY;
    const delta = gesture.lastY - y;
    gesture.lastY = y;
    if (Math.abs(y - gesture.startY) < 2) return;
    const target = gesture.target || sidebarScrollTarget(event.target);
    if (!target) return;
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    if (maxScroll <= 1) return;
    const before = target.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, before + delta));
    if (next !== before) target.scrollTop = next;
    event.preventDefault();
  }, { passive: false });
  const end = () => {
    gesture = null;
  };
  sidebar.addEventListener("touchend", end, { passive: true });
  sidebar.addEventListener("touchcancel", end, { passive: true });
}

function wireSidebarSwipe() {
  const sidebar = $("sidebar");
  const edge = $("edgeSwipeZone");
  const overlay = $("sidebarOverlay");
  if (!sidebar || !edge) return;

  const startSwipe = (mode, event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (mode === "close" && !sidebar.classList.contains("open")) return;
    if (mode === "edge" && sidebar.classList.contains("open")) return;
    state.sidebarSwipe = {
      mode,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      lastX: event.touches[0].clientX,
      startedAt: performance.now(),
      width: sidebarDragWidth(sidebar),
      dragging: false,
      handled: false,
    };
  };

  const moveSwipe = (event) => {
    const swipe = state.sidebarSwipe;
    if (!swipe || !isMobileLayout() || event.touches.length !== 1 || swipe.handled) return;
    const x = event.touches[0].clientX;
    const y = event.touches[0].clientY;
    const dx = x - swipe.startX;
    const dy = y - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (horizontal < 18 || horizontal < vertical * 1.15) return;
    const target = swipe.mode === "edge" && dx > 0 ? backSwipeTarget() : "";
    if (target) {
      if (!swipe.backTarget) {
        swipe.backTarget = target;
        swipe.surface = backSwipeSurface(target);
        if (!swipe.surface) return;
      }
      swipe.dragging = true;
      swipe.lastX = x;
      applyBackSwipeDrag(swipe, dx);
      event.preventDefault();
      return;
    }
    const canDragSidebar = swipe.mode === "close" && dx < 0;
    if (!canDragSidebar) return;
    swipe.dragging = true;
    swipe.lastX = x;
    const width = swipe.width || sidebarDragWidth(sidebar);
    const progress = swipe.mode === "edge" ? dx / width : 1 + dx / width;
    swipe.lastProgress = clamp01(progress);
    applySidebarDragProgress(swipe.lastProgress);
    event.preventDefault();
  };

  const endSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (!swipe?.dragging) return;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const dx = (swipe.lastX || swipe.startX) - swipe.startX;
    const velocity = dx / elapsed;
    if (swipe.backTarget) {
      const accepted = (swipe.progress || 0) > 0.34 || velocity > 0.55;
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        if (accepted) navigateDirectoryUp({ exitShell: swipe.surface, animateEntry: true }).catch(showError);
        else settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      } else {
        settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, accepted);
      }
      return;
    }
    const progress = clamp01(swipe.lastProgress);
    if (swipe.mode === "edge") {
      settleSidebarDrag(progress > 0.38 || velocity > 0.55);
    } else if (swipe.mode === "close") {
      settleSidebarDrag(!(progress < 0.7 || velocity < -0.55));
    } else {
      clearSidebarDragStyles();
    }
  };

  const cancelSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (swipe?.backTarget) {
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      }
      else settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, false);
      return;
    }
    if (swipe?.dragging) {
      settleSidebarDrag(swipe.mode === "close");
    } else {
      clearSidebarDragStyles();
    }
  };

  const startEdgeSwipe = (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (edge.classList.contains("disabled")) return;
    if (event.touches[0].clientX > EDGE_SWIPE_HIT_PX) return;
    event.preventDefault();
    state.sidebarSwipe = null;
  };
  const moveEdgeSwipe = (event) => {
    if (state.sidebarSwipe?.mode === "edge") moveSwipe(event);
  };
  const endEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") endSwipe();
  };
  const cancelEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") cancelSwipe();
  };

  document.addEventListener("touchstart", startEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchmove", moveEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchend", endEdgeSwipe, { passive: true, capture: true });
  document.addEventListener("touchcancel", cancelEdgeSwipe, { passive: true, capture: true });

  sidebar.addEventListener("touchstart", (event) => startSwipe("close", event), { passive: true });
  sidebar.addEventListener("touchmove", moveSwipe, { passive: false });
  sidebar.addEventListener("touchend", endSwipe, { passive: true });
  sidebar.addEventListener("touchcancel", cancelSwipe, { passive: true });

  overlay?.addEventListener("click", closeSidebar);
}

function wireRightSwipeGuard() {
  if (document.documentElement.dataset.rightSwipeGuardBound) return;
  document.documentElement.dataset.rightSwipeGuardBound = "1";
  let touch = null;
  const interactiveSelector = ".sidebar, .directory-shell, input, select, textarea, [contenteditable='true']";
  const clear = () => {
    touch = null;
  };
  document.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    const target = backSwipeTarget();
    touch = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      blocked: point.clientX <= EDGE_SWIPE_HIT_PX,
      accepted: false,
      target,
      surface: target ? backSwipeSurface(target) : document.querySelector(".main"),
    };
    if (touch.blocked) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("touchmove", (event) => {
    if (!touch || !isMobileLayout() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - touch.startX;
    const dy = point.clientY - touch.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!touch.blocked && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    touch.blocked = true;
    touch.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (touch.startedAt || performance.now()));
    const velocity = dx / elapsed;
    touch.accepted = dx > 58 || velocity > 0.55;
    if (touch.surface) applyBackSwipeDrag(touch, dx);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false, capture: true });
  document.addEventListener("touchend", () => {
    const current = touch;
    clear();
    if (!current?.blocked || !isMobileLayout()) return;
    if (current.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
    if (!current.accepted || !current.target) return;
    handleInAppBackNavigation({ animateEntry: true }).catch(showError);
  }, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => {
    const current = touch;
    clear();
    if (current?.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
  }, { passive: true, capture: true });
}

function showError(err) {
  $("connectionState").textContent = err.message || String(err);
}

function handleSendMessageResult(result, createsNewTask, consumedPendingDirectory) {
  state.pendingArtifacts = [];
  if (createsNewTask) {
    state.pendingTaskDirectory = null;
    if (consumedPendingDirectory) state.taskDirectoryFilter = null;
  }
  if (state.viewMode === "tasks") state.pendingTaskReasoningEffort = "";
  if (state.viewMode === "tasks") state.pendingTaskReasoningExplicit = false;
  clearQuotedReply({ render: false });
  renderPendingArtifacts();
  state.currentThread = mergeCurrentThread(result.thread);
  if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
    const latestUser = [...(state.currentThread?.messages || [])].reverse().find((message) => message.role === "user");
    state.currentTaskGroupId = latestUser?.taskGroupId || "";
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  suppressComposerAutoFocus(1200);
  blurComposerInput();
}

function shouldOfferOwnerElevation(err) {
  return Boolean(err?.elevationRequired && state.auth?.isOwner);
}

function shouldOfferOwnerElevationForMessage(message) {
  if (!message?.elevationRequired) return false;
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return false;
  const status = String(message.status || "");
  if (status === "queued" || status === "running") return false;
  if (!state.currentThreadId && !state.currentThread?.id) return false;
  if (state.ownerElevationRetryingMessageIds.has(message.id)) return false;
  return true;
}

async function offerOwnerElevationForMessage(message) {
  if (!shouldOfferOwnerElevationForMessage(message)) return false;
  const messageId = String(message.id || "");
  if (!messageId || state.ownerElevationPromptedMessageIds.has(messageId)) return false;
  state.ownerElevationPromptedMessageIds.add(messageId);
  const ok = await openOwnerElevationApprovalDialog({
    title: "Owner Approval",
    message: ownerElevationConfirmMessage(message),
    detail: message.elevationReason || "",
  });
  if (!ok) return false;
  state.ownerElevationRetryingMessageIds.add(messageId);
  let ownerElevationOnceRequested = false;
  try {
    let onceToken = "";
    if (!ownerElevationActive()) {
      await activateOwnerElevationOnce({ confirm: false });
      onceToken = state.ownerElevationOnceToken;
      ownerElevationOnceRequested = true;
    }
    const threadId = state.currentThreadId || state.currentThread?.id || "";
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/owner-elevation`, {
      method: "POST",
      body: JSON.stringify({
        elevationScope: message.elevationScope || "owner_high_privilege",
        ownerElevationOnceToken: onceToken,
      }),
    });
    if (result.thread) {
      state.currentThread = mergeCurrentThread(result.thread);
      state.currentThreadId = state.currentThread?.id || threadId;
      upsertThreadSummary(summarizeThread(state.currentThread));
      renderCurrentThread({ stickToBottom: true });
    }
    showPushToast("已批准高权限重跑", "success");
    return true;
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    state.ownerElevationRetryingMessageIds.delete(messageId);
  }
}

function ownerElevationConfirmMessage(err) {
  const scope = String(err?.elevationScope || err?.code || "").trim();
  if (scope === "automation_admin_write") {
    return "这次请求会修改其他账号的自动化任务，需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "shared_skill_write") {
    return "这次操作需要写入共享或系统级 Skill。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "owner_high_privilege" || scope === "owner_high_privilege_required") {
    return "这次请求需要 Owner 高权限运行。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  return "这次请求需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
}

function getComposerText() {
  const input = $("messageInput");
  if (input && "value" in input) return String(input.value || "").replace(/\u00a0/g, " ");
  return String(input?.innerText || "").replace(/\u00a0/g, " ");
}

function utf8ByteLength(text) {
  const value = String(text || "");
  if (!value) return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
  if (typeof Blob === "function") return new Blob([value]).size;
  return unescape(encodeURIComponent(value)).length;
}

function composerRequestSizeError(text, serializedBody) {
  if (String(text || "").length > COMPOSER_MAX_TEXT_CHARS) {
    return "内容太长，单条消息最多约 24 万字，请拆成几条发送，或作为文件上传。";
  }
  if (utf8ByteLength(serializedBody) > COMPOSER_MAX_BODY_BYTES) {
    return "内容太长，当前消息包超过发送上限，请拆成几条发送，或作为文件上传。";
  }
  return "";
}

function clearComposerSendAfterCompositionFallback() {
  if (!state.composerSendAfterCompositionTimer) return;
  clearTimeout(state.composerSendAfterCompositionTimer);
  state.composerSendAfterCompositionTimer = null;
}

function scheduleComposerSendAfterCompositionFallback() {
  clearComposerSendAfterCompositionFallback();
  state.composerSendAfterCompositionTimer = setTimeout(() => {
    state.composerSendAfterCompositionTimer = null;
    if (!state.composerSendAfterComposition) return;
    state.composerComposing = false;
    state.composerSendAfterComposition = false;
    updateComposerAction();
    updateGroupMentionMenu();
    void sendMessage();
  }, 450);
}

function setComposerText(text) {
  const input = $("messageInput");
  if (!input) return;
  if ("value" in input) input.value = text || "";
  else input.textContent = text || "";
  autoSizeComposerEditor(input);
  updateComposerAction();
}

function composerCaretOffset() {
  const input = $("messageInput");
  if (input && typeof input.selectionStart === "number") return input.selectionStart;
  const selection = window.getSelection?.();
  if (!input || !selection || !selection.rangeCount) return getComposerText().length;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.endContainer)) return getComposerText().length;
  const before = document.createRange();
  before.selectNodeContents(input);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function setComposerCaretOffset(offset) {
  const input = $("messageInput");
  if (!input) return;
  const target = Math.max(0, Number(offset) || 0);
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(target, target);
    return;
  }
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();
  const selection = window.getSelection?.();
  const range = document.createRange();
  while (node) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ownerElevationComposerAvailable() {
  if (isChatSearchMode()) return false;
  return Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner" && (state.viewMode === "single" || state.viewMode === "tasks"));
}

function ownerElevationMentionOptions() {
  if (!ownerElevationComposerAvailable()) return [];
  return [{
    workspaceId: "owner-elevation-once",
    label: "高权限本次",
    virtual: true,
    mentionText: "#高权限本次",
    description: "只授权当前这一条 Owner 消息",
    ownerElevationOnce: true,
  }];
}

function ownerElevationTagPattern() {
  return /(^|[\s([{,.;:!?\u3000\uff08\uff3b\u3010\uff0c\u3002\uff1b\uff1a\uff01\uff1f])[#\uff03]\s*(?:高权限|高權限|owner[-_\s]?high[-_\s]?privilege|high[-_\s]?privilege)\s*(?:本次|once)?/gi;
}

function ownerElevationOnceTagInfo(text) {
  return ownerElevationTagPattern().test(String(text || "")) ? { present: true } : null;
}

function stripOwnerElevationOnceTags(text) {
  return String(text || "")
    .replace(ownerElevationTagPattern(), (match, prefix = "") => prefix)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function composerMentionAvailable() {
  if (isChatSearchMode()) return false;
  return state.viewMode === "single" || state.viewMode === "tasks";
}

function composerMentionMembers() {
  const groupMembers = isGroupChatView() ? groupChatMentionMembers(state.currentThread, { includeAi: false }) : [];
  return [...composerAiMentionOptions(), ...groupMembers];
}

function activeGroupMentionToken() {
  if (!composerMentionAvailable()) return null;
  const text = getComposerText();
  const caret = composerCaretOffset();
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("\uff20"));
  const hash = ownerElevationComposerAvailable()
    ? Math.max(before.lastIndexOf("#"), before.lastIndexOf("\uff03"))
    : -1;
  const start = Math.max(at, hash);
  if (start < 0) return null;
  const trigger = start === hash ? "#" : "@";
  const previous = start > 0 ? before[start - 1] : "";
  if (previous && !/[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?，。；：！？、]/.test(previous)) return null;
  const query = before.slice(start + 1);
  if (/[\s\r\n@\uff20#\uff03]/.test(query) || query.length > 40) return null;
  return { start, end: caret, query, trigger };
}

function mentionOptionsForQuery(query, members = composerMentionMembers()) {
  const needle = normalizeMentionSearch(query);
  return members.filter((member) => {
    if (!needle) return true;
    return normalizeMentionSearch(member.label).includes(needle)
      || normalizeMentionSearch(member.workspaceId).includes(needle)
      || normalizeMentionSearch(member.description).includes(needle)
      || normalizeMentionSearch(member.mentionText).includes(needle)
      || normalizeMentionSearch(member.reasoningEffort).includes(needle);
  }).slice(0, 8);
}

function closeGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  state.groupMentionOpen = false;
  state.groupMentionOptions = [];
  state.groupMentionIndex = 0;
  state.groupMentionToken = null;
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function renderGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  if (!menu) return;
  const token = activeGroupMentionToken();
  if (!token) {
    closeGroupMentionMenu();
    return;
  }
  const options = token.trigger === "#"
    ? mentionOptionsForQuery(token.query, ownerElevationMentionOptions())
    : mentionOptionsForQuery(token.query);
  if (!options.length) {
    closeGroupMentionMenu();
    return;
  }
  state.groupMentionOpen = true;
  state.groupMentionOptions = options;
  state.groupMentionToken = token;
  state.groupMentionIndex = Math.min(Math.max(0, state.groupMentionIndex), options.length - 1);
  menu.hidden = false;
  menu.innerHTML = options.map((member, index) => `
    <button class="group-mention-option${index === state.groupMentionIndex ? " active" : ""}" type="button" data-group-mention-index="${index}">
      <span class="group-mention-name">${escapeHtml(member.mentionText || `@${member.label}`)}</span>
    </button>`).join("");
}

function moveGroupMentionSelection(delta) {
  if (!state.groupMentionOpen || !state.groupMentionOptions.length) return;
  const total = state.groupMentionOptions.length;
  state.groupMentionIndex = (state.groupMentionIndex + delta + total) % total;
  renderGroupMentionMenu();
}

async function chooseGroupMention(index = state.groupMentionIndex) {
  if (!state.groupMentionOpen || !state.groupMentionToken) return false;
  const member = state.groupMentionOptions[index] || state.groupMentionOptions[0];
  if (!member) return false;
  if (member.ownerElevationOnce) clearOwnerElevationOnce();
  const token = state.groupMentionToken;
  const text = getComposerText();
  const insertion = `${String(member.mentionText || `@${member.label}`).trimEnd()} `;
  const next = `${text.slice(0, token.start)}${insertion}${text.slice(token.end)}`;
  setComposerText(next);
  $("messageInput")?.focus({ preventScroll: true });
  setComposerCaretOffset(token.start + insertion.length);
  closeGroupMentionMenu();
  updateComposerAction();
  return true;
}

function updateGroupMentionMenu() {
  if (!composerMentionAvailable()) {
    closeGroupMentionMenu();
    return;
  }
  renderGroupMentionMenu();
}

function autoSizeComposerEditor(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  const input = $("messageInput");
  if (input && typeof input.setRangeText === "function") {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

function handleComposerKeydown(event) {
  if (composerMentionAvailable() && state.groupMentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGroupMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGroupMentionSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeGroupMentionMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      void chooseGroupMention();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  void sendMessage();
}

function wireUi() {
  wireBackNavigationGuard();
  wireSidebarTouchScroll();
  wireRightSwipeGuard();
  wireSidebarSwipe();
  wireConversationScrollFeedback();
  $("refreshNow")?.addEventListener("click", reloadForClientUpdate);
  $("refreshLater")?.addEventListener("click", () => {
    state.refreshNoticeDismissedVersion = state.serverClientVersion;
    hideRefreshNotice();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleAppBackgrounded();
      return;
    }
    handleAppForegrounded();
    checkClientVersion("visible").catch(() => {});
  });
  window.addEventListener("pagehide", handleAppBackgrounded);
  window.addEventListener("pageshow", handleAppForegrounded);
  window.addEventListener("focus", () => {
    handleAppForegrounded();
    checkClientVersion("focus").catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.pwaInstallPrompt = event;
    updateTopMoreControls();
    renderPwaInstallOverlay();
  });
  window.addEventListener("appinstalled", () => {
    state.pwaInstalled = true;
    state.pwaInstallPrompt = null;
    closePwaInstall();
    updateTopMoreControls();
    showPushToast("Hermes Mobile 已安装。", "success");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "hermes.notification.open") {
        openNotificationRoute(event.data.url || event.data.data?.url || "/").catch(showError);
        return;
      }
      if (event.data?.type === "hermes.push.received") {
        handleForegroundPushMessage(event.data);
        checkClientVersion("push").catch(() => {});
      }
    });
  }
  $("setupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOwnerSetup().catch((err) => {
      state.setupError = err.message || String(err);
      renderSetup();
    });
  });
  $("copySetupKey")?.addEventListener("click", () => copyTextToClipboard(state.setupOwnerKey || "").catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("enterAfterSetup")?.addEventListener("click", () => enterAfterSetup().catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("loginKey").value.trim()).catch((err) => showLogin(err.message));
  });
  $("workspaceSelect").addEventListener("change", async (event) => {
    clearQuotedReply({ render: false });
    clearTaskDirectoryFilter({ render: false });
    state.selectedWorkspaceId = event.target.value;
    state.privateChatThread = null;
    state.weixinChatThread = null;
    state.weixinChatThreadId = "";
    state.weixinChatAvailable = false;
    state.groupChatThread = null;
    state.groupChatThreadId = "";
    state.groupChatAvailable = false;
    resetLearningCoinsState();
    localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
    renderWorkspaceAccessPanel();
    state.directoryThreadId = "";
    state.directoryThreadWorkspaceId = "";
    await loadProjects();
    resetDirectoryPath();
    await loadSelectedView();
    syncPushSubscriptionContext().catch(() => {});
  });
  $("projectSelect").addEventListener("change", async (event) => {
    state.selectedProjectId = event.target.value;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    renderSubprojects();
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("subprojectSelect").addEventListener("change", async (event) => {
    persistSelectedSubproject(event.target.value);
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("taskManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    if (!(state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task"))) {
      state.viewMode = "tasks";
      localStorage.setItem("hermesWebViewMode", state.viewMode);
      state.currentTaskGroupId = "";
      await loadSelectedView();
    }
  });
  $("chatManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomTasksMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomChatMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleTaskMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("task");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("tasksMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("projectsMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomProjectsMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("automationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomAutomationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("learningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomLearningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("todosMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomTodosMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "todos";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("threadSearch").addEventListener("input", () => {
    updateSearchButton();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadSelectedView().catch(showError), 250);
  });
  $("workspaceEntry")?.addEventListener("click", focusWorkspaceEntry);
  $("directoryEntry").addEventListener("click", () => {
    openCurrentDirectoryEntry().catch(showError);
  });
  $("topInstallPwa")?.addEventListener("click", openPwaInstall);
  $("newThread").addEventListener("click", () => createThread().catch(showError));
  $("pushToggle").addEventListener("click", () => handlePushButton().catch(showError));
  $("topMoreButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("topMoreMenu");
    const button = $("topMoreButton");
    if (!menu || !button) return;
    const open = Boolean(menu.hidden);
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("topMoreMenu")?.addEventListener("click", (event) => event.stopPropagation());
  $("topToggleTaskView")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    if (isSingleWindowView()) {
      state.viewMode = "tasks";
    } else {
      state.viewMode = "single";
      setSingleWindowMode("task");
    }
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    await loadSelectedView();
  });
  $("topToggleSingleMode")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    setSingleWindowMode(state.singleWindowMode === "chat" ? "task" : "chat");
    await loadSelectedView();
  });
  $("topClearDirectoryFilter")?.addEventListener("click", () => {
    clearTaskDirectoryFilter();
  });
  $("topManageAccessKeys")?.addEventListener("click", () => {
    openAccessKeyManager({ workspaceId: state.selectedWorkspaceId }).catch(showError);
  });
  $("topNewDirectoryFolder")?.addEventListener("click", () => {
    closeTopMoreMenu();
    createDirectoryFolder().catch(showError);
  });
  $("topManageSharedDirectories")?.addEventListener("click", () => {
    openSharedDirectoryManager().catch(showError);
  });
  $("topNewTodo")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openTodoCreate();
  });
  $("topNewAutomation")?.addEventListener("click", () => {
    openAutomationCreate();
  });
  $("topEditAutomation")?.addEventListener("click", () => {
    openAutomationEdit();
  });
  $("topToggleAutomationPause")?.addEventListener("click", () => {
    toggleAutomationPause().catch(showError);
  });
  $("topDeleteAutomation")?.addEventListener("click", () => {
    deleteAutomationJob().catch(showError);
  });
  $("topDeleteTodo")?.addEventListener("click", () => {
    deleteTodo(state.selectedTodoId).catch(showError);
  });
  $("topRenameTask")?.addEventListener("click", () => {
    closeTopMoreMenu();
    renameTaskGroup(state.currentTaskGroupId).catch(showError);
  });
  $("topSearchChat")?.addEventListener("click", () => {
    openChatSearch();
  });
  $("topToggleGroupChat")?.addEventListener("click", () => {
    toggleGroupChat().catch(showError);
  });
  $("topToggleWeixinChat")?.addEventListener("click", () => {
    toggleWeixinChat().catch(showError);
  });
  $("topManageGroupMembers")?.addEventListener("click", () => {
    openGroupChatMembers().catch(showError);
  });
  $("topToggleReadingFullscreen")?.addEventListener("click", () => {
    setReadingFullscreen(!state.readingFullscreen);
  });
  $("readingFullscreenExit")?.addEventListener("click", () => {
    setReadingFullscreen(false);
  });
  $("readingFullscreenEnter")?.addEventListener("click", () => {
    setReadingFullscreen(true);
  });
  $("topSettingsButton")?.addEventListener("click", openSettings);
  $("clientVersion")?.addEventListener("click", applyAppUpdateFromBadge);
  document.addEventListener("click", closeTopMoreMenu);
  document.addEventListener("click", () => closeTaskCardMenus());
  document.addEventListener("click", () => closeDirectoryEntryMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.readingFullscreen) setReadingFullscreen(false);
  });
  $("openMenu").addEventListener("click", (event) => handleTopNavActivation(event));
  $("closeMenu").addEventListener("click", closeSidebar);
  $("sidebarBack")?.addEventListener("click", sidebarBackToMenu);
  $("sendMessage").addEventListener("click", () => void sendMessage());
  $("groupMentionMenu")?.addEventListener("pointerdown", (event) => {
    const option = event.target.closest?.("[data-group-mention-index]");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    suppressTransientActivations(700);
    void chooseGroupMention(Number(option.dataset.groupMentionIndex || 0));
  });
  $("groupMentionMenu")?.addEventListener("pointerup", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("groupMentionMenu")?.addEventListener("touchend", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true, passive: false });
  $("groupMentionMenu")?.addEventListener("click", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("interruptRun").addEventListener("click", interruptRun);
  $("messageInput").addEventListener("input", (event) => {
    autoSizeComposerEditor(event.target);
    if (isChatSearchMode()) updateChatSearchDraft(getComposerText());
    else {
      updateComposerAction();
      updateGroupMentionMenu();
    }
  });
  $("messageInput").addEventListener("keydown", handleComposerKeydown);
  $("messageInput").addEventListener("paste", pastePlainText);
  $("messageInput").addEventListener("compositionstart", () => {
    state.composerComposing = true;
  });
  $("messageInput").addEventListener("compositionend", () => {
    state.composerComposing = false;
    clearComposerSendAfterCompositionFallback();
    updateComposerAction();
    updateGroupMentionMenu();
    if (state.composerSendAfterComposition) {
      state.composerSendAfterComposition = false;
      setTimeout(() => void sendMessage(), 0);
    }
  });
  $("messageInput").addEventListener("focus", () => {
    state.composerFocused = true;
    refreshKeyboardViewportDuringFocus();
    refreshComposerContextSoon(0);
    refreshComposerContextSoon(160);
    refreshComposerContextSoon(360);
  });
  $("messageInput").addEventListener("blur", () => {
    state.composerFocused = false;
    refreshKeyboardViewportSoon(80);
    refreshKeyboardViewportSoon(260);
    refreshComposerContextSoon(80);
  });
  $("conversation")?.addEventListener("scroll", handleConversationScrollState, { passive: true });
  navigator.virtualKeyboard?.addEventListener("geometrychange", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("resize", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("scroll", handleViewportLayoutChange);
  window.addEventListener("resize", handleViewportLayoutChange);
  window.addEventListener("orientationchange", handleViewportLayoutChange);
  window.screen?.orientation?.addEventListener?.("change", handleViewportLayoutChange);
  document.addEventListener("pointerdown", (event) => {
    if (!state.groupMentionOpen) return;
    if ($("composer")?.contains(event.target)) return;
    closeGroupMentionMenu();
  });
  document.addEventListener("click", (event) => {
    suppressTransientActivationEvent(event);
  }, { capture: true });
  document.addEventListener("pointerup", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (event.pointerType === "mouse") return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true });
  document.addEventListener("touchend", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (window.PointerEvent) return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true, passive: false });
  $("attachFile").addEventListener("click", (event) => {
    if ($("attachFile").dataset.searchCloseHandled === "1") {
      delete $("attachFile").dataset.searchCloseHandled;
      event.preventDefault();
      return;
    }
    handleAttachFileActivation(event);
  });
  $("chatSearchPrev")?.addEventListener("click", () => moveChatSearch(-1));
  $("chatSearchNext")?.addEventListener("click", () => moveChatSearch(1));
  $("fileInput").addEventListener("change", (event) => {
    const input = event.target;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    uploadFiles(files).catch(showError);
  });
}

async function start() {
  applyFontFamilyPreference();
  applyFontSizePreference();
  wireUi();
  state.pwaInstalled = isStandalonePwa();
  ensurePwaServiceWorker({ timeoutMs: 8000 }).catch(() => {});
  showBootSplash("正在连接 Hermes Mobile");
  try {
    const config = await fetch("/api/public-config").then((res) => res.json());
    state.setupRequired = Boolean(config.setupRequired);
    if (state.setupRequired) {
      showSetup();
      return;
    }
    if (config.authRequired && !state.key) {
      if (!(await hasCookieSession().catch(() => false))) {
        showLogin();
        return;
      }
    }
    setBootSplashText("正在载入工作区");
    await bootstrap();
    showApp();
  } catch (err) {
    showError(err);
    if (/unauthorized/i.test(err.message)) showLogin();
    else showApp();
  }
}

start();
