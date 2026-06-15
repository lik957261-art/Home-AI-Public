"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  MAX_NOTE_RECEIPT_ATTACHMENTS,
  createNoteReceiptSaveService,
  extractNoteReceiptMetadata,
  receiptNoteTags,
  stripNoteReceiptMetadataComments,
  summarizeReceiptTitle,
} = require("../adapters/note-receipt-save-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hm-note-receipt-"));
}

function writeNoteBinding(dataDir, workspaceId = "owner") {
  const noteDir = path.join(dataDir, "drive", "users", workspaceId, ".hermes-note");
  fs.mkdirSync(noteDir, { recursive: true });
  fs.writeFileSync(path.join(noteDir, "access-key.txt"), "hnt_test_workspace_key\n", "utf8");
  fs.writeFileSync(path.join(noteDir, "config.json"), `${JSON.stringify({
    schema_version: 1,
    api_base_url: "http://127.0.0.1:4181",
    workspace_id: `note:${workspaceId}`,
    hermes_workspace_id: workspaceId,
    access_key_file: "access-key.txt",
  }, null, 2)}\n`, "utf8");
}

async function testSaveReceiptPostsBoundedBodyAndAttachments() {
  const dataDir = tempRoot();
  writeNoteBinding(dataDir, "owner");
  const artifactPath = path.join(dataDir, "receipt.md");
  fs.writeFileSync(artifactPath, "attachment body", "utf8");
  const fetchCalls = [];
  const service = createNoteReceiptSaveService({
    dataDir,
    fetch(url, options) {
      fetchCalls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ note: { id: "note-1", title: "remote title" } }),
      });
    },
    mimeFor: () => "text/markdown",
    resolveArtifactForRequest(artifactId, auth) {
      assert.equal(artifactId, "artifact-1");
      assert.deepEqual(auth, { workspaceId: "owner", ok: true });
      return {
        artifact: {
          id: artifactId,
          localPath: artifactPath,
          name: "receipt.md",
          mime: "text/markdown",
        },
      };
    },
  });

  const result = await service.saveReceipt({
    workspaceId: "owner",
    thread: { id: "thread-1", title: "衣橱测试" },
    message: {
      id: "msg-1",
      role: "assistant",
      createdAt: "2026-06-04T00:00:00.000Z",
      content: "今天的穿搭建议：白衬衫搭配黑裤，整体保持简洁。",
      artifacts: [{ id: "artifact-1", name: "receipt.md" }],
    },
    auth: { workspaceId: "owner", ok: true },
  });

  assert.deepEqual(result, {
    ok: true,
    note: { id: "note-1", title: "remote title", attachmentCount: 1 },
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://127.0.0.1:4181/api/v1/notes");
  assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer hnt_test_workspace_key");
  assert.equal(fetchCalls[0].options.headers["x-note-workspace-id"], "note:owner");
  assert.equal(fetchCalls[0].body.title, "\u56de\u6267 | 2026-06-04 | \u4eca\u5929\u7684\u7a7f\u642d\u5efa\u8bae\uff1a\u767d\u886c\u886b\u642d\u914d\u9ed1\u88e4\uff0c\u6574\u4f53\u4fdd\u6301\u7b80\u6d01\u3002");
  assert.match(fetchCalls[0].body.body, /今天的穿搭建议/);
  assert.deepEqual(fetchCalls[0].body.tags, ["hermes-receipt"]);
  assert.equal(fetchCalls[0].body.notebookId, "hermes");
  assert.equal(fetchCalls[0].body.attachments.length, 1);
  assert.equal(fetchCalls[0].body.attachments[0].name, "receipt.md");
  assert.equal(fetchCalls[0].body.attachments[0].kind, "document");
  assert.equal(fetchCalls[0].body.attachments[0].data_base64, Buffer.from("attachment body").toString("base64"));
  assert.equal(JSON.stringify(fetchCalls[0].body).includes(artifactPath), false);
  assert.equal(Object.hasOwn(fetchCalls[0].body.attachments[0], "path"), false);
  assert.equal(Object.hasOwn(fetchCalls[0].body.attachments[0], "url"), false);
}

async function testPluginReceiptUsesPluginTag() {
  const dataDir = tempRoot();
  writeNoteBinding(dataDir, "owner");
  const fetchCalls = [];
  const service = createNoteReceiptSaveService({
    dataDir,
    fetch(url, options) {
      fetchCalls.push({ url, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ note: { id: "note-wardrobe" } }),
      });
    },
    resolveArtifactForRequest() {
      throw new Error("unexpected resolver");
    },
  });

  await service.saveReceipt({
    workspaceId: "owner",
    thread: { id: "thread-1", title: "wardrobe topic" },
    message: {
      id: "msg-1",
      role: "assistant",
      taskGroupId: "plugin:wardrobe",
      content: "Wardrobe receipt body",
      artifacts: [],
    },
  });

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].body.tags, ["\u8863\u6a71"]);
  assert.equal(fetchCalls[0].body.title, "\u8863\u6a71 | Wardrobe receipt body");
}

async function testHiddenNoteMetadataOverridesTitleAndIsStrippedFromBody() {
  const dataDir = tempRoot();
  writeNoteBinding(dataDir, "owner");
  const fetchCalls = [];
  const service = createNoteReceiptSaveService({
    dataDir,
    fetch(url, options) {
      fetchCalls.push({ url, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ note: { id: "note-hidden" } }),
      });
    },
    resolveArtifactForRequest() {
      throw new Error("unexpected resolver");
    },
  });

  await service.saveReceipt({
    workspaceId: "owner",
    thread: { id: "thread-1", title: "backup incident" },
    message: {
      id: "msg-1",
      role: "assistant",
      taskGroupId: "plugin:health",
      createdAt: "2026-06-15T11:20:00.000+08:00",
      content: [
        "# 长标题不应该被用作 Note 标题",
        "",
        "已完成备份失败诊断和修复。",
        "",
        "<!-- homeai-note",
        "title: Home AI NAS 备份失败修复记录",
        "tags: Home AI, 自动化、备份, NAS",
        "-->",
      ].join("\n"),
      artifacts: [],
    },
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.title, "Home AI NAS 备份失败修复记录");
  assert.deepEqual(fetchCalls[0].body.tags, ["\u5065\u5eb7", "Home AI", "\u81ea\u52a8\u5316", "\u5907\u4efd", "NAS"]);
  assert.match(fetchCalls[0].body.body, /已完成备份失败诊断和修复/);
  assert.doesNotMatch(fetchCalls[0].body.body, /homeai-note/);
  assert.doesNotMatch(fetchCalls[0].body.body, /Home AI NAS 备份失败修复记录/);
}

function testHiddenNoteMetadataHelpers() {
  const source = [
    "visible",
    "<!-- homeai-note-title: 简短标题 -->",
    "<!-- homeai-note-tags: A, B、C -->",
  ].join("\n");
  assert.deepEqual(extractNoteReceiptMetadata(source), {
    title: "\u7b80\u77ed\u6807\u9898",
    tags: ["A", "B", "C"],
  });
  assert.equal(stripNoteReceiptMetadataComments(source), "visible");
}

function testReceiptNoteTagsFallbackAndPluginMapping() {
  assert.deepEqual(receiptNoteTags({ taskGroupId: "chat" }, {}), ["hermes-receipt"]);
  assert.deepEqual(receiptNoteTags({ taskGroupId: "plugin:finance" }, {}), ["\u8bb0\u8d26"]);
  assert.deepEqual(receiptNoteTags({}, { taskGroupMeta: { "topic-1": { pluginId: "health" } } }), ["hermes-receipt"]);
  assert.deepEqual(receiptNoteTags({ taskGroupId: "topic-1" }, { taskGroupMeta: { "topic-1": { pluginId: "health" } } }), ["\u5065\u5eb7"]);
}

async function testMissingNoteBindingIsControlled() {
  const dataDir = tempRoot();
  const service = createNoteReceiptSaveService({
    dataDir,
    fetch() {
      throw new Error("unexpected fetch");
    },
    resolveArtifactForRequest() {
      throw new Error("unexpected resolver");
    },
  });
  await assert.rejects(
    () => service.saveReceipt({
      workspaceId: "owner",
      thread: { id: "thread-1" },
      message: { id: "msg-1", role: "assistant", content: "测试内容" },
    }),
    (err) => err.code === "note_workspace_not_configured" && err.status === 409,
  );
}

async function testTooManyAttachmentsFailsBeforeRemoteCall() {
  const dataDir = tempRoot();
  writeNoteBinding(dataDir, "owner");
  const service = createNoteReceiptSaveService({
    dataDir,
    fetch() {
      throw new Error("unexpected fetch");
    },
    resolveArtifactForRequest() {
      throw new Error("unexpected resolver");
    },
  });
  await assert.rejects(
    () => service.saveReceipt({
      workspaceId: "owner",
      thread: { id: "thread-1" },
      message: {
        id: "msg-1",
        role: "assistant",
        content: "测试内容",
        artifacts: Array.from({ length: MAX_NOTE_RECEIPT_ATTACHMENTS + 1 }, (_, index) => ({ id: `artifact-${index}` })),
      },
    }),
    (err) => err.code === "note_receipt_too_many_attachments" && err.status === 413,
  );
}

function testTitleSummaryIsCompactForChineseTextLegacy() {
  assert.equal(
    summarizeReceiptTitle("今天的穿搭建议：白衬衫搭配黑裤，整体保持简洁。"),
    "\u56de\u6267 | \u4eca\u5929\u7684\u7a7f\u642d\u5efa\u8bae\uff1a\u767d\u886c\u886b\u642d\u914d\u9ed1\u88e4\uff0c\u6574\u4f53\u4fdd\u6301\u7b80\u6d01\u3002",
  );
  assert.equal(summarizeReceiptTitle("").length > 0, true);
  assert.equal(summarizeReceiptTitle("附件:\n- receipt.md\n\n来源: Hermes Mobile 回执"), "\u56de\u6267 | receipt.md");
}

function testTitleSummaryIsCompactForChineseText() {
  assert.equal(
    summarizeReceiptTitle("## \u6b63\u5f0f\u642d\u914d\u56de\u6267\n\n\u5185\u5bb9", { pluginId: "wardrobe" }),
    "\u8863\u6a71 | \u6b63\u5f0f\u642d\u914d\u56de\u6267",
  );
  assert.equal(
    summarizeReceiptTitle("\u4eca\u5929\u7684\u7a7f\u642d\u5efa\u8bae\uff1a\u767d\u886c\u886b\u642d\u914d\u9ed1\u88e4\uff0c\u6574\u4f53\u4fdd\u6301\u7b80\u6d01\u3002", { createdAt: "2026-06-04T00:00:00.000Z" }),
    "\u56de\u6267 | 2026-06-04 | \u4eca\u5929\u7684\u7a7f\u642d\u5efa\u8bae\uff1a\u767d\u886c\u886b\u642d\u914d\u9ed1\u88e4\uff0c\u6574\u4f53\u4fdd\u6301\u7b80\u6d01\u3002",
  );
  assert.equal(summarizeReceiptTitle("").length > 0, true);
  assert.equal(summarizeReceiptTitle("\u9644\u4ef6:\n- receipt.md\n\n\u6765\u6e90: Hermes Mobile \u56de\u6267"), "\u56de\u6267 | receipt.md");
  assert.equal(
    summarizeReceiptTitle([
      "\u6309\u73b0\u5728\u7684\u72b6\u6001\uff0c\u6211\u7684\u5224\u65ad\u662f\uff1a",
      "",
      "Python\u201c\u77e5\u8bc6\u4e3b\u7ebf\u201d\u5df2\u7ecf\u63a5\u8fd1\u540e\u6bb5\uff0c\u4f46\u201c\u80fd\u529b\u7ed3\u8bfe\u201d\u8fd8\u6ca1\u5230\u3002",
    ].join("\n"), { createdAt: "2026-06-15T03:51:11.079Z" }),
    "\u56de\u6267 | 2026-06-15 | Python\u201c\u77e5\u8bc6\u4e3b\u7ebf\u201d\u5df2\u7ecf\u63a5\u8fd1\u540e\u6bb5\uff0c\u4f46\u201c\u80fd\u529b\u7ed3\u8bfe\u201d\u8fd8\u6ca1\u5230\u3002",
  );
}

async function run() {
  await testSaveReceiptPostsBoundedBodyAndAttachments();
  await testPluginReceiptUsesPluginTag();
  await testHiddenNoteMetadataOverridesTitleAndIsStrippedFromBody();
  testHiddenNoteMetadataHelpers();
  testReceiptNoteTagsFallbackAndPluginMapping();
  await testMissingNoteBindingIsControlled();
  await testTooManyAttachmentsFailsBeforeRemoteCall();
  testTitleSummaryIsCompactForChineseText();
  console.log("note-receipt-save-service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
