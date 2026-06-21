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
    state: {
      viewMode: "music",
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
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    requestAnimationFrame(callback) {
      if (typeof callback === "function") callback();
    },
    clamp01(value) {
      return Math.max(0, Math.min(1, Number(value || 0)));
    },
    $() {
      return null;
    },
    pluginTopicDefForViewMode(viewMode) {
      if (viewMode === "music") return { id: "music" };
      return null;
    },
    pluginTopicBottomButtonId(def) {
      return def?.id === "music" ? "bottomMusicMode" : "";
    },
    pluginTopicDefForCurrentTaskGroupId() {
      return null;
    },
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
    musicPluginBackActive() { return true; },
    musicPluginOuterBackActive() { return true; },
    sendMusicPluginBackOrReturn() { calls.push("music-back"); },
    restoreMusicPluginReturnRoute() { calls.push("music-outer"); },
    exitPluginContextToTopicHome() { calls.push("host-plugin-context-exit"); },
    closeSkillDetail() { calls.push("skill"); },
    openTaskList() { calls.push("task"); },
    openTodoList() { calls.push("todo"); },
    closeDirectoryTopicDraft() { calls.push("directory-topic-draft"); },
    openAutomationList() { calls.push("automation"); },
    closeAutomationSecondarySurface() { calls.push("automation-secondary"); },
    openActionInboxOverview() { calls.push("action-inbox"); },
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
  assert.equal(vm.runInContext("backSwipeTarget()", context), "music-plugin");
  const query = vm.runInContext("homeAINativeBackQuery()", context);
  assert.deepEqual(query, { target: "music-plugin", hasTarget: true, primaryBounce: false });
  vm.runInContext('performBackSwipeAction("music-plugin")', context);
  assert.deepEqual(context.__calls, ["music-back"]);
}

{
  const context = createContext();
  vm.runInContext("installHomeAINativeBackBridge()", context);
  assert.equal(vm.runInContext("window.HomeAINativeBack.query().target", context), "music-plugin");
  assert.equal(vm.runInContext('window.HomeAINativeBack.perform("music-plugin")', context), true);
  assert.deepEqual(context.__calls, ["music-back"]);
}

{
  const context = createContext({
    musicPluginBackActive() { return false; },
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
  });
  assert.equal(vm.runInContext("backSwipeTarget()", context), "plugin-context-home");
  assert.equal(vm.runInContext('androidPrimaryBackBounceTarget("plugin-context-home")', context), false);
  vm.runInContext('performBackSwipeAction("plugin-context-home")', context);
  assert.deepEqual(context.__calls, ["host-plugin-context-exit"]);
}

{
  const context = createContext({
    pluginTopicBottomButtonId() { return ""; },
    musicPluginBackActive() { return false; },
    musicPluginOuterBackActive() { return true; },
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
  });
  assert.equal(vm.runInContext("backSwipeTarget()", context), "music-plugin-outer");
  assert.equal(vm.runInContext('androidPrimaryBackBounceTarget("music-plugin-outer")', context), false);
  vm.runInContext('performBackSwipeAction("music-plugin-outer")', context);
  assert.deepEqual(context.__calls, ["music-outer"]);
}

{
  const context = createContext({
    pluginTopicBottomButtonId() { return ""; },
    musicPluginBackActive() { return false; },
    musicPluginOuterBackActive() { return true; },
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
  });
  vm.runInContext("installHomeAINativeBackBridge()", context);
  assert.deepEqual(
    vm.runInContext("window.HomeAINativeBack.query()", context),
    { target: "music-plugin-outer", hasTarget: true, primaryBounce: false },
  );
  assert.equal(vm.runInContext('window.HomeAINativeBack.perform("music-plugin-outer")', context), true);
  assert.deepEqual(context.__calls, ["music-outer"]);
}

{
  const context = createContext({
    musicPluginBackActive() { return false; },
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
    $(id) {
      if (id !== "app") return null;
      return {
        classList: {
          contains(name) {
            return name === "main-back-visible";
          },
        },
      };
    },
  });
  vm.runInContext("installHomeAINativeBackBridge()", context);
  assert.equal(vm.runInContext('androidPrimaryBackBounceTarget("plugin-context-home")', context), false);
  assert.deepEqual(
    vm.runInContext("window.HomeAINativeBack.query()", context),
    { target: "plugin-context-home", hasTarget: true, primaryBounce: false },
  );
  assert.equal(vm.runInContext('window.HomeAINativeBack.perform("plugin-context-home")', context), true);
  assert.deepEqual(context.__calls, ["host-plugin-context-exit"]);
}

(async () => {
  let popHandler = null;
  let pushCount = 0;
  const history = {
    state: null,
    pushState(nextState) {
      pushCount += 1;
      this.state = nextState;
    },
    replaceState(nextState) {
      this.state = nextState;
    },
  };
  const context = createContext({
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
    window: {
      innerWidth: 390,
      location: { href: "http://127.0.0.1:8797/" },
      history,
      addEventListener(type, handler) {
        if (type === "popstate") popHandler = handler;
      },
      removeEventListener() {},
    },
  });
  assert.equal(vm.runInContext("backSwipeTarget()", context), "music-plugin");
  assert.equal(vm.runInContext('androidPrimaryBackBounceTarget("music-plugin")', context), false);
  vm.runInContext("wireBackNavigationGuard()", context);
  assert.equal(pushCount, 24);
  popHandler();
  assert.equal(pushCount, 25);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(context.__calls, ["music-back"]);
})();

(async () => {
  let popHandler = null;
  let pushCount = 0;
  const history = {
    state: null,
    pushState(nextState) {
      pushCount += 1;
      this.state = nextState;
    },
    replaceState(nextState) {
      this.state = nextState;
    },
  };
  const context = createContext({
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
    window: {
      innerWidth: 390,
      location: { href: "http://127.0.0.1:8797/" },
      history,
      addEventListener(type, handler) {
        if (type === "popstate") popHandler = handler;
      },
      removeEventListener() {},
    },
    musicPluginBackActive() { return false; },
    musicPluginOuterBackActive() { return false; },
    pluginTopicDefForViewMode() { return null; },
    pluginTopicBottomButtonId() { return ""; },
  });
  vm.runInContext("wireBackNavigationGuard()", context);
  assert.equal(pushCount, 24);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  assert.equal(vm.runInContext("androidPrimaryBackBounceTarget()", context), true);
  popHandler();
  assert.equal(pushCount, 25);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  assert.notEqual(context.state.handlingBackNavigation, true);
  assert.deepEqual(context.__calls, []);
  popHandler();
  assert.equal(pushCount, 26);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  assert.notEqual(context.state.handlingBackNavigation, true);
  assert.deepEqual(context.__calls, []);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pushCount, 26);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  assert.notEqual(context.state.handlingBackNavigation, true);
  popHandler();
  assert.equal(pushCount, 27);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pushCount, 27);
  assert.equal(context.state.backNavigationGuardDepth, 24);
  assert.deepEqual(context.__calls, []);

  {
    const listeners = {};
    let bootstrapReleased = false;
    let guardedPushCount = 0;
    const composerTarget = {
      closest(selector) {
        return selector.includes(".composer") ? this : null;
      },
    };
    const mainTarget = {
      closest() {
        return null;
      },
    };
    const guardedHistory = {
      state: null,
      pushState(nextState) {
        guardedPushCount += 1;
        this.state = nextState;
      },
      replaceState(nextState) {
        this.state = nextState;
      },
    };
    const guardedContext = createContext({
      navigator: { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36" },
      window: {
        innerWidth: 390,
        innerHeight: 844,
        location: { href: "http://127.0.0.1:8797/" },
        history: guardedHistory,
        __hermesAndroidBackGuard: {
          depth: 24,
          releaseToApp() {
            bootstrapReleased = true;
            this.appBound = true;
          },
        },
        addEventListener(type, handler) {
          listeners[`window:${type}`] = handler;
        },
        removeEventListener() {},
      },
      document: {
        visibilityState: "visible",
        addEventListener(type, handler) {
          listeners[`document:${type}`] = handler;
        },
        removeEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      },
      musicPluginBackActive() { return false; },
      musicPluginOuterBackActive() { return false; },
    });
    vm.runInContext("wireBackNavigationGuard()", guardedContext);
    assert.equal(bootstrapReleased, true);
    assert.equal(guardedPushCount, 0);
    assert.equal(guardedContext.state.backNavigationGuardDepth, 24);
    listeners["window:focus"]();
    assert.equal(guardedPushCount, 0);
    guardedContext.state.backNavigationGuardDepth = 21;
    listeners["document:visibilitychange"]();
    assert.equal(guardedPushCount, 3);
    assert.equal(guardedContext.state.backNavigationGuardDepth, 24);
    guardedContext.state.backNavigationGuardDepth = 21;
    listeners["document:pointerdown"]({ target: composerTarget, clientY: 812 });
    assert.equal(guardedPushCount, 3);
    assert.equal(guardedContext.state.backNavigationGuardDepth, 21);
    listeners["document:touchstart"]({ target: mainTarget, touches: [{ clientY: 800 }] });
    assert.equal(guardedPushCount, 3);
    assert.equal(guardedContext.state.backNavigationGuardDepth, 21);
    listeners["document:pointerdown"]({ target: mainTarget, clientY: 240 });
    assert.equal(guardedPushCount, 6);
    assert.equal(guardedContext.state.backNavigationGuardDepth, 24);
  }

  console.log("music plugin back swipe harness passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
