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
assert.match(script, /buildAllPluginPlan/);
assert.match(script, /\$\{label\}_outside_allowed_root/);
assert.match(script, /assertInside\(source, options\.devRoot, "source"\)/);
assert.match(script, /assertInside\(target, options\.macRoot, "production_target"\)/);
assert.match(script, /\/usr\/bin\/rsync/);
assert.match(script, /\/usr\/bin\/sudo/);
assert.match(script, /\/usr\/sbin\/chown/);
assert.match(script, /productionOwner/);
assert.match(script, /PLUGIN_RSYNC_EXCLUDES/);
assert.match(script, /"-S", "-p", "", command/);
assert.match(script, /"-n", command/);
assert.match(script, /\/bin\/launchctl/);
assert.match(script, /kickstart/);
assert.match(script, /HOME_AI_BRIDGE_HOST_LABEL/);
assert.match(script, /HOME_AI_CRON_LABEL/);
assert.match(script, /buildHomeAiBridgeHostLaunchdPlist/);
assert.match(script, /buildHomeAiCronLaunchdPlist/);
assert.match(script, /home-ai-bridge-host-launchd-install/);
assert.match(script, /home-ai-cron-launchd-install/);
assert.match(script, /home-ai-cron-profile-aliases/);
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
assert.match(script, /production-status-smoke\.js/);
assert.match(script, /owner-web-key\.secret/);
assert.match(script, /plugin_execute_requires_restart_label_or_health_url/);
assert.match(script, /sync_only_requires_plugin_target/);
assert.match(script, /validationRetries: 12/);
assert.match(script, /validationDelayMs: 2000/);
assert.match(script, /function shouldRetryValidation/);
assert.match(script, /home-ai-status-smoke/);
assert.match(script, /health-url/);
assert.match(script, /codex-auth-profile-audit/);
assert.match(script, /CODEX_AUTH_AUDIT_ISSUE_PREFIX/);
assert.match(script, /codex_auth_profile_audit_failed/);
assert.match(script, /HOME_AI_VOICE_INPUT_LANGUAGE = "zh"/);
assert.match(script, /HERMES_MOBILE_VOICE_INPUT_LANGUAGE/);
assert.match(script, /HERMES_MOBILE_VOICE_INPUT_INITIAL_PROMPT/);
assert.match(script, /HERMES_WEB_VOICE_INPUT_VAD_FILTER/);
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

for (const plugin of ["codex-mobile-web", "email", "finance", "growth", "healthy", "moira", "note", "wardrobe"]) {
  assert.match(script, new RegExp(`"${plugin}"`));
  assert.match(contract, new RegExp(`${plugin} -> /Users/hermes-host/HermesMobile/plugins/${plugin}`));
  assert.match(productionAccess, new RegExp(`${plugin} -> /Users/hermes-host/HermesMobile/plugins/${plugin}`));
}

assert.match(deploymentDoc, /deploy-macos-production\.js/);
assert.match(deploymentDoc, /install-growth-launchd-service\.js/);
assert.match(deploymentDoc, /install-moira-launchd-service\.js/);
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
assert.match(contract, /selected Gateway callable-schema/);
assert.match(contract, /must not bypass it with a plugin-private\s+production write path/);
assert.match(contract, /\.codegraph/);
assert.match(contract, /must not reuse the source sync exclude list/);

assert.match(pluginWorkspaceContract, /macos-dev-to-production-deployment-contract\.md/);
assert.match(pluginWorkspaceContract, /Plugin threads must read that file before production deploys/);
assert.match(pluginWorkspaceContract, /must not replace the central deploy path with a\s+plugin-private sudo\/rsync flow/);
assert.match(pluginWorkspaceContract, /npm run --silent deploy:macos -- --plugin <plugin-id>/);
assert.match(deploymentDoc, /--sync-only/);
assert.match(deploymentDoc, /Backup rsync uses a narrower exclude list/);
assert.match(productionAccess, /--sync-only/);

assert.match(pluginsDoc, /Plugin Codex threads must read that central contract before production deploys/);
assert.match(pluginsDoc, /must not introduce a separate sudo, rsync, SSH, or production\s+write-access path/);
assert.match(productionAccess, /Plugin workspaces should read the central deployment contract before deploys/);
assert.match(productionAccess, /\/Users\/hermes-dev\/HermesMobileDev\/app/);

const dryRun = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
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
assert.equal(payload.plan.sourcePath, "/Users/hermes-dev/HermesMobileDev/app");
assert.equal(payload.plan.productionPath, "/Users/hermes-host/HermesMobile/app");
assert.match(payload.plan.backupPath, /20260608T000000Z-home-ai-harness$/);
assert.ok(payload.plan.rsyncExcludes.includes("AGENTS.md"));
assert.ok(payload.plan.rsyncExcludes.includes(".git"));
assert.ok(payload.plan.rsyncExcludes.includes(".codegraph/"));
assert.equal(payload.plan.productionOwner, "hermes-host:staff");
assert.deepEqual(payload.plan.restartLabels, ["com.hermesmobile.bridge-host", "com.hermesmobile.cron", "com.hermesmobile.listener"]);
assert.ok(payload.plan.expectedClientVersion);
assert.ok(payload.plan.proofFiles.includes("scripts/deploy-macos-production.js"));
assert.ok(payload.plan.proofFiles.includes("adapters/automation-cron-profile-service.js"));
assert.ok(payload.plan.proofFiles.includes("cron_bridge.py"));
assert.ok(payload.plan.proofFiles.includes("server-routes/automation-api-routes.js"));
assert.ok(payload.plan.proofFiles.includes("scripts/macos-gateway-start-script-bridge-env-repair.js"));
assert.equal(payload.plan.cronProfileAliases.type, "home-ai-cron-profile-aliases");
assert.equal(payload.plan.cronProfileAliases.manifestPath, "/Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json");
assert.equal(payload.plan.cronProfileAliases.profilesRoot, "/Users/hermes-host/HermesMobile/data/hermes-home/profiles");
assert.deepEqual(payload.plan.cronProfileAliases.aliases, []);
assert.ok(payload.plan.validation.some((item) => item.type === "production-file-hashes"));
const statusSmoke = payload.plan.validation.find((item) => item.type === "home-ai-status-smoke");
assert.ok(statusSmoke.command.includes("--expected-version"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-status-smoke"));
assert.ok(payload.plan.validation.some((item) => item.type === "codex-auth-profile-audit"));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.bridge-host")));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.cron")));
assert.ok(payload.plan.validation.some((item) => item.type === "launchd-print" && item.command.includes("system/com.hermesmobile.listener")));

const bridgeHostPlist = deployScript.buildHomeAiBridgeHostLaunchdPlist("/Users/hermes-host/HermesMobile");
assert.match(bridgeHostPlist, /<string>com\.hermesmobile\.bridge-host<\/string>/);
assert.match(bridgeHostPlist, /<string>hermes-host<\/string>/);
assert.match(bridgeHostPlist, /\/Users\/hermes-host\/HermesMobile\/runtime\/node-current\/bin\/node/);
assert.match(bridgeHostPlist, /\/Users\/hermes-host\/HermesMobile\/app\/scripts\/bridge-host\.js/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_BRIDGE_HOST_PORT/);
assert.match(bridgeHostPlist, /<string>8798<\/string>/);
assert.match(bridgeHostPlist, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH/);
assert.match(bridgeHostPlist, /bridge-host\.secret/);
assert.match(bridgeHostPlist, /HERMES_WEB_CRON_JOBS_PATH/);
assert.match(bridgeHostPlist, /<key>KeepAlive<\/key>\s*<true\/>/);

const cronPlist = deployScript.buildHomeAiCronLaunchdPlist("/Users/hermes-host/HermesMobile");
assert.match(cronPlist, /<string>com\.hermesmobile\.cron<\/string>/);
assert.match(cronPlist, /<integer>60<\/integer>/);
assert.match(cronPlist, /<string>hermes-host<\/string>/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/runtime\/hermes-agent-official\/venv\/bin\/python/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/app\/scripts\/hermes-mobile-cron-dispatcher\.py/);
assert.match(cronPlist, /HERMES_WEB_CRON_JOBS_PATH/);
assert.match(cronPlist, /\/Users\/hermes-host\/HermesMobile\/data\/hermes-home\/cron\/jobs\.json/);
assert.match(cronPlist, /<key>HERMES_CRON_SCRIPT_TIMEOUT<\/key>\s*<string>1800<\/string>/);

const cronAliasPlan = deployScript.buildHomeAiCronProfileAliasPlan("/Users/hermes-host/HermesMobile", {
  workers: [
    {
      profile: "hm-owner-openai-1",
      enabled: true,
      provider: "openai-codex",
      securityLevel: "user",
      toolsets: ["email", "file", "skills", "cronjob_mobile"],
      configPath: "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-1/config.yaml",
    },
    {
      profile: "hm-owner-openai-2",
      enabled: false,
      securityLevel: "user",
      toolsets: ["cronjob_mobile"],
      configPath: "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-2/config.yaml",
    },
    {
      profile: "officialclean1",
      enabled: true,
      securityLevel: "owner-maintenance",
      toolsets: ["cronjob_mobile"],
      configPath: "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/officialclean1/config.yaml",
    },
    {
      profile: "hm-owner-openai-no-cron",
      enabled: true,
      securityLevel: "user",
      toolsets: ["email", "file", "skills"],
      configPath: "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-no-cron/config.yaml",
    },
  ],
});
assert.equal(cronAliasPlan.type, "home-ai-cron-profile-aliases");
assert.deepEqual(cronAliasPlan.aliases.map((item) => item.profile), ["hm-owner-openai-1"]);
assert.equal(
  cronAliasPlan.aliases[0].sourceDir,
  "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-1",
);
assert.equal(
  cronAliasPlan.aliases[0].aliasPath,
  "/Users/hermes-host/HermesMobile/data/hermes-home/profiles/hm-owner-openai-1",
);
assert.ok(cronAliasPlan.aliases[0].ancestorDirs.includes("/Users/hm-owner/HermesWorkspace"));
assert.equal(cronAliasPlan.aliases[0].workspaceRoot, "/Users/hm-owner/HermesWorkspace");
assert.ok(cronAliasPlan.aliases[0].pluginBindingDirs.includes("/Users/hm-owner/HermesWorkspace/.hermes-email"));
assert.ok(cronAliasPlan.aliases[0].pluginBindingDirs.includes("/Users/hm-owner/HermesWorkspace/.hermes-finance"));

const staticRun = spawnSync(process.execPath, [
  scriptPath,
  "--target",
  "home-ai",
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
assert.equal(pluginPayload.plan.sourcePath, "/Users/hermes-dev/HermesMobileDev/plugins/finance");
assert.equal(pluginPayload.plan.productionPath, "/Users/hermes-host/HermesMobile/plugins/finance");
assert.equal(pluginPayload.plan.productionOwner, "hermes-host:staff");
assert.deepEqual(pluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.finance"]);
assert.equal(pluginPayload.plan.healthUrl, "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest");
assert.ok(pluginPayload.plan.validation.some((item) => item.type === "health-url"));
assert.ok(pluginPayload.plan.validation.some((item) => item.type === "codex-auth-profile-audit"));
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

const healthAliasPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "health",
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
assert.equal(healthAliasPayload.plan.sourcePath, "/Users/hermes-dev/HermesMobileDev/plugins/healthy");
assert.equal(healthAliasPayload.plan.productionPath, "/Users/hermes-host/HermesMobile/plugins/healthy");
assert.deepEqual(healthAliasPayload.plan.restartLabels, ["com.hermesmobile.plugin.health"]);
assert.equal(healthAliasPayload.plan.healthUrl, "http://127.0.0.1:4877/api/v1/hermes/plugin/manifest");

const codexPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "codex-mobile-web",
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

const growthPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "growth",
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
assert.equal(growthPluginPayload.plan.sourcePath, "/Users/hermes-dev/HermesMobileDev/plugins/growth");
assert.equal(growthPluginPayload.plan.productionPath, "/Users/hermes-host/HermesMobile/plugins/growth");
assert.deepEqual(growthPluginPayload.plan.restartLabels, ["com.hermesmobile.plugin.growth"]);
assert.equal(growthPluginPayload.plan.healthUrl, "http://127.0.0.1:4881/api/v1/hermes/plugin/manifest");

const allPluginRun = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "all",
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
  "plugin:note",
  "plugin:wardrobe",
]);
assert.ok(allPluginPayload.plan.plans.every((item) => item.restartLabels.length === 1));
assert.ok(allPluginPayload.plan.plans.every((item) => item.healthUrl.includes("/api/v1/hermes/plugin/manifest")));

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
