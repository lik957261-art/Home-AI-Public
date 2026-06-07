"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeGatewayConcurrencyService,
} = require("../adapters/mobile-runtime-gateway-concurrency-service");

function makeService() {
  const state = {
    threads: [
      { workspaceId: "owner", activeRuns: [{ runId: "run_1" }] },
      { workspaceId: "owner", activeRuns: [{ runId: "run_2" }, { runId: "run_3" }] },
    ],
  };
  const service = createMobileRuntimeGatewayConcurrencyService({
    runConcurrencyPolicy: {
      snapshot: (threads) => ({ active: threads.reduce((sum, thread) => sum + (thread.activeRuns || []).length, 0) }),
      limitError: (threads, workspaceId) => workspaceId === "blocked"
        ? { code: "run_concurrency_limit", message: `Blocked at ${threads.length}`, status: 429, workspaceId }
        : null,
    },
    state: () => state,
  });
  return { service, state };
}

function testRunConcurrencySnapshotUsesCurrentThreads() {
  const { service, state } = makeService();

  assert.deepEqual(service.runConcurrencySnapshot(), { active: 3 });

  state.threads.push({ workspaceId: "wuping", activeRuns: [{ runId: "run_4" }] });
  assert.deepEqual(service.runConcurrencySnapshot(), { active: 4 });
}

function testRunConcurrencyErrorDelegatesToPolicy() {
  const { service } = makeService();

  assert.equal(service.runConcurrencyError("owner"), null);
  assert.deepEqual(service.runConcurrencyError("blocked"), {
    code: "run_concurrency_limit",
    message: "Blocked at 2",
    status: 429,
    workspaceId: "blocked",
  });
}

function testAssertRunConcurrencyCapacityThrowsBoundedError() {
  const { service } = makeService();

  service.assertRunConcurrencyCapacity("owner");
  assert.throws(() => service.assertRunConcurrencyCapacity("blocked"), (error) => {
    assert.equal(error.message, "Blocked at 2");
    assert.equal(error.status, 429);
    assert.equal(error.code, "run_concurrency_limit");
    assert.deepEqual(error.details, {
      code: "run_concurrency_limit",
      message: "Blocked at 2",
      status: 429,
      workspaceId: "blocked",
    });
    return true;
  });
}

function testMissingPolicyFailsClosed() {
  assert.throws(() => createMobileRuntimeGatewayConcurrencyService({}), /requires runConcurrencyPolicy/);
}

testRunConcurrencySnapshotUsesCurrentThreads();
testRunConcurrencyErrorDelegatesToPolicy();
testAssertRunConcurrencyCapacityThrowsBoundedError();
testMissingPolicyFailsClosed();

console.log("mobile runtime gateway concurrency service tests passed");
