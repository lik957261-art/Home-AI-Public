"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const embeddedPluginUi = fs.readFileSync(path.join(repoRoot, "public", "app-embedded-plugin-ui.js"), "utf8");
const automationUi = fs.readFileSync(path.join(repoRoot, "public", "app-automation-ui.js"), "utf8");
const wireStartUi = fs.readFileSync(path.join(repoRoot, "public", "app-wire-start-ui.js"), "utf8");
const navigationSearchUi = fs.readFileSync(path.join(repoRoot, "public", "app-navigation-search-ui.js"), "utf8");
const sidebarTaskUi = fs.readFileSync(path.join(repoRoot, "public", "app-sidebar-task-ui.js"), "utf8");
const platformUi = fs.readFileSync(path.join(repoRoot, "public", "app-platform-ui.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "public", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

assert.match(indexHtml, /id="bottomCodexMode"/);
assert.match(indexHtml, /app-embedded-plugin-ui\.js\?v=/);

assert.match(embeddedPluginUi, /"codex-mobile"/);
assert.match(embeddedPluginUi, /viewMode: "codex"/);
assert.match(embeddedPluginUi, /manifestPath: "\/api\/hermes-plugins\/codex-mobile\/manifest"/);
assert.match(embeddedPluginUi, /backResultEventType: "codex-mobile\.plugin\.back_result"/);
assert.match(embeddedPluginUi, /function renderEmbeddedPluginView\(def\)/);
assert.match(embeddedPluginUi, /function loadEmbeddedPluginManifest\(def, options = {}\)/);
assert.match(embeddedPluginUi, /appOrigin: window\.location\.origin/);
assert.match(embeddedPluginUi, /function embeddedPluginUsesLaunchToken\(manifest\)/);
assert.match(embeddedPluginUi, /codexPluginLaunch/);
assert.match(embeddedPluginUi, /function embeddedPluginHost\(def\)/);
assert.match(embeddedPluginUi, /main\.insertBefore\(host, conversation\)/);
assert.match(embeddedPluginUi, /function scheduleEmbeddedPluginLaunchHealthCheck\(def, frame, loadedAt = Date\.now\(\)\)/);
assert.match(embeddedPluginUi, /function refreshEmbeddedPluginFrameFromFreshManifest\(def\)/);
assert.match(embeddedPluginUi, /function ensureEmbeddedPluginNavigationBridge\(def\)/);
assert.match(embeddedPluginUi, /def\.navigationEventType/);
assert.match(embeddedPluginUi, /function updateEmbeddedPluginBackResultState\(def, payload = {}\)/);
assert.match(embeddedPluginUi, /def\.backResultEventType/);
assert.match(embeddedPluginUi, /record\.canGoBack = false/);
assert.match(embeddedPluginUi, /type: "hermes\.plugin\.back"/);
assert.match(embeddedPluginUi, /class="embedded-plugin-frame"/);
assert.match(embeddedPluginUi, /sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"/);
assert.match(embeddedPluginUi, /function renderCodexPluginView\(\)/);
assert.match(embeddedPluginUi, /function updateCodexPluginNavigationAvailability\(\)/);
assert.match(embeddedPluginUi, /const available = Boolean\(state\.auth\?\.isOwner\)/);
assert.match(embeddedPluginUi, /function parkCodexPluginShell\(\)/);
assert.match(embeddedPluginUi, /function codexPluginBackActive\(\)/);
assert.match(embeddedPluginUi, /function sendCodexPluginBack\(\)/);
assert.doesNotMatch(embeddedPluginUi, /window\.open/);
assert.doesNotMatch(embeddedPluginUi, /target="_blank"/);
assert.doesNotMatch(embeddedPluginUi, /access_key|Authorization|Bearer/);

assert.match(automationUi, /const codex = state\.viewMode === "codex"/);
assert.match(automationUi, /parkCodexPluginShell\(\)/);
assert.match(automationUi, /renderCodexPluginView\(\)/);
assert.match(wireStartUi, /bottomCodexMode/);
assert.match(navigationSearchUi, /codexPluginBackActive\(\)/);
assert.match(sidebarTaskUi, /sendCodexPluginBack\(\)/);
assert.match(platformUi, /view === "codex" \|\| view === "codex-mobile"/);

assert.match(stylesCss, /\.embedded-plugin-host/);
assert.match(stylesCss, /\.embedded-plugin-frame/);
assert.match(stylesCss, /\.codex-mode \.conversation\s*\{[\s\S]*padding: 0;/);
assert.match(stylesCss, /\.embedded-plugin-host-active \.conversation\s*\{[\s\S]*display: none;/);
assert.match(stylesCss, /\.embedded-plugin-host-active \.topbar\s*\{[\s\S]*display: none !important;/);
assert.match(stylesCss, /\.embedded-plugin-host-active \.main\s*\{[\s\S]*grid-template-rows: minmax\(0, 1fr\);/);
assert.match(stylesCss, /\.nav-codex-icon::before/);
assert.match(stylesCss, /\.bottom-nav\.wardrobe-visible\.codex-visible/);
