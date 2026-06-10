"use strict";

const assert = require("node:assert/strict");
const { createPluginTopicBindingService } = require("../adapters/plugin-topic-binding-service");

function createMemoryStore() {
  let state = null;
  return {
    readJsonStore(_path, fallback) {
      return state ? JSON.parse(JSON.stringify(state)) : fallback;
    },
    writeJsonStore(_path, value) {
      state = JSON.parse(JSON.stringify(value));
    },
  };
}

function createService() {
  const store = createMemoryStore();
  return createPluginTopicBindingService({
    storePath: "memory://plugin-topic-bindings.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
}

function testDefaultPluginTopicProjection() {
  const service = createService();
  const projection = service.listTopicProjection("weixin_wuping", {
    plugins: [{ id: "health", label: "健康" }, { id: "wardrobe", label: "衣橱" }],
  });

  assert.deepEqual(projection.topics.map((item) => item.topicId).sort(), ["plugin:health", "plugin:wardrobe"]);
  assert.equal(projection.topics.find((item) => item.pluginId === "health").topicKind, "default_plugin_topic");
}

function testStoredSpecialTopicOverridesProjectionByWorkspace() {
  const service = createService();
  service.upsertTopicBinding({
    workspaceId: "weixin_wuping",
    pluginId: "health",
    topicId: "health:kidney",
    title: "IgA 肾病专题",
    topicKind: "user_special_topic",
  });

  assert.equal(service.listWorkspaceTopicBindings("owner").topics.length, 0);
  assert.equal(service.listWorkspaceTopicBindings("weixin_wuping", { pluginId: "health" }).topics[0].title, "IgA 肾病专题");
}

testDefaultPluginTopicProjection();
testStoredSpecialTopicOverridesProjectionByWorkspace();
console.log("plugin topic binding service tests passed");
