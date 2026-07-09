export const APP_BOOTSTRAP_MODEL_VERSION = "20260706-app-bootstrap-model-v1";

export const FONT_SIZE_OPTIONS = Object.freeze([
  { id: "small", label: "小", scale: 0.92 },
  { id: "standard", label: "标准", scale: 1 },
  { id: "large", label: "大", scale: 1.1 },
  { id: "xlarge", label: "特大", scale: 1.2 },
  { id: "xxlarge", label: "超大", scale: 1.32 },
]);
export const DEFAULT_FONT_SIZE = "standard";

export const THEME_MODE_OPTIONS = Object.freeze([
  { id: "system", label: "跟随系统", description: "跟随当前设备" },
  { id: "light", label: "浅色", description: "白天阅读" },
  { id: "dark", label: "深色", description: "夜间低亮度" },
]);
export const DEFAULT_THEME_MODE = "system";

export const FONT_FAMILY_OPTIONS = Object.freeze([
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
export const DEFAULT_FONT_FAMILY = "system";

export const DEFAULT_COMPOSER_MODEL_ID = "runtime-default";
export const COMPOSER_MODEL_OPTIONS = Object.freeze([
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

export const KANBAN_MULTI_AGENT_DEFAULT_PARALLEL = 3;
export const KANBAN_MULTI_AGENT_MAX_PARALLEL = 8;

export function optionPreferenceId(value, options, fallbackId) {
  const id = String(value || "").trim();
  return Array.isArray(options) && options.some((option) => option?.id === id)
    ? id
    : fallbackId;
}

export function kanbanComposerModePlan(storedMode, legacyMultiAgentValue) {
  const stored = String(storedMode || "").trim();
  if (stored === "reading") return "study";
  if (["single", "multi", "study", "assessment"].includes(stored)) return stored;
  return legacyMultiAgentValue === "1" ? "multi" : "single";
}

export function normalizeKanbanComposerMaxParallel(
  value,
  defaultParallel = KANBAN_MULTI_AGENT_DEFAULT_PARALLEL,
  maxParallel = KANBAN_MULTI_AGENT_MAX_PARALLEL,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultParallel;
  return Math.max(1, Math.min(maxParallel, Math.floor(parsed)));
}

export function kanbanReasoningEffortPlan(value) {
  const effort = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
}

export function defaultKanbanReadingDraft(dateValue = "") {
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
    startDate: String(dateValue || ""),
    timeOfDay: "21:00",
    scheduleFrequency: "daily",
    scheduleWeekdays: "1",
    scheduleMonthDay: "1",
    reminderLeadMinutes: "15",
  };
}

export function defaultKanbanAssessmentDraft(dateValue = "") {
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
    startDate: String(dateValue || ""),
    timeOfDay: "19:30",
    reminderLeadMinutes: "30",
    difficulty: "基础30% / 中等50% / 挑战20%",
  };
}

export function isKanbanProgrammingStudyTemplate(value) {
  return String(value || "").trim().toLowerCase() === "programming";
}

export function programmingAssessmentDraftFromStudyDraft(studyDraft = {}, dateValue = "") {
  const draft = Object.assign(defaultKanbanReadingDraft(dateValue), studyDraft || {});
  const subject = String(draft.subjectDomain || "").trim() || "Python 编程";
  const title = String(draft.activityTitle || draft.bookTitle || "").trim() || `${subject} 编程测验计划`;
  return Object.assign(defaultKanbanAssessmentDraft(dateValue), {
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
    startDate: draft.startDate || String(dateValue || ""),
    timeOfDay: draft.timeOfDay || "21:00",
    scheduleFrequency: draft.scheduleFrequency || "daily",
    scheduleWeekdays: draft.scheduleWeekdays || "1",
    scheduleMonthDay: draft.scheduleMonthDay || "1",
    reminderLeadMinutes: draft.reminderLeadMinutes || "15",
    difficulty: "基础40% / 应用40% / 挑战20%",
  });
}

export function parseWorkspaceIdList(value) {
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

export function kanbanPlanBindingPartsPlan(draft = {}, kind = "study", workspaceLabels = {}) {
  const source = draft && typeof draft === "object" ? draft : {};
  const labels = workspaceLabels && typeof workspaceLabels === "object" ? workspaceLabels : {};
  const learner = String(source.learnerName || source.readerName || "").trim();
  const title = String(source.activityTitle || source.bookTitle || source.planTitle || source.subject || "").trim();
  const performerId = String(source.performerWorkspaceId || "").trim();
  const viewerIds = parseWorkspaceIdList(source.viewerWorkspaceIds);
  const labelFor = (id) => String(labels[id] || id || "").trim();
  return {
    learner,
    title,
    performerId,
    performerLabel: labelFor(performerId),
    viewerLabels: viewerIds.map(labelFor).filter(Boolean),
    kind,
  };
}

export function kanbanPlanBindingPreviewPlan(draft = {}, kind = "study", workspaceLabels = {}) {
  const parts = kanbanPlanBindingPartsPlan(draft, kind, workspaceLabels);
  const learner = parts.learner || "学习者";
  const title = parts.title || (kind === "assessment" ? "考试计划" : "学习计划");
  return {
    kind,
    directoryText: `${learner} / 学习计划 / ${title}`,
    performerText: parts.performerLabel ? `执行：${parts.performerLabel}` : "未指定执行者",
    viewerText: parts.viewerLabels.length ? `只读：${parts.viewerLabels.join("、")}` : "未指定只读查看者",
  };
}
