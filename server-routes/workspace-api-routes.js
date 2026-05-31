"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const WORKSPACE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "workspaces-list",
    method: "GET",
    path: "/api/workspaces",
    group: "workspace-admin",
    moduleKey: "workspace-admin",
    handlerKey: "listWorkspaces",
    summary: "List workspaces visible to the authenticated actor.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["workspace"],
    tags: ["workspace", "list"],
  },
  {
    id: "workspaces-defaults",
    method: "GET",
    path: "/api/workspaces/defaults",
    group: "workspace-admin",
    moduleKey: "workspace-admin",
    handlerKey: "workspaceDefaults",
    summary: "Preview Owner-only defaults for a local workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace"],
    tags: ["workspace", "defaults"],
  },
  {
    id: "workspaces-create",
    method: "POST",
    path: "/api/workspaces",
    group: "workspace-admin",
    moduleKey: "workspace-admin",
    handlerKey: "createWorkspace",
    summary: "Create or upsert an Owner-managed local workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace"],
    tags: ["workspace", "create"],
  },
  {
    id: "workspaces-update",
    method: "PATCH",
    pathRegex: /^\/api\/workspaces\/([^/]+)$/,
    group: "workspace-admin",
    moduleKey: "workspace-admin",
    handlerKey: "updateWorkspace",
    summary: "Update an Owner-managed local workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace"],
    tags: ["workspace", "update"],
  },
  {
    id: "workspaces-delete",
    method: "DELETE",
    pathRegex: /^\/api\/workspaces\/([^/]+)$/,
    group: "workspace-admin",
    moduleKey: "workspace-admin",
    handlerKey: "deleteWorkspace",
    summary: "Delete an Owner-managed local workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["workspace"],
    tags: ["workspace", "delete"],
  },
]);

const WORKSPACE_ADMIN_DEPENDENCIES = Object.freeze([
  "readBody",
  "upsertLocalWorkspace",
  "deleteLocalWorkspace",
  "findWorkspace",
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`workspace api routes require ${name}`);
}

function hasInjectedAuth(context) {
  return Boolean(context && Object.hasOwn(context, "auth"));
}

function errorMessage(err) {
  return err?.message || String(err);
}

function statusCode(err) {
  return err?.status || 500;
}

function validateOptionalWorkspaceAdminDeps(deps) {
  const hasAnyAdminDep = WORKSPACE_ADMIN_DEPENDENCIES.some((name) => Object.hasOwn(deps, name));
  if (hasAnyAdminDep) {
    for (const name of WORKSPACE_ADMIN_DEPENDENCIES) ensureFunction(deps, name);
    return true;
  }
  return false;
}

function createWorkspaceApiRoutes(deps = {}) {
  for (const name of [
    "bootTrace",
    "loadCatalog",
    "publicWorkspacesForAuth",
    "publicWorkspace",
    "isOwnerAuth",
    "requireOwner",
    "localWorkspaceDefaults",
    "sendJson",
  ]) {
    ensureFunction(deps, name);
  }
  const workspaceAdminEnabled = validateOptionalWorkspaceAdminDeps(deps);

  const registry = createApiRouteRegistry(WORKSPACE_API_ROUTE_SPECS);

  function ownerAuthForRoute(req, res, context) {
    if (hasInjectedAuth(context)) {
      const auth = context.auth;
      if (deps.isOwnerAuth(auth)) return auth;
      deps.sendJson(res, 403, { error: "Owner access is required" });
      return null;
    }
    return deps.requireOwner(req, res);
  }

  async function handleWorkspacesList(res, auth) {
    deps.bootTrace("request api/workspaces enter");
    const catalog = deps.loadCatalog();
    deps.bootTrace("request api/workspaces after loadCatalog");
    const workspaceIds = Array.isArray(auth?.workspaceIds) && auth.workspaceIds.length
      ? auth.workspaceIds
      : (Array.isArray(auth?.workspaces) && auth.workspaces.length
        ? auth.workspaces
        : (auth?.workspaceId ? [auth.workspaceId] : []));
    const platformCurrencyService = deps.platformCurrencyService || null;
    deps.sendJson(res, 200, {
      data: deps.publicWorkspacesForAuth(auth).map((workspace) => {
        const publicWorkspace = deps.publicWorkspace(workspace);
        if (platformCurrencyService && typeof platformCurrencyService.walletSummary === "function") {
          publicWorkspace.tongbaoWallet = platformCurrencyService.walletSummary({ workspaceId: publicWorkspace.id });
        }
        return publicWorkspace;
      }),
      sources: catalog.sources,
      auth: {
        role: auth?.role,
        workspaceId: auth?.workspaceId,
        workspaceIds,
        isOwner: deps.isOwnerAuth(auth),
      },
    });
    deps.bootTrace("request api/workspaces sent");
  }

  async function handleWorkspaceDefaults(req, res, url, context) {
    const ownerAuth = ownerAuthForRoute(req, res, context);
    if (!ownerAuth) return;
    try {
      const defaults = deps.localWorkspaceDefaults({
        username: url.searchParams.get("username") || "",
        workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("id") || "",
        label: url.searchParams.get("label") || "",
      });
      deps.sendJson(res, 200, { ok: true, defaults });
    } catch (err) {
      deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
    }
  }

  async function readJsonBody(req, res) {
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body?.__error) {
      deps.sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return { ok: false, body: null };
    }
    return { ok: true, body };
  }

  function decodeWorkspaceId(path) {
    const match = String(path || "").match(/^\/api\/workspaces\/([^/]+)$/);
    return decodeURIComponent(match?.[1] || "");
  }

  async function handleWorkspaceCreate(req, res, route, ownerAuth) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return { handled: true, route, auth: ownerAuth };
    try {
      const record = deps.upsertLocalWorkspace(bodyResult.body, ownerAuth.principalId || "owner");
      const workspace = deps.findWorkspace(record.id);
      deps.sendJson(res, 201, { ok: true, workspace: deps.publicWorkspace(workspace), record });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
    return { handled: true, route, auth: ownerAuth };
  }

  async function handleWorkspaceUpdate(req, res, path, route, ownerAuth) {
    let workspaceId = "";
    try {
      workspaceId = decodeWorkspaceId(path);
    } catch (err) {
      deps.sendJson(res, 400, { error: errorMessage(err) });
      return { handled: true, route, auth: ownerAuth };
    }
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return { handled: true, route, auth: ownerAuth };
    try {
      const record = deps.upsertLocalWorkspace(Object.assign({}, bodyResult.body, { workspaceId }), ownerAuth.principalId || "owner");
      const workspace = deps.findWorkspace(record.id);
      deps.sendJson(res, 200, { ok: true, workspace: deps.publicWorkspace(workspace), record });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
    return { handled: true, route, auth: ownerAuth };
  }

  async function handleWorkspaceDelete(res, path, route, ownerAuth) {
    let workspaceId = "";
    try {
      workspaceId = decodeWorkspaceId(path);
    } catch (err) {
      deps.sendJson(res, 400, { error: errorMessage(err) });
      return { handled: true, route, auth: ownerAuth };
    }
    try {
      const deleted = deps.deleteLocalWorkspace(workspaceId);
      deps.sendJson(res, 200, { ok: true, deleted });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
    return { handled: true, route, auth: ownerAuth };
  }

  async function handle(req, res, url, context = {}) {
    const path = url?.pathname || req.url || "/";
    const route = registry.match({
      method: req.method || "GET",
      path,
    });
    if (!route) return { handled: false };

    if (route.id === "workspaces-list") {
      await handleWorkspacesList(res, hasInjectedAuth(context) ? context.auth : undefined);
      return { handled: true, route, auth: hasInjectedAuth(context) ? context.auth : undefined };
    }

    if (route.id === "workspaces-defaults") {
      await handleWorkspaceDefaults(req, res, url, context);
      return { handled: true, route, auth: hasInjectedAuth(context) ? context.auth : undefined };
    }

    if (route.id === "workspaces-create" || route.id === "workspaces-update" || route.id === "workspaces-delete") {
      if (!workspaceAdminEnabled) return { handled: false };
      const ownerAuth = ownerAuthForRoute(req, res, context);
      if (!ownerAuth) return { handled: true, route, auth: hasInjectedAuth(context) ? context.auth : undefined };
      if (route.id === "workspaces-create") return handleWorkspaceCreate(req, res, route, ownerAuth);
      if (route.id === "workspaces-update") return handleWorkspaceUpdate(req, res, path, route, ownerAuth);
      if (route.id === "workspaces-delete") return handleWorkspaceDelete(res, path, route, ownerAuth);
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
  WORKSPACE_API_ROUTE_SPECS,
  createWorkspaceApiRoutes,
};
