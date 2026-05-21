"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const OWNER_ELEVATION_API_ROUTE_SPECS = Object.freeze([
  {
    id: "owner-elevation-status",
    method: "GET",
    path: "/api/owner-elevation",
    group: "owner-elevation",
    moduleKey: "owner-elevation",
    handlerKey: "status",
    summary: "Report the current Owner elevation status.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
    tags: ["owner", "elevation", "status"],
  },
  {
    id: "owner-elevation-once",
    method: "POST",
    path: "/api/owner-elevation/once",
    group: "owner-elevation",
    moduleKey: "owner-elevation",
    handlerKey: "grantOnce",
    summary: "Grant a short-lived one-shot Owner elevation token.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
    tags: ["owner", "elevation", "grant"],
  },
  {
    id: "owner-elevation-grant",
    method: "POST",
    path: "/api/owner-elevation",
    group: "owner-elevation",
    moduleKey: "owner-elevation",
    handlerKey: "grantTimed",
    summary: "Grant time-limited Owner elevation.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
    tags: ["owner", "elevation", "grant"],
  },
  {
    id: "owner-elevation-revoke",
    method: "DELETE",
    path: "/api/owner-elevation",
    group: "owner-elevation",
    moduleKey: "owner-elevation",
    handlerKey: "revoke",
    summary: "Revoke active time-limited Owner elevation.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["owner-elevation"],
    tags: ["owner", "elevation", "revoke"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`owner elevation api routes require ${name}`);
  }
}

function errorMessage(err) {
  return err?.message || String(err);
}

function statusCode(err) {
  return err?.status || 500;
}

function ownerElevationErrorBody(err, ownerAuth, publicOwnerElevationStatus) {
  return {
    error: errorMessage(err),
    ownerElevation: publicOwnerElevationStatus(ownerAuth),
  };
}

function createOwnerElevationApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "requireOwner",
    "readBody",
    "sendJson",
    "publicOwnerElevationStatus",
    "grantOwnerElevationOnce",
    "grantOwnerElevation",
    "revokeOwnerElevation",
  ]);

  const {
    requireOwner,
    readBody,
    sendJson,
    publicOwnerElevationStatus,
    grantOwnerElevationOnce,
    grantOwnerElevation,
    revokeOwnerElevation,
  } = deps;

  const registry = createApiRouteRegistry(OWNER_ELEVATION_API_ROUTE_SPECS);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    if (route.id === "owner-elevation-status") {
      sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
      return { handled: true, route, auth: ownerAuth };
    }

    if (route.id === "owner-elevation-once") {
      try {
        const grant = grantOwnerElevationOnce(ownerAuth);
        sendJson(res, 200, {
          ok: true,
          ownerElevationOnce: {
            token: grant.token,
            expiresAt: grant.expiresAt,
            grantedAt: grant.grantedAt,
          },
          ownerElevation: publicOwnerElevationStatus(ownerAuth),
        });
      } catch (err) {
        sendJson(res, statusCode(err), ownerElevationErrorBody(err, ownerAuth, publicOwnerElevationStatus));
      }
      return { handled: true, route, auth: ownerAuth };
    }

    if (route.id === "owner-elevation-grant") {
      const body = await readBody(req).catch((err) => ({ __error: err }));
      if (body?.__error) {
        sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
        return { handled: true, route, auth: ownerAuth };
      }
      const requestBody = body && typeof body === "object" ? body : {};
      try {
        grantOwnerElevation(ownerAuth, requestBody.durationMinutes || requestBody.duration_minutes);
        sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
      } catch (err) {
        sendJson(res, statusCode(err), ownerElevationErrorBody(err, ownerAuth, publicOwnerElevationStatus));
      }
      return { handled: true, route, auth: ownerAuth };
    }

    if (route.id === "owner-elevation-revoke") {
      try {
        revokeOwnerElevation(ownerAuth);
        sendJson(res, 200, { ok: true, ownerElevation: publicOwnerElevationStatus(ownerAuth) });
      } catch (err) {
        sendJson(res, statusCode(err), ownerElevationErrorBody(err, ownerAuth, publicOwnerElevationStatus));
      }
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
  OWNER_ELEVATION_API_ROUTE_SPECS,
  createOwnerElevationApiRoutes,
};
