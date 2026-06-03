"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL,
  DEFAULT_EMAIL_PLUGIN_MANIFEST_URL,
  DEFAULT_FINANCE_PLUGIN_MANIFEST_URL,
  DEFAULT_HEALTH_PLUGIN_MANIFEST_URL,
  DEFAULT_NOTE_PLUGIN_MANIFEST_URL,
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  configuredPlugins,
  createHermesPluginService,
  discoverPluginWorkspaceIdsFromAccessKeys,
  findCodexMobileAccessKeyPath,
  findEmailAccessKeyPath,
  findFinanceAccessKeyPath,
  findHealthAccessKeyPath,
  findNoteAccessKeyPath,
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

function writeCompleteWardrobeSkillBundle(dataDir) {
  const templateDir = path.join(dataDir, "skill-profiles", "owner-full", "skills", "productivity", "wardrobe-style-operations");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "SKILL.md"), [
    "---",
    "name: wardrobe-style-operations",
    "description: Complete keyless Wardrobe MCP operation bundle.",
    "---",
    "",
    "# Wardrobe Style Operations",
    "",
    "Use wardrobe MCP. Credentials live only in .hermes-wardrobe.",
    "Consult references/wardrobe-program-api.md before using Program API contracts.",
    Array.from({ length: 80 }, (_, index) => `Rule ${index + 1}: keep Wardrobe operations scoped to the active Hermes workspace.`).join("\n"),
  ].join("\n"), "utf8");
  const referencesDir = path.join(templateDir, "references");
  fs.mkdirSync(referencesDir, { recursive: true });
  fs.writeFileSync(path.join(referencesDir, "wardrobe-program-api.md"), "# Wardrobe Program API\n", "utf8");
  fs.writeFileSync(path.join(referencesDir, "wardrobe-judgment-pitfalls.md"), "# Wardrobe Judgment Pitfalls\n", "utf8");
  const scriptsDir = path.join(templateDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, "render_wardrobe_phone_pdf.py"), "def main():\n    return 0\n", "utf8");
  return templateDir;
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

function sampleEmailManifest() {
  return {
    id: "email",
    title: "邮箱",
    kind: "embedded_app",
    entry: {
      type: "web",
      url: "http://127.0.0.1:5175/?embed=hermes",
    },
    navigation: {
      state_event: "email.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "email.plugin.back_result",
      refresh_required_event: "email.plugin.refresh_required",
      preserve_iframe_state: true,
    },
    mcp: {
      server: "email-mcp",
      toolset: "email",
      required_tools: ["email.search_messages", "email.get_message"],
    },
    program_api: {
      base_url: "http://127.0.0.1:5175",
      workspace_registration: "/api/v1/hermes/plugin/workspaces",
      plugin_launch: "/api/v1/hermes/plugin/launch",
    },
    owner_binding: {
      strategy: "workspace_generated_access_key",
      config_file: ".hermes-email/config.json",
      access_key_file: ".hermes-email/access-key.txt",
      raw_key_returned_by_email: false,
    },
    permissions: {
      register_workspace_requires: ["owners:write"],
    },
  };
}

function sampleHealthManifest() {
  return {
    id: "health",
    title: "健康",
    kind: "embedded_app",
    entry: {
      type: "web",
      url: "http://127.0.0.1:4877/health.html?embed=hermes",
    },
    launch: {
      supported: true,
      endpoint: "/api/v1/hermes/plugin/launch",
      method: "POST",
      token_ttl_seconds: 300,
    },
    provisioning: {
      supported: true,
      mode: "workspace_binding",
      endpoint: "/api/v1/hermes/plugin/workspaces",
    },
    navigation: {
      state_event: "health.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "health.plugin.back_result",
      refresh_required_event: "health.plugin.refresh_required",
      preserve_iframe_state: true,
    },
    mcp: {
      server: "health-mcp",
      toolset: "health",
      required_tools: ["mcp_health_records_get_summary"],
    },
    toolsets: ["health"],
    owner_binding: {
      strategy: "workspace_generated_access_key_hash",
      config_file: ".hermes-health/config.json",
      access_key_file: ".hermes-health/access-key.txt",
      raw_key_returned_by_health: false,
    },
    permissions: {
      plugin: ["health:read", "health:write", "health:report"],
    },
  };
}

function sampleNoteManifest() {
  return {
    id: "note",
    title: "笔记",
    kind: "embedded_app",
    entry: {
      type: "web",
      url: "http://127.0.0.1:4181/note.html?embed=hermes",
    },
    launch: {
      supported: true,
      endpoint: "/api/v1/hermes/plugin/launch",
      method: "POST",
      token_ttl_seconds: 300,
    },
    provisioning: {
      supported: true,
      mode: "workspace_binding",
      endpoint: "/api/v1/hermes/plugin/workspaces",
    },
    navigation: {
      state_event: "note.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "note.plugin.back_result",
      refresh_required_event: "note.plugin.refresh_required",
      preserve_iframe_state: true,
    },
    mcp: {
      server: "note",
      toolset: "note",
      required_tools: ["mcp_note_notes_search", "mcp_note_notes_create"],
    },
    toolsets: ["note"],
    owner_binding: {
      strategy: "workspace_generated_access_key_hash",
      config_file: ".hermes-note/config.json",
      access_key_file: ".hermes-note/access-key.txt",
      raw_key_returned_by_note: false,
    },
    permissions: {
      plugin: ["notes:read", "notes:write", "notes:search"],
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

function testNormalizeEmailManifest() {
  const manifest = normalizeManifest(sampleEmailManifest(), {
    id: "email",
    manifestUrl: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(manifest.id, "email");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:5175/?embed=hermes");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:5175/");
  assert.equal(manifest.programApi.pluginLaunchPath, "/api/v1/hermes/plugin/launch");
  assert.equal(manifest.programApi.workspaceRegistrationPath, "/api/v1/hermes/plugin/workspaces");
  assert.equal(manifest.mcp.server, "email-mcp");
  assert.equal(manifest.mcp.toolset, "email");
  assert.deepEqual(manifest.mcp.requiredTools, ["email.search_messages", "email.get_message"]);
  assert.equal(manifest.embedding.stateEvent, "email.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "email.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "email.plugin.refresh_required");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-email/config.json");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
}

function testNormalizeHealthManifest() {
  const manifest = normalizeManifest(sampleHealthManifest(), {
    id: "health",
    manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-06-02T00:00:00.000Z",
  });
  assert.equal(manifest.id, "health");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:4877/health.html?embed=hermes");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:4877/");
  assert.equal(manifest.programApi.pluginLaunchPath, "http://127.0.0.1:4877/api/v1/hermes/plugin/launch");
  assert.equal(manifest.programApi.workspaceRegistrationPath, "/api/v1/hermes/plugin/workspaces");
  assert.equal(manifest.mcp.server, "health-mcp");
  assert.equal(manifest.mcp.toolset, "health");
  assert.deepEqual(manifest.mcp.toolsets, ["health"]);
  assert.deepEqual(manifest.mcp.requiredTools, ["mcp_health_records_get_summary"]);
  assert.equal(manifest.embedding.stateEvent, "health.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "health.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "health.plugin.refresh_required");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-health/config.json");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
}

function testNormalizeNoteManifest() {
  const manifest = normalizeManifest(sampleNoteManifest(), {
    id: "note",
    manifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-06-03T00:00:00.000Z",
  });
  assert.equal(manifest.id, "note");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:4181/note.html?embed=hermes");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:4181/");
  assert.equal(manifest.programApi.pluginLaunchPath, "http://127.0.0.1:4181/api/v1/hermes/plugin/launch");
  assert.equal(manifest.programApi.workspaceRegistrationPath, "/api/v1/hermes/plugin/workspaces");
  assert.equal(manifest.mcp.server, "note");
  assert.equal(manifest.mcp.toolset, "note");
  assert.deepEqual(manifest.mcp.toolsets, ["note"]);
  assert.deepEqual(manifest.mcp.requiredTools, ["mcp_note_notes_search", "mcp_note_notes_create"]);
  assert.equal(manifest.embedding.stateEvent, "note.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "note.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "note.plugin.refresh_required");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-note/config.json");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
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
  assert.deepEqual(service.list({ workspaceId: "weixin_wuping", ownerAuthorized: true }), []);
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
  assert.equal(service.list()[3].manifestUrl, DEFAULT_EMAIL_PLUGIN_MANIFEST_URL);
  assert.equal(service.listInstalled()[0].title, "衣橱");
  assert.equal(service.listInstalled()[1].title, "Codex");
  assert.equal(service.listInstalled()[2].title, "记账");
  assert.equal(service.listInstalled()[3].title, "邮箱");
  assert.equal(service.listInstalled()[4].manifestUrl, DEFAULT_HEALTH_PLUGIN_MANIFEST_URL);
}

function testInstalledPluginListReflectsWorkspaceKeyBindings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-bindings-"));
  const ownerWardrobeKey = path.join(dir, "drive", "users", "owner", ".hermes-wardrobe", "access-key.txt");
  const ownerFinanceKey = path.join(dir, "drive", "users", "owner", ".hermes-finance", "access-key.txt");
  const ownerFinanceConfig = path.join(dir, "drive", "users", "owner", ".hermes-finance", "config.json");
  const ownerEmailKey = path.join(dir, "drive", "users", "owner", ".hermes-email", "access-key.txt");
  const ownerHealthKey = path.join(dir, "drive", "users", "owner", ".hermes-health", "access-key.txt");
  const ownerHealthConfig = path.join(dir, "drive", "users", "owner", ".hermes-health", "config.json");
  const wardrobeKey = path.join(dir, "drive", "users", "weixin_wuping", "Hermes-吴萍", "衣橱", ".hermes-wardrobe", "access-key.txt");
  const financeKey = path.join(dir, "drive", "users", "child_workspace", ".hermes-finance", "access-key.txt");
  const financeConfig = path.join(dir, "drive", "users", "child_workspace", ".hermes-finance", "config.json");
  const emailKey = path.join(dir, "drive", "users", "mail_workspace", "Email", ".hermes-email", "access-key.txt");
  const healthKey = path.join(dir, "drive", "users", "health_workspace", ".hermes-health", "access-key.txt");
  const healthConfig = path.join(dir, "drive", "users", "health_workspace", ".hermes-health", "config.json");
  fs.mkdirSync(path.dirname(ownerWardrobeKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerFinanceKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerEmailKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerHealthKey), { recursive: true });
  fs.mkdirSync(path.dirname(wardrobeKey), { recursive: true });
  fs.mkdirSync(path.dirname(financeKey), { recursive: true });
  fs.mkdirSync(path.dirname(emailKey), { recursive: true });
  fs.mkdirSync(path.dirname(healthKey), { recursive: true });
  fs.writeFileSync(ownerWardrobeKey, "owner-wardrobe-key\n", "utf8");
  fs.writeFileSync(ownerFinanceKey, "owner-finance-key\n", "utf8");
  fs.writeFileSync(ownerFinanceConfig, JSON.stringify({
    workspace_id: "owner",
    hermes_workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(ownerEmailKey, "owner-email-key\n", "utf8");
  fs.writeFileSync(ownerHealthKey, "owner-health-key\n", "utf8");
  fs.writeFileSync(ownerHealthConfig, JSON.stringify({
    workspace_id: "health:owner",
    hermes_workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(wardrobeKey, "wardrobe-key\n", "utf8");
  fs.writeFileSync(financeKey, "finance-key\n", "utf8");
  fs.mkdirSync(path.dirname(financeConfig), { recursive: true });
  fs.writeFileSync(financeConfig, JSON.stringify({
    workspace_id: "child_workspace",
    hermes_workspace_id: "child_workspace",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(emailKey, "email-key\n", "utf8");
  fs.writeFileSync(healthKey, "health-key\n", "utf8");
  fs.writeFileSync(healthConfig, JSON.stringify({
    workspace_id: "health:health_workspace",
    hermes_workspace_id: "health_workspace",
    access_key_file: "access-key.txt",
  }), "utf8");

  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("wardrobe", { dataDir: dir }).sort(), ["owner", "weixin_wuping"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("finance", { dataDir: dir }).sort(), ["owner", "child_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("email", { dataDir: dir }).sort(), ["owner", "mail_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("health", { dataDir: dir }).sort(), ["owner", "health_workspace"].sort());

  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    fetch() {
      throw new Error("listInstalled should not fetch plugin manifests");
    },
  });
  const installed = service.listInstalled();
  assert.deepEqual(installed.find((item) => item.id === "wardrobe").authorizedWorkspaceIds.sort(), ["owner", "weixin_wuping"].sort());
  assert.deepEqual(installed.find((item) => item.id === "finance").authorizedWorkspaceIds.sort(), ["owner", "child_workspace"].sort());
  assert.deepEqual(installed.find((item) => item.id === "email").authorizedWorkspaceIds.sort(), ["owner", "mail_workspace"].sort());
  assert.deepEqual(installed.find((item) => item.id === "health").authorizedWorkspaceIds.sort(), ["owner", "health_workspace"].sort());
  assert.deepEqual(installed.find((item) => item.id === "finance").workspaceAuthorizations.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)), [{
    workspaceId: "child_workspace",
    status: "authorized",
    provisioningStatus: "active",
    provisioningError: "",
    provisioningUpdatedAt: "",
    source: "workspace_key",
  }, {
    workspaceId: "owner",
    status: "authorized",
    provisioningStatus: "active",
    provisioningError: "",
    provisioningUpdatedAt: "",
    source: "workspace_key",
  }].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)));
  assert.deepEqual(installed.find((item) => item.id === "health").workspaceAuthorizations.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)), [{
    workspaceId: "health_workspace",
    status: "authorized",
    provisioningStatus: "active",
    provisioningError: "",
    provisioningUpdatedAt: "",
    source: "workspace_key",
  }, {
    workspaceId: "owner",
    status: "authorized",
    provisioningStatus: "active",
    provisioningError: "",
    provisioningUpdatedAt: "",
    source: "workspace_key",
  }].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)));
  assert.deepEqual(installed.find((item) => item.id === "codex-mobile").authorizedWorkspaceIds, []);
}

async function testHealthFreshInstallIsInstalledButNotWorkspaceActive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-fresh-install-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("fresh Health install must not fetch manifest before workspace grant");
    },
  });
  assert.equal(service.listInstalled().find((item) => item.id === "health").id, "health");
  assert.deepEqual(service.list({ workspaceId: "owner" }), []);
  const manifest = await service.manifest({ id: "health", workspaceId: "owner" });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_not_authorized");
  assert.equal(manifest.embed.tokenStatus, "workspace_not_authorized");
}

function testHealthWorkspaceKeyWithoutConfigIsNotActive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-key-only-"));
  const healthKey = path.join(dir, "drive", "users", "health_workspace", ".hermes-health", "access-key.txt");
  fs.mkdirSync(path.dirname(healthKey), { recursive: true });
  fs.writeFileSync(healthKey, "health-key\n", "utf8");
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("health", { dataDir: dir }), []);
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("key-only Health workspace must not fetch manifest");
    },
  });
  assert.deepEqual(service.list({ workspaceId: "health_workspace" }), []);
}

function testFinanceWorkspaceKeyWithoutConfigIsNotActive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-key-only-"));
  const financeKey = path.join(dir, "drive", "users", "finance_workspace", ".hermes-finance", "access-key.txt");
  fs.mkdirSync(path.dirname(financeKey), { recursive: true });
  fs.writeFileSync(financeKey, "finance-key\n", "utf8");
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("finance", { dataDir: dir }), []);
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("key-only Finance workspace must not fetch manifest");
    },
  });
  const installed = service.listInstalled().find((item) => item.id === "finance");
  assert.deepEqual(installed.authorizedWorkspaceIds, []);
  assert.deepEqual(installed.workspaceAuthorizations, []);
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

async function testFinanceOwnerManifestProvisionsWorkspaceLocalMcpConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-owner-"));
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
          json: () => Promise.resolve({ result: { user: { id: "user_owner" }, ledger: { id: "ledger_owner" }, created: true } }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleFinanceManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/finance.html?launch=owner-token" }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({ id: "finance", workspaceId: "owner", launchPlugin: true });
  assert.equal(manifest.available, true);
  const keyPath = path.join(dir, "drive", "users", "owner", ".hermes-finance", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "owner", ".hermes-finance", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.workspace_id, "owner");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
  assert.deepEqual(calls[0].body, {
    target_workspace_id: "owner",
    display_name: "Owner",
    role: "owner",
    admin_workspace_id: "owner",
  });
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.body.workspace_id, "owner");
  assert.equal(launchCall.body.workspace_key, rawKey);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hfin_/);
}

async function testFinanceOwnerProvisioningFailureBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-owner-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    financeProvisioningService: {
      provisionWorkspace(input) {
        assert.equal(input.workspaceId, "owner");
        return Promise.resolve({ ok: false, status: 503, error: "finance_bind_failed_503" });
      },
    },
    fetch() {
      throw new Error("failed owner provisioning must block before plugin manifest fetch");
    },
  });
  const manifest = await service.manifest({ id: "finance", workspaceId: "owner", launchPlugin: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_owner_provisioning_failed");
  assert.equal(manifest.embed.tokenStatus, "owner_workspace_provisioning_failed");
}

async function testHealthGrantProvisionsWorkspaceKeyHashConfigAndLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-grant-"));
  const ownerKeyPath = path.join(dir, "health-owner-key.txt");
  fs.writeFileSync(ownerKeyPath, "health-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    healthOwnerKeyPath: ownerKeyPath,
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        assert.equal(options.headers.Authorization, "Bearer health-owner-test-key");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            ok: true,
            workspace_id: "health:weixin_health",
            hermes_workspace_id: "weixin_health",
          }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleHealthManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/health.html?embed=hermes&launch=health_once", expires_in_seconds: 300 }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const granted = await service.grantWorkspace({ id: "health", workspaceId: "weixin_health", displayName: "Health User" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "active");
  assert.equal(granted.provisioning.healthWorkspaceId, "health:weixin_health");
  assert.equal(service.list({ workspaceId: "weixin_health" }).find((item) => item.id === "health").id, "health");

  const keyPath = path.join(dir, "drive", "users", "weixin_health", ".hermes-health", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "weixin_health", ".hermes-health", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hhlt_/);
  const registrationCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/workspaces"));
  assert.ok(registrationCall);
  assert.equal(registrationCall.body.workspace_id, "weixin_health");
  assert.equal(registrationCall.body.target_workspace_id, "weixin_health");
  assert.equal(registrationCall.body.hermes_workspace_id, "weixin_health");
  assert.match(registrationCall.body.access_key_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(registrationCall.body).includes(rawKey), false);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.base_url, "http://127.0.0.1:4877");
  assert.equal(config.workspace_id, "health:weixin_health");
  assert.equal(config.hermes_workspace_id, "weixin_health");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(JSON.stringify(config).includes(rawKey), false);

  const manifest = await service.manifest({
    id: "health",
    workspaceId: "weixin_health",
    ownerAuthorized: true,
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/health/proxy/health.html?embed=hermes&launch=health_once&workspaceId=weixin_health",
  );
  assert.equal(manifest.embed.expiresIn, 300);
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.deepEqual(launchCall.body, {
    workspace_id: "weixin_health",
    target_workspace_id: "weixin_health",
    hermes_workspace_id: "weixin_health",
  });
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hhlt_/);
}

async function testNoteGrantProvisionsWorkspaceKeyHashConfigAndLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-note-grant-"));
  const ownerKeyPath = path.join(dir, "note-owner-key.txt");
  fs.writeFileSync(ownerKeyPath, "note-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    noteOwnerKeyPath: ownerKeyPath,
    plugins: [{ id: "note", manifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        assert.equal(options.headers.Authorization, "Bearer note-owner-test-key");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            ok: true,
            workspace_id: "note:weixin_note",
            hermes_workspace_id: "weixin_note",
          }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleNoteManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/note.html?embed=hermes&launch=note_once", expires_in: 300 }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const granted = await service.grantWorkspace({ id: "note", workspaceId: "weixin_note", displayName: "Note User" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "active");
  assert.equal(granted.provisioning.noteWorkspaceId, "note:weixin_note");
  assert.equal(service.list({ workspaceId: "weixin_note" }).find((item) => item.id === "note").id, "note");

  const keyPath = path.join(dir, "drive", "users", "weixin_note", ".hermes-note", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "weixin_note", ".hermes-note", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hnt_/);
  const registrationCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/workspaces"));
  assert.ok(registrationCall);
  assert.equal(registrationCall.body.workspace_id, "note:weixin_note");
  assert.equal(registrationCall.body.target_workspace_id, "weixin_note");
  assert.equal(registrationCall.body.hermes_workspace_id, "weixin_note");
  assert.match(registrationCall.body.access_key_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(registrationCall.body).includes(rawKey), false);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.api_base_url, "http://127.0.0.1:4181");
  assert.equal(config.workspace_id, "note:weixin_note");
  assert.equal(config.hermes_workspace_id, "weixin_note");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(JSON.stringify(config).includes(rawKey), false);

  const manifest = await service.manifest({
    id: "note",
    workspaceId: "weixin_note",
    ownerAuthorized: true,
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/note/proxy/note.html?embed=hermes&launch=note_once&workspaceId=weixin_note",
  );
  assert.equal(manifest.embed.expiresIn, 300);
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.deepEqual(launchCall.body, {
    workspace_id: "note:weixin_note",
    target_workspace_id: "weixin_note",
  });
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hnt_/);
}

async function testHealthOwnerGrantProvisionsWorkspaceBeforeManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-owner-grant-"));
  const ownerKeyPath = path.join(dir, "health-owner-key.txt");
  fs.writeFileSync(ownerKeyPath, "health-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    healthOwnerKeyPath: ownerKeyPath,
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        assert.equal(options.headers.Authorization, "Bearer health-owner-test-key");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            ok: true,
            workspace_id: "health:owner",
            hermes_workspace_id: "owner",
          }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleHealthManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/health.html?embed=hermes&launch=health_owner", expires_in: 300 }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const granted = await service.grantWorkspace({ id: "health", workspaceId: "owner", displayName: "Owner" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "active");
  assert.equal(granted.provisioning.healthWorkspaceId, "health:owner");
  assert.equal(service.list({ workspaceId: "owner" }).find((item) => item.id === "health").id, "health");
  const installed = service.listInstalled().find((item) => item.id === "health");
  assert.ok(installed.authorizedWorkspaceIds.includes("owner"));
  const ownerAuthorization = installed.workspaceAuthorizations.find((item) => item.workspaceId === "owner");
  assert.equal(ownerAuthorization.provisioningStatus, "active");
  assert.equal(ownerAuthorization.provisioningError, "");
  assert.equal(ownerAuthorization.source, "authorization_store");
  const keyPath = path.join(dir, "drive", "users", "owner", ".hermes-health", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "owner", ".hermes-health", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.equal(calls[0].body.workspace_id, "owner");
  assert.equal(calls[0].body.target_workspace_id, "owner");
  assert.equal(calls[0].body.hermes_workspace_id, "owner");
  assert.equal(JSON.stringify(calls[0].body).includes(rawKey), false);
  const ownerConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(ownerConfig.workspace_id, "health:owner");
  assert.equal(ownerConfig.hermes_workspace_id, "owner");
  assert.equal(ownerConfig.base_url, "http://127.0.0.1:4877");

  const manifest = await service.manifest({ id: "health", workspaceId: "owner", launchPlugin: true });
  assert.equal(manifest.available, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.deepEqual(launchCall.body, {
    workspace_id: "owner",
    target_workspace_id: "owner",
    hermes_workspace_id: "owner",
  });
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hhlt_/);
}

async function testHealthOwnerGrantMissingRegistrationKeyDoesNotBecomeActive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-owner-missing-key-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("missing Health registration key must fail before any plugin fetch");
    },
  });
  const granted = await service.grantWorkspace({ id: "health", workspaceId: "owner", displayName: "Owner" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "provisioning_failed");
  assert.equal(granted.record.provisioningError, "health_owner_key_missing");
  assert.deepEqual(service.list({ workspaceId: "owner" }), []);
  const installed = service.listInstalled().find((item) => item.id === "health");
  assert.ok(installed.authorizedWorkspaceIds.includes("owner"));
  const ownerAuthorization = installed.workspaceAuthorizations.find((item) => item.workspaceId === "owner");
  assert.equal(ownerAuthorization.provisioningStatus, "provisioning_failed");
  assert.equal(ownerAuthorization.provisioningError, "health_owner_key_missing");
  assert.equal(ownerAuthorization.source, "authorization_store");
  assert.equal(fs.existsSync(path.join(dir, "drive", "users", "owner", ".hermes-health", "access-key.txt")), false);
  const manifest = await service.manifest({ id: "health", workspaceId: "owner" });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_not_authorized");
}

async function testEmailGrantProvisionsWorkspaceRegistrationAndLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-email-grant-"));
  const ownerKeyPath = path.join(dir, "email-owner-key.txt");
  fs.writeFileSync(ownerKeyPath, "email-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    emailOwnerKeyPath: ownerKeyPath,
    plugins: [{ id: "email", manifestUrl: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        const body = JSON.parse(options.body);
        assert.equal(options.headers.Authorization, "Bearer email-owner-test-key");
        const configDir = path.join(body.workspace_root, ".hermes-email");
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
          workspace_id: body.workspace_id,
          plugin_id: "email",
          status: "active",
        }), "utf8");
        fs.writeFileSync(path.join(configDir, "access-key.txt"), "email-ws-test-key\n", "utf8");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, workspace_id: body.workspace_id, status: "active", created: true }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleEmailManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_path: "/?embed=hermes&launch=email-once", expires_in: 300 }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const grant = await service.grantWorkspace({ id: "email", workspaceId: "weixin_email", displayName: "Email User", actor: "owner" });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "active");
  assert.equal(grant.provisioning.keyCreated, true);
  assert.equal(grant.provisioning.configCreated, true);
  const keyPath = path.join(dir, "drive", "users", "weixin_email", ".hermes-email", "access-key.txt");
  assert.equal(fs.existsSync(keyPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.equal(JSON.stringify(grant).includes(rawKey), false);
  assert.deepEqual(calls[0].body, {
    workspace_id: "weixin_email",
    workspace_name: "Email User",
    display_name: "Email User",
    workspace_root: path.join(dir, "drive", "users", "weixin_email"),
  });

  const manifest = await service.manifest({ id: "email", workspaceId: "weixin_email", launchPlugin: true });
  assert.equal(manifest.available, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.deepEqual(launchCall.body, { workspace_id: "weixin_email" });
  assert.doesNotMatch(JSON.stringify(manifest), /email-ws-test-key|Authorization|Bearer|"launch_token"/);
}

async function testEmailProvisioningFailureBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-email-grant-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "email", manifestUrl: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest" }],
    emailProvisioningService: {
      provisionWorkspace() {
        return Promise.resolve({ ok: false, error: "email_workspace_registration_failed_503" });
      },
    },
    fetch() {
      throw new Error("failed email provisioning must block before plugin manifest fetch");
    },
  });
  const grant = await service.grantWorkspace({ id: "email", workspaceId: "weixin_email_fail", displayName: "Fail", actor: "owner" });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "provisioning_failed");
  assert.equal(grant.record.provisioningError, "email_workspace_registration_failed_503");
  assert.deepEqual(service.list({ workspaceId: "weixin_email_fail" }), []);
  const manifest = await service.manifest({ id: "email", workspaceId: "weixin_email_fail", launchPlugin: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_failed");
  assert.equal(manifest.embed.tokenStatus, "workspace_provisioning_failed");
}

async function testHealthProvisioningFailureBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-health-grant-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "health", manifestUrl: "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest" }],
    healthProvisioningService: {
      provisionWorkspace() {
        return Promise.resolve({ ok: false, error: "health_workspace_registration_failed_503" });
      },
    },
    fetch() {
      throw new Error("failed health provisioning must block before plugin manifest fetch");
    },
  });
  const granted = await service.grantWorkspace({ id: "health", workspaceId: "weixin_health" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "provisioning_failed");
  const manifest = await service.manifest({ id: "health", workspaceId: "weixin_health", ownerAuthorized: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_failed");
  assert.equal(manifest.embed.tokenStatus, "workspace_provisioning_failed");
}

async function testWardrobeGrantProvisionsWorkspaceKeySkillGatewayAndLaunchBinding() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-grant-"));
  writeCompleteWardrobeSkillBundle(dir);
  const registrationKey = `wd_${"live"}_${"g".repeat(40)}`;
  const calls = [];
  const gatewayCalls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    wardrobeRegistrationAccessKey: registrationKey,
    plugins: [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }],
    gatewayWorkspaceProvisioningService: {
      ensureWorkspaceGateway(input) {
        gatewayCalls.push(input);
        const skillStorePath = path.join(dir, "skill-profiles", input.workspaceId, "skills");
        fs.mkdirSync(skillStorePath, { recursive: true });
        return {
          ok: true,
          profiles: ["lowgw31", "lowgw32", "deepseekgw31"],
          restartRequired: true,
          profileBindingRefreshed: true,
          skillStorePath,
        };
      },
    },
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: { workspace_id: "wardrobe:weixin_wardrobe_new", owner: "weixin_wardrobe_new", created: true } }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ entry_path: "/?embed=hermes&launch=wpl_new", expires_in: 90 }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const grant = await service.grantWorkspace({
    id: "wardrobe",
    workspaceId: "weixin_wardrobe_new",
    displayName: "Wardrobe New",
    actor: "owner",
  });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "active");
  assert.equal(grant.provisioning.wardrobeWorkspaceId, "wardrobe:weixin_wardrobe_new");
  assert.deepEqual(grant.provisioning.gatewayProfiles, ["lowgw31", "lowgw32", "deepseekgw31"]);
  assert.equal(grant.provisioning.gatewayRestartRequired, true);
  assert.deepEqual(gatewayCalls, [{ workspaceId: "weixin_wardrobe_new", refreshProfileBinding: true }]);
  const keyPath = path.join(dir, "drive", "users", "weixin_wardrobe_new", ".hermes-wardrobe", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "weixin_wardrobe_new", ".hermes-wardrobe", "config.json");
  const skillDir = path.join(dir, "skill-profiles", "weixin_wardrobe_new", "skills", "productivity", "wardrobe-style-operations");
  const skillPath = path.join(skillDir, "SKILL.md");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(skillPath), true);
  assert.equal(fs.existsSync(path.join(skillDir, "references", "wardrobe-program-api.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "references", "wardrobe-judgment-pitfalls.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, "scripts", "render_wardrobe_phone_pdf.py")), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.equal(JSON.stringify(grant).includes(rawKey), false);
  assert.equal(JSON.stringify(grant).includes(registrationKey), false);
  assert.equal(calls[0].body.workspace_id, "wardrobe:weixin_wardrobe_new");
  assert.equal(calls[0].body.access_key, rawKey);
  assert.equal(calls[0].body.access_key_sha256.length, 64);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${registrationKey}`);
  assert.equal(service.list({ workspaceId: "weixin_wardrobe_new" })[0].id, "wardrobe");
  const installed = service.listInstalled().find((item) => item.id === "wardrobe");
  assert.equal(installed.workspaceAuthorizations[0].provisioningStatus, "active");

  const manifest = await service.manifest({ id: "wardrobe", workspaceId: "weixin_wardrobe_new", launchPlugin: true });
  assert.equal(manifest.available, true);
  assert.notEqual(manifest.code, "plugin_launch_key_missing");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.body.workspace_id, "wardrobe:weixin_wardrobe_new");
  assert.equal(launchCall.body.hermes_workspace_id, "weixin_wardrobe_new");
  assert.match(launchCall.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hwd_/);
}

async function testWardrobeProvisioningFailureBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-grant-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeProvisioningService: {
      provisionWorkspace() {
        return Promise.resolve({ ok: false, error: "wardrobe_registration_failed_503" });
      },
    },
    fetch() {
      throw new Error("failed Wardrobe provisioning must block before plugin manifest fetch");
    },
  });
  const grant = await service.grantWorkspace({ id: "wardrobe", workspaceId: "weixin_fail", displayName: "Fail", actor: "owner" });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "provisioning_failed");
  assert.equal(grant.record.provisioningError, "wardrobe_registration_failed_503");
  assert.deepEqual(service.list({ workspaceId: "weixin_fail" }), []);
  const manifest = await service.manifest({ id: "wardrobe", workspaceId: "weixin_fail", launchPlugin: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_failed");
  assert.equal(manifest.embed.tokenStatus, "workspace_provisioning_failed");
}

async function testLegacyWardrobePendingProvisioningBlocksManifest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-pending-"));
  const authPath = path.join(dir, "plugin-workspace-authorizations.json");
  fs.writeFileSync(authPath, JSON.stringify({
    version: 1,
    plugins: {
      wardrobe: {
        records: {
          weixin_legacy: {
            workspaceId: "weixin_legacy",
            status: "authorized",
            provisioningStatus: "pending",
          },
        },
      },
    },
  }, null, 2), "utf8");
  const service = createHermesPluginService({
    dataDir: dir,
    pluginAuthorizationStorePath: authPath,
    plugins: [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url) {
      throw new Error(`pending Wardrobe provisioning must block before manifest fetch: ${url}`);
    },
  });
  const installed = service.listInstalled().find((item) => item.id === "wardrobe");
  assert.equal(installed.workspaceAuthorizations[0].provisioningStatus, "pending");
  assert.deepEqual(service.list({ workspaceId: "weixin_legacy" }), []);
  const manifest = await service.manifest({ id: "wardrobe", workspaceId: "weixin_legacy" });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_pending");
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
      if (String(url).startsWith("https://wardrobe.example.test/?embed=hermes")) {
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
    "/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/finance_once?pluginTheme=dark&pluginFontSize=xlarge&workspaceId=owner",
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
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest", authorizedWorkspaceIds: ["weixin_wuping"] }],
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
  const manifest = await service.manifest({
    id: "finance",
    workspaceId: "weixin_wuping",
    workspaceUserKey: "member-user-key",
    ownerAuthorized: true,
    launchPlugin: true,
  });
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/finance_member_once?workspaceId=weixin_wuping",
  );
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

async function testSameOriginProxySkipsUpstreamFrameAncestorsBlock() {
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign(sampleManifest(), {
            entry: { type: "web", url: "http://127.0.0.1:8765/?embed=hermes" },
            program_api: Object.assign(sampleManifest().program_api, {
              base_url: "http://127.0.0.1:8765",
              plugin_launch: "/api/v1/hermes/plugin/launch",
            }),
          })),
        });
      }
      if (url === "http://127.0.0.1:8765/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/?embed=hermes&launch=wpl_once",
            expires_in: 90,
          }),
        });
      }
      if (url === "http://127.0.0.1:8765/?embed=hermes") {
        throw new Error("same-origin proxy entries must not be frame-probed against upstream CSP");
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "wardrobe",
    workspaceId: "owner",
    appOrigin: "http://127.0.0.1:8797",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.code, undefined);
  assert.equal(manifest.entry.url, "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=owner");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
}

async function testHttpsHermesProxyEntryIncludesEffectiveWorkspaceForWardrobeLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-wardrobe-proxy-workspace-"));
  const configPath = path.join(dir, "drive", "users", "weixin_test_1", ".hermes-wardrobe", "config.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    workspace_id: "wardrobe:weixin_test_1",
    hermes_workspace_id: "weixin_test_1",
  }), "utf8");
  const launchBodies = [];
  const service = createHermesPluginService({
    dataDir: dir,
    plugins: [{ id: "wardrobe", manifestUrl: "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url, options = {}) {
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
        launchBodies.push(JSON.parse(options.body));
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
    workspaceId: "weixin_test_1",
    appOrigin: "https://hermes.example.test",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/wardrobe/proxy/?embed=hermes&launch=wpl_once&workspaceId=weixin_test_1",
  );
  assert.deepEqual(launchBodies, [{
    workspace_id: "wardrobe:weixin_test_1",
    hermes_workspace_id: "weixin_test_1",
  }]);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|test-key/i);
}

function testPluginSameOriginProxyPathForUrl() {
  assert.equal(
    pluginSameOriginProxyPathForUrl("wardrobe", "http://192.168.10.99:8765/items/1?embed=hermes"),
    "/api/hermes-plugins/wardrobe/proxy/items/1?embed=hermes",
  );
  assert.equal(
    pluginSameOriginProxyPathForUrl("wardrobe", "http://192.168.10.99:8765/items/1?embed=hermes", { workspaceId: "weixin_test_1" }),
    "/api/hermes-plugins/wardrobe/proxy/items/1?embed=hermes&workspaceId=weixin_test_1",
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

function testFindEmailAccessKeyPath() {
  assert.equal(findEmailAccessKeyPath({ emailAccessKeyPath: __filename }), __filename);
}

function testFindHealthAccessKeyPath() {
  assert.equal(findHealthAccessKeyPath({ healthAccessKeyPath: __filename }), __filename);
  assert.equal(findHealthAccessKeyPath({ workspaceId: "owner" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
}

function testFindNoteAccessKeyPath() {
  assert.equal(findNoteAccessKeyPath({ noteAccessKeyPath: __filename }), __filename);
  assert.equal(findNoteAccessKeyPath({ workspaceId: "owner" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
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
  testNormalizeEmailManifest();
  testNormalizeHealthManifest();
  testNormalizeNoteManifest();
  testNormalizePluginAppearance();
  testFrameAncestorsAllowsCurrentOrigin();
  await testFetchesConfiguredWardrobeManifest();
  await testPluginWorkspaceAuthorizationDefaultsToOwnerOnly();
  await testExplicitPluginWorkspaceAuthorizationAllowsNonOwner();
  await testCodexPluginCannotBeGrantedToNonOwner();
  await testFrameAncestorsBlockedReturnsUnavailable();
  await testDefaultNasManifestUrl();
  testInstalledPluginListReflectsWorkspaceKeyBindings();
  await testHealthFreshInstallIsInstalledButNotWorkspaceActive();
  testHealthWorkspaceKeyWithoutConfigIsNotActive();
  testFinanceWorkspaceKeyWithoutConfigIsNotActive();
  await testFinanceGrantProvisionsWorkspaceKeyAndBind();
  await testFinanceProvisioningFailureBlocksManifest();
  await testFinanceOwnerManifestProvisionsWorkspaceLocalMcpConfig();
  await testFinanceOwnerProvisioningFailureBlocksManifest();
  await testHealthGrantProvisionsWorkspaceKeyHashConfigAndLaunch();
  await testNoteGrantProvisionsWorkspaceKeyHashConfigAndLaunch();
  await testHealthOwnerGrantProvisionsWorkspaceBeforeManifest();
  await testHealthOwnerGrantMissingRegistrationKeyDoesNotBecomeActive();
  await testEmailGrantProvisionsWorkspaceRegistrationAndLaunch();
  await testEmailProvisioningFailureBlocksManifest();
  await testHealthProvisioningFailureBlocksManifest();
  await testWardrobeGrantProvisionsWorkspaceKeySkillGatewayAndLaunchBinding();
  await testWardrobeProvisioningFailureBlocksManifest();
  await testLegacyWardrobePendingProvisioningBlocksManifest();
  await testHttpsManifestOverride();
  await testFetchFailureReturnsUnavailable();
  await testLaunchEntryUsesServerSideWorkspaceKey();
  await testCodexLaunchEntryUsesServerSideKey();
  await testFinanceLaunchEntryUsesWorkspaceKeyBody();
  await testFinanceLaunchEntryUsesSeparateWorkspaceUserKeyWhenProvided();
  await testHttpsHermesUsesSameOriginProxyForLocalCodexEntryAfterLaunch();
  await testHttpsHermesUsesSameOriginProxyForLanWardrobeEntryAfterLaunch();
  await testSameOriginProxySkipsUpstreamFrameAncestorsBlock();
  await testHttpsHermesProxyEntryIncludesEffectiveWorkspaceForWardrobeLaunch();
  testPluginSameOriginProxyPathForUrl();
  testFindWardrobeAccessKeyPath();
  testFindCodexMobileAccessKeyPath();
  testFindFinanceAccessKeyPath();
  testFindEmailAccessKeyPath();
  testFindHealthAccessKeyPath();
  testFindNoteAccessKeyPath();
  await testReviewFinanceLedgerJoinRequestUsesDedicatedFinanceEndpoint();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
