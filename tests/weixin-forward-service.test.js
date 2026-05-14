"use strict";

const assert = require("node:assert/strict");
const {
  compactWeixinForwardTarget,
  createWeixinForwardService,
} = require("../adapters/weixin-forward-service");

function makeService(overrides = {}) {
  const state = {
    threads: [
      {
        id: "thread-a",
        workspaceId: "owner",
        updatedAt: "2026-05-14T10:00:00.000Z",
        messages: [
          {
            id: "msg-old",
            updatedAt: "2026-05-14T10:01:00.000Z",
            externalIngress: {
              source: "weixin",
              accountId: "wx-owner",
              chatId: "chat-owner",
              userId: "",
              updatedAt: "2026-05-14T10:01:00.000Z",
            },
          },
          {
            id: "msg-new",
            updatedAt: "2026-05-14T10:03:00.000Z",
            externalDelivery: {
              source: "weixin",
              accountId: "wx-owner",
              chatId: "chat-owner",
              userId: "",
              updatedAt: "2026-05-14T10:03:00.000Z",
            },
          },
        ],
      },
      {
        id: "thread-group",
        workspaceId: "reviewer",
        updatedAt: "2026-05-14T10:02:00.000Z",
        groupMembers: ["owner", "reviewer"],
        messages: [
          {
            id: "msg-group",
            externalIngress: {
              source: "weixin",
              accountId: "wx-group",
              chatId: "chat-group",
              userId: "user-group",
            },
          },
        ],
      },
      {
        id: "thread-hidden",
        workspaceId: "blocked",
        messages: [
          {
            id: "msg-hidden",
            externalIngress: {
              source: "weixin",
              accountId: "wx-hidden",
              chatId: "chat-hidden",
            },
          },
        ],
      },
    ],
  };
  return createWeixinForwardService(Object.assign({
    state: () => state,
    authCanAccessWorkspace(auth, workspaceId) {
      return Boolean(auth?.ok && (auth.workspaceId === "owner" || auth.workspaceId === workspaceId));
    },
    chatGroupMemberWorkspaceIds(thread) {
      return Array.isArray(thread.groupMembers) ? thread.groupMembers : [];
    },
    findWorkspace(workspaceId) {
      if (workspaceId === "missing") return null;
      return {
        id: workspaceId,
        label: workspaceId === "owner" ? "Owner" : workspaceId,
        policy: workspaceId === "owner"
          ? { adapter_account_id: "wx-owner", chat_id: "chat-owner" }
          : { adapter_account_id: `wx-${workspaceId}`, chat_id: `chat-${workspaceId}` },
      };
    },
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner";
    },
    threadAccessibleToAuth(auth, thread) {
      return Boolean(
        auth?.workspaceId === "owner"
          || thread.workspaceId === auth?.workspaceId
          || (Array.isArray(thread.groupMembers) && thread.groupMembers.includes(auth?.workspaceId))
      );
    },
    workspaceLabel(workspaceId) {
      return `Workspace ${workspaceId}`;
    },
  }, overrides));
}

function testCompactTarget() {
  assert.equal(compactWeixinForwardTarget({ chatId: "chat-only" }), null);
  assert.deepEqual(compactWeixinForwardTarget({
    account_id: " wx ",
    chat_id: " chat ",
    user_id: "",
    targetLabel: " Mobile ",
    workspace_id: " owner ",
    outbound_status: "ok",
  }), {
    source: "weixin",
    type: "weixin",
    label: "Mobile",
    accountId: "wx",
    chatId: "chat",
    userId: "",
    workspaceId: "owner",
    threadId: "",
    messageId: "",
    outboundStatus: "ok",
    updatedAt: "",
  });
}

function testTargetsForWorkspace() {
  const service = makeService();
  const targets = service.targetsForWorkspace("owner", { ok: true, workspaceId: "owner" });

  assert.deepEqual(targets.map((target) => [target.accountId, target.chatId, target.messageId]), [
    ["wx-owner", "chat-owner", "msg-new"],
    ["wx-group", "chat-group", "msg-group"],
  ]);
  assert.equal(targets[0].label, "Workspace owner");
  assert.equal(targets.some((target) => target.accountId === "wx-hidden"), false);
}

function testWorkspaceAccessAndMissingWorkspaceFailClosed() {
  const service = makeService();
  assert.deepEqual(service.targetsForWorkspace("missing", { ok: true, workspaceId: "owner" }), []);
  assert.deepEqual(service.targetsForWorkspace("blocked", { ok: true, workspaceId: "child" }), []);
}

function testResolveTarget() {
  const service = makeService();
  const owner = { ok: true, workspaceId: "owner" };
  const child = { ok: true, workspaceId: "child" };

  assert.equal(service.resolveTarget({}, owner, "owner").accountId, "wx-owner");
  assert.deepEqual(service.resolveTarget({
    target: { accountId: "wx-child", chatId: "chat-child" },
  }, child, "child"), {
    source: "weixin",
    type: "weixin",
    label: "Weixin",
    accountId: "wx-child",
    chatId: "chat-child",
    userId: "",
    workspaceId: "child",
    threadId: "",
    messageId: "",
    outboundStatus: "",
    updatedAt: "",
  });
  assert.equal(service.resolveTarget({
    accountId: "wx-other",
    chatId: "chat-other",
  }, owner, "owner").accountId, "wx-other");

  assert.throws(
    () => service.resolveTarget({ accountId: "wx-other", chatId: "chat-other" }, child, "owner"),
    /not allowed/,
  );
  assert.throws(
    () => service.resolveTarget({}, child, "blocked"),
    /No Weixin forwarding target/,
  );
}

testCompactTarget();
testTargetsForWorkspace();
testWorkspaceAccessAndMissingWorkspaceFailClosed();
testResolveTarget();

console.log("weixin-forward-service tests passed");
