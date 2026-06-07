"use strict";

const assert = require("node:assert/strict");

const {
  DEFAULT_RUNTIME_MODEL_OPTION,
  RUNTIME_MODEL_OPTIONS,
  normalizeRuntimeModelSelection,
  runtimeModelFamilies,
  runtimeModelOptionId,
  runtimeModelOptions,
} = require("../adapters/runtime-config-model-service");

function testCatalogDefaultsAndCloneBoundaries() {
  assert.equal(DEFAULT_RUNTIME_MODEL_OPTION.id, "openai-codex:gpt-5.5");
  assert.equal(Object.isFrozen(RUNTIME_MODEL_OPTIONS), true);
  assert.equal(Object.isFrozen(RUNTIME_MODEL_OPTIONS[0]), true);

  const options = runtimeModelOptions();
  options[0].label = "mutated";
  assert.equal(runtimeModelOptions()[0].label, "ChatGPT 5.4");
  assert.deepEqual(
    runtimeModelFamilies().map((item) => item.id),
    ["openai-codex", "deepseek", "xai-oauth"],
  );
}

function testRuntimeModelOptionId() {
  assert.equal(runtimeModelOptionId(" deepseek ", " deepseek-chat "), "deepseek:deepseek-chat");
  assert.equal(runtimeModelOptionId("", "deepseek-chat"), "");
  assert.equal(runtimeModelOptionId("deepseek", ""), "");
}

function testExplicitIdSelection() {
  const selected = normalizeRuntimeModelSelection({
    defaultModelId: "deepseek:deepseek-chat",
    defaultReasoningEffort: "high",
  });
  assert.deepEqual(selected, {
    defaultModelId: "deepseek:deepseek-chat",
    defaultModel: "deepseek-chat",
    defaultModelProvider: "deepseek",
    defaultReasoningEffort: "high",
  });
}

function testProviderModelFallbackSelection() {
  const selected = normalizeRuntimeModelSelection({
    defaultModelProvider: "xai-oauth",
    defaultModel: "grok-4.3",
    defaultReasoningEffort: "xhigh",
  });
  assert.deepEqual(selected, {
    defaultModelId: "xai-oauth:grok-4.3",
    defaultModel: "grok-4.3",
    defaultModelProvider: "xai-oauth",
    defaultReasoningEffort: "xhigh",
  });
}

function testUnknownIdWithPreviousProviderModelFallsBackToKnownSelection() {
  const selected = normalizeRuntimeModelSelection({
    defaultModelId: "unknown-provider:unknown-model",
    defaultModelProvider: "deepseek",
    defaultModel: "deepseek-chat",
    defaultReasoningEffort: "custom-secret-value",
  });
  assert.deepEqual(selected, {
    defaultModelId: "deepseek:deepseek-chat",
    defaultModel: "deepseek-chat",
    defaultModelProvider: "deepseek",
    defaultReasoningEffort: "medium",
  });
}

function testUnknownFreshSelectionUsesDefault() {
  const selected = normalizeRuntimeModelSelection({
    default_model_id: "unknown-provider:unknown-model",
    default_reasoning_effort: "custom-secret-value",
  });
  assert.deepEqual(selected, {
    defaultModelId: "openai-codex:gpt-5.5",
    defaultModel: "gpt-5.5",
    defaultModelProvider: "openai-codex",
    defaultReasoningEffort: "medium",
  });
}

testCatalogDefaultsAndCloneBoundaries();
testRuntimeModelOptionId();
testExplicitIdSelection();
testProviderModelFallbackSelection();
testUnknownIdWithPreviousProviderModelFallsBackToKnownSelection();
testUnknownFreshSelectionUsesDefault();
console.log("runtime-config-model-service tests passed");
