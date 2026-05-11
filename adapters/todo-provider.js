"use strict";

function defaultPublicTodo(row) {
  return row || {};
}

function todoMatchesSearch(todo, search) {
  const needle = String(search || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    todo?.id,
    todo?.content,
    todo?.assigneeLabel,
    todo?.dueLocal,
  ].join("\n").toLowerCase().includes(needle);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createTodoProvider(options = {}) {
  const runBridge = options.runBridge;
  if (typeof runBridge !== "function") throw new TypeError("runBridge is required");

  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner");
  const todoAssigneesForWorkspace = typeof options.todoAssigneesForWorkspace === "function"
    ? options.todoAssigneesForWorkspace
    : () => [];
  const publicTodo = typeof options.publicTodo === "function" ? options.publicTodo : defaultPublicTodo;
  const sourceName = typeof options.sourceName === "function"
    ? options.sourceName
    : () => String(options.sourceName || "hermes_todos");

  async function listTodos(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    const result = await runBridge({
      action: "list",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      scope: args.scope || "mine",
      include_completed: Boolean(args.includeCompleted),
      assignee: args.assignee || "",
      limit: positiveNumber(args.limit, 80),
    });
    if (!result?.ok) return { ok: false, result, error: result?.error || "Todo operation failed" };

    const todos = (Array.isArray(result.todos) ? result.todos : [])
      .map(publicTodo)
      .filter((todo) => todoMatchesSearch(todo, args.search));

    return {
      ok: true,
      data: todos,
      assignees: todoAssigneesForWorkspace(workspaceId),
      source: sourceName(),
      result,
    };
  }

  function addTodo(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    const suppressExternalNotice = args.suppressExternalNotice ?? args.suppress_external_notice ?? args.suppressWeixinNotice;
    return runBridge({
      action: "add",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      assignee: args.assignee || "",
      content: args.content || "",
      due_time: args.dueTime || args.due_time || "",
      suppress_external_notice: suppressExternalNotice !== false,
      suppress_weixin_notice: suppressExternalNotice !== false,
      reminder_lead_minutes: args.reminderLeadMinutes ?? args.reminder_lead_minutes ?? null,
      recurrence: args.recurrence || "none",
      recurrence_days: args.recurrenceDays || args.recurrence_days || "",
      recurrence_until: args.recurrenceUntil || args.recurrence_until || "",
    });
  }

  function mutateTodo(args = {}) {
    const workspaceId = args.workspaceId || "owner";
    const payload = {
      action: args.action || "",
      workspace_id: workspaceId,
      source_principal: workspacePrincipal(workspaceId),
      todo_id: args.todoId || args.todo_id || "",
      assignee: args.assignee || "",
      recurrence_scope: args.recurrenceScope || args.recurrence_scope || "one",
      due_time: args.dueTime || args.due_time || "",
      reason: args.reason || "",
    };
    const comment = String(args.comment || args.text || "").trim();
    if (comment) payload.comment = comment;
    const author = String(args.author || "").trim();
    if (author) payload.author = author;
    return runBridge(payload);
  }

  function pendingPushes(args = {}) {
    return runBridge({
      action: "web_pending_pushes",
      source_principal: args.sourcePrincipal || args.source_principal || "owner",
      principals: Array.isArray(args.principals) ? args.principals : [],
      limit: positiveNumber(args.limit, 100),
      recent_create_minutes: positiveNumber(args.recentCreateMinutes ?? args.recent_create_minutes, 30),
      confirmed_mark_keys: Array.isArray(args.confirmedMarkKeys) ? args.confirmedMarkKeys : [],
      retry_without_receipt_minutes: positiveNumber(args.retryWithoutReceiptMinutes ?? args.retry_without_receipt_minutes, 3),
      retry_limit: positiveNumber(args.retryLimit ?? args.retry_limit, 3),
    });
  }

  function markWebPush(args = {}) {
    return runBridge({
      action: "web_mark_push",
      markKey: args.markKey || args.mark_key || "",
      todoId: args.todoId || args.todo_id || "",
      principalId: args.principalId || args.principal_id || "",
      messageType: args.messageType || args.message_type || "message",
      localDate: args.localDate || args.local_date || "",
      status: args.status || "sent",
      countAttempt: args.countAttempt !== false,
      error: args.error || "",
    });
  }

  return {
    addTodo,
    listTodos,
    markWebPush,
    mutateTodo,
    pendingPushes,
    publicTodo,
  };
}

module.exports = {
  createTodoProvider,
};
