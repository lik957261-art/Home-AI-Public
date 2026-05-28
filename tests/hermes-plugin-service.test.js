"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  createHermesPluginService,
  normalizeManifest,
} = require("../adapters/hermes-plugin-service");

function sampleManifest() {
  return {
    id: "wardrobe",
    title: "Wardrobe",
    description: "Owner-scoped wardrobe application embedded in Hermes Mobile.",
    kind: "embedded_app",
    version: "abc123",
    entry: {
      type: "web",
      url: "http://192.168.10.99:8765/?embed=hermes",
      frame_policy: "allow_configured_hermes_origins",
    },
    mcp: {
      server: "wardrobe-mcp",
      toolset: "wardrobe",
      required_tools: ["wardrobe.search_items", "wardrobe.write_item"],
    },
    program_api: {
      base_url: "http://192.168.10.99:8765",
      plugin_manifest: "/api/v1/hermes/plugin/manifest",
      workspace_registration: "/api/v1/hermes/plugin/workspaces",
      sync_schema_version: 6,
    },
    owner_binding: {
      strategy: "workspace_generated_access_key",
      config_file: ".hermes-wardrobe/config.json",
      access_key_file: ".hermes-wardrobe/access-key.txt",
      cache_dir: ".hermes-cache",
      raw_key_returned_by_wardrobe: false,
    },
    permissions: {
      register_workspace_requires: ["owners:write", "admin:*"],
      owner_token_scopes: ["history:write", "items:read"],
    },
  };
}

function testNormalizeManifest() {
  const manifest = normalizeManifest(sampleManifest(), {
    id: "wardrobe",
    manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-05-28T00:00:00.000Z",
  });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.id, "wardrobe");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://192.168.10.99:8765/?embed=hermes");
  assert.equal(manifest.entry.origin, "http://192.168.10.99:8765");
  assert.equal(manifest.embed.mode, "same_window_iframe");
  assert.equal(manifest.embed.requiresSignedToken, true);
  assert.equal(manifest.mcp.toolset, "wardrobe");
  assert.deepEqual(manifest.mcp.requiredTools, ["wardrobe.search_items", "wardrobe.write_item"]);
  assert.equal(manifest.programApi.baseUrl, "http://192.168.10.99:8765/");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-wardrobe/config.json");
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "accessKeyFile"), false);
}

async function testFetchesConfiguredWardrobeManifest() {
  const calls = [];
  const service = createHermesPluginService({
    nowIso: () => "2026-05-28T00:00:00.000Z",
    plugins: [{ id: "wardrobe", manifestUrl: "http://nas/plugin.json" }],
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleManifest()),
      });
    },
  });
  assert.deepEqual(service.list(), [{ id: "wardrobe", manifestUrl: "http://nas/plugin.json" }]);
  const manifest = await service.manifest({ id: "wardrobe", workspaceId: "owner" });
  assert.equal(manifest.available, true);
  assert.equal(manifest.source.manifestUrl, "http://nas/plugin.json");
  assert.equal(calls[0].url, "http://nas/plugin.json");
  assert.equal(calls[0].options.headers.Accept, "application/json");
}

async function testDefaultNasManifestUrl() {
  const service = createHermesPluginService({
    env: {},
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleManifest()),
      });
    },
  });
  assert.equal(service.list()[0].manifestUrl, DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL);
}

async function testFetchFailureReturnsUnavailable() {
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "http://nas/plugin.json" }],
    fetch() {
      return Promise.resolve({ ok: false, status: 503 });
    },
  });
  const manifest = await service.manifest({ id: "wardrobe" });
  assert.equal(manifest.ok, false);
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_manifest_fetch_failed");
  assert.equal(manifest.status, 503);
}

async function run() {
  testNormalizeManifest();
  await testFetchesConfiguredWardrobeManifest();
  await testDefaultNasManifestUrl();
  await testFetchFailureReturnsUnavailable();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
