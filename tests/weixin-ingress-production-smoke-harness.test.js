"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/weixin-ingress-production-smoke.js");
const moduleDoc = read("docs/MODULES/weixin-ingress.md");
const boundaryDoc = read("docs/WEIXIN_INGRESS.md");
const testMatrix = read("docs/TEST_MATRIX.md");
const architectureMap = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");
const deploymentDoc = read("docs/MODULES/deployment.md");

assert.match(script, /const INGRESS_AUTH_HEADER = "X-Hermes-Mobile-Ingress-Key"/);
assert.match(script, /const WRONG_AUTH_HEADER = "X-Hermes-Web-Key"/);
assert.match(script, /DEFAULT_WORKSPACES = \["weixin_wuping", "weixin_stephen", "weixin_test_1"\]/);
assert.match(script, /api\/public-config/);
assert.match(script, /title !== "Home AI"/);
assert.match(script, /weixin_ingress_smoke_origin_identity_mismatch/);
assert.match(script, /api\/ingress\/weixin\/events/);
assert.match(script, /\[INGRESS_AUTH_HEADER\]: key/);
assert.match(script, /\[WRONG_AUTH_HEADER\]: key/);
assert.match(script, /weixin_ingress_smoke_wrong_header_accepted/);
assert.match(script, /weixin_ingress_smoke_route_failed/);
assert.match(script, /weixin_ingress_smoke_heartbeat_contract_failed/);
assert.match(script, /text: "#"/);
assert.match(script, /reason !== "weixin_ingress_heartbeat"/);
assert.match(script, /row\.hasRun \|\| row\.hasThread \|\| row\.hasMessage/);
assert.match(script, /ingressAuthHeader/);
assert.match(script, /wrongAuthHeader/);
assert.match(script, /path and contents are not printed/);
assert.doesNotMatch(script, /console\.log\(.*key/);
assert.doesNotMatch(script, /console\.error\(.*ingressKeyFile/);
assert.doesNotMatch(script, /X-Hermes-Access-Key/);

assert.match(moduleDoc, /weixin-ingress-production-smoke\.js/);
assert.match(moduleDoc, /X-Hermes-Mobile-Ingress-Key/);
assert.match(moduleDoc, /X-Hermes-Web-Key/);
assert.match(moduleDoc, /heartbeat production smoke/);
assert.match(moduleDoc, /must not create a thread, message, Gateway run, or delivery/);
assert.match(moduleDoc, /not a full normal-message end-to-end proof/);

assert.match(boundaryDoc, /weixin-ingress-production-smoke\.js/);
assert.match(boundaryDoc, /skipped=true/);
assert.match(boundaryDoc, /unmatched_workspace_route/);

assert.match(testMatrix, /weixin-ingress-production-smoke-harness\.test\.js/);
assert.match(testMatrix, /weixin-ingress-production-smoke\.js/);
assert.match(testMatrix, /X-Hermes-Mobile-Ingress-Key/);
assert.match(testMatrix, /X-Hermes-Web-Key/);
assert.match(testMatrix, /heartbeat route smoke/);

assert.match(architectureMap, /scripts\/weixin-ingress-production-smoke\.js/);
assert.match(architectureMap, /tests\/weixin-ingress-production-smoke-harness\.test\.js/);

assert.match(deploymentDoc, /HERMES_WEB_WORKSPACE_USERS_PATH=\/Users\/hermes-host\/HermesMobile\/data\/config\/access-control\/weixin-users\.json/);
assert.match(deploymentDoc, /HERMES_MOBILE_WORKSPACE_USERS_PATH=\/Users\/hermes-host\/HermesMobile\/data\/config\/access-control\/weixin-users\.json/);
assert.match(deploymentDoc, /HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH=\/Users\/hermes-host\/HermesMobile\/data\/config\/access-control\/weixin-routing-map\.json/);
assert.match(deploymentDoc, /HERMES_MOBILE_WORKSPACE_ROUTE_MAP_PATH=\/Users\/hermes-host\/HermesMobile\/data\/config\/access-control\/weixin-routing-map\.json/);
assert.match(deploymentDoc, /skipped=true.*reason=unmatched_workspace_route/s);

console.log("Weixin ingress production smoke harness tests passed");
