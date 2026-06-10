"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const PLUGIN_TOPIC_CONTEXT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "plugin-topic-context-sources-read",
    method: "GET",
    path: "/api/plugin-topic-context-sources",
    group: "plugin-topics",
    moduleKey: "plugin-topic-context-sources",
    handlerKey: "readContextSources",
    summary: "Read indexed plugin topic context sources without scanning delivery directories.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "context-source"],
    tags: ["plugin-topic", "context-source"],
  },
  {
    id: "plugin-topic-context-source-upsert",
    method: ["PATCH", "PUT"],
    path: "/api/plugin-topic-context-sources",
    group: "plugin-topics",
    moduleKey: "plugin-topic-context-sources",
    handlerKey: "upsertContextSource",
    summary: "Upsert a plugin topic context source eligibility record.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin-topic", "context-source"],
    tags: ["plugin-topic", "context-source"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`plugin topic context api routes require ${name}`);
  }
}

function bodyErrorPayload(err, fallback = "plugin_topic_context_invalid_body") {
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

function sourceQuery(url, workspaceId) {
  const params = url?.searchParams || new URLSearchParams();
  const eligibleParam = String(params.get("eligibleOnly") || params.get("contextEligible") || "1").trim().toLowerCase();
  return {
    workspaceId,
    pluginId: params.get("pluginId") || params.get("plugin_id") || "",
    topicId: params.get("topicId") || params.get("topic_id") || "",
    eligibleOnly: !["0", "false", "no"].includes(eligibleParam),
    maxEntries: params.get("limit") || params.get("maxEntries") || "",
  };
}

function createPluginTopicContextApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.pluginTopicContextSourceService || typeof deps.pluginTopicContextSourceService.listSources !== "function") {
    throw new Error("plugin topic context api routes require pluginTopicContextSourceService.listSources");
  }

  const registry = createApiRouteRegistry(PLUGIN_TOPIC_CONTEXT_API_ROUTE_SPECS);

  function handleRead(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, null, context.auth));
    if (!workspaceId) return;
    deps.sendJson(res, 200, deps.pluginTopicContextSourceService.listSources(sourceQuery(url, workspaceId)));
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
      const source = body?.source && typeof body.source === "object" ? body.source : body;
      const result = deps.pluginTopicContextSourceService.upsertSource(Object.assign({}, source, { workspaceId }));
      deps.sendJson(res, 200, result);
    } catch (err) {
      deps.sendJson(res, 400, bodyErrorPayload(err, "plugin_topic_context_source_invalid"));
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "plugin-topic-context-sources-read") {
      handleRead(req, res, url, context);
      return { handled: true, route, auth: context.auth || null };
    }
    if (route.id === "plugin-topic-context-source-upsert") {
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
  PLUGIN_TOPIC_CONTEXT_API_ROUTE_SPECS,
  createPluginTopicContextApiRoutes,
};
