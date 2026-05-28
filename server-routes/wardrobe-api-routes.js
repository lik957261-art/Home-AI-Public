"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const WARDROBE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "wardrobe-overview",
    method: "GET",
    path: "/api/wardrobe/overview",
    group: "wardrobe",
    moduleKey: "wardrobe",
    handlerKey: "overview",
    summary: "Read deterministic Wardrobe dashboard projection without starting a model run.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["wardrobe", "project"],
    tags: ["wardrobe", "overview", "projection"],
  },
]);

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`wardrobe api routes require ${name}`);
}

function createWardrobeApiRoutes(deps = {}) {
  for (const name of ["compactText", "requireWorkspaceAccess", "sendJson"]) requireFunction(deps, name);
  if (!deps.sharedDirectoryProjectionService || typeof deps.sharedDirectoryProjectionService.publicProjectsForWorkspace !== "function") {
    throw new Error("wardrobe api routes require sharedDirectoryProjectionService.publicProjectsForWorkspace");
  }
  if (!deps.wardrobeProjectionService || typeof deps.wardrobeProjectionService.overview !== "function") {
    throw new Error("wardrobe api routes require wardrobeProjectionService.overview");
  }

  const registry = createApiRouteRegistry(WARDROBE_API_ROUTE_SPECS);

  function requestedWorkspaceId(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  function requestedFilters(url) {
    return {
      q: String(url?.searchParams?.get("q") || "").trim().slice(0, 80),
      brand: String(url?.searchParams?.get("brand") || "").trim().slice(0, 80),
      section: String(url?.searchParams?.get("section") || "").trim().slice(0, 40),
    };
  }

  async function handleOverview(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    try {
      const projects = await deps.sharedDirectoryProjectionService.publicProjectsForWorkspace(workspaceId);
      const projection = await deps.wardrobeProjectionService.overview({
        workspaceId,
        projects,
        filters: requestedFilters(url),
      });
      deps.sendJson(res, 200, Object.assign({ workspaceId }, projection));
    } catch (err) {
      deps.sendJson(res, 200, {
        ok: false,
        available: false,
        workspaceId,
        code: "wardrobe_projection_failed",
        warning: deps.compactText(err?.message || String(err), 800),
      });
    }
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "wardrobe-overview") await handleOverview(req, res, url);
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
  WARDROBE_API_ROUTE_SPECS,
  createWardrobeApiRoutes,
};
