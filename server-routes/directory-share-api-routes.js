"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const DIRECTORY_SHARE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "directories-share-create",
    method: "POST",
    path: "/api/directories/share",
    group: "directory-share",
    moduleKey: "directory-share",
    handlerKey: "shareDirectory",
    summary: "Share a first-level directory with selected workspaces.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "share"],
    tags: ["directory", "share", "create"],
  },
  {
    id: "directories-share-delete",
    method: "POST",
    path: "/api/directories/unshare",
    group: "directory-share",
    moduleKey: "directory-share",
    handlerKey: "unshareDirectory",
    summary: "Remove a shared-directory record for a workspace.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "share"],
    tags: ["directory", "share", "delete"],
  },
  {
    id: "directories-share-update",
    method: "POST",
    path: "/api/directories/share/update",
    group: "directory-share",
    moduleKey: "directory-share",
    handlerKey: "updateDirectoryShare",
    summary: "Update shared-directory access for a workspace.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "share"],
    tags: ["directory", "share", "update"],
  },
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`directory share api routes require ${name}`);
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

function createDirectoryShareApiRoutes(deps = {}) {
  for (const name of [
    "readBody",
    "sendJson",
    "findDirectoryThreadForRequest",
    "resolveBrowserPathAsync",
    "directoryRequestParams",
    "statSync",
    "basename",
    "nowIso",
    "workspacePrincipal",
    "invalidateCatalogCache",
    "clearDynamicProjectCache",
    "requireWorkspaceAccess",
  ]) {
    ensureFunction(deps, name);
  }
  if (!deps.sharedDirectoryProjectionService) {
    throw new Error("directory share api routes require sharedDirectoryProjectionService");
  }
  for (const name of [
    "normalizeSharePermission",
    "normalizeShareScope",
    "normalizeShareTargets",
    "publicSharedDirectory",
    "removeSharedDirectoryRecord",
    "shareableRootProjectForPath",
    "sharedDirectoryLabel",
    "updateSharedDirectoryAccess",
    "upsertSharedDirectory",
  ]) {
    if (typeof deps.sharedDirectoryProjectionService[name] !== "function") {
      throw new Error(`directory share api routes require sharedDirectoryProjectionService.${name}`);
    }
  }

  const registry = createApiRouteRegistry(DIRECTORY_SHARE_API_ROUTE_SPECS);
  const projection = deps.sharedDirectoryProjectionService;

  async function readJsonBody(req, res) {
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body?.__error) {
      deps.sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return { ok: false, body: null };
    }
    return { ok: true, body };
  }

  function clearDirectoryCatalogCaches() {
    deps.invalidateCatalogCache();
    deps.clearDynamicProjectCache();
  }

  async function handleShare(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const body = bodyResult.body || {};

    const thread = deps.findDirectoryThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return handledResult(route, context);
    }

    const resolved = await deps.resolveBrowserPathAsync(thread, deps.directoryRequestParams(body));
    if (!resolved) {
      deps.sendJson(res, 404, { error: "Directory not found or not allowed" });
      return handledResult(route, context);
    }

    const rootProject = await projection.shareableRootProjectForPath(thread.workspaceId, resolved.displayPath);
    if (!rootProject) {
      deps.sendJson(res, 400, { error: "Only first-level directories on the directory root page can be shared" });
      return handledResult(route, context);
    }

    let label = String(body.name || resolved.label || projection.sharedDirectoryLabel(resolved.displayPath)).trim();
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        deps.sendJson(res, 400, { error: "Only directories can be shared" });
        return handledResult(route, context);
      }
      label = String(rootProject.label || resolved.remoteEntry?.name || label || projection.sharedDirectoryLabel(resolved.displayPath)).trim();
    } else {
      let stat;
      try {
        stat = deps.statSync(resolved.localPath);
      } catch (_) {
        deps.sendJson(res, 404, { error: "Directory not found" });
        return handledResult(route, context);
      }
      if (!stat.isDirectory()) {
        deps.sendJson(res, 400, { error: "Only directories can be shared" });
        return handledResult(route, context);
      }
      label = String(rootProject.label || deps.basename(resolved.localPath) || label || projection.sharedDirectoryLabel(resolved.displayPath)).trim();
    }

    const targets = projection.normalizeShareTargets(body);
    const record = projection.upsertSharedDirectory({
      path: resolved.displayPath,
      label,
      createdAt: deps.nowIso(),
      createdBy: thread.workspaceId,
      createdByPrincipalId: deps.workspacePrincipal(thread.workspaceId),
      permission: projection.normalizeSharePermission(body.permission),
      scope: projection.normalizeShareScope(body.scope, targets),
      targetWorkspaceIds: targets,
    });
    clearDirectoryCatalogCaches();
    deps.sendJson(res, 200, {
      ok: true,
      shared: Object.assign({}, projection.publicSharedDirectory(record, thread.workspaceId), {
        displayPath: resolved.workspacePath,
        workspacePath: resolved.workspacePath,
        source: "hermes-web-shared-directory",
      }),
    });
    return handledResult(route, context);
  }

  async function handleUnshare(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const body = bodyResult.body || {};
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return handledResult(route, context);
    try {
      const record = projection.removeSharedDirectoryRecord(body.id || body.path, workspaceId);
      clearDirectoryCatalogCaches();
      deps.sendJson(res, 200, { ok: true, removed: projection.publicSharedDirectory(record, workspaceId) });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
    return handledResult(route, context);
  }

  async function handleUpdate(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const body = bodyResult.body || {};
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return handledResult(route, context);
    try {
      const record = projection.updateSharedDirectoryAccess(body.id || body.path, workspaceId, body);
      clearDirectoryCatalogCaches();
      deps.sendJson(res, 200, { ok: true, shared: projection.publicSharedDirectory(record, workspaceId) });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
    return handledResult(route, context);
  }

  function handledResult(route, context) {
    return {
      handled: true,
      route,
      auth: hasInjectedAuth(context) ? context.auth : undefined,
    };
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "directories-share-create") return handleShare(req, res, route, context);
    if (route.id === "directories-share-delete") return handleUnshare(req, res, route, context);
    if (route.id === "directories-share-update") return handleUpdate(req, res, route, context);
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
  DIRECTORY_SHARE_API_ROUTE_SPECS,
  createDirectoryShareApiRoutes,
};
