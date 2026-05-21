"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");
const { createLearningGrowthBoardProjectionService } = require("../adapters/learning-growth-board-projection-service");
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
    id: "learning-growth-board",
    method: "GET",
    path: "/api/learning-growth/board",
    group: "learning-growth",
    moduleKey: "learning-growth",
    handlerKey: "board",
    summary: "Read the native Fanfan Growth board projection without calling official Kanban.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-program", "learning-coin"],
    tags: ["learning-growth", "board", "native"],
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
  {
    id: "learning-status",
    method: "GET",
    path: "/api/learning/status",
    group: "learning",
    moduleKey: "learning",
    handlerKey: "status",
    summary: "Owner reads non-secret Fanfan learning V1 operational readiness.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth", "learning-program", "learning-readiness"],
    tags: ["learning", "growth", "status", "readiness", "owner"],
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
  const targetLearnerId = learnerId || workspaceId || ownWorkspace || "owner";
  const canAccess = typeof deps.authCanAccessWorkspace === "function"
    ? deps.authCanAccessWorkspace(auth, targetLearnerId)
    : targetLearnerId === ownWorkspace;
  if (targetLearnerId && !canAccess) {
    const err = new Error("Learner access is not allowed");
    err.status = 403;
    throw err;
  }
  return targetLearnerId;
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
}

function wantsKanbanCompatibility(url) {
  const value = String(url?.searchParams?.get("includeKanbanProjection") || url?.searchParams?.get("includeKanban") || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function createLearningApiRoutes(deps = {}) {
  requireFunctions(deps, ["isOwnerAuth", "requireWorkspaceAccess", "sendJson"]);
  const learningGrowthService = deps.learningGrowthService || createLearningGrowthService({
    learningCoinService: deps.learningCoinService,
  });
  const learningGrowthTaskService = deps.learningGrowthTaskService || null;
  if (!learningGrowthService || typeof learningGrowthService.overview !== "function") {
    throw new Error("learning api routes require learningGrowthService.overview");
  }
  const learningGrowthBoardService = deps.learningGrowthBoardService || createLearningGrowthBoardProjectionService({
    learningGrowthService,
  });
  const registry = createApiRouteRegistry(LEARNING_API_ROUTE_SPECS);

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
    const owner = deps.isOwnerAuth(auth);
    let executableTasks = [];
    if (wantsKanbanCompatibility(url) && learningGrowthTaskService && typeof learningGrowthTaskService.listExecutableTasks === "function") {
      const listed = await learningGrowthTaskService.listExecutableTasks(input).catch((err) => ({
        ok: false,
        error: err?.message || String(err),
        tasks: [],
      }));
      executableTasks = Array.isArray(listed?.tasks) ? listed.tasks : [];
    }
    const overviewInput = Object.assign({}, input, {
      owner,
      viewerRole: owner ? "owner" : "executor",
    });
    if (executableTasks.length) overviewInput.executableTasks = executableTasks;
    deps.sendJson(res, 200, Object.assign({ ok: true }, learningGrowthService.overview(overviewInput)));
  }

  async function handleBoard(req, res, url, auth) {
    let input;
    try {
      input = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!input) return;
    const owner = deps.isOwnerAuth(auth);
    const boardInput = Object.assign({}, input, {
      owner,
      viewerRole: owner ? "owner" : "executor",
    });
    deps.sendJson(res, 200, Object.assign({ ok: true }, learningGrowthBoardService.board(boardInput)));
  }

  async function handleStatus(req, res, url, auth) {
    if (!deps.isOwnerAuth(auth)) {
      deps.sendJson(res, 403, { error: "Owner access is required" });
      return;
    }
    let input;
    try {
      input = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!input) return;
    const overview = learningGrowthService.overview(Object.assign({}, input, {
      owner: true,
      viewerRole: "owner",
    }));
    deps.sendJson(res, 200, {
      ok: true,
      learning: {
        moduleId: overview.module?.id || "fanfan-growth",
        learnerId: overview.learner?.id || input.learnerId,
        workspaceId: overview.learner?.workspaceId || input.workspaceId,
        readiness: overview.operationalReadiness || null,
        launchOperations: overview.launchOperations || null,
      },
    });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const auth = context.auth || null;
    if (route.id === "learning-growth-overview" || route.id === "learning-overview") await handleOverview(req, res, url, auth);
    else if (route.id === "learning-growth-board") await handleBoard(req, res, url, auth);
    else if (route.id === "learning-status") await handleStatus(req, res, url, auth);
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
