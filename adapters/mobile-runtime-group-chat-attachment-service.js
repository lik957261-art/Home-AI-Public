"use strict";

const path = require("node:path");
const { createGroupChatSharedAttachmentService } = require("./group-chat-shared-attachment-service");

function safeStorageSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function createMobileRuntimeGroupChatAttachmentService(options = {}) {
  const groupDeliveriesDir = String(options.groupDeliveriesDir || "");
  const groupChatTaskGroupId = String(options.groupChatTaskGroupId || "group-chat");
  const safeFileName = typeof options.safeFileName === "function"
    ? options.safeFileName
    : ((value) => path.basename(String(value || "file")) || "file");
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : ((value) => String(value || "").trim());
  const isProtectedPath = typeof options.isProtectedPath === "function" ? options.isProtectedPath : (() => false);
  const samePath = typeof options.samePath === "function"
    ? options.samePath
    : ((a, b) => path.resolve(String(a || "")) === path.resolve(String(b || "")));
  const windowsPathToWsl = typeof options.windowsPathToWsl === "function" ? options.windowsPathToWsl : ((value) => value);
  const listArtifacts = typeof options.listArtifacts === "function" ? options.listArtifacts : (() => []);
  let sharedAttachmentService = null;

  function getSharedAttachmentService() {
    if (!sharedAttachmentService) {
      sharedAttachmentService = createGroupChatSharedAttachmentService({
        groupDeliveriesDir,
        groupChatTaskGroupId,
        safeStorageSegment,
        safeFileName,
        normalizeLocalPath,
        isProtectedPath,
        samePath,
        windowsPathToWsl,
        listArtifacts,
      });
    }
    return sharedAttachmentService;
  }

  return {
    ensureGroupChatSharedArtifactCopies(thread, latestUserMessage, deliveryRoot) {
      return getSharedAttachmentService().ensureSharedArtifactCopies(thread, latestUserMessage, deliveryRoot);
    },
    groupChatDeliveryRootForThread(thread) {
      return getSharedAttachmentService().deliveryRootForThread(thread);
    },
    safeArtifactCopyName(artifact = {}, index = 0) {
      return getSharedAttachmentService().safeArtifactCopyName(artifact, index);
    },
    safeStorageSegment,
    storedArtifactForMessageArtifact(artifact = {}) {
      return getSharedAttachmentService().storedArtifactForMessageArtifact(artifact);
    },
  };
}

module.exports = {
  createMobileRuntimeGroupChatAttachmentService,
  safeStorageSegment,
};
