"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");

assert.match(appJs, /keyboardViewportActive/);
assert.match(appJs, /function visualViewportKeyboardMetrics\(\)/);
assert.match(appJs, /function updateKeyboardViewportMetrics\(\)/);
assert.match(appJs, /root\.classList\.toggle\("keyboard-viewport-active", active\)/);
assert.match(appJs, /--app-viewport-height/);
assert.match(appJs, /function refreshKeyboardViewportDuringFocus\(\)/);
assert.match(appJs, /\[0, 80, 180, 360, 700, 1100\]\.forEach\(refreshKeyboardViewportSoon\)/);
assert.match(appJs, /refreshKeyboardViewportDuringFocus\(\)/);
assert.match(appJs, /refreshKeyboardViewportSoon\(260\)/);

assert.match(stylesCss, /:root\.keyboard-viewport-active \.app/);
assert.match(stylesCss, /height: var\(--app-viewport-height, 100dvh\)/);
assert.match(stylesCss, /:root\.keyboard-viewport-active \.bottom-nav/);
assert.match(stylesCss, /display: none/);

assert.match(indexHtml, /data-client-version="20260509-1445"/);
assert.match(serviceWorker, /20260509-keyboard-viewport/);
assert.match(serviceWorker, /styles\.css\?v=20260509-1445/);
assert.match(serviceWorker, /app\.js\?v=20260509-1445/);

console.log("keyboard viewport UI tests passed");
