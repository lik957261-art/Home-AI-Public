"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  createHermesPluginService,
  findWardrobeAccessKeyPath,
  frameAncestorsAllows,
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
      plugin_launch: "/api/v1/hermes/plugin/launch",
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
  assert.equal(manifest.programApi.pluginLaunchPath, "/api/v1/hermes/plugin/launch");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-wardrobe/config.json");
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "accessKeyFile"), false);
}

function testFrameAncestorsAllowsCurrentOrigin() {
  assert.equal(frameAncestorsAllows("frame-ancestors 'self'", "https://hermes.example.test", "https://hermes.example.test"), true);
  assert.equal(frameAncestorsAllows("frame-ancestors 'self' http://localhost:*", "https://hermes.example.test", "https://wardrobe.example.test"), false);
  assert.equal(frameAncestorsAllows("default-src 'self'; frame-ancestors https://hermes.example.test", "https://hermes.example.test", "https://wardrobe.example.test"), true);
}

async function testFetchesConfiguredWardrobeManifest() {
  const calls = [];
  const service = createHermesPluginService({
    nowIso: () => "2026-05-28T00:00:00.000Z",
    plugins: [{ id: "wardrobe", manifestUrl: "http://nas/plugin.json" }],
    wardrobeAccessKeyPath: "missing-key.txt",
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

async function testFrameAncestorsBlockedReturnsUnavailable() {
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "https://wardrobe.example.test/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: "missing-key.txt",
    fetch(url) {
      if (url.includes("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign(sampleManifest(), {
            entry: { type: "web", url: "https://wardrobe.example.test/?embed=hermes" },
          })),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-security-policy" ? "frame-ancestors 'self' http://localhost:*" : "" },
      });
    },
  });
  const manifest = await service.manifest({ id: "wardrobe", appOrigin: "https://hermes.example.test" });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_frame_ancestors_blocked");
  assert.equal(manifest.embed.blockedByFrameAncestors, true);
}

async function testDefaultNasManifestUrl() {
  const service = createHermesPluginService({
    env: {},
    wardrobeAccessKeyPath: "missing-key.txt",
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

async function testHttpsManifestOverride() {
  const service = createHermesPluginService({
    env: {
      HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL: "https://wardrobe.example.test/api/v1/hermes/plugin/manifest",
    },
    wardrobeAccessKeyPath: "missing-key.txt",
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(Object.assign(sampleManifest(), {
          entry: {
            type: "web",
            url: "https://wardrobe.example.test/?embed=hermes",
            frame_policy: "allow_configured_hermes_origins",
          },
        })),
      });
    },
  });
  assert.equal(service.list()[0].manifestUrl, "https://wardrobe.example.test/api/v1/hermes/plugin/manifest");
  const manifest = await service.manifest({ id: "wardrobe" });
  assert.equal(manifest.available, true);
  assert.equal(manifest.entry.url, "https://wardrobe.example.test/?embed=hermes");
  assert.equal(manifest.entry.origin, "https://wardrobe.example.test");
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

async function testLaunchEntryUsesServerSideWorkspaceKey() {
  const calls = [];
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "https://wardrobe.example.test/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign(sampleManifest(), {
            entry: { type: "web", url: "https://wardrobe.example.test/?embed=hermes" },
            program_api: Object.assign(sampleManifest().program_api, {
              base_url: "https://wardrobe.example.test",
              plugin_launch: "/api/v1/hermes/plugin/launch",
            }),
          })),
        });
      }
      if (url === "https://wardrobe.example.test/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "https://wardrobe.example.test/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/?embed=hermes&launch=wpl_once",
            expires_in: 90,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "wardrobe",
    workspaceId: "owner",
    appOrigin: "https://hermes.example.test",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.entry.url, "https://wardrobe.example.test/?embed=hermes&launch=wpl_once");
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  assert.equal(manifest.embed.expiresIn, 90);
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.method, "POST");
  assert.equal(JSON.parse(launchCall.options.body).workspace_id, "owner");
  assert.match(launchCall.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"/);
}

function testFindWardrobeAccessKeyPath() {
  assert.equal(findWardrobeAccessKeyPath({ wardrobeAccessKeyPath: __filename }), __filename);
}

async function run() {
  testNormalizeManifest();
  testFrameAncestorsAllowsCurrentOrigin();
  await testFetchesConfiguredWardrobeManifest();
  await testFrameAncestorsBlockedReturnsUnavailable();
  await testDefaultNasManifestUrl();
  await testHttpsManifestOverride();
  await testFetchFailureReturnsUnavailable();
  await testLaunchEntryUsesServerSideWorkspaceKey();
  testFindWardrobeAccessKeyPath();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
