"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const DATA_CONTEXT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "data-context-types",
    method: "GET",
    path: "/api/data-context/types",
    group: "data-context",
    moduleKey: "data-context",
    handlerKey: "types",
    summary: "List Home AI host-provided data context types available for analysis.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["data-context"],
    tags: ["automation", "analysis", "data-context"],
  },
  {
    id: "data-context-prepare",
    method: "POST",
    path: "/api/data-context/prepare",
    group: "data-context",
    moduleKey: "data-context",
    handlerKey: "prepare",
    summary: "Prepare a bounded, authorized Home AI data context for automation or chat analysis.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["data-context", "runtime-state"],
    tags: ["automation", "analysis", "data-context"],
  },
]);

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`data context api routes require ${name}`);
  }
}

function safeErrorPayload(err) {
  return {
    ok: false,
    code: cleanString(err?.code || "data_context_error", 80),
    error: cleanString(err?.message || "data context error", 240).replace(/\s+/g, " "),
  };
}

function workspaceFromRequest(url, body, auth) {
  return cleanString(
    body?.workspaceId
    || body?.workspace_id
    || url.searchParams.get("workspaceId")
    || auth?.workspaceId
    || "owner",
    120,
  ) || "owner";
}

function createDataContextApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.dataContextService || typeof deps.dataContextService.prepare !== "function") {
    throw new Error("data context api routes require dataContextService.prepare");
  }
  const registry = createApiRouteRegistry(DATA_CONTEXT_API_ROUTE_SPECS);

  async function handleTypes(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    deps.sendJson(res, 200, {
      ok: true,
      types: typeof deps.dataContextService.supportedTypes === "function"
        ? deps.dataContextService.supportedTypes()
        : [],
    });
    return { handled: true, status: 200 };
  }

  async function handlePrepare(req, res, url, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const result = deps.dataContextService.prepare({
        type: body.type || body.contextType,
        date: body.date,
        scope: Object.assign({}, body.scope || {}, {
          workspaceId,
          actorId: context.auth?.principalId || context.auth?.workspaceId || workspaceId,
        }),
        maxThreads: body.maxThreads,
        maxMessagesPerThread: body.maxMessagesPerThread,
        maxExcerptChars: body.maxExcerptChars,
      });
      deps.sendJson(res, 200, {
        ok: true,
        type: result.type,
        context: result.context,
        markdown: body.format === "markdown" ? result.markdown : undefined,
      });
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 400, safeErrorPayload(err));
      return { handled: true, status: err.status || 400 };
    }
  }

  async function handle(req, res, url, context = {}) {
    const match = registry.match({ method: req.method, path: url.pathname });
    if (!match) return { handled: false };
    if (match.handlerKey === "types") return handleTypes(req, res, url, context);
    if (match.handlerKey === "prepare") return handlePrepare(req, res, url, context);
    return { handled: false };
  }

  return {
    handle,
    match: registry.match,
    summary: registry.summary,
    routeSpecs: DATA_CONTEXT_API_ROUTE_SPECS,
  };
}

module.exports = {
  DATA_CONTEXT_API_ROUTE_SPECS,
  createDataContextApiRoutes,
};
