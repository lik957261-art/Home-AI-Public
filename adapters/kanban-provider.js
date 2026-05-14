"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");

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

function bodyWithMeta(content, meta) {
  const publicMeta = {
    schema: "hermes-mobile-todo",
    assignee: meta.assignee || "",
    assigneeLabel: meta.assigneeLabel || "",
    kanbanAssignee: meta.kanbanAssignee || "",
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
    caseCardId: meta.caseCardId || "",
    caseCardIndex: Number(meta.caseCardIndex || 0) || 0,
    caseCardCount: Number(meta.caseCardCount || 0) || 0,
    caseDependsOn: arrayFromValue(meta.caseDependsOn, 12),
    caseDeliverables: arrayFromValue(meta.caseDeliverables, 8),
    caseAcceptance: arrayFromValue(meta.caseAcceptance, 8),
    caseCardGoal: meta.caseCardGoal || "",
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
  const bodyParts = [String(meta.description || "").trim(), String(content || "").trim(), completionContract].filter(Boolean);
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
    const status = kanbanStatus === "done"
      ? "completed"
      : (kanbanStatus === "archived" || cancelledAt ? "cancelled" : "open");
    const title = textFromTask(task, "title") || textFromTask(task, "name") || meta.content || id;
    return {
      id,
      workspace_id: String(meta.workspaceId || meta.workspace_id || payload.workspace_id || payload.workspaceId || ""),
      content: String(meta.content || title || id),
      description: String(meta.description || ""),
      status,
      kanban_status: kanbanStatus || "todo",
      kanban_board: meta.board || boardForPayload(payload),
      kanban_assignee: String(textFromTask(task, "assignee") || task.assignee || meta.kanbanAssignee || meta.kanban_assignee || meta.assignee || ""),
      kanban_priority: Number(task.priority ?? task.task?.priority ?? meta.priority ?? 0) || 0,
      kanban_tenant: String(textFromTask(task, "tenant") || task.tenant || meta.tenant || payload.source_principal || ""),
      kanban_workspace_kind: String(meta.workspaceKind || workspaceKindFromTask(task)),
      kanban_created_by: String(textFromTask(task, "created_by") || textFromTask(task, "createdBy") || meta.createdBy || payload.source_principal || ""),
      kanban_started_at: dateStringFromTask(task.started_at || task.startedAt || meta.startedAt || meta.started_at || ""),
      kanban_completed_at: dateStringFromTask(task.completed_at || task.completedAt || meta.completedAt || meta.completed_at || ""),
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
      kanban_case_card_id: String(meta.caseCardId || meta.case_card_id || ""),
      kanban_case_card_index: Number(meta.caseCardIndex ?? meta.case_card_index ?? 0) || 0,
      kanban_case_card_count: Number(meta.caseCardCount ?? meta.case_card_count ?? 0) || 0,
      kanban_case_depends_on: arrayFromValue(meta.caseDependsOn || meta.case_depends_on, 12),
      kanban_case_deliverables: arrayFromValue(meta.caseDeliverables || meta.case_deliverables, 8),
      kanban_case_acceptance: arrayFromValue(meta.caseAcceptance || meta.case_acceptance, 8),
      kanban_case_card_goal: String(meta.caseCardGoal || meta.case_card_goal || ""),
      kanban_revision_of: String(meta.revisionOf || meta.revision_of || ""),
      kanban_revision_request: String(meta.revisionRequest || meta.revision_request || ""),
      kanban_revision_requested_at: String(meta.revisionRequestedAt || meta.revision_requested_at || ""),
      kanban_revision_requested_by: String(meta.revisionRequestedBy || meta.revision_requested_by || ""),
      kanban_revision_count: Number(meta.revisionCount ?? meta.revision_count ?? 0) || 0,
      created_at: dateStringFromTask(meta.createdAt || meta.created_at || task.created_at || task.createdAt || ""),
      updated_at: dateStringFromTask(meta.updatedAt || meta.updated_at || task.updated_at || task.updatedAt || ""),
      completed_at: completedAt || (kanbanStatus === "done" ? dateStringFromTask(task.completed_at || task.completedAt || task.updated_at || task.updatedAt || "") : ""),
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
        content: String(row.content || previous.content || id),
        workspaceId: workspaceId || previous.workspaceId || "",
        board: String(row.kanban_board || previous.board || boardForPayload(payload)),
        assignee: String(row.assignee_principal_id || previous.assignee || payload.source_principal || ""),
        assigneeLabel: String(row.assignee_label || previous.assigneeLabel || previous.assignee || ""),
        kanbanAssignee: String(row.kanban_assignee || previous.kanbanAssignee || ""),
        kanbanStatus: String(row.kanban_status || previous.kanbanStatus || "").trim().toLowerCase(),
        caseId: String(row.kanban_case_id || previous.caseId || ""),
        caseMode: String(row.kanban_case_mode || previous.caseMode || ""),
        caseTemplate: String(row.kanban_case_template || previous.caseTemplate || ""),
        caseSourceText: String(row.kanban_case_source_text || previous.caseSourceText || ""),
        caseSummary: String(row.kanban_case_summary || previous.caseSummary || ""),
        caseCover: row.kanban_case_cover || previous.caseCover || null,
        caseCardId: String(row.kanban_case_card_id || previous.caseCardId || ""),
        caseCardIndex: Number(row.kanban_case_card_index ?? previous.caseCardIndex ?? 0) || 0,
        caseCardCount: Number(row.kanban_case_card_count ?? previous.caseCardCount ?? 0) || 0,
        caseDependsOn: arrayFromValue(row.kanban_case_depends_on || previous.caseDependsOn, 12),
        caseDeliverables: arrayFromValue(row.kanban_case_deliverables || previous.caseDeliverables, 8),
        caseAcceptance: arrayFromValue(row.kanban_case_acceptance || previous.caseAcceptance, 8),
        caseCardGoal: String(row.kanban_case_card_goal || previous.caseCardGoal || ""),
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

  function dependencyLookup(rows = []) {
    const byId = new Map();
    const byCaseCard = new Map();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (id) byId.set(id, row);
      const caseId = String(row?.kanban_case_id || row?.kanbanCaseId || "").trim();
      const caseCardId = String(row?.kanban_case_card_id || row?.kanbanCaseCardId || "").trim();
      if (caseId && caseCardId) byCaseCard.set(`${caseId}\0${caseCardId}`, row);
    }
    return { byId, byCaseCard };
  }

  async function list(payload = {}) {
    const board = await ensureBoard(payload);
    const includeCompleted = Boolean(payload.include_completed);
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
    if (!includeCompleted) todos = todos.filter((todo) => todo.status === "open" && OPEN_KANBAN_STATUSES.has(todo.kanban_status));
    todos = todos.sort((a, b) => {
      const left = a.due_at || a.updated_at || a.created_at || "";
      const right = b.due_at || b.updated_at || b.created_at || "";
      return String(left).localeCompare(String(right));
    }).slice(0, positiveNumber(payload.limit, 80));
    return { ok: true, todos, source: "kanban", board };
  }

  async function reconcileDependencyBlocks(payload = {}) {
    const listed = await list(Object.assign({}, payload, {
      include_completed: true,
      limit: positiveNumber(payload.limit, 500),
    }));
    if (!listed?.ok) return listed;
    const rows = Array.isArray(listed.todos) ? listed.todos : [];
    const { byId, byCaseCard } = dependencyLookup(rows);
    const released = [];
    const errors = [];
    for (const row of rows) {
      if (String(row.kanban_status || "").trim().toLowerCase() !== "blocked") continue;
      const caseMode = String(row.kanban_case_mode || "").trim().toLowerCase();
      if (caseMode === "study-plan" || caseMode === "assessment-plan") continue;
      const caseId = String(row.kanban_case_id || "").trim();
      const dependsOn = arrayFromValue(row.kanban_case_depends_on, 12);
      if (!caseId || !dependsOn.length) continue;
      const dependencyRows = dependsOn.map((dependencyId) => (
        byCaseCard.get(`${caseId}\0${dependencyId}`) || byId.get(String(dependencyId || "").trim()) || null
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
    const kanbanAssignee = kanbanAssigneeForPayload(payload, assignee) || assignee;
    const meta = {
      workspaceId,
      board,
      content,
      description: String(payload.description || "").trim(),
      assignee,
      assigneeLabel: String(payload.assignee_label || assignee),
      kanbanAssignee,
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
      caseCardId: String(payload.case_card_id || payload.caseCardId || "").trim(),
      caseCardIndex: Number(payload.case_card_index ?? payload.caseCardIndex ?? 0) || 0,
      caseCardCount: Number(payload.case_card_count ?? payload.caseCardCount ?? 0) || 0,
      caseDependsOn: arrayFromValue(payload.case_depends_on || payload.caseDependsOn, 12),
      caseDeliverables: arrayFromValue(payload.case_deliverables || payload.caseDeliverables, 8),
      caseAcceptance: arrayFromValue(payload.case_acceptance || payload.caseAcceptance, 8),
      caseCardGoal: String(payload.case_card_goal || payload.caseCardGoal || "").trim(),
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
      bodyWithMeta(content, meta),
      "--created-by",
      source,
      "--assignee",
      kanbanAssignee,
      "--tenant",
      source,
      "--idempotency-key",
      idempotencyKey,
      ...(workspacePath ? ["--workspace", `dir:${workspacePath}`] : []),
      "--json",
    ];
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
      const kanbanAssignee = kanbanAssigneeForPayload(payload, accountAssignee);
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
      await kanban(["--board", board, "comment", todoId, comment, "--author", author]);
      store.todos[todoId] = Object.assign({}, meta, {
        lastComment: comment,
        lastCommentAt: now,
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
      const studyPlanRevision = caseMode === "study-plan";
      const originalCaseCardIndex = Number(meta.caseCardIndex ?? meta.case_card_index ?? 0) || 1;
      const currentCaseCardCount = Number(meta.caseCardCount ?? meta.case_card_count ?? 0) || originalCaseCardIndex;
      const caseCardIndex = studyPlanRevision ? originalCaseCardIndex : currentCaseCardCount + 1;
      const caseCardCount = studyPlanRevision ? currentCaseCardCount : Math.max(caseCardIndex, currentCaseCardCount);
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
        case_card_id: `${originalCaseCardId}-revision-${revisionCount}`,
        case_card_index: caseCardIndex,
        case_card_count: caseCardCount,
        case_depends_on: studyPlanRevision ? [] : [originalCaseCardId],
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
  parseJsonOutput,
  parseCommandArgs,
  safeSlug,
};
