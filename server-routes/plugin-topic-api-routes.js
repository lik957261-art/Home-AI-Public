"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const PLUGIN_TOPIC_API_ROUTE_SPECS = Object.freeze([
  {
    id: "plugin-topic-bindings-read",
    method: "GET",
    path: "/api/plugin-topic-bindings",
    group: "plugin-topics",
    moduleKey: "plugin-topic-bindings",
    handlerKey: "readBindings",
    summary: "Read plugin topic bindings and plugin directory claims for a workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "directory-claim"],
    tags: ["plugin-topic", "directory-claim", "context"],
  },
  {
    id: "plugin-topic-bindings-upsert",
    method: ["PATCH", "PUT"],
    path: "/api/plugin-topic-bindings",
    group: "plugin-topics",
    moduleKey: "plugin-topic-bindings",
    handlerKey: "upsertBindings",
    summary: "Upsert plugin topic bindings and plugin directory claims for a workspace.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "directory-claim"],
    tags: ["plugin-topic", "directory-claim", "context"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`plugin topic api routes require ${name}`);
  }
}

function bodyErrorPayload(err, fallback = "plugin_topic_invalid_body") {
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

function pluginIdFromRequest(url, body) {
  return String(
    body?.pluginId
    || body?.plugin_id
    || url?.searchParams?.get("pluginId")
    || url?.searchParams?.get("plugin_id")
    || "",
  ).trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function createPluginTopicApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.pluginTopicBindingService || typeof deps.pluginTopicBindingService.listTopicProjection !== "function") {
    throw new Error("plugin topic api routes require pluginTopicBindingService.listTopicProjection");
  }
  if (!deps.pluginDirectoryContextBindingService || typeof deps.pluginDirectoryContextBindingService.listWorkspaceBindings !== "function") {
    throw new Error("plugin topic api routes require pluginDirectoryContextBindingService.listWorkspaceBindings");
  }

  const registry = createApiRouteRegistry(PLUGIN_TOPIC_API_ROUTE_SPECS);

  function readPayload(workspaceId, pluginId = "") {
    return {
      ok: true,
      workspaceId,
      topics: deps.pluginTopicBindingService.listTopicProjection(workspaceId, { pluginId }).topics,
      directoryClaims: deps.pluginDirectoryContextBindingService.listWorkspaceBindings(workspaceId, { pluginId }).bindings,
    };
  }

  function handleRead(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, null, context.auth));
    if (!workspaceId) return;
    deps.sendJson(res, 200, readPayload(workspaceId, pluginIdFromRequest(url, null)));
  }

  async function handleUpsert(req, res, url, context = {}) {
    let body;
    try {
      body = await deps.readBody(req, 256 * 1024);
    } catch (err) {
      deps.sendJson(res, err?.status || 400, bodyErrorPayload(err));
      return;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return;
    try {
      for (const topic of normalizeArray(body?.topic || body?.topicBinding || body?.topic_bindings || body?.topics)) {
        deps.pluginTopicBindingService.upsertTopicBinding(Object.assign({}, topic, { workspaceId }));
      }
      for (const binding of normalizeArray(body?.directoryClaim || body?.directory_claim || body?.directoryClaims || body?.directory_claims)) {
        deps.pluginDirectoryContextBindingService.upsertBinding(Object.assign({}, binding, { workspaceId }));
      }
      deps.sendJson(res, 200, readPayload(workspaceId, pluginIdFromRequest(url, body)));
    } catch (err) {
      deps.sendJson(res, 400, bodyErrorPayload(err, "plugin_topic_binding_invalid"));
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "plugin-topic-bindings-read") {
      handleRead(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "plugin-topic-bindings-upsert") {
      await handleUpsert(req, res, url, context);
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
  PLUGIN_TOPIC_API_ROUTE_SPECS,
  createPluginTopicApiRoutes,
};
