"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const OWNER_SYSTEM_CONSOLE_ROUTE_SPECS = Object.freeze([
  Object.freeze({
    id: "owner-system-console-overview",
    method: "GET",
    path: "/api/owner/system-console",
    group: "owner-system-console",
    moduleKey: "owner-system-console",
    handlerKey: "overview",
    summary: "Read Owner-only Home AI system console overview, including bounded Autonomous Delivery loop status.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["system-status", "diagnostic", "autonomous-delivery", "loop-engineering"],
    tags: ["owner", "system-console", "autonomous-delivery", "loop-engineering", "read-only"],
  }),
  Object.freeze({
    id: "owner-system-console-system-status",
    method: "GET",
    path: "/api/owner/system-console/system-status",
    group: "owner-system-console",
    moduleKey: "owner-system-console",
    handlerKey: "systemStatus",
    summary: "Read Owner-only bounded host and runtime resource status.",
    riskLevel: "owner",
    authMode: "owner",
    ownerOnly: true,
    resourceTypes: ["system-status"],
    tags: ["owner", "system-console", "resources", "read-only"],
  }),
]);

function createOwnerSystemConsoleApiRoutes(deps = {}) {
  const {
    ownerSystemConsoleService,
    requireOwner,
    sendJson,
  } = deps;

  for (const [name, value] of Object.entries({
    ownerSystemConsoleService,
    requireOwner,
    sendJson,
  })) {
    if (!value) throw new Error(`owner system console api routes require ${name}`);
  }
  if (typeof ownerSystemConsoleService.overview !== "function") {
    throw new Error("owner system console api routes require ownerSystemConsoleService.overview");
  }
  if (typeof ownerSystemConsoleService.systemStatus !== "function") {
    throw new Error("owner system console api routes require ownerSystemConsoleService.systemStatus");
  }
  if (typeof requireOwner !== "function") throw new Error("owner system console api routes require requireOwner");
  if (typeof sendJson !== "function") throw new Error("owner system console api routes require sendJson");

  const registry = createApiRouteRegistry(OWNER_SYSTEM_CONSOLE_ROUTE_SPECS);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    try {
      if (route.id === "owner-system-console-overview") {
        const overview = await ownerSystemConsoleService.overview({ ownerAuth });
        sendJson(res, 200, { ok: Boolean(overview?.ok), console: overview });
        return { handled: true, route };
      }
      if (route.id === "owner-system-console-system-status") {
        const systemStatus = await ownerSystemConsoleService.systemStatus({ ownerAuth });
        sendJson(res, 200, { ok: true, systemStatus });
        return { handled: true, route };
      }
    } catch (err) {
      sendJson(res, err.status || 500, {
        ok: false,
        error: err.code || "owner_system_console_failed",
      });
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
  OWNER_SYSTEM_CONSOLE_ROUTE_SPECS,
  createOwnerSystemConsoleApiRoutes,
};
