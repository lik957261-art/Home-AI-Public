"use strict";

const assert = require("node:assert/strict");
const {
  createRuntimeConfigSaveService,
} = require("../adapters/runtime-config-save-service");
const {
  normalizeRuntimeConfig,
  normalizeRuntimeModelSelection,
  validateHermesApiBase,
  validateWebPushSubject,
} = require("../adapters/runtime-config-provider");
const {
  mergeGatewayWorkerRuntimeSettings,
} = require("../adapters/gateway-worker-runtime-settings-service");
const { mergeMoaConfig } = require("../adapters/runtime-config-moa-service");

function makeService() {
  return createRuntimeConfigSaveService({
    mergeGatewayWorkerRuntimeSettings,
    mergeMoaConfig,
    normalizeRuntimeConfig,
    normalizeRuntimeModelSelection,
    nowIso: () => "2026-06-08T00:00:00.000Z",
    validateHermesApiBase,
    validateWebPushSubject,
  });
}

function testRuntimeConfigForSaveNormalizesInput() {
  const service = makeService();
  const previous = normalizeRuntimeConfig({
    defaultModelId: "openai-codex:gpt-5.5",
    gatewayWorkerSettings: { ownerMinWarm: 1, workspaceMaxWorkers: 2 },
    hermesApiBase: "http://old.example",
    hermesApiKeyPath: " C:/old.key ",
    webPushSubject: "mailto:old@example.invalid",
    webPushVapidPath: "C:/old-vapid.json",
  });
  const saved = service.runtimeConfigForSave({
    default_model_id: "deepseek:deepseek-chat",
    default_reasoning_effort: "high",
    gateway_worker_settings: {
      ownerMinWarm: "",
      global_max_workers: 8,
      idle_ttl_minutes: 1,
    },
    moa_config: {
      enabled: true,
      default_preset: "default",
      presets: {
        default: {
          reference_models: ["openai-codex:gpt-5.5"],
          aggregator: { provider: "openai-codex", model: "gpt-5.5" },
          reference_max_tokens: 600,
        },
      },
    },
    hermes_api_base: "http://localhost:8797///?drop=1#fragment",
    hermes_api_key_path: " C:/new.key ",
    web_push_subject: "https://example.invalid/push",
    web_push_vapid_path: " C:/new-vapid.json ",
  }, "admin", previous);

  assert.deepEqual(saved, {
    schemaVersion: 1,
    hermesApiBase: "http://localhost:8797",
    hermesApiKeyPath: "C:/new.key",
    defaultModelId: "deepseek:deepseek-chat",
    defaultModel: "deepseek-chat",
    defaultModelProvider: "deepseek",
    defaultReasoningEffort: "high",
    gatewayWorkerSettings: {
      workspaceMaxWorkers: 2,
      globalMaxWorkers: 8,
      idleTtlMinutes: 1,
    },
    moaConfig: {
      enabled: true,
      defaultPreset: "default",
      activePreset: "",
      presets: [{
        name: "default",
        enabled: true,
        referenceModels: [{ provider: "openai-codex", model: "gpt-5.5" }],
        aggregator: { provider: "openai-codex", model: "gpt-5.5" },
        referenceMaxTokens: 600,
      }],
    },
    webPushSubject: "https://example.invalid/push",
    webPushVapidPath: "C:/new-vapid.json",
    updatedAt: "2026-06-08T00:00:00.000Z",
    updatedBy: "admin",
  });
}

function testRuntimeConfigForSavePreservesPreviousFields() {
  const service = makeService();
  const previous = normalizeRuntimeConfig({
    defaultModelId: "deepseek:deepseek-chat",
    gatewayWorkerSettings: { ownerMinWarm: 0 },
    hermesApiBase: "http://old.example",
    hermesApiKeyPath: "C:/old.key",
    webPushSubject: "mailto:old@example.invalid",
    webPushVapidPath: "C:/old-vapid.json",
  });
  const saved = service.runtimeConfigForSave(null, "", previous);

  assert.equal(saved.hermesApiBase, "http://old.example");
  assert.equal(saved.hermesApiKeyPath, "C:/old.key");
  assert.equal(saved.defaultModelId, "deepseek:deepseek-chat");
  assert.deepEqual(saved.gatewayWorkerSettings, { ownerMinWarm: 0 });
  assert.equal(saved.updatedBy, "owner");
}

function testValidationStillFailsClosed() {
  const service = makeService();
  assert.throws(() => service.runtimeConfigForSave({ hermesApiBase: "ftp://example.invalid" }), /http or https/);
  assert.throws(() => service.runtimeConfigForSave({ webPushSubject: "invalid subject" }), /Web Push subject/);
  assert.throws(() => service.runtimeConfigForSave({ gatewayWorkerSettings: { globalMaxWorkers: 999 } }), /Global worker cap/);
  assert.throws(() => service.runtimeConfigForSave({
    moaConfig: {
      presets: { default: { referenceModels: ["openai-codex:gpt-5.5"], aggregator: { provider: "moa", model: "default" } } },
    },
  }), /provider moa/);
}

testRuntimeConfigForSaveNormalizesInput();
testRuntimeConfigForSavePreservesPreviousFields();
testValidationStillFailsClosed();

console.log("runtime config save service tests passed");
