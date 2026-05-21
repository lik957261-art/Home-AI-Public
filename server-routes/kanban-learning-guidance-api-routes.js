"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const KANBAN_LEARNING_GUIDANCE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "kanban-learning-guidance",
    method: ["GET", "POST"],
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/learning-guidance$/,
    group: "kanban",
    moduleKey: "kanban-learning-guidance",
    handlerKey: "guidance",
    summary: "Read or update per-card learning guidance state without exposing answer keys.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "study-plan", "guidance"],
    tags: ["kanban", "learning", "guidance"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`kanban learning guidance api routes require ${name}`);
  }
}

function cardIdFromPath(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/kanban\/cards\/([^/]+)\/learning-guidance$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function requireKanbanEnabled(deps, res) {
  if (deps.useKanbanTodoBackend()) return true;
  deps.sendJson(res, 409, { ok: false, error: "Kanban backend is not enabled" });
  return false;
}

function jsonError(deps, res, err) {
  deps.sendJson(res, err.status || 500, {
    ok: false,
    error: deps.compactText ? deps.compactText(err.message || String(err), 800) : (err.message || String(err)),
  });
}

function createKanbanLearningGuidanceApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "readBody",
    "resolveKanbanCardAccess",
    "sendJson",
    "useKanbanTodoBackend",
  ]);
  if (!deps.learningCardGuidanceService || typeof deps.learningCardGuidanceService.getSession !== "function" || typeof deps.learningCardGuidanceService.applyAction !== "function") {
    throw new Error("kanban learning guidance api routes require learningCardGuidanceService");
  }

  const registry = createApiRouteRegistry(KANBAN_LEARNING_GUIDANCE_API_ROUTE_SPECS);

  async function handleGuidance(req, res, url) {
    if (!requireKanbanEnabled(deps, res)) return;
    const body = req.method === "POST" ? await deps.readBody(req, 120000).catch(() => ({})) : {};
    const cardId = cardIdFromPath(url.pathname);
    const workspaceId = body.workspaceId || url.searchParams.get("workspaceId") || "owner";
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      workspaceId,
      cardId,
      req.method === "POST" ? "answerQuiz" : "view",
    );
    if (!access) return;
    try {
      const input = Object.assign({}, body, {
        workspaceId: access.workspaceId,
        cardId,
        card: access.card || null,
        mode: body.mode || url.searchParams.get("mode") || "",
        action: req.method === "POST" ? (body.action || "load") : "load",
      });
      const result = req.method === "POST"
        ? deps.learningCardGuidanceService.applyAction(input)
        : deps.learningCardGuidanceService.getSession(input);
      if (!result.ok) {
        deps.sendJson(res, result.status || 400, result);
        return;
      }
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
    if (route.id === "kanban-learning-guidance") await handleGuidance(req, res, url);
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
  KANBAN_LEARNING_GUIDANCE_API_ROUTE_SPECS,
  createKanbanLearningGuidanceApiRoutes,
};
