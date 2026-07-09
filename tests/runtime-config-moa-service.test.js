"use strict";

const assert = require("node:assert/strict");
const {
  mergeMoaConfig,
  normalizeMoaConfig,
  officialMoaConfig,
} = require("../adapters/runtime-config-moa-service");

function testNormalizeOfficialShape() {
  const normalized = normalizeMoaConfig({
    enabled: true,
    default_preset: "default",
    active_preset: "default",
    presets: {
      default: {
        reference_models: [
          { provider: "openai-codex", model: "gpt-5.5" },
          "openrouter:deepseek/deepseek-v4-pro",
        ],
        aggregator: { provider: "openrouter", model: "anthropic/claude-opus-4.8" },
        reference_max_tokens: "600",
        max_tokens: "4096",
        enabled: true,
      },
    },
  });

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.defaultPreset, "default");
  assert.equal(normalized.activePreset, "default");
  assert.equal(normalized.presets[0].referenceModels[1].provider, "openrouter");
  assert.equal(normalized.presets[0].referenceMaxTokens, 600);

  assert.deepEqual(officialMoaConfig(normalized), {
    enabled: true,
    default_preset: "default",
    active_preset: "default",
    presets: {
      default: {
        reference_models: [
          { provider: "openai-codex", model: "gpt-5.5" },
          { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
        ],
        aggregator: { provider: "openrouter", model: "anthropic/claude-opus-4.8" },
        enabled: true,
        reference_max_tokens: 600,
        max_tokens: 4096,
      },
    },
  });
}

function testMergePreservesPreviousPresetBody() {
  const previous = normalizeMoaConfig({
    enabled: true,
    defaultPreset: "default",
    presets: [{
      name: "default",
      referenceModels: ["openai-codex:gpt-5.5"],
      aggregator: { provider: "openai-codex", model: "gpt-5.5" },
    }],
  });
  const merged = mergeMoaConfig(previous, { enabled: false });
  assert.equal(merged.enabled, false);
  assert.equal(merged.presets[0].aggregator.model, "gpt-5.5");
}

function testValidationFailsClosed() {
  assert.throws(() => normalizeMoaConfig({
    presets: { default: { reference_models: ["moa:default"], aggregator: { provider: "openai-codex", model: "gpt-5.5" } } },
  }), /provider moa/);
  assert.throws(() => normalizeMoaConfig({
    presets: { default: { reference_models: ["openai-codex:gpt-5.5"], aggregator: { provider: "moa", model: "default" } } },
  }), /provider moa/);
  assert.throws(() => normalizeMoaConfig({
    presets: { "bad name": { reference_models: ["openai-codex:gpt-5.5"], aggregator: { provider: "openai-codex", model: "gpt-5.5" } } },
  }), /preset name/);
  assert.throws(() => normalizeMoaConfig({ enabled: true, presets: [] }), /at least one preset/);
  assert.throws(() => normalizeMoaConfig({
    enabled: true,
    defaultPreset: "missing",
    presets: { default: { referenceModels: ["openai-codex:gpt-5.5"], aggregator: { provider: "openai-codex", model: "gpt-5.5" } } },
  }), /default preset/);
}

testNormalizeOfficialShape();
testMergePreservesPreviousPresetBody();
testValidationFailsClosed();

console.log("runtime config moa service tests passed");
