"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const RESOURCE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "projects-list",
    method: "GET",
    path: "/api/projects",
    group: "project",
    moduleKey: "resource",
    handlerKey: "listProjects",
    summary: "List public projects for a workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["project", "workspace"],
    tags: ["project", "workspace", "list"],
  },
  {
    id: "directories-shared-list",
    method: "GET",
    path: "/api/directories/shared",
    group: "directory",
    moduleKey: "resource",
    handlerKey: "listSharedDirectories",
    summary: "List shared directories visible to a workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "share"],
    tags: ["directory", "share", "list"],
  },
  {
    id: "skills-detail",
    method: "GET",
    path: "/api/skills/detail",
    group: "skill",
    moduleKey: "resource",
    handlerKey: "skillDetail",
    summary: "Read public detail for a skill.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["skill"],
    tags: ["skill", "detail"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`resource api routes require ${name}`);
  }
}

function hasInjectedAuth(context) {
  return Boolean(context && Object.hasOwn(context, "auth"));
}

function statusCode(err) {
  return err?.status || 500;
}

function errorMessage(err) {
  return err?.message || String(err);
}

function createResourceApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "requireWorkspaceAccess",
    "sendJson",
    "compactText",
  ]);
  if (!deps.sharedDirectoryProjectionService || typeof deps.sharedDirectoryProjectionService.publicProjectsForWorkspace !== "function") {
    throw new Error("resource api routes require sharedDirectoryProjectionService.publicProjectsForWorkspace");
  }
  if (typeof deps.sharedDirectoryProjectionService.listPublicSharedDirectories !== "function") {
    throw new Error("resource api routes require sharedDirectoryProjectionService.listPublicSharedDirectories");
  }
  if (!deps.skillDetailProvider || typeof deps.skillDetailProvider.detail !== "function") {
    throw new Error("resource api routes require skillDetailProvider.detail");
  }

  const {
    requireWorkspaceAccess,
    sendJson,
    sharedDirectoryProjectionService,
    skillDetailProvider,
    compactText,
  } = deps;

  const registry = createApiRouteRegistry(RESOURCE_API_ROUTE_SPECS);

  function requestedWorkspaceId(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  async function handleProjects(req, res, url) {
    const workspaceId = requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    sendJson(res, 200, { data: await sharedDirectoryProjectionService.publicProjectsForWorkspace(workspaceId) });
  }

  async function handleSharedDirectories(req, res, url) {
    const workspaceId = requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    const directories = sharedDirectoryProjectionService.listPublicSharedDirectories(workspaceId);
    sendJson(res, 200, { ok: true, data: directories });
  }

  async function handleSkillDetail(res, url) {
    const skill = String(url?.searchParams?.get("skill") || "").trim();
    if (!skill) {
      sendJson(res, 400, { error: "Skill is required" });
      return;
    }
    try {
      const detail = await skillDetailProvider.detail(skill);
      sendJson(res, 200, { data: detail });
    } catch (err) {
      sendJson(res, statusCode(err), {
        error: compactText(errorMessage(err), 800),
        skill: err?.skill || skill,
      });
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "projects-list") await handleProjects(req, res, url);
    else if (route.id === "directories-shared-list") await handleSharedDirectories(req, res, url);
    else if (route.id === "skills-detail") await handleSkillDetail(res, url);
    else return { handled: false };

    return {
      handled: true,
      route,
      auth: hasInjectedAuth(context) ? context.auth : undefined,
    };
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
  RESOURCE_API_ROUTE_SPECS,
  createResourceApiRoutes,
};
