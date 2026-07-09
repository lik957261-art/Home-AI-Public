"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-route-snapshot-ui.js"), "utf8");

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const context = {
    console,
    Date,
    Math,
    Promise,
    URL,
    URLSearchParams,
    state: {
      viewMode: "tasks",
      selectedWorkspaceId: "owner",
      embeddedPlugins: {},
      routeSnapshotTimer: 0,
    },
    window: {
      location: { search: "" },
      clearTimeout() {},
      setTimeout(callback) {
        if (typeof callback === "function") callback();
        return 1;
      },
      __homeAiImportRouteSnapshotModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    localStorage: {
      getItem() { return ""; },
      setItem() {},
    },
    requestAnimationFrame(callback) {
      if (typeof callback === "function") callback();
    },
    $() { return null; },
    normalizedRouteView(value = "", fallback = "") {
      return String(value || fallback || "").trim();
    },
    sameOriginRouteUrl(value = "") {
      try {
        return new URL(value, "http://127.0.0.1:8797");
      } catch {
        return null;
      }
    },
    hermesAppShellRouteForParams(params) {
      return `/?${params.toString()}`;
    },
    requireHermesAppWindowForRoute() { return true; },
    applyRouteParams() { return true; },
    scrollRouteMessageIntoViewStable() {},
    embeddedPluginDefByView() { return null; },
    embeddedPluginRecord() { return {}; },
    __calls: calls,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-route-snapshot-ui.js" });
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
  await test("classic route snapshot adapter declares bounded ESM import path", () => {
    assert.match(source, /ROUTE_SNAPSHOT_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/route-snapshot-model\/route-snapshot-model\.js/);
    assert.match(source, /__homeAiImportRouteSnapshotModel/);
    assert.match(source, /importRouteSnapshotModel/);
    assert.match(source, /currentRouteSnapshotModel/);
    assert.match(source, /boundedRouteSnapshotValuePlan/);
    assert.match(source, /embeddedPluginReturnRouteSnapshotEntries/);
    assert.match(source, /embeddedPluginReturnRouteFromSnapshotParamsPlan/);
    assert.match(source, /routeParamsHaveExplicitLaunchTargetPlan/);
  });

  await test("classic route snapshot adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      boundedRouteSnapshotValuePlan(value, max) {
        modelCalls.push(["bound", value, max]);
        return `model:${String(value || "").trim()}`.slice(0, max);
      },
      embeddedPluginReturnRouteSnapshotEntries(route) {
        modelCalls.push(["entries", route.viewMode]);
        return { ok: true, entries: [["returnView", "model-view"], ["returnThreadId", "model-thread"]] };
      },
      embeddedPluginReturnRouteFromSnapshotParamsPlan(params, options) {
        modelCalls.push(["decode", options.normalizedView]);
        return { viewMode: "model-return", singleWindowMode: "chat" };
      },
      routeParamsHaveExplicitLaunchTargetPlan(params) {
        modelCalls.push(["explicit", params.get("messageId") || ""]);
        return true;
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    assert.equal(vm.runInContext('boundedRouteSnapshotValue(" value ", 12)', context), "model:value");
    const encoded = vm.runInContext(`
      const params = new URLSearchParams();
      appendEmbeddedPluginReturnRouteSnapshotParams(params, { viewMode: "tasks" });
      params.toString();
    `, context);
    assert.equal(encoded, "returnView=model-view&returnThreadId=model-thread");
    const decoded = vm.runInContext('embeddedPluginReturnRouteFromSnapshotParams(new URLSearchParams("returnView=tasks"), "codex")', context);
    assert.equal(decoded.viewMode, "model-return");
    assert.equal(vm.runInContext('routeParamsHaveExplicitLaunchTarget(new URLSearchParams("messageId=m1"))', context), true);
    assert.deepEqual(context.__calls[0], ["import", "/vite-islands/route-snapshot-model/route-snapshot-model.js"]);
    assert.deepEqual(modelCalls.map((call) => call[0]), ["bound", "entries", "decode", "explicit"]);
  });

  await test("classic route snapshot fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}));
    assert.equal(vm.runInContext('boundedRouteSnapshotValue(" abcdef ", 3)', context), "abc");
    const encoded = vm.runInContext(`
      const params = new URLSearchParams();
      appendEmbeddedPluginReturnRouteSnapshotParams(params, {
        viewMode: "tasks",
        currentThreadId: "thread_1",
        actionInboxCreateOpen: true,
        conversationScrollTop: 7.4,
      });
      params.toString();
    `, context);
    assert.match(encoded, /returnView=tasks/);
    assert.match(encoded, /returnThreadId=thread_1/);
    assert.match(encoded, /returnInboxCreate=1/);
    assert.match(encoded, /returnConversationScrollTop=7/);
    const decoded = vm.runInContext('embeddedPluginReturnRouteFromSnapshotParams(new URLSearchParams("returnView=tasks&returnInboxCreate=1"), "codex")', context);
    assert.equal(decoded.viewMode, "tasks");
    assert.equal(decoded.actionInboxCreateOpen, true);
    assert.equal(vm.runInContext('routeParamsHaveExplicitLaunchTarget(new URLSearchParams("messageId=m1"))', context), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
