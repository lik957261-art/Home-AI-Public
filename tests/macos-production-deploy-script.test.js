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
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const productionAccess = fs.readFileSync(path.join(repoRoot, "docs", "RUNBOOKS", "macos-production-access.md"), "utf8");
const pluginsDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "plugins.md"), "utf8");

assert.match(script, /Default mode is plan-only/);
assert.match(script, /--execute/);
assert.match(script, /--allow-dirty/);
assert.match(script, /--surface full\|static/);
assert.match(script, /--sync-only/);
assert.match(script, /HOMEAI_MAC_SUDO_PASSWORD_FILE/);
assert.match(script, /\/Users\/hermes-dev\/HermesMobileDev/);
assert.match(script, /\/Users\/hermes-host\/HermesMobile/);
assert.match(script, /unsupported_plugin_target/);
assert.match(script, /PLUGIN_DEPLOY_ORDER/);
assert.match(script, /PLUGIN_ALIASES/);
assert.match(script, /health: "healthy"/);
assert.match(script, /PLUGIN_HEALTH_URLS/);
assert.match(script, /PLUGIN_GATEWAY_MCP_MIRRORS/);
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
assert.match(script, /codex-mobile-web\.out\.log/);
assert.match(script, /codex-mobile-web\.err\.log/);
assert.match(script, /launchdReloadRequired/);
assert.match(script, /currentStdoutPath !== files\[0\]/);
assert.match(script, /currentStderrPath !== files\[1\]/);
assert.match(script, /music-runtime-cover-permissions/);
assert.match(script, /cover-plan-cache/);
assert.match(script, /cover-backups/);
assert.match(script, /add_subdirectory/);
assert.match(script, /PLUGIN_RSYNC_EXCLUDES/);
assert.match(script, /"-S", "-p", "", command/);
assert.match(script, /"-n", command/);
assert.match(script, /\/bin\/launchctl/);
assert.match(script, /kickstart/);
assert.match(script, /HOME_AI_BRIDGE_HOST_LABEL/);
assert.match(script, /HOME_AI_CRON_LABEL/);
assert.match(script, /HOME_AI_NAS_BACKUP_MOUNT_LABEL/);
assert.match(script, /HOME_AI_VISUAL_DEBUG_LABEL/);
assert.match(script, /buildHomeAiBridgeHostLaunchdPlist/);
assert.match(script, /buildHomeAiCronLaunchdPlist/);
assert.match(script, /buildHomeAiNasBackupMountLaunchdPlist/);
assert.match(script, /buildHomeAiVisualDebugLaunchAgentPlist/);
assert.match(script, /home-ai-bridge-host-launchd-install/);
assert.match(script, /home-ai-cron-launchd-install/);
assert.match(script, /home-ai-nas-backup-mount-launchd-install/);
assert.match(script, /home-ai-visual-debug-launch-agent-install/);
assert.match(script, /home-ai-cron-profile-aliases/);
assert.match(script, /home-ai-cron-builtin-skills/);
assert.match(script, /home-ai-cron-runtime-scripts/);
assert.match(script, /homeai-disaster-backup-cron\.sh/);
assert.match(script, /homeai-visual-polish-audit-cron\.sh/);
assert.match(script, /homeai-visual-polish-host\.sh/);
assert.match(script, /homeai-visual-polish-music\.sh/);
assert.match(script, /homeai-visual-polish-global\.sh/);
assert.match(script, /home-ai-visual-polish-cron-jobs/);
assert.match(script, /home-ai-visual-polish-task-card-config/);
assert.match(script, /installHomeAiVisualPolishCronJobs/);
assert.match(script, /installHomeAiVisualPolishTaskCardConfig/);
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
assert.match(script, /find \\"\$root\\" -mindepth 1 -maxdepth 1 -type d -mtime \+\\"\$days\\" ! -path \\"\$current\\"/);
assert.match(script, /function shouldRetryValidation/);
assert.match(script, /home-ai-status-smoke/);
assert.match(script, /health-url/);
assert.match(script, /codex-auth-profile-audit/);
assert.match(script, /CODEX_AUTH_AUDIT_ISSUE_PREFIX/);
assert.match(script, /home-ai-production-drift-audit/);
assert.match(script, /failOnAnyIssue/);
assert.match(script, /runIssuePrefixAuditValidation/);
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
assert.match(script, /\.venv\//);
assert.match(script, /deploy_source_dirty_requires_allow_dirty/);
assert.match(script, /production-file-hashes/);
assert.match(script, /--expected-version/);
assert.match(script, /HOME_AI_STATIC_SYNC_ROOTS/);
assert.doesNotMatch(script, /console\.log\(.*password/i);
assert.doesNotMatch(script, /console\.error\(.*password/i);
assert.doesNotMatch(script, /\/usr\/bin\/tee/);

for (const plugin of ["codex-mobile-web", "email", "finance", "growth", "healthy", "moira", "music", "note", "wardrobe"]) {
  assert.match(script, new RegExp(`"${plugin}"`));
  assert.match(contract, new RegExp(`${plugin} -> /Users/example/path`));
  assert.match(productionAccess, new RegExp(`${plugin} -> /Users/example/path`));
}

assert.match(deploymentDoc, /deploy-macos-production\.js/);
assert.match(deploymentDoc, /install-growth-launchd-service\.js/);
assert.match(deploymentDoc, /install-moira-launchd-service\.js/);
assert.match(deploymentDoc, /install-music-launchd-service\.js/);
assert.match(deploymentDoc, /cover-plan-cache/);
assert.match(productionAccess, /deploy-macos-production\.js/);
assert.equal(packageJson.scripts["deploy:macos"], "node scripts/deploy-macos-production.js");

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
assert.match(contract, /prune deploy backups older\s+than three days/);

assert.match(pluginWorkspaceContract, /macos-dev-to-production-deployment-contract\.md/);
assert.match(pluginWorkspaceContract, /Plugin threads must read that file before production deploys/);
assert.match(pluginWorkspaceContract, /must not replace the central deploy path with a\s+plugin-private sudo\/rsync flow/);
assert.match(pluginWorkspaceContract, /npm run --silent deploy:macos -- --plugin <plugin-id>/);
assert.match(deploymentDoc, /--sync-only/);
assert.match(deploymentDoc, /Backup rsync uses a narrower exclude list/);
assert.match(deploymentDoc, /gateway-worker\/<plugin>-mcp/);
assert.match(deploymentDoc, /gateway-worker\/moira-mcp/);
assert.match(productionAccess, /--sync-only/);

assert.match(pluginsDoc, /Plugin Codex threads must read that central contract before production deploys/);
assert.match(pluginsDoc, /must not introduce a separate sudo, rsync, SSH, or production\s+write-access path/);
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
assert.equal(payload.plan.productionOwner, "hermes-host:staff");
assert.deepEqual(payload.plan.restartLabels, ["com.hermesmobile.bridge-host", "com.hermesmobile.cron", "com.hermesmobile.listener", "com.hermesmobile.workspace-system-helper"]);
assert.ok(payload.plan.expectedClientVersion);
assert.ok(payload.plan.proofFiles.includes("scripts/deploy-macos-production.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/automation-cron-profile-service.js"));
assert.ok(payload.plan.proofFiles.includes("cron_bridge.py"));
assert.ok(payload.plan.proofFiles.includes("server-routes/automation-api-routes.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-automation-cron-audit.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/plugin-workspace-audit-runner.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-gateway-start-script-bridge-env-repair.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-production-profile-audit.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-production-drift-reconcile.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/homeai-production-drift-audit-watchdog.sh"));
assert.equal(payload.plan.cronProfileAliases.type, "home-ai-cron-profile-aliases");
assert.equal(payload.plan.cronProfileAliases.manifestPath, "/Users/example/path");
assert.equal(payload.plan.cronProfileAliases.profilesRoot, "/Users/example/path");
assert.deepEqual(payload.plan.cronProfileAliases.aliases, []);
assert.ok(payload.plan.validation.some((item) => item.type === "production-file-hashes"));
const statusSmoke = payload.plan.validation.find((item) => item.type === "home-ai-status-smoke");
assert.ok(statusSmoke.command.includes("--expected-version"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-status-smoke"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-automation-cron-audit"));
assert.ok(payload.plan.validation.some((item) => item.type === "codex-auth-profile-audit"));
const driftAudit = payload.plan.validation.find((item) => item.type === "home-ai-production-drift-audit");
assert.ok(driftAudit);
assert.ok(driftAudit.command.some((item) => String(item).endsWith("macos-production-profile-audit.js")));
assert.ok(driftAudit.command.includes("--no-strict"));
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
assert.match(cronPlist, /<key>HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_CONFIG_FILE<\/key>\s*<string>\/Users\/hermes-host\/HermesMobile\/data\/plugin-workspace-audit-task-cards\.json<\/string>/);
assert.match(cronPlist, /<key>CODEX_MOBILE_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:8787<\/string>/);
assert.match(cronPlist, /<key>CODEX_MOBILE_KEY_FILE<\/key>\s*<string>\/Users\/hermes-host\/HermesMobile\/data\/secrets\/codex-mobile-access-key\.secret<\/string>/);
assert.match(cronPlist, /<key>HERMES_CRON_SCRIPT_TIMEOUT<\/key>\s*<string>1800<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_TRANSPORT<\/key>\s*<string>auto<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_TARGET<\/key>\s*<string>xuxinxp@192\.168\.10\.99<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_DESTINATION<\/key>\s*<string>\/volume1\/备份\/HomeAI-Production-Backups\/mac-production<\/string>/);
assert.match(cronPlist, /<key>HOMEAI_DISASTER_BACKUP_SSH_OPTIONS<\/key>\s*<string>-p 2222 -i \/Users\/hermes-host\/\.ssh\/homeai_nas_backup_ed25519<\/string>/);

const pluginWorkspaceAuditTargets = JSON.parse(deployScript.buildPluginWorkspaceAuditTargetJson("/Users/example/path"));
assert.equal(pluginWorkspaceAuditTargets["codex-mobile"], "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.finance, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.health, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.music, "/Users/example/path");
assert.equal(pluginWorkspaceAuditTargets.wardrobe, "/Users/example/path");

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
assert.ok(pluginPayload.plan.rsyncExcludes.includes("data/"));
assert.ok(pluginPayload.plan.rsyncExcludes.includes(".git"));
assert.ok(pluginPayload.plan.rsyncExcludes.includes(".venv/"));
assert.ok(deployScript.BACKUP_RSYNC_EXCLUDES.includes(".codegraph/"));
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes("data/"), false);
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes("runtime/"), false);
assert.equal(deployScript.BACKUP_RSYNC_EXCLUDES.includes(".venv/"), false);
assert.deepEqual(
  deployScript.buildRsyncArgs([".codegraph/", ".codex/"], "/prod/plugin/", "/backup/plugin/"),
  ["-a", "--delete", "--exclude", ".codegraph/", "--exclude", ".codex/", "/prod/plugin/", "/backup/plugin/"],
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
    logFiles: [
      "codex-mobile-web.out.log",
      "codex-mobile-web.err.log",
    ],
    directoryMode: "700",
    fileMode: "600",
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
assert.deepEqual(financeRepairPlan, []);
const homeAiRepairPlan = deployScript.postSyncRepairsForTarget({ target: "home-ai" });
assert.equal(homeAiRepairPlan[0].type, "codex-mobile-log-permissions");
assert.equal(homeAiRepairPlan[0].profileFile, "/Users/example/path");
const codexRepairPlan = deployScript.postSyncRepairsForTarget({ target: "plugin:codex-mobile-web" });
assert.equal(codexRepairPlan[0].type, "codex-mobile-log-permissions");
assert.equal(codexRepairPlan[0].runtimeRoot, "/Users/example/path");
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
assert.deepEqual(allPluginPayload.plan.pluginTargets, [
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "healthy",
  "moira",
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
  ["plugin:moira", "plugin:music"],
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:moira").postSyncMirrors.length,
  9,
);
assert.equal(
  allPluginPayload.plan.plans.find((item) => item.target === "plugin:music").postSyncMirrors.length,
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

console.log("macos production deploy script harness passed");
