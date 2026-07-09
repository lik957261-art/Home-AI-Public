"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-voice-learning-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const elements = {
    conversation: {
      innerHTML: "",
    },
    sendMessage: {
      disabled: false,
    },
    messageInput: {
      focused: false,
      focus() {
        this.focused = true;
      },
    },
  };
  const window = {
    __homeAiImportVoiceLearningModel(importPath) {
      calls.push(["import", importPath]);
      return Promise.resolve(fakeModel);
    },
  };
  const context = {
    console,
    Promise,
    clearTimeout() {},
    globalThis: null,
    setTimeout(callback) {
      if (typeof callback === "function") callback();
      return 1;
    },
    state: {
      selectedWorkspaceId: "owner",
    },
    window,
    $(id) {
      return elements[id] || null;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    clearQuotedReply(options) {
      calls.push(["clearQuotedReply", options]);
    },
    renderCurrentThread(options) {
      calls.push(["renderCurrentThread", options]);
    },
    scheduleConversationBottomStick() {
      calls.push(["stick"]);
    },
    setComposerText(value) {
      calls.push(["setComposerText", value]);
    },
    updateComposerAction() {
      calls.push(["updateComposerAction"]);
    },
    api: async (targetPath, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push(["api", targetPath, { ...options, body }]);
      return {
        thresholds: {
          phraseActiveSupportCount: 2,
          correctionAutoApplySupportCount: 3,
        },
        recorded: [{ term: "Home <AI>", status: "active", supportCount: 2 }],
      };
    },
    __calls: calls,
    __elements: elements,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__voiceLearningHarness = {
  VOICE_LEARNING_MODEL_ESM_PATH,
  importVoiceLearningModel,
  currentVoiceLearningModel,
  voiceLearningStatusLabel,
  voiceLearningAssistantViewPlan,
  voiceLearningAssistantHtml,
  voiceLearningEngineLabel,
  voiceLearningComparisonViewPlan,
  voiceLearningComparisonHtml,
  voiceLearningLearnRequestPlan,
  openVoiceLearningPanel,
  closeVoiceLearningMode,
  voiceLearningModeActive,
  handleVoiceLearningComposerSend,
  initializeVoiceLearningUi,
};`, context, { filename: "app-voice-learning-ui.js" });
  return context;
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
  await test("classic voice learning adapter declares bounded ESM markers", () => {
    assert.match(source, /VOICE_LEARNING_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/voice-learning-model\/voice-learning-model\.js/);
    assert.match(source, /__homeAiImportVoiceLearningModel/);
    assert.match(source, /importVoiceLearningModel/);
    assert.match(source, /currentVoiceLearningModel/);
    assert.match(source, /voiceLearningAssistantViewPlan/);
    assert.match(source, /voiceLearningLearnRequestPlan/);
  });

  await test("classic adapter imports and delegates to the voice learning model", async () => {
    const fakeModel = {
      voiceLearningStatusLabel() {
        return "model-status";
      },
      voiceLearningEngineLabel() {
        return "model-engine";
      },
      voiceLearningAssistantViewPlan() {
        return {
          title: "model-title",
          thresholdText: "model-threshold",
          emptyText: "model-empty",
          rows: [{ term: "term <x>", statusLabel: "status <x>" }],
        };
      },
      voiceLearningComparisonViewPlan() {
        return {
          visible: true,
          title: "model-comparison",
          description: "model-description",
          rows: [{
            selected: true,
            engineLabel: "engine <x>",
            meta: "meta <x>",
            text: "text <x>",
          }],
        };
      },
      voiceLearningLearnRequestPlan(input) {
        return {
          ok: true,
          path: "/api/voice-input/learn-sent-text",
          method: "POST",
          timeoutMs: 15000,
          body: {
            text: String(input.text || "").trim(),
            workspaceId: input.workspaceId,
            surfaceType: "model-surface",
            pluginId: "",
            threadId: "",
            language: "",
            receiptMode: "phrasebook",
          },
        };
      },
    };
    const harness = createHarness(fakeModel);
    const api = harness.__voiceLearningHarness;
    assert.equal(api.VOICE_LEARNING_MODEL_ESM_PATH, "/vite-islands/voice-learning-model/voice-learning-model.js");
    assert.equal(await api.importVoiceLearningModel(harness.window), fakeModel);
    assert.equal(api.currentVoiceLearningModel(), fakeModel);
    assert.deepEqual(harness.__calls, [["import", "/vite-islands/voice-learning-model/voice-learning-model.js"]]);
    assert.equal(api.voiceLearningStatusLabel({}), "model-status");
    assert.equal(api.voiceLearningEngineLabel("x"), "model-engine");
    assert.match(api.voiceLearningAssistantHtml({}), /model-title/);
    assert.match(api.voiceLearningAssistantHtml({}), /term &lt;x&gt;/);
    assert.match(api.voiceLearningComparisonHtml({}), /voice-learning-asr-row-selected/);
    assert.match(api.voiceLearningComparisonHtml({}), /engine &lt;x&gt;/);
    const request = api.voiceLearningLearnRequestPlan("  hello  ");
    assert.equal(request.body.surfaceType, "model-surface");
    assert.equal(request.body.text, "hello");
  });

  await test("classic adapter preserves fallback HTML escaping and request body", async () => {
    const harness = createHarness();
    const api = harness.__voiceLearningHarness;
    assert.equal(api.currentVoiceLearningModel(), null);
    assert.equal(api.voiceLearningStatusLabel({ status: "active", supportCount: 2 }, { phraseActiveSupportCount: 2 }), "已应用 · 2/2");
    assert.equal(api.voiceLearningEngineLabel("sensevoice-local"), "SenseVoice");
    const assistantHtml = api.voiceLearningAssistantHtml({
      thresholds: {
        phraseActiveSupportCount: 2,
        correctionAutoApplySupportCount: 3,
      },
      recorded: [{ term: "Home <AI>", status: "active", supportCount: 2 }],
    });
    assert.match(assistantHtml, /学习完成/);
    assert.match(assistantHtml, /Home &lt;AI&gt;/);
    assert.match(assistantHtml, /关键词激活阈值 2 次；纠错自动应用阈值 3 次。/);

    const comparisonHtml = api.voiceLearningComparisonHtml({
      backend: "funasr-local",
      comparison: [{
        backend: "funasr-local",
        status: "ok",
        elapsedMs: 10,
        text: "text <unsafe>",
        corrections: { applied: ["a"], phrasebookApplied: [], suggestions: ["s"] },
      }],
    });
    assert.match(comparisonHtml, /voice-learning-asr-row-selected/);
    assert.match(comparisonHtml, /text &lt;unsafe&gt;/);
    assert.match(comparisonHtml, /10ms · 修正 1 · 候选 1 · 已插入/);

    const request = api.voiceLearningLearnRequestPlan("  learned text  ");
    assert.equal(request.path, "/api/voice-input/learn-sent-text");
    assert.deepEqual(JSON.parse(JSON.stringify(request.body)), {
      text: "learned text",
      workspaceId: "owner",
      surfaceType: "",
      pluginId: "",
      threadId: "",
      language: "",
      receiptMode: "phrasebook",
    });
  });

  await test("classic send path uses planned request while keeping UI side effects local", async () => {
    const harness = createHarness();
    const api = harness.__voiceLearningHarness;
    await api.handleVoiceLearningComposerSend("  train me  ");
    const apiCall = harness.__calls.find((call) => call[0] === "api");
    assert.ok(apiCall);
    assert.equal(apiCall[1], "/api/voice-input/learn-sent-text");
    assert.equal(apiCall[2].method, "POST");
    assert.equal(apiCall[2].timeoutMs, 15000);
    assert.equal(apiCall[2].body.text, "train me");
    assert.equal(apiCall[2].body.receiptMode, "phrasebook");
    assert.equal(harness.__elements.sendMessage.disabled, false);
    assert.match(harness.__elements.conversation.innerHTML, /Home &lt;AI&gt;/);
    assert.ok(harness.__calls.some((call) => call[0] === "setComposerText" && call[1] === ""));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
