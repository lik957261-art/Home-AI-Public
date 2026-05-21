"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const THREAD_MESSAGE_RUN_API_ROUTE_SPECS = Object.freeze([
  {
    id: "thread-messages-create",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/messages$/,
    group: "thread",
    moduleKey: "thread-message",
    handlerKey: "threadMessagesCreate",
    summary: "Create a user message and optionally start a Gateway run.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "message", "run"],
    tags: ["thread", "message", "run"],
  },
  {
    id: "thread-message-owner-elevation",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/messages\/[^/]+\/owner-elevation$/,
    group: "thread",
    moduleKey: "owner-elevation",
    handlerKey: "threadMessageOwnerElevation",
    summary: "Approve and rerun an assistant message with Owner elevation.",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    riskLevel: "owner",
    resourceTypes: ["thread", "message", "owner-elevation"],
    tags: ["thread", "message", "owner-elevation"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`thread message run api routes require ${name}`);
  }
}

function decodeThreadId(pathname, regex) {
  const match = String(pathname || "").match(regex);
  return match ? decodeURIComponent(match[1]) : "";
}

function decodeThreadMessageIds(pathname) {
  const match = String(pathname || "").match(/^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/owner-elevation$/);
  return {
    threadId: match ? decodeURIComponent(match[1]) : "",
    messageId: match ? decodeURIComponent(match[2]) : "",
  };
}

function createThreadMessageRunApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "handleThreadMessageCreate",
    "handleThreadMessageOwnerElevation",
  ]);

  const registry = createApiRouteRegistry(THREAD_MESSAGE_RUN_API_ROUTE_SPECS);

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "thread-messages-create") {
      await deps.handleThreadMessageCreate(req, res, url, Object.assign({}, context, {
        route,
        threadId: decodeThreadId(url.pathname, /^\/api\/threads\/([^/]+)\/messages$/),
      }));
    } else if (route.id === "thread-message-owner-elevation") {
      await deps.handleThreadMessageOwnerElevation(req, res, url, Object.assign({}, context, {
        route,
        ...decodeThreadMessageIds(url.pathname),
      }));
    } else {
      return { handled: false };
    }

    return { handled: true, route, auth: context.auth };
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
  THREAD_MESSAGE_RUN_API_ROUTE_SPECS,
  createThreadMessageRunApiRoutes,
};
