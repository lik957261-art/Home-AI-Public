"use strict";

const assert = require("node:assert/strict");
const { createGatewayRuntimeCompositionService } = require("../adapters/gateway-runtime-composition-service");

function testReplaceThreadActiveRunReplacesGatewayAssignment() {
  const calls = [];
  const runtime = createGatewayRuntimeCompositionService({
    replaceGatewayRunTarget: (oldRunId, newRunId) => calls.push({ oldRunId, newRunId }),
  });
  const thread = {
    id: "thread_1",
    status: "running",
    activeRunId: "web_public_run",
    activeRunIds: ["web_public_run"],
  };

  runtime.replaceThreadActiveRun(thread, "web_public_run", "resp_real_run");

  assert.deepEqual(thread.activeRunIds, ["resp_real_run"]);
  assert.equal(thread.activeRunId, "resp_real_run");
  assert.deepEqual(calls, [{ oldRunId: "web_public_run", newRunId: "resp_real_run" }]);
}

function testRemoveThreadActiveRunReleasesGatewayAssignment() {
  const calls = [];
  const runtime = createGatewayRuntimeCompositionService({
    releaseGatewayRunTarget: (runId, idleStatus) => calls.push({ runId, idleStatus }),
  });
  const thread = {
    id: "thread_1",
    status: "running",
    activeRunId: "resp_real_run",
    activeRunIds: ["resp_real_run"],
  };

  runtime.removeThreadActiveRun(thread, "resp_real_run", "idle");

  assert.deepEqual(thread.activeRunIds, []);
  assert.equal(thread.activeRunId, null);
  assert.equal(thread.status, "idle");
  assert.deepEqual(calls, [{ runId: "resp_real_run", idleStatus: "idle" }]);
}

testReplaceThreadActiveRunReplacesGatewayAssignment();
testRemoveThreadActiveRunReleasesGatewayAssignment();
console.log("gateway runtime composition service tests passed");
