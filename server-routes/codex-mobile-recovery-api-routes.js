"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const ROUTE_SPECS = Object.freeze([
  {
    id: "codex-mobile-recovery-status",
    method: "GET",
    path: "/api/codex-mobile/recovery/status",
    group: "codex-mobile-recovery",
    moduleKey: "plugins",
    handlerKey: "status",
    summary: "Check whether Codex Mobile macOS host recovery is applicable.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "codex-mobile", "recovery"],
    tags: ["plugin", "codex-mobile", "recovery", "status"],
  },
  {
    id: "codex-mobile-recovery-homes",
    method: "GET",
    path: "/api/codex-mobile/recovery/homes",
    group: "codex-mobile-recovery",
    moduleKey: "plugins",
    handlerKey: "homes",
    summary: "List configured Codex Home profiles available to the host recovery script.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "codex-mobile", "recovery"],
    tags: ["plugin", "codex-mobile", "recovery", "profiles"],
  },
  {
    id: "codex-mobile-recovery-plan",
    method: "POST",
    path: "/api/codex-mobile/recovery/plan",
    group: "codex-mobile-recovery",
    moduleKey: "plugins",
    handlerKey: "plan",
    summary: "Dry-run a selected Codex Mobile host recovery profile.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "codex-mobile", "recovery"],
    tags: ["plugin", "codex-mobile", "recovery", "plan"],
  },
  {
    id: "codex-mobile-recovery-restore",
    method: "POST",
    path: "/api/codex-mobile/recovery/restore",
    group: "codex-mobile-recovery",
    moduleKey: "plugins",
    handlerKey: "restore",
    summary: "Run the Codex Mobile macOS host recovery script after a recoverable listener failure.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "codex-mobile", "recovery"],
    tags: ["plugin", "codex-mobile", "recovery", "restore"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`codex mobile recovery api routes require ${name}`);
  }
}

function compactError(err) {
  return String(err?.message || err || "Codex Mobile recovery failed").replace(/\s+/g, " ").slice(0, 800);
}

function publicError(err) {
  const out = {
    ok: false,
    error: compactError(err),
    code: err?.code || "codex_mobile_recovery_failed",
  };
  if (err?.current) out.current = err.current;
  if (err?.result) out.result = err.result;
  if (err?.stdout) out.stdout = String(err.stdout).slice(0, 600);
  return out;
}

function createCodexMobileRecoveryApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "sendJson"]);
  if (!deps.codexMobileRecoveryService
    || typeof deps.codexMobileRecoveryService.status !== "function"
    || typeof deps.codexMobileRecoveryService.listHomes !== "function"
    || typeof deps.codexMobileRecoveryService.plan !== "function"
    || typeof deps.codexMobileRecoveryService.restore !== "function") {
    throw new Error("codex mobile recovery api routes require codexMobileRecoveryService");
  }

  const registry = createApiRouteRegistry(ROUTE_SPECS);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const ownerAuth = deps.requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    try {
      if (route.id === "codex-mobile-recovery-status") {
        deps.sendJson(res, 200, await deps.codexMobileRecoveryService.status());
        return { handled: true, route };
      }
      if (route.id === "codex-mobile-recovery-homes") {
        deps.sendJson(res, 200, await deps.codexMobileRecoveryService.listHomes());
        return { handled: true, route };
      }
      const body = await deps.readBody(req).catch((err) => ({ __error: err }));
      if (body.__error) {
        deps.sendJson(res, 400, { ok: false, error: body.__error.message || "Invalid request body" });
        return { handled: true, route };
      }
      if (route.id === "codex-mobile-recovery-plan") {
        deps.sendJson(res, 200, await deps.codexMobileRecoveryService.plan(body));
        return { handled: true, route };
      }
      if (route.id === "codex-mobile-recovery-restore") {
        deps.sendJson(res, 202, await deps.codexMobileRecoveryService.restore(body));
        return { handled: true, route };
      }
    } catch (err) {
      deps.sendJson(res, err.status || 500, publicError(err));
      return { handled: true, route };
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
  ROUTE_SPECS,
  createCodexMobileRecoveryApiRoutes,
};
