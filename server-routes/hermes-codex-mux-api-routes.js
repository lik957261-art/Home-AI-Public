"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");
const { createHermesCodexMuxService } = require("../adapters/hermes-codex-mux-service");

const HERMES_CODEX_MUX_API_ROUTE_SPECS = Object.freeze([
  {
    id: "codex-mux-tasks-list",
    method: "GET",
    path: "/api/codex-mux/tasks",
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "listTasks",
    summary: "List Hermes-Codex Mux tasks assigned to a sticky Codex worker.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "tasks"],
  },
  {
    id: "codex-mux-tasks-create",
    method: "POST",
    path: "/api/codex-mux/tasks",
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "createTask",
    summary: "Create or update a Hermes-Codex Mux task capsule.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "tasks"],
  },
  {
    id: "codex-mux-task-detail",
    method: "GET",
    pathRegex: /^\/api\/codex-mux\/tasks\/[^/]+$/,
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "taskDetail",
    summary: "Read a Hermes-Codex Mux task capsule and worker lease summary.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "tasks"],
  },
  {
    id: "codex-mux-task-events-list",
    method: "GET",
    pathRegex: /^\/api\/codex-mux\/tasks\/[^/]+\/events$/,
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "listEvents",
    summary: "List Hermes-Codex Mux task events.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "events"],
  },
  {
    id: "codex-mux-task-events-append",
    method: "POST",
    pathRegex: /^\/api\/codex-mux\/tasks\/[^/]+\/events$/,
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "appendEvent",
    summary: "Append a Hermes-Codex Mux task event envelope.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "events"],
  },
  {
    id: "codex-mux-worker-heartbeat",
    method: "POST",
    pathRegex: /^\/api\/codex-mux\/workers\/[^/]+\/heartbeat$/,
    group: "codex-mux",
    moduleKey: "codex-mux",
    handlerKey: "heartbeat",
    summary: "Record sticky Codex worker heartbeat for the Hermes-Codex Mux.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["codex-mux"],
    tags: ["codex-mux", "workers"],
  },
]);

function routeIdFromPath(pathname, marker, suffix = "") {
  const prefix = `/api/codex-mux/${marker}/`;
  let text = String(pathname || "");
  if (!text.startsWith(prefix)) return "";
  text = text.slice(prefix.length);
  if (suffix && text.endsWith(suffix)) text = text.slice(0, -suffix.length);
  return decodeURIComponent(text.split("/")[0] || "");
}

function requireOwner(deps, req, res) {
  if (typeof deps.requireOwner === "function") return deps.requireOwner(req, res);
  if (typeof deps.isOwnerAuth === "function" && deps.isOwnerAuth(req?.auth || req?.hermesAuth || null)) return true;
  deps.sendJson(res, 403, { error: "Owner access is required" });
  return false;
}

function createHermesCodexMuxApiRoutes(deps = {}) {
  if (typeof deps.sendJson !== "function") throw new Error("codex mux api routes require sendJson");
  if (typeof deps.readBody !== "function") throw new Error("codex mux api routes require readBody");
  const registry = createApiRouteRegistry(HERMES_CODEX_MUX_API_ROUTE_SPECS);
  const service = deps.hermesCodexMuxService || createHermesCodexMuxService({
    mobileStore: deps.mobileStore || deps.mobileSqliteStore,
  });

  async function readJson(req) {
    const body = await deps.readBody(req);
    if (!body) return {};
    if (typeof body === "object") return body;
    try {
      return JSON.parse(String(body));
    } catch (_) {
      const err = new Error("Invalid JSON body");
      err.status = 400;
      throw err;
    }
  }

  function sendError(res, err) {
    deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (!requireOwner(deps, req, res)) return { handled: true, route };

    try {
      if (route.id === "codex-mux-tasks-list") {
        const tasks = service.listTasks({
          assignedWorker: url.searchParams.get("assignedWorker"),
          status: url.searchParams.get("status"),
          limit: url.searchParams.get("limit"),
        });
        deps.sendJson(res, 200, { ok: true, tasks });
      } else if (route.id === "codex-mux-tasks-create") {
        const body = await readJson(req);
        const task = service.upsertTask(body);
        if (body.event) service.appendEvent(task.taskId, body.event);
        deps.sendJson(res, 200, { ok: true, task });
      } else if (route.id === "codex-mux-task-detail") {
        const taskId = routeIdFromPath(url.pathname, "tasks");
        const task = service.getTask(taskId);
        if (!task) {
          deps.sendJson(res, 404, { error: "Mux task not found" });
        } else {
          deps.sendJson(res, 200, {
            ok: true,
            task,
            capsule: task.capsule || null,
            workerLease: {
              workerId: task.assignedWorker || "",
              leaseUntil: "",
            },
            heartbeat: task.assignedWorker ? service.getHeartbeat(task.assignedWorker) : null,
          });
        }
      } else if (route.id === "codex-mux-task-events-list") {
        const taskId = routeIdFromPath(url.pathname, "tasks", "/events");
        deps.sendJson(res, 200, {
          ok: true,
          events: service.listEvents(taskId, { limit: url.searchParams.get("limit") }),
        });
      } else if (route.id === "codex-mux-task-events-append") {
        const taskId = routeIdFromPath(url.pathname, "tasks", "/events");
        const body = await readJson(req);
        const event = service.appendEvent(taskId, body);
        deps.sendJson(res, 200, { ok: true, event });
      } else if (route.id === "codex-mux-worker-heartbeat") {
        const workerId = routeIdFromPath(url.pathname, "workers", "/heartbeat");
        const heartbeat = service.recordHeartbeat(workerId, await readJson(req));
        deps.sendJson(res, 200, { ok: true, heartbeat });
      } else {
        return { handled: false };
      }
    } catch (err) {
      sendError(res, err);
    }
    return { handled: true, route };
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
  HERMES_CODEX_MUX_API_ROUTE_SPECS,
  createHermesCodexMuxApiRoutes,
};
