"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const FAMILY_PROFILE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "family-profile-self",
    method: "GET",
    path: "/api/family-profile/self",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "self",
    summary: "Read the projected profile for one workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["family-profile"],
    tags: ["family-profile", "self"],
  },
  {
    id: "family-profile-household",
    method: "GET",
    path: "/api/family-profile/household",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "household",
    summary: "Read the household profile projection allowed for the caller.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: false,
    resourceTypes: ["family-profile"],
    tags: ["family-profile", "household"],
  },
  {
    id: "family-profile-record-list",
    method: "GET",
    path: "/api/family-profile/records",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "listRecords",
    summary: "List profile records projected for the caller.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["family-profile", "profile-record"],
    tags: ["family-profile", "records"],
  },
  {
    id: "family-profile-record-create",
    method: "POST",
    path: "/api/family-profile/records",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "createRecord",
    summary: "Create or update a profile record.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["family-profile", "profile-record"],
    tags: ["family-profile", "records", "create"],
  },
  {
    id: "family-profile-insight-list",
    method: "GET",
    path: "/api/family-profile/insights",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "listInsights",
    summary: "List profile insights projected for the caller.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["family-profile", "profile-insight"],
    tags: ["family-profile", "insights"],
  },
  {
    id: "family-profile-insight-create",
    method: "POST",
    path: "/api/family-profile/insights",
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "createInsight",
    summary: "Create or update an Owner-reviewed family profile insight.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: false,
    resourceTypes: ["family-profile", "profile-insight"],
    tags: ["family-profile", "insights", "owner"],
  },
  {
    id: "family-profile-insight-share",
    method: "POST",
    pathRegex: /^\/api\/family-profile\/insights\/[^/]+\/share$/,
    group: "family-profile",
    moduleKey: "family-profile",
    handlerKey: "shareInsight",
    summary: "Share a bounded family profile insight with members.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    workspaceScoped: false,
    resourceTypes: ["family-profile", "profile-insight"],
    tags: ["family-profile", "insights", "share", "owner"],
  },
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`family profile api routes require ${name}`);
}

function requestedWorkspaceId(url) {
  return String(url?.searchParams?.get("workspaceId") || "owner").trim() || "owner";
}

function requestedLimit(url) {
  return Number(url?.searchParams?.get("limit") || 50);
}

function insightIdFromSharePath(pathname) {
  const match = String(pathname || "").match(/^\/api\/family-profile\/insights\/([^/]+)\/share$/);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function isOwnerAuth(deps, auth) {
  if (typeof deps.isOwnerAuth === "function") return Boolean(deps.isOwnerAuth(auth));
  return Boolean(auth?.owner || auth?.isOwner || auth?.role === "owner");
}

function requireOwnerAccess(deps, req, res, auth) {
  if (isOwnerAuth(deps, auth)) return true;
  if (typeof deps.requireOwner === "function") {
    const result = deps.requireOwner(req, res);
    return Boolean(result);
  }
  deps.sendJson(res, 403, { ok: false, error: "owner_required" });
  return false;
}

function createFamilyProfileApiRoutes(deps = {}) {
  for (const name of ["readBody", "requireWorkspaceAccess", "sendJson"]) ensureFunction(deps, name);
  if (!deps.familyProfileService || typeof deps.familyProfileService.upsertProfileRecord !== "function") {
    throw new Error("family profile api routes require familyProfileService");
  }
  if (!deps.familyProfileProjectionService || typeof deps.familyProfileProjectionService.projectSelf !== "function") {
    throw new Error("family profile api routes require familyProfileProjectionService");
  }
  if (!deps.familyProfileInsightService || typeof deps.familyProfileInsightService.upsertInsight !== "function") {
    throw new Error("family profile api routes require familyProfileInsightService");
  }

  const registry = createApiRouteRegistry(FAMILY_PROFILE_API_ROUTE_SPECS);

  async function handleSelf(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      profile: deps.familyProfileProjectionService.projectSelf({
        auth: context.auth,
        workspaceId,
        limit: requestedLimit(url),
      }),
    });
  }

  async function handleHousehold(req, res, url, context = {}) {
    const workspaceId = requestedWorkspaceId(url);
    if (!isOwnerAuth(deps, context.auth)) {
      const allowedWorkspaceId = deps.requireWorkspaceAccess(req, res, workspaceId);
      if (!allowedWorkspaceId) return;
    }
    deps.sendJson(res, 200, {
      ok: true,
      profile: deps.familyProfileProjectionService.projectHousehold({
        auth: context.auth,
        workspaceId,
        limit: requestedLimit(url),
      }),
    });
  }

  async function handleListRecords(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      records: deps.familyProfileProjectionService.projectRecords({
        auth: context.auth,
        workspaceId,
        filters: {
          domain: url.searchParams.get("domain") || "",
          status: url.searchParams.get("status") || "active",
          limit: requestedLimit(url),
        },
      }),
    });
  }

  async function handleCreateRecord(req, res, context = {}) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const subjectWorkspaceId = String(body.subjectWorkspaceId || workspaceId).trim() || workspaceId;
    const sourceWorkspaceId = String(body.sourceWorkspaceId || workspaceId).trim() || workspaceId;
    if ((subjectWorkspaceId !== workspaceId || sourceWorkspaceId !== workspaceId) && !requireOwnerAccess(deps, req, res, context.auth)) {
      return;
    }
    const record = deps.familyProfileService.upsertProfileRecord(Object.assign({}, body, {
      workspaceId,
      subjectWorkspaceId,
      sourceWorkspaceId,
    }));
    if (Array.isArray(body.evidenceRefs)) {
      for (const evidence of body.evidenceRefs) {
        deps.familyProfileService.addEvidenceRef(Object.assign({}, evidence, { recordId: record.recordId }));
      }
    }
    deps.sendJson(res, 201, { ok: true, record });
  }

  async function handleListInsights(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      insights: deps.familyProfileProjectionService.projectInsights({
        auth: context.auth,
        workspaceId,
        filters: {
          status: url.searchParams.get("status") || "active",
          limit: requestedLimit(url),
        },
      }),
    });
  }

  async function handleCreateInsight(req, res, context = {}) {
    if (!requireOwnerAccess(deps, req, res, context.auth)) return;
    const body = await deps.readBody(req).catch(() => ({}));
    const insight = deps.familyProfileInsightService.upsertInsight(body);
    deps.sendJson(res, 201, { ok: true, insight });
  }

  async function handleShareInsight(req, res, url, context = {}) {
    if (!requireOwnerAccess(deps, req, res, context.auth)) return;
    const body = await deps.readBody(req).catch(() => ({}));
    const insightId = insightIdFromSharePath(url.pathname);
    const insight = deps.familyProfileInsightService.shareInsight({
      insightId,
      visibility: body.visibility || "household_summary",
      metadata: body.metadata,
    });
    deps.sendJson(res, 200, { ok: true, insight });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({ method: req.method, path: url.pathname });
    if (!route) return { handled: false };
    if (route.id === "family-profile-self") await handleSelf(req, res, url, context);
    else if (route.id === "family-profile-household") await handleHousehold(req, res, url, context);
    else if (route.id === "family-profile-record-list") await handleListRecords(req, res, url, context);
    else if (route.id === "family-profile-record-create") await handleCreateRecord(req, res, context);
    else if (route.id === "family-profile-insight-list") await handleListInsights(req, res, url, context);
    else if (route.id === "family-profile-insight-create") await handleCreateInsight(req, res, context);
    else if (route.id === "family-profile-insight-share") await handleShareInsight(req, res, url, context);
    return { handled: true, route };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    summary(options) {
      return registry.summary(options);
    },
    match(request) {
      return registry.match(request);
    },
  };
}

module.exports = {
  FAMILY_PROFILE_API_ROUTE_SPECS,
  createFamilyProfileApiRoutes,
};
