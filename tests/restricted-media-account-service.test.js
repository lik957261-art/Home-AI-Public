"use strict";

const assert = require("node:assert/strict");
const {
  MEDIA_OWNER_SPECIAL_PLUGIN_IDS,
  canAccessOwnerSpecialMediaPlugin,
  isRestrictedMediaAccount,
  mediaAccountPublicFields,
  normalizeAllowedOwnerSpecialPlugins,
  normalizeMediaAccountType,
  onlyAllowsOwnerSpecialMediaPlugins,
} = require("../adapters/restricted-media-account-service");

function testMediaAccountDefaultsToMusicAndMovie() {
  const workspace = { id: "media", policy: { account_type: "media" } };

  assert.equal(normalizeMediaAccountType(workspace), "media");
  assert.equal(isRestrictedMediaAccount(workspace), true);
  assert.deepEqual(normalizeAllowedOwnerSpecialPlugins(workspace), MEDIA_OWNER_SPECIAL_PLUGIN_IDS);
  assert.equal(canAccessOwnerSpecialMediaPlugin(workspace, "music"), true);
  assert.equal(canAccessOwnerSpecialMediaPlugin(workspace, "movie"), true);
  assert.equal(canAccessOwnerSpecialMediaPlugin(workspace, "finance"), false);
  assert.equal(onlyAllowsOwnerSpecialMediaPlugins(workspace), true);
}

function testExplicitListIsClampedToMediaPlugins() {
  const workspace = {
    accountType: "media",
    allowedOwnerSpecialPlugins: ["music", "finance", "movie", "codex-mobile", "music"],
  };

  assert.deepEqual(normalizeAllowedOwnerSpecialPlugins(workspace), ["music", "movie"]);
  assert.deepEqual(mediaAccountPublicFields(workspace), {
    accountType: "media",
    restrictedMedia: true,
    allowedOwnerSpecialPlugins: ["music", "movie"],
  });
}

function testExplicitAllowListCreatesRestrictedMediaCapability() {
  const workspace = { id: "child", policy: { allowed_owner_special_plugins: ["music"] } };

  assert.equal(isRestrictedMediaAccount(workspace), true);
  assert.deepEqual(normalizeAllowedOwnerSpecialPlugins(workspace), ["music"]);
  assert.equal(canAccessOwnerSpecialMediaPlugin(workspace, "music"), true);
  assert.equal(canAccessOwnerSpecialMediaPlugin(workspace, "movie"), false);
  assert.equal(onlyAllowsOwnerSpecialMediaPlugins(workspace), true);
}

testMediaAccountDefaultsToMusicAndMovie();
testExplicitListIsClampedToMediaPlugins();
testExplicitAllowListCreatesRestrictedMediaCapability();

console.log("restricted-media-account-service tests passed");
