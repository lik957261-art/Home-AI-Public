"use strict";

const RUNTIME_MODEL_OPTIONS = Object.freeze([
  Object.freeze({
    id: "openai-codex:gpt-5.4",
    label: "ChatGPT 5.4",
    familyId: "openai-codex",
    familyLabel: "ChatGPT",
    variantLabel: "5.4",
    provider: "openai-codex",
    model: "gpt-5.4",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "openai-codex:gpt-5.5",
    label: "ChatGPT 5.5",
    familyId: "openai-codex",
    familyLabel: "ChatGPT",
    variantLabel: "5.5",
    provider: "openai-codex",
    model: "gpt-5.5",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "deepseek:deepseek-chat",
    label: "DeepSeek Chat",
    familyId: "deepseek",
    familyLabel: "DeepSeek",
    variantLabel: "Chat",
    provider: "deepseek",
    model: "deepseek-chat",
    defaultReasoningEffort: "medium",
  }),
  Object.freeze({
    id: "xai-oauth:grok-4.3",
    label: "Grok 4.3",
    familyId: "xai-oauth",
    familyLabel: "Grok",
    variantLabel: "4.3",
    provider: "xai-oauth",
    model: "grok-4.3",
    defaultReasoningEffort: "medium",
  }),
]);

const DEFAULT_RUNTIME_MODEL_OPTION = RUNTIME_MODEL_OPTIONS.find((item) => item.id === "openai-codex:gpt-5.5") || RUNTIME_MODEL_OPTIONS[0];
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

function runtimeModelOptionId(provider, model) {
  const cleanProvider = String(provider || "").trim();
  const cleanModel = String(model || "").trim();
  return cleanProvider && cleanModel ? `${cleanProvider}:${cleanModel}` : "";
}

function runtimeModelOptions() {
  return RUNTIME_MODEL_OPTIONS.map((item) => Object.assign({}, item));
}

function runtimeModelFamilies() {
  const seen = new Set();
  const families = [];
  for (const item of RUNTIME_MODEL_OPTIONS) {
    const familyId = String(item.familyId || item.provider || "").trim();
    if (!familyId || seen.has(familyId)) continue;
    seen.add(familyId);
    families.push({
      id: familyId,
      label: item.familyLabel || item.provider || familyId,
      defaultModelId: item.id,
      provider: item.provider,
    });
  }
  return families;
}

function normalizeRuntimeModelSelection(source = {}) {
  const explicitId = String(source.defaultModelId || source.default_model_id || "").trim();
  const explicitProvider = String(source.defaultModelProvider || source.default_model_provider || source.modelProvider || "").trim();
  const explicitModel = String(source.defaultModel || source.default_model || "").trim();
  const id = explicitId || runtimeModelOptionId(explicitProvider, explicitModel);
  const selected = RUNTIME_MODEL_OPTIONS.find((item) => item.id === id)
    || RUNTIME_MODEL_OPTIONS.find((item) => item.provider === explicitProvider && item.model === explicitModel)
    || DEFAULT_RUNTIME_MODEL_OPTION;
  const effort = String(source.defaultReasoningEffort || source.default_reasoning_effort || selected.defaultReasoningEffort || "medium").trim().toLowerCase();
  return {
    defaultModelId: selected.id,
    defaultModel: selected.model,
    defaultModelProvider: selected.provider,
    defaultReasoningEffort: VALID_REASONING_EFFORTS.has(effort) ? effort : selected.defaultReasoningEffort || "medium",
  };
}

module.exports = {
  DEFAULT_RUNTIME_MODEL_OPTION,
  RUNTIME_MODEL_OPTIONS,
  normalizeRuntimeModelSelection,
  runtimeModelFamilies,
  runtimeModelOptionId,
  runtimeModelOptions,
};
