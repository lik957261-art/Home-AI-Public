"use strict";

const assert = require("node:assert/strict");
const {
  createPluginDirectoryContextBindingService,
  normalizeDirectoryRoute,
} = require("../adapters/plugin-directory-context-binding-service");

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
  return createPluginDirectoryContextBindingService({
    storePath: "memory://plugin-directory-context-bindings.json",
    readJsonStore: store.readJsonStore,
    writeJsonStore: store.writeJsonStore,
    nowIso: () => "2026-06-10T00:00:00.000Z",
  });
}

function testRouteKeyUsesWorkspaceAndPathNotDisplayName() {
  const wuping = normalizeDirectoryRoute({
    label: "健康",
    path: "/data/drive/users/weixin_wuping/Hermes-吴萍/健康",
    ownerWorkspaceId: "weixin_wuping",
  });
  const stephen = normalizeDirectoryRoute({
    label: "健康",
    path: "/data/drive/users/weixin_stephen/Hermes-Stephen/健康",
    ownerWorkspaceId: "weixin_stephen",
  });

  assert.notEqual(wuping.key, stephen.key);
  assert.match(wuping.key, /^weixin_wuping\|/);
  assert.match(stephen.key, /^weixin_stephen\|/);
}

function testClaimedBindingHidesOnlyMatchingRoute() {
  const service = createService();
  const claimedRoute = { projectId: "health", path: "/users/wuping/health", ownerWorkspaceId: "weixin_wuping" };
  const otherRoute = { projectId: "health", path: "/users/stephen/health", ownerWorkspaceId: "weixin_stephen" };

  service.upsertBinding({
    workspaceId: "weixin_wuping",
    pluginId: "health",
    directoryRoute: claimedRoute,
    claimMode: "claimed_by_plugin",
    contextRole: "legacy_context",
  });

  const collections = [
    { key: normalizeDirectoryRoute(claimedRoute).key, route: claimedRoute },
    { key: normalizeDirectoryRoute(otherRoute).key, route: otherRoute },
  ];
  const visible = service.filterDirectoryTopicCollections("weixin_wuping", collections);

  assert.deepEqual(visible.map((item) => item.key), [normalizeDirectoryRoute(otherRoute).key]);
}

function testAuxiliaryContextDoesNotHideDirectoryTopicRoot() {
  const service = createService();
  const route = { projectId: "wardrobe", path: "/users/wuping/style-reference", ownerWorkspaceId: "weixin_wuping" };

  service.upsertBinding({
    workspaceId: "weixin_wuping",
    pluginId: "wardrobe",
    directoryRoute: route,
    claimMode: "auxiliary_context",
    contextRole: "primary_evidence",
  });

  assert.equal(service.claimedDirectoryKeys("weixin_wuping").size, 0);
  assert.equal(service.listWorkspaceBindings("weixin_wuping").bindings[0].hideFromDirectoryTopicRoot, false);
}

testRouteKeyUsesWorkspaceAndPathNotDisplayName();
testClaimedBindingHidesOnlyMatchingRoute();
testAuxiliaryContextDoesNotHideDirectoryTopicRoot();
console.log("plugin directory context binding service tests passed");
