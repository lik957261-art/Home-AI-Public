"use strict";

const assert = require("node:assert/strict");
const {
  createRuntimeStateStoreService,
  shouldRefuseMessageCountOverwrite,
  decideBackupPruning,
  decideMessageCountOverwrite,
  mergeRuntimeStateWithDefaults,
  safeCloneJson,
} = require("../adapters/runtime-state-store-service");

function testSafeCloneJson() {
  const source = { nested: { value: 1 }, list: [{ id: "a" }] };
  const cloned = safeCloneJson(source);
  cloned.nested.value = 2;
  cloned.list[0].id = "b";

  assert.equal(source.nested.value, 1);
  assert.equal(source.list[0].id, "a");

  const cyclic = {};
  cyclic.self = cyclic;
  assert.deepEqual(safeCloneJson(cyclic, { fallback: true }), { fallback: true });
  assert.equal(safeCloneJson(undefined), undefined);
}

function testRuntimeStateDefaultMergeAndNormalization() {
  const input = {
    schemaVersion: "2",
    workspaces: null,
    accessKeys: { owner: { metadataOnly: true } },
    threads: [
      {
        id: "thread-a",
        workspaceId: "owner",
        messageCount: 99,
        messages: [{ id: "m1" }, { id: "m2" }],
      },
      {
        id: "thread-b",
        messages: "invalid",
      },
    ],
    pushSubscriptions: { invalid: "shape" },
    kanbanCaseShares: { "owner::case-a": { caseId: "case-a" } },
  };

  const normalized = mergeRuntimeStateWithDefaults(input);
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual(normalized.workspaces, {});
  assert.deepEqual(normalized.pushSubscriptions, []);
  assert.equal(normalized.threads[0].messageCount, 2);
  assert.deepEqual(normalized.threads[1].messages, []);
  assert.equal(normalized.threads[1].messageCount, 0);
  assert.deepEqual(normalized.accessKeys, { owner: { metadataOnly: true } });
  assert.deepEqual(normalized.kanbanCaseShares, { "owner::case-a": { caseId: "case-a" } });

  normalized.accessKeys.owner.metadataOnly = false;
  assert.equal(input.accessKeys.owner.metadataOnly, true);
}

function testMessageCountOverwriteGuard() {
  assert.deepEqual(
    shouldRefuseMessageCountOverwrite(
      { threads: [{ messages: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}] }] },
      { threads: [{ messages: [{}, {}, {}] }] },
      { minExistingMessages: 5, minDrop: 6, dropRatio: 0.4 },
    ),
    { refuse: true, reason: "stale_decrease_guard", existingCount: 10, nextCount: 3, dropped: 7, threshold: 6 },
  );
  assert.deepEqual(
    shouldRefuseMessageCountOverwrite(10, 6, { minExistingMessages: 5, minDrop: 6, dropRatio: 0.4 }),
    { refuse: false, reason: "within_drop_tolerance", existingCount: 10, nextCount: 6, dropped: 4, threshold: 6 },
  );
  assert.equal(
    shouldRefuseMessageCountOverwrite(10, 0, { allowMessageDrop: true, minExistingMessages: 5, minDrop: 6, dropRatio: 0.4 }).refuse,
    false,
  );
  assert.deepEqual(
    decideMessageCountOverwrite({ messages: [{}, {}] }, { messages: [{}, {}, {}] }),
    { overwrite: true, reason: "increase", existingCount: 2, nextCount: 3 },
  );
  assert.deepEqual(
    decideMessageCountOverwrite(3, 2),
    { overwrite: false, reason: "stale_decrease_guard", existingCount: 3, nextCount: 2 },
  );
  assert.deepEqual(
    decideMessageCountOverwrite(3, 2, { allowDecrease: true }),
    { overwrite: true, reason: "allowed_decrease", existingCount: 3, nextCount: 2 },
  );
  assert.deepEqual(
    decideMessageCountOverwrite(2, { messages: [{}, {}] }),
    { overwrite: false, reason: "unchanged", existingCount: 2, nextCount: 2 },
  );
}

function testBackupPruningDecisionOnly() {
  const decision = decideBackupPruning([
    { id: "old", createdAt: "2026-05-14T00:00:00.000Z" },
    { id: "new", createdAt: "2026-05-15T00:00:00.000Z" },
    { id: "middle", createdAt: "2026-05-14T12:00:00.000Z" },
  ], { maxBackups: 2 });

  assert.deepEqual(decision.keep.map((item) => item.id), ["new", "middle"]);
  assert.deepEqual(decision.prune.map((item) => item.id), ["old"]);
  assert.equal(decision.maxBackups, 2);

  decision.prune[0].id = "changed";
  assert.deepEqual(decideBackupPruning([{ id: "same", createdAtMs: 1 }], { maxBackups: 1 }).keep, [
    { id: "same", createdAtMs: 1 },
  ]);
}

function testServiceFactoryUsesInjectedDefaults() {
  const service = createRuntimeStateStoreService({
    defaults: {
      schemaVersion: 3,
      threads: [{ id: "default-thread", messages: [{}] }],
    },
  });

  const normalized = service.mergeRuntimeStateWithDefaults({});
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.threads[0].id, "default-thread");
  assert.equal(normalized.threads[0].messageCount, 1);

  service.defaults.threads[0].id = "mutated-copy";
  assert.equal(service.mergeRuntimeStateWithDefaults({}).threads[0].id, "default-thread");
}

function run() {
  testSafeCloneJson();
  testRuntimeStateDefaultMergeAndNormalization();
  testMessageCountOverwriteGuard();
  testBackupPruningDecisionOnly();
  testServiceFactoryUsesInjectedDefaults();
  console.log("runtime state store service tests passed");
}

run();
