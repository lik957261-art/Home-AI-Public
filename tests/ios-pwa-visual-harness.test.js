"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "ios-pwa-visual-harness.js");
const script = fs.readFileSync(scriptPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const runbook = fs.readFileSync(path.join(repoRoot, "docs", "RUNBOOKS", "macos-ios-simulator-appium.md"), "utf8");
const mobileContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-mobile-ui-visual-contract.md"), "utf8");
const platformContract = fs.readFileSync(path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const rolloutStatus = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md"), "utf8");

const {
  SCENARIOS,
  acquireDebugLaneLease,
  acquireHarnessLock,
  assertCommonHarness,
  assertDarkAdminSurfaces,
  assertDirectoryDarkStatus,
  assertEmbeddedPluginKeyboardComposer,
  assertEmbeddedPluginShell,
  assertGlobalPluginDockGestureStability,
  assertPluginTopicDockReturnStability,
  defaultLockPath,
  parseArgs,
  sampleMobileBottomStability,
} = require("../scripts/ios-pwa-visual-harness");

assert.equal(packageJson.scripts["ios:pwa:visual"], "node scripts/ios-pwa-visual-harness.js");

assert.ok(SCENARIOS["directory-dark-status"]);
assert.ok(SCENARIOS["dark-admin-surfaces"]);
assert.ok(SCENARIOS["embedded-plugin-shell"]);
assert.ok(SCENARIOS["embedded-plugin-keyboard-composer"]);
assert.ok(SCENARIOS["embedded-plugin-side-chat-keyboard"]);
assert.ok(SCENARIOS["plugin-topic-dock-return-stability"]);
assert.ok(SCENARIOS["global-plugin-dock-gesture-stability"]);
assert.deepEqual(parseArgs(["--scenario", "embedded-plugin-shell", "--plugin-id", "finance"]).pluginId, "finance");
assert.deepEqual(
  parseArgs(["--scenario", "embedded-plugin-keyboard-composer", "--plugin-id", "codex-mobile", "--plugin-thread-id", "thread-123"]).pluginThreadId,
  "thread-123",
);
assert.deepEqual(parseArgs(["--keyboard-target", "side-chat"]).keyboardTarget, "side-chat");
assert.deepEqual(parseArgs(["--keyboard-wait-ms", "1200"]).keyboardWaitMs, 1200);
assert.deepEqual(parseArgs(["--debug-url", "http://127.0.0.1:19074"]).lockFile, defaultLockPath({ debugUrl: "http://127.0.0.1:19074/" }));
assert.deepEqual(parseArgs(["--no-lock"]).noLock, true);
assert.deepEqual(parseArgs(["--expected-client-version", "v-test"]).expectedClientVersion, "v-test");
assert.deepEqual(parseArgs(["--min-screenshot-bytes", "0"]).minScreenshotBytes, 0);

assert.match(script, /\/api\/stream-info/);
assert.match(script, /\/api\/deep-state/);
assert.match(script, /\/api\/action/);
assert.match(script, /\/api\/screenshot\?force=1/);
assert.match(script, /\/api\/lease/);
assert.match(script, /\/api\/lease\/release/);
assert.match(script, /acquireDebugLaneLease/);
assert.match(script, /debug_lane_lease_unavailable/);
assert.match(script, /leaseToken/);
assert.equal(typeof acquireDebugLaneLease, "function");
assert.equal(typeof sampleMobileBottomStability, "function");
assert.match(script, /MOBILE_BOTTOM_STABILITY_SCRIPT/);
assert.match(script, /mobile_bottom_nav_bottom_stable/);
assert.match(script, /mobile_bottom_comfort_inset_not_self_cancelled/);
assert.match(script, /navBottomGapRaw/);
assert.match(script, /directory-dark-status/);
assert.match(script, /dark-admin-surfaces/);
assert.match(script, /embedded-plugin-shell/);
assert.match(script, /embedded-plugin-keyboard-composer/);
assert.match(script, /embedded-plugin-side-chat-keyboard/);
assert.match(script, /plugin-topic-dock-return-stability/);
assert.match(script, /global-plugin-dock-gesture-stability/);
assert.match(script, /PLUGIN_TOPIC_DOCK_RETURN_STABILITY_SCRIPT/);
assert.match(script, /GLOBAL_PLUGIN_DOCK_GESTURE_STABILITY_SCRIPT/);
assert.match(script, /dock_visible_only_in_global_plugin_dock_mode/);
assert.match(script, /dock_stays_hidden_until_global_plugin_dock_mode/);
assert.match(script, /dock_hidden_during_back_swipe_settle/);
assert.match(script, /page-back-settling/);
assert.match(script, /after-openTaskList-back-settling/);
assert.match(script, /after-back-surface-clear/);
assert.match(script, /short_vertical_mistouch_does_not_expand/);
assert.match(script, /horizontal_mistouch_does_not_expand/);
assert.match(script, /valid_up_swipe_expands_dock/);
assert.match(script, /chat_surface_global_dock_visible/);
assert.match(script, /plugin_surface_global_dock_visible/);
assert.match(script, /plugin_surface_uses_dock_only_anchor/);
assert.match(script, /bottom_nav_rect_stable_during_dock_gestures/);
assert.match(script, /--plugin-thread-id/);
assert.match(script, /host_keyboard_visible_after_input_tap/);
assert.match(script, /plugin_input_above_keyboard/);
assert.match(script, /plugin_received_keyboard_viewport_state/);
assert.match(script, /\[data-side-chat-draft\]/);
assert.match(script, /\[data-side-chat-form\]/);
assert.match(script, /plugin_side_chat_panel_open/);
assert.match(script, /plugin_side_chat_textarea_focused/);
assert.match(script, /EMBEDDED_PLUGIN_KEYBOARD_FOCUS_TARGET_SCRIPT/);
assert.match(script, /absoluteX: report\.focus\.tap\.absoluteX/);
assert.match(script, /absoluteY: report\.focus\.tap\.absoluteY/);
assert.match(script, /pluginId === "codex-mobile"[\s\S]*?appState\.viewMode = "codex"/);
assert.match(script, /loadSelectedView:codex/);
assert.match(script, /renderCodexPluginView/);
assert.match(script, /typeof win\.loadThread === "function"/);
assert.match(script, /openedBy: canLoadThread \? "loadThread" : "openExternalThreadSelection"/);
assert.match(script, /handleHermesPluginViewportMessage/);
assert.match(script, /reason: "keyboard_visual_harness"/);
assert.match(script, /simulated: keyboardSimulated/);
assert.match(script, /\.directory-status/);
assert.match(script, /\.directory-shell/);
assert.match(script, /DARK_ADMIN_SURFACES_SCRIPT/);
assert.match(script, /admin_surfaces_have_no_pale_solid_backgrounds/);
assert.match(script, /admin_surfaces_have_no_low_contrast_semantic_text/);
assert.match(script, /\.workspace-gateway-status/);
assert.match(script, /\.runtime-config-form/);
assert.match(script, /\.plugin-admin-card/);
assert.match(script, /--ui-surface-muted/);
assert.match(script, /paleDirectoryRegression/);
assert.match(script, /\.embedded-plugin-shell\[data-plugin-id=/);
assert.match(script, /\.embedded-plugin-frame/);
assert.match(script, /\.wardrobe-plugin-frame/);
assert.match(script, /boundedUrl/);
assert.match(script, /acquireHarnessLock/);
assert.match(script, /ios_visual_harness_lock_timeout/);
assert.match(script, /report\.lease/);
assert.match(script, /--expected-client-version/);
assert.match(script, /screenshot_meets_min_bytes/);
assert.doesNotMatch(script, /owner-web-key\.secret|HOMEAI_MAC_SUDO_PASSWORD_FILE|X-Hermes-Web-Key/i);

const directoryPass = assertDirectoryDarkStatus({
  theme: "dark",
  appClass: "projects-mode",
  mutedSurfaceRaw: "rgba(255, 255, 255, 0.10)",
  mutedSurfaceResolved: "rgba(255, 255, 255, 0.1)",
  shellBackground: "rgb(16, 18, 20)",
  statusBackground: "rgba(255, 255, 255, 0.1)",
  rects: {
    shell: { width: 390, height: 700 },
    status: { width: 330, height: 44 },
  },
});
assert.equal(directoryPass.ok, true);

const directoryFail = assertDirectoryDarkStatus({
  theme: "dark",
  mutedSurfaceResolved: "rgba(255, 255, 255, 0.1)",
  shellBackground: "rgb(16, 18, 20)",
  statusBackground: "rgba(255, 255, 252, 0.78)",
  rects: {
    shell: { width: 390, height: 700 },
    status: { width: 330, height: 44 },
  },
});
assert.equal(directoryFail.ok, false);
assert.ok(directoryFail.assertions.some((item) => item.name === "directory_status_not_pale_cream" && !item.pass));

const darkAdminPass = assertDarkAdminSurfaces({
  theme: "dark",
  tokens: {
    uiSheet: "rgba(24, 28, 31, 0.99)",
    uiMenuBg: "rgba(24, 28, 31, 0.99)",
    uiSurface: "rgba(27, 31, 34, 0.96)",
  },
  surfaces: Array.from({ length: 22 }, (_, index) => ({
    selector: `.sample-${index}`,
    exists: true,
    backgroundColor: index % 2 ? "rgba(255, 255, 255, 0.10)" : "rgba(28, 32, 35, 0.96)",
    color: "rgb(245, 247, 246)",
  })),
});
assert.equal(darkAdminPass.ok, true);

const darkAdminFail = assertDarkAdminSurfaces({
  theme: "dark",
  tokens: {
    uiSheet: "rgba(24, 28, 31, 0.99)",
    uiMenuBg: "rgba(24, 28, 31, 0.99)",
    uiSurface: "rgba(27, 31, 34, 0.96)",
  },
  surfaces: [
    ...Array.from({ length: 21 }, (_, index) => ({
      selector: `.sample-${index}`,
      exists: true,
      backgroundColor: "rgba(28, 32, 35, 0.96)",
      color: "rgb(245, 247, 246)",
    })),
    {
      selector: ".workspace-gateway-status",
      exists: true,
      backgroundColor: "rgba(255, 255, 252, 0.54)",
      color: "rgb(20, 95, 74)",
    },
  ],
});
assert.equal(darkAdminFail.ok, false);
assert.ok(darkAdminFail.assertions.some((item) => item.name === "admin_surfaces_have_no_pale_solid_backgrounds" && !item.pass));
assert.ok(darkAdminFail.assertions.some((item) => item.name === "admin_surfaces_have_no_low_contrast_semantic_text" && !item.pass));

const embeddedPass = assertEmbeddedPluginShell({
  pluginId: "finance",
  viewport: { visualWidth: 390, width: 390 },
  shell: { exists: true, rect: { left: 0, right: 390, width: 390, height: 720 } },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 650 } },
});
assert.equal(embeddedPass.ok, true);

const embeddedFail = assertEmbeddedPluginShell({
  pluginId: "finance",
  viewport: { visualWidth: 390, width: 390 },
  shell: { exists: true, rect: { left: 0, right: 390, width: 390, height: 720 } },
  frame: { exists: true, rect: { left: -12, right: 430, width: 442, height: 650 } },
});
assert.equal(embeddedFail.ok, false);
assert.ok(embeddedFail.assertions.some((item) => item.name === "plugin_frame_has_no_horizontal_overflow" && !item.pass));

const dockReturnPass = assertPluginTopicDockReturnStability({
  pluginId: "finance",
  samples: [
    { label: "detail-ready", taskListMode: false, globalPluginDockMode: false, dockHidden: true, dockDisplay: "none", dockVisible: false, dockPosition: "static" },
    { label: "before-updateTopicPluginDockChrome:false", taskListMode: false, globalPluginDockMode: false, dockHidden: true, dockDisplay: "none", dockVisible: false, dockPosition: "static" },
    { label: "after-updateTopicPluginDockChrome:true", taskListMode: true, globalPluginDockMode: true, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 690, bottom: 768, width: 390, height: 78 } },
    { label: "after-openTaskList-return", taskListMode: true, globalPluginDockMode: true, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 690, bottom: 768, width: 390, height: 78 } },
  ],
});
assert.equal(dockReturnPass.ok, true);

const dockReturnFail = assertPluginTopicDockReturnStability({
  pluginId: "finance",
  samples: [
    { label: "detail-ready", taskListMode: false, globalPluginDockMode: false, dockHidden: true, dockDisplay: "none", dockVisible: false, dockPosition: "static" },
    { label: "setTopicPluginDock-before-navigation", taskListMode: false, globalPluginDockMode: false, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "static", dockRect: { top: 760, bottom: 838, width: 390, height: 78 } },
    { label: "after-updateTopicPluginDockChrome:true", taskListMode: true, globalPluginDockMode: true, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 690, bottom: 768, width: 390, height: 78 } },
    { label: "after-openTaskList-return", taskListMode: true, globalPluginDockMode: true, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 690, bottom: 768, width: 390, height: 78 } },
  ],
});
assert.equal(dockReturnFail.ok, false);
assert.ok(dockReturnFail.assertions.some((item) => item.name === "dock_visible_only_in_global_plugin_dock_mode" && !item.pass));
assert.ok(dockReturnFail.assertions.some((item) => item.name === "dock_stays_hidden_until_global_plugin_dock_mode" && !item.pass));

const dockReturnBackSettleFail = assertPluginTopicDockReturnStability({
  pluginId: "finance",
  samples: [
    { label: "plugin-topic-detail-ready", taskListMode: false, mainBackAnimating: false, dockHidden: true, dockDisplay: "none", dockVisible: false, dockPosition: "static" },
    { label: "after-openTaskList-back-settling", taskListMode: true, globalPluginDockMode: true, mainBackAnimating: true, mainClass: "main page-back-settling", dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 660, bottom: 738, width: 390, height: 78 } },
    { label: "after-back-surface-clear", taskListMode: true, globalPluginDockMode: true, mainBackAnimating: false, dockHidden: false, dockDisplay: "block", dockVisible: true, dockPosition: "fixed", dockRect: { top: 690, bottom: 768, width: 390, height: 78 } },
  ],
});
assert.equal(dockReturnBackSettleFail.ok, false);
assert.ok(dockReturnBackSettleFail.assertions.some((item) => item.name === "dock_hidden_during_back_swipe_settle" && !item.pass));

const globalDockGesturePass = assertGlobalPluginDockGestureStability({
  samples: [
    { label: "chat-surface-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "collapsed-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "mistouch-short-up:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "mistouch-horizontal:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "valid-open:move-1", gestureOffset: "50px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-open:move-2", gestureOffset: "32px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-open:move-3", gestureOffset: "18px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-open:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: false, dockExpanded: true, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 138 } },
    { label: "valid-close:move-1", gestureOffset: "14px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-close:move-2", gestureOffset: "30px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-close:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "plugin-surface-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 0, width: 0, height: 0 }, bottomLayout: { navRect: null, navBottom: 18, dockBottom: 18, stackHeight: 50 } },
    { label: "final", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "extra", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
  ],
  final: { dockCollapsed: true, dockExpanded: false },
});
assert.equal(globalDockGesturePass.ok, true);

const globalDockGestureFail = assertGlobalPluginDockGestureStability({
  samples: [
    { label: "chat-surface-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "collapsed-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "mistouch-short-up:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: false, dockExpanded: true, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 138 } },
    { label: "mistouch-horizontal:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: false, dockExpanded: true, bottomNavRect: { bottom: 826, width: 390, height: 58 }, bottomLayout: { stackHeight: 138 } },
    { label: "valid-open:move-1", gestureOffset: "12px", bottomNavRect: { bottom: 826, width: 390, height: 58 } },
    { label: "valid-open:move-2", gestureOffset: "24px", bottomNavRect: { bottom: 828, width: 390, height: 58 } },
    { label: "valid-open:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: false, dockExpanded: true, bottomNavRect: { bottom: 828, width: 390, height: 58 }, bottomLayout: { stackHeight: 138 } },
    { label: "valid-close:up", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 828, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "plugin-surface-ready", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 0, width: 0, height: 0 }, bottomLayout: { navRect: null, navBottom: 18, dockBottom: 18, stackHeight: 50 } },
    { label: "final", globalPluginDockMode: true, dockVisible: true, dockCollapsed: true, dockExpanded: false, bottomNavRect: { bottom: 828, width: 390, height: 58 }, bottomLayout: { stackHeight: 90 } },
    { label: "extra-1", bottomNavRect: { bottom: 828, width: 390, height: 58 } },
    { label: "extra-2", bottomNavRect: { bottom: 828, width: 390, height: 58 } },
    { label: "extra-3", bottomNavRect: { bottom: 828, width: 390, height: 58 } },
    { label: "extra-4", bottomNavRect: { bottom: 828, width: 390, height: 58 } },
  ],
  final: { dockCollapsed: true, dockExpanded: false },
});
assert.equal(globalDockGestureFail.ok, false);
assert.ok(globalDockGestureFail.assertions.some((item) => item.name === "short_vertical_mistouch_does_not_expand" && !item.pass));
assert.ok(globalDockGestureFail.assertions.some((item) => item.name === "bottom_nav_rect_stable_during_dock_gestures" && !item.pass));

const keyboardPass = assertEmbeddedPluginKeyboardComposer({
  pluginId: "codex-mobile",
  viewport: { visualWidth: 390, width: 390 },
  keyboard: { visible: true, top: 520, bottomInset: 324 },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 844 } },
  plugin: {
    accessible: true,
    currentThreadId: "thread-123",
    keyboardOpen: true,
    hostViewportKeyboardVisible: true,
    hostViewportKeyboardBottomInset: 324,
    input: { left: 12, right: 320, top: 420, bottom: 462, width: 308, height: 42 },
    composer: { left: 0, right: 390, top: 408, bottom: 504, width: 390, height: 96 },
  },
  absolute: {
    input: { left: 12, right: 320, top: 420, bottom: 462, width: 308, height: 42 },
    composer: { left: 0, right: 390, top: 408, bottom: 504, width: 390, height: 96 },
  },
});
assert.equal(keyboardPass.ok, true);

const keyboardFail = assertEmbeddedPluginKeyboardComposer({
  pluginId: "codex-mobile",
  viewport: { visualWidth: 390, width: 390 },
  keyboard: { visible: true, top: 520, bottomInset: 324 },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 844 } },
  plugin: {
    accessible: true,
    currentThreadId: "thread-123",
    keyboardOpen: false,
    hostViewportKeyboardVisible: false,
    hostViewportKeyboardBottomInset: 0,
    input: { left: 12, right: 320, top: 640, bottom: 684, width: 308, height: 44 },
    composer: { left: 0, right: 390, top: 620, bottom: 724, width: 390, height: 104 },
  },
  absolute: {
    input: { left: 12, right: 320, top: 640, bottom: 684, width: 308, height: 44 },
    composer: { left: 0, right: 390, top: 620, bottom: 724, width: 390, height: 104 },
  },
});
assert.equal(keyboardFail.ok, false);
assert.ok(keyboardFail.assertions.some((item) => item.name === "plugin_received_keyboard_viewport_state" && !item.pass));
assert.ok(keyboardFail.assertions.some((item) => item.name === "plugin_input_above_keyboard" && !item.pass));

const keyboardZeroComposerFail = assertEmbeddedPluginKeyboardComposer({
  pluginId: "codex-mobile",
  viewport: { visualWidth: 390, width: 390 },
  keyboard: { visible: true, top: 520, bottomInset: 324 },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 844 } },
  plugin: {
    accessible: true,
    currentThreadId: "thread-123",
    keyboardOpen: true,
    input: { left: 12, right: 320, top: 420, bottom: 462, width: 308, height: 42 },
    composer: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
  },
  absolute: {
    input: { left: 12, right: 320, top: 420, bottom: 462, width: 308, height: 42 },
    composer: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
  },
});
assert.equal(keyboardZeroComposerFail.ok, false);
assert.ok(keyboardZeroComposerFail.assertions.some((item) => item.name === "plugin_composer_exists" && !item.pass));

const sideChatKeyboardPass = assertEmbeddedPluginKeyboardComposer({
  pluginId: "codex-mobile",
  keyboardTarget: "side-chat",
  viewport: { visualWidth: 390, width: 390 },
  keyboard: { visible: true, top: 520, bottomInset: 324 },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 844 } },
  plugin: {
    accessible: true,
    currentThreadId: "thread-123",
    keyboardOpen: true,
    hostViewportKeyboardVisible: true,
    hostViewportKeyboardBottomInset: 324,
    activeElementId: "",
    activeElementSideChatDraft: true,
    sideChatPanelOpen: true,
    sideChatPanel: { left: 0, right: 390, top: 44, bottom: 510, width: 390, height: 466 },
    sideChatTextarea: { left: 12, right: 378, top: 430, bottom: 486, width: 366, height: 56 },
    input: { left: 12, right: 378, top: 430, bottom: 486, width: 366, height: 56 },
    composer: { left: 12, right: 378, top: 424, bottom: 508, width: 366, height: 84 },
  },
  absolute: {
    input: { left: 12, right: 378, top: 430, bottom: 486, width: 366, height: 56 },
    composer: { left: 12, right: 378, top: 424, bottom: 508, width: 366, height: 84 },
  },
});
assert.equal(sideChatKeyboardPass.ok, true);

const sideChatKeyboardFail = assertEmbeddedPluginKeyboardComposer({
  pluginId: "codex-mobile",
  keyboardTarget: "side-chat",
  viewport: { visualWidth: 390, width: 390 },
  keyboard: { visible: true, top: 520, bottomInset: 324 },
  frame: { exists: true, rect: { left: 0, right: 390, width: 390, height: 844 } },
  plugin: {
    accessible: true,
    currentThreadId: "thread-123",
    keyboardOpen: true,
    activeElementSideChatDraft: false,
    sideChatPanelOpen: false,
    input: { left: 12, right: 378, top: 430, bottom: 486, width: 366, height: 56 },
    composer: { left: 12, right: 378, top: 424, bottom: 508, width: 366, height: 84 },
  },
  absolute: {
    input: { left: 12, right: 378, top: 430, bottom: 486, width: 366, height: 56 },
    composer: { left: 12, right: 378, top: 424, bottom: 508, width: 366, height: 84 },
  },
});
assert.equal(sideChatKeyboardFail.ok, false);
assert.ok(sideChatKeyboardFail.assertions.some((item) => item.name === "plugin_side_chat_panel_open" && !item.pass));
assert.ok(sideChatKeyboardFail.assertions.some((item) => item.name === "plugin_side_chat_textarea_focused" && !item.pass));

const commonPass = assertCommonHarness({
  metrics: { clientVersion: "v1" },
  screenshot: { bytes: 8192, path: "/tmp/screenshot.png" },
  mobileBottomStability: {
    samples: [
      { navLaidOut: true, navBottom: 12, comfortInset: 12, navBottomGapRaw: 12, navBottomUnderflowRaw: 0 },
      { navLaidOut: true, navBottom: 12, comfortInset: 12, navBottomGapRaw: 12, navBottomUnderflowRaw: 0 },
      { navLaidOut: true, navBottom: 12, comfortInset: 12, navBottomGapRaw: 12, navBottomUnderflowRaw: 0 },
    ],
  },
}, { expectedClientVersion: "v1", minScreenshotBytes: 4096 });
assert.deepEqual(commonPass.map((item) => item.pass), [true, true, true, true]);

const commonFail = assertCommonHarness({
  metrics: { clientVersion: "old" },
  screenshot: { bytes: 12, path: "/tmp/screenshot.png" },
  mobileBottomStability: {
    samples: [
      { navLaidOut: true, navBottom: 12, comfortInset: 12, navBottomGapRaw: 12, navBottomUnderflowRaw: 12 },
      { navLaidOut: true, navBottom: 0, comfortInset: 12, navBottomGapRaw: 0, navBottomUnderflowRaw: 0 },
      { navLaidOut: true, navBottom: 12, comfortInset: 12, navBottomGapRaw: 12, navBottomUnderflowRaw: 12 },
    ],
  },
}, { expectedClientVersion: "new", minScreenshotBytes: 4096 });
assert.deepEqual(commonFail.map((item) => item.pass), [false, false, false, false]);

for (const doc of [runbook, mobileContract, platformContract, testMatrix, rolloutStatus]) {
  assert.match(doc, /npm run ios:pwa:visual/);
  assert.match(doc, /ios-pwa-visual-harness\.js/);
}

assert.match(platformContract, /`ios_visual_harness_command`/);
assert.match(mobileContract, /directory-dark-status/);
assert.match(mobileContract, /embedded-plugin-shell/);
assert.match(mobileContract, /embedded-plugin-keyboard-composer/);
assert.match(mobileContract, /embedded-plugin-side-chat-keyboard/);
assert.match(mobileContract, /--no-lock/);
assert.match(mobileContract, /debug lane lease/i);
assert.match(runbook, /--expected-client-version/);
assert.match(runbook, /--no-lock/);
assert.match(runbook, /debug_lane_locked/);
assert.match(platformContract, /--expected-client-version/);
assert.match(platformContract, /debug lane lease/i);
assert.match(testMatrix, /node tests\\ios-pwa-visual-harness\.test\.js/);

async function testLaneLockSerializesVisualHarnessRuns() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ios-visual-lock-"));
  const lockFile = path.join(root, "lane.lock");
  const first = await acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 100, lockStaleMs: 300000 });
  assert.equal(first.acquired, true);
  assert.ok(fs.existsSync(lockFile));
  try {
    await assert.rejects(
      () => acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 30, lockStaleMs: 300000 }),
      /ios_visual_harness_lock_timeout/,
    );
  } finally {
    first.release();
  }
  assert.equal(fs.existsSync(lockFile), false);
  const second = await acquireHarnessLock({ lockFile, debugUrl: "http://127.0.0.1:19073/", lockTimeoutMs: 100, lockStaleMs: 300000 });
  second.release();
}

async function main() {
  await testLaneLockSerializesVisualHarnessRuns();
  console.log("iOS PWA visual harness tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
