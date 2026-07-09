"use strict";

const assert = require("node:assert/strict");
const { createHermesPluginNotificationAuthService, defaultMovieNotificationKeyPath } = require("../adapters/hermes-plugin-notification-auth-service");

function makeReq(key = "") {
  return {
    headers: {
      "x-hermes-web-key": key,
    },
  };
}

function testMovieOwnerNotificationKeyAuthorizesOnlyNotificationPrincipal() {
  const service = createHermesPluginNotificationAuthService({
    dataDir: "/tmp/home-ai-data",
    readFile(filePath) {
      assert.equal(filePath, "/tmp/home-ai-data/plugin-secrets/movie-notification-key.txt");
      return "movie-notification-secret\n";
    },
  });
  const result = service.authorizePluginNotificationRequest({
    pluginId: "movie",
    workspaceId: "owner",
    req: makeReq("movie-notification-secret"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.workspaceId, "owner");
  assert.equal(result.auth.role, "plugin_notification");
  assert.equal(result.auth.principalId, "plugin:movie");
  assert.equal(result.auth.isOwner, false);
  assert.equal(result.auth.keySource, "plugin_notification");
  assert.doesNotMatch(JSON.stringify(result), /movie-notification-secret/);
}

function testWrongPluginWorkspaceOrKeyFailClosed() {
  const service = createHermesPluginNotificationAuthService({
    readFile() {
      return "movie-notification-secret";
    },
  });
  assert.equal(service.authorizePluginNotificationRequest({
    pluginId: "wardrobe",
    workspaceId: "owner",
    req: makeReq("movie-notification-secret"),
  }).ok, false);
  assert.equal(service.authorizePluginNotificationRequest({
    pluginId: "movie",
    workspaceId: "mk",
    req: makeReq("movie-notification-secret"),
  }).ok, false);
  assert.equal(service.authorizePluginNotificationRequest({
    pluginId: "movie",
    workspaceId: "owner",
    req: makeReq("wrong"),
  }).ok, false);
}

function testMissingKeyFileFailsClosed() {
  const service = createHermesPluginNotificationAuthService({
    readFile() {
      throw new Error("missing");
    },
  });
  const result = service.authorizePluginNotificationRequest({
    pluginId: "movie",
    workspaceId: "owner",
    req: makeReq("movie-notification-secret"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "plugin_notification_key_denied");
}

assert.equal(
  defaultMovieNotificationKeyPath("/tmp/home-ai-data"),
  "/tmp/home-ai-data/plugin-secrets/movie-notification-key.txt",
);
testMovieOwnerNotificationKeyAuthorizesOnlyNotificationPrincipal();
testWrongPluginWorkspaceOrKeyFailClosed();
testMissingKeyFileFailsClosed();
console.log("hermes plugin notification auth service tests passed");
