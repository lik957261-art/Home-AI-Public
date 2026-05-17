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
    id: "learning-sources-list",
    method: "GET",
    path: "/api/learning/sources",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listSources",
    summary: "Read sanitized learner source summaries from SQLite.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-source"],
    tags: ["learning", "source", "sqlite"],
  },
  {
    id: "learning-sources-create",
    method: "POST",
    path: "/api/learning/sources",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "saveSource",
    summary: "Owner records a summarized learning source in SQLite.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-source"],
    tags: ["learning", "source", "owner", "sqlite"],
  },
  {
    id: "learning-goals-list",
    method: "GET",
    path: "/api/learning/goals",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listGoals",
    summary: "Read learner goals from SQLite.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-goal"],
    tags: ["learning", "goal", "sqlite"],
  },
  {
    id: "learning-goals-create",
    method: "POST",
    path: "/api/learning/goals",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "saveGoal",
    summary: "Owner records a learner goal in SQLite.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-goal"],
    tags: ["learning", "goal", "owner", "sqlite"],
  },
  {
    id: "learning-goal-update",
    method: "PATCH",
    pathRegex: /^\/api\/learning\/goals\/[^/]+$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "updateGoal",
    summary: "Owner updates one learner goal.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-goal"],
    tags: ["learning", "goal", "owner"],
  },
  {
    id: "learning-profile-read",
    method: "GET",
    path: "/api/learning/profile",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "getLearnerProfile",
    summary: "Read the sanitized learner profile and skill states.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learner-profile", "skill-state"],
    tags: ["learning", "profile"],
  },
  {
    id: "learning-profile-rebuild",
    method: "POST",
    path: "/api/learning/profile/rebuild",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "rebuildLearnerProfile",
    summary: "Owner rebuilds learner profile summaries from SQLite source and goal records.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learner-profile", "skill-state"],
    tags: ["learning", "profile", "owner"],
  },
  {
    id: "learning-curriculum-references-list",
    method: "GET",
    path: "/api/learning/curriculum-references",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listCurriculumReferences",
    summary: "Read public curriculum reference metadata used for learning planning.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: false,
    resourceTypes: ["curriculum-reference"],
    tags: ["learning", "curriculum", "reference"],
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
    id: "learning-task-cards-list",
    method: "GET",
    path: "/api/learning/task-cards",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listTaskCards",
    summary: "Read summarized SQLite learning task cards.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card"],
    tags: ["learning", "task-card", "sqlite"],
  },
  {
    id: "learning-task-card-read",
    method: "GET",
    pathRegex: /^\/api\/learning\/task-cards\/[^/]+$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "getTaskCard",
    summary: "Read one summarized SQLite learning task card.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-task-card"],
    tags: ["learning", "task-card"],
  },
  {
    id: "learning-task-card-session-start",
    method: "POST",
    pathRegex: /^\/api\/learning\/task-cards\/[^/]+\/sessions$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "startTaskSession",
    summary: "Owner starts a summary-only learning interaction session for a task card.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-task-card", "learning-interaction-session"],
    tags: ["learning", "task-card", "session", "owner"],
  },
  {
    id: "learning-sessions-list",
    method: "GET",
    path: "/api/learning/sessions",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listInteractionSessions",
    summary: "Read summarized learning interaction sessions.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-interaction-session"],
    tags: ["learning", "session", "sqlite"],
  },
  {
    id: "learning-session-advance",
    method: "POST",
    pathRegex: /^\/api\/learning\/sessions\/[^/]+\/advance$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "advanceInteractionSession",
    summary: "Owner advances a summary-only learning interaction session state machine.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-interaction-session"],
    tags: ["learning", "session", "owner"],
  },
  {
    id: "learning-session-evaluation-create",
    method: "POST",
    pathRegex: /^\/api\/learning\/sessions\/[^/]+\/evaluations$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "recordEvaluation",
    summary: "Owner records a summary-only learning evaluation without writing coin ledger entries.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-evaluation"],
    tags: ["learning", "evaluation", "owner"],
  },
  {
    id: "learning-evaluations-list",
    method: "GET",
    path: "/api/learning/evaluations",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listEvaluations",
    summary: "Read summarized learning evaluation records.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-evaluation"],
    tags: ["learning", "evaluation", "sqlite"],
  },
  {
    id: "learning-evaluation-reward-settle",
    method: "POST",
    pathRegex: /^\/api\/learning\/evaluations\/[^/]+\/reward-settlement$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "settleEvaluationReward",
    summary: "Owner settles a verified learning evaluation reward through the reward service.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-evaluation", "learning-reward-settlement", "learning-coin"],
    tags: ["learning", "evaluation", "reward", "owner"],
  },
  {
    id: "learning-reward-settlements-list",
    method: "GET",
    path: "/api/learning/reward-settlements",
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "listRewardSettlements",
    summary: "Read summarized learning reward settlement records.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-reward-settlement"],
    tags: ["learning", "reward", "settlement"],
  },
  {
    id: "learning-reward-settlement-read",
    method: "GET",
    pathRegex: /^\/api\/learning\/reward-settlements\/[^/]+$/,
    group: "learning-program",
    moduleKey: "learning-program",
    handlerKey: "getRewardSettlement",
    summary: "Read one summarized learning reward settlement.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-reward-settlement"],
    tags: ["learning", "reward", "settlement"],
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
      status: cleanString(url.searchParams.get("status")),
      programId: cleanString(url.searchParams.get("programId")),
      draftId: cleanString(url.searchParams.get("draftId")),
      taskCardId: cleanString(url.searchParams.get("taskCardId")),
      sessionId: cleanString(url.searchParams.get("sessionId")),
      evaluationId: cleanString(url.searchParams.get("evaluationId")),
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

  async function handleSourceList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, sources: service.listSources(query) });
  }

  async function handleSourceCreate(req, res, auth) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 240000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      deps.sendJson(res, 201, {
        ok: true,
        source: service.saveSource(Object.assign({}, body, {
          createdByPrincipalId: auth?.principalId || owner.principalId || "owner",
        })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleGoalList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, goals: service.listGoals(query) });
  }

  async function handleGoalCreate(req, res, auth) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 240000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      deps.sendJson(res, 201, {
        ok: true,
        goal: service.saveGoal(Object.assign({}, body, {
          createdByPrincipalId: auth?.principalId || owner.principalId || "owner",
        })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleGoalUpdate(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 240000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const goalId = pathId(url.pathname, /^\/api\/learning\/goals\/([^/]+)$/);
      deps.sendJson(res, 200, { ok: true, goal: service.updateGoal(goalId, body) });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleProfileRead(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, Object.assign({ ok: true }, service.getLearnerProfile(query)));
  }

  async function handleProfileRebuild(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch(() => ({}));
    try {
      const workspaceId = requestedWorkspaceId(url, body.workspaceId || "weixin_stephen");
      const learnerId = cleanString(body.learnerId || body.studentId || url.searchParams.get("learnerId") || url.searchParams.get("studentId")) || workspaceId;
      deps.sendJson(res, 200, Object.assign({ ok: true }, service.rebuildLearnerProfile(Object.assign({}, body, { workspaceId, learnerId }))));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleCurriculumReferences(req, res, url) {
    deps.sendJson(res, 200, {
      ok: true,
      curriculumReferences: service.listCurriculumReferences({
        domain: cleanString(url.searchParams.get("domain")),
        limit: url.searchParams.get("limit") || 100,
      }),
    });
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

  function authorizeRecord(req, res, auth, record, missingMessage) {
    if (!record) {
      deps.sendJson(res, 404, { ok: false, error: missingMessage });
      return false;
    }
    const allowed = deps.requireWorkspaceAccess(req, res, record.workspaceId);
    if (!allowed) return false;
    if (!deps.isOwnerAuth(auth) && record.learnerId !== auth?.workspaceId) {
      deps.sendJson(res, 403, { ok: false, error: "Learner access is not allowed" });
      return false;
    }
    return true;
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

  async function handleTaskCardsList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, taskCards: service.listTaskCards(query) });
  }

  async function handleTaskCardRead(req, res, url, auth) {
    const taskCardId = pathId(url.pathname, /^\/api\/learning\/task-cards\/([^/]+)$/);
    const taskCard = service.getTaskCard(taskCardId);
    if (!authorizeRecord(req, res, auth, taskCard, "Learning task card not found")) return;
    deps.sendJson(res, 200, { ok: true, taskCard });
  }

  async function handleTaskSessionStart(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const taskCardId = pathId(url.pathname, /^\/api\/learning\/task-cards\/([^/]+)\/sessions$/);
      deps.sendJson(res, 201, {
        ok: true,
        session: service.startTaskSession(taskCardId, Object.assign({}, body, { actor: owner.principalId || "owner" })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleSessionsList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, sessions: service.listInteractionSessions(query) });
  }

  async function handleSessionAdvance(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const sessionId = pathId(url.pathname, /^\/api\/learning\/sessions\/([^/]+)\/advance$/);
      deps.sendJson(res, 200, {
        ok: true,
        session: service.advanceInteractionSession(sessionId, Object.assign({}, body, { actor: owner.principalId || "owner" })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleEvaluationCreate(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const sessionId = pathId(url.pathname, /^\/api\/learning\/sessions\/([^/]+)\/evaluations$/);
      deps.sendJson(res, 201, { ok: true, evaluation: service.recordEvaluation(sessionId, body) });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleEvaluationsList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, evaluations: service.listEvaluations(query) });
  }

  async function handleRewardSettlementCreate(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const evaluationId = pathId(url.pathname, /^\/api\/learning\/evaluations\/([^/]+)\/reward-settlement$/);
      deps.sendJson(res, 201, {
        ok: true,
        rewardSettlement: service.settleEvaluationReward(evaluationId, Object.assign({}, body, { principalId: owner.principalId || "owner" })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRewardSettlementsList(req, res, url, auth) {
    let query;
    try {
      query = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!query) return;
    deps.sendJson(res, 200, { ok: true, rewardSettlements: service.listRewardSettlements(query) });
  }

  async function handleRewardSettlementRead(req, res, url, auth) {
    const rewardSettlementId = pathId(url.pathname, /^\/api\/learning\/reward-settlements\/([^/]+)$/);
    const rewardSettlement = service.getRewardSettlement(rewardSettlementId);
    if (!authorizeRecord(req, res, auth, rewardSettlement, "Learning reward settlement not found")) return;
    deps.sendJson(res, 200, { ok: true, rewardSettlement });
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
    else if (route.id === "learning-sources-list") await handleSourceList(req, res, url, auth);
    else if (route.id === "learning-sources-create") await handleSourceCreate(req, res, auth);
    else if (route.id === "learning-goals-list") await handleGoalList(req, res, url, auth);
    else if (route.id === "learning-goals-create") await handleGoalCreate(req, res, auth);
    else if (route.id === "learning-goal-update") await handleGoalUpdate(req, res, url);
    else if (route.id === "learning-profile-read") await handleProfileRead(req, res, url, auth);
    else if (route.id === "learning-profile-rebuild") await handleProfileRebuild(req, res, url);
    else if (route.id === "learning-curriculum-references-list") await handleCurriculumReferences(req, res, url);
    else if (route.id === "learning-program-update") await handleUpdate(req, res, url);
    else if (route.id === "learning-program-draft-plan") await handleDraft(req, res, url);
    else if (route.id === "learning-program-publish") await handlePublish(req, res, url);
    else if (route.id === "learning-task-cards-list") await handleTaskCardsList(req, res, url, auth);
    else if (route.id === "learning-task-card-read") await handleTaskCardRead(req, res, url, auth);
    else if (route.id === "learning-task-card-session-start") await handleTaskSessionStart(req, res, url);
    else if (route.id === "learning-sessions-list") await handleSessionsList(req, res, url, auth);
    else if (route.id === "learning-session-advance") await handleSessionAdvance(req, res, url);
    else if (route.id === "learning-session-evaluation-create") await handleEvaluationCreate(req, res, url);
    else if (route.id === "learning-evaluations-list") await handleEvaluationsList(req, res, url, auth);
    else if (route.id === "learning-evaluation-reward-settle") await handleRewardSettlementCreate(req, res, url);
    else if (route.id === "learning-reward-settlements-list") await handleRewardSettlementsList(req, res, url, auth);
    else if (route.id === "learning-reward-settlement-read") await handleRewardSettlementRead(req, res, url, auth);
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
