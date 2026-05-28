"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const HERMES_PLUGIN_API_ROUTE_SPECS = Object.freeze([
  {
    id: "hermes-plugins-list",
    method: "GET",
    path: "/api/hermes-plugins",
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "list",
    summary: "List configured Hermes embedded app plugins.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["plugin"],
    tags: ["plugin", "manifest"],
  },
  {
    id: "hermes-plugin-wardrobe-manifest",
    method: "GET",
    path: "/api/hermes-plugins/wardrobe/manifest",
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "manifest",
    summary: "Read the configured Wardrobe embedded-app plugin manifest.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin", "wardrobe"],
    tags: ["plugin", "wardrobe", "manifest"],
  },
]);

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`hermes plugin api routes require ${name}`);
}

function createHermesPluginApiRoutes(deps = {}) {
  for (const name of ["requireWorkspaceAccess", "sendJson"]) requireFunction(deps, name);
  if (!deps.hermesPluginService || typeof deps.hermesPluginService.manifest !== "function") {
    throw new Error("hermes plugin api routes require hermesPluginService.manifest");
  }
  if (typeof deps.hermesPluginService.list !== "function") {
    throw new Error("hermes plugin api routes require hermesPluginService.list");
  }

  const registry = createApiRouteRegistry(HERMES_PLUGIN_API_ROUTE_SPECS);

  function requestedWorkspaceId(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      workspaceId,
      plugins: deps.hermesPluginService.list().map((item) => ({
        id: item.id,
        manifestPath: `/api/hermes-plugins/${encodeURIComponent(item.id)}/manifest`,
      })),
    });
  }

  async function handleWardrobeManifest(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    const manifest = await deps.hermesPluginService.manifest({ id: "wardrobe", workspaceId });
    deps.sendJson(res, 200, Object.assign({ workspaceId }, manifest));
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "hermes-plugins-list") await handleList(req, res, url);
    else if (route.id === "hermes-plugin-wardrobe-manifest") await handleWardrobeManifest(req, res, url);
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
  HERMES_PLUGIN_API_ROUTE_SPECS,
  createHermesPluginApiRoutes,
};
