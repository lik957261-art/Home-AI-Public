"use strict";

const assert = require("node:assert/strict");
const {
  DEEPSEEK_PROVIDER,
  DEEPSEEK_OWNER_MAINTENANCE_WORKER_PROFILES,
  DEEPSEEK_WORKER_PROFILES,
  DEFAULT_MOA_MODEL,
  GROK_PROVIDER,
  MOA_OWNER_MAINTENANCE_WORKER_PROFILES,
  MOA_PROVIDER,
  OPENAI_CODEX_PROVIDER,
  modelLooksLikeDeepSeek,
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

function testDeepSeekRoutesThroughDirectProviderWorkerProfile() {
  assert.equal(modelLooksLikeDeepSeek("deepseek-chat"), true);
  const result = resolveGatewayModelRoute({ model: "deepseek-chat", provider: "deepseek" });
  assert.equal(result.ok, true);
  assert.equal(result.route.model, "deepseek-chat");
  assert.equal(result.route.provider, DEEPSEEK_PROVIDER);
  assert.deepEqual(result.route.gatewayRouting, {
    provider: DEEPSEEK_PROVIDER,
    preferred_worker_profiles: DEEPSEEK_WORKER_PROFILES,
  });
  assert.deepEqual(DEEPSEEK_WORKER_PROFILES, ["deepseekgw1", "deepseekgw2", "deepseekgw99", "deepseekgw5"]);

  const inferred = resolveGatewayModelRoute({ model: "deepseek-reasoner" });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.route.provider, DEEPSEEK_PROVIDER);
  assert.deepEqual(inferred.route.gatewayRouting, {
    provider: DEEPSEEK_PROVIDER,
    preferred_worker_profiles: DEEPSEEK_WORKER_PROFILES,
  });
}

function testDeepSeekOwnerMaintenanceRoutesThroughHighPermissionProfile() {
  const result = resolveGatewayModelRoute({
    model: "deepseek-chat",
    provider: "deepseek",
    gatewayRouting: { securityLevel: "owner-maintenance", maintenance: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.route.provider, DEEPSEEK_PROVIDER);
  assert.deepEqual(result.route.gatewayRouting, {
    provider: DEEPSEEK_PROVIDER,
    preferred_worker_profiles: DEEPSEEK_OWNER_MAINTENANCE_WORKER_PROFILES,
  });
}

function testMoaRoutesThroughOwnerMaintenanceOpenAiProfile() {
  const result = resolveGatewayModelRoute({ model: "default", provider: "moa" });
  assert.equal(result.ok, true);
  assert.equal(result.route.model, DEFAULT_MOA_MODEL);
  assert.equal(result.route.provider, MOA_PROVIDER);
  assert.deepEqual(result.route.gatewayRouting, {
    provider: OPENAI_CODEX_PROVIDER,
    securityLevel: "owner-maintenance",
    maintenance: true,
    allowMaintenance: true,
    preferred_worker_profiles: MOA_OWNER_MAINTENANCE_WORKER_PROFILES,
  });
  assert.deepEqual(MOA_OWNER_MAINTENANCE_WORKER_PROFILES, ["officialclean1"]);

  const unsupported = resolveGatewayModelRoute({ model: "experimental", provider: "moa" });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, "unsupported_moa_model");
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
testDeepSeekRoutesThroughDirectProviderWorkerProfile();
testDeepSeekOwnerMaintenanceRoutesThroughHighPermissionProfile();
testMoaRoutesThroughOwnerMaintenanceOpenAiProfile();
testNaturalLanguageGrokRequestOverridesDefaultModelRoute();
console.log("gateway-model-routing-service tests passed");
