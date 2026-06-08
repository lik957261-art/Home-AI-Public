"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunDeltaEventService } = require("../adapters/gateway-run-delta-event-service");

function makeHarness(overrides = {}) {
  const thread = {
    id: "thread_1",
    updatedAt: "old",
  };
  const message = {
    id: "message_1",
    runId: "run_1",
    content: "",
    runOptions: {},
  };
  const calls = {
    broadcasts: [],
    messageUpdates: [],
    scheduled: 0,
  };
  const service = createGatewayRunDeltaEventService(Object.assign({
    broadcast: (payload) => calls.broadcasts.push(payload),
    broadcastMessageUpdated: (targetThread, targetMessage) => calls.messageUpdates.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      content: targetMessage.content,
      runId: targetMessage.runId,
    }),
    maxMessageChars: 80,
    nowIso: () => "2026-06-08T01:02:03.000Z",
    scheduleStreamingStateSave: () => { calls.scheduled += 1; },
    threadSummary: (targetThread) => ({ id: targetThread.id, updatedAt: targetThread.updatedAt }),
  }, overrides));
  return { calls, message, service, thread };
}

function context(thread, message) {
  return { message, runId: "run_1", thread };
}

function testDeltaUpdatesMessageAndBroadcastsVisibleDelta() {
  const { calls, message, service, thread } = makeHarness();
  const result = service.applyDelta(context(thread, message), { delta: "partial" });

  assert.deepEqual(result, { action: "delta", delta: "partial" });
  assert.equal(message.content, "partial");
  assert.equal(message.firstFeedbackAt, "2026-06-08T01:02:03.000Z");
  assert.equal(message.updatedAt, "2026-06-08T01:02:03.000Z");
  assert.equal(thread.updatedAt, "2026-06-08T01:02:03.000Z");
  assert.equal(calls.scheduled, 1);
  assert.equal(calls.broadcasts[0].type, "message.delta");
  assert.equal(calls.broadcasts[0].delta, "partial");
}

function testEmptyDeltaIsIgnored() {
  const { calls, message, service, thread } = makeHarness();
  const result = service.applyDelta(context(thread, message), {});

  assert.equal(result.action, "empty_delta");
  assert.equal(message.content, "");
  assert.equal(calls.scheduled, 0);
  assert.equal(calls.broadcasts.length, 0);
}

function testAppendBoundedReceivesMaxChars() {
  const seen = [];
  const { message, service, thread } = makeHarness({
    appendBounded(current, delta, maxChars) {
      seen.push({ current, delta, maxChars });
      return `${current}${delta}`.slice(0, maxChars);
    },
    maxMessageChars: 12,
  });
  message.content = "abcdefghij";
  const result = service.applyDelta(context(thread, message), { text: "klmnop" });

  assert.equal(result.action, "delta");
  assert.deepEqual(seen, [{ current: "abcdefghij", delta: "klmnop", maxChars: 12 }]);
  assert.equal(message.content, "abcdefghijkl");
}

function testToolsetEscalationMarkerIsSuppressedWhenNoVisibleDelta() {
  const { calls, message, service, thread } = makeHarness({ maxMessageChars: 600 });
  message.runOptions = {
    toolsetRouting: {
      mode: "model_first",
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web", "search"],
    },
  };
  const marker = "HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"],\"reason\":\"needs public page\"}";
  const result = service.applyDelta(context(thread, message), { delta: marker });

  assert.equal(result.action, "delta_suppressed_toolset_escalation");
  assert.equal(message.content.includes("HERMES_TOOLSET_ESCALATION_REQUIRED"), false);
  assert.equal(message.pendingToolsetEscalationRequest.toolsets[0], "web");
  assert.equal(calls.broadcasts.length, 0);
  assert.equal(calls.messageUpdates.length, 1);
}

function testToolsetEscalationMarkerKeepsVisiblePrefixOnly() {
  const { calls, message, service, thread } = makeHarness({ maxMessageChars: 600 });
  message.content = "Need";
  message.runOptions = {
    toolsetRouting: {
      selected_toolsets: ["file"],
      omitted_authorized_toolsets: ["web"],
    },
  };
  const marker = " web HERMES_TOOLSET_ESCALATION_REQUIRED {\"toolsets\":[\"web\"]}";
  const result = service.applyDelta(context(thread, message), { delta: marker });

  assert.equal(result.action, "delta_sanitized_toolset_escalation");
  assert.equal(result.delta, " web");
  assert.equal(message.content, "Need web");
  assert.equal(calls.broadcasts.length, 1);
  assert.equal(calls.broadcasts[0].delta, " web");
  assert.equal(/HERMES_TOOLSET_ESCALATION_REQUIRED/.test(calls.broadcasts[0].delta), false);
}

testDeltaUpdatesMessageAndBroadcastsVisibleDelta();
testEmptyDeltaIsIgnored();
testAppendBoundedReceivesMaxChars();
testToolsetEscalationMarkerIsSuppressedWhenNoVisibleDelta();
testToolsetEscalationMarkerKeepsVisiblePrefixOnly();
