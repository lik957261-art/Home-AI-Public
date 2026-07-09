"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadAttachmentModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("attachment model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/attachment-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("attachment state summarizes pending artifacts for Composer send", async () => {
    const model = await loadAttachmentModel();
    const state = model.buildComposerAttachmentState({
      pendingArtifacts: [
        { id: "a1", name: "report.pdf", mime: "application/pdf", size: 4096, source: "server_file" },
        { id: "a1", name: "report.pdf", mime: "application/pdf", size: 4096, source: "server_file" },
        { id: "a2", name: "photo.jpg", mime: "image/jpeg", size: 2048, source: "system_upload" },
      ],
    });

    assert.equal(state.status, "ready");
    assert.equal(state.summary, "已附加 2 个文件");
    assert.equal(state.artifactCount, 2);
    assert.equal(state.canSendWithAttachments, true);
    assert.equal(state.rows[0].kind, "pdf");
    assert.equal(state.rows[0].sourceLabel, "服务器文件");
    assert.deepEqual(state.composerArtifacts.map((artifact) => artifact.id), ["a1", "a2"]);
    assert.deepEqual(state.boundedEvidence, [
      "artifact_count=2",
      "native_share_count=0",
      "upload_queue_count=0",
      "status=ready",
    ]);
  });

  await test("native shared files are deduped and converted to bounded artifacts", async () => {
    const model = await loadAttachmentModel();
    const files = model.normalizeNativeSharedFiles({
      files: [
        { path: "/Users/example/path Share/a.md", name: "a.md", workspaceId: "owner", mime: "text/markdown" },
        { path: "/Users/example/path Share/a.md", name: "duplicate.md", workspaceId: "owner", mime: "text/markdown" },
        { path: "/Users/example/path Share/photo.jpg", name: "", workspaceId: "owner", mime: "image/jpeg" },
      ],
    }, { workspaceId: "owner" });

    assert.equal(files.length, 2);
    assert.equal(files[0].name, "a.md");
    assert.equal(files[1].name, "photo.jpg");
    assert.equal(files[1].pathLabel, "photo.jpg");

    const artifacts = model.createNativeShareAttachArtifacts(files, { workspaceId: "owner" });
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts[0].source, "native_share");
    assert.equal(artifacts[0].sourceLabel, "系统分享");
    assert.equal(artifacts[1].kind, "image");
  });

  await test("server-file and upload requests are shaped without executing network", async () => {
    const model = await loadAttachmentModel();
    const serverFile = model.createServerFileAttachmentRequest({
      threadId: "thread a/b",
      workspaceId: "owner",
      entry: { path: "/系统分享/HomeAI/file.pdf", name: "file.pdf" },
    });
    assert.equal(serverFile.ok, true);
    assert.equal(serverFile.path, "/api/threads/thread%20a%2Fb/server-file-attachments");
    assert.deepEqual(serverFile.body, {
      path: "/系统分享/HomeAI/file.pdf",
      filename: "file.pdf",
      workspaceId: "owner",
    });

    const uploadMissingBytes = model.createUploadRequest({
      threadId: "thread_1",
      file: { name: "a.txt", type: "text/plain" },
    });
    assert.equal(uploadMissingBytes.ok, false);
    assert.equal(uploadMissingBytes.code, "data_base64_missing");

    const upload = model.createUploadRequest({
      threadId: "thread_1",
      workspaceId: "owner",
      file: { name: "a.txt", type: "text/plain", dataBase64: "YWJj" },
    });
    assert.equal(upload.ok, true);
    assert.equal(upload.path, "/api/threads/thread_1/uploads");
    assert.equal(upload.body.filename, "a.txt");
    assert.equal(upload.body.dataBase64, "YWJj");
  });

  await test("upload requests preserve large image base64 without text truncation", async () => {
    const model = await loadAttachmentModel();
    const largeBase64 = "B".repeat(320000);
    const upload = model.createUploadRequest({
      threadId: "thread_image",
      workspaceId: "owner",
      file: { name: "camera.jpg", type: "image/jpeg", dataBase64: largeBase64 },
    });

    assert.equal(upload.ok, true);
    assert.equal(upload.body.filename, "camera.jpg");
    assert.equal(upload.body.type, "image/jpeg");
    assert.equal(upload.body.dataBase64.length, largeBase64.length);
    assert.equal(upload.body.dataBase64, largeBase64);
  });

  await test("add and remove helpers preserve normalized immutable rows", async () => {
    const model = await loadAttachmentModel();
    const added = model.addPendingArtifact([], {
      id: "artifact_1",
      name: "deck.pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      source: "system_upload",
    });
    assert.equal(added.length, 1);
    assert.equal(added[0].kind, "presentation");
    const removed = model.removePendingArtifact(added, "artifact_1");
    assert.equal(removed.length, 0);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
