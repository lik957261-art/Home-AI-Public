"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-macos-production.js");
const script = fs.readFileSync(scriptPath, "utf8");
const deployScript = require(scriptPath);
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const contract = fs.readFileSync(
  path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "macos-dev-to-production-deployment-contract.md"),
  "utf8",
);
const pluginWorkspaceContract = fs.readFileSync(
  path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"),
  "utf8",
);
const autonomousDeliveryLoopContract = fs.readFileSync(
  path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "autonomous-delivery-loop-contract.md"),
  "utf8",
);
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const productionAccess = fs.readFileSync(path.join(repoRoot, "docs", "RUNBOOKS", "macos-production-access.md"), "utf8");
const pluginsDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "plugins.md"), "utf8");

assert.match(script, /Default mode is plan-only/);
assert.match(script, /--execute/);
assert.match(script, /--allow-dirty/);
assert.match(script, /--surface full\|static/);
assert.match(script, /--sync-only/);
assert.match(script, /--ui-visual-evidence/);
assert.match(script, /UI_VISUAL_LOCAL_VALIDATION_REQUIRED/);
assert.match(script, /HOMEAI_MAC_SUDO_PASSWORD_FILE/);
assert.match(script, /\/Users\/hermes-dev\/HermesMobileDev/);
assert.match(script, /\/Users\/hermes-host\/HermesMobile/);
assert.match(script, /unsupported_plugin_target/);
assert.match(script, /PLUGIN_DEPLOY_ORDER/);
assert.match(script, /PLUGIN_ALIASES/);
assert.match(script, /health: "healthy"/);
assert.match(script, /PLUGIN_HEALTH_URLS/);
assert.match(script, /PLUGIN_GATEWAY_MCP_MIRRORS/);
assert.match(script, /gateway-worker\/wardrobe-mcp\/scripts/);
assert.match(script, /gateway-worker\/wardrobe-mcp\/wardrobe_app/);
assert.match(script, /gateway-worker\/movie-mcp\/src/);
assert.match(script, /gateway-worker\/movie-mcp\/package\.json/);
assert.match(script, /gateway-worker\/moira-mcp\/scripts\/moira-mcp-stdio\.mjs/);
assert.match(script, /gateway-worker\/moira-mcp\/server/);
assert.match(script, /gateway-worker\/moira-mcp\/web/);
assert.match(script, /post-sync-gateway-mcp-worker-assets/);
assert.match(script, /buildAllPluginPlan/);
assert.match(script, /\$\{label\}_outside_allowed_root/);
assert.match(script, /assertInside\(source, options\.devRoot, "source"\)/);
assert.match(script, /assertInside\(target, options\.macRoot, "production_target"\)/);
assert.match(script, /\/usr\/bin\/rsync/);
assert.match(script, /\/usr\/bin\/sudo/);
assert.match(script, /\/usr\/sbin\/chown/);
assert.match(script, /productionOwner/);
assert.match(script, /codex-mobile-log-permissions/);
assert.match(script, /codex-mobile-selected-mux-refresh/);
assert.match(script, /codex-mobile-web\.out\.log/);
assert.match(script, /codex-mobile-web\.err\.log/);
assert.match(script, /launchdReloadRequired/);
assert.match(script, /currentStdoutPath !== files\[0\]/);
assert.match(script, /currentStderrPath !== files\[1\]/);
assert.match(script, /detectCodexMobileMuxRuntimeChange/);
assert.match(script, /refreshCodexMobileSelectedMuxRuntime/);
assert.match(script, /selected_mux_endpoint_unexpected_process/);
assert.match(script, /codex-app-server-mux/);
assert.match(script, /codex app-server/);
assert.match(script, /endpoint\.childPid/);
assert.match(script, /endpoint\.pid/);
assert.match(script, /runSudo\(node, \["-e", script, codexRuntime\.muxEndpointFile\], password\)/);
assert.doesNotMatch(script, /runSudo\(node, \["-", codexRuntime\.muxEndpointFile\], password, script\)/);
assert.doesNotMatch(script, /killall/);
assert.doesNotMatch(script, /pkill/);
assert.doesNotMatch(script, /pgrep/);
assert.match(script, /finance-launchd-workspace-key-hashes/);
assert.match(script, /install-finance-launchd-service\.js/);
assert.match(script, /--require-workspace-key-hashes/);
assert.match(script, /music-runtime-cover-permissions/);
assert.match(script, /cover-plan-cache/);
assert.match(script, /cover-backups/);
assert.match(script, /wardrobe-thumbnail-artifact-acl/);
assert.match(script, /repair_wardrobe_thumbnail_artifact_acl/);
assert.match(script, /gateway-launchctl-sudoers/);
assert.match(script, /\/etc\/sudoers\.d\/homeai-gateway-launchctl/);
assert.match(script, /visudo -cf/);
assert.match(script, /\/bin\/launchctl kickstart system\/com\.hermesmobile\.gateway\.\*/);
assert.match(script, /\/bin\/launchctl kill SIGTERM system\/com\.hermesmobile\.gateway\.\*/);
assert.match(script, /gateway-macos-launcher/);
assert.match(script, /gateway-worker\/macos-launch-gateway-profile\.sh/);
assert.match(script, /app\/scripts\/macos-launch-gateway-profile\.sh/);
assert.match(script, /home-ai-gateway-launchd-services-install/);
assert.match(script, /install-macos-production\.sh/);
assert.match(script, /install-gateway-launchd-services/);
assert.match(script, /HOMEAI_INSTALL_LAUNCHD_APPLY=1/);
assert.match(script, /HOMEAI_NODE=\$\{node\}/);
assert.match(script, /add_subdirectory/);
assert.match(script, /PLUGIN_RSYNC_EXCLUDES/);
assert.match(script, /"-S", "-p", "", command/);
assert.match(script, /"-n", command/);
assert.match(script, /function verifySudoAuthentication\(password\)/);
assert.match(script, /function resolveSudoPassword\(passwordFile = ""\)/);
assert.match(script, /function codexMobileSelectedMuxRefreshDecision\(input = \{\}\)/);
assert.match(script, /previous_selected_mux_refresh_incomplete/);
assert.match(script, /deploy_reason_forces_selected_mux_refresh/);
assert.match(script, /\.homeai-qa", "sudo-password"/);
assert.match(script, /sudo_authentication_required/);
assert.match(script, /sudo_authentication_failed/);
assert.match(script, /const password = resolveSudoPassword\(options\.passwordFile\);\n\n  runSudo\("\/bin\/mkdir"/);
assert.match(script, /\/bin\/launchctl/);
assert.match(script, /kickstart/);
assert.match(script, /HOME_AI_BRIDGE_HOST_LABEL/);
assert.match(script, /HOME_AI_CRON_LABEL/);
assert.match(script, /HOME_AI_NAS_BACKUP_MOUNT_LABEL/);
assert.match(script, /HOME_AI_VISUAL_DEBUG_LABEL/);
assert.match(script, /buildHomeAiBridgeHostLaunchdPlist/);
assert.match(script, /buildHomeAiCronLaunchdPlist/);
assert.match(script, /buildHomeAiNasBackupMountLaunchdPlist/);
assert.match(script, /const kickstart = runSudoAllowFailure\("\/bin\/launchctl", \["kickstart", "-k", `system\/\$\{HOME_AI_NAS_BACKUP_MOUNT_LABEL\}`\], password\)/);
assert.match(script, /kickstartWarning/);
assert.match(script, /buildHomeAiVisualDebugLaunchAgentPlist/);
assert.match(script, /home-ai-bridge-host-launchd-install/);
assert.match(script, /home-ai-cron-launchd-install/);
assert.match(script, /home-ai-nas-backup-mount-launchd-install/);
assert.match(script, /home-ai-visual-debug-launch-agent-install/);
assert.match(script, /home-ai-cron-profile-aliases/);
assert.match(script, /home-ai-cron-builtin-skills/);
assert.match(script, /home-ai-cron-runtime-scripts/);
assert.match(script, /home-ai-self-improving-loop-cron-job/);
assert.match(script, /codex-mobile-pr-automation-cron-job/);
assert.match(script, /plugin-daily-progress-rollup-cron-job/);
assert.match(script, /homeai-disaster-backup-cron\.sh/);
assert.match(script, /homeai-self-improving-loop-cron\.sh/);
assert.match(script, /codex-mobile-pr-automation-cron\.sh/);
assert.match(script, /plugin-daily-progress-rollup-cron\.sh/);
assert.match(script, /homeai-visual-polish-audit-cron\.sh/);
assert.match(script, /homeai-visual-polish-host\.sh/);
assert.match(script, /homeai-visual-polish-music\.sh/);
assert.match(script, /homeai-visual-polish-global\.sh/);
assert.match(script, /home-ai-visual-polish-cron-jobs/);
assert.match(script, /home-ai-visual-polish-task-card-config/);
assert.match(script, /installHomeAiVisualPolishCronJobs/);
assert.match(script, /installHomeAiSelfImprovingLoopCronJob/);
assert.match(script, /installCodexMobilePrAutomationCronJob/);
assert.match(script, /installPluginDailyProgressRollupCronJob/);
assert.match(script, /installHomeAiVisualPolishTaskCardConfig/);
assert.match(script, /homeai_self_improving_loop/);
assert.match(script, /codex_mobile_pr_automation_hourly/);
assert.match(script, /plugin_daily_progress_rollup/);
assert.match(script, /插件每日进展汇总/);
assert.match(script, /HOMEAI_INSTALL_VISUAL_POLISH_CRON_JOBS/);
assert.match(script, /installEnabled: false/);
assert.match(script, /homeai_visual_host/);
assert.match(script, /homeai_visual_music/);
assert.match(script, /homeai_visual_global_interactions/);
assert.match(script, /homeai_visual_core/);
assert.match(script, /homeai_visual_analysis_xhigh/);
assert.match(script, /hm-owner-openai-xhigh/);
assert.match(script, /HOMEAI_VISUAL_ANALYSIS_REASONING_EFFORT \|\| "xhigh"/);
assert.match(script, /no_agent: isScriptJob/);
assert.match(script, /enabledToolsets: \["file", "vision", "video"\]/);
assert.match(script, /global-interactions/);
assert.match(script, /plugin-drawer-action-gestures/);
assert.match(script, /chown", \[`\$\{PRODUCTION_SERVICE_USER\}:\$\{PRODUCTION_SERVICE_GROUP\}`, jobsPath\]/);
assert.match(script, /HOMEAI_VISUAL_DEBUG_USER/);
assert.match(script, /HOMEAI_VISUAL_DEBUG_APP_URL/);
assert.match(script, /HOME_AI_VISUAL_DEBUG_APP_URL/);
assert.match(script, /ios-pwa-live-debug-server\.js/);
assert.match(script, /<string>--app-url<\/string>/);
assert.match(script, /gui\/\$uid\/\$label/);
assert.match(script, /data", "hermes-home", "scripts/);
assert.match(script, /home-ai-backup-artifact-acl-repair/);
assert.match(script, /HOME_AI_BACKUP_ARTIFACT_READ_ACL/);
assert.match(script, /home-ai-backup-gateway-telemetry-acl-repair/);
assert.match(script, /HOME_AI_BACKUP_GATEWAY_TELEMETRY_READ_ACL/);
assert.match(script, /gateway-worker", "telemetry"/);
assert.match(script, /home-ai-backup-deploy-state-acl-repair/);
assert.match(script, /data", "deploy-state"/);
assert.match(script, /function applyAclOnce[\s\S]*?test -e \${shQuote\(targetPath\)} \|\| exit 0/);
assert.match(script, /find -P \${shQuote\(targetPath\)} -mindepth 0 ! -type l -exec \/bin\/chmod \+a/);
assert.match(script, /data", "artifacts/);
assert.match(script, /HOME_AI_SHARED_BUILTIN_SKILLS = Object\.freeze\(\["home-ai-todo-intake"\]\)/);
assert.match(script, /skill-profiles", "shared-global", "skills", "productivity/);
assert.match(script, /sharedInstalled/);
assert.match(script, /codex-shared-auth-permissions-repair/);
assert.match(script, /home-ai-automation-cron-audit/);
assert.match(script, /macos-automation-cron-audit\.js/);
assert.match(script, /home-ai-gateway-start-script-bridge-env-repair/);
assert.match(script, /macos-gateway-start-script-bridge-env-repair\.js/);
assert.match(script, /installRootOwnedTextFile/);
assert.match(script, /HOME_AI_CRON_PROFILE_READ_ACL/);
assert.match(script, /HOME_AI_GATEWAY_WORKER_RUNTIME_SETTING_ENVS/);
assert.match(script, /runtimeConfigGatewayWorkerEnvRows/);
assert.match(script, /runtime-config\.json/);
assert.match(script, /HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM/);
assert.match(script, /gatewayWorkerRuntimeSettingCount/);
assert.match(script, /HOME_AI_CRON_PLUGIN_BINDING_DIR_NAMES/);
assert.match(script, /applyAclIfExists\(bindingDir, HOME_AI_CRON_PROFILE_READ_ACL/);
assert.match(script, /\/usr\/bin\/install/);
assert.match(script, /HERMES_WEB_CRON_JOBS_PATH/);
assert.match(script, /HERMES_CRON_SCRIPT_TIMEOUT/);
assert.match(script, /StartInterval/);
assert.match(script, /hermes-mobile-cron-dispatcher\.py/);
assert.match(script, /homeai-nas-backup-mount-watchdog\.sh/);
assert.match(script, /com\.hermesmobile\.nas-backup-mount/);
assert.match(script, /homeai-production-drift-audit-watchdog\.sh/);
assert.match(script, /com\.hermesmobile\.production-drift-audit/);
assert.match(script, /production_drift_audit_kickstart_failed/);
assert.match(script, /kickstartWarning: kickstart\.status === 0/);
assert.match(script, /macos-production-drift-reconcile\.js/);
assert.match(script, /home-ai-production-drift-reconcile/);
assert.match(script, /production-status-smoke\.js/);
assert.match(script, /owner-web-key\.secret/);
assert.match(script, /plugin_execute_requires_restart_label_or_health_url/);
assert.match(script, /sync_only_requires_plugin_target/);
assert.match(script, /validationRetries: 12/);
assert.match(script, /validationDelayMs: 2000/);
assert.match(script, /DEPLOY_BACKUP_RETENTION_DAYS = 3/);
assert.match(script, /--deploy-backup-retention-days/);
assert.match(script, /deploy-backup-retention-prune/);
assert.match(script, /dailyLatestPerTarget: true/);
assert.match(script, /targetSlugs = /);
assert.match(script, /function shouldRetryValidation/);
assert.match(script, /home-ai-status-smoke/);
assert.match(script, /health-url/);
assert.match(script, /codex-mobile-listener-startup-gate/);
assert.match(script, /codex-mobile-behavior-gate/);
assert.match(script, /codex-mobile-runtime-self-check-loop\.js/);
assert.match(script, /--browser-startup-only/);
assert.match(script, /--codex-mobile-submit-thread-id/);
assert.match(script, /codex-auth-profile-audit/);
assert.match(script, /CODEX_AUTH_AUDIT_ISSUE_PREFIX/);
assert.match(script, /home-ai-production-drift-audit/);
assert.match(script, /failOnAnyIssue/);
assert.match(script, /runIssuePrefixAuditValidation/);
assert.match(script, /OWNER_3A_QUALITY_EVIDENCE_SEED/);
assert.match(script, /owner-3a-quality-evidence-seed/);
assert.match(script, /owner-3a-quality-evidence\.json/);
assert.match(script, /runOwner3aQualityEvidenceSeedValidation/);
assert.match(script, /seedTempFile/);
assert.match(script, /homeai-owner-3a-quality-evidence/);
assert.match(script, /fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), "homeai-owner-3a-quality-evidence\."\)\)/);
assert.match(script, /fs\.chmodSync\(seedTempDir, 0o700\)/);
assert.match(script, /fs\.copyFileSync\(seedTempFile, outputFile\)/);
assert.match(script, /fs\.rmSync\(seedTempDir, \{ recursive: true, force: true \}\)/);
assert.match(script, /options\.allowFailure !== true/);
assert.match(script, /\], \{ allowFailure: true \}\);/);
assert.match(script, /selfLoopOk: payload\.ok === true/);
assert.match(script, /selfLoopOk: summary\.selfLoopOk === true/);
assert.match(script, /diagnosticEventCodes/);
assert.match(script, /nonOkSignals/);
assert.match(script, /boundedToken\(item\?\.errorCode \|\| item\?\.error_code \|\| item\?\.category \|\| item\?\.signalId\)/);
assert.match(script, /HERMES_SELF_LOOP_SUBMIT_DIAGNOSTICS: "0"/);
assert.match(script, /HERMES_SELF_LOOP_CREATE_AUDIT_CARDS: "0"/);
assert.match(script, /homeai-install-upgrade-canary\.js/);
assert.match(script, /plugin-action-metadata-closure-smoke\.js/);
assert.match(script, /--quality-evidence-output/);
assert.match(script, /gateway_document_tool_capability_seed_skipped/);
assert.match(script, /installUpgradeCanaryObservedStatus !== "partial"/);
assert.match(script, /installUpgradeCanaryMode !== "plan"/);
assert.match(script, /cleanInstallCanaryStatus/);
assert.match(script, /home-ai-production-drift-audit-launchd-install/);
assert.match(script, /repairCodexSharedAuthPermissions/);
assert.match(script, /shouldRepairCodexSharedAuthPermissions/);
assert.match(script, /gateway-worker", "telemetry", "profiles", "shared-auth/);
assert.match(script, /HOME_AI_VOICE_INPUT_LANGUAGE = "zh"/);
assert.match(script, /HERMES_MOBILE_VOICE_INPUT_LANGUAGE/);
assert.match(script, /HERMES_MOBILE_VOICE_INPUT_INITIAL_PROMPT/);
assert.match(script, /HERMES_WEB_VOICE_INPUT_VAD_FILTER/);
assert.match(script, /HOME_AI_PLUGIN_WORKSPACE_AUDIT_TARGETS/);
assert.match(script, /HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS/);
assert.match(script, /HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS/);
assert.match(script, /HOME_AI_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED/);
assert.match(script, /HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED/);
assert.match(script, /HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND/);
assert.match(script, /HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME/);
assert.match(script, /Atomics\.wait/);
assert.match(script, /attempt/);
assert.match(script, /function cleanString/);
assert.match(script, /backups", "deploy/);
assert.match(script, /rsyncExcludes/);
assert.match(script, /BACKUP_RSYNC_EXCLUDES/);
assert.match(script, /buildRsyncArgs/);
assert.match(script, /gateway-pool-manifest-mac\.json/);
assert.match(script, /\.agent-context\//);
assert.match(script, /AGENTS\.md/);
assert.match(script, /\.codex\//);
assert.match(script, /\.codegraph\//);
assert.match(script, /node_modules\//);
assert.match(script, /gateway-worker\/music-mcp\/node_modules/);
assert.match(script, /gateway-worker\/music-mcp\/package-lock\.json/);
assert.match(script, /\.venv\//);
assert.match(script, /deploy_source_dirty_requires_allow_dirty/);
assert.match(script, /plan\.restartLabels\.includes\(codexMobileLogRepair\.launchdLabel\)/);
assert.match(script, /production-file-hashes/);
assert.match(script, /--expected-version/);
assert.match(script, /HOME_AI_STATIC_SYNC_ROOTS/);
assert.doesNotMatch(script, /console\.log\(.*password/i);
assert.doesNotMatch(script, /console\.error\(.*password/i);
assert.doesNotMatch(script, /\/usr\/bin\/tee/);

for (const plugin of ["codex-mobile-web", "email", "finance", "growth", "healthy", "moira", "movie", "music", "note", "wardrobe"]) {
  assert.match(script, new RegExp(`"${plugin}"`));
  assert.match(contract, new RegExp(`${plugin} -> /Users/example/path`));
  assert.match(productionAccess, new RegExp(`${plugin} -> /Users/example/path`));
}

assert.match(deploymentDoc, /deploy-macos-production\.js/);
assert.match(contract, /code but then discovers that deployment is blocked/);
assert.match(deploymentDoc, /install-growth-launchd-service\.js/);
assert.match(deploymentDoc, /install-moira-launchd-service\.js/);
assert.match(deploymentDoc, /install-music-launchd-service\.js/);
assert.match(deploymentDoc, /cover-plan-cache/);
assert.match(productionAccess, /deploy-macos-production\.js/);
assert.equal(packageJson.scripts["deploy:macos"], "node scripts/deploy-macos-production.js");
assert.match(contract, /sudo_authentication_required/);
assert.match(contract, /sudo_authentication_failed/);
assert.match(productionAccess, /sudo_authentication_required/);
assert.match(productionAccess, /sudo_authentication_failed/);

const sudoCandidateRows = deployScript.sudoPasswordFileCandidates("/tmp/homeai-explicit-password");
assert.equal(sudoCandidateRows[0].path, "/tmp/homeai-explicit-password");
assert.equal(sudoCandidateRows[0].source, "argument");
assert.ok(
  deployScript.defaultSudoPasswordFileCandidates().some((candidate) => candidate.endsWith("/.homeai-qa/sudo-password")),
);

assert.deepEqual(
  deployScript.parseDeployBackupName("20260622T125745Z-plugin-music-music-verified-roon-playback"),
  {
    timestamp: "20260622T125745Z",
    date: "2026-06-22",
    targetSlug: "plugin-music",
  },
);
assert.equal(
  deployScript.parseDeployBackupName("20260622T125745Z-plugin-codex-mobile-web-runtime-log-repair").targetSlug,
  "plugin-codex-mobile-web",
);
assert.equal(deployScript.isPausedCronJob({ enabled: false, state: "scheduled" }), true);
assert.equal(deployScript.isPausedCronJob({ enabled: true, state: "paused" }), true);
assert.equal(deployScript.isPausedCronJob({ enabled: true, paused_at: "2026-07-09T00:00:00Z" }), true);
assert.equal(deployScript.isPausedCronJob({ enabled: true, state: "scheduled" }), false);
assert.deepEqual(
  deployScript.cronJobScheduleStateForUpsert(
    {
      enabled: false,
      state: "paused",
      paused_at: "2026-07-09T00:00:00Z",
      paused_reason: "owner_pause",
      next_run_at: "2026-07-09T01:00:00Z",
    },
    "2026-07-09T02:00:00Z",
  ),
  {
    enabled: false,
    state: "paused",
    paused_at: "2026-07-09T00:00:00Z",
    paused_reason: "owner_pause",
    next_run_at: null,
  },
);
assert.deepEqual(
  deployScript.cronJobScheduleStateForUpsert(
    {
      enabled: true,
      state: "scheduled",
      next_run_at: "2026-07-09T01:00:00Z",
    },
    "2026-07-09T02:00:00Z",
  ),
  {
    enabled: true,
    state: "scheduled",
    paused_at: null,
    paused_reason: null,
    next_run_at: "2026-07-09T01:00:00Z",
  },
);
assert.match(script, /cronJobScheduleStateForUpsert\(base, nextRun\(item\.firstDelayMinutes\)\)/);
assert.deepEqual(
  deployScript.parseDeployBackupName("20260621-144252-home-ai-android-v0412-status-force-light"),
  {
    timestamp: "20260621T144252Z",
    date: "2026-06-21",
    targetSlug: "home-ai",
  },
);
{
  const root = "/tmp/deploy";
  const entries = [
    "20260619T090000Z-plugin-music-old",
    "20260620T090000Z-plugin-music-first",
    "20260620T120000Z-plugin-music-latest",
    "20260621T090000Z-plugin-music-only",
    "20260622T090000Z-plugin-music-first",
    "20260622T125745Z-plugin-music-current",
    "20260621T090000Z-home-ai-first",
    "20260621T120000Z-home-ai-latest",
    "20260622T100000Z-plugin-codex-mobile-web-first",
    "20260622T110000Z-plugin-codex-mobile-web-latest",
    "20260621-090000-home-ai-old-format",
  ].map((name) => ({ name, path: `${root}/${name}` }));
  const selected = deployScript.selectDeployBackupsToPrune(
    entries,
    `${root}/20260622T125745Z-plugin-music-current`,
    3,
  );
  assert.equal(selected.cutoffDate, "2026-06-20");
  assert.deepEqual(selected.prune, [
    `${root}/20260619T090000Z-plugin-music-old`,
    `${root}/20260620T090000Z-plugin-music-first`,
    `${root}/20260621-090000-home-ai-old-format`,
    `${root}/20260621T090000Z-home-ai-first`,
    `${root}/20260622T090000Z-plugin-music-first`,
    `${root}/20260622T100000Z-plugin-codex-mobile-web-first`,
  ]);
  assert.match(selected.keep.join("\n"), /20260620T120000Z-plugin-music-latest/);
  assert.match(selected.keep.join("\n"), /20260621T120000Z-home-ai-latest/);
  assert.match(selected.keep.join("\n"), /20260622T110000Z-plugin-codex-mobile-web-latest/);
}

assert.match(contract, /Every plugin project must read this contract before any Mac production deploy/);
assert.match(contract, /\/Users\/hermes-dev\/HermesMobileDev\/app\/docs\/PLATFORM_CONTRACTS\/macos-dev-to-production-deployment-contract\.md/);
assert.match(contract, /Plugin deployment scripts or plugin Codex threads should call the central Home\s+AI deploy script/);
assert.match(contract, /cd \/Users\/hermes-dev\/HermesMobileDev\/app/);
assert.match(contract, /--source \/Users\/hermes-dev\/HermesMobileDev\/plugins\/<plugin-id>/);
assert.match(contract, /--restart-label <label>/);
assert.match(contract, /--health-url <url>/);
assert.match(contract, /--sync-only/);
assert.match(contract, /gateway-worker\/<plugin>-mcp/);
assert.match(contract, /selected Gateway callable-schema/);
assert.match(contract, /must not bypass it with a plugin-private\s+production write path/);
assert.match(contract, /\.codegraph/);
assert.match(contract, /must not reuse the source sync exclude list/);
assert.match(contract, /keep only the most recent three UTC\s+calendar days for each target/);
assert.match(contract, /within each target\/day keep only that day's\s+latest backup/);
assert.match(contract, /configured Home AI deploy lane pool/);
assert.match(contract, /installations may add live non-terminal lanes/);
assert.match(contract, /Codex Mobile Deploy Lane/);
assert.match(contract, /Movie Deploy Lane/);
assert.match(contract, /Plugin deployment cards must not expose or require a sudo password file/);
assert.match(contract, /plugin deployment card must not be a terminal return receipt/i);
assert.match(contract, /cardKind=plugin_deployment/);
assert.match(contract, /Routine plugin deploy cards to the ordinary Home AI implementation thread are a\s+routing error/);
assert.match(contract, /deploy lane pool is the only Home AI Codex target set expected to run central\s+plugin deploy execute\/readback/);
assert.match(contract, /At least one configured deploy lane must be discoverable and\s+non-terminal/);
assert.match(contract, /Ordinary\s+Home AI must not execute the plugin\s+deployment as a workaround/);
assert.match(contract, /Plugin task cards must not include these\s+paths or environment values/);
assert.match(contract, /Escalate to the ordinary Home AI implementation thread only when the missing\s+work is host\/platform owned/);

assert.match(pluginWorkspaceContract, /macos-dev-to-production-deployment-contract\.md/);
assert.match(pluginWorkspaceContract, /Plugin threads must read that file before production deploys/);
assert.match(pluginWorkspaceContract, /must not replace the central deploy path with a\s+plugin-private sudo\/rsync flow/);
assert.match(pluginWorkspaceContract, /npm run --silent deploy:macos -- --plugin <plugin-id>/);
assert.match(pluginWorkspaceContract, /Plugin-Prepared Deployment Closure And Task Cards/);
assert.match(pluginWorkspaceContract, /plugin thread must finish source implementation, focused\s+tests, commit\/push when applicable, deploy plan/);
assert.match(pluginWorkspaceContract, /Routine plugin production execute\/readback belongs to the configured Home AI\s+deploy lane pool/);
assert.match(pluginWorkspaceContract, /This is a hard routing boundary, not an\s+optimization preference/);
assert.match(pluginWorkspaceContract, /Deployment cards must not include raw sudo passwords, password-file paths/);
assert.match(pluginWorkspaceContract, /Deployment cards must be request-shaped/);
assert.match(pluginWorkspaceContract, /cardKind=plugin_deployment/);
assert.match(pluginWorkspaceContract, /target-thread: Home AI Deploy or configured deploy lane pool/);
assert.match(pluginWorkspaceContract, /live, discoverable, and\s+non-terminal/);
assert.match(autonomousDeliveryLoopContract, /routes one task card to the configured Home AI deploy lane pool/);
assert.match(autonomousDeliveryLoopContract, /do not receive sudo\s+password-file paths/);
assert.match(deploymentDoc, /--sync-only/);
assert.match(deploymentDoc, /Backup rsync uses a narrower exclude list/);
assert.match(deploymentDoc, /volatile derived production-app paths/);
assert.match(deploymentDoc, /gateway-worker\/<plugin>-mcp/);
assert.match(deploymentDoc, /gateway-worker\/moira-mcp/);
assert.match(productionAccess, /--sync-only/);

assert.match(pluginsDoc, /Plugin Codex threads must read that central contract before production deploys/);
assert.match(pluginsDoc, /must not introduce a separate sudo, rsync,\s+SSH, or production\s+write-access path/);
assert.match(pluginsDoc, /Routine production execute\/readback\s+is routed to the configured Home AI deploy lane pool/);
assert.match(pluginsDoc, /Routine plugin deployment cards must target the deploy lane pool/);
assert.match(deploymentDoc, /At least one configured deploy lane must remain live and operational/);
assert.match(deploymentDoc, /routine plugin deployment card must be a request card, not a terminal\s+receipt/i);
assert.match(productionAccess, /Plugin workspaces should read the central deployment contract before deploys/);
assert.match(productionAccess, /\/Users\/hermes-dev\/HermesMobileDev\/app/);

const dryRun = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--source",
  repoRoot,
  "--dev-root",
  path.dirname(repoRoot),
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(dryRun.status, 0, dryRun.stderr);
const payload = JSON.parse(dryRun.stdout);
assert.equal(payload.ok, true);
assert.equal(payload.plan.mode, "plan");
assert.equal(payload.plan.target, "home-ai");
assert.equal(payload.plan.surface, "full");
assert.equal(payload.plan.sourcePath, repoRoot);
assert.equal(payload.plan.productionPath, "/Users/example/path");
assert.match(payload.plan.backupPath, /20260608T000000Z-home-ai-harness$/);
assert.ok(payload.plan.rsyncExcludes.includes("AGENTS.md"));
assert.ok(payload.plan.rsyncExcludes.includes(".git"));
assert.ok(payload.plan.rsyncExcludes.includes(".codegraph/"));
assert.ok(deployScript.BACKUP_RSYNC_EXCLUDES.includes("gateway-runtime-overrides/__pycache__/"));
assert.ok(deployScript.BACKUP_RSYNC_EXCLUDES.includes("workspace/public-export/"));
const backupRsyncArgs = deployScript.buildRsyncArgs(
  deployScript.BACKUP_RSYNC_EXCLUDES,
  "/prod/app/",
  "/backup/app/",
);
function assertRsyncExclude(args, pattern) {
  const index = args.indexOf(pattern);
  assert.ok(index > 0, `missing rsync exclude ${pattern}`);
  assert.equal(args[index - 1], "--exclude");
}
assertRsyncExclude(backupRsyncArgs, "gateway-runtime-overrides/__pycache__/");
assertRsyncExclude(backupRsyncArgs, "workspace/public-export/");
assert.equal(payload.plan.productionOwner, "hermes-host:staff");
assert.deepEqual(payload.plan.restartLabels, ["com.hermesmobile.bridge-host", "com.hermesmobile.cron", "com.hermesmobile.listener", "com.hermesmobile.workspace-system-helper"]);
assert.ok(payload.plan.expectedClientVersion);
assert.ok(payload.plan.proofFiles.includes("scripts/deploy-macos-production.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/install-macos-production.sh"));
assert.ok(payload.plan.proofFiles.includes("adapters/ai-ops-diagnostic-intake-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/automation-cron-profile-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/owner-3a-quality-evidence-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/owner-3a-quality-program-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/owner-system-console-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/plugin-action-metadata-closure-service.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/web-push-send-service.js"));
assert.ok(payload.plan.proofFiles.includes("cron_bridge.py"));
assert.ok(payload.plan.proofFiles.includes("server-routes/automation-api-routes.js"));
assert.ok(payload.plan.proofFiles.includes("server-routes/mobile-api-platform-composition.js"));
assert.ok(payload.plan.proofFiles.includes("server-routes/owner-system-console-api-routes.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-automation-cron-audit.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/plugin-workspace-audit-runner.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-gateway-start-script-bridge-env-repair.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-production-profile-audit.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-production-drift-reconcile.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/homeai-production-drift-audit-watchdog.sh"));
assert.ok(payload.plan.proofFiles.includes("scripts/homeai-install-upgrade-canary.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/homeai-self-improving-loop.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/plugin-daily-progress-rollup.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/plugin-action-metadata-closure-smoke.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/homeai-self-improving-loop-cron.sh"));
assert.ok(payload.plan.proofFiles.includes("scripts/plugin-daily-progress-rollup-cron.sh"));
assert.ok(payload.plan.proofFiles.includes("scripts/gateway-mcp-runtime-call-smoke.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/mcp-tool-upgrade-closure-smoke.js"));
assert.equal(payload.plan.cronProfileAliases.type, "home-ai-cron-profile-aliases");
assert.equal(payload.plan.cronProfileAliases.manifestPath, "/Users/example/path");
assert.equal(payload.plan.cronProfileAliases.profilesRoot, "/Users/example/path");
assert.deepEqual(payload.plan.cronProfileAliases.aliases, []);
assert.ok(payload.plan.validation.some((item) => item.type === "production-file-hashes"));
const statusSmoke = payload.plan.validation.find((item) => item.type === "home-ai-status-smoke");
assert.ok(statusSmoke.command.includes("--expected-version"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-status-smoke"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-automation-cron-audit"));
const cronAudit = payload.plan.validation.find((item) => item.type === "home-ai-automation-cron-audit");
assert.ok(cronAudit.command.includes("--strict-config"));
assert.ok(cronAudit.command.includes("--strict-source"));
assert.ok(cronAudit.command.includes("--strict-status"));
assert.ok(cronAudit.command.includes("--status-since"));
assert.ok(cronAudit.command.includes("2026-06-08T00:00:00Z"));
assert.ok(payload.plan.validation.some((item) => item.type === "codex-auth-profile-audit"));
const driftAudit = payload.plan.validation.find((item) => item.type === "home-ai-production-drift-audit");
assert.ok(driftAudit);
assert.ok(driftAudit.command.some((item) => String(item).endsWith("macos-production-profile-audit.js")));
assert.ok(driftAudit.command.includes("--no-strict"));
const owner3aEvidenceSeed = payload.plan.validation.find((item) => item.type === "owner-3a-quality-evidence-seed");
assert.ok(owner3aEvidenceSeed);
assert.equal(
  owner3aEvidenceSeed.outputFile,
  "/Users/example/path",
);
assert.match(script, /HOMEAI_TTS_PROVIDER/);
assert.match(script, /HOMEAI_TTS_COSYVOICE_PYTHON/);
assert.match(script, /HOMEAI_TTS_COSYVOICE_MODEL_DIR/);
assert.match(script, /HOMEAI_TTS_COSYVOICE_CACHE_DIR/);
assert.match(script, /HOME_AI_TTS_COSYVOICE_INSTALLED/);
assert.match(script, /Fun-CosyVoice3-0\.5B/);
assert.match(script, /ttsCosyVoiceConfigured/);
assert.equal(driftAudit.failOnAnyIssue, true);
assert.equal(driftAudit.failOnIssuePrefixes, undefined);
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.bridge-host")));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.cron")));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.listener")));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.workspace-system-helper")));

const bridgeHostPlist = deployScript.buildHomeAiBridgeHostLaunchdPlist("/Users/example/path");
assert.match(bridgeHostPlist, /<string>com\.hermesmobile\.bridge-host<\/string>/);
assert.match(bridgeHostPlist, /<string>hermes-host<\/string>/);
assert.match(bridgeHostPlist, /\/Users\/hermes-host\/HermesMobile\/runtime\/node-current\/bin\/node/);
assert.match(bridgeHostPlist, /\/Users\/hermes-host\/HermesMobile\/app\/scripts\/bridge-host\.js/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_BRIDGE_HOST_PORT/);
assert.match(bridgeHostPlist, /<string>8798<\/string>/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH/);
assert.match(bridgeHostPlist, /bridge-host\.secret/);
assert.match(bridgeHostPlist, /HERMES_WEB_CRON_JOBS_PATH/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_CHATGPT_PRO_WORKSPACE/);
assert.match(bridgeHostPlist, /\/Users\/hermes-dev\/HermesMobileDev\/app/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL/);
assert.match(bridgeHostPlist, /<string>http:\/\/127\.0\.0\.1:8787<\/string>/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE/);
assert.match(bridgeHostPlist, /\/Users\/xuxin\/\.codex-mobile-web\/access_key/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR/);
assert.match(bridgeHostPlist, /\/Users\/xuxin\/\.codex-mobile-web\/outputs\/chatgpt-pro/);
assert.match(bridgeHostPlist, /<key>KeepAlive<\/key>\s*<true\/>/);

const driftAuditPlist = deployScript.buildHomeAiProductionDriftAuditLaunchdPlist("/Users/example/path");
assert.match(driftAuditPlist, /<string>com\.hermesmobile\.production-drift-audit<\/string>/);
assert.match(driftAuditPlist, /homeai-production-drift-audit-watchdog\.sh/);
assert.match(driftAuditPlist, /<integer>900<\/integer>/);
assert.match(driftAuditPlist, /HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR/);
assert.match(driftAuditPlist, /HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR/);
assert.match(driftAuditPlist, /<string>1<\/string>/);

const cronPlist = deployScript.buildHomeAiCronLaunchdPlist("/Users/example/path");
assert.match(cronPlist, /<string>com\.hermesmobile\.cron<\/string>/);
assert.match(cronPlist, /<integer>60<\/integer>/);
assert.match(cronPlist, /<string>hermes-host<\/string>/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/runtime\/hermes-agent-official\/venv\/bin\/python/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/app\/scripts\/hermes-mobile-cron-dispatcher\.py/);
assert.match(cronPlist, /HERMES_WEB_CRON_JOBS_PATH/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/data\/hermes-home\/cron\/jobs\.json/);
assert.match(cronPlist, /<key>HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED<\/key>\s*<string>0<\/string>/);
assert.match(cronPlist, /<key>HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND<\/key>\s*<string>codex<\/string>/);
assert.match(cronPlist, /<key>HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME<\/key>\s*<string><\/string>/);
assert.doesNotMatch(cronPlist, /PLUGIN_WORKSPACE_AUDIT_TASK_CARD_CONFIG_FILE/);
assert.match(cronPlist, /<key>CODEX_MOBILE_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:8787<\/string>/);
assert.match(cronPlist, /<key>CODEX_MOBILE_KEY_FILE<\/key>\s*<string>\/Users\/hermes-host\/HermesMobile\/data\/secrets\/codex-mobile-access-key\.secret<\/string>/);
assert.match(cronPlist, /<key>HERMES_CRON_SCRIPT_TIMEOUT<\/key>\s*<string>1800<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_TRANSPORT<\/key>\s*<string>auto<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_TARGET<\/key>\s*<string>xuxinxp@192\.168\.10\.99<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_DESTINATION<\/key>\s*<string>\/volume1\/备份\/HomeAI-Production-Backups\/mac-production<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_OPTIONS<\/key>\s*<string>-p 2222 -i \/Users\/hermes-host\/\.ssh\/homeai_nas_backup_ed25519<\/string>/);

const launchdReloadScript = deployScript.buildSystemLaunchdReloadScript(
  "com.hermesmobile.bridge-host",
  "/Library/LaunchDaemons/com.hermesmobile.bridge-host.plist",
);
assert.match(launchdReloadScript, /launchctl bootout system "\$plist"/);
assert.match(launchdReloadScript, /launchctl bootout "system\/\$label"/);
assert.match(launchdReloadScript, /launchctl bootstrap system "\$plist"/);
assert.match(launchdReloadScript, /launchctl print "system\/\$label"/);
assert.match(launchdReloadScript, /already_loaded=1/);
assert.match(launchdReloadScript, /launchctl kickstart -k "system\/\$label"/);
assert.match(launchdReloadScript, /labelBootoutStatus/);
assert.match(launchdReloadScript, /fallbackKickstartStatus/);
assert.match(launchdReloadScript, /fallbackPrintStatus/);
assert.match(launchdReloadScript, /exit "\$bootstrap_status"/);

const pluginWorkspaceAuditTargets = JSON.parse(deployScript.buildPluginWorkspaceAuditTargetJson("/Users/example/path"));
assert.equal(pluginWorkspaceAuditTargets["home-ai"], "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets["codex-mobile"], "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.finance, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.health, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.music, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.wardrobe, "/Users/example/path");

assert.deepEqual(
  deployScript.gatewayManifestWorkerUsers({
    workers: [
      { osUser: "hm-owner", enabled: true },
      { osUser: "hm-owner", enabled: true },
      { osUser: "hm-media", enabled: false },
      { osUser: "bad user", enabled: true },
      { os_user: "hm-wuping" },
    ],
  }),
  ["hm-owner", "hm-wuping"],
);

const cronAliasPlan = deployScript.buildHomeAiCronProfileAliasPlan("/Users/example/path", {
  workers: [
    {
      profile: "hm-owner-openai-1",
      enabled: true,
      provider: "openai-codex",
      securityLevel: "user",
      toolsets: ["email", "file", "skills", "cronjob_mobile"],
      configPath: "/Users/example/path",
    },
    {
      profile: "hm-owner-openai-2",
      enabled: false,
      securityLevel: "user",
      toolsets: ["cronjob_mobile"],
      configPath: "/Users/example/path",
    },
    {
      profile: "officialclean1",
      enabled: true,
      securityLevel: "owner-maintenance",
      toolsets: ["cronjob_mobile"],
      configPath: "/Users/example/path",
    },
    {
      profile: "hm-owner-openai-no-cron",
      enabled: true,
      securityLevel: "user",
      toolsets: ["email", "file", "skills"],
      configPath: "/Users/example/path",
    },
  ],
});
assert.equal(cronAliasPlan.type, "home-ai-cron-profile-aliases");
assert.deepEqual(cronAliasPlan.aliases.map((item) => item.profile), ["hm-owner-openai-1"]);
assert.equal(
  cronAliasPlan.aliases[0].sourceDir,
  "/Users/example/path",
);
assert.equal(
  cronAliasPlan.aliases[0].aliasPath,
  "/Users/example/path",
);
assert.ok(cronAliasPlan.aliases[0].ancestorDirs.includes("/Users/example/path"));
assert.equal(cronAliasPlan.aliases[0].workspaceRoot, "/Users/example/path");
assert.ok(cronAliasPlan.aliases[0].pluginBindingDirs.includes("/Users/example/path"));
assert.ok(cronAliasPlan.aliases[0].pluginBindingDirs.includes("/Users/example/path"));

const xhighConfig = deployScript.buildHomeAiVisualAnalysisProfileConfig(`model:
  default: gpt-5.5
  provider: openai-codex
agent:
  max_turns: 60
  reasoning_effort: medium
`);
assert.match(xhighConfig, /model:\n  default: gpt-5\.5\n  provider: openai-codex/);
assert.match(xhighConfig, /agent:\n  max_turns: 60\n  reasoning_effort: xhigh/);

const fixtureDevRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-deploy-fixtures-"));
function createPluginFixture(pluginId, files = {}) {
  const source = path.join(fixtureDevRoot, "plugins", pluginId);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), `{"name":"${pluginId}-fixture"}\n`);
  for (const [relPath, body] of Object.entries(files)) {
    const filePath = path.join(source, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
  }
  return source;
}
for (const pluginId of ["finance", "healthy", "moira", "wardrobe"]) {
  createPluginFixture(pluginId);
}
createPluginFixture("codex-mobile-web", {
  "public/index.html": "<html></html>\n",
  "codex-app-server-mux.js": "\"use strict\";\n",
  "scripts/create-thread-task-card.js": "\"use strict\";\n",
});
createPluginFixture("email", { "dist/web/index.html": "<html></html>\n" });
createPluginFixture("growth", { "public/index.html": "<html></html>\n" });
createPluginFixture("music", { "dist/web/index.html": "<html></html>\n" });
createPluginFixture("note", { "public/index.html": "<html></html>\n" });
const movieFixtureSource = path.join(fixtureDevRoot, "Movie");
fs.mkdirSync(path.join(movieFixtureSource, "public"), { recursive: true });
fs.writeFileSync(path.join(movieFixtureSource, "package.json"), "{\"name\":\"movie-fixture\"}\n");
fs.writeFileSync(path.join(movieFixtureSource, "public", "index.html"), "<html></html>\n");

const staticRun = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--source",
  repoRoot,
  "--dev-root",
  path.dirname(repoRoot),
  "--surface",
  "static",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(staticRun.status, 0, staticRun.stderr);
const staticPayload = JSON.parse(staticRun.stdout);
assert.equal(staticPayload.plan.surface, "static");
assert.deepEqual(staticPayload.plan.sync, [{ source: "public/", target: "public/" }]);
assert.ok(staticPayload.plan.proofFiles.every((item) => item.startsWith("public/")));

const staticPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "finance",
  "--surface",
  "static",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(staticPluginRun.status, 0);
assert.match(staticPluginRun.stderr, /static_surface_requires_home_ai_target/);

const pluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "finance",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(pluginRun.status, 0, pluginRun.stderr);
const pluginPayload = JSON.parse(pluginRun.stdout);
assert.equal(pluginPayload.plan.target, "plugin:finance");
assert.equal(pluginPayload.plan.sourcePath, path.join(fixtureDevRoot, "plugins", "finance"));
assert.equal(pluginPayload.plan.productionPath, "/Users/example/path");
assert.equal(pluginPayload.plan.productionOwner, "hermes-host:staff");
assert.deepEqual(pluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.finance"]);
assert.equal(pluginPayload.plan.healthUrl, "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest");
assert.ok(pluginPayload.plan.validation.some((item) => item.type === "health-url"));
assert.ok(pluginPayload.plan.validation.some((item) => item.type === "codex-auth-profile-audit"));
assert.equal(
  deployScript.shouldRepairCodexSharedAuthPermissions(pluginPayload.plan),
  true,
);
assert.ok(pluginPayload.plan.rsyncExcludes.includes("/data/"));
assert.ok(pluginPayload.plan.rsyncExcludes.includes("/runtime/"));
assert.ok(pluginPayload.plan.rsyncExcludes.includes(".git"));
assert.ok(pluginPayload.plan.rsyncExcludes.includes(".venv/"));
assert.ok(deployScript.BACKUP_RSYNC_EXCLUDES.includes(".codegraph/"));
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes("/data/"), false);
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes("/runtime/"), false);
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes(".venv/"), false);
assert.deepEqual(
  deployScript.buildRsyncArgs([".codegraph/", ".codex/"], "/prod/plugin/", "/backup/plugin/"),
  ["-a", "--delete", "--checksum", "--exclude", ".codegraph/", "--exclude", ".codex/", "/prod/plugin/", "/backup/plugin/"],
);
assert.deepEqual(
  deployScript.buildRsyncArgs(pluginPayload.plan.rsyncExcludes, "/dev/plugin/", "/prod/plugin/")
    .slice(0, 9),
  ["-a", "--delete", "--checksum", "--exclude", ".git", "--exclude", ".git/", "--exclude", ".codegraph/"],
);
assert.ok(
  deployScript.buildRsyncArgs(pluginPayload.plan.rsyncExcludes, "/dev/plugin/", "/prod/plugin/")
    .includes("/runtime/"),
);
assert.equal(
  deployScript.isDeploySurfaceIncluded("services/runtime/runtime-job-scheduler-service.js", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  true,
);
assert.equal(
  deployScript.isDeploySurfaceIncluded("runtime/cache-state.json", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  false,
);
assert.equal(
  deployScript.isDeploySurfaceIncluded("data/plugin.sqlite", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  false,
);
assert.equal(
  deployScript.isDeploySurfaceIncluded("services/data/schema.js", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  true,
);
assert.equal(
  deployScript.isDeploySurfaceIncluded(".agent-context/HANDOFF.md", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  false,
);
assert.equal(
  deployScript.isDeploySurfaceIncluded("src/node_modules/pkg/index.js", {
    target: "plugin:codex-mobile-web",
    surface: "full",
  }),
  false,
);

const emailPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "email",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(emailPluginRun.status, 0, emailPluginRun.stderr);
const emailPluginPayload = JSON.parse(emailPluginRun.stdout);
assert.deepEqual(emailPluginPayload.plan.proofFiles, ["dist/web/index.html"]);
assert.ok(emailPluginPayload.plan.validation.some((item) => (
  item.type === "production-file-hashes"
  && item.files.includes("dist/web/index.html")
)));
assert.equal(
  emailPluginPayload.plan.validation.some((item) => item.type === deployScript.CODEX_MOBILE_LISTENER_STARTUP_GATE.type),
  false,
);
assert.equal(
  emailPluginPayload.plan.validation.some((item) => item.type === deployScript.CODEX_MOBILE_BEHAVIOR_GATE.type),
  false,
);

const codexSelectedMuxPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(codexSelectedMuxPluginRun.status, 0, codexSelectedMuxPluginRun.stderr);
const codexSelectedMuxPluginPayload = JSON.parse(codexSelectedMuxPluginRun.stdout);
assert.equal(codexSelectedMuxPluginPayload.plan.target, "plugin:codex-mobile-web");
const codexListenerStartupGate = codexSelectedMuxPluginPayload.plan.validation.find((item) => (
  item.type === deployScript.CODEX_MOBILE_LISTENER_STARTUP_GATE.type
));
assert.ok(codexListenerStartupGate);
assert.deepEqual(codexListenerStartupGate.command.slice(0, 2), ["/bin/sh", "-lc"]);
assert.match(codexListenerStartupGate.command[2], /cd '\/Users\/hermes-host\/HermesMobile\/plugins\/codex-mobile-web'/);
assert.match(codexListenerStartupGate.command[2], /scripts\/codex-mobile-runtime-self-check-loop\.js/);
assert.match(codexListenerStartupGate.command[2], /--server 'http:\/\/127\.0\.0\.1:8787'/);
assert.match(codexListenerStartupGate.command[2], /--gate-mode deploy/);
assert.match(codexListenerStartupGate.command[2], /--browser-mode full/);
assert.match(codexListenerStartupGate.command[2], /--browser-startup-only/);
assert.match(codexListenerStartupGate.command[2], /--skip-api/);
assert.match(codexListenerStartupGate.command[2], /--skip-client-events/);
assert.match(codexListenerStartupGate.command[2], /--json/);
assert.equal(codexListenerStartupGate.startupOnly, true);
assert.equal(codexListenerStartupGate.scope, "listener_startup");
const codexBehaviorGate = codexSelectedMuxPluginPayload.plan.validation.find((item) => (
  item.type === deployScript.CODEX_MOBILE_BEHAVIOR_GATE.type
));
assert.ok(codexBehaviorGate);
assert.deepEqual(codexBehaviorGate.command.slice(0, 2), ["/bin/sh", "-lc"]);
assert.match(codexBehaviorGate.command[2], /cd '\/Users\/hermes-host\/HermesMobile\/plugins\/codex-mobile-web'/);
assert.match(codexBehaviorGate.command[2], /scripts\/codex-mobile-runtime-self-check-loop\.js/);
assert.match(codexBehaviorGate.command[2], /--server 'http:\/\/127\.0\.0\.1:8787'/);
assert.match(codexBehaviorGate.command[2], /--gate-mode deploy/);
assert.match(codexBehaviorGate.command[2], /--browser-mode full/);
assert.doesNotMatch(codexBehaviorGate.command[2], /--browser-startup-only/);
assert.doesNotMatch(codexBehaviorGate.command[2], /--skip-api/);
assert.doesNotMatch(codexBehaviorGate.command[2], /--skip-client-events/);
assert.match(codexBehaviorGate.command[2], /--json/);
assert.equal(codexBehaviorGate.startupOnly, false);
assert.equal(codexBehaviorGate.scope, "thread_detail_render_events");
assert.deepEqual(codexBehaviorGate.submitExercise, {
  mode: "manual",
  configured: false,
  reason: "controlled_submit_thread_not_configured",
  operatorCommandHint: "--codex-mobile-submit-thread-id <controlled-thread-id>",
});
const codexValidationTypes = codexSelectedMuxPluginPayload.plan.validation.map((item) => item.type);
assert.ok(codexValidationTypes.indexOf("health-url") < codexValidationTypes.indexOf(deployScript.CODEX_MOBILE_LISTENER_STARTUP_GATE.type));
assert.ok(codexValidationTypes.indexOf(deployScript.CODEX_MOBILE_LISTENER_STARTUP_GATE.type) < codexValidationTypes.indexOf(deployScript.CODEX_MOBILE_BEHAVIOR_GATE.type));
assert.ok(codexValidationTypes.indexOf(deployScript.CODEX_MOBILE_BEHAVIOR_GATE.type) < codexValidationTypes.indexOf("codex-auth-profile-audit"));
const codexSubmitExercisePluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--codex-mobile-submit-thread-id",
  "thread_controlled_submit_fixture",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(codexSubmitExercisePluginRun.status, 0, codexSubmitExercisePluginRun.stderr);
const codexSubmitExercisePayload = JSON.parse(codexSubmitExercisePluginRun.stdout);
const codexSubmitExerciseBehaviorGate = codexSubmitExercisePayload.plan.validation.find((item) => (
  item.type === deployScript.CODEX_MOBILE_BEHAVIOR_GATE.type
));
assert.ok(codexSubmitExerciseBehaviorGate);
assert.match(codexSubmitExerciseBehaviorGate.command[2], /--browser-exercise-submit/);
assert.match(codexSubmitExerciseBehaviorGate.command[2], /--browser-submit-thread-id 'thread_controlled_submit_fixture'/);
assert.deepEqual(codexSubmitExerciseBehaviorGate.submitExercise, {
  mode: "automatic",
  configured: true,
  threadId: "thread_controlled_submit_fixture",
  privacy: "controlled_thread_id_only",
});
assert.deepEqual(
  codexSelectedMuxPluginPayload.plan.postSyncRepairs.map((item) => item.type),
  ["codex-mobile-log-permissions", "codex-mobile-selected-mux-refresh"],
);
const selectedMuxRefresh = codexSelectedMuxPluginPayload.plan.postSyncRepairs.find((item) => item.type === "codex-mobile-selected-mux-refresh");
assert.ok(selectedMuxRefresh.triggerFiles.includes("codex-app-server-mux.js"));
assert.ok(selectedMuxRefresh.triggerFiles.includes("restart-codex-mobile-host-macos.sh"));
assert.ok(selectedMuxRefresh.triggerFiles.includes("adapters/shared-chain-restart-service.js"));
assert.ok(codexSelectedMuxPluginPayload.plan.proofFiles.includes("codex-app-server-mux.js"));
assert.equal(deployScript.codexMobileMuxRefreshReasonRequiresForce("codex-mobile-v538-selected-mux-runtime"), true);
assert.equal(deployScript.codexMobileMuxRefreshReasonRequiresForce("routine-doc-update"), false);
assert.deepEqual(
  deployScript.codexMobileSelectedMuxRefreshDecision({
    changedFiles: [],
    state: { status: "pending" },
    reason: "retry-after-post-sync-failure",
  }),
  { required: true, reason: "previous_selected_mux_refresh_incomplete" },
);
assert.deepEqual(
  deployScript.codexMobileSelectedMuxRefreshDecision({
    changedFiles: [],
    state: {},
    reason: "codex-mobile-v538-selected-mux-runtime",
  }),
  { required: true, reason: "deploy_reason_forces_selected_mux_refresh" },
);
const listenerStartupGatePass = deployScript.codexMobileListenerStartupGateSummary({
  ok: true,
  gate: {
    deployPass: true,
    checkNames: ["browser-runtime"],
  },
  browserMode: "full",
  browserStartupOnly: true,
  issueCount: 0,
  blockingIssueCount: 0,
  executionFailureCount: 0,
  skippedJobs: ["api", "client-events"],
  clientBuildId: "0.1.11|codex-mobile-shell-v614",
  shellCacheName: "codex-mobile-shell-v614",
}, 0);
deployScript.assertCodexMobileListenerStartupGatePass(listenerStartupGatePass);
assert.deepEqual(listenerStartupGatePass.actionableIssueCodes, []);
assert.deepEqual(listenerStartupGatePass.enabledJobs, ["browser-runtime"]);
assert.deepEqual(listenerStartupGatePass.skippedJobs, ["api", "client-events"]);

const behaviorGatePass = deployScript.codexMobileBehaviorGateSummary({
  ok: true,
  gate: {
    deployPass: true,
    checkNames: ["api", "browser-runtime", "client-events"],
  },
  browserMode: "full",
  browserStartupOnly: false,
  issueCount: 0,
  blockingIssueCount: 0,
  executionFailureCount: 0,
  clientBuildId: "0.1.11|codex-mobile-shell-v614",
  shellCacheName: "codex-mobile-shell-v614",
}, 0, {
  submitExercise: deployScript.codexMobileBehaviorSubmitExercisePlan({}),
});
deployScript.assertCodexMobileBehaviorGatePass(behaviorGatePass);
assert.equal(behaviorGatePass.browserStartupOnly, false);
assert.equal(behaviorGatePass.submitExercise.mode, "manual");
assert.deepEqual(behaviorGatePass.enabledJobs, ["api", "browser-runtime", "client-events"]);

const behaviorGateStartupOnly = deployScript.codexMobileBehaviorGateSummary({
  ok: true,
  deployPass: true,
  browserStartupOnly: true,
}, 0);
assert.throws(
  () => deployScript.assertCodexMobileBehaviorGatePass(behaviorGateStartupOnly),
  /codex-mobile-behavior-gate_failed:codex_mobile_behavior_gate_startup_only/,
);

const listenerStartupGateBlocking = deployScript.codexMobileListenerStartupGateSummary({
  ok: false,
  deployPass: false,
  issueCount: 1,
  blockingIssueCount: 1,
  actionableIssueCodes: ["browser_startup_exception"],
}, 0);
assert.throws(
  () => deployScript.assertCodexMobileListenerStartupGatePass(listenerStartupGateBlocking),
  /codex-mobile-listener-startup-gate_failed:browser_startup_exception/,
);

const listenerStartupGateUnavailable = deployScript.codexMobileListenerStartupGateSummary({
  ok: false,
  deployPass: false,
  executionFailureCount: 1,
}, 1);
assert.throws(
  () => deployScript.assertCodexMobileListenerStartupGatePass(listenerStartupGateUnavailable),
  /codex-mobile-listener-startup-gate_failed:browser_startup_smoke_unavailable/,
);
assert.deepEqual(
  deployScript.codexMobileSelectedMuxRefreshDecision({
    changedFiles: [],
    state: {},
    reason: "routine-no-change",
  }),
  { required: false, reason: "no_mux_runtime_change" },
);
assert.deepEqual(
  deployScript.codexMobileSelectedMuxRefreshDecision({
    changedFiles: ["codex-app-server-mux.js"],
    state: {},
    reason: "routine",
  }),
  { required: true, reason: "mux_runtime_files_changed" },
);

const tempPluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-plugin-proof-"));
const tempEmailSource = path.join(tempPluginRoot, "plugins", "email");
fs.mkdirSync(tempEmailSource, { recursive: true });
fs.writeFileSync(path.join(tempEmailSource, "package.json"), "{\"name\":\"email-fixture\"}\n");
const missingEmailProofRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "email",
  "--source",
  tempEmailSource,
  "--dev-root",
  tempPluginRoot,
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(missingEmailProofRun.status, 0);
assert.match(missingEmailProofRun.stderr, /plugin_proof_file_missing:email:dist\/web\/index\.html/);

const healthAliasPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "health",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(healthAliasPluginRun.status, 0, healthAliasPluginRun.stderr);
const healthAliasPayload = JSON.parse(healthAliasPluginRun.stdout);
assert.equal(healthAliasPayload.plan.target, "plugin:healthy");
assert.equal(healthAliasPayload.plan.sourcePath, path.join(fixtureDevRoot, "plugins", "healthy"));
assert.equal(healthAliasPayload.plan.productionPath, "/Users/example/path");
assert.deepEqual(healthAliasPayload.plan.restartLabels, ["com.hermesmobile.plugin.health"]);
assert.equal(healthAliasPayload.plan.healthUrl, "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest");

const moviePluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "movie",
  "--source",
  movieFixtureSource,
  "--dev-root",
  fixtureDevRoot,
  "--restart-label",
  "com.hermesmobile.plugin.movie",
  "--health-url",
  "http://127.0.0.1:4195/api/v1/hermes/plugin/manifest",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(moviePluginRun.status, 0, moviePluginRun.stderr);
const moviePluginPayload = JSON.parse(moviePluginRun.stdout);
assert.equal(moviePluginPayload.plan.target, "plugin:movie");
assert.equal(moviePluginPayload.plan.productionPath, "/Users/example/path");
assert.deepEqual(moviePluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.movie"]);
assert.equal(moviePluginPayload.plan.healthUrl, "http://127.0.0.1:4195/api/v1/hermes/plugin/manifest");
assert.deepEqual(moviePluginPayload.plan.proofFiles, ["public/index.html"]);
assert.ok(moviePluginPayload.plan.rsyncExcludes.includes("/data/"));
assert.ok(moviePluginPayload.plan.rsyncExcludes.includes("/runtime/"));
assert.equal(moviePluginPayload.plan.postSyncMirrors.length, 2);
assert.deepEqual(
  moviePluginPayload.plan.postSyncMirrors.map((item) => [item.kind || "file", item.target]),
  [
    ["directory", "gateway-worker/movie-mcp/src"],
    ["file", "gateway-worker/movie-mcp/package.json"],
  ],
);
assert.ok(moviePluginPayload.plan.postSyncMirrors.every((item) => item.type === "gateway-mcp-worker-asset"));
assert.ok(moviePluginPayload.plan.postSyncMirrors.every((item) => item.plugin === "movie"));
assert.ok(moviePluginPayload.plan.validation.some((item) => (
  item.type === "production-file-hashes"
  && item.files.includes("public/index.html")
)));

const wardrobePluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "wardrobe",
  "--dev-root",
  fixtureDevRoot,
  "--restart-label",
  "com.hermesmobile.plugin.wardrobe",
  "--health-url",
  "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(wardrobePluginRun.status, 0, wardrobePluginRun.stderr);
const wardrobePluginPayload = JSON.parse(wardrobePluginRun.stdout);
assert.equal(wardrobePluginPayload.plan.target, "plugin:wardrobe");
assert.equal(wardrobePluginPayload.plan.productionPath, "/Users/example/path");
assert.deepEqual(wardrobePluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.wardrobe"]);
assert.equal(wardrobePluginPayload.plan.healthUrl, "http://127.0.0.1:8765/api/v1/hermes/plugin/manifest");
assert.equal(wardrobePluginPayload.plan.postSyncMirrors.length, 2);
assert.deepEqual(
  wardrobePluginPayload.plan.postSyncMirrors.map((item) => [item.kind || "file", item.target]),
  [
    ["directory", "gateway-worker/wardrobe-mcp/scripts"],
    ["directory", "gateway-worker/wardrobe-mcp/wardrobe_app"],
  ],
);
assert.ok(wardrobePluginPayload.plan.postSyncMirrors.every((item) => item.type === "gateway-mcp-worker-asset"));
assert.ok(wardrobePluginPayload.plan.postSyncMirrors.every((item) => item.plugin === "wardrobe"));

const codexPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(codexPluginRun.status, 0, codexPluginRun.stderr);
const codexPluginPayload = JSON.parse(codexPluginRun.stdout);
assert.equal(codexPluginPayload.plan.productionOwner, "xuxin:staff");
assert.deepEqual(codexPluginPayload.plan.proofFiles, [
  "public/index.html",
  "codex-app-server-mux.js",
  "scripts/create-thread-task-card.js",
]);
assert.deepEqual(codexPluginPayload.plan.postSyncRepairs, [
  {
    type: "codex-mobile-log-permissions",
    serviceUser: "xuxin",
    serviceGroup: "staff",
    launchdLabel: "com.hermesmobile.plugin.codex-mobile",
    launchdPlistPath: "/Library/LaunchDaemons/com.hermesmobile.plugin.codex-mobile.plist",
    runtimeLogRoot: "/Users/example/path",
    runtimeRoot: "/Users/example/path",
    profileFile: "/Users/example/path",
    muxMode: "persistent-owned-shared",
    requireSharedAppServer: "1",
    persistOwnedMux: "1",
    disableOwnedMux: "0",
    logFiles: [
      "codex-mobile-web.out.log",
      "codex-mobile-web.err.log",
    ],
    directoryMode: "700",
    fileMode: "600",
  },
  {
    type: "codex-mobile-selected-mux-refresh",
    serviceUser: "xuxin",
    runtimeRoot: "/Users/example/path",
    profileFile: "/Users/example/path",
    triggerFiles: [
      "codex-app-server-mux.js",
      "restart-codex-mobile-host-macos.sh",
      "adapters/shared-chain-restart-service.js",
    ],
  },
]);

const tempCodexWrongSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-codex-wrong-source-"));
const tempCodexWrongSource = path.join(tempCodexWrongSourceRoot, "plugins", "codex-mobile-web");
fs.mkdirSync(path.join(tempCodexWrongSource, "public"), { recursive: true });
fs.writeFileSync(path.join(tempCodexWrongSource, "public", "index.html"), "<html></html>\n");
fs.writeFileSync(path.join(tempCodexWrongSource, "server.js"), "require('./mobile-server-runtime');\n");
const wrongCodexSourceRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
  "--source",
  tempCodexWrongSource,
  "--dev-root",
  tempCodexWrongSourceRoot,
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(wrongCodexSourceRun.status, 0);
assert.match(wrongCodexSourceRun.stderr, /plugin_proof_file_missing:codex-mobile-web:codex-app-server-mux\.js/);

const financeRepairPlan = deployScript.postSyncRepairsForTarget({ target: "plugin:finance" });
assert.equal(financeRepairPlan[0].type, "finance-launchd-workspace-key-hashes");
assert.equal(financeRepairPlan[0].launchdLabel, "com.hermesmobile.plugin.finance");
assert.equal(financeRepairPlan[0].installerRelativePath, "scripts/install-finance-launchd-service.js");
assert.equal(
  deployScript.redactSensitiveOutput("FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON => {\"owner\":\"abc\"}\nnext"),
  "FINANCE_HERMES_WORKSPACE_KEY_HASHES_JSON => [redacted]\nnext",
);
const homeAiRepairPlan = deployScript.postSyncRepairsForTarget({ target: "home-ai" });
assert.equal(homeAiRepairPlan[0].type, "codex-mobile-log-permissions");
assert.equal(homeAiRepairPlan[0].profileFile, "/Users/example/path");
assert.equal(homeAiRepairPlan[1].type, "web-push-vapid-permissions");
assert.equal(homeAiRepairPlan[1].relativePath, "data/web-push-vapid.json");
assert.equal(homeAiRepairPlan[1].fileMode, "600");
assert.equal(homeAiRepairPlan[2].type, "wardrobe-thumbnail-artifact-acl");
assert.equal(homeAiRepairPlan[2].targetWorkspace, "owner");
assert.equal(homeAiRepairPlan[2].macUser, "hm-owner");
const wardrobeRepairValidation = deployScript.wardrobeThumbnailArtifactAclRepairValidation(
  { macRoot: "/Users/example/path" },
  homeAiRepairPlan[2],
  {
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      aclRepaired: true,
      photoCacheDir: "/Users/example/path",
      probeUser: "hm-owner",
      writeProbeOk: true,
    }),
  },
);
assert.deepEqual(wardrobeRepairValidation, {
  type: "wardrobe-thumbnail-artifact-acl",
  status: 0,
  targetWorkspace: "owner",
  macUser: "hm-owner",
  aclRepaired: true,
  photoCacheDir: "<root>/data/artifacts/wardrobe-thumbnails/owner",
  probeUser: "hm-owner",
  writeProbeOk: true,
});
assert.equal(
  deployScript.compactProductionPath("/Users/example/path", "/Users/example/path"),
  "<root>/data/secrets/owner-web-key.secret",
);
assert.throws(
  () => deployScript.wardrobeThumbnailArtifactAclRepairValidation(
    { macRoot: "/Users/example/path" },
    homeAiRepairPlan[2],
    { status: 1, stdout: JSON.stringify({ ok: false, error: "wardrobe_photo_cache_runtime_probe_failed", writeProbeOk: false }) },
  ),
  /wardrobe_photo_cache_runtime_probe_failed/,
);
assert.throws(
  () => deployScript.wardrobeThumbnailArtifactAclRepairValidation(
    { macRoot: "/Users/example/path" },
    homeAiRepairPlan[2],
    { status: 0, stdout: "not-json" },
  ),
  /wardrobe_thumbnail_artifact_acl_repair_output_invalid/,
);
const codexRepairPlan = deployScript.postSyncRepairsForTarget({ target: "plugin:codex-mobile-web" });
assert.equal(codexRepairPlan[0].type, "codex-mobile-log-permissions");
assert.equal(codexRepairPlan[0].runtimeRoot, "/Users/example/path");
assert.equal(codexRepairPlan[0].muxMode, "persistent-owned-shared");
assert.equal(codexRepairPlan[0].requireSharedAppServer, "1");
assert.equal(codexRepairPlan[0].persistOwnedMux, "1");
assert.equal(codexRepairPlan[0].disableOwnedMux, "0");
const musicRepairPlan = deployScript.postSyncRepairsForTarget({ target: "plugin:music" });
assert.deepEqual(musicRepairPlan, [
  {
    type: "music-runtime-cover-permissions",
    plugin: "music",
    ownerUser: "hm-owner",
    runtimeRoot: "runtime",
    directories: [
      "cover-cache",
      "cover-plan-cache",
      "cover-backups",
    ],
    sqliteFiles: [
      "music.sqlite",
      "music.sqlite-wal",
      "music.sqlite-shm",
    ],
  },
]);

const growthPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "growth",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(growthPluginRun.status, 0, growthPluginRun.stderr);
const growthPluginPayload = JSON.parse(growthPluginRun.stdout);
assert.equal(growthPluginPayload.plan.target, "plugin:growth");
assert.equal(growthPluginPayload.plan.sourcePath, path.join(fixtureDevRoot, "plugins", "growth"));
assert.equal(growthPluginPayload.plan.productionPath, "/Users/example/path");
assert.deepEqual(growthPluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.growth"]);
assert.equal(growthPluginPayload.plan.healthUrl, "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest");
assert.deepEqual(growthPluginPayload.plan.postSyncMirrors, []);

const moiraPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "moira",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(moiraPluginRun.status, 0, moiraPluginRun.stderr);
const moiraPluginPayload = JSON.parse(moiraPluginRun.stdout);
assert.equal(moiraPluginPayload.plan.target, "plugin:moira");
assert.equal(moiraPluginPayload.plan.sourcePath, path.join(fixtureDevRoot, "plugins", "moira"));
assert.equal(moiraPluginPayload.plan.productionPath, "/Users/example/path");
assert.deepEqual(moiraPluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.moira"]);
assert.equal(moiraPluginPayload.plan.healthUrl, "http://127.0.0.1:4174/api/v1/hermes/plugin/manifest");
assert.equal(moiraPluginPayload.plan.postSyncMirrors.length, 9);
assert.deepEqual(
  moiraPluginPayload.plan.postSyncMirrors.map((item) => [item.kind || "file", item.target]),
  [
    ["file", "gateway-worker/moira-mcp/scripts/moira-mcp-stdio.mjs"],
    ["directory", "gateway-worker/moira-mcp/scripts"],
    ["directory", "gateway-worker/moira-mcp/server"],
    ["directory", "gateway-worker/moira-mcp/docs"],
    ["directory", "gateway-worker/moira-mcp/tests"],
    ["directory", "gateway-worker/moira-mcp/base"],
    ["directory", "gateway-worker/moira-mcp/tools"],
    ["directory", "gateway-worker/moira-mcp/web"],
    ["file", "gateway-worker/moira-mcp/package.json"],
  ],
);
assert.ok(moiraPluginPayload.plan.postSyncMirrors.every((item) => item.type === "gateway-mcp-worker-asset"));
assert.ok(moiraPluginPayload.plan.postSyncMirrors.every((item) => item.plugin === "moira"));

const allPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "all",
  "--dev-root",
  fixtureDevRoot,
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "public-release",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(allPluginRun.status, 0, allPluginRun.stderr);
const allPluginPayload = JSON.parse(allPluginRun.stdout);
assert.equal(allPluginPayload.plan.target, "plugins:all");
assert.equal(allPluginPayload.plan.sourceRoot, fixtureDevRoot);
assert.deepEqual(allPluginPayload.plan.pluginTargets, [
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "healthy",
  "moira",
  "movie",
  "music",
  "note",
  "wardrobe",
]);
assert.deepEqual(allPluginPayload.plan.plans.map((item) => item.target), [
  "plugin:codex-mobile-web",
  "plugin:email",
  "plugin:finance",
  "plugin:growth",
  "plugin:healthy",
  "plugin:moira",
  "plugin:movie",
  "plugin:music",
  "plugin:note",
  "plugin:wardrobe",
]);
assert.ok(allPluginPayload.plan.plans.every((item) => item.restartLabels.length === 1));
assert.ok(allPluginPayload.plan.plans.every((item) => item.healthUrl.includes("/api/v1/hermes/plugin/manifest")));
assert.equal(
  allPluginPayload.plan.plans.filter((item) => item.postSyncRepairs.some((repair) => repair.type === "codex-mobile-log-permissions")).length,
  1,
);
assert.equal(
  allPluginPayload.plan.plans.filter((item) => item.postSyncRepairs.some((repair) => repair.type === "music-runtime-cover-permissions")).length,
  1,
);
assert.deepEqual(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:music").postSyncRepairs[0].directories,
  ["cover-cache", "cover-plan-cache", "cover-backups"],
);
assert.deepEqual(
  allPluginPayload.plan.plans.filter((item) => item.postSyncMirrors.length).map((item) => item.target),
  ["plugin:moira", "plugin:movie", "plugin:music", "plugin:wardrobe"],
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:wardrobe").postSyncMirrors.length,
  2,
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:moira").postSyncMirrors.length,
  9,
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:music").postSyncMirrors.length,
  4,
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:movie").postSyncMirrors.length,
  2,
);

const allPluginSourceOverrideRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "all",
  "--source",
  "/tmp/one-plugin",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(allPluginSourceOverrideRun.status, 0);
assert.match(allPluginSourceOverrideRun.stderr, /all_plugins_source_override_unsupported/);

const growthSyncOnlyRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "growth",
  "--dev-root",
  fixtureDevRoot,
  "--restart",
  "none",
  "--sync-only",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "first-install",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(growthSyncOnlyRun.status, 0, growthSyncOnlyRun.stderr);
const growthSyncOnlyPayload = JSON.parse(growthSyncOnlyRun.stdout);
assert.equal(growthSyncOnlyPayload.plan.syncOnly, true);
assert.equal(growthSyncOnlyPayload.plan.runtimeValidationSkipped, true);
assert.deepEqual(growthSyncOnlyPayload.plan.restartLabels, []);
assert.deepEqual(growthSyncOnlyPayload.plan.validation, []);
assert.equal(
  deployScript.shouldRepairCodexSharedAuthPermissions(growthSyncOnlyPayload.plan),
  false,
);

const codexSyncOnlyRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
  "--dev-root",
  fixtureDevRoot,
  "--restart",
  "none",
  "--sync-only",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "first-install",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(codexSyncOnlyRun.status, 0, codexSyncOnlyRun.stderr);
const codexSyncOnlyPayload = JSON.parse(codexSyncOnlyRun.stdout);
assert.equal(codexSyncOnlyPayload.plan.syncOnly, true);
assert.equal(codexSyncOnlyPayload.plan.runtimeValidationSkipped, true);
assert.deepEqual(codexSyncOnlyPayload.plan.validation, []);

assert.equal(
  deployScript.shouldRepairCodexSharedAuthPermissions(staticPayload.plan),
  true,
);

const invalidSyncOnlyRun = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--sync-only",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(invalidSyncOnlyRun.status, 0);
assert.match(invalidSyncOnlyRun.stderr, /sync_only_requires_plugin_target/);

const unsafePluginExecute = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "finance",
  "--dev-root",
  fixtureDevRoot,
  "--execute",
  "--restart",
  "none",
  "--timestamp",
  "20260608T000000Z",
  "--reason",
  "harness",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(unsafePluginExecute.status, 0);
assert.match(unsafePluginExecute.stderr, /plugin_execute_requires_restart_label_or_health_url/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-deploy-dirty-"));
const tempApp = path.join(tempRoot, "app");
fs.mkdirSync(path.join(tempApp, "public"), { recursive: true });
fs.mkdirSync(path.join(tempApp, "scripts"), { recursive: true });
fs.writeFileSync(path.join(tempApp, "package.json"), "{\"name\":\"fixture\"}\n");
fs.writeFileSync(path.join(tempApp, "public", "index.html"), "<html data-client-version=\"fixture-v1\"></html>\n");
fs.writeFileSync(path.join(tempApp, "public", "service-worker.js"), "const HERMES_SW_VERSION = \"fixture-v1\";\n");
fs.writeFileSync(path.join(tempApp, "public", "directory-viewer.html"), "<html></html>\n");
fs.writeFileSync(path.join(tempApp, "scripts", "production-status-smoke.js"), "\"use strict\";\n");
fs.writeFileSync(path.join(tempApp, "scripts", "deploy-macos-production.js"), "\"use strict\";\n");
spawnSync("git", ["init"], { cwd: tempApp, encoding: "utf8" });
spawnSync("git", ["config", "user.name", "Deploy Harness"], { cwd: tempApp, encoding: "utf8" });
spawnSync("git", ["config", "user.email", "deploy-harness@example.invalid"], { cwd: tempApp, encoding: "utf8" });
spawnSync("git", ["add", "."], { cwd: tempApp, encoding: "utf8" });
spawnSync("git", ["commit", "-m", "fixture"], { cwd: tempApp, encoding: "utf8" });
fs.appendFileSync(path.join(tempApp, "public", "index.html"), "<!-- dirty -->\n");
const dirtyExecute = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--source",
  tempApp,
  "--dev-root",
  tempRoot,
  "--mac-root",
  path.join(tempRoot, "prod"),
  "--execute",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(dirtyExecute.status, 0);
assert.match(dirtyExecute.stderr, /deploy_source_dirty_requires_allow_dirty:public\/index\.html/);

const missingUiEvidenceExecute = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--source",
  tempApp,
  "--dev-root",
  tempRoot,
  "--mac-root",
  path.join(tempRoot, "prod"),
  "--execute",
  "--allow-dirty",
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.notEqual(missingUiEvidenceExecute.status, 0);
assert.match(missingUiEvidenceExecute.stderr, /ui_visual_local_validation_required/);

const uiEvidencePath = path.join(tempRoot, "ui-visual-evidence.json");
fs.writeFileSync(uiEvidencePath, `${JSON.stringify({
  uiSurfaces: ["home-ai-static-shell"],
  localTests: [
    { command: "node tests/task-list-ui.test.js", status: "passed" },
  ],
  visualVerifications: [
    {
      method: "playwright-dom-geometry",
      status: "passed",
      viewport: "390x844",
      assertions: ["no-overlap", "no-clipping", "no-overflow", "safe-area"],
    },
  ],
})}\n`);
const validUiEvidencePlan = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
  "--source",
  tempApp,
  "--dev-root",
  tempRoot,
  "--mac-root",
  path.join(tempRoot, "prod"),
  "--changed-file",
  "public/index.html",
  "--ui-visual-evidence",
  uiEvidencePath,
  "--json",
], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(validUiEvidencePlan.status, 0, validUiEvidencePlan.stderr);
const validUiEvidencePayload = JSON.parse(validUiEvidencePlan.stdout);
assert.equal(validUiEvidencePayload.plan.uiVisualLocalValidation.required, true);
assert.equal(validUiEvidencePayload.plan.uiVisualLocalValidation.ok, true);
assert.equal(validUiEvidencePayload.plan.uiVisualLocalValidation.evidence.passedLocalTestCount, 1);
assert.equal(validUiEvidencePayload.plan.uiVisualLocalValidation.evidence.passedVisualVerificationCount, 1);

console.log("macos production deploy script harness passed");
