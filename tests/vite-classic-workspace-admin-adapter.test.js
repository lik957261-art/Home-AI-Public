"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

function createWorkspaceAdminHarness(apiResult) {
  const source = read("public/app-workspace-admin-ui.js");
  const calls = [];
  const select = { innerHTML: "", value: "" };
  const overlays = [
    { classList: { add: (name) => calls.push(["overlayClass", name]) }, innerHTML: "private" },
  ];
  const context = {
    console,
    window: {
      __homeAiImportWorkspaceAdminModel() {
        calls.push(["importWorkspaceAdminModel"]);
        return Promise.resolve(null);
      },
    },
    state: {
      selectedWorkspaceId: "owner",
      workspaces: [],
      auth: null,
      currentThread: { id: "stale-thread", workspaceId: "owner" },
      currentThreadId: "stale-thread",
      mainConversationSurfaceCache: { "single:owner:chat:private": { id: "stale-thread" } },
      accessKeyManagerOpen: true,
      runtimeConfigOpen: true,
      pluginAdminOpen: true,
    },
    localStorage: {
      setItem(key, value) {
        calls.push(["localStorage", key, value]);
      },
    },
    document: {
      querySelectorAll(selector) {
        calls.push(["querySelectorAll", selector]);
        return overlays;
      },
    },
    api(url) {
      calls.push(["api", url]);
      return Promise.resolve(apiResult);
    },
    $(id) {
      return id === "workspaceSelect" ? select : null;
    },
    escapeHtml(value) {
      return String(value == null ? "" : value);
    },
    renderWorkspaceAccessPanel() {
      calls.push(["renderWorkspaceAccessPanel"]);
    },
    renderComposerContext() {
      calls.push(["renderComposerContext"]);
    },
    resetAccountScopedRuntimeState(reason, options) {
      calls.push(["resetAccountScopedRuntimeState", reason, options]);
      context.state.currentThread = null;
      context.state.currentThreadId = "";
      context.state.mainConversationSurfaceCache = {};
    },
    resetEmbeddedPluginsForWorkspaceChange() {
      calls.push(["resetEmbeddedPluginsForWorkspaceChange"]);
    },
    refreshEmbeddedPluginList(options) {
      calls.push(["refreshEmbeddedPluginList", options]);
      return Promise.resolve();
    },
    refreshPluginAppOrderSurfaces(options) {
      calls.push(["refreshPluginAppOrderSurfaces", options]);
    },
    updateNavigationControls() {
      calls.push(["updateNavigationControls"]);
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-workspace-admin-ui.js" });
  return { context, calls, select, overlays };
}

async function runTests() {
  await test("classic workspace admin imports the Vite ESM owner model", () => {
    const source = read("public/app-workspace-admin-ui.js");
    assert.match(source, /WORKSPACE_ADMIN_MODEL_ESM_PATH = "\/vite-islands\/workspace-admin-model\/workspace-admin-model\.js"/);
    assert.match(source, /function importWorkspaceAdminModel\(\)/);
    assert.match(source, /function currentWorkspaceAdminModel\(\)/);
    assert.match(source, /function workspaceAdminModelFunction\(name\)/);
    assert.match(source, /__homeAiImportWorkspaceAdminModel/);
  });

  await test("classic workspace admin delegates pure plans with fallbacks", () => {
    const source = read("public/app-workspace-admin-ui.js");
    for (const marker of [
      "workspaceRootDirectoryName",
      "workspaceAccessKeyStatusLabel",
      "workspaceTongbaoLineView",
      "workspaceBindingChipLabels",
      "workspaceAccessRowsPlan",
      "runtimeModelFamilyOptionsPlan",
      "runtimeModelOptionsPlan",
      "runtimeReasoningOptionsPlan",
      "runtimeGatewayWorkerInputsPlan",
      "runtimeMoaPresetText",
    ]) {
      assert.match(source, new RegExp(marker));
    }
    assert.match(source, /modelFn\(config, state\.runtimeModelOptions, state\.defaultModelId\)/);
    assert.match(source, /workspaceAdminModelFunction\("runtimeGatewayWorkerInputsPlan"\)\?\.\(config, state\.gatewayPool\?\.config \|\| \{\}\)/);
    assert.match(source, /const inputs = Array\.isArray\(plan\) \? plan : RUNTIME_GATEWAY_WORKER_FIELDS/);
  });

  await test("workspace load correction refreshes plugin lifecycle for non-owner stale owner selection", async () => {
    const { context, calls, select, overlays } = createWorkspaceAdminHarness({
      data: [
        { id: "owner", label: "Owner" },
        { id: "user-90e59859", label: "影音" },
      ],
      auth: {
        isOwner: false,
        workspaceId: "user-90e59859",
        workspaceIds: ["user-90e59859"],
        accountType: "media",
        allowedOwnerSpecialPlugins: ["music", "movie"],
      },
    });

    await context.loadWorkspaces();

    assert.equal(context.state.selectedWorkspaceId, "user-90e59859");
    assert.equal(select.value, "user-90e59859");
    assert.deepEqual(calls.filter((entry) => entry[0] === "resetEmbeddedPluginsForWorkspaceChange"), [
      ["resetEmbeddedPluginsForWorkspaceChange"],
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.filter((entry) => entry[0] === "resetAccountScopedRuntimeState"))), [
      ["resetAccountScopedRuntimeState", "workspace_selection_corrected", {
        preserveAuth: true,
        preserveWorkspaces: true,
      }],
    ]);
    assert.equal(context.state.currentThread, null);
    assert.equal(context.state.currentThreadId, "");
    assert.deepEqual(JSON.parse(JSON.stringify(context.state.mainConversationSurfaceCache)), {});
    const embeddedRefresh = calls.find((entry) => entry[0] === "refreshEmbeddedPluginList");
    assert.ok(embeddedRefresh);
    assert.equal(embeddedRefresh[1]?.force, true);
    const topicRefresh = calls.find((entry) => entry[0] === "refreshPluginAppOrderSurfaces");
    assert.ok(topicRefresh);
    assert.equal(topicRefresh[1]?.force, true);
    assert.ok(calls.some((entry) => entry[0] === "updateNavigationControls"));
    assert.ok(calls.some((entry) => entry[0] === "localStorage" && entry[2] === "user-90e59859"));
    assert.equal(context.state.accessKeyManagerOpen, false);
    assert.equal(context.state.runtimeConfigOpen, false);
    assert.equal(context.state.pluginAdminOpen, false);
    assert.equal(overlays[0].innerHTML, "");
  });

  await test("owner workspace load keeps existing selection without plugin lifecycle reset", async () => {
    const { context, calls, select } = createWorkspaceAdminHarness({
      data: [
        { id: "owner", label: "Owner" },
        { id: "family", label: "Family" },
      ],
      auth: { isOwner: true, workspaceId: "owner", workspaceIds: ["owner", "family"] },
    });

    await context.loadWorkspaces();

    assert.equal(context.state.selectedWorkspaceId, "owner");
    assert.equal(select.value, "owner");
    assert.equal(calls.some((entry) => entry[0] === "resetEmbeddedPluginsForWorkspaceChange"), false);
    assert.equal(calls.some((entry) => entry[0] === "refreshEmbeddedPluginList"), false);
    assert.equal(calls.some((entry) => entry[0] === "refreshPluginAppOrderSurfaces"), false);
  });

  await test("Vite config exposes workspace admin model as a build input", () => {
    const config = read("vite.config.js");
    assert.match(config, /workspaceAdminModelEntry/);
    assert.match(config, /"workspace-admin-model": workspaceAdminModelEntry/);
  });
}

runTests().then(() => {
  if (process.exitCode) process.exit(process.exitCode);
});
