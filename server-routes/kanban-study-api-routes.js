"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const KANBAN_STUDY_API_ROUTE_SPECS = Object.freeze([
  {
    id: "kanban-card-study-plan",
    method: "POST",
    path: "/api/kanban/cards/study-plan",
    group: "kanban",
    moduleKey: "kanban-study",
    handlerKey: "studyPlan",
    summary: "Create a study-plan Kanban story and cards.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "study-plan"],
    tags: ["kanban", "study", "plan"],
  },
  {
    id: "kanban-card-assessment-plan",
    method: "POST",
    path: "/api/kanban/cards/assessment-plan",
    group: "kanban",
    moduleKey: "kanban-study",
    handlerKey: "assessmentPlan",
    summary: "Create an assessment-plan Kanban story and cards.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "assessment-plan"],
    tags: ["kanban", "assessment", "plan"],
  },
  {
    id: "kanban-reading-submission",
    method: "POST",
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/(?:reading|study)-submission$/,
    group: "kanban",
    moduleKey: "kanban-study",
    handlerKey: "readingSubmission",
    summary: "Submit study or reading work for a Kanban card.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "study-plan", "submission"],
    tags: ["kanban", "study", "submission"],
  },
  {
    id: "kanban-reading-quiz",
    method: ["GET", "POST"],
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/(?:reading|study)-quiz$/,
    group: "kanban",
    moduleKey: "kanban-study",
    handlerKey: "readingQuiz",
    summary: "Read or submit a study quiz for a Kanban card.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "study-plan", "quiz"],
    tags: ["kanban", "study", "quiz"],
  },
  {
    id: "kanban-assessment-exam",
    method: ["GET", "POST"],
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/assessment-exam$/,
    group: "kanban",
    moduleKey: "kanban-study",
    handlerKey: "assessmentExam",
    summary: "Read or submit a formal assessment exam for a Kanban card.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "assessment-plan", "exam"],
    tags: ["kanban", "assessment", "exam"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`kanban study api routes require ${name}`);
  }
}

function cardPathMatch(pathname, suffixRegex) {
  return String(pathname || "").match(new RegExp(`^/api/kanban/cards/([^/]+)/${suffixRegex}$`));
}

function requireKanbanEnabled(deps, res) {
  if (deps.useKanbanTodoBackend()) return true;
  deps.sendJson(res, 409, { error: "Kanban backend is not enabled" });
  return false;
}

function planReadLimit(readingCoverMaxBytes) {
  return Math.ceil(Math.max(1, Number(readingCoverMaxBytes || 1)) * 1.4) + 200000;
}

async function readBodyOrError(deps, req, limit) {
  try {
    return await deps.readBody(req, limit);
  } catch (err) {
    return { __error: err };
  }
}

function jsonError(deps, res, err) {
  deps.sendJson(res, err.status || 500, {
    ok: false,
    error: deps.compactText(err.message || String(err), 800),
  });
}

function broadcastCardUpdate(deps, workspaceId, cardId, action, todoAction = action) {
  deps.clearKanbanCardListCache(workspaceId);
  deps.broadcast({ type: "kanban.updated", workspaceId, cardId, action });
  deps.broadcast({ type: "todos.updated", workspaceId, todoId: cardId, action: todoAction });
}

function createKanbanStudyApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "annotateKanbanCardForAuth",
    "broadcast",
    "clearKanbanCardListCache",
    "compactText",
    "createKanbanAssessmentPlanCards",
    "createKanbanStudyPlanCards",
    "getKanbanAssessmentExam",
    "getKanbanReadingQuiz",
    "kanbanErrorResponse",
    "readBody",
    "requireWorkspaceAccess",
    "resolveKanbanCardAccess",
    "sendJson",
    "startKanbanAssessmentExam",
    "submitKanbanAssessmentExam",
    "submitKanbanReadingQuiz",
    "submitKanbanReadingSubmission",
    "useKanbanTodoBackend",
  ]);

  const registry = createApiRouteRegistry(KANBAN_STUDY_API_ROUTE_SPECS);
  const readingCoverMaxBytes = Math.max(1, Number(deps.readingCoverMaxBytes || 20 * 1024 * 1024));
  const maxUploadBytes = Math.max(1, Number(deps.maxUploadBytes || 100 * 1024 * 1024));

  async function handleStudyPlan(req, res) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = await deps.readBody(req, planReadLimit(readingCoverMaxBytes));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await deps.createKanbanStudyPlanCards(workspaceId, body);
      if (!result.ok) {
        deps.kanbanErrorResponse(res, result, 502);
        return;
      }
      deps.clearKanbanCardListCache(workspaceId);
      deps.broadcast({ type: "kanban.updated", workspaceId, action: "study-plan-add" });
      deps.broadcast({ type: "todos.updated", workspaceId, action: "study-plan-add" });
      deps.sendJson(res, 201, result);
    } catch (err) {
      jsonError(deps, res, err);
    }
  }

  async function handleAssessmentPlan(req, res) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = await deps.readBody(req, 240000);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await deps.createKanbanAssessmentPlanCards(workspaceId, body);
      if (!result.ok) {
        deps.kanbanErrorResponse(res, result, 502);
        return;
      }
      deps.clearKanbanCardListCache(workspaceId);
      deps.broadcast({ type: "kanban.updated", workspaceId, action: "assessment-plan-add" });
      deps.broadcast({ type: "todos.updated", workspaceId, action: "assessment-plan-add" });
      deps.sendJson(res, 201, result);
    } catch (err) {
      jsonError(deps, res, err);
    }
  }

  async function handleReadingSubmission(req, res, url) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = await readBodyOrError(deps, req, Math.ceil(maxUploadBytes * 1.4) + 8192);
    if (body.__error) {
      deps.sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return;
    }
    const match = cardPathMatch(url.pathname, "(?:reading|study)-submission");
    const cardId = decodeURIComponent(match[1]);
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      "submitStudy",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const result = await deps.submitKanbanReadingSubmission(workspaceId, cardId, body);
      if (!result.ok) {
        deps.kanbanErrorResponse(res, result, 502);
        return;
      }
      broadcastCardUpdate(deps, workspaceId, cardId, "reading-submission");
      if (result.card) result.card = deps.annotateKanbanCardForAuth(result.card, access.auth);
      deps.sendJson(res, 200, result);
    } catch (err) {
      jsonError(deps, res, err);
    }
  }

  async function handleReadingQuiz(req, res, url) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = req.method === "POST" ? await deps.readBody(req).catch(() => ({})) : {};
    const match = cardPathMatch(url.pathname, "(?:reading|study)-quiz");
    const cardId = decodeURIComponent(match[1]);
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      req.method === "POST" ? "answerQuiz" : "view",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const result = req.method === "POST"
        ? await deps.submitKanbanReadingQuiz(workspaceId, cardId, body)
        : await deps.getKanbanReadingQuiz(workspaceId, cardId);
      if (!result.ok) {
        deps.sendJson(res, result.status || 400, { ok: false, error: result.error || "Reading quiz failed" });
        return;
      }
      if (req.method === "POST" && result.passed) {
        broadcastCardUpdate(deps, workspaceId, cardId, "reading-quiz-passed");
      }
      if (result.card) result.card = deps.annotateKanbanCardForAuth(result.card, access.auth);
      deps.sendJson(res, 200, result);
    } catch (err) {
      jsonError(deps, res, err);
    }
  }

  async function handleAssessmentExam(req, res, url) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = req.method === "POST" ? await deps.readBody(req).catch(() => ({})) : {};
    const match = cardPathMatch(url.pathname, "assessment-exam");
    const cardId = decodeURIComponent(match[1]);
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      req.method === "POST" ? "answerQuiz" : "view",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    try {
      const shouldStart = req.method === "POST" && (
        body.generateOnly
        || body.generate_only
        || body.requirement
        || body.programmingRequirement
        || body.programming_requirement
      );
      const result = req.method === "POST"
        ? (shouldStart
          ? await deps.startKanbanAssessmentExam(workspaceId, cardId, body)
          : await deps.submitKanbanAssessmentExam(workspaceId, cardId, body))
        : await deps.getKanbanAssessmentExam(workspaceId, cardId);
      if (!result.ok) {
        deps.sendJson(res, result.status || 400, { ok: false, error: result.error || "Assessment exam failed" });
        return;
      }
      if (req.method === "POST") {
        const action = shouldStart ? "assessment-exam-started" : (result.passed ? "assessment-passed" : "assessment-retake");
        broadcastCardUpdate(deps, workspaceId, cardId, action);
      }
      if (result.card) result.card = deps.annotateKanbanCardForAuth(result.card, access.auth);
      deps.sendJson(res, 200, result);
    } catch (err) {
      jsonError(deps, res, err);
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "kanban-card-study-plan") await handleStudyPlan(req, res);
    else if (route.id === "kanban-card-assessment-plan") await handleAssessmentPlan(req, res);
    else if (route.id === "kanban-reading-submission") await handleReadingSubmission(req, res, url);
    else if (route.id === "kanban-reading-quiz") await handleReadingQuiz(req, res, url);
    else if (route.id === "kanban-assessment-exam") await handleAssessmentExam(req, res, url);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
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
  KANBAN_STUDY_API_ROUTE_SPECS,
  createKanbanStudyApiRoutes,
};
