"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_LABEL,
  parseArgs,
  parseLsofPids,
  plan,
  plistFor,
} = require("../scripts/install-movie-launchd-service");

const options = parseArgs([
  "--mac-root",
  "/tmp/Hermes Mobile",
  "--launch-daemons-dir",
  "/tmp/LaunchDaemons",
  "--host",
  "127.0.0.1",
  "--port",
  "4195",
  "--bootstrap",
  "--json",
]);
assert.equal(options.bootstrap, true);
assert.equal(options.execute, false);
assert.equal(options.macRoot, "/tmp/Hermes Mobile");

const installPlan = plan(options);
assert.equal(installPlan.label, DEFAULT_LABEL);
assert.equal(installPlan.plistPath, path.join("/tmp/LaunchDaemons", `${DEFAULT_LABEL}.plist`));
assert.equal(installPlan.pluginRoot, "/tmp/Hermes Mobile/plugins/movie");
assert.equal(installPlan.dataDir, "/tmp/Hermes Mobile/plugins/movie/data");
assert.equal(installPlan.baseUrl, "http://127.0.0.1:4195");
assert.equal(installPlan.serviceUser, "hermes-host");
assert.equal(installPlan.serviceGroup, "staff");

const plist = plistFor(options);
assert.match(plist, /<string>com\.hermesmobile\.plugin\.movie<\/string>/);
assert.match(plist, /<string>hermes-host<\/string>/);
assert.match(plist, /<string>src\/server\.js<\/string>/);
assert.match(plist, /\/tmp\/Hermes Mobile\/runtime\/node-current\/bin\/node/);
assert.match(plist, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/);
assert.match(plist, /<key>HOST<\/key>\s*<string>127\.0\.0\.1<\/string>/);
assert.match(plist, /<key>PORT<\/key>\s*<string>4195<\/string>/);
assert.match(plist, /<key>MOVIE_HOST<\/key>\s*<string>127\.0\.0\.1<\/string>/);
assert.match(plist, /<key>MOVIE_PORT<\/key>\s*<string>4195<\/string>/);
assert.match(plist, /<key>MOVIE_DATA_DIR<\/key>/);
assert.match(plist, /plugins\/movie\/data/);
assert.match(plist, /<key>MOVIE_PUBLIC_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:4195<\/string>/);
assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
assert.match(plist, /plugin-movie\.out\.log/);
assert.match(plist, /plugin-movie\.err\.log/);
assert.doesNotMatch(plist, /ACCESS_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /PASSWORD<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /TOKEN<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /PROJECTOR/i);
assert.doesNotMatch(plist, /NAS/i);

assert.deepEqual(parseLsofPids("p123\ncnode\np456\np123\n"), ["123", "456"]);

console.log("install movie launchd service tests passed");
