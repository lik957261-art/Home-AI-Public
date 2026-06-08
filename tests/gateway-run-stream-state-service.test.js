"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunStreamStateService } = require("../adapters/gateway-run-stream-state-service");

function createController() {
  return { signal: { aborted: false } };
}

function testCreatesDefaultResponseStreamState() {
  const controller = createController();
  const service = createGatewayRunStreamStateService({
    nowMs: () => 1234,
    singleGatewayRunner: { apiBase: () => "http://default.gateway" },
  });

  const stream = service.createStreamState("thread_1", "message_1", controller, {});

  assert.equal(stream.threadId, "thread_1");
  assert.equal(stream.messageId, "message_1");
  assert.equal(stream.controller, controller);
  assert.equal(stream.engine, "responses");
  assert.equal(stream.gatewayUrl, "http://default.gateway");
  assert.equal(stream.gatewayApiKey, "");
  assert.equal(stream.startedAt, 1234);
  assert.equal(stream.lastEventAt, 1234);
  assert.equal(stream.livenessTimer, null);
  assert.equal(stream.firstEventTimer, null);
  assert.equal(stream.livenessMisses, 0);
  assert.equal(stream.failureReason, "");
  assert.equal(stream.terminalEventSeen, false);
  assert.equal(Object.getPrototypeOf(stream.toolBudgetCounters), null);
  assert.deepEqual(Object.keys(stream.toolBudgetCounters), []);
}

function testStreamOptionsOverrideGatewayMetadataAndTimers() {
  const service = createGatewayRunStreamStateService({
    nowMs: () => 5678,
    singleGatewayRunner: { apiBase: () => "http://default.gateway" },
  });

  const stream = service.createStreamState("thread_2", "message_2", createController(), {
    gatewayUrl: "http://worker.gateway",
    gatewayApiKey: "worker-key",
    gatewayName: "lowgw1",
    gatewayProfile: "lowgw1",
    gatewaySource: "worker_pool",
    apiTimeoutMs: 1100,
    modelFirstByteWarningMs: 2200,
    runStartTimeoutMs: 3300,
    runLivenessCheckAfterMs: 4400,
    runLivenessStaleAfterMs: 5500,
    webSearchMaxCalls: 2,
  });

  assert.equal(stream.gatewayUrl, "http://worker.gateway");
  assert.equal(stream.gatewayApiKey, "worker-key");
  assert.equal(stream.gatewayName, "lowgw1");
  assert.equal(stream.gatewayProfile, "lowgw1");
  assert.equal(stream.gatewaySource, "worker_pool");
  assert.equal(stream.apiTimeoutMs, 1100);
  assert.equal(stream.modelFirstByteWarningMs, 2200);
  assert.equal(stream.runStartTimeoutMs, 3300);
  assert.equal(stream.runLivenessCheckAfterMs, 4400);
  assert.equal(stream.runLivenessStaleAfterMs, 5500);
  assert.equal(stream.webSearchMaxCalls, 2);
}

function testAcceptsSingleGatewayRunnerProvider() {
  const service = createGatewayRunStreamStateService({
    singleGatewayRunner: () => ({ apiBase: () => "http://provider.gateway" }),
  });

  const stream = service.createStreamState("thread_3", "message_3", createController(), {});

  assert.equal(stream.gatewayUrl, "http://provider.gateway");
}

testCreatesDefaultResponseStreamState();
testStreamOptionsOverrideGatewayMetadataAndTimers();
testAcceptsSingleGatewayRunnerProvider();
console.log("gateway run stream state service tests passed");
