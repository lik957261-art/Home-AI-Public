"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-context-ui.js"), "utf8");

function createHarness(fakeModel) {
  const context = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    globalThis: null,
    window: {
      setTimeout(fn) {
        fn();
        return 1;
      },
      __homeAiImportChatComposerContextModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      auth: { isOwner: true, workspaceId: "owner" },
      composerFocused: false,
      currentThread: {
        messages: [
          { id: "a1", role: "assistant", runId: "run-live", status: "running" },
        ],
      },
      defaultModel: "gpt-default",
      defaultReasoningEffort: "medium",
      keyboardContextMode: false,
      pendingArtifacts: [],
      pendingTaskDirectory: null,
      quotedReply: null,
      selectedWorkspaceId: "owner",
      taskDirectoryFilter: null,
      viewMode: "single",
    },
    isChatSearchMode: () => false,
    isSingleWindowChatView: () => true,
    isSingleWindowView: () => true,
    isTaskDetailView: () => false,
    isTaskListView: () => false,
    isTaskWindowView: () => false,
    isTodoDetailView: () => false,
    isSkillDetailView: () => false,
    chatMessagesForThread: (thread) => thread?.messages || [],
    composerHasDraft: () => false,
    currentTaskGroup: () => null,
    currentWorkspace: () => ({ id: "owner", label: "Owner" }),
    getComposerText: () => "",
    composerAiMentionInfo: () => ({ modelExplicit: false }),
    selectedDefaultComposerModelOption: () => ({ id: "default", label: "GPT", model: "gpt", provider: "openai" }),
    composerModelOptions: () => [],
    selectedComposerReasoningEffort: () => "",
    validTaskReasoningEffort: (value) => value || "",
    taskReasoningCompactLabel: ({ value }) => value || "",
    defaultReasoningCompactLabel: () => "",
    assistantDisplayLabel: () => "Assistant",
    COMPOSER_SEARCH_SOURCE_LOCAL: "local",
    composerSearchSourceOption: () => ({ source: "local", label: "本地" }),
    taskDirectoryFilterLabel: () => "",
    escapeHtml: (value) => String(value),
    updateKeyboardContextMetrics() {},
    taskListGroupsForThread: () => [],
    taskGroupMessagesForThread: (_thread, _groupId, messages) => messages || [],
    $() {
      return null;
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-context-ui.js" });
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
  await test("classic composer context adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_CONTEXT_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-context-model\/chat-composer-context-model\.js/);
    assert.match(source, /__homeAiImportChatComposerContextModel/);
    assert.match(source, /currentChatComposerContextModel/);
    assert.match(source, /composerContextItemsPlan/);
    assert.match(source, /shouldShowComposerContextPlan/);
  });

  await test("classic adapter consumes ESM model for active runs and context chips", async () => {
    const calls = [];
    const fakeModel = {
      createActiveComposerRunIdsPlan(input) {
        calls.push(["active_runs", input.assistantOnly]);
        return { runIds: ["from-model-run"] };
      },
      composerRunCountsPlan(input) {
        calls.push(["counts", input.messages.length]);
        return { counts: { queued: 2, running: 1 } };
      },
      composerPermissionLabelPlan(input) {
        calls.push(["permission", input.auth?.isOwner]);
        return { label: "Owner" };
      },
      composerContextItemsPlan(input) {
        calls.push(["items", input.pendingArtifactCount, input.counts.running]);
        return { items: [{ label: "model-chip", tone: "active" }] };
      },
      shouldShowComposerContextPlan(input) {
        calls.push(["visible", input.items.length, input.viewMode]);
        return { visible: true };
      },
      activeComposerAssistantMessagePlan(input) {
        calls.push(["assistant", input.messages.length]);
        return { message: { role: "assistant", status: "running", model: "model-from-esm" } };
      },
      composerModelReasoningLabelPlan(input) {
        calls.push(["reasoning", input.model, input.reasoning]);
        return { label: "reasoning-from-model" };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerContextModel(context.window);

    const counts = context.composerRunCounts();
    assert.deepEqual(context.activeComposerRunIds(), ["from-model-run"]);
    assert.deepEqual(counts, { queued: 2, running: 1 });
    assert.deepEqual(context.composerContextItems(counts), [{ label: "model-chip", tone: "active" }]);
    assert.equal(context.shouldShowComposerContext([{ label: "model-chip" }], counts), true);
    assert.equal(context.composerModelReasoningLabel(), "reasoning-from-model");
    assert.deepEqual(calls.map((entry) => entry[0]), [
      "counts",
      "active_runs",
      "permission",
      "assistant",
      "items",
      "visible",
      "assistant",
      "reasoning",
    ]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const context = createHarness({});
    context.chatComposerContextModel = null;
    context.chatComposerContextModelPromise = null;
    const counts = context.composerRunCounts();
    assert.deepEqual(context.activeComposerRunIds(), ["run-live"]);
    assert.equal(counts.queued, 0);
    assert.equal(counts.running, 1);
    assert.equal(context.composerContextItems(counts).some((item) => item.label === "运行中 1"), true);
    assert.equal(context.shouldShowComposerContext(context.composerContextItems(counts), counts), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
