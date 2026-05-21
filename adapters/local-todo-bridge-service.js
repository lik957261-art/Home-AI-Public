"use strict";

const crypto = require("node:crypto");

function createDefaultTodoId() {
  return `todo_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function defaultNowIso() {
  return new Date().toISOString();
}

function parseLocalTodoDue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.includes("T") ? text : text.replace(/\s+/, "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function localTodoDueLocal(value, formatLocalDateTime) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : formatLocalDateTime(date);
}

function localTodoAuthorized(row, source) {
  const principal = String(source || "").trim();
  if (!principal) return false;
  if (principal === "owner") return true;
  return [row?.assignee_principal_id, row?.created_by_principal].map((item) => String(item || "").trim()).includes(principal);
}

function localTodoMatchesList(row, source, scope) {
  const principal = String(source || "").trim();
  if (!principal) return false;
  if (principal === "owner") return true;
  const normalizedScope = String(scope || "mine").trim().toLowerCase();
  if (normalizedScope === "created") return String(row?.created_by_principal || "") === principal;
  return localTodoAuthorized(row, principal);
}

function createTodoRow(payload, source, now, formatLocalDateTime, createTodoId) {
  const content = String(payload.content || "").trim();
  const dueAt = parseLocalTodoDue(payload.due_time);
  if (!content) return { ok: false, error: "Todo content is required" };
  if (!dueAt) return { ok: false, error: "Todo due time is required" };
  const assignee = String(payload.assignee || source).trim() || source;
  return {
    id: createTodoId(),
    content,
    status: "open",
    assignee_principal_id: assignee,
    assignee_label: assignee,
    created_by_principal: source,
    due_at: dueAt,
    due_local: localTodoDueLocal(dueAt, formatLocalDateTime),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    reminder_lead_minutes: Number(payload.reminder_lead_minutes || 0) || 0,
    recurrence_kind: String(payload.recurrence || "none"),
    recurrence_label: String(payload.recurrence || "none"),
    recurrence_days: String(payload.recurrence_days || ""),
    recurrence_series_id: "",
    recurrence_template: false,
    created_at: now,
    updated_at: now,
    completed_at: "",
    cancelled_at: "",
    ok: true,
  };
}

function createLocalTodoBridgeService(options = {}) {
  const storePath = options.storePath;
  const readJsonStore = options.readJsonStore;
  const writeJsonStore = options.writeJsonStore;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const createTodoId = typeof options.createTodoId === "function" ? options.createTodoId : createDefaultTodoId;
  const formatLocalDateTime = typeof options.formatLocalDateTime === "function"
    ? options.formatLocalDateTime
    : ((date) => date.toISOString().slice(0, 16).replace("T", " "));
  const useSqliteServiceStore = typeof options.useSqliteServiceStore === "function"
    ? options.useSqliteServiceStore
    : (() => false);
  const mobileSqliteStore = typeof options.mobileSqliteStore === "function"
    ? options.mobileSqliteStore
    : (() => null);

  if (typeof readJsonStore !== "function") throw new Error("local todo bridge service requires readJsonStore");
  if (typeof writeJsonStore !== "function") throw new Error("local todo bridge service requires writeJsonStore");

  function localTodoStore() {
    const raw = readJsonStore(storePath, {});
    return {
      schemaVersion: 1,
      todos: Array.isArray(raw?.todos) ? raw.todos.filter((item) => item && typeof item === "object") : [],
      pushMarks: raw?.pushMarks && typeof raw.pushMarks === "object" && !Array.isArray(raw.pushMarks) ? raw.pushMarks : {},
      updatedAt: String(raw?.updatedAt || ""),
    };
  }

  function saveLocalTodoStore(store) {
    writeJsonStore(storePath, Object.assign({}, store, {
      schemaVersion: 1,
      updatedAt: nowIso(),
    }));
  }

  async function runSqliteTodoBridge(payload = {}) {
    const action = String(payload.action || "").trim().toLowerCase();
    const source = String(payload.source_principal || "owner").trim() || "owner";
    const store = mobileSqliteStore();
    const now = nowIso();

    if (action === "list") {
      return {
        ok: true,
        todos: store.listTodoItems({
          sourcePrincipal: source,
          scope: payload.scope || "mine",
          includeCompleted: Boolean(payload.include_completed),
          assignee: payload.assignee || "",
          limit: payload.limit || 80,
        }),
      };
    }

    if (action === "add") {
      const row = Object.assign(createTodoRow(payload, source, now, formatLocalDateTime, createTodoId), {
        source: "sqlite",
      });
      if (!row.ok) return row;
      store.importTodoItem(row);
      return row;
    }

    const todoId = String(payload.todo_id || "").trim();
    const row = store.getTodoItem(todoId);

    if (["complete", "cancel", "postpone", "delete"].includes(action)) {
      if (!row) return { ok: false, error: "No matching todo found." };
      if (!localTodoAuthorized(row, source)) return { ok: false, error: "Not authorized to mutate this todo." };
    }

    if (action === "complete") {
      row.status = "completed";
      row.completed_at = now;
      row.updated_at = now;
      store.importTodoItem(row);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "cancel") {
      row.status = "cancelled";
      row.cancelled_at = now;
      row.updated_at = now;
      store.importTodoItem(row);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "postpone") {
      const dueAt = parseLocalTodoDue(payload.due_time);
      if (!dueAt) return { ok: false, error: "due_time is required" };
      row.due_at = dueAt;
      row.due_local = localTodoDueLocal(dueAt, formatLocalDateTime);
      row.updated_at = now;
      store.importTodoItem(row);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "delete") {
      store.deleteTodoItem(todoId);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "web_pending_pushes") return { ok: true, events: [] };
    if (action === "web_mark_push") {
      store.audit("todo_web_push_mark", {
        actorWorkspaceId: "system",
        actorPrincipalId: source,
        targetType: "todo",
        targetId: String(payload.todoId || payload.todo_id || ""),
        payload: {
          markKey: String(payload.markKey || payload.mark_key || ""),
          principalId: String(payload.principalId || payload.principal_id || ""),
          messageType: String(payload.messageType || payload.message_type || ""),
          status: String(payload.status || "sent"),
        },
      });
      return { ok: true };
    }
    return { ok: false, error: `unknown action: ${action}` };
  }

  async function runLocalJsonTodoBridge(payload = {}) {
    const action = String(payload.action || "").trim().toLowerCase();
    const source = String(payload.source_principal || "owner").trim() || "owner";
    const store = localTodoStore();
    const now = nowIso();

    if (action === "list") {
      const includeCompleted = Boolean(payload.include_completed);
      const assignee = String(payload.assignee || "").trim();
      const limit = Math.max(1, Math.min(200, Number(payload.limit) || 80));
      let rows = store.todos.filter((row) => localTodoMatchesList(row, source, payload.scope || "mine"));
      if (!includeCompleted) rows = rows.filter((row) => String(row.status || "") === "open");
      if (assignee) rows = rows.filter((row) => String(row.assignee_principal_id || "") === assignee);
      rows = rows.sort((a, b) => String(a.due_at || a.created_at || "").localeCompare(String(b.due_at || b.created_at || ""))).slice(0, limit);
      return { ok: true, todos: rows };
    }

    if (action === "add") {
      const row = createTodoRow(payload, source, now, formatLocalDateTime, createTodoId);
      if (!row.ok) return row;
      store.todos.push(row);
      saveLocalTodoStore(store);
      return row;
    }

    const todoId = String(payload.todo_id || "").trim();
    const index = store.todos.findIndex((row) => String(row.id || "") === todoId);
    const row = index >= 0 ? store.todos[index] : null;

    if (["complete", "cancel", "postpone", "delete"].includes(action)) {
      if (!row) return { ok: false, error: "No matching todo found." };
      if (!localTodoAuthorized(row, source)) return { ok: false, error: "Not authorized to mutate this todo." };
    }

    if (action === "complete") {
      row.status = "completed";
      row.completed_at = now;
      row.updated_at = now;
      saveLocalTodoStore(store);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "cancel") {
      row.status = "cancelled";
      row.cancelled_at = now;
      row.updated_at = now;
      saveLocalTodoStore(store);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "postpone") {
      const dueAt = parseLocalTodoDue(payload.due_time);
      if (!dueAt) return { ok: false, error: "due_time is required" };
      row.due_at = dueAt;
      row.due_local = localTodoDueLocal(dueAt, formatLocalDateTime);
      row.updated_at = now;
      saveLocalTodoStore(store);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "delete") {
      store.todos.splice(index, 1);
      saveLocalTodoStore(store);
      return Object.assign({}, row, { ok: true, action });
    }
    if (action === "web_pending_pushes") return { ok: true, events: [] };
    if (action === "web_mark_push") {
      store.pushMarks[String(payload.markKey || payload.mark_key || "")] = {
        todoId: String(payload.todoId || payload.todo_id || ""),
        principalId: String(payload.principalId || payload.principal_id || ""),
        messageType: String(payload.messageType || payload.message_type || ""),
        status: String(payload.status || "sent"),
        updatedAt: now,
      };
      saveLocalTodoStore(store);
      return { ok: true };
    }
    return { ok: false, error: `unknown action: ${action}` };
  }

  function run(payload = {}) {
    if (useSqliteServiceStore()) return runSqliteTodoBridge(payload);
    return runLocalJsonTodoBridge(payload);
  }

  return {
    localTodoAuthorized,
    localTodoMatchesList,
    localTodoStore,
    parseLocalTodoDue,
    run,
    runLocalJsonTodoBridge,
    runSqliteTodoBridge,
    saveLocalTodoStore,
  };
}

module.exports = {
  createLocalTodoBridgeService,
  localTodoAuthorized,
  localTodoMatchesList,
  parseLocalTodoDue,
};
