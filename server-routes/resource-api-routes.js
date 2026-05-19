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
  {
    id: "skills-analysis",
    method: "GET",
    path: "/api/skills/analysis",
    group: "skill",
    moduleKey: "resource",
    handlerKey: "skillAnalysis",
    summary: "Analyze public function and invocation conditions for a skill.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["skill"],
    tags: ["skill", "analysis"],
  },
  {
    id: "skills-analysis-fix",
    method: "POST",
    path: "/api/skills/analysis/fix",
    group: "skill",
    moduleKey: "resource",
    handlerKey: "skillAnalysisFix",
    summary: "Apply an Owner-approved deterministic fix to a local skill.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["skill"],
    tags: ["skill", "analysis", "fix"],
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
    "requireOwner",
    "readBody",
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
  if (typeof deps.skillDetailProvider.analyze !== "function") {
    throw new Error("resource api routes require skillDetailProvider.analyze");
  }
  if (typeof deps.skillDetailProvider.applyFix !== "function") {
    throw new Error("resource api routes require skillDetailProvider.applyFix");
  }

  const {
    readBody,
    requireOwner,
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

  async function handleSkillAnalysis(res, url) {
    const skill = String(url?.searchParams?.get("skill") || "").trim();
    if (!skill) {
      sendJson(res, 400, { error: "Skill is required" });
      return;
    }
    try {
      const analysis = await skillDetailProvider.analyze(skill);
      sendJson(res, 200, { data: analysis });
    } catch (err) {
      sendJson(res, statusCode(err), {
        error: compactText(errorMessage(err), 800),
        skill: err?.skill || skill,
      });
    }
  }

  async function handleSkillAnalysisFix(req, res) {
    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return;
    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      sendJson(res, 400, { error: compactText(errorMessage(err), 800) });
      return;
    }
    const skill = String(body?.skill || "").trim();
    const fixId = String(body?.fixId || body?.fix_id || "").trim();
    if (!skill || !fixId) {
      sendJson(res, 400, { error: "Skill and fixId are required" });
      return;
    }
    try {
      const result = await skillDetailProvider.applyFix(skill, fixId);
      sendJson(res, 200, { data: result });
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
    else if (route.id === "skills-analysis") await handleSkillAnalysis(res, url);
    else if (route.id === "skills-analysis-fix") await handleSkillAnalysisFix(req, res);
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
