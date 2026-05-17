"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const DEFAULT_MAX_SESSIONS = 31;
const DEFAULT_SHARED_FOLDER_NAME = "study-plan";

function cleanString(value) {
  return String(value ?? "").trim();
}

function defaultCompactText(value, maxChars = 1000) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
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

function safeStorageSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function safeFileName(value, fallback = "item") {
  const base = cleanString(fallback) || "item";
  const name = path.basename(String(value || base)).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  if (!name.replace(/_/g, "").trim()) return base;
  return name || base;
}

function safeDirectoryName(value, fallback = "") {
  const name = safeFileName(value || fallback, fallback || "item").replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") return "";
  return name;
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const item of values || []) {
    const value = cleanString(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeWorkspaceIdList(value, options = {}) {
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : null;
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;，、；]+/);
  return dedupe(raw).filter((id) => !findWorkspace || findWorkspace(id));
}

function normalizeReadingPlanTime(value) {
  const text = cleanString(value);
  const match = text.match(/^(\d{1,2})(?::|：)(\d{1,2})$/);
  if (!match) return "21:00";
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${pad2(hour)}:${pad2(minute)}`;
}

function normalizeReadingPlanStartDate(value, options = {}) {
  const text = cleanString(value);
  const match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  if (!match) return formatLocalDate(now);
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function readingPlanStartDateTime(startDate, timeOfDay, options = {}) {
  const dateMatch = cleanString(startDate).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizeReadingPlanTime(timeOfDay).match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch) {
    const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
    now.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    return now;
  }
  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0,
  );
}

function normalizeStudyPlanScheduleFrequency(value = "") {
  const text = cleanString(value).toLowerCase();
  if (["weekly", "week", "weeks", "每周", "weekly"].includes(text)) return "weekly";
  if (["monthly", "month", "months", "每月"].includes(text)) return "monthly";
  return "daily";
}

function normalizeStudyPlanWeekdays(value, startDate = "", options = {}) {
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;，、；]+/);
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
    if (/^(sun|sunday|周日|星期日|星期天)$/.test(text)) { pushDay(0); continue; }
    if (/^(mon|monday|周一|星期一)$/.test(text)) { pushDay(1); continue; }
    if (/^(tue|tues|tuesday|周二|星期二)$/.test(text)) { pushDay(2); continue; }
    if (/^(wed|wednesday|周三|星期三)$/.test(text)) { pushDay(3); continue; }
    if (/^(thu|thur|thurs|thursday|周四|星期四)$/.test(text)) { pushDay(4); continue; }
    if (/^(fri|friday|周五|星期五)$/.test(text)) { pushDay(5); continue; }
    if (/^(sat|saturday|周六|星期六)$/.test(text)) { pushDay(6); continue; }
    const number = Number(text);
    if (Number.isFinite(number)) pushDay(number === 0 ? 0 : Math.max(1, Math.min(7, Math.trunc(number))));
  }
  if (!out.length) {
    const normalizedStartDate = normalizeReadingPlanStartDate(startDate, options);
    out.push(readingPlanStartDateTime(normalizedStartDate, "00:00", options).getDay());
  }
  return out.sort((a, b) => a - b);
}

function studyPlanWeekdayLabel(day) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "";
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
  const start = readingPlanStartDateTime(startDate, timeOfDay, options);
  const monthDay = Math.max(1, Math.min(31, Number(
    raw.scheduleMonthDay || raw.schedule_month_day || raw.monthDay || raw.month_day || start.getDate(),
  ) || 1));
  const label = frequency === "weekly"
    ? `weekly ${weekdays.map(studyPlanWeekdayLabel).filter(Boolean).join(", ") || "selected days"}`
    : (frequency === "monthly" ? `monthly day ${monthDay}` : "daily");
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

function normalizeKanbanStudyTemplate(raw = {}) {
  const value = cleanString(
    raw.studyTemplate
    || raw.study_template
    || raw.caseTemplate
    || raw.case_template
    || raw.template
    || raw.kind
    || "",
  ).toLowerCase();
  if (["learning-growth", "fanfan-growth", "growth", "learner-growth"].includes(value)) return "learning-growth";
  if (["reading", "read", "book", "english-reading", "reading-retell"].includes(value)) return "reading";
  return "custom";
}

function summarizeCardStatuses(cards = []) {
  const byStatus = {};
  let blocked = 0;
  let completed = 0;
  let active = 0;
  for (const card of Array.isArray(cards) ? cards : []) {
    const status = cleanString(card?.kanbanStatus || card?.kanban_status || card?.status || "unknown") || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status === "blocked" || card?.blocked) blocked += 1;
    if (["done", "archived", "completed"].includes(status) || card?.completedAt || card?.completed_at) completed += 1;
    if (!["done", "archived", "completed", "blocked"].includes(status)) active += 1;
  }
  return {
    total: Array.isArray(cards) ? cards.length : 0,
    byStatus,
    blocked,
    completed,
    active,
    remaining: Math.max(0, (Array.isArray(cards) ? cards.length : 0) - completed),
  };
}

function createKanbanStudyPlanService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const maxSessions = Math.max(1, Math.min(60, Number(options.maxSessions || DEFAULT_MAX_SESSIONS) || DEFAULT_MAX_SESSIONS));
  const nowDate = () => (options.now instanceof Date ? new Date(options.now.getTime()) : (typeof options.now === "function" ? options.now() : new Date()));
  const createCaseId = typeof options.createCaseId === "function"
    ? options.createCaseId
    : () => `study-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const sharedFolderName = cleanString(options.sharedFolderName) || DEFAULT_SHARED_FOLDER_NAME;
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : null;
  const pathExists = typeof options.pathExists === "function" ? options.pathExists : () => false;

  function normalizeList(value) {
    return normalizeWorkspaceIdList(value, { findWorkspace });
  }

  function normalizeStudyPlan(raw = {}, workspaceId = "owner") {
    const mode = "study-plan";
    const template = normalizeKanbanStudyTemplate(raw);
    const readingTemplate = template === "reading";
    const owner = cleanString(workspaceId) || "owner";
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
      || "learner",
      80,
    );
    const subject = compactText(raw.subject || raw.domain || (readingTemplate ? "reading" : "study"), 80);
    const activity = compactText(raw.activity || raw.activityType || raw.activity_type || (readingTemplate ? "reading retell" : "submit and review"), 120);
    const submissionLabel = compactText(raw.submissionLabel || raw.submission_label || (readingTemplate ? "retell audio" : "study output"), 120);
    const sessions = Math.max(1, Math.min(maxSessions, Number(raw.sessions || raw.sessionCount || raw.session_count || 10) || 10));
    const startDate = normalizeReadingPlanStartDate(raw.startDate || raw.start_date, { now: nowDate() });
    const timeOfDay = normalizeReadingPlanTime(raw.timeOfDay || raw.time_of_day || raw.startTime || raw.start_time);
    const schedule = normalizeStudyPlanSchedule(raw, startDate, timeOfDay, { now: nowDate() });
    const reminderLeadMinutes = Math.max(0, Math.min(24 * 60, Number(raw.reminderLeadMinutes ?? raw.reminder_lead_minutes ?? 15) || 0));
    const sourceText = compactText(raw.sourceText || raw.source_text || raw.text || raw.notes || "", 4000);
    const performerWorkspaceIds = normalizeList(
      raw.performerWorkspaceIds
      || raw.performer_workspace_ids
      || raw.targetWorkspaceIds
      || raw.target_workspace_ids
      || raw.performerWorkspaceId
      || raw.performer_workspace_id
      || raw.targetWorkspaceId
      || raw.target_workspace_id
      || "",
    ).filter((id) => id !== owner);
    const viewerWorkspaceIds = normalizeList(
      raw.viewerWorkspaceIds
      || raw.viewer_workspace_ids
      || raw.readonlyWorkspaceIds
      || raw.readonly_workspace_ids
      || "",
    ).filter((id) => id !== owner && !performerWorkspaceIds.includes(id));
    const summary = compactText(`${learnerName}: ${subject} - ${contentTitle}`, 180);
    const id = cleanString(raw.id) || createCaseId();
    const cards = Array.from({ length: sessions }, (_, index) => {
      const day = index + 1;
      const title = readingTemplate
        ? `${learnerName} reading ${contentTitle} ${day}/${sessions}: retell`
        : `${learnerName} ${subject} ${day}/${sessions}: submit output`;
      const description = compactText([
        `Study plan: ${summary}`,
        `Session ${day} of ${sessions}.`,
        `Schedule: ${schedule.label}, starting ${startDate} ${timeOfDay}.`,
        `Subject: ${subject}`,
        `Task: ${activity}`,
        `Submission: ${submissionLabel}`,
        sourceText ? `Overall requirements:\n${sourceText}` : "",
      ].filter(Boolean).join("\n\n"), 1800);
      return {
        clientId: `${template}-session-${day}`,
        title,
        day,
        dueTime: readingPlanScheduleDueTime(schedule, index, { now: nowDate() }),
        description,
        deliverables: readingTemplate
          ? ["retell audio", "AI reading feedback", "targeted quiz", "next reading guidance"]
          : ["study output", "AI feedback", "targeted quiz", "next study guidance"],
        acceptance: readingTemplate
          ? ["audio submitted", "transcript and AI feedback generated", "quiz passed", "analysis file attached"]
          : ["output submitted", "AI feedback generated", "quiz passed", "analysis file attached"],
      };
    });
    return {
      id,
      mode,
      template,
      workspaceId: owner,
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

  function planLearnerLabel(plan = {}) {
    return compactText(
      plan.learnerName
      || plan.readerName
      || plan.targetName
      || plan.target_name
      || "learner",
      60,
    ) || "learner";
  }

  function caseTopicTitle(plan = {}) {
    return compactText(
      plan.contentTitle
      || plan.bookTitle
      || plan.title
      || plan.subject
      || plan.summary
      || plan.id
      || "study-plan",
      120,
    ) || "study-plan";
  }

  function learnerSharedFolderName(plan = {}) {
    const learner = planLearnerLabel(plan);
    return safeDirectoryName(learner) || `learner-${safeStorageSegment(learner, "learner")}`;
  }

  function stableTextKey(value, fallback = "item") {
    const text = compactText(value || fallback, 120) || fallback;
    const slug = safeStorageSegment(text, "");
    const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
    return slug ? `${slug}-${hash}` : `${fallback}-${hash}`;
  }

  function caseDirectoryName(plan = {}) {
    return safeDirectoryName(compactText(caseTopicTitle(plan), 96))
      || safeStorageSegment(plan.id || "case", "case");
  }

  function caseTopicKey(ownerWorkspaceId, plan = {}) {
    return `study:${safeStorageSegment(ownerWorkspaceId || "owner", "owner")}:${stableTextKey(planLearnerLabel(plan), "learner").toLowerCase()}`;
  }

  function caseMemberWorkspaceIds(plan = {}, ownerWorkspaceId = "owner") {
    return dedupe([
      cleanString(ownerWorkspaceId) || "owner",
      ...(Array.isArray(plan.performerWorkspaceIds) ? plan.performerWorkspaceIds : []),
      ...(Array.isArray(plan.viewerWorkspaceIds) ? plan.viewerWorkspaceIds : []),
    ]);
  }

  function caseDirectoryPath(ownerWorkspaceId, sharedRoot, plan = {}, optionsForPath = {}) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const root = cleanString(sharedRoot);
    if (!root) return "";
    const existingPath = cleanString(optionsForPath.existingCaseDirectoryPath || "");
    if (existingPath) return existingPath;
    const baseName = caseDirectoryName(plan);
    let candidate = path.join(root, baseName);
    if (!pathExists(candidate)) return candidate;
    const suffix = crypto.createHash("sha1").update(String(plan.id || baseName || owner)).digest("hex").slice(0, 6);
    const suffixedBase = safeDirectoryName(`${baseName}-${suffix}`) || safeStorageSegment(plan.id || "case", "case");
    candidate = path.join(root, suffixedBase);
    let index = 2;
    while (pathExists(candidate)) {
      candidate = path.join(root, safeDirectoryName(`${suffixedBase}-${index}`) || `${suffixedBase}-${index}`);
      index += 1;
    }
    return candidate;
  }

  function studyPlanDirectorySummary(ownerWorkspaceId, ownerRoot, plan = {}, optionsForPath = {}) {
    const learnerRoot = path.join(cleanString(ownerRoot), learnerSharedFolderName(plan));
    const sharedRoot = path.join(learnerRoot, sharedFolderName);
    const casePath = caseDirectoryPath(ownerWorkspaceId, sharedRoot, plan, optionsForPath);
    return {
      learnerFolderName: path.basename(learnerRoot),
      sharedFolderName,
      caseFolderName: path.basename(casePath),
      learnerRoot,
      sharedRoot,
      caseDirectoryPath: casePath,
      directoryRoute: {
        label: `${planLearnerLabel(plan)} / ${sharedFolderName} / ${caseTopicTitle(plan)}`,
        root: casePath,
        path: casePath,
      },
    };
  }

  function shareSummary(plan = {}, share = {}, ownerWorkspaceId = "owner") {
    const owner = cleanString(ownerWorkspaceId) || cleanString(plan.workspaceId) || "owner";
    const performerWorkspaceIds = dedupe([
      ...(Array.isArray(plan.performerWorkspaceIds) ? plan.performerWorkspaceIds : []),
      ...(Array.isArray(share.performerWorkspaceIds) ? share.performerWorkspaceIds : []),
    ]).filter((id) => id !== owner);
    const viewerWorkspaceIds = dedupe([
      ...(Array.isArray(plan.viewerWorkspaceIds) ? plan.viewerWorkspaceIds : []),
      ...(Array.isArray(share.viewerWorkspaceIds) ? share.viewerWorkspaceIds : []),
    ]).filter((id) => id !== owner && !performerWorkspaceIds.includes(id));
    const managerWorkspaceIds = dedupe(Array.isArray(share.managerWorkspaceIds) ? share.managerWorkspaceIds : [])
      .filter((id) => id !== owner);
    const roleCounts = {
      manager: 1 + managerWorkspaceIds.length,
      performer: performerWorkspaceIds.length,
      viewer: viewerWorkspaceIds.length,
    };
    return {
      ownerWorkspaceId: owner,
      caseId: cleanString(plan.id || share.caseId || share.case_id),
      memberWorkspaceIds: dedupe([owner, ...managerWorkspaceIds, ...performerWorkspaceIds, ...viewerWorkspaceIds]),
      roleCounts,
      performers: performerWorkspaceIds.length,
      viewers: viewerWorkspaceIds.length,
      managers: roleCounts.manager,
      hasTopicThread: Boolean(share.topicThreadId || share.topic_thread_id),
      hasSharedDirectory: Boolean(share.sharedDirectoryPath || share.shared_directory_path),
      hasCaseDirectory: Boolean(share.caseDirectoryPath || share.case_directory_path),
    };
  }

  function buildStudyPlanCardPayloads(plan = {}, input = {}) {
    const workspaceId = cleanString(plan.workspaceId || input.workspaceId) || "owner";
    const requestedAssignee = cleanString(input.assignee || input.performerAssignee || input.ownerAssignee || "");
    const cards = Array.isArray(plan.cards) ? plan.cards : [];
    return cards.map((card, index) => {
      const caseTemplate = cleanString(card.caseTemplate || plan.template || "custom");
      return {
        workspaceId,
        assignee: requestedAssignee,
        content: cleanString(card.title),
        description: cleanString(card.description),
        dueTime: cleanString(card.dueTime),
        reminderLeadMinutes: Number(plan.reminderLeadMinutes || 0) || 0,
        reason: "Created from Hermes Mobile study plan.",
        idempotencyKey: `hm-${plan.mode || "study-plan"}-${crypto.createHash("sha256").update(`${plan.id || ""}\0${card.clientId || index + 1}`).digest("hex").slice(0, 24)}`,
        caseId: cleanString(plan.id),
        caseMode: cleanString(plan.mode || "study-plan"),
        caseTemplate,
        caseSourceText: compactText(plan.sourceText || "", 3000),
        caseSummary: cleanString(plan.summary),
        caseCardId: cleanString(card.clientId || `session-${index + 1}`),
        caseCardIndex: index + 1,
        caseCardCount: cards.length,
        caseDependsOn: index > 0 ? [cleanString(cards[index - 1]?.clientId || `session-${index}`)] : [],
        caseDeliverables: Array.isArray(card.deliverables) ? card.deliverables.map(cleanString).filter(Boolean) : [],
        caseAcceptance: Array.isArray(card.acceptance) ? card.acceptance.map(cleanString).filter(Boolean) : [],
        caseCardGoal: compactText(card.description || card.title || "", 1800),
      };
    });
  }

  return Object.freeze({
    normalizeReadingPlanTime,
    normalizeReadingPlanStartDate: (value) => normalizeReadingPlanStartDate(value, { now: nowDate() }),
    normalizeStudyPlanScheduleFrequency,
    normalizeStudyPlanWeekdays: (value, startDate = "") => normalizeStudyPlanWeekdays(value, startDate, { now: nowDate() }),
    normalizeStudyPlanSchedule: (raw = {}, startDate = "", timeOfDay = "") => normalizeStudyPlanSchedule(raw, startDate, timeOfDay, { now: nowDate() }),
    readingPlanScheduleDueTime: (schedule = {}, occurrenceIndex = 0) => readingPlanScheduleDueTime(schedule, occurrenceIndex, { now: nowDate() }),
    normalizeKanbanStudyTemplate,
    normalizeStudyPlan,
    planLearnerLabel,
    caseTopicTitle,
    learnerSharedFolderName,
    stableTextKey,
    caseDirectoryName,
    caseDirectoryPath,
    caseTopicKey,
    caseMemberWorkspaceIds,
    studyPlanDirectorySummary,
    shareSummary,
    summarizeCardStatuses,
    buildStudyPlanCardPayloads,
  });
}

module.exports = {
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SHARED_FOLDER_NAME,
  cleanString,
  dedupe,
  normalizeWorkspaceIdList,
  normalizeReadingPlanTime,
  normalizeReadingPlanStartDate,
  normalizeStudyPlanScheduleFrequency,
  normalizeStudyPlanWeekdays,
  normalizeStudyPlanSchedule,
  readingPlanScheduleDueTime,
  normalizeKanbanStudyTemplate,
  safeDirectoryName,
  safeStorageSegment,
  summarizeCardStatuses,
  createKanbanStudyPlanService,
};
