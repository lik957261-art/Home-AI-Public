"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "macos-production-profile-audit.js");
const script = fs.readFileSync(scriptPath, "utf8");
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const skillPermissionsDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "skill-permissions.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

assert.match(script, /gateway-pool-manifest-mac\.json/);
assert.match(script, /plugin-workspace-authorizations\.json/);
assert.match(script, /access-keys\.json/);
assert.match(script, /skill-profiles/);
assert.match(script, /\.hermes-gateway/);
assert.match(script, /profile_skills_not_linked/);
assert.match(script, /profile_memories_not_linked/);
assert.match(script, /profile_skills_temp_write_failed/);
assert.match(script, /profile_memories_temp_write_failed/);
assert.match(script, /profile_soul_missing/);
assert.match(script, /profile_soul_unreadable/);
assert.match(script, /profile_soul_unwritable/);
assert.match(script, /workerCanWriteDirectory/);
assert.match(script, /workerDirectoryWriteProbe/);
assert.match(script, /profileDirForWorker/);
assert.match(script, /codex_auth_json_not_linked/);
assert.match(script, /codex_auth_lock_unwritable/);
assert.match(script, /codex_auth_json_target_unexpected/);
assert.match(script, /launchctl/);
assert.match(script, /launchd_service_not_loaded/);
assert.match(script, /launchd_plist_missing/);
assert.match(script, /launchd_keepalive_unexpected/);
assert.match(script, /launchd_run_at_load_unexpected/);
assert.match(script, /launchd_required_warm_keepalive_missing/);
assert.match(script, /worker_manifest_unreadable/);
assert.match(script, /worker_api_key_file_missing/);
assert.match(script, /worker_api_key_unreadable/);
assert.match(script, /worker_provider_key_unreadable/);
assert.match(script, /profile_config_provider_mismatch/);
assert.match(script, /profile_config_model_mismatch/);
assert.match(script, /profileConfigProbe/);
assert.match(script, /file_plugin_root_env_missing/);
assert.match(script, /file_plugin_root_missing/);
assert.match(script, /file_plugin_root_list_delimiter_unsupported/);
assert.match(script, /mobile_bridge_env_missing/);
assert.match(script, /mobile_bridge_key_path_missing/);
assert.match(script, /installed_gateway_launchd_untracked/);
assert.match(script, /installed_gateway_start_script_root_mismatch/);
assert.match(script, /installed_gateway_mobile_bridge_env_missing/);
assert.match(script, /HERMES_MOBILE_BRIDGE_HOST_URL/);
assert.match(script, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH/);
assert.match(script, /HERMES_MOBILE_DOCX_ALLOWED_ROOTS/);
assert.match(script, /HERMES_MOBILE_PDF_ALLOWED_ROOTS/);
assert.match(script, /HERMES_MOBILE_PDF_OUTPUT_ROOTS/);
assert.match(script, /HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS/);
assert.match(script, /HERMES_MOBILE_HTTP_FILE_ROOTS/);
assert.match(script, /launchdProbe/);
assert.match(script, /launchdPlistProbe/);
assert.match(script, /telemetry_state_path_missing/);
assert.match(script, /telemetry_response_path_missing/);
assert.match(script, /telemetry_state_db_unreadable/);
assert.match(script, /telemetryResponsePathCount/);
assert.match(script, /deepseek_user_worker_missing/);
assert.match(script, /plugin_binding_missing/);
assert.match(script, /plugin_local_binding_incomplete/);
assert.match(script, /plugin_provisioning_not_active/);
assert.match(script, /plugin_required_skill_incomplete/);
assert.match(script, /plugin_required_skill_unreadable/);
assert.match(script, /requiredWorkspaceSkillPlugins/);
assert.match(script, /shared_skill_missing/);
assert.match(script, /targetMatchesExpected/);
assert.match(script, /stale_skill_profile/);
assert.doesNotMatch(script, /owner-web-key|Bearer|headers\[[^\]]*Authorization|headers\.[A-Za-z0-9_]*Authorization/);
assert.doesNotMatch(script, /readFileSync\(.*apiKey/i);
assert.match(deploymentDoc, /macos-production-profile-audit\.js/);
assert.match(deploymentDoc, /empty `issues`, no blocking\s+`warnings`/);
assert.match(skillPermissionsDoc, /macOS worker user must be able to read and write/i);
assert.match(skillPermissionsDoc, /stale profile roots/i);
assert.match(testMatrix, /macos-production-profile-audit\.test\.js/);
assert.match(testMatrix, /production audit must\s+return `ok=true`, empty `issues`, no blocking `warnings`/);

const { buildAudit, launchdServiceStatus } = require("../scripts/macos-production-profile-audit");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const tempRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "homeai-profile-audit-"));
try {
  const data = path.join(tempRoot, "data");
  const manifestPath = path.join(data, "gateway-pool-manifest-mac.json");
  const gatewayWorkerSecrets = path.join(data, "secrets", "gateway-workers");
  const ownerApiKeyFile = path.join(gatewayWorkerSecrets, "hm-owner-openai-1.key");
  const ownerDeepSeekApiKeyFile = path.join(gatewayWorkerSecrets, "deepseekgw1.key");
  const wupingApiKeyFile = path.join(gatewayWorkerSecrets, "hm-wuping-openai-1.key");
  const providerKeyFile = path.join(data, "secrets", "deepseek-api-key.secret");
  const fixtureWupingUser = "hm-fixture-wuping";
  const telemetryRoot = path.join(tempRoot, "telemetry");
  const ownerStateDb = path.join(telemetryRoot, "hm-owner-openai-1", "state.db");
  const ownerResponseDb = path.join(telemetryRoot, "hm-owner-openai-1", "response_store.db");
  fs.mkdirSync(path.dirname(ownerStateDb), { recursive: true });
  fs.mkdirSync(gatewayWorkerSecrets, { recursive: true });
  fs.writeFileSync(ownerStateDb, "");
  fs.writeFileSync(ownerResponseDb, "");
  fs.writeFileSync(ownerApiKeyFile, "fixture-owner-key\n", "utf8");
  fs.writeFileSync(ownerDeepSeekApiKeyFile, "fixture-deepseek-worker-key\n", "utf8");
  fs.writeFileSync(wupingApiKeyFile, "fixture-wuping-key\n", "utf8");
  fs.writeFileSync(providerKeyFile, "fixture-provider-key\n", "utf8");
  writeJson(manifestPath, {
    workers: [
      {
        profile: "hm-owner-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        port: 18751,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-owner.openai.1",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        apiKeyFile: ownerApiKeyFile,
        telemetryStateDbPath: ownerStateDb,
        telemetryResponseStoreDbPath: ownerResponseDb,
      },
      {
        profile: "deepseekgw1",
        provider: "deepseek",
        securityLevel: "user",
        port: 18771,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-owner.deepseek.1",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        apiKeyFile: ownerDeepSeekApiKeyFile,
      },
      {
        profile: "hm-wuping-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        port: 18752,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-wuping.openai.1",
        allowedWorkspaceIds: ["weixin_wuping"],
        skillWorkspaceIds: ["weixin_wuping"],
        apiKeyFile: wupingApiKeyFile,
      },
      {
        profile: "grokgw1",
        provider: "xai-oauth",
        securityLevel: "user",
        port: 18763,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-owner.grok.1",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        apiKeyFile: ownerApiKeyFile,
      },
    ],
  });
  writeJson(path.join(data, "workspaces.json"), { workspaces: [] });
  writeJson(path.join(data, "access-keys.json"), { workspaceKeys: { weixin_wuping: { createdAt: "now" } } });
  writeJson(path.join(data, "plugin-workspace-authorizations.json"), {
    plugins: {
      growth: { records: { weixin_wuping: { status: "active", provisioningStatus: "pending" } } },
      wardrobe: { records: { weixin_wuping: { status: "active", provisioningStatus: "ok" } } },
    },
  });
  const wupingGrowthBinding = path.join(data, "drive", "users", "weixin_wuping", ".hermes-growth");
  fs.mkdirSync(wupingGrowthBinding, { recursive: true });
  fs.writeFileSync(path.join(wupingGrowthBinding, "config.json"), "{\"ok\":true}\n", "utf8");
  fs.writeFileSync(path.join(wupingGrowthBinding, "access-key.txt"), "fixture-growth-key\n", "utf8");
  writeJson(path.join(data, "config", "access-control", "weixin-routing-map.json"), {
    routes: [{ principal_id: "weixin_wuping" }],
  });
  fs.mkdirSync(path.join(data, "skill-profiles", "owner-full", "skills", "productivity"), { recursive: true });
  fs.mkdirSync(path.join(data, "skill-profiles", "owner-full", "memories"), { recursive: true });
  fs.mkdirSync(path.join(data, "skill-profiles", "weixin_wuping", "skills", "productivity"), { recursive: true });
  const audit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: ["owner", "weixin_wuping"],
    expectedPlugins: ["wardrobe"],
    strict: true,
    telemetryReadProbe: () => true,
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.manifest.telemetryStatePathCount, 1);
  assert.equal(audit.manifest.telemetryResponsePathCount, 1);
  assert.ok(!audit.issues.includes("telemetry_state_db_unreadable:hm-owner-openai-1"));
  assert.ok(audit.issues.includes("telemetry_state_path_missing:deepseekgw1"));
  assert.ok(audit.issues.includes("telemetry_response_path_missing:hm-wuping-openai-1"));
  assert.ok(audit.issues.includes("memory_root_missing:weixin_wuping"));
  assert.ok(audit.issues.includes("deepseek_user_worker_missing:weixin_wuping"));
  assert.ok(audit.issues.includes("plugin_local_binding_incomplete:weixin_wuping:wardrobe"));
  assert.ok(!audit.issues.includes("plugin_local_binding_incomplete:weixin_wuping:growth"));
  assert.ok(audit.issues.includes("plugin_provisioning_not_active:weixin_wuping:growth:pending"));
  assert.ok(audit.issues.includes("plugin_required_skill_incomplete:owner:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(audit.issues.includes("plugin_required_skill_incomplete:weixin_wuping:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(audit.issues.includes("file_plugin_start_script_missing:hm-wuping-openai-1"));
  assert.ok(audit.issues.includes("file_plugin_root_env_missing:hm-wuping-openai-1:HERMES_MOBILE_DOCX_ALLOWED_ROOTS"));
  assert.ok(audit.issues.includes("file_plugin_root_env_missing:hm-wuping-openai-1:HERMES_MOBILE_PDF_ALLOWED_ROOTS"));
  assert.ok(audit.issues.includes("file_plugin_root_env_missing:hm-wuping-openai-1:HERMES_MOBILE_PDF_OUTPUT_ROOTS"));
  assert.ok(audit.issues.includes("file_plugin_root_env_missing:hm-wuping-openai-1:HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS"));
  assert.ok(audit.issues.includes("shared_skill_missing:shared/response-grounding-baseline"));
  assert.ok(audit.issues.some((item) => item.startsWith("profile_config_missing:")));
  assert.ok(audit.issues.includes("mobile_bridge_env_missing:hm-wuping-openai-1:HERMES_MOBILE_BRIDGE_HOST_URL"));
  assert.ok(audit.issues.includes("mobile_bridge_key_path_missing:hm-wuping-openai-1:data/secrets/bridge-host.secret"));
  assert.ok(audit.issues.some((item) => item.startsWith("profile_soul_missing:")));
  const profileFixtureRoot = path.join(tempRoot, "profile-fixtures");
  function materializeProfile(profile, profileId) {
    const profileDir = path.join(profileFixtureRoot, profile);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "config.yaml"), "profile: fixture\n", "utf8");
    fs.writeFileSync(path.join(profileDir, "SOUL.md"), "fixture soul\n", "utf8");
    for (const name of ["skills", "memories"]) {
      const link = path.join(profileDir, name);
      const target = path.join(data, "skill-profiles", profileId, name);
      fs.mkdirSync(target, { recursive: true });
      try {
        fs.rmSync(link, { recursive: true, force: true });
      } catch (_) {}
      fs.symlinkSync(target, link);
    }
    return profileDir;
  }
  materializeProfile("hm-owner-openai-1", "owner-full");
  materializeProfile("deepseekgw1", "owner-full");
  materializeProfile("hm-wuping-openai-1", "weixin_wuping");
  materializeProfile("grokgw1", "owner-full");
  const profileAccessReadyAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    profileDirForWorker: (_worker, profile) => path.join(profileFixtureRoot, profile),
    workerDirectoryWriteProbe: () => true,
    workerFileAccessProbe: () => true,
  });
  assert.ok(!profileAccessReadyAudit.issues.some((item) => item.startsWith("profile_skills_temp_write_failed:")));
  assert.ok(!profileAccessReadyAudit.issues.some((item) => item.startsWith("profile_memories_temp_write_failed:")));
  assert.ok(!profileAccessReadyAudit.issues.some((item) => item.startsWith("profile_soul_missing:")));
  assert.ok(!profileAccessReadyAudit.issues.some((item) => item.startsWith("profile_soul_unreadable:")));
  assert.ok(!profileAccessReadyAudit.issues.some((item) => item.startsWith("profile_soul_unwritable:")));
  const ownerProfileCheck = profileAccessReadyAudit.profileChecks.find((item) => item.profile === "hm-owner-openai-1");
  assert.equal(ownerProfileCheck.profileAccess.skillsCanWriteTemp, true);
  assert.equal(ownerProfileCheck.profileAccess.memoriesCanWriteTemp, true);
  assert.equal(ownerProfileCheck.profileAccess.soul.workerCanRead, true);
  assert.equal(ownerProfileCheck.profileAccess.soul.workerCanWrite, true);
  const profileAccessDriftAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    profileDirForWorker: (_worker, profile) => path.join(profileFixtureRoot, profile),
    workerDirectoryWriteProbe: (dir, user) => !(user === fixtureWupingUser && dir.endsWith("/memories")),
    workerFileAccessProbe: (file, user, mode) => !(user === fixtureWupingUser && file.endsWith("/SOUL.md") && mode === "write"),
  });
  assert.ok(profileAccessDriftAudit.issues.includes("profile_memories_temp_write_failed:hm-wuping-openai-1"));
  assert.ok(profileAccessDriftAudit.issues.includes("profile_soul_unwritable:hm-wuping-openai-1"));
  assert.ok(!profileAccessDriftAudit.issues.includes("profile_skills_temp_write_failed:hm-wuping-openai-1"));
  assert.ok(!profileAccessDriftAudit.issues.includes("profile_soul_unreadable:hm-wuping-openai-1"));
  const workerSecretDriftAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    workerFileAccessProbe: (file, user, mode) => {
      if (mode !== "read") return true;
      if (user !== fixtureWupingUser) return true;
      return ![manifestPath, wupingApiKeyFile, providerKeyFile].includes(file);
    },
  });
  assert.ok(workerSecretDriftAudit.issues.includes(`worker_manifest_unreadable:hm-wuping-openai-1:${fixtureWupingUser}`));
  assert.ok(workerSecretDriftAudit.issues.includes(`worker_api_key_unreadable:hm-wuping-openai-1:${fixtureWupingUser}`));
  assert.ok(workerSecretDriftAudit.issues.includes(`worker_provider_key_unreadable:hm-wuping-openai-1:${fixtureWupingUser}:deepseek-api-key.secret`));
  const fileRootReadyAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    startScriptProbe: () => ({
      exists: true,
      text: [
        'FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"',
        'HERMES_MOBILE_DOCX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_PDF_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_PDF_OUTPUT_ROOTS="$ROOT/data/artifacts"',
        'HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_IMAGE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_VIDEO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_HTTP_FILE_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="$ROOT/data/drive/users"',
        'HERMES_MOBILE_HTTP_SAVE_ROOT="$ROOT/data/artifacts/http-request"',
        'HERMES_MOBILE_VIDEO_OUTPUT_ROOT="$ROOT/data/artifacts/grok-videos"',
        'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
        'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
        'HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
        'HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
      ].join("\n"),
    }),
  });
  assert.ok(!fileRootReadyAudit.issues.some((item) => item.startsWith("file_plugin_root_env_missing:")));
  assert.ok(!fileRootReadyAudit.issues.some((item) => item.startsWith("file_plugin_root_missing:")));
  assert.ok(!fileRootReadyAudit.issues.some((item) => item.startsWith("file_plugin_root_list_delimiter_unsupported:")));
  assert.ok(!fileRootReadyAudit.issues.some((item) => item.startsWith("mobile_bridge_")));
  const bridgeComputedButNotInjectedAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    startScriptProbe: () => ({
      exists: true,
      text: [
        'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
        'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
        'exec env HOME="/Users/example/path" "$ROOT/runtime/hermes-agent-official/venv/bin/python" -m hermes_cli.main gateway run --replace --accept-hooks',
      ].join("\n"),
    }),
  });
  assert.ok(bridgeComputedButNotInjectedAudit.issues.includes("mobile_bridge_env_missing:hm-owner-openai-1:HERMES_MOBILE_BRIDGE_HOST_URL"));
  assert.ok(bridgeComputedButNotInjectedAudit.issues.includes("mobile_bridge_env_missing:hm-owner-openai-1:HERMES_MOBILE_BRIDGE_HOST_KEY_PATH"));
  const colonDelimitedRootAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    startScriptProbe: () => ({
      exists: true,
      text: [
        'FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive:$ROOT/data/uploads:$ROOT/data/artifacts"',
        'HERMES_MOBILE_DOCX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_PDF_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_PDF_OUTPUT_ROOTS="$ROOT/data/artifacts"',
        'HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_IMAGE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_VIDEO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_HTTP_FILE_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
        'HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="$ROOT/data/drive/users"',
        'HERMES_MOBILE_HTTP_SAVE_ROOT="$ROOT/data/artifacts/http-request"',
        'HERMES_MOBILE_VIDEO_OUTPUT_ROOT="$ROOT/data/artifacts/grok-videos"',
        'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
        'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
        'HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
        'HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
      ].join("\n"),
    }),
  });
  assert.ok(colonDelimitedRootAudit.issues.includes("file_plugin_root_list_delimiter_unsupported:hm-wuping-openai-1"));
  const launchdAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: ["owner", "weixin_wuping"],
    expectedPlugins: ["wardrobe"],
    strict: true,
    launchdProbe: (label) => !label.includes("deepseek"),
    launchdPlistProbe: (label) => ({
      plistExists: true,
      runAtLoad: label.includes("owner.openai.1") || label.includes("wuping.openai.1"),
      keepAlive: label.includes("owner.openai.1") || label.includes("wuping.openai.1"),
    }),
    telemetryReadProbe: () => false,
  });
  assert.ok(launchdAudit.issues.includes("telemetry_state_db_unreadable:hm-owner-openai-1"));
  assert.ok(launchdAudit.issues.includes("launchd_service_not_loaded:deepseekgw1"));
  assert.ok(!launchdAudit.issues.includes("launchd_service_not_loaded:hm-owner-openai-1"));
  assert.ok(launchdAudit.issues.includes("launchd_keepalive_unexpected:hm-owner-openai-1"));
  assert.ok(launchdAudit.issues.includes("launchd_run_at_load_unexpected:hm-owner-openai-1"));
  assert.ok(launchdAudit.issues.includes("launchd_keepalive_unexpected:hm-wuping-openai-1"));
  assert.ok(launchdAudit.issues.includes("launchd_run_at_load_unexpected:hm-wuping-openai-1"));
  assert.equal(launchdServiceStatus({ launchdLabel: "com.hermesmobile.fixture.1" }, { launchdProbe: () => true }).loaded, true);
  assert.equal(launchdServiceStatus({ launchdLabel: "com.hermesmobile.fixture.2" }, { checkLaunchd: false }).checked, false);
  const codexAuthDriftAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    codexAuthProbe: ({ profile }) => {
      if (profile === "hm-owner-openai-1") {
        return {
          authJson: { exists: true, isSymbolicLink: false, targetMatchesExpected: false },
          authLock: { exists: true, isSymbolicLink: true, targetMatchesExpected: false },
          workerCanReadAuthJson: false,
          workerCanWriteAuthJson: false,
          workerCanReadAuthLock: true,
          workerCanWriteAuthLock: false,
        };
      }
      return {
        authJson: { exists: true, isSymbolicLink: true, targetMatchesExpected: true },
        authLock: { exists: true, isSymbolicLink: true, targetMatchesExpected: true },
        workerCanReadAuthJson: true,
        workerCanWriteAuthJson: true,
        workerCanReadAuthLock: true,
        workerCanWriteAuthLock: true,
      };
    },
  });
  assert.ok(codexAuthDriftAudit.issues.includes("codex_auth_json_not_linked:hm-owner-openai-1"));
  assert.ok(codexAuthDriftAudit.issues.includes("codex_auth_json_unreadable:hm-owner-openai-1"));
  assert.ok(codexAuthDriftAudit.issues.includes("codex_auth_json_unwritable:hm-owner-openai-1"));
  assert.ok(codexAuthDriftAudit.issues.includes("codex_auth_lock_target_unexpected:hm-owner-openai-1"));
  assert.ok(codexAuthDriftAudit.issues.includes("codex_auth_lock_unwritable:hm-owner-openai-1"));
  const profileConfigDriftAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    profileDirForWorker: (_worker, profile) => path.join(profileFixtureRoot, profile),
    workerDirectoryWriteProbe: () => true,
    workerFileAccessProbe: () => true,
    startScriptProbe: () => ({ exists: true, text: [
      'FILE_PLUGIN_ALLOWED_ROOTS="$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts"',
      'HERMES_MOBILE_DOCX_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_PDF_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_PDF_OUTPUT_ROOTS="$ROOT/data/artifacts"',
      'HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_IMAGE_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_VIDEO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_HTTP_FILE_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
      'HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="$ROOT/data/drive/users"',
      'HERMES_MOBILE_HTTP_SAVE_ROOT="$ROOT/data/artifacts/http-request"',
      'HERMES_MOBILE_VIDEO_OUTPUT_ROOT="$ROOT/data/artifacts/grok-videos"',
      'HERMES_MOBILE_BRIDGE_HOST_URL="http://127.0.0.1:8798"',
      'HERMES_WEB_BRIDGE_HOST_URL="http://127.0.0.1:8798"',
      'HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$ROOT/data/secrets/bridge-host.secret"',
      'HERMES_WEB_BRIDGE_HOST_KEY_PATH="$ROOT/data/secrets/bridge-host.secret"',
    ].join("\n") }),
    profileConfigProbe: ({ profile, worker }) => profile === "grokgw1"
      ? { exists: true, provider: "openai-codex", model: "gpt-5.5" }
      : { exists: true, provider: worker.provider || "openai-codex", model: worker.provider === "deepseek" ? "deepseek-chat" : "gpt-5.5" },
  });
  assert.ok(profileConfigDriftAudit.issues.includes("profile_config_provider_mismatch:grokgw1:openai-codex:xai-oauth"));
  assert.ok(profileConfigDriftAudit.issues.includes("profile_config_model_mismatch:grokgw1:gpt-5.5:grok-4.3"));
  const grokProfileCheck = profileConfigDriftAudit.profileChecks.find((item) => item.profile === "grokgw1");
  assert.equal(grokProfileCheck.profileConfig.expectedProvider, "xai-oauth");
  assert.equal(grokProfileCheck.profileConfig.expectedModel, "grok-4.3");
  const installedLaunchdAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: [],
    requiredWorkspacePlugins: {},
    requiredSharedSkills: [],
    checkTelemetry: false,
    startScriptProbe: () => ({
      exists: true,
      text: [
        `ROOT="${tempRoot}"`,
        'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
        'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
        'HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
        'HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
        'HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
      ].join("\n"),
    }),
    installedGatewayLaunchdProbe: () => [
      {
        label: "com.hermesmobile.gateway.hm-fixture-owner.openai.1",
        plistPath: "/LaunchDaemons/com.hermesmobile.gateway.hm-fixture-owner.openai.1.plist",
        startScriptPath: "/Users/example/path",
      },
      {
        label: "com.hermesmobile.gateway.hm-fixture-wuping.openai.1",
        plistPath: "/LaunchDaemons/com.hermesmobile.gateway.hm-fixture-wuping.openai.1.plist",
        startScriptPath: "/tmp/wrong-owned.sh",
      },
      {
        label: "com.hermesmobile.gateway.hm-weixin-stephen.openai.1",
        plistPath: "/LaunchDaemons/com.hermesmobile.gateway.hm-weixin-stephen.openai.1.plist",
        startScriptPath: "/tmp/legacy.sh",
      },
    ],
    installedGatewayStartScriptProbe: (file) => ({
      exists: true,
      text: file.includes("legacy")
        ? [
          "ROOT='/Users/example/path'",
          "exec env HOME='/Users/example/path' PYTHONPATH=\"$RUNTIME_OVERRIDES:$RUNTIME_SOURCE\" \"$RUNTIME_PYTHON\" -m hermes_cli.main gateway run --replace --accept-hooks",
        ].join("\n")
        : [
          `ROOT="${tempRoot}"`,
          'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
          'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
          'HERMES_MOBILE_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
          'HERMES_WEB_BRIDGE_HOST_URL="$MOBILE_BRIDGE_HOST_URL"',
          'HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
          'HERMES_WEB_BRIDGE_HOST_KEY_PATH="$MOBILE_BRIDGE_HOST_KEY_PATH"',
        ].join("\n"),
    }),
  });
  assert.ok(installedLaunchdAudit.issues.includes("installed_gateway_launchd_untracked:com.hermesmobile.gateway.hm-weixin-stephen.openai.1"));
  assert.ok(installedLaunchdAudit.issues.includes("installed_gateway_start_script_path_mismatch:com.hermesmobile.gateway.hm-fixture-wuping.openai.1"));
  assert.ok(installedLaunchdAudit.issues.includes("installed_gateway_start_script_root_mismatch:com.hermesmobile.gateway.hm-weixin-stephen.openai.1"));
  assert.ok(installedLaunchdAudit.issues.includes("installed_gateway_mobile_bridge_env_missing:com.hermesmobile.gateway.hm-weixin-stephen.openai.1:HERMES_MOBILE_BRIDGE_HOST_URL"));
  assert.ok(!installedLaunchdAudit.issues.includes("installed_gateway_launchd_untracked:com.hermesmobile.gateway.hm-fixture-owner.openai.1"));
  const wardrobeSkillDir = path.join(
    data,
    "skill-profiles",
    "weixin_wuping",
    "skills",
    "productivity",
    "wardrobe-style-operations",
  );
  fs.mkdirSync(path.join(wardrobeSkillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(wardrobeSkillDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(wardrobeSkillDir, "SKILL.md"), "wardrobe skill", "utf8");
  const ownerWardrobeSkillDir = path.join(
    data,
    "skill-profiles",
    "owner-full",
    "skills",
    "productivity",
    "wardrobe-style-operations",
  );
  fs.mkdirSync(path.join(ownerWardrobeSkillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(ownerWardrobeSkillDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(ownerWardrobeSkillDir, "SKILL.md"), "owner wardrobe skill", "utf8");
  const unreadableSkillAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: [],
    expectedPlugins: ["wardrobe"],
    requiredWorkspacePlugins: { weixin_wuping: ["wardrobe"] },
    requiredSharedSkills: [],
    checkTelemetry: false,
    listenerReadProbe: () => false,
  });
  assert.ok(!unreadableSkillAudit.issues.includes("plugin_required_skill_incomplete:owner:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(unreadableSkillAudit.issues.includes("plugin_required_skill_unreadable:owner:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(!unreadableSkillAudit.issues.includes("plugin_required_skill_incomplete:weixin_wuping:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(unreadableSkillAudit.issues.includes("plugin_required_skill_unreadable:weixin_wuping:wardrobe:productivity/wardrobe-style-operations"));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS production profile audit tests passed");
