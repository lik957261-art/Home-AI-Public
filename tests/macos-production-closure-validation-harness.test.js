"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/macos-production-closure-validation.js");
const runbook = read("docs/RUNBOOKS/macos-production-closure-validation.md");
const docsIndex = read("docs/DOCS_INDEX.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const macosPlan = read("docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md");
const testMatrix = read("docs/TEST_MATRIX.md");
const architectureMap = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");

assert.match(script, /production-status-smoke\.js/);
assert.match(script, /macos-production-profile-audit\.js/);
assert.match(script, /macos-worker-filesystem-access-harness\.js/);
assert.match(script, /macos-plugin-directory-production-smoke\.js/);
assert.match(script, /macos-bound-directory-preview-smoke\.js/);
assert.match(script, /macos-wardrobe-binding-production-smoke\.js/);
assert.match(script, /gateway-tool-schema-smoke\.js/);
assert.match(script, /gateway-pool-production-smoke\.js/);
assert.match(script, /weixin-ingress-production-smoke\.js/);
assert.match(script, /compactRuntimePython/);
assert.match(script, /runtime_python_resolves_to_developer_home/);
assert.match(script, /hm-wuping-openai-1/);
assert.match(script, /hm-owner-openai-1/);
assert.match(script, /hm-test-openai-1/);
assert.match(script, /MAC_BASE_SCHEMA_TOOLS/);
assert.match(script, /http_request/);
assert.match(script, /weather/);
assert.match(script, /mobile_web_search/);
assert.match(script, /mobile_web_extract/);
assert.match(script, /chatgpt_image_edit/);
assert.match(script, /docx_extract_text/);
assert.match(script, /audio_transcribe/);
assert.match(script, /mcp_wardrobe_wardrobe_write_history/);
assert.match(script, /mcp_email_search_messages/);
assert.match(script, /deepseekgw1/);
assert.match(script, /deepseekmaint1/);
assert.match(script, /deferred_manual_oauth_not_included/);
assert.match(script, /AUTH_PROCESS_PATTERN/);
assert.match(script, /macos_closure_oauth_reauth_process_present/);
assert.match(script, /concurrentOwnerRuns/);
assert.match(script, /expectedVersion/);
assert.match(script, /data-client-version/);
assert.match(script, /productionStatusArgs/);
assert.match(script, /--expected-version/);
assert.match(script, /wrongHeaderDenied/);
assert.match(script, /activeGlobal === 0/);
assert.match(script, /blockingWarningCount === 0/);
assert.match(script, /skipPluginDirectory/);
assert.match(script, /compactPluginDirectory/);
assert.match(script, /skipBoundDirectory/);
assert.match(script, /compactBoundDirectory/);
assert.match(script, /skipWardrobeBinding/);
assert.match(script, /compactWardrobeBinding/);
assert.doesNotMatch(script, /console\.log\(.*ownerKeyFile/);
assert.doesNotMatch(script, /console\.log\(.*ingressKeyFile/);
assert.doesNotMatch(script, /console\.error\(.*ownerKeyFile/);
assert.doesNotMatch(script, /console\.error\(.*ingressKeyFile/);
assert.doesNotMatch(script, /access_token[\"']?\s*:/);
assert.doesNotMatch(script, /refresh_token[\"']?\s*:/);
assert.doesNotMatch(script, /ownerElevationOnceToken.*console/);

assert.match(runbook, /macos-production-closure-validation\.js/);
assert.match(runbook, /Grok\/xAI/);
assert.match(runbook, /deferred/);
assert.match(runbook, /X-Hermes-Web-Key/);
assert.match(runbook, /X-Hermes-Access-Key/);
assert.match(runbook, /X-Hermes-Mobile-Ingress-Key/);
assert.match(runbook, /Owner\/OpenAI concurrent/);
assert.match(runbook, /expectedVersion/);
assert.match(runbook, /blockingWarningCount/);
assert.match(runbook, /telemetry_state_db_missing/);
assert.match(runbook, /runtime Python/i);
assert.match(runbook, /plugin delivery directories/);
assert.match(runbook, /Directory-bound topics/i);
assert.match(runbook, /Wardrobe binding/);
assert.match(runbook, /Do not paste OAuth callback URLs/);

assert.match(docsIndex, /Mac production closure validation/);
assert.match(deploymentDoc, /macos-production-closure-validation\.js/);
assert.match(deploymentDoc, /macos-plugin-directory-production-smoke\.js/);
assert.match(deploymentDoc, /macos-bound-directory-preview-smoke\.js/);
assert.match(deploymentDoc, /macos-wardrobe-binding-production-smoke\.js/);
assert.match(deploymentDoc, /Grok\/xAI remains a deferred\s+manual OAuth follow-up/);
assert.match(deploymentDoc, /--expected-version/);
assert.match(macosPlan, /macos-production-closure-validation\.js/);
assert.match(macosPlan, /Owner\/OpenAI concurrent/);
assert.match(testMatrix, /macos-production-closure-validation-harness\.test\.js/);
assert.match(testMatrix, /macos-production-closure-validation\.js/);
assert.match(architectureMap, /scripts\/macos-production-closure-validation\.js/);
assert.match(architectureMap, /tests\/macos-production-closure-validation-harness\.test\.js/);

const {
  compactAcl,
  compactBoundDirectory,
  compactGatewaySmoke,
  compactProfileAudit,
  compactRuntimePython,
  compactPluginDirectory,
  compactWardrobeBinding,
  compactSchema,
  compactStatus,
  compactWeixin,
  isAllowedProfileAuditWarning,
  parseArgs,
  productionStatusArgs,
  readAppClientVersion,
  resolveExpectedVersion,
  sanitize,
} = require("../scripts/macos-production-closure-validation");

const parsed = parseArgs([]);
assert.equal(parsed.root, "/Users/hermes-host/HermesMobile");
assert.equal(parsed.base, "http://127.0.0.1:8797");
assert.equal(parsed.expectedVersion, "");
assert.ok(parsed.ownerKeyFile.endsWith("/data/secrets/owner-web-key.secret"));
assert.ok(parsed.ingressKeyFile.endsWith("/data/weixin-ingress.secret"));

const explicitVersion = parseArgs(["--expected-version", "20260608-runtime-config-arch-v627"]);
assert.equal(explicitVersion.expectedVersion, "20260608-runtime-config-arch-v627");

const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-mac-closure-"));
fs.mkdirSync(path.join(appRoot, "public"), { recursive: true });
fs.writeFileSync(path.join(appRoot, "public", "index.html"), '<html data-client-version="test-version"></html>\n', "utf8");
assert.equal(readAppClientVersion({ app: appRoot }), "test-version");
assert.equal(resolveExpectedVersion({ app: appRoot, expectedVersion: "" }), "test-version");
assert.equal(resolveExpectedVersion({ app: appRoot, expectedVersion: "manual-version" }), "manual-version");
assert.throws(() => readAppClientVersion({ app: path.join(appRoot, "missing") }), /macos_closure_app_client_version_unreadable/);
assert.deepEqual(productionStatusArgs({
  ownerKeyFile: "/private/key.secret",
  base: "http://127.0.0.1:8797",
  expectedVersion: "test-version",
}), [
  "--access-key-file", "/private/key.secret",
  "--base", "http://127.0.0.1:8797",
  "--max-active-global", "0",
  "--json",
  "--expected-version", "test-version",
]);

const status = compactStatus({
  ok: true,
  activeGlobal: 0,
  clientVersion: "v",
  gatewayPool: { enabled: true, workerCount: 30 },
  authHeader: "X-Hermes-Web-Key",
  wrongHeaderDenied: true,
  wrongHeaderStatus: 401,
  originIdentity: { title: "Home AI", ownerKeySource: "file" },
});
assert.deepEqual(status, {
  ok: true,
  activeGlobal: 0,
  clientVersion: "v",
  gatewayPool: { enabled: true, workerCount: 30 },
  authHeader: "X-Hermes-Web-Key",
  wrongHeaderDenied: true,
  wrongHeaderStatus: 401,
  originTitle: "Home AI",
  ownerKeySource: "file",
});

const profile = compactProfileAudit({
  ok: true,
  issues: [],
  warnings: [
    "telemetry_state_db_missing:hm-owner-openai-3",
    "telemetry_response_store_missing:hm-owner-openai-3",
  ],
  manifest: { workerCount: 30 },
  activeWorkspaceKeys: ["weixin_wuping"],
  staleSkillProfiles: [],
});
assert.equal(profile.issueCount, 0);
assert.equal(profile.warningCount, 2);
assert.equal(profile.allowedWarningCount, 2);
assert.equal(profile.blockingWarningCount, 0);
assert.equal(profile.workerCount, 30);
assert.equal(isAllowedProfileAuditWarning("telemetry_state_db_missing:hm-owner-openai-3"), true);
assert.equal(isAllowedProfileAuditWarning("telemetry_response_store_missing:hm-owner-openai-3"), true);
assert.equal(isAllowedProfileAuditWarning("profile_skills_target_unexpected:hm-owner-openai-3"), false);

const runtimePythonPath = path.join(appRoot, "python");
fs.writeFileSync(runtimePythonPath, "#!/bin/sh\nexit 0\n", "utf8");
fs.chmodSync(runtimePythonPath, 0o755);
assert.deepEqual(compactRuntimePython({ runtimePython: runtimePythonPath }), {
  ok: true,
  configuredPath: runtimePythonPath,
  realPath: fs.realpathSync(runtimePythonPath),
  executable: true,
  issue: "",
});
assert.deepEqual(compactRuntimePython({ runtimePython: "/Users/xuxin/missing-python" }), {
  ok: false,
  configuredPath: "/Users/xuxin/missing-python",
  realPath: "",
  executable: false,
  issue: "runtime_python_resolves_to_developer_home",
});

const acl = compactAcl({
  ok: true,
  results: [
    { status: "ok" },
    { status: "ok", expectedDenied: true },
    { status: "failed" },
  ],
});
assert.deepEqual(acl, { ok: true, checkedCount: 3, failedCount: 1, denyCheckCount: 1 });

const schema = compactSchema("owner", {
  ok: true,
  requiredTools: ["mcp_note_notes_create"],
  workers: [{
    worker: "hm-owner-openai-1",
    sessionPath: "/private/session.json",
    evidence: "agent-schema-probe",
    toolCount: 120,
    agentSchemaToolCount: 120,
  }],
});
assert.equal(JSON.stringify(schema).includes("session.json"), false);
assert.equal(schema.workers[0].toolCount, 120);

const gateway = compactGatewaySmoke({
  ok: true,
  request: { expectedProfile: "deepseekgw1" },
  run: { gatewayProfile: "deepseekgw1", gatewaySource: "worker_pool", gatewayMaintenance: false },
});
assert.equal(gateway.gatewayProfile, "deepseekgw1");
assert.equal(gateway.maintenance, false);

const weixin = compactWeixin({
  ok: true,
  mode: "heartbeat",
  ingressAuthHeader: "X-Hermes-Mobile-Ingress-Key",
  wrongHeaderDenied: true,
  wrongHeaderStatus: 401,
  workspaces: [{ workspaceId: "weixin_wuping", status: 202, heartbeat: true, skipped: false, reason: "weixin_ingress_heartbeat" }],
});
assert.equal(weixin.workspaces[0].hasRun, false);
assert.equal(weixin.workspaces[0].hasThread, false);
assert.equal(weixin.workspaces[0].hasMessage, false);

const pluginDirectory = compactPluginDirectory({
  ok: true,
  authHeader: "X-Hermes-Web-Key",
  workspaceCount: 1,
  pluginFolders: ["衣橱"],
  rows: [{
    workspaceId: "owner",
    label: "徐欣",
    ok: true,
    base: "$DRIVE/users/owner/Hermes-徐欣",
    projectCount: 2,
    hasThread: true,
    rootCreate: { status: 409, ok: true },
    preview: { status: 200, names: ["衣橱"] },
    pluginCreates: [{ folder: "衣橱", status: 409, ok: true }],
  }],
});
assert.equal(pluginDirectory.workspaceCount, 1);
assert.equal(pluginDirectory.rows[0].base, "$DRIVE/users/owner/Hermes-徐欣");

const boundDirectory = compactBoundDirectory({
  ok: true,
  allWorkspaces: true,
  includeChat: false,
  simulateUiRoute: true,
  workspaceCount: 2,
  results: [
    { workspaceId: "owner", ok: true, uniquePaths: 25, okCount: 25, failed: 0, failures: [] },
    { workspaceId: "weixin_xiaonan", ok: false, skipped: true, skipReason: "unknown-workspace", uniquePaths: 0, okCount: 0, failed: 0, failures: [] },
  ],
});
assert.equal(boundDirectory.ok, true);
assert.equal(boundDirectory.simulateUiRoute, true);
assert.equal(boundDirectory.results[0].okCount, 25);
assert.equal(boundDirectory.results[1].skipped, true);

const wardrobeBinding = compactWardrobeBinding({
  ok: true,
  authHeader: "X-Hermes-Web-Key",
  expectedOrigin: "http://127.0.0.1:8765",
  legacyOrigin: "http://127.0.0.1:8765",
  bindingCount: 1,
  bindings: [{
    path: "<HERMES_MOBILE_ROOT>/data/drive/users/weixin_wuping/.hermes-wardrobe/config.json",
    ok: true,
    configReadable: true,
    workspaceId: "weixin_wuping",
    hermesWorkspaceId: "weixin_wuping",
    apiBaseOrigin: "http://127.0.0.1:8765",
    keyShape: { present: true, prefixOk: true },
    legacyOriginPresent: false,
  }],
  workspaces: [{
    workspaceId: "weixin_wuping",
    ok: true,
    manifest: { programApiOrigin: "http://127.0.0.1:8765", tokenStatus: "launch_token_issued" },
    entry: { status: 200, bytes: 18388 },
    bootstrap: { status: 200, itemCount: 39 },
  }],
});
assert.equal(wardrobeBinding.bindingCount, 1);
assert.equal(wardrobeBinding.workspaces[0].bootstrap.itemCount, 39);

const sanitized = sanitize("/Users/hermes-host/HermesMobile/data/secrets/owner-web-key.secret secret.abcdefghijklmnopqrstuvwxyz", parsed);
assert.doesNotMatch(sanitized, /owner-web-key\.secret/);
assert.doesNotMatch(sanitized, /abcdefghijklmnopqrstuvwxyz/);

console.log("macOS production closure validation harness tests passed");
