"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

const deployScript = read("scripts/deploy-nas-tracked-source.ps1");
const staticDeployScript = read("scripts/deploy-nas-static-assets.ps1");
const publicChecklist = read("docs/PUBLIC_INSTALLATION_CHECKLIST.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const nasPlan = read("docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md");
const runtimeStateDoc = read("docs/MODULES/runtime-state-backup.md");
const testMatrix = read("docs/TEST_MATRIX.md");
const readme = read("README.md");

assert.ok(
  deployScript.includes("git archive --format=tar"),
  "NAS tracked-source deploy must package only Git-tracked source files",
);
for (const script of [deployScript, staticDeployScript]) {
  assert.ok(
    script.includes("cmd.exe /d /c $uploadCommand")
      && script.includes("base64.b64decode")
      && script.includes("B64='$b64' python3 -c"),
    "NAS deploy scripts must use the fixed base64 text upload and remote Python decode path",
  );
  assert.ok(
    !/\bscp\b|\bsftp\b/.test(script),
    "NAS deploy scripts must not depend on scp/sftp",
  );
  assert.ok(
    !/tar(?:\.exe)?[^\r\n|]*\|\s*ssh/i.test(script),
    "NAS deploy scripts must not pipe binary tar streams through PowerShell into ssh",
  );
}

assert.ok(
  deployScript.includes("Invoke-NasFirstStartPreflight"),
  "NAS tracked-source deploy must run first-start preflight",
);
assert.ok(
  deployScript.includes("function Sync-NasRuntimeConfigScripts")
    && deployScript.includes("app/scripts/start-nas-gateway-pool.sh")
    && deployScript.includes("config/start-nas-gateway-pool.sh")
    && deployScript.includes("Sync-NasRuntimeConfigScripts"),
  "NAS tracked-source deploy must keep runtime config launchers in sync with deployed app scripts",
);
assert.ok(
  deployScript.includes("get('/api/owner-elevation')")
    && deployScript.includes("owner_elevation_unavailable")
    && deployScript.includes("'ownerElevationAvailable': owner_elevation.get('available')"),
  "NAS version smoke must fail when Owner elevation is disabled by production configuration",
);
assert.ok(
  deployScript.includes("start-nas-gateway-pool.sh")
    && deployScript.includes("--start-profiles nasgw1")
    && deployScript.includes("--no-stop-existing"),
  "NAS listener restart must restore the default warm Gateway profile before final preflight",
);
assert.ok(
  deployScript.includes("function Restart-NasListener")
    && deployScript.includes("Invoke-NasPython $python")
    && deployScript.includes("listener_pids()")
    && deployScript.includes("signal.SIGTERM")
    && deployScript.includes("signal.SIGKILL")
    && deployScript.includes("nas_listener_restart_port_still_busy")
    && deployScript.includes("start-hermes-mobile.sh")
    && deployScript.includes("ownerKeySource")
    && deployScript.includes("ownerKeySource') != 'file'"),
  "NAS listener restart must use the base64/Python control path, release port 8797, start only the maintained launcher, and verify file-backed owner auth",
);
assert.ok(
  !/function Restart-NasListener\s*\{[\s\S]*?nohup[\s\S]*?&[\s\S]*?\}/.test(deployScript),
  "NAS listener restart must not use an inline shell nohup chain that can leave port 8797 occupied",
);

for (const requiredCheck of [
  "app_index_version_mismatch",
  "source_index_version_mismatch",
  "served_client_version_mismatch",
  "gateway_user_worker_missing",
  "gateway_healthy_user_worker_missing",
  "gateway_mode_not_hybrid",
  "nas_single_worker_bridge_not_hybrid_parity",
  "nas_skill_profiles_missing",
  "nas_user_worker_wildcard_workspace",
  "nas_worker_skill_store_missing",
  "nas_worker_uses_shared_base_skills",
  "nas_workspace_root_not_private",
]) {
  assert.ok(
    deployScript.includes(requiredCheck),
    `NAS first-start preflight must check ${requiredCheck}`,
  );
}

assert.ok(
  deployScript.includes("gateway_not_hybrid_parity"),
  "NAS first-start preflight must retain strict hybrid parity support",
);

assert.ok(
  deployScript.includes("gateway_not_hybrid_parity"),
  "NAS first-start preflight must support strict hybrid parity failure",
);
assert.ok(
  deployScript.includes("is_documented_grok_wildcard")
    && deployScript.includes("profile == 'grokgw1'")
    && deployScript.includes("provider == 'xai-oauth'")
    && deployScript.includes("('toolsets', 'tags')")
    && deployScript.includes("not single_worker_bridge and not is_documented_grok_wildcard(worker)"),
  "NAS first-start preflight must allow only the documented Grok/xAI wildcard profile while rejecting ordinary wildcard workers",
);

assert.ok(
  deploymentDoc.includes("run.request_preparing") && nasPlan.includes("run.request_preparing"),
  "NAS docs must require immediate run-preparing visibility in parity smoke",
);
assert.ok(
  deploymentDoc.includes("probe-only shortcut") && nasPlan.includes("probe-only shortcuts"),
  "NAS docs must forbid probe-only performance shortcuts",
);
assert.ok(
  deploymentDoc.includes("message-count growth must not force a full `state.json` backup")
    && testMatrix.includes("normal message growth does not force a full state backup")
    && testMatrix.includes("skip SQLite full replacement")
    && deploymentDoc.includes("state.json` is newer than SQLite's")
    && nasPlan.includes("ordinary message-count growth must not trigger a forced"),
  "NAS docs must require listener persistence checks for pre-run latency",
);
assert.ok(
  deploymentDoc.includes("node server.js") && nasPlan.includes("EADDRINUSE"),
  "NAS docs must record cwd/port listener restart matching instead of only absolute server.js command lines",
);
assert.ok(
  deploymentDoc.includes("nas_listener_restart_port_still_busy")
    && deploymentDoc.includes("ownerKeySource")
    && deploymentDoc.includes("base64/remote-Python")
    && testMatrix.includes("nas_listener_restart_port_still_busy")
    && testMatrix.includes("ownerKeySource=file"),
  "NAS docs and matrix must require safe listener restart transport, port-release failure, and owner-key-source verification",
);

assert.ok(
  staticDeployScript.includes("Callers must expand") || deploymentDoc.includes("Callers must expand"),
  "NAS static deploy docs must warn callers to include all changed frontend files",
);
assert.ok(
  deploymentDoc.includes("NAS Full-Source Deploy Harness")
    && deploymentDoc.includes("git archive")
    && deploymentDoc.includes("base64 text archive")
    && testMatrix.includes("fixed cross-shell transport"),
  "NAS full-source deploy docs must require the fixed scripted transport path",
);
assert.ok(
  runtimeStateDoc.includes("Normal message creation")
    && runtimeStateDoc.includes("message-count increase")
    && runtimeStateDoc.includes("lastRuntimeStateSave")
    && testMatrix.includes("every normal message")
    && testMatrix.includes("full state backup"),
  "runtime state docs must forbid high-frequency full backups for normal message growth",
);

const nasStartScript = read("scripts/start-nas-gateway-pool.sh");
assert.ok(
  nasStartScript.includes("SKILL_PROFILES_ROOT"),
  "NAS Gateway launcher must bind workers to NAS-local skill profiles",
);
assert.ok(
  nasStartScript.includes("START_PROFILES") && nasStartScript.includes("nasgw1"),
  "NAS Gateway launcher must support hybrid warm-profile startup",
);
assert.ok(
  nasStartScript.includes("nasgw4:18754:owner:owner-full:openai-codex"),
  "NAS Gateway launcher must provision four Owner OpenAI/Codex candidates",
);
assert.ok(
  nasStartScript.includes("DEFAULT_OPENAI_CODEX_MODEL")
    && nasStartScript.includes("HERMES_MOBILE_DEFAULT_OPENAI_CODEX_MODEL")
    && nasStartScript.includes("DEFAULT_REASONING_EFFORT")
    && nasStartScript.includes("max_turns: 60")
    && !nasStartScript.includes("gpt-5.3-codex"),
  "NAS Gateway launcher must derive OpenAI/Codex profiles from the maintained default model source and never fall back to unsupported gpt-5.3-codex",
);
assert.ok(
  read("scripts/start-nas-cron-tick.sh").includes("RUNTIME_CONFIG_PATH")
    && read("scripts/start-nas-cron-tick.sh").includes("defaultModel")
    && read("scripts/start-nas-cron-tick.sh").includes("config.yaml")
    && read("scripts/start-nas-cron-tick.sh").includes("HERMES_GATEWAY_POOL_MANIFEST_PATH")
    && read("scripts/start-nas-cron-tick.sh").includes("HERMES_GATEWAY_TELEMETRY_ROOT")
    && read("scripts/start-nas-cron-tick.sh").includes("hermes-mobile-token-usage-daily.py"),
  "NAS cron tick must sync official CRON runtime config.yaml and install NAS-local official CRON helper scripts from the same runtime source as Gateway workers",
);
assert.ok(
  nasStartScript.includes("grokgw1:18763:owner:owner-full:xai-oauth")
    && nasStartScript.includes('"allowedWorkspaceIds": ["*"] if provider == "xai-oauth"')
    && nasStartScript.includes('"grok", "xai-oauth"')
    && nasStartScript.includes("HERMES_MOBILE_NAS_GROK_AUTH_ROOT")
    && nasStartScript.includes('grok_auth_path if provider == "xai-oauth"'),
  "NAS Gateway launcher must provision a dedicated wildcard Grok/xAI candidate without stealing an ordinary workspace port",
);
assert.ok(
  nasStartScript.includes("nasdsgw1") && nasStartScript.includes("owner:owner-full:deepseek"),
  "NAS Gateway launcher must provision Owner DeepSeek candidates without warming them by default",
);
assert.ok(
  nasStartScript.includes("nasgw5:18755:weixin_wuping") && nasStartScript.includes("nasgw6:18756:weixin_wuping"),
  "NAS Gateway launcher must provision two OpenAI/Codex candidates for ordinary workspaces",
);
assert.ok(
  nasStartScript.includes("nasgw11:18761:weixin_test_1:workspace:weixin_test_1:openai-codex"),
  "NAS Gateway launcher must leave the historical 18761 ordinary test worker as OpenAI/Codex and use manifest-derived Grok routing instead of a hardcoded 18761 assumption",
);
assert.ok(
  nasStartScript.includes("nasdsgw5:18775:weixin_wuping"),
  "NAS Gateway launcher must provision one DeepSeek candidate for ordinary workspaces",
);
assert.ok(
  nasStartScript.includes("--start-profiles") && nasStartScript.includes("--stop-profiles"),
  "NAS Gateway launcher must support profile-specific on-demand start/stop",
);
assert.ok(
  nasStartScript.includes("MEMORY_PROFILES_ROOT"),
  "NAS Gateway launcher must bind workers to NAS-local memory profiles",
);
assert.ok(
  !nasStartScript.includes('for dirname in ["plugins", "skills", "node"]'),
  "NAS Gateway launcher must not symlink every worker to the base Hermes skills directory",
);
assert.ok(
  nasStartScript.includes("first_plugin_workspace"),
  "NAS Gateway launcher must discover workspace-local plugin config before registering plugin MCP",
);
assert.ok(
  nasStartScript.includes("direct_plugin_root = user_root / dirname")
    && nasStartScript.includes("return user_root"),
  "NAS Gateway launcher must prefer workspace-root .hermes-* plugin config before recursively scanning delivery directories",
);
assert.ok(
  nasStartScript.includes("plugin_mcp_config"),
  "NAS Gateway launcher must generate plugin MCP config per worker profile",
);
assert.ok(
  deployScript.includes("nas_finance_config_missing")
    && deployScript.includes("finance_config_missing_for_key"),
  "NAS first-start preflight must fail Finance workspace key-only bindings without .hermes-finance/config.json",
);
assert.ok(
  nasStartScript.includes("strip_plugin_toolset") && nasStartScript.includes("append_toolset"),
  "NAS Gateway launcher must hide plugin toolsets unless the selected workspace has plugin config",
);
for (const expectedWorkspace of ["weixin_wuping", "weixin_stephen", "xuyan"]) {
  assert.ok(
    nasStartScript.includes(expectedWorkspace),
    `NAS Gateway launcher must include first-class worker coverage for ${expectedWorkspace}`,
  );
}

for (const doc of [publicChecklist, deploymentDoc, nasPlan, readme]) {
  assert.ok(
    doc.includes("single worker") || doc.includes("single-worker") || doc.includes("nas-local-codex"),
    "NAS docs must mention the single-worker bridge boundary",
  );
  assert.ok(
    doc.includes("not equivalent") || doc.includes("not the same") || doc.includes("not full elastic"),
    "NAS docs must not present a single-worker bridge as production parity",
  );
}

for (const doc of [deploymentDoc, nasPlan]) {
  assert.ok(
    doc.includes("hybrid") && doc.includes("Owner") && doc.includes("4"),
    "NAS docs must state hybrid production policy as the default",
  );
  assert.ok(
    doc.includes("Skill Store") && doc.includes("Memory Store"),
    "NAS docs must require per-workspace Skill Store and Memory Store binding",
  );
  assert.ok(
    doc.includes("workspace_root_not_private") || doc.includes("not_private") || doc.includes("NAS file-system isolation"),
    "NAS docs must include workspace filesystem isolation preflight language",
  );
  assert.ok(
    doc.includes("workspace-local") && doc.includes("MCP"),
    "NAS docs must require workspace-local plugin MCP registration",
  );
}

console.log("nas-deploy-harness ok");
