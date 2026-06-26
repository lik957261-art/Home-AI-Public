"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const PLUGIN_CONVERSATION_ACTION_API_ROUTE_SPECS = Object.freeze([
  {
    id: "plugin-conversation-action-create",
    method: "POST",
    path: "/api/plugin-conversation/actions",
    group: "plugin-conversation-actions",
    moduleKey: "plugin-conversation-actions",
    handlerKey: "createRequest",
    summary: "Create an Owner-gated repair request from a Home AI plugin conversation window.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin", "action-inbox", "codex-task-card"],
    tags: ["plugin-conversation", "action-inbox", "owner-approval"],
  },
  {
    id: "plugin-conversation-action-task-card",
    method: "POST",
    pathRegex: /^\/api\/plugin-conversation\/actions\/[^/]+\/task-card$/,
    group: "plugin-conversation-actions",
    moduleKey: "plugin-conversation-actions",
    handlerKey: "sendTaskCard",
    summary: "Owner-triggered task-card dispatch for a plugin conversation repair request.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["action-inbox", "codex-task-card"],
    tags: ["plugin-conversation", "task-card", "owner"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`plugin conversation action api routes require ${name}`);
  }
}

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function safeErrorPayload(err) {
  return {
    ok: false,
    error: clean(err?.error || err?.code || err?.message || "plugin_conversation_action_error", 160),
  };
}

function workspaceFromRequest(url, body, auth) {
  return clean(body?.workspaceId || body?.workspace_id || url.searchParams.get("workspaceId") || auth?.workspaceId || "owner", 120) || "owner";
}

function itemIdFromTaskCardPath(pathname) {
  const prefix = "/api/plugin-conversation/actions/";
  const suffix = "/task-card";
  const value = String(pathname || "");
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) return "";
  const raw = value.slice(prefix.length, -suffix.length);
  if (!raw || raw.includes("/")) return "";
  return decodeURIComponent(raw);
}

function responseFromResult(deps, res, result, successStatus = 200) {
  if (!result?.ok) {
    deps.sendJson(res, Number(result?.status || 400), {
      ok: false,
      error: result?.error || "plugin_conversation_action_failed",
    });
    return false;
  }
  deps.sendJson(res, successStatus, result);
  return true;
}

function createPluginConversationActionApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.pluginConversationActionBridgeService || typeof deps.pluginConversationActionBridgeService.createRequest !== "function") {
    throw new Error("plugin conversation action api routes require pluginConversationActionBridgeService.createRequest");
  }
  if (typeof deps.pluginConversationActionBridgeService.dispatchTaskCard !== "function") {
    throw new Error("plugin conversation action api routes require pluginConversationActionBridgeService.dispatchTaskCard");
  }
  const registry = createApiRouteRegistry(PLUGIN_CONVERSATION_ACTION_API_ROUTE_SPECS);

  async function handleCreateRequest(req, res, url, context = {}) {
    const body = await deps.readBody(req, 64 * 1024).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, safeErrorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    const result = await deps.pluginConversationActionBridgeService.createRequest(Object.assign({}, body, {
      workspaceId,
      auth: context.auth,
    }));
    if (responseFromResult(deps, res, result, 202) && typeof deps.broadcast === "function") {
      deps.broadcast({
        type: "actionInbox.updated",
        workspaceId: "owner",
        itemId: result.inboxItem?.id || "",
      });
    }
    return { handled: true, status: res.statusCode || 202 };
  }

  async function handleSendTaskCard(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, 16 * 1024).catch(() => ({}));
    const result = await deps.pluginConversationActionBridgeService.dispatchTaskCard({
      itemId: itemIdFromTaskCardPath(url.pathname),
      ownerPrompt: body.ownerPrompt || body.owner_prompt || "",
      actor: context.auth?.principalId || "owner",
    });
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({
        type: "actionInbox.updated",
        workspaceId: "owner",
        itemId: result.inboxItem?.id || itemIdFromTaskCardPath(url.pathname),
      });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handle(req, res, url, context = {}) {
    const match = registry.match({ method: req.method, path: url.pathname });
    if (!match) return { handled: false };
    if (match.id === "plugin-conversation-action-create") {
      return handleCreateRequest(req, res, url, context);
    }
    if (match.id === "plugin-conversation-action-task-card") {
      return handleSendTaskCard(req, res, url, context);
    }
    return { handled: false };
  }

  return {
    handle,
    list: registry.list,
    match: registry.match,
    summary: registry.summary,
    routeSpecs: PLUGIN_CONVERSATION_ACTION_API_ROUTE_SPECS,
  };
}

module.exports = {
  PLUGIN_CONVERSATION_ACTION_API_ROUTE_SPECS,
  createPluginConversationActionApiRoutes,
};
