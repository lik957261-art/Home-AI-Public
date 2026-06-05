"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/grok-auth-metadata-smoke.js");
const macosReauthScript = read("scripts/macos-grok-xai-reauth.sh");
const macosReauthCommand = read("scripts/macos-grok-xai-reauth.command");
const grokDoc = read("docs/MODULES/grok-gateway.md");
const grokRunbook = read("docs/RUNBOOKS/grok-gateway-auth.md");
const testMatrix = read("docs/TEST_MATRIX.md");
const architectureMap = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");

assert.match(script, /--profile-auth-file <file>/);
assert.match(script, /--shared-auth-file <file>/);
assert.match(script, /--require-access-token/);
assert.match(script, /HERMES_GROK_GATEWAY_SHARED_AUTH_PATH/);
assert.match(script, /grok_xai_oauth_access_token_missing/);
assert.match(script, /hasAccessToken/);
assert.match(script, /hasRefreshToken/);
assert.doesNotMatch(script, /console\.log\(.*profileAuthFile/);
assert.doesNotMatch(script, /console\.log\(.*sharedAuthFile/);
assert.doesNotMatch(script, /console\.error\(.*profileAuthFile/);
assert.doesNotMatch(script, /console\.error\(.*sharedAuthFile/);
assert.doesNotMatch(script, /access_token[\"']?\s*:/);
assert.doesNotMatch(script, /refresh_token[\"']?\s*:/);

assert.match(macosReauthScript, /auth add xai-oauth/);
assert.match(macosReauthScript, /--manual-paste/);
assert.match(macosReauthScript, /HERMES_HOME="\$PROFILE_HOME"/);
assert.match(macosReauthScript, /HERMES_PROFILE="\$PROFILE"/);
assert.match(macosReauthScript, /grok-auth-metadata-smoke\.js/);
assert.match(macosReauthScript, /--require-access-token/);
assert.match(macosReauthScript, /Do not paste the callback URL or authorization code into chat/);
assert.doesNotMatch(macosReauthScript, /api[_-]?key/i);
assert.doesNotMatch(macosReauthScript, /access_token[\"']?\s*:/);
assert.doesNotMatch(macosReauthScript, /refresh_token[\"']?\s*:/);

assert.match(macosReauthCommand, /macos-grok-xai-reauth\.sh/);
assert.match(macosReauthCommand, /sudo bash "\$HELPER"/);
assert.match(macosReauthCommand, /Paste the callback URL or authorization code into this Terminal window only/);
assert.doesNotMatch(macosReauthCommand, /api[_-]?key/i);
assert.doesNotMatch(macosReauthCommand, /access_token[\"']?\s*:/);
assert.doesNotMatch(macosReauthCommand, /refresh_token[\"']?\s*:/);

assert.match(grokDoc, /grok-auth-metadata-smoke\.js/);
assert.match(grokDoc, /macos-grok-xai-reauth\.sh/);
assert.match(grokDoc, /HomeAI-Grok-XAI-Reauth\.command/);
assert.match(grokDoc, /HERMES_GROK_GATEWAY_SHARED_AUTH_PATH/);
assert.match(grokDoc, /grok_xai_oauth_access_token_missing/);
assert.match(grokRunbook, /grok-auth-metadata-smoke\.js/);
assert.match(grokRunbook, /macos-grok-xai-reauth\.sh/);
assert.match(grokRunbook, /HomeAI-Grok-XAI-Reauth\.command/);
assert.match(grokRunbook, /HERMES_GROK_GATEWAY_SHARED_AUTH_PATH/);
assert.match(grokRunbook, /profile-local and shared auth stores/);
assert.match(testMatrix, /grok-auth-metadata-smoke-harness\.test\.js/);
assert.match(testMatrix, /grok-auth-metadata-smoke\.js/);
assert.match(testMatrix, /macos-grok-xai-reauth\.sh/);
assert.match(architectureMap, /scripts\/grok-auth-metadata-smoke\.js/);
assert.match(architectureMap, /scripts\/macos-grok-xai-reauth\.sh/);
assert.match(architectureMap, /tests\/grok-auth-metadata-smoke-harness\.test\.js/);

const { buildReport } = require("../scripts/grok-auth-metadata-smoke");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-grok-auth-smoke-"));
try {
  const profileFile = path.join(tempRoot, "profile-auth.json");
  const sharedFile = path.join(tempRoot, "shared-auth.json");
  fs.writeFileSync(profileFile, JSON.stringify({
    providers: {
      "xai-oauth": { label: "xai" },
    },
    credential_pool: {},
  }), "utf8");
  fs.writeFileSync(sharedFile, JSON.stringify({
    providers: {
      "xai-oauth": {
        access_token: "secret-access-token",
        refresh_token: "secret-refresh-token",
        expires_at: "2099-01-01T00:00:00.000Z",
      },
    },
  }), "utf8");
  const okReport = buildReport({ profileAuthFile: profileFile, sharedAuthFile: sharedFile, requireAccessToken: true });
  assert.equal(okReport.ok, true);
  assert.equal(okReport.xai.hasAccessToken, true);
  const serialized = JSON.stringify(okReport);
  assert.doesNotMatch(serialized, /secret-access-token|secret-refresh-token/);
  assert.doesNotMatch(serialized, new RegExp(profileFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(serialized, new RegExp(sharedFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  fs.writeFileSync(sharedFile, JSON.stringify({ providers: { "xai-oauth": { label: "xai" } } }), "utf8");
  const missing = buildReport({ profileAuthFile: profileFile, sharedAuthFile: sharedFile, requireAccessToken: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "grok_xai_oauth_access_token_missing");
  assert.equal(missing.xai.providerPresent, true);
  assert.equal(missing.xai.hasAccessToken, false);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("grok auth metadata smoke harness passed");
