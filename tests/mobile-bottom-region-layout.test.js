"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorkerJs = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");
const appComposerContextJs = fs.readFileSync(path.join(repoRoot, "public", "app-composer-context-ui.js"), "utf8");

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

const clientVersion = "20260608-plugin-context-restore-v633";
assert.match(indexHtml, new RegExp(`data-client-version="${clientVersion}"`));
assert.match(serviceWorkerJs, new RegExp(`HERMES_SW_VERSION = "${clientVersion}"`));

const navHeight = pxVariable("--plugin-context-bottom-nav-height");
const navComfortInset = pxVariable("--mobile-bottom-nav-comfort-inset");
const navOverflowClamp = pxVariable("--mobile-bottom-nav-overflow-clamp");
const navVisualLift = pxVariable("--mobile-bottom-nav-visual-lift");
const composerNavGap = pxVariable("--bottom-region-composer-nav-gap");
const composerReserve = pxVariable("--plugin-topic-composer-reserved-height");
const topicDockHeight = pxVariable("--topic-plugin-dock-height");

assert.equal(cssVariable("--plugin-topic-composer-bottom-offset"), "calc(var(--mobile-bottom-nav-bottom) + var(--plugin-context-bottom-nav-height) + var(--mobile-bottom-nav-visual-lift) + var(--bottom-region-composer-nav-gap))");
assert.equal(cssVariable("--topic-plugin-dock-bottom"), "var(--topic-plugin-dock-bottom-runtime, var(--mobile-bottom-nav-offset-height))");
assert.equal(cssVariable("--topic-plugin-dock-reserved-height"), "var(--topic-plugin-dock-reserved-height-runtime, calc(var(--topic-plugin-dock-bottom) + var(--topic-plugin-dock-height)))");
assert.equal(navOverflowClamp, 0, "PWA bottom overflow must be diagnostic-only by default");
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

assert.match(
  block(".bottom-nav .bottom-tab"),
  /transform: translateY\(calc\(-1 \* var\(--mobile-bottom-nav-visual-lift\)\)\);/,
);
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
assert.match(block(".composer-context-chip"), /min-height: 24px;/);
assert.match(stylesCss, /@media \(max-width: 1099px\)[\s\S]*?\.composer-context-chip \{[\s\S]*?min-height: 23px;/);

assert.match(appComposerContextJs, /function mobileBottomCssPx\(name, fallback = 0\)/);
assert.match(appComposerContextJs, /const navVisualLift = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-visual-lift", 0\)\)\)/);
assert.match(appComposerContextJs, /const visualViewportHeight = Math\.ceil\(window\.visualViewport\?\.height \|\| 0\)/);
assert.match(appComposerContextJs, /const innerHeight = Math\.ceil\(window\.innerHeight \|\| 0\)/);
assert.match(appComposerContextJs, /const documentHeight = Math\.ceil\(document\.documentElement\?\.clientHeight \|\| 0\)/);
assert.match(appComposerContextJs, /const layoutViewportHeight = Math\.max\(innerHeight, documentHeight, visualViewportHeight\)/);
assert.match(appComposerContextJs, /const viewportHeight = layoutViewportHeight/);
assert.match(appComposerContextJs, /const comfortInset = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-comfort-inset", 0\)\)\)/);
assert.match(appComposerContextJs, /const navBottomOverflowRaw = rect && viewportHeight \? Math\.ceil\(Math\.max\(0, rect\.bottom - viewportHeight\)\) : 0/);
assert.match(appComposerContextJs, /const navBottomOverflowClamp = Math\.max\(0, Math\.ceil\(mobileBottomCssPx\("--mobile-bottom-nav-overflow-clamp", 0\)\)\)/);
assert.match(appComposerContextJs, /const navBottomOverflow = Math\.min\(navBottomOverflowRaw, navBottomOverflowClamp\)/);
assert.match(appComposerContextJs, /const dockBottom = offset/);
assert.match(appComposerContextJs, /const stackHeight = dockVisible \? Math\.max\(reserve, dockBottom \+ dockHeight \+ 2\) : reserve/);
assert.doesNotMatch(appComposerContextJs, /const viewportHeight = Math\.ceil\(window\.visualViewport\?\.height \|\| window\.innerHeight/);
assert.doesNotMatch(appComposerContextJs, /const comfortInset = 12/);

assert.doesNotMatch(stylesCss, /bottom: calc\(var\(--plugin-context-bottom-nav-height\) \+ 3px\);/);
assert.doesNotMatch(stylesCss, /padding-bottom: var\(--plugin-topic-composer-reserved-height, 142px\);/);
assert.doesNotMatch(stylesCss, /transform: translateY\(-6px\);/);
assert.doesNotMatch(block(".app.task-list-mode"), /padding-bottom: var\(--topic-plugin-dock-reserved-height\);/);

console.log("mobile bottom region layout tests passed");
