"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const WORKSPACE_CONSOLE_ROUTE_SPECS = Object.freeze([
  Object.freeze({
    id: "owner-workspace-console-summary",
    method: "GET",
    path: "/api/owner/workspace-console",
    group: "workspace-console",
    moduleKey: "workspace-console",
    handlerKey: "summary",
    summary: "Read Owner-only Codex workspace governance console summary.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-workspace", "remote-managed-workspace", "status"],
    tags: ["owner", "workspace-console", "codex-workspace", "remote-managed-workspace", "read-only"],
  }),
]);

function createWorkspaceConsoleApiRoutes(deps = {}) {
  const {
    workspaceConsoleService,
    requireOwner,
    sendJson,
  } = deps;

  for (const [name, value] of Object.entries({
    workspaceConsoleService,
    requireOwner,
    sendJson,
  })) {
    if (!value) throw new Error(`workspace console api routes require ${name}`);
  }
  if (typeof workspaceConsoleService.summary !== "function") {
    throw new Error("workspace console api routes require workspaceConsoleService.summary");
  }
  if (typeof requireOwner !== "function") throw new Error("workspace console api routes require requireOwner");
  if (typeof sendJson !== "function") throw new Error("workspace console api routes require sendJson");

  const registry = createApiRouteRegistry(WORKSPACE_CONSOLE_ROUTE_SPECS);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    try {
      const workspaceConsole = await workspaceConsoleService.summary({ ownerAuth });
      sendJson(res, 200, { ok: Boolean(workspaceConsole?.ok), workspaceConsole });
      return { handled: true, route };
    } catch (err) {
      sendJson(res, err.status || 500, {
        ok: false,
        error: err.code || "workspace_console_failed",
      });
      return { handled: true, route };
    }
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
  WORKSPACE_CONSOLE_ROUTE_SPECS,
  createWorkspaceConsoleApiRoutes,
};
