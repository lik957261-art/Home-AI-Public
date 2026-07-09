"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_RUNTIME_MODEL_OPTION,
  createRuntimeConfigProvider,
} = require("../adapters/runtime-config-provider");

function makeProvider() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-runtime-config-"));
  const apiKeyPath = path.join(tempDir, "gateway.key");
  const envPath = path.join(tempDir, ".env");
  const vapidPath = path.join(tempDir, "vapid.json");
  const provider = createRuntimeConfigProvider({
    storagePath: () => path.join(tempDir, "runtime-config.json"),
    ensureDataDir: () => fs.mkdirSync(tempDir, { recursive: true }),
    nowIso: () => "2026-05-07T00:00:00.000Z",
    defaultHermesApiBase: () => "http://127.0.0.1:8642",
    apiKeyPaths: () => [apiKeyPath],
    envPaths: () => [envPath],
    defaultWebPushSubject: () => "mailto:default@example.invalid",
    defaultWebPushVapidPath: () => path.join(tempDir, "default-vapid.json"),
    gatewayWorkerElasticConfig: () => ({
      HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM: "1",
      HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS: "2",
      HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES: "60",
    }),
  });
  return { provider, tempDir, apiKeyPath, envPath, vapidPath };
}

function testSaveAndPublicConfig() {
  const { provider, apiKeyPath, vapidPath } = makeProvider();
  fs.writeFileSync(apiKeyPath, "API_SERVER_KEY=file-key\n", "utf8");
  fs.writeFileSync(vapidPath, JSON.stringify({ publicKey: "public", privateKey: "private" }), "utf8");

  const saved = provider.save({
    hermesApiBase: "http://localhost:8642///?drop=1#fragment",
    hermesApiKeyPath: apiKeyPath,
    moaConfig: {
      enabled: true,
      defaultPreset: "default",
      presets: [{
        name: "default",
        referenceModels: ["openai-codex:gpt-5.5"],
        aggregator: { provider: "openai-codex", model: "gpt-5.5" },
        referenceMaxTokens: 600,
      }],
    },
    webPushSubject: "mailto:admin@example.invalid",
    webPushVapidPath: vapidPath,
  }, "owner");

  assert.equal(saved.hermesApiBase, "http://localhost:8642");
  assert.equal(saved.defaultModelId, DEFAULT_RUNTIME_MODEL_OPTION.id);
  assert.equal(saved.defaultModel, "gpt-5.5");
  assert.equal(saved.defaultModelProvider, "openai-codex");
  assert.equal(saved.defaultReasoningEffort, "medium");
  assert.equal(saved.moaConfig.presets[0].referenceMaxTokens, 600);
  assert.equal(saved.updatedBy, "owner");
  assert.equal(provider.effectiveHermesApiBase(), "http://localhost:8642");
  assert.equal(provider.loadHermesApiKey(), "file-key");
  assert.deepEqual(provider.hermesApiKeyStatus(), { configured: true, source: "file", path: apiKeyPath });

  const publicConfig = provider.publicConfig({
    webPushEnabled: true,
    webPushConfig: { source: "file", publicKey: "public" },
    pushStatus: { enabled: true, subscriptionCount: 3 },
  });
  assert.equal(publicConfig.hermesApiKeyConfigured, true);
  assert.equal(publicConfig.webPushConfigured, true);
  assert.equal(publicConfig.webPushSubscriptionCount, 3);
  assert.equal(publicConfig.webPushVapidExists, true);
  assert.equal(publicConfig.defaultModelId, "openai-codex:gpt-5.5");
  assert.equal(publicConfig.defaultModel, "gpt-5.5");
  assert.equal(publicConfig.defaultModelProvider, "openai-codex");
  assert.equal(publicConfig.defaultReasoningEffort, "medium");
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.ownerMinWarm, 1);
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.workspaceMaxWorkers, 2);
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.idleTtlMinutes, 60);
  assert.equal(publicConfig.moaConfig.enabled, true);
  assert.deepEqual(publicConfig.moaOfficialConfig.presets.default.reference_models, [
    { provider: "openai-codex", model: "gpt-5.5" },
  ]);
  assert.deepEqual(
    publicConfig.modelOptions.map((item) => item.id),
    ["openai-codex:gpt-5.4", "openai-codex:gpt-5.5", "deepseek:deepseek-chat", "xai-oauth:grok-4.3"],
  );
  assert.deepEqual(
    publicConfig.modelFamilies.map((item) => item.id),
    ["openai-codex", "deepseek", "xai-oauth"],
  );
}

function testGatewayWorkerRuntimeSettings() {
  const { provider } = makeProvider();
  const saved = provider.save({
    gatewayWorkerSettings: {
      ownerMinWarm: 0,
      workspaceMaxWorkers: 3,
      globalMaxWorkers: 9,
      idleTtlMinutes: 1,
    },
  }, "owner");
  assert.deepEqual(saved.gatewayWorkerSettings, {
    ownerMinWarm: 0,
    workspaceMaxWorkers: 3,
    globalMaxWorkers: 9,
    idleTtlMinutes: 1,
  });
  const elastic = provider.gatewayWorkerElasticConfig();
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_WEB_GATEWAY_OWNER_MIN_WARM, "0");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS, "3");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS, "9");
  assert.equal(elastic.HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES, "1");
  const publicConfig = provider.publicConfig();
  assert.equal(publicConfig.gatewayWorkerSettings.ownerMinWarm, 0);
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.ownerMinWarm, 0);
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.workspaceMaxWorkers, 3);
  assert.equal(publicConfig.gatewayWorkerEffectiveSettings.idleTtlMinutes, 1);
  const cleared = provider.save({
    gatewayWorkerSettings: {
      ownerMinWarm: "",
      workspaceMaxWorkers: "",
      globalMaxWorkers: "",
      idleTtlMinutes: "",
    },
  }, "owner");
  assert.deepEqual(cleared.gatewayWorkerSettings, {});
  const clearedElastic = provider.gatewayWorkerElasticConfig();
  assert.equal(clearedElastic.HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM, "1");
  assert.equal(clearedElastic.HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS, "2");
  assert.equal(clearedElastic.HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES, "60");
  const clearedPublicConfig = provider.publicConfig();
  assert.deepEqual(clearedPublicConfig.gatewayWorkerSettings, {});
  assert.equal(clearedPublicConfig.gatewayWorkerEffectiveSettings.ownerMinWarm, 1);
  assert.equal(clearedPublicConfig.gatewayWorkerEffectiveSettings.workspaceMaxWorkers, 2);
  assert.equal(clearedPublicConfig.gatewayWorkerEffectiveSettings.idleTtlMinutes, 60);
  assert.throws(() => provider.save({ gatewayWorkerSettings: { globalMaxWorkers: 999 } }), /Global worker cap/);
}

function testModelSelectionNormalizesCatalogOnly() {
  const { provider } = makeProvider();
  const deepseek = provider.save({
    defaultModelId: "deepseek:deepseek-chat",
    defaultReasoningEffort: "high",
  }, "owner");
  assert.equal(deepseek.defaultModelId, "deepseek:deepseek-chat");
  assert.equal(deepseek.defaultModelProvider, "deepseek");
  assert.equal(deepseek.defaultModel, "deepseek-chat");
  assert.equal(deepseek.defaultReasoningEffort, "high");

  const fallback = provider.save({
    defaultModelId: "unknown-provider:unknown-model",
    defaultReasoningEffort: "custom-secret-value",
  }, "owner");
  assert.equal(fallback.defaultModelId, "deepseek:deepseek-chat");
  assert.equal(fallback.defaultModel, "deepseek-chat");
  assert.equal(fallback.defaultReasoningEffort, "medium");

  const fresh = makeProvider().provider.save({
    defaultModelId: "unknown-provider:unknown-model",
    defaultReasoningEffort: "custom-secret-value",
  }, "owner");
  assert.equal(fresh.defaultModelId, DEFAULT_RUNTIME_MODEL_OPTION.id);
  assert.equal(fresh.defaultModel, "gpt-5.5");
  assert.equal(fresh.defaultReasoningEffort, "medium");
}

function testEnvKeyAndEnvFileFallback() {
  const { provider, envPath } = makeProvider();
  assert.equal(provider.loadHermesApiKey({ HERMES_WEB_HERMES_API_KEY: "direct-key" }), "direct-key");

  fs.writeFileSync(envPath, "export HERMES_API_KEY='env-file-key'\n", "utf8");
  assert.equal(provider.loadHermesApiKey({}), "env-file-key");
  assert.deepEqual(provider.hermesApiKeyStatus({}), { configured: true, source: "env-file", path: envPath });
}

function testValidation() {
  const { provider } = makeProvider();
  assert.throws(() => provider.save({ hermesApiBase: "ftp://example.invalid" }), /http or https/);
  assert.throws(() => provider.save({ webPushSubject: "invalid subject" }), /Web Push subject/);
}

testSaveAndPublicConfig();
testGatewayWorkerRuntimeSettings();
testModelSelectionNormalizesCatalogOnly();
testEnvKeyAndEnvFileFallback();
testValidation();
console.log("runtime-config-provider tests passed");
