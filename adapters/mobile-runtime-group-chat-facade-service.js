"use strict";

function requireFunction(options, name) {
  const value = options[name];
  if (typeof value !== "function") {
    throw new Error(`mobile runtime group chat facade requires ${name}`);
  }
  return value;
}

function createMobileRuntimeGroupChatFacadeService(options = {}) {
  const groupChatTaskGroupId = String(options.groupChatTaskGroupId || "group-chat").trim() || "group-chat";
  const groupMessageRevokedText = String(options.groupMessageRevokedText || "Message revoked");
  const isOwnerAuth = requireFunction(options, "isOwnerAuth");
  const normalizeChatGroup = requireFunction(options, "normalizeChatGroup");
  const senderInfoForWorkspace = requireFunction(options, "senderInfoForWorkspace");
  const workspaceLabel = requireFunction(options, "workspaceLabel");

  function publicChatGroup(thread) {
    const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
    return {
      enabled: group.enabled,
      kind: group.kind || "",
      topicKey: group.topicKey || "",
      memberWorkspaceIds: group.memberWorkspaceIds,
      members: group.memberWorkspaceIds.map((workspaceId) => ({
        workspaceId,
        label: workspaceLabel(workspaceId),
      })),
      createdAt: group.createdAt || "",
      updatedAt: group.updatedAt || "",
    };
  }

  function groupMessageRevoker(auth) {
    const workspaceId = isOwnerAuth(auth) ? "owner" : String(auth?.workspaceId || "").trim();
    return senderInfoForWorkspace(workspaceId || "owner");
  }

  function canRevokeGroupChatMessage(auth, thread, message) {
    if (!auth?.ok || !thread?.singleWindow || !message) return false;
    if (message.role !== "user") return false;
    if (message.taskGroupId !== groupChatTaskGroupId) return false;
    if (message.revokedAt) return false;
    if (isOwnerAuth(auth)) return true;
    const workspaceId = String(auth.workspaceId || "").trim();
    return Boolean(workspaceId && workspaceId === String(message.senderWorkspaceId || "").trim());
  }

  function groupAssistantReplyForUserMessage(thread, userMessage) {
    const messages = thread?.messages || [];
    const index = messages.findIndex((message) => message.id === userMessage?.id);
    if (index < 0) return null;
    const assistant = messages[index + 1];
    if (
      assistant?.role === "assistant"
      && assistant.taskGroupId === groupChatTaskGroupId
      && assistant.messageKind !== "plain"
    ) {
      return assistant;
    }
    return null;
  }

  function revokeGroupMessagePayload(message, now, revoker, text) {
    message.content = text || groupMessageRevokedText;
    message.revokedAt = now;
    message.revokedByWorkspaceId = revoker.senderWorkspaceId || "";
    message.revokedByPrincipalId = revoker.senderPrincipalId || "";
    message.revokedByLabel = revoker.senderLabel || "";
    message.error = null;
    message.artifacts = [];
    message.usage = null;
    message.directoryAliases = [];
    message.directoryRoute = null;
    message.updatedAt = now;
  }

  return {
    canRevokeGroupChatMessage,
    groupAssistantReplyForUserMessage,
    groupMessageRevoker,
    publicChatGroup,
    revokeGroupMessagePayload,
  };
}

module.exports = {
  createMobileRuntimeGroupChatFacadeService,
};
