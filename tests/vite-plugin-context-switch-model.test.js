"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const model = await import(pathToFileURL(path.join(__dirname, "..", "src", "vite-islands", "navigation-shell", "plugin-context-switch-model.mjs")).href);

  assert.equal(model.pluginContextGroupId("Movie"), "plugin:movie");
  assert.equal(model.normalizePluginContextId("codex mobile"), "codex-mobile");

  const appTarget = model.pluginContextSwitchTargetPlan({
    viewMode: "movie",
    currentTaskGroupId: "",
    pluginContextNavPluginId: "movie",
  });
  assert.equal(appTarget.available, true);
  assert.equal(appTarget.action, "open_topic");
  assert.equal(appTarget.pluginId, "movie");
  assert.equal(appTarget.targetTaskGroupId, "plugin:movie");
  assert.equal(appTarget.ariaLabel, "打开当前插件对话");
  assert.equal(appTarget.visibleLabel, "对话");

  const topicTarget = model.pluginContextSwitchTargetPlan({
    viewMode: "tasks",
    currentTaskGroupId: "plugin:movie",
    pluginContextNavPluginId: "movie",
  });
  assert.equal(topicTarget.available, true);
  assert.equal(topicTarget.action, "open_app");
  assert.equal(topicTarget.pluginId, "movie");
  assert.equal(topicTarget.ariaLabel, "返回当前插件");
  assert.equal(topicTarget.visibleLabel, "插件");

  assert.equal(model.pluginContextSwitchTargetPlan({ viewMode: "tasks", currentTaskGroupId: "" }).available, false);
  assert.equal(model.pluginContextSwitchTargetPlan({ viewMode: "tasks", currentTaskGroupId: "topic:movie" }).available, false);

  const down = model.pluginContextSwitchDownGesturePlan({ dx: 4, dy: 42, elapsedMs: 160 });
  assert.equal(down.ok, true);
  assert.equal(down.direction, "down");
  assert.equal(down.distanceTriggered, true);

  assert.equal(model.pluginContextSwitchDownGesturePlan({ dx: 2, dy: 8, elapsedMs: 80 }).ok, false);
  assert.equal(model.pluginContextSwitchDownGesturePlan({ dx: 48, dy: 34, elapsedMs: 120 }).ok, false);
  assert.equal(model.pluginContextSwitchDownGesturePlan({ dx: 3, dy: -44, elapsedMs: 120 }).ok, false);

  const fast = model.pluginContextSwitchDownGesturePlan({ dx: 3, dy: 25, elapsedMs: 40 });
  assert.equal(fast.ok, true);
  assert.equal(fast.velocityTriggered, true);

  console.log("vite plugin context switch model tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
