"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} should include ${expected}`);
}

const contractPath = "docs/PLATFORM_CONTRACTS/home-ai-runtime-boundary-contract.md";
const contract = read(contractPath);
const docsIndex = read("docs/DOCS_INDEX.md");
const architectureBoundary = read("docs/ARCHITECTURE_BOUNDARY.md");
const map = read("docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md");
const testMatrix = read("docs/TEST_MATRIX.md");

for (const boundary of [
  "Run Pipeline Boundary",
  "Message Projection Boundary",
  "Plugin Action Bridge Boundary",
  "Fallback Registry Boundary",
]) {
  assertIncludes(contract, `## ${boundary}`, contractPath);
  assertIncludes(architectureBoundary, boundary, "architecture boundary");
  assertIncludes(map, boundary, "architecture-code-test-harness map");
  assertIncludes(testMatrix, boundary, "test matrix");
}

for (const doc of [docsIndex, architectureBoundary, map]) {
  assertIncludes(doc, contractPath, "runtime boundary doc linkage");
}

for (const requiredCheck of [
  "node tests/home-ai-runtime-boundary-contract.test.js",
  "node tests/architecture-code-test-harness-map.test.js",
  "node tests/architecture-refactor-boundary.test.js",
  "node tests/gateway-run-output-event-service.test.js",
  "node tests/gateway-run-event-service.test.js",
  "node tests/thread-view-service.test.js",
  "node tests/wardrobe-outfit-wear-intent-action-service.test.js",
  "node tests/plugin-action-metadata-closure-service.test.js",
  "node tests/plugin-action-metadata-closure-smoke.test.js",
  "node tests/plugin-conversation-action-api-routes.test.js",
  "node scripts/plugin-action-metadata-closure-smoke.js --json",
  "node scripts/fallback-governance-check.js --json",
]) {
  assertIncludes(contract, requiredCheck, contractPath);
  assertIncludes(testMatrix, requiredCheck, "test matrix");
}

const outputEventService = read("adapters/gateway-run-output-event-service.js");
assertIncludes(
  outputEventService,
  "extractPreparedIntentFromOutputItemEvent",
  "Gateway run output event service"
);
assertIncludes(
  outputEventService,
  "run.wardrobe_outfit_wear_intent_metadata_attached",
  "Gateway run output event service"
);

const threadViewService = read("adapters/thread-view-service.js");
assertIncludes(threadViewService, "publicPluginActionDiagnostics", "thread view service");
assertIncludes(threadViewService, "pluginActionDiagnostics", "thread view service");

const wardrobeActionService = read("adapters/wardrobe-outfit-wear-intent-action-service.js");
for (const marker of [
  "extractPreparedIntentFromOutputItemEvent",
  "publicPluginActionDiagnostics",
  "createWardrobeOutfitWearIntentActionService",
  "wardrobe.execute_outfit_wear_intent",
  "mcp_wardrobe_wardrobe_execute_outfit_wear_intent",
  "intent_metadata_missing",
]) {
  assertIncludes(wardrobeActionService, marker, "Wardrobe action service");
}

const actionRoutes = read("server-routes/plugin-conversation-action-api-routes.js");
assertIncludes(actionRoutes, "action_bridge_unavailable", "plugin action API routes");

const actionMetadataClosureService = read("adapters/plugin-action-metadata-closure-service.js");
for (const marker of [
  "runWardrobeReferenceClosure",
  "gateway_output_metadata_attachment",
  "thread_view_plugin_action_projection",
  "action_bridge_execution_probe",
  "action_state_readback_probe",
  "no_model_run_action_boundary",
]) {
  assertIncludes(actionMetadataClosureService, marker, "plugin action metadata closure service");
}

const actionMetadataClosureScript = read("scripts/plugin-action-metadata-closure-smoke.js");
assertIncludes(actionMetadataClosureScript, "runWardrobeReferenceClosure", "plugin action metadata closure smoke");
assertIncludes(actionMetadataClosureScript, "wardrobe-outfit-wear-intent", "plugin action metadata closure smoke");

const fallbackRegistry = read("docs/IMPLEMENTATION_NOTES/fallback-registry.md");
assertIncludes(
  fallbackRegistry,
  "codex_mobile_workspace_read_compat_20260630",
  "fallback registry"
);
assertIncludes(fallbackRegistry, "mitigation_only", "fallback registry");

for (const forbiddenPhrase of [
  "must not parse raw provider payloads",
  "must not execute actions",
  "must not enqueue a model run",
  "Mitigations are not closure",
]) {
  assertIncludes(contract, forbiddenPhrase, contractPath);
}

console.log("Home AI runtime boundary contract guard passed");
