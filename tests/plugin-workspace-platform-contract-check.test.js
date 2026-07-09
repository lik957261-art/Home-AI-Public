"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "plugin-workspace-platform-contract-check.js");
const { CONTRACT_VERSION, PLUGINS, NATIVE_CLIENTS, PLATFORM_TARGETS } = require("../scripts/plugin-workspace-platform-contract-check");

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

function pointerFor(plugin, overrides = {}) {
  const windowsDevBaseUrl = overrides.windowsDevBaseUrl || `http://127.0.0.1:${plugin.port}`;
  const macosProductionBaseUrl = overrides.macosProductionBaseUrl || `http://127.0.0.1:${plugin.port}`;
  const manifestUrl = overrides.manifestUrl || `http://127.0.0.1:${plugin.port}/api/v1/hermes/plugin/manifest`;
  return [
    "# Home AI Platform Contract Pointer",
    "",
    "Last updated: 2026-06-06.",
    `Home AI platform contract version: \`${CONTRACT_VERSION}\`.`,
    "",
    "## Canonical Home AI Docs",
    "",
    "- `plugin-workspace-platform-contract.md`",
    "- `plugin-mobile-ui-visual-contract.md`",
    "- `autonomous-delivery-loop-contract.md`",
    "- `worker-pool-lifecycle-contract.md`",
    "- `root-cause-architecture-contract.md`",
    "- `fallback-governance-contract.md`",
    "- `fallback-registry.md`",
    "- `macos-production-access.md`",
    "- `mcp-tool-upgrade-closure.md`",
    "- `macos-ios-simulator-appium.md`",
    "- `ai-operations-control-plane.md`",
    "- `reference-memory-graph-v1.md`",
    "- `reference-memory-graph-harness-plan.md`",
    "",
    "## Plugin-Local Facts",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| \`plugin_id\` | \`${plugin.id}\` |`,
    `| \`workspace_path_windows\` | \`fixture/${plugin.dirName}\` |`,
    `| \`production_source_path_macos\` | \`${plugin.macSourcePaths[0]}\` |`,
    "| `production_data_root_macos` | `/Users/example/path` |",
    `| \`windows_dev_base_url\` | \`${windowsDevBaseUrl}\` |`,
    `| \`macos_production_base_url\` | \`${macosProductionBaseUrl}\` |`,
    `| \`launchd_label\` | \`${plugin.launchdLabel}\` |`,
    `| \`manifest_url\` | \`${manifestUrl}\` |`,
    "| `mcp_command` | `fixture` |",
    "| `mcp_schema_endpoint` | `fixture` |",
    `| \`dev_runtime_prerequisites\` | \`${(plugin.devRuntimeKeywords || ["node", "npm"]).join(", ")}\` |`,
    "| `deploy_command` | `fixture` |",
    "| `reference_contract_status` | `planned` |",
    "| `mobile_visual_harness_status` | `planned` |",
    "| `ai_ops_control_plane_command` | `cd /Users/example/path && node scripts/ai-ops-control-plane.js intake --task \"<task>\" --json` |",
    "| `ai_ops_required_flow` | `intake -> required-checks -> lane allocate if visual -> evidence append -> production smoke -> handoff` |",
    "| `ai_ops_evidence_ledger` | `$HOME/.homeai-qa/evidence-ledger.jsonl` |",
    "| `plugin_main_preflight_command` | `cd /Users/example/path && node scripts/main-thread-routing-preflight.js --source-thread-role plugin_main --task \"<task>\" --changed-file <path> --mode classify` |",
    "| `plugin_worker_dispatch_policy` | `When classification is plugin_worker, dispatch a plugin_worker card with terminal return, Chinese receipt, privacy boundary, conflict rule, expected validation, and no Task Intake/deploy/audit/Loop/current-thread fallback.` |",
    "| `plugin_worker_pool_lifecycle_policy` | `Use the stable plugin_worker Worker pool with resolve-before-create; reuse available lanes, mark lanes busy while a task card is active, require per-task-card heartbeat, activate the Watchdog for that task card after 1800000ms without heartbeat, batch limit 8, maximum auto-resume 1, release lanes after terminal return with Chinese receipt, reject task-title Worker names as sprawl, and create only for missing_role_lane, pool_exhausted, or no legal lane.` |",
    "| `ios_live_debug_available` | `yes` |",
    `| \`ios_visual_harness_command\` | \`cd /Users/example/path && npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id ${plugin.id} --debug-url http://127.0.0.1:19073/\` |`,
    "| `plugin_manifest_actions_status` | `declared` |",
    "",
    "Do not record raw secrets or credentials here.",
  ].join("\n");
}

function nativePointerFor(client) {
  return [
    "# Home AI Platform Contract Pointer",
    "",
    "Last updated: 2026-06-16.",
    `Home AI platform contract version: \`${CONTRACT_VERSION}\`.`,
    "",
    "## Canonical Home AI Docs",
    "",
    "- `plugin-workspace-platform-contract.md`",
    "- `plugin-mobile-ui-visual-contract.md`",
    "- `autonomous-delivery-loop-contract.md`",
    "- `worker-pool-lifecycle-contract.md`",
    "- `root-cause-architecture-contract.md`",
    "- `fallback-governance-contract.md`",
    "- `fallback-registry.md`",
    "- `macos-production-access.md`",
    "- `mcp-tool-upgrade-closure.md`",
    "- `macos-ios-simulator-appium.md`",
    "- `ai-operations-control-plane.md`",
    "- `reference-memory-graph-v1.md`",
    "- `reference-memory-graph-harness-plan.md`",
    "- `native-ios-shell.md`",
    "- `native-notifications.md`",
    "- `voice-input-plugin.md`",
    "",
    "## Native Client Local Facts",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| \`client_id\` | \`${client.id}\` |`,
    "| `repository_path_macos` | `/fixture/Xcode/Home AI` |",
    `| \`xcode_project\` | \`${client.xcodeProject}\` |`,
    `| \`main_bundle_id\` | \`${client.mainBundleId}\` |`,
    `| \`share_extension_bundle_id\` | \`${client.shareExtensionBundleId}\` |`,
    `| \`app_group\` | \`${client.appGroup}\` |`,
    "| `home_ai_origin_policy` | `HTTPS only; no LAN or local HTTP origin` |",
    `| \`auth_transport\` | \`${client.authTransport}\` |`,
    "| `default_workspace_id` | `owner` |",
    "| `native_shell_query` | `nativeShell=ios` |",
    "| `native_capabilities` | `pwa_webview_shell, apple_health_sync, apns_device_registration, ios_share_extension` |",
    "| `platform_management_status` | `managed_native_client` |",
    "| `ai_ops_control_plane_command` | `cd /Users/example/path && node scripts/ai-ops-control-plane.js intake --task \"<task>\" --json` |",
    "| `ai_ops_required_flow` | `intake -> required-checks -> lane allocate if visual -> evidence append -> production smoke -> handoff` |",
    "| `ai_ops_evidence_ledger` | `$HOME/.homeai-qa/evidence-ledger.jsonl` |",
    `| \`local_validation_command\` | \`xcodebuild -project '${client.xcodeProject}' -scheme 'Home AI' -destination 'generic/platform=iOS Simulator' build\` |`,
    "",
    "Do not record raw secrets or credentials here.",
  ].join("\n");
}

function moviePointerFor(plugin) {
  return [
    "# Home AI Platform Contract Pointer",
    "",
    "Home AI platform contract version: `20260626-v6`",
    "",
    "Canonical Home AI contract source:",
    "- `/Users/example/path`",
    "- `/Users/example/path`",
    "- `/Users/example/path`",
    "- `/Users/example/path`",
    "- `/Users/example/path`",
    "",
    "Plugin-local facts:",
    "- plugin id: `movie`",
    "- repository path: `/Users/example/path`",
    `- production source path: \`${plugin.macSourcePaths[0]}\``,
    "- production data path: `/Users/example/path`",
    `- development URL/port: \`http://127.0.0.1:${plugin.port}\``,
    `- production URL/port: \`http://127.0.0.1:${plugin.port}\``,
    `- service identity: \`${plugin.launchdLabel}\``,
    "- MCP toolset/server id: `movie` / `movie`.",
    "- Expected Gateway callables after Home AI schema sync:",
    "  - `mcp_movie_search_sources`",
    "  - `mcp_movie_list_source_state`",
    "- Movie is Owner-only and must not become workspace-grantable for non-Owner users.",
    "- Plugin main preflight command: `cd /Users/example/path && node scripts/main-thread-routing-preflight.js --source-thread-role plugin_main --task \"<task>\" --changed-file <path> --mode classify`.",
    "- Plugin Worker dispatch policy: `plugin_worker` cards require terminal return, Chinese receipt, privacy boundary, conflict rule, expected validation, and no Task Intake/deploy/audit/Loop/current-thread fallback.",
    "- Plugin Worker pool lifecycle policy: use the stable `plugin_worker` Worker pool with resolve-before-create; reuse available lanes, mark lanes busy while a card is active, require per-task-card heartbeat, activate the Watchdog for that task card after 1800000ms without heartbeat, batch limit 8, maximum auto-resume 1, release them after terminal return with Chinese receipt, reject task-title Worker names as sprawl, and create only for `missing_role_lane`, `pool_exhausted`, or no legal lane.",
    "",
    "Do not record raw secrets or credentials here.",
  ].join("\n");
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-contract-"));
  const repo = path.join(root, "Agent");
  write(path.join(repo, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md"), [
    "# Plugin Workspace Contract Rollout Status",
    "Finance Wardrobe Note Email Health Growth Moira Music Movie Codex Mobile Web Home AI Native iOS Shell",
    "plugin-workspace-platform-contract.md",
    "plugin-mobile-ui-visual-contract.md",
    "autonomous-delivery-loop-contract.md",
    "worker-pool-lifecycle-contract.md",
    "root-cause-architecture-contract.md",
    "fallback-governance-contract.md",
    "fallback-registry.md",
    "docs/HOME_AI_PLATFORM_CONTRACT.md",
    "Codex Mobile Web is an Owner-critical special insertion and is included in this platform contract checker.",
    "Home AI Native iOS Shell is a managed native client target.",
    "plugin-workspace-platform-contract-check.js",
    "plugin-workspace-platform-contract-check.test.js",
    "fallback-governance-check.js",
    "fallback-governance-check.test.js",
    "ai-ops-control-plane.js",
    "ai-ops-control-plane-cli.test.js",
    "ios-pwa-visual-harness.js",
    "ios-pwa-visual-harness.test.js",
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
  ].join("\n"));
  write(path.join(repo, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"), "plugin-workspace-platform-contract-check.js\nfallback-governance-check.js\nfallback-governance-contract.md\nfallback-registry.md\nautonomous-delivery-loop-contract.md\nworker-pool-lifecycle-contract.md\nnpm run ios:pwa:visual\nscripts/ios-pwa-visual-harness.js\nios_visual_harness_command\nai-ops-control-plane.js\nai_ops_control_plane_command\nai_ops_required_flow\nai_ops_evidence_ledger\nmain-thread-routing-preflight.js\nplugin_main_preflight_command\nplugin_worker_dispatch_policy\nplugin_worker_pool_lifecycle_policy\nresolve-before-create\nWorker pool\nsprawl\nterminalReturnLanguageZhCn\ntaskCardHeartbeatRequired\ntaskCardWatchdogTimeoutMs\ntaskCardWatchdogBatchLimit\ntaskCardWatchdogMaxAutoResume\n1800000\nChinese receipt\nnative-ios-shell.md\nhome-ai-native-ios\nmanaged_native_client\n");
  write(path.join(repo, "docs", "TEST_MATRIX.md"), "plugin-workspace-platform-contract-check.test.js\nfallback-governance-check.test.js\nnode tests\\ios-pwa-visual-harness.test.js\nai-ops-control-plane-cli.test.js\n");
  write(path.join(repo, "docs", "DOCS_INDEX.md"), "plugin-workspace-contract-rollout-status.md\nscripts/ios-pwa-visual-harness.js\nios-pwa-visual-harness.test.js\nai-ops-control-plane.js\nfallback-governance-check.js\nfallback-governance-contract.md\nfallback-registry.md\nnative-ios-shell.md\nhome-ai-native-ios\nmanaged_native_client\n");
  write(path.join(repo, "docs", "MODULES", "native-ios-shell.md"), "home-ai-native-ios\nmanaged_native_client\n");
  for (const plugin of PLUGINS) {
    const workspace = path.join(root, plugin.dirName);
    write(
      path.join(workspace, "docs", "HOME_AI_PLATFORM_CONTRACT.md"),
      plugin.pointerMode === "movie_owner_only" ? moviePointerFor(plugin) : pointerFor(plugin),
    );
    write(path.join(workspace, ".agent-context", "HANDOFF.md"), `## Home AI Platform Contract Pointer\n${CONTRACT_VERSION}\n`);
  }
  for (const client of NATIVE_CLIENTS) {
    const workspace = path.join(root, client.dirName);
    write(path.join(workspace, "docs", "HOME_AI_PLATFORM_CONTRACT.md"), nativePointerFor(client));
    write(path.join(workspace, ".agent-context", "HANDOFF.md"), `## Home AI Platform Contract Pointer\n${CONTRACT_VERSION}\n`);
  }
  return { root, repo };
}

function makeCentralOnlyFixture() {
  const fixture = makeFixture();
  for (const target of PLATFORM_TARGETS) {
    fs.rmSync(path.join(fixture.root, target.dirName), { recursive: true, force: true });
  }
  return fixture;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function testFixturePasses() {
  const fixture = makeFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.checkedPlugins, ["finance", "wardrobe", "note", "email", "health", "growth", "moira", "music", "movie", "codex-mobile"]);
  assert.deepEqual(parsed.checkedNativeClients, ["home-ai-native-ios"]);
  assert.deepEqual(parsed.checkedTargets, PLATFORM_TARGETS.map((target) => target.id));
  assert.deepEqual(parsed.excludedPlugins, []);
}

function testUnknownPluginFailsAndCodexIsAContractDescriptor() {
  const fixture = makeFixture();
  const codexResult = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "codex-mobile", "--json"]);
  assert.equal(codexResult.status, 0, codexResult.stderr || codexResult.stdout);
  const codexParsed = JSON.parse(codexResult.stdout);
  assert.deepEqual(codexParsed.checkedPlugins, ["codex-mobile"]);
  assert.ok(PLUGINS.some((plugin) => plugin.id === "codex-mobile"));

  const result = run(["--plugin", "codex-mobile-web", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown plugin\/native-client id/);
}

function testNativeClientIsAContractDescriptor() {
  const fixture = makeFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--target", "home-ai-native-ios", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.checkedPlugins, []);
  assert.deepEqual(parsed.checkedNativeClients, ["home-ai-native-ios"]);
  assert.equal(parsed.plugins[0].type, "native_client");
}

function testSingleRepositoryCheckoutReportsBoundedPointerMissing() {
  const fixture = makeCentralOnlyFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--json"], {
    HOMEAI_NATIVE_IOS_WORKSPACE: path.join(fixture.root, "__missing_native__"),
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.central.issues.length, 0);
  assert.equal(parsed.plugins.every((plugin) => !plugin.pointerExists), true);
  assert.deepEqual(
    parsed.issues,
    PLATFORM_TARGETS.map((plugin) => `${plugin.id}:pointer_missing`),
  );
}

function testPointerRejectsPublicRuntimeUrls() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  write(path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md"), pointerFor(plugin, {
    macosProductionBaseUrl: "https://hermes-xuxin.synology.me:8445",
    manifestUrl: "https://hermes-xuxin.synology.me:8445/api/v1/hermes/plugin/manifest",
  }));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:runtime_url_not_loopback:macos_production_base_url"));
  assert.ok(parsed.issues.includes("finance:runtime_url_not_loopback:manifest_url"));
  assert.ok(parsed.issues.some((issue) => issue.startsWith("finance:pointer_forbidden_runtime_domain:")));
}

function testPointerRequiresIosVisualHarnessCommand() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin).replace(/\n\| `ios_visual_harness_command` \|[^\n]+/, ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`ios_visual_harness_command`"));
  assert.ok(parsed.issues.includes("finance:ios_visual_harness_command_missing"));
}

function testPointerRequiresAiOpsControlPlaneFields() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace(/\n\| `ai_ops_control_plane_command` \|[^\n]+/, "")
    .replace(/\n\| `ai_ops_required_flow` \|[^\n]+/, "")
    .replace(/\n\| `ai_ops_evidence_ledger` \|[^\n]+/, ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`ai_ops_control_plane_command`"));
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`ai_ops_required_flow`"));
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`ai_ops_evidence_ledger`"));
  assert.ok(parsed.issues.includes("finance:ai_ops_control_plane_command_missing"));
  assert.ok(parsed.issues.includes("finance:ai_ops_required_flow_missing:intake"));
  assert.ok(parsed.issues.includes("finance:ai_ops_evidence_ledger_missing"));
}

function testPointerRequiresPluginMainPreflightFieldsForCurrentContract() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace(/\n\| `plugin_main_preflight_command` \|[^\n]+/, "")
    .replace(/\n\| `plugin_worker_dispatch_policy` \|[^\n]+/, ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`plugin_main_preflight_command`"));
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`plugin_worker_dispatch_policy`"));
  assert.ok(parsed.issues.includes("finance:plugin_main_preflight_command_missing"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_dispatch_policy_missing:plugin_worker"));
}

function testPointerRequiresPluginWorkerPoolLifecyclePolicyForCurrentContract() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace(/\n\| `plugin_worker_pool_lifecycle_policy` \|[^\n]+/, ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:pointer_missing_text:`plugin_worker_pool_lifecycle_policy`"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:plugin_worker"));
}

function testPointerRequiresChineseWorkerReceiptForCurrentContract() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace("terminal return, Chinese receipt, privacy boundary", "terminal return, privacy boundary")
    .replace("terminal return with Chinese receipt", "terminal return"));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:plugin_worker_dispatch_policy_missing:chinese_terminal_receipt"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:chinese_terminal_receipt"));
}

function testPointerRequiresTaskCardHeartbeatWatchdogForCurrentContract() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace("require per-task-card heartbeat, activate the Watchdog for that task card after 1800000ms without heartbeat, batch limit 8, maximum auto-resume 1, ", ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:heartbeat"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:watchdog"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:watchdog_timeout"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:watchdog_batch_limit"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:watchdog_max_auto_resume"));
}

function testPointerRejectsWeakPluginWorkerPoolLifecyclePolicyForCurrentContract() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "finance");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin)
    .replace(
      /\| `plugin_worker_pool_lifecycle_policy` \|[^\n]+/,
      "| `plugin_worker_pool_lifecycle_policy` | `Create a new worker for each task when needed.` |",
    ));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "finance", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:plugin_worker"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:resolve-before-create"));
  assert.ok(parsed.issues.includes("finance:plugin_worker_pool_lifecycle_policy_missing:create_reason"));
}

function testPointerRequiresDeclaredDevRuntimePrerequisites() {
  const fixture = makeFixture();
  const plugin = PLUGINS.find((item) => item.id === "note");
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, pointerFor(plugin).replace("| `dev_runtime_prerequisites` | `python` |", "| `dev_runtime_prerequisites` | `node` |"));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "note", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("note:dev_runtime_prerequisite_missing:python"));
}

function testNativePointerRequiresManagedClientFields() {
  const fixture = makeFixture();
  const client = NATIVE_CLIENTS[0];
  const pointerPath = path.join(fixture.root, client.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  write(pointerPath, nativePointerFor(client)
    .replace(/\n\| `platform_management_status` \|[^\n]+/, "")
    .replace(/\n\| `native_capabilities` \|[^\n]+/, ""));
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--target", client.id, "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.includes("home-ai-native-ios:pointer_missing_text:`platform_management_status`"));
  assert.ok(parsed.issues.includes("home-ai-native-ios:pointer_missing_text:`native_capabilities`"));
  assert.ok(parsed.issues.includes("home-ai-native-ios:native_capability_missing:pwa_webview_shell"));
  assert.ok(parsed.issues.includes("home-ai-native-ios:platform_management_status_missing"));
}

function testLegacyPointerVersionIsAcceptedDuringFallbackGovernanceRollout() {
  const fixture = makeFixture();
  const plugin = PLUGINS[0];
  const pointerPath = path.join(fixture.root, plugin.dirName, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  const legacyPointer = pointerFor(plugin)
    .replace(`Home AI platform contract version: \`${CONTRACT_VERSION}\`.`, "Home AI platform contract version: `20260618-v4`.")
    .replace(/\n- `root-cause-architecture-contract\.md`/g, "")
    .replace(/\n- `fallback-governance-contract\.md`/g, "")
    .replace(/\n- `fallback-registry\.md`/g, "");
  write(pointerPath, legacyPointer);
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", plugin.id, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const check = parsed.plugins.find((item) => item.plugin === plugin.id);
  assert.equal(parsed.ok, true);
  assert.ok(check.warnings.includes("pointer_contract_version_legacy:20260618-v4"));
}

function testRepositoryContractIsCurrentlyClosed() {
  const result = run(["--json"]);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.central.issues.length, 0);
  const pointerCount = parsed.plugins.filter((plugin) => plugin.pointerExists).length;
  if (pointerCount === 0 && process.env.GITHUB_ACTIONS === "true") {
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.deepEqual(
      parsed.issues,
      PLATFORM_TARGETS.map((plugin) => `${plugin.id}:pointer_missing`),
    );
    return;
  }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(pointerCount, PLATFORM_TARGETS.length);
}

function testMovieOwnerOnlyPointerIsCoveredWithoutStandardGrantFields() {
  const fixture = makeFixture();
  const result = run(["--repo-root", fixture.repo, "--workspace-root", fixture.root, "--plugin", "movie", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.checkedPlugins, ["movie"]);
  assert.equal(parsed.plugins[0].pointerMode, "movie_owner_only");
}

function testMacProbeDefaultAliasUsesLocalWhenProductionRootIsReadable() {
  const fixture = makeFixture();
  const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-mac-root-"));
  const result = run([
    "--repo-root", fixture.repo,
    "--workspace-root", fixture.root,
    "--target", "home-ai-native-ios",
    "--probe-mac",
    "--json",
  ], { HOMEAI_MAC_PRODUCTION_ROOT: productionRoot });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.checkedNativeClients, ["home-ai-native-ios"]);
  assert.equal(parsed.macProbe.enabled, true);
  assert.equal(parsed.macProbe.sshAlias, "local");
  assert.equal(parsed.macProbe.mode, "local");
  assert.equal(parsed.macProbe.defaultSelection, "local_root_readable");
  assert.equal(parsed.macProbe.localRootReadable, true);
}

function testMacProbeExplicitAliasOverridesReadableProductionRoot() {
  const fixture = makeFixture();
  const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-mac-root-"));
  const result = run([
    "--repo-root", fixture.repo,
    "--workspace-root", fixture.root,
    "--target", "home-ai-native-ios",
    "--probe-mac",
    "--ssh-alias", "homeai-mac",
    "--json",
  ], { HOMEAI_MAC_PRODUCTION_ROOT: productionRoot });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.macProbe.sshAlias, "homeai-mac");
  assert.equal(parsed.macProbe.mode, "ssh");
  assert.equal(parsed.macProbe.defaultSelection, "explicit");
  assert.equal(parsed.macProbe.localRootReadable, true);
}

function testMacProbeDefaultAliasFallsBackToSshWhenProductionRootIsMissing() {
  const fixture = makeFixture();
  const missingRoot = path.join(os.tmpdir(), `homeai-missing-root-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const result = run([
    "--repo-root", fixture.repo,
    "--workspace-root", fixture.root,
    "--target", "home-ai-native-ios",
    "--probe-mac",
    "--json",
  ], { HOMEAI_MAC_PRODUCTION_ROOT: missingRoot });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.macProbe.sshAlias, "homeai-mac");
  assert.equal(parsed.macProbe.mode, "ssh");
  assert.equal(parsed.macProbe.defaultSelection, "ssh_alias_fallback");
  assert.equal(parsed.macProbe.localRootReadable, false);
}

function testScriptDoesNotHandleSecretsOrSudo() {
  const script = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(script, /password-file|sudo\s+-S|Access Key/i);
  assert.match(script, /X-Hermes-Web-Key/);
  assert.match(script, /--probe-mac/);
  assert.match(script, /ssh/);
  assert.match(script, /launchctl/);
  assert.match(script, /curl/);
  assert.match(script, /function isLocalProbeAlias\(alias\)/);
  assert.match(script, /function effectiveMacProbeOptions\(options = \{\}\)/);
  assert.match(script, /local\|localhost\|127\\\.0\\\.0\\\.1/);
}

testFixturePasses();
testUnknownPluginFailsAndCodexIsAContractDescriptor();
testNativeClientIsAContractDescriptor();
testSingleRepositoryCheckoutReportsBoundedPointerMissing();
testPointerRejectsPublicRuntimeUrls();
testPointerRequiresIosVisualHarnessCommand();
testPointerRequiresAiOpsControlPlaneFields();
testPointerRequiresPluginMainPreflightFieldsForCurrentContract();
testPointerRequiresPluginWorkerPoolLifecyclePolicyForCurrentContract();
testPointerRequiresChineseWorkerReceiptForCurrentContract();
testPointerRequiresTaskCardHeartbeatWatchdogForCurrentContract();
testPointerRejectsWeakPluginWorkerPoolLifecyclePolicyForCurrentContract();
testPointerRequiresDeclaredDevRuntimePrerequisites();
testNativePointerRequiresManagedClientFields();
testLegacyPointerVersionIsAcceptedDuringFallbackGovernanceRollout();
testRepositoryContractIsCurrentlyClosed();
testMovieOwnerOnlyPointerIsCoveredWithoutStandardGrantFields();
testMacProbeDefaultAliasUsesLocalWhenProductionRootIsReadable();
testMacProbeExplicitAliasOverridesReadableProductionRoot();
testMacProbeDefaultAliasFallsBackToSshWhenProductionRootIsMissing();
testScriptDoesNotHandleSecretsOrSudo();

console.log("plugin workspace platform contract checker tests passed");
