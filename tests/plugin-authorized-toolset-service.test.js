"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPluginAuthorizedToolsetService } = require("../adapters/plugin-authorized-toolset-service");

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function testWorkspaceLocalPluginBindingsBecomeToolsets() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-toolsets-"));
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-wardrobe", "access-key.txt"), "wardrobe-key\n");
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-finance", "access-key.txt"), "finance-key\n");
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-finance", "config.json"), JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }));
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-note", "access-key.txt"), "note-key\n");
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-note", "config.json"), JSON.stringify({
    workspace_id: "note:owner",
    access_key_file: "access-key.txt",
  }));
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-health", "access-key.txt"), "health-key\n");
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-health", "config.json"), JSON.stringify({
    workspace_id: "health:owner",
    access_key_file: "access-key.txt",
  }));

  const service = createPluginAuthorizedToolsetService({ dataDir: dir, env: {}, cacheTtlMs: 0 });

  assert.deepEqual(service.toolsetsForWorkspace("owner"), ["wardrobe", "finance", "note"]);
}

function testKeyOnlyFinanceBindingDoesNotBecomeToolset() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-toolsets-key-only-"));
  writeText(path.join(dir, "drive", "users", "child", ".hermes-finance", "access-key.txt"), "finance-key\n");

  const service = createPluginAuthorizedToolsetService({ dataDir: dir, env: {}, cacheTtlMs: 0 });

  assert.deepEqual(service.toolsetsForWorkspace("child"), []);
}

function testCacheCanBeClearedAfterProvisioning() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-toolsets-cache-"));
  const service = createPluginAuthorizedToolsetService({ dataDir: dir, env: {}, cacheTtlMs: 60_000, nowMs: () => 1000 });

  assert.deepEqual(service.toolsetsForWorkspace("owner"), []);
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-finance", "access-key.txt"), "finance-key\n");
  writeText(path.join(dir, "drive", "users", "owner", ".hermes-finance", "config.json"), JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }));
  assert.deepEqual(service.toolsetsForWorkspace("owner"), []);
  service.clearCache();
  assert.deepEqual(service.toolsetsForWorkspace("owner"), ["finance"]);
}

testWorkspaceLocalPluginBindingsBecomeToolsets();
testKeyOnlyFinanceBindingDoesNotBecomeToolset();
testCacheCanBeClearedAfterProvisioning();
console.log("plugin-authorized-toolset-service tests passed");
