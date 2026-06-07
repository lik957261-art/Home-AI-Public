"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeStateFacadeService } = require("../adapters/mobile-runtime-state-facade-service");

const mkdirs = [];
let normalizationCreateCalls = 0;
let persistenceCreateCalls = 0;
let capturedNormalizationOptions = null;
let capturedPersistenceOptions = null;

const webPushService = {
  normalizePushDelivery: (item) => ({ kind: "delivery", item }),
  normalizePushReceipt: (item) => ({ kind: "receipt", item }),
  normalizePushSubscription: (item, options) => ({ kind: "subscription", item, options }),
  pushSubscriptionScopeSignature: (items) => `scope:${items.length}`,
};

const facade = createMobileRuntimeStateFacadeService({
  bootTrace: () => {},
  chatGroupMemberWorkspaceIds: () => ["owner"],
  compactFullContent: (value) => String(value || "").slice(0, 20),
  createRuntimeStateNormalizationService(options) {
    normalizationCreateCalls += 1;
    capturedNormalizationOptions = options;
    return {
      defaultState: () => ({ schemaVersion: 1, threads: [] }),
      normalizeState: (value, optionsArg) => ({
        normalized: value,
        options: optionsArg,
        delivery: options.normalizePushDelivery({ id: "delivery-a" }),
      }),
      normalizeChatGroup: (value, ownerWorkspaceId, optionsArg) => {
        const enabled = Boolean(value?.enabled);
        return {
          value,
          ownerWorkspaceId,
          options: optionsArg,
          enabled,
          memberWorkspaceIds: enabled ? [ownerWorkspaceId, ...(value.memberWorkspaceIds || [])] : [],
        };
      },
    };
  },
  createRuntimeStatePersistenceService(options) {
    persistenceCreateCalls += 1;
    capturedPersistenceOptions = options;
    return {
      loadState: () => ({
        loaded: options.defaultState(),
        signature: options.pushSubscriptionScopeSignature([{ endpoint: "a" }]),
      }),
      saveState: (next, saveOptions) => ({
        saved: next,
        saveOptions,
        normalized: options.normalizeState(next, saveOptions),
      }),
    };
  },
  dataDir: "/data",
  dedupe: (items = []) => [...new Set(items)],
  findWorkspace: () => true,
  fs: { mkdirSync: (target, options) => mkdirs.push({ target, options }) },
  groupMessageRevokedText: "revoked",
  kanbanCaseTopicKind: "case-topic",
  logError: () => {},
  makeId: (prefix) => `${prefix}_fixture`,
  maxStateBackups: 3,
  maxStoredEventsPerThread: 5,
  messageTimeFields: ["createdAt"],
  mobileSqliteStore: () => ({ store: true }),
  normalizeSingleWindowMode: (value) => value || "task",
  nowIso: () => "2026-06-07T00:00:00.000Z",
  ownerDefaultWorkspace: "/data/users/owner",
  path: { join: (...parts) => parts.join("/") },
  singleWindowChatTaskGroupId: () => "chat",
  singleWindowChatTaskGroupIdValue: "chat",
  singleWindowGroupChatTaskGroupId: "group-chat",
  stateBackupDir: "/data/backups/state",
  stateBackupMinIntervalMs: 25,
  statePath: "/data/state.json",
  useSqliteServiceStore: () => true,
  validReasoningEfforts: new Set(["low"]),
  webPushDeliveryService: () => webPushService,
  workspaceLabel: (workspaceId) => `Workspace ${workspaceId}`,
});

assert.equal(normalizationCreateCalls, 0);
assert.equal(persistenceCreateCalls, 0);

facade.ensureDataDir();
assert.deepEqual(mkdirs, [
  { target: "/data", options: { recursive: true } },
  { target: "/data/users/owner", options: { recursive: true } },
]);

assert.deepEqual(facade.defaultState(), { schemaVersion: 1, threads: [] });
assert.equal(normalizationCreateCalls, 1);
assert.equal(capturedNormalizationOptions.singleWindowChatTaskGroupIdValue, "chat");
assert.equal(capturedNormalizationOptions.singleWindowGroupChatTaskGroupId, "group-chat");
assert.deepEqual(capturedNormalizationOptions.normalizePushReceipt({ id: "receipt-a" }), {
  kind: "receipt",
  item: { id: "receipt-a" },
});

assert.deepEqual(facade.normalizeState({ value: 1 }, { skipCatalogLookups: true }), {
  normalized: { value: 1 },
  options: { skipCatalogLookups: true },
  delivery: { kind: "delivery", item: { id: "delivery-a" } },
});
assert.deepEqual(facade.normalizeChatGroup({ enabled: true }, "owner", { skipCatalogLookups: true }), {
  value: { enabled: true },
  ownerWorkspaceId: "owner",
  options: { skipCatalogLookups: true },
  enabled: true,
  memberWorkspaceIds: ["owner"],
});
assert.deepEqual(
  facade.chatGroupMemberWorkspaceIds({
    singleWindow: true,
    workspaceId: "owner",
    chatGroup: { enabled: true, memberWorkspaceIds: ["weixin_wuping"] },
  }, { skipCatalogLookups: true }),
  ["owner", "weixin_wuping"],
);
assert.deepEqual(facade.chatGroupMemberWorkspaceIds({ singleWindow: false, chatGroup: { enabled: true } }), []);

assert.deepEqual(facade.loadState(), {
  loaded: { schemaVersion: 1, threads: [] },
  signature: "scope:1",
});
assert.equal(persistenceCreateCalls, 1);
assert.equal(capturedPersistenceOptions.statePath, "/data/state.json");
assert.equal(capturedPersistenceOptions.maxStateBackups, 3);

assert.deepEqual(facade.saveState({ next: true }, { reason: "unit" }), {
  saved: { next: true },
  saveOptions: { reason: "unit" },
  normalized: {
    normalized: { next: true },
    options: { reason: "unit" },
    delivery: { kind: "delivery", item: { id: "delivery-a" } },
  },
});

assert.deepEqual(facade.normalizePushSubscription({ endpoint: "b" }, { owner: true }), {
  kind: "subscription",
  item: { endpoint: "b" },
  options: { owner: true },
});
assert.equal(facade.getRuntimeStateNormalizationService(), facade.getRuntimeStateNormalizationService());
assert.equal(facade.getRuntimeStatePersistenceService(), facade.getRuntimeStatePersistenceService());
assert.equal(normalizationCreateCalls, 1);
assert.equal(persistenceCreateCalls, 1);

assert.throws(() => createMobileRuntimeStateFacadeService({}), /requires createRuntimeStateNormalizationService/);
assert.throws(
  () => createMobileRuntimeStateFacadeService({ createRuntimeStateNormalizationService: () => ({}) }),
  /requires createRuntimeStatePersistenceService/,
);

console.log("mobile runtime state facade service tests passed");
