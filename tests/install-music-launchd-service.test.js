"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_LABEL,
  MUSIC_SERVICE_SCRIPT,
  allowedExistingListener,
  parseLsofPids,
  parseArgs,
  plan,
  plistFor,
} = require("../scripts/install-music-launchd-service");

const options = parseArgs([
  "--mac-root",
  "/tmp/Hermes Mobile",
  "--launch-daemons-dir",
  "/tmp/LaunchDaemons",
  "--host",
  "127.0.0.1",
  "--port",
  "4891",
  "--roon-core-host",
  "192.168.100.190",
  "--roon-core-port",
  "9330",
  "--audio-path-remaps",
  "[{\"from\":\"/private/source\",\"to\":\"/private/target\"}]",
  "--bootstrap",
  "--json",
]);
assert.equal(options.bootstrap, true);
assert.equal(options.execute, false);
assert.equal(options.macRoot, "/tmp/Hermes Mobile");
assert.equal(options.roonEnabled, "1");

const installPlan = plan(options);
assert.equal(installPlan.label, DEFAULT_LABEL);
assert.equal(installPlan.plistPath, path.join("/tmp/LaunchDaemons", `${DEFAULT_LABEL}.plist`));
assert.equal(installPlan.pluginRoot, "/tmp/Hermes Mobile/plugins/music");
assert.equal(installPlan.runtimeDir, "/tmp/Hermes Mobile/plugins/music/runtime");
assert.equal(installPlan.baseUrl, "http://127.0.0.1:4891");
assert.equal(installPlan.roonCoreHost, "192.168.100.190");
assert.equal(installPlan.roonCorePort, "9330");
assert.equal(installPlan.audioPathRemapsConfigured, true);

const plist = plistFor(options);
assert.match(plist, /<string>com\.hermesmobile\.plugin\.music<\/string>/);
assert.match(plist, /<string>hermes-host<\/string>/);
assert.equal(MUSIC_SERVICE_SCRIPT, "src/roon-first-server.js");
assert.match(plist, /<string>src\/roon-first-server\.js<\/string>/);
assert.doesNotMatch(plist, /<string>src\/server\.js<\/string>/);
assert.match(plist, /\/tmp\/Hermes Mobile\/runtime\/node-current\/bin\/node/);
assert.match(plist, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/);
assert.match(plist, /<key>MUSIC_PLUGIN_HOST<\/key>\s*<string>127\.0\.0\.1<\/string>/);
assert.match(plist, /<key>MUSIC_PLUGIN_PORT<\/key>\s*<string>4891<\/string>/);
assert.match(plist, /<key>MUSIC_PLUGIN_PUBLIC_BASE_URL<\/key>\s*<string>http:\/\/127\.0\.0\.1:4891<\/string>/);
assert.match(plist, /<key>MUSIC_ROON_ENABLED<\/key>\s*<string>1<\/string>/);
assert.match(plist, /<key>MUSIC_ROON_CORE_HOST<\/key>\s*<string>192\.168\.100\.190<\/string>/);
assert.match(plist, /<key>MUSIC_ROON_CORE_PORT<\/key>\s*<string>9330<\/string>/);
assert.match(plist, /<key>MUSIC_ROON_STATE_PATH<\/key>/);
assert.match(plist, /runtime\/roon-state\.json/);
assert.match(plist, /<key>MUSIC_LISTENING_DB_PATH<\/key>/);
assert.match(plist, /runtime\/listening-ledger\.sqlite3/);
assert.match(plist, /<key>MUSIC_AUDIO_STAGING_DIR<\/key>/);
assert.match(plist, /data\/music\/audio-staging/);
assert.match(plist, /<key>MUSIC_SMB_DIRECT_CONFIG<\/key>/);
assert.match(plist, /data\/music\/secrets\/smb-direct-config\.json/);
assert.match(plist, /<key>MUSIC_AUDIO_PATH_REMAPS<\/key>/);
assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
assert.match(plist, /plugin-music\.out\.log/);
assert.match(plist, /plugin-music\.err\.log/);
assert.doesNotMatch(plist, /ACCESS_KEY<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /PASSWORD<\/key>\s*<string>[^<]+<\/string>/);
assert.doesNotMatch(plist, /TOKEN<\/key>\s*<string>[^<]+<\/string>/);

assert.deepEqual(parseLsofPids("p123\ncnode\np456\n"), ["123", "456"]);
assert.equal(allowedExistingListener({
  user: "hermes-host",
  command: "/Users/example/path --no-warnings src/server.js",
}, installPlan), true);
assert.equal(allowedExistingListener({
  user: "xuxin",
  command: "node --no-warnings src/server.js",
}, installPlan), false);

console.log("install music launchd service tests passed");
