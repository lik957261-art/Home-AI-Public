"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-sidebar-task-ui.js"), "utf8");

function createContext(overrides = {}) {
  const calls = [];
  const context = {
    console,
    Math,
    Date,
    Promise,
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    state: {
      viewMode: "movie",
      currentTaskGroupId: "",
      pendingTaskDirectory: null,
      directoryReturnRoute: null,
    },
    window: {
      innerWidth: 390,
      addEventListener() {},
      removeEventListener() {},
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
    sendMoviePluginBackOrReturn() { calls.push("movie-back"); },
    restoreMoviePluginReturnRoute() { calls.push("movie-outer"); },
    exitPluginContextToTopicHome() { calls.push("host-plugin-context-exit"); },
    closeSkillDetail() { calls.push("skill"); },
    openTaskList() { calls.push("task"); },
    openTodoList() { calls.push("todo"); },
    closeDirectoryTopicDraft() { calls.push("directory-topic-draft"); },
    openAutomationList() { calls.push("automation"); },
    closeAutomationSecondarySurface() { calls.push("automation-secondary"); },
    openActionInboxOverview() { calls.push("action-inbox"); },
    showAndroidBackBounceIndicator() { calls.push("android-bounce"); },
    closeGlobalPluginDockForNavigation() {},
    clearActiveBackNavigationSurfaces() {},
    showError(err) { throw err; },
    updateTopicPluginDockChrome() {},
    isTaskListView() { return false; },
    ...overrides,
  };
  context.__calls = calls;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-sidebar-task-ui.js" });
  return context;
}

{
  const context = createContext();
  assert.equal(vm.runInContext("backSwipeTarget()", context), "movie-plugin");
  assert.deepEqual(
    vm.runInContext("homeAINativeBackQuery()", context),
    { target: "movie-plugin", hasTarget: true, primaryBounce: false },
  );
  vm.runInContext('performBackSwipeAction("movie-plugin")', context);
  assert.deepEqual(context.__calls, ["movie-back"]);
}

{
  const context = createContext();
  vm.runInContext("installHomeAINativeBackBridge()", context);
  assert.equal(vm.runInContext("window.HomeAINativeBack.query().target", context), "movie-plugin");
  assert.equal(vm.runInContext('window.HomeAINativeBack.perform("movie-plugin")', context), true);
  assert.deepEqual(context.__calls, ["movie-back"]);
}

{
  const context = createContext({
    pluginTopicBottomButtonId() { return ""; },
    moviePluginBackActive() { return false; },
    moviePluginOuterBackActive() { return true; },
  });
  assert.equal(vm.runInContext("backSwipeTarget()", context), "movie-plugin-outer");
  assert.equal(vm.runInContext('androidPrimaryBackBounceTarget("movie-plugin-outer")', context), false);
  vm.runInContext('performBackSwipeAction("movie-plugin-outer")', context);
  assert.deepEqual(context.__calls, ["movie-outer"]);
}

{
  const context = createContext({
    moviePluginBackActive() { return false; },
    moviePluginOuterBackActive() { return true; },
  });
  assert.equal(vm.runInContext("backSwipeTarget()", context), "plugin-context-home");
  vm.runInContext('performBackSwipeAction("plugin-context-home")', context);
  assert.deepEqual(context.__calls, ["host-plugin-context-exit"]);
}

console.log("movie plugin back swipe harness tests passed");
