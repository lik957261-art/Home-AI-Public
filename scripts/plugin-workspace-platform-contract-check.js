"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CONTRACT_VERSION = "20260708-v8";
const LEGACY_CONTRACT_VERSIONS = ["20260707-v7", "20260626-v6", "20260623-v5", "20260618-v4"];
const SUPPORTED_CONTRACT_VERSIONS = [CONTRACT_VERSION, ...LEGACY_CONTRACT_VERSIONS];
const DEFAULT_MAC_PRODUCTION_ROOT = process.env.HOMEAI_MAC_PRODUCTION_ROOT || "/Users/example/path";
const DEFAULT_MAC_SSH_ALIAS = "homeai-mac";

const REQUIRED_CENTRAL_DOCS = [
  "plugin-workspace-platform-contract.md",
  "plugin-mobile-ui-visual-contract.md",
  "macos-production-access.md",
  "mcp-tool-upgrade-closure.md",
  "macos-ios-simulator-appium.md",
  "ai-operations-control-plane.md",
  "reference-memory-graph-v1.md",
  "reference-memory-graph-harness-plan.md",
];

const REQUIRED_CURRENT_CENTRAL_DOCS = [
  "autonomous-delivery-loop-contract.md",
  "worker-pool-lifecycle-contract.md",
];

const REQUIRED_FALLBACK_GOVERNANCE_DOCS = [
  "root-cause-architecture-contract.md",
  "fallback-governance-contract.md",
  "fallback-registry.md",
];

const REQUIRED_POINTER_TEXT = [
  "`plugin_id`",
  "`workspace_path_windows`",
  "`production_source_path_macos`",
  "`production_data_root_macos`",
  "`windows_dev_base_url`",
  "`macos_production_base_url`",
  "`launchd_label`",
  "`manifest_url`",
  "`mcp_command`",
  "`mcp_schema_endpoint`",
  "`dev_runtime_prerequisites`",
  "`deploy_command`",
  "`reference_contract_status`",
  "`mobile_visual_harness_status`",
  "`ai_ops_control_plane_command`",
  "`ai_ops_required_flow`",
  "`ai_ops_evidence_ledger`",
  "`plugin_main_preflight_command`",
  "`plugin_worker_dispatch_policy`",
  "`plugin_worker_pool_lifecycle_policy`",
  "`ios_live_debug_available`",
  "`ios_visual_harness_command`",
  "`plugin_manifest_actions_status`",
  "Do not record raw",
];

const REQUIRED_NATIVE_POINTER_TEXT = [
  "`client_id`",
  "`repository_path_macos`",
  "`xcode_project`",
  "`main_bundle_id`",
  "`share_extension_bundle_id`",
  "`app_group`",
  "`home_ai_origin_policy`",
  "`auth_transport`",
  "`default_workspace_id`",
  "`native_shell_query`",
  "`native_capabilities`",
  "`platform_management_status`",
  "`ai_ops_control_plane_command`",
  "`ai_ops_required_flow`",
  "`ai_ops_evidence_ledger`",
  "`local_validation_command`",
  "Do not record raw",
];

const RUNTIME_URL_FIELDS = [
  "windows_dev_base_url",
  "macos_production_base_url",
  "manifest_url",
];

const NATIVE_IOS_WORKSPACE_OVERRIDE = process.env.HOMEAI_NATIVE_IOS_WORKSPACE || "";

const FORBIDDEN_PLUGIN_RUNTIME_DOMAINS = [
  /hermes-xuxin\.synology\.me/i,
  /wardrobe-xuxin\.synology\.me/i,
  /tail62e8ce\.ts\.net/i,
];

const PLUGINS = [
  {
    id: "finance",
    title: "Finance",
    dirName: "\u8d22\u52a1",
    port: 8791,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.finance",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [
      { name: "client_version", path: "/api/finance/client-version", requireText: ["ok"] },
      {
        name: "mcp_schema",
        path: "/api/finance/mcp/schemas",
        requireText: ["finance.create_transaction"],
        authMayBeRequired: true,
      },
    ],
  },
  {
    id: "wardrobe",
    title: "Wardrobe",
    dirName: "\u7537\u88c5\u8863\u6a71",
    port: 8765,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.wardrobe",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["python"],
    optionalHttpProbes: [],
  },
  {
    id: "note",
    title: "Note",
    dirName: "Note",
    port: 4181,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.note",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["python"],
    optionalHttpProbes: [],
  },
  {
    id: "email",
    title: "Email",
    dirName: "email",
    port: 5175,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.email",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [],
  },
  {
    id: "health",
    title: "Health",
    dirName: "healthy",
    port: 4877,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.health",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [],
  },
  {
    id: "growth",
    title: "Growth",
    dirName: "growth",
    port: 4881,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.growth",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [
      { name: "mcp_schema", path: "/api/v1/growth/mcp/schemas", requireText: ["growth.get_status", "growth.get_board"] },
    ],
  },
  {
    id: "moira",
    title: "Moira",
    dirName: "moira",
    port: 4174,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.moira",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [
      { name: "client_version", path: "/api/moira/client-version", requireText: ["moira"] },
    ],
  },
  {
    id: "music",
    title: "Music",
    dirName: "Music",
    port: 4891,
    commonPaths: ["/Users/example/path"],
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.music",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm", "vite"],
    optionalHttpProbes: [
      { name: "mcp_schema", path: "/api/v1/music/mcp/schemas", requireText: ["music.roon_listening_summary", "music.get_favorites"] },
      { name: "roon_status", path: "/api/v1/music/roon/status", requireText: ["history_backfill_supported"] },
    ],
  },
  {
    id: "movie",
    title: "Movie",
    dirName: "Movie",
    port: 4195,
    pointerMode: "movie_owner_only",
    commonPaths: ["/Users/example/path"],
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.movie",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm"],
    optionalHttpProbes: [
      { name: "mcp_schema", path: "/api/v1/movie/mcp/schemas", requireText: ["movie"] },
    ],
  },
  {
    id: "codex-mobile",
    title: "Codex Mobile Web",
    dirName: "codex-mobile-web",
    port: 8787,
    macSourcePaths: ["/Users/example/path"],
    launchdLabel: "com.hermesmobile.plugin.codex-mobile",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    devRuntimeKeywords: ["node", "npm", "codex"],
    optionalHttpProbes: [
      { name: "public_config", path: "/api/public-config", requireText: ["Codex Mobile Web", "codex-mobile-shell"] },
    ],
  },
];

const NATIVE_CLIENTS = [
  {
    id: "home-ai-native-ios",
    title: "Home AI Native iOS Shell",
    type: "native_client",
    dirName: path.join("Xcode", "Home AI"),
    commonPaths: NATIVE_IOS_WORKSPACE_OVERRIDE
      ? [NATIVE_IOS_WORKSPACE_OVERRIDE]
      : [
        path.join(os.homedir(), "Xcode", "Home AI"),
        "/Users/example/path AI",
      ],
    xcodeProject: "Home AI.xcodeproj",
    mainBundleId: "com.xuxin.homeai.native",
    shareExtensionBundleId: "com.xuxin.homeai.native.ShareExtension",
    appGroup: "group.com.xuxin.homeai",
    authTransport: "X-Hermes-Web-Key",
    requiredCapabilities: [
      "pwa_webview_shell",
      "apple_health_sync",
      "apns_device_registration",
      "ios_share_extension",
    ],
  },
];

const PLATFORM_TARGETS = [...PLUGINS, ...NATIVE_CLIENTS];

function parseArgs(argv) {
  const out = {
    repoRoot: path.resolve(__dirname, ".."),
    workspaceRoot: "",
    plugins: [],
    probeMac: false,
    requireMacOk: false,
    sshAlias: "",
    sshAliasExplicit: false,
    macProductionRoot: DEFAULT_MAC_PRODUCTION_ROOT,
    timeoutMs: 10_000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") out.repoRoot = path.resolve(argv[++index] || out.repoRoot);
    else if (arg === "--workspace-root") out.workspaceRoot = path.resolve(argv[++index] || "");
    else if (arg === "--plugin") out.plugins.push(...splitCsv(argv[++index] || ""));
    else if (arg === "--target") out.plugins.push(...splitCsv(argv[++index] || ""));
    else if (arg === "--probe-mac") out.probeMac = true;
    else if (arg === "--require-mac-ok") out.requireMacOk = true;
    else if (arg === "--ssh-alias") {
      out.sshAlias = argv[++index] || out.sshAlias;
      out.sshAliasExplicit = true;
    }
    else if (arg === "--timeout-ms") out.timeoutMs = readPositiveInt(argv[++index], out.timeoutMs);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.workspaceRoot) out.workspaceRoot = path.resolve(out.repoRoot, "..");
  return out;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function printHelp() {
  console.log([
    "Usage: node scripts/plugin-workspace-platform-contract-check.js [options]",
    "",
    "Options:",
    "  --plugin <ids>         Comma-separated plugin/native-client ids. Defaults to all managed targets.",
    "  --target <ids>         Alias for --plugin.",
    "  --workspace-root <dir> Parent directory containing plugin workspaces.",
    "  --repo-root <dir>      Home AI repository root.",
    "  --probe-mac            Run read-only Mac source/launchd/HTTP probes through SSH.",
    "  --require-mac-ok       Fail when a read-only Mac probe fails.",
    "  --ssh-alias <alias>    SSH alias for Mac production, or `local` for same-host probes.",
    "                         Default: auto-select `local` when the Mac production root is readable, otherwise homeai-mac.",
    "  --json                 Print bounded JSON.",
  ].join("\n"));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function includesAll(text, needles) {
  return needles.filter((needle) => !String(text || "").includes(needle));
}

function pointerContractVersion(text) {
  const source = String(text || "");
  return SUPPORTED_CONTRACT_VERSIONS.find((version) => (
    source.includes(`Home AI platform contract version: \`${version}\``)
    || source.includes(`Home AI platform contract version: ${version}`)
  )) || "";
}

function requiredCentralDocsForPointer(text) {
  const version = pointerContractVersion(text);
  if (version === CONTRACT_VERSION) {
    return [...REQUIRED_CENTRAL_DOCS, ...REQUIRED_CURRENT_CENTRAL_DOCS, ...REQUIRED_FALLBACK_GOVERNANCE_DOCS];
  }
  return REQUIRED_CENTRAL_DOCS;
}

function requiredPointerTextForPointer(text) {
  const version = pointerContractVersion(text);
  if (version === CONTRACT_VERSION) return REQUIRED_POINTER_TEXT;
  return REQUIRED_POINTER_TEXT.filter((item) => ![
    "`plugin_main_preflight_command`",
    "`plugin_worker_dispatch_policy`",
    "`plugin_worker_pool_lifecycle_policy`",
  ].includes(item));
}

function checkPointerContractVersion(text, result) {
  const version = pointerContractVersion(text);
  if (!version) {
    result.issues.push(`pointer_missing_supported_contract_version:${SUPPORTED_CONTRACT_VERSIONS.join("|")}`);
    return;
  }
  if (version !== CONTRACT_VERSION) {
    result.warnings.push(`pointer_contract_version_legacy:${version}`);
  }
}

function forbiddenSecretMatches(text) {
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{20,}/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    /\bpassword\s*[:=]\s*[^\s`'"]{8,}/i,
    /\b(access[_ -]?key|workspace[_ -]?key|token|cookie)\s*[:=]\s*[A-Za-z0-9._~+/=-]{20,}/i,
  ];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
}

function pointerFieldValue(text, field) {
  const escapedField = String(field || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^\\|\\s*`" + escapedField + "`\\s*\\|\\s*`([^`]+)`\\s*\\|", "m");
  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : "";
}

function pointerFieldText(text, field) {
  const escapedField = String(field || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^\\|\\s*`" + escapedField + "`\\s*\\|\\s*(.*?)\\s*\\|\\s*$", "m");
  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : "";
}

function checkPointerRuntimeUrls(plugin, text) {
  const issues = [];
  const expected = {
    windows_dev_base_url: `http://127.0.0.1:${plugin.port}`,
    macos_production_base_url: `http://127.0.0.1:${plugin.port}`,
    manifest_url: `http://127.0.0.1:${plugin.port}${plugin.manifestPath}`,
  };
  for (const field of RUNTIME_URL_FIELDS) {
    const value = pointerFieldValue(text, field);
    if (!value) continue;
    if (value !== expected[field]) issues.push(`runtime_url_not_loopback:${field}`);
  }
  for (const pattern of FORBIDDEN_PLUGIN_RUNTIME_DOMAINS) {
    if (pattern.test(text)) issues.push(`pointer_forbidden_runtime_domain:${pattern.source}`);
  }
  return issues;
}

function selectedTargets(options) {
  const ids = options.plugins.length ? new Set(options.plugins) : null;
  const selected = PLATFORM_TARGETS.filter((target) => !ids || ids.has(target.id));
  if (ids) {
    const known = new Set(PLATFORM_TARGETS.map((target) => target.id));
    const unknown = [...ids].filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Unknown plugin/native-client id(s): ${unknown.join(", ")}`);
  }
  return selected;
}

function checkAiOpsPointerFields(text, result) {
  const aiOpsCommand = pointerFieldText(text, "ai_ops_control_plane_command");
  if (!/ai-ops-control-plane\.js/.test(aiOpsCommand) || !/\bintake\b/.test(aiOpsCommand) || !/--json/.test(aiOpsCommand)) {
    result.issues.push("ai_ops_control_plane_command_missing");
  }
  const aiOpsFlow = pointerFieldText(text, "ai_ops_required_flow");
  for (const requiredFlowStep of ["intake", "required-checks", "lane allocate", "evidence append", "production smoke", "handoff"]) {
    if (!aiOpsFlow.toLowerCase().includes(requiredFlowStep)) {
      result.issues.push(`ai_ops_required_flow_missing:${requiredFlowStep}`);
    }
  }
  const aiOpsLedger = pointerFieldText(text, "ai_ops_evidence_ledger");
  if (!/\.homeai-qa/.test(aiOpsLedger) || !/\.jsonl/.test(aiOpsLedger)) {
    result.issues.push("ai_ops_evidence_ledger_missing");
  }
}

function checkPluginMainRoutingPointerFields(text, result) {
  const version = pointerContractVersion(text);
  const preflightCommand = pointerFieldText(text, "plugin_main_preflight_command");
  const dispatchPolicy = pointerFieldText(text, "plugin_worker_dispatch_policy");
  const shouldCheck = version === CONTRACT_VERSION || preflightCommand || dispatchPolicy;
  if (!shouldCheck) return;
  if (
    !/main-thread-routing-preflight\.js/.test(preflightCommand)
    || !/--source-thread-role\s+plugin_main/.test(preflightCommand)
    || !/--mode\s+classify/.test(preflightCommand)
  ) {
    result.issues.push("plugin_main_preflight_command_missing");
  }
  const policy = dispatchPolicy.toLowerCase();
  for (const required of ["plugin_worker", "terminal return", "privacy", "conflict"]) {
    if (!policy.includes(required)) {
      result.issues.push(`plugin_worker_dispatch_policy_missing:${required}`);
    }
  }
  if (version === CONTRACT_VERSION && !/(chinese|zh-cn|中文)/i.test(dispatchPolicy)) {
    result.issues.push("plugin_worker_dispatch_policy_missing:chinese_terminal_receipt");
  }
  if (/\b(use|fallback|fall back|route|send|dispatch)\b[\s\S]{0,80}\b(task intake|deploy lane|audit lane|loop lane|current thread|source thread)\b/.test(policy)) {
    result.issues.push("plugin_worker_dispatch_policy_allows_forbidden_fallback");
  }
}

function checkPluginWorkerPoolLifecyclePointerFields(text, result) {
  const version = pointerContractVersion(text);
  const lifecyclePolicy = pointerFieldText(text, "plugin_worker_pool_lifecycle_policy");
  const shouldCheck = version === CONTRACT_VERSION || lifecyclePolicy;
  if (!shouldCheck) return;
  if (!lifecyclePolicy) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:plugin_worker");
    return;
  }
  const policy = lifecyclePolicy.toLowerCase();
  for (const required of [
    "plugin_worker",
    "worker pool",
    "resolve-before-create",
    "stable",
    "available",
    "busy",
    "terminal return",
    "task-title",
    "sprawl",
    "heartbeat",
    "watchdog",
  ]) {
    if (!policy.includes(required)) {
      result.issues.push(`plugin_worker_pool_lifecycle_policy_missing:${required}`);
    }
  }
  if (!/(missing_role_lane|pool_exhausted|no legal lane)/.test(policy)) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:create_reason");
  }
  if (!/(1800000|1\s*800\s*000|30\s*min|30\s*minutes|thirty\s*minutes|30\s*分钟|三十分钟)/.test(policy)) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:watchdog_timeout");
  }
  if (!/batch/.test(policy) || !/(^|\D)8(\D|$)/.test(policy)) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:watchdog_batch_limit");
  }
  if (!/(max(?:imum)?\s+auto[- ]?resume|auto[- ]?resume\s+max|最多\s*1\s*次)/.test(policy) || !/(^|\D)1(\D|$)/.test(policy)) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:watchdog_max_auto_resume");
  }
  if (!/(chinese|zh-cn|中文)/i.test(lifecyclePolicy)) {
    result.issues.push("plugin_worker_pool_lifecycle_policy_missing:chinese_terminal_receipt");
  }
}

function checkPointer(plugin, options) {
  if (plugin.type === "native_client") return checkNativeClientPointer(plugin, options);
  if (plugin.pointerMode === "movie_owner_only") return checkMovieOwnerOnlyPointer(plugin, options);
  const workspacePath = resolvePluginWorkspacePath(plugin, options);
  const pointerPath = path.join(workspacePath, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  const handoffPath = path.join(workspacePath, ".agent-context", "HANDOFF.md");
  const result = {
    plugin: plugin.id,
    workspacePath,
    pointerPath,
    pointerExists: exists(pointerPath),
    handoffPointer: false,
    issues: [],
    warnings: [],
  };
  if (!result.pointerExists) {
    result.issues.push("pointer_missing");
    return result;
  }
  const text = readText(pointerPath);
  checkPointerContractVersion(text, result);
  for (const missing of includesAll(text, requiredPointerTextForPointer(text))) {
    result.issues.push(`pointer_missing_text:${missing}`);
  }
  for (const missing of includesAll(text, requiredCentralDocsForPointer(text))) {
    result.issues.push(`pointer_missing_central_doc:${missing}`);
  }
  if (!text.includes(`| \`plugin_id\` | \`${plugin.id}\` |`)) {
    result.issues.push(`plugin_id_mismatch:${plugin.id}`);
  }
  if (!text.includes(plugin.launchdLabel)) {
    result.issues.push(`launchd_label_missing:${plugin.launchdLabel}`);
  }
  if (!text.includes(`http://127.0.0.1:${plugin.port}`)) {
    result.issues.push(`macos_loopback_missing:${plugin.port}`);
  }
  if (!plugin.macSourcePaths.some((sourcePath) => text.includes(sourcePath))) {
    result.issues.push(`mac_source_path_missing:${plugin.macSourcePaths.join("|")}`);
  }
  const liveDebugField = pointerFieldText(text, "ios_live_debug_available");
  if (!/(^|`|\s)yes(`|\s|;|$)/i.test(liveDebugField)) {
    result.issues.push("ios_live_debug_not_available");
  }
  const visualHarnessCommand = pointerFieldText(text, "ios_visual_harness_command");
  if (!/(npm run ios:pwa:visual|scripts\/ios-pwa-visual-harness\.js)/.test(visualHarnessCommand)) {
    result.issues.push("ios_visual_harness_command_missing");
  }
  checkAiOpsPointerFields(text, result);
  checkPluginMainRoutingPointerFields(text, result);
  checkPluginWorkerPoolLifecyclePointerFields(text, result);
  const runtimePrerequisites = pointerFieldText(text, "dev_runtime_prerequisites").toLowerCase();
  for (const keyword of plugin.devRuntimeKeywords || []) {
    if (!runtimePrerequisites.includes(String(keyword).toLowerCase())) {
      result.issues.push(`dev_runtime_prerequisite_missing:${keyword}`);
    }
  }
  for (const match of forbiddenSecretMatches(text)) {
    result.issues.push(`pointer_secret_pattern:${match}`);
  }
  result.issues.push(...checkPointerRuntimeUrls(plugin, text));
  if (exists(handoffPath)) {
    const handoff = readText(handoffPath);
    result.handoffPointer = handoff.includes("Home AI Platform Contract Pointer") && Boolean(pointerContractVersion(handoff));
  }
  if (!result.handoffPointer) result.warnings.push("handoff_pointer_missing");
  return result;
}

function checkMovieOwnerOnlyPointer(plugin, options) {
  const workspacePath = resolvePluginWorkspacePath(plugin, options);
  const pointerPath = path.join(workspacePath, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  const handoffPath = path.join(workspacePath, ".agent-context", "HANDOFF.md");
  const result = {
    plugin: plugin.id,
    pointerMode: plugin.pointerMode,
    workspacePath,
    pointerPath,
    pointerExists: exists(pointerPath),
    handoffPointer: false,
    issues: [],
    warnings: [],
  };
  if (!result.pointerExists) {
    result.issues.push("pointer_missing");
    return result;
  }
  const text = readText(pointerPath);
  checkPointerContractVersion(text, result);
  for (const needle of [
    "Home AI Platform Contract Pointer",
    "plugin id: `movie`",
    "repository path: `/Users/example/path`",
    `production source path: \`${plugin.macSourcePaths[0]}\``,
    "production data path: `/Users/example/path`",
    `development URL/port: \`http://127.0.0.1:${plugin.port}\``,
    `production URL/port: \`http://127.0.0.1:${plugin.port}\``,
    `service identity: \`${plugin.launchdLabel}\``,
    "MCP toolset/server id: `movie` / `movie`",
    "mcp_movie_search_sources",
    "mcp_movie_list_source_state",
    "Owner",
    "raw secrets",
  ]) {
    if (!text.includes(needle)) result.issues.push(`movie_pointer_missing_text:${needle}`);
  }
  const version = pointerContractVersion(text);
  if (version === CONTRACT_VERSION || /plugin worker pool lifecycle policy/i.test(text)) {
    const lower = text.toLowerCase();
    for (const needle of [
      "plugin worker pool lifecycle policy",
      "plugin_worker",
      "worker pool",
      "resolve-before-create",
      "stable",
      "available",
      "busy",
      "terminal return",
      "chinese",
      "task-title",
      "sprawl",
      "heartbeat",
      "watchdog",
    ]) {
      if (!lower.includes(needle)) result.issues.push(`movie_pointer_missing_text:${needle}`);
    }
    if (!/(missing_role_lane|pool_exhausted|no legal lane)/i.test(text)) {
      result.issues.push("movie_pointer_missing_text:create_reason");
    }
    if (!/(1800000|1\s*800\s*000|30\s*min|30\s*minutes|thirty\s*minutes|30\s*分钟|三十分钟)/i.test(text)) {
      result.issues.push("movie_pointer_missing_text:watchdog_timeout");
    }
  }
  for (const match of forbiddenSecretMatches(text)) {
    result.issues.push(`pointer_secret_pattern:${match}`);
  }
  for (const pattern of FORBIDDEN_PLUGIN_RUNTIME_DOMAINS) {
    if (pattern.test(text)) result.issues.push(`pointer_forbidden_runtime_domain:${pattern.source}`);
  }
  if (exists(handoffPath)) {
    const handoff = readText(handoffPath);
    result.handoffPointer = handoff.includes("Home AI") && /movie/i.test(handoff);
  }
  if (!result.handoffPointer) result.warnings.push("handoff_pointer_missing");
  return result;
}

function checkNativeClientPointer(client, options) {
  const workspacePath = resolveNativeClientWorkspacePath(client, options);
  const pointerPath = path.join(workspacePath, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  const handoffPath = path.join(workspacePath, ".agent-context", "HANDOFF.md");
  const result = {
    plugin: client.id,
    type: client.type,
    workspacePath,
    pointerPath,
    pointerExists: exists(pointerPath),
    handoffPointer: false,
    issues: [],
    warnings: [],
  };
  if (!result.pointerExists) {
    result.issues.push("pointer_missing");
    return result;
  }
  const text = readText(pointerPath);
  checkPointerContractVersion(text, result);
  for (const missing of includesAll(text, REQUIRED_NATIVE_POINTER_TEXT)) {
    result.issues.push(`pointer_missing_text:${missing}`);
  }
  for (const missing of includesAll(text, requiredCentralDocsForPointer(text))) {
    result.issues.push(`pointer_missing_central_doc:${missing}`);
  }
  for (const requiredDoc of ["native-ios-shell.md", "native-notifications.md", "voice-input-plugin.md"]) {
    if (!text.includes(requiredDoc)) result.issues.push(`pointer_missing_central_doc:${requiredDoc}`);
  }
  if (!text.includes(`| \`client_id\` | \`${client.id}\` |`)) {
    result.issues.push(`client_id_mismatch:${client.id}`);
  }
  if (!text.includes(client.xcodeProject)) {
    result.issues.push(`xcode_project_missing:${client.xcodeProject}`);
  }
  if (!text.includes(client.mainBundleId)) {
    result.issues.push(`main_bundle_id_missing:${client.mainBundleId}`);
  }
  if (!text.includes(client.shareExtensionBundleId)) {
    result.issues.push(`share_extension_bundle_id_missing:${client.shareExtensionBundleId}`);
  }
  if (!text.includes(client.appGroup)) {
    result.issues.push(`app_group_missing:${client.appGroup}`);
  }
  const authTransport = pointerFieldText(text, "auth_transport");
  if (!authTransport.includes(client.authTransport)) {
    result.issues.push(`auth_transport_missing:${client.authTransport}`);
  }
  const originPolicy = pointerFieldText(text, "home_ai_origin_policy");
  if (!/HTTPS/i.test(originPolicy) || /http:\/\//i.test(originPolicy)) {
    result.issues.push("home_ai_origin_policy_not_https_only");
  }
  const nativeShellQuery = pointerFieldText(text, "native_shell_query");
  if (!/nativeShell=ios/.test(nativeShellQuery)) {
    result.issues.push("native_shell_query_missing");
  }
  const capabilities = pointerFieldText(text, "native_capabilities").toLowerCase();
  for (const capability of client.requiredCapabilities) {
    if (!capabilities.includes(capability.toLowerCase())) {
      result.issues.push(`native_capability_missing:${capability}`);
    }
  }
  const platformStatus = pointerFieldText(text, "platform_management_status").toLowerCase();
  if (!platformStatus.includes("managed_native_client")) {
    result.issues.push("platform_management_status_missing");
  }
  const validationCommand = pointerFieldText(text, "local_validation_command");
  if (!/xcodebuild/.test(validationCommand) || !validationCommand.includes(client.xcodeProject)) {
    result.issues.push("local_validation_command_missing");
  }
  checkAiOpsPointerFields(text, result);
  for (const match of forbiddenSecretMatches(text)) {
    result.issues.push(`pointer_secret_pattern:${match}`);
  }
  if (exists(handoffPath)) {
    const handoff = readText(handoffPath);
    result.handoffPointer = handoff.includes("Home AI Platform Contract Pointer") && Boolean(pointerContractVersion(handoff));
  }
  if (!result.handoffPointer) result.warnings.push("handoff_pointer_missing");
  return result;
}

function macDevDirName(plugin) {
  if (plugin.id === "health") return "healthy";
  if (plugin.id === "codex-mobile") return "codex-mobile-web";
  return plugin.id;
}

function resolvePluginWorkspacePath(plugin, options) {
  const workspaceScopedCandidates = [
    path.join(options.workspaceRoot, plugin.dirName),
    path.join(options.workspaceRoot, "plugins", macDevDirName(plugin)),
    path.join(options.workspaceRoot, macDevDirName(plugin)),
  ];
  const workspaceScoped = workspaceScopedCandidates.find((candidate) => exists(candidate));
  const defaultWorkspaceRoot = path.resolve(options.repoRoot, "..");
  const realRepoRoot = path.resolve(__dirname, "..");
  const allowCommonPathFallback = (
    path.resolve(options.repoRoot) === realRepoRoot
    && path.resolve(options.workspaceRoot) === defaultWorkspaceRoot
  );
  if (workspaceScoped || !allowCommonPathFallback) {
    return workspaceScoped || workspaceScopedCandidates[0];
  }
  const candidates = [
    ...workspaceScopedCandidates,
    ...(plugin.commonPaths || []),
  ];
  return candidates.find((candidate) => exists(candidate)) || candidates[0];
}

function resolveNativeClientWorkspacePath(client, options) {
  const candidates = [
    path.join(options.workspaceRoot, client.dirName),
    ...client.commonPaths,
  ];
  return candidates.find((candidate) => exists(candidate)) || candidates[0];
}

function checkCentralDocs(options, targets) {
  const statusPath = path.join(options.repoRoot, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md");
  const platformContractPath = path.join(options.repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md");
  const testMatrixPath = path.join(options.repoRoot, "docs", "TEST_MATRIX.md");
  const docsIndexPath = path.join(options.repoRoot, "docs", "DOCS_INDEX.md");
  const nativeShellPath = path.join(options.repoRoot, "docs", "MODULES", "native-ios-shell.md");
  const files = [statusPath, platformContractPath, testMatrixPath, docsIndexPath, nativeShellPath];
  const result = { issues: [], warnings: [], files };
  for (const file of files) {
    if (!exists(file)) {
      result.issues.push(`central_doc_missing:${path.relative(options.repoRoot, file)}`);
    }
  }
  if (result.issues.length) return result;
  const statusText = readText(statusPath);
  const platformText = readText(platformContractPath);
  const matrixText = readText(testMatrixPath);
  const indexText = readText(docsIndexPath);
  const nativeShellText = readText(nativeShellPath);
  for (const plugin of targets.filter((target) => target.type !== "native_client")) {
    if (!statusText.includes(plugin.title) || !statusText.includes("docs/HOME_AI_PLATFORM_CONTRACT.md")) {
      result.issues.push(`status_missing_plugin:${plugin.id}`);
    }
  }
  for (const client of targets.filter((target) => target.type === "native_client")) {
    if (!statusText.includes(client.title) || !platformText.includes(client.id) || !nativeShellText.includes(client.id)) {
      result.issues.push(`status_missing_native_client:${client.id}`);
    }
  }
  if (!/Codex Mobile Web[\s\S]{0,180}Owner-critical special insertion/.test(statusText)) {
    result.issues.push("codex_special_insertion_missing");
  }
  for (const text of [statusText, platformText, matrixText, indexText, nativeShellText]) {
    for (const match of forbiddenSecretMatches(text)) {
      result.issues.push(`central_secret_pattern:${match}`);
    }
  }
  for (const required of [
    "plugin-workspace-platform-contract.md",
    "plugin-mobile-ui-visual-contract.md",
    "autonomous-delivery-loop-contract.md",
    "worker-pool-lifecycle-contract.md",
    "root-cause-architecture-contract.md",
    "fallback-governance-contract.md",
    "fallback-registry.md",
    "plugin-workspace-platform-contract-check.js",
    "plugin-workspace-platform-contract-check.test.js",
    "fallback-governance-check.js",
    "fallback-governance-check.test.js",
    "ios-pwa-visual-harness.js",
    "ios-pwa-visual-harness.test.js",
    "ai-ops-control-plane.js",
    "ai-ops-control-plane-cli.test.js",
    "ai_ops_control_plane_command",
    "ai_ops_required_flow",
    "ai_ops_evidence_ledger",
    "main-thread-routing-preflight.js",
    "plugin_main_preflight_command",
    "plugin_worker_dispatch_policy",
    "plugin_worker_pool_lifecycle_policy",
    "resolve-before-create",
    "Worker pool",
    "sprawl",
    "terminalReturnLanguageZhCn",
    "taskCardHeartbeatRequired",
    "taskCardWatchdogTimeoutMs",
    "taskCardWatchdogBatchLimit",
    "taskCardWatchdogMaxAutoResume",
    "1800000",
    "Chinese receipt",
    "npm run ios:pwa:visual",
    "ios_visual_harness_command",
    "native-ios-shell.md",
    "home-ai-native-ios",
    "managed_native_client",
  ]) {
    const joined = `${statusText}\n${platformText}\n${matrixText}\n${indexText}\n${nativeShellText}`;
    if (!joined.includes(required)) result.issues.push(`central_doc_reference_missing:${required}`);
  }
  return result;
}

function isLocalProbeAlias(alias) {
  return /^(local|localhost|127\.0\.0\.1)$/i.test(String(alias || "").trim());
}

function effectiveMacProbeOptions(options = {}) {
  const explicitAlias = String(options.sshAlias || "").trim();
  const localRoot = String(options.macProductionRoot || DEFAULT_MAC_PRODUCTION_ROOT || "").trim();
  const localRootReadable = Boolean(localRoot && exists(localRoot));
  const sshAlias = explicitAlias || (localRootReadable ? "local" : DEFAULT_MAC_SSH_ALIAS);
  const mode = isLocalProbeAlias(sshAlias) ? "local" : "ssh";
  return Object.assign({}, options, {
    sshAlias,
    macProbe: {
      enabled: options.probeMac === true,
      requireOk: options.requireMacOk === true,
      sshAlias,
      mode,
      defaultSelection: explicitAlias ? "explicit" : (localRootReadable ? "local_root_readable" : "ssh_alias_fallback"),
      localRoot,
      localRootReadable,
    },
  });
}

function sshRun(alias, args, timeoutMs) {
  if (isLocalProbeAlias(alias)) {
    const [command, ...commandArgs] = args;
    const result = spawnSync(command, commandArgs, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return {
      status: result.status,
      ok: result.status === 0,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
      error: result.error ? result.error.message : "",
    };
  }
  const result = spawnSync("ssh", [alias, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status,
    ok: result.status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function macPathProbe(plugin, options) {
  const attempts = plugin.macSourcePaths.map((sourcePath) => {
    const result = sshRun(options.sshAlias, ["/bin/test", "-d", sourcePath], options.timeoutMs);
    return { path: sourcePath, exists: result.ok };
  });
  return {
    ok: attempts.some((attempt) => attempt.exists),
    attempts,
  };
}

function macLaunchdProbe(plugin, options) {
  const result = sshRun(options.sshAlias, ["/bin/launchctl", "print", `system/${plugin.launchdLabel}`], options.timeoutMs);
  return {
    ok: result.ok,
    label: plugin.launchdLabel,
    checked: true,
  };
}

function macHttpProbe(plugin, options, probe) {
  const url = `http://127.0.0.1:${plugin.port}${probe.path}`;
  const marker = "HOMEAI_HTTP_STATUS:";
  const result = sshRun(options.sshAlias, ["/usr/bin/curl", "-sS", "--max-time", "5", "-w", `${marker}%{http_code}`, url], options.timeoutMs);
  const output = result.stdout || "";
  const markerIndex = output.lastIndexOf(marker);
  const body = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
  const httpStatus = markerIndex >= 0 ? Number(output.slice(markerIndex + marker.length).trim()) : 0;
  const authRequired = Boolean(probe.authMayBeRequired && (
    httpStatus === 401 ||
    httpStatus === 403 ||
    (httpStatus === 400 && /workspace|key|auth|credential/i.test(body))
  ));
  const httpOk = result.ok && httpStatus >= 200 && httpStatus < 300;
  const missing = httpOk ? includesAll(body, probe.requireText || []) : [];
  return {
    name: probe.name,
    ok: authRequired || (httpOk && missing.length === 0),
    status: result.status,
    httpStatus,
    authRequired,
    url: `http://127.0.0.1:${plugin.port}${probe.path}`,
    bodyLength: body.length,
    missingText: missing,
  };
}

function macProbe(plugin, options) {
  if (plugin.type === "native_client") {
    return {
      plugin: plugin.id,
      ok: true,
      skipped: true,
      reason: "native client has no Mac production plugin service, launchd label, or loopback manifest",
      sourcePath: { ok: true, skipped: true, attempts: [] },
      launchd: { ok: true, skipped: true, label: "", checked: false },
      http: [],
    };
  }
  if (plugin.macProbeDeferred) {
    return {
      plugin: plugin.id,
      ok: true,
      skipped: true,
      reason: plugin.macProbeDeferredReason || "mac production probe deferred",
      sourcePath: { ok: true, skipped: true, attempts: [] },
      launchd: { ok: true, skipped: true, label: plugin.launchdLabel, checked: false },
      http: [],
    };
  }
  const manifestProbe = {
    name: "manifest",
    path: plugin.manifestPath,
    requireText: [plugin.id],
  };
  const probes = [manifestProbe, ...plugin.optionalHttpProbes].map((probe) => macHttpProbe(plugin, options, probe));
  const pathResult = macPathProbe(plugin, options);
  const launchdResult = macLaunchdProbe(plugin, options);
  return {
    plugin: plugin.id,
    ok: pathResult.ok && launchdResult.ok && probes.every((probe) => probe.ok),
    sourcePath: pathResult,
    launchd: launchdResult,
    http: probes,
  };
}

function buildReport(options) {
  const probeOptions = effectiveMacProbeOptions(options);
  const targets = selectedTargets(options);
  const pointerChecks = targets.map((plugin) => checkPointer(plugin, options));
  const central = checkCentralDocs(options, targets);
  const mac = probeOptions.probeMac ? targets.map((plugin) => macProbe(plugin, probeOptions)) : [];
  const issues = [
    ...central.issues.map((issue) => `central:${issue}`),
    ...pointerChecks.flatMap((check) => check.issues.map((issue) => `${check.plugin}:${issue}`)),
  ];
  if (options.requireMacOk) {
    issues.push(...mac.filter((item) => !item.ok).map((item) => `${item.plugin}:mac_probe_failed`));
  }
  return {
    ok: issues.length === 0,
    contractVersion: CONTRACT_VERSION,
    checkedPlugins: targets.filter((target) => target.type !== "native_client").map((plugin) => plugin.id),
    checkedNativeClients: targets.filter((target) => target.type === "native_client").map((client) => client.id),
    checkedTargets: targets.map((target) => target.id),
    excludedPlugins: [],
    macProbe: probeOptions.macProbe,
    central,
    plugins: pointerChecks,
    mac,
    issues,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`plugin workspace platform contract ok=${report.ok}`);
    console.log(`checked=${report.checkedPlugins.join(",")}`);
    if (report.issues.length) console.log(`issues=${report.issues.join(",")}`);
    if (report.mac.length) {
      for (const item of report.mac) {
        console.log(`mac ${item.plugin} ok=${item.ok}`);
      }
    }
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  CONTRACT_VERSION,
  PLUGINS,
  NATIVE_CLIENTS,
  PLATFORM_TARGETS,
  buildReport,
  parseArgs,
};
