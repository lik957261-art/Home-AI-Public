"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createMobileRuntimeGroupChatAttachmentService,
  safeStorageSegment,
} = require("../adapters/mobile-runtime-group-chat-attachment-service");

assert.equal(safeStorageSegment("  bad/name 中文  "), "bad_name");
assert.equal(safeStorageSegment("", "fallback"), "fallback");
assert.equal(safeStorageSegment("a".repeat(120)).length, 96);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-group-chat-runtime-"));
try {
  const source = path.join(root, "source image.png");
  fs.writeFileSync(source, "image-bytes");
  const calls = { fileName: 0, normalize: 0, protected: 0, wsl: 0 };
  const service = createMobileRuntimeGroupChatAttachmentService({
    groupDeliveriesDir: path.join(root, "deliveries"),
    groupChatTaskGroupId: "group-chat",
    safeFileName(value) {
      calls.fileName += 1;
      return path.basename(String(value || "file")).replace(/\s+/g, "-");
    },
    normalizeLocalPath(value) {
      calls.normalize += 1;
      return String(value || "");
    },
    isProtectedPath() {
      calls.protected += 1;
      return false;
    },
    windowsPathToWsl(value) {
      calls.wsl += 1;
      return `wsl:${value}`;
    },
    listArtifacts() {
      return [{ id: "art-1", path: source, name: "source image.png" }];
    },
  });
  const thread = {
    id: "thread / one",
    singleWindow: true,
    messages: [{
      id: "msg-1",
      taskGroupId: "group-chat",
      artifacts: [{ id: "art-1", name: "ignored.png" }],
    }],
  };
  const latestUserMessage = thread.messages[0];
  const deliveryRoot = service.groupChatDeliveryRootForThread(thread);
  assert.match(deliveryRoot, /thread_one$/);
  const copies = service.ensureGroupChatSharedArtifactCopies(thread, latestUserMessage, deliveryRoot);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].id, "art-1");
  assert.equal(copies[0].copyPathForModel.startsWith("wsl:"), true);
  assert.equal(fs.existsSync(copies[0].copyPath), true);
  assert.ok(calls.fileName >= 1);
  assert.ok(calls.normalize >= 1);
  assert.ok(calls.protected >= 1);
  assert.ok(calls.wsl >= 1);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("mobile runtime group chat attachment service tests passed");
