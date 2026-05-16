"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");
const { createLearningGrowthService } = require("../adapters/learning-growth-service");

const LEARNING_API_ROUTE_SPECS = Object.freeze([
  {
    id: "learning-growth-overview",
    method: "GET",
    path: "/api/learning-growth/overview",
    group: "learning-growth",
    moduleKey: "learning-growth",
    handlerKey: "overview",
    summary: "Read the Fanfan learning growth overview with coins as a contained subsystem.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-coin"],
    tags: ["learning-growth", "overview", "coins"],
  },
  {
    id: "learning-overview",
    method: "GET",
    path: "/api/learning/overview",
    group: "learning",
    moduleKey: "learning",
    handlerKey: "overview",
    summary: "Read the Fanfan learning growth overview with coins as a contained subsystem.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-coin"],
    tags: ["learning", "growth", "coins"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`learning api routes require ${name}`);
  }
}

function requestedWorkspaceId(deps, auth, url) {
  const requested = String(url?.searchParams?.get("workspaceId") || "").trim();
  if (requested) return requested;
  if (deps.isOwnerAuth(auth)) return String(deps.defaultLearnerWorkspaceId || "weixin_stephen").trim() || "weixin_stephen";
  return String(auth?.workspaceId || "owner").trim() || "owner";
}

function requestedLearnerId(deps, auth, requested, workspaceId) {
  const learnerId = String(requested || "").trim();
  if (deps.isOwnerAuth(auth)) return learnerId || workspaceId || "owner";
  const ownWorkspace = String(auth?.workspaceId || workspaceId || "").trim();
  if (learnerId && learnerId !== ownWorkspace) {
    const err = new Error("Learner access is not allowed");
    err.status = 403;
    throw err;
  }
  return ownWorkspace || workspaceId || "owner";
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
}

function createLearningApiRoutes(deps = {}) {
  requireFunctions(deps, ["isOwnerAuth", "requireWorkspaceAccess", "sendJson"]);
  const learningGrowthService = deps.learningGrowthService || createLearningGrowthService({
    learningCoinService: deps.learningCoinService,
  });
  if (!learningGrowthService || typeof learningGrowthService.overview !== "function") {
    throw new Error("learning api routes require learningGrowthService.overview");
  }
  const registry = createApiRouteRegistry(LEARNING_API_ROUTE_SPECS);

  function authorizeQuery(req, res, url, auth) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(deps, auth, url));
    if (!workspaceId) return null;
    const learnerId = requestedLearnerId(
      deps,
      auth,
      url.searchParams.get("learnerId") || url.searchParams.get("studentId"),
      workspaceId,
    );
    return {
      workspaceId,
      learnerId,
      studentId: learnerId,
      limit: url.searchParams.get("limit"),
    };
  }

  async function handleOverview(req, res, url, auth) {
    let input;
    try {
      input = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!input) return;
    deps.sendJson(res, 200, Object.assign({ ok: true }, learningGrowthService.overview(input)));
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const auth = context.auth || null;
    if (route.id === "learning-growth-overview" || route.id === "learning-overview") await handleOverview(req, res, url, auth);
    else return { handled: false };

    return { handled: true, route, auth };
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
  LEARNING_API_ROUTE_SPECS,
  createLearningApiRoutes,
};
