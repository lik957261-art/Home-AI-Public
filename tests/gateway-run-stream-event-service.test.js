"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStreamEventService,
  eventNameFromEvent,
  isTerminalGatewayEvent,
  modelStreamEventPreview,
  originalRunIdFromEvent,
  outputItemHasMessageText,
  responseRunIdFromEvent,
  toolCallNameFromEvent,
} = require("../adapters/gateway-run-stream-event-service");

function testEventIdExtraction() {
  assert.equal(eventNameFromEvent({ type: "response.created" }), "response.created");
  assert.equal(responseRunIdFromEvent({ response: { id: " resp_1 " } }), "resp_1");
  assert.equal(responseRunIdFromEvent({ response_id: "resp_2" }), "resp_2");
  assert.equal(originalRunIdFromEvent({ runId: " run_1 " }), "run_1");
  assert.equal(isTerminalGatewayEvent("response.completed"), true);
  assert.equal(isTerminalGatewayEvent("response.output_text.delta"), false);
}

function testOutputItemTextAndToolNames() {
  assert.equal(outputItemHasMessageText({
    type: "message",
    content: [{ type: "output_text", text: " hello " }],
  }), true);
  assert.equal(outputItemHasMessageText({
    type: "message",
    content: [{ type: "input_text", text: "hello" }],
  }), false);
  assert.equal(toolCallNameFromEvent({
    event: "response.output_item.added",
    item: { type: "function_call", function: { name: "finance.query" } },
  }), "finance.query");
  assert.equal(toolCallNameFromEvent({
    event: "response.output_item.added",
    item_type: "web_search_call",
  }), "web_search_call");
  assert.equal(toolCallNameFromEvent({ event: "response.created", name: "web_search_call" }), "");
}

function testToolBudgetLifecycle() {
  const emitted = [];
  const aborted = [];
  const stream = { realRunId: "resp_1", toolBudgetCounters: Object.create(null) };
  const service = createGatewayRunStreamEventService({
    webSearchMaxCallsForStream: () => 2,
    emitRunStreamEvent: (...args) => emitted.push(args),
    abortActiveStreamAsFailed: (...args) => aborted.push(args),
  });
  const webSearchEvent = {
    event: "response.output_item.added",
    item: { type: "web_search_call" },
  };

  assert.deepEqual(service.recordToolBudgetForEvent("public_1", { event: "message.delta" }, stream), {
    action: "ignored",
  });
  assert.equal(service.recordToolBudgetForEvent("public_1", webSearchEvent, stream).action, "counted");
  const second = service.recordToolBudgetForEvent("public_1", webSearchEvent, stream);
  const third = service.recordToolBudgetForEvent("public_1", webSearchEvent, stream);

  assert.equal(second.action, "counted");
  assert.equal(third.action, "summarize_required");
  assert.equal(third.count, 3);
  assert.equal(third.limit, 2);
  assert.equal(stream.toolBudgetCounters.webSearch, 3);
  assert.equal(stream.toolBudgetExceeded, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], "public_1");
  assert.equal(emitted[0][1], "run.tool_budget_exceeded");
  assert.deepEqual(emitted[0][3], { runId: "resp_1", error: false });
  assert.equal(aborted.length, 0);
  const fourth = service.recordToolBudgetForEvent("public_1", webSearchEvent, stream);
  assert.equal(fourth.action, "summarize_required");
  assert.equal(fourth.count, 4);
  assert.equal(emitted.length, 1);
}

function testDisabledToolBudget() {
  const service = createGatewayRunStreamEventService({ webSearchMaxCallsForStream: () => 0 });
  const stream = {};
  assert.deepEqual(service.recordToolBudgetForEvent("run", {
    event: "response.output_item.added",
    item: { type: "web_search_call" },
  }, stream), {
    action: "disabled",
    tool: "web_search_call",
  });
}

function testPreviewFormatting() {
  assert.equal(modelStreamEventPreview("message", { count: 2, empty: "" }), "message (count=2)");
  assert.equal(modelStreamEventPreview("message"), "message");
}

testEventIdExtraction();
testOutputItemTextAndToolNames();
testToolBudgetLifecycle();
testDisabledToolBudget();
testPreviewFormatting();

console.log("gateway run stream event service tests passed");
