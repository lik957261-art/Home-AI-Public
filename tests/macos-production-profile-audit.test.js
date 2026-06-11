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
assert.match(script, /launchctl/);
assert.match(script, /launchd_service_not_loaded/);
assert.match(script, /launchd_plist_missing/);
assert.match(script, /launchd_keepalive_unexpected/);
assert.match(script, /launchd_run_at_load_unexpected/);
assert.match(script, /launchd_required_warm_keepalive_missing/);
assert.match(script, /file_plugin_root_env_missing/);
assert.match(script, /file_plugin_root_missing/);
assert.match(script, /file_plugin_root_list_delimiter_unsupported/);
assert.match(script, /mobile_bridge_env_missing/);
assert.match(script, /mobile_bridge_key_path_missing/);
assert.match(script, /HERMES_MOBILE_BRIDGE_HOST_URL/);
assert.match(script, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH/);
assert.match(script, /HERMES_MOBILE_DOCX_ALLOWED_ROOTS/);
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
  const telemetryRoot = path.join(tempRoot, "telemetry");
  const ownerStateDb = path.join(telemetryRoot, "hm-owner-openai-1", "state.db");
  const ownerResponseDb = path.join(telemetryRoot, "hm-owner-openai-1", "response_store.db");
  fs.mkdirSync(path.dirname(ownerStateDb), { recursive: true });
  fs.writeFileSync(ownerStateDb, "");
  fs.writeFileSync(ownerResponseDb, "");
  writeJson(path.join(data, "gateway-pool-manifest-mac.json"), {
    workers: [
      {
        profile: "hm-owner-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        port: 18751,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-owner.openai.1",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        apiKeyFile: "/secret/not-read",
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
        apiKeyFile: "/secret/not-read",
      },
      {
        profile: "hm-wuping-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        port: 18752,
        launchdLabel: "com.hermesmobile.gateway.hm-fixture-wuping.openai.1",
        allowedWorkspaceIds: ["weixin_wuping"],
        skillWorkspaceIds: ["weixin_wuping"],
        apiKeyFile: "/secret/not-read",
      },
    ],
  });
  writeJson(path.join(data, "workspaces.json"), { workspaces: [] });
  writeJson(path.join(data, "access-keys.json"), { workspaceKeys: { weixin_wuping: { createdAt: "now" } } });
  writeJson(path.join(data, "plugin-workspace-authorizations.json"), {
    plugins: { wardrobe: { records: { weixin_wuping: { status: "active", provisioningStatus: "ok" } } } },
  });
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
  assert.ok(audit.issues.includes("plugin_required_skill_incomplete:owner:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(audit.issues.includes("plugin_required_skill_incomplete:weixin_wuping:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(audit.issues.includes("file_plugin_start_script_missing:hm-wuping-openai-1"));
  assert.ok(audit.issues.includes("file_plugin_root_env_missing:hm-wuping-openai-1:HERMES_MOBILE_DOCX_ALLOWED_ROOTS"));
  assert.ok(audit.issues.includes("shared_skill_missing:shared/response-grounding-baseline"));
  assert.ok(audit.issues.some((item) => item.startsWith("profile_config_missing:")));
  assert.ok(audit.issues.includes("mobile_bridge_env_missing:hm-wuping-openai-1:HERMES_MOBILE_BRIDGE_HOST_URL"));
  assert.ok(audit.issues.includes("mobile_bridge_key_path_missing:hm-wuping-openai-1:data/secrets/bridge-host.secret"));
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
        'HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
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
        'HERMES_MOBILE_AUDIO_ALLOWED_ROOTS="$FILE_PLUGIN_ALLOWED_ROOTS"',
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
