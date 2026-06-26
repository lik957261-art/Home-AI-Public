"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const SYSTEM_API_ROUTE_SPECS = Object.freeze([
  {
    id: "client-version",
    method: "GET",
    path: "/api/client-version",
    group: "system",
    moduleKey: "system",
    handlerKey: "clientVersion",
    summary: "Report server/client version compatibility.",
    riskLevel: "public",
    authMode: "none",
    authRequired: false,
    tags: ["client-version", "status"],
  },
  {
    id: "status",
    method: "GET",
    path: "/api/status",
    group: "system",
    moduleKey: "system",
    handlerKey: "status",
    summary: "Report Hermes Mobile runtime status.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    tags: ["status", "runtime"],
  },
  {
    id: "app-update-status",
    method: "GET",
    path: "/api/app-update/status",
    group: "system",
    moduleKey: "app-update",
    handlerKey: "appUpdateStatus",
    summary: "Check whether a fast-forward app update is available.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    tags: ["app-update", "status"],
  },
  {
    id: "app-update-apply",
    method: "POST",
    path: "/api/app-update/apply",
    group: "system",
    moduleKey: "app-update",
    handlerKey: "applyAppUpdate",
    summary: "Apply an Owner-authorized fast-forward app update.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    tags: ["app-update", "maintenance"],
  },
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`system api routes require ${name}`);
}

function normalizeDisplayConfig(display = {}) {
  return {
    ownerLabel: display.ownerLabel || "",
    ownerDriveRootNames: Array.isArray(display.ownerDriveRootNames) ? display.ownerDriveRootNames : [],
    ownerRootFallbackLabel: display.ownerRootFallbackLabel || "",
  };
}

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function requestHeader(req, name) {
  return req?.headers?.[name.toLowerCase()] || req?.headers?.[name] || "";
}

function createSystemApiRoutes(deps = {}) {
  for (const name of [
    "authenticateRequest",
    "appUpdateStatus",
    "applyAppUpdate",
    "clientVersionInfo",
    "getHermesStatus",
    "isOwnerAuth",
    "publicConcurrencyForAuth",
    "publicGatewayPoolStatusForAuth",
    "publicOwnerElevationStatus",
    "publicPushStatus",
    "publicReasoningInfoForAuth",
    "requestClientVersion",
    "sendJson",
  ]) {
    ensureFunction(deps, name);
  }

  const compactText = typeof deps.compactText === "function" ? deps.compactText : defaultCompactText;
  const bootTrace = typeof deps.bootTrace === "function" ? deps.bootTrace : () => {};
  const displayConfig = normalizeDisplayConfig(deps.display || deps.displayConfig);
  const includeStatusCatalog = Boolean(deps.includeStatusCatalog);
  const loadCatalog = typeof deps.loadCatalog === "function" ? deps.loadCatalog : null;

  const registry = createApiRouteRegistry(SYSTEM_API_ROUTE_SPECS);

  function authenticate(req, res) {
    const auth = deps.authenticateRequest(req);
    if (!auth?.ok) {
      deps.sendJson(res, 401, { error: "Unauthorized" });
      return null;
    }
    return auth;
  }

  function requireOwner(auth, res) {
    if (deps.isOwnerAuth(auth)) return true;
    deps.sendJson(res, 403, { error: "Owner access is required" });
    return false;
  }

  async function handleClientVersion(req, res, auth = null) {
    const info = deps.clientVersionInfo(deps.requestClientVersion(req));
    if (!auth) {
      deps.sendJson(res, 200, info);
      return;
    }
    deps.sendJson(res, 200, Object.assign(
      info,
      { reasoning: deps.publicReasoningInfoForAuth(auth) },
    ));
  }

  async function handleAppUpdateStatus(res) {
    try {
      deps.sendJson(res, 200, await deps.appUpdateStatus());
    } catch (err) {
      deps.sendJson(res, 200, {
        ok: false,
        updateAvailable: false,
        warning: compactText(err.message || String(err), 800),
      });
    }
  }

  async function handleApplyAppUpdate(res) {
    try {
      const result = await deps.applyAppUpdate();
      deps.sendJson(res, result.ok ? 200 : 409, result);
    } catch (err) {
      deps.sendJson(res, 500, { ok: false, error: compactText(err.message || String(err), 800) });
    }
  }

  async function handleStatus(req, res, auth) {
    bootTrace("request api/status enter");
    const status = Object.assign({}, await deps.getHermesStatus());
    bootTrace("request api/status after getHermesStatus");
    status.gatewayPool = deps.publicGatewayPoolStatusForAuth(auth, status.gatewayPool);
    if (deps.isOwnerAuth(auth) && includeStatusCatalog && loadCatalog) status.catalog = loadCatalog().sources;
    bootTrace("request api/status after optional catalog");
    status.display = displayConfig;
    status.push = deps.publicPushStatus();
    bootTrace("request api/status after push status");
    status.reasoning = deps.publicReasoningInfoForAuth(auth);
    bootTrace("request api/status after reasoning");
    status.concurrency = deps.publicConcurrencyForAuth(auth);
    status.ownerElevation = deps.publicOwnerElevationStatus(auth);
    if (deps.isOwnerAuth(auth) && typeof deps.gatewayWorkerPolicyContract === "function") {
      status.gatewayWorkerPolicyContract = deps.gatewayWorkerPolicyContract();
    }
    status.clientVersion = deps.clientVersionInfo(requestHeader(req, "x-hermes-web-client-version"));
    bootTrace("request api/status before send");
    deps.sendJson(res, 200, status);
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "client-version") {
      const auth = deps.authenticateRequest(req);
      await handleClientVersion(req, res, auth?.ok ? auth : null);
      return { handled: true, route, auth: auth?.ok ? auth : null };
    }

    const auth = authenticate(req, res);
    if (!auth) return { handled: true, route };

    if (route.ownerOnly && !requireOwner(auth, res)) return { handled: true, route, auth };

    if (route.id === "app-update-status") await handleAppUpdateStatus(res);
    else if (route.id === "app-update-apply") await handleApplyAppUpdate(res);
    else if (route.id === "status") await handleStatus(req, res, auth);
    else return { handled: false };

    return { handled: true, route, auth };
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
  SYSTEM_API_ROUTE_SPECS,
  createSystemApiRoutes,
};
