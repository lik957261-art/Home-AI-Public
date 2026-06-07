"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function assertDocContains(docText, reference) {
  assert.ok(
    docText.includes(reference),
    `architecture-code-test-harness map should reference ${reference}`
  );
}

const mapPath = "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md";
assert.ok(exists(mapPath), `${mapPath} should exist`);

const mapText = read(mapPath);
const docsIndex = read("docs/DOCS_INDEX.md");
const testMatrix = read("docs/TEST_MATRIX.md");

assert.match(mapText, /# Home AI Architecture, Code, Test, And Harness Map/);
assert.match(mapText, /## Runtime Module Map/);
assert.match(mapText, /## Client Efficiency And Visual Stability Gates/);
assert.match(mapText, /## Extension Checklist/);
assert.match(mapText, /H1/);
assert.match(mapText, /H2/);
assert.match(mapText, /H3/);
assert.match(mapText, /CodeGraph/);
assert.match(mapText, /PWA/);
assert.match(mapText, /visual/i);
assert.match(mapText, /flicker/i);
assert.match(mapText, /full re-render/i);
assert.match(mapText, /raw secrets/);

assert.ok(
  docsIndex.includes(mapPath),
  "docs index should link the architecture-code-test-harness map"
);
assert.ok(
  testMatrix.includes("node tests\\architecture-code-test-harness-map.test.js"),
  "test matrix should include the architecture-code-test-harness map guard"
);

const requiredExistingReferences = [
  "docs/ARCHITECTURE.md",
  "docs/ARCHITECTURE_BOUNDARY.md",
  "docs/API_ROUTE_REFERENCE.md",
  "docs/TEST_MATRIX.md",
  "docs/FRONTEND_STATE_MAP.md",
  "docs/MODULES/static-client.md",
  "docs/MODULES/gateway-pool.md",
  "docs/MODULES/plugins.md",
  "docs/MODULES/plugin-topics.md",
  "docs/MODULES/growth-learning.md",
  "docs/MODULES/action-inbox.md",
  "docs/MODULES/directory-files.md",
  "docs/MODULES/runtime-state-backup.md",
  "docs/IMPLEMENTATION_NOTES/harness-required-matrix.md",
  "docs/IMPLEMENTATION_NOTES/plugin-capability-activation.md",
  "docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md",
  "adapters/api-route-registry.js",
  "adapters/auth-provider.js",
  "adapters/gateway-worker-runtime-settings-service.js",
  "adapters/runtime-config-provider.js",
  "adapters/gateway-runtime-composition-service.js",
  "adapters/gateway-runtime-subservice-options-service.js",
  "adapters/gateway-run-start-service.js",
  "adapters/gateway-run-toolset-routing-service.js",
  "adapters/hermes-plugin-service.js",
  "adapters/plugin-capability-activation-service.js",
  "adapters/wardrobe-plugin-provisioning-service.js",
  "adapters/action-inbox-service.js",
  "adapters/conversation-history-service.js",
  "adapters/document-preview-service.js",
  "adapters/learning-growth-service.js",
  "adapters/runtime-state-persistence-service.js",
  "server-routes/mobile-api-dispatcher.js",
  "server-routes/runtime-config-api-routes.js",
  "server-routes/hermes-plugin-api-routes.js",
  "server-routes/action-inbox-api-routes.js",
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "public/styles.css",
  "public/app-embedded-plugin-ui.js",
  "public/app-run-progress-ui.js",
  "public/app-thread-state-ui.js",
  "scripts/start-gateway-pool.ps1",
  "scripts/configure-low-gateways.sh",
  "scripts/build-gateway-profile-template.js",
  "scripts/playwright-visual-smoke.js",
  "scripts/authenticated-navigation-flow-smoke.js",
  "scripts/android-pwa-plugin-dock-smoke.js",
  "tests/architecture-refactor-boundary.test.js",
  "tests/playwright-visual-smoke-harness.test.js",
  "tests/authenticated-navigation-flow-smoke-harness.test.js",
  "tests/api-route-registry.test.js",
  "tests/gateway-runtime-composition-service.test.js",
  "tests/gateway-runtime-subservice-options-service.test.js",
  "tests/gateway-run-start-service.test.js",
  "tests/gateway-worker-runtime-settings-service.test.js",
  "tests/runtime-config-provider.test.js",
  "tests/runtime-config-api-routes.test.js",
  "tests/mobile-runtime-gateway-facade-service.test.js",
  "tests/plugin-capability-activation-service.test.js",
  "tests/app-embedded-plugin-ui.test.js",
  "tests/task-list-ui.test.js",
  "tests/static-cache-version-harness.test.js",
  "tests/keyboard-viewport-ui.test.js",
  "tests/viewport-scroll-ui.test.js",
  "tests/run-progress-ui-behavior.test.js",
  "tests/thread-state-ui-behavior.test.js",
  "tests/runtime-state-persistence-service.test.js",
];

for (const reference of requiredExistingReferences) {
  assertDocContains(mapText, reference);
  assert.ok(exists(reference), `${reference} should exist`);
}

const requiredSurfaces = [
  "Architecture boundary and API registry",
  "Workspace, auth, access policy, and public projection",
  "Gateway Pool, run lifecycle, provider routing, runtime worker settings, and profile materialization",
  "Plugin host, plugin topics, and lazy plugin MCP activation",
  "Product plugin provisioning and workspace-local MCP bindings",
  "Static PWA shell, navigation, cache, visual stability, and installed-app metadata",
  "Chat, threads, group chat, and context assembly",
  "Action Inbox, Automation, Web Push, and delivery routing",
  "Directory, file preview, artifacts, and shared roots",
  "Growth learning, mastery, card workflow, and rewards",
  "Runtime SQLite, persistence, backup, and deployment",
  "Weixin ingress and outbound delivery",
  "ChatGPT Pro, Grok, and provider-specific bridges",
];

for (const surface of requiredSurfaces) {
  assertDocContains(mapText, surface);
}

const requiredClientRiskRows = [
  "Static cache drift",
  "Mobile blanking or tab-switch flicker",
  "Run-status jank",
  "Viewport, keyboard, safe-area, and bottom nav drift",
  "Embedded plugin frame afterimages",
  "Scroll or gesture conflicts",
];

for (const risk of requiredClientRiskRows) {
  assertDocContains(mapText, risk);
}

console.log("architecture code test harness map guard passed");
