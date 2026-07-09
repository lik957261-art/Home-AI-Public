"use strict";

const fs = require("node:fs");

const { officialMoaConfig } = require("../adapters/runtime-config-moa-service");
const {
  capabilityFingerprint,
  configPathForWorker,
  readCapabilities,
  templateKeyForWorker,
} = require("./verify-gateway-profile-template-sync");

function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\s]+/).map(cleanString).filter(Boolean);
  return [];
}

function dedupe(values = []) {
  const out = [];
  for (const item of cleanList(values)) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function profileName(worker = {}) {
  return cleanString(worker.profile || worker.name);
}

function profileSetFromOptions(options = {}) {
  return new Set(dedupe([
    ...cleanList(options.profile),
    ...cleanList(options.profiles),
  ]));
}

function sortedCopy(values = []) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function boolValue(value) {
  const text = cleanString(value).toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function valueMapValue(values = {}, name, fallback = "") {
  return cleanString(values[name] ?? fallback);
}

const STANDARD_TOOLSETS = [
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
  "current_environment",
  "cronjob_mobile",
];

const GROK_TOOLSETS = [
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "video_gen",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
  "current_environment",
  "cronjob_mobile",
];

function standardPluginNames(values = {}) {
  const out = [];
  if (boolValue(values.weather_plugin_enabled)) out.push("hermes-mobile-weather");
  if (boolValue(values.web_plugin_enabled)) out.push("hermes-mobile-web");
  if (boolValue(values.http_plugin_enabled)) out.push("hermes-mobile-http");
  if (boolValue(values.current_environment_plugin_enabled)) out.push("hermes-mobile-current-environment");
  if (boolValue(values.docx_plugin_enabled)) out.push("hermes-mobile-docx");
  if (boolValue(values.pptx_plugin_enabled)) out.push("hermes-mobile-pptx");
  if (boolValue(values.pdf_plugin_enabled)) out.push("hermes-mobile-pdf");
  if (boolValue(values.audio_plugin_enabled)) out.push("hermes-mobile-audio");
  if (boolValue(values.archive_plugin_enabled)) out.push("hermes-mobile-archive");
  if (boolValue(values.image_plugin_enabled)) out.push("hermes-mobile-image");
  if (boolValue(values.cronjob_plugin_enabled)) out.push("hermes-mobile-cronjob");
  return out;
}

function appendYamlList(lines, items, indent = 2) {
  const prefix = " ".repeat(indent);
  for (const item of items.filter(Boolean)) lines.push(`${prefix}- ${item}`);
}

function appendYamlScalar(lines, key, value, indent = 2) {
  const prefix = " ".repeat(indent);
  lines.push(`${prefix}${key}: ${JSON.stringify(value)}`);
}

function appendMoaBlock(lines, values = {}) {
  const raw = valueMapValue(values, "moa_config_json");
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error("invalid_moa_config_json");
  }
  const config = officialMoaConfig(parsed);
  if (!config.enabled || !Object.keys(config.presets || {}).length) return;
  lines.push("moa:");
  appendYamlScalar(lines, "default_preset", config.default_preset, 2);
  if (config.active_preset) appendYamlScalar(lines, "active_preset", config.active_preset, 2);
  lines.push("  presets:");
  for (const [name, preset] of Object.entries(config.presets)) {
    lines.push(`    ${name}:`);
    lines.push("      reference_models:");
    for (const model of preset.reference_models || []) {
      lines.push("        -");
      appendYamlScalar(lines, "provider", model.provider, 10);
      appendYamlScalar(lines, "model", model.model, 10);
    }
    lines.push("      aggregator:");
    appendYamlScalar(lines, "provider", preset.aggregator.provider, 8);
    appendYamlScalar(lines, "model", preset.aggregator.model, 8);
    for (const [key, value] of Object.entries(preset)) {
      if (["reference_models", "aggregator"].includes(key)) continue;
      lines.push(`      ${key}: ${typeof value === "boolean" ? String(value) : value}`);
    }
  }
}

function appendPluginBlock(lines, pluginNames) {
  lines.push("plugins:");
  if (!pluginNames.length) {
    lines.push("  enabled: []");
    return;
  }
  lines.push("  enabled:");
  appendYamlList(lines, pluginNames, 4);
}

function appendStandardBase(lines, toolsets, apiToolsets, pluginNames) {
  lines.push("toolsets:");
  appendYamlList(lines, toolsets, 2);
  lines.push("platform_toolsets:");
  lines.push("  api_server:");
  appendYamlList(lines, apiToolsets, 4);
  lines.push("agent:");
  lines.push("  max_turns: 60");
  lines.push("  reasoning_effort: medium");
  appendPluginBlock(lines, pluginNames);
}

function standardExtraToolsets(values = {}) {
  const extras = [];
  if (boolValue(values.weather_plugin_enabled)) extras.push("weather");
  if (boolValue(values.http_plugin_enabled)) extras.push("http");
  if (boolValue(values.current_environment_plugin_enabled)) extras.push("current_environment");
  if (boolValue(values.cronjob_plugin_enabled)) extras.push("cronjob_mobile");
  return extras;
}

function appendRuntimeSections(lines, port) {
  lines.push("terminal:");
  lines.push("  backend: local");
  lines.push("  cwd: .");
  lines.push("  timeout: 180");
  lines.push("platforms:");
  lines.push("  api_server:");
  lines.push("    enabled: true");
  lines.push("    extra:");
  lines.push("      host: 127.0.0.1");
  lines.push(`      port: ${port}`);
}

function appendWorkerPoolSections(lines) {
  lines.push("worker_pool:");
  lines.push("  enabled: false");
  lines.push("cron:");
  lines.push("  enabled: false");
}

function appendMcpServers(lines, servers) {
  if (!servers.length) return;
  lines.push("mcp_servers:");
  for (const server of servers) {
    lines.push(`  ${server.name}:`);
    lines.push(`    command: ${server.command}`);
    if (server.args?.length) {
      lines.push("    args:");
      appendYamlList(lines, server.args, 6);
    }
    if (server.env && Object.keys(server.env).length) {
      lines.push("    env:");
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`      ${key}: ${value}`);
      }
    }
    for (const [key, value] of Object.entries(server.extra || {})) {
      lines.push(`    ${key}: ${value}`);
    }
  }
}

function mcpServersForProfile(values = {}) {
  const profile = valueMapValue(values, "profile");
  const profileLink = valueMapValue(values, "profile_link");
  const servers = [];
  if (boolValue(values.wardrobe_enabled)) {
    servers.push({
      name: "wardrobe",
      command: valueMapValue(values, "wardrobe_mcp_python", "/opt/hermes-gateway-runtime/venv/bin/python"),
      args: [
        valueMapValue(values, "wardrobe_mcp_path"),
        "--workspace",
        valueMapValue(values, "wardrobe_workspace"),
        "--no-workspace-override",
      ],
      env: {
        HERMES_HOME: profileLink,
        PYTHONPATH: "/opt/hermes-gateway-runtime/official-clean",
      },
      extra: {
        enabled: "true",
        timeout: "180",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.finance_enabled)) {
    servers.push({
      name: "finance",
      command: valueMapValue(values, "finance_mcp_python"),
      args: [
        valueMapValue(values, "finance_mcp_path"),
        "--workspace",
        valueMapValue(values, "finance_workspace"),
        "--no-workspace-override",
        "--api-base-url",
        valueMapValue(values, "finance_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
      },
      extra: {
        enabled: "true",
        timeout: "180",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.note_enabled)) {
    servers.push({
      name: "note",
      command: valueMapValue(values, "note_mcp_python"),
      args: [
        valueMapValue(values, "note_mcp_path"),
        "--workspace",
        valueMapValue(values, "note_workspace"),
        "--no-workspace-override",
        "--api-base-url",
        valueMapValue(values, "note_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.health_enabled)) {
    servers.push({
      name: "health",
      command: valueMapValue(values, "health_mcp_command", "node"),
      args: [
        valueMapValue(values, "health_mcp_path"),
        "--workspace",
        valueMapValue(values, "health_workspace"),
        "--no-workspace-override",
        "--gateway-tool-names",
        "--api-base-url",
        valueMapValue(values, "health_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.growth_enabled)) {
    servers.push({
      name: "growth",
      command: valueMapValue(values, "growth_mcp_command", "node"),
      args: [
        valueMapValue(values, "growth_mcp_path"),
        "--workspace",
        valueMapValue(values, "growth_workspace"),
        "--no-workspace-override",
        "--api-base-url",
        valueMapValue(values, "growth_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.moira_enabled)) {
    servers.push({
      name: "moira",
      command: valueMapValue(values, "moira_mcp_command", "node"),
      args: [
        valueMapValue(values, "moira_mcp_path"),
        "--workspace",
        valueMapValue(values, "moira_workspace"),
        "--no-workspace-override",
        "--api-base-url",
        valueMapValue(values, "moira_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.music_enabled)) {
    servers.push({
      name: "music",
      command: valueMapValue(values, "music_mcp_command", "node"),
      args: [
        valueMapValue(values, "music_mcp_path"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
        MUSIC_SQLITE_PATH: valueMapValue(values, "music_sqlite_path"),
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.movie_enabled)) {
    servers.push({
      name: "movie",
      command: valueMapValue(values, "movie_mcp_command", "npm"),
      args: [
        "--prefix",
        valueMapValue(values, "movie_mcp_root"),
        "--silent",
        "run",
        "mcp:stdio",
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
        MOVIE_CONFIG_PATH: valueMapValue(values, "movie_config_path"),
        MOVIE_METADATA_DB: valueMapValue(values, "movie_metadata_db"),
        MOVIE_PLAYBACK_STATE_FILE: valueMapValue(values, "movie_playback_state_file"),
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.email_enabled)) {
    servers.push({
      name: "email",
      command: valueMapValue(values, "email_mcp_python", "/opt/hermes-gateway-runtime/venv/bin/python"),
      args: [
        valueMapValue(values, "email_mcp_path"),
        "--workspace",
        valueMapValue(values, "email_workspace"),
        "--no-workspace-override",
        "--api-base-url",
        valueMapValue(values, "email_mcp_api_base_url"),
      ],
      env: {
        HERMES_HOME: profileLink,
        HERMES_PROFILE: profile,
      },
      extra: {
        startup_timeout: "60",
        connect_timeout: "60",
      },
    });
  }
  if (boolValue(values.outlook_graph_enabled)) {
    servers.push({
      name: "outlook_graph",
      command: "/opt/hermes-gateway-runtime/venv/bin/python",
      args: [
        valueMapValue(values, "outlook_graph_mcp_path"),
      ],
      env: {
        HERMES_HOME: profileLink,
        PYTHONPATH: "/opt/hermes-gateway-runtime/official-clean",
      },
      extra: {
        enabled: "true",
        timeout: "180",
        connect_timeout: "60",
      },
    });
  }
  return servers;
}

function renderBaseConfigYaml(values = {}) {
  const lines = [
    "model:",
    "  default: gpt-5.5",
    "  provider: openai-codex",
    "  base_url: https://chatgpt.com/backend-api/codex",
  ];
  const extras = standardExtraToolsets(values);
  appendStandardBase(lines, [...STANDARD_TOOLSETS, ...extras], [...STANDARD_TOOLSETS, ...extras], standardPluginNames(values));
  return `${lines.join("\n")}\n`;
}

function renderProfileConfigYaml(values = {}) {
  const profile = valueMapValue(values, "profile");
  const port = valueMapValue(values, "port");
  const provider = valueMapValue(values, "provider").toLowerCase();
  const isDeepSeek = provider === "deepseek" || /^deepseekgw\d+$/i.test(profile) || /^hm-[a-z0-9-]+-deepseek-\d+$/i.test(profile);
  const lines = [
    "model:",
    `  default: ${isDeepSeek ? "deepseek-chat" : "gpt-5.5"}`,
    `  provider: ${isDeepSeek ? "deepseek" : "openai-codex"}`,
  ];
  if (!isDeepSeek) lines.push("  base_url: https://chatgpt.com/backend-api/codex");
  appendMoaBlock(lines, values);
  const extras = standardExtraToolsets(values);
  if (boolValue(values.wardrobe_enabled)) extras.push("wardrobe");
  if (boolValue(values.finance_enabled)) extras.push("finance");
  if (boolValue(values.note_enabled)) extras.push("note");
  if (boolValue(values.health_enabled)) extras.push("health");
  if (boolValue(values.growth_enabled)) extras.push("growth");
  if (boolValue(values.moira_enabled)) extras.push("moira");
  if (boolValue(values.music_enabled)) extras.push("music");
  if (boolValue(values.movie_enabled)) extras.push("movie");
  if (boolValue(values.email_enabled)) extras.push("email");
  if (boolValue(values.outlook_graph_enabled)) extras.push("outlook_graph");
  appendStandardBase(lines, [...STANDARD_TOOLSETS, ...extras], [...STANDARD_TOOLSETS, ...extras], standardPluginNames(values));
  appendRuntimeSections(lines, port);
  appendWorkerPoolSections(lines);
  appendMcpServers(lines, mcpServersForProfile(values));
  return `${lines.join("\n")}\n`;
}

function renderGrokConfigYaml(values = {}) {
  const port = valueMapValue(values, "port");
  const lines = [
    "model:",
    "  default: grok-4.3",
    "  provider: xai-oauth",
  ];
  appendStandardBase(lines, GROK_TOOLSETS, GROK_TOOLSETS, boolValue(values.video_plugin_enabled) ? ["hermes-mobile-video"] : []);
  lines.push("video_gen:");
  lines.push("  provider: hermes-mobile-xai");
  lines.push("  model: grok-imagine-video");
  appendRuntimeSections(lines, port);
  appendWorkerPoolSections(lines);
  return `${lines.join("\n")}\n`;
}

function renderMaintenanceConfigYaml(values = {}) {
  const profile = valueMapValue(values, "profile");
  const port = valueMapValue(values, "port");
  const provider = valueMapValue(values, "provider").toLowerCase();
  const isDeepSeek = provider === "deepseek" || /^deepseekmaint\d+$/i.test(profile);
  const lines = [
    "model:",
    `  default: ${isDeepSeek ? "deepseek-chat" : "gpt-5.5"}`,
    `  provider: ${isDeepSeek ? "deepseek" : "openai-codex"}`,
  ];
  if (!isDeepSeek) lines.push("  base_url: https://chatgpt.com/backend-api/codex");
  appendMoaBlock(lines, values);
  const extras = standardExtraToolsets(values);
  if (boolValue(values.wardrobe_enabled)) extras.push("wardrobe");
  if (boolValue(values.finance_enabled)) extras.push("finance");
  if (boolValue(values.note_enabled)) extras.push("note");
  if (boolValue(values.health_enabled)) extras.push("health");
  if (boolValue(values.growth_enabled)) extras.push("growth");
  if (boolValue(values.moira_enabled)) extras.push("moira");
  if (boolValue(values.music_enabled)) extras.push("music");
  if (boolValue(values.movie_enabled)) extras.push("movie");
  if (boolValue(values.email_enabled)) extras.push("email");
  if (boolValue(values.outlook_graph_enabled)) extras.push("outlook_graph");
  const toolsets = [
    ...STANDARD_TOOLSETS,
    ...extras,
    "chatgpt_pro",
    "hermes-cli",
  ];
  appendStandardBase(lines, toolsets, toolsets, dedupe([
    ...standardPluginNames(values),
    "hermes-mobile-chatgpt-pro",
  ]));
  appendRuntimeSections(lines, port);
  appendWorkerPoolSections(lines);
  appendMcpServers(lines, mcpServersForProfile(values));
  return `${lines.join("\n")}\n`;
}

function renderGatewayConfigYaml(options = {}) {
  const kind = cleanString(options.configKind || options.values?.config_kind || "profile").toLowerCase();
  if (kind === "base") return renderBaseConfigYaml(options.values || {});
  if (kind === "grok") return renderGrokConfigYaml(options.values || {});
  if (kind === "maintenance") return renderMaintenanceConfigYaml(options.values || {});
  if (kind === "profile") return renderProfileConfigYaml(options.values || {});
  throw new Error(`unsupported_config_kind:${kind}`);
}

function publicCapabilitiesForRecord(record) {
  if (!record.capabilities) return null;
  return {
    modelDefault: record.capabilities.modelDefault,
    modelProvider: record.capabilities.modelProvider,
    toolsets: sortedCopy(record.capabilities.toolsets || []),
    apiServerToolsets: sortedCopy(record.capabilities.apiServerToolsets || []),
    mcpServers: sortedCopy(record.capabilities.mcpServers || []),
    plugins: sortedCopy(record.capabilities.plugins || []),
  };
}

function buildWorkerRecords(manifest, profilesRoot = "") {
  const records = [];
  const issues = [];
  for (const worker of manifest.workers || []) {
    if (!worker || worker.enabled === false) continue;
    const profile = profileName(worker);
    if (!profile) continue;
    const configPath = configPathForWorker(worker, profilesRoot);
    let capabilities = null;
    let hash = "";
    let readError = "";
    if (configPath && fs.existsSync(configPath)) {
      try {
        capabilities = readCapabilities(configPath);
        hash = capabilityFingerprint(capabilities).hash;
      } catch (err) {
        readError = cleanString(err?.message || err).slice(0, 160);
        issues.push({ code: "profile_config_unreadable", profile, message: readError });
      }
    }
    records.push({
      profile,
      worker,
      configPath,
      configExists: Boolean(configPath && fs.existsSync(configPath)),
      capabilities,
      hash,
      readError,
      templateKey: templateKeyForWorker(worker, capabilities || {}),
    });
  }
  return { records, issues };
}

function groupRecords(records = []) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.templateKey)) groups.set(record.templateKey, []);
    groups.get(record.templateKey).push(record);
  }
  return groups;
}

function selectedTemplateKeys(groups, selectedProfiles, requestedTemplateKeys) {
  const out = new Set();
  for (const key of requestedTemplateKeys) {
    if (groups.has(key)) out.add(key);
  }
  if (selectedProfiles.size) {
    for (const [templateKey, records] of groups) {
      if (records.some((record) => selectedProfiles.has(record.profile))) out.add(templateKey);
    }
  }
  if (!selectedProfiles.size && !requestedTemplateKeys.size) {
    for (const key of groups.keys()) out.add(key);
  }
  return out;
}

function buildTemplateFromRecords(templateKey, records, selectedProfiles, options = {}) {
  const configuredRecords = records.filter((record) => record.capabilities && record.hash);
  const hashes = sortedCopy(dedupe(configuredRecords.map((record) => record.hash)));
  const issues = [];
  if (options.requireConfig) {
    for (const record of records) {
      if (!record.configExists) {
        issues.push({
          code: "profile_config_missing",
          profile: record.profile,
          templateKey,
          configPath: record.configPath || "",
        });
      }
    }
  }
  if (hashes.length > 1) {
    issues.push({
      code: "profile_template_drift",
      templateKey,
      profiles: configuredRecords.map((record) => ({
        profile: record.profile,
        hash: record.hash,
        toolsets: sortedCopy(record.capabilities.toolsets || []),
        apiServerToolsets: sortedCopy(record.capabilities.apiServerToolsets || []),
        mcpServers: sortedCopy(record.capabilities.mcpServers || []),
        plugins: sortedCopy(record.capabilities.plugins || []),
      })).sort((a, b) => a.profile.localeCompare(b.profile)),
    });
  }
  const canonicalRecord = configuredRecords.find((record) => record.hash === hashes[0]) || null;
  const profiles = records.map((record) => record.profile);
  return {
    templateKey,
    profiles,
    configureProfiles: profiles,
    requestedProfiles: profiles.filter((profile) => selectedProfiles.has(profile)),
    capabilityHash: hashes.length === 1 ? hashes[0] : "",
    capabilityHashes: hashes,
    capabilities: hashes.length === 1 ? publicCapabilitiesForRecord(canonicalRecord) : null,
    configProfiles: configuredRecords.map((record) => record.profile),
    missingConfigProfiles: records.filter((record) => !record.configExists).map((record) => record.profile),
    issues,
  };
}

function buildGatewayProfileTemplates(options = {}) {
  const manifest = options.manifest || loadManifest(options.manifestPath);
  const profilesRoot = cleanString(options.profilesRoot);
  const selectedProfiles = profileSetFromOptions(options);
  const requestedTemplateKeys = new Set(cleanList(options.templateKey || options.templateKeys));
  const { records, issues } = buildWorkerRecords(manifest, profilesRoot);
  const groups = groupRecords(records);
  const templateKeys = selectedTemplateKeys(groups, selectedProfiles, requestedTemplateKeys);

  for (const profile of selectedProfiles) {
    if (!records.some((record) => record.profile === profile)) {
      issues.push({ code: "selected_profile_not_found", profile });
    }
  }
  for (const templateKey of requestedTemplateKeys) {
    if (!groups.has(templateKey)) {
      issues.push({ code: "template_key_not_found", templateKey });
    }
  }

  const templates = [];
  for (const templateKey of templateKeys) {
    const template = buildTemplateFromRecords(templateKey, groups.get(templateKey) || [], selectedProfiles, options);
    templates.push(template);
    issues.push(...template.issues);
  }

  const configureProfiles = dedupe(templates.flatMap((template) => template.configureProfiles));
  return {
    ok: issues.length === 0,
    checkedTemplates: templates.length,
    checkedProfiles: templates.reduce((sum, template) => sum + template.profiles.length, 0),
    selectedProfiles: Array.from(selectedProfiles),
    selectedTemplateKeys: Array.from(templateKeys),
    configureProfiles,
    templates: templates.sort((a, b) => a.templateKey.localeCompare(b.templateKey)),
    issues,
  };
}

function templatePeersForSelection(manifest, profiles, options = {}) {
  const result = buildGatewayProfileTemplates({
    ...options,
    manifest,
    profiles,
  });
  return result.configureProfiles.length ? result.configureProfiles : cleanList(profiles);
}

function parseArgs(argv = []) {
  const out = {
    manifestPath: process.env.HERMES_GATEWAY_POOL_MANIFEST_PATH || "C:/ProgramData/HermesMobile/data/gateway-pool-manifest.json",
    profilesRoot: process.env.HERMES_GATEWAY_PROFILES_ROOT || "C:/ProgramData/HermesMobile/gateway-worker/telemetry/profiles",
    profile: "",
    profiles: "",
    templateKey: "",
    requireConfig: false,
    json: false,
    printConfigureProfiles: false,
    renderConfigYaml: false,
    configKind: "profile",
    values: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") out.manifestPath = argv[++index] || out.manifestPath;
    else if (arg === "--profiles-root") out.profilesRoot = argv[++index] || out.profilesRoot;
    else if (arg === "--profile") out.profile = argv[++index] || "";
    else if (arg === "--profiles") out.profiles = argv[++index] || "";
    else if (arg === "--template-key") out.templateKey = argv[++index] || "";
    else if (arg === "--require-config") out.requireConfig = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--print-configure-profiles") out.printConfigureProfiles = true;
    else if (arg === "--render-config-yaml") out.renderConfigYaml = true;
    else if (arg === "--config-kind") out.configKind = argv[++index] || out.configKind;
    else if (arg === "--value") {
      const raw = argv[++index] || "";
      const separator = raw.indexOf("=");
      if (separator > 0) out.values[raw.slice(0, separator)] = raw.slice(separator + 1);
    }
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/build-gateway-profile-template.js [options]",
        "  --manifest <path>                 Gateway pool manifest path",
        "  --profiles-root <path>            Directory containing <profile>/config.yaml",
        "  --profile <name>                  Select one profile",
        "  --profiles <csv>                  Select one or more profiles",
        "  --template-key <key>              Select one template key",
        "  --require-config                  Treat missing selected template configs as failures",
        "  --json                            Print JSON result",
        "  --print-configure-profiles        Print selected template peer profiles as CSV",
        "  --render-config-yaml              Render a config.yaml body from canonical template rules",
        "  --config-kind <base|profile|grok|maintenance> Config type for --render-config-yaml",
        "  --value <key=value>               Template render value; repeat as needed",
      ].join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function printHuman(result) {
  if (result.ok) {
    console.log(`Gateway profile templates built (${result.checkedProfiles} profiles, ${result.checkedTemplates} templates).`);
  } else {
    console.error(`Gateway profile template build failed (${result.issues.length} issue(s)).`);
  }
  for (const template of result.templates) {
    const hash = template.capabilityHash || template.capabilityHashes.join(",");
    console.log(`- ${template.templateKey}: profiles=${template.profiles.join(",")} hash=${hash || "none"}`);
  }
  for (const issue of result.issues) {
    console.error(`  issue=${issue.code} target=${issue.profile || issue.templateKey || ""}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.renderConfigYaml) {
    process.stdout.write(renderGatewayConfigYaml(options));
    return;
  }
  const result = buildGatewayProfileTemplates(options);
  if (options.printConfigureProfiles) {
    console.log((result.configureProfiles.length ? result.configureProfiles : cleanList(options.profiles || options.profile)).join(","));
    return;
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (!result.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  buildGatewayProfileTemplates,
  renderGatewayConfigYaml,
  templatePeersForSelection,
};
