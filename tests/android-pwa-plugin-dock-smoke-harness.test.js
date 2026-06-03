"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(repoRoot, "scripts", "android-pwa-plugin-dock-smoke.js"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

assert.match(script, /localabstract:chrome_devtools_remote/);
assert.match(script, /new WebSocket\(page\.webSocketDebuggerUrl\)/);
assert.match(script, /localStorage\.setItem\("hermesWebKey", key\)/);
assert.match(script, /document\.cookie = "hermes_web_key="/);
assert.match(script, /document\.getElementById\("bottomTasksMode"\)/);
assert.match(script, /querySelector\("\.plugin-app-strip"\)/);
assert.match(script, /flexWrap !== "nowrap"/);
assert.match(script, /overflowX !== "auto"/);
assert.match(script, /rowCount !== 1/);
assert.doesNotMatch(script, /input",\s*"text"/);
assert.doesNotMatch(script, /adb input text/);
assert.match(testMatrix, /scripts\\android-pwa-plugin-dock-smoke\.js/);
assert.match(testMatrix, /must not use `adb input text` for Access Key\s+entry/);

console.log("android PWA plugin Dock smoke harness tests passed");
