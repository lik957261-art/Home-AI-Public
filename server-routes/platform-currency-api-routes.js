"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const PLATFORM_CURRENCY_API_ROUTE_SPECS = Object.freeze([
  {
    id: "platform-currency-wallet",
    method: "GET",
    path: "/api/platform-currency/wallet",
    group: "platform-currency",
    moduleKey: "platform-currency",
    handlerKey: "wallet",
    summary: "Read the Tongbao wallet for a workspace user.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["platform-currency", "wallet"],
    tags: ["platform-currency", "tongbao", "wallet"],
  },
  {
    id: "platform-currency-ledger",
    method: "GET",
    path: "/api/platform-currency/ledger",
    group: "platform-currency",
    moduleKey: "platform-currency",
    handlerKey: "ledger",
    summary: "Read the summary-only Tongbao ledger for a workspace user.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["platform-currency", "ledger"],
    tags: ["platform-currency", "tongbao", "ledger"],
  },
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`platform currency api routes require ${name}`);
}

function requireService(deps) {
  const service = deps.platformCurrencyService;
  if (!service || typeof service.walletSummary !== "function" || typeof service.listLedger !== "function") {
    throw new Error("platform currency api routes require platformCurrencyService");
  }
  return service;
}

function requestedWorkspaceId(url) {
  return String(url?.searchParams?.get("workspaceId") || "owner").trim() || "owner";
}

function requestedLimit(url) {
  return url?.searchParams?.get("limit") || "";
}

function createPlatformCurrencyApiRoutes(deps = {}) {
  for (const name of ["requireWorkspaceAccess", "sendJson"]) ensureFunction(deps, name);
  const service = requireService(deps);
  const registry = createApiRouteRegistry(PLATFORM_CURRENCY_API_ROUTE_SPECS);

  async function handleWallet(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      wallet: service.walletSummary({ workspaceId }),
    });
  }

  async function handleLedger(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      workspaceId,
      ledger: service.listLedger({ workspaceId, limit: requestedLimit(url) }),
    });
  }

  async function handle(req, res, url) {
    const route = registry.match({ method: req.method, path: url.pathname });
    if (!route) return { handled: false };
    if (route.id === "platform-currency-wallet") await handleWallet(req, res, url);
    else if (route.id === "platform-currency-ledger") await handleLedger(req, res, url);
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
  PLATFORM_CURRENCY_API_ROUTE_SPECS,
  createPlatformCurrencyApiRoutes,
};
