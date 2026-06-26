"use strict";

const assert = require("node:assert/strict");
const {
  SINGLE_WINDOW_GROUP_CHAT_API_ROUTE_SPECS,
  createSingleWindowGroupChatApiRoutes,
} = require("../server-routes/single-window-group-chat-api-routes");

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
      { id: "art-user", threadId: "group-thread", messageId: "msg-user" },
      { id: "art-assistant", threadId: "group-thread", messageId: "msg-assistant" },
      { id: "art-keep", threadId: "group-thread", messageId: "msg-keep" },
    ],
    threads: [
      {
        id: "private-thread",
        singleWindow: true,
        workspaceId: "owner",
        messages: [{ id: "private-1", taskGroupId: "chat", content: "private" }],
      },
      {
        id: "group-thread",
        singleWindow: true,
        workspaceId: "owner",
        chatGroup: { enabled: true, memberWorkspaceIds: ["child-a"], createdAt: "old" },
        activeRunIds: ["run-ai", "run-other"],
        messages: [
          { id: "msg-user", role: "user", messageKind: "ai", taskGroupId: "group-chat", content: "ask", artifacts: [{ id: "art-user" }] },
          { id: "msg-assistant", role: "assistant", taskGroupId: "group-chat", content: "answer", status: "running", runId: "run-ai", artifacts: [{ id: "art-assistant" }] },
          { id: "msg-keep", role: "assistant", taskGroupId: "group-chat", content: "keep", artifacts: [{ id: "art-keep" }] },
        ],
      },
      {
        id: "weixin-thread",
        singleWindow: true,
        workspaceId: "owner",
        messages: [{ id: "wx-1", taskGroupId: "chat", content: "wx" }],
      },
      {
        id: "normal-thread",
        singleWindow: false,
        workspaceId: "owner",
        messages: [],
      },
      {
        id: "case-topic",
        singleWindow: true,
        workspaceId: "owner",
        messages: [{ id: "case-1", taskGroupId: "case-a", content: "case" }],
      },
    ],
  };
  const calls = {
    broadcast: [],
    compactWithPage: [],
    removeRun: [],
    requireOwner: [],
    requireWorkspaceAccess: [],
    revokePayload: [],
    saveState: [],
    schedule: [],
    stopRunIds: [],
  };
  const deps = Object.assign({
    authenticateRequest(req) {
      return req.auth || { ok: true, workspaceId: "owner" };
    },
    broadcast(event) {
      calls.broadcast.push(event);
    },
    canRevokeGroupChatMessage(auth, thread, message) {
      return Boolean(auth?.ok && thread.id === "group-thread" && message.taskGroupId === "group-chat");
    },
    compactMessage(message) {
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status || "",
        revokedAt: message.revokedAt || "",
      };
    },
    compactThread(thread) {
      return {
        id: thread.id,
        workspaceId: thread.workspaceId,
        chatGroup: thread.chatGroup || null,
        messages: (thread.messages || []).map((message) => deps.compactMessage(message)),
      };
    },
    compactThreadWithMessagePage(thread, options = {}) {
      calls.compactWithPage.push({ threadId: thread.id, options });
      return Object.assign(deps.compactThread(thread), { page: { mode: options.mode, limit: options.limit, groupChat: Boolean(options.groupChat) } });
    },
    ensureSingleWindowThread(workspaceId) {
      return state.threads.find((thread) => thread.id === "private-thread" && thread.workspaceId === workspaceId) || null;
    },
    ensureWeixinSingleWindowThread(workspaceId) {
      return state.threads.find((thread) => thread.id === "weixin-thread" && thread.workspaceId === workspaceId) || null;
    },
    ensureGroupChatThreadForWorkspace(workspaceId, memberWorkspaceIds = []) {
      const thread = {
        id: "created-group-thread",
        singleWindow: true,
        workspaceId,
        chatGroup: { enabled: true, memberWorkspaceIds },
        messages: [],
      };
      state.threads.unshift(thread);
      return thread;
    },
    findGroupChatThreadForWorkspace(workspaceId) {
      return state.threads.find((thread) => thread.id === "group-thread" && thread.workspaceId === workspaceId) || null;
    },
    findThreadForRequest(_req, threadId) {
      return state.threads.find((thread) => thread.id === threadId) || null;
    },
    findWeixinSingleWindowThreadForWorkspace(workspaceId) {
      return state.threads.find((thread) => thread.id === "weixin-thread" && thread.workspaceId === workspaceId) || null;
    },
    findWorkspace(workspaceId) {
      return ["owner", "child-a", "child-b"].includes(String(workspaceId || "")) ? { id: workspaceId } : null;
    },
    groupAssistantReplyForUserMessage(thread, message) {
      return (thread.messages || []).find((item) => item.id === "msg-assistant" && message.id === "msg-user") || null;
    },
    groupMessageRevoker(auth) {
      return { workspaceId: auth.workspaceId || "owner" };
    },
    kanbanCaseTopicThreadsForWorkspace() {
      return [state.threads.find((thread) => thread.id === "case-topic")].filter(Boolean);
    },
    normalizeChatGroup(value, workspaceId) {
      return {
        enabled: value.enabled !== false,
        ownerWorkspaceId: workspaceId,
        memberWorkspaceIds: Array.isArray(value.memberWorkspaceIds) ? value.memberWorkspaceIds : [],
        createdAt: value.createdAt || "",
        updatedAt: value.updatedAt || "",
      };
    },
    normalizeStringList(value) {
      return Array.isArray(value) ? value.map(String) : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    },
    nowIso() {
      return "2026-05-14T17:00:00.000Z";
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    removeThreadActiveRun(thread, runId, status) {
      calls.removeRun.push({ threadId: thread.id, runId, status });
      thread.activeRunIds = (thread.activeRunIds || []).filter((item) => item !== runId);
    },
    requireOwner(req, res) {
      calls.requireOwner.push(true);
      if (req.ownerDenied) {
        sendJson(res, 403, { error: "Owner access required" });
        return null;
      }
      return { ok: true, workspaceId: "owner", owner: true };
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.requireWorkspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    revokeGroupMessagePayload(message, now, revoker, text) {
      calls.revokePayload.push({ messageId: message.id, now, revoker, text });
      message.revokedAt = now;
      message.content = text;
      message.artifacts = [];
    },
    saveState(...args) {
      calls.saveState.push(args);
    },
    scheduleNextQueuedRunForTaskGroup(thread, taskGroupId) {
      calls.schedule.push({ threadId: thread.id, taskGroupId });
    },
    sendJson,
    state: () => state,
    stopRunIds(runIds) {
      calls.stopRunIds.push([...runIds]);
      return Promise.resolve([...runIds]);
    },
    threadAccessibleToAuth(auth, thread) {
      return Boolean(auth?.ok && thread.workspaceId === "owner");
    },
    threadMessageInitialLimit: 2,
    threadSummary(thread) {
      return { id: thread.id, workspaceId: thread.workspaceId, updatedAt: thread.updatedAt || "" };
    },
    weixinForwardTargetsForWorkspace(workspaceId) {
      return workspaceId === "owner" ? [{ id: "wx-target" }] : [];
    },
  }, overrides);
  return { routes: createSingleWindowGroupChatApiRoutes(deps), calls, state, deps };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    {
      method,
      url: path,
      body: options.body || {},
      auth: options.auth,
      ownerDenied: options.ownerDenied,
    },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  const body = String(res.headers["Content-Type"] || "").startsWith("application/json") && res.body ? parseBody(res) : null;
  return { result, res, body };
}

async function main() {
  assert.equal(SINGLE_WINDOW_GROUP_CHAT_API_ROUTE_SPECS.length, 3);
  {
    const { routes } = makeRoutes();
    assert.equal(routes.match({ method: "POST", path: "/api/single-window" }).id, "single-window");
    assert.equal(routes.match({ method: "PATCH", path: "/api/threads/thread-1/group-chat" }).id, "thread-group-chat-update");
    assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-1/messages/msg-1/revoke" }).id, "thread-message-revoke");
    assert.equal(routes.match({ method: "GET", path: "/api/single-window" }), null);
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", messageMode: "chat", groupChat: true, messageLimit: 5 },
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "group-thread");
    assert.equal(got.body.groupChatAvailable, true);
    assert.equal(got.body.weixinChatAvailable, true);
    assert.equal(got.body.groupChatThread.id, "group-thread");
    assert.equal(got.body.weixinChatThread, null);
    assert.equal(calls.compactWithPage.some((item) => item.threadId === "group-thread" && item.options.groupChat === true), true);
    assert.equal(calls.broadcast[0].type, "thread.updated");
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", messageMode: "chat", messageLimit: 5 },
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "private-thread");
    assert.equal(got.body.groupChatAvailable, true);
    assert.equal(got.body.weixinChatAvailable, true);
    assert.equal(got.body.groupChatThread, null);
    assert.equal(got.body.weixinChatThread, null);
    assert.deepEqual(calls.compactWithPage.map((item) => item.threadId), ["private-thread"]);
  }

  {
    const { routes, calls } = makeRoutes({
      ensureSingleWindowThread(workspaceId) {
        return {
          id: "child-private-thread",
          singleWindow: true,
          workspaceId,
          messages: [{ id: "child-private-1", taskGroupId: "chat", content: "child private" }],
        };
      },
      findGroupChatThreadForWorkspace() {
        return null;
      },
      findWeixinSingleWindowThreadForWorkspace() {
        return null;
      },
      weixinForwardTargetsForWorkspace() {
        return [];
      },
    });
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "child-a", messageMode: "chat", groupChat: true, messageLimit: 5 },
      auth: { ok: true, workspaceId: "child-a" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "child-private-thread");
    assert.equal(got.body.groupChatAvailable, false);
    assert.deepEqual(calls.compactWithPage.map((item) => item.threadId), ["child-private-thread"]);
    assert.equal(calls.compactWithPage[0].options.groupChat, false);
  }

  {
    const { routes, state } = makeRoutes({
      findGroupChatThreadForWorkspace() {
        return null;
      },
    });
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", messageMode: "chat", groupChat: true, messageLimit: 5 },
      auth: { ok: true, workspaceId: "owner", owner: true },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "created-group-thread");
    assert.equal(got.body.groupChatAvailable, true);
    assert.equal(state.threads[0].id, "created-group-thread");
    assert.equal(state.threads.find((thread) => thread.id === "private-thread").chatGroup, undefined);
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", messageLimit: 5 },
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "private-thread");
    assert.equal(got.body.thread.page.mode, "chat");
    assert.deepEqual(calls.compactWithPage.map((item) => item.threadId), ["private-thread"]);
  }

  {
    const { routes } = makeRoutes();
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", weixinChat: true, messageMode: "chat" },
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.thread.id, "weixin-thread");
    assert.equal(got.body.weixinChatThreadId, "weixin-thread");
    assert.equal(got.body.weixinChatThread.id, "weixin-thread");
    assert.equal(got.body.groupChatThread, null);
  }

  {
    const { routes, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/single-window", {
      body: { workspaceId: "owner", messageMode: "tasks", taskGroupId: "task-detail-route" },
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.equal(got.body.caseTopicThreads.length, 1);
    assert.equal(got.body.caseTopicThreads[0].id, "case-topic");
    assert.deepEqual(
      calls.compactWithPage.find((item) => item.threadId === "private-thread").options.taskGroupId,
      "task-detail-route",
    );
  }

  {
    const { routes, state, calls } = makeRoutes();
    const got = await request(routes, "PATCH", "/api/threads/group-thread/group-chat", {
      body: { enabled: true, memberWorkspaceIds: ["child-a", "missing", "child-b"] },
    });
    assert.equal(got.res.statusCode, 200);
    assert.deepEqual(state.threads[1].chatGroup.memberWorkspaceIds, ["child-a", "child-b"]);
    assert.equal(state.threads[1].chatGroup.createdAt, "old");
    assert.equal(state.threads[1].updatedAt, "2026-05-14T17:00:00.000Z");
    assert.equal(calls.requireOwner.length, 1);
    assert.equal(calls.saveState.length, 1);
    assert.equal(calls.broadcast[0].type, "thread.updated");
  }

  {
    const { routes } = makeRoutes();
    assert.equal((await request(routes, "PATCH", "/api/threads/missing/group-chat")).res.statusCode, 404);
    assert.equal((await request(routes, "PATCH", "/api/threads/normal-thread/group-chat")).res.statusCode, 400);
    assert.equal((await request(routes, "PATCH", "/api/threads/group-thread/group-chat", { ownerDenied: true })).res.statusCode, 403);
  }

  {
    const { routes, state } = makeRoutes();
    const got = await request(routes, "PATCH", "/api/threads/private-thread/group-chat", {
      body: { enabled: true, memberWorkspaceIds: ["child-a"] },
    });
    assert.equal(got.res.statusCode, 409);
    assert.equal(got.body.error, "Cannot convert an existing private task thread into group chat");
    assert.equal(state.threads.find((thread) => thread.id === "private-thread").chatGroup, undefined);
  }

  {
    const { routes, state, calls } = makeRoutes();
    const got = await request(routes, "POST", "/api/threads/group-thread/messages/msg-user/revoke", {
      auth: { ok: true, workspaceId: "owner" },
    });
    assert.equal(got.res.statusCode, 200);
    assert.deepEqual(got.body.stoppedRunIds, ["run-ai"]);
    assert.deepEqual(calls.stopRunIds[0], ["run-ai"]);
    assert.deepEqual(calls.removeRun[0], { threadId: "group-thread", runId: "run-ai", status: "idle" });
    assert.equal(state.threads[1].messages[0].content, "Message revoked");
    assert.equal(state.threads[1].messages[1].content, "Associated AI reply revoked");
    assert.equal(state.threads[1].messages[1].status, "cancelled");
    assert.equal(state.artifacts.some((artifact) => artifact.id === "art-user"), false);
    assert.equal(state.artifacts.some((artifact) => artifact.id === "art-assistant"), false);
    assert.equal(state.artifacts.some((artifact) => artifact.id === "art-keep"), true);
    assert.deepEqual(calls.saveState[0][1], { reason: "group-message-revoke", forceBackup: true });
    assert.equal(calls.broadcast.filter((event) => event.type === "message.updated").length, 2);
    assert.deepEqual(calls.schedule[0], { threadId: "group-thread", taskGroupId: "group-chat" });
  }

  {
    const { routes } = makeRoutes();
    assert.equal((await request(routes, "POST", "/api/threads/missing/messages/msg-user/revoke", { auth: { ok: true } })).res.statusCode, 404);
    assert.equal((await request(routes, "POST", "/api/threads/group-thread/messages/missing/revoke", { auth: { ok: true } })).res.statusCode, 404);
    assert.equal((await request(routes, "POST", "/api/threads/group-thread/messages/msg-user/revoke", { auth: { ok: false } })).res.statusCode, 403);
  }

  {
    const err = new Error("stop failed");
    err.status = 503;
    const { routes } = makeRoutes({ stopRunIds: () => Promise.reject(err) });
    const got = await request(routes, "POST", "/api/threads/group-thread/messages/msg-user/revoke", { auth: { ok: true } });
    assert.equal(got.res.statusCode, 503);
    assert.match(got.body.error, /stop failed/);
  }

  assert.throws(() => createSingleWindowGroupChatApiRoutes({}), /require authenticateRequest/);
}

main().then(() => {
  console.log("single-window group chat api routes tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
