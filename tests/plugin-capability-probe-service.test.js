"use strict";

const assert = require("node:assert/strict");
const { createPluginCapabilityProbeService } = require("../adapters/plugin-capability-probe-service");

function createService() {
  let now = 1000;
  return createPluginCapabilityProbeService({
    dedupe: (values) => Array.from(new Set((values || []).filter(Boolean))),
    nowMs: () => {
      now += 5;
      return now;
    },
  });
}

async function testProbeActivatesWhenGatewayDeclaresToolset() {
  const service = createService();
  const result = await service.probePluginCapabilities({
    requests: [{ pluginId: "finance", toolset: "finance" }],
    gatewayTarget: {
      profile: "lowgw-finance",
      name: "finance worker",
      toolsets: ["web", "finance"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.probes[0].ok, true);
  assert.equal(result.probes[0].status, "activated");
  assert.equal(result.probes[0].diagnostic, "gateway_worker_declares_toolset");
  assert.equal(result.probes[0].evidence, "gateway_worker_manifest_toolsets");
  assert.equal(result.probes[0].gatewayProfile, "lowgw-finance");
}

async function testProbeMarksUnavailableWhenGatewayLacksToolset() {
  const service = createService();
  const result = await service.probePluginCapabilities({
    requests: [{ pluginId: "finance", toolset: "finance" }],
    gatewayTarget: {
      profile: "lowgw-basic",
      toolsets: ["web", "search"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.probes[0].ok, false);
  assert.equal(result.probes[0].status, "unavailable");
  assert.equal(result.probes[0].diagnostic, "gateway_worker_missing_toolset");
}

async function testProbeFailsClosedWhenGatewayMetadataIsMissing() {
  const service = createService();
  const result = await service.probePluginCapabilities({
    requests: [{ pluginId: "note", toolset: "note" }],
    gatewayTarget: { profile: "fallback" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.probes[0].diagnostic, "gateway_worker_toolsets_unknown");
  assert.equal(result.probes[0].evidence, "gateway_worker_metadata_missing");
}

(async () => {
  await testProbeActivatesWhenGatewayDeclaresToolset();
  await testProbeMarksUnavailableWhenGatewayLacksToolset();
  await testProbeFailsClosedWhenGatewayMetadataIsMissing();
  console.log("plugin capability probe service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
