"use strict";

const fs = require("node:fs");
const path = require("node:path");

function defaultSafeSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function createGroupChatSharedAttachmentService(options = {}) {
  const groupDeliveriesDir = String(options.groupDeliveriesDir || "").trim();
  const groupChatTaskGroupId = String(options.groupChatTaskGroupId || "group-chat").trim();
  const safeStorageSegment = typeof options.safeStorageSegment === "function"
    ? options.safeStorageSegment
    : defaultSafeSegment;
  const safeFileName = typeof options.safeFileName === "function"
    ? options.safeFileName
    : ((value) => path.basename(String(value || "file")) || "file");
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : ((value) => String(value || "").trim());
  const isProtectedPath = typeof options.isProtectedPath === "function" ? options.isProtectedPath : (() => false);
  const samePath = typeof options.samePath === "function" ? options.samePath : ((a, b) => path.resolve(a) === path.resolve(b));
  const windowsPathToWsl = typeof options.windowsPathToWsl === "function" ? options.windowsPathToWsl : ((value) => value);
  const listArtifacts = typeof options.listArtifacts === "function" ? options.listArtifacts : (() => []);

  function deliveryRootForThread(thread) {
    return path.join(groupDeliveriesDir, safeStorageSegment(thread?.id || "thread"));
  }

  function sharedAttachmentRootForThread(thread) {
    return path.join(deliveryRootForThread(thread), "shared-attachments");
  }

  function storedArtifactForMessageArtifact(artifact = {}) {
    const id = String(artifact?.id || "").trim();
    const stored = id ? (listArtifacts() || []).find((item) => String(item.id || "") === id) : null;
    return Object.assign({}, artifact || {}, stored || {});
  }

  function messagesForRun(thread, latestUserMessage) {
    if (!thread?.singleWindow || latestUserMessage?.taskGroupId !== groupChatTaskGroupId) return [];
    const messages = thread.messages || [];
    const latestIndex = messages.findIndex((message) => String(message?.id || "") === String(latestUserMessage?.id || ""));
    return messages
      .slice(0, latestIndex >= 0 ? latestIndex + 1 : messages.length)
      .filter((message) => message?.taskGroupId === groupChatTaskGroupId)
      .filter((message) => !message.revokedAt);
  }

  function safeArtifactCopyName(artifact = {}, index = 0) {
    const id = String(artifact.id || "").trim() || `artifact-${index + 1}`;
    const name = safeFileName(artifact.name || artifact.path || id);
    return `${safeStorageSegment(id)}-${name}`;
  }

  function ensureSharedArtifactCopies(thread, latestUserMessage, deliveryRoot) {
    if (!deliveryRoot || latestUserMessage?.taskGroupId !== groupChatTaskGroupId) return [];
    const messages = messagesForRun(thread, latestUserMessage);
    const copyRoot = path.join(deliveryRoot, "shared-attachments");
    const copies = [];
    const seen = new Set();
    fs.mkdirSync(copyRoot, { recursive: true });
    for (const message of messages) {
      for (const messageArtifact of Array.isArray(message.artifacts) ? message.artifacts : []) {
        const artifact = storedArtifactForMessageArtifact(messageArtifact);
        const artifactId = String(artifact.id || messageArtifact.id || "").trim();
        const rawPath = String(artifact.path || artifact.localPath || artifact.displayPath || "").trim();
        const localPath = normalizeLocalPath(rawPath) || rawPath;
        const key = artifactId || localPath.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!localPath || isProtectedPath(localPath) || isProtectedPath(rawPath)) continue;
        let stat = null;
        try {
          stat = fs.statSync(localPath);
        } catch (_) {
          continue;
        }
        if (!stat.isFile()) continue;
        const copyPath = path.join(copyRoot, safeArtifactCopyName(artifact, copies.length));
        try {
          if (!samePath(localPath, copyPath)) fs.copyFileSync(localPath, copyPath);
        } catch (_) {
          continue;
        }
        copies.push({
          id: artifactId,
          name: artifact.name || path.basename(localPath),
          originalPath: rawPath || localPath,
          copyPath,
          copyPathForModel: windowsPathToWsl(copyPath) || copyPath,
          messageId: message.id || "",
          senderWorkspaceId: message.senderWorkspaceId || "",
        });
      }
    }
    return copies;
  }

  return {
    deliveryRootForThread,
    ensureSharedArtifactCopies,
    messagesForRun,
    safeArtifactCopyName,
    sharedAttachmentRootForThread,
    storedArtifactForMessageArtifact,
  };
}

module.exports = {
  createGroupChatSharedAttachmentService,
};
