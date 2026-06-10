"use strict";

const assert = require("node:assert/strict");
const {
  createPluginTopicContextSourceService,
  roleContextEligible,
} = require("../adapters/plugin-topic-context-source-service");

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
  return createPluginTopicContextSourceService({
    storePath: "memory://plugin-topic-context-sources.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
}

function testRoleEligibilityPolicy() {
  assert.equal(roleContextEligible("cleaned_summary"), true);
  assert.equal(roleContextEligible("pinned_context"), true);
  assert.equal(roleContextEligible("topic_bound"), true);
  assert.equal(roleContextEligible("delivery_only"), false);
  assert.equal(roleContextEligible("raw_source"), false);
}

function testListsOnlyEligibleSourcesByDefault() {
  const service = createService();
  service.upsertSource({
    workspaceId: "weixin_wuping",
    pluginId: "health",
    topicId: "plugin:health",
    fileRoute: "/健康/summary.md",
    fileRole: "cleaned_summary",
  });
  service.upsertSource({
    workspaceId: "weixin_wuping",
    pluginId: "health",
    topicId: "plugin:health",
    fileRoute: "/健康/raw.pdf",
    fileRole: "delivery_only",
  });

  const eligible = service.listSources({ workspaceId: "weixin_wuping", pluginId: "health", topicId: "plugin:health" });
  assert.deepEqual(eligible.sources.map((item) => item.fileRoute), ["/健康/summary.md".toLowerCase()]);

  const all = service.listSources({ workspaceId: "weixin_wuping", pluginId: "health", topicId: "plugin:health", eligibleOnly: false });
  assert.equal(all.sources.length, 2);
}

function testOwnerWorkspaceDoesNotBleedIntoMemberWorkspace() {
  const service = createService();
  service.upsertSource({
    workspaceId: "owner",
    pluginId: "note",
    fileRoute: "/owner/note/summary.md",
    fileRole: "cleaned_summary",
  });
  service.upsertSource({
    workspaceId: "weixin_wuping",
    pluginId: "note",
    fileRoute: "/wuping/note/summary.md",
    fileRole: "cleaned_summary",
  });

  const wuping = service.listSources({ workspaceId: "weixin_wuping", pluginId: "note" });
  assert.deepEqual(wuping.sources.map((item) => item.fileRoute), ["/wuping/note/summary.md"]);
}

testRoleEligibilityPolicy();
testListsOnlyEligibleSourcesByDefault();
testOwnerWorkspaceDoesNotBleedIntoMemberWorkspace();
console.log("plugin topic context source service tests passed");
