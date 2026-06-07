"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStartPreparationService } = require("../adapters/gateway-run-start-preparation-service");

function testPrepareRunStartPublishesInitialStateAndRequest() {
  const calls = {
    assistantOptions: [],
    broadcasts: [],
    concurrency: [],
    events: [],
    metadata: [],
    requestBuilds: [],
    saved: [],
    skillEvents: [],
    states: [],
    wardrobeChecks: [],
  };
  const request = { body: { input: "hello" }, runPolicy: { allowed_toolsets: ["file"] } };
  const wardrobeGate = { active: false, ok: true, stage: "pre_gateway" };
  const service = createGatewayRunStartPreparationService({
    appendRequiredSkillPreloadEvents: (...args) => calls.skillEvents.push(args),
    appendRunStartEvent: (...args) => calls.events.push(args),
    applyAssistantRunOptions: (...args) => calls.assistantOptions.push(args),
    applyPreparingRunState: (...args) => calls.states.push(args),
    applyWardrobeWorkflowGateMetadata: (...args) => calls.metadata.push(args),
    assertRunConcurrencyCapacity: (workspaceId) => calls.concurrency.push(workspaceId),
    broadcastMessageUpdated: (...args) => calls.broadcasts.push(args),
    buildRunRequest: (...args) => {
      calls.requestBuilds.push(args);
      return request;
    },
    completeWardrobeWorkflowGateFailure: () => {
      throw new Error("gate failure should not run on an ok gate");
    },
    evaluateWardrobeGate: (...args) => {
      calls.wardrobeChecks.push(args);
      return wardrobeGate;
    },
    makePublicTaskId: (prefix) => `${prefix}_test_1`,
    nowIso: () => "2026-06-08T01:02:03.000Z",
    resolveActorWorkspaceId: () => "owner",
    saveState: (...args) => calls.saved.push(args),
  });
  const thread = { id: "thread_1" };
  const userMessage = { id: "user_1", content: "hello" };
  const assistantMessage = { id: "assistant_1" };
  const runOptions = { model: "gpt-test" };

  const result = service.prepareRunStart({ thread, userMessage, assistantMessage, runOptions });

  assert.equal(assistantMessage.actorWorkspaceId, "owner");
  assert.deepEqual(calls.concurrency, ["owner"]);
  assert.deepEqual(calls.states, [[thread, assistantMessage, "web_test_1", "2026-06-08T01:02:03.000Z"]]);
  assert.deepEqual(calls.saved, [[undefined, { reason: "run-gateway-selected", skipSqliteRuntimeReplace: true }]]);
  assert.deepEqual(calls.broadcasts, [[thread, assistantMessage]]);
  assert.deepEqual(calls.events, [[thread, assistantMessage, "run.request_preparing", "正在准备上下文和选择 Gateway"]]);
  assert.deepEqual(calls.requestBuilds, [[thread, userMessage, assistantMessage, runOptions]]);
  assert.deepEqual(calls.wardrobeChecks, [[request, userMessage, "pre_gateway"]]);
  assert.deepEqual(calls.assistantOptions, [[assistantMessage, request, runOptions]]);
  assert.deepEqual(calls.metadata, [[assistantMessage, wardrobeGate]]);
  assert.deepEqual(calls.skillEvents, [[thread, assistantMessage, request]]);
  assert.deepEqual(result, {
    actorWorkspaceId: "owner",
    effectiveRunOptions: runOptions,
    request,
    taskId: "web_test_1",
    wardrobeGate,
  });
}

function testPrepareRunStartReturnsTerminalResultOnWardrobeGateFailure() {
  const calls = { streams: 0 };
  const request = { body: { input: "wardrobe" } };
  const wardrobeGate = { active: true, ok: false, reason: "missing_rule" };
  const terminalResult = { status: "failed", reason: "wardrobe gate failed" };
  const service = createGatewayRunStartPreparationService({
    appendRequiredSkillPreloadEvents: () => {},
    appendRunStartEvent: () => {},
    applyAssistantRunOptions: () => {},
    applyPreparingRunState: () => {},
    applyWardrobeWorkflowGateMetadata: () => {},
    assertRunConcurrencyCapacity: () => {},
    broadcastMessageUpdated: () => {},
    buildRunRequest: () => request,
    completeWardrobeWorkflowGateFailure: (...args) => {
      assert.equal(args[0].id, "thread_1");
      assert.equal(args[1].id, "assistant_1");
      assert.equal(args[2], "web_test_1");
      assert.equal(args[3], wardrobeGate);
      return terminalResult;
    },
    evaluateWardrobeGate: () => wardrobeGate,
    makePublicTaskId: () => "web_test_1",
    saveState: () => {},
    streamResponse: () => { calls.streams += 1; },
  });

  const result = service.prepareRunStart({
    assistantMessage: { id: "assistant_1" },
    runOptions: {},
    thread: { id: "thread_1" },
    userMessage: { id: "user_1" },
  });

  assert.equal(result.terminalResult, terminalResult);
  assert.equal(result.request, request);
  assert.equal(result.wardrobeGate, wardrobeGate);
  assert.equal(calls.streams, 0);
}

function testPrepareRunStartDoesNotMutateAssistantWhenConcurrencyFails() {
  const assistantMessage = { id: "assistant_1" };
  const err = new Error("capacity");
  const service = createGatewayRunStartPreparationService({
    assertRunConcurrencyCapacity: () => { throw err; },
    resolveActorWorkspaceId: () => "owner",
  });

  assert.throws(
    () => service.prepareRunStart({
      assistantMessage,
      runOptions: {},
      thread: { id: "thread_1" },
      userMessage: { id: "user_1" },
    }),
    err,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(assistantMessage, "actorWorkspaceId"), false);
}

testPrepareRunStartPublishesInitialStateAndRequest();
testPrepareRunStartReturnsTerminalResultOnWardrobeGateFailure();
testPrepareRunStartDoesNotMutateAssistantWhenConcurrencyFails();

console.log("gateway run-start preparation service tests passed");
