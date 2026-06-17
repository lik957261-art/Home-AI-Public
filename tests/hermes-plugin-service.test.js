"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_CODEX_MOBILE_PLUGIN_MANIFEST_URL,
  DEFAULT_EMAIL_PLUGIN_MANIFEST_URL,
  DEFAULT_FINANCE_PLUGIN_MANIFEST_URL,
  DEFAULT_GROWTH_PLUGIN_MANIFEST_URL,
  DEFAULT_HEALTH_PLUGIN_MANIFEST_URL,
  DEFAULT_MOIRA_PLUGIN_MANIFEST_URL,
  DEFAULT_NOTE_PLUGIN_MANIFEST_URL,
  DEFAULT_WARDROBE_PLUGIN_MANIFEST_URL,
  configuredPlugins,
  createHermesPluginService,
  discoverPluginWorkspaceIdsFromAccessKeys,
  findCodexMobileAccessKeyPath,
  findEmailAccessKeyPath,
  findFinanceAccessKeyPath,
  findGrowthAccessKeyPath,
  findHealthAccessKeyPath,
  findMoiraAccessKeyPath,
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
      url: "http://127.0.0.1:8765/?embed=hermes",
      frame_policy: "allow_configured_hermes_origins",
    },
    mcp: {
      server: "wardrobe-mcp",
      toolset: "wardrobe",
      required_tools: ["wardrobe.search_items", "wardrobe.write_item"],
    },
    program_api: {
      base_url: "http://127.0.0.1:8765",
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
    actions: [
      {
        id: "record",
        label: "记一笔",
        placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
        priority: 10,
        entry: { type: "plugin_route", pluginRoute: "record" },
      },
    ],
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

function sampleGrowthManifest() {
  return {
    schema_version: 1,
    id: "growth",
    title: "成长",
    kind: "embedded_app",
    manifest_url: "/api/v1/hermes/plugin/manifest",
    entry_url: "/?embed=hermes",
    navigation: {
      state_event: "growth.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "growth.plugin.back_result",
      refresh_required_event: "growth.plugin.refresh_required",
      preserve_iframe_state: true,
    },
    appearance_sync: {
      theme: ["dark", "light"],
      fontSize: ["small", "default", "large", "xlarge", "xxlarge"],
      launch_field: "appearance",
    },
    mcp_toolset: "growth",
    workspace_registration_endpoint: "/api/v1/hermes/plugin/workspaces",
    owner_binding: {
      config_file: ".hermes-growth/config.json",
      access_key_file: ".hermes-growth/access-key.txt",
      cache_dir: ".hermes-cache",
      raw_key_in_manifest: false,
    },
  };
}

function sampleMoiraManifest() {
  return {
    schema_version: 1,
    id: "moira",
    title: "星盘",
    description: "Local-first Chinese astrology charting Web App for Home AI.",
    kind: "embedded_app",
    entry: {
      type: "web",
      url: "http://127.0.0.1:4174/?embed=hermes&v=0.2.33",
      frame_policy: "allow_configured_hermes_origins",
    },
    launch: {
      endpoint: "/api/v1/hermes/plugin/launch",
      method: "POST",
      entry_path_only: true,
      token_ttl_seconds: 300,
    },
    navigation: {
      state_event: "moira.plugin.navigation",
      back_event: "hermes.plugin.back",
      back_result_event: "moira.plugin.back_result",
      refresh_required_event: "moira.plugin.refresh_required",
      preserve_iframe_state: true,
    },
    appearance_sync: {
      theme_values: ["system", "dark", "light"],
      font_size_values: ["small", "default", "large", "xlarge", "xxlarge"],
    },
    embedding: {
      sameOriginProxy: true,
      postMessage: true,
      themeInheritance: true,
      frame_ancestors: ["'self'", "http://127.0.0.1:*", "http://localhost:*"],
    },
    program_api: {
      base_url: "http://127.0.0.1:4174",
      plugin_manifest: "/api/v1/hermes/plugin/manifest",
      plugin_launch: "/api/v1/hermes/plugin/launch",
      client_version: "/api/moira/client-version",
      sync_schema_version: 1,
    },
    owner_binding: {
      strategy: "workspace_bound_local_plugin_key",
      access_key_file: ".hermes-moira/access-key.txt",
      raw_key_returned_by_moira: false,
    },
    toolsets: ["moira"],
    permissions: ["moira:read", "moira:write"],
    actions: [
      {
        id: "new_chart",
        label: "新建星盘",
        placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
        priority: 10,
        entry: { type: "plugin_route", pluginRoute: "new_chart" },
      },
    ],
  };
}

function testNormalizeManifest() {
  const manifest = normalizeManifest(sampleManifest(), {
    id: "wardrobe",
    manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-05-28T00:00:00.000Z",
  });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.id, "wardrobe");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:8765/?embed=hermes");
  assert.equal(manifest.entry.origin, "http://127.0.0.1:8765");
  assert.equal(manifest.embed.mode, "same_window_iframe");
  assert.equal(manifest.embed.requiresSignedToken, true);
  assert.equal(manifest.mcp.toolset, "wardrobe");
  assert.deepEqual(manifest.mcp.requiredTools, ["wardrobe.search_items", "wardrobe.write_item"]);
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:8765/");
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
  assert.deepEqual(manifest.actions, [
    {
      id: "record",
      label: "记一笔",
      description: "",
      placement: ["plugin_drawer_frequent", "dock_long_press", "search"],
      priority: 10,
      entry: { type: "plugin_route", pluginRoute: "record" },
    },
  ]);
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

function testNormalizeGrowthManifest() {
  const manifest = normalizeManifest(sampleGrowthManifest(), {
    id: "growth",
    manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-06-10T00:00:00.000Z",
  });
  assert.equal(manifest.id, "growth");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:4881/?embed=hermes");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:4881/");
  assert.equal(manifest.programApi.pluginLaunchPath, "/api/v1/hermes/plugin/launch");
  assert.equal(manifest.programApi.workspaceRegistrationPath, "/api/v1/hermes/plugin/workspaces");
  assert.equal(manifest.mcp.toolset, "growth");
  assert.deepEqual(manifest.mcp.toolsets, ["growth"]);
  assert.deepEqual(manifest.mcp.requiredTools, []);
  assert.equal(manifest.embedding.stateEvent, "growth.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "growth.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "growth.plugin.refresh_required");
  assert.equal(manifest.ownerBinding.configFile, ".hermes-growth/config.json");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.equal(Object.hasOwn(manifest.ownerBinding, "access_key_file"), false);
}

function testNormalizeMoiraManifest() {
  const manifest = normalizeManifest(sampleMoiraManifest(), {
    id: "moira",
    title: "星盘",
    manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
    fetchedAt: "2026-06-11T00:00:00.000Z",
  });
  assert.equal(manifest.id, "moira");
  assert.equal(manifest.title, "星盘");
  assert.equal(normalizeManifest(Object.assign({}, sampleMoiraManifest(), { title: "Moira" }), {
    id: "moira",
    title: "星盘",
    manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest",
  }).title, "星盘");
  assert.equal(manifest.kind, "embedded_app");
  assert.equal(manifest.entry.url, "http://127.0.0.1:4174/?embed=hermes&v=0.2.33");
  assert.equal(manifest.programApi.baseUrl, "http://127.0.0.1:4174/");
  assert.equal(manifest.programApi.pluginLaunchPath, "http://127.0.0.1:4174/api/v1/hermes/plugin/launch");
  assert.equal(manifest.mcp.toolset, "moira");
  assert.deepEqual(manifest.mcp.toolsets, ["moira"]);
  assert.equal(manifest.embedding.stateEvent, "moira.plugin.navigation");
  assert.equal(manifest.embedding.backResultEvent, "moira.plugin.back_result");
  assert.equal(manifest.embedding.refreshRequiredEvent, "moira.plugin.refresh_required");
  assert.equal(manifest.ownerBinding.rawKeyReturned, false);
  assert.deepEqual(manifest.permissions.plugin, ["moira:read", "moira:write"]);
  assert.deepEqual(manifest.actions.map((action) => action.id), ["new_chart"]);
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

async function testDefaultLocalManifestUrls() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-default-plugin-urls-"));
  const moiraKeyPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "access-key.txt");
  const moiraConfigPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(moiraKeyPath), { recursive: true });
  fs.writeFileSync(moiraKeyPath, "owner-moira-key\n", "utf8");
  fs.writeFileSync(moiraConfigPath, JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  const service = createHermesPluginService({
    dataDir: dir,
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
  assert.equal(service.list().find((item) => item.id === "moira").manifestUrl, DEFAULT_MOIRA_PLUGIN_MANIFEST_URL);
  assert.equal(service.listInstalled()[0].title, "衣橱");
  assert.equal(service.listInstalled()[1].title, "Codex");
  assert.equal(service.listInstalled()[2].title, "记账");
  assert.equal(service.listInstalled()[3].title, "邮箱");
  assert.equal(service.listInstalled()[4].manifestUrl, DEFAULT_HEALTH_PLUGIN_MANIFEST_URL);
  assert.equal(service.listInstalled()[6].title, "成长");
  assert.equal(service.listInstalled()[7].title, "星盘");
}

function testInstalledPluginListReflectsWorkspaceKeyBindings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-bindings-"));
  const ownerWardrobeKey = path.join(dir, "drive", "users", "owner", ".hermes-wardrobe", "access-key.txt");
  const ownerFinanceKey = path.join(dir, "drive", "users", "owner", ".hermes-finance", "access-key.txt");
  const ownerFinanceConfig = path.join(dir, "drive", "users", "owner", ".hermes-finance", "config.json");
  const ownerEmailKey = path.join(dir, "drive", "users", "owner", ".hermes-email", "access-key.txt");
  const ownerHealthKey = path.join(dir, "drive", "users", "owner", ".hermes-health", "access-key.txt");
  const ownerHealthConfig = path.join(dir, "drive", "users", "owner", ".hermes-health", "config.json");
  const ownerGrowthKey = path.join(dir, "drive", "users", "owner", ".hermes-growth", "access-key.txt");
  const ownerGrowthConfig = path.join(dir, "drive", "users", "owner", ".hermes-growth", "config.json");
  const ownerMoiraKey = path.join(dir, "drive", "users", "owner", ".hermes-moira", "access-key.txt");
  const ownerMoiraConfig = path.join(dir, "drive", "users", "owner", ".hermes-moira", "config.json");
  const wardrobeKey = path.join(dir, "drive", "users", "weixin_wuping", "Hermes-吴萍", "衣橱", ".hermes-wardrobe", "access-key.txt");
  const financeKey = path.join(dir, "drive", "users", "child_workspace", ".hermes-finance", "access-key.txt");
  const financeConfig = path.join(dir, "drive", "users", "child_workspace", ".hermes-finance", "config.json");
  const emailKey = path.join(dir, "drive", "users", "mail_workspace", "Email", ".hermes-email", "access-key.txt");
  const healthKey = path.join(dir, "drive", "users", "health_workspace", ".hermes-health", "access-key.txt");
  const healthConfig = path.join(dir, "drive", "users", "health_workspace", ".hermes-health", "config.json");
  const growthKey = path.join(dir, "drive", "users", "growth_workspace", ".hermes-growth", "access-key.txt");
  const growthConfig = path.join(dir, "drive", "users", "growth_workspace", ".hermes-growth", "config.json");
  const moiraKey = path.join(dir, "drive", "users", "moira_workspace", "Moira", ".hermes-moira", "workspace-key.txt");
  const moiraConfig = path.join(dir, "drive", "users", "moira_workspace", "Moira", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(ownerWardrobeKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerFinanceKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerEmailKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerHealthKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerGrowthKey), { recursive: true });
  fs.mkdirSync(path.dirname(ownerMoiraKey), { recursive: true });
  fs.mkdirSync(path.dirname(wardrobeKey), { recursive: true });
  fs.mkdirSync(path.dirname(financeKey), { recursive: true });
  fs.mkdirSync(path.dirname(emailKey), { recursive: true });
  fs.mkdirSync(path.dirname(healthKey), { recursive: true });
  fs.mkdirSync(path.dirname(growthKey), { recursive: true });
  fs.mkdirSync(path.dirname(moiraKey), { recursive: true });
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
  fs.writeFileSync(ownerGrowthKey, "owner-growth-key\n", "utf8");
  fs.writeFileSync(ownerMoiraKey, "owner-moira-key\n", "utf8");
  fs.writeFileSync(ownerMoiraConfig, JSON.stringify({
    workspace_id: "owner",
    hermes_workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(ownerGrowthConfig, JSON.stringify({
    workspace_id: "growth:owner",
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
  fs.writeFileSync(growthKey, "growth-key\n", "utf8");
  fs.writeFileSync(growthConfig, JSON.stringify({
    workspace_id: "growth:growth_workspace",
    hermes_workspace_id: "growth_workspace",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(moiraKey, "moira-key\n", "utf8");
  fs.writeFileSync(moiraConfig, JSON.stringify({
    workspace_id: "moira_workspace",
    hermes_workspace_id: "moira_workspace",
    access_key_file: "workspace-key.txt",
  }), "utf8");

  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("wardrobe", { dataDir: dir }).sort(), ["owner", "weixin_wuping"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("finance", { dataDir: dir }).sort(), ["owner", "child_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("email", { dataDir: dir }).sort(), ["owner", "mail_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("health", { dataDir: dir }).sort(), ["owner", "health_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("growth", { dataDir: dir }).sort(), ["owner", "growth_workspace"].sort());
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("moira", { dataDir: dir }).sort(), ["owner", "moira_workspace"].sort());

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
  assert.deepEqual(installed.find((item) => item.id === "growth").authorizedWorkspaceIds.sort(), ["owner", "growth_workspace"].sort());
  assert.deepEqual(installed.find((item) => item.id === "moira").authorizedWorkspaceIds.sort(), ["owner", "moira_workspace"].sort());
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
  assert.deepEqual(installed.find((item) => item.id === "growth").workspaceAuthorizations.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)), [{
    workspaceId: "growth_workspace",
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

function testGrowthWorkspaceKeyWithoutConfigIsNotActive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-growth-key-only-"));
  const growthKey = path.join(dir, "drive", "users", "growth_workspace", ".hermes-growth", "access-key.txt");
  fs.mkdirSync(path.dirname(growthKey), { recursive: true });
  fs.writeFileSync(growthKey, "growth-key\n", "utf8");
  assert.deepEqual(discoverPluginWorkspaceIdsFromAccessKeys("growth", { dataDir: dir }), []);
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("key-only Growth workspace must not fetch manifest");
    },
  });
  const installed = service.listInstalled().find((item) => item.id === "growth");
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

async function testFinanceGrantRefreshesGatewayProfilesAfterProvisioning() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-grant-gateway-"));
  const fetchCalls = [];
  const gatewayCalls = [];
  const systemCalls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    liveRoot: "/Users/example/path",
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    gatewayWorkspaceProvisioningService: {
      ensureWorkspaceGateway(input) {
        gatewayCalls.push(input);
        return {
          ok: true,
          manifestPath: "/Users/example/path",
          macUser: "hm-stephen",
          profiles: ["hm-stephen-openai-1", "deepseekgw7"],
          profileBindingRefreshed: true,
          restartRequired: true,
        };
      },
    },
    systemProvisioningExecutor: {
      runStep(action, context) {
        systemCalls.push({ action, context });
        return Promise.resolve({
          ok: true,
          syncedPluginBindings: ["finance", "note"],
          workers: [
            { profile: "hm-stephen-openai-1" },
            { profile: "deepseekgw7" },
          ],
          kickstarted: [
            { profile: "hm-stephen-openai-1", label: "com.hermesmobile.gateway.hm-stephen.openai.1" },
            { profile: "deepseekgw7", label: "com.hermesmobile.gateway.hm-stephen.deepseek.1" },
          ],
        });
      },
    },
    requireSystemGatewayRefresh: true,
    fetch(url, options = {}) {
      fetchCalls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/users/bind")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: { user: { id: "user_stephen" }, ledger: { id: "ledger_stephen" }, created: true } }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const grant = await service.grantWorkspace({ id: "finance", workspaceId: "weixin_stephen", displayName: "凡凡", actor: "owner" });

  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "active");
  assert.equal(grant.provisioning.gatewayRefreshStatus, "active");
  assert.equal(grant.provisioning.gatewayProfileBindingRefreshed, true);
  assert.equal(grant.provisioning.gatewayRestarted, true);
  assert.deepEqual(grant.provisioning.gatewayProfiles, ["hm-stephen-openai-1", "deepseekgw7"]);
  assert.deepEqual(gatewayCalls, [{ workspaceId: "weixin_stephen", refreshProfileBinding: true, bindingChanged: true }]);
  assert.equal(systemCalls.length, 1);
  assert.equal(systemCalls[0].action, "ensure_launchd_services");
  assert.equal(systemCalls[0].context.workspaceId, "weixin_stephen");
  assert.equal(systemCalls[0].context.macUser, "hm-stephen");
  assert.equal(systemCalls[0].context.paths.workspaceDataRoot, "/Users/example/path");
  assert.equal(systemCalls[0].context.paths.workerWorkspaceRoot, "/Users/example/path");
  assert.equal(systemCalls[0].context.gateway.kickstart, true);
  assert.equal(systemCalls[0].context.gateway.manifestPath, "/Users/example/path");
  assert.deepEqual(systemCalls[0].context.gateway.profiles, ["hm-stephen-openai-1", "deepseekgw7"]);
  assert.equal(fetchCalls[0].body.target_workspace_id, "weixin_stephen");
}

async function testFinanceGrantFailsProvisioningWhenGatewayRefreshFails() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-grant-gateway-fail-"));
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" }],
    gatewayWorkspaceProvisioningService: {
      ensureWorkspaceGateway() {
        return {
          ok: true,
          macUser: "hm-stephen",
          profiles: ["hm-stephen-openai-1"],
          profileBindingRefreshed: true,
        };
      },
    },
    systemProvisioningExecutor: {
      runStep() {
        return Promise.resolve({ ok: false, error: "workspace_gateway_workers_missing" });
      },
    },
    requireSystemGatewayRefresh: true,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/users/bind")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: { user: { id: "user_fail" }, ledger: { id: "ledger_fail" } } }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const grant = await service.grantWorkspace({ id: "finance", workspaceId: "weixin_stephen", displayName: "凡凡", actor: "owner" });

  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "provisioning_failed");
  assert.equal(grant.record.provisioningError, "workspace_gateway_workers_missing");
  assert.equal(grant.provisioning.status, "provisioning_failed");
  assert.equal(grant.provisioning.gatewayRefreshStatus, "failed");
  assert.deepEqual(service.list({ workspaceId: "weixin_stephen" }), []);
  const manifest = await service.manifest({ id: "finance", workspaceId: "weixin_stephen", launchPlugin: true });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_provisioning_failed");
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

async function testGrowthGrantProvisionsWorkspaceKeyHashConfigAndLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-growth-grant-"));
  const ownerKeyPath = path.join(dir, "growth-owner-key.txt");
  fs.writeFileSync(ownerKeyPath, "growth-owner-test-key\n", "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    growthOwnerKeyPath: ownerKeyPath,
    plugins: [{ id: "growth", manifestUrl: "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/api/v1/hermes/plugin/workspaces")) {
        assert.equal(options.headers.Authorization, "Bearer growth-owner-test-key");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            ok: true,
            workspace_id: "growth:weixin_growth",
            hermes_workspace_id: "weixin_growth",
          }),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sampleGrowthManifest()) });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entry_url: "/?embed=hermes&launch=growth_once", expires_in_ms: 300000 }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const granted = await service.grantWorkspace({ id: "growth", workspaceId: "weixin_growth", displayName: "Growth User" });
  assert.equal(granted.ok, true);
  assert.equal(granted.record.provisioningStatus, "active");
  assert.equal(granted.provisioning.growthWorkspaceId, "growth:weixin_growth");
  assert.equal(service.list({ workspaceId: "weixin_growth" }).find((item) => item.id === "growth").id, "growth");

  const keyPath = path.join(dir, "drive", "users", "weixin_growth", ".hermes-growth", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "weixin_growth", ".hermes-growth", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hgr_/);
  const registrationCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/workspaces"));
  assert.ok(registrationCall);
  assert.equal(registrationCall.body.workspace_id, "growth:weixin_growth");
  assert.equal(registrationCall.body.target_workspace_id, "weixin_growth");
  assert.equal(registrationCall.body.hermes_workspace_id, "weixin_growth");
  assert.match(registrationCall.body.access_key_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(registrationCall.body).includes(rawKey), false);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.api_base_url, "http://127.0.0.1:4881");
  assert.equal(config.workspace_id, "growth:weixin_growth");
  assert.equal(config.hermes_workspace_id, "weixin_growth");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(JSON.stringify(config).includes(rawKey), false);

  const manifest = await service.manifest({
    id: "growth",
    workspaceId: "weixin_growth",
    ownerAuthorized: true,
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/growth/proxy/?embed=hermes&launch=growth_once&workspaceId=weixin_growth",
  );
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.deepEqual(launchCall.body, {
    workspace_id: "weixin_growth",
  });
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"launch_token"|"workspace_key"|hgr_/);
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
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
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
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
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
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
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
    pluginLaunchRecoveryService: {
      recover: () => Promise.resolve({ attempted: false, reason: "test_recovery_disabled" }),
    },
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

async function testManifestRetriesAfterRecoverableLaunchFailure() {
  const calls = [];
  const recoveryCalls = [];
  const service = createHermesPluginService({
    plugins: [{
      id: "codex-mobile",
      manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
      launchdLabel: "com.hermesmobile.plugin.codex-mobile",
    }],
    pluginLaunchRecoveryService: {
      retryDelayMs: 0,
      recover(input) {
        recoveryCalls.push(input);
        return Promise.resolve({
          attempted: true,
          restarted: true,
          method: "launchctl",
          launchdLabel: "com.hermesmobile.plugin.codex-mobile",
          retryDelayMs: 0,
        });
      },
    },
    fetch(url) {
      calls.push(url);
      if (calls.length === 1) return Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:8787"));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sampleCodexManifest()),
      });
    },
  });
  const manifest = await service.manifest({ id: "codex-mobile", workspaceId: "owner" });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.available, true);
  assert.equal(manifest.id, "codex-mobile");
  assert.equal(calls.length, 2);
  assert.equal(recoveryCalls.length, 1);
  assert.equal(recoveryCalls[0].pluginId, "codex-mobile");
  assert.equal(recoveryCalls[0].launchdLabel, "com.hermesmobile.plugin.codex-mobile");
  assert.equal(recoveryCalls[0].failure.code, "plugin_manifest_error");
  assert.equal(manifest.recovery.attempted, true);
  assert.equal(manifest.recovery.retried, true);
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

async function testMoiraLaunchEntryUsesBearerAndSameOriginProxy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-owner-launch-"));
  const ownerKeyPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "access-key.txt");
  const ownerConfigPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "owner-moira-key\n", "utf8");
  fs.writeFileSync(ownerConfigPath, JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign({}, sampleMoiraManifest(), { title: "Moira" })),
        });
      }
      if (url === "http://127.0.0.1:4174/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/api/v1/hermes/plugin/launch/moira_once",
            expires_in: 300,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  const manifest = await service.manifest({
    id: "moira",
    workspaceId: "owner",
    appOrigin: "http://127.0.0.1:19073",
    appearance: { theme: "light", fontSize: "xlarge" },
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.title, "星盘");
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/moira/proxy/api/v1/hermes/plugin/launch/moira_once?pluginTheme=light&pluginFontSize=xlarge&workspaceId=owner",
  );
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.deepEqual(JSON.parse(launchCall.options.body), {
    workspace_id: "owner",
    appearance: { theme: "light", fontSize: "xlarge" },
  });
  assert.match(launchCall.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"workspace_key"|"user_key"/);
}

async function testMoiraWupingRequiresWorkspaceBinding() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-no-shared-owner-"));
  const ownerKeyPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "access-key.txt");
  const ownerConfigPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "owner-moira-key\n", "utf8");
  fs.writeFileSync(ownerConfigPath, JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }],
    fetch() {
      throw new Error("Moira without workspace binding must not fetch manifest");
    },
  });

  assert.equal(service.list({ workspaceId: "weixin_wuping" }).some((item) => item.id === "moira"), false);
  const manifest = await service.manifest({
    id: "moira",
    workspaceId: "weixin_wuping",
    appOrigin: "http://127.0.0.1:19073",
    launchPlugin: true,
  });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_workspace_not_authorized");
}

async function testMoiraAuthorizedWorkspaceIsVisibleButDoesNotShareOwnerBinding() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-authorized-visible-"));
  const ownerKeyPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "access-key.txt");
  const ownerConfigPath = path.join(dir, "drive", "users", "owner", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "owner-moira-key\n", "utf8");
  fs.writeFileSync(ownerConfigPath, JSON.stringify({
    workspace_id: "owner",
    access_key_file: "access-key.txt",
  }), "utf8");
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest", authorizedWorkspaceIds: ["headless_ws"] }],
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleMoiraManifest()),
        });
      }
      throw new Error(`unexpected Moira launch without local binding: ${url}`);
    },
  });

  assert.equal(service.list({ workspaceId: "headless_ws" }).some((item) => item.id === "moira"), true);
  const manifest = await service.manifest({
    id: "moira",
    workspaceId: "headless_ws",
    appOrigin: "http://127.0.0.1:19073",
    launchPlugin: true,
  });
  assert.equal(manifest.available, false);
  assert.equal(manifest.code, "plugin_launch_key_missing");
  assert.match(manifest.warning, /access key file was not found/);
}

function testMoiraLegacyAuthorizationProjectsActiveWhenBindingExists() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-legacy-active-"));
  const workspaceKeyPath = path.join(dir, "drive", "users", "legacy_ws", ".hermes-moira", "access-key.txt");
  const workspaceConfigPath = path.join(dir, "drive", "users", "legacy_ws", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(workspaceKeyPath), { recursive: true });
  fs.writeFileSync(workspaceKeyPath, "legacy-moira-key\n", "utf8");
  fs.writeFileSync(workspaceConfigPath, JSON.stringify({
    workspace_id: "legacy_ws",
    access_key_file: "access-key.txt",
  }), "utf8");
  fs.writeFileSync(path.join(dir, "plugin-workspace-authorizations.json"), JSON.stringify({
    version: 1,
    plugins: {
      moira: {
        records: {
          legacy_ws: {
            workspaceId: "legacy_ws",
            status: "authorized",
            provisioningStatus: "not_supported",
          },
        },
      },
    },
  }), "utf8");
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }],
  });
  const installed = service.listInstalled().find((item) => item.id === "moira");
  assert.equal(installed.workspaceAuthorizations[0].workspaceId, "legacy_ws");
  assert.equal(installed.workspaceAuthorizations[0].provisioningStatus, "active");
}

async function testMoiraGrantProvisionsWorkspaceBindingAndLaunch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-grant-"));
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleMoiraManifest()),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/api/v1/hermes/plugin/launch/moira_grant_once",
            expires_in: 300,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });

  const grant = await service.grantWorkspace({
    id: "moira",
    workspaceId: "weixin_moira",
    displayName: "Moira User",
    actor: "owner",
  });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.provisioningStatus, "active");
  assert.equal(grant.provisioning.status, "active");
  assert.equal(grant.provisioning.configCreated, true);

  const keyPath = path.join(dir, "drive", "users", "weixin_moira", ".hermes-moira", "access-key.txt");
  const configPath = path.join(dir, "drive", "users", "weixin_moira", ".hermes-moira", "config.json");
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(configPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hmoi_/);
  assert.equal(JSON.stringify(grant).includes(rawKey), false);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.workspace_id, "weixin_moira");
  assert.equal(config.access_key_file, "access-key.txt");

  const manifest = await service.manifest({
    id: "moira",
    workspaceId: "weixin_moira",
    appOrigin: "http://127.0.0.1:19073",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(manifest.embed.tokenStatus, "launch_token_issued");
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.deepEqual(JSON.parse(launchCall.options.body), { workspace_id: "weixin_moira" });
  assert.equal(launchCall.options.headers.Authorization, `Bearer ${rawKey}`);
  assert.doesNotMatch(JSON.stringify(manifest), /Authorization|Bearer|"workspace_key"|"user_key"/);
}

async function testMoiraWupingUsesWorkspaceLaunchWhenWorkspaceBindingExists() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-workspace-key-"));
  const workspaceKeyPath = path.join(dir, "drive", "users", "weixin_wuping", ".hermes-moira", "access-key.txt");
  const workspaceConfigPath = path.join(dir, "drive", "users", "weixin_wuping", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(workspaceKeyPath), { recursive: true });
  fs.writeFileSync(workspaceKeyPath, "wuping-moira-key\n", "utf8");
  fs.writeFileSync(workspaceConfigPath, JSON.stringify({
    workspace_id: "weixin_wuping",
    access_key_file: "access-key.txt",
  }), "utf8");
  const calls = [];
  const service = createHermesPluginService({
    dataDir: dir,
    env: {},
    plugins: [{ id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" }],
    fetch(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleMoiraManifest()),
        });
      }
      if (url.endsWith("/api/v1/hermes/plugin/launch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: "/api/v1/hermes/plugin/launch/moira_workspace_once",
            expires_in: 300,
          }),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });

  const manifest = await service.manifest({
    id: "moira",
    workspaceId: "weixin_wuping",
    appOrigin: "http://127.0.0.1:19073",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  const launchCall = calls.find((call) => call.url.endsWith("/api/v1/hermes/plugin/launch"));
  assert.ok(launchCall);
  assert.deepEqual(JSON.parse(launchCall.options.body), { workspace_id: "weixin_wuping" });
  assert.equal(launchCall.options.headers.Authorization, "Bearer wuping-moira-key");
}

function testMoiraProxyRuntimeSecurityDeclaresWasmEval() {
  const service = createHermesPluginService({
    plugins: [
      { id: "moira", manifestUrl: "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest" },
      { id: "finance", manifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest" },
    ],
  });
  assert.deepEqual(service.pluginProxyRuntimeSecurity({ pluginId: "moira" }), { wasmEval: true });
  assert.deepEqual(service.pluginProxyRuntimeSecurity({ pluginId: "finance" }), { wasmEval: false });
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

async function testLocalCodexManifestStripsStaleAbsoluteDomainBeforeProxy() {
  const staleOrigin = "https://hermes-xuxin.synology.me:8445";
  const service = createHermesPluginService({
    plugins: [{ id: "codex-mobile", manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest" }],
    codexMobileAccessKeyPath: __filename,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        const base = sampleCodexManifest();
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(Object.assign({}, base, {
            entry: { type: "web", url: `${staleOrigin}/?embed=hermes` },
            program_api: Object.assign({}, base.program_api, {
              base_url: staleOrigin,
              plugin_launch: `${staleOrigin}/api/v1/hermes/plugin/launch`,
            }),
          })),
        });
      }
      if (url === "http://127.0.0.1:8787/api/v1/hermes/plugin/launch") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entry_path: `${staleOrigin}/thread/thread-a?codexPluginLaunch=cpl_old`,
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
    appOrigin: "https://mac-studio.tailnet.example.test",
    launchPlugin: true,
  });
  assert.equal(manifest.available, true);
  assert.equal(
    manifest.entry.url,
    "/api/hermes-plugins/codex-mobile/proxy/thread/thread-a?codexPluginLaunch=cpl_old&workspaceId=owner",
  );
  assert.equal(manifest.entry.origin, "https://mac-studio.tailnet.example.test");
  assert.equal(manifest.entry.proxiedFromOrigin, "http://127.0.0.1:8787");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.doesNotMatch(JSON.stringify(manifest), /hermes-xuxin\.synology\.me|Authorization|Bearer|test-key/i);
}

async function testHttpsHermesUsesSameOriginProxyForLanWardrobeEntryAfterLaunch() {
  const service = createHermesPluginService({
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleManifest()),
        });
      }
      if (url === "http://127.0.0.1:8765/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "http://127.0.0.1:8765/api/v1/hermes/plugin/launch") {
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
  assert.equal(manifest.entry.proxiedFromOrigin, "http://127.0.0.1:8765");
  assert.equal(manifest.embed.sameOriginProxy, true);
  assert.equal(manifest.embed.upstreamOrigin, "http://127.0.0.1:8765");
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
    plugins: [{ id: "wardrobe", manifestUrl: "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest" }],
    wardrobeAccessKeyPath: __filename,
    fetch(url, options = {}) {
      if (url.endsWith("/api/v1/hermes/plugin/manifest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleManifest()),
        });
      }
      if (url === "http://127.0.0.1:8765/?embed=hermes") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "frame-ancestors https://hermes.example.test" },
        });
      }
      if (url === "http://127.0.0.1:8765/api/v1/hermes/plugin/launch") {
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
    pluginSameOriginProxyPathForUrl("wardrobe", "http://127.0.0.1:8765/items/1?embed=hermes"),
    "/api/hermes-plugins/wardrobe/proxy/items/1?embed=hermes",
  );
  assert.equal(
    pluginSameOriginProxyPathForUrl("wardrobe", "http://127.0.0.1:8765/items/1?embed=hermes", { workspaceId: "weixin_test_1" }),
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

function testFindGrowthAccessKeyPath() {
  assert.equal(findGrowthAccessKeyPath({ growthAccessKeyPath: __filename }), __filename);
  assert.equal(findGrowthAccessKeyPath({ workspaceId: "owner" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
}

function testFindMoiraAccessKeyPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-moira-key-path-"));
  const workspaceKeyPath = path.join(dir, "drive", "users", "weixin_wuping", ".hermes-moira", "workspace-key.txt");
  const workspaceConfigPath = path.join(dir, "drive", "users", "weixin_wuping", ".hermes-moira", "config.json");
  fs.mkdirSync(path.dirname(workspaceKeyPath), { recursive: true });
  fs.writeFileSync(workspaceKeyPath, "wuping-moira-key\n", "utf8");
  fs.writeFileSync(workspaceConfigPath, JSON.stringify({
    workspace_id: "weixin_wuping",
    access_key_file: "workspace-key.txt",
  }), "utf8");

  assert.equal(findMoiraAccessKeyPath({ moiraAccessKeyPath: __filename }), __filename);
  assert.equal(findMoiraAccessKeyPath({ workspaceId: "owner" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
  assert.equal(findMoiraAccessKeyPath({ workspaceId: "weixin_wuping" }, { dataDir: dir, env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), workspaceKeyPath);
  assert.equal(findMoiraAccessKeyPath({ workspaceId: "weixin_other" }, { env: { HERMES_WEB_AUTH_KEY_PATH: __filename } }), "");
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
  testNormalizeGrowthManifest();
  testNormalizeMoiraManifest();
  testNormalizePluginAppearance();
  testFrameAncestorsAllowsCurrentOrigin();
  await testFetchesConfiguredWardrobeManifest();
  await testPluginWorkspaceAuthorizationDefaultsToOwnerOnly();
  await testExplicitPluginWorkspaceAuthorizationAllowsNonOwner();
  await testCodexPluginCannotBeGrantedToNonOwner();
  await testFrameAncestorsBlockedReturnsUnavailable();
  await testDefaultLocalManifestUrls();
  testInstalledPluginListReflectsWorkspaceKeyBindings();
  await testHealthFreshInstallIsInstalledButNotWorkspaceActive();
  testHealthWorkspaceKeyWithoutConfigIsNotActive();
  testFinanceWorkspaceKeyWithoutConfigIsNotActive();
  testGrowthWorkspaceKeyWithoutConfigIsNotActive();
  await testFinanceGrantProvisionsWorkspaceKeyAndBind();
  await testFinanceGrantRefreshesGatewayProfilesAfterProvisioning();
  await testFinanceGrantFailsProvisioningWhenGatewayRefreshFails();
  await testFinanceProvisioningFailureBlocksManifest();
  await testFinanceOwnerManifestProvisionsWorkspaceLocalMcpConfig();
  await testFinanceOwnerProvisioningFailureBlocksManifest();
  await testHealthGrantProvisionsWorkspaceKeyHashConfigAndLaunch();
  await testNoteGrantProvisionsWorkspaceKeyHashConfigAndLaunch();
  await testGrowthGrantProvisionsWorkspaceKeyHashConfigAndLaunch();
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
  await testManifestRetriesAfterRecoverableLaunchFailure();
  await testLaunchEntryUsesServerSideWorkspaceKey();
  await testCodexLaunchEntryUsesServerSideKey();
  await testFinanceLaunchEntryUsesWorkspaceKeyBody();
  await testMoiraLaunchEntryUsesBearerAndSameOriginProxy();
  await testMoiraWupingRequiresWorkspaceBinding();
  await testMoiraAuthorizedWorkspaceIsVisibleButDoesNotShareOwnerBinding();
  testMoiraLegacyAuthorizationProjectsActiveWhenBindingExists();
  await testMoiraGrantProvisionsWorkspaceBindingAndLaunch();
  await testMoiraWupingUsesWorkspaceLaunchWhenWorkspaceBindingExists();
  testMoiraProxyRuntimeSecurityDeclaresWasmEval();
  await testFinanceLaunchEntryUsesSeparateWorkspaceUserKeyWhenProvided();
  await testHttpsHermesUsesSameOriginProxyForLocalCodexEntryAfterLaunch();
  await testLocalCodexManifestStripsStaleAbsoluteDomainBeforeProxy();
  await testHttpsHermesUsesSameOriginProxyForLanWardrobeEntryAfterLaunch();
  await testSameOriginProxySkipsUpstreamFrameAncestorsBlock();
  await testHttpsHermesProxyEntryIncludesEffectiveWorkspaceForWardrobeLaunch();
  testPluginSameOriginProxyPathForUrl();
  testFindWardrobeAccessKeyPath();
  testFindCodexMobileAccessKeyPath();
  testFindFinanceAccessKeyPath();
  testFindEmailAccessKeyPath();
  testFindHealthAccessKeyPath();
  testFindGrowthAccessKeyPath();
  testFindMoiraAccessKeyPath();
  testFindNoteAccessKeyPath();
  await testReviewFinanceLedgerJoinRequestUsesDedicatedFinanceEndpoint();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
