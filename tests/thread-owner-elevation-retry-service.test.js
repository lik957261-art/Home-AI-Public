"use strict";

const assert = require("node:assert/strict");
const {
  createThreadOwnerElevationRetryService,
  ownerElevationOnceTokenFromBody,
  precedingUserMessageForAssistant,
  sanitizeOwnerElevationScope,
} = require("../adapters/thread-owner-elevation-retry-service");

const OWNER_AUTH = { isOwner: true, workspaceId: "owner", principalId: "owner-principal" };

function baseThread(overrides = {}) {
  const user = Object.assign({
    id: "msg_user_1",
    role: "user",
    content: "Please perform the elevated maintenance action",
    status: "done",
    taskGroupId: "task_1",
    reasoningEffort: "medium",
    singleWindowMode: "task",
  }, overrides.userMessage || {});
  const assistant = Object.assign({
    id: "msg_assistant_1",
    role: "assistant",
    content: "Approval required",
    status: "done",
    taskGroupId: "task_1",
    elevationRequired: true,
    elevationScope: "owner_high_privilege",
    reasoningEffort: "low",
    singleWindowMode: "task",
  }, overrides.sourceMessage || {});
  return Object.assign({
    id: "thread_1",
    workspaceId: "child_workspace",
    status: "idle",
    messages: [user, assistant],
  }, overrides.thread || {});
}

function compactThread(thread) {
  return {
    id: thread.id,
    status: thread.status,
    updatedAt: thread.updatedAt || "",
    messageIds: (thread.messages || []).map((message) => message.id),
  };
}

function compactMessage(message) {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    runId: message.runId || null,
    elevatedFromMessageId: message.elevatedFromMessageId || "",
  };
}

function threadSummary(thread) {
  return {
    id: thread.id,
    status: thread.status,
    messageCount: (thread.messages || []).length,
  };
}

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    gatewayRouting: [],
    removedRuns: [],
    saved: 0,
    startedRuns: [],
  };
  let idCounter = 0;
  const service = createThreadOwnerElevationRetryService(Object.assign({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    nowIso: () => "2026-05-15T04:05:06.000Z",
    makeId: (prefix) => {
      idCounter += 1;
      return `${prefix}_retry_${idCounter}`;
    },
    gatewayRoutingForModelRun: (auth, text, options) => {
      calls.gatewayRouting.push({ auth, text, options });
      return {
        securityLevel: "owner-maintenance",
        maintenance: true,
        maintenanceCategory: options.elevationScope,
      };
    },
    ownerElevationInstructions: ({ elevationScope }) => `approved:${elevationScope}`,
    runConcurrencyError: () => null,
    runConcurrencySnapshot: () => ({ activeGlobal: 0 }),
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    startRunForThread: async (thread, userMessage, assistantMessage, runOptions) => {
      calls.startedRuns.push({ thread, userMessage, assistantMessage, runOptions });
      assistantMessage.runId = "web_retry_1";
      assistantMessage.status = "running";
      thread.status = "running";
      return {
        run_id: "web_retry_1",
        status: "started",
        engine: "responses",
      };
    },
    removeThreadActiveRun: (thread, runId, idleStatus) => calls.removedRuns.push({ threadId: thread.id, runId, idleStatus }),
    compactThread,
    compactMessage,
    threadSummary,
  }, overrides));
  return { calls, service };
}

function testPureHelpers() {
  assert.equal(sanitizeOwnerElevationScope("shared_skill_write"), "shared_skill_write");
  assert.equal(sanitizeOwnerElevationScope("../bad"), "owner_high_privilege");
  assert.equal(ownerElevationOnceTokenFromBody({ ownerElevationOnceToken: "camel" }), "camel");
  assert.equal(ownerElevationOnceTokenFromBody({ owner_elevation_once_token: "snake" }), "snake");

  const thread = baseThread({
    thread: {
      messages: [
        { id: "u1", role: "user", taskGroupId: "a" },
        { id: "a1", role: "assistant", taskGroupId: "a" },
        { id: "u2", role: "user", taskGroupId: "b" },
      ],
    },
  });
  assert.equal(precedingUserMessageForAssistant(thread, { id: "a1", taskGroupId: "a" }).id, "u1");
}

async function testValidationResultsPreserveHandlerStatusAndPayloads() {
  const { service } = makeHarness();
  assert.deepEqual(await service.retryOwnerElevation({
    ownerAuth: { workspaceId: "child" },
    thread: baseThread(),
    messageId: "msg_assistant_1",
    body: {},
  }), {
    ok: false,
    status: 403,
    payload: { error: "Owner access is required" },
    code: "owner_required",
  });

  assert.equal((await service.retryOwnerElevation({ ownerAuth: OWNER_AUTH, thread: null, body: {} })).status, 404);

  const invalidBody = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread: baseThread(),
    messageId: "msg_assistant_1",
    body: { __error: new Error("bad json") },
  });
  assert.equal(invalidBody.status, 400);
  assert.deepEqual(invalidBody.payload, { error: "bad json" });

  const notWaiting = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread: baseThread({ sourceMessage: { elevationRequired: false } }),
    messageId: "msg_assistant_1",
    body: {},
  });
  assert.equal(notWaiting.status, 409);
  assert.deepEqual(notWaiting.payload, {
    error: "This message is not waiting for Owner elevation approval",
  });

  const noUser = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread: {
      id: "thread_no_user",
      status: "idle",
      messages: [{ id: "assistant_only", role: "assistant", elevationRequired: true }],
    },
    messageId: "assistant_only",
    body: {},
  });
  assert.equal(noUser.status, 400);
  assert.deepEqual(noUser.payload, { error: "Original user message was not found" });
}

async function testConcurrencyErrorStopsBeforeQueuedMutation() {
  const thread = baseThread();
  const { calls, service } = makeHarness({
    runConcurrencyError: (workspaceId) => {
      assert.equal(workspaceId, "owner");
      return {
        status: 429,
        message: "Too many active runs",
        code: "run_concurrency_limit",
        snapshot: { activeGlobal: 2 },
      };
    },
  });

  const response = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread,
    messageId: "msg_assistant_1",
    body: {},
  });

  assert.equal(response.status, 429);
  assert.deepEqual(response.payload, {
    error: "Too many active runs",
    code: "run_concurrency_limit",
    concurrency: { activeGlobal: 2 },
  });
  assert.equal(thread.messages.length, 2);
  assert.equal(calls.saved, 0);
  assert.deepEqual(calls.broadcasts, []);
  assert.deepEqual(calls.gatewayRouting, []);
}

async function testSuccessCreatesQueuedRetryAndStartsOwnerRun() {
  const thread = baseThread({
    sourceMessage: {
      elevationScope: "shared_skill_write",
      reasoningEffort: "low",
      singleWindowMode: "chat",
    },
  });
  const { calls, service } = makeHarness();

  const response = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread,
    messageId: "msg_assistant_1",
    body: {
      elevation_scope: "shared_skill_write",
      owner_elevation_once_token: "one-shot-token",
    },
  });

  assert.equal(response.status, 202);
  assert.equal(response.payload.ok, true);
  assert.deepEqual(response.payload.run, {
    run_id: "web_retry_1",
    status: "started",
    engine: "responses",
  });
  assert.equal(thread.messages.length, 3);

  const retryMessage = thread.messages[2];
  assert.equal(retryMessage.id, "msg_retry_1");
  assert.equal(retryMessage.role, "assistant");
  assert.equal(retryMessage.runId, "web_retry_1");
  assert.equal(retryMessage.status, "running");
  assert.equal(retryMessage.actorWorkspaceId, "owner");
  assert.equal(retryMessage.elevatedFromMessageId, "msg_assistant_1");
  assert.equal(retryMessage.taskGroupId, "task_1");
  assert.equal(retryMessage.reasoningEffort, "medium");
  assert.equal(retryMessage.singleWindowMode, "task");
  assert.deepEqual(retryMessage.runOptions, {
    reasoning_effort: "medium",
    singleWindowMode: "task",
    actorWorkspaceId: "owner",
    gatewayRouting: {
      securityLevel: "owner-maintenance",
      maintenance: true,
      maintenanceCategory: "shared_skill_write",
    },
    instructions: "approved:shared_skill_write",
  });

  assert.deepEqual(calls.gatewayRouting, [{
    auth: OWNER_AUTH,
    text: "Please perform the elevated maintenance action",
    options: {
      actorWorkspaceId: "owner",
      maintenanceMode: true,
      ownerElevationOnceToken: "one-shot-token",
      elevationScope: "shared_skill_write",
    },
  }]);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts.length, 1);
  assert.deepEqual(calls.broadcasts[0], {
    type: "message.updated",
    threadId: "thread_1",
    message: {
      id: "msg_retry_1",
      role: "assistant",
      status: "queued",
      runId: null,
      elevatedFromMessageId: "msg_assistant_1",
    },
    thread: { id: "thread_1", status: "queued", messageCount: 3 },
  });
  assert.equal(calls.startedRuns[0].userMessage.id, "msg_user_1");
  assert.equal(calls.startedRuns[0].assistantMessage.id, "msg_retry_1");
}

async function testGatewayRoutingFailureReturnsBoundaryErrorWithoutRetryMessage() {
  const thread = baseThread();
  const err = new Error("Owner high-privilege authorization is not active. Use the Owner navigation permission control before running this request.");
  err.status = 409;
  err.code = "owner_high_privilege_required";
  err.elevationRequired = true;
  err.elevationScope = "owner_high_privilege";
  const { calls, service } = makeHarness({
    gatewayRoutingForModelRun: () => { throw err; },
  });

  const response = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread,
    messageId: "msg_assistant_1",
    body: { ownerElevationOnceToken: "one-shot-token" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(response.payload, {
    error: err.message,
    code: "owner_high_privilege_required",
    elevationRequired: true,
    elevationScope: "owner_high_privilege",
    thread: {
      id: "thread_1",
      status: "idle",
      updatedAt: "",
      messageIds: ["msg_user_1", "msg_assistant_1"],
    },
  });
  assert.equal(thread.messages.length, 2);
  assert.equal(calls.saved, 0);
  assert.deepEqual(calls.broadcasts, []);
}

async function testStartRunFailureMarksAssistantFailedAndBroadcastsRunFailed() {
  const thread = baseThread();
  const startError = new Error("Gateway unavailable");
  startError.status = 503;
  const { calls, service } = makeHarness({
    startRunForThread: async (_thread, _userMessage, assistantMessage) => {
      assistantMessage.runId = "web_failed_1";
      throw startError;
    },
  });

  const response = await service.retryOwnerElevation({
    ownerAuth: OWNER_AUTH,
    thread,
    messageId: "msg_assistant_1",
    body: {},
  });

  assert.equal(response.status, 503);
  assert.equal(response.payload.error, "Gateway unavailable");
  assert.equal(response.payload.code, "owner_elevation_retry_failed");
  assert.equal(response.payload.thread.status, "queued");

  const retryMessage = thread.messages[2];
  assert.equal(retryMessage.status, "failed");
  assert.equal(retryMessage.error, "Gateway unavailable");
  assert.equal(retryMessage.failedAt, "2026-05-15T04:05:06.000Z");
  assert.deepEqual(calls.removedRuns, [{
    threadId: "thread_1",
    runId: "web_failed_1",
    idleStatus: "failed",
  }]);
  assert.equal(calls.saved, 2);
  assert.equal(calls.broadcasts.length, 2);
  assert.equal(calls.broadcasts[0].type, "message.updated");
  assert.deepEqual(calls.broadcasts[1], {
    type: "run.failed",
    threadId: "thread_1",
    message: {
      id: "msg_retry_1",
      role: "assistant",
      status: "failed",
      runId: "web_failed_1",
      elevatedFromMessageId: "msg_assistant_1",
    },
    thread: { id: "thread_1", status: "queued", messageCount: 3 },
  });
}

(async () => {
  testPureHelpers();
  await testValidationResultsPreserveHandlerStatusAndPayloads();
  await testConcurrencyErrorStopsBeforeQueuedMutation();
  await testSuccessCreatesQueuedRetryAndStartsOwnerRun();
  await testGatewayRoutingFailureReturnsBoundaryErrorWithoutRetryMessage();
  await testStartRunFailureMarksAssistantFailedAndBroadcastsRunFailed();
  console.log("thread owner elevation retry service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
