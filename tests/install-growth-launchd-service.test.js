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
assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
assert.doesNotMatch(plist, /GROWTH_REGISTRATION_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /GROWTH_HOME_AI_ACCESS_KEY<\/key>\s*<string>[^<]+<\/string>/);

console.log("install growth launchd service tests passed");
