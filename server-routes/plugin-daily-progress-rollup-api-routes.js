"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const ROUTE_SPECS = Object.freeze([
  {
    id: "plugin-daily-progress-rollup-status",
    method: "GET",
    path: "/api/owner/plugin-daily-progress-rollup/status",
    group: "plugin-daily-progress-rollup",
    moduleKey: "plugin-daily-progress-rollup",
    summary: "Read Owner-visible Plugin Daily Progress Rollup status and latest report.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin-governance", "report", "task-card"],
    tags: ["owner", "plugin", "daily-rollup", "report"],
  },
  {
    id: "plugin-daily-progress-rollup-trigger",
    method: "POST",
    path: "/api/owner/plugin-daily-progress-rollup/trigger",
    group: "plugin-daily-progress-rollup",
    moduleKey: "plugin-daily-progress-rollup",
    summary: "Manually trigger the same Plugin Daily Progress Rollup path used by the scheduled job.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin-governance", "task-card", "report"],
    tags: ["owner", "plugin", "daily-rollup", "manual-trigger"],
  },
  {
    id: "plugin-daily-progress-rollup-return",
    method: "POST",
    pathRegex: /^\/api\/owner\/plugin-daily-progress-rollup\/runs\/[^/]+\/plugins\/[^/]+\/return$/,
    group: "plugin-daily-progress-rollup",
    moduleKey: "plugin-daily-progress-rollup",
    summary: "Ingest a bounded plugin daily summary return into the Owner rollup report.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin-governance", "task-card", "return-card", "report"],
    tags: ["owner", "plugin", "daily-rollup", "return"],
  },
  {
    id: "plugin-daily-progress-rollup-finalize",
    method: "POST",
    pathRegex: /^\/api\/owner\/plugin-daily-progress-rollup\/runs\/[^/]+\/finalize$/,
    group: "plugin-daily-progress-rollup",
    moduleKey: "plugin-daily-progress-rollup",
    summary: "Finalize a rollup report by marking pending plugin reports missing or stale.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin-governance", "report"],
    tags: ["owner", "plugin", "daily-rollup", "finalize"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`plugin daily progress rollup api routes require ${name}`);
  }
}

function compactError(err) {
  return String(err?.message || err || "plugin_daily_progress_rollup_failed").replace(/\s+/g, " ").slice(0, 400);
}

function publicError(err) {
  return {
    ok: false,
    code: err?.code || "plugin_daily_progress_rollup_failed",
    error: compactError(err),
  };
}

function decodeReturnPath(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/owner\/plugin-daily-progress-rollup\/runs\/([^/]+)\/plugins\/([^/]+)\/return$/);
  if (!match) return null;
  return {
    runId: decodeURIComponent(match[1]),
    pluginId: decodeURIComponent(match[2]),
  };
}

function decodeFinalizePath(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/owner\/plugin-daily-progress-rollup\/runs\/([^/]+)\/finalize$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function createPluginDailyProgressRollupApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "sendJson"]);
  const service = deps.pluginDailyProgressRollupService;
  if (!service
    || typeof service.status !== "function"
    || typeof service.trigger !== "function"
    || typeof service.recordReturn !== "function"
    || typeof service.finalize !== "function") {
    throw new Error("plugin daily progress rollup api routes require pluginDailyProgressRollupService");
  }
  const registry = createApiRouteRegistry(ROUTE_SPECS);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, route };
    try {
      if (route.id === "plugin-daily-progress-rollup-status") {
        deps.sendJson(res, 200, await Promise.resolve(service.status({ date: url.searchParams.get("date") || "" })));
        return { handled: true, route };
      }
      const body = await deps.readBody(req).catch((err) => ({ __error: err }));
      if (body.__error) {
        deps.sendJson(res, 400, { ok: false, code: "invalid_request_body", error: body.__error.message || "Invalid request body" });
        return { handled: true, route };
      }
      if (route.id === "plugin-daily-progress-rollup-trigger") {
        deps.sendJson(res, 202, await Promise.resolve(service.trigger(Object.assign({}, body, {
          triggerSource: body.triggerSource || body.trigger_source || "manual",
        }))));
        return { handled: true, route };
      }
      if (route.id === "plugin-daily-progress-rollup-return") {
        const pathInput = decodeReturnPath(url.pathname) || {};
        deps.sendJson(res, 200, service.recordReturn(Object.assign({}, body, pathInput)));
        return { handled: true, route };
      }
      if (route.id === "plugin-daily-progress-rollup-finalize") {
        deps.sendJson(res, 200, service.finalize(Object.assign({}, body, {
          runId: decodeFinalizePath(url.pathname),
        })));
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
  createPluginDailyProgressRollupApiRoutes,
};
