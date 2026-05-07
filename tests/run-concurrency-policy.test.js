"use strict";

const assert = require("node:assert/strict");
const {
  activeRunRecords,
  createRunConcurrencyPolicy,
  isActiveRunMessage,
} = require("../adapters/run-concurrency-policy");

function sampleThreads() {
  return [
    {
      id: "thread-owner",
      workspaceId: "owner",
      messages: [
        { id: "m1", role: "assistant", status: "done", runId: "done" },
        { id: "m2", role: "assistant", status: "running", runId: "run_owner", actorWorkspaceId: "owner", gatewayName: "worker1" },
      ],
    },
    {
      id: "thread-wuping",
      workspaceId: "weixin_wuping",
      messages: [
        { id: "m3", role: "assistant", status: "running", runId: "run_wuping", gatewayProfile: "worker2" },
      ],
    },
  ];
}

function testActiveRunDetection() {
  assert.equal(isActiveRunMessage({ role: "assistant", status: "running", runId: "r" }), true);
  assert.equal(isActiveRunMessage({ role: "assistant", status: "queued", runId: "" }), false);
  assert.equal(isActiveRunMessage({ role: "user", status: "running", runId: "r" }), false);
}

function testSnapshotCountsByWorkspace() {
  const policy = createRunConcurrencyPolicy({ maxGlobal: 4, maxPerWorkspace: 2 });
  const snapshot = policy.snapshot(sampleThreads());
  assert.equal(snapshot.maxGlobal, 4);
  assert.equal(snapshot.maxPerWorkspace, 2);
  assert.equal(snapshot.activeGlobal, 2);
  assert.equal(snapshot.activeByWorkspace.owner, 1);
  assert.equal(snapshot.activeByWorkspace.weixin_wuping, 1);

  const records = activeRunRecords(sampleThreads());
  assert.deepEqual(records.map((record) => record.gatewayName || record.gatewayProfile), ["worker1", "worker2"]);
}

function testLimitErrors() {
  const globalPolicy = createRunConcurrencyPolicy({ maxGlobal: 2, maxPerWorkspace: 0 });
  assert.equal(globalPolicy.limitError(sampleThreads(), "owner").code, "global_run_concurrency_limit");

  const workspacePolicy = createRunConcurrencyPolicy({ maxGlobal: 0, maxPerWorkspace: 1 });
  assert.equal(workspacePolicy.limitError(sampleThreads(), "owner").code, "workspace_run_concurrency_limit");
  assert.equal(workspacePolicy.limitError(sampleThreads(), "weixin_xiaonan"), null);
}

testActiveRunDetection();
testSnapshotCountsByWorkspace();
testLimitErrors();
console.log("run-concurrency-policy tests passed");
