"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-plugin-admin-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createOverlay() {
  return {
    html: "",
    classList: {
      values: new Set(),
      toggle(name, enabled) {
        if (enabled) this.values.add(name);
        else this.values.delete(name);
      },
    },
    set innerHTML(value) {
      this.html = String(value || "");
    },
    get innerHTML() {
      return this.html;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const overlay = createOverlay();
  const context = {
    console,
    Promise,
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportPluginAdminModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : {},
    state: {
      auth: { isOwner: true },
      pluginAdminOpen: true,
      pluginAdminLoading: false,
      pluginAdminError: "",
      pluginAdminExpandedPluginId: "finance",
      pluginAdminPlugins: [
        {
          id: "finance",
          title: "记账",
          riskLevel: "workspace-private",
          authorizedWorkspaceIds: ["owner"],
        },
      ],
      workspaces: [
        { id: "owner", label: "Owner" },
        { id: "family", label: "Family" },
      ],
    },
    $(id) {
      return id === "pluginAdminOverlay" ? overlay : null;
    },
    escapeHtml,
    closeTopMoreMenu() {
      calls.push(["closeTopMoreMenu"]);
    },
    closeSidebar() {
      calls.push(["closeSidebar"]);
    },
    showError(error) {
      calls.push(["showError", error.message]);
    },
    async api(url, options) {
      calls.push(["api", url, options || null]);
      return { plugins: [] };
    },
    __calls: calls,
    __overlay: overlay,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__pluginAdminHarness = {
  PLUGIN_ADMIN_MODEL_ESM_PATH,
  importPluginAdminModel,
  currentPluginAdminModel,
  pluginAdminWorkspaceRowsPlan,
  pluginAdminManagerViewPlan,
  pluginAdminToggleRequestPlan,
  pluginAdminOwnerGatePlan,
  pluginAdminWorkspaceRows,
  renderPluginAdminManager,
  openPluginAdminManager,
  togglePluginWorkspaceGrant,
};`, context, { filename: "app-plugin-admin-ui.js" });
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
  await test("classic plugin-admin adapter declares bounded ESM import path", () => {
    assert.match(source, /PLUGIN_ADMIN_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/plugin-admin-model\/plugin-admin-model\.js/);
    assert.match(source, /__homeAiImportPluginAdminModel/);
    assert.match(source, /importPluginAdminModel/);
    assert.match(source, /currentPluginAdminModel/);
    assert.match(source, /pluginAdminManagerViewPlan/);
    assert.match(source, /pluginAdminToggleRequestPlan/);
  });

  await test("classic adapter consumes ESM manager and row plans", async () => {
    const fakeModel = {
      pluginAdminManagerViewPlan() {
        return {
          errorVisible: false,
          bodyState: "list",
          loadingText: "loading",
          emptyText: "empty",
          cards: [{
            pluginId: "model-plugin",
            title: "Model Plugin",
            expanded: true,
            expandedClass: "is-expanded",
            riskLevel: "workspace-private",
            riskCritical: false,
            metaText: "model-plugin · 工作区私有 · 非 Owner 已开通 1",
            expandLabel: "收起",
            ownerOnly: false,
            contractLabels: ["A", "B", "C"],
            workspaceEmptyText: "none",
            workspaceRows: {
              rows: [{
                pluginId: "model-plugin",
                workspaceId: "owner",
                label: "Owner",
                statusClass: "is-enabled",
                statusTitle: "",
                statusText: "已开通",
                actionLabel: "撤销",
                currentlyAuthorized: true,
              }],
            },
          }],
        };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__pluginAdminHarness.importPluginAdminModel(harness.window);
    harness.__pluginAdminHarness.renderPluginAdminManager();
    assert.equal(harness.__pluginAdminHarness.currentPluginAdminModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/plugin-admin-model/plugin-admin-model.js"]);
    assert.match(harness.__overlay.innerHTML, /Model Plugin/);
    assert.match(harness.__overlay.innerHTML, /data-plugin-workspace-toggle="model-plugin"/);
    assert.match(harness.__overlay.innerHTML, /data-plugin-enabled="1"/);
  });

  await test("classic fallback renders plugin admin rows without ESM", () => {
    const harness = createHarness();
    harness.__pluginAdminHarness.renderPluginAdminManager();
    assert.match(harness.__overlay.innerHTML, /插件管理/);
    assert.match(harness.__overlay.innerHTML, /记账/);
    assert.match(harness.__overlay.innerHTML, /data-plugin-workspace-toggle="finance"/);
    assert.match(harness.__overlay.innerHTML, /Owner 手动开通各工作区/);
  });

  await test("classic adapter uses toggle request plan for API calls", async () => {
    const fakeModel = {
      pluginAdminToggleRequestPlan(input) {
        return {
          ok: true,
          method: input.currentlyAuthorized ? "DELETE" : "POST",
          path: input.currentlyAuthorized
            ? "/api/model/revoke"
            : "/api/model/grant",
          body: input.currentlyAuthorized ? null : { workspaceId: input.workspaceId, displayName: input.displayName },
        };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__pluginAdminHarness.importPluginAdminModel(harness.window);
    await harness.__pluginAdminHarness.togglePluginWorkspaceGrant({
      dataset: {
        pluginWorkspaceToggle: "finance",
        pluginWorkspaceId: "family",
        pluginWorkspaceLabel: "Family",
        pluginEnabled: "0",
      },
    });
    assert.ok(harness.__calls.some((call) => call[0] === "api" && call[1] === "/api/model/grant"));
    const grantCall = harness.__calls.find((call) => call[0] === "api" && call[1] === "/api/model/grant");
    assert.equal(grantCall[2].method, "POST");
    assert.equal(grantCall[2].body, JSON.stringify({ workspaceId: "family", displayName: "Family" }));
  });

  await test("classic adapter keeps Owner gate side effect local", async () => {
    const fakeModel = {
      pluginAdminOwnerGatePlan() {
        return { allowed: false, errorMessage: "Owner blocked by model" };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__pluginAdminHarness.importPluginAdminModel(harness.window);
    await harness.__pluginAdminHarness.openPluginAdminManager();
    assert.deepEqual(harness.__calls.slice(0, 3), [
      ["import", "/vite-islands/plugin-admin-model/plugin-admin-model.js"],
      ["closeTopMoreMenu"],
      ["closeSidebar"],
    ]);
    assert.ok(harness.__calls.some((call) => call[0] === "showError" && call[1] === "Owner blocked by model"));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
