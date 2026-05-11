"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");

const META_START = "<!-- hermes-mobile-todo ";
const META_END = " -->";
const OPEN_KANBAN_STATUSES = new Set(["", "triage", "todo", "ready", "running", "blocked"]);

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
    createdBy: meta.createdBy || "",
    dueAt: meta.dueAt || "",
    dueLocal: meta.dueLocal || "",
    reminderLeadMinutes: meta.reminderLeadMinutes || 0,
    recurrence: meta.recurrence || "none",
    recurrenceLabel: meta.recurrenceLabel || "",
    recurrenceDays: meta.recurrenceDays || "",
  };
  return `${META_START}${JSON.stringify(publicMeta)}${META_END}\n\n${String(content || "").trim()}`;
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
      content: String(meta.content || title || id),
      status,
      kanban_status: kanbanStatus || "todo",
      kanban_board: meta.board || boardForPayload(payload),
      kanban_assignee: String(textFromTask(task, "assignee") || task.assignee || meta.assignee || ""),
      kanban_priority: Number(task.priority ?? task.task?.priority ?? meta.priority ?? 0) || 0,
      kanban_tenant: String(textFromTask(task, "tenant") || task.tenant || meta.tenant || payload.source_principal || ""),
      kanban_workspace_kind: String(meta.workspaceKind || workspaceKindFromTask(task)),
      kanban_created_by: String(textFromTask(task, "created_by") || textFromTask(task, "createdBy") || meta.createdBy || payload.source_principal || ""),
      kanban_started_at: dateStringFromTask(task.started_at || task.startedAt || meta.startedAt || meta.started_at || ""),
      kanban_completed_at: dateStringFromTask(task.completed_at || task.completedAt || meta.completedAt || meta.completed_at || ""),
      kanban_result: String(textFromTask(task, "result") || task.result || meta.result || ""),
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
      created_at: dateStringFromTask(meta.createdAt || meta.created_at || task.created_at || task.createdAt || ""),
      updated_at: dateStringFromTask(meta.updatedAt || meta.updated_at || task.updated_at || task.updatedAt || ""),
      completed_at: completedAt || (kanbanStatus === "done" ? dateStringFromTask(task.completed_at || task.completedAt || task.updated_at || task.updatedAt || "") : ""),
      cancelled_at: cancelledAt,
      source: "kanban",
      ok: true,
    };
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
      .map((task) => rowFromTask(task, store.todos[taskIdFrom(task)] || {}, payload))
      .filter(Boolean);
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

  async function add(payload = {}) {
    const content = String(payload.content || "").trim();
    const source = String(payload.source_principal || "owner").trim() || "owner";
    const workspaceId = String(payload.workspace_id || payload.workspaceId || source).trim() || source;
    const dueAt = parseDue(payload.due_time);
    if (!content) return { ok: false, error: "Todo content is required" };
    if (!dueAt) return { ok: false, error: "Todo due time is required" };
    const board = await ensureBoard(payload);
    const now = nowIso();
    const assignee = String(payload.assignee || source).trim() || source;
    const meta = {
      workspaceId,
      board,
      content,
      assignee,
      assigneeLabel: String(payload.assignee_label || assignee),
      createdBy: source,
      dueAt,
      dueLocal: dueLocal(dueAt),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      reminderLeadMinutes: Number(payload.reminder_lead_minutes || 0) || 0,
      recurrence: String(payload.recurrence || "none"),
      recurrenceLabel: String(payload.recurrence || "none"),
      recurrenceDays: String(payload.recurrence_days || ""),
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
      assignee,
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
    return rowFromTask({ id, title: content, status: "todo" }, store.todos[id], payload);
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
      await kanban(["--board", board, "complete", todoId, "--result", "Completed from Hermes Mobile todo view."]).catch(async (err) => {
        if (!/json|unknown option/i.test(String(err.message || ""))) throw err;
      });
      store.todos[todoId] = Object.assign({}, meta, { completedAt: now, updatedAt: now });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "done" }, store.todos[todoId], payload);
    }

    if (action === "cancel" || action === "delete") {
      await kanban(["--board", board, "archive", todoId]);
      store.todos[todoId] = Object.assign({}, meta, { cancelledAt: now, updatedAt: now });
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
      store.todos[todoId] = Object.assign({}, meta, { updatedAt: now });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "blocked" }, store.todos[todoId], payload);
    }

    if (action === "unblock") {
      await kanban(["--board", board, "unblock", todoId]);
      store.todos[todoId] = Object.assign({}, meta, { updatedAt: now });
      saveMetadataStore(store);
      return rowFromTask({ id: todoId, title: meta.content || todoId, status: "todo" }, store.todos[todoId], payload);
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

    return { ok: false, error: `unknown action: ${action}` };
  }

  function pendingPushes(payload = {}) {
    const store = metadataStore();
    const principals = new Set(Array.isArray(payload.principals) ? payload.principals.map(String) : []);
    const now = Date.now();
    const events = [];
    for (const [id, meta] of Object.entries(store.todos)) {
      if (meta.completedAt || meta.cancelledAt) continue;
      const principalId = String(meta.assignee || meta.createdBy || "");
      if (principals.size && !principals.has(principalId)) continue;
      const dueAt = Date.parse(meta.dueAt || "");
      if (!Number.isFinite(dueAt) || dueAt > now) continue;
      const markKey = `kanban-todo:${id}:due:${meta.dueAt || ""}`;
      if (store.pushMarks[markKey]) continue;
      events.push({
        markKey,
        todoId: id,
        principalId,
        workspaceId: meta.workspaceId || principalId,
        messageType: "due",
        title: "待办到期",
        body: `${meta.content || id}\n截止：${meta.dueLocal || meta.dueAt || ""}`,
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
      if (["complete", "cancel", "postpone", "delete", "block", "unblock", "comment"].includes(action)) return await mutate(payload);
      if (action === "web_pending_pushes") return pendingPushes(payload);
      if (action === "web_mark_push") return markWebPush(payload);
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
