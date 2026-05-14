"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGroupChatSharedAttachmentService } = require("../adapters/group-chat-shared-attachment-service");

function withTempDir(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-group-attachments-"));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createService(root, overrides = {}) {
  const artifacts = overrides.artifacts || [];
  return createGroupChatSharedAttachmentService(Object.assign({
    groupDeliveriesDir: path.join(root, "deliveries"),
    groupChatTaskGroupId: "group-chat",
    safeStorageSegment: (value, fallback = "item") => String(value || fallback).replace(/[^A-Za-z0-9_.:-]+/g, "_"),
    safeFileName: (value) => path.basename(String(value || "file")).replace(/[^A-Za-z0-9_. -]+/g, "_"),
    normalizeLocalPath: (value) => String(value || "").trim(),
    isProtectedPath: (value) => String(value || "").includes("protected"),
    samePath: (a, b) => path.resolve(a) === path.resolve(b),
    windowsPathToWsl: (value) => `/mnt/${String(value).replace(/\\/g, "/")}`,
    listArtifacts: () => artifacts,
  }, overrides));
}

function testDeliveryRootsAndMessageSelection() {
  withTempDir((root) => {
    const service = createService(root);
    const thread = {
      id: "thread bad/id",
      singleWindow: true,
      messages: [
        { id: "m1", taskGroupId: "group-chat" },
        { id: "m2", taskGroupId: "chat" },
        { id: "m3", taskGroupId: "group-chat", revokedAt: "x" },
        { id: "m4", taskGroupId: "group-chat" },
        { id: "m5", taskGroupId: "group-chat" },
      ],
    };
    assert.equal(service.deliveryRootForThread(thread), path.join(root, "deliveries", "thread_bad_id"));
    assert.equal(service.sharedAttachmentRootForThread(thread), path.join(root, "deliveries", "thread_bad_id", "shared-attachments"));
    assert.deepEqual(service.messagesForRun(thread, thread.messages[3]).map((item) => item.id), ["m1", "m4"]);
    assert.deepEqual(service.messagesForRun(Object.assign({}, thread, { singleWindow: false }), thread.messages[3]), []);
  });
}

function testSharedArtifactCopiesUseStoredArtifactsAndSkipUnsafeInputs() {
  withTempDir((root) => {
    const sourceFile = path.join(root, "source.md");
    const duplicateFile = path.join(root, "duplicate.md");
    const protectedFile = path.join(root, "protected.md");
    fs.writeFileSync(sourceFile, "hello", "utf8");
    fs.writeFileSync(duplicateFile, "duplicate", "utf8");
    fs.writeFileSync(protectedFile, "secret", "utf8");
    const service = createService(root, {
      artifacts: [
        { id: "stored-1", path: sourceFile, name: "stored.md" },
        { id: "protected-1", path: protectedFile, name: "protected.md" },
      ],
    });
    const thread = {
      id: "thread",
      singleWindow: true,
      messages: [
        {
          id: "m1",
          taskGroupId: "group-chat",
          senderWorkspaceId: "owner",
          artifacts: [
            { id: "stored-1", path: duplicateFile, name: "wrong.md" },
            { id: "stored-1", path: duplicateFile, name: "duplicate.md" },
            { id: "protected-1" },
            { id: "missing", path: path.join(root, "missing.md") },
          ],
        },
        {
          id: "m2",
          taskGroupId: "group-chat",
          senderWorkspaceId: "child",
          artifacts: [
            { id: "inline", path: duplicateFile, name: "inline.md" },
          ],
        },
      ],
    };
    const deliveryRoot = service.deliveryRootForThread(thread);
    const copies = service.ensureSharedArtifactCopies(thread, thread.messages[1], deliveryRoot);

    assert.equal(copies.length, 2);
    assert.equal(copies[0].id, "stored-1");
    assert.equal(copies[0].name, "stored.md");
    assert.equal(copies[0].originalPath, sourceFile);
    assert.equal(copies[0].messageId, "m1");
    assert.equal(copies[0].senderWorkspaceId, "owner");
    assert.equal(fs.readFileSync(copies[0].copyPath, "utf8"), "hello");
    assert.equal(copies[0].copyPathForModel.includes("/shared-attachments/"), true);
    assert.equal(copies[1].id, "inline");
    assert.equal(fs.readFileSync(copies[1].copyPath, "utf8"), "duplicate");
  });
}

function testNonGroupRunsDoNotCopy() {
  withTempDir((root) => {
    const service = createService(root);
    const file = path.join(root, "source.md");
    fs.writeFileSync(file, "hello", "utf8");
    const thread = {
      id: "thread",
      singleWindow: true,
      messages: [{ id: "m1", taskGroupId: "chat", artifacts: [{ id: "a", path: file }] }],
    };
    assert.deepEqual(service.ensureSharedArtifactCopies(thread, thread.messages[0], service.deliveryRootForThread(thread)), []);
  });
}

testDeliveryRootsAndMessageSelection();
testSharedArtifactCopiesUseStoredArtifactsAndSkipUnsafeInputs();
testNonGroupRunsDoNotCopy();

console.log("group-chat-shared-attachment-service tests passed");
