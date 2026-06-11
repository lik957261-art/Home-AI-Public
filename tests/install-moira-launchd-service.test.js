"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_LABEL,
  parseArgs,
  plan,
  plistFor,
} = require("../scripts/install-moira-launchd-service");

const options = parseArgs([
  "--mac-root",
  "/tmp/Hermes Mobile",
  "--launch-daemons-dir",
  "/tmp/LaunchDaemons",
  "--host",
  "127.0.0.1",
  "--port",
  "4174",
  "--owner-workspace-id",
  "owner",
  "--allowed-workspaces",
  "owner,weixin_stephen",
  "--bootstrap",
  "--json",
]);
assert.equal(options.bootstrap, true);
assert.equal(options.execute, false);
assert.equal(options.macRoot, "/tmp/Hermes Mobile");
assert.equal(options.allowedWorkspaces, "owner,weixin_stephen");

const installPlan = plan(options);
assert.equal(installPlan.label, DEFAULT_LABEL);
assert.equal(installPlan.plistPath, path.join("/tmp/LaunchDaemons", `${DEFAULT_LABEL}.plist`));
assert.equal(installPlan.pluginRoot, "/tmp/Hermes Mobile/plugins/moira");
assert.equal(installPlan.baseUrl, "http://127.0.0.1:4174");
assert.equal(installPlan.ownerWorkspaceId, "owner");
assert.equal(installPlan.allowedWorkspaces, "owner,weixin_stephen");

const plist = plistFor(options);
assert.match(plist, /<string>com\.hermesmobile\.plugin\.moira<\/string>/);
assert.match(plist, /<string>hermes-host<\/string>/);
assert.match(plist, /<string>server\/moira-plugin-server\.mjs<\/string>/);
assert.match(plist, /\/tmp\/Hermes Mobile\/runtime\/node-current\/bin\/node/);
assert.match(plist, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/);
assert.match(plist, /<key>MOIRA_PLUGIN_HOST<\/key>\s*<string>127\.0\.0\.1<\/string>/);
assert.match(plist, /<key>MOIRA_PLUGIN_PORT<\/key>\s*<string>4174<\/string>/);
assert.match(plist, /<key>MOIRA_PLUGIN_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:4174<\/string>/);
assert.match(plist, /<key>MOIRA_HERMES_OWNER_WORKSPACE_ID<\/key>\s*<string>owner<\/string>/);
assert.match(plist, /<key>MOIRA_HERMES_ALLOWED_WORKSPACES<\/key>\s*<string>owner,weixin_stephen<\/string>/);
assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
assert.match(plist, /plugin-moira\.out\.log/);
assert.match(plist, /plugin-moira\.err\.log/);
assert.doesNotMatch(plist, /ACCESS_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /PASSWORD<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /TOKEN<\/key>\s*<string>[^<]+<\/string>/);

console.log("install moira launchd service tests passed");
