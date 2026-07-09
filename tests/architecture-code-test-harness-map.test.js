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
  "docs/PLATFORM_CONTRACTS/home-ai-runtime-boundary-contract.md",
  "docs/PLATFORM_CONTRACTS/plugin-capability-closure-contract.md",
  "docs/API_ROUTE_REFERENCE.md",
  "docs/TEST_MATRIX.md",
  "docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md",
  "docs/PLATFORM_CONTRACTS/fallback-governance-contract.md",
  "docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md",
  "docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md",
  "docs/IMPLEMENTATION_NOTES/fallback-registry.md",
  "docs/FRONTEND_STATE_MAP.md",
  "docs/MODULES/static-client.md",
  "docs/MODULES/native-ios-shell.md",
  "docs/MODULES/ai-operations-control-plane.md",
  "docs/MODULES/gateway-pool.md",
  "docs/MODULES/plugins.md",
  "docs/MODULES/plugin-topics.md",
  "docs/MODULES/growth-learning.md",
  "docs/MODULES/action-inbox.md",
  "docs/MODULES/directory-files.md",
  "docs/MODULES/runtime-state-backup.md",
  "docs/IMPLEMENTATION_NOTES/harness-required-matrix.md",
  "docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md",
  "docs/IMPLEMENTATION_NOTES/owner-system-console.md",
  "docs/PLATFORM_CONTRACTS/diagnostic-remediation-loop-contract.md",
  "docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md",
  "docs/IMPLEMENTATION_NOTES/autonomous-delivery-loop.md",
  "docs/IMPLEMENTATION_NOTES/loop-engineering.md",
  "docs/IMPLEMENTATION_NOTES/plugin-capability-activation.md",
  "docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md",
  "docs/IMPLEMENTATION_NOTES/composer-event-contract.md",
  "adapters/api-route-registry.js",
  "adapters/ai-operations-control-plane-service.js",
  "adapters/ai-ops-diagnostic-remediation-service.js",
  "adapters/ai-ops-diagnostic-remediation-workflow-service.js",
  "adapters/task-card-dispatch-result-service.js",
  "adapters/home-ai-runtime-slo-service.js",
  "adapters/owner-3a-quality-evidence-service.js",
  "adapters/owner-3a-quality-program-service.js",
  "adapters/owner-system-console-service.js",
  "adapters/system-resource-status-service.js",
  "adapters/self-check-diagnostic-submit-smoke-service.js",
  "adapters/plugin-conversation-action-bridge-service.js",
  "adapters/codex-thread-task-card-service.js",
  "adapters/autonomous-delivery-intake-service.js",
  "adapters/autonomous-delivery-case-ledger-service.js",
  "adapters/autonomous-delivery-coordinator-service.js",
  "adapters/autonomous-delivery-routing-decision-service.js",
  "adapters/main-thread-routing-preflight-service.js",
  "adapters/loop-engineering-plan-service.js",
  "adapters/codex-mobile-at-loop-status-service.js",
  "adapters/task-card-dispatch-idempotency-service.js",
  "adapters/worker-lane-scheduler-service.js",
  "adapters/return-watchdog-service.js",
  "adapters/source-return-integration-watchdog-service.js",
  "adapters/auth-provider.js",
  "adapters/gateway-worker-runtime-settings-service.js",
  "adapters/runtime-config-provider.js",
  "adapters/runtime-config-effective-service.js",
  "adapters/runtime-config-gateway-worker-service.js",
  "adapters/runtime-config-worker-policy-contract-service.js",
  "adapters/runtime-config-key-service.js",
  "adapters/runtime-config-model-service.js",
  "adapters/runtime-config-public-projection-service.js",
  "adapters/runtime-config-save-service.js",
  "adapters/mobile-runtime-gateway-concurrency-service.js",
  "adapters/mobile-runtime-gateway-provider-service.js",
  "adapters/mobile-runtime-gateway-status-service.js",
  "adapters/gateway-runtime-composition-service.js",
  "adapters/gateway-runtime-child-service-registry-service.js",
  "adapters/gateway-runtime-subservice-options-service.js",
  "adapters/gateway-run-request-builder-service.js",
  "adapters/gateway-run-start-assistant-options-service.js",
  "adapters/gateway-run-start-child-service-registry-service.js",
  "adapters/gateway-run-start-event-service.js",
  "adapters/gateway-run-start-execution-phase-service.js",
  "adapters/gateway-run-start-permission-service.js",
  "adapters/gateway-run-start-plugin-probe-service.js",
  "adapters/gateway-run-start-preparation-service.js",
  "adapters/gateway-run-start-stream-handoff-service.js",
  "adapters/gateway-run-start-stream-options-service.js",
  "adapters/gateway-run-start-state-service.js",
  "adapters/gateway-run-start-target-phase-service.js",
  "adapters/gateway-run-start-target-service.js",
  "adapters/gateway-run-start-toolset-preflight-service.js",
  "adapters/gateway-run-start-toolset-selection-service.js",
  "adapters/gateway-run-start-wardrobe-gate-service.js",
  "adapters/gateway-run-start-service.js",
  "adapters/gateway-run-queue-service.js",
  "adapters/gateway-run-queue-projection-service.js",
  "adapters/gateway-run-completion-service.js",
  "adapters/gateway-run-delta-event-service.js",
  "adapters/gateway-run-output-event-service.js",
  "adapters/gateway-run-response-created-service.js",
  "adapters/gateway-run-streaming-save-service.js",
  "adapters/gateway-run-event-service.js",
  "adapters/gateway-run-evidence-service.js",
  "adapters/gateway-run-toolset-escalation-service.js",
  "adapters/gateway-run-toolset-escalation-retry-service.js",
  "adapters/gateway-run-quota-failover-retry-service.js",
  "adapters/gateway-run-terminal-state-service.js",
  "adapters/openai-codex-shared-auth-pool-service.js",
  "adapters/openai-codex-quota-failover-runtime-service.js",
  "adapters/gateway-run-stream-completion-service.js",
  "adapters/gateway-run-stream-close-recovery-service.js",
  "adapters/gateway-run-stream-event-service.js",
  "adapters/gateway-run-stream-failure-service.js",
  "adapters/gateway-run-stream-first-event-service.js",
  "adapters/gateway-run-stream-liveness-service.js",
  "adapters/gateway-run-stream-liveness-timer-service.js",
  "adapters/gateway-run-stream-registry-service.js",
  "adapters/gateway-run-stream-state-service.js",
  "adapters/gateway-run-stream-stop-service.js",
  "adapters/gateway-run-toolset-routing-service.js",
  "adapters/hermes-plugin-service.js",
  "adapters/plugin-capability-activation-service.js",
  "adapters/wardrobe-plugin-provisioning-service.js",
  "adapters/action-inbox-service.js",
  "adapters/web-push-automation-projection-service.js",
  "adapters/web-push-delivery-normalization-service.js",
  "adapters/web-push-send-service.js",
  "adapters/web-push-vapid-service.js",
  "adapters/conversation-history-service.js",
  "adapters/document-preview-service.js",
  "adapters/learning-growth-service.js",
  "adapters/runtime-state-persistence-service.js",
  "server-routes/mobile-api-dispatcher.js",
  "server-routes/runtime-config-api-routes.js",
  "server-routes/hermes-plugin-api-routes.js",
  "server-routes/action-inbox-api-routes.js",
  "server-routes/owner-system-console-api-routes.js",
  "server-routes/plugin-conversation-action-api-routes.js",
  "server-routes/autonomous-delivery-api-routes.js",
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "public/styles.css",
  "public/app-dialog-ui.js",
  "public/app-embedded-plugin-ui.js",
  "public/app-owner-system-console-ui.js",
  "public/app-run-progress-ui.js",
  "public/app-thread-state-ui.js",
  "scripts/start-gateway-pool.ps1",
  "scripts/configure-low-gateways.sh",
  "scripts/homeai-openai-codex-auth-pool.js",
  "scripts/build-gateway-profile-template.js",
  "scripts/playwright-visual-smoke.js",
  "scripts/authenticated-navigation-flow-smoke.js",
  "scripts/android-pwa-plugin-dock-smoke.js",
  "scripts/ai-ops-control-plane.js",
  "scripts/self-check-diagnostic-submit-smoke.js",
  "scripts/autonomous-delivery-loop.js",
  "scripts/main-thread-routing-preflight.js",
  "scripts/worker-handoff-lifecycle-check.js",
  "scripts/plugin-capability-closure-smoke.js",
  "scripts/mcp-tool-upgrade-closure-smoke.js",
  "scripts/fallback-governance-check.js",
  "tests/architecture-refactor-boundary.test.js",
  "tests/home-ai-runtime-boundary-contract.test.js",
  "tests/plugin-capability-closure-smoke.test.js",
  "tests/composer-event-contract.test.js",
  "tests/no-browser-native-dialogs.test.js",
  "tests/ai-operations-control-plane-service.test.js",
  "tests/autonomous-delivery-intake-service.test.js",
  "tests/autonomous-delivery-case-ledger-service.test.js",
  "tests/autonomous-delivery-coordinator-service.test.js",
  "tests/autonomous-delivery-routing-decision-service.test.js",
  "tests/main-thread-routing-preflight-service.test.js",
  "tests/loop-engineering-plan-service.test.js",
  "tests/codex-mobile-at-loop-status-service.test.js",
  "tests/task-card-dispatch-idempotency-service.test.js",
  "tests/worker-lane-scheduler-service.test.js",
  "tests/return-watchdog-service.test.js",
  "tests/source-return-integration-watchdog-service.test.js",
  "tests/autonomous-delivery-api-routes.test.js",
  "tests/autonomous-delivery-task-card-triage-doc.test.js",
  "tests/worker-handoff-lifecycle-check.test.js",
  "tests/ai-ops-control-plane-cli.test.js",
  "tests/ai-ops-diagnostic-remediation-service.test.js",
  "tests/ai-ops-diagnostic-remediation-workflow-service.test.js",
  "tests/task-card-dispatch-result-service.test.js",
  "tests/home-ai-runtime-slo-service.test.js",
  "tests/owner-3a-quality-evidence-service.test.js",
  "tests/owner-3a-quality-program-service.test.js",
  "tests/owner-system-console-service.test.js",
  "tests/system-resource-status-service.test.js",
  "tests/owner-system-console-api-routes.test.js",
  "tests/owner-system-console-ui.test.js",
  "tests/self-check-diagnostic-submit-smoke-service.test.js",
  "tests/self-check-diagnostic-submit-smoke-script.test.js",
  "tests/plugin-conversation-action-bridge-service.test.js",
  "tests/plugin-conversation-action-api-routes.test.js",
  "tests/codex-thread-task-card-service.test.js",
  "tests/fallback-governance-check.test.js",
  "tests/playwright-visual-smoke-harness.test.js",
  "tests/authenticated-navigation-flow-smoke-harness.test.js",
  "tests/api-route-registry.test.js",
  "tests/gateway-runtime-composition-service.test.js",
  "tests/gateway-runtime-child-service-registry-service.test.js",
  "tests/gateway-runtime-subservice-options-service.test.js",
  "tests/gateway-run-request-builder-service.test.js",
  "tests/gateway-run-start-assistant-options-service.test.js",
  "tests/gateway-run-start-child-service-registry-service.test.js",
  "tests/gateway-run-start-event-service.test.js",
  "tests/gateway-run-start-execution-phase-service.test.js",
  "tests/gateway-run-start-permission-service.test.js",
  "tests/gateway-run-start-plugin-probe-service.test.js",
  "tests/gateway-run-start-preparation-service.test.js",
  "tests/gateway-run-start-stream-handoff-service.test.js",
  "tests/gateway-run-start-stream-options-service.test.js",
  "tests/gateway-run-start-state-service.test.js",
  "tests/gateway-run-start-target-phase-service.test.js",
  "tests/gateway-run-start-target-service.test.js",
  "tests/gateway-run-start-toolset-preflight-service.test.js",
  "tests/gateway-run-start-toolset-selection-service.test.js",
  "tests/gateway-run-start-wardrobe-gate-service.test.js",
  "tests/gateway-run-start-service.test.js",
  "tests/gateway-run-queue-service.test.js",
  "tests/gateway-run-queue-projection-service.test.js",
  "tests/gateway-run-completion-service.test.js",
  "tests/gateway-run-delta-event-service.test.js",
  "tests/gateway-run-output-event-service.test.js",
  "tests/gateway-run-response-created-service.test.js",
  "tests/gateway-run-streaming-save-service.test.js",
  "tests/gateway-run-event-service.test.js",
  "tests/gateway-run-evidence-service.test.js",
  "tests/gateway-run-toolset-escalation-service.test.js",
  "tests/gateway-run-toolset-escalation-retry-service.test.js",
  "tests/gateway-run-quota-failover-retry-service.test.js",
  "tests/gateway-run-terminal-state-service.test.js",
  "tests/openai-codex-shared-auth-pool-service.test.js",
  "tests/openai-codex-quota-failover-runtime-service.test.js",
  "tests/homeai-openai-codex-auth-pool-script.test.js",
  "tests/gateway-run-stream-completion-service.test.js",
  "tests/gateway-run-stream-close-recovery-service.test.js",
  "tests/gateway-run-stream-event-service.test.js",
  "tests/gateway-run-stream-failure-service.test.js",
  "tests/gateway-run-stream-first-event-service.test.js",
  "tests/gateway-run-stream-liveness-service.test.js",
  "tests/gateway-run-stream-liveness-timer-service.test.js",
  "tests/gateway-run-stream-registry-service.test.js",
  "tests/gateway-run-stream-state-service.test.js",
  "tests/gateway-run-stream-stop-service.test.js",
  "tests/gateway-worker-runtime-settings-service.test.js",
  "tests/runtime-config-provider.test.js",
  "tests/runtime-config-effective-service.test.js",
  "tests/runtime-config-gateway-worker-service.test.js",
  "tests/runtime-config-worker-policy-contract-service.test.js",
  "tests/runtime-config-key-service.test.js",
  "tests/runtime-config-model-service.test.js",
  "tests/runtime-config-public-projection-service.test.js",
  "tests/runtime-config-save-service.test.js",
  "tests/runtime-config-api-routes.test.js",
  "tests/mobile-runtime-gateway-concurrency-service.test.js",
  "tests/mobile-runtime-gateway-provider-service.test.js",
  "tests/mobile-runtime-gateway-status-service.test.js",
  "tests/mobile-runtime-gateway-facade-service.test.js",
  "tests/web-push-automation-projection-service.test.js",
  "tests/web-push-delivery-normalization-service.test.js",
  "tests/web-push-send-service.test.js",
  "tests/web-push-vapid-service.test.js",
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
  "Plugin host, plugin topics, lazy plugin MCP activation, plugin capability closure, and plugin-owned deterministic message actions",
  "Product plugin provisioning and workspace-local MCP bindings",
  "Fallback governance, root-cause classification, and mitigation/closure registry",
  "Autonomous Delivery Loop, intent intake, user-decision gates, case-ledger idempotency, coordinator ledger, main-thread routing preflight, routing-decision gate, central deploy governance, source return follow-up actions, Worker/deploy lane scheduling, Worker handoff delta lifecycle, return-card Watchdog, source return-receipt integration Watchdog, return-driven continuation decisions, Owner manual start, task-card dispatch, and closure coordination",
  "Loop Engineering",
  "Codex Mobile Loop runtime",
  "AI Operations Control Plane, context packs, lane allocation, required checks, root-cause governance, evidence ledger, incident cassettes, diagnostic intake, plugin conversation repair requests, Runtime SLO coverage, self-check submit closure smoke, and Owner-gated remediation",
  "Static PWA shell, navigation, cache, visual stability, and installed-app metadata",
  "Chat, threads, group chat, and context assembly",
  "Action Inbox, Automation, Web Push, Owner-gated plugin conversation approvals, and delivery routing",
  "Directory, file preview, artifacts, and shared roots",
  "Growth learning, mastery, card workflow, and rewards",
  "Runtime SQLite, persistence, backup, and deployment",
  "ChatGPT Pro, Grok, and provider-specific bridges",
];

for (const surface of requiredSurfaces) {
  assertDocContains(mapText, surface);
}

const requiredRuntimeBoundaryReferences = [
  "Run Pipeline Boundary",
  "Message Projection Boundary",
  "Plugin Action Bridge Boundary",
  "Fallback Registry Boundary",
  "home-ai-runtime-boundary-contract",
];

for (const reference of requiredRuntimeBoundaryReferences) {
  assertDocContains(mapText, reference);
}

const requiredPluginCapabilityClosureReferences = [
  "plugin-capability-closure-contract",
  "scripts/plugin-capability-closure-smoke.js",
  "tests/plugin-capability-closure-smoke.test.js",
  "scripts/mcp-tool-upgrade-closure-smoke.js",
];

for (const reference of requiredPluginCapabilityClosureReferences) {
  assertDocContains(mapText, reference);
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
