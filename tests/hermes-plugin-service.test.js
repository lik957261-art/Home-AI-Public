"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL,
  DEFAULT_FINANCE_PLUGIN_MANIFEST_URL,
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  configuredPlugins,
  createHermesPluginService,
  discoverPluginWorkspaceIdsFromAccessKeys,
  findCodexMobileAccessKeyPath,
  findFinanceAccessKeyPath,
  findWardrobeAccessKeyPath,
  frameAncestorsAllows,
  normalizeManifest,
  normalizePluginAppearance,
  pluginSameOriginProxyPathForUrl,
  reviewFinanceLedgerJoinRequest,
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

function sampleCodexManifest() {
  return {
    id: "codex-mobile",
    title: "Codex Mobile",
    description: "Authenticated Codex Mobile Web embedded in Hermes Mobile as an independent plugin.",
    kind: "embedded_app",
    version: "0.1.11",
    entry: {
      type: "web",
      url: "http://127.0.0.1:8787/?embed=hermes",
      frame_policy: "allow_configured_hermes_origins",
    },
    program_api: {
      base_url: "http://127.0.0.1:8787",
      plugin_manifest: "/api/v1/hermes/plugin/manifest",
      workspace_registration: "/api/v1/hermes/plugin/workspaces",
      callback_registration: "/api/v1/hermes/plugin/callbacks",
      plugin_launch: "/api/v1/hermes/plugin/launch",
      sync_schema_version: 1,
    },
    owner_binding: {
      strategy: "codex_mobile_access_key",
      config_file: ".codex-mobile-web/plugin.json",
      access_key_file: ".codex-mobile-web/access_key",
      raw_key_returned_by_codex_mobile: false,
    },
    permissions: {
      register_workspace_requires: ["codex_mobile_access_key"],
      owner_token_scopes: ["threads:read", "threads:write", "uploads:write"],
    },
  };
}

function sampleFinanceManifest() {
  return {
    id: "finance",
    title: "记账",
    type: "embedded-app",
    entry: "http://127.0.0.1:8791/finance.html?embed=hermes",
    launch: "http://127.0.0.1:8791/api/v1/hermes/plugin/launch",
    toolsets: ["finance"],
    mcpServer: "finance",
    permissions: ["finance:read", "finance:write"],
    embedding: {
      state_event: "finance.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "finance.plugin.back_result",
      refresh_required_event: "finance.plugin.refresh_required",
      preserve_iframe_state: true,
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
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "accessKeyFile"), false);
}

function testNormalizeCodexManifest() {
  const manifest = normalizeManifest(sampleCodexManifest(), {
    id: "codex-mobile",
    manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-05-29T00:00:00.000Z",
  });
  assert.equal(manifest.id, "codex-mobile");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:8787/?embed=hermes");
  assert.equal(manifest.programApi.pluginLaunchPath, "/api/v1/hermes/plugin/launch");
  assert.equal(manifest.ownerBinding.strategy, "codex_mobile_access_key");
  assert.equal(manifest.ownerBinding.configFile, ".codex-mobile-web/plugin.json");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "accessKeyFile"), false);
}

function testNormalizeFinanceManifest() {
  const manifest = normalizeManifest(sampleFinanceManifest(), {
    id: "finance",
    manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-05-30T00:00:00.000Z",
  });
  assert.equal(manifest.id, "finance");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:8791/finance.html?embed=hermes");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:8791/");
  assert.equal(manifest.programApi.pluginLaunchPath, "http://127.0.0.1:8791/api/v1/hermes/plugin/launch");
  assert.equal(manifest.mcp.server, "finance");
  assert.equal(manifest.mcp.toolset, "finance");
  assert.deepEqual(manifest.mcp.toolsets, ["finance"]);
  assert.deepEqual(manifest.permissions.plugin, ["finance:read", "finance:write"]);
  assert.equal(manifest.embedding.stateEvent, "finance.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "finance.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "finance.plugin.refresh_required");
  assert.equal(manifest.embedding.preserveIframeState, true);
}

function testNormalizePluginAppearance() {
  assert.deepEqual(normalizePluginAppearance({ theme: "dark", fontSize: "standard" }), {
    theme: "dark",
    fontSize: "default",
  });
  assert.deepEqual(normalizePluginAppearance({
    appearanceTheme: "light",
    appearanceFontSize: "xxlarge",
    access_key: "must-not-copy",
  }), {
    theme: "light",
    fontSize: "xxlarge",
  });
  assert.deepEqual(normalizePluginAppearance({ theme: "neon", fontSize: "huge" }), {});
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
    plugins: [{ id: "wardrobe", manifestUrl: "http://nas/plugin.json", authorizedWorkspaceIds: ["weixin_wuping"] }],
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
  assert.equal(service.list()[0].id, "wardrobe");
  assert.equal(service.list()[0].manifestUrl, "http://nas/plugin.json");
  assert.equal(service.list()[0].allowWorkspaceGrant, true);
  const manifest = await service.manifest({ id: "wardrobe", workspaceId: "owner" });
  assert.equal(manifest.available, true);
  assert.equal(manifest.source.manifestUrl, "http://nas/plugin.json");
  assert.equal(calls[0].url, "http://nas/plugin.json");
  assert.equal(calls[0].options.headers.Accept, "application/json");
}

async function testPluginWorkspaceAuthorizationDefaultsToOwnerOnly() {
  const service = createHermesPluginService({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("unauthorized workspace should not fetch plugin manifest");
    },
  });
  const denied = await service.manifest({ id: "codex-mobile", workspaceId: "weixin_wuping" });
  assert.equal(denied.available, false);
  assert.equal(denied.code, "plugin_workspace_not_authorized");
  assert.deepEqual(service.list({ workspaceId: "weixin_wuping" }), []);
  assert.equal(service.list({ workspaceId: "weixin_wuping", ownerAuthorized: true })[0].id, "codex-mobile");
}

async function testExplicitPluginWorkspaceAuthorizationAllowsNonOwner() {
  const service = createHermesPluginService({
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest", authorizedWorkspaceIds: ["weixin_wuping"] }],
    fetch(url) {
      assert.equal(url, "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleFinanceManifest()),
      });
    },
  });
  const manifest = await service.manifest({ id: "finance", workspaceId: "weixin_wuping" });
  assert.equal(manifest.available, true);
  assert.equal(service.list({ workspaceId: "weixin_wuping" })[0].id, "finance");
}

async function testCodexPluginCannotBeGrantedToNonOwner() {
  const service = createHermesPluginService({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest", authorizedWorkspaceIds: ["weixin_wuping"] }],
    fetch() {
      throw new Error("codex non-owner grant must not fetch manifest");
    },
  });
  assert.equal(configuredPlugins({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest", authorizedWorkspaceIds: ["weixin_wuping"] }],
  })[0].allowWorkspaceGrant, false);
  assert.equal((await service.grantWorkspace({ id: "codex-mobile", workspaceId: "weixin_wuping" })).error, "plugin_workspace_grant_not_allowed");
  const manifest = await service.manifest({ id: "codex-mobile", workspaceId: "weixin_wuping" });
  assert.equal(manifest.available, false);
  assert.deepEqual(service.list({ workspaceId: "weixin_wuping" }), []);
  assert.equal(service.listInstalled().find((item) => item.id === "codex-mobile").allowWorkspaceGrant, false);
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
  assert.equal(service.list()[1].manifestUrl, DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL);
  assert.equal(service.list()[2].manifestUrl, DEFAULT_FINANCE_PLUGIN_MANIFEST_URL);
  assert.equal(service.listInstalled()[0].title, "衣橱");
  assert.equal(service.listInstalled()[1].title, "Codex");
  assert.equal(service.listInstalled()[2].title, "记账");
}

function testInstalledPluginListReflectsWorkspaceKeyBindings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-bindings-"));
  const wardrobeKey = path.join(dir, "drive", "users", "weixin_wuping", "Hermes-吴萍", "衣橱", ".hermes-wardrobe", "access-key.txt");
  const financeKey = path.join(dir, "drive", "users", "child_workspace", "Finance", ".hermes-finance", "access-key.txt");
  fs.mkdirSync(path.dirname(wardrobeKey), { recursive: true });
  fs.mkdirSync(path.dirname(financeKey), { recursive: true });
  fs.writeFileSync(wardrobeKey, "wardrobe-key\n", "utf8");
  fs.writeFileSync(financeKey, "finance-key\n", "utf8");

  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("wardrobe", { dataDir: dir }), ["weixin_wuping"]);
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("finance", { dataDir: dir }), ["child_workspace"]);

  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    fetch() {
      throw new Error("listInstalled should not fetch plugin manifests");
    },
  });
  const installed = service.listInstalled();
  assert.deepEqual(installed.find((item) => item.id === "wardrobe").authorizedWorkspaceIds, ["weixin_wuping"]);
  assert.deepEqual(installed.find((item) => item.id === "finance").authorizedWorkspaceIds, ["child_workspace"]);
  assert.deepEqual(installed.find((item) => item.id === "finance").workspaceAuthorizations, [{
    workspaceId: "child_workspace",
    status: "authorized",
    provisioningStatus: "active",
    provisioningError: "",
    provisioningUpdatedAt: "",
    source: "workspace_key",
  }]);
  assert.deepEqual(installed.find((item) => item.id === "codex-mobile").authorizedWorkspaceIds, []);
}

async function testFinanceGrantProvisionsWorkspaceKeyAndBind() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-grant-"));
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/users/bind")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: { user: { id: "user_test_2" }, ledger: { id: "ledger_test_2" }, created: true } }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleFinanceManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/finance.html?launch=token" }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const grant = await service.grantWorkspace({ id: "finance", workspaceId: "weixin_test_2", displayName: "测试账号", actor: "owner" });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "active");
  assert.equal(grant.provisioning.financeUserId, "user_test_2");
  assert.equal(grant.provisioning.ledgerId, "ledger_test_2");
  const keyPath = path.join(dir, "drive", "users", "weixin_test_2", ".hermes-finance", "access-key.txt");
  assert.equal(fs.existsSync(keyPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.equal(JSON.stringify(grant).includes(rawKey), false);
  assert.deepEqual(calls[0].body, {
    target_workspace_id: "weixin_test_2",
    display_name: "测试账号",
    role: "owner",
    admin_workspace_id: "owner",
  });
  const installed = service.listInstalled().find((item) => item.id === "finance");
  assert.equal(installed.workspaceAuthorizations[0].provisioningStatus, "active");

  const manifest = await service.manifest({ id: "finance", workspaceId: "weixin_test_2", launchPlugin: true });
  assert.equal(manifest.available, true);
  assert.notEqual(manifest.code, "plugin_launch_key_missing");
  assert.equal(calls[2].body.workspace_id, "weixin_test_2");
  assert.equal(calls[2].body.workspace_key, rawKey);
}

async function testFinanceProvisioningFailureBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-grant-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    financeProvisioningService: {
      provisionWorkspace() {
        return Promise.resolve({ ok: false, error: "finance_bind_failed_503" });
      },
    },
    fetch() {
      throw new Error("failed provisioning must block before plugin manifest fetch");
    },
  });
  const grant = await service.grantWorkspace({ id: "finance", workspaceId: "weixin_fail", displayName: "Fail", actor: "owner" });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "provisioning_failed");
  assert.equal(grant.record.provisioningError, "finance_bind_failed_503");
  assert.deepEqual(service.list({ workspaceId: "weixin_fail" }), []);
  const manifest = await service.manifest({ id: "finance", workspaceId: "weixin_fail", launchPlugin: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_failed");
  assert.equal(manifest.embed.tokenStatus, "workspace_provisioning_failed");
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
    appearance: { theme: "dark", fontSize: "large" },
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.entry.url, "https://wardrobe.example.test/?embed=hermes&launch=wpl_once&pluginTheme=dark&pluginFontSize=large");
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  assert.equal(manifest.embed.expiresIn, 90);
  assert.deepEqual(manifest.embed.appearance, { theme: "dark", fontSize: "large" });
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.method, "POST");
  assert.equal(JSON.parse(launchCall.options.body).workspace_id, "owner");
  assert.deepEqual(JSON.parse(launchCall.options.body).appearance, { theme: "dark", fontSize: "large" });
  assert.match(launchCall.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"/);
}

async function testCodexLaunchEntryUsesServerSideKey() {
  const calls = [];
  const service = createHermesPluginService({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }],
    codexMobileAccessKeyPath: __filename,
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleCodexManifest()),
        });
      }
      if (url === "http://127.0.0.1:8787/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "" },
        });
      }
      if (url === "http://127.0.0.1:8787/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/?embed=hermes&codexPluginLaunch=cpl_once&workspaceId=owner",
            expires_in: 300,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "codex-mobile",
    workspaceId: "owner",
    appearanceTheme: "system",
    appearanceFontSize: "standard",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.entry.url, "/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&codexPluginLaunch=cpl_once&workspaceId=owner&pluginTheme=system&pluginFontSize=default");
  assert.equal(manifest.entry.proxiedFromOrigin, "http://127.0.0.1:8787");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(JSON.parse(launchCall.options.body).workspace_id, "owner");
  assert.deepEqual(JSON.parse(launchCall.options.body).appearance, { theme: "system", fontSize: "default" });
  assert.match(launchCall.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|test-key/i);
}

async function testFinanceLaunchEntryUsesWorkspaceKeyBody() {
  const calls = [];
  const service = createHermesPluginService({
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    financeAccessKeyPath: __filename,
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        assert.equal(options.headers["x-hermes-public-origin"], "https://hermes.example.test");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign(sampleFinanceManifest(), {
            entry: "https://hermes.example.test/finance.html?embed=hermes",
            launch: "https://hermes.example.test/api/v1/hermes/plugin/launch",
          })),
        });
      }
      if (url === "http://127.0.0.1:8791/finance.html?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "http://127.0.0.1:8791/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/api/v1/hermes/plugin/launch/finance_once",
            expires_in: 120,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "finance",
    workspaceId: "owner",
    appOrigin: "https://hermes.example.test",
    appearance: { theme: "dark", fontSize: "xlarge" },
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/finance_once?pluginTheme=dark&pluginFontSize=xlarge",
  );
  assert.equal(manifest.embed.sameOriginProxy, true);
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  const body = JSON.parse(launchCall.options.body);
  assert.equal(body.workspace_id, "owner");
  assert.equal(body.role, "owner");
  assert.equal(typeof body.workspace_key, "string");
  assert.deepEqual(body.appearance, { theme: "dark", fontSize: "xlarge" });
  assert.equal(Object.hasOwn(body, "user_key"), false);
  assert.equal(Object.hasOwn(launchCall.options.headers, "Authorization"), false);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"workspace_key"|"user_key"/);
}

async function testFinanceLaunchEntryUsesSeparateWorkspaceUserKeyWhenProvided() {
  const calls = [];
  const service = createHermesPluginService({
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    financeAccessKeyPath: __filename,
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleFinanceManifest()),
        });
      }
      if (url === "http://127.0.0.1:8791/finance.html?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors http://127.0.0.1:8791" },
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/api/v1/hermes/plugin/launch/finance_member_once",
            expires_in: 120,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  await service.manifest({
    id: "finance",
    workspaceId: "weixin_wuping",
    workspaceUserKey: "member-user-key",
    ownerAuthorized: true,
    launchPlugin: true,
  });
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  const body = JSON.parse(launchCall.options.body);
  assert.equal(body.workspace_id, "weixin_wuping");
  assert.equal(body.role, "owner");
  assert.equal(body.user_key, "member-user-key");
  assert.notEqual(body.workspace_key, "member-user-key");
  assert.equal(Object.hasOwn(launchCall.options.headers, "Authorization"), false);
}

async function testHttpsHermesUsesSameOriginProxyForLocalCodexEntryAfterLaunch() {
  const service = createHermesPluginService({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }],
    codexMobileAccessKeyPath: __filename,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleCodexManifest()),
        });
      }
      if (url === "http://127.0.0.1:8787/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "http://127.0.0.1:8787/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/?embed=hermes&codexPluginLaunch=cpl_once&workspaceId=owner",
            expires_in: 300,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "codex-mobile",
    workspaceId: "owner",
    appOrigin: "https://hermes.example.test",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.code, undefined);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&codexPluginLaunch=cpl_once&workspaceId=owner",
  );
  assert.equal(manifest.entry.origin, "https://hermes.example.test");
  assert.equal(manifest.entry.proxiedFromOrigin, "http://127.0.0.1:8787");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.upstreamOrigin, "http://127.0.0.1:8787");
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|test-key/i);
}

async function testHttpsHermesUsesSameOriginProxyForLanWardrobeEntryAfterLaunch() {
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleManifest()),
        });
      }
      if (url === "http://192.168.10.99:8765/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "http://192.168.10.99:8765/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/?embed=hermes&launch=wpl_once&workspaceId=owner",
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
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=owner",
  );
  assert.equal(manifest.entry.origin, "https://hermes.example.test");
  assert.equal(manifest.entry.proxiedFromOrigin, "http://192.168.10.99:8765");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.upstreamOrigin, "http://192.168.10.99:8765");
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|test-key/i);
}

function testPluginSameOriginProxyPathForUrl() {
  assert.equal(
    pluginSameOriginProxyPathForUrl("wardrobe", "http://192.168.10.99:8765/items/1?embed=hermes"),
    "/api/hermes-plugins/wardrobe/proxy/items/1?embed=hermes",
  );
}

function testFindWardrobeAccessKeyPath() {
  assert.equal(findWardrobeAccessKeyPath({ wardrobeAccessKeyPath: __filename }), __filename);
}

function testFindCodexMobileAccessKeyPath() {
  assert.equal(findCodexMobileAccessKeyPath({ codexMobileAccessKeyPath: __filename }), __filename);
}

function testFindFinanceAccessKeyPath() {
  assert.equal(findFinanceAccessKeyPath({ financeAccessKeyPath: __filename }), __filename);
  assert.equal(findFinanceAccessKeyPath({ workspaceId: "owner" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), __filename);
  assert.equal(findFinanceAccessKeyPath({ workspaceId: "weixin_wuping" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
}

async function testReviewFinanceLedgerJoinRequestUsesDedicatedFinanceEndpoint() {
  const calls = [];
  const result = await reviewFinanceLedgerJoinRequest({
    workspaceId: "owner",
    args: {
      request_id: "join-req-1",
      decision: "approve",
      role: "viewer",
      member_ids: ["member-1"],
    },
  }, {
    financeAccessKeyPath: __filename,
    env: { HERMES_MOBILE_FINANCE_PLUGIN_MANIFEST_URL: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" },
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, status: "approved" }),
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8791/api/finance/ledger-join-requests/join-req-1/review");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.workspace_id, "owner");
  assert.equal(body.workspace_key, fs.readFileSync(__filename, "utf8").trim());
  assert.equal(body.decision, "approve");
  assert.equal(body.role, "viewer");
  assert.deepEqual(body.member_ids, ["member-1"]);
  assert.doesNotMatch(JSON.stringify(result), /workspace_key|Authorization|Bearer/i);
}

async function run() {
  testNormalizeManifest();
  testNormalizeCodexManifest();
  testNormalizeFinanceManifest();
  testNormalizePluginAppearance();
  testFrameAncestorsAllowsCurrentOrigin();
  await testFetchesConfiguredWardrobeManifest();
  await testPluginWorkspaceAuthorizationDefaultsToOwnerOnly();
  await testExplicitPluginWorkspaceAuthorizationAllowsNonOwner();
  await testCodexPluginCannotBeGrantedToNonOwner();
  await testFrameAncestorsBlockedReturnsUnavailable();
  await testDefaultNasManifestUrl();
  testInstalledPluginListReflectsWorkspaceKeyBindings();
  await testFinanceGrantProvisionsWorkspaceKeyAndBind();
  await testFinanceProvisioningFailureBlocksManifest();
  await testHttpsManifestOverride();
  await testFetchFailureReturnsUnavailable();
  await testLaunchEntryUsesServerSideWorkspaceKey();
  await testCodexLaunchEntryUsesServerSideKey();
  await testFinanceLaunchEntryUsesWorkspaceKeyBody();
  await testFinanceLaunchEntryUsesSeparateWorkspaceUserKeyWhenProvided();
  await testHttpsHermesUsesSameOriginProxyForLocalCodexEntryAfterLaunch();
  await testHttpsHermesUsesSameOriginProxyForLanWardrobeEntryAfterLaunch();
  testPluginSameOriginProxyPathForUrl();
  testFindWardrobeAccessKeyPath();
  testFindCodexMobileAccessKeyPath();
  testFindFinanceAccessKeyPath();
  await testReviewFinanceLedgerJoinRequestUsesDedicatedFinanceEndpoint();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
