"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const startScript = fs.readFileSync(path.join(root, "scripts", "macos-ios-appium-start.sh"), "utf8");
const smokeScript = fs.readFileSync(path.join(root, "scripts", "macos-ios-appium-smoke.js"), "utf8");

assert.match(startScript, /<string>--address<\/string>[\s\S]*?<string>\$\(xml_escape "\$\{ADDRESS\}"\)<\/string>/, "Appium start script must bind to the configured local address");
assert.match(startScript, /APPIUM_ADDRESS:-127\.0\.0\.1/, "Appium server must default to localhost");
assert.match(startScript, /<string>--log-level<\/string>[\s\S]*?<string>warn<\/string>/, "Appium server must avoid verbose request-body logging");
assert.match(startScript, /LABEL="com\.hermesmobile\.appium-\$\{PORT\}"/, "Appium start script must use a stable LaunchAgent label");
assert.match(startScript, /Library\/LaunchAgents/, "Appium start script must install a user LaunchAgent");
assert.match(startScript, /launchctl bootstrap/, "Appium start script must bootstrap the LaunchAgent");
assert.match(startScript, /launchctl kickstart -k/, "Appium start script must kickstart the LaunchAgent");
assert.match(startScript, /appium_pid_alive/, "Appium start script must prove the started process remains alive");
assert.match(startScript, /appium_status_unstable/, "Appium start script must reject transient status-only startup");
assert.doesNotMatch(startScript, /Access Key|ACCESS_KEY|X-Hermes-Web-Key|hermesWebKey|key-file/i, "start script must not handle secrets");

assert.match(smokeScript, /browserName:\s*"Safari"/, "iOS smoke must drive Safari through Appium");
assert.match(smokeScript, /"appium:automationName":\s*"XCUITest"/, "iOS smoke must use XCUITest automation");
assert.match(smokeScript, /"appium:wdaLocalPort":\s*8101/, "iOS smoke must set a stable WDA port");
assert.match(smokeScript, /--long-press x,y,ms/, "iOS smoke must expose a direct long-press action");
assert.doesNotMatch(smokeScript, /Access Key|ACCESS_KEY|X-Hermes-Web-Key|hermesWebKey|key-file/i, "smoke script must not accept or print Home AI secrets");

console.log("macos ios appium smoke harness ok");
