"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const WORKSPACE_ONBOARDING_API_ROUTE_SPECS = Object.freeze([
  {
    id: "workspace-onboarding-plan",
    method: "POST",
    path: "/api/workspace-onboarding/plan",
    group: "workspace-onboarding",
    moduleKey: "workspace-onboarding",
    handlerKey: "planWorkspaceOnboarding",
    summary: "Owner-only dry-run plan for family workspace onboarding.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace", "gateway", "plugin"],
    tags: ["workspace", "onboarding", "plan"],
  },
  {
    id: "workspace-onboarding-apply",
    method: "POST",
    path: "/api/workspace-onboarding/apply",
    group: "workspace-onboarding",
    moduleKey: "workspace-onboarding",
    handlerKey: "applyWorkspaceOnboarding",
    summary: "Owner-only apply path for family workspace onboarding.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace", "access-key", "gateway", "plugin"],
    tags: ["workspace", "onboarding", "apply"],
  },
]);

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`workspace onboarding api routes require ${name}`);
}

function hasInjectedAuth(context) {
  return Boolean(context && Object.hasOwn(context, "auth"));
}

function statusCodeForResult(result = {}, routeId = "") {
  if (result.ok) return routeId === "workspace-onboarding-apply" ? 201 : 200;
  if (result.status === "blocked") return 503;
  if (result.status === "invalid") return 400;
  return 500;
}

function createWorkspaceOnboardingApiRoutes(deps = {}) {
  for (const name of ["readBody", "sendJson", "requireOwner", "isOwnerAuth"]) requireFunction(deps, name);
  if (!deps.workspaceOnboardingService || typeof deps.workspaceOnboardingService.planOnboarding !== "function") {
    throw new Error("workspace onboarding api routes require workspaceOnboardingService.planOnboarding");
  }
  if (typeof deps.workspaceOnboardingService.applyOnboarding !== "function") {
    throw new Error("workspace onboarding api routes require workspaceOnboardingService.applyOnboarding");
  }

  const registry = createApiRouteRegistry(WORKSPACE_ONBOARDING_API_ROUTE_SPECS);

  function ownerAuthForRoute(req, res, context) {
    if (hasInjectedAuth(context)) {
      const auth = context.auth;
      if (deps.isOwnerAuth(auth)) return auth;
      deps.sendJson(res, 403, { error: "Owner access is required" });
      return null;
    }
    return deps.requireOwner(req, res);
  }

  async function readJsonBody(req, res) {
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body?.__error) {
      deps.sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return { ok: false, body: null };
    }
    return { ok: true, body: body && typeof body === "object" ? body : {} };
  }

  async function handle(req, res, url, context = {}) {
    const path = url?.pathname || req.url || "/";
    const route = registry.match({ method: req.method || "GET", path });
    if (!route) return { handled: false };

    const ownerAuth = ownerAuthForRoute(req, res, context);
    if (!ownerAuth) return { handled: true, route, auth: hasInjectedAuth(context) ? context.auth : undefined };

    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return { handled: true, route, auth: ownerAuth };

    if (route.id === "workspace-onboarding-plan") {
      const result = deps.workspaceOnboardingService.planOnboarding(bodyResult.body, {
        actor: ownerAuth.principalId || ownerAuth.workspaceId || "owner",
      });
      deps.sendJson(res, statusCodeForResult(result, route.id), result);
      return { handled: true, route, auth: ownerAuth };
    }

    if (route.id === "workspace-onboarding-apply") {
      const result = await deps.workspaceOnboardingService.applyOnboarding(bodyResult.body, {
        actor: ownerAuth.principalId || ownerAuth.workspaceId || "owner",
      });
      deps.sendJson(res, statusCodeForResult(result, route.id), result);
      return { handled: true, route, auth: ownerAuth };
    }

    return { handled: false };
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
  WORKSPACE_ONBOARDING_API_ROUTE_SPECS,
  createWorkspaceOnboardingApiRoutes,
};
