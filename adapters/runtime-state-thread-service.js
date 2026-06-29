"use strict";

function requireFn(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`runtime state thread service requires ${name}`);
  return deps[name];
}

function createRuntimeStateThreadService(deps = {}) {
  const state = requireFn(deps, "state");
  const authenticateRequest = requireFn(deps, "authenticateRequest");
  const authCanAccessWorkspace = requireFn(deps, "authCanAccessWorkspace");
  const chatGroupMemberWorkspaceIds = requireFn(deps, "chatGroupMemberWorkspaceIds");
  const saveState = requireFn(deps, "saveState");
  const groupChatTaskGroupId = String(deps.groupChatTaskGroupId || "group-chat");

  function stateObject() {
    const current = state();
    if (!current || typeof current !== "object") throw new Error("runtime state thread service requires state");
    if (!Array.isArray(current.threads)) current.threads = [];
    if (!Array.isArray(current.artifacts)) current.artifacts = [];
    return current;
  }

  function messageContainsArtifact(message, artifact) {
    const artifactId = String(artifact?.id || "");
    if (!message || !artifactId) return false;
    return (message.artifacts || []).some((item) => String(item?.id || "") === artifactId);
  }

  function groupChatArtifactAccessibleToAuth(auth, thread, artifact) {
    if (!auth?.ok || !auth.workspaceId || !thread?.singleWindow) return false;
    if (!chatGroupMemberWorkspaceIds(thread).includes(auth.workspaceId)) return false;
    const message = (thread.messages || []).find((item) => String(item?.id || "") === String(artifact?.messageId || ""));
    return Boolean(message?.taskGroupId === groupChatTaskGroupId && messageContainsArtifact(message, artifact));
  }

  function artifactAccessibleToAuth(auth, thread, artifact) {
    if (authCanAccessWorkspace(auth, thread?.workspaceId || "")) return true;
    return groupChatArtifactAccessibleToAuth(auth, thread, artifact);
  }

  function findArtifactReference(artifact) {
    const artifactId = String(artifact?.id || "");
    if (!artifactId) return null;
    for (const thread of stateObject().threads || []) {
      for (const message of thread.messages || []) {
        if (messageContainsArtifact(message, artifact)) return { thread, message };
      }
    }
    return null;
  }

  function findArtifactReferenceById(artifactId) {
    const id = String(artifactId || "");
    if (!id) return null;
    for (const thread of stateObject().threads || []) {
      for (const message of thread.messages || []) {
        const artifact = (message.artifacts || []).find((item) => String(item?.id || "") === id);
        if (artifact) return { thread, message, artifact };
      }
    }
    return null;
  }

  function threadAccessibleToAuth(auth, thread) {
    if (!thread) return false;
    if (authCanAccessWorkspace(auth, thread.workspaceId)) return true;
    if (!auth?.ok || !auth.workspaceId) return false;
    return chatGroupMemberWorkspaceIds(thread).includes(auth.workspaceId);
  }

  function threadAccessibleToRequest(req, thread) {
    return threadAccessibleToAuth(authenticateRequest(req), thread);
  }

  function findThreadForRequest(req, threadId) {
    const thread = stateObject().threads.find((item) => item.id === String(threadId || ""));
    return threadAccessibleToRequest(req, thread) ? thread : null;
  }

  function findThreadForAuth(auth, threadId) {
    const thread = stateObject().threads.find((item) => item.id === String(threadId || ""));
    return threadAccessibleToAuth(auth, thread) ? thread : null;
  }

  function isDiscardableEmptyThread(thread) {
    const current = stateObject();
    const threadId = String(thread?.id || "");
    const hasArtifacts = (current.artifacts || []).some((artifact) => String(artifact.threadId || "") === threadId);
    const timestamp = Date.parse(thread?.updatedAt || thread?.createdAt || "");
    const oldEnough = !Number.isFinite(timestamp) || Date.now() - timestamp > 60_000;
    return Boolean(
      thread
      && !thread.singleWindow
      && !(thread.messages || []).length
      && !(thread.activeRunId || (thread.activeRunIds || []).length)
      && !hasArtifacts
      && oldEnough
    );
  }

  function pruneEmptyThreads() {
    const current = stateObject();
    const removedIds = new Set();
    current.threads = (current.threads || []).filter((thread) => {
      if (!isDiscardableEmptyThread(thread)) return true;
      removedIds.add(thread.id);
      return false;
    });
    if (!removedIds.size) return 0;
    current.artifacts = (current.artifacts || []).filter((artifact) => !removedIds.has(String(artifact.threadId || "")));
    saveState();
    return removedIds.size;
  }

  function buildUserMessageContent(text, artifacts) {
    const current = stateObject();
    const lines = [];
    if (String(text || "").trim()) lines.push(String(text).trim());
    for (const item of artifacts || []) {
      const id = String(item?.id || "");
      const artifact = current.artifacts.find((candidate) => candidate.id === id);
      if (artifact?.path) lines.push(`MEDIA:${artifact.path}`);
    }
    return lines.join("\n\n").trim();
  }

  function storedGatewayUrlForRun(runId) {
    for (const thread of stateObject().threads || []) {
      const message = (thread.messages || []).find((item) => item.runId === runId);
      if (message?.gatewayUrl) return String(message.gatewayUrl || "");
    }
    return "";
  }

  return Object.freeze({
    artifactAccessibleToAuth,
    buildUserMessageContent,
    findArtifactReference,
    findArtifactReferenceById,
    findThreadForAuth,
    findThreadForRequest,
    groupChatArtifactAccessibleToAuth,
    isDiscardableEmptyThread,
    messageContainsArtifact,
    pruneEmptyThreads,
    storedGatewayUrlForRun,
    threadAccessibleToAuth,
    threadAccessibleToRequest,
  });
}

module.exports = {
  createRuntimeStateThreadService,
};
