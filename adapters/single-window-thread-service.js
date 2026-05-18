"use strict";

const {
  createSingleWindowMigrationService,
  sortMessagesChronologically,
} = require("./single-window-migration-service");
const { createWeixinWindowMigrationService } = require("./weixin-window-migration-service");

function requireFn(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`single window thread service requires ${name}`);
  return deps[name];
}

function createSingleWindowThreadService(deps = {}) {
  const state = requireFn(deps, "state");
  const findWorkspace = requireFn(deps, "findWorkspace");
  const findProject = requireFn(deps, "findProject");
  const makeId = requireFn(deps, "makeId");
  const normalizeChatGroup = requireFn(deps, "normalizeChatGroup");
  const normalizeExternalDelivery = requireFn(deps, "normalizeExternalDelivery");
  const normalizeExternalIngress = requireFn(deps, "normalizeExternalIngress");
  const normalizeTaskGroupMeta = requireFn(deps, "normalizeTaskGroupMeta");
  const normalizeThread = requireFn(deps, "normalizeThread");
  const nowIso = requireFn(deps, "nowIso");
  const saveState = requireFn(deps, "saveState");
  const taskGroupOwnerWorkspaceId = requireFn(deps, "taskGroupOwnerWorkspaceId");
  const taskGroupsForThread = requireFn(deps, "taskGroupsForThread");
  const threadAccessibleToAuth = requireFn(deps, "threadAccessibleToAuth");
  const chatGroupMemberWorkspaceIds = requireFn(deps, "chatGroupMemberWorkspaceIds");
  const singleWindowChatTaskGroupId = String(deps.singleWindowChatTaskGroupId || "chat");
  const singleWindowGroupChatTaskGroupId = String(deps.singleWindowGroupChatTaskGroupId || "group-chat");
  const singleWindowProjectId = String(deps.singleWindowProjectId || "single-window");
  const singleWindowThreadTitle = String(deps.singleWindowThreadTitle || "Single Window");
  const kanbanCaseTopicKind = String(deps.kanbanCaseTopicKind || "case-topic");
  let singleWindowMigrationService = null;
  let weixinWindowMigrationService = null;

  function stateObject() {
    const current = state();
    if (!current || typeof current !== "object") throw new Error("single window thread service requires state");
    if (!Array.isArray(current.threads)) current.threads = [];
    return current;
  }

  function isGroupChatThread(thread) {
    return Boolean(normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner").enabled);
  }

  function isKanbanCaseTopicThread(thread) {
    const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
    return Boolean(thread?.singleWindow && group.enabled && group.kind === kanbanCaseTopicKind);
  }

  function isExternalIngressThread(thread) {
    return Boolean(thread?.externalIngress?.source);
  }

  function createSingleWindowThread(workspaceId, overrides = {}) {
    const now = nowIso();
    return normalizeThread(Object.assign({
      id: makeId("thread"),
      title: singleWindowThreadTitle,
      workspaceId,
      projectId: singleWindowProjectId,
      subprojectId: "",
      singleWindow: true,
      hermesSessionId: `web_single_${makeId("session")}`,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      messages: [],
      events: [],
    }, overrides));
  }

  function getWeixinWindowMigrationService() {
    if (!weixinWindowMigrationService) {
      weixinWindowMigrationService = createWeixinWindowMigrationService({
        createSingleWindowThread,
        makeId,
        normalizeChatGroup,
        normalizeExternalDelivery,
        normalizeExternalIngress,
        nowIso,
        saveState,
        singleWindowChatTaskGroupId,
        state,
        weixinIngressProvider: deps.weixinIngressProvider,
      });
    }
    return weixinWindowMigrationService;
  }

  function getSingleWindowMigrationService() {
    if (!singleWindowMigrationService) {
      singleWindowMigrationService = createSingleWindowMigrationService({
        createSingleWindowThread,
        normalizeChatGroup,
        normalizeExternalDelivery,
        normalizeTaskGroupMeta,
        nowIso,
        saveState,
        singleWindowChatTaskGroupId,
        singleWindowGroupChatTaskGroupId,
        state,
        taskGroupOwnerWorkspaceId,
        taskGroupsForThread,
      });
    }
    return singleWindowMigrationService;
  }

  function isWeixinSingleWindowThread(thread) {
    return getWeixinWindowMigrationService().isWeixinSingleWindowThread(thread);
  }

  function publicExternalIngress(thread) {
    const ingress = normalizeExternalIngress(thread?.externalIngress || null);
    if (!ingress) return null;
    return {
      source: ingress.source,
      type: ingress.source,
      workspaceId: ingress.workspaceId || thread.workspaceId || "",
      senderLabel: ingress.senderLabel || "",
      status: ingress.status || "",
      updatedAt: ingress.updatedAt || "",
    };
  }

  function ensureWeixinSingleWindowThread(workspaceId, seed = {}) {
    const current = stateObject();
    const workspace = findWorkspace(workspaceId);
    const project = findProject(workspaceId, singleWindowProjectId);
    if (!workspace || !project) return null;
    const weixin = getWeixinWindowMigrationService();
    let thread = weixin.findWeixinSingleWindowThreadForWorkspace(workspaceId);
    let changed = false;
    if (!thread) {
      thread = weixin.createWeixinSingleWindowThread(workspaceId, seed);
      current.threads.unshift(thread);
      changed = true;
    }
    const nextIngress = weixin.weixinThreadSeed(workspaceId, Object.assign({}, thread.externalIngress || {}, seed || {}, {
      createdAt: thread.externalIngress?.createdAt || thread.createdAt,
      updatedAt: nowIso(),
    }));
    if (JSON.stringify(nextIngress) !== JSON.stringify(thread.externalIngress || null)) {
      thread.externalIngress = nextIngress;
      changed = true;
    }
    const migrated = weixin.migrateWeixinMessagesToDedicatedThread(workspaceId, thread);
    if (migrated && migrated.id === thread.id) thread = migrated;
    if (changed) saveState();
    return thread;
  }

  function ensureSingleWindowThread(workspaceId, options = {}) {
    const current = stateObject();
    const workspace = findWorkspace(workspaceId);
    const project = findProject(workspaceId, singleWindowProjectId);
    if (!workspace || !project) return null;
    const allowGroupThread = Boolean(options.allowGroupThread);
    if (!allowGroupThread) {
      getWeixinWindowMigrationService().migrateWeixinMessagesToDedicatedThread(workspaceId);
      const migrated = getSingleWindowMigrationService().migratePrivateSingleWindowGroups(workspaceId);
      if (migrated) return migrated;
    }
    let thread = current.threads.find((item) => (
      item.workspaceId === workspaceId
      && item.singleWindow
      && (allowGroupThread || !isGroupChatThread(item))
      && (allowGroupThread || !isExternalIngressThread(item))
    ));
    if (thread) return thread;
    thread = createSingleWindowThread(workspaceId);
    current.threads.unshift(thread);
    saveState();
    return thread;
  }

  function findGroupChatThreadForWorkspace(workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    return (stateObject().threads || [])
      .filter((thread) => thread?.singleWindow && !isKanbanCaseTopicThread(thread) && chatGroupMemberWorkspaceIds(thread).includes(id))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  }

  function caseTopicThreadVisibleForWorkspace(auth, thread, workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return false;
    if (chatGroupMemberWorkspaceIds(thread).includes(id)) return true;
    return Boolean(auth?.isOwner && id === "owner");
  }

  function kanbanCaseTopicThreadsForWorkspace(auth, workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return [];
    return (stateObject().threads || [])
      .filter((thread) => isKanbanCaseTopicThread(thread))
      .filter((thread) => caseTopicThreadVisibleForWorkspace(auth, thread, id))
      .filter((thread) => threadAccessibleToAuth(auth, thread))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  return Object.freeze({
    createSingleWindowThread,
    ensureSingleWindowThread,
    ensureWeixinSingleWindowThread,
    findGroupChatThreadForWorkspace,
    findWeixinSingleWindowThreadForWorkspace: (...args) => getWeixinWindowMigrationService().findWeixinSingleWindowThreadForWorkspace(...args),
    getSingleWindowMigrationService,
    getWeixinWindowMigrationService,
    isExternalIngressThread,
    isGroupChatThread,
    isKanbanCaseTopicThread,
    isWeixinSingleWindowThread,
    kanbanCaseTopicThreadsForWorkspace,
    messageBelongsToWeixinWindow: (...args) => getWeixinWindowMigrationService().messageBelongsToWeixinWindow(...args),
    migratePrivateSingleWindowGroups: (...args) => getSingleWindowMigrationService().migratePrivateSingleWindowGroups(...args),
    migrateWeixinMessagesToDedicatedThread: (...args) => getWeixinWindowMigrationService().migrateWeixinMessagesToDedicatedThread(...args),
    publicExternalIngress,
    sortMessagesChronologically,
    weixinThreadSeed: (...args) => getWeixinWindowMigrationService().weixinThreadSeed(...args),
  });
}

module.exports = {
  createSingleWindowThreadService,
};
