"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(repoRoot, "public", "app-workspace-admin-ui.js"), "utf8");
const css = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(ui, /function readRuntimeMoaConfig\(\)/);
assert.match(ui, /id="runtimeMoaEnabled"/);
assert.match(ui, /id="runtimeMoaDefaultPreset"/);
assert.match(ui, /id="runtimeMoaActivePreset"/);
assert.match(ui, /id="runtimeMoaPresetsJson"/);
assert.match(ui, /JSON\.parse\(raw \|\| "\[\]"\)/);
assert.match(ui, /JSON\.stringify\(\{ hermesApiBase, hermesApiKeyPath, gatewayWorkerSettings, moaConfig, webPushSubject, webPushVapidPath \}\)/);
assert.match(css, /\.runtime-config-form textarea/);
assert.match(css, /\.runtime-config-check-row/);

console.log("runtime config admin UI tests passed");
