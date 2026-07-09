"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-navigation-view-ui.js"), "utf8");

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const storage = [];
  const context = {
    console,
    Promise,
    state: {
      viewMode: "tasks",
      skillDetail: { id: "skill" },
      currentTaskGroupId: "group_1",
      currentThread: { id: "thread_1" },
      currentThreadId: "thread_1",
      selectedTodoId: "todo_1",
      todoCreateOpen: true,
      actionInboxStatusFilter: "all",
      selectedAutomationId: "auto_1",
      automationEditOpen: true,
      automationEditJobId: "job_1",
      automationOutputHistoryOpen: true,
      automationCreateOpen: true,
      automationReturnRoute: "",
      automationReturnScope: "",
      automationReturnInboxItemId: "",
    },
    window: {
      __homeAiImportNavigationViewModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    localStorage: {
      setItem(key, value) {
        storage.push([key, value]);
      },
    },
    clearQuotedReply(options) { calls.push(["clearQuotedReply", options?.render]); },
    currentTaskThreadIsSharedTopicThread() { return false; },
    taskListReturnScrollTop() { return 12; },
    restoreTaskListThreadFromCache(options) {
      calls.push(["restoreTaskListThreadFromCache", options]);
      return false;
    },
    scheduleTaskListWindowRefresh() { calls.push(["scheduleTaskListWindowRefresh"]); },
    loadSingleWindow(options) {
      calls.push(["loadSingleWindow", options]);
      return Promise.resolve();
    },
    renderThreads() { calls.push(["renderThreads"]); },
    renderCurrentThread(options) { calls.push(["renderCurrentThread", options]); },
    showError(error) { throw error; },
    openActionInboxList() { calls.push(["openActionInboxList"]); },
    renderActionInboxView() { calls.push(["renderActionInboxView"]); },
    renderAutomationView() { calls.push(["renderAutomationView"]); },
    isAutomationDetailView() { return false; },
    openAutomationCreate() { calls.push(["openAutomationCreate"]); },
    closeTopMoreMenu() { calls.push(["closeTopMoreMenu"]); },
    loadSelectedView() {
      calls.push(["loadSelectedView"]);
      return Promise.resolve();
    },
    $(id) {
      if (id === "sidebar" || id === "threadList") return { scrollTop: 9 };
      return null;
    },
    __calls: calls,
    __storage: storage,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-navigation-view-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic navigation view adapter declares bounded ESM import path", () => {
    assert.match(source, /NAVIGATION_VIEW_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/navigation-view-model\/navigation-view-model\.js/);
    assert.match(source, /__homeAiImportNavigationViewModel/);
    assert.match(source, /importNavigationViewModel/);
    assert.match(source, /currentNavigationViewModel/);
    assert.match(source, /taskListOpenPlan/);
    assert.match(source, /automationSurfaceOpenPlan/);
  });

  await test("classic navigation view adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      taskListOpenPlan(input) {
        modelCalls.push(["task", input.restoreScrollTop]);
        return {
          statePatch: { skillDetail: null, currentTaskGroupId: "" },
          restoreCacheOptions: { stickToBottom: false, restoreScrollTop: 44 },
          reloadTaskWindow: false,
        };
      },
      automationReturnActivePlan(input) {
        modelCalls.push(["return", input.viewMode]);
        return { secondaryReturnActive: false, detailInboxReturnActive: true };
      },
      automationSurfaceOpenPlan(options) {
        modelCalls.push(["surface", options.inboxItemId]);
        return {
          statePatch: {
            viewMode: "automation",
            automationReturnRoute: "inbox",
            automationReturnScope: "detail",
            automationReturnInboxItemId: "model-inbox",
            currentTaskGroupId: "",
            currentThread: null,
            currentThreadId: "",
            skillDetail: null,
            selectedAutomationId: "",
            automationEditOpen: false,
            automationEditJobId: "",
            automationOutputHistoryOpen: false,
            automationCreateOpen: false,
          },
          storage: { key: "hermesWebViewMode", value: "automation" },
          createAfterLoad: true,
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    vm.runInContext("openTaskList()", context);
    assert.deepEqual(context.__calls.find((call) => call[0] === "restoreTaskListThreadFromCache"), [
      "restoreTaskListThreadFromCache",
      { stickToBottom: false, restoreScrollTop: 44 },
    ]);
    assert.equal(context.state.currentTaskGroupId, "");
    assert.equal(vm.runInContext("automationDetailInboxReturnActive()", context), true);
    await vm.runInContext('openAutomationSurface({ returnTo: "inbox", returnScope: "detail", inboxItemId: "raw", create: true })', context);
    assert.deepEqual(context.__storage, [["hermesWebViewMode", "automation"]]);
    assert.equal(context.state.automationReturnInboxItemId, "model-inbox");
    assert.ok(context.__calls.some((call) => call[0] === "openAutomationCreate"));
    assert.deepEqual(modelCalls.map((call) => call[0]), ["task", "return", "surface"]);
  });

  await test("classic navigation view fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}), {
      currentTaskThreadIsSharedTopicThread() { return true; },
    });
    vm.runInContext("openTaskList()", context);
    const loadCall = context.__calls.find((call) => call[0] === "loadSingleWindow");
    assert.equal(loadCall[1].groupChat, false);
    assert.equal(loadCall[1].preserveTaskListScroll, true);
    vm.runInContext("openTodoList()", context);
    assert.equal(context.state.actionInboxStatusFilter, "todo");
    assert.ok(context.__calls.some((call) => call[0] === "openActionInboxList"));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
