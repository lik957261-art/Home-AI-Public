"use strict";

const assert = require("node:assert/strict");
const {
  MODEL_VERSION,
  buildReferencePluginConversationOutput,
  buildReferenceWardrobeIntent,
  runManifestRouteActionClosure,
  runPluginActionMetadataClosure,
  runPluginConversationRepairRequestClosure,
  runWardrobeReferenceClosure,
} = require("../adapters/plugin-action-metadata-closure-service");

async function testWardrobeReferenceClosurePassesAllStages() {
  const result = await runWardrobeReferenceClosure({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, MODEL_VERSION);
  assert.equal(result.reference.pluginId, "wardrobe");
  assert.equal(result.reference.actionKind, "wardrobeOutfitWearIntent");
  assert.equal(result.failedStageCount, 0);
  assert.equal(result.actionFamilyCount, 1);
  assert.equal(result.deterministicActionGeneralization.status, "partial");
  assert.deepEqual(result.stages.map((stage) => stage.id), [
    "gateway_output_metadata_attachment",
    "message_metadata_persistence",
    "thread_view_plugin_action_projection",
    "plugin_action_projection_diagnostics",
    "action_bridge_execution_probe",
    "action_state_readback_probe",
    "no_model_run_action_boundary",
  ]);
  const projection = result.stages.find((stage) => stage.id === "thread_view_plugin_action_projection");
  assert.equal(projection.evidence.status, "ready");
  assert.equal(projection.evidence.diagnosticCode, "");
  const diagnostics = result.stages.find((stage) => stage.id === "plugin_action_projection_diagnostics");
  assert.equal(diagnostics.evidence.missingCode, "intent_metadata_missing");
  assert.equal(diagnostics.evidence.filteredCode, "renderer_filtered");
  assert.equal(diagnostics.evidence.filteredReason, "workspace_mismatch");
  const execution = result.stages.find((stage) => stage.id === "action_bridge_execution_probe");
  assert.equal(execution.evidence.firstStatus, "needs_confirmation");
  assert.equal(execution.evidence.secondStatus, "stored");
  assert.deepEqual(execution.evidence.modes, ["create_only", "replace"]);
  assert.equal(execution.evidence.confirmReplaceCalls, 1);
  const readback = result.stages.find((stage) => stage.id === "action_state_readback_probe");
  assert.equal(readback.evidence.finalStatus, "stored");
  assert.equal(readback.evidence.readbackVerified, true);
  assert.equal(Boolean(readback.evidence.outfitIdHash), true);
  assert.equal(readback.evidence.persistedStatus, "stored");
  assert.equal(readback.evidence.projectedStatus, "stored");
  assert.equal(readback.evidence.projectedReadbackVerified, true);
  assert.equal(readback.evidence.messageUpdateBroadcastCount > 0, true);
  assert.equal(result.privacy, "metadata_only");
}

async function testPluginConversationRepairRequestClosurePasses() {
  const result = await runPluginConversationRepairRequestClosure({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.pluginId, "home-ai");
  assert.equal(result.actionKind, "pluginConversationRepairRequest");
  assert.equal(result.actionClass, "owner_task_card_action");
  assert.deepEqual(result.stages.map((stage) => stage.id), [
    "gateway_output_action_comment_parse",
    "action_inbox_projection",
    "owner_push_dedupe_boundary",
    "task_card_dispatch_bridge_probe",
    "task_card_dispatch_idempotency_probe",
    "no_model_run_action_boundary",
  ]);
  const dedupe = result.stages.find((stage) => stage.id === "owner_push_dedupe_boundary");
  assert.equal(dedupe.evidence.firstNotified, true);
  assert.equal(dedupe.evidence.secondNotified, false);
  assert.equal(dedupe.evidence.pushCount, 1);
  const dispatch = result.stages.find((stage) => stage.id === "task_card_dispatch_bridge_probe");
  assert.equal(dispatch.evidence.dispatched, true);
  assert.equal(dispatch.evidence.taskCardCount, 1);
  const duplicateDispatch = result.stages.find((stage) => stage.id === "task_card_dispatch_idempotency_probe");
  assert.equal(duplicateDispatch.evidence.alreadyDispatched, true);
  assert.equal(duplicateDispatch.evidence.taskCardCount, 1);
}

function testManifestRouteActionClosurePasses() {
  const result = runManifestRouteActionClosure({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.pluginId, "finance");
  assert.equal(result.actionKind, "manifestPluginRouteAction");
  assert.equal(result.actionClass, "manifest_route_action");
  assert.deepEqual(result.stages.map((stage) => stage.id), [
    "host_manifest_action_normalization",
    "plugin_route_action_projection",
    "route_snapshot_readback",
    "no_model_run_action_boundary",
  ]);
  assert.equal(result.stages[0].evidence.pluginRoute, "record");
}

async function testAggregateClosureGeneralizesBeyondWardrobe() {
  const result = await runPluginActionMetadataClosure({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, MODEL_VERSION);
  assert.equal(result.actionFamilyCount, 3);
  assert.equal(result.generalizedActionFamilyCount, 2);
  assert.equal(result.actionClassCount, 3);
  assert.equal(result.deterministicActionGeneralization.status, "ok");
  assert.deepEqual(result.actionFamilies.map((family) => family.familyId), [
    "wardrobe_outfit_wear_intent",
    "plugin_conversation_repair_request",
    "finance_manifest_route_action",
  ]);
  assert.equal(result.failedStageCount, 0);
  assert.equal(result.privacy, "metadata_only");
}

function testReferenceIntentIsBoundedAndExecutable() {
  const intent = buildReferenceWardrobeIntent({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.equal(intent.type, "outfit_wear_intent");
  assert.equal(intent.plugin_id, "wardrobe");
  assert.equal(intent.workspace_id, "owner");
  assert.equal(intent.principal_id, "owner");
  assert.equal(intent.items.length, 2);
  assert.match(intent.idempotency_key, /^wardrobe:outfit_wear_intent:[a-f0-9]{12}$/);
  assert.equal(intent.action.mcp_tool, "wardrobe.execute_outfit_wear_intent");
}

function testReferencePluginConversationOutputIsMetadataOnly() {
  const output = buildReferencePluginConversationOutput({ nowIso: "2026-07-01T08:00:00.000Z" });
  assert.match(output, /homeai-plugin-conversation-action/);
  assert.match(output, /plugin-action-metadata-closure-smoke/);
  assert.equal(output.includes("secret"), false);
}

async function run() {
  await testWardrobeReferenceClosurePassesAllStages();
  await testPluginConversationRepairRequestClosurePasses();
  testManifestRouteActionClosurePasses();
  await testAggregateClosureGeneralizesBeyondWardrobe();
  testReferenceIntentIsBoundedAndExecutable();
  testReferencePluginConversationOutputIsMetadataOnly();
  console.log("plugin action metadata closure service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
