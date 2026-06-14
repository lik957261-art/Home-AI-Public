"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_LABEL,
  parseArgs,
  plan,
  plistFor,
} = require("../scripts/install-growth-launchd-service");

const options = parseArgs([
  "--mac-root",
  "/tmp/Hermes Mobile",
  "--launch-daemons-dir",
  "/tmp/LaunchDaemons",
  "--gateway-authoring-endpoint",
  "http://127.0.0.1:18751/v1/responses",
  "--gateway-authoring-access-token-path",
  "/tmp/Hermes Mobile/data/secrets/gateway-workers/hm-owner-openai-1.key",
  "--gateway-authoring-protocol",
  "responses",
  "--gateway-evaluation-endpoint",
  "http://127.0.0.1:18751/v1/responses",
  "--gateway-evaluation-access-token-path",
  "/tmp/Hermes Mobile/data/secrets/gateway-workers/hm-owner-openai-1.key",
  "--gateway-evaluation-protocol",
  "responses",
  "--bootstrap",
  "--json",
]);
assert.equal(options.bootstrap, true);
assert.equal(options.execute, false);
assert.equal(options.macRoot, "/tmp/Hermes Mobile");

const installPlan = plan(options);
assert.equal(installPlan.label, DEFAULT_LABEL);
assert.equal(installPlan.plistPath, path.join("/tmp/LaunchDaemons", `${DEFAULT_LABEL}.plist`));
assert.equal(installPlan.pluginRoot, "/tmp/Hermes Mobile/plugins/growth");
assert.equal(installPlan.registrationKeyPath, "/tmp/Hermes Mobile/data/plugin-secrets/growth-registration-key.txt");
assert.equal(installPlan.ownerAccessKeyPath, "/tmp/Hermes Mobile/data/secrets/owner-web-key.secret");
assert.equal(installPlan.gatewayAuthoringEndpoint, "http://127.0.0.1:18751/v1/responses");
assert.equal(installPlan.gatewayAuthoringAccessTokenPath, "/tmp/Hermes Mobile/data/secrets/gateway-workers/hm-owner-openai-1.key");
assert.equal(installPlan.gatewayAuthoringProtocol, "responses");
assert.equal(installPlan.gatewayEvaluationEndpoint, "http://127.0.0.1:18751/v1/responses");
assert.equal(installPlan.gatewayEvaluationAccessTokenPath, "/tmp/Hermes Mobile/data/secrets/gateway-workers/hm-owner-openai-1.key");
assert.equal(installPlan.gatewayEvaluationProtocol, "responses");

const plist = plistFor(options);
assert.match(plist, /<string>com\.hermesmobile\.plugin\.growth<\/string>/);
assert.match(plist, /<string>hermes-host<\/string>/);
assert.match(plist, /<string>scripts\/growth-server\.js<\/string>/);
assert.match(plist, /<key>GROWTH_PORT<\/key>\s*<string>4881<\/string>/);
assert.match(plist, /<key>GROWTH_REGISTRATION_KEY_PATH<\/key>/);
assert.match(plist, /growth-registration-key\.txt/);
assert.match(plist, /<key>GROWTH_DATA_OWNER<\/key>\s*<string>plugin<\/string>/);
assert.match(plist, /<key>GROWTH_LEARNING_DB_PATH<\/key>/);
assert.match(plist, /growth-learning\.sqlite3/);
assert.match(plist, /<key>GROWTH_HOME_AI_ACCESS_KEY_PATH<\/key>/);
assert.match(plist, /owner-web-key\.secret/);
assert.match(plist, /<key>GROWTH_GATEWAY_AUTHORING_ENDPOINT<\/key>\s*<string>http:\/\/127\.0\.0\.1:18751\/v1\/responses<\/string>/);
assert.match(plist, /<key>GROWTH_GATEWAY_AUTHORING_ACCESS_TOKEN_PATH<\/key>/);
assert.match(plist, /gateway-workers\/hm-owner-openai-1\.key/);
assert.match(plist, /<key>GROWTH_GATEWAY_AUTHORING_PROTOCOL<\/key>\s*<string>responses<\/string>/);
assert.match(plist, /<key>GROWTH_GATEWAY_EVALUATION_ENDPOINT<\/key>\s*<string>http:\/\/127\.0\.0\.1:18751\/v1\/responses<\/string>/);
assert.match(plist, /<key>GROWTH_GATEWAY_EVALUATION_ACCESS_TOKEN_PATH<\/key>/);
assert.match(plist, /<key>GROWTH_GATEWAY_EVALUATION_PROTOCOL<\/key>\s*<string>responses<\/string>/);
assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
assert.doesNotMatch(plist, /GROWTH_REGISTRATION_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /GROWTH_HOME_AI_ACCESS_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /GROWTH_GATEWAY_AUTHORING_ACCESS_TOKEN<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /GROWTH_GATEWAY_EVALUATION_ACCESS_TOKEN<\/key>\s*<string>[^<]+<\/string>/);

console.log("install growth launchd service tests passed");
