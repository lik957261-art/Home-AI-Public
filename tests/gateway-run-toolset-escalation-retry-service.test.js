"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunToolsetEscalationRetryService,
} = require("../adapters/gateway-run-toolset-escalation-retry-service");

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    immediate: [],
    notified: [],
    saved: 0,
    starts: [],
    updates: [],
  };
  let nowIndex = 0;
  const thread = {
    id: "thread_1",
    updatedAt: "old",
    events: [],
    messages: [
      { id: "user_1", role: "user", taskGroupId: "chat", content: "user task" },
      {
        id: "assistant_1",
        role: "assistant",
        replyToMessageId: "user_1",
        taskGroupId: "chat",
        runId: "run_1",
        status: "done",
        content: "old content",
        error: "old error",
        completedAt: "old-completed",
        failedAt: "old-failed",
        cancelledAt: "old-cancelled",
        runOptions: {
          instructions: "existing instruction",
          toolsetRouting: {
            mode: "model_first",
            selected_toolsets: ["file"],
            omitted_authorized_toolsets: ["web", "search", "browser", "vision"],
          },
          access_policy_context: {
            allowed_toolsets: ["file"],
            toolset_routing: {
              mode: "model_first",
              selected_toolsets: ["file"],
              omitted_authorized_toolsets: ["web", "search", "browser", "vision"],
            },
          },
        },
      },
    ],
  };
  const message = thread.messages[1];
  const service = createGatewayRunToolsetEscalationRetryService({
    addThreadEvent: (targetThread, event) => {
      targetThread.events.push(event);
    },
    broadcast: (payload) => calls.broadcasts.push(payload),
    broadcastMessageUpdated: (targetThread, targetMessage) => {
      calls.updates.push({ threadId: targetThread.id, message: targetMessage });
    },
    compactMessage: (targetMessage) => ({
      id: targetMessage.id,
      status: targetMessage.status,
      error: targetMessage.error,
    }),
    maxToolsetEscalationRetries: overrides.maxToolsetEscalationRetries,
    notifyTaskTerminal: (targetThread, targetMessage, status) => calls.notified.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      status,
    }),
    nowIso: () => `2026-06-08T00:00:0${nowIndex++}.000Z`,
    nowMs: () => 6000 + nowIndex,
    saveState: () => { calls.saved += 1; },
    setImmediate: (fn) => {
      calls.immediate.push(fn);
      if (!overrides.deferImmediate) fn();
    },
    startToolsetEscalationRun: overrides.startToolsetEscalationRun || ((targetThread, userMessage, assistantMessage, runOptions) => {
      calls.starts.push({ targetThread, userMessage, assistantMessage, runOptions });
      return { status: "started" };
    }),
    threadSummary: (targetThread) => ({ id: targetThread.id }),
  });
  return { calls, message, service, thread };
}

function testSuccessfulRetryQueuesAssistantAndStartsExpandedRun() {
  const { calls, message, service, thread } = makeHarness();

  const result = service.startEscalatedToolsetRetry(
    thread,
    message,
    { retryableToolsets: ["web", "search"], reason: "needs current data" },
    "run_1",
  );

  assert.equal(result, true);
  assert.equal(message.status, "queued");
  assert.equal(message.content, "");
  assert.equal(message.error, "");
  assert.equal(message.completedAt, "");
  assert.equal(message.failedAt, "");
  assert.equal(message.cancelledAt, "");
  assert.equal(message.toolsetEscalationAttempts, 1);
  assert.equal(message.toolsetEscalationRequired, false);
  assert.deepEqual(message.toolsetEscalationToolsets, []);
  assert.equal(thread.events.at(-1).event, "run.toolset_escalation_retrying");
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.starts[0].userMessage.id, "user_1");
  assert.equal(calls.starts[0].assistantMessage.id, "assistant_1");
  assert.equal(calls.starts[0].runOptions.skipModelFirstToolsetSelection, true);
  assert.deepEqual(calls.starts[0].runOptions.modelFirstToolsetSelection.selectedToolsets, ["file", "web", "search", "browser"]);
  assert.deepEqual(calls.starts[0].runOptions.modelFirstToolsetSelection.authorizedToolsets, ["file", "web", "search", "browser", "vision"]);
  assert.deepEqual(
    calls.starts[0].runOptions.modelFirstToolsetSelection.routing.omitted_authorized_toolsets,
    ["vision"],
  );
  assert.deepEqual(calls.notified, []);
}

function testRetryCapReturnsFalseWithoutMutation() {
  const { calls, message, service, thread } = makeHarness({ maxToolsetEscalationRetries: 1 });
  message.toolsetEscalationAttempts = 1;

  const result = service.startEscalatedToolsetRetry(
    thread,
    message,
    { retryableToolsets: ["web"], reason: "needs current data" },
    "run_1",
  );

  assert.equal(result, false);
  assert.equal(message.status, "done");
  assert.equal(message.content, "old content");
  assert.equal(thread.events.length, 0);
  assert.equal(calls.starts.length, 0);
}

function testMissingUserMessageReturnsFalse() {
  const { calls, message, service, thread } = makeHarness();
  thread.messages = [message];

  const result = service.startEscalatedToolsetRetry(
    thread,
    message,
    { retryableToolsets: ["web"], reason: "needs current data" },
    "run_1",
  );

  assert.equal(result, false);
  assert.equal(message.status, "done");
  assert.equal(calls.starts.length, 0);
}

function testAlreadySelectedToolsetsReturnFalse() {
  const { calls, message, service, thread } = makeHarness();
  message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web"],
    },
  };

  const result = service.startEscalatedToolsetRetry(
    thread,
    message,
    { retryableToolsets: ["file"], reason: "already selected" },
    "run_1",
  );

  assert.equal(result, false);
  assert.equal(message.status, "done");
  assert.equal(calls.starts.length, 0);
}

async function testRejectedRetryStartMarksAssistantFailed() {
  const { calls, message, service, thread } = makeHarness({
    startToolsetEscalationRun: () => Promise.reject(new Error("retry gateway failed")),
  });

  const result = service.startEscalatedToolsetRetry(
    thread,
    message,
    { retryableToolsets: ["web"], reason: "needs current data" },
    "run_1",
  );
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(result, true);
  assert.equal(message.status, "failed");
  assert.equal(message.error, "retry gateway failed");
  assert.equal(message.failedAt, "2026-06-08T00:00:01.000Z");
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts.at(-1).type, "run.failed");
  assert.deepEqual(calls.notified, [{ threadId: "thread_1", messageId: "assistant_1", status: "failed" }]);
}

async function main() {
  testSuccessfulRetryQueuesAssistantAndStartsExpandedRun();
  testRetryCapReturnsFalseWithoutMutation();
  testMissingUserMessageReturnsFalse();
  testAlreadySelectedToolsetsReturnFalse();
  await testRejectedRetryStartMarksAssistantFailed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
