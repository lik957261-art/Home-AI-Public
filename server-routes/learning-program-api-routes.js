"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const LEARNING_PROGRAM_API_ROUTE_SPECS = Object.freeze([
  {
    id: "learning-programs-list",
    method: "GET",
    path: "/api/learning/programs",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listPrograms",
    summary: "Read sanitized learning program configs stored in SQLite.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-program"],
    tags: ["learning", "program", "sqlite"],
  },
  {
    id: "learning-programs-create",
    method: "POST",
    path: "/api/learning/programs",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "createProgram",
    summary: "Owner creates a learning program configuration in SQLite.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-program"],
    tags: ["learning", "program", "owner", "sqlite"],
  },
  {
    id: "learning-program-read",
    method: "GET",
    pathRegex: /^\/api\/learning\/programs\/[^/]+$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "getProgram",
    summary: "Read one sanitized learning program.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-program"],
    tags: ["learning", "program"],
  },
  {
    id: "learning-program-update",
    method: "PATCH",
    pathRegex: /^\/api\/learning\/programs\/[^/]+$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "updateProgram",
    summary: "Owner updates one learning program.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-program"],
    tags: ["learning", "program", "owner"],
  },
  {
    id: "learning-program-draft-plan",
    method: "POST",
    pathRegex: /^\/api\/learning\/programs\/[^/]+\/draft-plan$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "draftPlan",
    summary: "Owner generates a deterministic learning plan draft from a program.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-program", "learning-plan-draft"],
    tags: ["learning", "program", "draft", "owner"],
  },
  {
    id: "learning-program-publish",
    method: "POST",
    pathRegex: /^\/api\/learning\/programs\/[^/]+\/publish$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "publishProgram",
    summary: "Owner publishes an approved learning draft into Hermes Mobile Kanban.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-program", "kanban"],
    tags: ["learning", "program", "publish", "owner"],
  },
  {
    id: "learning-review-queue-list",
    method: "GET",
    path: "/api/learning/review-queue",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "reviewQueue",
    summary: "Read parent review queue metadata for learning drafts.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-review"],
    tags: ["learning", "review", "owner"],
  },
  {
    id: "learning-review-queue-decision",
    method: "POST",
    pathRegex: /^\/api\/learning\/review-queue\/[^/]+\/decision$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "decideReview",
    summary: "Owner records a parent review decision.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-review"],
    tags: ["learning", "review", "owner"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`learning program api routes require ${name}`);
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function pathId(pathname, pattern) {
  const match = String(pathname || "").match(pattern);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { ok: false, error: err.message || String(err) });
}

function requestedWorkspaceId(url, fallback = "weixin_stephen") {
  return cleanString(url?.searchParams?.get("workspaceId")) || fallback;
}

function requestedLearnerId(url, workspaceId) {
  return cleanString(url?.searchParams?.get("learnerId") || url?.searchParams?.get("studentId")) || workspaceId;
}

function createLearningProgramApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "isOwnerAuth",
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  const service = deps.learningProgramService;
  if (!service || typeof service.createProgram !== "function") {
    throw new Error("learning program api routes require learningProgramService");
  }
  const registry = createApiRouteRegistry(LEARNING_PROGRAM_API_ROUTE_SPECS);

  function authorizeQuery(req, res, url, auth) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url, deps.isOwnerAuth(auth) ? "weixin_stephen" : auth?.workspaceId));
    if (!workspaceId) return null;
    const learnerId = requestedLearnerId(url, workspaceId);
    if (!deps.isOwnerAuth(auth) && learnerId !== auth?.workspaceId) {
      const err = new Error("Learner access is not allowed");
      err.status = 403;
      throw err;
    }
    return {
      workspaceId,
      learnerId,
      limit: url.searchParams.get("limit"),
    };
  }

  async function handleList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, programs: service.listPrograms(query) });
  }

  async function handleCreate(req, res, auth) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 240000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const program = service.createProgram(Object.assign({}, body, {
        createdByPrincipalId: auth?.principalId || owner.principalId || "owner",
      }));
      deps.sendJson(res, 201, { ok: true, program });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRead(req, res, url, auth) {
    const programId = pathId(url.pathname, /^\/api\/learning\/programs\/([^/]+)$/);
    const program = service.getProgram(programId);
    if (!program) {
      deps.sendJson(res, 404, { ok: false, error: "Learning program not found" });
      return;
    }
    const allowed = deps.requireWorkspaceAccess(req, res, program.workspaceId);
    if (!allowed) return;
    if (!deps.isOwnerAuth(auth) && program.learnerId !== auth?.workspaceId) {
      deps.sendJson(res, 403, { ok: false, error: "Learner access is not allowed" });
      return;
    }
    deps.sendJson(res, 200, { ok: true, program });
  }

  async function handleUpdate(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 240000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const programId = pathId(url.pathname, /^\/api\/learning\/programs\/([^/]+)$/);
      deps.sendJson(res, 200, { ok: true, program: service.updateProgram(programId, body) });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleDraft(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    try {
      const programId = pathId(url.pathname, /^\/api\/learning\/programs\/([^/]+)\/draft-plan$/);
      deps.sendJson(res, 201, service.draftPlan(programId));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handlePublish(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch(() => ({}));
    try {
      const programId = pathId(url.pathname, /^\/api\/learning\/programs\/([^/]+)\/publish$/);
      const result = await service.publishProgram(programId, body || {});
      deps.sendJson(res, result.ok ? 201 : 502, result);
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleReviewList(req, res, url, auth) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const learnerId = requestedLearnerId(url, requestedWorkspaceId(url, "weixin_stephen"));
    deps.sendJson(res, 200, {
      ok: true,
      reviewItems: service.reviewQueue({ learnerId, status: url.searchParams.get("status") || "pending", limit: url.searchParams.get("limit") || 50 }),
      auth: auth ? { owner: deps.isOwnerAuth(auth) } : undefined,
    });
  }

  async function handleReviewDecision(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const reviewId = pathId(url.pathname, /^\/api\/learning\/review-queue\/([^/]+)\/decision$/);
      deps.sendJson(res, 200, {
        ok: true,
        reviewItem: service.decideReview(reviewId, Object.assign({}, body, { principalId: owner.principalId || "owner" })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    const auth = context.auth || null;
    if (route.id === "learning-programs-list") await handleList(req, res, url, auth);
    else if (route.id === "learning-programs-create") await handleCreate(req, res, auth);
    else if (route.id === "learning-program-read") await handleRead(req, res, url, auth);
    else if (route.id === "learning-program-update") await handleUpdate(req, res, url);
    else if (route.id === "learning-program-draft-plan") await handleDraft(req, res, url);
    else if (route.id === "learning-program-publish") await handlePublish(req, res, url);
    else if (route.id === "learning-review-queue-list") await handleReviewList(req, res, url, auth);
    else if (route.id === "learning-review-queue-decision") await handleReviewDecision(req, res, url);
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
  LEARNING_PROGRAM_API_ROUTE_SPECS,
  createLearningProgramApiRoutes,
};
