"use strict";

const assert = require("node:assert/strict");
const {
  msBucket,
  observationsFromGatewayCapabilityAvailability,
  observationsFromPluginProxyLatency,
  observationsFromUiRuntimeHealth,
} = require("../adapters/self-improving-runtime-health-observation-service");

function testMsBucketIsBounded() {
  assert.equal(msBucket(120), "lt_250ms");
  assert.equal(msBucket(700), "250_999ms");
  assert.equal(msBucket(1500), "1_2s");
  assert.equal(msBucket(3200), "2_5s");
  assert.equal(msBucket(9000), "5s_plus");
  assert.equal(msBucket("bad"), "unknown");
}

function testProxyLatencyGapObservation() {
  const observations = observationsFromPluginProxyLatency({
    pluginId: "codex-mobile-web",
    routeKind: "thread-detail",
    samples: [{
      clientElapsedMs: 5200,
      upstreamMs: 120,
    }],
  });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].signalId, "plugin_proxy_latency");
  assert.equal(observations[0].status, "failed");
  assert.equal(observations[0].errorCode, "plugin_proxy_latency_gap_detected");
  assert.equal(observations[0].metadata.pluginId, "codex-mobile-web");
  assert.equal(observations[0].metadata.durationBucket, "5s_plus");
  assert.equal(observations[0].metadata.upstreamMsBucket, "lt_250ms");
  assert.equal(observations[0].metadata.gapMsBucket, "5s_plus");
}

function testGatewayCapabilityMissingToolObservation() {
  const observations = observationsFromGatewayCapabilityAvailability({
    workspaceId: "liyushuang",
    profile: "low_gateway",
    requiredTools: ["pdf_create", "pptx_create", "office_extract_text"],
    missingTools: ["pptx_create"],
  });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].signalId, "gateway_document_tool_capability");
  assert.equal(observations[0].status, "failed");
  assert.equal(observations[0].errorCode, "gateway_document_tools_missing");
  assert.equal(observations[0].metadata.toolName, "pptx_create");
  assert.equal(observations[0].metadata.missingToolCount, 1);
  assert.equal(observations[0].metadata.requiredToolCount, 3);
}

function testUiRuntimeHealthProducesMultipleBoundedObservations() {
  const observations = observationsFromUiRuntimeHealth({
    pluginId: "codex-mobile-web",
    composer: {
      threadId: "thread-private-id",
      messageId: "assistant-private-id",
      runId: "run-private-id",
      terminalReceiptMissingCount: 1,
      userScrollProtected: true,
    },
    mediaPreview: {
      mediaKind: "generated_png",
      sourceKind: "protected_api_route",
      nativeBridgeMode: "none",
      imagePreviewFailedCount: 1,
      recoveryActionAvailable: true,
    },
    nativeBridge: {
      platform: "android",
      appVersion: "0.4.28",
      capability: "outboundShare",
      nativeBridgeUnavailableCount: 1,
    },
    pluginActions: {
      pluginId: "wardrobe",
      actionKind: "wardrobeOutfitWearIntent",
      pluginActionMetadataMissingCount: 1,
    },
  });
  assert.deepEqual(observations.map((item) => item.signalId), [
    "composer_runtime_feedback",
    "media_preview_health",
    "native_bridge_capability",
    "plugin_action_metadata_health",
  ]);
  assert.equal(observations.every((item) => item.status === "failed"), true);
  assert.equal(observations[0].errorCode, "composer_terminal_receipt_missing");
  assert.equal(observations[1].errorCode, "generated_image_preview_failed");
  assert.equal(observations[2].errorCode, "native_bridge_unavailable");
  assert.equal(observations[3].errorCode, "plugin_action_metadata_missing");
}

function testUiRuntimeHealthOkSectionsStayOk() {
  const observations = observationsFromUiRuntimeHealth({
    composer: { ok: true },
    mediaPreview: { ok: true },
    nativeBridge: { ok: true },
    pluginActions: { ok: true, pluginId: "wardrobe", actionKind: "wardrobeOutfitWearIntent" },
  });
  assert.equal(observations.length, 4);
  assert.equal(observations.every((item) => item.status === "ok"), true);
}

testMsBucketIsBounded();
testProxyLatencyGapObservation();
testGatewayCapabilityMissingToolObservation();
testUiRuntimeHealthProducesMultipleBoundedObservations();
testUiRuntimeHealthOkSectionsStayOk();

console.log("Self-improving runtime health observation service tests passed");
