"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-model-selection-model.mjs");

const defaultModelId = "runtime-default";
const modelOptions = Object.freeze([
  Object.freeze({
    id: defaultModelId,
    label: "ChatGPT default",
    model: "",
    provider: "",
    mentionText: "@ChatGPT",
    aliases: Object.freeze(["ai", "chatgpt", "assistant", "default"]),
    description: "Default runtime model",
  }),
  Object.freeze({
    id: "grok-4.3",
    label: "Grok4.3",
    model: "grok-4.3",
    provider: "xai-oauth",
    mentionText: "@Grok4.3",
    aliases: Object.freeze(["grok", "grok4", "grok4.3", "grok43", "xai", "xaioauth"]),
    description: "xAI OAuth Grok worker",
  }),
  Object.freeze({
    id: "deepseek-chat",
    label: "DeepSeek",
    model: "deepseek-chat",
    provider: "deepseek",
    mentionText: "@DeepSeek",
    aliases: Object.freeze(["deepseek", "deep", "ds", "deepseekchat", "deepseek-chat"]),
    description: "DeepSeek direct API",
  }),
]);
const reasoningOptions = Object.freeze([
  Object.freeze({ value: "", label: "Default" }),
  Object.freeze({ value: "low", label: "Low" }),
  Object.freeze({ value: "medium", label: "Medium" }),
  Object.freeze({ value: "high", label: "High" }),
  Object.freeze({ value: "xhigh", label: "Xhigh" }),
]);

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("composer model-selection model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_MODEL_SELECTION_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("normalizes composer model and reasoning option projections", () => {
    const normalized = model.composerModelOptionsPlan({
      options: modelOptions,
      defaultId: defaultModelId,
      assistantLabel: "Home AI",
      defaultModel: "gpt-runtime",
      modelProvider: "openai-codex",
    });

    assert.equal(normalized[0].label, "Home AI");
    assert.equal(normalized[0].mentionText, "@Home AI");
    assert.equal(normalized[0].description, "gpt-runtime / \u8fd0\u884c\u65f6\u9ed8\u8ba4");
    assert.equal(normalized[0].aliases.includes("Home AI"), true);
    assert.equal(model.reasoningCompactLabelPlan("xhigh"), "Xhigh");
    assert.deepEqual(model.normalizeReasoningOptionsPlan({
      items: [{ value: "high", label: "High" }, { value: "high", label: "Duplicate" }],
      defaultItems: reasoningOptions,
    }), [{ value: "high", label: "High", shortLabel: "\u9ad8" }]);
  });

  await test("parses model mentions, reasoning aliases, ChatGPT Pro, and MoA requests", () => {
    const grok = model.composerAiMentionInfoPlan({
      text: "请 @Grok4.3 high",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    });
    assert.equal(grok.mentionsAi, true);
    assert.equal(grok.model, "grok-4.3");
    assert.equal(grok.provider, "xai-oauth");
    assert.equal(grok.reasoningEffort, "high");
    assert.equal(grok.ownerElevationRequired, false);

    const pro = model.composerAiMentionInfoPlan({
      text: "@ChatGPT Pro",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    });
    assert.equal(pro.chatGptPro, true);
    assert.equal(pro.ownerElevationRequired, true);
    assert.equal(pro.provider, "openai-codex");

    const moa = model.composerAiMentionInfoPlan({
      text: "@MoA",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    });
    assert.equal(moa.moa, true);
    assert.equal(moa.chatGptPro, false);
    assert.equal(moa.ownerElevationRequired, true);
    assert.equal(moa.model, "default");
    assert.equal(moa.provider, "moa");

    const mixtureOfAgents = model.composerAiMentionInfoPlan({
      text: "@Mixture of Agents",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    });
    assert.equal(mixtureOfAgents.moa, true);
    assert.equal(mixtureOfAgents.model, "default");
    assert.equal(mixtureOfAgents.provider, "moa");
  });

  await test("plans selected model/provider and menu options", () => {
    assert.equal(model.selectedComposerModelPlan({
      text: "@DeepSeek medium",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    }), "deepseek-chat");
    assert.equal(model.selectedComposerProviderPlan({
      text: "@DeepSeek medium",
      options: modelOptions,
      defaultReasoningOptions: reasoningOptions,
    }), "deepseek");

    const defaultOptions = model.composerModelOptionsPlan({
      options: modelOptions,
      defaultId: defaultModelId,
      assistantLabel: "ChatGPT",
    });
    const mentionOptions = model.composerAiMentionOptionsPlan({
      options: defaultOptions,
      defaultId: defaultModelId,
      defaultModel: "gpt-runtime",
    });
    assert.equal(mentionOptions[0].label, "ChatGPT Pro");
    assert.equal(mentionOptions[1].label, "MOA");
    assert.equal(mentionOptions[1].provider, "moa");
    assert.equal(mentionOptions[2].reasoningEffort, "xhigh");
    assert.equal(mentionOptions.some((option) => option.provider === "xai-oauth"), true);
    assert.equal(mentionOptions.length, 4);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
