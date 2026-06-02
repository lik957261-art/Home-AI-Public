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
    webPushSubject: "mailto:admin@example.invalid",
    webPushVapidPath: vapidPath,
  }, "owner");

  assert.equal(saved.hermesApiBase, "http://localhost:8642");
  assert.equal(saved.defaultModelId, DEFAULT_RUNTIME_MODEL_OPTION.id);
  assert.equal(saved.defaultModel, "gpt-5.5");
  assert.equal(saved.defaultModelProvider, "openai-codex");
  assert.equal(saved.defaultReasoningEffort, "medium");
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
  assert.deepEqual(
    publicConfig.modelOptions.map((item) => item.id),
    ["openai-codex:gpt-5.4", "openai-codex:gpt-5.5", "deepseek:deepseek-chat", "xai-oauth:grok-4.3"],
  );
  assert.deepEqual(
    publicConfig.modelFamilies.map((item) => item.id),
    ["openai-codex", "deepseek", "xai-oauth"],
  );
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
testModelSelectionNormalizesCatalogOnly();
testEnvKeyAndEnvFileFallback();
testValidation();
console.log("runtime-config-provider tests passed");
