"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const LEARNING_PARENT_REVIEW_API_ROUTE_SPECS = Object.freeze([
  {
    id: "learning-parent-review-requests-list",
    method: "GET",
    path: "/api/learning/parent-review-requests",
    group: "learning-parent-review",
    moduleKey: "learning-parent-review",
    handlerKey: "listParentReviewRequests",
    summary: "Owner reads summary-only learning parent review requests.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
    tags: ["learning", "parent-review", "owner"],
  },
  {
    id: "learning-parent-review-request-read",
    method: "GET",
    pathRegex: /^\/api\/learning\/parent-review-requests\/[^/]+$/,
    group: "learning-parent-review",
    moduleKey: "learning-parent-review",
    handlerKey: "getParentReviewRequest",
    summary: "Owner reads one summary-only learning parent review request.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
    tags: ["learning", "parent-review", "owner"],
  },
  {
    id: "learning-parent-review-request-decision",
    method: "POST",
    pathRegex: /^\/api\/learning\/parent-review-requests\/[^/]+\/decision$/,
    group: "learning-parent-review",
    moduleKey: "learning-parent-review",
    handlerKey: "decideParentReviewRequest",
    summary: "Owner records a decision for a learning parent review request.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-parent-review"],
    tags: ["learning", "parent-review", "owner", "decision"],
  },
]);

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

function createLearningParentReviewApiRoutes(deps = {}) {
  for (const name of ["readBody", "requireOwner", "sendJson"]) {
    if (typeof deps[name] !== "function") throw new Error(`learning parent review api routes require ${name}`);
  }
  const service = deps.learningParentReviewRequestService;
  if (!service || typeof service.list !== "function") {
    throw new Error("learning parent review api routes require learningParentReviewRequestService");
  }
  const registry = createApiRouteRegistry(LEARNING_PARENT_REVIEW_API_ROUTE_SPECS);

  async function handleList(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    try {
      deps.sendJson(res, 200, {
        ok: true,
        reviewRequests: service.list({
          learnerId: cleanString(url.searchParams.get("learnerId") || url.searchParams.get("studentId")),
          workspaceId: cleanString(url.searchParams.get("workspaceId")),
          status: cleanString(url.searchParams.get("status") || "pending"),
          requestType: cleanString(url.searchParams.get("requestType")),
          resourceType: cleanString(url.searchParams.get("resourceType")),
          resourceId: cleanString(url.searchParams.get("resourceId")),
          limit: url.searchParams.get("limit") || 50,
        }),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRead(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    try {
      const reviewRequestId = pathId(url.pathname, /^\/api\/learning\/parent-review-requests\/([^/]+)$/);
      const reviewRequest = service.get(reviewRequestId);
      if (!reviewRequest) {
        deps.sendJson(res, 404, { ok: false, error: "Parent review request not found" });
        return;
      }
      deps.sendJson(res, 200, { ok: true, reviewRequest });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleDecision(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    const body = await deps.readBody(req, 120000).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
      return;
    }
    try {
      const reviewRequestId = pathId(url.pathname, /^\/api\/learning\/parent-review-requests\/([^/]+)\/decision$/);
      deps.sendJson(res, 200, {
        ok: true,
        reviewRequest: service.decide(reviewRequestId, Object.assign({}, body, { principalId: owner.principalId || "owner" })),
      });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handle(req, res, url) {
    const route = registry.match({ method: req.method || "GET", path: url?.pathname || req.url || "/" });
    if (!route) return { handled: false };
    if (route.id === "learning-parent-review-requests-list") await handleList(req, res, url);
    else if (route.id === "learning-parent-review-request-read") await handleRead(req, res, url);
    else if (route.id === "learning-parent-review-request-decision") await handleDecision(req, res, url);
    else return { handled: false };
    return { handled: true, route };
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
  LEARNING_PARENT_REVIEW_API_ROUTE_SPECS,
  createLearningParentReviewApiRoutes,
};
