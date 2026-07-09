"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_LABEL,
  DEFAULT_HOME_AI_ORIGIN,
  parseArgs,
  parseLsofPids,
  notificationPlan,
  plan,
  plistFor,
  normalizeOrigin,
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
  "--install-notification-config",
  "--home-ai-origin",
  "http://127.0.0.1:8797/path-is-ignored",
  "--bootstrap",
  "--json",
]);
assert.equal(options.bootstrap, true);
assert.equal(options.execute, false);
assert.equal(options.macRoot, "/tmp/Hermes Mobile");
assert.equal(options.installNotificationConfig, true);
assert.equal(options.homeAiOrigin, "http://127.0.0.1:8797/path-is-ignored");

const installPlan = plan(options);
assert.equal(installPlan.label, DEFAULT_LABEL);
assert.equal(installPlan.plistPath, path.join("/tmp/LaunchDaemons", `${DEFAULT_LABEL}.plist`));
assert.equal(installPlan.pluginRoot, "/tmp/Hermes Mobile/plugins/movie");
assert.equal(installPlan.dataDir, "/tmp/Hermes Mobile/plugins/movie/data");
assert.equal(installPlan.baseUrl, "http://127.0.0.1:4195");
assert.equal(installPlan.serviceUser, "hermes-host");
assert.equal(installPlan.serviceGroup, "staff");
assert.equal(installPlan.notification.install, true);
assert.equal(installPlan.notification.homeAiOrigin, "http://127.0.0.1:8797");
assert.equal(installPlan.notification.homeAiKeyPath, "/tmp/Hermes Mobile/data/plugin-secrets/movie-notification-key.txt");
assert.equal(installPlan.notification.movieOriginPath, "/tmp/Hermes Mobile/plugins/movie/data/home-ai-notification-origin");
assert.equal(installPlan.notification.movieKeyPath, "/tmp/Hermes Mobile/plugins/movie/data/home-ai-notification-key");

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
assert.doesNotMatch(plist, /MOVIE_HERMES_NOTIFICATION_KEY/);
assert.doesNotMatch(plist, /home-ai-notification-key/);
assert.doesNotMatch(plist, /PROJECTOR/i);
assert.doesNotMatch(plist, /NAS/i);

assert.deepEqual(parseLsofPids("p123\ncnode\np456\np123\n"), ["123", "456"]);
assert.equal(DEFAULT_HOME_AI_ORIGIN, "http://127.0.0.1:8797");
assert.equal(normalizeOrigin("https://home-ai.example.test/path?q=1"), "https://home-ai.example.test");
assert.equal(normalizeOrigin("file:///tmp/key"), "");
assert.equal(notificationPlan({
  macRoot: "/tmp/Hermes Mobile",
  installNotificationConfig: false,
}).install, false);

console.log("install movie launchd service tests passed");
