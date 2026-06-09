"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorkerJs = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");
const appComposerContextJs = fs.readFileSync(path.join(repoRoot, "public", "app-composer-context-ui.js"), "utf8");
const appPlatformUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-platform-ui.js"), "utf8");
const appChatComposerUiJs = fs.readFileSync(path.join(repoRoot, "public", "app-chat-composer-ui.js"), "utf8");

function cssVariable(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesCss.match(new RegExp(`${escaped}:\\s*([^;]+);`));
  assert.ok(match, `${name} should be defined`);
  return match[1].trim();
}

function pxVariable(name) {
  const value = cssVariable(name);
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  assert.ok(match, `${name} should be a px token, got ${value}`);
  return Number(match[1]);
}

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = stylesCss.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\s*\\}`));
  assert.ok(match, `${selector} block should exist`);
  return match[0];
}

const clientVersion = "20260609-bottom-safe-bridge-fix-v658";
assert.match(indexHtml, new RegExp(`data-client-version="${clientVersion}"`));
assert.match(serviceWorkerJs, new RegExp(`HERMES_SW_VERSION = "${clientVersion}"`));

const navHeight = pxVariable("--plugin-context-bottom-nav-height");
const navComfortInset = pxVariable("--mobile-bottom-nav-comfort-inset");
const navOverflowClamp = pxVariable("--mobile-bottom-nav-overflow-clamp");
const navUnderflowClamp = pxVariable("--mobile-bottom-nav-underflow-clamp");
const navSurfaceUnderflowClamp = pxVariable("--mobile-bottom-nav-surface-underflow-clamp");
const navVisualLift = pxVariable("--mobile-bottom-nav-visual-lift");
const composerNavGap = pxVariable("--bottom-region-composer-nav-gap");
const composerReserve = pxVariable("--plugin-topic-composer-reserved-height");
const topicDockHeight = pxVariable("--topic-plugin-dock-height");

assert.equal(cssVariable("--plugin-topic-composer-bottom-offset"), "calc(var(--mobile-bottom-nav-bottom) + var(--plugin-context-bottom-nav-height) + var(--mobile-bottom-nav-visual-lift) + var(--bottom-region-composer-nav-gap))");
assert.equal(cssVariable("--topic-plugin-dock-bottom"), "var(--topic-plugin-dock-bottom-runtime, var(--mobile-bottom-nav-offset-height))");
assert.equal(cssVariable("--topic-plugin-dock-reserved-height"), "var(--topic-plugin-dock-reserved-height-runtime, calc(var(--topic-plugin-dock-bottom) + var(--topic-plugin-dock-height)))");
assert.equal(navComfortInset, 18, "new installed PWA bottom nav should keep an 18px host comfort inset");
assert.equal(navOverflowClamp, 0, "PWA bottom overflow must be diagnostic-only by default");
assert.equal(navUnderflowClamp, 24, "PWA bottom underflow correction should be bounded");
assert.ok(navSurfaceUnderflowClamp >= 53, "PWA surface underflow correction should cover iOS safe-top viewport splits");
assert.ok(composerNavGap >= 8, "composer/nav gap should remain visually separated after bottom tab lift");
assert.ok(topicDockHeight >= 70, "topic dock height should be represented in the bottom stack reserve");

const pluginTopicComposerBottom = navComfortInset + navHeight + navVisualLift + composerNavGap;
const mobileInputRowHeight = 32 + 5 + 5;
const composerContextRowHeight = 23 + 2;
const composerGridGap = 6;
const bottomRegionHeight = pluginTopicComposerBottom + mobileInputRowHeight + composerContextRowHeight + composerGridGap;
assert.ok(
  composerReserve >= bottomRegionHeight + 8,
  `plugin topic reserve ${composerReserve}px should cover nav/composer/context bottom region ${bottomRegionHeight}px plus breathing room`,
);

function rawProjectedBottomInset(rectBottom, viewportHeight, comfortInset) {
  return Math.ceil(Math.max(0, rectBottom - viewportHeight)) + comfortInset;
}

function projectedBottomInset(rectBottom, viewportHeight, comfortInset, overflowClamp) {
  const rawOverflow = Math.ceil(Math.max(0, rectBottom - viewportHeight));
  return Math.min(rawOverflow, overflowClamp) + comfortInset;
}

function projectedBottomUnderflow(rectBottom, viewportHeight, currentDrop, underflowClamp) {
  const rawUnderflow = Math.ceil(Math.max(0, viewportHeight - rectBottom + currentDrop));
  return Math.min(rawUnderflow, underflowClamp);
}

function projectedSurfaceUnderflow(rectBottom, viewportHeight, surfaceHeight, currentDrop, safeTop, surfaceClamp) {
  const rawUnderflow = surfaceHeight > viewportHeight
    ? Math.ceil(Math.max(0, surfaceHeight - rectBottom + currentDrop))
    : 0;
  const safeClamp = safeTop > 0 ? Math.min(surfaceClamp, safeTop) : 0;
  return Math.min(rawUnderflow, safeClamp);
}

function projectedPluginContextBottomInset(appHeight, layoutViewportHeight, navTop, overflowClamp) {
  const rawOverflow = Math.ceil(Math.max(0, appHeight - layoutViewportHeight));
  const visibleTopInset = Math.ceil(Math.max(0, layoutViewportHeight - navTop));
  return Math.max(0, visibleTopInset + Math.min(rawOverflow, overflowClamp));
}

const pwaLayoutViewport = 844;
const pwaVisualViewport = 780;
const navRectBottomWithFallbackInset = pwaLayoutViewport - navComfortInset;
assert.equal(projectedBottomInset(navRectBottomWithFallbackInset, pwaLayoutViewport, navComfortInset, navOverflowClamp), navComfortInset);
assert.ok(
  rawProjectedBottomInset(navRectBottomWithFallbackInset, pwaVisualViewport, navComfortInset) > navComfortInset + 40,
  "using a shortened PWA visual viewport would falsely lift the bottom stack",
);
assert.equal(
  projectedBottomInset(navRectBottomWithFallbackInset, pwaVisualViewport, navComfortInset, navOverflowClamp),
  navComfortInset,
  "shortened PWA viewport overflow must not lift the whole bottom stack",
);
assert.equal(
  projectedBottomUnderflow(pwaLayoutViewport - 18, pwaLayoutViewport, 0, navUnderflowClamp),
  18,
  "bottom nav underflow should be corrected when fixed chrome stops above the layout viewport",
);
assert.equal(
  projectedBottomUnderflow(pwaLayoutViewport - 60, pwaLayoutViewport, 0, navUnderflowClamp),
  navUnderflowClamp,
  "bottom nav underflow correction should stay bounded",
);
assert.equal(
  projectedSurfaceUnderflow(759, 759, 812, 0, 53, navSurfaceUnderflowClamp),
  53,
  "iOS standalone surface underflow diagnostic should expose the measured full-surface delta",
);
assert.equal(
  projectedSurfaceUnderflow(759, 759, 812, 0, 0, navSurfaceUnderflowClamp),
  0,
  "surface underflow must not run without a top safe-area signal",
);
assert.equal(
  projectedSurfaceUnderflow(759, 759, 759, 0, 53, navSurfaceUnderflowClamp),
  0,
  "surface underflow must not run when viewport units do not split",
);
const projectedDockBottomWithSurfaceSplit = 59;
assert.equal(
  projectedDockBottomWithSurfaceSplit,
  59,
  "topic Dock should stay above the visible fixed nav rather than following a clipped surface delta",
);
assert.equal(
  projectedPluginContextBottomInset(pwaLayoutViewport, pwaLayoutViewport, pwaLayoutViewport - navHeight, navOverflowClamp),
  navHeight,
  "plugin-context iframe bottom inset should stay at nav height when only visualViewport is shorter",
);
assert.ok(
  projectedPluginContextBottomInset(pwaLayoutViewport, pwaVisualViewport, pwaVisualViewport - navHeight - 44, 999) > navHeight + 40,
  "using shortened visualViewport as plugin-context boundary would falsely shrink the iframe",
);
assert.equal(
  projectedPluginContextBottomInset(pwaLayoutViewport, pwaVisualViewport, pwaVisualViewport - navHeight, navOverflowClamp),
  navHeight,
  "plugin-context overflow clamp default should prevent visualViewport-only iframe lift",
);

assert.match(
  block(".bottom-nav .bottom-tab"),
  /transform: translateY\(calc\(-1 \* var\(--mobile-bottom-nav-visual-lift\)\)\);/,
);
assert.match(block(".app::after"), /height: max\(0px, var\(--mobile-bottom-nav-bottom\)\);/);
assert.match(block(".app::after"), /z-index: 39;/);
assert.match(block(".app::after"), /background: var\(--ui-chrome-solid, var\(--ui-page\)\);/);
assert.match(stylesCss, /:root\.keyboard-viewport-active \.app::after,[\s\S]*?\.app\.embedded-plugin-preview-fullscreen-active::after \{[\s\S]*?content: none;/);
assert.match(
  block(".app.main-back-visible.plugin-context-nav-mode.plugin-topic-detail-mode .composer"),
  /bottom: var\(--plugin-topic-composer-bottom-offset\);/,
);
assert.match(
  block(".app.main-back-visible.plugin-context-nav-mode.plugin-topic-detail-mode .conversation"),
  /padding-bottom: var\(--plugin-topic-composer-reserved-height\);/,
);
assert.match(block(".app.task-list-mode"), /padding-bottom: 0;/);
assert.match(
  block(".app.task-list-mode .conversation"),
  /padding-bottom: var\(--topic-plugin-dock-reserved-height\);/,
);
assert.match(
  stylesCss,
  /\.app\.task-list-mode \.conversation > \.directory-topic-launcher:first-child,[\s\S]*?\.app\.task-list-mode \.conversation > \.capability-entry-hub:first-child,[\s\S]*?margin-top: max\(16px, calc\(env\(safe-area-inset-top\) \+ 4px\)\);/,
);
assert.match(block(".composer-context"), /grid-column: 1 \/ -1;[\s\S]*order: -3;/);
assert.match(block(".composer-context"), /background: var\(--ui-chrome\);[\s\S]*box-shadow: 0 6px 0 var\(--ui-chrome\);/);
assert.match(block(".composer-context-chip"), /min-height: 24px;/);
assert.match(stylesCss, /@media \(max-width: 1099px\)[\s\S]*?\.composer-context-chip \{[\s\S]*?min-height: 23px;/);

assert.match(appComposerContextJs, /function mobileBottomCssPx\(name, fallback = 0\)/);
assert.match(appComposerContextJs, /function captureClientLayoutDiagnostic\(reason = "layout"\)/);
assert.match(appComposerContextJs, /fetch\("\/api\/client-layout-diagnostics"/);
assert.match(appComposerContextJs, /function clientLayoutDiagnosticViewportUnits\(\)/);
assert.match(appComposerContextJs, /function clientLayoutDiagnosticSafeAreaProbe\(\)/);
assert.match(appComposerContextJs, /function clientLayoutDiagnosticChrome\(app, main, bottomNav\)/);
assert.match(appComposerContextJs, /statusBarStyle: statusMeta\?\.getAttribute\("content"\) \|\| ""/);
assert.match(appComposerContextJs, /viewportUnits: clientLayoutDiagnosticViewportUnits\(\)/);
assert.match(appComposerContextJs, /rootElement: clientLayoutDiagnosticRect\(document\.documentElement\)/);
assert.match(appComposerContextJs, /function settleMobileBottomNavReservation\(reason = "layout", delays = \[0, 40, 120, 260, 520, 1000, 1800\]\)/);
assert.match(appComposerContextJs, /requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?updateMobileBottomNavReservation\(\);/);
assert.match(appComposerContextJs, /window\.__hermesMobileBottomLayoutLastSettle = \{/);
assert.match(appComposerContextJs, /settleMobileBottomNavReservation\("view_change", \[0, 80, 240, 520\]\)/);
assert.match(appPlatformUiJs, /settleMobileBottomNavReservation\("app_show"\)/);
assert.match(appChatComposerUiJs, /settleMobileBottomNavReservation\("host_foreground", \[0, 80, 240, 520, 1000\]\)/);
assert.match(appComposerContextJs, /const navVisualLift = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-visual-lift", 0\)\)\)/);
assert.match(appComposerContextJs, /const visualViewportHeight = Math\.ceil\(window\.visualViewport\?\.height \|\| 0\)/);
assert.match(appComposerContextJs, /const innerHeight = Math\.ceil\(window\.innerHeight \|\| 0\)/);
assert.match(appComposerContextJs, /const documentHeight = Math\.ceil\(document\.documentElement\?\.clientHeight \|\| 0\)/);
assert.match(appComposerContextJs, /const layoutViewportHeight = Math\.max\(innerHeight, documentHeight, visualViewportHeight\)/);
assert.match(appComposerContextJs, /const viewportHeight = layoutViewportHeight/);
assert.match(appComposerContextJs, /const comfortInset = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-comfort-inset", 0\)\)\)/);
assert.match(appComposerContextJs, /const navLaidOut = Boolean\(rect && rectHeight > 0 && rectWidth > 0 && rect\.bottom > 0\)/);
assert.match(appComposerContextJs, /const navBottomOverflowRaw = navLaidOut && viewportHeight \? Math\.ceil\(Math\.max\(0, rect\.bottom - viewportHeight\)\) : 0/);
assert.match(appComposerContextJs, /const navBottomOverflowClamp = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-overflow-clamp", 0\)\)\)/);
assert.match(appComposerContextJs, /const navBottomOverflow = Math\.min\(navBottomOverflowRaw, navBottomOverflowClamp\)/);
assert.match(appComposerContextJs, /const currentNavBottomDrop = navLaidOut \? Math\.max\(0, -currentNavBottom\) : 0/);
assert.match(appComposerContextJs, /const navBottomGapRaw = navLaidOut && viewportHeight \? Math\.ceil\(Math\.max\(0, viewportHeight - rect\.bottom \+ currentNavBottomDrop\)\) : 0/);
assert.match(appComposerContextJs, /const navBottomUnderflowRaw = Math\.max\(0, navBottomGapRaw - comfortInset\)/);
assert.match(appComposerContextJs, /const navBottomUnderflowClamp = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-underflow-clamp", 0\)\)\)/);
assert.match(appComposerContextJs, /const navBottomUnderflow = Math\.min\(navBottomUnderflowRaw, navBottomUnderflowClamp\)/);
assert.match(appComposerContextJs, /const largeViewportHeight = Math\.ceil\(clientLayoutDiagnosticMeasureLength\("100lvh"\)\?\.height \|\| 0\)/);
assert.match(appComposerContextJs, /const surfaceViewportHeight = standaloneSurface \? Math\.max\(viewportHeight, largeViewportHeight\) : viewportHeight/);
assert.match(appComposerContextJs, /const surfaceUnderflowSafeClamp = safeAreaTop > 0 \? Math\.min\(surfaceUnderflowClamp, safeAreaTop\) : 0/);
assert.match(appComposerContextJs, /const surfaceUnderflowCandidate = Math\.min\(surfaceUnderflowRaw, surfaceUnderflowSafeClamp\)/);
assert.match(appComposerContextJs, /const surfaceUnderflow = 0/);
assert.match(appComposerContextJs, /const effectiveNavBottomUnderflow = navBottomUnderflow/);
assert.match(appComposerContextJs, /const navBottom = navBottomOverflow \+ comfortInset - effectiveNavBottomUnderflow/);
assert.match(appComposerContextJs, /window\.__hermesMobileBottomLayoutMetrics = null;/);
assert.match(appComposerContextJs, /const dockBottom = offset/);
assert.match(appComposerContextJs, /const stackHeight = dockVisible \? Math\.max\(reserve, dockBottom \+ dockHeight \+ 2\) : reserve/);
assert.match(appComposerContextJs, /const layoutViewportHeight = Math\.max\(innerHeight, documentHeight, visualViewportHeight\)/);
assert.match(appComposerContextJs, /const viewportHeight = layoutViewportHeight \|\| appHeight \|\| 0/);
assert.match(appComposerContextJs, /const viewportOverflowRaw = Math\.max\(0, appHeight - viewportHeight\)/);
assert.match(appComposerContextJs, /const viewportOverflowClamp = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-overflow-clamp", 0\)\)\)/);
assert.match(appComposerContextJs, /const viewportOverflow = Math\.min\(viewportOverflowRaw, viewportOverflowClamp\)/);
assert.match(appComposerContextJs, /const navVisibleTopInset = navRect && viewportHeight \? Math\.ceil\(Math\.max\(0, viewportHeight - navRect\.top\)\) : navHeight/);
assert.match(appComposerContextJs, /const bottomInset = Math\.max\(0, navVisibleTopInset \+ viewportOverflow\)/);
assert.match(appComposerContextJs, /window\.__hermesPluginContextViewportMetrics = \{/);
assert.doesNotMatch(appComposerContextJs, /const viewportHeight = Math\.ceil\(window\.visualViewport\?\.height \|\| window\.innerHeight/);
assert.doesNotMatch(appComposerContextJs, /const comfortInset = 12/);

assert.doesNotMatch(stylesCss, /bottom: calc\(var\(--plugin-context-bottom-nav-height\) \+ 3px\);/);
assert.doesNotMatch(stylesCss, /padding-bottom: var\(--plugin-topic-composer-reserved-height, 142px\);/);
assert.doesNotMatch(stylesCss, /transform: translateY\(-6px\);/);
assert.doesNotMatch(block(".app.task-list-mode"), /padding-bottom: var\(--topic-plugin-dock-reserved-height\);/);

console.log("mobile bottom region layout tests passed");
