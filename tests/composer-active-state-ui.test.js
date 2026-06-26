"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const composerContextUi = fs.readFileSync(path.join(repoRoot, "public", "app-composer-context-ui.js"), "utf8");

function createContext(thread) {
  const state = {
    auth: { isOwner: true, workspaceId: "owner" },
    composerFocused: false,
    currentThread: thread,
    pendingArtifacts: [],
    pendingTaskDirectory: null,
    quotedReply: null,
    selectedWorkspaceId: "owner",
    taskDirectoryFilter: null,
    viewMode: "single",
  };
  const context = {
    state,
    isChatSearchMode: () => false,
    isSingleWindowChatView: () => true,
    isSingleWindowView: () => true,
    isTaskDetailView: () => false,
    isTaskListView: () => false,
    isTaskWindowView: () => false,
    chatMessagesForThread: (current) => current?.messages || [],
    composerHasDraft: () => false,
    currentTaskGroup: () => null,
    currentWorkspace: () => ({ id: "owner", label: "Owner" }),
    getComposerText: () => "",
    composerAiMentionInfo: () => ({ modelExplicit: false }),
    selectedDefaultComposerModelOption: () => ({ id: "default", label: "GPT", model: "gpt", provider: "openai" }),
    composerModelOptions: () => [],
    validTaskReasoningEffort: (value) => value || "",
    taskReasoningCompactLabel: ({ value }) => value || "",
    defaultReasoningCompactLabel: () => "",
    COMPOSER_SEARCH_SOURCE_LOCAL: "local",
    composerSearchSourceOption: () => ({ source: "local", label: "本地" }),
    taskDirectoryFilterLabel: () => "",
  };
  vm.createContext(context);
  vm.runInContext(`${composerContextUi}
globalThis.composerHarness = {
  activeComposerRunIds,
  composerRunCounts,
  composerContextItems,
  shouldShowComposerContext,
};`, context);
  return context;
}

function testStaleActiveRunIdsDoNotCreateComposerRunState() {
  const context = createContext({
    activeRunIds: ["run-stale"],
    messages: [
      { id: "assistant-1", role: "assistant", runId: "run-stale", status: "completed", content: "done" },
    ],
  });
  const counts = context.composerHarness.composerRunCounts();
  assert.deepEqual(context.composerHarness.activeComposerRunIds(), []);
  assert.equal(counts.queued, 0);
  assert.equal(counts.running, 0);
  assert.equal(context.composerHarness.composerContextItems(counts).some((item) => /运行中|排队/.test(item.label)), false);
  assert.equal(context.composerHarness.shouldShowComposerContext(context.composerHarness.composerContextItems(counts), counts), false);
}

function testRunningAssistantMessageCreatesComposerRunState() {
  const context = createContext({
    activeRunIds: [],
    messages: [
      { id: "assistant-1", role: "assistant", runId: "run-live", status: "running", content: "" },
    ],
  });
  const counts = context.composerHarness.composerRunCounts();
  assert.deepEqual(context.composerHarness.activeComposerRunIds(), ["run-live"]);
  assert.equal(counts.queued, 0);
  assert.equal(counts.running, 1);
  assert.equal(context.composerHarness.composerContextItems(counts).some((item) => item.label === "运行中 1"), true);
  assert.equal(context.composerHarness.shouldShowComposerContext(context.composerHarness.composerContextItems(counts), counts), true);
}

testStaleActiveRunIdsDoNotCreateComposerRunState();
testRunningAssistantMessageCreatesComposerRunState();
console.log("composer active state UI tests passed");
