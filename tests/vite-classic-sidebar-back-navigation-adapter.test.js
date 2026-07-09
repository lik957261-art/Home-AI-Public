"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-sidebar-task-ui.js"), "utf8");

function createHarness(fakeModel = null, overrides = {}) {
  const calls = [];
  const modelCalls = [];
  const context = {
    console,
    Math,
    Date,
    Promise,
    navigator: { userAgent: "" },
    state: {
      viewMode: "movie",
      currentTaskGroupId: "",
      pendingTaskDirectory: null,
      directoryReturnRoute: null,
    },
    window: {
      innerWidth: 390,
      TaskDocumentPreviewUi: {},
      addEventListener() {},
      removeEventListener() {},
      __homeAiImportSidebarBackNavigationModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    document: {
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    requestAnimationFrame(callback) {
      if (typeof callback === "function") callback();
    },
    clamp01(value) {
      return Math.max(0, Math.min(1, Number(value || 0)));
    },
    $() { return null; },
    pluginTopicDefForViewMode(viewMode) {
      if (viewMode === "movie") return { id: "movie" };
      return null;
    },
    pluginTopicBottomButtonId(def) {
      return def?.id === "movie" ? "bottomMovieMode" : "";
    },
    pluginTopicDefForCurrentTaskGroupId() { return null; },
    isSkillDetailView() { return false; },
    isTaskDetailView() { return false; },
    isTodoDetailView() { return false; },
    kanbanComposerOpen() { return false; },
    isAutomationDetailView() { return false; },
    automationDetailInboxReturnActive() { return false; },
    automationSecondaryReturnActive() { return false; },
    isActionInboxDetailView() { return false; },
    isActionInboxCreateView() { return false; },
    directoryActivePath() { return ""; },
    moviePluginBackActive() { return true; },
    moviePluginOuterBackActive() { return true; },
    sendMoviePluginBackOrReturn() { calls.push(["action", "movie-back"]); },
    restoreMoviePluginReturnRoute() { calls.push(["action", "movie-outer"]); },
    exitPluginContextToTopicHome() { calls.push(["action", "plugin-context-home"]); },
    closeSkillDetail() { calls.push(["action", "skill"]); },
    openTaskList() { calls.push(["action", "task"]); },
    openTodoList() { calls.push(["action", "todo"]); },
    closeDirectoryTopicDraft() { calls.push(["action", "directory-topic-draft"]); },
    openAutomationList() { calls.push(["action", "automation"]); },
    closeAutomationSecondarySurface() { calls.push(["action", "automation-secondary"]); },
    openActionInboxOverview() { calls.push(["action", "action-inbox"]); },
    showAndroidBackBounceIndicator() { calls.push(["action", "android-bounce"]); },
    closeGlobalPluginDockForNavigation() {},
    clearActiveBackNavigationSurfaces() {},
    showError(error) { throw error; },
    updateTopicPluginDockChrome() {},
    isTaskListView() { return false; },
    __calls: calls,
    __modelCalls: modelCalls,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-sidebar-task-ui.js" });
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
  await test("classic sidebar adapter declares bounded ESM import path", () => {
    assert.match(source, /SIDEBAR_BACK_NAVIGATION_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/sidebar-back-navigation-model\/sidebar-back-navigation-model\.js/);
    assert.match(source, /__homeAiImportSidebarBackNavigationModel/);
    assert.match(source, /importSidebarBackNavigationModel/);
    assert.match(source, /currentSidebarBackNavigationModel/);
    assert.match(source, /sidebarBackNavigationPlanInput/);
    assert.match(source, /backSwipeTargetPlan/);
    assert.match(source, /nativeBackQueryPlan/);
  });

  await test("classic sidebar adapter uses ESM model after import", async () => {
    const fakeModel = {
      backSwipeTargetPlan(input) {
        this.lastInput = input;
        return input.moviePluginBackActive ? "model-movie-target" : "model-empty";
      },
      nativeBackQueryPlan(input) {
        return {
          target: String(input.target || ""),
          hasTarget: Boolean(input.target),
          primaryBounce: Boolean(input.primaryBounce),
          viaModel: true,
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    assert.equal(vm.runInContext("backSwipeTarget()", context), "model-movie-target");
    assert.equal(fakeModel.lastInput.pluginContextBack, true);
    assert.equal(fakeModel.lastInput.pluginContextTarget, "plugin-context-home");
    assert.equal(fakeModel.lastInput.moviePluginBackActive, true);
    assert.equal(fakeModel.lastInput.moviePluginOuterBackActive, true);
    assert.deepEqual(vm.runInContext("homeAINativeBackQuery()", context), {
      target: "model-movie-target",
      hasTarget: true,
      primaryBounce: false,
      viaModel: true,
    });
    assert.deepEqual(context.__calls[0], [
      "import",
      "/vite-islands/sidebar-back-navigation-model/sidebar-back-navigation-model.js",
    ]);
  });

  await test("classic sidebar fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, {
      window: {
        __homeAiImportSidebarBackNavigationModel() {
          return new Promise(() => {});
        },
      },
    });
    assert.equal(vm.runInContext("backSwipeTarget()", context), "movie-plugin");
    const query = vm.runInContext("homeAINativeBackQuery()", context);
    assert.equal(query.target, "movie-plugin");
    assert.equal(query.hasTarget, true);
    assert.equal(query.primaryBounce, false);
  });

  await test("classic sidebar fallback preserves plugin-context outer suppression", () => {
    const context = createHarness(null, {
      moviePluginBackActive() { return false; },
      moviePluginOuterBackActive() { return true; },
      window: {
        __homeAiImportSidebarBackNavigationModel() {
          return new Promise(() => {});
        },
      },
    });
    assert.equal(vm.runInContext("backSwipeTarget()", context), "plugin-context-home");
    vm.runInContext('performBackSwipeAction("plugin-context-home")', context);
    assert.deepEqual(context.__calls, [["action", "plugin-context-home"]]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
