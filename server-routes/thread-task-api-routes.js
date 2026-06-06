"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const THREAD_TASK_API_ROUTE_SPECS = Object.freeze([
  {
    id: "thread-task-rename",
    method: "PATCH",
    pathRegex: /^\/api\/threads\/[^/]+\/tasks\/[^/]+$/,
    group: "thread",
    moduleKey: "thread-task",
    handlerKey: "threadTaskRename",
    summary: "Rename a single-window task group.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "task"],
    tags: ["thread", "task", "rename"],
  },
  {
    id: "thread-task-delete",
    method: "DELETE",
    pathRegex: /^\/api\/threads\/[^/]+\/tasks\/[^/]+$/,
    group: "thread",
    moduleKey: "thread-task",
    handlerKey: "threadTaskDelete",
    summary: "Delete a single-window task group.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "task"],
    tags: ["thread", "task", "delete"],
  },
  {
    id: "thread-interrupt",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/interrupt$/,
    group: "thread",
    moduleKey: "thread-run",
    handlerKey: "threadInterrupt",
    summary: "Stop active runs for a thread or task group.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    riskLevel: "medium",
    resourceTypes: ["thread", "run"],
    tags: ["thread", "run", "interrupt"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`thread task api routes require ${name}`);
  }
}

function getState(deps) {
  return typeof deps.state === "function" ? deps.state() : deps.state;
}

function decodeThreadTaskRoute(pathname) {
  const match = String(pathname || "").match(/^\/api\/threads\/([^/]+)\/tasks\/([^/]+)$/);
  return {
    threadId: match ? decodeURIComponent(match[1]) : "",
    taskGroupId: match ? decodeURIComponent(match[2]) : "",
  };
}

function decodeInterruptRoute(pathname) {
  const match = String(pathname || "").match(/^\/api\/threads\/([^/]+)\/interrupt$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function createThreadTaskApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "broadcast",
    "compactThread",
    "dedupe",
    "findThreadForRequest",
    "isSingleWindowConversationTaskGroupId",
    "normalizeTaskGroupMeta",
    "nowIso",
    "readBody",
    "sanitizeTaskGroupId",
    "sanitizeTaskTitle",
    "saveState",
    "sendJson",
    "stopRunIds",
  ]);
  if (!deps.state) throw new Error("thread task api routes require state");

  const registry = createApiRouteRegistry(THREAD_TASK_API_ROUTE_SPECS);

  async function handleRename(req, res, url) {
    const { threadId, taskGroupId: rawTaskGroupId } = decodeThreadTaskRoute(url.pathname);
    const thread = deps.findThreadForRequest(req, threadId);
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      deps.sendJson(res, 400, { error: "Task rename is only supported for single-window task groups" });
      return;
    }
    const taskGroupId = deps.sanitizeTaskGroupId(rawTaskGroupId);
    if (deps.isSingleWindowConversationTaskGroupId(taskGroupId)) {
      deps.sendJson(res, 400, { error: "Chat history cannot be renamed as a task" });
      return;
    }
    const groupMessages = (thread.messages || []).filter((message) => message.taskGroupId === taskGroupId);
    if (!groupMessages.length) {
      deps.sendJson(res, 404, { error: "Task not found" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    const title = deps.sanitizeTaskTitle(body.title || body.name || "");
    if (!title) {
      deps.sendJson(res, 400, { error: "Task title is required" });
      return;
    }
    const updatedAt = deps.nowIso();
    thread.taskGroupMeta = deps.normalizeTaskGroupMeta(thread.taskGroupMeta);
    thread.taskGroupMeta[taskGroupId] = Object.assign({}, thread.taskGroupMeta[taskGroupId] || {}, { title, updatedAt });
    thread.updatedAt = updatedAt;
    deps.saveState();
    deps.broadcast({ type: "task.renamed", threadId: thread.id, taskGroupId, title, thread: deps.compactThread(thread) });
    deps.sendJson(res, 200, { ok: true, taskGroupId, title, thread: deps.compactThread(thread) });
  }

  async function handleDelete(req, res, url) {
    const { threadId, taskGroupId: rawTaskGroupId } = decodeThreadTaskRoute(url.pathname);
    const thread = deps.findThreadForRequest(req, threadId);
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (!thread.singleWindow) {
      deps.sendJson(res, 400, { error: "Task deletion is only supported for single-window task groups" });
      return;
    }
    const taskGroupId = deps.sanitizeTaskGroupId(rawTaskGroupId);
    if (deps.isSingleWindowConversationTaskGroupId(taskGroupId)) {
      deps.sendJson(res, 400, { error: "Chat history cannot be deleted as a task" });
      return;
    }
    const deletedMessages = (thread.messages || []).filter((message) => message.taskGroupId === taskGroupId);
    if (!deletedMessages.length) {
      deps.sendJson(res, 404, { error: "Task not found" });
      return;
    }
    const deletedMessageIds = new Set(deletedMessages.map((message) => message.id).filter(Boolean));
    const deletedArtifactIds = new Set();
    for (const message of deletedMessages) {
      for (const artifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
        if (artifact?.id) deletedArtifactIds.add(String(artifact.id));
      }
    }
    const activeRunIds = deletedMessages
      .filter((message) => ["queued", "running"].includes(message.status))
      .map((message) => message.runId)
      .filter(Boolean);
    let stoppedRunIds = [];
    try {
      stoppedRunIds = await deps.stopRunIds(activeRunIds);
    } catch (err) {
      deps.sendJson(res, err.status || 502, { error: err.message || String(err) });
      return;
    }
    thread.activeRunIds = (thread.activeRunIds || []).filter((runId) => !activeRunIds.includes(runId));
    if (activeRunIds.includes(thread.activeRunId)) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1] || null;
    thread.messages = (thread.messages || []).filter((message) => message.taskGroupId !== taskGroupId);
    if (thread.taskGroupMeta && typeof thread.taskGroupMeta === "object") delete thread.taskGroupMeta[taskGroupId];
    thread.status = thread.activeRunIds.length ? "running" : "idle";
    thread.updatedAt = deps.nowIso();
    const state = getState(deps);
    state.artifacts = (state.artifacts || []).filter((artifact) => {
      if (deletedArtifactIds.has(String(artifact.id || ""))) return false;
      if (artifact.threadId === thread.id && deletedMessageIds.has(String(artifact.messageId || ""))) return false;
      return true;
    });
    deps.saveState(state, { allowMessageDrop: true, reason: "task-delete", forceBackup: true });
    deps.broadcast({ type: "task.deleted", threadId: thread.id, taskGroupId, stoppedRunIds, thread: deps.compactThread(thread) });
    deps.sendJson(res, 200, { ok: true, taskGroupId, deletedMessages: deletedMessages.length, stoppedRunIds, thread: deps.compactThread(thread) });
  }

  async function handleInterrupt(req, res, url) {
    const thread = deps.findThreadForRequest(req, decodeInterruptRoute(url.pathname));
    const body = await deps.readBody(req).catch(() => ({}));
    const taskGroupId = body.taskGroupId ? deps.sanitizeTaskGroupId(body.taskGroupId) : "";
    let runIds = thread ? deps.dedupe([...(thread.activeRunIds || []), thread.activeRunId].filter(Boolean)) : [];
    if (thread && taskGroupId) {
      const groupRunIds = (thread.messages || [])
        .filter((message) => message.taskGroupId === taskGroupId)
        .filter((message) => ["queued", "running"].includes(message.status))
        .map((message) => message.runId)
        .filter(Boolean);
      runIds = runIds.filter((runId) => groupRunIds.includes(runId));
    }
    if (!thread || !runIds.length) {
      deps.sendJson(res, 404, { error: "No active run for thread" });
      return;
    }
    try {
      await deps.stopRunIds(runIds);
      deps.sendJson(res, 200, { ok: true, runIds });
    } catch (err) {
      deps.sendJson(res, err.status || 502, { error: err.message || String(err) });
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "thread-task-rename") await handleRename(req, res, url, context);
    else if (route.id === "thread-task-delete") await handleDelete(req, res, url, context);
    else if (route.id === "thread-interrupt") await handleInterrupt(req, res, url, context);
    else return { handled: false };

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
  THREAD_TASK_API_ROUTE_SPECS,
  createThreadTaskApiRoutes,
};
