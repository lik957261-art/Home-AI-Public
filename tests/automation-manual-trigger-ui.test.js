"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-automation-actions-ui.js"), "utf8");
const modelPath = path.join(repoRoot, "src", "vite-islands", "automation-controller", "model.mjs");

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
}

function createHarness(model, apiImpl) {
  const calls = {
    api: [],
    cacheInvalidated: 0,
    load: [],
    render: [],
  };
  const nodes = {
    connectionState: { textContent: "" },
  };
  const context = {
    state: {
      automations: [
        { id: "plugin_daily_progress_rollup", name: "Daily rollup", status: "scheduled" },
      ],
      automationManualTriggers: {},
      selectedWorkspaceId: "owner",
      selectedAutomationId: "",
    },
    $: (id) => nodes[id] || null,
    api(pathname, options = {}) {
      calls.api.push({ pathname, options, pending: context.state.automationManualTriggers.plugin_daily_progress_rollup });
      return apiImpl(pathname, options);
    },
    closeTopMoreMenu() {},
    currentAutomation() {
      return context.state.automations.find((job) => job.id === context.state.selectedAutomationId) || null;
    },
    currentAutomationControllerModel() {
      return model;
    },
    invalidateAutomationListCache() {
      calls.cacheInvalidated += 1;
    },
    loadAutomations(options = {}) {
      calls.load.push(options);
      return Promise.resolve();
    },
    renderAutomationView(options = {}) {
      calls.render.push({
        options,
        trigger: context.state.automationManualTriggers.plugin_daily_progress_rollup || null,
      });
    },
    setTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-automation-actions-ui.js" });
  return { calls, context, nodes };
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

  await test("manual trigger action calls canonical automation run API and renders pending/success", async () => {
    const harness = createHarness(model, (pathname, options) => Promise.resolve({
      ok: true,
      job: { id: "plugin_daily_progress_rollup" },
      source: { runMode: "next_tick" },
    }));
    const result = await harness.context.triggerAutomationJob("plugin_daily_progress_rollup");

    assert.equal(result.ok, true);
    assert.equal(harness.calls.api.length, 1);
    assert.equal(harness.calls.api[0].pathname, "/api/automations/plugin_daily_progress_rollup/run");
    assert.deepEqual(JSON.parse(harness.calls.api[0].options.body), {
      workspaceId: "owner",
      reason: "manual_ui",
    });
    assert.equal(harness.calls.api[0].pending.status, "pending");
    assert.equal(harness.context.state.automationManualTriggers.plugin_daily_progress_rollup.status, "success");
    assert.equal(harness.context.state.automationManualTriggers.plugin_daily_progress_rollup.runMode, "next_tick");
    assert.equal(harness.calls.cacheInvalidated, 1);
    assert.equal(JSON.stringify(harness.calls.load), JSON.stringify([{ detail: "full", refresh: true, silent: true }]));
    assert.ok(harness.calls.render.some((call) => call.trigger?.status === "pending"));
    assert.ok(harness.calls.render.some((call) => call.trigger?.status === "success"));
    assert.equal(harness.nodes.connectionState.textContent, "Home AI OK");
  });

  await test("manual trigger action renders bounded error state without throwing raw response", async () => {
    const error = new Error("backend private failure body should not be rendered");
    error.body = { code: "automation_backend_unavailable", detail: { raw: "private" } };
    const harness = createHarness(model, () => Promise.reject(error));
    const result = await harness.context.triggerAutomationJob("plugin_daily_progress_rollup");

    assert.equal(result, null);
    const entry = harness.context.state.automationManualTriggers.plugin_daily_progress_rollup;
    assert.equal(entry.status, "error");
    assert.equal(entry.issueCode, "automation_backend_unavailable");
    assert.equal(entry.label, "触发失败：automation_backend_unavailable");
    assert.equal(entry.label.includes("private"), false);
    assert.equal(harness.calls.cacheInvalidated, 0);
    assert.equal(harness.nodes.connectionState.textContent, "Home AI error");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
