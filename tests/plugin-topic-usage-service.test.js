"use strict";

const assert = require("node:assert/strict");
const { createPluginTopicUsageService, mergeUsage, normalizePreferences, normalizeUsage } = require("../adapters/plugin-topic-usage-service");

function createMemoryStore() {
  let state = null;
  return {
    readJsonStore(_path, fallback) {
      return state ? JSON.parse(JSON.stringify(state)) : fallback;
    },
    writeJsonStore(_path, value) {
      state = JSON.parse(JSON.stringify(value));
    },
    state() {
      return state;
    },
  };
}

function testNormalizesLegacyPluginUsageShape() {
  const usage = normalizeUsage({
    finance: { count: 2, lastUsedAt: 100 },
    plugins: {
      wardrobe: { count: 1, last_used_at: 90 },
    },
    actions: {
      "wardrobe:style": { count: 3, lastUsedAt: 110 },
    },
  });

  assert.deepEqual(usage.plugins.finance, { count: 2, lastUsedAt: 100 });
  assert.deepEqual(usage.plugins.wardrobe, { count: 1, lastUsedAt: 90 });
  assert.deepEqual(usage.actions["wardrobe:style"], { count: 3, lastUsedAt: 110 });
}

function testMergesByMaxToAvoidRetryDoubleCount() {
  const merged = mergeUsage(
    {
      plugins: { finance: { count: 2, lastUsedAt: 100 } },
      actions: { "wardrobe:style": { count: 1, lastUsedAt: 80 } },
    },
    {
      plugins: { finance: { count: 2, lastUsedAt: 120 }, wardrobe: { count: 1, lastUsedAt: 130 } },
      actions: { "wardrobe:style": { count: 4, lastUsedAt: 70 } },
    },
  );

  assert.deepEqual(merged.plugins.finance, { count: 2, lastUsedAt: 120 });
  assert.deepEqual(merged.plugins.wardrobe, { count: 1, lastUsedAt: 130 });
  assert.deepEqual(merged.actions["wardrobe:style"], { count: 4, lastUsedAt: 80 });
}

function testNormalizesPinnedBottomTabPreferences() {
  assert.deepEqual(normalizePreferences({
    pinnedBottomTabs: ["Finance", "finance", "codex-mobile", "bad value!"],
    pluginOrder: ["Health", "finance", "health", "bad value!"],
  }), {
    pinnedBottomTabs: ["finance", "codex-mobile", "bad-value"],
    pluginOrder: ["health", "finance", "bad-value"],
  });
  assert.equal(normalizeUsage({
    preferences: { pinnedBottomTabs: ["finance"] },
  }).plugins.preferences, undefined);
}

function testPersistsWorkspaceScopedUsage() {
  const store = createMemoryStore();
  let tick = 0;
  const service = createPluginTopicUsageService({
    storePath: "memory://plugin-topic-usage.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => `2026-06-07T00:00:0${tick++}.000Z`,
  });

  const owner = service.mergeWorkspaceUsage("owner", {
    plugins: { finance: { count: 1, lastUsedAt: 1000 } },
  });
  const wuping = service.mergeWorkspaceUsage("weixin_wuping", {
    actions: { "wardrobe:style": { count: 2, lastUsedAt: 2000 } },
  });

  assert.equal(owner.workspaceId, "owner");
  assert.equal(wuping.workspaceId, "weixin_wuping");
  assert.deepEqual(service.readWorkspaceUsage("owner").usage.plugins.finance, { count: 1, lastUsedAt: 1000 });
  assert.deepEqual(service.readWorkspaceUsage("weixin_wuping").usage.actions["wardrobe:style"], { count: 2, lastUsedAt: 2000 });
  assert.equal(service.readWorkspaceUsage("owner").usage.actions["wardrobe:style"], undefined);
  assert.equal(store.state().schemaVersion, 2);
}

function testPersistsWorkspaceScopedPreferencesWithoutClobberingUsage() {
  const store = createMemoryStore();
  let tick = 0;
  const service = createPluginTopicUsageService({
    storePath: "memory://plugin-topic-usage.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => `2026-06-07T00:00:1${tick++}.000Z`,
  });

  service.mergeWorkspaceUsage("owner", {
    plugins: { finance: { count: 1, lastUsedAt: 1000 } },
  });
  const updated = service.mergeWorkspaceUsage("owner", {}, {
    pinnedBottomTabs: ["finance", "wardrobe", "health", "note"],
    pluginOrder: ["health", "finance", "wardrobe"],
  });

  assert.deepEqual(updated.preferences.pinnedBottomTabs, ["finance", "wardrobe", "health"]);
  assert.deepEqual(updated.preferences.pluginOrder, ["health", "finance", "wardrobe"]);
  assert.equal(updated.preferencesUpdatedAt, "2026-06-07T00:00:12.000Z");
  assert.deepEqual(service.readWorkspaceUsage("owner").usage.plugins.finance, { count: 1, lastUsedAt: 1000 });
  assert.deepEqual(service.readWorkspaceUsage("owner").preferences.pinnedBottomTabs, ["finance", "wardrobe", "health"]);
  assert.deepEqual(service.readWorkspaceUsage("owner").preferences.pluginOrder, ["health", "finance", "wardrobe"]);
}

function testPartialPreferencePatchPreservesOtherPreferenceFields() {
  const store = createMemoryStore();
  let tick = 0;
  const service = createPluginTopicUsageService({
    storePath: "memory://plugin-topic-usage.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => `2026-06-07T00:00:2${tick++}.000Z`,
  });

  service.mergeWorkspaceUsage("owner", {}, {
    pinnedBottomTabs: ["finance"],
    pluginOrder: ["health", "finance", "wardrobe"],
  });
  const updated = service.mergeWorkspaceUsage("owner", {}, {
    pinnedBottomTabs: ["wardrobe"],
  });

  assert.deepEqual(updated.preferences.pinnedBottomTabs, ["wardrobe"]);
  assert.deepEqual(updated.preferences.pluginOrder, ["health", "finance", "wardrobe"]);
}

testNormalizesLegacyPluginUsageShape();
testMergesByMaxToAvoidRetryDoubleCount();
testNormalizesPinnedBottomTabPreferences();
testPersistsWorkspaceScopedUsage();
testPersistsWorkspaceScopedPreferencesWithoutClobberingUsage();
testPartialPreferencePatchPreservesOtherPreferenceFields();
console.log("plugin topic usage service tests passed");
