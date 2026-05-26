"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const LEARNING_GROWTH_CARD_API_ROUTE_SPECS = Object.freeze([
  {
    id: "learning-growth-card-teaching-check",
    method: "POST",
    pathRegex: /^\/api\/learning-growth\/cards\/[^/]+\/teaching-check$/,
    group: "learning-growth-card",
    moduleKey: "learning-growth-card",
    handlerKey: "completeTeachingCheck",
    summary: "Executor completes a native Growth teaching/practice card with summary-only lightweight evidence.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth-card", "learning-evaluation", "learning-reward-settlement"],
    tags: ["learning", "growth", "teaching-card"],
  },
  {
    id: "learning-growth-card-experience-signal",
    method: "POST",
    pathRegex: /^\/api\/learning-growth\/cards\/[^/]+\/experience-signal$/,
    group: "learning-growth-card",
    moduleKey: "learning-growth-card",
    handlerKey: "recordExperienceSignal",
    summary: "Executor records summary-only difficulty/interest feedback for a native Growth card.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth-card", "learning-growth-experience-signal"],
    tags: ["learning", "growth", "experience"],
  },
  {
    id: "learning-growth-stage-assessment-activate",
    method: "POST",
    pathRegex: /^\/api\/learning-growth\/stage-assessments\/[^/]+\/activate$/,
    group: "learning-growth-card",
    moduleKey: "learning-growth-card",
    handlerKey: "activateStageAssessment",
    summary: "Owner manually activates a native Growth stage assessment cycle.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth-stage-assessment"],
    tags: ["learning", "growth", "stage-assessment", "owner"],
  },
  {
    id: "learning-growth-stage-assessment-challenge",
    method: "POST",
    path: "/api/learning-growth/stage-assessments/challenge",
    group: "learning-growth-card",
    moduleKey: "learning-growth-card",
    handlerKey: "challengeStageAssessment",
    summary: "Executor starts a native Growth stage-assessment challenge when ready.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-growth-stage-assessment", "learning-growth-card"],
    tags: ["learning", "growth", "stage-assessment", "challenge"],
  },
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`learning growth card api routes require ${name}`);
  }
}

function pathId(pathname, regex) {
  const match = String(pathname || "").match(regex);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { ok: false, error: err.message || String(err) });
}

function createLearningGrowthCardApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "isOwnerAuth",
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  const learningProgramService = deps.learningProgramService;
  if (!learningProgramService || typeof learningProgramService.getTaskCard !== "function") {
    throw new Error("learning growth card api routes require learningProgramService");
  }
  const teachingCheckService = deps.learningGrowthTeachingCheckService;
  const experienceSignalService = deps.learningGrowthExperienceSignalService;
  const stageAssessmentService = deps.learningGrowthStageAssessmentService;
  const registry = createApiRouteRegistry(LEARNING_GROWTH_CARD_API_ROUTE_SPECS);

  function canAccessLearnerWorkspace(auth, learnerWorkspaceId, authorizedWorkspaceId = "") {
    if (deps.isOwnerAuth(auth)) return true;
    const authorized = cleanString(authorizedWorkspaceId);
    if (cleanString(learnerWorkspaceId) && authorized && authorized !== "owner" && cleanString(learnerWorkspaceId) === authorized) return true;
    if (typeof deps.authCanAccessWorkspace === "function") return deps.authCanAccessWorkspace(auth, learnerWorkspaceId);
    return cleanString(auth?.workspaceId) === cleanString(learnerWorkspaceId);
  }

  function actorFromAuth(auth) {
    if (deps.isOwnerAuth(auth)) return auth?.principalId || "owner";
    return auth?.principalId || auth?.workspaceId || "executor";
  }

  function authorizeTask(req, res, auth, taskCardId) {
    const taskCard = learningProgramService.getTaskCard(taskCardId);
    if (!taskCard) {
      deps.sendJson(res, 404, { ok: false, error: "Learning growth card not found" });
      return null;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, taskCard.workspaceId);
    if (!workspaceId) return null;
    if (!deps.isOwnerAuth(auth) && !canAccessLearnerWorkspace(auth, taskCard.learnerId, workspaceId)) {
      deps.sendJson(res, 403, { ok: false, error: "Learner access is not allowed" });
      return null;
    }
    if (!deps.isOwnerAuth(auth) && taskCard.status !== "published") {
      deps.sendJson(res, 409, { ok: false, error: "Learning growth card is not executable" });
      return null;
    }
    return taskCard;
  }

  function authorizeWorkspaceLearner(req, res, url, auth, input = {}) {
    const requestedWorkspace = cleanString(input.workspaceId || url.searchParams.get("workspaceId")) || (deps.isOwnerAuth(auth) ? "weixin_stephen" : auth?.workspaceId);
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspace);
    if (!workspaceId) return null;
    const learnerId = cleanString(input.learnerId || input.studentId || url.searchParams.get("learnerId") || url.searchParams.get("studentId")) || workspaceId;
    if (!deps.isOwnerAuth(auth) && !canAccessLearnerWorkspace(auth, learnerId, workspaceId)) {
      deps.sendJson(res, 403, { ok: false, error: "Learner access is not allowed" });
      return null;
    }
    return { workspaceId, learnerId };
  }

  async function handleTeachingCheck(req, res, url, auth) {
    if (!teachingCheckService || typeof teachingCheckService.complete !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "Learning growth teaching check service is not available" });
      return;
    }
    const taskCardId = pathId(url.pathname, /^\/api\/learning-growth\/cards\/([^/]+)\/teaching-check$/);
    const taskCard = authorizeTask(req, res, auth, taskCardId);
    if (!taskCard) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      deps.sendJson(res, 200, teachingCheckService.complete(Object.assign({}, body, {
        taskCardId: taskCard.taskCardId,
        actorPrincipalId: actorFromAuth(auth),
      })));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleExperienceSignal(req, res, url, auth) {
    if (!experienceSignalService || typeof experienceSignalService.record !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "Learning growth experience signal service is not available" });
      return;
    }
    const taskCardId = pathId(url.pathname, /^\/api\/learning-growth\/cards\/([^/]+)\/experience-signal$/);
    const taskCard = authorizeTask(req, res, auth, taskCardId);
    if (!taskCard) return;
    const body = await deps.readBody(req, 60000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      deps.sendJson(res, 201, experienceSignalService.record(Object.assign({}, body, {
        taskCardId: taskCard.taskCardId,
        actorPrincipalId: actorFromAuth(auth),
      })));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleActivate(req, res, url, auth) {
    if (!deps.requireOwner(req, res)) return;
    if (!stageAssessmentService || typeof stageAssessmentService.activate !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "Learning growth stage assessment service is not available" });
      return;
    }
    const body = await deps.readBody(req, 60000).catch(() => ({}));
    const cycleId = pathId(url.pathname, /^\/api\/learning-growth\/stage-assessments\/([^/]+)\/activate$/);
    try {
      deps.sendJson(res, 201, stageAssessmentService.activate(cycleId, Object.assign({}, body || {}, {
        actorPrincipalId: actorFromAuth(auth),
        activationSource: "owner",
      })));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleChallenge(req, res, url, auth) {
    if (!stageAssessmentService || typeof stageAssessmentService.challenge !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "Learning growth stage assessment service is not available" });
      return;
    }
    const body = await deps.readBody(req, 60000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    const scope = authorizeWorkspaceLearner(req, res, url, auth, body || {});
    if (!scope) return;
    try {
      deps.sendJson(res, 201, stageAssessmentService.challenge(Object.assign({}, body || {}, scope, {
        actorPrincipalId: actorFromAuth(auth),
        activationSource: deps.isOwnerAuth(auth) ? "owner" : "executor",
      })));
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
    if (route.id === "learning-growth-card-teaching-check") await handleTeachingCheck(req, res, url, auth);
    else if (route.id === "learning-growth-card-experience-signal") await handleExperienceSignal(req, res, url, auth);
    else if (route.id === "learning-growth-stage-assessment-activate") await handleActivate(req, res, url, auth);
    else if (route.id === "learning-growth-stage-assessment-challenge") await handleChallenge(req, res, url, auth);
    else return { handled: false };
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
  LEARNING_GROWTH_CARD_API_ROUTE_SPECS,
  createLearningGrowthCardApiRoutes,
};
