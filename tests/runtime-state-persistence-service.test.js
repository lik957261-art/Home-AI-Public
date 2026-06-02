"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createRuntimeStatePersistenceService,
  safeStateBackupReason,
  stateBackupTimestamp,
  stateMessageCount,
  stateThreadCount,
} = require("../adapters/runtime-state-persistence-service");

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-runtime-state-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function baseState(extra = {}) {
  return Object.assign({
    schemaVersion: 1,
    threads: [],
    artifacts: [],
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    automationPushMarks: {},
  }, extra);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function backupNames(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir).filter((name) => /^state-auto-.*\.json$/i.test(name)).sort();
}

function makeService(dir, overrides = {}) {
  const statePath = path.join(dir, "state.json");
  const stateBackupDir = path.join(dir, "state-backups");
  const errors = [];
  const traces = [];
  const service = createRuntimeStatePersistenceService(Object.assign({
    statePath,
    dataDir: dir,
    stateBackupDir,
    pid: 12345,
    maxStateBackups: 20,
    stateBackupMinIntervalMs: 0,
    nowDate: () => new Date("2026-05-15T00:00:00.000Z"),
    defaultState: () => baseState(),
    normalizeState: (value) => baseState(value && typeof value === "object" ? value : {}),
    bootTrace: (message) => traces.push(message),
    logError: (message) => errors.push(message),
  }, overrides));
  return { service, statePath, stateBackupDir, errors, traces };
}

function messages(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `m${index + 1}`, role: "user", content: `message ${index + 1}` }));
}

function testHelpers() {
  assert.equal(stateMessageCount({ threads: [{ messages: messages(2) }, { messages: messages(3) }] }), 5);
  assert.equal(stateThreadCount({ threads: [{}, {}] }), 2);
  assert.equal(safeStateBackupReason("Refused: Message Drop!"), "refused-message-drop");
  assert.equal(stateBackupTimestamp(new Date("2026-05-15T01:02:03.456Z")), "20260515T010203Z");
}

function testMissingJsonWritesFreshState() {
  withTempDir((dir) => {
    const { service, statePath } = makeService(dir);
    const loaded = service.loadState();

    assert.deepEqual(loaded, baseState());
    assert.deepEqual(readJson(statePath), baseState());
  });
}

function testInvalidJsonBacksUpRawAndReplacesWithFreshState() {
  withTempDir((dir) => {
    const { service, statePath, stateBackupDir, errors } = makeService(dir);
    fs.writeFileSync(statePath, "{invalid", "utf8");

    const loaded = service.loadState();

    assert.deepEqual(loaded, baseState());
    assert.deepEqual(readJson(statePath), baseState());
    const names = backupNames(stateBackupDir);
    assert.equal(names.length, 1);
    assert.match(names[0], /parse-failed-unreadable\.json$/);
    assert.equal(fs.readFileSync(path.join(stateBackupDir, names[0]), "utf8"), "{invalid");
    assert.equal(errors.length, 1);
    assert.match(errors[0], /state parse failed/);
  });
}

function testJsonLoadNormalizesAndPersistsPushScopeChanges() {
  withTempDir((dir) => {
    const raw = baseState({
      pushSubscriptions: [{ endpoint: "https://push.invalid/a" }],
    });
    const { service, statePath, stateBackupDir } = makeService(dir, {
      normalizeState(value) {
        return baseState(Object.assign({}, value, {
          pushSubscriptions: (value.pushSubscriptions || []).map((item) => Object.assign({}, item, {
            principalIds: ["owner"],
            workspaceIds: ["owner"],
          })),
        }));
      },
      pushSubscriptionScopeSignature(items) {
        return JSON.stringify((items || []).map((item) => ({
          endpoint: item.endpoint,
          principalIds: item.principalIds || [],
          workspaceIds: item.workspaceIds || [],
        })));
      },
    });
    writeJson(statePath, raw);

    const loaded = service.loadState();

    assert.deepEqual(loaded.pushSubscriptions[0].principalIds, ["owner"]);
    assert.deepEqual(readJson(statePath).pushSubscriptions[0].workspaceIds, ["owner"]);
    assert.equal(backupNames(stateBackupDir).some((name) => name.includes("-startup-")), true);
  });
}

function testSqliteEmptyRuntimeImportsValidJsonSnapshot() {
  withTempDir((dir) => {
    const replacements = [];
    const sqlite = {
      runtimeStateCounts: () => ({ threads: 0, messages: 0, artifacts: 0, pushSubscriptions: 0, pushReceipts: 0, pushDeliveries: 0 }),
      replaceRuntimeState: (next) => replacements.push(next),
      exportRuntimeState: () => { throw new Error("export should not be called"); },
    };
    const source = baseState({ threads: [{ id: "thread-a", messages: messages(1) }] });
    const { service, statePath, stateBackupDir } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
      normalizeState: (value) => baseState(Object.assign({}, value, { normalized: true })),
    });
    writeJson(statePath, source);

    const loaded = service.loadState();

    assert.equal(loaded.normalized, true);
    assert.equal(replacements.length, 1);
    assert.equal(replacements[0].normalized, true);
    assert.equal(readJson(statePath).normalized, true);
    assert.equal(backupNames(stateBackupDir).some((name) => name.includes("sqlite-import-source")), true);
  });
}

function testSqliteEmptyRuntimeCreatesFreshSnapshotWhenJsonMissing() {
  withTempDir((dir) => {
    const replacements = [];
    const sqlite = {
      runtimeStateCounts: () => ({ threads: 0, messages: 0, artifacts: 0, pushSubscriptions: 0, pushReceipts: 0, pushDeliveries: 0 }),
      replaceRuntimeState: (next) => replacements.push(next),
      exportRuntimeState: () => { throw new Error("export should not be called"); },
    };
    const { service, statePath } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
    });

    const loaded = service.loadState();

    assert.deepEqual(loaded, baseState());
    assert.deepEqual(replacements, [baseState()]);
    assert.deepEqual(readJson(statePath), baseState());
  });
}

function testSqliteExistingRuntimeExportsAndSnapshots() {
  withTempDir((dir) => {
    const exported = baseState({ threads: [{ id: "thread-b", messages: messages(2) }] });
    const replacements = [];
    const sqlite = {
      runtimeStateCounts: () => ({ threads: 1, messages: 2, artifacts: 0, pushSubscriptions: 0, pushReceipts: 0, pushDeliveries: 0 }),
      replaceRuntimeState: (next) => replacements.push(next),
      exportRuntimeState: () => exported,
    };
    const { service, statePath } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
      normalizeState: (value) => baseState(Object.assign({}, value, { exportedNormalized: true })),
    });

    const loaded = service.loadState();

    assert.equal(loaded.exportedNormalized, true);
    assert.deepEqual(replacements, []);
    assert.equal(readJson(statePath).exportedNormalized, true);
  });
}

function testSaveRefusesLargeMessageDropAndKeepsExistingFile() {
  withTempDir((dir) => {
    const previous = baseState({ threads: [{ id: "thread-a", messages: messages(10) }] });
    const next = baseState({ threads: [{ id: "thread-a", messages: messages(3) }] });
    const { service, statePath, stateBackupDir } = makeService(dir);
    writeJson(statePath, previous);

    assert.throws(
      () => service.saveState(next, { reason: "unit-drop" }),
      /message count would drop from 10 to 3/,
    );
    assert.equal(stateMessageCount(readJson(statePath)), 10);
    assert.equal(backupNames(stateBackupDir).some((name) => name.includes("refused-unit-drop")), true);
  });
}

function testSaveCanAllowMessageDropAndWriteSqliteThenSnapshot() {
  withTempDir((dir) => {
    const previous = baseState({ threads: [{ id: "thread-a", messages: messages(10) }] });
    const next = baseState({ threads: [{ id: "thread-a", messages: messages(3) }] });
    const replacements = [];
    const sqlite = {
      replaceRuntimeState: (value) => replacements.push(value),
    };
    const { service, statePath } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
    });
    writeJson(statePath, previous);

    service.saveState(next, { reason: "allowed-drop", allowMessageDrop: true, forceBackup: true });

    assert.equal(replacements.length, 1);
    assert.equal(stateMessageCount(replacements[0]), 3);
    assert.equal(stateMessageCount(readJson(statePath)), 3);
  });
}

function testSaveDoesNotForceBackupForNormalMessageGrowth() {
  withTempDir((dir) => {
    let nowMs = Date.parse("2026-05-15T00:00:00.000Z");
    const previous = baseState({ threads: [{ id: "thread-a", messages: messages(1) }] });
    const next = baseState({ threads: [{ id: "thread-a", messages: messages(2) }] });
    const { service, statePath, stateBackupDir } = makeService(dir, {
      stateBackupMinIntervalMs: 60_000,
      nowDate: () => new Date(nowMs),
    });
    writeJson(statePath, previous);

    assert.ok(service.backupStateFile("baseline"));
    nowMs += 30_000;
    service.saveState(next, { reason: "message-growth" });

    const names = backupNames(stateBackupDir);
    assert.equal(names.length, 1);
    assert.equal(names[0].includes("baseline"), true);
    assert.equal(stateMessageCount(readJson(statePath)), 2);
  });
}

function testAllowedMessageDropStillForcesBackup() {
  withTempDir((dir) => {
    let nowMs = Date.parse("2026-05-15T00:00:00.000Z");
    const previous = baseState({ threads: [{ id: "thread-a", messages: messages(2) }] });
    const next = baseState({ threads: [{ id: "thread-a", messages: messages(1) }] });
    const { service, statePath, stateBackupDir } = makeService(dir, {
      stateBackupMinIntervalMs: 60_000,
      nowDate: () => new Date(nowMs),
    });
    writeJson(statePath, previous);

    assert.ok(service.backupStateFile("baseline"));
    nowMs += 30_000;
    service.saveState(next, { reason: "allowed-small-drop", allowMessageDrop: true });

    const names = backupNames(stateBackupDir);
    assert.equal(names.length, 2);
    assert.equal(names.some((name) => name.includes("baseline")), true);
    assert.equal(names.some((name) => name.includes("allowed-small-drop")), true);
    assert.equal(stateMessageCount(readJson(statePath)), 1);
  });
}

function testFastMessageSaveSkipsSqliteReplaceAndWritesSnapshot() {
  withTempDir((dir) => {
    const replacements = [];
    const sqlite = {
      replaceRuntimeState: (value) => replacements.push(value),
    };
    const previous = baseState({ threads: [{ id: "thread-a", messages: messages(1) }] });
    const next = baseState({ threads: [{ id: "thread-a", messages: messages(2) }] });
    const { service, statePath } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
    });
    writeJson(statePath, previous);

    service.saveState(next, { reason: "message-create-pre-run", skipSqliteRuntimeReplace: true });

    assert.equal(replacements.length, 0);
    assert.equal(stateMessageCount(readJson(statePath)), 2);
  });
}

function testSqliteLoadImportsNewerJsonSnapshot() {
  withTempDir((dir) => {
    const replacements = [];
    const exported = baseState({ threads: [{ id: "thread-sqlite", messages: messages(1) }] });
    const newer = baseState({ threads: [{ id: "thread-json", messages: messages(2) }] });
    const sqlite = {
      runtimeStateCounts: () => ({ threads: 1, messages: 1, artifacts: 0, pushSubscriptions: 0, pushReceipts: 0, pushDeliveries: 0 }),
      getMeta: (key, fallback) => (key === "lastRuntimeStateSave" ? { savedAt: "2026-05-14T00:00:00.000Z" } : fallback),
      replaceRuntimeState: (value) => replacements.push(value),
      exportRuntimeState: () => exported,
    };
    const { service, statePath } = makeService(dir, {
      useSqliteServiceStore: () => true,
      mobileSqliteStore: () => sqlite,
    });
    writeJson(statePath, newer);

    const loaded = service.loadState();

    assert.equal(loaded.threads[0].id, "thread-json");
    assert.equal(replacements.length, 1);
    assert.equal(replacements[0].threads[0].id, "thread-json");
    assert.equal(readJson(statePath).threads[0].id, "thread-json");
  });
}

function testStateSnapshotRenameRetriesTransientWindowsLock() {
  withTempDir((dir) => {
    const attempts = [];
    const fsWithTransientRenameLock = Object.assign({}, fs, {
      renameSync(source, target) {
        attempts.push({ source, target });
        if (attempts.length === 1) {
          const err = new Error("operation not permitted");
          err.code = "EPERM";
          throw err;
        }
        return fs.renameSync(source, target);
      },
    });
    const { service, statePath } = makeService(dir, {
      fs: fsWithTransientRenameLock,
      renameRetryDelaysMs: [0],
    });

    service.writeStateFile(baseState({ threads: [{ id: "thread-a", messages: messages(1) }] }));

    assert.equal(attempts.length, 2);
    assert.equal(readJson(statePath).threads[0].id, "thread-a");
    assert.equal(fs.readdirSync(dir).filter((name) => /\.tmp$/.test(name)).length, 0);
  });
}

function testBackupPruningKeepsNewestFiles() {
  withTempDir((dir) => {
    const { service, statePath, stateBackupDir } = makeService(dir, { maxStateBackups: 2 });
    writeJson(statePath, baseState());
    fs.mkdirSync(stateBackupDir, { recursive: true });
    const oldFile = path.join(stateBackupDir, "state-auto-20260514T000000Z-old-0t-0m.json");
    const middleFile = path.join(stateBackupDir, "state-auto-20260514T120000Z-middle-0t-0m.json");
    fs.writeFileSync(oldFile, "{}", "utf8");
    fs.writeFileSync(middleFile, "{}", "utf8");
    fs.utimesSync(oldFile, new Date("2026-05-14T00:00:00.000Z"), new Date("2026-05-14T00:00:00.000Z"));
    fs.utimesSync(middleFile, new Date("2026-05-14T12:00:00.000Z"), new Date("2026-05-14T12:00:00.000Z"));

    service.backupStateFile("newest", { force: true });

    const names = backupNames(stateBackupDir);
    assert.equal(names.length, 2);
    assert.equal(names.some((name) => name.includes("old")), false);
    assert.equal(names.some((name) => name.includes("middle")), true);
    assert.equal(names.some((name) => name.includes("newest")), true);
  });
}

function testBackupThrottleSkipsNonForcedBackups() {
  withTempDir((dir) => {
    let nowMs = Date.parse("2026-05-15T00:00:00.000Z");
    const { service, statePath, stateBackupDir } = makeService(dir, {
      stateBackupMinIntervalMs: 60_000,
      nowDate: () => new Date(nowMs),
    });
    writeJson(statePath, baseState());

    assert.ok(service.backupStateFile("first"));
    nowMs += 30_000;
    assert.equal(service.backupStateFile("second"), null);
    nowMs += 30_000;
    assert.ok(service.backupStateFile("third"));

    const names = backupNames(stateBackupDir);
    assert.equal(names.length, 2);
    assert.equal(names.some((name) => name.includes("first")), true);
    assert.equal(names.some((name) => name.includes("second")), false);
    assert.equal(names.some((name) => name.includes("third")), true);
  });
}

function run() {
  testHelpers();
  testMissingJsonWritesFreshState();
  testInvalidJsonBacksUpRawAndReplacesWithFreshState();
  testJsonLoadNormalizesAndPersistsPushScopeChanges();
  testSqliteEmptyRuntimeImportsValidJsonSnapshot();
  testSqliteEmptyRuntimeCreatesFreshSnapshotWhenJsonMissing();
  testSqliteExistingRuntimeExportsAndSnapshots();
  testSaveRefusesLargeMessageDropAndKeepsExistingFile();
  testSaveCanAllowMessageDropAndWriteSqliteThenSnapshot();
  testSaveDoesNotForceBackupForNormalMessageGrowth();
  testAllowedMessageDropStillForcesBackup();
  testFastMessageSaveSkipsSqliteReplaceAndWritesSnapshot();
  testSqliteLoadImportsNewerJsonSnapshot();
  testStateSnapshotRenameRetriesTransientWindowsLock();
  testBackupPruningKeepsNewestFiles();
  testBackupThrottleSkipsNonForcedBackups();
  console.log("runtime state persistence service tests passed");
}

run();
