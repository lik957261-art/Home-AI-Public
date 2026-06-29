"use strict";

const assert = require("node:assert/strict");
const {
  QUEUED_CHAT_INSTRUCTIONS,
  QUEUED_TASK_INSTRUCTIONS,
  createGatewayRunQueueProjectionService,
  normalizeSingleWindowMode,
  queuedRunInstructions,
} = require("../adapters/gateway-run-queue-projection-service");

function testQueuedInstructionTextAndRunOptionMerge() {
  assert.equal(normalizeSingleWindowMode(" CHAT "), "chat");
  assert.equal(normalizeSingleWindowMode("task"), "task");
  assert.equal(queuedRunInstructions("chat"), QUEUED_CHAT_INSTRUCTIONS);
  assert.equal(queuedRunInstructions("task"), QUEUED_TASK_INSTRUCTIONS);

  const service = createGatewayRunQueueProjectionService();
  const runOptions = service.buildQueuedRunOptions({
    user: { id: "user_1", singleWindowMode: "task" },
    assistant: {
      id: "assistant_1",
      single_window_mode: "chat",
      reasoningEffort: "high",
      runOptions: {
        instructions: "previous instruction",
        reasoning_effort: "low",
        model: "gpt-test",
        gatewayRouting: { source: "mail" },
      },
    },
  });

  assert.equal(runOptions.singleWindowMode, "chat");
  assert.equal(runOptions.reasoning_effort, "high");
  assert.equal(runOptions.model, "gpt-test");
  assert.deepEqual(runOptions.gatewayRouting, { source: "mail" });
  assert.equal(runOptions.instructions, `previous instruction\n\n${QUEUED_CHAT_INSTRUCTIONS}`);

  const taskOptions = service.buildQueuedRunOptions({
    user: { singleWindowMode: "task" },
    assistant: { runOptions: {} },
  });
  assert.equal(taskOptions.singleWindowMode, "task");
  assert.equal(taskOptions.reasoning_effort, "");
  assert.equal(taskOptions.instructions, QUEUED_TASK_INSTRUCTIONS);
}

function testQueuedAssistantFactoryAndHistoryCompactionAreInjected() {
  const compactCalls = [];
  const service = createGatewayRunQueueProjectionService({
    nowIso: () => "2026-05-15T05:06:07.000Z",
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
      externalDelivery: { source: "mail", status: "waiting" },
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
  assert.deepEqual(message.externalDelivery, { source: "mail", status: "waiting" });

  const compacted = service.compactQueuedConversationHistory(["a", "b", "c"], 2, 100, { principal_id: "owner" });
  assert.deepEqual(compacted, ["b", "c"]);
  assert.deepEqual(compactCalls, [{
    messages: ["a", "b", "c"],
    maxMessages: 2,
    maxChars: 100,
    policy: { principal_id: "owner" },
  }]);
}

testQueuedInstructionTextAndRunOptionMerge();
testQueuedAssistantFactoryAndHistoryCompactionAreInjected();

console.log("gateway run queue projection service tests passed");
