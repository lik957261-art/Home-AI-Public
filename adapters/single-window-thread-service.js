"use strict";

const {
  createSingleWindowMigrationService,
  sortMessagesChronologically,
} = require("./single-window-migration-service");

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

  function getSingleWindowMigrationService() {
    if (!singleWindowMigrationService) {
      singleWindowMigrationService = createSingleWindowMigrationService({
        createSingleWindowThread,
        normalizeChatGroup,
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

  function ensureSingleWindowThread(workspaceId, options = {}) {
    const current = stateObject();
    const workspace = findWorkspace(workspaceId);
    const project = findProject(workspaceId, singleWindowProjectId);
    if (!workspace || !project) return null;
    const allowGroupThread = Boolean(options.allowGroupThread);
    if (!allowGroupThread) {
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

  function groupThreadMessageCount(thread) {
    return (thread?.messages || []).filter((message) => String(message?.taskGroupId || "") === singleWindowGroupChatTaskGroupId).length;
  }

  function findGroupChatThreadForWorkspace(workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    return (stateObject().threads || [])
      .filter((thread) => thread?.singleWindow && !isKanbanCaseTopicThread(thread) && chatGroupMemberWorkspaceIds(thread).includes(id))
      .sort((a, b) => (
        groupThreadMessageCount(b) - groupThreadMessageCount(a)
        || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
      ))[0] || null;
  }

  function ensureGroupChatThreadForWorkspace(workspaceId, memberWorkspaceIds = []) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    const current = stateObject();
    const existing = findGroupChatThreadForWorkspace(id);
    if (existing) return existing;
    const now = nowIso();
    const members = [...new Set([id, ...memberWorkspaceIds].map((item) => String(item || "").trim()).filter(Boolean))];
    const thread = createSingleWindowThread(id, {
      title: "Group Chat",
      chatGroup: normalizeChatGroup({
        enabled: true,
        memberWorkspaceIds: members,
        createdAt: now,
        updatedAt: now,
      }, id),
      messages: [],
      taskGroupMeta: {},
      updatedAt: now,
    });
    current.threads.unshift(thread);
    saveState();
    return thread;
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
    ensureGroupChatThreadForWorkspace,
    ensureSingleWindowThread,
    findGroupChatThreadForWorkspace,
    getSingleWindowMigrationService,
    isExternalIngressThread,
    isGroupChatThread,
    isKanbanCaseTopicThread,
    kanbanCaseTopicThreadsForWorkspace,
    migratePrivateSingleWindowGroups: (...args) => getSingleWindowMigrationService().migratePrivateSingleWindowGroups(...args),
    publicExternalIngress,
    sortMessagesChronologically,
  });
}

module.exports = {
  createSingleWindowThreadService,
};
