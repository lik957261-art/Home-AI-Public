"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, relativePath)).href);
}

const pendingTests = [];

function test(name, fn) {
  pendingTests.push((async () => {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
  })());
}

test("shell start model preserves setup login and bootstrap decisions", async () => {
  const model = await importModule("src/vite-islands/navigation-shell/shell-start-model.mjs");
  assert.equal(model.classicStartInvocationPlan({ startAvailable: true }).shouldStart, true);
  assert.equal(model.classicStartInvocationPlan({ startAvailable: false }).action, "missing_start");
  assert.equal(model.publicConfigBootstrapPlan({ setupRequired: true }).action, "show_setup");
  assert.equal(model.publicConfigBootstrapPlan({ authRequired: true, hasKey: false, hasCookieSession: false }).action, "show_login");
  assert.equal(model.publicConfigBootstrapPlan({ authRequired: true, hasCookieSession: true }).action, "bootstrap_workspace");
  assert.equal(model.startupRecoveryPlan({ errorMessage: "Unauthorized" }).showLogin, true);
});

test("mobile layout model computes keyboard and plugin viewport plans", async () => {
  const model = await importModule("src/vite-islands/navigation-shell/mobile-layout-model.mjs");
  const metrics = model.visualViewportKeyboardMetricsPlan({ layoutHeight: 844, viewportHeight: 540, offsetTop: 0 });
  assert.equal(metrics.keyboardLikely, true);
  assert.equal(metrics.bottomInset, 304);
  const stable = model.stableKeyboardViewportMetricsPlan({
    active: true,
    previous: { height: 540, offsetTop: 0, bottomInset: 304, keyboardLikely: true },
    metrics: { height: 542, offsetTop: 1, bottomInset: 303, keyboardLikely: true },
  });
  assert.equal(stable.reusePrevious, true);
  assert.equal(model.keyboardViewportActivePlan({
    mobileLayout: true,
    keyboardLikely: true,
    composerFocused: false,
    nativeEmbeddedPluginActive: true,
  }).active, true);
  const inset = model.pluginContextViewportBottomInsetPlan({
    active: true,
    navVisible: true,
    appHeight: 900,
    innerHeight: 844,
    navHeight: 72,
    navTop: 760,
    navBottom: 832,
    viewportOverflowClamp: 24,
  });
  assert.equal(inset.bottomInset, 108);
  assert.equal(inset.viewportOverflow, 24);
});

test("fixed viewport controller exposes bounded event prevention plans", async () => {
  const model = await importModule("src/vite-islands/navigation-shell/fixed-viewport-controller.mjs");
  assert.deepEqual(model.fixedViewportListenerPlan().gestureEvents, ["gesturestart", "gesturechange", "gestureend"]);
  assert.equal(model.shouldPreventMultiTouchMove({ touchCount: 2 }), true);
  assert.equal(model.shouldPreventMultiTouchMove({ touchCount: 1 }), false);
  assert.equal(model.doubleTapTouchEndPlan({ now: 1200, lastTouchEnd: 1000 }).prevent, true);
  assert.equal(model.doubleTapTouchEndPlan({ now: 1400, lastTouchEnd: 1000 }).prevent, false);
  assert.equal(model.shouldPreventWheelZoom({ ctrlKey: true }), true);
  assert.equal(model.shouldPreventWheelZoom({ metaKey: true }), true);
  assert.equal(model.shouldPreventWheelZoom({}), false);
});

Promise.all(pendingTests).then(() => {
  if (process.exitCode) process.exit(process.exitCode);
});
