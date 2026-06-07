"use strict";

function createMobileRuntimeStateFacadeService(options = {}) {
  const createRuntimeStateNormalizationService = options.createRuntimeStateNormalizationService;
  const createRuntimeStatePersistenceService = options.createRuntimeStatePersistenceService;
  if (typeof createRuntimeStateNormalizationService !== "function") {
    throw new Error("MobileRuntimeStateFacadeService requires createRuntimeStateNormalizationService");
  }
  if (typeof createRuntimeStatePersistenceService !== "function") {
    throw new Error("MobileRuntimeStateFacadeService requires createRuntimeStatePersistenceService");
  }

  const fs = options.fs;
  const path = options.path;
  let runtimeStateNormalizationService = null;
  let runtimeStatePersistenceService = null;

  function webPushDeliveryService() {
    return typeof options.webPushDeliveryService === "function"
      ? (options.webPushDeliveryService() || {})
      : (options.webPushDeliveryService || {});
  }

  function ensureDataDir() {
    if (!fs || typeof fs.mkdirSync !== "function") return;
    if (options.dataDir) fs.mkdirSync(options.dataDir, { recursive: true });
    if (options.ownerDefaultWorkspace) fs.mkdirSync(options.ownerDefaultWorkspace, { recursive: true });
  }

  function normalizePushDelivery(item) {
    const service = webPushDeliveryService();
    return typeof service.normalizePushDelivery === "function" ? service.normalizePushDelivery(item) : item;
  }

  function normalizePushReceipt(item) {
    const service = webPushDeliveryService();
    return typeof service.normalizePushReceipt === "function" ? service.normalizePushReceipt(item) : item;
  }

  function normalizePushSubscription(item, normalizeOptions = {}) {
    const service = webPushDeliveryService();
    return typeof service.normalizePushSubscription === "function"
      ? service.normalizePushSubscription(item, normalizeOptions)
      : item;
  }

  function pushSubscriptionScopeSignature(items) {
    const service = webPushDeliveryService();
    return typeof service.pushSubscriptionScopeSignature === "function"
      ? service.pushSubscriptionScopeSignature(items)
      : JSON.stringify(Array.isArray(items) ? items : []);
  }

  function getRuntimeStateNormalizationService() {
    if (!runtimeStateNormalizationService) {
      runtimeStateNormalizationService = createRuntimeStateNormalizationService({
        bootTrace: options.bootTrace,
        chatGroupMemberWorkspaceIds,
        compactFullContent: options.compactFullContent,
        dedupe: options.dedupe,
        findWorkspace: options.findWorkspace,
        groupMessageRevokedText: options.groupMessageRevokedText,
        kanbanCaseTopicKind: options.kanbanCaseTopicKind,
        makeId: options.makeId,
        maxStoredEventsPerThread: options.maxStoredEventsPerThread,
        messageTimeFields: options.messageTimeFields,
        normalizePushDelivery,
        normalizePushReceipt,
        normalizePushSubscription,
        normalizeSingleWindowMode: options.normalizeSingleWindowMode,
        nowIso: options.nowIso,
        singleWindowChatTaskGroupId: options.singleWindowChatTaskGroupId,
        singleWindowChatTaskGroupIdValue: options.singleWindowChatTaskGroupIdValue,
        singleWindowGroupChatTaskGroupId: options.singleWindowGroupChatTaskGroupId,
        validReasoningEfforts: options.validReasoningEfforts,
        workspaceLabel: options.workspaceLabel,
      });
    }
    return runtimeStateNormalizationService;
  }

  function defaultState() {
    return getRuntimeStateNormalizationService().defaultState();
  }

  function normalizeState(value, normalizeOptions = {}) {
    return getRuntimeStateNormalizationService().normalizeState(value, normalizeOptions);
  }

  function normalizeChatGroup(value, ownerWorkspaceId = "owner", normalizeOptions = {}) {
    return getRuntimeStateNormalizationService().normalizeChatGroup(value, ownerWorkspaceId, normalizeOptions);
  }

  function chatGroupMemberWorkspaceIds(thread, normalizeOptions = {}) {
    if (!thread?.singleWindow) return [];
    const group = normalizeChatGroup(thread.chatGroup || {}, thread.workspaceId, normalizeOptions);
    return group.enabled ? group.memberWorkspaceIds : [];
  }

  function getRuntimeStatePersistenceService() {
    if (!runtimeStatePersistenceService) {
      runtimeStatePersistenceService = createRuntimeStatePersistenceService({
        fs,
        path,
        statePath: options.statePath,
        dataDir: options.dataDir,
        stateBackupDir: options.stateBackupDir,
        maxStateBackups: options.maxStateBackups,
        stateBackupMinIntervalMs: options.stateBackupMinIntervalMs,
        bootTrace: options.bootTrace,
        defaultState,
        ensureDataDir,
        logError: options.logError,
        mobileSqliteStore: options.mobileSqliteStore,
        normalizeState,
        pushSubscriptionScopeSignature,
        useSqliteServiceStore: options.useSqliteServiceStore,
      });
    }
    return runtimeStatePersistenceService;
  }

  function loadState() {
    return getRuntimeStatePersistenceService().loadState();
  }

  function saveState(next, saveOptions = {}) {
    return getRuntimeStatePersistenceService().saveState(next, saveOptions);
  }

  return Object.freeze({
    chatGroupMemberWorkspaceIds,
    defaultState,
    ensureDataDir,
    getRuntimeStateNormalizationService,
    getRuntimeStatePersistenceService,
    loadState,
    normalizeChatGroup,
    normalizePushDelivery,
    normalizePushReceipt,
    normalizePushSubscription,
    normalizeState,
    pushSubscriptionScopeSignature,
    saveState,
  });
}

module.exports = {
  createMobileRuntimeStateFacadeService,
};
