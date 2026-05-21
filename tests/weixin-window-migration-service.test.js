"use strict";

const assert = require("node:assert/strict");
const {
  createWeixinWindowMigrationService,
  latestMessageTimestamp,
  messageBelongsToWeixinWindow,
  sortMessagesChronologically,
} = require("../adapters/weixin-window-migration-service");

function makeService(state, extra = {}) {
  let idCounter = 0;
  const calls = { saveState: [], threadKey: [] };
  const service = createWeixinWindowMigrationService(Object.assign({
    state,
    nowIso: () => "2026-05-15T10:00:00.000Z",
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    createSingleWindowThread(workspaceId, overrides = {}) {
      return Object.assign({
        id: `weixin-${workspaceId}`,
        title: "Single Window",
        workspaceId,
        singleWindow: true,
        createdAt: "2026-05-15T10:00:00.000Z",
        updatedAt: "2026-05-15T10:00:00.000Z",
        messages: [],
        events: [],
      }, overrides);
    },
    normalizeChatGroup(value) {
      return {
        enabled: Boolean(value?.enabled),
        kind: String(value?.kind || ""),
        memberWorkspaceIds: Array.isArray(value?.memberWorkspaceIds) ? value.memberWorkspaceIds : [],
      };
    },
    normalizeExternalIngress(value) {
      return Object.assign({}, value, { normalizedIngress: true });
    },
    normalizeExternalDelivery(value) {
      return Object.assign({}, value, { normalizedDelivery: true });
    },
    weixinIngressProvider: {
      threadKey(source) {
        calls.threadKey.push(source);
        return `route:${source.accountId || source.account_id}:${source.chatId || source.chat_id || source.userId || source.user_id}`;
      },
    },
    saveState(nextState, options) {
      calls.saveState.push({ state: nextState, options });
    },
  }, extra));
  return { service, calls };
}

{
  const state = {
    threads: [
      {
        id: "private-child",
        workspaceId: "child",
        singleWindow: true,
        createdAt: "2026-05-15T09:00:00.000Z",
        updatedAt: "2026-05-15T09:09:00.000Z",
        messages: [
          {
            id: "ordinary",
            role: "user",
            content: "ordinary task",
            taskGroupId: "task-ordinary",
            createdAt: "2026-05-15T09:00:00.000Z",
            updatedAt: "2026-05-15T09:00:00.000Z",
          },
          {
            id: "wx-ingress",
            role: "user",
            content: "inbound",
            taskGroupId: "task-old",
            externalIngress: {
              source: "weixin",
              accountId: "acct-a",
              chatId: "chat-a",
              eventId: "event-a",
              senderLabel: "sender-a",
              createdAt: "2026-05-15T09:01:00.000Z",
              updatedAt: "2026-05-15T09:01:00.000Z",
            },
            createdAt: "2026-05-15T09:01:00.000Z",
            updatedAt: "2026-05-15T09:01:00.000Z",
            artifacts: [{ id: "artifact-inline-ingress" }],
          },
          {
            id: "wx-delivery",
            role: "assistant",
            content: "reply",
            taskGroupId: "task-old",
            externalDelivery: {
              source: "weixin",
              accountId: "acct-a",
              chatId: "chat-a",
              status: "pending",
            },
            createdAt: "2026-05-15T09:02:00.000Z",
            updatedAt: "2026-05-15T09:03:00.000Z",
          },
          {
            id: "wx-routing",
            role: "assistant",
            taskGroupId: "task-old",
            runOptions: { gatewayRouting: { source: "weixin" } },
            createdAt: "2026-05-15T09:04:00.000Z",
            completedAt: "2026-05-15T09:06:00.000Z",
          },
        ],
      },
    ],
    artifacts: [
      { id: "artifact-inline-ingress", threadId: "private-child", messageId: "wx-ingress" },
      { id: "artifact-stored-delivery", threadId: "private-child", messageId: "wx-delivery" },
      { id: "artifact-ordinary", threadId: "private-child", messageId: "ordinary" },
    ],
  };
  const { service, calls } = makeService(state);
  const target = service.migrateWeixinMessagesToDedicatedThread("child");

  assert.equal(target.id, "weixin-child");
  assert.equal(target.title, "Weixin");
  assert.equal(target.externalIngress.source, "weixin");
  assert.equal(target.externalIngress.threadKey, "route:acct-a:chat-a");
  assert.equal(target.externalIngress.normalizedIngress, true);
  assert.equal(calls.threadKey.length, 1);
  assert.equal(state.threads[0].id, "weixin-child");
  assert.deepEqual(target.messages.map((message) => message.id), ["wx-ingress", "wx-delivery", "wx-routing"]);
  assert.deepEqual(target.messages.map((message) => message.taskGroupId), ["chat", "chat", "chat"]);
  assert.deepEqual(target.messages.map((message) => message.singleWindowMode), ["chat", "chat", "chat"]);
  const movedDelivery = target.messages.find((message) => message.id === "wx-delivery").externalDelivery;
  assert.equal(movedDelivery.threadId, "weixin-child");
  assert.equal(movedDelivery.taskGroupId, "chat");
  assert.equal(movedDelivery.updatedAt, "2026-05-15T09:03:00.000Z");
  assert.equal(movedDelivery.normalizedDelivery, true);
  assert.deepEqual(state.threads.find((thread) => thread.id === "private-child").messages.map((message) => message.id), ["ordinary"]);
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-inline-ingress").threadId, "weixin-child");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-stored-delivery").threadId, "weixin-child");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-ordinary").threadId, "private-child");
  assert.deepEqual(calls.saveState[0].options, { reason: "weixin-single-window-split", forceBackup: true });
}

{
  const state = {
    threads: [
      {
        id: "target",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "weixin" },
        createdAt: "2026-05-15T08:00:00.000Z",
        updatedAt: "2026-05-15T08:10:00.000Z",
        messages: [
          { id: "duplicate", role: "user", taskGroupId: "chat", createdAt: "2026-05-15T08:01:00.000Z" },
        ],
      },
      {
        id: "active-source",
        workspaceId: "child",
        singleWindow: true,
        activeRunIds: ["run-active"],
        messages: [
          { id: "active-wx", role: "user", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:02:00.000Z" },
        ],
      },
      {
        id: "queued-source",
        workspaceId: "child",
        singleWindow: true,
        messages: [
          { id: "queued-wx", role: "user", status: "queued", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:03:00.000Z" },
        ],
      },
      {
        id: "source",
        workspaceId: "child",
        singleWindow: true,
        messages: [
          { id: "duplicate", role: "user", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:01:00.000Z" },
          { id: "new-wx", role: "assistant", externalDelivery: { source: "weixin" }, createdAt: "2026-05-15T08:04:00.000Z" },
        ],
      },
    ],
    artifacts: [
      { id: "artifact-active", threadId: "active-source", messageId: "active-wx" },
      { id: "artifact-new", threadId: "source", messageId: "new-wx" },
    ],
  };
  const { service, calls } = makeService(state);
  const target = service.migrateWeixinMessagesToDedicatedThread("child");

  assert.equal(target.id, "target");
  assert.deepEqual(target.messages.map((message) => message.id), ["duplicate", "new-wx"]);
  assert.deepEqual(state.threads.find((thread) => thread.id === "source").messages, []);
  assert.deepEqual(state.threads.find((thread) => thread.id === "active-source").messages.map((message) => message.id), ["active-wx"]);
  assert.deepEqual(state.threads.find((thread) => thread.id === "queued-source").messages.map((message) => message.id), ["queued-wx"]);
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-active").threadId, "active-source");
  assert.equal(state.artifacts.find((artifact) => artifact.id === "artifact-new").threadId, "target");
  assert.equal(calls.saveState.length, 1);
}

{
  const state = {
    threads: [
      {
        id: "group-source",
        workspaceId: "child",
        singleWindow: true,
        chatGroup: { enabled: true },
        messages: [{ id: "group-wx", role: "user", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:00:00.000Z" }],
      },
      {
        id: "already-weixin",
        workspaceId: "child",
        singleWindow: true,
        externalIngress: { source: "weixin" },
        messages: [{ id: "existing-wx", role: "user", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:01:00.000Z" }],
      },
      {
        id: "other-workspace",
        workspaceId: "other",
        singleWindow: true,
        messages: [{ id: "other-wx", role: "user", externalIngress: { source: "weixin" }, createdAt: "2026-05-15T08:02:00.000Z" }],
      },
    ],
    artifacts: [],
  };
  const { service, calls } = makeService(state);

  assert.equal(service.migrateWeixinMessagesToDedicatedThread("child").id, "already-weixin");
  assert.deepEqual(state.threads.find((thread) => thread.id === "group-source").messages.map((message) => message.id), ["group-wx"]);
  assert.deepEqual(state.threads.find((thread) => thread.id === "already-weixin").messages.map((message) => message.id), ["existing-wx"]);
  assert.deepEqual(state.threads.find((thread) => thread.id === "other-workspace").messages.map((message) => message.id), ["other-wx"]);
  assert.equal(calls.saveState.length, 0);
}

{
  const state = { threads: [], artifacts: [] };
  const { service, calls } = makeService(state);

  assert.equal(service.migrateWeixinMessagesToDedicatedThread(""), null);
  assert.equal(service.findWeixinSingleWindowThreadForWorkspace("child"), null);
  assert.equal(calls.saveState.length, 0);
}

{
  assert.equal(messageBelongsToWeixinWindow({ externalIngress: { source: "weixin" } }), true);
  assert.equal(messageBelongsToWeixinWindow({ externalDelivery: { source: "weixin" } }), true);
  assert.equal(messageBelongsToWeixinWindow({ runOptions: { gatewayRouting: { source: "weixin" } } }), true);
  assert.equal(messageBelongsToWeixinWindow({ externalIngress: { source: "mail" } }), false);
  assert.equal(latestMessageTimestamp([
    { createdAt: "2026-05-15T08:00:00.000Z" },
    { failedAt: "2026-05-15T08:02:00.000Z" },
    { completedAt: "2026-05-15T08:03:00.000Z" },
  ]), "2026-05-15T08:03:00.000Z");
  assert.deepEqual(sortMessagesChronologically([
    { id: "assistant", role: "assistant", createdAt: "2026-05-15T08:00:00.000Z" },
    { id: "user", role: "user", createdAt: "2026-05-15T08:00:00.000Z" },
  ]).map((message) => message.id), ["user", "assistant"]);
}

console.log("weixin-window-migration-service tests passed");
