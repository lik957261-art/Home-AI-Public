"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadActionModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-action-model.mjs",
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
  await test("task/topic action model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-action-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("action model builds route patches for directory, regular, and plugin topics", async () => {
    const model = await loadActionModel();
    const actions = model.buildTaskTopicActionModel({
      threadId: "thread_root",
      directoryCollections: [{
        key: "docs",
        label: "Docs",
        defaultGroupId: "topic_docs",
        groupIds: ["topic_docs"],
      }],
      visibleRegularGroups: [{
        id: "topic_regular",
        title: "Regular",
      }],
      pluginCards: [{
        id: "plugin:wardrobe",
        pluginId: "wardrobe",
        title: "衣橱",
      }],
    }, {
      workspaceId: "owner",
    });
    assert.equal(actions.directoryCollections[0].action.actionId, "directory_topic:topic_docs");
    assert.equal(actions.directoryCollections[0].action.routePatch.currentTaskGroupId, "topic_docs");
    assert.equal(actions.directoryCollections[0].action.classicFallbackHref, "/?view=tasks&singleWindowMode=task&workspaceId=owner&threadId=thread_root&taskGroupId=topic_docs");
    assert.equal(actions.visibleRegularGroups[0].action.actionId, "regular_topic:topic_regular");
    assert.equal(actions.pluginCards[0].action.actionId, "plugin_topic:plugin:wardrobe");
    assert.equal(actions.pluginCards[0].action.routePatch.pluginContextNavPluginId, "wardrobe");
  });

  await test("action model marks directory rows unavailable without a default topic", async () => {
    const model = await loadActionModel();
    const actions = model.buildTaskTopicActionModel({
      threadId: "thread_root",
      directoryCollections: [{ key: "empty", label: "Empty" }],
    }, { workspaceId: "owner" });
    assert.equal(actions.directoryCollections[0].action.enabled, false);
    assert.equal(actions.directoryCollections[0].action.disabledReason, "missing_default_topic");
    assert.equal(actions.directoryCollections[0].action.classicFallbackHref, "");
  });

  await test("findTaskTopicAction returns a bounded action by id", async () => {
    const model = await loadActionModel();
    const actions = model.buildTaskTopicActionModel({
      threadId: "thread_root",
      visibleRegularGroups: [{ id: "topic_regular" }],
    }, { workspaceId: "owner" });
    const action = model.findTaskTopicAction(actions, "regular_topic:topic_regular");
    assert.equal(action.routePatch.taskGroupId, "topic_regular");
    assert.equal(model.findTaskTopicAction(actions, "missing"), null);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
