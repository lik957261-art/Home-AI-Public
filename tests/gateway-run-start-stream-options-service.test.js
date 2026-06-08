"use strict";

const assert = require("node:assert/strict");
const {
  CHATGPT_PRO_MIN_WAIT_MS,
  createGatewayRunStartStreamOptionsService,
  isChatGptProRunOptions,
  isExplicitWebSearchRunOptions,
} = require("../adapters/gateway-run-start-stream-options-service");

function testGatewayTargetMetadataProjection() {
  const service = createGatewayRunStartStreamOptionsService();

  assert.deepEqual(service.streamOptionsForGatewayTarget({
    apiBase: " http://gateway.worker ",
    apiKey: "worker-key",
    name: "lowgw1",
    profile: "owner-low-1",
    source: "worker_pool",
  }), {
    gatewayUrl: "http://gateway.worker",
    gatewayApiKey: "worker-key",
    gatewayName: "lowgw1",
    gatewayProfile: "owner-low-1",
    gatewaySource: "worker_pool",
  });
}

function testExplicitSearchCapOverridesDefaultCap() {
  const service = createGatewayRunStartStreamOptionsService({
    runWebSearchMaxCalls: 3,
    runExplicitWebSearchMaxCalls: 9,
  });

  const streamOptions = service.streamOptionsForGatewayTarget(
    { apiBase: "http://gateway.worker" },
    { searchSource: "x_search" },
  );

  assert.equal(streamOptions.webSearchMaxCalls, 9);
}

function testDefaultSearchCapAppliesWhenRunIsNotExplicitSearch() {
  const service = createGatewayRunStartStreamOptionsService({
    runWebSearchMaxCalls: 3,
    runExplicitWebSearchMaxCalls: 9,
  });

  const streamOptions = service.streamOptionsForGatewayTarget(
    { apiBase: "http://gateway.worker" },
    { sourceIntent: "plain_chat" },
  );

  assert.equal(streamOptions.webSearchMaxCalls, 3);
}

function testChineseCurrentPriceTextUsesExplicitSearchCap() {
  const service = createGatewayRunStartStreamOptionsService({
    runWebSearchMaxCalls: 3,
    runExplicitWebSearchMaxCalls: 9,
  });

  const streamOptions = service.streamOptionsForGatewayTarget(
    { apiBase: "http://gateway.worker" },
    { sourceIntent: "plain_chat" },
    { latestText: "\u518d\u67e5\u4e00\u4e0b\u5f53\u524d\u9ec4\u91d1\u548c\u6bd4\u7279\u5e01\u7684\u4ef7\u683c\u3002" },
  );

  assert.equal(streamOptions.webSearchMaxCalls, 9);
}

function testInvalidCapsAreOmitted() {
  const service = createGatewayRunStartStreamOptionsService({
    runWebSearchMaxCalls: -2,
    runExplicitWebSearchMaxCalls: "not-a-number",
  });

  const streamOptions = service.streamOptionsForGatewayTarget(
    { apiBase: "http://gateway.worker" },
    { searchSource: "web" },
  );

  assert.equal(Object.hasOwn(streamOptions, "webSearchMaxCalls"), false);
}

function testChatGptProTimeoutProjection() {
  const service = createGatewayRunStartStreamOptionsService();

  const streamOptions = service.streamOptionsForGatewayTarget(
    { apiBase: "http://gateway.worker" },
    { requiredTool: "chatgpt_pro_generate" },
  );

  assert.equal(streamOptions.runStartTimeoutMs, CHATGPT_PRO_MIN_WAIT_MS);
  assert.equal(streamOptions.runLivenessCheckAfterMs, CHATGPT_PRO_MIN_WAIT_MS);
  assert.equal(streamOptions.runLivenessStaleAfterMs, 0);
  assert.equal(streamOptions.modelFirstByteWarningMs, CHATGPT_PRO_MIN_WAIT_MS);
}

function testRunOptionDetectors() {
  assert.equal(isChatGptProRunOptions({ provider: "chatgpt_pro_generate" }), true);
  assert.equal(isChatGptProRunOptions({ provider: "openai" }), false);
  assert.equal(isExplicitWebSearchRunOptions({ source_intent: "web_search" }), true);
  assert.equal(isExplicitWebSearchRunOptions({}, { latestText: "\u67e5\u4e00\u4e0b\u5f53\u524d\u4ef7\u683c" }), true);
  assert.equal(isExplicitWebSearchRunOptions({ sourceIntent: "wardrobe" }), false);
}

testGatewayTargetMetadataProjection();
testExplicitSearchCapOverridesDefaultCap();
testDefaultSearchCapAppliesWhenRunIsNotExplicitSearch();
testChineseCurrentPriceTextUsesExplicitSearchCap();
testInvalidCapsAreOmitted();
testChatGptProTimeoutProjection();
testRunOptionDetectors();

console.log("gateway run-start stream options service tests passed");
