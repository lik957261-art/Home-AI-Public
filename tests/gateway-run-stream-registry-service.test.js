"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStreamRegistryService,
  gatewayTargetFromActiveStream,
} = require("../adapters/gateway-run-stream-registry-service");

function createController() {
  return {
    aborted: false,
    abortCount: 0,
    abort() {
      this.abortCount += 1;
      this.aborted = true;
    },
  };
}

function baseStream(controller = createController()) {
  return {
    controller,
    gatewayUrl: "http://worker.gateway",
    gatewayApiKey: "worker-key",
    gatewayName: "lowgw1",
    gatewayProfile: "owner-low",
    gatewaySource: "worker_pool",
    failureReason: "",
  };
}

function testGatewayTargetProjection() {
  assert.equal(gatewayTargetFromActiveStream({}), null);
  assert.deepEqual(gatewayTargetFromActiveStream(baseStream()), {
    apiBase: "http://worker.gateway",
    apiKey: "worker-key",
    name: "lowgw1",
    profile: "owner-low",
    pooled: true,
    source: "worker_pool",
  });
}

function testActiveStreamAliasAndCleanup() {
  const activeStreams = new Map();
  const stream = baseStream();
  const service = createGatewayRunStreamRegistryService({ activeStreams });

  assert.equal(service.registerActiveStream(" public_run ", stream), stream);
  assert.equal(service.registerRunAlias("public_run", "real_run"), stream);
  assert.equal(service.activeStreamForRun("public_run"), stream);
  assert.equal(service.activeStreamForRun("real_run"), stream);
  assert.equal(stream.realRunId, "real_run");
  assert.equal(service.activeStreamCount(), 1);
  assert.equal(service.cleanupRunAliases("real_run"), 2);
  assert.equal(activeStreams.size, 0);
}

function testGatewayTargetFallbackUsesPool() {
  const calls = [];
  const service = createGatewayRunStreamRegistryService({
    gatewayUrlForRun: (runId) => `http://${runId}.gateway`,
    gatewayPool: {
      targetForGatewayUrl(gatewayUrl) {
        calls.push(gatewayUrl);
        return { apiBase: gatewayUrl, apiKey: "fallback-key", name: "fallback" };
      },
    },
  });

  assert.deepEqual(service.gatewayTargetForRun("detached"), {
    apiBase: "http://detached.gateway",
    apiKey: "fallback-key",
    name: "fallback",
  });
  assert.deepEqual(calls, ["http://detached.gateway"]);
}

function testAbortActiveStreamAsFailedIsIdempotent() {
  const controller = createController();
  const stream = baseStream(controller);
  const service = createGatewayRunStreamRegistryService();
  service.registerActiveStream("public_run", stream);

  assert.equal(service.abortActiveStreamAsFailed("public_run", "stale"), true);
  assert.equal(stream.failureReason, "stale");
  assert.equal(controller.aborted, true);
  assert.equal(controller.abortCount, 1);
  assert.equal(service.abortActiveStreamAsFailed("public_run", "again"), false);
  assert.equal(stream.failureReason, "stale");
  assert.equal(controller.abortCount, 1);
  assert.equal(service.abortActiveStreamAsFailed("missing", "stale"), false);
}

function testCleanupMissingRun() {
  const activeStreams = new Map([["orphan", null]]);
  const service = createGatewayRunStreamRegistryService({ activeStreams });

  assert.equal(service.cleanupRunAliases("orphan"), 1);
  assert.equal(service.cleanupRunAliases("missing"), 0);
}

testGatewayTargetProjection();
testActiveStreamAliasAndCleanup();
testGatewayTargetFallbackUsesPool();
testAbortActiveStreamAsFailedIsIdempotent();
testCleanupMissingRun();

console.log("gateway run stream registry service tests passed");
