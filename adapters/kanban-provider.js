"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");
const { compareKanbanRowsForList } = require("./kanban-card-order-service");
const { createKanbanTaskDispatchPolicy } = require("./kanban-task-dispatch-policy");

const META_START = "<!-- hermes-mobile-todo ";
const META_END = " -->";
const OPEN_KANBAN_STATUSES = new Set(["", "triage", "todo", "ready", "running", "blocked"]);
const DONE_KANBAN_STATUSES = new Set(["done"]);

function bool(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
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

function parseCommandArgs(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {}
  }
  if (text.includes(",")) return text.split(",").map((item) => item.trim()).filter(Boolean);
  return text.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, "")) || [];
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function parseDue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.includes("T") ? text : text.replace(/\s+/, "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatLocalDateTime(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function dueLocal(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : formatLocalDateTime(date);
}

function parseJsonOutput(stdout) {
  const text = String(stdout || "").replace(/\0/g, "").trim();
  if (!text) return null;
  const lineStartPattern = /(^|\r?\n)(\s*[\[{])/g;
  let match = lineStartPattern.exec(text);
  while (match) {
    const start = match.index + match[1].length + match[2].search(/[\[{]/);
    try {
      return JSON.parse(text.slice(start).trim());
    } catch (_) {}
    match = lineStartPattern.exec(text);
  }
  const starts = [];
  for (let idx = 0; idx < text.length; idx += 1) {
    if (text[idx] === "{" || text[idx] === "[") starts.push(idx);
  }
  for (const start of starts) {
    const candidate = jsonCandidate(text, start);
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  return null;
}

function jsonCandidate(text, start) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let idx = start; idx < text.length; idx += 1) {
    const char = text[idx];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expected) return "";
      stack.pop();
      if (stack.length === 0) return text.slice(start, idx + 1);
    }
  }
  return text.slice(start);
}

function taskListFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["tasks", "items", "data", "rows"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (value.board && typeof value.board === "object") return taskListFrom(value.board);
  return [];
}

function taskIdFrom(value) {
  if (!value || typeof value !== "object") return "";
  return String(value.id || value.task_id || value.taskId || value.task?.id || value.task?.task_id || "").trim();
}

function taskIdFromText(value) {
  return String(value || "").match(/\bt_[a-zA-Z0-9]+\b/)?.[0] || "";
}

function textFromTask(task, key) {
  if (!task || typeof task !== "object") return "";
  return String(task[key] || task.task?.[key] || "").trim();
}

function looksQuestionMarkMojibake(value) {
  const compact = String(value || "").trim().replace(/\s+/g, "");
  if (!compact) return false;
  const questionMarks = (compact.match(/\?/g) || []).length;
  return questionMarks >= Math.max(4, Math.ceil(compact.length * 0.6));
}

function preferStoredText(stored, observed, fallback = "") {
  const storedText = String(stored || "").trim();
  const observedText = String(observed || "").trim();
  if (storedText && looksQuestionMarkMojibake(observedText) && !looksQuestionMarkMojibake(storedText)) {
    return storedText;
  }
  return observedText || storedText || String(fallback || "").trim();
}

function arrayFromTask(task, key) {
  if (!task || typeof task !== "object") return [];
  const value = task[key] || task.task?.[key];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function arrayFromValue(value, limit = 12) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function objectArrayFromValue(value, limit = 8) {
  let raw = value;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = [];
    }
  }
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, limit);
}

function objectFromValue(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function compactValue(value, limit = 800) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function dateStringFromTask(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return dateStringFromTask(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function workspaceKindFromTask(task) {
  const explicit = textFromTask(task, "workspace_kind") || textFromTask(task, "workspaceKind");
  if (explicit) return explicit;
  const workspace = textFromTask(task, "workspace");
  if (/^dir:/i.test(workspace)) return "dir";
  if (/^worktree:/i.test(workspace) || workspace === "worktree") return "worktree";
  if (workspace) return "scratch";
  return "";
}

function parseEmbeddedMeta(body) {
  const text = String(body || "");
  const start = text.indexOf(META_START);
  if (start < 0) return {};
  const end = text.indexOf(META_END, start);
  if (end < 0) return {};
  const raw = text.slice(start + META_START.length, end);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function bodyWithMeta(content, meta, options = {}) {
  const publicMeta = {
    schema: "hermes-mobile-todo",
    assignee: meta.assignee || "",
    assigneeLabel: meta.assigneeLabel || "",
    kanbanAssignee: meta.kanbanAssignee || "",
    dispatchMode: meta.dispatchMode || "",
    manualOnly: Boolean(meta.manualOnly),
    createdBy: meta.createdBy || "",
    description: meta.description || "",
    dueAt: meta.dueAt || "",
    dueLocal: meta.dueLocal || "",
    reminderLeadMinutes: meta.reminderLeadMinutes || 0,
    recurrence: meta.recurrence || "none",
    recurrenceLabel: meta.recurrenceLabel || "",
    recurrenceDays: meta.recurrenceDays || "",
    caseId: meta.caseId || "",
    caseMode: meta.caseMode || "",
    caseTemplate: meta.caseTemplate || "",
    caseSourceText: meta.caseSourceText || "",
    caseSummary: meta.caseSummary || "",
    caseCover: meta.caseCover || null,
    topicThreadId: meta.topicThreadId || "",
    topicTaskGroupId: meta.topicTaskGroupId || "",
    sharedDirectoryPath: meta.sharedDirectoryPath || "",
    caseDirectoryPath: meta.caseDirectoryPath || "",
    caseCardId: meta.caseCardId || "",
    caseCardIndex: Number(meta.caseCardIndex || 0) || 0,
    caseCardCount: Number(meta.caseCardCount || 0) || 0,
    caseDependsOn: arrayFromValue(meta.caseDependsOn, 12),
    caseDeliverables: arrayFromValue(meta.caseDeliverables, 8),
    caseAcceptance: arrayFromValue(meta.caseAcceptance, 8),
    caseCardGoal: meta.caseCardGoal || "",
    caseCreationSkillId: meta.caseCreationSkillId || "",
    learningProgramId: meta.learningProgramId || "",
    learningDraftId: meta.learningDraftId || "",
    learningTaskCardId: meta.learningTaskCardId || "",
    learningTaskModel: objectFromValue(meta.learningTaskModel) || null,
    revisionOf: meta.revisionOf || "",
    revisionRequest: meta.revisionRequest || "",
    revisionRequestedAt: meta.revisionRequestedAt || "",
    revisionRequestedBy: meta.revisionRequestedBy || "",
    revisionCount: Number(meta.revisionCount || 0) || 0,
  };
  const completionContract = [
    "## Hermes Mobile completion contract",
    "",
    "- During execution, append Kanban comments or heartbeats for the plan, major progress, decisions, blockers, and risky operations.",
    "- Before marking this card done, write a detailed Markdown receipt into the Kanban run summary/result.",
    "- The receipt must include: outcome, actions performed, files or deliverables created, links/paths, verification evidence, risks, and follow-up items.",
    "- If no external change was made, state that explicitly and explain why.",
  ].join("\n");
  const bodyParts = [
    String(meta.description || "").trim(),
    String(content || "").trim(),
    options.includeCompletionContract === false ? "" : completionContract,
  ].filter(Boolean);
  return `${META_START}${JSON.stringify(publicMeta)}${META_END}\n\n${bodyParts.join("\n\n")}`;
}

function readJson(filePath, fallback) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultRunCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: Object.assign({}, process.env, options.env || {}),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Hermes Kanban command timed out"));
    }, positiveNumber(options.timeoutMs, 15000));
    child.stdout.on("data", (chunk) => {
      stdout += stdoutDecoder.write(chunk);
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += stderrDecoder.write(chunk);
      if (stderr.length > 500_000) stderr = stderr.slice(-500_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      resolve({ code, stdout, stderr });
    });
  });
}

function createKanbanTodoBridge(options = {}) {
  const command = String(options.command || "hermes").trim() || "hermes";
  const baseArgs = parseCommandArgs(options.baseArgs);
  const timeoutMs = positiveNumber(options.timeoutMs, 15000);
  const metadataPath = options.metadataPath || "";
  const runCommand = typeof options.runCommand === "function" ? options.runCommand : defaultRunCommand;
  const dispatchPolicy = options.dispatchPolicy || createKanbanTaskDispatchPolicy();
  const ensuredBoards = new Set();

  function metadataStore() {
    const raw = readJson(metadataPath, {});
    return {
      schemaVersion: 1,
      todos: raw.todos && typeof raw.todos === "object" && !Array.isArray(raw.todos) ? raw.todos : {},
      pushMarks: raw.pushMarks && typeof raw.pushMarks === "object" && !Array.isArray(raw.pushMarks) ? raw.pushMarks : {},
      updatedAt: String(raw.updatedAt || ""),
    };
  }

  function saveMetadataStore(store) {
    writeJson(metadataPath, Object.assign({}, store, { schemaVersion: 1, updatedAt: nowIso() }));
  }

  function boardForPayload(payload = {}) {
    if (typeof options.boardForWorkspace === "function") {
      const value = options.boardForWorkspace(payload.workspace_id || payload.workspaceId || "", payload.source_principal || "");
      if (value) return safeSlug(value);
    }
    return safeSlug(payload.workspace_id || payload.source_principal || "default", "default");
  }

  function boardNameForPayload(payload = {}) {
    if (typeof options.boardNameForWorkspace === "function") {
      const value = options.boardNameForWorkspace(payload.workspace_id || payload.workspaceId || "", payload.source_principal || "");
      if (value) return String(value).trim();
    }
    return `Hermes Mobile ${payload.workspace_id || payload.source_principal || "default"}`;
  }

  function workspacePathForPayload(payload = {}) {
    if (typeof options.workspacePathForWorkspace !== "function") return "";
    return String(options.workspacePathForWorkspace(payload.workspace_id || payload.workspaceId || "") || "").trim();
  }

  function kanbanAssigneeForPayload(payload = {}, requestedAssignee = "") {
    const explicit = String(payload.kanban_assignee || payload.kanbanAssignee || "").trim();
    if (explicit) return explicit;
    if (typeof options.assigneeForWorkspace === "function") {
      const value = options.assigneeForWorkspace(
        payload.workspace_id || payload.workspaceId || "",
        payload.source_principal || "",
        requestedAssignee,
      );
      if (value) return String(value).trim();
    }
    return String(requestedAssignee || payload.source_principal || "").trim();
  }

  async function kanban(args, extra = {}) {
    const result = await runCommand(command, [...baseArgs, "kanban", ...args], {
      timeoutMs: extra.timeoutMs || timeoutMs,
      env: extra.env || {},
      cwd: extra.cwd || options.cwd || process.cwd(),
    });
    if (result.code !== 0) {
      const err = new Error(String(result.stderr || result.stdout || `Hermes Kanban exited with code ${result.code}`).trim());
      err.code = result.code;
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      throw err;
    }
    return result;
  }

  async function kanbanJson(args, extra = {}) {
    const result = await kanban(args, extra);
    return parseJsonOutput(result.stdout);
  }

  async function ensureBoard(payload) {
    const board = boardForPayload(payload);
    if (!board || board === "default" || ensuredBoards.has(board)) return board;
    try {
      await kanban(["boards", "create", board, "--name", boardNameForPayload(payload), "--description", "Hermes Mobile workspace board"]);
    } catch (err) {
      const text = `${err.message || ""}\n${err.stderr || ""}\n${err.stdout || ""}`.toLowerCase();
      if (!/(exist|already|duplicate|present)/.test(text)) throw err;
    }
    ensuredBoards.add(board);
    return board;
  }

  function rowFromTask(task, fallbackMeta = {}, payload = {}) {
    const id = taskIdFrom(task);
    if (!id) return null;
    const body = textFromTask(task, "body") || textFromTask(task, "description");
    const embedded = parseEmbeddedMeta(body);
    const meta = Object.assign({}, embedded, fallbackMeta);
    const kanbanStatus = String(textFromTask(task, "status") || task.status || "").trim().toLowerCase();
    const cancelledAt = String(meta.cancelledAt || meta.cancelled_at || "");
    const completedAt = String(meta.completedAt || meta.completed_at || "");
    const kanbanCompletedAt = dateStringFromTask(task.completed_at || task.completedAt || meta.completedAt || meta.completed_at || "");
    const status = kanbanStatus === "done"
      ? "completed"
      : (kanbanStatus === "archived" || cancelledAt ? "cancelled" : "open");
    const observedTitle = textFromTask(task, "title") || textFromTask(task, "name");
    const title = preferStoredText(meta.content, observedTitle, id);
    const dispatchMode = String(meta.dispatchMode || meta.dispatch_mode || "");
    const taskAssignee = String(textFromTask(task, "assignee") || task.assignee || "").trim();
    const storedKanbanAssignee = String(meta.kanbanAssignee || meta.kanban_assignee || "").trim();
    return {
      id,
      workspace_id: String(meta.workspaceId || meta.workspace_id || payload.workspace_id || payload.workspaceId || ""),
      content: String(preferStoredText(meta.content, title, id)),
      description: String(meta.description || ""),
      status,
      kanban_status: kanbanStatus || "todo",
      kanban_board: meta.board || boardForPayload(payload),
      kanban_assignee: taskAssignee || storedKanbanAssignee || (dispatchMode === "manual" ? "" : String(meta.assignee || "")),
      kanban_dispatch_mode: dispatchMode,
      kanban_priority: Number(task.priority ?? task.task?.priority ?? meta.priority ?? 0) || 0,
      kanban_tenant: String(textFromTask(task, "tenant") || task.tenant || meta.tenant || payload.source_principal || ""),
      kanban_workspace_kind: String(meta.workspaceKind || workspaceKindFromTask(task)),
      kanban_created_by: String(textFromTask(task, "created_by") || textFromTask(task, "createdBy") || meta.createdBy || payload.source_principal || ""),
      kanban_started_at: dateStringFromTask(task.started_at || task.startedAt || meta.startedAt || meta.started_at || ""),
      kanban_completed_at: kanbanCompletedAt,
      kanban_result: String(textFromTask(task, "result") || task.result || meta.result || ""),
      kanban_block_reason: String(meta.blockReason || meta.block_reason || ""),
      kanban_max_retries: Number(task.max_retries ?? task.task?.max_retries ?? meta.maxRetries ?? meta.max_retries ?? 0) || 0,
      kanban_skills: arrayFromTask(task, "skills").slice(0, 8),
      assignee_principal_id: String(meta.assignee || task.assignee || payload.source_principal || ""),
      assignee_label: String(meta.assigneeLabel || meta.assignee_label || meta.assignee || task.assignee || payload.source_principal || ""),
      created_by_principal: String(meta.createdBy || meta.created_by_principal || payload.source_principal || ""),
      due_at: String(meta.dueAt || meta.due_at || ""),
      due_local: String(meta.dueLocal || meta.due_local || ""),
      timezone: String(meta.timezone || ""),
      reminder_lead_minutes: Number(meta.reminderLeadMinutes ?? meta.reminder_lead_minutes ?? 0) || 0,
      recurrence_kind: String(meta.recurrence || meta.recurrence_kind || "none"),
      recurrence_label: String(meta.recurrenceLabel || meta.recurrence_label || ""),
      recurrence_days: String(meta.recurrenceDays || meta.recurrence_days || ""),
      recurrence_series_id: String(meta.recurrenceSeriesId || meta.recurrence_series_id || ""),
      recurrence_template: bool(meta.recurrenceTemplate || meta.recurrence_template),
      kanban_case_id: String(meta.caseId || meta.case_id || ""),
      kanban_case_mode: String(meta.caseMode || meta.case_mode || ""),
      kanban_case_template: String(meta.caseTemplate || meta.case_template || ""),
      kanban_case_source_text: String(meta.caseSourceText || meta.case_source_text || ""),
      kanban_case_summary: String(meta.caseSummary || meta.case_summary || ""),
      kanban_case_cover: meta.caseCover || meta.case_cover || null,
      topic_thread_id: String(meta.topicThreadId || meta.topic_thread_id || ""),
      topic_task_group_id: String(meta.topicTaskGroupId || meta.topic_task_group_id || ""),
      shared_directory_path: String(meta.sharedDirectoryPath || meta.shared_directory_path || ""),
      case_directory_path: String(meta.caseDirectoryPath || meta.case_directory_path || ""),
      kanban_case_card_id: String(meta.caseCardId || meta.case_card_id || ""),
      kanban_case_card_index: Number(meta.caseCardIndex ?? meta.case_card_index ?? 0) || 0,
      kanban_case_card_count: Number(meta.caseCardCount ?? meta.case_card_count ?? 0) || 0,
      kanban_case_depends_on: arrayFromValue(meta.caseDependsOn || meta.case_depends_on, 12),
      kanban_case_deliverables: arrayFromValue(meta.caseDeliverables || meta.case_deliverables, 8),
      kanban_case_acceptance: arrayFromValue(meta.caseAcceptance || meta.case_acceptance, 8),
      kanban_case_card_goal: String(meta.caseCardGoal || meta.case_card_goal || ""),
      kanban_case_creation_skill_id: String(meta.caseCreationSkillId || meta.case_creation_skill_id || ""),
      kanban_last_comment_at: String(meta.lastCommentAt || meta.last_comment_at || ""),
      learning_growth_submission_text: String(meta.learningGrowthSubmissionText || meta.learning_growth_submission_text || ""),
      learning_growth_submission_status: String(meta.learningGrowthSubmissionStatus || meta.learning_growth_submission_status || ""),
      learning_growth_submission_kind: String(meta.learningGrowthSubmissionKind || meta.learning_growth_submission_kind || ""),
      learning_growth_submission_at: String(meta.learningGrowthSubmissionAt || meta.learning_growth_submission_at || ""),
      learning_growth_evaluation_status: String(meta.learningGrowthEvaluationStatus || meta.learning_growth_evaluation_status || ""),
      learning_growth_evaluation_at: String(meta.learningGrowthEvaluationAt || meta.learning_growth_evaluation_at || ""),
      learning_growth_score: Number(meta.learningGrowthScore ?? meta.learning_growth_score ?? 0) || 0,
      learning_growth_max_score: Number(meta.learningGrowthMaxScore ?? meta.learning_growth_max_score ?? 100) || 100,
      learning_growth_passed: bool(meta.learningGrowthPassed ?? meta.learning_growth_passed),
      learning_growth_feedback_summary: String(meta.learningGrowthFeedbackSummary || meta.learning_growth_feedback_summary || ""),
      learning_growth_feedback_method: String(meta.learningGrowthFeedbackMethod || meta.learning_growth_feedback_method || ""),
      learning_growth_ai_feedback_status: String(meta.learningGrowthAiFeedbackStatus || meta.learning_growth_ai_feedback_status || ""),
      learning_growth_revision_requirements: arrayFromValue(meta.learningGrowthRevisionRequirements || meta.learning_growth_revision_requirements, 8),
      learning_growth_next_step: String(meta.learningGrowthNextStep || meta.learning_growth_next_step || ""),
      learning_growth_report_path: String(meta.learningGrowthReportPath || meta.learning_growth_report_path || ""),
      learning_growth_report_name: String(meta.learningGrowthReportName || meta.learning_growth_report_name || ""),
      learning_growth_strengths: arrayFromValue(meta.learningGrowthStrengths || meta.learning_growth_strengths, 8),
      learning_growth_focus_areas: arrayFromValue(meta.learningGrowthFocusAreas || meta.learning_growth_focus_areas, 8),
      learning_growth_rewrite_checklist: arrayFromValue(meta.learningGrowthRewriteChecklist || meta.learning_growth_rewrite_checklist, 8),
      learning_growth_reflection_prompts: arrayFromValue(meta.learningGrowthReflectionPrompts || meta.learning_growth_reflection_prompts, 8),
      learning_growth_sentence_feedback: objectArrayFromValue(meta.learningGrowthSentenceFeedback || meta.learning_growth_sentence_feedback, 8),
      learning_growth_final_conclusion: String(meta.learningGrowthFinalConclusion || meta.learning_growth_final_conclusion || ""),
      learning_growth_next_practice: String(meta.learningGrowthNextPractice || meta.learning_growth_next_practice || ""),
      learning_growth_parent_note: String(meta.learningGrowthParentNote || meta.learning_growth_parent_note || ""),
      learning_growth_reward_status: String(meta.learningGrowthRewardStatus || meta.learning_growth_reward_status || ""),
      learning_growth_reward_coins: Number(meta.learningGrowthRewardCoins ?? meta.learning_growth_reward_coins ?? 0) || 0,
      learning_growth_reward_entry_id: String(meta.learningGrowthRewardEntryId || meta.learning_growth_reward_entry_id || ""),
      learning_program_id: String(meta.learningProgramId || meta.learning_program_id || ""),
      learning_draft_id: String(meta.learningDraftId || meta.learning_draft_id || ""),
      learning_task_card_id: String(meta.learningTaskCardId || meta.learning_task_card_id || ""),
      learning_task_model: objectFromValue(meta.learningTaskModel || meta.learning_task_model),
      kanban_revision_of: String(meta.revisionOf || meta.revision_of || ""),
      kanban_revision_request: String(meta.revisionRequest || meta.revision_request || ""),
      kanban_revision_requested_at: String(meta.revisionRequestedAt || meta.revision_requested_at || ""),
      kanban_revision_requested_by: String(meta.revisionRequestedBy || meta.revision_requested_by || ""),
      kanban_revision_count: Number(meta.revisionCount ?? meta.revision_count ?? 0) || 0,
      created_at: dateStringFromTask(meta.createdAt || meta.created_at || task.created_at || task.createdAt || ""),
      updated_at: dateStringFromTask(meta.updatedAt || meta.updated_at || task.updated_at || task.updatedAt || ""),
      completed_at: kanbanCompletedAt || completedAt || (kanbanStatus === "done" ? dateStringFromTask(task.updated_at || task.updatedAt || "") : ""),
      cancelled_at: cancelledAt,
      source: "kanban",
      ok: true,
    };
  }

  function syncMetadataFromRows(store, rows, payload = {}) {
    let changed = false;
    const workspaceId = String(payload.workspace_id || payload.workspaceId || "").trim();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      const previous = store.todos[id] || {};
      const next = Object.assign({}, previous, {
        id,
        content: String(preferStoredText(previous.content, row.content, id)),
        workspaceId: workspaceId || previous.workspaceId || "",
        board: String(row.kanban_board || previous.board || boardForPayload(payload)),
        assignee: String(row.assignee_principal_id || previous.assignee || payload.source_principal || ""),
        assigneeLabel: String(row.assignee_label || previous.assigneeLabel || previous.assignee || ""),
        kanbanAssignee: String(row.kanban_assignee || previous.kanbanAssignee || ""),
        dispatchMode: String(row.kanban_dispatch_mode || previous.dispatchMode || ""),
        manualOnly: Boolean(row.kanban_dispatch_mode === "manual" || previous.manualOnly),
        kanbanStatus: String(row.kanban_status || previous.kanbanStatus || "").trim().toLowerCase(),
        caseId: String(row.kanban_case_id || previous.caseId || ""),
        caseMode: String(row.kanban_case_mode || previous.caseMode || ""),
        caseTemplate: String(row.kanban_case_template || previous.caseTemplate || ""),
        caseSourceText: String(row.kanban_case_source_text || previous.caseSourceText || ""),
        caseSummary: String(row.kanban_case_summary || previous.caseSummary || ""),
        caseCover: row.kanban_case_cover || previous.caseCover || null,
        topicThreadId: String(row.topic_thread_id || previous.topicThreadId || ""),
        topicTaskGroupId: String(row.topic_task_group_id || previous.topicTaskGroupId || ""),
        sharedDirectoryPath: String(row.shared_directory_path || previous.sharedDirectoryPath || ""),
        caseDirectoryPath: String(row.case_directory_path || previous.caseDirectoryPath || ""),
        caseCardId: String(row.kanban_case_card_id || previous.caseCardId || ""),
        caseCardIndex: Number(row.kanban_case_card_index ?? previous.caseCardIndex ?? 0) || 0,
        caseCardCount: Number(row.kanban_case_card_count ?? previous.caseCardCount ?? 0) || 0,
        caseDependsOn: arrayFromValue(row.kanban_case_depends_on || previous.caseDependsOn, 12),
        caseDeliverables: arrayFromValue(row.kanban_case_deliverables || previous.caseDeliverables, 8),
        caseAcceptance: arrayFromValue(row.kanban_case_acceptance || previous.caseAcceptance, 8),
        caseCardGoal: String(row.kanban_case_card_goal || previous.caseCardGoal || ""),
        caseCreationSkillId: String(row.kanban_case_creation_skill_id || previous.caseCreationSkillId || ""),
        learningGrowthSubmissionStatus: String(row.learning_growth_submission_status || previous.learningGrowthSubmissionStatus || ""),
        learningGrowthSubmissionKind: String(row.learning_growth_submission_kind || previous.learningGrowthSubmissionKind || ""),
        learningGrowthSubmissionAt: String(row.learning_growth_submission_at || previous.learningGrowthSubmissionAt || ""),
        learningGrowthEvaluationStatus: String(row.learning_growth_evaluation_status || previous.learningGrowthEvaluationStatus || ""),
        learningGrowthEvaluationAt: String(row.learning_growth_evaluation_at || previous.learningGrowthEvaluationAt || ""),
        learningGrowthScore: Number(row.learning_growth_score ?? previous.learningGrowthScore ?? 0) || 0,
        learningGrowthMaxScore: Number(row.learning_growth_max_score ?? previous.learningGrowthMaxScore ?? 100) || 100,
        learningGrowthPassed: bool(row.learning_growth_passed ?? previous.learningGrowthPassed),
        learningGrowthFeedbackSummary: String(row.learning_growth_feedback_summary || previous.learningGrowthFeedbackSummary || ""),
        learningGrowthFeedbackMethod: String(row.learning_growth_feedback_method || previous.learningGrowthFeedbackMethod || ""),
        learningGrowthAiFeedbackStatus: String(row.learning_growth_ai_feedback_status || previous.learningGrowthAiFeedbackStatus || ""),
        learningGrowthRevisionRequirements: arrayFromValue(row.learning_growth_revision_requirements || previous.learningGrowthRevisionRequirements, 8),
        learningGrowthNextStep: String(row.learning_growth_next_step || previous.learningGrowthNextStep || ""),
        learningGrowthReportPath: String(row.learning_growth_report_path || previous.learningGrowthReportPath || ""),
        learningGrowthReportName: String(row.learning_growth_report_name || previous.learningGrowthReportName || ""),
        learningGrowthStrengths: arrayFromValue(row.learning_growth_strengths || previous.learningGrowthStrengths, 8),
        learningGrowthFocusAreas: arrayFromValue(row.learning_growth_focus_areas || previous.learningGrowthFocusAreas, 8),
        learningGrowthRewriteChecklist: arrayFromValue(row.learning_growth_rewrite_checklist || previous.learningGrowthRewriteChecklist, 8),
        learningGrowthReflectionPrompts: arrayFromValue(row.learning_growth_reflection_prompts || previous.learningGrowthReflectionPrompts, 8),
        learningGrowthSentenceFeedback: objectArrayFromValue(row.learning_growth_sentence_feedback || previous.learningGrowthSentenceFeedback, 8),
        learningGrowthFinalConclusion: String(row.learning_growth_final_conclusion || previous.learningGrowthFinalConclusion || ""),
        learningGrowthNextPractice: String(row.learning_growth_next_practice || previous.learningGrowthNextPractice || ""),
        learningGrowthParentNote: String(row.learning_growth_parent_note || previous.learningGrowthParentNote || ""),
        learningGrowthRewardStatus: String(row.learning_growth_reward_status || previous.learningGrowthRewardStatus || ""),
        learningGrowthRewardCoins: Number(row.learning_growth_reward_coins ?? previous.learningGrowthRewardCoins ?? 0) || 0,
        learningGrowthRewardEntryId: String(row.learning_growth_reward_entry_id || previous.learningGrowthRewardEntryId || ""),
        learningProgramId: String(row.learning_program_id || previous.learningProgramId || ""),
        learningDraftId: String(row.learning_draft_id || previous.learningDraftId || ""),
        learningTaskCardId: String(row.learning_task_card_id || previous.learningTaskCardId || ""),
        learningTaskModel: objectFromValue(row.learning_task_model || previous.learningTaskModel),
        revisionOf: String(row.kanban_revision_of || previous.revisionOf || ""),
        revisionRequest: String(row.kanban_revision_request || previous.revisionRequest || ""),
        revisionRequestedAt: String(row.kanban_revision_requested_at || previous.revisionRequestedAt || ""),
        revisionRequestedBy: String(row.kanban_revision_requested_by || previous.revisionRequestedBy || ""),
        revisionCount: Number(row.kanban_revision_count ?? previous.revisionCount ?? 0) || 0,
        updatedAt: String(row.updated_at || previous.updatedAt || ""),
      });
      if (row.status === "completed" || DONE_KANBAN_STATUSES.has(String(row.kanban_status || "").trim().toLowerCase())) {
        next.completedAt = String(row.completed_at || previous.completedAt || nowIso());
      }
      if (String(row.kanban_status || "").trim().toLowerCase() === "blocked") {
        next.blockedAt = previous.blockedAt || String(row.updated_at || previous.updatedAt || nowIso());
      } else if (previous.blockedAt || previous.blockReason) {
        next.blockedAt = "";
        next.blockReason = "";
      }
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        store.todos[id] = next;
        changed = true;
      }
    }
    if (changed) saveMetadataStore(store);
    return changed;
  }

  function dependencyComplete(row) {
    if (!row) return false;
    const status = String(row.status || "").trim().toLowerCase();
    const kanbanStatus = String(row.kanban_status || row.kanbanStatus || "").trim().toLowerCase();
    return status === "completed" || DONE_KANBAN_STATUSES.has(kanbanStatus);
  }

  function caseIdFromRow(row) {
    return String(row?.kanban_case_id || row?.kanbanCaseId || row?.caseId || "").trim();
  }

  function caseCardIdFromRow(row) {
    return String(row?.kanban_case_card_id || row?.kanbanCaseCardId || row?.caseCardId || "").trim();
  }

  function caseCardIndexFromRow(row) {
    return Number(row?.kanban_case_card_index ?? row?.kanbanCaseCardIndex ?? row?.caseCardIndex ?? 0) || 0;
  }

  function dependencyLookup(rows = []) {
    const byId = new Map();
    const byCaseCard = new Map();
    const byCaseId = new Map();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (id) byId.set(id, row);
      const caseId = caseIdFromRow(row);
      const caseCardId = caseCardIdFromRow(row);
      if (caseId && caseCardId) byCaseCard.set(`${caseId}\0${caseCardId}`, row);
      if (caseId) {
        if (!byCaseId.has(caseId)) byCaseId.set(caseId, []);
        byCaseId.get(caseId).push(row);
      }
    }
    return { byId, byCaseCard, byCaseId };
  }

  function isLearningSequenceCase(row) {
    const caseMode = String(row?.kanban_case_mode || row?.kanbanCaseMode || row?.caseMode || "").trim().toLowerCase();
    return caseMode === "study-plan" || caseMode === "assessment-plan" || caseMode === "learning-growth";
  }

  function priorSequenceRowsFor(row, lookup) {
    if (!isLearningSequenceCase(row)) return [];
    const caseId = caseIdFromRow(row);
    const caseCardIndex = caseCardIndexFromRow(row);
    if (!caseId || caseCardIndex <= 1) return [];
    const rowId = String(row?.id || "").trim();
    const seen = new Set();
    return (lookup.byCaseId.get(caseId) || [])
      .filter((candidate) => {
        const candidateId = String(candidate?.id || "").trim();
        const candidateIndex = caseCardIndexFromRow(candidate);
        if (!candidateIndex || candidateIndex >= caseCardIndex) return false;
        if (candidateId && candidateId === rowId) return false;
        const key = candidateId || `${caseId}:${candidateIndex}:${caseCardIdFromRow(candidate)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function incompletePriorSequenceRowsFor(row, lookup) {
    const byIndex = new Map();
    for (const candidate of priorSequenceRowsFor(row, lookup)) {
      const index = caseCardIndexFromRow(candidate);
      if (!byIndex.has(index)) byIndex.set(index, []);
      byIndex.get(index).push(candidate);
    }
    const incomplete = [];
    for (const candidates of byIndex.values()) {
      if (!candidates.some((candidate) => dependencyComplete(candidate))) incomplete.push(...candidates);
    }
    return incomplete;
  }

  function dependencyRowsFor(row, lookup) {
    const caseId = caseIdFromRow(row);
    const dependsOn = arrayFromValue(row?.kanban_case_depends_on || row?.kanbanCaseDependsOn || row?.caseDependsOn, 12);
    if (!dependsOn.length) return { dependsOn, rows: [] };
    return {
      dependsOn,
      rows: dependsOn.map((dependencyId) => (
        (caseId ? lookup.byCaseCard.get(`${caseId}\0${dependencyId}`) : null)
        || lookup.byId.get(String(dependencyId || "").trim())
        || null
      )),
    };
  }

  function shouldHideFutureLearningCard(row, lookup) {
    if (!isLearningSequenceCase(row)) return false;
    if (incompletePriorSequenceRowsFor(row, lookup).length) return true;
    const { dependsOn, rows } = dependencyRowsFor(row, lookup);
    if (!dependsOn.length) return false;
    const kanbanStatus = String(row?.kanban_status || row?.kanbanStatus || "").trim().toLowerCase();
    if (rows.some((dependency) => !dependencyComplete(dependency))) return true;
    return kanbanStatus === "blocked" && rows.some((dependency) => !dependency);
  }

  async function list(payload = {}) {
    const board = await ensureBoard(payload);
    const includeCompleted = Boolean(payload.include_completed);
    const targetId = String(payload.target_id || payload.targetId || "").trim();
    const parsed = await kanbanJson([
      "--board",
      board,
      "list",
      ...(includeCompleted ? ["--archived"] : []),
      "--json",
    ]);
    if (!parsed) return { ok: false, error: "Hermes Kanban did not return JSON output" };
    const store = metadataStore();
    let todos = taskListFrom(parsed)
      .map((task) => {
        const meta = store.todos[taskIdFrom(task)] || {};
        if (meta.deletedAt || meta.deleted_at) return null;
        return rowFromTask(task, meta, payload);
      })
      .filter(Boolean);
    syncMetadataFromRows(store, todos, payload);
    const assignee = String(payload.assignee || "").trim();
    if (assignee) todos = todos.filter((todo) => todo.assignee_principal_id === assignee);
    const visibilityLookup = dependencyLookup(todos);
    if (!bool(payload.include_future_learning_cards || payload.includeFutureLearningCards) && !targetId) {
      todos = todos.filter((todo) => !shouldHideFutureLearningCard(todo, visibilityLookup));
    }
    if (!includeCompleted) todos = todos.filter((todo) => todo.status === "open" && OPEN_KANBAN_STATUSES.has(todo.kanban_status));
    todos = todos
      .sort((a, b) => compareKanbanRowsForList(a, b, { openStatuses: OPEN_KANBAN_STATUSES }))
      .slice(0, positiveNumber(payload.limit, 80));
    if (targetId && !todos.some((todo) => String(todo.id || "") === targetId)) {
      const shown = await kanbanJson(["--board", board, "show", targetId, "--json"]).catch(() => null);
      const task = shown?.task && typeof shown.task === "object" ? shown.task : (shown && typeof shown === "object" ? shown : null);
      if (task && taskIdFrom(task) === targetId) {
        const meta = store.todos[targetId] || {};
        const row = (meta.deletedAt || meta.deleted_at) ? null : rowFromTask(task, meta, payload);
        const rowOpen = row?.status === "open" && OPEN_KANBAN_STATUSES.has(String(row.kanban_status || "").trim().toLowerCase());
        if (row && (includeCompleted || rowOpen)) {
          syncMetadataFromRows(store, [row], payload);
          todos.push(row);
        }
      }
    }
    return { ok: true, todos, source: "kanban", board };
  }

  async function reconcileDependencyBlocks(payload = {}) {
    const listed = await list(Object.assign({}, payload, {
      include_completed: true,
      include_future_learning_cards: true,
      limit: positiveNumber(payload.limit, 500),
    }));
    if (!listed?.ok) return listed;
    const rows = Array.isArray(listed.todos) ? listed.todos : [];
    const lookup = dependencyLookup(rows);
    const released = [];
    const errors = [];
    for (const row of rows) {
      if (String(row.kanban_status || "").trim().toLowerCase() !== "blocked") continue;
      const caseMode = String(row.kanban_case_mode || "").trim().toLowerCase();
      const caseId = String(row.kanban_case_id || "").trim();
      const dependsOn = arrayFromValue(row.kanban_case_depends_on, 12);
      if (!caseId) continue;
      if (incompletePriorSequenceRowsFor(row, lookup).length) continue;
      const hasPriorSequence = priorSequenceRowsFor(row, lookup).length > 0;
      if (!dependsOn.length && !hasPriorSequence) continue;
      const dependencyRows = dependsOn.map((dependencyId) => (
        lookup.byCaseCard.get(`${caseId}\0${dependencyId}`) || lookup.byId.get(String(dependencyId || "").trim()) || null
      ));
      if (dependencyRows.some((dependency) => !dependencyComplete(dependency))) continue;
      const reason = "All planned upstream cards completed; Hermes Mobile released dependency block.";
      const result = await mutate(Object.assign({}, payload, {
        action: "unblock",
        todo_id: row.id,
        reason,
        comment: reason,
        author: "Hermes Mobile",
      }));
      if (result?.ok) {
        released.push({
          id: row.id,
          content: row.content || "",
          caseId,
          caseCardId: row.kanban_case_card_id || "",
          dependsOn,
          status: result.kanban_status || result.status || "",
        });
      } else {
        errors.push({ id: row.id, error: result?.error || "unblock failed" });
      }
    }
    return { ok: errors.length === 0, checked: rows.length, released, errors, source: "kanban", board: listed.board };
  }

  async function detail(payload = {}) {
    const todoId = String(payload.todo_id || payload.todoId || "").trim();
    if (!todoId) return { ok: false, error: "todo_id is required" };
    const board = await ensureBoard(payload);
    const show = await kanbanJson(["--board", board, "show", todoId, "--json"]);
    const includeRuns = bool(payload.include_runs || payload.includeRuns);
    const includeLog = bool(payload.include_log || payload.includeLog);
    let runs = Array.isArray(show?.runs) ? show.runs : [];
    if (includeRuns && !runs.length) runs = await kanbanJson(["--board", board, "runs", todoId, "--json"]).catch(() => []);
    const logResult = includeLog
      ? await kanban(["--board", board, "log", todoId, "--tail", String(positiveNumber(payload.log_tail, 12000))]).catch((err) => ({
        stdout: "",
        stderr: err.message || String(err),
      }))
      : { stdout: "", stderr: "" };
    const task = show?.task && typeof show.task === "object" ? show.task : {};
    return {
      ok: true,
      board,
      task,
      latest_summary: String(show?.latest_summary || task.latest_summary || task.summary || ""),
      comments: Array.isArray(show?.comments) ? show.comments : [],
      events: Array.isArray(show?.events) ? show.events : [],
      runs: Array.isArray(runs) ? runs : (Array.isArray(runs?.runs) ? runs.runs : []),
      log: String(logResult.stdout || "").slice(-12000),
    };
  }

  async function add(payload = {}) {
    const content = String(payload.content || "").trim();
    const source = String(payload.source_principal || "owner").trim() || "owner";
    const workspaceId = String(payload.workspace_id || payload.workspaceId || source).trim() || source;
    const dueAt = parseDue(payload.due_time);
    if (!content) return { ok: false, error: "Todo content is required" };
    const board = await ensureBoard(payload);
    const now = nowIso();
    const assignee = String(payload.assignee || source).trim() || source;
    const executableAssignee = kanbanAssigneeForPayload(payload, assignee) || assignee;
    const dispatch = dispatchPolicy.resolveKanbanDispatch(payload, {
      requestedAssignee: assignee,
      executableAssignee,
    });
    const kanbanAssignee = dispatch.officialAssignee;
    const meta = {
      workspaceId,
      board,
      content,
      description: String(payload.description || "").trim(),
      assignee,
      assigneeLabel: String(payload.assignee_label || assignee),
      kanbanAssignee,
      dispatchMode: dispatch.dispatchMode,
      manualOnly: dispatch.manualOnly,
      createdBy: source,
      dueAt: dueAt || "",
      dueLocal: dueAt ? dueLocal(dueAt) : "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      reminderLeadMinutes: Number(payload.reminder_lead_minutes || 0) || 0,
      recurrence: String(payload.recurrence || "none"),
      recurrenceLabel: String(payload.recurrence || "none"),
      recurrenceDays: String(payload.recurrence_days || ""),
      caseId: String(payload.case_id || payload.caseId || "").trim(),
      caseMode: String(payload.case_mode || payload.caseMode || "").trim(),
      caseTemplate: String(payload.case_template || payload.caseTemplate || "").trim(),
      caseSourceText: String(payload.case_source_text || payload.caseSourceText || "").trim(),
      caseSummary: String(payload.case_summary || payload.caseSummary || "").trim(),
      caseCover: payload.case_cover || payload.caseCover || null,
      topicThreadId: String(payload.topic_thread_id || payload.topicThreadId || "").trim(),
      topicTaskGroupId: String(payload.topic_task_group_id || payload.topicTaskGroupId || "").trim(),
      sharedDirectoryPath: String(payload.shared_directory_path || payload.sharedDirectoryPath || "").trim(),
      caseDirectoryPath: String(payload.case_directory_path || payload.caseDirectoryPath || "").trim(),
      caseCardId: String(payload.case_card_id || payload.caseCardId || "").trim(),
      caseCardIndex: Number(payload.case_card_index ?? payload.caseCardIndex ?? 0) || 0,
      caseCardCount: Number(payload.case_card_count ?? payload.caseCardCount ?? 0) || 0,
      caseDependsOn: arrayFromValue(payload.case_depends_on || payload.caseDependsOn, 12),
      caseDeliverables: arrayFromValue(payload.case_deliverables || payload.caseDeliverables, 8),
      caseAcceptance: arrayFromValue(payload.case_acceptance || payload.caseAcceptance, 8),
      caseCardGoal: String(payload.case_card_goal || payload.caseCardGoal || "").trim(),
      caseCreationSkillId: String(payload.case_creation_skill_id || payload.caseCreationSkillId || "").trim(),
      learningProgramId: String(payload.learning_program_id || payload.learningProgramId || "").trim(),
      learningDraftId: String(payload.learning_draft_id || payload.learningDraftId || "").trim(),
      learningTaskCardId: String(payload.learning_task_card_id || payload.learningTaskCardId || "").trim(),
      learningTaskModel: objectFromValue(payload.learning_task_model || payload.learningTaskModel),
      revisionOf: String(payload.revision_of || payload.revisionOf || "").trim(),
      revisionRequest: String(payload.revision_request || payload.revisionRequest || "").trim(),
      revisionRequestedAt: String(payload.revision_requested_at || payload.revisionRequestedAt || "").trim(),
      revisionRequestedBy: String(payload.revision_requested_by || payload.revisionRequestedBy || "").trim(),
      revisionCount: Number(payload.revision_count ?? payload.revisionCount ?? 0) || 0,
      createdAt: now,
      updatedAt: now,
    };
    const workspacePath = workspacePathForPayload(payload);
    const idempotencyKey = String(payload.idempotency_key || "").trim()
      || `hm-${crypto.createHash("sha256").update(`${workspaceId}\0${content}\0${Date.now()}\0${crypto.randomBytes(4).toString("hex")}`).digest("hex").slice(0, 24)}`;
    const createArgs = [
      "--board",
      board,
      "create",
      content,
      "--body",
      bodyWithMeta(content, meta, { includeCompletionContract: dispatch.includeCompletionContract }),
      "--created-by",
      source,
      "--tenant",
      source,
      "--idempotency-key",
      idempotencyKey,
      ...(workspacePath ? ["--workspace", `dir:${workspacePath}`] : []),
      "--json",
    ];
    if (kanbanAssignee) {
      createArgs.splice(createArgs.indexOf("--tenant"), 0, "--assignee", kanbanAssignee);
    }
    const createResult = await kanban(createArgs);
    let parsed = parseJsonOutput(createResult.stdout);
    let id = taskIdFrom(parsed || {}) || taskIdFromText(createResult.stdout);
    if (!id) {
      for (let attempt = 0; attempt < 4 && !id; attempt += 1) {
        if (attempt > 0) await sleep(150 * attempt);
        const listed = await kanbanJson(["--board", board, "list", "--json"]).catch(() => null);
        const candidates = taskListFrom(listed).filter((task) => {
          const title = textFromTask(task, "title") || textFromTask(task, "name");
          const tenant = textFromTask(task, "tenant") || task.tenant || "";
          return title === content && (!tenant || tenant === source);
        }).sort((left, right) => Number(right.created_at || right.createdAt || 0) - Number(left.created_at || left.createdAt || 0));
        if (candidates[0]) {
          parsed = candidates[0];
          id = taskIdFrom(parsed);
        }
      }
    }
    if (!id) return { ok: false, error: "Hermes Kanban create did not return a task id", result: parsed };
    const store = metadataStore();
    store.todos[id] = Object.assign({}, meta, { id });
    saveMetadataStore(store);
    return rowFromTask({ id, title: content, status: "todo", assignee: kanbanAssignee }, store.todos[id], payload);
  }

  async function mutate(payload = {}) {
    const action = String(payload.action || "").trim().toLowerCase();
    const todoId = String(payload.todo_id || "").trim();
    if (!todoId) return { ok: false, error: "todo_id is required" };
    const board = await ensureBoard(payload);
    const store = metadataStore();
    const meta = store.todos[todoId] || {};
    const now = nowIso();

    if (action === "complete") {
      const completionResult = String(payload.result || payload.comment || payload.reason || "Completed from Hermes Mobile todo view.").trim();
      await kanban(["--board", board, "complete", todoId, "--result", completionResult]).catch(async (err) => {
        if (!/json|unknown option/i.test(String(err.message || ""))) throw err;
      });
      store.todos[todoId] = Object.assign({}, meta, { completedAt: now, updatedAt: now, kanbanStatus: "done", result: completionResult, blockedAt: "", blockReason: "" });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "done", result: completionResult }, store.todos[todoId], payload);
    }

    if (action === "cancel" || action === "delete") {
      await kanban(["--board", board, "archive", todoId]);
      store.todos[todoId] = Object.assign({}, meta, {
        cancelledAt: now,
        updatedAt: now,
        kanbanStatus: "archived",
        blockedAt: "",
        blockReason: "",
        ...(action === "delete" ? { deletedAt: now } : {}),
      });
      saveMetadataStore(store);
      return Object.assign(rowFromTask({ id: todoId, title: meta.content || todoId, status: "archived" }, store.todos[todoId], payload), { action });
    }

    if (action === "postpone") {
      const dueAt = parseDue(payload.due_time);
      if (!dueAt) return { ok: false, error: "due_time is required" };
      store.todos[todoId] = Object.assign({}, meta, {
        dueAt,
        dueLocal: dueLocal(dueAt),
        updatedAt: now,
      });
      saveMetadataStore(store);
      await kanban(["--board", board, "comment", todoId, `Hermes Mobile due time changed to ${store.todos[todoId].dueLocal || dueAt}.`, "--author", "Hermes Mobile"]).catch(() => null);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "todo" }, store.todos[todoId], payload);
    }

    if (action === "block") {
      const reason = String(payload.reason || "Blocked from Hermes Mobile todo view.").trim();
      await kanban(["--board", board, "block", todoId, reason]);
      store.todos[todoId] = Object.assign({}, meta, {
        updatedAt: now,
        kanbanStatus: "blocked",
        blockedAt: meta.blockedAt || now,
        blockReason: reason,
      });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "blocked" }, store.todos[todoId], payload);
    }

    if (action === "unblock") {
      const accountAssignee = String(meta.assignee || payload.assignee || payload.source_principal || "").trim();
      const executableAssignee = kanbanAssigneeForPayload(payload, accountAssignee);
      const dispatchPayload = Object.assign({}, payload, {
        case_id: payload.case_id ?? payload.caseId ?? meta.caseId ?? meta.case_id ?? "",
        case_mode: payload.case_mode ?? payload.caseMode ?? meta.caseMode ?? meta.case_mode ?? "",
        manual_only: payload.manual_only ?? payload.manualOnly ?? meta.manualOnly ?? (String(meta.dispatchMode || meta.dispatch_mode || "") === "manual"),
        auto_dispatch: payload.auto_dispatch ?? payload.autoDispatch,
      });
      const dispatch = dispatchPolicy.resolveKanbanDispatch(dispatchPayload, {
        requestedAssignee: accountAssignee,
        executableAssignee,
      });
      const kanbanAssignee = dispatch.officialAssignee;
      if (kanbanAssignee) {
        await kanban(["--board", board, "reassign", todoId, kanbanAssignee, "--reason", "Hermes Mobile mapped workspace account to executable Gateway profile."]);
      }
      await kanban(["--board", board, "unblock", todoId]);
      const comment = String(payload.comment || payload.reason || "").trim();
      if (comment) {
        const author = String(payload.author || payload.source_principal || "Hermes Mobile").trim() || "Hermes Mobile";
        await kanban(["--board", board, "comment", todoId, comment, "--author", author]).catch(() => null);
      }
      store.todos[todoId] = Object.assign({}, meta, {
        kanbanAssignee,
        dispatchMode: dispatch.dispatchMode,
        manualOnly: dispatch.manualOnly,
        updatedAt: now,
        kanbanStatus: "todo",
        blockedAt: "",
        blockReason: "",
      });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "todo", assignee: kanbanAssignee }, store.todos[todoId], payload);
    }

    if (action === "comment") {
      const comment = String(payload.comment || payload.text || payload.reason || "").trim();
      if (!comment) return { ok: false, error: "comment is required" };
      const author = String(payload.author || payload.source_principal || "Hermes Mobile").trim() || "Hermes Mobile";
      const isLearningGrowthSubmission = bool(payload.learningGrowthSubmission || payload.learning_growth_submission);
      const learningGrowthEvaluation = payload.learningGrowthEvaluation || payload.learning_growth_evaluation || null;
      const isLearningGrowthEvaluation = Boolean(learningGrowthEvaluation && typeof learningGrowthEvaluation === "object");
      await kanban(["--board", board, "comment", todoId, comment, "--author", author]);
      store.todos[todoId] = Object.assign({}, meta, {
        lastComment: comment,
        lastCommentAt: now,
        ...(isLearningGrowthSubmission ? {
          learningGrowthSubmissionStatus: "submitted",
          learningGrowthSubmissionKind: String(payload.submissionKind || payload.submission_kind || "writing").trim() || "writing",
          learningGrowthSubmissionAt: now,
          learningGrowthSubmissionText: comment,
          learningGrowthEvaluationStatus: "pending",
          learningGrowthEvaluationAt: "",
          learningGrowthNextStep: "pending_evaluation",
          learningGrowthReportPath: "",
          learningGrowthReportName: "",
          learningGrowthStrengths: [],
          learningGrowthFocusAreas: [],
          learningGrowthRewriteChecklist: [],
          learningGrowthReflectionPrompts: [],
          learningGrowthSentenceFeedback: [],
          learningGrowthFinalConclusion: "",
          learningGrowthNextPractice: "",
          learningGrowthParentNote: "",
          learningGrowthFeedbackMethod: "",
          learningGrowthAiFeedbackStatus: "",
        } : {}),
        ...(isLearningGrowthEvaluation ? {
          learningGrowthEvaluationStatus: String(learningGrowthEvaluation.status || "completed").trim() || "completed",
          learningGrowthEvaluationAt: String(learningGrowthEvaluation.evaluatedAt || now).trim() || now,
          learningGrowthScore: Number(learningGrowthEvaluation.score || 0) || 0,
          learningGrowthMaxScore: Number(learningGrowthEvaluation.maxScore || 100) || 100,
          learningGrowthPassed: bool(learningGrowthEvaluation.passed),
          learningGrowthFeedbackSummary: String(learningGrowthEvaluation.summary || "").trim(),
          learningGrowthFeedbackMethod: String(learningGrowthEvaluation.feedbackMethod || "").trim(),
          learningGrowthAiFeedbackStatus: String(learningGrowthEvaluation.aiFeedbackStatus || "").trim(),
          learningGrowthRevisionRequirements: arrayFromValue(learningGrowthEvaluation.revisionRequirements, 8),
          learningGrowthNextStep: String(learningGrowthEvaluation.nextStep || "").trim(),
          learningGrowthReportPath: String(learningGrowthEvaluation.report?.path || "").trim(),
          learningGrowthReportName: String(learningGrowthEvaluation.report?.name || "").trim(),
          learningGrowthStrengths: arrayFromValue(learningGrowthEvaluation.feedbackSections?.strengths, 8),
          learningGrowthFocusAreas: arrayFromValue(learningGrowthEvaluation.feedbackSections?.focusAreas, 8),
          learningGrowthRewriteChecklist: arrayFromValue(learningGrowthEvaluation.feedbackSections?.rewriteChecklist, 8),
          learningGrowthReflectionPrompts: arrayFromValue(learningGrowthEvaluation.feedbackSections?.reflectionPrompts, 8),
          learningGrowthSentenceFeedback: objectArrayFromValue(learningGrowthEvaluation.feedbackSections?.sentenceFeedback, 8),
          learningGrowthFinalConclusion: String(learningGrowthEvaluation.feedbackSections?.finalConclusion || "").trim(),
          learningGrowthNextPractice: String(learningGrowthEvaluation.feedbackSections?.nextPractice || "").trim(),
          learningGrowthParentNote: String(learningGrowthEvaluation.feedbackSections?.parentNote || "").trim(),
          learningGrowthRewardStatus: String(learningGrowthEvaluation.reward?.status || "").trim(),
          learningGrowthRewardCoins: Number(learningGrowthEvaluation.reward?.coinAmount || 0) || 0,
          learningGrowthRewardEntryId: String(learningGrowthEvaluation.reward?.entryId || "").trim(),
        } : {}),
        updatedAt: now,
      });
      saveMetadataStore(store);
      return Object.assign(
        rowFromTask({ id: todoId, title: meta.content || todoId, status: meta.kanbanStatus || meta.kanban_status || "todo" }, store.todos[todoId], payload),
        { action: "comment" },
      );
    }

    if (action === "revise" || action === "request_changes") {
      const revisionRequest = String(payload.comment || payload.text || payload.reason || "").trim();
      if (!revisionRequest) return { ok: false, error: "revision request is required" };
      const author = String(payload.author || payload.source_principal || "Hermes Mobile").trim() || "Hermes Mobile";
      const originalTitle = String(meta.content || payload.content || todoId).trim() || todoId;
      const revisionCount = (Number(meta.revisionCount ?? meta.revision_count ?? 0) || 0) + 1;
      const originalCaseCardId = String(meta.caseCardId || meta.case_card_id || todoId).trim() || todoId;
      const caseId = String(meta.caseId || meta.case_id || `manual-revision-${safeSlug(todoId, "card")}`).trim();
      const caseMode = String(meta.caseMode || meta.case_mode || "manual-revision").trim();
      const caseTemplate = String(meta.caseTemplate || meta.case_template || "").trim();
      const caseSourceText = String(meta.caseSourceText || meta.case_source_text || originalTitle).trim();
      const caseSummary = String(meta.caseSummary || meta.case_summary || `Manual revision for ${originalTitle}`).trim();
      const caseCover = meta.caseCover || meta.case_cover || null;
      const topicThreadId = String(meta.topicThreadId || meta.topic_thread_id || "").trim();
      const topicTaskGroupId = String(meta.topicTaskGroupId || meta.topic_task_group_id || "").trim();
      const sharedDirectoryPath = String(meta.sharedDirectoryPath || meta.shared_directory_path || "").trim();
      const caseDirectoryPath = String(meta.caseDirectoryPath || meta.case_directory_path || "").trim();
      const manualWorkflowRevision = caseMode === "study-plan" || caseMode === "assessment-plan";
      const originalCaseCardIndex = Number(meta.caseCardIndex ?? meta.case_card_index ?? 0) || 1;
      const currentCaseCardCount = Number(meta.caseCardCount ?? meta.case_card_count ?? 0) || originalCaseCardIndex;
      const caseCardIndex = manualWorkflowRevision ? originalCaseCardIndex : currentCaseCardCount + 1;
      const caseCardCount = manualWorkflowRevision ? currentCaseCardCount : Math.max(caseCardIndex, currentCaseCardCount);
      const revisionTitle = String(payload.title || payload.content || `修改：${originalTitle}`).trim();
      const revisionDescription = [
        `Original card: ${todoId}`,
        `Revision request from ${author}:`,
        revisionRequest,
        meta.description ? `Original description:\n${meta.description}` : "",
      ].filter(Boolean).join("\n\n");
      const revision = await add(Object.assign({}, payload, {
        action: "add",
        todo_id: "",
        content: revisionTitle,
        description: revisionDescription,
        assignee: payload.assignee || meta.assignee || payload.source_principal || "",
        assignee_label: payload.assignee_label || meta.assigneeLabel || meta.assignee || payload.source_principal || "",
        case_id: caseId,
        case_mode: caseMode,
        case_template: caseTemplate,
        case_source_text: caseSourceText,
        case_summary: caseSummary,
        case_cover: caseCover,
        topic_thread_id: topicThreadId,
        topic_task_group_id: topicTaskGroupId,
        shared_directory_path: sharedDirectoryPath,
        case_directory_path: caseDirectoryPath,
        case_card_id: `${originalCaseCardId}-revision-${revisionCount}`,
        case_card_index: caseCardIndex,
        case_card_count: caseCardCount,
        case_depends_on: manualWorkflowRevision ? [] : [originalCaseCardId],
        case_deliverables: arrayFromValue(meta.caseDeliverables || meta.case_deliverables, 8),
        case_acceptance: arrayFromValue(meta.caseAcceptance || meta.case_acceptance, 7).concat(["Complete the requested modification and update the receipt."]).slice(0, 8),
        case_card_goal: compactValue(revisionRequest, 240),
        revision_of: todoId,
        revision_request: revisionRequest,
        revision_requested_at: now,
        revision_requested_by: author,
        revision_count: revisionCount,
        idempotency_key: "",
      }));
      if (!revision?.ok) return revision;
      await kanban([
        "--board",
        board,
        "comment",
        todoId,
        `Manual revision requested: ${revisionRequest}\nFollow-up card: ${revision.id}`,
        "--author",
        author,
      ]).catch(() => null);
      const nextStore = metadataStore();
      const previousOriginal = nextStore.todos[todoId] || meta;
      nextStore.todos[todoId] = Object.assign({}, previousOriginal, {
        caseId,
        caseMode,
        caseTemplate,
        caseSourceText,
        caseSummary,
        caseCover,
        topicThreadId,
        topicTaskGroupId,
        sharedDirectoryPath,
        caseDirectoryPath,
        caseCardId: originalCaseCardId,
        caseCardIndex: Number(previousOriginal.caseCardIndex ?? previousOriginal.case_card_index ?? 0) || 1,
        caseCardCount,
        revisionRequest,
        revisionRequestedAt: now,
        revisionRequestedBy: author,
        revisionCount,
        revisionCardId: revision.id,
        lastComment: revisionRequest,
        lastCommentAt: now,
        updatedAt: now,
      });
      saveMetadataStore(nextStore);
      return Object.assign({}, revision, {
        action: "revise",
        originalId: todoId,
        revisionId: revision.id,
        revisionCard: revision,
      });
    }

    return { ok: false, error: `unknown action: ${action}` };
  }

  function pendingPushes(payload = {}) {
    const store = metadataStore();
    const principals = new Set(Array.isArray(payload.principals) ? payload.principals.map(String) : []);
    const now = Date.now();
    const rawBlockedDelay = Number(payload.blocked_notification_delay_minutes ?? payload.blockedNotificationDelayMinutes);
    const blockedDelayMinutes = Number.isFinite(rawBlockedDelay) && rawBlockedDelay >= 0 ? rawBlockedDelay : 10;
    const blockedDelayMs = blockedDelayMinutes * 60 * 1000;
    const events = [];
    for (const [id, meta] of Object.entries(store.todos)) {
      if (meta.completedAt || meta.cancelledAt) continue;
      const principalId = String(meta.assignee || meta.createdBy || "");
      if (principals.size && !principals.has(principalId)) continue;
      if (String(meta.kanbanStatus || meta.kanban_status || "").trim().toLowerCase() === "blocked") {
        if (["study-plan", "assessment-plan"].includes(String(meta.caseMode || meta.case_mode || "").trim())) continue;
        const blockedAt = Date.parse(meta.blockedAt || meta.updatedAt || "");
        if (Number.isFinite(blockedAt) && now - blockedAt >= blockedDelayMs) {
          const markKey = `kanban-todo:${id}:blocked:${meta.blockedAt || meta.updatedAt || ""}`;
          if (!store.pushMarks[markKey]) {
            const reason = String(meta.blockReason || "").trim();
            events.push({
              markKey,
              todoId: id,
              principalId,
              workspaceId: meta.workspaceId || principalId,
              messageType: "blocked",
              title: "\u770b\u677f\u5361\u7247\u5df2\u963b\u585e",
              body: `${meta.content || id}${reason ? `\n${reason}` : ""}`,
              tag: `hermes-kanban-todo-${id}-blocked`,
            });
          }
        }
      }
      const dueAt = Date.parse(meta.dueAt || "");
      const leadMinutes = Math.max(0, Number(meta.reminderLeadMinutes ?? meta.reminder_lead_minutes ?? 0) || 0);
      const reminderAt = Number.isFinite(dueAt) ? dueAt - leadMinutes * 60 * 1000 : NaN;
      if (!Number.isFinite(reminderAt) || reminderAt > now) continue;
      const markKey = `kanban-todo:${id}:due:${meta.dueAt || ""}:lead:${leadMinutes}`;
      if (store.pushMarks[markKey]) continue;
      events.push({
        markKey,
        todoId: id,
        principalId,
        workspaceId: meta.workspaceId || principalId,
        messageType: "due",
        title: leadMinutes > 0 ? "待办提醒" : "待办到期",
        body: `${meta.content || id}\n时间：${meta.dueLocal || meta.dueAt || ""}`,
        tag: `hermes-kanban-todo-${id}`,
      });
    }
    return { ok: true, events: events.slice(0, positiveNumber(payload.limit, 100)) };
  }

  function markWebPush(payload = {}) {
    const store = metadataStore();
    const markKey = String(payload.markKey || payload.mark_key || "").trim();
    if (markKey) {
      store.pushMarks[markKey] = {
        todoId: String(payload.todoId || payload.todo_id || ""),
        principalId: String(payload.principalId || payload.principal_id || ""),
        messageType: String(payload.messageType || payload.message_type || ""),
        status: String(payload.status || "sent"),
        updatedAt: nowIso(),
      };
      saveMetadataStore(store);
    }
    return { ok: true };
  }

  async function run(payload = {}) {
    try {
      const action = String(payload.action || "").trim().toLowerCase();
      if (action === "list") return await list(payload);
      if (action === "add") return await add(payload);
      if (["complete", "cancel", "postpone", "delete", "block", "unblock", "comment", "revise", "request_changes"].includes(action)) return await mutate(payload);
      if (action === "reconcile_dependency_blocks") return await reconcileDependencyBlocks(payload);
      if (action === "web_pending_pushes") return pendingPushes(payload);
      if (action === "web_mark_push") return markWebPush(payload);
      if (action === "detail") return await detail(payload);
      return { ok: false, error: `unknown action: ${action}` };
    } catch (err) {
      return { ok: false, error: err.message || String(err), code: err.code || "" };
    }
  }

  return {
    run,
    safeSlug,
  };
}

module.exports = {
  createKanbanTodoBridge,
  looksQuestionMarkMojibake,
  parseJsonOutput,
  parseCommandArgs,
  preferStoredText,
  safeSlug,
};
