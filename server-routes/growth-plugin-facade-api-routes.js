"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const GROWTH_PLUGIN_FACADE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "growth-plugin-facade-status",
    method: "GET",
    path: "/api/growth/v1/status",
    group: "growth-plugin-facade",
    moduleKey: "growth-plugin-facade",
    handlerKey: "status",
    summary: "Read bounded Growth plugin migration status from the Home AI host facade.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["growth-plugin", "learning-growth"],
    tags: ["growth", "pluginization", "facade"],
  },
  {
    id: "growth-plugin-facade-board",
    method: "GET",
    path: "/api/growth/v1/board",
    group: "growth-plugin-facade",
    moduleKey: "growth-plugin-facade",
    handlerKey: "board",
    summary: "Read the bounded Growth board projection for plugin migration.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["growth-plugin", "learning-growth"],
    tags: ["growth", "board", "pluginization"],
  },
  {
    id: "growth-plugin-facade-card",
    method: "GET",
    pathRegex: /^\/api\/growth\/v1\/cards\/[^/]+$/,
    group: "growth-plugin-facade",
    moduleKey: "growth-plugin-facade",
    handlerKey: "card",
    summary: "Read one bounded Growth card projection for plugin migration.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["growth-plugin", "learning-growth-card"],
    tags: ["growth", "card", "pluginization"],
  },
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`growth plugin facade api routes require ${name}`);
  }
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { ok: false, error: err.message || String(err) });
}

function requestedWorkspaceId(deps, auth, url) {
  const requested = cleanString(url?.searchParams?.get("workspaceId"));
  if (requested) return requested;
  if (deps.isOwnerAuth(auth)) return cleanString(deps.defaultLearnerWorkspaceId) || "weixin_stephen";
  return cleanString(auth?.workspaceId) || "owner";
}

function requestedLearnerId(deps, auth, requested, workspaceId) {
  const learnerId = cleanString(requested);
  if (deps.isOwnerAuth(auth)) return learnerId || workspaceId || "owner";
  const ownWorkspace = cleanString(auth?.workspaceId || workspaceId);
  const targetLearnerId = learnerId || workspaceId || ownWorkspace || "owner";
  const authorizedWorkspaceId = cleanString(workspaceId);
  const canAccess = (authorizedWorkspaceId && authorizedWorkspaceId !== "owner" && targetLearnerId === authorizedWorkspaceId)
    || (typeof deps.authCanAccessWorkspace === "function"
      ? deps.authCanAccessWorkspace(auth, targetLearnerId)
      : targetLearnerId === ownWorkspace);
  if (targetLearnerId && !canAccess) {
    const err = new Error("Learner access is not allowed");
    err.status = 403;
    throw err;
  }
  return targetLearnerId;
}

function pathId(pathname, regex) {
  const match = String(pathname || "").match(regex);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function createGrowthPluginFacadeApiRoutes(deps = {}) {
  requireFunctions(deps, ["isOwnerAuth", "requireWorkspaceAccess", "sendJson"]);
  const facadeService = deps.growthPluginFacadeService;
  if (!facadeService || typeof facadeService.status !== "function" || typeof facadeService.board !== "function" || typeof facadeService.card !== "function") {
    throw new Error("growth plugin facade api routes require growthPluginFacadeService");
  }
  const registry = createApiRouteRegistry(GROWTH_PLUGIN_FACADE_API_ROUTE_SPECS);

  function authorizeQuery(req, res, url, auth) {
    let workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(deps, auth, url));
    if (!workspaceId) return null;
    const learnerId = requestedLearnerId(
      deps,
      auth,
      url.searchParams.get("learnerId") || url.searchParams.get("studentId"),
      workspaceId,
    );
    if (deps.isOwnerAuth(auth) && workspaceId === "owner" && learnerId && learnerId !== "owner") {
      workspaceId = deps.requireWorkspaceAccess(req, res, learnerId);
      if (!workspaceId) return null;
    }
    return {
      workspaceId,
      learnerId,
      studentId: learnerId,
      limit: url.searchParams.get("limit"),
      owner: deps.isOwnerAuth(auth),
      viewerRole: deps.isOwnerAuth(auth) ? "owner" : "executor",
    };
  }

  function handleStatus(req, res, url, auth) {
    const input = authorizeQuery(req, res, url, auth);
    if (!input) return;
    deps.sendJson(res, 200, Object.assign({ ok: true }, facadeService.status(input)));
  }

  function handleBoard(req, res, url, auth) {
    const input = authorizeQuery(req, res, url, auth);
    if (!input) return;
    deps.sendJson(res, 200, Object.assign({ ok: true }, facadeService.board(input)));
  }

  function handleCard(req, res, url, auth) {
    const input = authorizeQuery(req, res, url, auth);
    if (!input) return;
    const taskCardId = pathId(url.pathname, /^\/api\/growth\/v1\/cards\/([^/]+)$/);
    const result = facadeService.card(Object.assign({}, input, { taskCardId }));
    if (!result.card) {
      deps.sendJson(res, 404, { ok: false, error: "Growth card not found" });
      return;
    }
    deps.sendJson(res, 200, Object.assign({ ok: true }, result));
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    const auth = context.auth || null;
    try {
      if (route.id === "growth-plugin-facade-status") handleStatus(req, res, url, auth);
      else if (route.id === "growth-plugin-facade-board") handleBoard(req, res, url, auth);
      else if (route.id === "growth-plugin-facade-card") handleCard(req, res, url, auth);
      else return { handled: false };
    } catch (err) {
      sendRouteError(deps, res, err);
    }
    return { handled: true, route, auth };
  }

  return {
    handle,
    list: registry.list,
    match: registry.match,
    summary: registry.summary,
  };
}

module.exports = {
  GROWTH_PLUGIN_FACADE_API_ROUTE_SPECS,
  createGrowthPluginFacadeApiRoutes,
};
