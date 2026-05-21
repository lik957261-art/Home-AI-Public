"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const ACCESS_KEY_API_ROUTE_SPECS = Object.freeze([
  {
    id: "access-keys-list",
    method: "GET",
    path: "/api/access-keys",
    group: "access-key",
    moduleKey: "access-key",
    handlerKey: "listAccessKeys",
    summary: "List workspace Access Key statuses for Owner administration.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key"],
    tags: ["access-key", "owner", "list"],
  },
  {
    id: "access-keys-workspace-create",
    method: "POST",
    path: "/api/access-keys/workspace",
    group: "access-key",
    moduleKey: "access-key",
    handlerKey: "rotateWorkspaceAccessKey",
    summary: "Rotate a workspace Access Key.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["access-key", "workspace"],
    tags: ["access-key", "workspace", "rotate"],
  },
  {
    id: "access-keys-workspace-delete",
    method: "DELETE",
    pathRegex: /^\/api\/access-keys\/workspace\/[^/]+$/,
    group: "access-key",
    moduleKey: "access-key",
    handlerKey: "revokeWorkspaceAccessKey",
    summary: "Revoke a workspace Access Key.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    workspaceScoped: true,
    resourceTypes: ["access-key", "workspace"],
    tags: ["access-key", "workspace", "revoke"],
  },
  {
    id: "access-keys-web-create",
    method: "POST",
    path: "/api/access-keys/web",
    group: "access-key",
    moduleKey: "access-key",
    handlerKey: "rotateGlobalAccessKey",
    summary: "Rotate the Owner Hermes Mobile Access Key.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["access-key"],
    tags: ["access-key", "owner", "rotate"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`access key api routes require ${name}`);
  }
}

function errorMessage(err) {
  return err?.message || String(err);
}

function statusCode(err) {
  return err?.status || 500;
}

function hasInjectedAuth(context) {
  return Boolean(context && Object.hasOwn(context, "auth"));
}

function normalizeBody(body) {
  return body && typeof body === "object" ? body : {};
}

function decodeWorkspaceIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/api\/access-keys\/workspace\/([^/]+)$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] || "").trim();
  } catch (_) {
    return "";
  }
}

function createAccessKeyApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "requireOwner",
    "readBody",
    "sendJson",
    "isOwnerAuth",
    "ownerKeySource",
    "listWorkspaceAccessKeyStatuses",
    "rotateWorkspaceAccessKey",
    "revokeWorkspaceAccessKey",
    "rotateGlobalAccessKey",
    "boolParam",
  ]);

  const {
    requireOwner,
    readBody,
    sendJson,
    isOwnerAuth,
    ownerKeySource,
    listWorkspaceAccessKeyStatuses,
    rotateWorkspaceAccessKey,
    revokeWorkspaceAccessKey,
    rotateGlobalAccessKey,
    boolParam,
  } = deps;

  const registry = createApiRouteRegistry(ACCESS_KEY_API_ROUTE_SPECS);

  function ownerAuthForRoute(req, res, context) {
    if (hasInjectedAuth(context)) {
      const auth = context.auth;
      if (isOwnerAuth(auth)) return auth;
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    }
    return requireOwner(req, res);
  }

  async function readOptionalBody(req) {
    return normalizeBody(await readBody(req).catch(() => ({})));
  }

  function sendBusinessError(res, err) {
    sendJson(res, statusCode(err), { error: errorMessage(err) });
  }

  async function handle(req, res, url, context = {}) {
    const pathname = String(url?.pathname || req.url || "/").split("?")[0] || "/";
    const route = registry.match({
      method: req.method || "GET",
      path: pathname,
    });
    if (!route) return { handled: false };

    const accessAuth = ownerAuthForRoute(req, res, context);
    if (!accessAuth) return { handled: true, route };

    if (route.id === "access-keys-list") {
      const owner = isOwnerAuth(accessAuth);
      const source = owner ? ownerKeySource() : "workspace";
      sendJson(res, 200, {
        ok: true,
        auth: {
          isOwner: owner,
          workspaceId: accessAuth.workspaceId || "",
          source,
          canRotateGlobal: owner && source !== "env",
        },
        data: listWorkspaceAccessKeyStatuses(accessAuth, { workspaceId: url?.searchParams?.get("workspaceId") || "" }),
      });
      return { handled: true, route, auth: accessAuth };
    }

    if (route.id === "access-keys-workspace-create") {
      const body = await readOptionalBody(req);
      const requestedWorkspaceId = String(body.workspaceId || body.workspace_id || "").trim();
      if (!requestedWorkspaceId) {
        sendJson(res, 400, { error: "workspaceId is required" });
        return { handled: true, route, auth: accessAuth };
      }
      try {
        const result = rotateWorkspaceAccessKey(requestedWorkspaceId, {
          dryRun: boolParam(body.dryRun || body.dry_run),
          actor: accessAuth.principalId || accessAuth.workspaceId || "owner",
        });
        sendJson(res, result.dryRun ? 200 : 201, {
          ok: true,
          key: result.key,
          workspace: result.record,
          dryRun: result.dryRun,
          requiresReLogin: false,
        });
      } catch (err) {
        sendBusinessError(res, err);
      }
      return { handled: true, route, auth: accessAuth };
    }

    if (route.id === "access-keys-workspace-delete") {
      const requestedWorkspaceId = decodeWorkspaceIdFromPath(pathname);
      if (!requestedWorkspaceId) {
        sendJson(res, 400, { error: "workspaceId is required" });
        return { handled: true, route, auth: accessAuth };
      }
      const body = await readOptionalBody(req);
      try {
        const result = revokeWorkspaceAccessKey(requestedWorkspaceId, {
          dryRun: boolParam(body.dryRun || body.dry_run),
        });
        sendJson(res, 200, { ok: true, result, requiresReLogin: false });
      } catch (err) {
        sendBusinessError(res, err);
      }
      return { handled: true, route, auth: accessAuth };
    }

    if (route.id === "access-keys-web-create") {
      const body = await readOptionalBody(req);
      try {
        const result = rotateGlobalAccessKey({ dryRun: boolParam(body.dryRun || body.dry_run) });
        sendJson(res, result.dryRun ? 200 : 201, {
          ok: true,
          key: result.key,
          auth: result.auth,
          dryRun: result.dryRun,
          requiresReLogin: !result.dryRun,
        });
      } catch (err) {
        sendBusinessError(res, err);
      }
      return { handled: true, route, auth: accessAuth };
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
  ACCESS_KEY_API_ROUTE_SPECS,
  createAccessKeyApiRoutes,
};
