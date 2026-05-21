"use strict";

const assert = require("node:assert/strict");
const {
  createSingleWindowMigrationService,
  latestMessageTimestamp,
  sortMessagesChronologically,
  taskGroupHasActiveRun,
} = require("../adapters/single-window-migration-service");

function makeService(state, extra = {}) {
  const calls = { saveState: [] };
  const service = createSingleWindowMigrationService(Object.assign({
    state,
    nowIso: () => "2026-05-15T09:00:00.000Z",
    createSingleWindowThread(workspaceId) {
      return {
        id: `private-${workspaceId}`,
        title: "Single Window",
        workspaceId,
        singleWindow: true,
        createdAt: "2026-05-15T09:00:00.000Z",
        updatedAt: "2026-05-15T09:00:00.000Z",
        messages: [],
        events: [],
      };
    },
    normalizeExternalDelivery(value) {
      return Object.assign({}, value, { normalized: true });
    },
    saveState(nextState, options) {
      calls.saveState.push({ state: nextState, options });
    },
  }, extra));
  return { service, calls };
}

function groupThreadFixture() {
  return {
    id: "group-thread",
    workspaceId: "owner",
    singleWindow: true,
    createdAt: "2026-05-15T08:00:00.000Z",
    updatedAt: "2026-05-15T08:20:00.000Z",
    chatGroup: {
      enabled: true,
      memberWorkspaceIds: ["child"],
      createdAt: "2026-05-15T08:00:00.000Z",
      updatedAt: "2026-05-15T08:00:00.000Z",
    },
    taskGroupMeta: {
      "task-child": { title: "Child private task", updatedAt: "2026-05-15T08:10:00.000Z" },
      "task-running": { title: "Running task", updatedAt: "2026-05-15T08:12:00.000Z" },
      "group-chat": { title: "Shared group", updatedAt: "2026-05-15T08:01:00.000Z" },
      "task-owner": { title: "Owner private task", updatedAt: "2026-05-15T08:15:00.000Z" },
    },
    messages: [
      {
        id: "group-user",
        role: "user",
        senderWorkspaceId: "owner",
        taskGroupId: "group-chat",
        createdAt: "2026-05-15T08:01:00.000Z",
        updatedAt: "2026-05-15T08:01:00.000Z",
        artifacts: [{ id: "artifact-group" }],
      },
      {
        id: "child-user",
        role: "user",
        senderWorkspaceId: "child",
        taskGroupId: "task-child",
        createdAt: "2026-05-15T08:10:00.000Z",
        updatedAt: "2026-05-15T08:10:00.000Z",
        artifacts: [{ id: "artifact-child-inline" }],
      },
      {
        id: "child-assistant",
        role: "assistant",
        taskGroupId: "task-child",
        createdAt: "2026-05-15T08:11:00.000Z",
        updatedAt: "2026-05-15T08:11:00.000Z",
      },
      {
        id: "running-user",
        role: "user",
        senderWorkspaceId: "child",
        taskGroupId: "task-running",
        status: "queued",
        createdAt: "2026-05-15T08:12:00.000Z",
        updatedAt: "2026-05-15T08:12:00.000Z",
      },
      {
        id: "owner-user",
        role: "user",
        senderWorkspaceId: "owner",
        taskGroupId: "task-owner",
        createdAt: "2026-05-15T08:15:00.000Z",
        updatedAt: "2026-05-15T08:15:00.000Z",
      },
    ],
  };
}

{
  const state = {
    threads: [
      groupThreadFixture(),
    ],
    artifacts: [
      { id: "artifact-child-inline", threadId: "group-thread", messageId: "child-user" },
      { id: "artifact-child-stored", threadId: "group-thread", messageId: "child-assistant" },
      { id: "artifact-group", threadId: "group-thread", messageId: "group-user" },
    ],
  };
  const { service, calls } = makeService(state);
  const privateThread = service.migratePrivateSingleWindowGroups("child");

  assert.equal(privateThread.id, "private-child");
  assert.equal(state.threads[0].id, "private-child");
  assert.deepEqual(privateThread.messages.map((message) => message.id), ["child-user", "child-assistant"]);
  assert.deepEqual(state.threads.find((thread) => thread.id === "group-thread").messages.map((message) => message.id), [
    "group-user",
    "running-user",
    "owner-user",
  ]);
  assert.equal(privateThread.taskGroupMeta["task-child"].title, "Child private task");
  assert.equal(state.threads.find((thread) => thread.id === "group-thread").taskGroupMeta["task-child"], undefined);
  assert.equal(state.threads.find((thread) => thread.id === "group-thread").taskGroupMeta["task-running"].title, "Running task");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-child-inline").threadId, "private-child");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-child-stored").threadId, "private-child");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-group").threadId, "group-thread");
  assert.deepEqual(calls.saveState[0].options, { reason: "single-window-private-split", forceBackup: true });
}

{
  const state = {
    threads: [
      {
        id: "private-child",
        workspaceId: "child",
        singleWindow: true,
        createdAt: "2026-05-15T08:50:00.000Z",
        updatedAt: "2026-05-15T08:50:00.000Z",
        messages: [{ id: "existing", role: "user", taskGroupId: "task-existing", createdAt: "2026-05-15T08:50:00.000Z" }],
      },
      {
        id: "external-child",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "mail", status: "window" },
        messages: [
          {
            id: "external-msg",
            role: "assistant",
            taskGroupId: "old",
            singleWindowMode: "task",
            externalDelivery: { source: "mail", status: "sent" },
            createdAt: "2026-05-15T08:30:00.000Z",
            updatedAt: "2026-05-15T08:31:00.000Z",
          },
        ],
      },
      {
        id: "weixin-child",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "weixin" },
        messages: [{ id: "weixin-msg", role: "user", createdAt: "2026-05-15T08:32:00.000Z" }],
      },
      {
        id: "active-external-child",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "mail" },
        activeRunIds: ["run-1"],
        messages: [{ id: "active-msg", role: "user", createdAt: "2026-05-15T08:33:00.000Z" }],
      },
    ],
    artifacts: [
      { id: "artifact-external", threadId: "external-child", messageId: "external-msg" },
      { id: "artifact-weixin", threadId: "weixin-child", messageId: "weixin-msg" },
    ],
  };
  const { service, calls } = makeService(state);
  const privateThread = service.migratePrivateSingleWindowGroups("child");

  assert.equal(privateThread.id, "private-child");
  assert.deepEqual(privateThread.messages.map((message) => message.id), ["external-msg", "existing"]);
  const moved = privateThread.messages.find((message) => message.id === "external-msg");
  assert.equal(moved.taskGroupId, "chat");
  assert.equal(moved.singleWindowMode, "chat");
  assert.equal(moved.externalDelivery.threadId, "private-child");
  assert.equal(moved.externalDelivery.taskGroupId, "chat");
  assert.equal(moved.externalDelivery.normalized, true);
  assert.equal(state.threads.some((thread) => thread.id === "external-child"), false);
  assert.equal(state.threads.some((thread) => thread.id === "weixin-child"), true);
  assert.equal(state.threads.some((thread) => thread.id === "active-external-child"), true);
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-external").threadId, "private-child");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-weixin").threadId, "weixin-child");
  assert.equal(calls.saveState.length, 1);
}

{
  const state = {
    threads: [
      {
        id: "empty-external",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "mail" },
        messages: [],
      },
    ],
    artifacts: [],
  };
  const { service, calls } = makeService(state);
  const privateThread = service.migratePrivateSingleWindowGroups("child");

  assert.equal(privateThread, null);
  assert.deepEqual(state.threads, []);
  assert.equal(calls.saveState.length, 1);
}

{
  const state = {
    threads: [
      Object.assign(groupThreadFixture(), {
        id: "case-topic",
        chatGroup: {
          enabled: true,
          kind: "case-topic",
          memberWorkspaceIds: ["child"],
        },
      }),
    ],
    artifacts: [],
  };
  const { service, calls } = makeService(state);

  assert.equal(service.migratePrivateSingleWindowGroups("child"), null);
  assert.equal(state.threads.length, 1);
  assert.equal(calls.saveState.length, 0);
}

{
  assert.equal(taskGroupHasActiveRun({ messages: [{ status: "running" }] }), true);
  assert.equal(taskGroupHasActiveRun({ messages: [{ status: "done" }] }), false);
  assert.equal(latestMessageTimestamp([
    { createdAt: "2026-05-15T08:00:00.000Z" },
    { completedAt: "2026-05-15T08:03:00.000Z" },
    { failedAt: "2026-05-15T08:02:00.000Z" },
  ]), "2026-05-15T08:03:00.000Z");
  assert.deepEqual(sortMessagesChronologically([
    { id: "assistant", role: "assistant", createdAt: "2026-05-15T08:00:00.000Z" },
    { id: "user", role: "user", createdAt: "2026-05-15T08:00:00.000Z" },
  ]).map((message) => message.id), ["user", "assistant"]);
}

console.log("single-window-migration-service tests passed");
