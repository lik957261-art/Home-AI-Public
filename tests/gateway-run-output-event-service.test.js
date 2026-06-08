"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunOutputEventService } = require("../adapters/gateway-run-output-event-service");

function makeHarness(overrides = {}) {
  const thread = {
    id: "thread_1",
    events: [],
    updatedAt: "old",
  };
  const message = {
    id: "message_1",
    runId: "real_response",
    status: "running",
    content: "",
  };
  const calls = {
    broadcasts: [],
    messageUpdates: [],
    saved: 0,
    scheduled: 0,
  };
  const service = createGatewayRunOutputEventService(Object.assign({
    addThreadEvent: (targetThread, event) => {
      targetThread.events.push({
        event: event.event,
        runId: event.runId,
        tool: event.tool,
        preview: event.preview || "",
        error: Boolean(event.error),
      });
    },
    broadcast: (payload) => calls.broadcasts.push(payload),
    broadcastMessageUpdated: (targetThread, targetMessage) => calls.messageUpdates.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      content: targetMessage.content,
      runId: targetMessage.runId,
    }),
    compactFullContent: (value) => String(value || ""),
    nowIso: () => "2026-06-08T01:02:03.000Z",
    nowMs: () => 4000,
    saveState: () => { calls.saved += 1; },
    scheduleStreamingStateSave: () => { calls.scheduled += 1; },
    threadSummary: (targetThread) => ({ id: targetThread.id, eventCount: targetThread.events.length }),
  }, overrides));
  return { calls, message, service, thread };
}

function outputContext(thread, message, overrides = {}) {
  return Object.assign({
    eventName: "response.output_item.added",
    message,
    responseRunId: "real_response",
    runId: "public_run",
    stream: { realRunId: "real_response" },
    thread,
  }, overrides);
}

function testPersistsSkillAndToolEvidenceWithAliasedRunId() {
  const { calls, message, service, thread } = makeHarness();
  const result = service.recordOutputItemEvent(outputContext(thread, message), {
    item: {
      name: "skill_view",
      arguments: "{\"name\":\"productivity/write\"}",
    },
  });

  assert.equal(result.action, "output_item");
  assert.deepEqual(message.loadedSkills, [{
    id: "write",
    label: "write",
    path: "productivity/write",
    namespace: "productivity",
  }]);
  assert.equal(thread.events.at(-1).runId, "real_response");
  assert.equal(thread.events.at(-1).tool, "skill_view");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"productivity/write\"}");
  assert.equal(calls.broadcasts.at(-1).type, "run.event");
  assert.equal(calls.broadcasts.at(-1).runId, "real_response");
  assert.equal(calls.saved, 1);
}

function testFunctionCallOutputUsesPreviousCallNameWithoutRawOutput() {
  const { service, thread, message } = makeHarness();
  service.recordOutputItemEvent(outputContext(thread, message), {
    item: {
      type: "function_call",
      name: "mobile_web_search",
      call_id: "call_search_1",
      arguments: "{\"query\":\"raw argument should not be stored\"}",
    },
  });
  service.recordOutputItemEvent(outputContext(thread, message, {
    eventName: "response.output_item.done",
  }), {
    item: {
      type: "function_call_output",
      call_id: "call_search_1",
      output: "[{\"type\":\"input_text\",\"text\":\"large raw tool output should not be stored\"}]",
    },
  });

  assert.equal(thread.events.at(-1).tool, "function_call_output");
  assert.equal(thread.events.at(-1).preview, "{\"name\":\"mobile_web_search\",\"callId\":\"call_search_1\"}");
  assert.equal(thread.events.some((event) => /raw argument|large raw/.test(event.preview || "")), false);
  assert.deepEqual(message.loadedTools, [{ id: "mobile_web_search", name: "mobile_web_search", label: "mobile_web_search" }]);
}

function testFinalMessageEventsDoNotStorePrivateResponseText() {
  const { calls, message, service, thread } = makeHarness();
  service.recordOutputItemEvent(outputContext(thread, message), {
    item: { type: "message", content: [{ type: "output_text", text: "private draft" }] },
  });
  const result = service.recordFinalMessageDoneEvent(outputContext(thread, message), {
    text: "private final response",
  });

  assert.equal(result.action, "final_message_done");
  assert.equal(message.content, "private final response");
  assert.equal(message.firstFeedbackAt, "2026-06-08T01:02:03.000Z");
  assert.equal(thread.events.at(-2).event, "run.final_message_started");
  assert.equal(thread.events.at(-1).event, "run.final_message_done");
  assert.equal(thread.events.some((event) => /private/.test(event.preview || "")), false);
  assert.equal(calls.messageUpdates.length >= 2, true);
  assert.equal(calls.scheduled >= 2, true);
}

testPersistsSkillAndToolEvidenceWithAliasedRunId();
testFunctionCallOutputUsesPreviousCallNameWithoutRawOutput();
testFinalMessageEventsDoNotStorePrivateResponseText();
