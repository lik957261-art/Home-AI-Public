"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(repoRoot, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");

assert.match(appJs, /conversationPinnedToBottom/);
assert.match(appJs, /function handleViewportLayoutChange\(\)/);
assert.match(appJs, /function scheduleConversationBottomStick\(\)/);
assert.match(appJs, /\$\( "conversation"\)|\$\("conversation"\)\?\.addEventListener\("scroll", handleConversationScrollState/);
assert.match(appJs, /window\.visualViewport\?\.addEventListener\("resize", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.addEventListener\("orientationchange", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.screen\?\.orientation\?\.addEventListener\?\.\("change", handleViewportLayoutChange\)/);
assert.match(appJs, /if \(!state\.conversationPinnedToBottom && !isNearBottom\(160\)\) return;/);

assert.match(indexHtml, /data-client-version="20260509-1425"/);
assert.match(serviceWorker, /20260509-orientation-bottom/);
assert.match(serviceWorker, /app\.js\?v=20260509-1425/);

console.log("viewport scroll UI tests passed");
