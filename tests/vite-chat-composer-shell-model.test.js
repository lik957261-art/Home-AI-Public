"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-shell-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
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

  await test("composer shell model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("plans composer shell view state from bounded state", () => {
    const state = {
      viewMode: "single",
      singleWindowMode: "chat",
      selectedWorkspaceId: "owner",
      currentThread: { singleWindow: true, workspaceId: "owner" },
    };
    const plan = model.composerShellViewStatePlan({ state });
    assert.equal(plan.currentSingleWindowLoaded, true);
    assert.equal(plan.singleWindowView, true);
    assert.equal(plan.singleWindowChatView, true);
    assert.equal(plan.taskDetailView, false);
  });

  await test("plans sidebar back actions in precedence order", () => {
    assert.equal(model.sidebarBackActionPlan({
      state: { viewMode: "tasks", currentTaskGroupId: "task-1" },
      viewState: {},
      mobileLayout: true,
    }).action, "open_task_list_and_close_sidebar");
    assert.equal(model.sidebarBackActionPlan({
      state: { viewMode: "todos" },
      viewState: { todoDetailView: true },
    }).action, "open_todo_list_and_close_sidebar");
    assert.equal(model.sidebarBackActionPlan({
      state: { viewMode: "single" },
      viewState: {},
      mobileLayout: true,
    }).action, "close_sidebar");
    assert.equal(model.sidebarBackActionPlan({
      state: { viewMode: "single" },
      viewState: {},
      mobileLayout: false,
    }).action, "reset_sidebar_scroll");
  });

  await test("plans stop-mode and search/send action button state", () => {
    assert.equal(model.composerStopModePlan({
      chatSearchMode: false,
      activeRunIds: ["run-1"],
      singleWindowView: true,
      hasDraft: false,
    }).stopMode, true);
    assert.equal(model.composerStopModePlan({
      chatSearchMode: false,
      activeRunIds: ["run-1"],
      singleWindowView: true,
      hasDraft: true,
    }).stopMode, false);
    const search = model.composerActionViewPlan({
      chatSearchMode: true,
      chatSearchDraft: "",
      mentionAvailable: true,
    });
    assert.equal(search.button.label, "搜索");
    assert.equal(search.button.disabled, true);
    assert.equal(search.attach.text, "×");
    const stop = model.composerActionViewPlan({
      chatSearchMode: false,
      mentionAvailable: false,
      stopMode: true,
    });
    assert.equal(stop.closeMentionMenu, true);
    assert.equal(stop.button.label, "Stop");
    assert.equal(stop.button.disabled, false);
    assert.equal(stop.searchButtons.hidePrevNext, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
