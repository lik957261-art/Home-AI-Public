"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/navigation-view-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("navigation view model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/navigation-view-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans task list restoration without DOM side effects", async () => {
    const model = await loadModel();
    const plan = model.taskListOpenPlan({ reloadTaskWindow: true, restoreScrollTop: 27.8 });
    assert.deepEqual(plan.statePatch, {
      skillDetail: null,
      currentTaskGroupId: "",
    });
    assert.deepEqual(plan.restoreCacheOptions, {
      stickToBottom: false,
      restoreScrollTop: 27.8,
    });
    assert.equal(plan.reloadTaskWindow, true);
    assert.equal(plan.reloadAction, "load_single_window");
    assert.equal(plan.fallbackAction, "render_task_list");
  });

  await test("plans todo and automation list reset state", async () => {
    const model = await loadModel();
    assert.deepEqual(model.todoListOpenPlan({ hasOpenActionInboxList: true }).statePatch, {
      skillDetail: null,
      selectedTodoId: "",
      todoCreateOpen: false,
      actionInboxStatusFilter: "todo",
      viewMode: "",
    });
    assert.equal(model.todoListOpenPlan({ hasOpenActionInboxList: false }).statePatch.viewMode, "inbox");
    assert.deepEqual(model.automationListOpenPlan().statePatch, {
      skillDetail: null,
      selectedAutomationId: "",
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    });
  });

  await test("plans automation return and surface state", async () => {
    const model = await loadModel();
    assert.equal(model.automationReturnActivePlan({
      viewMode: "automation",
      automationDetailView: false,
      automationReturnRoute: "inbox",
    }).secondaryReturnActive, true);
    assert.equal(model.automationReturnActivePlan({
      viewMode: "automation",
      automationDetailView: true,
      automationReturnRoute: "inbox",
      automationReturnScope: "detail",
    }).detailInboxReturnActive, true);
    const surface = model.automationSurfaceOpenPlan({
      returnTo: "inbox",
      returnScope: "detail",
      inboxItemId: " item_1 ",
      create: true,
    });
    assert.deepEqual(surface.storage, {
      key: "hermesWebViewMode",
      value: "automation",
    });
    assert.equal(surface.statePatch.viewMode, "automation");
    assert.equal(surface.statePatch.automationReturnRoute, "inbox");
    assert.equal(surface.statePatch.automationReturnScope, "detail");
    assert.equal(surface.statePatch.automationReturnInboxItemId, "item_1");
    assert.equal(surface.createAfterLoad, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
