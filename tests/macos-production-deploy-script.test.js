"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy-macos-production.js");
const script = fs.readFileSync(scriptPath, "utf8");
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
assert.match(script, /HOMEAI_MAC_SUDO_PASSWORD_FILE/);
assert.match(script, /\/Users\/hermes-dev\/HermesMobileDev/);
assert.match(script, /\/Users\/hermes-host\/HermesMobile/);
assert.match(script, /unsupported_plugin_target/);
assert.match(script, /\$\{label\}_outside_allowed_root/);
assert.match(script, /assertInside\(source, options\.devRoot, "source"\)/);
assert.match(script, /assertInside\(target, options\.macRoot, "production_target"\)/);
assert.match(script, /\/usr\/bin\/rsync/);
assert.match(script, /\/usr\/bin\/sudo/);
assert.match(script, /"-S", "-p", "", command/);
assert.match(script, /"-n", command/);
assert.match(script, /\/bin\/launchctl/);
assert.match(script, /kickstart/);
assert.match(script, /production-status-smoke\.js/);
assert.match(script, /owner-web-key\.secret/);
assert.match(script, /plugin_execute_requires_restart_label_or_health_url/);
assert.match(script, /validationRetries: 12/);
assert.match(script, /validationDelayMs: 2000/);
assert.match(script, /function shouldRetryValidation/);
assert.match(script, /home-ai-status-smoke/);
assert.match(script, /health-url/);
assert.match(script, /Atomics\.wait/);
assert.match(script, /attempt/);
assert.match(script, /backups", "deploy/);
assert.match(script, /rsyncExcludes/);
assert.match(script, /\.agent-context\//);
assert.match(script, /AGENTS\.md/);
assert.match(script, /\.codex\//);
assert.match(script, /node_modules\//);
assert.doesNotMatch(script, /console\.log\(.*password/i);
assert.doesNotMatch(script, /console\.error\(.*password/i);

for (const plugin of ["codex-mobile-web", "email", "finance", "healthy", "note", "wardrobe"]) {
  assert.match(script, new RegExp(`"${plugin}"`));
  assert.match(contract, new RegExp(`${plugin} -> /Users/hermes-host/HermesMobile/plugins/${plugin}`));
  assert.match(productionAccess, new RegExp(`${plugin} -> /Users/hermes-host/HermesMobile/plugins/${plugin}`));
}

assert.match(deploymentDoc, /deploy-macos-production\.js/);
assert.match(productionAccess, /deploy-macos-production\.js/);
assert.equal(packageJson.scripts["deploy:macos"], "node scripts/deploy-macos-production.js");

assert.match(contract, /Every plugin project must read this contract before any Mac production deploy/);
assert.match(contract, /\/Users\/hermes-dev\/HermesMobileDev\/app\/docs\/PLATFORM_CONTRACTS\/macos-dev-to-production-deployment-contract\.md/);
assert.match(contract, /Plugin deployment scripts or plugin Codex threads should call the central Home\s+AI deploy script/);
assert.match(contract, /cd \/Users\/hermes-dev\/HermesMobileDev\/app/);
assert.match(contract, /--source \/Users\/hermes-dev\/HermesMobileDev\/plugins\/<plugin-id>/);
assert.match(contract, /--restart-label <label>/);
assert.match(contract, /--health-url <url>/);
assert.match(contract, /selected Gateway callable-schema/);
assert.match(contract, /must not bypass it with a plugin-private\s+production write path/);

assert.match(pluginWorkspaceContract, /macos-dev-to-production-deployment-contract\.md/);
assert.match(pluginWorkspaceContract, /Plugin threads must read that file before production deploys/);
assert.match(pluginWorkspaceContract, /must not replace the central deploy path with a\s+plugin-private sudo\/rsync flow/);
assert.match(pluginWorkspaceContract, /npm run --silent deploy:macos -- --plugin <plugin-id>/);

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
assert.equal(payload.plan.sourcePath, "/Users/hermes-dev/HermesMobileDev/app");
assert.equal(payload.plan.productionPath, "/Users/hermes-host/HermesMobile/app");
assert.match(payload.plan.backupPath, /20260608T000000Z-home-ai-harness$/);
assert.ok(payload.plan.rsyncExcludes.includes("AGENTS.md"));
assert.ok(payload.plan.validation.some((item) => item.type === "home-ai-status-smoke"));

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

const unsafePluginExecute = spawnSync(process.execPath, [
  scriptPath,
  "--plugin",
  "finance",
  "--execute",
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

console.log("macos production deploy script harness passed");
