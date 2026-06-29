"use strict";

const assert = require("node:assert/strict");

const { createSingleWindowThreadService } = require("../adapters/single-window-thread-service");

function makeService(overrides = {}) {
  let id = 0;
  const state = overrides.state || { threads: [], artifacts: [] };
  const saves = [];
  const service = createSingleWindowThreadService(Object.assign({
    chatGroupMemberWorkspaceIds(thread) {
      const group = thread?.chatGroup || {};
      return group.enabled ? (group.memberWorkspaceIds || []) : [];
    },
    findProject(workspaceId, projectId) {
      return workspaceId && projectId === "single-window" ? { id: projectId } : null;
    },
    findWorkspace(workspaceId) {
      return workspaceId ? { id: workspaceId } : null;
    },
    makeId(prefix) {
      id += 1;
      return `${prefix}-${id}`;
    },
    normalizeChatGroup(value) {
      return value && typeof value === "object" ? Object.assign({ enabled: false, memberWorkspaceIds: [] }, value) : { enabled: false, memberWorkspaceIds: [] };
    },
    normalizeExternalDelivery(value) {
      return value && typeof value === "object" ? Object.assign({}, value) : null;
    },
    normalizeExternalIngress(value) {
      return value && typeof value === "object" ? Object.assign({}, value) : null;
    },
    normalizeTaskGroupMeta(value) {
      return value && typeof value === "object" ? Object.assign({}, value) : {};
    },
    normalizeThread(thread) {
      return Object.assign({ normalized: true }, thread);
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
    saveState(next = state, options = {}) {
      saves.push({ next, options });
    },
    singleWindowChatTaskGroupId: "chat",
    singleWindowGroupChatTaskGroupId: "group-chat",
    singleWindowProjectId: "single-window",
    singleWindowThreadTitle: "Single Window",
    state: () => state,
    taskGroupOwnerWorkspaceId: () => "owner",
    taskGroupsForThread: () => [],
    threadAccessibleToAuth: (auth, thread) => auth?.isOwner || thread.workspaceId === auth?.workspaceId,
  }, overrides.deps || {}));
  return { service, state, saves };
}

function testCreatesPrivateThread() {
  const { service, state, saves } = makeService();
  const thread = service.ensureSingleWindowThread("owner");
  assert.equal(thread.singleWindow, true);
  assert.equal(thread.projectId, "single-window");
  assert.equal(state.threads[0], thread);
  assert.equal(saves.length, 1);
}

function testFindsGroupAndCaseTopicThreads() {
  const { service } = makeService({
    state: {
      threads: [
        { id: "old", workspaceId: "owner", singleWindow: true, updatedAt: "2026-01-01", chatGroup: { enabled: true, memberWorkspaceIds: ["child"] } },
        { id: "topic", workspaceId: "owner", singleWindow: true, updatedAt: "2026-01-03", chatGroup: { enabled: true, kind: "case-topic", memberWorkspaceIds: ["child"] } },
        { id: "learner-topic", workspaceId: "child", singleWindow: true, updatedAt: "2026-01-04", chatGroup: { enabled: true, kind: "case-topic", memberWorkspaceIds: ["child"] } },
        { id: "new", workspaceId: "owner", singleWindow: true, updatedAt: "2026-01-02", chatGroup: { enabled: true, memberWorkspaceIds: ["child"] } },
      ],
    },
  });
  assert.equal(service.findGroupChatThreadForWorkspace("child").id, "new");
  assert.deepEqual(service.kanbanCaseTopicThreadsForWorkspace({ isOwner: true, workspaceId: "child" }, "child").map((thread) => thread.id), ["learner-topic", "topic"]);
  assert.deepEqual(service.kanbanCaseTopicThreadsForWorkspace({ isOwner: true, workspaceId: "owner" }, "owner").map((thread) => thread.id), ["learner-topic", "topic"]);
  assert.deepEqual(service.kanbanCaseTopicThreadsForWorkspace({ isOwner: false, workspaceId: "owner" }, "owner").map((thread) => thread.id), []);
}

function testGroupThreadPrefersNonEmptyGroupMessages() {
  const { service } = makeService({
    state: {
      threads: [
        {
          id: "empty-new",
          workspaceId: "owner",
          singleWindow: true,
          updatedAt: "2026-01-05",
          chatGroup: { enabled: true, memberWorkspaceIds: ["owner"] },
          messages: [],
        },
        {
          id: "active-old",
          workspaceId: "owner",
          singleWindow: true,
          updatedAt: "2026-01-01",
          chatGroup: { enabled: true, memberWorkspaceIds: ["owner"] },
          messages: [{ id: "m1", taskGroupId: "group-chat", content: "group" }],
        },
      ],
    },
  });
  assert.equal(service.findGroupChatThreadForWorkspace("owner").id, "active-old");
}

function testEnsureGroupChatCreatesDedicatedEmptyThread() {
  const { service, state, saves } = makeService();
  const thread = service.ensureGroupChatThreadForWorkspace("owner", ["child"]);
  assert.equal(thread.singleWindow, true);
  assert.equal(thread.title, "Group Chat");
  assert.equal(thread.chatGroup.enabled, true);
  assert.deepEqual(thread.chatGroup.memberWorkspaceIds, ["owner", "child"]);
  assert.deepEqual(thread.messages, []);
  assert.deepEqual(thread.taskGroupMeta, {});
  assert.equal(state.threads[0], thread);
  assert.equal(saves.length, 1);
}

function run() {
  testCreatesPrivateThread();
  testFindsGroupAndCaseTopicThreads();
  testGroupThreadPrefersNonEmptyGroupMessages();
  testEnsureGroupChatCreatesDedicatedEmptyThread();
  console.log("single-window-thread-service tests passed");
}

run();
