"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const ACTION_INBOX_API_ROUTE_SPECS = Object.freeze([
  {
    id: "action-inbox-list",
    method: "GET",
    path: "/api/action-inbox",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "listItems",
    summary: "List workspace-scoped Action Inbox items.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox"],
    tags: ["action-inbox", "list"],
  },
  {
    id: "action-inbox-create",
    method: "POST",
    path: "/api/action-inbox",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "createManualItem",
    summary: "Create a manual Action Inbox item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox"],
    tags: ["action-inbox", "create"],
  },
  {
    id: "action-inbox-todo-draft-validate",
    method: "POST",
    path: "/api/action-inbox/todo-drafts/validate",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "validateTodoDraft",
    summary: "Validate a model-produced structured Todo draft without creating it.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox", "todo"],
    tags: ["action-inbox", "todo", "draft"],
  },
  {
    id: "action-inbox-todo-draft-interpret",
    method: "POST",
    path: "/api/action-inbox/todo-drafts/interpret",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "interpretTodoDraft",
    summary: "Interpret explicit natural-language Todo input into a structured draft.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox", "todo"],
    tags: ["action-inbox", "todo", "draft", "natural-language"],
  },
  {
    id: "action-inbox-todo-create",
    method: "POST",
    path: "/api/action-inbox/todos",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "createTodo",
    summary: "Create a host-owned Action Inbox Todo or one-shot reminder.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox", "todo", "web-push"],
    tags: ["action-inbox", "todo", "create"],
  },
  {
    id: "action-inbox-todo-tick",
    method: "POST",
    path: "/api/action-inbox/todos/tick",
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "activateDueTodos",
    summary: "Activate due one-shot Action Inbox Todo reminders.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: false,
    resourceTypes: ["action-inbox", "todo", "web-push"],
    tags: ["action-inbox", "todo", "tick", "owner"],
  },
  {
    id: "action-inbox-detail",
    method: "GET",
    pathRegex: /^\/api\/action-inbox\/[^/]+$/,
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "getItem",
    summary: "Read one Action Inbox item and its audit events.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox"],
    tags: ["action-inbox", "detail"],
  },
  {
    id: "action-inbox-action",
    method: "POST",
    pathRegex: /^\/api\/action-inbox\/[^/]+\/(?:complete|dismiss|snooze)$/,
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "mutateItem",
    summary: "Complete, dismiss, or snooze one Action Inbox item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox"],
    tags: ["action-inbox", "mutate"],
  },
  {
    id: "action-inbox-finance-ledger-join-review",
    method: "POST",
    pathRegex: /^\/api\/action-inbox\/[^/]+\/finance-ledger-join\/(?:approve|reject)$/,
    group: "action-inbox",
    moduleKey: "action-inbox",
    handlerKey: "financeLedgerJoinReview",
    summary: "Review a Finance ledger join request from an Action Inbox approval item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["action-inbox", "plugin", "finance"],
    tags: ["action-inbox", "plugin", "finance", "approval"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`action inbox api routes require ${name}`);
  }
}

function itemIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/api\/action-inbox\/([^/]+)(?:\/(complete|dismiss|snooze))?$/);
  if (!match) return null;
  return {
    itemId: decodeURIComponent(match[1] || ""),
    action: match[2] || "",
  };
}

function financeLedgerJoinReviewFromPath(pathname) {
  const match = String(pathname || "").match(/^\/api\/action-inbox\/([^/]+)\/finance-ledger-join\/(approve|reject)$/);
  if (!match) return null;
  return {
    itemId: decodeURIComponent(match[1] || ""),
    decision: match[2] || "",
  };
}

function responseFromResult(deps, res, result, successStatus = 200) {
  if (!result?.ok) {
    deps.sendJson(res, Number(result?.status || 400), {
      ok: false,
      error: result?.error || "action_inbox_failed",
    });
    return false;
  }
  deps.sendJson(res, successStatus, result);
  return true;
}

function createActionInboxApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "readBody",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  if (!deps.actionInboxService || typeof deps.actionInboxService.listItems !== "function") {
    throw new Error("action inbox api routes require actionInboxService");
  }
  if (deps.actionInboxTodoService && typeof deps.actionInboxTodoService.createTodo !== "function") {
    throw new Error("action inbox api routes require actionInboxTodoService.createTodo");
  }
  if (deps.financeLedgerJoinApprovalService && typeof deps.financeLedgerJoinApprovalService.reviewRequest !== "function") {
    throw new Error("action inbox api routes require financeLedgerJoinApprovalService.reviewRequest");
  }

  const registry = createApiRouteRegistry(ACTION_INBOX_API_ROUTE_SPECS);

  function workspaceFromUrl(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromUrl(url));
    if (!workspaceId) return;
    const result = deps.actionInboxService.listItems({
      workspaceId,
      status: url.searchParams.get("status") || "",
      sourceType: url.searchParams.get("sourceType") || "",
      itemType: url.searchParams.get("itemType") || "",
      excludedItemTypes: url.searchParams.getAll("excludeItemType").concat(url.searchParams.getAll("excludedItemType")),
      search: url.searchParams.get("search") || "",
      includeDone: /^(1|true|yes|on)$/i.test(String(url.searchParams.get("includeDone") || "")),
      includeSystemAudit: /^(1|true|yes|on)$/i.test(String(url.searchParams.get("includeSystemAudit") || "")),
      limit: Number(url.searchParams.get("limit") || 100),
    });
    responseFromResult(deps, res, result);
  }

  async function handleCreate(req, res, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const result = deps.actionInboxService.createManualItem(Object.assign({}, body, {
      workspaceId,
      auth: context.auth,
    }));
    if (responseFromResult(deps, res, result, 201) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: result.item?.id || "" });
    }
  }

  async function handleTodoDraftValidate(req, res, context = {}) {
    if (!deps.actionInboxTodoService || typeof deps.actionInboxTodoService.validateDraft !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "action_inbox_todo_service_unavailable" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || body.creatorWorkspaceId || "owner");
    if (!workspaceId) return;
    const result = deps.actionInboxTodoService.validateDraft(Object.assign({}, body, {
      workspaceId,
      creatorWorkspaceId: body.creatorWorkspaceId || workspaceId,
      auth: context.auth,
    }));
    responseFromResult(deps, res, result);
  }

  async function handleTodoDraftInterpret(req, res, context = {}) {
    if (typeof deps.interpretTodoNaturalLanguage !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "todo_natural_language_interpreter_unavailable" });
      return;
    }
    if (!deps.actionInboxTodoService || typeof deps.actionInboxTodoService.validateDraft !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "action_inbox_todo_service_unavailable" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const sourceText = String(body.text || body.naturalText || body.sourceText || "").trim();
    if (!sourceText) {
      deps.sendJson(res, 400, { ok: false, error: "todo_natural_language_text_required" });
      return;
    }
    const creatorWorkspaceId = deps.requireWorkspaceAccess(req, res, body.creatorWorkspaceId || body.workspaceId || "owner");
    if (!creatorWorkspaceId) return;
    const workspaceBase = typeof deps.findWorkspace === "function"
      ? deps.findWorkspace(creatorWorkspaceId)
      : { id: creatorWorkspaceId };
    const workspace = Object.assign({}, workspaceBase && typeof workspaceBase === "object" ? workspaceBase : {}, {
      id: creatorWorkspaceId,
      assignableWorkspaces: typeof deps.listAssignableWorkspaces === "function"
        ? deps.listAssignableWorkspaces(creatorWorkspaceId)
        : [],
    });
    const principalId = context.auth?.principalId
      || (typeof deps.workspacePrincipal === "function" ? deps.workspacePrincipal(creatorWorkspaceId) : "")
      || creatorWorkspaceId;
    let draft = null;
    try {
      draft = await deps.interpretTodoNaturalLanguage(sourceText, workspace, principalId);
    } catch (err) {
      deps.sendJson(res, 502, { ok: false, error: err?.message || String(err || "todo_natural_language_interpret_failed") });
      return;
    }
    const result = await deps.actionInboxTodoService.validateDraft(Object.assign({}, draft, {
      workspaceId: creatorWorkspaceId,
      creatorWorkspaceId: draft?.creatorWorkspaceId || creatorWorkspaceId,
      sourceText,
      auth: context.auth,
    }));
    responseFromResult(deps, res, Object.assign({}, result, {
      draft: Object.assign({}, draft || {}, result?.draft || {}, { sourceText }),
    }));
  }

  async function handleTodoCreate(req, res, context = {}) {
    if (!deps.actionInboxTodoService || typeof deps.actionInboxTodoService.createTodo !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "action_inbox_todo_service_unavailable" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const creatorWorkspaceId = deps.requireWorkspaceAccess(req, res, body.creatorWorkspaceId || body.workspaceId || "owner");
    if (!creatorWorkspaceId) return;
    const assigneeWorkspaceId = deps.requireWorkspaceAccess(req, res, body.assigneeWorkspaceId || body.assignee_workspace_id || creatorWorkspaceId);
    if (!assigneeWorkspaceId) return;
    const result = await deps.actionInboxTodoService.createTodo(Object.assign({}, body, {
      creatorWorkspaceId,
      assigneeWorkspaceId,
      workspaceId: creatorWorkspaceId,
      actorPrincipalId: context.auth?.principalId || "",
      auth: context.auth,
    }));
    if (responseFromResult(deps, res, result, 201) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: assigneeWorkspaceId, itemId: result.item?.id || "", action: "todo-create" });
      if (creatorWorkspaceId !== assigneeWorkspaceId) deps.broadcast({ type: "actionInbox.updated", workspaceId: creatorWorkspaceId, itemId: result.item?.id || "", action: "todo-assigned" });
    }
  }

  async function handleTodoTick(req, res, context = {}) {
    if (!deps.requireOwner || !deps.requireOwner(req, res)) return;
    if (!deps.actionInboxTodoService || typeof deps.actionInboxTodoService.activateDueReminders !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "action_inbox_todo_service_unavailable" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const result = await deps.actionInboxTodoService.activateDueReminders({
      now: body.now || "",
      limit: body.limit || 100,
      actorWorkspaceId: context.auth?.workspaceId || context.auth?.principalId || "owner",
      actorPrincipalId: context.auth?.principalId || "owner",
    });
    if (responseFromResult(deps, res, result) && typeof deps.broadcast === "function") {
      for (const item of result.items || []) {
        deps.broadcast({ type: "actionInbox.updated", workspaceId: item.workspaceId || item.assigneeWorkspaceId || "owner", itemId: item.id, action: "todo-reminder-due" });
      }
    }
  }

  async function handleDetail(req, res, url) {
    const parsed = itemIdFromPath(url.pathname);
    if (!parsed?.itemId) return false;
    const result = deps.actionInboxService.getItem({ itemId: parsed.itemId });
    if (!result?.ok) {
      responseFromResult(deps, res, result);
      return true;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, result.item.workspaceId || "owner");
    if (!workspaceId) return true;
    deps.sendJson(res, 200, result);
    return true;
  }

  async function handleAction(req, res, url, context = {}) {
    const parsed = itemIdFromPath(url.pathname);
    if (!parsed?.itemId || !parsed.action) return false;
    const body = await deps.readBody(req).catch(() => ({}));
    const current = deps.actionInboxService.getItem({ itemId: parsed.itemId });
    if (!current?.ok) {
      responseFromResult(deps, res, current);
      return true;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, current.item.workspaceId || "owner");
    if (!workspaceId) return true;
    const input = Object.assign({}, body, {
      itemId: parsed.itemId,
      workspaceId,
      auth: context.auth,
    });
    let result = null;
    if (parsed.action === "complete" && current.item.itemType === "todo" && deps.actionInboxTodoService?.completeTodoItem) {
      result = await deps.actionInboxTodoService.completeTodoItem(input);
    } else if (parsed.action === "complete") result = deps.actionInboxService.completeItem(input);
    else if (parsed.action === "dismiss") result = deps.actionInboxService.dismissItem(input);
    else if (parsed.action === "snooze") result = deps.actionInboxService.snoozeItem(input);
    else return false;
    if (responseFromResult(deps, res, result) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: result.item?.id || "", action: parsed.action });
    }
    return true;
  }

  async function handleFinanceLedgerJoinReview(req, res, url, context = {}) {
    const parsed = financeLedgerJoinReviewFromPath(url.pathname);
    if (!parsed?.itemId || !parsed.decision) return false;
    if (!deps.financeLedgerJoinApprovalService) {
      deps.sendJson(res, 503, { ok: false, error: "finance_ledger_join_approval_unavailable" });
      return true;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const current = deps.actionInboxService.getItem({ itemId: parsed.itemId });
    if (!current?.ok) {
      responseFromResult(deps, res, current);
      return true;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, current.item.workspaceId || "owner");
    if (!workspaceId) return true;
    const result = await deps.financeLedgerJoinApprovalService.reviewRequest(Object.assign({}, body, {
      itemId: parsed.itemId,
      decision: parsed.decision,
      workspaceId,
      auth: context.auth,
    }));
    if (responseFromResult(deps, res, result) && typeof deps.broadcast === "function") {
      deps.broadcast({
        type: "actionInbox.updated",
        workspaceId,
        itemId: result.item?.id || parsed.itemId,
        action: `finance-ledger-join-${parsed.decision}`,
      });
      deps.broadcast({
        type: "embeddedPlugin.refreshRequired",
        workspaceId,
        pluginId: "finance",
        reason: "finance_ledger_join_reviewed",
      });
    }
    return true;
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "action-inbox-list") await handleList(req, res, url);
    else if (route.id === "action-inbox-create") await handleCreate(req, res, context);
    else if (route.id === "action-inbox-todo-draft-validate") await handleTodoDraftValidate(req, res, context);
    else if (route.id === "action-inbox-todo-draft-interpret") await handleTodoDraftInterpret(req, res, context);
    else if (route.id === "action-inbox-todo-create") await handleTodoCreate(req, res, context);
    else if (route.id === "action-inbox-todo-tick") await handleTodoTick(req, res, context);
    else if (route.id === "action-inbox-detail") await handleDetail(req, res, url);
    else if (route.id === "action-inbox-action") await handleAction(req, res, url, context);
    else if (route.id === "action-inbox-finance-ledger-join-review") await handleFinanceLedgerJoinReview(req, res, url, context);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
  }

  return {
    handle,
    match: registry.match,
    summary: registry.summary,
    list: registry.list,
  };
}

module.exports = {
  ACTION_INBOX_API_ROUTE_SPECS,
  createActionInboxApiRoutes,
};
