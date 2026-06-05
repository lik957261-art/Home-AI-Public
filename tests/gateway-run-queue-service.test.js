"use strict";

const assert = require("node:assert/strict");
const {
  QUEUED_CHAT_INSTRUCTIONS,
  QUEUED_TASK_INSTRUCTIONS,
  createGatewayRunQueueService,
} = require("../adapters/gateway-run-queue-service");

function compactMessage(message) {
  return {
    id: message.id,
    status: message.status,
    runId: message.runId || "",
    error: message.error || "",
    failedAt: message.failedAt || "",
  };
}

function threadSummary(thread) {
  return {
    id: thread.id,
    status: thread.status,
    updatedAt: thread.updatedAt || "",
    activeRunIds: thread.activeRunIds || [],
  };
}

function queuedThread(overrides = {}) {
  const userMessage = Object.assign({
    id: "msg_user_1",
    role: "user",
    content: "Next queued input",
    status: "done",
    taskGroupId: "chat",
    singleWindowMode: "chat",
  }, overrides.userMessage || {});
  const assistantMessage = Object.assign({
    id: "msg_assistant_1",
    role: "assistant",
    content: "",
    status: "queued",
    runId: null,
    taskGroupId: "chat",
    reasoningEffort: "medium",
    singleWindowMode: "chat",
    runOptions: {
      existing: true,
      instructions: "original instructions",
      gatewayRouting: { source: "web" },
    },
  }, overrides.assistantMessage || {});
  return Object.assign({
    id: "thread_1",
    singleWindow: true,
    status: "queued",
    activeRunIds: [],
    activeRunId: null,
    messages: [userMessage, assistantMessage],
  }, overrides.thread || {});
}

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    failedHooks: [],
    saved: 0,
    scheduled: [],
    startedRuns: [],
  };
  const service = createGatewayRunQueueService(Object.assign({
    nowIso: () => "2026-05-15T05:06:07.000Z",
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage,
    threadSummary,
    startHermesRun: async (thread, userMessage, assistantMessage, runOptions) => {
      calls.startedRuns.push({ thread, userMessage, assistantMessage, runOptions });
      return { status: "started", run_id: "web_run_1", engine: "responses" };
    },
  }, overrides));
  return { calls, service };
}

function testActiveRunMutatorsUseLifecycleSemantics() {
  const { service } = makeHarness();
  const thread = { id: "thread_1", status: "queued", activeRunIds: ["run_a", "run_a"], activeRunId: "run_a" };

  service.addThreadActiveRun(thread, "run_b");
  assert.deepEqual(thread.activeRunIds, ["run_a", "run_b"]);
  assert.equal(thread.activeRunId, "run_b");

  service.replaceThreadActiveRun(thread, "run_b", "real_run_b");
  assert.deepEqual(thread.activeRunIds, ["run_a", "real_run_b"]);
  assert.equal(thread.activeRunId, "real_run_b");

  service.removeThreadActiveRun(thread, "real_run_b", "idle");
  assert.deepEqual(thread.activeRunIds, ["run_a"]);
  assert.equal(thread.activeRunId, "run_a");
  assert.equal(thread.status, "running");

  service.removeThreadActiveRun(thread, "run_a", "failed");
  assert.deepEqual(thread.activeRunIds, []);
  assert.equal(thread.activeRunId, null);
  assert.equal(thread.status, "failed");
}

function testQueuedInstructionTextAndRunOptionMerge() {
  const { service } = makeHarness();
  assert.equal(service.queuedRunInstructions("chat"), QUEUED_CHAT_INSTRUCTIONS);
  assert.equal(service.queuedRunInstructions("task"), QUEUED_TASK_INSTRUCTIONS);

  const pair = {
    user: { id: "user_1", singleWindowMode: "task" },
    assistant: {
      id: "assistant_1",
      single_window_mode: "chat",
      reasoningEffort: "high",
      runOptions: {
        instructions: "previous instruction",
        reasoning_effort: "low",
        model: "gpt-test",
        gatewayRouting: { source: "weixin" },
      },
    },
  };
  const runOptions = service.buildQueuedRunOptions(pair);
  assert.equal(runOptions.singleWindowMode, "chat");
  assert.equal(runOptions.reasoning_effort, "high");
  assert.equal(runOptions.model, "gpt-test");
  assert.deepEqual(runOptions.gatewayRouting, { source: "weixin" });
  assert.equal(runOptions.instructions, `previous instruction\n\n${QUEUED_CHAT_INSTRUCTIONS}`);

  const taskOptions = service.buildQueuedRunOptions({
    user: { singleWindowMode: "task" },
    assistant: { runOptions: {} },
  });
  assert.equal(taskOptions.singleWindowMode, "task");
  assert.equal(taskOptions.reasoning_effort, "");
  assert.equal(taskOptions.instructions, QUEUED_TASK_INSTRUCTIONS);
}

async function testStartNextQueuedRunStartsOldestQueuedPair() {
  const { calls, service } = makeHarness();
  const thread = queuedThread();
  const result = await service.startNextQueuedRunForTaskGroup(thread, "chat");

  assert.deepEqual(result, { status: "started", run_id: "web_run_1", engine: "responses" });
  assert.equal(calls.startedRuns.length, 1);
  assert.equal(calls.startedRuns[0].thread, thread);
  assert.equal(calls.startedRuns[0].userMessage.id, "msg_user_1");
  assert.equal(calls.startedRuns[0].assistantMessage.id, "msg_assistant_1");
  assert.equal(calls.startedRuns[0].runOptions.existing, true);
  assert.equal(calls.startedRuns[0].runOptions.reasoning_effort, "medium");
  assert.equal(calls.startedRuns[0].runOptions.singleWindowMode, "chat");
  assert.equal(calls.startedRuns[0].runOptions.instructions, `original instructions\n\n${QUEUED_CHAT_INSTRUCTIONS}`);
}

async function testStartNextQueuedRunWaitsWhenTaskGroupIsRunning() {
  const { calls, service } = makeHarness();
  const thread = queuedThread();
  thread.messages.push({
    id: "msg_running",
    role: "assistant",
    status: "running",
    runId: "web_running_1",
    taskGroupId: "chat",
  });

  const result = await service.startNextQueuedRunForTaskGroup(thread, "chat");

  assert.equal(result, null);
  assert.deepEqual(calls.startedRuns, []);
  assert.equal(thread.status, "queued");
}

async function testStartNextQueuedRunSetsIdleWhenQueueIsEmpty() {
  const { calls, service } = makeHarness();
  const thread = {
    id: "thread_empty",
    singleWindow: true,
    status: "queued",
    activeRunIds: [],
    messages: [],
  };

  const result = await service.startNextQueuedRunForTaskGroup(thread, "chat");

  assert.equal(result, null);
  assert.equal(thread.status, "idle");
  assert.equal(thread.updatedAt, "2026-05-15T05:06:07.000Z");
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.broadcasts, [{
    type: "thread.updated",
    thread: {
      id: "thread_empty",
      status: "idle",
      updatedAt: "2026-05-15T05:06:07.000Z",
      activeRunIds: [],
    },
  }]);
}

function testMarkQueuedRunStartFailedPreservesMutationAndBroadcast() {
  const thread = queuedThread();
  const failed = [];
  const { calls, service } = makeHarness({
    markRunFailed: (input) => {
      failed.push({
        threadId: input.thread.id,
        taskGroupId: input.taskGroupId,
        assistantMessageId: input.assistantMessage.id,
        runId: input.runId,
        error: input.error,
      });
      input.defaultMarkRunFailed(input);
    },
  });

  service.markQueuedRunStartFailed(thread, "chat", new Error("Gateway unavailable"));

  assert.deepEqual(failed, [{
    threadId: "thread_1",
    taskGroupId: "chat",
    assistantMessageId: "msg_assistant_1",
    runId: "",
    error: "Gateway unavailable",
  }]);
  const assistant = thread.messages[1];
  assert.equal(assistant.status, "failed");
  assert.equal(assistant.error, "Gateway unavailable");
  assert.equal(assistant.failedAt, "2026-05-15T05:06:07.000Z");
  assert.equal(assistant.updatedAt, "2026-05-15T05:06:07.000Z");
  assert.equal(thread.status, "failed");
  assert.equal(thread.updatedAt, "2026-05-15T05:06:07.000Z");
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.broadcasts, [{
    type: "run.failed",
    threadId: "thread_1",
    runId: "",
    message: {
      id: "msg_assistant_1",
      status: "failed",
      runId: "",
      error: "Gateway unavailable",
      failedAt: "2026-05-15T05:06:07.000Z",
    },
    thread: {
      id: "thread_1",
      status: "failed",
      updatedAt: "2026-05-15T05:06:07.000Z",
      activeRunIds: [],
    },
  }]);
}

function testMarkQueuedRunStartFailedFormatsGatewayCapacityError() {
  const thread = queuedThread();
  const { service } = makeHarness();
  const err = new Error("Gateway worker queue timed out for workspace_capacity.");
  err.code = "gateway_elastic_queue_timeout";
  err.details = { reason: "workspace_capacity", queueDepth: 2 };

  service.markQueuedRunStartFailed(thread, "chat", err);

  assert.match(thread.messages[1].error, /工作区的 AI 执行通道已满/);
  assert.doesNotMatch(thread.messages[1].error, /workspace_capacity/);
}

async function testScheduleNextQueuedRunUsesImmediateAndFailsQueuedStart() {
  const thread = queuedThread();
  const { calls, service } = makeHarness({
    scheduleImmediate: (fn) => {
      calls.scheduled.push(fn);
      return { scheduled: true };
    },
    startHermesRun: async () => {
      throw new Error("Gateway start rejected");
    },
  });

  service.scheduleNextQueuedRunForTaskGroup(thread, "chat");
  assert.equal(calls.scheduled.length, 1);

  await calls.scheduled[0]();

  assert.equal(thread.messages[1].status, "failed");
  assert.equal(thread.messages[1].error, "Gateway start rejected");
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "run.failed");

  service.scheduleNextQueuedRunForTaskGroup({ id: "not_single", singleWindow: false }, "chat");
  assert.equal(calls.scheduled.length, 1);
}

function testQueuedAssistantFactoryAndHistoryCompactionAreInjected() {
  const compactCalls = [];
  const { service } = makeHarness({
    makeAssistantMessageId: (prefix) => `${prefix}_assistant_1`,
    compactConversationHistory: (messages, maxMessages, maxChars, policy) => {
      compactCalls.push({ messages, maxMessages, maxChars, policy });
      return messages.slice(-maxMessages);
    },
  });

  const message = service.createQueuedAssistantMessage({
    taskGroupId: "chat",
    actorWorkspaceId: "child_workspace",
    reasoningEffort: "high",
    singleWindowMode: "chat",
    fields: {
      externalDelivery: { source: "weixin", status: "waiting" },
    },
  });

  assert.equal(message.id, "msg_assistant_1");
  assert.equal(message.role, "assistant");
  assert.equal(message.status, "queued");
  assert.equal(message.runId, null);
  assert.equal(message.createdAt, "2026-05-15T05:06:07.000Z");
  assert.equal(message.queuedAt, "2026-05-15T05:06:07.000Z");
  assert.equal(message.taskGroupId, "chat");
  assert.equal(message.actorWorkspaceId, "child_workspace");
  assert.equal(message.reasoningEffort, "high");
  assert.equal(message.singleWindowMode, "chat");
  assert.deepEqual(message.externalDelivery, { source: "weixin", status: "waiting" });

  const compacted = service.compactQueuedConversationHistory(["a", "b", "c"], 2, 100, { principal_id: "owner" });
  assert.deepEqual(compacted, ["b", "c"]);
  assert.deepEqual(compactCalls, [{
    messages: ["a", "b", "c"],
    maxMessages: 2,
    maxChars: 100,
    policy: { principal_id: "owner" },
  }]);
}

(async () => {
  testActiveRunMutatorsUseLifecycleSemantics();
  testQueuedInstructionTextAndRunOptionMerge();
  await testStartNextQueuedRunStartsOldestQueuedPair();
  await testStartNextQueuedRunWaitsWhenTaskGroupIsRunning();
  await testStartNextQueuedRunSetsIdleWhenQueueIsEmpty();
  testMarkQueuedRunStartFailedPreservesMutationAndBroadcast();
  testMarkQueuedRunStartFailedFormatsGatewayCapacityError();
  await testScheduleNextQueuedRunUsesImmediateAndFailsQueuedStart();
  testQueuedAssistantFactoryAndHistoryCompactionAreInjected();
  console.log("gateway-run-queue-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
