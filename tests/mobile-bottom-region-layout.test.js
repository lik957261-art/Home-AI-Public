"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const serviceWorkerJs = fs.readFileSync(path.join(repoRoot, "public", "service-worker.js"), "utf8");

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

const clientVersion = "20260608-runtime-config-arch-v627";
assert.match(indexHtml, new RegExp(`data-client-version="${clientVersion}"`));
assert.match(serviceWorkerJs, new RegExp(`HERMES_SW_VERSION = "${clientVersion}"`));

const navHeight = pxVariable("--plugin-context-bottom-nav-height");
const navComfortInset = pxVariable("--mobile-bottom-nav-comfort-inset");
const navVisualLift = pxVariable("--mobile-bottom-nav-visual-lift");
const composerNavGap = pxVariable("--bottom-region-composer-nav-gap");
const composerReserve = pxVariable("--plugin-topic-composer-reserved-height");

assert.equal(cssVariable("--plugin-topic-composer-bottom-offset"), "calc(var(--mobile-bottom-nav-bottom) + var(--plugin-context-bottom-nav-height) + var(--mobile-bottom-nav-visual-lift) + var(--bottom-region-composer-nav-gap))");
assert.ok(composerNavGap >= 8, "composer/nav gap should remain visually separated after bottom tab lift");

const pluginTopicComposerBottom = navComfortInset + navHeight + navVisualLift + composerNavGap;
const mobileInputRowHeight = 32 + 5 + 5;
const composerContextRowHeight = 23 + 2;
const composerGridGap = 6;
const bottomRegionHeight = pluginTopicComposerBottom + mobileInputRowHeight + composerContextRowHeight + composerGridGap;
assert.ok(
  composerReserve >= bottomRegionHeight + 8,
  `plugin topic reserve ${composerReserve}px should cover nav/composer/context bottom region ${bottomRegionHeight}px plus breathing room`,
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
assert.match(block(".composer-context"), /grid-column: 1 \/ -1;[\s\S]*order: -3;/);
assert.match(block(".composer-context-chip"), /min-height: 24px;/);
assert.match(stylesCss, /@media \(max-width: 1099px\)[\s\S]*?\.composer-context-chip \{[\s\S]*?min-height: 23px;/);

assert.doesNotMatch(stylesCss, /bottom: calc\(var\(--plugin-context-bottom-nav-height\) \+ 3px\);/);
assert.doesNotMatch(stylesCss, /padding-bottom: var\(--plugin-topic-composer-reserved-height, 142px\);/);
assert.doesNotMatch(stylesCss, /transform: translateY\(-6px\);/);

console.log("mobile bottom region layout tests passed");
