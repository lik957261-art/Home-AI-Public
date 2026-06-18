"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function clean(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

const NATIVE_ENVIRONMENT_CONTEXT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "native-environment-context-upsert",
    method: "POST",
    path: "/api/native/environment-context",
    group: "native-environment",
    moduleKey: "native-environment",
    workspaceScoped: true,
    resourceTypes: ["native-environment", "device"],
  },
]);

function createNativeEnvironmentContextApiRoutes(deps = {}) {
  for (const name of ["readBody", "requireWorkspaceAccess", "sendJson", "workspacePrincipal"]) {
    if (typeof deps[name] !== "function") throw new Error(`native environment context api routes require ${name}`);
  }
  if (!deps.currentEnvironmentContextService) throw new Error("native environment context api routes require currentEnvironmentContextService");

  const registry = createApiRouteRegistry(NATIVE_ENVIRONMENT_CONTEXT_API_ROUTE_SPECS);
  const service = deps.currentEnvironmentContextService;

  function defaultWorkspaceId(req) {
    const auth = typeof deps.authenticateRequest === "function" ? deps.authenticateRequest(req) : null;
    return clean(auth?.workspaceId || "owner", 120) || "owner";
  }

  function requestedWorkspaceId(req, body = {}) {
    return clean(body.workspaceId || body.workspace_id || defaultWorkspaceId(req), 120) || "owner";
  }

  async function handleUpsert(req, res) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(req, body));
    if (!workspaceId) return;
    const result = service.upsert(Object.assign({}, body, {
      workspaceId,
      principalId: deps.workspacePrincipal(workspaceId),
    }));
    deps.sendJson(res, result.ok ? 200 : (result.status || 400), result.ok
      ? { ok: true, snapshot: result.snapshot }
      : { ok: false, error: clean(result.error || "environment_context_failed", 160) });
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "native-environment-context-upsert") await handleUpsert(req, res);
    else return { handled: false };
    return { handled: true, route };
  }

  return {
    handle,
    list: (...args) => registry.list(...args),
    match: (...args) => registry.match(...args),
    summary: (...args) => registry.summary(...args),
  };
}

module.exports = {
  NATIVE_ENVIRONMENT_CONTEXT_API_ROUTE_SPECS,
  createNativeEnvironmentContextApiRoutes,
};
