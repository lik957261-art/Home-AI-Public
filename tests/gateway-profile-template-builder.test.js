"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildGatewayProfileTemplates,
  renderGatewayConfigYaml,
  templatePeersForSelection,
} = require("../scripts/build-gateway-profile-template");
const { readCapabilities } = require("../scripts/verify-gateway-profile-template-sync");

function writeConfig(root, profile, extra = {}) {
  const dir = path.join(root, profile);
  fs.mkdirSync(dir, { recursive: true });
  const toolsets = ["web", "file", ...(extra.toolsets || [])];
  const apiToolsets = ["web", "file", ...(extra.apiToolsets || extra.toolsets || [])];
  const mcpServers = extra.mcpServers || [];
  const plugins = extra.plugins || [];
  const mcpBlock = mcpServers.length
    ? `mcp_servers:\n${mcpServers.map((name) => `  ${name}:\n    command: python\n    enabled: true`).join("\n")}\n`
    : "";
  const pluginBlock = plugins.length
    ? `plugins:\n  enabled:\n${plugins.map((name) => `    - ${name}`).join("\n")}\n`
    : "plugins:\n  enabled: []\n";
  fs.writeFileSync(path.join(dir, "config.yaml"), [
    "model:",
    `  default: ${extra.modelDefault || "gpt-5.5"}`,
    `  provider: ${extra.provider || "openai-codex"}`,
    "toolsets:",
    ...toolsets.map((item) => `  - ${item}`),
    "platform_toolsets:",
    "  api_server:",
    ...apiToolsets.map((item) => `    - ${item}`),
    pluginBlock.trimEnd(),
    mcpBlock.trimEnd(),
    "",
  ].filter((line) => line !== "").join("\n"));
}

function worker(profile, overrides = {}) {
  return Object.assign({
    name: profile,
    profile,
    enabled: true,
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
  }, overrides);
}

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-template-builder-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function readRenderedCapabilities(root, name, yaml) {
  const configPath = path.join(root, `${name}.yaml`);
  fs.writeFileSync(configPath, yaml);
  return readCapabilities(configPath);
}

function testSelectedProfileExpandsToTemplatePeers() {
  withFixture((root) => {
    for (const profile of ["lowgw1", "lowgw2", "lowgw10"]) {
      writeConfig(root, profile, { toolsets: ["wardrobe", "finance"], mcpServers: ["wardrobe", "finance"], plugins: ["hermes-mobile-web"] });
    }
    writeConfig(root, "lowgw8", { toolsets: ["note"], mcpServers: ["note"] });
    const manifest = {
      workers: [
        worker("lowgw1"),
        worker("lowgw2"),
        worker("lowgw8", { allowedWorkspaceIds: ["weixin_wuping"], skillWorkspaceIds: ["weixin_wuping"] }),
        worker("lowgw10"),
      ],
    };
    const result = buildGatewayProfileTemplates({
      manifest,
      profilesRoot: root,
      profile: "lowgw10",
      requireConfig: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.configureProfiles, ["lowgw1", "lowgw2", "lowgw10"]);
    assert.equal(result.templates.length, 1);
    assert.equal(result.templates[0].templateKey, "owner|user|openai-codex");
    assert.deepEqual(result.templates[0].capabilities.toolsets, ["file", "finance", "wardrobe", "web"]);
    assert.deepEqual(templatePeersForSelection(manifest, "lowgw10", { profilesRoot: root }), ["lowgw1", "lowgw2", "lowgw10"]);
  });
}

function testProviderAndTierStaySeparate() {
  withFixture((root) => {
    writeConfig(root, "lowgw1", { toolsets: ["wardrobe"], mcpServers: ["wardrobe"] });
    writeConfig(root, "deepseekgw1", { provider: "deepseek", modelDefault: "deepseek-chat", toolsets: ["wardrobe"], mcpServers: ["wardrobe"] });
    writeConfig(root, "officialclean1", { toolsets: ["terminal"], mcpServers: [] });
    const result = buildGatewayProfileTemplates({
      manifest: {
        workers: [
          worker("lowgw1"),
          worker("deepseekgw1", { provider: "deepseek" }),
          worker("officialclean1", { securityLevel: "owner-maintenance" }),
        ],
      },
      profilesRoot: root,
      requireConfig: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.templates.map((template) => template.templateKey), [
      "owner|owner-maintenance|openai-codex",
      "owner|user|deepseek",
      "owner|user|openai-codex",
    ]);
  });
}

function testDriftIsReportedWithoutRawConfig() {
  withFixture((root) => {
    writeConfig(root, "lowgw1", { toolsets: ["wardrobe"], mcpServers: ["wardrobe"] });
    writeConfig(root, "lowgw2", { toolsets: ["finance"], mcpServers: ["finance"] });
    const result = buildGatewayProfileTemplates({
      manifest: { workers: [worker("lowgw1"), worker("lowgw2")] },
      profilesRoot: root,
      profile: "lowgw1",
      requireConfig: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "profile_template_drift"), true);
    assert.equal(JSON.stringify(result).includes("command: python"), false);
  });
}

function testRenderProfileConfigYaml() {
  withFixture((root) => {
    const yaml = renderGatewayConfigYaml({
      configKind: "profile",
      values: {
        profile: "lowgw10",
        port: "18760",
        profile_link: "/profiles/lowgw10",
        weather_plugin_enabled: "1",
        web_plugin_enabled: "1",
        http_plugin_enabled: "1",
        docx_plugin_enabled: "1",
        pptx_plugin_enabled: "1",
        pdf_plugin_enabled: "1",
        audio_plugin_enabled: "1",
        archive_plugin_enabled: "1",
        image_plugin_enabled: "1",
        cronjob_plugin_enabled: "1",
        wardrobe_enabled: "1",
        wardrobe_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/wardrobe-mcp/scripts/wardrobe-mcp.py",
        wardrobe_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        finance_enabled: "1",
        finance_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        finance_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/finance-mcp/scripts/finance_mcp_stdio.py",
        finance_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        finance_mcp_api_base_url: "http://127.0.0.1:8791",
        note_enabled: "1",
        note_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        note_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/note-mcp/scripts/note_mcp_stdio.py",
        note_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        note_mcp_api_base_url: "http://127.0.0.1:4181",
        pptx_plugin_enabled: "1",
        health_enabled: "1",
        health_mcp_command: "node",
        health_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/health-mcp/scripts/mcp-health-wrapper.js",
        health_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        health_mcp_api_base_url: "http://172.27.192.1:4877",
        growth_enabled: "1",
        growth_mcp_command: "node",
        growth_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/growth-mcp/scripts/growth-mcp-wrapper.js",
        growth_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        growth_mcp_api_base_url: "http://127.0.0.1:4881",
        moira_enabled: "1",
        moira_mcp_command: "node",
        moira_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/moira-mcp/scripts/moira-mcp-stdio.mjs",
        moira_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        moira_mcp_api_base_url: "http://127.0.0.1:4174",
        music_enabled: "1",
        music_mcp_command: "node",
        music_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/music-mcp/src/mcp-stdio.js",
        music_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        music_sqlite_path: "/mnt/c/ProgramData/HermesMobile/plugins/music/runtime/music.sqlite",
        movie_enabled: "1",
        movie_mcp_command: "npm",
        movie_mcp_root: "/mnt/c/ProgramData/HermesMobile/gateway-worker/movie-mcp",
        movie_config_path: "/mnt/c/ProgramData/HermesMobile/plugins/movie/data/movie-devices.json",
        movie_metadata_db: "/mnt/c/ProgramData/HermesMobile/plugins/movie/data/movie-metadata.sqlite",
        movie_playback_state_file: "/mnt/c/ProgramData/HermesMobile/plugins/movie/data/playback-state.json",
        email_enabled: "1",
        email_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        email_mcp_path: "/mnt/c/ProgramData/HermesMobile/gateway-worker/email-mcp/scripts/email-mcp-wrapper.py",
        email_workspace: "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner",
        email_mcp_api_base_url: "http://172.27.192.1:5175",
        outlook_graph_enabled: "1",
        outlook_graph_mcp_path: "/runtime/scripts/outlook_graph_mcp.py",
      },
    });
    const capabilities = readRenderedCapabilities(root, "profile", yaml);
    assert.equal(capabilities.modelProvider, "openai-codex");
    assert.deepEqual(capabilities.plugins, [
      "hermes-mobile-archive",
      "hermes-mobile-audio",
      "hermes-mobile-cronjob",
      "hermes-mobile-docx",
      "hermes-mobile-http",
      "hermes-mobile-image",
      "hermes-mobile-pdf",
      "hermes-mobile-pptx",
      "hermes-mobile-weather",
      "hermes-mobile-web",
    ]);
    assert.deepEqual(capabilities.mcpServers, ["email", "finance", "growth", "health", "moira", "movie", "music", "note", "outlook_graph", "wardrobe"]);
    assert.equal(capabilities.toolsets.includes("wardrobe"), true);
    assert.equal(capabilities.toolsets.includes("finance"), true);
    assert.equal(capabilities.toolsets.includes("note"), true);
    assert.equal(capabilities.toolsets.includes("health"), true);
    assert.equal(capabilities.toolsets.includes("growth"), true);
    assert.equal(capabilities.toolsets.includes("moira"), true);
    assert.equal(capabilities.toolsets.includes("music"), true);
    assert.equal(capabilities.toolsets.includes("movie"), true);
    assert.equal(capabilities.toolsets.includes("email"), true);
    assert.equal(capabilities.toolsets.includes("outlook_graph"), true);
    assert.equal(yaml.includes("MUSIC_SQLITE_PATH: /mnt/c/ProgramData/HermesMobile/plugins/music/runtime/music.sqlite"), true);
    assert.equal(yaml.includes("MOVIE_CONFIG_PATH: /mnt/c/ProgramData/HermesMobile/plugins/movie/data/movie-devices.json"), true);
    assert.equal(yaml.includes("MOVIE_METADATA_DB: /mnt/c/ProgramData/HermesMobile/plugins/movie/data/movie-metadata.sqlite"), true);
    assert.match(yaml, /mcp_servers:\n[\s\S]*  movie:\n[\s\S]*    command: npm\n[\s\S]*    args:\n[\s\S]*      - --prefix\n[\s\S]*      - \/mnt\/c\/ProgramData\/HermesMobile\/gateway-worker\/movie-mcp\n[\s\S]*      - --silent\n[\s\S]*      - run\n[\s\S]*      - mcp:stdio/);
    assert.equal(yaml.includes("port: 18760"), true);
  });
}

function testRenderDeepSeekAndGrokConfigYaml() {
  withFixture((root) => {
    const deepseek = readRenderedCapabilities(root, "deepseek", renderGatewayConfigYaml({
      configKind: "profile",
      values: {
        profile: "deepseekgw1",
        port: "18770",
        profile_link: "/profiles/deepseekgw1",
        wardrobe_enabled: "1",
        wardrobe_mcp_path: "/mnt/c/wardrobe.py",
        wardrobe_workspace: "/mnt/c/owner",
      },
    }));
    assert.equal(deepseek.modelDefault, "deepseek-chat");
    assert.equal(deepseek.modelProvider, "deepseek");
    assert.equal(deepseek.mcpServers.includes("wardrobe"), true);

    const grok = readRenderedCapabilities(root, "grok", renderGatewayConfigYaml({
      configKind: "grok",
      values: {
        profile: "grokgw1",
        port: "18761",
        video_plugin_enabled: "1",
      },
    }));
    assert.equal(grok.modelDefault, "grok-4.3");
    assert.equal(grok.modelProvider, "xai-oauth");
    assert.equal(grok.toolsets.includes("video_gen"), true);
    assert.deepEqual(grok.plugins, ["hermes-mobile-video"]);
  });
}

function testRenderMaintenanceConfigYaml() {
  withFixture((root) => {
    const officialYaml = renderGatewayConfigYaml({
      configKind: "maintenance",
      values: {
        profile: "officialclean1",
        port: "18651",
        provider: "openai-codex",
        profile_link: "/profiles/officialclean1",
        moa_config_json: JSON.stringify({
          enabled: true,
          defaultPreset: "default",
          presets: [{
            name: "default",
            referenceModels: ["openai-codex:gpt-5.5"],
            aggregator: { provider: "openai-codex", model: "gpt-5.5" },
            referenceMaxTokens: 600,
          }],
        }),
        weather_plugin_enabled: "1",
        web_plugin_enabled: "1",
        http_plugin_enabled: "1",
        docx_plugin_enabled: "1",
        pptx_plugin_enabled: "1",
        pdf_plugin_enabled: "1",
        audio_plugin_enabled: "1",
        archive_plugin_enabled: "1",
        image_plugin_enabled: "1",
        cronjob_plugin_enabled: "1",
        wardrobe_enabled: "1",
        wardrobe_mcp_path: "/mnt/c/wardrobe.py",
        wardrobe_workspace: "/mnt/c/owner",
        finance_enabled: "1",
        finance_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        finance_mcp_path: "/mnt/c/finance.py",
        finance_workspace: "/mnt/c/owner",
        finance_mcp_api_base_url: "http://127.0.0.1:8791",
        note_enabled: "1",
        note_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        note_mcp_path: "/mnt/c/note.py",
        note_workspace: "/mnt/c/owner",
        note_mcp_api_base_url: "http://127.0.0.1:4181",
        health_enabled: "1",
        health_mcp_command: "node",
        health_mcp_path: "/mnt/c/health.js",
        health_workspace: "/mnt/c/owner",
        health_mcp_api_base_url: "http://172.27.192.1:4877",
        growth_enabled: "1",
        growth_mcp_command: "node",
        growth_mcp_path: "/mnt/c/growth.js",
        growth_workspace: "/mnt/c/owner",
        growth_mcp_api_base_url: "http://127.0.0.1:4881",
        moira_enabled: "1",
        moira_mcp_command: "node",
        moira_mcp_path: "/mnt/c/moira.mjs",
        moira_workspace: "/mnt/c/owner",
        moira_mcp_api_base_url: "http://127.0.0.1:4174",
        music_enabled: "1",
        music_mcp_command: "node",
        music_mcp_path: "/mnt/c/music/src/mcp-stdio.js",
        music_workspace: "/mnt/c/owner",
        music_sqlite_path: "/mnt/c/music/runtime/music.sqlite",
        movie_enabled: "1",
        movie_mcp_command: "npm",
        movie_mcp_root: "/mnt/c/movie",
        movie_config_path: "/mnt/c/movie/data/movie-devices.json",
        movie_metadata_db: "/mnt/c/movie/data/movie-metadata.sqlite",
        movie_playback_state_file: "/mnt/c/movie/data/playback-state.json",
        email_enabled: "1",
        email_mcp_python: "/opt/hermes-gateway-runtime/venv/bin/python",
        email_mcp_path: "/mnt/c/email.py",
        email_workspace: "/mnt/c/owner",
        email_mcp_api_base_url: "http://172.27.192.1:5175",
      },
    });
    const official = readRenderedCapabilities(root, "officialclean", officialYaml);
    assert.equal(official.modelProvider, "openai-codex");
    assert.match(officialYaml, /moa:\n  default_preset: "default"\n  presets:\n    default:/);
    assert.match(officialYaml, /reference_max_tokens: 600/);
    for (const toolset of ["web", "file", "skills", "wardrobe", "finance", "note", "health", "growth", "moira", "music", "movie", "email", "weather", "http", "cronjob_mobile", "chatgpt_pro", "hermes-cli"]) {
      assert.equal(official.toolsets.includes(toolset), true, `missing maintenance toolset ${toolset}`);
      assert.equal(official.apiServerToolsets.includes(toolset), true, `missing maintenance api toolset ${toolset}`);
    }
    assert.deepEqual(official.mcpServers, ["email", "finance", "growth", "health", "moira", "movie", "music", "note", "wardrobe"]);
    assert.equal(official.plugins.includes("hermes-mobile-chatgpt-pro"), true);
    assert.equal(official.plugins.includes("hermes-mobile-web"), true);
    assert.equal(official.plugins.includes("hermes-mobile-pdf"), true);
    assert.equal(official.plugins.includes("hermes-mobile-pptx"), true);

    const deepseekMaintenance = readRenderedCapabilities(root, "deepseekmaint", renderGatewayConfigYaml({
      configKind: "maintenance",
      values: {
        profile: "deepseekmaint1",
        port: "18653",
      },
    }));
    assert.equal(deepseekMaintenance.modelDefault, "deepseek-chat");
    assert.equal(deepseekMaintenance.modelProvider, "deepseek");
    assert.equal(deepseekMaintenance.toolsets.includes("skills"), true);
    assert.equal(deepseekMaintenance.toolsets.includes("chatgpt_pro"), true);
  });
}

testSelectedProfileExpandsToTemplatePeers();
testProviderAndTierStaySeparate();
testDriftIsReportedWithoutRawConfig();
testRenderProfileConfigYaml();
testRenderDeepSeekAndGrokConfigYaml();
testRenderMaintenanceConfigYaml();

console.log("gateway profile template builder tests passed");
