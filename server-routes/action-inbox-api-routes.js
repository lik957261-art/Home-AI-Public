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
      search: url.searchParams.get("search") || "",
      includeDone: /^(1|true|yes|on)$/i.test(String(url.searchParams.get("includeDone") || "")),
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
    if (parsed.action === "complete") result = deps.actionInboxService.completeItem(input);
    else if (parsed.action === "dismiss") result = deps.actionInboxService.dismissItem(input);
    else if (parsed.action === "snooze") result = deps.actionInboxService.snoozeItem(input);
    else return false;
    if (responseFromResult(deps, res, result) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId, itemId: result.item?.id || "", action: parsed.action });
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
    else if (route.id === "action-inbox-detail") await handleDetail(req, res, url);
    else if (route.id === "action-inbox-action") await handleAction(req, res, url, context);
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
