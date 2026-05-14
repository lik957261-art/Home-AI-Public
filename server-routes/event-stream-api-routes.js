"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const EVENT_STREAM_API_ROUTE_SPECS = Object.freeze([
  {
    id: "events",
    method: "ALL",
    path: "/api/events",
    group: "events",
    moduleKey: "events",
    handlerKey: "events",
    summary: "Open the workspace realtime event stream.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread", "event"],
    tags: ["events", "sse"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`event stream api routes require ${name}`);
  }
}

function createEventStreamApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "authenticateRequest",
    "clientVersionInfo",
    "effectiveHermesApiBase",
    "pruneEmptyThreads",
    "readClientVersion",
    "registerClient",
    "removeClient",
    "runConcurrencySnapshot",
    "sendJson",
    "threadAccessibleToAuth",
    "threadSummary",
  ]);
  if (typeof deps.state !== "function") throw new Error("event stream api routes require state");
  if (typeof deps.activeStreams !== "function") throw new Error("event stream api routes require activeStreams");

  const setTimer = deps.setInterval || setInterval;
  const clearTimer = deps.clearInterval || clearInterval;
  const registry = createApiRouteRegistry(EVENT_STREAM_API_ROUTE_SPECS);

  function handleEvents(req, res, url) {
    const auth = deps.authenticateRequest(req);
    if (!auth.ok) {
      deps.sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    const reportedClientVersion = url.searchParams.get("clientVersion") || req.headers["x-hermes-web-client-version"] || "";
    let lastSentClientVersion = "";
    const sendClientVersionEvent = (force = false) => {
      const info = deps.clientVersionInfo(reportedClientVersion);
      if (!force && info.version === lastSentClientVersion) return false;
      lastSentClientVersion = info.version;
      res.write(`data: ${JSON.stringify({ type: "client.version", clientVersion: info })}\n\n`);
      return true;
    };
    deps.pruneEmptyThreads();
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const currentState = deps.state() || {};
    const streams = deps.activeStreams();
    res.write(`data: ${JSON.stringify({
      type: "snapshot",
      threads: (currentState.threads || []).filter((thread) => deps.threadAccessibleToAuth(auth, thread)).map(deps.threadSummary),
      status: {
        apiBase: deps.effectiveHermesApiBase(),
        activeRuns: streams?.size || 0,
        concurrency: deps.runConcurrencySnapshot(),
      },
      clientVersion: deps.clientVersionInfo(reportedClientVersion),
    })}\n\n`);
    lastSentClientVersion = deps.readClientVersion();
    const client = { res, auth };
    deps.registerClient(client);
    const heartbeat = setTimer(() => {
      try {
        if (!sendClientVersionEvent(false)) res.write(": keepalive\n\n");
      } catch (_) {
        clearTimer(heartbeat);
        deps.removeClient(client);
      }
    }, 25000);
    req.on("close", () => {
      clearTimer(heartbeat);
      deps.removeClient(client);
    });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    handleEvents(req, res, url);
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
  EVENT_STREAM_API_ROUTE_SPECS,
  createEventStreamApiRoutes,
};
