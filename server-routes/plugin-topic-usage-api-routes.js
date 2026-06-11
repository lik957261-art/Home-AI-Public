"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const PLUGIN_TOPIC_USAGE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "plugin-topic-usage-read",
    method: "GET",
    path: "/api/plugin-topic-usage",
    group: "plugin-topics",
    moduleKey: "plugin-topic-usage",
    handlerKey: "readUsage",
    summary: "Read workspace-scoped plugin topic quick-action usage preferences.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "preference"],
    tags: ["plugin-topic", "usage", "preference"],
  },
  {
    id: "plugin-topic-usage-merge",
    method: ["PATCH", "PUT"],
    path: "/api/plugin-topic-usage",
    group: "plugin-topics",
    moduleKey: "plugin-topic-usage",
    handlerKey: "mergeUsage",
    summary: "Merge workspace-scoped plugin topic quick-action usage preferences.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "preference"],
    tags: ["plugin-topic", "usage", "preference"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`plugin topic usage api routes require ${name}`);
  }
}

function bodyErrorPayload(err, fallback = "plugin_topic_usage_invalid_body") {
  return {
    ok: false,
    error: String(err?.message || err || fallback).replace(/\s+/g, " ").slice(0, 180),
    code: String(err?.code || fallback).slice(0, 80),
  };
}

function workspaceFromRequest(url, body, auth) {
  return String(
    body?.workspaceId
    || body?.workspace_id
    || url?.searchParams?.get("workspaceId")
    || auth?.workspaceId
    || "owner",
  ).trim() || "owner";
}

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function usagePayloadFromBody(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  if (source.usage && typeof source.usage === "object" && !Array.isArray(source.usage)) return source.usage;
  if (
    (source.plugins && typeof source.plugins === "object" && !Array.isArray(source.plugins))
    || (source.actions && typeof source.actions === "object" && !Array.isArray(source.actions))
  ) {
    return {
      plugins: source.plugins || {},
      actions: source.actions || {},
    };
  }
  const reserved = new Set(["workspaceId", "workspace_id", "usage", "preferences", "prefs"]);
  const usage = {};
  for (const [key, value] of Object.entries(source)) {
    if (reserved.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) usage[key] = value;
  }
  return usage;
}

function preferencesPayloadFromBody(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  if (hasOwn(source, "preferences")) return source.preferences;
  if (hasOwn(source, "prefs")) return source.prefs;
  return undefined;
}

function createPluginTopicUsageApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "readBody",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  if (!deps.pluginTopicUsageService || typeof deps.pluginTopicUsageService.readWorkspaceUsage !== "function") {
    throw new Error("plugin topic usage api routes require pluginTopicUsageService.readWorkspaceUsage");
  }
  if (typeof deps.pluginTopicUsageService.mergeWorkspaceUsage !== "function") {
    throw new Error("plugin topic usage api routes require pluginTopicUsageService.mergeWorkspaceUsage");
  }

  const registry = createApiRouteRegistry(PLUGIN_TOPIC_USAGE_API_ROUTE_SPECS);

  function handleRead(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, null, context.auth));
    if (!workspaceId) return;
    deps.sendJson(res, 200, deps.pluginTopicUsageService.readWorkspaceUsage(workspaceId));
  }

  async function handleMerge(req, res, url, context = {}) {
    let body;
    try {
      body = await deps.readBody(req, 128 * 1024);
    } catch (err) {
      deps.sendJson(res, err?.status || 400, bodyErrorPayload(err));
      return;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return;
    const usage = usagePayloadFromBody(body);
    const preferences = preferencesPayloadFromBody(body);
    deps.sendJson(res, 200, deps.pluginTopicUsageService.mergeWorkspaceUsage(workspaceId, usage || {}, preferences));
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "plugin-topic-usage-read") {
      handleRead(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "plugin-topic-usage-merge") {
      await handleMerge(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
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
  PLUGIN_TOPIC_USAGE_API_ROUTE_SPECS,
  createPluginTopicUsageApiRoutes,
};
