"use strict";

const crypto = require("node:crypto");
const {
  actorRoleForKanbanCase,
  normalizeKanbanCaseRecord,
} = require("./kanban-story-provider");

const CASE_ROLES = new Set(["manager", "performer", "viewer"]);
const DONE_STATUSES = new Set(["done", "completed"]);
const ARCHIVED_STATUSES = new Set(["archived", "cancelled", "canceled"]);
const DEFAULT_READING_PLAN_MAX_SESSIONS = Math.max(
  1,
  Math.min(60, Number(process.env.HERMES_MOBILE_READING_PLAN_MAX_SESSIONS || process.env.HERMES_WEB_READING_PLAN_MAX_SESSIONS || "31") || 31),
);
const DEFAULT_ASSESSMENT_PLAN_MAX_EXAMS = Math.max(
  1,
  Math.min(30, Number(process.env.HERMES_MOBILE_ASSESSMENT_PLAN_MAX_EXAMS || "30") || 30),
);
const DEFAULT_ASSESSMENT_MAX_QUESTIONS = Math.max(
  5,
  Math.min(40, Number(process.env.HERMES_MOBILE_ASSESSMENT_MAX_QUESTIONS || "40") || 40),
);

function own(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function lowerString(value) {
  return cleanString(value).toLowerCase();
}

function compactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function safeSlug(value, fallback = "default") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalDateTime(date) {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function firstString(source, names, fallback = "") {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = cleanString(source[name]);
    if (value) return value;
  }
  return fallback;
}

function firstNumber(source, names, fallback = 0) {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = Number(source[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function arrayFromValue(value, limit = 100) {
  const raw = Array.isArray(value) ? value : cleanString(value).split(/[,\s;]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function firstArray(source, names, limit = 100) {
  if (!source || typeof source !== "object") return [];
  for (const name of names) {
    if (!own(source, name)) continue;
    const values = arrayFromValue(source[name], limit);
    if (values.length) return values;
  }
  return [];
}

function normalizeStatus(card = {}) {
  const status = lowerString(card.kanbanStatus || card.kanban_status || card.status || card.state);
  return status || "todo";
}

function normalizeStudyAssessmentKind(card = {}) {
  const mode = firstString(card, ["kanbanCaseMode", "kanban_case_mode", "caseMode", "case_mode", "mode"]);
  const template = firstString(card, [
    "kanbanCaseTemplate",
    "kanban_case_template",
    "caseTemplate",
    "case_template",
    "template",
  ]);
  if (mode === "assessment-plan" || template === "assessment") return "assessment";
  if (mode === "study-plan" && template === "final-assessment") return "final-assessment";
  if (mode === "study-plan" && (template === "reading" || template === "reading-plan")) return "reading";
  if (mode === "study-plan") return "study";
  return "";
}

function normalizeKanbanStudyTemplate(raw = {}) {
  const value = lowerString(firstString(raw, [
    "studyTemplate",
    "study_template",
    "caseTemplate",
    "case_template",
    "template",
    "kind",
  ]));
  if (["programming", "coding", "code", "python", "\u7f16\u7a0b", "\u7a0b\u5f0f", "\u7a0b\u5e8f", "\u4ee3\u7801"].includes(value)) return "programming";
  if (["reading", "read", "book", "english-reading", "reading-retell"].includes(value)) return "reading";
  return "custom";
}

function kanbanCardStudyTemplate(card = {}) {
  return lowerString(
    card?.kanbanCaseTemplate
    || card?.kanban_case_template
    || card?.studyTemplate
    || card?.study_template
    || "custom",
  ) || "custom";
}

function kanbanCardUsesReadingTemplate(card = {}) {
  return kanbanCardStudyTemplate(card) === "reading";
}

function normalizeReadingPlanTime(value) {
  const text = cleanString(value);
  const match = text.match(/^(\d{1,2})(?::|\uFF1A)(\d{1,2})$/);
  if (!match) return "21:00";
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${pad2(hour)}:${pad2(minute)}`;
}

function dateNow(options = {}) {
  if (options.now instanceof Date) return new Date(options.now.getTime());
  if (typeof options.now === "function") {
    const value = options.now();
    if (value instanceof Date) return new Date(value.getTime());
  }
  return new Date();
}

function normalizeReadingPlanStartDate(value, options = {}) {
  const text = cleanString(value);
  const match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  const now = dateNow(options);
  if (!match) return formatLocalDate(now);
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function readingPlanDueTime(startDate, timeOfDay, dayOffset, options = {}) {
  const dateMatch = cleanString(startDate).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizeReadingPlanTime(timeOfDay).match(/^(\d{2}):(\d{2})$/);
  const date = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
    : dateNow(options);
  date.setDate(date.getDate() + Math.max(0, Number(dayOffset) || 0));
  return formatLocalDateTime(date);
}

function readingPlanStartDateTime(startDate, timeOfDay, options = {}) {
  const dateMatch = cleanString(startDate).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizeReadingPlanTime(timeOfDay).match(/^(\d{2}):(\d{2})$/);
  return dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
    : dateNow(options);
}

function normalizeStudyPlanScheduleFrequency(value = "") {
  const text = cleanString(value).toLowerCase();
  if (["weekly", "week", "weeks", "\u6BCF\u5468", "\u6BCF\u9031", "\u5468", "\u9031"].includes(text)) return "weekly";
  if (["monthly", "month", "months", "\u6BCF\u6708", "\u6708"].includes(text)) return "monthly";
  return "daily";
}

function normalizeStudyPlanWeekdays(value, startDate = "", options = {}) {
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;\uFF0C\u3001]+/);
  const out = [];
  const seen = new Set();
  const pushDay = (day) => {
    const normalized = day === 7 ? 0 : day;
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 6 || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };
  for (const item of raw) {
    const text = cleanString(item).toLowerCase();
    if (!text) continue;
    if (/^(sun|sunday|\u5468\u65E5|\u9031\u65E5|\u5468\u5929|\u661F\u671F\u65E5|\u661F\u671F\u5929)$/.test(text)) { pushDay(0); continue; }
    if (/^(mon|monday|\u5468\u4E00|\u9031\u4E00|\u661F\u671F\u4E00)$/.test(text)) { pushDay(1); continue; }
    if (/^(tue|tues|tuesday|\u5468\u4E8C|\u9031\u4E8C|\u661F\u671F\u4E8C)$/.test(text)) { pushDay(2); continue; }
    if (/^(wed|wednesday|\u5468\u4E09|\u9031\u4E09|\u661F\u671F\u4E09)$/.test(text)) { pushDay(3); continue; }
    if (/^(thu|thur|thurs|thursday|\u5468\u56DB|\u9031\u56DB|\u661F\u671F\u56DB)$/.test(text)) { pushDay(4); continue; }
    if (/^(fri|friday|\u5468\u4E94|\u9031\u4E94|\u661F\u671F\u4E94)$/.test(text)) { pushDay(5); continue; }
    if (/^(sat|saturday|\u5468\u516D|\u9031\u516D|\u661F\u671F\u516D)$/.test(text)) { pushDay(6); continue; }
    const number = Number(text);
    if (Number.isFinite(number)) pushDay(number === 0 ? 0 : Math.max(1, Math.min(7, Math.trunc(number))));
  }
  if (!out.length) {
    out.push(readingPlanStartDateTime(normalizeReadingPlanStartDate(startDate, options), "00:00", options).getDay());
  }
  return out.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
}

function studyPlanWeekdayLabel(day) {
  return ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][day] || "";
}

function normalizeStudyPlanSchedule(raw = {}, startDate = "", timeOfDay = "", options = {}) {
  const frequency = normalizeStudyPlanScheduleFrequency(
    raw.scheduleFrequency
    || raw.schedule_frequency
    || raw.frequency
    || raw.recurrence
    || raw.repeat
    || "",
  );
  const weekdays = normalizeStudyPlanWeekdays(
    raw.scheduleWeekdays
    || raw.schedule_weekdays
    || raw.weekdays
    || raw.weekday
    || raw.weekDays
    || raw.week_days
    || "",
    startDate,
    options,
  );
  const monthDay = Math.max(1, Math.min(31, Number(
    raw.scheduleMonthDay || raw.schedule_month_day || raw.monthDay || raw.month_day || readingPlanStartDateTime(startDate, timeOfDay, options).getDate(),
  ) || 1));
  const label = frequency === "weekly"
    ? `\u6BCF\u5468 ${weekdays.map(studyPlanWeekdayLabel).filter(Boolean).join("\u3001") || "\u6307\u5B9A\u65E5"}`
    : (frequency === "monthly" ? `\u6BCF\u6708 ${monthDay} \u65E5` : "\u6BCF\u65E5");
  return {
    frequency,
    weekdays,
    weekdaysOneBased: weekdays.map((day) => (day === 0 ? 7 : day)),
    monthDay,
    label,
    startDate,
    timeOfDay,
  };
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function readingPlanScheduleDueTime(schedule = {}, occurrenceIndex = 0, options = {}) {
  const index = Math.max(0, Number(occurrenceIndex) || 0);
  const start = readingPlanStartDateTime(schedule.startDate, schedule.timeOfDay, options);
  if (schedule.frequency === "weekly") {
    const weekdays = Array.isArray(schedule.weekdays) && schedule.weekdays.length ? schedule.weekdays : [start.getDay()];
    const date = new Date(start.getTime());
    let seen = 0;
    for (let guard = 0; guard < 3700; guard += 1) {
      if (weekdays.includes(date.getDay())) {
        if (seen === index) return formatLocalDateTime(date);
        seen += 1;
      }
      date.setDate(date.getDate() + 1);
    }
    return formatLocalDateTime(date);
  }
  if (schedule.frequency === "monthly") {
    const targetDay = Math.max(1, Math.min(31, Number(schedule.monthDay || start.getDate()) || start.getDate()));
    let seen = 0;
    for (let monthOffset = 0; monthOffset < 240; monthOffset += 1) {
      const candidateMonth = start.getMonth() + monthOffset;
      const candidateYear = start.getFullYear() + Math.floor(candidateMonth / 12);
      const normalizedMonth = ((candidateMonth % 12) + 12) % 12;
      const day = Math.min(targetDay, daysInMonth(candidateYear, normalizedMonth));
      const candidate = new Date(candidateYear, normalizedMonth, day, start.getHours(), start.getMinutes(), 0, 0);
      if (candidate < start) continue;
      if (seen === index) return formatLocalDateTime(candidate);
      seen += 1;
    }
  }
  const date = new Date(start.getTime());
  date.setDate(date.getDate() + index);
  return formatLocalDateTime(date);
}

function studyPlanMaxSessions(options = {}) {
  const value = options.maxSessions ?? options.readingPlanMaxSessions ?? options.studyPlanMaxSessions ?? DEFAULT_READING_PLAN_MAX_SESSIONS;
  return Math.max(1, Math.min(60, Number(value) || DEFAULT_READING_PLAN_MAX_SESSIONS));
}

function normalizeStudyPlanWorkspaceIdList(value, options = {}) {
  const normalize = typeof options.normalizeWorkspaceIdList === "function"
    ? options.normalizeWorkspaceIdList
    : null;
  if (normalize) return normalize(value);
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;\uFF0C\u3001\uFF1B]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = cleanString(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeKanbanStudyPlan(raw = {}, workspaceId = "owner", options = {}) {
  const mode = "study-plan";
  const template = normalizeKanbanStudyTemplate(raw);
  if (template === "programming") {
    return normalizeKanbanAssessmentPlan(programmingAssessmentPlanInputFromStudyInput(raw), workspaceId, options);
  }
  const readingTemplate = template === "reading";
  const ownerWorkspaceId = String(workspaceId || "owner");
  const contentTitle = compactText(
    raw.contentTitle
    || raw.content_title
    || raw.bookTitle
    || raw.book_title
    || raw.title
    || "",
    120,
  );
  if (!contentTitle) throw new Error("Study plan contentTitle is required");
  const learnerName = compactText(
    raw.learnerName
    || raw.learner_name
    || raw.readerName
    || raw.reader_name
    || raw.reader
    || raw.targetName
    || raw.target_name
    || "\u5B66\u4E60\u8005",
    80,
  );
  const subject = compactText(raw.subject || raw.domain || (readingTemplate ? "\u82F1\u8BED\u9605\u8BFB" : "\u5B66\u4E60"), 80);
  const activity = compactText(raw.activity || raw.activityType || raw.activity_type || (readingTemplate ? "\u9605\u8BFB\u590D\u8FF0" : "\u63D0\u4EA4\u6210\u679C\u5E76\u8003\u6838"), 120);
  const submissionLabel = compactText(raw.submissionLabel || raw.submission_label || (readingTemplate ? "\u590D\u8FF0\u5F55\u97F3" : "\u5B66\u4E60\u6210\u679C\u6587\u4EF6\u6216\u6587\u5B57"), 120);
  const sessions = Math.max(1, Math.min(studyPlanMaxSessions(options), Number(raw.sessions || raw.sessionCount || raw.session_count || 10) || 10));
  const now = dateNow(options);
  const startDate = normalizeReadingPlanStartDate(raw.startDate || raw.start_date, { now });
  const timeOfDay = normalizeReadingPlanTime(raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time);
  const schedule = normalizeStudyPlanSchedule(raw, startDate, timeOfDay, { now });
  const reminderLeadMinutes = Math.max(0, Math.min(24 * 60, Number(raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 15) || 0));
  const sourceText = compactText(raw.sourceText || raw.source_text || raw.text || raw.notes || "", 4000);
  const performerWorkspaceIds = normalizeStudyPlanWorkspaceIdList(
    raw.performerWorkspaceIds
    || raw.performer_workspace_ids
    || raw.targetWorkspaceIds
    || raw.target_workspace_ids
    || raw.performerWorkspaceId
    || raw.performer_workspace_id
    || raw.targetWorkspaceId
    || raw.target_workspace_id
    || "",
    options,
  ).filter((id) => id !== ownerWorkspaceId);
  const viewerWorkspaceIds = normalizeStudyPlanWorkspaceIdList(
    raw.viewerWorkspaceIds
    || raw.viewer_workspace_ids
    || raw.readonlyWorkspaceIds
    || raw.readonly_workspace_ids
    || "",
    options,
  ).filter((id) => id !== ownerWorkspaceId && !performerWorkspaceIds.includes(id));
  const summary = compactText(`${learnerName}\uFF1A${subject} - ${contentTitle}`, 180);
  const idTimestamp = typeof options.nowMs === "function" ? options.nowMs() : Date.now();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const id = String(raw.id || `study-plan-${idTimestamp}-${randomBytes(3).toString("hex")}`);
  const cards = Array.from({ length: sessions }, (_, index) => {
    const day = index + 1;
    const title = readingTemplate
      ? `${learnerName}\u9605\u8BFB\u300A${contentTitle}\u300B\u7B2C ${day}/${sessions} \u6B21\uFF1A\u5F55\u97F3\u590D\u8FF0`
      : `${learnerName}${subject}\u7B2C ${day}/${sessions} \u6B21\uFF1A\u63D0\u4EA4\u6210\u679C`;
    const description = compactText([
      `\u5B66\u4E60\u8BA1\u5212\uFF1A${summary}`,
      `\u7B2C ${day} \u6B21\uFF0C\u5171 ${sessions} \u6B21\u3002`,
      `\u6267\u884C\u9891\u7387\uFF1A${schedule.label}\uFF0C\u5F00\u59CB\u65F6\u95F4 ${startDate} ${timeOfDay}\u3002`,
      `\u9886\u57DF/\u79D1\u76EE\uFF1A${subject}`,
      `\u5F53\u5929\u4EFB\u52A1\uFF1A${activity}`,
      `\u63D0\u4EA4\u8981\u6C42\uFF1A${submissionLabel}`,
      readingTemplate
        ? "\u5F53\u5929\u9605\u8BFB\u5B8C\u6210\u540E\uFF0C\u9700\u8981\u4E0A\u4F20\u8BED\u97F3\u590D\u8FF0\u6216\u603B\u7ED3\u5F55\u97F3\u3002Hermes Mobile \u4F1A\u5148\u8F6C\u5199\u5F55\u97F3\uFF0C\u518D\u7ED3\u5408\u524D\u9762\u5DF2\u5B8C\u6210\u5361\u7247\u7684\u53CD\u9988\u751F\u6210\u8BC4\u4EF7\u3001\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377\u548C\u4E0B\u4E00\u6B21\u6307\u5BFC\uFF1B\u7B54\u5377 10 \u9898\u5168\u5BF9\u540E\uFF0C\u672C\u5361\u7247\u624D\u4F1A\u5B8C\u6210\u3002"
        : "\u5F53\u5929\u5B66\u4E60\u5B8C\u6210\u540E\uFF0C\u63D0\u4EA4\u6210\u679C\u6587\u4EF6\u3001\u6587\u5B57\u8BF4\u660E\u6216\u5F55\u97F3\u3002Hermes Mobile \u4F1A\u63D0\u53D6\u53EF\u8BFB\u5185\u5BB9\u3001\u751F\u6210\u8BC4\u4EF7\u3001\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377\u548C\u4E0B\u4E00\u6B21\u6307\u5BFC\uFF1B\u7B54\u5377 10 \u9898\u5168\u5BF9\u540E\uFF0C\u672C\u5361\u7247\u624D\u4F1A\u5B8C\u6210\u3002",
      sourceText ? `\u6574\u4F53\u8981\u6C42\uFF1A\n${sourceText}` : "",
    ].filter(Boolean).join("\n\n"), 1800);
    return {
      clientId: `${template}-session-${day}`,
      title,
      day,
      dueTime: readingPlanScheduleDueTime(schedule, index, { now }),
      description,
      deliverables: readingTemplate
        ? ["\u8BFB\u540E\u590D\u8FF0\u5F55\u97F3", "AI\u9605\u8BFB\u8BC4\u4EF7", "\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377", "\u4E0B\u4E00\u6B21\u9605\u8BFB\u6307\u5BFC"]
        : ["\u5B66\u4E60\u6210\u679C\u63D0\u4EA4", "AI\u8BC4\u4EF7", "\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377", "\u4E0B\u4E00\u6B21\u5B66\u4E60\u6307\u5BFC"],
      acceptance: readingTemplate
        ? ["\u5DF2\u4E0A\u4F20\u5F53\u5929\u5F55\u97F3", "\u5DF2\u751F\u6210\u8F6C\u5199\u548CAI\u8BC4\u4EF7", "10\u9898\u5355\u9009\u8003\u5377\u5168\u5BF9", "\u5361\u7247\u5B8C\u6210\u7ED3\u679C\u5305\u542B\u5206\u6790\u6587\u4EF6"]
        : ["\u5DF2\u63D0\u4EA4\u5F53\u5929\u5B66\u4E60\u6210\u679C", "\u5DF2\u751F\u6210AI\u8BC4\u4EF7", "10\u9898\u5355\u9009\u8003\u5377\u5168\u5BF9", "\u5361\u7247\u5B8C\u6210\u7ED3\u679C\u5305\u542B\u5206\u6790\u6587\u4EF6"],
    };
  });
  return {
    id,
    mode,
    template,
    workspaceId: ownerWorkspaceId,
    bookTitle: contentTitle,
    contentTitle,
    readerName: learnerName,
    learnerName,
    subject,
    activity,
    submissionLabel,
    sessions,
    startDate,
    timeOfDay,
    scheduleFrequency: schedule.frequency,
    scheduleWeekdays: schedule.weekdaysOneBased,
    scheduleMonthDay: schedule.monthDay,
    scheduleLabel: schedule.label,
    reminderLeadMinutes,
    sourceText,
    summary,
    performerWorkspaceIds,
    viewerWorkspaceIds,
    cards,
  };
}

function programmingAssessmentPlanInputFromStudyInput(raw = {}) {
  const subject = compactText(raw.subject || raw.subjectDomain || raw.subject_domain || raw.domain || raw.course || "Python \u7f16\u7a0b", 80);
  const title = compactText(
    raw.planTitle
    || raw.plan_title
    || raw.activityTitle
    || raw.activity_title
    || raw.bookTitle
    || raw.book_title
    || raw.contentTitle
    || raw.content_title
    || raw.title
    || `${subject} \u7f16\u7a0b\u6d4b\u9a8c\u8ba1\u5212`,
    140,
  );
  const sourceText = raw.sourceText || raw.source_text || raw.text || raw.notes || raw.blueprint || raw.examBlueprint || raw.exam_blueprint || "";
  return Object.assign({}, raw, {
    caseMode: "assessment-plan",
    subject,
    domain: subject,
    title,
    planTitle: title,
    courseLevel: raw.courseLevel || raw.course_level || raw.grade || raw.level || "\u7f16\u7a0b\u7ec3\u4e60",
    examCount: raw.examCount || raw.exam_count || raw.sessions || raw.sessionCount || raw.session_count || 10,
    questionCount: raw.questionCount || raw.question_count || 10,
    durationMinutes: raw.durationMinutes || raw.duration_minutes || 30,
    passingScore: raw.passingScore || raw.passing_score || 80,
    intervalDays: raw.intervalDays || raw.interval_days || 7,
    startDate: raw.startDate || raw.start_date,
    timeOfDay: raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time,
    reminderLeadMinutes: raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 30,
    difficulty: raw.difficulty || raw.difficultyMix || raw.difficulty_mix || "\u57fa\u784040% / \u5e94\u752840% / \u6311\u621820%",
    blueprint: sourceText || "\u6bcf\u5f20\u5361\u7247\u5f00\u653e\u540e\uff0c\u5148\u586b\u5199\u672c\u6b21\u7f16\u7a0b\u8981\u6c42\u3001\u6559\u5b66\u91cd\u70b9\u3001\u8bfe\u5802\u8868\u73b0\u6216\u9879\u76ee\u80cc\u666f\uff0c\u518d\u751f\u6210\u9488\u5bf9\u6027\u7f16\u7a0b\u6d4b\u9a8c\u3002",
  });
}

function normalizeAssessmentPlanWorkspaceIdList(value, options = {}) {
  const normalize = typeof options.normalizeWorkspaceIdList === "function"
    ? options.normalizeWorkspaceIdList
    : null;
  if (normalize) return normalize(value);
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;\uFF0C\u3001\uFF1B]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = cleanString(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeAssessmentPlanStartDate(value, options = {}) {
  const text = cleanString(value);
  const match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  if (!match) return formatLocalDate(now);
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function normalizeAssessmentPlanTime(value) {
  const text = cleanString(value);
  const match = text.match(/^(\d{1,2})(?::|\uFF1A)(\d{1,2})$/);
  if (!match) return "21:00";
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${pad2(hour)}:${pad2(minute)}`;
}

function assessmentPlanDueTime(startDate, timeOfDay, dayOffset, options = {}) {
  const dateMatch = cleanString(startDate).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizeAssessmentPlanTime(timeOfDay).match(/^(\d{2}):(\d{2})$/);
  const date = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
    : (options.now instanceof Date ? new Date(options.now.getTime()) : new Date());
  date.setDate(date.getDate() + Math.max(0, Number(dayOffset) || 0));
  return formatLocalDateTime(date);
}

function assessmentPlanMaxExams(options = {}) {
  const value = options.maxExams ?? options.assessmentPlanMaxExams ?? DEFAULT_ASSESSMENT_PLAN_MAX_EXAMS;
  return Math.max(1, Math.min(30, Number(value) || DEFAULT_ASSESSMENT_PLAN_MAX_EXAMS));
}

function assessmentMaxQuestions(options = {}) {
  const value = options.maxQuestions ?? options.assessmentMaxQuestions ?? DEFAULT_ASSESSMENT_MAX_QUESTIONS;
  return Math.max(5, Math.min(40, Number(value) || DEFAULT_ASSESSMENT_MAX_QUESTIONS));
}

function normalizeKanbanAssessmentSubjectId(value = "") {
  const text = lowerString(value);
  if (/programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|\u7f16\u7a0b|\u7a0b\u5f0f|\u7a0b\u5e8f|\u4ee3\u7801|\u4ee3\u78bc|\u7b97\u6cd5|\u5f00\u53d1|\u958b\u767c/.test(text)) return "programming";
  if (/math|\u6570\u5b66|\u6578\u5b78|amc/.test(text)) return "math";
  if (/english|\u82f1\u8bed|\u82f1\u6587|reading|language/.test(text)) return "english";
  if (/science|\u79d1\u5b66|\u79d1\u5b78|physics|chemistry|biology/.test(text)) return "science";
  if (/history|\u5386\u53f2|\u6b77\u53f2/.test(text)) return "history";
  if (/chinese|\u4e2d\u6587|\u8bed\u6587|\u8a9e\u6587/.test(text)) return "chinese";
  return safeSlug(text || "assessment", "assessment").slice(0, 40) || "assessment";
}

function normalizeKanbanAssessmentPlan(raw = {}, workspaceId = "owner", options = {}) {
  const ownerWorkspaceId = cleanString(workspaceId) || "owner";
  const linkedStudyPlan = Boolean(options.linkedStudyPlan);
  const now = dateNow(options);
  const subject = compactText(raw.subject || raw.domain || raw.course || "\u6570\u5b66", 80);
  const subjectId = normalizeKanbanAssessmentSubjectId(subject);
  const learnerName = compactText(raw.learnerName || raw.learner_name || raw.targetName || raw.target_name || "\u5b66\u4e60\u8005", 80);
  const courseLevel = compactText(raw.courseLevel || raw.course_level || raw.grade || raw.level || "\u9636\u6bb5\u68c0\u6d4b", 80);
  const title = compactText(raw.title || raw.planTitle || raw.plan_title || `${learnerName} ${subject} \u8003\u8bd5\u8ba1\u5212`, 140);
  const examCount = Math.max(1, Math.min(assessmentPlanMaxExams(options), Number(raw.examCount || raw.exam_count || raw.sessions || 10) || 10));
  const questionCount = Math.max(5, Math.min(assessmentMaxQuestions(options), Number(raw.questionCount || raw.question_count || 20) || 20));
  const durationMinutes = Math.max(5, Math.min(180, Number(raw.durationMinutes || raw.duration_minutes || 30) || 30));
  const passingScore = Math.max(50, Math.min(100, Number(raw.passingScore || raw.passing_score || 80) || 80));
  const intervalDays = Math.max(1, Math.min(60, Number(raw.intervalDays || raw.interval_days || raw.examIntervalDays || raw.exam_interval_days || 14) || 14));
  const startDate = normalizeAssessmentPlanStartDate(raw.startDate || raw.start_date, Object.assign({}, options, { now }));
  const timeOfDay = normalizeAssessmentPlanTime(raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time);
  const scheduled = own(raw, "scheduleFrequency")
    || own(raw, "schedule_frequency")
    || own(raw, "scheduleWeekdays")
    || own(raw, "schedule_weekdays")
    || own(raw, "weekdays")
    || own(raw, "weekday")
    || own(raw, "weekDays")
    || own(raw, "week_days")
    || own(raw, "scheduleMonthDay")
    || own(raw, "schedule_month_day")
    || own(raw, "monthDay")
    || own(raw, "month_day");
  const schedule = scheduled ? normalizeStudyPlanSchedule(raw, startDate, timeOfDay, Object.assign({}, options, { now })) : null;
  const reminderLeadMinutes = Math.max(0, Math.min(24 * 60, Number(raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 30) || 0));
  const difficulty = compactText(raw.difficulty || raw.difficultyMix || raw.difficulty_mix || "\u57fa\u784030% / \u4e2d\u7b4950% / \u6311\u621820%", 160);
  const blueprint = compactText(raw.blueprint || raw.examBlueprint || raw.exam_blueprint || raw.sourceText || raw.source_text || raw.text || "", 4000);
  const retakeUntilPass = raw.retakeUntilPass ?? raw.retake_until_pass ?? true;
  const performerWorkspaceIds = normalizeAssessmentPlanWorkspaceIdList(
    raw.performerWorkspaceIds
    || raw.performer_workspace_ids
    || raw.targetWorkspaceIds
    || raw.target_workspace_ids
    || raw.performerWorkspaceId
    || raw.performer_workspace_id
    || raw.targetWorkspaceId
    || raw.target_workspace_id
    || "",
    options,
  ).filter((id) => id !== ownerWorkspaceId);
  const viewerWorkspaceIds = normalizeAssessmentPlanWorkspaceIdList(
    raw.viewerWorkspaceIds
    || raw.viewer_workspace_ids
    || raw.readonlyWorkspaceIds
    || raw.readonly_workspace_ids
    || "",
    options,
  ).filter((id) => id !== ownerWorkspaceId && !performerWorkspaceIds.includes(id));
  const idTimestamp = typeof options.nowMs === "function" ? options.nowMs() : Date.now();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const id = String(raw.id || `assessment-plan-${idTimestamp}-${randomBytes(3).toString("hex")}`);
  const summary = compactText(`${learnerName}\uFF1A${subject} ${courseLevel} - ${title}`, 180);
  const baseConfig = {
    schemaVersion: 1,
    kind: linkedStudyPlan ? "final-study-assessment" : "assessment-plan",
    template: subjectId === "programming" ? "programming" : "assessment",
    subject,
    subjectId,
    learnerName,
    courseLevel,
    questionCount,
    durationMinutes,
    passingScore,
    difficulty,
    retakeUntilPass: Boolean(retakeUntilPass),
    requiresRequirementInput: subjectId === "programming",
  };
  const cards = Array.from({ length: examCount }, (_, index) => {
    const number = index + 1;
    const finalExam = linkedStudyPlan && number === examCount;
    const config = Object.assign({}, baseConfig, {
      examIndex: number,
      examCount,
      finalExam,
    });
    const cardTitle = finalExam
      ? `${learnerName}${subject}\u9636\u6bb5\u7ed3\u675f\u7efc\u5408\u8003\u8bd5`
      : (subjectId === "programming"
        ? `${learnerName}${subject}\u7b2c ${number}/${examCount} \u6b21\u7f16\u7a0b\u6d4b\u9a8c`
        : `${learnerName}${subject}\u7b2c ${number}/${examCount} \u6b21\u6b63\u5f0f\u6d4b\u8bd5`);
    const description = compactText([
      `\u8003\u8bd5\u8ba1\u5212\uFF1A${summary}`,
      `\u79d1\u76ee\uFF1A${subject}`,
      `\u9636\u6bb5\uFF1A${courseLevel}`,
      `\u9898\u91CF\uFF1A${questionCount} \u9898`,
      `\u65F6\u957F\uFF1A${durationMinutes} \u5206\u949F`,
      `\u901A\u8FC7\u7EBF\uFF1A${passingScore} \u5206`,
      `\u96BE\u5EA6\uFF1A${difficulty}`,
      subjectId === "programming"
        ? "\u8FD9\u662F\u7F16\u7A0B\u6D4B\u9A8C\u5361\u7247\uFF1B\u5F00\u653E\u540E\u5148\u586B\u5199\u672C\u6B21\u7F16\u7A0B\u9700\u6C42\u3001\u6559\u5B66\u91CD\u70B9\u6216\u9879\u76EE\u80CC\u666F\uFF0CHermes Mobile \u518D\u751F\u6210\u9488\u5BF9\u6027\u8003\u9898\u3002\u4F4E\u4E8E\u901A\u8FC7\u7EBF\u65F6\u4E0D\u5B8C\u6210\u5361\u7247\uFF0C\u7EE7\u7EED\u4FDD\u6301\u91CD\u8003\u72B6\u6001\u3002"
        : "\u8FD9\u662F\u6B63\u5F0F\u68C0\u6D4B\u5361\u7247\uFF0C\u96BE\u5EA6\u9AD8\u4E8E\u6BCF\u65E5\u5C0F\u6D4B\uFF1B\u4F4E\u4E8E\u901A\u8FC7\u7EBF\u65F6\u4E0D\u5B8C\u6210\u5361\u7247\uFF0C\u7EE7\u7EED\u4FDD\u6301\u91CD\u8003\u72B6\u6001\u3002",
      finalExam ? "\u8FD9\u662F\u5B66\u4E60\u8BA1\u5212\u7684\u6700\u7EC8\u9636\u6BB5\u8003\u8BD5\uFF1B\u53EA\u6709\u8FBE\u5230\u901A\u8FC7\u7EBF\u540E\uFF0C\u9636\u6BB5\u5B66\u4E60\u8BA1\u5212\u624D\u7B97\u5B8C\u6210\u3002" : "",
      blueprint ? `\u8003\u8BD5\u84DD\u56FE\uFF1A\n${blueprint}` : "",
    ].filter(Boolean).join("\n\n"), 1800);
    return {
      clientId: finalExam ? "final-assessment" : `assessment-exam-${number}`,
      title: cardTitle,
      dueTime: schedule
        ? readingPlanScheduleDueTime(schedule, index, { now })
        : assessmentPlanDueTime(startDate, timeOfDay, index * intervalDays, Object.assign({}, options, { now })),
      description,
      config,
      deliverables: subjectId === "programming"
        ? ["\u672C\u6B21\u7F16\u7A0B\u9700\u6C42", "\u9488\u5BF9\u6027\u7F16\u7A0B\u6D4B\u9A8C", "\u81EA\u52A8\u8BC4\u5206", "\u9898\u76EE\u8BB2\u89E3\u548C\u7F16\u7A0B\u65E5\u5FD7"]
        : ["\u6B63\u5F0F\u8003\u5377", "\u81EA\u52A8\u8BC4\u5206", "\u80FD\u529B\u8BCA\u65AD", "\u9519\u9898\u4E0E\u8865\u5F3A\u5EFA\u8BAE"],
      acceptance: subjectId === "programming" ? [
        "\u5DF2\u586B\u5199\u672C\u6B21\u7F16\u7A0B\u9700\u6C42\u6216\u6559\u5B66\u80CC\u666F",
        `\u5B8C\u6210 ${questionCount} \u9898\u7F16\u7A0B\u6D4B\u9A8C`,
        `\u5F97\u5206\u8FBE\u5230 ${passingScore}/100`,
        "\u751F\u6210\u542B\u9898\u76EE\u8BB2\u89E3\u548C\u9700\u6C42\u6E05\u6D17\u7684\u7F16\u7A0B\u65E5\u5FD7",
      ] : [
        `\u5B8C\u6210 ${questionCount} \u9898\u6B63\u5F0F\u6D4B\u8BD5`,
        `\u5F97\u5206\u8FBE\u5230 ${passingScore}/100`,
        "\u672A\u8FBE\u6807\u5219\u4FDD\u7559\u4E3A\u91CD\u8003\u72B6\u6001",
        "\u751F\u6210\u8003\u8BD5\u62A5\u544A\u548C\u4E0B\u4E00\u6B65\u8865\u5F3A\u5EFA\u8BAE",
      ],
    };
  });
  return Object.assign({
    id,
    mode: linkedStudyPlan ? "study-plan" : "assessment-plan",
    template: linkedStudyPlan ? "final-assessment" : subjectId,
    workspaceId: ownerWorkspaceId,
    subject,
    subjectId,
    learnerName,
    courseLevel,
    title,
    examCount,
    questionCount,
    durationMinutes,
    passingScore,
    intervalDays,
    startDate,
    timeOfDay,
    reminderLeadMinutes,
    difficulty,
    blueprint,
    retakeUntilPass: Boolean(retakeUntilPass),
    summary,
    performerWorkspaceIds,
    viewerWorkspaceIds,
    cards,
  }, schedule ? {
    scheduleFrequency: schedule.frequency,
    scheduleWeekdays: schedule.weekdaysOneBased,
    scheduleMonthDay: schedule.monthDay,
    scheduleLabel: schedule.label,
  } : {});
}

function isStudyKind(kind) {
  return kind === "study" || kind === "reading";
}

function isAssessmentKind(kind) {
  return kind === "assessment" || kind === "final-assessment";
}

function workflowState(card = {}, kind = normalizeStudyAssessmentKind(card)) {
  if (isAssessmentKind(kind)) {
    return card.assessmentExam || card.assessmentState || card.examState || {};
  }
  if (isStudyKind(kind)) {
    return card.readingSubmission || card.studySubmission || card.readingState || card.studyState || {};
  }
  return {};
}

function normalizedAttempts(state = {}) {
  const attempts = Array.isArray(state.attempts) ? state.attempts.slice() : [];
  if (state.lastAttempt && typeof state.lastAttempt === "object") {
    const last = state.lastAttempt;
    const duplicate = attempts.some((attempt) => (
      cleanString(attempt.id) && cleanString(attempt.id) === cleanString(last.id)
    ));
    if (!duplicate) attempts.push(last);
  }
  return attempts.filter((attempt) => attempt && typeof attempt === "object");
}

function attemptPassed(attempt = {}, options = {}) {
  if (attempt.passed === true) return true;
  if (attempt.passed === false) return false;
  if (attempt.pass === true) return true;
  const correctCount = Number(attempt.correctCount ?? attempt.correct_count);
  const questionCount = Number(attempt.questionCount ?? attempt.question_count ?? attempt.totalQuestions ?? attempt.total_questions);
  if (options.requireAllCorrect && Number.isFinite(correctCount) && Number.isFinite(questionCount) && questionCount > 0) {
    return correctCount >= questionCount;
  }
  const score = Number(attempt.score ?? attempt.percent);
  const passScore = Number(attempt.passScore ?? attempt.pass_score ?? options.passScore);
  if (Number.isFinite(score) && Number.isFinite(passScore)) return score >= passScore;
  return false;
}

function attemptFailed(attempt = {}, options = {}) {
  if (attempt.passed === false || attempt.pass === false) return true;
  const correctCount = Number(attempt.correctCount ?? attempt.correct_count);
  const questionCount = Number(attempt.questionCount ?? attempt.question_count ?? attempt.totalQuestions ?? attempt.total_questions);
  if (options.requireAllCorrect && Number.isFinite(correctCount) && Number.isFinite(questionCount) && questionCount > 0) {
    return correctCount < questionCount;
  }
  const score = Number(attempt.score ?? attempt.percent);
  const passScore = Number(attempt.passScore ?? attempt.pass_score ?? options.passScore);
  if (Number.isFinite(score) && Number.isFinite(passScore)) return score < passScore;
  return false;
}

function latestAttempt(state = {}) {
  const attempts = normalizedAttempts(state);
  return attempts.length ? attempts[attempts.length - 1] : null;
}

function hasPassedAttempt(state = {}, options = {}) {
  return normalizedAttempts(state).some((attempt) => attemptPassed(attempt, options));
}

function hasFailedAttempt(state = {}, options = {}) {
  return normalizedAttempts(state).some((attempt) => attemptFailed(attempt, options));
}

function latestAttemptFailed(state = {}, options = {}) {
  const attempt = latestAttempt(state);
  return Boolean(attempt && attemptFailed(attempt, options));
}

function isStudyQuizComplete(state = {}, options = {}) {
  if (!state || typeof state !== "object") return false;
  if (state.completionError) return false;
  if (state.quizRequired === false || state.requiresQuiz === false) {
    return lowerString(state.status) === "completed";
  }
  if (state.passed === true || state.quizPassed === true) return true;
  return hasPassedAttempt(state, Object.assign({ requireAllCorrect: true }, options));
}

function isAssessmentExamComplete(state = {}, options = {}) {
  if (!state || typeof state !== "object") return false;
  if (state.completionError) return false;
  if (state.examRequired === false || state.requiresExam === false) {
    return lowerString(state.status) === "completed";
  }
  if (state.passed === true || state.examPassed === true) return true;
  return hasPassedAttempt(state, options);
}

function studyHasAnalysis(state = {}) {
  return Boolean(
    state.quiz
    || state.quizAvailable
    || state.analysisPath
    || state.analysisOutput
    || ["quiz_pending", "quiz_retry_required", "completed"].includes(lowerString(state.status))
  );
}

function step(status, active = false) {
  return { status, active: Boolean(active) };
}

function deriveSubmissionWorkflowState(cardOrState = {}, options = {}) {
  const state = cardOrState && (
    cardOrState.readingSubmission
    || cardOrState.studySubmission
    || cardOrState.readingState
    || cardOrState.studyState
  ) ? workflowState(cardOrState, "reading") : (cardOrState || {});
  const passed = isStudyQuizComplete(state, options);
  const failed = latestAttemptFailed(state, Object.assign({ requireAllCorrect: true }, options));
  const status = lowerString(state.status);
  const submitted = Boolean(
    state.submittedAt
    || state.submissionId
    || state.audioPath
    || state.transcriptPath
    || ["submitted", "transcribing", "analyzing", "analysis_pending", "quiz_pending", "completed"].includes(status)
  );
  const hasAnalysis = studyHasAnalysis(state);

  let phase = "submission_open";
  if (passed) phase = "completed";
  else if (failed || status === "quiz_retry_required") phase = "quiz_retry_required";
  else if (hasAnalysis) phase = "quiz_pending";
  else if (submitted || ["submitted", "transcribing", "analyzing", "analysis_pending"].includes(status)) phase = "analysis_pending";

  const submitStatus = submitted || hasAnalysis || passed ? "done" : "active";
  const analysisStatus = passed || hasAnalysis ? "done" : (phase === "analysis_pending" ? "active" : "locked");
  const quizStatus = passed ? "done" : (phase === "quiz_pending" || phase === "quiz_retry_required" ? "active" : "locked");
  return {
    kind: "study-submission",
    phase,
    completed: passed,
    retryRequired: phase === "quiz_retry_required",
    attempts: normalizedAttempts(state).length,
    steps: {
      submit: step(submitStatus, phase === "submission_open"),
      analyze: step(analysisStatus, phase === "analysis_pending"),
      quiz: step(quizStatus, phase === "quiz_pending" || phase === "quiz_retry_required"),
    },
  };
}

function deriveExamWorkflowState(cardOrState = {}, options = {}) {
  const cardLooksLikeInput = cardOrState && (
    own(cardOrState, "assessmentExam")
    || own(cardOrState, "assessmentState")
    || own(cardOrState, "examState")
    || own(cardOrState, "kanbanCaseTemplate")
    || own(cardOrState, "kanban_case_template")
  );
  const card = cardLooksLikeInput ? cardOrState : {};
  const state = cardLooksLikeInput ? workflowState(card, normalizeStudyAssessmentKind(card)) : (cardOrState || {});
  const kind = normalizeStudyAssessmentKind(card) || (options.finalAssessment ? "final-assessment" : "assessment");
  const finalAssessment = kind === "final-assessment" || Boolean(options.finalAssessment);
  const completed = isAssessmentExamComplete(state, options);
  const failed = latestAttemptFailed(state, options) || (
    hasFailedAttempt(state, options) && !completed && (finalAssessment || lowerString(state.status) === "retake_required")
  );
  const status = lowerString(state.status);
  let phase = "exam_open";
  if (completed) phase = "completed";
  else if (failed || status === "retake_required") phase = "retake_required";
  else if (state.examAvailable || state.exam || status === "in_progress") phase = "in_progress";
  return {
    kind: finalAssessment ? "final-assessment" : "assessment",
    phase,
    completed,
    retryRequired: phase === "retake_required",
    mustRetakeUntilPassed: finalAssessment && !completed && (phase === "retake_required" || hasFailedAttempt(state, options)),
    attempts: normalizedAttempts(state).length,
    latestAttemptPassed: Boolean(latestAttempt(state) && attemptPassed(latestAttempt(state), options)),
  };
}

function permissionsForStudyAssessmentRole(role) {
  const normalized = lowerString(role);
  if (normalized === "manager") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canStartExam: true,
      canAnswerExam: true,
      canRetakeFinalExam: true,
      canModifyPlan: true,
      canManagePlan: true,
      canDeletePlan: true,
    };
  }
  if (normalized === "performer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canStartExam: true,
      canAnswerExam: true,
      canRetakeFinalExam: true,
      canModifyPlan: false,
      canManagePlan: false,
      canDeletePlan: false,
    };
  }
  if (normalized === "viewer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: false,
      canAnswerQuiz: false,
      canStartExam: false,
      canAnswerExam: false,
      canRetakeFinalExam: false,
      canModifyPlan: false,
      canManagePlan: false,
      canDeletePlan: false,
    };
  }
  return {
    canView: false,
    canComment: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
    canStartExam: false,
    canAnswerExam: false,
    canRetakeFinalExam: false,
    canModifyPlan: false,
    canManagePlan: false,
    canDeletePlan: false,
  };
}

function actorRoleForStudyAssessmentPlan(record = {}, actor = null) {
  const directRole = !actor ? lowerString(record.actorRole || record.kanbanActorRole || record.role) : "";
  if (CASE_ROLES.has(directRole)) return directRole;
  const role = actorRoleForKanbanCase(record, actor);
  return CASE_ROLES.has(role) ? role : "";
}

function permissionKey(action) {
  const text = cleanString(action).replace(/^can/i, "");
  const normalized = text.slice(0, 1).toLowerCase() + text.slice(1);
  if (["view", "read"].includes(normalized)) return "canView";
  if (["comment", "reply"].includes(normalized)) return "canComment";
  if (["submit", "submitStudy", "upload", "uploadSubmission"].includes(normalized)) return "canSubmitStudy";
  if (["quiz", "answerQuiz", "answerStudyQuiz"].includes(normalized)) return "canAnswerQuiz";
  if (["startExam", "examStart"].includes(normalized)) return "canStartExam";
  if (["answerExam", "exam", "answerAssessment"].includes(normalized)) return "canAnswerExam";
  if (["retake", "retakeFinalExam"].includes(normalized)) return "canRetakeFinalExam";
  if (["modify", "edit", "postpone", "block", "unblock"].includes(normalized)) return "canModifyPlan";
  if (["delete", "remove"].includes(normalized)) return "canDeletePlan";
  return "canManagePlan";
}

function studyAssessmentCanActor(record = {}, actor = null, action = "view") {
  const role = actorRoleForStudyAssessmentPlan(record, actor);
  const permissions = permissionsForStudyAssessmentRole(role);
  return Boolean(permissions[permissionKey(action)]);
}

function dateValue(value) {
  const text = cleanString(value).replace(" ", "T");
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardOpenTimestamp(card = {}) {
  const values = [
    card.availableAt,
    card.available_at,
    card.openAt,
    card.open_at,
    card.scheduledAt,
    card.scheduled_at,
    card.dueAt,
    card.due_at,
    card.dueLocal,
    card.due_local,
  ];
  for (const value of values) {
    const parsed = dateValue(value);
    if (parsed) return parsed;
  }
  return 0;
}

function cardSortIndex(card = {}) {
  return firstNumber(card, [
    "kanbanCaseCardIndex",
    "kanban_case_card_index",
    "caseCardIndex",
    "case_card_index",
    "index",
  ], 0);
}

function cardId(card = {}) {
  return firstString(card, ["id", "todoId", "todo_id", "cardId", "card_id"]);
}

function dependencyIds(card = {}) {
  return firstArray(card, [
    "dependsOn",
    "depends_on",
    "caseDependsOn",
    "case_depends_on",
    "kanbanCaseDependsOn",
    "kanban_case_depends_on",
  ], 50);
}

function studyAssessmentCardId(card = {}) {
  return cardId(card);
}

function studyAssessmentCardSortIndex(card = {}) {
  return cardSortIndex(card);
}

function studyAssessmentDependencyIds(card = {}) {
  return dependencyIds(card);
}

function cardCompleted(card = {}, options = {}) {
  const kind = normalizeStudyAssessmentKind(card);
  const status = normalizeStatus(card);
  if (ARCHIVED_STATUSES.has(status)) return false;
  if (isStudyKind(kind)) {
    return isStudyQuizComplete(workflowState(card, kind), options);
  }
  if (isAssessmentKind(kind)) {
    return isAssessmentExamComplete(workflowState(card, kind), Object.assign({}, options, { finalAssessment: kind === "final-assessment" }));
  }
  return DONE_STATUSES.has(status);
}

function priorContextComplete(card = {}, priorCards = [], options = {}) {
  if (own(options, "priorComplete")) return Boolean(options.priorComplete);
  const kind = normalizeStudyAssessmentKind(card);
  const ids = new Set(dependencyIds(card));
  const candidates = (Array.isArray(priorCards) ? priorCards : []).filter((priorCard) => {
    if (ids.size) return ids.has(cardId(priorCard)) || ids.has(firstString(priorCard, ["kanbanCaseCardId", "kanban_case_card_id"]));
    const priorKind = normalizeStudyAssessmentKind(priorCard);
    if (kind === "final-assessment") return isStudyKind(priorKind) || priorKind === "assessment";
    if (kind === "assessment") return priorKind === "assessment";
    if (isStudyKind(kind)) return isStudyKind(priorKind);
    return true;
  });
  return candidates.every((priorCard) => cardCompleted(priorCard, options));
}

function cardVisibleToActor(record = {}, actor = null) {
  return studyAssessmentCanActor(record, actor, "view");
}

function openRuleReason(fields = {}) {
  if (!fields.visible) return "no_view_permission";
  if (fields.archived) return "archived";
  if (!fields.priorComplete) return "prior_incomplete";
  if (fields.scheduled) return "scheduled";
  if (fields.completed) return "completed";
  if (fields.workflowPhase === "analysis_pending") return "analysis_pending";
  if (fields.workflowPhase === "quiz_retry_required") return "quiz_retry_required";
  if (fields.workflowPhase === "retake_required") return "retake_required";
  if (!fields.allowed) return "permission_denied";
  return "open";
}

function deriveStudyAssessmentCardContract(input = {}) {
  const card = input.card || input;
  const kind = normalizeStudyAssessmentKind(card);
  const caseRecord = input.caseRecord || input.record || { cards: [card] };
  const role = actorRoleForStudyAssessmentPlan(caseRecord, input.actor);
  const permissions = permissionsForStudyAssessmentRole(role);
  const now = input.now ? dateValue(input.now) : (Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now());
  const openAt = cardOpenTimestamp(card);
  const scheduled = Boolean(openAt && openAt > now);
  const status = normalizeStatus(card);
  const archived = ARCHIVED_STATUSES.has(status);
  const priorComplete = priorContextComplete(card, input.priorCards || [], input);
  const visible = cardVisibleToActor(caseRecord, input.actor);

  let workflow = { kind: "", phase: status, completed: DONE_STATUSES.has(status), retryRequired: false };
  let action = "";
  let allowed = false;
  if (isStudyKind(kind)) {
    workflow = deriveSubmissionWorkflowState(workflowState(card, kind), input);
    if (workflow.phase === "submission_open") {
      action = "submitStudy";
      allowed = permissions.canSubmitStudy;
    } else if (workflow.phase === "quiz_pending" || workflow.phase === "quiz_retry_required") {
      action = "answerQuiz";
      allowed = permissions.canAnswerQuiz;
    }
  } else if (isAssessmentKind(kind)) {
    workflow = deriveExamWorkflowState(card, input);
    if (workflow.phase === "exam_open" || workflow.phase === "in_progress") {
      action = workflow.phase === "exam_open" ? "startExam" : "answerExam";
      allowed = workflow.phase === "exam_open" ? permissions.canStartExam : permissions.canAnswerExam;
    } else if (workflow.phase === "retake_required") {
      action = kind === "final-assessment" ? "retakeFinalExam" : "answerExam";
      allowed = kind === "final-assessment" ? permissions.canRetakeFinalExam : permissions.canAnswerExam;
    }
  }
  const completed = Boolean(workflow.completed);
  const open = Boolean(visible && !archived && priorComplete && !scheduled && !completed && allowed && action && workflow.phase !== "analysis_pending");
  const reason = openRuleReason({
    visible,
    archived,
    priorComplete,
    scheduled,
    completed,
    allowed,
    workflowPhase: workflow.phase,
  });
  return {
    cardId: cardId(card),
    kind,
    role,
    permissions,
    status,
    visible,
    open,
    action,
    reason,
    priorComplete,
    scheduled,
    openAt: openAt ? new Date(openAt).toISOString() : "",
    completed,
    workflow,
  };
}

function compareCards(left = {}, right = {}) {
  const leftIndex = cardSortIndex(left) || 999999;
  const rightIndex = cardSortIndex(right) || 999999;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return cardId(left).localeCompare(cardId(right));
}

function buildStudyAssessmentPlanContract(input = {}) {
  const rawCards = Array.isArray(input.cards) ? input.cards : [];
  const cards = rawCards.slice().sort(compareCards);
  const caseRecord = input.caseRecord || normalizeKanbanCaseRecord({
    cards,
    ownerWorkspaceId: input.ownerWorkspaceId,
  });
  const contracts = [];
  for (const card of cards) {
    const priorCards = cards.filter((candidate) => compareCards(candidate, card) < 0);
    contracts.push(deriveStudyAssessmentCardContract(Object.assign({}, input, {
      card,
      caseRecord,
      priorCards,
    })));
  }
  return {
    caseId: caseRecord.caseId || "",
    caseMode: caseRecord.caseMode || "",
    actorRole: actorRoleForStudyAssessmentPlan(caseRecord, input.actor),
    cards: contracts,
    counts: {
      total: contracts.length,
      open: contracts.filter((item) => item.open).length,
      completed: contracts.filter((item) => item.completed).length,
      retakeRequired: contracts.filter((item) => item.workflow.retryRequired).length,
    },
  };
}

module.exports = {
  actorRoleForStudyAssessmentPlan,
  buildStudyAssessmentPlanContract,
  deriveExamWorkflowState,
  deriveStudyAssessmentCardContract,
  deriveSubmissionWorkflowState,
  hasPassedAttempt,
  isAssessmentExamComplete,
  isStudyQuizComplete,
  kanbanCardStudyTemplate,
  kanbanCardUsesReadingTemplate,
  normalizeKanbanAssessmentPlan,
  normalizeKanbanAssessmentSubjectId,
  normalizeKanbanStudyPlan,
  normalizeKanbanStudyTemplate,
  normalizeReadingPlanStartDate,
  normalizeReadingPlanTime,
  normalizeStudyAssessmentKind,
  normalizeStudyPlanSchedule,
  normalizeStudyPlanScheduleFrequency,
  normalizeStudyPlanWeekdays,
  permissionsForStudyAssessmentRole,
  readingPlanDueTime,
  readingPlanScheduleDueTime,
  studyAssessmentCardId,
  studyAssessmentCanActor,
  studyAssessmentCardSortIndex,
  studyAssessmentDependencyIds,
};
