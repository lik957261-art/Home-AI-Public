"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { readAppShellSource } = require("./app-shell-test-helper");

const repoRoot = path.resolve(__dirname, "..");
const appJs = readAppShellSource(repoRoot);
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");
const clientVersion = indexHtml.match(/data-client-version="([^"]+)"/)?.[1] || "";
const escapedClientVersion = clientVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

assert.match(appJs, /conversationPinnedToBottom/);
assert.match(appJs, /function handleViewportLayoutChange\(\)/);
assert.match(appJs, /function updateMobileBottomNavReservation\(\)/);
assert.match(appJs, /--mobile-bottom-nav-reserved-height-runtime/);
assert.match(appJs, /function scheduleConversationBottomStick\(\)/);
assert.match(appJs, /\$\( "conversation"\)|\$\("conversation"\)\?\.addEventListener\("scroll", handleConversationScrollState/);
assert.match(appJs, /window\.visualViewport\?\.addEventListener\("resize", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.addEventListener\("orientationchange", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.screen\?\.orientation\?\.addEventListener\?\.\("change", handleViewportLayoutChange\)/);
assert.match(appJs, /updateMobileBottomNavReservation\(\)/);
assert.match(appJs, /if \(!state\.conversationPinnedToBottom && !isNearBottom\(160\)\) return;/);

assert.ok(clientVersion);
assert.match(indexHtml, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));
assert.match(serviceWorker, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));

console.log("viewport scroll UI tests passed");
