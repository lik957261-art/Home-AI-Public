"use strict";

const assert = require("node:assert/strict");
const {
  createCompactThreadForMessageCreatePlan,
  createThreadMessageRunRouteService,
} = require("../adapters/thread-message-run-route-service");

function makeResponse() {
  return {
    sends: [],
  };
}

function sendJson(res, status, payload) {
  res.sends.push({ status, payload });
}

function baseThread(overrides = {}) {
  return Object.assign({
    id: "thread-1",
    workspaceId: "owner",
    messages: [],
    status: "idle",
  }, overrides);
}

function makeRouteHarness(overrides = {}) {
  const calls = {
    attach: [],
    auth: [],
    direct: [],
    find: [],
    ownerRetry: [],
    read: [],
    sent: [],
  };
  const thread = overrides.thread === undefined ? baseThread() : overrides.thread;
  const messageCreateService = overrides.threadMessageCreateService || {
    prepareThreadMessageCreate() {
      return overrides.plan || {
        ok: true,
        nextAction: "plain-message",
        userMessage: { id: "msg-user", role: "user" },
        responseDescriptor: { type: "thread", options: {} },
      };
    },
    commitPlainMessage(targetThread, plan) {
      targetThread.messages.push(plan.userMessage);
      return overrides.plainResult || { ok: true, status: 201, thread: targetThread };
    },
    async commitRunMessageAndDispatch() {
      return overrides.dispatchResult || { ok: true, status: 202, run: { status: "started" } };
    },
  };
  const directCreateService = overrides.threadDirectCreateExecutionService || {
    async executeDirectCreate(request) {
      calls.direct.push(request);
      const compact = request.compactResponseThread();
      return overrides.directResult || {
        ok: true,
        status: 201,
        response: { ok: true, todo: { id: "todo-1" }, thread: compact },
      };
    },
  };
  const ownerRetryService = overrides.threadOwnerElevationRetryService || {
    async retryOwnerElevation(request) {
      calls.ownerRetry.push(request);
      return overrides.ownerRetryResult || {
        ok: true,
        status: 202,
        payload: { ok: true, run: { status: "started" } },
      };
    },
  };
  const routeService = createThreadMessageRunRouteService({
    findThreadForRequest(req, threadId) {
      calls.find.push({ req, threadId });
      return thread;
    },
    async readBody(req) {
      calls.read.push(req);
      if (overrides.readThrows) throw new Error(overrides.readThrows);
      return overrides.body || { text: "hello" };
    },
    authenticateRequest(req) {
      calls.auth.push(req);
      return overrides.auth || { ok: true, workspaceId: "owner" };
    },
    requireOwner(req, res) {
      if (overrides.requireOwner) return overrides.requireOwner(req, res);
      return overrides.ownerAuth === undefined ? { isOwner: true, workspaceId: "owner" } : overrides.ownerAuth;
    },
    sendJson(res, status, payload) {
      calls.sent.push({ status, payload });
      sendJson(res, status, payload);
    },
    attachUploadedArtifactsToMessage(targetThread, message) {
      calls.attach.push({ threadId: targetThread?.id || "", messageId: message?.id || "" });
    },
    nowIso: () => "2026-05-15T06:07:08.000Z",
    compactThread: (targetThread) => ({ id: targetThread.id, mode: "thread", messageCount: targetThread.messages.length }),
    compactThreadWithMessagePage: (targetThread, options) => ({
      id: targetThread.id,
      mode: "message-page",
      options,
      messageCount: targetThread.messages.length,
    }),
    threadMessageInitialLimit: 60,
    threadMessageCreateService: messageCreateService,
    threadDirectCreateExecutionService: directCreateService,
    threadOwnerElevationRetryService: ownerRetryService,
  });
  return { calls, routeService, thread };
}

function testCompactThreadForMessageCreatePlan() {
  const calls = [];
  const compact = createCompactThreadForMessageCreatePlan({
    threadMessageInitialLimit: 25,
    compactThread: (thread) => ({ id: thread.id, compact: "thread" }),
    compactThreadWithMessagePage: (thread, options) => {
      calls.push({ threadId: thread.id, options });
      return { id: thread.id, compact: "page", options };
    },
  });

  assert.deepEqual(compact({ id: "thread-a" }, { responseDescriptor: { type: "thread" } }), {
    id: "thread-a",
    compact: "thread",
  });
  assert.deepEqual(compact({ id: "thread-b" }, {
    responseDescriptor: {
      type: "message-page",
      options: { mode: "chat", taskGroupId: "chat", limit: 0 },
    },
  }), {
    id: "thread-b",
    compact: "page",
    options: { mode: "chat", taskGroupId: "chat", limit: 25 },
  });
  assert.deepEqual(calls, [{
    threadId: "thread-b",
    options: { mode: "chat", taskGroupId: "chat", limit: 25 },
  }]);
}

async function testCreateValidationFailureUsesPlanResponse() {
  const { calls, routeService } = makeRouteHarness({
    plan: {
      ok: false,
      status: 403,
      error: "blocked",
      response: {
        error: "blocked",
        code: "gateway_security_boundary",
        elevationRequired: true,
      },
    },
  });
  const res = makeResponse();
  const result = await routeService.handleThreadMessageCreate(
    { id: "req-1" },
    res,
    null,
    { threadId: "thread-1" },
  );

  assert.equal(result.status, 403);
  assert.deepEqual(res.sends, [{
    status: 403,
    payload: {
      error: "blocked",
      code: "gateway_security_boundary",
      elevationRequired: true,
    },
  }]);
  assert.equal(calls.auth.length, 1);
  assert.equal(calls.attach.length, 0);
}

async function testCreateBodyReadErrorsUseControlledResponses() {
  {
    const { calls, routeService } = makeRouteHarness({ readThrows: "request body too large" });
    const res = makeResponse();
    const result = await routeService.handleThreadMessageCreate(
      { id: "req-too-large" },
      res,
      null,
      { threadId: "thread-1" },
    );

    assert.equal(result.status, 413);
    assert.deepEqual(res.sends, [{
      status: 413,
      payload: {
        error: "Message is too large. Please attach it as a file or split it into smaller messages.",
        code: "message_body_too_large",
      },
    }]);
    assert.equal(calls.auth.length, 0);
    assert.equal(calls.attach.length, 0);
  }

  {
    const { calls, routeService } = makeRouteHarness({ readThrows: "invalid JSON body" });
    const res = makeResponse();
    const result = await routeService.handleThreadMessageCreate(
      { id: "req-bad-json" },
      res,
      null,
      { threadId: "thread-1" },
    );

    assert.equal(result.status, 400);
    assert.deepEqual(res.sends, [{
      status: 400,
      payload: {
        error: "invalid JSON body",
        code: "invalid_request_body",
      },
    }]);
    assert.equal(calls.auth.length, 0);
    assert.equal(calls.attach.length, 0);
  }
}

async function testPlainMessageUsesContextAuthAndCompactDescriptor() {
  const thread = baseThread({ messages: [] });
  const plan = {
    ok: true,
    nextAction: "plain-message",
    userMessage: { id: "msg-user", role: "user" },
    responseDescriptor: {
      type: "message-page",
      options: { mode: "chat", taskGroupId: "group-chat", groupChat: true },
    },
  };
  const { calls, routeService } = makeRouteHarness({ thread, plan });
  const res = makeResponse();
  const auth = { ok: true, workspaceId: "child" };

  const result = await routeService.handleThreadMessageCreate(
    { id: "req-plain" },
    res,
    null,
    { threadId: "thread-1", auth },
  );

  assert.equal(result.status, 201);
  assert.deepEqual(calls.auth, []);
  assert.deepEqual(calls.attach, [{ threadId: "thread-1", messageId: "msg-user" }]);
  assert.deepEqual(res.sends[0], {
    status: 201,
    payload: {
      ok: true,
      thread: {
        id: "thread-1",
        mode: "message-page",
        options: { mode: "chat", taskGroupId: "group-chat", groupChat: true, limit: 60 },
        messageCount: 1,
      },
    },
  });
}

async function testDirectCreateReceivesCompactResponseCallback() {
  const thread = baseThread();
  const plan = {
    ok: true,
    nextAction: "direct-todo-create",
    userMessage: { id: "msg-user", role: "user" },
    assistantMessage: { id: "msg-assistant", role: "assistant" },
    responseDescriptor: { type: "thread", options: {} },
  };
  const { calls, routeService } = makeRouteHarness({ thread, plan });
  const res = makeResponse();

  const result = await routeService.handleThreadMessageCreate(
    { id: "req-direct" },
    res,
    null,
    { threadId: "thread-1", auth: { ok: true } },
  );

  assert.equal(result.status, 201);
  assert.equal(calls.direct.length, 1);
  assert.equal(calls.direct[0].thread, thread);
  assert.equal(calls.direct[0].plan, plan);
  assert.deepEqual(res.sends[0], {
    status: 201,
    payload: {
      ok: true,
      todo: { id: "todo-1" },
      thread: { id: "thread-1", mode: "thread", messageCount: 0 },
    },
  });
}

async function testRunDispatchSuccessAndFailurePayloads() {
  {
    const plan = {
      ok: true,
      nextAction: "start-run",
      userMessage: { id: "msg-user", role: "user" },
      responseDescriptor: { type: "thread", options: {} },
    };
    const { routeService } = makeRouteHarness({
      plan,
      dispatchResult: { ok: true, status: 202, run: { run_id: "run-1", status: "started" } },
    });
    const res = makeResponse();
    await routeService.handleThreadMessageCreate({ id: "req-run" }, res, null, { threadId: "thread-1", auth: { ok: true } });
    assert.deepEqual(res.sends[0], {
      status: 202,
      payload: {
        run: { run_id: "run-1", status: "started" },
        thread: { id: "thread-1", mode: "thread", messageCount: 0 },
      },
    });
  }

  {
    const plan = {
      ok: true,
      nextAction: "start-run",
      userMessage: { id: "msg-user", role: "user" },
      responseDescriptor: { type: "thread", options: {} },
    };
    const { routeService } = makeRouteHarness({
      plan,
      dispatchResult: { ok: false, status: 503, error: "Gateway unavailable" },
    });
    const res = makeResponse();
    await routeService.handleThreadMessageCreate({ id: "req-run-failed" }, res, null, { threadId: "thread-1", auth: { ok: true } });
    assert.deepEqual(res.sends[0], {
      status: 503,
      payload: {
        error: "Gateway unavailable",
        thread: { id: "thread-1", mode: "thread", messageCount: 0 },
      },
    });
  }
}

async function testOwnerElevationPrechecksAndBodyParseFailure() {
  {
    const { calls, routeService } = makeRouteHarness({ ownerAuth: null });
    const res = makeResponse();
    const result = await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
      threadId: "thread-1",
      messageId: "msg-assistant",
    });
    assert.equal(result.status, 401);
    assert.deepEqual(res.sends, []);
    assert.deepEqual(calls.find, []);
  }

  {
    const { routeService } = makeRouteHarness({ thread: null });
    const res = makeResponse();
    await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
      threadId: "missing-thread",
      messageId: "msg-assistant",
    });
    assert.deepEqual(res.sends, [{ status: 404, payload: { error: "Thread not found" } }]);
  }

  {
    const thread = baseThread({
      messages: [{ id: "msg-user", role: "user" }],
    });
    const { routeService } = makeRouteHarness({ thread });
    const res = makeResponse();
    await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
      threadId: "thread-1",
      messageId: "msg-user",
    });
    assert.deepEqual(res.sends, [{ status: 404, payload: { error: "Assistant message not found" } }]);
  }

  {
    const thread = baseThread({
      messages: [{ id: "msg-assistant", role: "assistant", elevationRequired: false }],
    });
    const { routeService } = makeRouteHarness({ thread });
    const res = makeResponse();
    await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
      threadId: "thread-1",
      messageId: "msg-assistant",
    });
    assert.deepEqual(res.sends, [{
      status: 409,
      payload: { error: "This message is not waiting for Owner elevation approval" },
    }]);
  }

  {
    const thread = baseThread({
      messages: [{ id: "msg-assistant", role: "assistant", elevationRequired: true }],
    });
    const { routeService } = makeRouteHarness({ thread, readThrows: "bad json" });
    const res = makeResponse();
    await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
      threadId: "thread-1",
      messageId: "msg-assistant",
    });
    assert.deepEqual(res.sends, [{ status: 400, payload: { error: "bad json" } }]);
  }
}

async function testOwnerElevationDelegatesToRetryService() {
  const thread = baseThread({
    messages: [{ id: "msg-assistant", role: "assistant", elevationRequired: true }],
  });
  const body = { ownerElevationOnceToken: "one-shot-token" };
  const ownerAuth = { isOwner: true, workspaceId: "owner" };
  const { calls, routeService } = makeRouteHarness({ thread, body, ownerAuth });
  const res = makeResponse();

  const result = await routeService.handleThreadMessageOwnerElevation({ id: "req-owner" }, res, null, {
    threadId: "thread-1",
    messageId: "msg-assistant",
  });

  assert.equal(result.status, 202);
  assert.equal(calls.ownerRetry.length, 1);
  assert.equal(calls.ownerRetry[0].ownerAuth, ownerAuth);
  assert.equal(calls.ownerRetry[0].thread, thread);
  assert.equal(calls.ownerRetry[0].messageId, "msg-assistant");
  assert.equal(calls.ownerRetry[0].message, thread.messages[0]);
  assert.equal(calls.ownerRetry[0].body, body);
  assert.deepEqual(res.sends, [{
    status: 202,
    payload: { ok: true, run: { status: "started" } },
  }]);
}

(async () => {
  testCompactThreadForMessageCreatePlan();
  await testCreateValidationFailureUsesPlanResponse();
  await testCreateBodyReadErrorsUseControlledResponses();
  await testPlainMessageUsesContextAuthAndCompactDescriptor();
  await testDirectCreateReceivesCompactResponseCallback();
  await testRunDispatchSuccessAndFailurePayloads();
  await testOwnerElevationPrechecksAndBodyParseFailure();
  await testOwnerElevationDelegatesToRetryService();
  console.log("thread-message-run-route-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
