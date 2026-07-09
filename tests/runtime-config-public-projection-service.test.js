"use strict";

const assert = require("node:assert/strict");
const {
  createRuntimeConfigPublicProjectionService,
} = require("../adapters/runtime-config-public-projection-service");

function makeService(overrides = {}) {
  const config = Object.assign({
    defaultModel: "gpt-5.5",
    defaultModelId: "openai-codex:gpt-5.5",
    defaultModelProvider: "openai-codex",
    defaultReasoningEffort: "medium",
    gatewayWorkerSettings: { ownerMinWarm: 0 },
    hermesApiBase: "http://localhost:8797",
    hermesApiKeyPath: "C:/keys/gateway.key",
    moaConfig: { enabled: true, defaultPreset: "default", activePreset: "", presets: [] },
    updatedAt: "2026-06-08T00:00:00.000Z",
    updatedBy: "owner",
    webPushSubject: "mailto:owner@example.invalid",
    webPushVapidPath: "C:/vapid/live.json",
  }, overrides.config || {});
  return createRuntimeConfigPublicProjectionService(Object.assign({
    defaultHermesApiBase: () => "http://127.0.0.1:8797",
    defaultRuntimeModelOption: {
      id: "openai-codex:gpt-5.4",
      model: "gpt-5.4",
      provider: "openai-codex",
      defaultReasoningEffort: "medium",
    },
    effectiveHermesApiBase: (value) => value.hermesApiBase || "http://127.0.0.1:8797",
    effectiveWebPushSubject: (value) => value.webPushSubject || "mailto:default@example.invalid",
    effectiveWebPushVapidPath: (value) => value.webPushVapidPath || "C:/vapid/default.json",
    fileExists: (targetPath) => targetPath === "C:/vapid/live.json",
    gatewayWorkerRuntimeSettings: () => ({
      definitions: [{ key: "ownerMinWarm", label: "Owner warm workers", max: 64 }],
      effective: { ownerMinWarm: 0, idleTtlMinutes: 1, idleTtlMs: 60_000 },
      overrides: { ownerMinWarm: 0 },
    }),
    hermesApiKeyStatus: () => ({ configured: true, source: "file", path: "C:/keys/gateway.key" }),
    load: () => config,
    officialMoaConfig: () => ({ enabled: true, default_preset: "default", presets: {} }),
    runtimeModelFamilies: () => [{ id: "openai-codex", label: "ChatGPT" }],
    runtimeModelOptions: () => [{ id: "openai-codex:gpt-5.5", label: "ChatGPT 5.5" }],
  }, overrides.options || {}));
}

function testPublicConfigProjection() {
  const service = makeService();
  const publicConfig = service.publicConfig({
    pushStatus: { enabled: true, subscriptionCount: 2 },
    webPushConfig: { publicKey: "public-key", source: "file" },
    webPushEnabled: true,
  });

  assert.deepEqual(publicConfig, {
    hermesApiBase: "http://localhost:8797",
    hermesApiBaseOverride: "http://localhost:8797",
    hermesApiBaseDefault: "http://127.0.0.1:8797",
    hermesApiKeyPath: "C:/keys/gateway.key",
    hermesApiKeyConfigured: true,
    hermesApiKeySource: "file",
    hermesApiKeyResolvedPath: "C:/keys/gateway.key",
    defaultModelId: "openai-codex:gpt-5.5",
    defaultModel: "gpt-5.5",
    defaultModelProvider: "openai-codex",
    defaultReasoningEffort: "medium",
    gatewayWorkerSettings: { ownerMinWarm: 0 },
    gatewayWorkerEffectiveSettings: { ownerMinWarm: 0, idleTtlMinutes: 1, idleTtlMs: 60_000 },
    gatewayWorkerSettingDefinitions: [{ key: "ownerMinWarm", label: "Owner warm workers", max: 64 }],
    modelFamilies: [{ id: "openai-codex", label: "ChatGPT" }],
    modelOptions: [{ id: "openai-codex:gpt-5.5", label: "ChatGPT 5.5" }],
    moaConfig: { enabled: true, defaultPreset: "default", activePreset: "", presets: [] },
    moaOfficialConfig: { enabled: true, default_preset: "default", presets: {} },
    webPushEnabled: true,
    webPushConfigured: true,
    webPushSubject: "mailto:owner@example.invalid",
    webPushSubjectOverride: "mailto:owner@example.invalid",
    webPushVapidPath: "C:/vapid/live.json",
    webPushVapidResolvedPath: "C:/vapid/live.json",
    webPushVapidExists: true,
    webPushSource: "file",
    webPushPublicKeyPresent: true,
    webPushSubscriptionCount: 2,
    updatedAt: "2026-06-08T00:00:00.000Z",
    updatedBy: "owner",
  });
}

function testModelDefaultsAndAbsentPush() {
  const service = makeService({
    config: {
      defaultModel: "",
      defaultModelId: "",
      defaultModelProvider: "",
      defaultReasoningEffort: "",
      hermesApiBase: "",
      webPushSubject: "",
      webPushVapidPath: "",
    },
  });
  const publicConfig = service.publicConfig();

  assert.equal(publicConfig.defaultModelId, "openai-codex:gpt-5.4");
  assert.equal(publicConfig.defaultModel, "gpt-5.4");
  assert.equal(publicConfig.defaultModelProvider, "openai-codex");
  assert.equal(publicConfig.defaultReasoningEffort, "medium");
  assert.equal(publicConfig.hermesApiBase, "http://127.0.0.1:8797");
  assert.equal(publicConfig.webPushEnabled, false);
  assert.equal(publicConfig.webPushConfigured, false);
  assert.equal(publicConfig.webPushPublicKeyPresent, false);
  assert.equal(publicConfig.webPushSubscriptionCount, 0);
  assert.equal(publicConfig.webPushVapidExists, false);
}

testPublicConfigProjection();
testModelDefaultsAndAbsentPush();

console.log("runtime config public projection service tests passed");
