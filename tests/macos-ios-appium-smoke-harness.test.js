"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const startScript = fs.readFileSync(path.join(root, "scripts", "macos-ios-appium-start.sh"), "utf8");
const smokeScript = fs.readFileSync(path.join(root, "scripts", "macos-ios-appium-smoke.js"), "utf8");

assert.match(startScript, /--address "\$\{ADDRESS\}"/, "Appium start script must bind to the configured local address");
assert.match(startScript, /APPIUM_ADDRESS:-127\.0\.0\.1/, "Appium server must default to localhost");
assert.match(startScript, /--log-level warn/, "Appium server must avoid verbose request-body logging");
assert.doesNotMatch(startScript, /Access Key|ACCESS_KEY|X-Hermes-Web-Key|hermesWebKey|key-file/i, "start script must not handle secrets");

assert.match(smokeScript, /browserName:\s*"Safari"/, "iOS smoke must drive Safari through Appium");
assert.match(smokeScript, /"appium:automationName":\s*"XCUITest"/, "iOS smoke must use XCUITest automation");
assert.match(smokeScript, /"appium:wdaLocalPort":\s*8101/, "iOS smoke must set a stable WDA port");
assert.match(smokeScript, /--long-press x,y,ms/, "iOS smoke must expose a direct long-press action");
assert.doesNotMatch(smokeScript, /Access Key|ACCESS_KEY|X-Hermes-Web-Key|hermesWebKey|key-file/i, "smoke script must not accept or print Home AI secrets");

console.log("macos ios appium smoke harness ok");
