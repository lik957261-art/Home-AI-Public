"use strict";

const assert = require("node:assert/strict");
const {
  THREAD_TASK_API_ROUTE_SPECS,
  createThreadTaskApiRoutes,
} = require("../server-routes/thread-task-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const state = {
    artifacts: [
      { id: "artifact-a", threadId: "thread-a", messageId: "msg-a2" },
      { id: "artifact-b", threadId: "thread-a", messageId: "msg-keep" },
      { id: "artifact-c", threadId: "thread-other", messageId: "msg-a2" },
    ],
    threads: [
      {
        id: "thread-a",
        singleWindow: true,
        status: "running",
        activeRunId: "run-a",
        activeRunIds: ["run-a", "run-b", "run-other"],
        taskGroupMeta: { "task-a": { title: "Old title" } },
        messages: [
          { id: "msg-chat", taskGroupId: "chat", status: "done" },
          { id: "msg-a1", taskGroupId: "task-a", status: "queued", runId: "run-a" },
          { id: "msg-a2", taskGroupId: "task-a", status: "done", artifacts: [{ id: "artifact-a" }] },
          { id: "msg-b1", taskGroupId: "task-b", status: "running", runId: "run-b" },
          { id: "msg-keep", taskGroupId: "task-keep", status: "done" },
        ],
      },
      {
        id: "thread-normal",
        singleWindow: false,
        messages: [{ id: "normal-1", taskGroupId: "task-a" }],
      },
    ],
  };
  const calls = {
    broadcast: [],
    readBody: [],
    saveState: [],
    stopRunIds: [],
  };
  const deps = Object.assign({
    broadcast(event) {
      calls.broadcast.push(event);
    },
    compactThread(thread) {
      return {
        id: thread.id,
        status: thread.status || "idle",
        activeRunId: thread.activeRunId || null,
        activeRunIds: thread.activeRunIds || [],
        messages: (thread.messages || []).map((message) => ({ id: message.id, taskGroupId: message.taskGroupId })),
      };
    },
    dedupe(values) {
      return [...new Set(values)];
    },
    findThreadForRequest(_req, threadId) {
      return state.threads.find((thread) => thread.id === threadId) || null;
    },
    isSingleWindowConversationTaskGroupId(taskGroupId) {
      return ["chat", "group-chat", "weixin-chat"].includes(String(taskGroupId || ""));
    },
    normalizeTaskGroupMeta(value) {
      return value && typeof value === "object" ? Object.assign({}, value) : {};
    },
    nowIso() {
      return "2026-05-14T16:40:00.000Z";
    },
    readBody(req) {
      calls.readBody.push(req.body || {});
      return Promise.resolve(req.body || {});
    },
    sanitizeTaskGroupId(value) {
      return String(value || "").trim();
    },
    sanitizeTaskTitle(value) {
      return String(value || "").trim();
    },
    saveState(...args) {
      calls.saveState.push(args);
    },
    sendJson,
    state: () => state,
    stopRunIds(runIds) {
      calls.stopRunIds.push([...runIds]);
      return Promise.resolve([...runIds]);
    },
  }, overrides);
  return { routes: createThreadTaskApiRoutes(deps), calls, state };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, body: options.body || {} },
    res,
    makeUrl(path),
    {},
  );
  const body = String(res.headers["Content-Type"] || "").startsWith("application/json") && res.body ? parseBody(res) : null;
  return { result, res, body };
}

async function main() {
  assert.equal(THREAD_TASK_API_ROUTE_SPECS.length, 3);
  {
    const { routes } = makeRoutes();
    assert.equal(routes.match({ method: "PATCH", path: "/api/threads/thread-a/tasks/task-a" }).id, "thread-task-rename");
    assert.equal(routes.match({ method: "DELETE", path: "/api/threads/thread-a/tasks/task-a" }).id, "thread-task-delete");
    assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-a/interrupt" }).id, "thread-interrupt");
    assert.equal(routes.match({ method: "GET", path: "/api/threads/thread-a/interrupt" }), null);
  }

  {
    const { routes, calls, state } = makeRoutes();
    const got = await request(routes, "PATCH", "/api/threads/thread-a/tasks/task-a", { body: { title: "Updated task" } });
    assert.equal(got.result.handled, true);
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.title, "Updated task");
    assert.equal(state.threads[0].taskGroupMeta["task-a"].title, "Updated task");
    assert.equal(state.threads[0].updatedAt, "2026-05-14T16:40:00.000Z");
    assert.equal(calls.saveState.length, 1);
    assert.equal(calls.broadcast[0].type, "task.renamed");
  }

  {
    const directoryRoute = {
      projectId: "health-root",
      subprojectId: "",
      label: "Health",
      root: "/data/drive/users/owner/Hermes-Owner/Health",
      path: "/data/drive/users/owner/Hermes-Owner/Health",
    };
    const { routes, state } = makeRoutes();
    state.threads[0].taskGroupMeta["task-a"] = {
      title: "Old title",
      directoryRoute,
      sharedTopic: true,
      performerWorkspaceIds: ["owner"],
      viewerWorkspaceIds: ["weixin_wuping"],
    };
    const got = await request(routes, "PATCH", "/api/threads/thread-a/tasks/task-a", { body: { title: "Renamed" } });
    assert.equal(got.res.statusCode, 200);
    assert.equal(state.threads[0].taskGroupMeta["task-a"].title, "Renamed");
    assert.deepEqual(state.threads[0].taskGroupMeta["task-a"].directoryRoute, directoryRoute);
    assert.equal(state.threads[0].taskGroupMeta["task-a"].sharedTopic, true);
    assert.deepEqual(state.threads[0].taskGroupMeta["task-a"].viewerWorkspaceIds, ["weixin_wuping"]);
  }

  {
    const { routes } = makeRoutes();
    const chatGot = await request(routes, "PATCH", "/api/threads/thread-a/tasks/chat", { body: { title: "No" } });
    assert.equal(chatGot.res.statusCode, 400);
    const missingGot = await request(routes, "PATCH", "/api/threads/thread-a/tasks/missing", { body: { title: "No" } });
    assert.equal(missingGot.res.statusCode, 404);
    const titleGot = await request(routes, "PATCH", "/api/threads/thread-a/tasks/task-a", { body: { title: "   " } });
    assert.equal(titleGot.res.statusCode, 400);
    const normalGot = await request(routes, "PATCH", "/api/threads/thread-normal/tasks/task-a", { body: { title: "No" } });
    assert.equal(normalGot.res.statusCode, 400);
  }

  {
    const { routes, calls, state } = makeRoutes();
    const got = await request(routes, "DELETE", "/api/threads/thread-a/tasks/task-a");
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.deletedMessages, 2);
    assert.deepEqual(got.body.stoppedRunIds, ["run-a"]);
    assert.deepEqual(calls.stopRunIds[0], ["run-a"]);
    assert.equal(state.threads[0].messages.some((message) => message.taskGroupId === "task-a"), false);
    assert.equal(state.threads[0].taskGroupMeta["task-a"], undefined);
    assert.deepEqual(state.threads[0].activeRunIds, ["run-b", "run-other"]);
    assert.equal(state.threads[0].activeRunId, "run-other");
    assert.equal(state.threads[0].status, "running");
    assert.equal(state.artifacts.some((artifact) => artifact.id === "artifact-a"), false);
    assert.equal(state.artifacts.some((artifact) => artifact.id === "artifact-b"), true);
    assert.equal(calls.saveState[0][0], state);
    assert.deepEqual(calls.saveState[0][1], { allowMessageDrop: true, reason: "task-delete", forceBackup: true });
    assert.equal(calls.broadcast[0].type, "task.deleted");
  }

  {
    const { routes } = makeRoutes();
    assert.equal((await request(routes, "DELETE", "/api/threads/missing/tasks/task-a")).res.statusCode, 404);
    assert.equal((await request(routes, "DELETE", "/api/threads/thread-normal/tasks/task-a")).res.statusCode, 400);
    assert.equal((await request(routes, "DELETE", "/api/threads/thread-a/tasks/chat")).res.statusCode, 400);
    assert.equal((await request(routes, "DELETE", "/api/threads/thread-a/tasks/missing")).res.statusCode, 404);
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/threads/thread-a/interrupt");
    assert.equal(got.res.statusCode, 200);
    assert.deepEqual(got.body.runIds, ["run-a", "run-b", "run-other"]);
    assert.deepEqual(calls.stopRunIds[0], ["run-a", "run-b", "run-other"]);
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/threads/thread-a/interrupt", { body: { taskGroupId: "task-b" } });
    assert.equal(got.res.statusCode, 200);
    assert.deepEqual(got.body.runIds, ["run-b"]);
    assert.deepEqual(calls.stopRunIds[0], ["run-b"]);
  }

  {
    const { routes } = makeRoutes();
    assert.equal((await request(routes, "POST", "/api/threads/missing/interrupt")).res.statusCode, 404);
    assert.equal((await request(routes, "POST", "/api/threads/thread-a/interrupt", { body: { taskGroupId: "task-keep" } })).res.statusCode, 404);
  }

  {
    const err = new Error("gateway down");
    err.status = 503;
    const { routes } = makeRoutes({ stopRunIds: () => Promise.reject(err) });
    const got = await request(routes, "DELETE", "/api/threads/thread-a/tasks/task-a");
    assert.equal(got.res.statusCode, 503);
    assert.match(got.body.error, /gateway down/);
    const interruptGot = await request(routes, "POST", "/api/threads/thread-a/interrupt");
    assert.equal(interruptGot.res.statusCode, 503);
  }

  assert.throws(() => createThreadTaskApiRoutes({}), /require broadcast/);
  assert.throws(() => createThreadTaskApiRoutes(Object.assign(makeRoutes().routes, {})), /require broadcast/);
}

main().then(() => {
  console.log("thread task api routes tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
