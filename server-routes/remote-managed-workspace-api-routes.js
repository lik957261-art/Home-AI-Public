"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const WORKSPACE_ROUTE_PART = "([^/]+)";
const TASK_CARD_ROUTE_PART = "([^/]+)";
const WORKSPACE_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/status$`);
const TASK_CARD_DISPATCH_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards$`);
const NODE_HEARTBEAT_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/node-heartbeat$`);
const TASK_CARD_POLL_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards/poll$`);
const TASK_CARD_ACTION_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards/${TASK_CARD_ROUTE_PART}/(ack|heartbeat|return)$`);
const DAILY_SUMMARY_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/daily-summary$`);
const ESCALATIONS_PATH_REGEX = new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/escalations$`);

const ROUTE_SPECS = Object.freeze([
  {
    id: "remote-managed-workspace-register",
    method: "POST",
    path: "/api/remote-managed-workspaces/register",
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "register",
    summary: "Register an outbound remote managed workspace node with Home AI.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "node"],
    tags: ["remote-managed-workspace", "register"],
  },
  {
    id: "remote-managed-workspace-node-heartbeat",
    method: "POST",
    pathRegex: NODE_HEARTBEAT_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "node-heartbeat",
    summary: "Receive a bounded heartbeat from a remote managed workspace node.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "heartbeat"],
    tags: ["remote-managed-workspace", "heartbeat"],
  },
  {
    id: "remote-managed-workspace-task-card-poll",
    method: "GET",
    pathRegex: TASK_CARD_POLL_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "task-card-poll",
    summary: "Poll or bounded-long-poll queued Home AI task cards for a remote managed workspace.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "task-card"],
    tags: ["remote-managed-workspace", "task-card", "poll"],
  },
  {
    id: "remote-managed-workspace-task-card-ack",
    method: "POST",
    pathRegex: new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards/${TASK_CARD_ROUTE_PART}/ack$`),
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "task-card-ack",
    summary: "Acknowledge a remote managed workspace task card execution lease.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "task-card"],
    tags: ["remote-managed-workspace", "task-card", "ack"],
  },
  {
    id: "remote-managed-workspace-task-card-heartbeat",
    method: "POST",
    pathRegex: new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards/${TASK_CARD_ROUTE_PART}/heartbeat$`),
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "task-card-heartbeat",
    summary: "Receive per-task-card heartbeat from a remote managed workspace node.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "task-card", "heartbeat"],
    tags: ["remote-managed-workspace", "task-card", "heartbeat"],
  },
  {
    id: "remote-managed-workspace-task-card-return",
    method: "POST",
    pathRegex: new RegExp(`^/api/remote-managed-workspaces/${WORKSPACE_ROUTE_PART}/task-cards/${TASK_CARD_ROUTE_PART}/return$`),
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "task-card-return",
    summary: "Receive terminal task-card return metadata from a remote managed workspace node.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "task-card", "return"],
    tags: ["remote-managed-workspace", "task-card", "return"],
  },
  {
    id: "remote-managed-workspace-daily-summary",
    method: "POST",
    pathRegex: DAILY_SUMMARY_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "daily-summary",
    summary: "Receive a bounded daily summary from a remote managed workspace node.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "summary"],
    tags: ["remote-managed-workspace", "daily-summary"],
  },
  {
    id: "remote-managed-workspace-escalation-create",
    method: "POST",
    pathRegex: ESCALATIONS_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "escalation",
    summary: "Receive a bounded escalation from a remote managed workspace node.",
    riskLevel: "high",
    authMode: "internal",
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "escalation"],
    tags: ["remote-managed-workspace", "escalation"],
  },
  {
    id: "remote-managed-workspace-status-list",
    method: "GET",
    path: "/api/remote-managed-workspaces/status",
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "status-list",
    summary: "List Owner-visible bounded status for remote managed workspaces.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["remote-managed-workspace", "status"],
    tags: ["remote-managed-workspace", "status"],
  },
  {
    id: "remote-managed-workspace-status-read",
    method: "GET",
    pathRegex: WORKSPACE_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "status-read",
    summary: "Read Owner-visible bounded status for one remote managed workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "status"],
    tags: ["remote-managed-workspace", "status"],
  },
  {
    id: "remote-managed-workspace-task-card-dispatch",
    method: "POST",
    pathRegex: TASK_CARD_DISPATCH_PATH_REGEX,
    group: "remote-managed-workspace",
    moduleKey: "remote-managed-workspace",
    handlerKey: "task-card-dispatch",
    summary: "Dispatch a Home AI task card to a remote managed workspace queue.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["remote-managed-workspace", "task-card"],
    tags: ["remote-managed-workspace", "task-card", "dispatch"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`remote managed workspace api routes require ${name}`);
  }
}

function compactError(err) {
  return String(err?.message || err || "Remote managed workspace request failed")
    .replace(/\s+/g, " ")
    .slice(0, 600);
}

function publicError(err) {
  return {
    ok: false,
    code: err?.code || "remote_managed_workspace_request_failed",
    error: compactError(err),
  };
}

function pathParts(pathname) {
  const taskCardMatch = TASK_CARD_ACTION_PATH_REGEX.exec(pathname);
  if (taskCardMatch) {
    return {
      workspaceId: decodeURIComponent(taskCardMatch[1]),
      taskCardId: decodeURIComponent(taskCardMatch[2]),
      action: taskCardMatch[3],
    };
  }
  for (const regex of [WORKSPACE_PATH_REGEX, TASK_CARD_DISPATCH_PATH_REGEX, NODE_HEARTBEAT_PATH_REGEX, TASK_CARD_POLL_PATH_REGEX, DAILY_SUMMARY_PATH_REGEX, ESCALATIONS_PATH_REGEX]) {
    const match = regex.exec(pathname);
    if (match) return { workspaceId: decodeURIComponent(match[1]) };
  }
  return {};
}

function headerValue(headers = {}, name) {
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function enrollmentCredential(req, body = {}) {
  const headers = req.headers || {};
  const authorization = String(headerValue(headers, "authorization") || "");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  return {
    token: String(
      headerValue(headers, "x-homeai-remote-workspace-token")
      || headerValue(headers, "x-remote-managed-workspace-token")
      || (bearerMatch ? bearerMatch[1] : "")
      || body.enrollmentToken
      || body.token
      || "",
    ).trim(),
  };
}

function readJsonBody(deps, req) {
  return deps.readBody(req).catch((err) => ({ __error: err }));
}

function queryObject(url) {
  const out = {};
  for (const [key, value] of (url?.searchParams || new URLSearchParams()).entries()) out[key] = value;
  return out;
}

function createRemoteManagedWorkspaceApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "sendJson"]);
  if (!deps.remoteManagedWorkspaceService) {
    throw new Error("remote managed workspace api routes require remoteManagedWorkspaceService");
  }

  const service = deps.remoteManagedWorkspaceService;
  const registry = createApiRouteRegistry(ROUTE_SPECS);

  async function handleNode(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route || route.authMode !== "internal") return { handled: false };

    const pathname = url?.pathname || req.url || "/";
    const parts = pathParts(pathname);
    const needsBody = String(req.method || "GET").toUpperCase() !== "GET";
    const body = needsBody ? await readJsonBody(deps, req) : {};
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, code: "remote_managed_workspace_invalid_json", error: "Invalid request body" });
      return { handled: true, route };
    }

    try {
      const credential = enrollmentCredential(req, body);
      if (route.id === "remote-managed-workspace-register") {
        deps.sendJson(res, 201, service.registerNode(body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-node-heartbeat") {
        deps.sendJson(res, 200, service.nodeHeartbeat(parts.workspaceId, body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-task-card-poll") {
        deps.sendJson(res, 200, await service.pollTaskCards(parts.workspaceId, queryObject(url), credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-task-card-ack") {
        deps.sendJson(res, 200, service.ackTaskCard(parts.workspaceId, parts.taskCardId, body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-task-card-heartbeat") {
        deps.sendJson(res, 200, service.heartbeatTaskCard(parts.workspaceId, parts.taskCardId, body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-task-card-return") {
        deps.sendJson(res, 200, service.returnTaskCard(parts.workspaceId, parts.taskCardId, body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-daily-summary") {
        deps.sendJson(res, 200, service.recordDailySummary(parts.workspaceId, body, credential));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-escalation-create") {
        deps.sendJson(res, 202, service.recordEscalation(parts.workspaceId, body, credential));
        return { handled: true, route };
      }
    } catch (err) {
      deps.sendJson(res, err.status || 500, publicError(err));
      return { handled: true, route };
    }

    return { handled: false };
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.authMode === "internal") return handleNode(req, res, url);

    const ownerAuth = deps.requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    try {
      const pathname = url?.pathname || req.url || "/";
      const parts = pathParts(pathname);
      if (route.id === "remote-managed-workspace-status-list") {
        deps.sendJson(res, 200, service.status());
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-status-read") {
        deps.sendJson(res, 200, service.status(parts.workspaceId));
        return { handled: true, route };
      }
      if (route.id === "remote-managed-workspace-task-card-dispatch") {
        const body = await readJsonBody(deps, req);
        if (body.__error) {
          deps.sendJson(res, 400, { ok: false, code: "remote_managed_workspace_invalid_json", error: "Invalid request body" });
          return { handled: true, route };
        }
        deps.sendJson(res, 202, service.dispatchTaskCard(parts.workspaceId, body, {
          ownerWorkspaceId: context?.auth?.workspaceId || "",
          createdBy: context?.auth?.userId || context?.auth?.workspaceId || "",
        }));
        return { handled: true, route };
      }
    } catch (err) {
      deps.sendJson(res, err.status || 500, publicError(err));
      return { handled: true, route };
    }

    return { handled: false };
  }

  return {
    handle,
    handleNode,
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
  ROUTE_SPECS,
  createRemoteManagedWorkspaceApiRoutes,
};
