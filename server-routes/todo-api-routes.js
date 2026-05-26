"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const TODO_API_ROUTE_SPECS = Object.freeze([
  {
    id: "todos-list",
    method: "GET",
    path: "/api/todos",
    group: "todo",
    moduleKey: "todo",
    handlerKey: "listTodos",
    summary: "List current workspace Todo/Kanban items.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["todo", "kanban"],
    tags: ["todo", "list"],
  },
  {
    id: "todos-create",
    method: "POST",
    path: "/api/todos",
    group: "todo",
    moduleKey: "todo",
    handlerKey: "createTodo",
    summary: "Create one workspace-scoped Todo/Kanban item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["todo", "kanban"],
    tags: ["todo", "create"],
  },
  {
    id: "todos-push-tick",
    method: "POST",
    path: "/api/todos/push/tick",
    group: "todo",
    moduleKey: "todo",
    handlerKey: "pushTick",
    summary: "Run an Owner-only Todo Web Push tick.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["todo", "web-push"],
    tags: ["todo", "push", "owner"],
  },
  {
    id: "todos-action",
    method: "POST",
    pathRegex: /^\/api\/todos\/[^/]+\/(?:complete|cancel|postpone|delete|block|unblock|comment|revise)$/,
    group: "todo",
    moduleKey: "todo",
    handlerKey: "mutateTodo",
    summary: "Mutate one workspace-scoped Todo/Kanban item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["todo", "kanban"],
    tags: ["todo", "mutate"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`todo api routes require ${name}`);
  }
}

function todoActionFromPath(pathname) {
  const match = String(pathname || "").match(/^\/api\/todos\/([^/]+)\/(complete|cancel|postpone|delete|block|unblock|comment|revise)$/);
  if (!match) return null;
  return {
    todoId: decodeURIComponent(match[1] || ""),
    action: match[2],
  };
}

function createTodoApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "boolParam",
    "broadcast",
    "clearKanbanCardListCache",
    "maybeReconcileKanbanDependencyBlocks",
    "notifyTodoCreated",
    "publicTodo",
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "runTodoWebPushTick",
    "sendJson",
    "todoErrorResponse",
    "useKanbanTodoBackend",
    "workspacePrincipal",
  ]);
  if (!deps.todoProvider || typeof deps.todoProvider.listTodos !== "function" || typeof deps.todoProvider.addTodo !== "function" || typeof deps.todoProvider.mutateTodo !== "function") {
    throw new Error("todo api routes require todoProvider.listTodos/addTodo/mutateTodo");
  }

  const registry = createApiRouteRegistry(TODO_API_ROUTE_SPECS);

  function workspaceFromUrl(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  async function upsertCreatedTodoInboxItem(workspaceId, result, body = {}) {
    const service = deps.actionInboxService;
    if (!service || typeof service.upsertSourceItem !== "function") return null;
    const todo = deps.publicTodo(result) || {};
    const todoId = String(todo.id || result?.id || result?.todoId || "").trim();
    const content = String(todo.content || todo.title || result?.content || body.content || "").trim();
    if (!todoId && !content) return null;
    try {
      const inboxResult = await Promise.resolve(service.upsertSourceItem({
        workspaceId,
        assigneeWorkspaceId: workspaceId,
        sourceType: "manual",
        sourceId: todoId || `todo:${content.slice(0, 80)}`,
        itemType: "todo",
        status: "open",
        priority: "normal",
        title: content || todoId || "Todo",
        summary: String(todo.summary || result?.summary || body.summary || "").trim(),
        actionLabel: "\u5904\u7406",
        sourceRef: {
          todoId,
          compatibilityRoute: "/api/todos",
        },
        dedupeKey: todoId ? `todo:${todoId}` : "",
        reopen: true,
      }));
      return inboxResult?.ok ? inboxResult.item : null;
    } catch (_) {
      return null;
    }
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromUrl(url));
    if (!workspaceId) return;
    let maintenance = null;
    if (deps.useKanbanTodoBackend()) {
      maintenance = await deps.maybeReconcileKanbanDependencyBlocks(workspaceId)
        .catch((err) => ({ ok: false, error: err.message || String(err) }));
    }
    const result = await deps.todoProvider.listTodos({
      workspaceId,
      scope: url.searchParams.get("scope") || "mine",
      includeCompleted: deps.boolParam(url.searchParams.get("includeCompleted")),
      assignee: url.searchParams.get("assignee") || "",
      limit: Number(url.searchParams.get("limit") || "80"),
      search: url.searchParams.get("search") || "",
    });
    if (!result.ok) {
      deps.todoErrorResponse(res, result.result || result);
      return;
    }
    deps.sendJson(res, 200, {
      data: result.data,
      assignees: result.assignees,
      source: result.source,
      maintenance,
    });
  }

  async function handleCreate(req, res) {
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const result = await deps.todoProvider.addTodo({
      workspaceId,
      assignee: body.assignee || "",
      content: body.content || "",
      dueTime: body.dueTime || body.due_time || "",
      suppressExternalNotice: true,
      reminderLeadMinutes: body.reminderLeadMinutes ?? body.reminder_lead_minutes ?? null,
      recurrence: body.recurrence || "none",
      recurrenceDays: body.recurrenceDays || body.recurrence_days || "",
      recurrenceUntil: body.recurrenceUntil || body.recurrence_until || "",
    });
    if (!result.ok) {
      deps.todoErrorResponse(res, result);
      return;
    }
    deps.clearKanbanCardListCache(workspaceId);
    deps.broadcast({ type: "todos.updated", workspaceId });
    const inboxItem = await upsertCreatedTodoInboxItem(workspaceId, result, body);
    if (inboxItem?.id) deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: inboxItem.id });
    deps.notifyTodoCreated(result, deps.workspacePrincipal(workspaceId));
    deps.sendJson(res, 201, { todo: deps.publicTodo(result), result });
  }

  async function handlePushTick(req, res, url) {
    if (!deps.requireOwner(req, res)) return;
    const body = await deps.readBody(req).catch(() => ({}));
    const dryRun = deps.boolParam(body.dryRun ?? body.dry_run ?? url.searchParams.get("dryRun"));
    const limit = Number(body.limit || url.searchParams.get("limit") || 100);
    try {
      const result = await deps.runTodoWebPushTick({ dryRun, limit });
      deps.sendJson(res, 200, result);
    } catch (err) {
      deps.sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
  }

  async function handleAction(req, res, url) {
    const parsed = todoActionFromPath(url.pathname);
    if (!parsed) return false;
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return true;
    const { action, todoId } = parsed;
    const result = await deps.todoProvider.mutateTodo({
      action,
      workspaceId,
      todoId,
      assignee: body.assignee || "",
      recurrenceScope: body.recurrenceScope || body.recurrence_scope || "one",
      dueTime: body.dueTime || body.due_time || "",
      reason: body.reason || "",
      comment: body.comment || body.text || "",
      content: body.content || body.title || "",
      description: body.description || "",
      author: body.author || "",
    });
    if (!result.ok) {
      deps.todoErrorResponse(res, result);
      return true;
    }
    deps.clearKanbanCardListCache(workspaceId);
    deps.broadcast({ type: "todos.updated", workspaceId, todoId: result.id, action });
    deps.sendJson(res, 200, { ok: true, result });
    return true;
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "todos-list") await handleList(req, res, url);
    else if (route.id === "todos-create") await handleCreate(req, res);
    else if (route.id === "todos-push-tick") await handlePushTick(req, res, url);
    else if (route.id === "todos-action") await handleAction(req, res, url);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  TODO_API_ROUTE_SPECS,
  createTodoApiRoutes,
};
