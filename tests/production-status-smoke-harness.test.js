"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listFiles(rootDir) {
  const out = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(fullPath));
    else out.push(fullPath);
  }
  return out;
}

const script = read("scripts/production-status-smoke.js");
const apiRouteReference = read("docs/API_ROUTE_REFERENCE.md");
const architectureMap = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const authDoc = read("docs/MODULES/workspace-auth-permissions.md");
const authHeaderRunbook = read("docs/RUNBOOKS/production-api-auth-header.md");
const testMatrix = read("docs/TEST_MATRIX.md");

assert.match(script, /const AUTH_HEADER = "X-Hermes-Web-Key"/);
assert.match(script, /const WRONG_AUTH_HEADER = "X-Hermes-Access-Key"/);
assert.match(script, /api\/public-config/);
assert.match(script, /production_origin_identity_mismatch/);
assert.match(script, /--skip-origin-check/);
assert.match(script, /title !== "Home AI"/);
assert.match(script, /ownerKeyConfigured/);
assert.match(script, /\[AUTH_HEADER\]: key/);
assert.match(script, /\[WRONG_AUTH_HEADER\]: key/);
assert.match(script, /payload\.authHeader = AUTH_HEADER/);
assert.match(script, /payload\.wrongAuthHeader = WRONG_AUTH_HEADER/);
assert.match(script, /production_status_smoke_wrong_header_accepted/);
assert.match(script, /--access-key-file <file>/);
assert.match(script, /path and contents are not printed/);
assert.match(script, /Auth contract: send the key with X-Hermes-Web-Key only/);
assert.match(script, /Negative check: X-Hermes-Access-Key must be rejected/);
assert.match(script, /api\/status\?detail=1/);
assert.doesNotMatch(script, /console\.log\(.*key/);
assert.doesNotMatch(script, /console\.error\(.*accessKeyFile/);

const scriptsWithUnsupportedAccessHeader = listFiles(path.join(repoRoot, "scripts"))
  .filter((filePath) => filePath.endsWith(".js"))
  .filter((filePath) => fs.readFileSync(filePath, "utf8").includes("X-Hermes-Access-Key"))
  .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/"))
  .sort();
assert.deepEqual(scriptsWithUnsupportedAccessHeader, ["scripts/production-status-smoke.js"]);

assert.match(apiRouteReference, /Browser\/API Auth Transport Contract/);
assert.match(apiRouteReference, /X-Hermes-Web-Key/);
assert.match(apiRouteReference, /hermes_web_key/);
assert.match(apiRouteReference, /X-Hermes-Access-Key/);
assert.match(apiRouteReference, /must not be used as the positive auth path/);
assert.match(apiRouteReference, /Access Key" is the\s+credential class; `X-Hermes-Web-Key` is the transport header/);
assert.match(apiRouteReference, /Do not add `X-Hermes-Access-Key` as an accepted alias/);
assert.match(apiRouteReference, /production-status-smoke\.js/);
assert.match(apiRouteReference, /auth-boundary\s+regression/);

assert.match(architectureMap, /Workspace, auth, access policy, and public projection/);
assert.match(architectureMap, /docs\/RUNBOOKS\/production-api-auth-header\.md/);
assert.match(architectureMap, /scripts\/production-status-smoke\.js/);
assert.match(architectureMap, /tests\/production-status-smoke-harness\.test\.js/);

assert.match(deploymentDoc, /scripts\\production-status-smoke\.js/);
assert.match(deploymentDoc, /production_origin_identity_mismatch/);
assert.match(deploymentDoc, /X-Hermes-Web-Key/);
assert.match(deploymentDoc, /X-Hermes-Access-Key/);
assert.match(deploymentDoc, /wrong-header/);
assert.match(deploymentDoc, /Do not replace it with a one-off inline Node\/Python status script/);
assert.match(deploymentDoc, /HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=90000/);

assert.match(authDoc, /X-Hermes-Web-Key/);
assert.match(authDoc, /hermes_web_key/);
assert.match(authDoc, /X-Hermes-Access-Key/);
assert.match(authDoc, /must not be used/);
assert.match(authDoc, /The repeated failure mode is transport-level/);
assert.match(authDoc, /Do not infer the HTTP header from the credential label/);

assert.match(authHeaderRunbook, /Production API Auth Header/);
assert.match(authHeaderRunbook, /X-Hermes-Web-Key/);
assert.match(authHeaderRunbook, /X-Hermes-Access-Key/);
assert.match(authHeaderRunbook, /negative control/);
assert.match(authHeaderRunbook, /production_status_smoke_wrong_header_accepted/);
assert.match(authHeaderRunbook, /not a key-content failure/);
assert.match(authHeaderRunbook, /Do not write one-off production status probes/);
assert.match(authHeaderRunbook, /Do not add `X-Hermes-Access-Key` as a compatibility alias/);
assert.match(authHeaderRunbook, /Regression Prevention Contract/);
assert.match(authHeaderRunbook, /Access Key" as the credential class only/);
assert.match(authHeaderRunbook, /must not be mechanically\s+translated into an HTTP header name/);
assert.match(authHeaderRunbook, /has not proven that the key file is\s+wrong/);
assert.match(authHeaderRunbook, /scans `scripts\/` for\s+`X-Hermes-Access-Key`/);

assert.match(testMatrix, /production-status-smoke\.js/);
assert.match(testMatrix, /X-Hermes-Web-Key/);
assert.match(testMatrix, /authHeader/);
assert.match(testMatrix, /wrongAuthHeader/);
assert.match(testMatrix, /production_origin_identity_mismatch/);
assert.match(testMatrix, /Do not infer the auth header from the product credential label/);
assert.match(testMatrix, /Any new production key-file\s+smoke must keep the positive `X-Hermes-Web-Key` probe/);
assert.match(testMatrix, /allows `X-Hermes-Access-Key` only in the checked negative-control status smoke/);
assert.match(testMatrix, /HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT/);
assert.match(testMatrix, /HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=90000/);

console.log("production status smoke harness passed");
