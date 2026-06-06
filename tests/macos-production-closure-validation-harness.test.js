"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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
assert.match(script, /gateway-tool-schema-smoke\.js/);
assert.match(script, /gateway-pool-production-smoke\.js/);
assert.match(script, /weixin-ingress-production-smoke\.js/);
assert.match(script, /hm-wuping-openai-1/);
assert.match(script, /hm-owner-openai-1/);
assert.match(script, /hm-test-openai-1/);
assert.match(script, /mcp_wardrobe_wardrobe_write_history/);
assert.match(script, /mcp_email_search_messages/);
assert.match(script, /deepseekgw1/);
assert.match(script, /deepseekmaint1/);
assert.match(script, /deferred_manual_oauth_not_included/);
assert.match(script, /AUTH_PROCESS_PATTERN/);
assert.match(script, /macos_closure_oauth_reauth_process_present/);
assert.match(script, /concurrentOwnerRuns/);
assert.match(script, /wrongHeaderDenied/);
assert.match(script, /activeGlobal === 0/);
assert.match(script, /skipPluginDirectory/);
assert.match(script, /compactPluginDirectory/);
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
assert.match(runbook, /plugin delivery directories/);
assert.match(runbook, /Do not paste OAuth callback URLs/);

assert.match(docsIndex, /Mac production closure validation/);
assert.match(deploymentDoc, /macos-production-closure-validation\.js/);
assert.match(deploymentDoc, /macos-plugin-directory-production-smoke\.js/);
assert.match(deploymentDoc, /Grok\/xAI remains a deferred\s+manual OAuth follow-up/);
assert.match(macosPlan, /macos-production-closure-validation\.js/);
assert.match(macosPlan, /Owner\/OpenAI concurrent/);
assert.match(testMatrix, /macos-production-closure-validation-harness\.test\.js/);
assert.match(testMatrix, /macos-production-closure-validation\.js/);
assert.match(architectureMap, /scripts\/macos-production-closure-validation\.js/);
assert.match(architectureMap, /tests\/macos-production-closure-validation-harness\.test\.js/);

const {
  compactAcl,
  compactGatewaySmoke,
  compactProfileAudit,
  compactPluginDirectory,
  compactSchema,
  compactStatus,
  compactWeixin,
  parseArgs,
  sanitize,
} = require("../scripts/macos-production-closure-validation");

const parsed = parseArgs([]);
assert.equal(parsed.root, "/Users/hermes-host/HermesMobile");
assert.equal(parsed.base, "http://127.0.0.1:8797");
assert.ok(parsed.ownerKeyFile.endsWith("/data/secrets/owner-web-key.secret"));
assert.ok(parsed.ingressKeyFile.endsWith("/data/weixin-ingress.secret"));

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
  warnings: [],
  manifest: { workerCount: 30 },
  activeWorkspaceKeys: ["weixin_wuping"],
  staleSkillProfiles: [],
});
assert.equal(profile.issueCount, 0);
assert.equal(profile.warningCount, 0);
assert.equal(profile.workerCount, 30);

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

const sanitized = sanitize("/Users/hermes-host/HermesMobile/data/secrets/owner-web-key.secret secret.abcdefghijklmnopqrstuvwxyz", parsed);
assert.doesNotMatch(sanitized, /owner-web-key\.secret/);
assert.doesNotMatch(sanitized, /abcdefghijklmnopqrstuvwxyz/);

console.log("macOS production closure validation harness tests passed");
