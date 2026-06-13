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
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "runTodoWebPushTick",
    "sendJson",
    "workspacePrincipal",
  ]);
  if (!deps.actionInboxService || typeof deps.actionInboxService.listItems !== "function" || typeof deps.actionInboxService.dismissItem !== "function") {
    throw new Error("todo api routes require actionInboxService.listItems/dismissItem");
  }
  if (!deps.actionInboxTodoService || typeof deps.actionInboxTodoService.createTodo !== "function" || typeof deps.actionInboxTodoService.completeTodoItem !== "function") {
    throw new Error("todo api routes require actionInboxTodoService.createTodo/completeTodoItem");
  }

  const registry = createApiRouteRegistry(TODO_API_ROUTE_SPECS);

  function workspaceFromUrl(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  function publicTodoFromInboxItem(item = {}) {
    const sourceRef = item.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
    return {
      id: item.id || "",
      content: item.title || item.summary || "",
      title: item.title || item.summary || "",
      summary: item.summary || "",
      status: item.status === "done" ? "completed" : item.status,
      assignee: item.assigneeWorkspaceId || item.workspaceId || "",
      assigneeLabel: item.assigneeWorkspaceId || item.workspaceId || "",
      createdBy: sourceRef.creatorWorkspaceId || "",
      dueAt: item.dueAt || sourceRef.dueAt || "",
      dueLocal: item.dueAt || sourceRef.dueAt || "",
      source: "action_inbox",
      workspaceId: item.workspaceId || "",
    };
  }

  function todoError(res, status, error, extra = {}) {
    deps.sendJson(res, status, Object.assign({ ok: false, error }, extra));
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromUrl(url));
    if (!workspaceId) return;
    const result = deps.actionInboxService.listItems({
      workspaceId,
      itemType: "todo",
      includeDone: deps.boolParam(url.searchParams.get("includeCompleted")) || deps.boolParam(url.searchParams.get("includeDone")),
      limit: Number(url.searchParams.get("limit") || "80"),
      search: url.searchParams.get("search") || "",
    });
    if (!result.ok) {
      todoError(res, Number(result.status || 400), result.error || "todo_list_failed", { result });
      return;
    }
    deps.sendJson(res, 200, {
      data: (result.items || []).map(publicTodoFromInboxItem),
      assignees: [],
      source: { name: "action_inbox_todos", compatibilityRoute: "/api/todos" },
      maintenance: null,
    });
  }

  async function handleCreate(req, res) {
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const assigneeWorkspaceId = String(body.assigneeWorkspaceId || body.assignee_workspace_id || body.assignee || workspaceId || "owner").trim() || workspaceId;
    const result = await deps.actionInboxTodoService.createTodo({
      creatorWorkspaceId: workspaceId,
      assigneeWorkspaceId,
      title: body.title || body.content || body.text || "",
      summary: body.summary || body.description || "",
      dueAt: body.dueAt || body.due_at || body.dueTime || body.due_time || "",
      remindAt: body.remindAt || body.remind_at || body.availableAt || body.available_at || "",
      priority: body.priority || "normal",
      confirmed: true,
      actorPrincipalId: deps.workspacePrincipal(workspaceId),
    });
    if (!result.ok) {
      todoError(res, Number(result.status || 400), result.error || "todo_create_failed", { result });
      return;
    }
    deps.broadcast({ type: "actionInbox.updated", workspaceId: assigneeWorkspaceId, itemId: result.item?.id || "", action: "todo-create" });
    if (workspaceId !== assigneeWorkspaceId) deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: result.creatorTrackingItem?.id || result.item?.id || "", action: "todo-assigned" });
    deps.sendJson(res, 201, { todo: publicTodoFromInboxItem(result.item), result });
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
    let result = null;
    if (action === "complete") {
      result = await deps.actionInboxTodoService.completeTodoItem({
        itemId: todoId,
        workspaceId,
        actorPrincipalId: deps.workspacePrincipal(workspaceId),
        comment: body.comment || body.text || "",
      });
    } else if (action === "cancel" || action === "delete") {
      result = deps.actionInboxService.dismissItem({
        itemId: todoId,
        workspaceId,
        actorPrincipalId: deps.workspacePrincipal(workspaceId),
      });
    } else {
      result = { ok: false, status: 410, error: "legacy_todo_action_disabled" };
    }
    if (!result.ok) {
      todoError(res, Number(result.status || 400), result.error || "todo_action_failed", { result });
      return true;
    }
    deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: todoId, action });
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
