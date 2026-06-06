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
assert.match(script, /launchdProbe/);
assert.match(script, /deepseek_user_worker_missing/);
assert.match(script, /plugin_binding_missing/);
assert.match(script, /plugin_local_binding_incomplete/);
assert.match(script, /plugin_required_skill_incomplete/);
assert.match(script, /shared_skill_missing/);
assert.match(script, /targetMatchesExpected/);
assert.match(script, /stale_skill_profile/);
assert.doesNotMatch(script, /owner-web-key|Bearer|headers\[[^\]]*Authorization|headers\.[A-Za-z0-9_]*Authorization/);
assert.doesNotMatch(script, /readFileSync\(.*apiKey/i);
assert.match(deploymentDoc, /macos-production-profile-audit\.js/);
assert.match(deploymentDoc, /empty `issues`, empty\s+`warnings`/);
assert.match(skillPermissionsDoc, /macOS worker user must be able to read and write/i);
assert.match(skillPermissionsDoc, /stale profile roots/i);
assert.match(testMatrix, /macos-production-profile-audit\.test\.js/);
assert.match(testMatrix, /production audit must\s+return `ok=true`, empty `issues`, empty `warnings`/);

const { buildAudit, launchdServiceStatus } = require("../scripts/macos-production-profile-audit");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const tempRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "homeai-profile-audit-"));
try {
  const data = path.join(tempRoot, "data");
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
  });
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.includes("memory_root_missing:weixin_wuping"));
  assert.ok(audit.issues.includes("deepseek_user_worker_missing:weixin_wuping"));
  assert.ok(audit.issues.includes("plugin_local_binding_incomplete:weixin_wuping:wardrobe"));
  assert.ok(audit.issues.includes("plugin_required_skill_incomplete:weixin_wuping:wardrobe:productivity/wardrobe-style-operations"));
  assert.ok(audit.issues.includes("shared_skill_missing:shared/response-grounding-baseline"));
  assert.ok(audit.issues.some((item) => item.startsWith("profile_config_missing:")));
  const launchdAudit = buildAudit({
    root: tempRoot,
    expectedWorkspaces: ["owner", "weixin_wuping"],
    expectedPlugins: ["wardrobe"],
    strict: true,
    launchdProbe: (label) => !label.includes("deepseek"),
  });
  assert.ok(launchdAudit.issues.includes("launchd_service_not_loaded:deepseekgw1"));
  assert.ok(!launchdAudit.issues.includes("launchd_service_not_loaded:hm-owner-openai-1"));
  assert.equal(launchdServiceStatus({ launchdLabel: "com.hermesmobile.fixture.1" }, { launchdProbe: () => true }).loaded, true);
  assert.equal(launchdServiceStatus({ launchdLabel: "com.hermesmobile.fixture.2" }, { checkLaunchd: false }).checked, false);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS production profile audit tests passed");
