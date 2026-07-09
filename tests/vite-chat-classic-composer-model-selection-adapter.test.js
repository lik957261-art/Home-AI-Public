"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-model-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const modelCalls = [];
  const context = {
    console,
    Promise,
    Set,
    globalThis: null,
    window: {
      __homeAiImportChatComposerModelSelectionModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    DEFAULT_COMPOSER_MODEL_ID: "runtime-default",
    COMPOSER_MODEL_OPTIONS: Object.freeze([
      Object.freeze({
        id: "runtime-default",
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
    ]),
    TASK_REASONING_OPTIONS: Object.freeze([
      Object.freeze({ value: "", label: "Default" }),
      Object.freeze({ value: "low", label: "Low" }),
      Object.freeze({ value: "medium", label: "Medium" }),
      Object.freeze({ value: "high", label: "High" }),
      Object.freeze({ value: "xhigh", label: "Xhigh" }),
    ]),
    VIRTUAL_GROUP_AI_MEMBER: Object.freeze({ workspaceId: "AI", label: "AI", virtual: true }),
    state: Object.assign({
      assistantLabel: "Runtime AI",
      defaultComposerModelId: "runtime-default",
      defaultModel: "gpt-runtime",
      modelProvider: "openai-codex",
      reasoningOptions: null,
    }, options.state || {}),
    defaultReasoningLabel() {
      return "Medium";
    },
    getComposerText() {
      return options.composerText || "";
    },
    __modelCalls: modelCalls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-model-ui.js" });
  return { context, modelCalls };
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
  await test("classic composer model-selection adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_MODEL_SELECTION_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-model-selection-model\/chat-composer-model-selection-model\.js/);
    assert.match(source, /__homeAiImportChatComposerModelSelectionModel/);
    assert.match(source, /currentChatComposerModelSelectionModel/);
    assert.match(source, /composerAiMentionInfoPlan/);
    assert.match(source, /selectedComposerModelPlan/);
    assert.match(source, /selectedComposerProviderPlan/);
    assert.match(source, /moaMentionOption/);
  });

  await test("classic adapter consumes ESM model for labels, options, and aliases", async () => {
    const fakeModel = {
      normalizeMentionSearchValue(value) {
        return `normalized:${value}`;
      },
      reasoningCompactLabelPlan(value) {
        return `short:${value}`;
      },
      normalizeReasoningOptionsPlan(input) {
        input.__modelCalls?.push?.("unused");
        return [{ value: "medium", label: "Medium", shortLabel: "M" }];
      },
      assistantDisplayLabelPlan(input) {
        assert.equal(input.assistantLabel, "Runtime AI");
        return "Model Label";
      },
      composerModelOptionsPlan(input) {
        assert.equal(input.defaultModel, "gpt-runtime");
        return [{ id: "runtime-default", label: "Model Label", model: "gpt-runtime", provider: "openai-codex", aliases: [] }];
      },
      chatGptProMentionOptionPlan() {
        return { id: "chatgpt-pro", label: "ChatGPT Pro", provider: "openai-codex" };
      },
      moaMentionOptionPlan() {
        return { id: "moa", label: "MOA", model: "default", provider: "moa" };
      },
    };
    const { context } = createHarness(fakeModel);
    await context.importChatComposerModelSelectionModel(context.window);

    assert.equal(context.normalizeMentionSearch("A B"), "normalized:A B");
    assert.equal(context.fallbackReasoningCompactLabel("high"), "short:high");
    assert.deepEqual(context.normalizeReasoningOptions([{ value: "medium", label: "Medium" }]), [{ value: "medium", label: "Medium", shortLabel: "M" }]);
    assert.equal(context.assistantDisplayLabel(), "Model Label");
    assert.deepEqual(context.composerModelOptions(), [{ id: "runtime-default", label: "Model Label", model: "gpt-runtime", provider: "openai-codex", aliases: [] }]);
    assert.equal(context.chatGptProMentionOption().label, "ChatGPT Pro");
    assert.equal(context.moaMentionOption().provider, "moa");
    assert.equal(context.importedPath, "/vite-islands/chat-composer-model-selection-model/chat-composer-model-selection-model.js");
  });

  await test("classic adapter consumes ESM model for mention parsing and selected model/provider", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerModelOptionsPlan(input) {
        modelCalls.push(["options", input.defaultId]);
        return [{ id: "deepseek-chat", model: "deepseek-chat", provider: "deepseek", aliases: [] }];
      },
      composerModelOptionForMentionPlan(input) {
        modelCalls.push(["mention-option", input.primary, input.secondary]);
        return { id: "deepseek-chat", model: "deepseek-chat", provider: "deepseek" };
      },
      composerAiMentionOptionsPlan(input) {
        modelCalls.push(["mention-options", input.options.length]);
        return [{ label: "DeepSeek", provider: "deepseek" }];
      },
      reasoningEffortFromAiAliasPlan(input) {
        modelCalls.push(["reasoning", input.value]);
        return "high";
      },
      composerAiMentionInfoPlan(input) {
        modelCalls.push(["info", input.text, input.options.length]);
        return {
          mentionsAi: true,
          reasoningEffort: "high",
          model: "deepseek-chat",
          provider: "deepseek",
          modelExplicit: true,
          chatGptPro: false,
          ownerElevationRequired: false,
        };
      },
      selectedComposerModelPlan(input) {
        modelCalls.push(["selected-model", input.text]);
        return "deepseek-chat";
      },
      selectedComposerProviderPlan(input) {
        modelCalls.push(["selected-provider", input.text]);
        return "deepseek";
      },
    };
    const { context } = createHarness(fakeModel, { composerText: "@DeepSeek high" });
    await context.importChatComposerModelSelectionModel(context.window);

    assert.deepEqual(context.composerModelOptionForMention("DeepSeek", "high"), { id: "deepseek-chat", model: "deepseek-chat", provider: "deepseek" });
    assert.deepEqual(context.composerAiMentionOptions(), [{ label: "DeepSeek", provider: "deepseek" }]);
    assert.equal(context.reasoningEffortFromAiAlias("high"), "high");
    assert.equal(context.composerAiMentionInfo("@DeepSeek high").provider, "deepseek");
    assert.equal(context.selectedComposerModel(), "deepseek-chat");
    assert.equal(context.selectedComposerProvider(), "deepseek");
    assert.deepEqual(modelCalls, [
      ["options", "runtime-default"],
      ["mention-option", "DeepSeek", "high"],
      ["options", "runtime-default"],
      ["mention-options", 1],
      ["reasoning", "high"],
      ["options", "runtime-default"],
      ["info", "@DeepSeek high", 1],
      ["options", "runtime-default"],
      ["selected-model", "@DeepSeek high"],
      ["options", "runtime-default"],
      ["selected-provider", "@DeepSeek high"],
    ]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { context } = createHarness({});
    assert.equal(context.normalizeMentionSearch(" Chat GPT "), "chatgpt");
    assert.equal(context.fallbackReasoningCompactLabel("high"), "\u9ad8");
    assert.equal(context.composerAiMentionInfo("@DeepSeek high").model, "deepseek-chat");
    assert.equal(context.composerAiMentionInfo("@MOA").model, "default");
    assert.equal(context.composerAiMentionInfo("@MOA").provider, "moa");
    assert.equal(context.composerAiMentionInfo("@Mixture of Agents").moa, true);
    assert.equal(context.selectedComposerModel("@Grok4.3"), "grok-4.3");
    assert.equal(context.selectedComposerProvider("@Grok4.3"), "xai-oauth");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
