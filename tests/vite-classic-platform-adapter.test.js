"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-platform-ui.js"), "utf8");

function noop() {}

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const storage = new Map();
  const context = {
    console,
    Date,
    Math,
    Promise,
    URL,
    URLSearchParams,
    AppApiClient: {
      createApiClient() {
        return async () => ({ ok: true });
      },
      handleClientVersionFromResponse() {
        return null;
      },
    },
    state: {
      auth: { isOwner: true },
      clientVersion: "20260705",
      key: "",
      startupStage: "状态",
      viewMode: "tasks",
      selectedWorkspaceId: "owner",
      workspaces: [{ id: "owner" }, { id: "family" }],
      projects: [{ id: "general" }],
      threads: [{ id: "thread_owner" }],
      currentThread: { id: "thread_owner", workspaceId: "owner", messages: [{ id: "m1" }] },
      currentThreadId: "thread_owner",
      currentTaskGroupId: "topic_owner",
      currentThreadRefreshTimer: 7,
      currentThreadRefreshSeq: 2,
      singleWindowRequestSeq: 5,
      mainConversationSurfaceCache: { "single:owner:chat:private": { id: "thread_owner" } },
      mainConversationSurfaceActiveKey: "single:owner:chat:private",
      privateChatThread: { id: "thread_owner", workspaceId: "owner", singleWindow: true },
      groupChatThread: { id: "thread_group", singleWindow: true },
      groupChatThreadId: "thread_group",
      groupChatAvailable: true,
      taskListThread: { id: "thread_tasks", workspaceId: "owner", singleWindow: true },
      taskListThreadId: "thread_tasks",
      todos: [{ id: "todo_1" }],
      automations: [{ id: "auto_1" }],
      actionInboxItems: [{ id: "inbox_1" }],
      embeddedPlugins: { wardrobe: { frame: true } },
      generatedAccessKey: { kind: "workspace", key: "visible" },
    },
    window: {
      location: {
        origin: "https://home.example.test",
        pathname: "/hermes-mobile/",
        href: "https://home.example.test/hermes-mobile/?view=tasks",
        search: "?view=tasks",
      },
      visualViewport: { width: 390 },
      screen: { width: 390, availWidth: 390 },
      history: {
        state: {},
        replaceState(...args) {
          calls.push(["replaceState", ...args]);
        },
      },
      __hermesMobileBrowserShellBlocked: false,
      __hermesMobileBrowserShellDetected: false,
      __homeAiImportPlatformModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
      matchMedia(query) {
        return { matches: String(query || "").includes("coarse") };
      },
      setTimeout(callback) {
        if (typeof callback === "function") callback();
        return 1;
      },
      clearTimeout(timer) {
        calls.push(["clearTimeout", timer]);
      },
    },
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone)",
      maxTouchPoints: 5,
      clipboard: { writeText: async () => {} },
    },
    document: {
      cookie: "",
      documentElement: { dataset: { clientVersion: "20260705" } },
      body: { classList: { add: noop, remove: noop } },
      getElementById() { return null; },
    },
    localStorage: {
      getItem(key) { return storage.get(key) || ""; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    sessionStorage: {
      getItem(key) { return storage.get(`session:${key}`) || ""; },
      setItem(key, value) { storage.set(`session:${key}`, String(value)); },
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    $() { return null; },
    handleClientVersion: noop,
    normalizeClientVersion(value) { return String(value || "").trim(); },
    clientVersionTargetFromUrl() { return ""; },
    openAppConfirmDialog: async () => false,
    openAppPromptDialog: async () => {},
    openAppMessageDialog: async () => {},
    closeTopMoreMenu: noop,
    closeSidebar: noop,
    showPushToast: noop,
    renderClientVersion: noop,
    startupPerfStep: async (_label, fn) => fn(),
    loadStatus: async () => {},
    checkClientVersion: async () => {},
    checkAppUpdate: async () => {},
    loadPushStatus: async () => {},
    updatePushButton: noop,
    loadWorkspaces: async () => {},
    applyRestoredAppRouteSnapshot: () => false,
    loadProjects: async () => {},
    loadSelectedView: async () => {},
    restoreAppRouteSnapshotPosition: noop,
    startClientRefreshChecks: noop,
    connectEvents: noop,
    refreshPushSubscriptionAfterStartup: noop,
    syncPushSubscriptionContext: async () => {},
    scheduleClientLayoutDiagnostics: noop,
    settleMobileBottomNavReservation: noop,
    updateMobileBottomNavReservation: noop,
    requestAnimationFrame(callback) {
      if (typeof callback === "function") callback();
    },
    isSingleWindowChatView: () => false,
    setSingleWindowMode: noop,
    pluginTopicDefById(id) {
      if (id === "custom-plugin") return { id, builtinKind: "" };
      return null;
    },
    persistAppRouteSnapshot: noop,
    suppressComposerAutoFocus: noop,
    blurComposerInput: noop,
    clearRouteScrollTarget: noop,
    setRouteScrollTarget: noop,
    directoryRootForPath: (_path, root) => root || "",
    persistSelectedSubproject: noop,
    resetDirectoryPath: noop,
    configureComposer: noop,
    requireHermesAppWindowForNavigation: () => true,
    hermesAppWindowRequiredText: () => "required",
    updateTaskReasoningControl: noop,
    renderComposerContext: noop,
    __calls: calls,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-platform-ui.js" });
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
  await test("classic platform adapter declares bounded ESM markers", () => {
    assert.match(source, /PLATFORM_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/platform-model\/platform-model\.js/);
    assert.match(source, /function importPlatformModel/);
    assert.match(source, /function currentPlatformModel/);
    assert.match(source, /__homeAiImportPlatformModel/);
    assert.match(source, /normalizedRouteViewPlan/);
    assert.match(source, /routeParamsHaveHermesOwnedDetailTargetPlan/);
    assert.match(source, /mobileBrowserShellDetectionPlan/);
  });

  await test("classic platform adapter delegates pure helpers after ESM import", async () => {
    const modelCalls = [];
    const fakeModel = {
      startupErrorMessagePlan(input) {
        modelCalls.push(["startup", input.stage]);
        return "model startup";
      },
      startupAutoResetPlan(input) {
        modelCalls.push(["reset", input.message]);
        return { shouldReset: false };
      },
      normalizedRouteViewPlan(value, fallback) {
        modelCalls.push(["view", value, fallback]);
        return "model-view";
      },
      pluginContextIdFromTaskGroupIdPlan(value) {
        modelCalls.push(["plugin-task", value]);
        return "model-plugin";
      },
      routePluginContextCandidatesPlan(input) {
        modelCalls.push(["plugin-candidates", input.pluginId]);
        return ["custom-plugin"];
      },
      sameOriginRouteUrlPlan(input) {
        modelCalls.push(["same-origin", input.value]);
        return {
          ok: true,
          href: "https://home.example.test/hermes-mobile/?view=model",
        };
      },
      normalizeHermesAppShellPathPlan(pathname) {
        modelCalls.push(["normalize-path", pathname]);
        return "/model/";
      },
      hermesAppShellPathPlan(input) {
        modelCalls.push(["shell-path", input.pathname || ""]);
        return "/model/";
      },
      hermesAppShellRouteForSearchPlan(input) {
        modelCalls.push(["shell-route", input.search]);
        return `/model/?${input.search}&source=pwa`;
      },
      routeParamsHaveHermesOwnedDetailTargetPlan(params) {
        modelCalls.push(["detail", params.get("messageId") || ""]);
        return true;
      },
      mobileBrowserShellDetectionPlan(input) {
        modelCalls.push(["mobile", input.userAgent]);
        return false;
      },
      mobileBrowserShellDiagnosticTextPlan(input) {
        modelCalls.push(["diagnostic", input.clientVersion]);
        return "model diagnostic";
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    assert.equal(vm.runInContext('startupErrorMessage(new Error("network"))', context), "model startup");
    assert.equal(vm.runInContext('shouldAutoResetClientAfterStartupFailure(new Error("network"))', context), false);
    assert.equal(vm.runInContext('normalizedRouteView("tasks", "")', context), "model-view");
    assert.equal(vm.runInContext('pluginContextIdFromTaskGroupId("plugin:finance")', context), "model-plugin");
    assert.equal(vm.runInContext('routePluginContextId(new URLSearchParams("pluginId=custom-plugin"), "tasks", "")', context), "custom-plugin");
    assert.equal(vm.runInContext('sameOriginRouteUrl("/x").pathname', context), "/hermes-mobile/");
    assert.equal(vm.runInContext('normalizeHermesAppShellPath("/x")', context), "/model/");
    assert.equal(vm.runInContext('hermesAppShellPath("/x")', context), "/model/");
    assert.equal(vm.runInContext('hermesAppShellRouteForParams(new URLSearchParams("view=tasks"))', context), "/model/?view=tasks&source=pwa");
    assert.equal(vm.runInContext('routeParamsHaveHermesOwnedDetailTarget(new URLSearchParams("messageId=m1"))', context), true);
    assert.equal(vm.runInContext('hermesRouteMobileBrowserShell()', context), false);
    assert.equal(vm.runInContext('mobileBrowserShellDiagnosticText()', context), "model diagnostic");
    assert.deepEqual(context.__calls[0], ["import", "/vite-islands/platform-model/platform-model.js"]);
    assert.ok(modelCalls.length >= 10);
  });

  await test("classic platform adapter fallback remains usable before model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}));
    assert.equal(vm.runInContext('startupErrorMessage(new Error("Failed to fetch"))', context), "无法载入工作区（状态），请检查网络后重试。");
    assert.equal(vm.runInContext('shouldAutoResetClientAfterStartupFailure(new Error("network"))', context), true);
    assert.equal(vm.runInContext('normalizedRouteView("codex-mobile", "")', context), "codex");
    assert.equal(vm.runInContext('pluginContextIdFromTaskGroupId("plugin:finance")', context), "finance");
    assert.equal(vm.runInContext('routePluginContextId(new URLSearchParams("pluginId=wardrobe"), "tasks", "")', context), "wardrobe");
    assert.equal(vm.runInContext('sameOriginRouteUrl("https://other.example.test/")', context), null);
    assert.equal(vm.runInContext('normalizeHermesAppShellPath("/hermes-mobile")', context), "/hermes-mobile/");
    assert.equal(vm.runInContext('hermesAppShellRouteForParams(new URLSearchParams("view=tasks"))', context), "/hermes-mobile/?view=tasks&source=pwa");
    assert.equal(vm.runInContext('routeParamsHaveHermesOwnedDetailTarget(new URLSearchParams("messageId=m1"))', context), true);
    assert.equal(vm.runInContext('hermesRouteMobileBrowserShell()', context), true);
    assert.equal(vm.runInContext('mobileBrowserShellDiagnosticText()', context), "client=20260705 mode=browser width=390 touch=5");
  });

  await test("account boundary reset clears volatile workspace projections", () => {
    const context = createHarness();
    vm.runInContext('resetAccountScopedRuntimeState("test_auth_boundary")', context);

    assert.equal(context.state.auth, null);
    assert.equal(context.state.workspaces.length, 0);
    assert.equal(context.state.projects.length, 0);
    assert.equal(context.state.threads.length, 0);
    assert.equal(context.state.currentThread, null);
    assert.equal(context.state.currentThreadId, "");
    assert.equal(context.state.currentTaskGroupId, "");
    assert.deepEqual(JSON.parse(JSON.stringify(context.state.mainConversationSurfaceCache)), {});
    assert.equal(context.state.privateChatThread, null);
    assert.equal(context.state.groupChatThread, null);
    assert.equal(context.state.groupChatThreadId, "");
    assert.equal(context.state.groupChatAvailable, false);
    assert.equal(context.state.taskListThread, null);
    assert.equal(context.state.todos.length, 0);
    assert.equal(context.state.automations.length, 0);
    assert.equal(context.state.actionInboxItems.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(context.state.embeddedPlugins)), {});
    assert.equal(context.state.generatedAccessKey, null);
    assert.equal(context.state.currentThreadRefreshSeq, 3);
    assert.equal(context.state.singleWindowRequestSeq, 6);
    assert.ok(context.__calls.some((entry) => entry[0] === "clearTimeout" && entry[1] === 7));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
