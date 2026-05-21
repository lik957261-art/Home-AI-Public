"use strict";

const assert = require("node:assert/strict");
const {
  GROK_PROVIDER,
  modelLooksLikeGrok,
  resolveGatewayModelRoute,
  textRequestsGrokModel,
} = require("../adapters/gateway-model-routing-service");

function testGrokMentionRoutesToXaiWorkerProfile() {
  const result = resolveGatewayModelRoute({ model: "grok-4.3", provider: "xai-oauth" });
  assert.equal(result.ok, true);
  assert.equal(result.route.model, "grok-4.3");
  assert.equal(result.route.provider, GROK_PROVIDER);
  assert.deepEqual(result.route.gatewayRouting, {
    provider: GROK_PROVIDER,
    preferred_worker_profiles: ["grokgw1"],
  });
}

function testGrokModelInfersProviderButRejectsUnsupportedNames() {
  assert.equal(modelLooksLikeGrok("grok-4.3"), true);
  const inferred = resolveGatewayModelRoute({ model: "grok-4.3" });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.route.provider, GROK_PROVIDER);

  const unsupported = resolveGatewayModelRoute({ model: "grok-4.20-0309-reasoning" });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, "unsupported_grok_model");
}

function testDefaultModelDoesNotForceProviderRoute() {
  const result = resolveGatewayModelRoute({ model: "", provider: "" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.route, {});

  const openai = resolveGatewayModelRoute({ model: "gpt-5.5", provider: "openai-codex" });
  assert.equal(openai.ok, true);
  assert.deepEqual(openai.route.gatewayRouting, { provider: "openai-codex" });
}

function testNaturalLanguageGrokRequestOverridesDefaultModelRoute() {
  assert.equal(textRequestsGrokModel("请使用 Grok 回答这个问题"), true);
  assert.equal(textRequestsGrokModel("用Grok分析一下"), true);
  assert.equal(textRequestsGrokModel("Use Grok to answer this."), true);
  assert.equal(textRequestsGrokModel("不要使用 Grok，继续用 ChatGPT"), false);

  const result = resolveGatewayModelRoute({
    text: "请使用 Grok 回答这个问题",
    model: "gpt-5.5",
    provider: "openai-codex",
  });
  assert.equal(result.ok, true);
  assert.equal(result.route.model, "grok-4.3");
  assert.equal(result.route.provider, GROK_PROVIDER);
  assert.deepEqual(result.route.gatewayRouting, {
    provider: GROK_PROVIDER,
    preferred_worker_profiles: ["grokgw1"],
  });
}

testGrokMentionRoutesToXaiWorkerProfile();
testGrokModelInfersProviderButRejectsUnsupportedNames();
testDefaultModelDoesNotForceProviderRoute();
testNaturalLanguageGrokRequestOverridesDefaultModelRoute();
console.log("gateway-model-routing-service tests passed");
