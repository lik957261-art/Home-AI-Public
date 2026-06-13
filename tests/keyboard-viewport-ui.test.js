"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { readAppShellSource } = require("./app-shell-test-helper");

const repoRoot = path.resolve(__dirname, "..");
const appJs = readAppShellSource(repoRoot);
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");
const clientVersion = indexHtml.match(/data-client-version="([^"]+)"/)?.[1] || "";
const escapedClientVersion = clientVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

assert.match(appJs, /keyboardViewportActive/);
assert.match(appJs, /function visualViewportKeyboardMetrics\(\)/);
assert.match(appJs, /function clearKeyboardViewportMetrics\(\)/);
assert.match(appJs, /root\.classList\.remove\("keyboard-viewport-active"\)/);
assert.match(appJs, /state\.keyboardContextMode = false/);
assert.match(appJs, /root\.style\.removeProperty\("--keyboard-context-top"\)/);
assert.match(appJs, /\$\("composer"\)\?\.classList\.remove\("keyboard-context-mode"\)/);
assert.match(appJs, /function normalizeMobileViewportAfterViewChange\(\)/);
assert.match(appJs, /function settleMobileBottomNavReservation\(reason = "layout", delays = \[0, 40, 120, 260, 520, 1000, 1800\]\)/);
assert.match(appJs, /window\.__hermesMobileBottomLayoutLastSettle = \{/);
assert.match(appJs, /settleMobileBottomNavReservation\("view_change", \[0, 80, 240, 520\]\)/);
assert.match(appJs, /function keyboardViewportShouldClearAfterOrientation\(\)/);
assert.match(appJs, /document\.activeElement === input/);
assert.match(appJs, /function updateKeyboardViewportMetrics\(\)/);
assert.match(appJs, /root\.classList\.toggle\("keyboard-viewport-active", active\)/);
assert.match(appJs, /--app-viewport-height/);
assert.match(appJs, /window\.scrollTo\(0, 0\)/);
assert.match(appJs, /function refreshKeyboardViewportDuringFocus\(\)/);
assert.match(appJs, /\[0, 80, 180, 360, 700, 1100\]\.forEach\(refreshKeyboardViewportSoon\)/);
assert.match(appJs, /refreshKeyboardViewportDuringFocus\(\)/);
assert.match(appJs, /refreshKeyboardViewportSoon\(260\)/);
assert.match(appJs, /bottomChatMode"\)\?\.addEventListener\("click", async \(\) => \{[\s\S]*?normalizeMobileViewportAfterViewChange\(\)/);
assert.match(appJs, /bottomTasksMode"\)\?\.addEventListener\("click", async \(\) => \{[\s\S]*?normalizeMobileViewportAfterViewChange\(\)/);

assert.match(stylesCss, /:root\.keyboard-viewport-active \.app/);
assert.match(stylesCss, /position: fixed/);
assert.match(stylesCss, /top: var\(--app-viewport-offset-top, 0\)/);
assert.match(stylesCss, /height: var\(--app-viewport-height, 100dvh\)/);
assert.match(stylesCss, /:root\.keyboard-viewport-active \.bottom-nav/);
assert.match(stylesCss, /display: none/);
assert.match(stylesCss, /:root\.keyboard-viewport-active \.app\.main-back-visible \.composer \{[\s\S]*?bottom: max\(0px, env\(safe-area-inset-bottom\)\);[\s\S]*?padding-bottom: 5px;/);
assert.match(stylesCss, /:root\.keyboard-viewport-active \.app\.main-back-visible\.plugin-context-nav-mode\.plugin-topic-detail-mode \.composer \{[\s\S]*?bottom: max\(0px, env\(safe-area-inset-bottom\)\);/);

assert.ok(clientVersion);
assert.match(serviceWorker, /HERMES_SW_VERSION = "20\d{6}-/);
assert.match(indexHtml, new RegExp(`styles\\.css\\?v=${escapedClientVersion}`));
assert.match(indexHtml, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));
assert.match(serviceWorker, new RegExp(`styles\\.css\\?v=${escapedClientVersion}`));
assert.match(serviceWorker, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));

console.log("keyboard viewport UI tests passed");
