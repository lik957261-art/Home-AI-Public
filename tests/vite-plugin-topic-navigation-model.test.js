"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const model = await import(pathToFileURL(path.join(__dirname, "..", "src", "vite-islands", "navigation-shell", "plugin-topic-navigation-model.mjs")).href);
  const pluginDefs = [
    { id: "finance", label: "记账", deliveryHints: ["finance", "财务", "账本"] },
    { id: "music", label: "音乐", deliveryHints: ["roon", "播放"] },
    { id: "directory", builtinKind: "directory", label: "目录" },
  ];

  assert.equal(model.normalizePluginTopicId("Codex Mobile"), "codex-mobile");
  assert.equal(model.pluginTopicGroupId("Finance"), "plugin:finance");

  const route = {
    workspaceId: "owner",
    projectId: "finance-local",
    subprojectId: "daily",
    root: "/Users/example/path",
  };
  assert.equal(
    model.pluginTopicDirectoryRouteKeyPlan(route, null),
    "owner|finance-local|daily|/users/xuxin/finance",
  );
  assert.equal(
    model.pluginTopicDirectoryRouteKeyPlan(route, null, { classicRouteKey: "classic|route" }),
    "classic|route",
  );

  assert.equal(
    model.pluginTopicInferPluginIdFromRoutePlan({ path: "/Volumes/Data/Roon/playlists" }, {}, { pluginDefs }),
    "music",
  );
  assert.equal(
    model.pluginTopicInferPluginIdFromRoutePlan({}, { pluginId: "finance" }, { pluginDefs }),
    "finance",
  );

  const defaultClaim = model.pluginTopicDefaultDirectoryClaimForRoutePlan(
    { workspaceId: "owner", id: "finance-books", root: "/books/finance" },
    null,
    { workspaceId: "mk", pluginDefs },
  );
  assert.equal(defaultClaim.pluginId, "finance");
  assert.equal(defaultClaim.workspaceId, "mk");
  assert.equal(defaultClaim.defaultTopicId, "plugin:finance");
  assert.equal(defaultClaim.hideFromDirectoryTopicRoot, true);
  assert.equal(model.pluginTopicDirectoryClaimHidesRootPlan(defaultClaim), false);

  const explicitClaim = model.pluginTopicDirectoryClaimForRoutePlan(
    { workspaceId: "owner", id: "music-route", root: "/media/music" },
    null,
    {
      workspaceId: "owner",
      pluginDefs,
      bindingProjection: {
        directoryClaims: [{
          directoryRouteKey: "owner|music-route||/media/music",
          pluginId: "music",
          defaultTopicId: "plugin:music",
          hideFromDirectoryTopicRoot: false,
        }],
      },
    },
  );
  assert.equal(explicitClaim.pluginId, "music");
  assert.equal(explicitClaim.hideFromDirectoryTopicRoot, false);

  const collections = [
    { id: "a", route: { workspaceId: "owner", id: "music-route", root: "/media/music" } },
    { id: "b", route: { workspaceId: "owner", id: "plain", root: "/plain" } },
  ];
  const visibility = model.pluginTopicCollectionRootVisibilityPlan(collections, { pluginDefs });
  assert.deepEqual(visibility.claimed, []);
  assert.deepEqual(visibility.root.map((item) => item.id), ["a", "b"]);

  console.log("vite plugin topic navigation model tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
