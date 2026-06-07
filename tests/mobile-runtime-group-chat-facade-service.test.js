"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeGroupChatFacadeService } = require("../adapters/mobile-runtime-group-chat-facade-service");

function createService(overrides = {}) {
  return createMobileRuntimeGroupChatFacadeService(Object.assign({
    groupChatTaskGroupId: "group-chat",
    groupMessageRevokedText: "revoked",
    isOwnerAuth: (auth) => auth?.role === "owner",
    normalizeChatGroup: (group, ownerWorkspaceId) => ({
      enabled: Boolean(group.enabled),
      kind: group.kind || "workspace",
      topicKey: group.topicKey || "",
      memberWorkspaceIds: group.memberWorkspaceIds || [ownerWorkspaceId],
      createdAt: group.createdAt || "",
      updatedAt: group.updatedAt || "",
    }),
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: `principal:${workspaceId}`,
      senderLabel: `Label ${workspaceId}`,
    }),
    workspaceLabel: (workspaceId) => `Workspace ${workspaceId}`,
  }, overrides));
}

function testPublicChatGroupProjection() {
  const service = createService();
  assert.deepEqual(service.publicChatGroup({
    workspaceId: "owner",
    chatGroup: {
      enabled: true,
      kind: "workspace",
      topicKey: "topic",
      memberWorkspaceIds: ["owner", "child"],
      createdAt: "c",
      updatedAt: "u",
    },
  }), {
    enabled: true,
    kind: "workspace",
    topicKey: "topic",
    memberWorkspaceIds: ["owner", "child"],
    members: [
      { workspaceId: "owner", label: "Workspace owner" },
      { workspaceId: "child", label: "Workspace child" },
    ],
    createdAt: "c",
    updatedAt: "u",
  });
}

function testRevokePermission() {
  const service = createService();
  const thread = { singleWindow: true };
  const message = { role: "user", taskGroupId: "group-chat", senderWorkspaceId: "child" };
  assert.equal(service.canRevokeGroupChatMessage({ ok: true, role: "owner" }, thread, message), true);
  assert.equal(service.canRevokeGroupChatMessage({ ok: true, workspaceId: "child" }, thread, message), true);
  assert.equal(service.canRevokeGroupChatMessage({ ok: true, workspaceId: "other" }, thread, message), false);
  assert.equal(service.canRevokeGroupChatMessage({ ok: true, workspaceId: "child" }, thread, Object.assign({}, message, { revokedAt: "now" })), false);
  assert.equal(service.canRevokeGroupChatMessage({ ok: true, workspaceId: "child" }, { singleWindow: false }, message), false);
}

function testAssistantPairAndPayloadMutation() {
  const service = createService();
  const user = { id: "u1", role: "user", taskGroupId: "group-chat", messageKind: "ai" };
  const assistant = { id: "a1", role: "assistant", taskGroupId: "group-chat", messageKind: "ai" };
  assert.equal(service.groupAssistantReplyForUserMessage({ messages: [user, assistant] }, user), assistant);
  assert.equal(service.groupAssistantReplyForUserMessage({ messages: [user, Object.assign({}, assistant, { messageKind: "plain" })] }, user), null);

  const message = {
    content: "original",
    error: "err",
    artifacts: [{ id: "a" }],
    usage: { input: 1 },
    directoryAliases: [{ alias: "d" }],
    directoryRoute: { path: "x" },
  };
  service.revokeGroupMessagePayload(message, "2026-06-07T00:00:00.000Z", {
    senderWorkspaceId: "child",
    senderPrincipalId: "principal:child",
    senderLabel: "Child",
  });
  assert.equal(message.content, "revoked");
  assert.equal(message.revokedByWorkspaceId, "child");
  assert.equal(message.revokedByPrincipalId, "principal:child");
  assert.equal(message.revokedByLabel, "Child");
  assert.deepEqual(message.artifacts, []);
  assert.equal(message.usage, null);
  assert.deepEqual(message.directoryAliases, []);
  assert.equal(message.directoryRoute, null);
}

function testRequiredDependencyGuard() {
  assert.throws(
    () => createService({ senderInfoForWorkspace: null }),
    /requires senderInfoForWorkspace/,
  );
}

testPublicChatGroupProjection();
testRevokePermission();
testAssistantPairAndPayloadMutation();
testRequiredDependencyGuard();
console.log("mobile-runtime-group-chat-facade-service tests passed");
