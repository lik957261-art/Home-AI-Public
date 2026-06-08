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
assert.match(appJs, /function handleViewportLayoutChange\(/);
assert.match(appJs, /function updateMobileBottomNavReservation\(\)/);
assert.match(appJs, /function recoverConversationViewportAfterOrientation\(conversation = \$\("conversation"\)\)/);
assert.match(appJs, /function clearConversationViewportLayerReset\(conversation = \$\("conversation"\)\)/);
assert.match(appJs, /function scheduleConversationOrientationRecovery\(conversation = \$\("conversation"\)\)/);
assert.match(appJs, /--mobile-bottom-nav-reserved-height-runtime/);
assert.match(appJs, /function scheduleConversationBottomStick\(\)/);
assert.match(appJs, /\$\("conversation"\)\?\.addEventListener\("scroll", \(event\) => \{[\s\S]*?handleConversationScrollState\(event\);[\s\S]*?scheduleAppRouteSnapshot\("scroll", 500\)/);
assert.match(appJs, /window\.visualViewport\?\.addEventListener\("resize", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.addEventListener\("scroll", handleViewportLayoutChange, \{ passive: true \}\)/);
assert.match(appJs, /window\.addEventListener\("orientationchange", handleViewportLayoutChange\)/);
assert.match(appJs, /window\.screen\?\.orientation\?\.addEventListener\?\.\("change", handleViewportLayoutChange\)/);
assert.match(appJs, /updateMobileBottomNavReservation\(\)/);
assert.match(appJs, /settleEmbeddedPluginViewportBroadcast\(orientationEvent \? "host_orientation_viewport" : "host_visual_viewport"\)/);
assert.match(appJs, /function resetEmbeddedPluginHostScroll\(reason = "layout"\)/);
assert.match(appJs, /resetEmbeddedPluginHostScroll\(reason\);[\s\S]*sendEmbeddedPluginViewportMetrics\(def, reason\)/);
assert.match(appJs, /if \(typeof keyboardViewportShouldClearAfterOrientation === "function" && keyboardViewportShouldClearAfterOrientation\(\)\) \{[\s\S]*?clearKeyboardViewportMetrics\(\);/);
assert.match(appJs, /\[1180, 1800\]\.forEach\(\(delay\) => \{[\s\S]*?recoverConversationViewportAfterOrientation\(\$\("conversation"\)\)/);
assert.match(appJs, /if \(orientationEvent\) scheduleConversationOrientationRecovery\(\$\("conversation"\)\)/);
assert.match(appJs, /scheduleMessageScrollButtonVisibilitySettle\(conversation, \[120, 360\]\)/);
assert.match(appJs, /if \(!shouldStickConversationOnViewportChange\(\)\) return;/);
assert.match(appJs, /if \(!shouldFollowConversationBottomDuringViewport\(\)\) return;/);

assert.ok(clientVersion);
assert.match(indexHtml, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));
assert.match(serviceWorker, new RegExp(`app\\.js\\?v=${escapedClientVersion}`));

console.log("viewport scroll UI tests passed");
