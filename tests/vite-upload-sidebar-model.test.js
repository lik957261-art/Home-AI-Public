"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadUploadSidebarModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/upload-sidebar-model.mjs",
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
  await test("upload sidebar model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/upload-sidebar-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /FileReader/);
    assert.doesNotMatch(source, /dataBase64/);
  });

  await test("attach menu exposes server file option only for Owner", async () => {
    const model = await loadUploadSidebarModel();
    const ownerPlan = model.attachFileMenuPlan({ auth: { isOwner: true } });
    assert.deepEqual(ownerPlan.options.map((option) => option.id), ["system", "server"]);
    assert.equal(ownerPlan.serverFileEnabled, true);

    const workspacePlan = model.attachFileMenuPlan({ auth: { isOwner: false } });
    assert.deepEqual(workspacePlan.options.map((option) => option.id), ["system"]);
    assert.equal(workspacePlan.serverFileEnabled, false);
  });

  await test("native share intake normalizes, dedupes, and plans panel labels", async () => {
    const model = await loadUploadSidebarModel();
    const mergePlan = model.mergeNativeSharedFilesPlan({
      workspaceId: "mk",
      current: [{ path: "/系统分享/a.pdf", name: "a.pdf", workspaceId: "mk" }],
      payload: {
        files: [
          { path: "/系统分享/a.pdf", name: "dupe.pdf", workspaceId: "mk" },
          { path: "/系统分享/b.jpg", name: "", workspaceId: "mk", type: "image/jpeg" },
        ],
      },
    });

    assert.equal(mergePlan.ok, true);
    assert.equal(mergePlan.files.length, 2);
    assert.equal(mergePlan.receivedCount, 2);

    const ownerPanel = model.nativeShareIntakePanelPlan({
      files: mergePlan.files,
      auth: { isOwner: true },
      workspaceId: "mk",
    });
    assert.equal(ownerPanel.hidden, false);
    assert.equal(ownerPanel.summary, "2 个分享文件");
    assert.equal(ownerPanel.attachLabel, "附加到当前对话");
    assert.equal(ownerPanel.attachButtonLabel, "附加");
    assert.match(ownerPanel.copyText, /可直接附加到当前对话/);

    const nonOwnerPanel = model.nativeShareIntakePanelPlan({
      files: mergePlan.files,
      auth: { isOwner: false },
      workspaceId: "mk",
    });
    assert.equal(nonOwnerPanel.attachDisabled, true);
    assert.equal(nonOwnerPanel.attachButtonLabel, "Owner专用");
    assert.match(nonOwnerPanel.copyText, /仅 Owner 可从服务器附加/);
  });

  await test("server-file picker and request plans fail closed when not Owner", async () => {
    const model = await loadUploadSidebarModel();
    const blockedPicker = model.serverFilePickerDirectoryPlan({
      auth: { isOwner: false },
      threadId: "thread_1",
    });
    assert.equal(blockedPicker.ok, false);
    assert.equal(blockedPicker.code, "server_file_owner_required");

    const ownerPicker = model.serverFilePickerDirectoryPlan({
      auth: { isOwner: true },
      threadId: "thread_1",
    });
    assert.equal(ownerPicker.ok, true);
    assert.equal(ownerPicker.directoryPath, "系统分享");

    const blockedRequest = model.serverFileAttachmentRequestPlan({
      auth: { isOwner: false },
      threadId: "thread_1",
      entry: { path: "/系统分享/a.pdf", name: "a.pdf" },
    });
    assert.equal(blockedRequest.ok, false);
    assert.equal(blockedRequest.code, "server_file_attachment_owner_required");

    const request = model.serverFileAttachmentRequestPlan({
      auth: { isOwner: true },
      threadId: "thread/a",
      workspaceId: "owner",
      entry: { path: "/系统分享/a.pdf", name: "a.pdf" },
    });
    assert.equal(request.ok, true);
    assert.equal(request.path, "/api/threads/thread%2Fa/server-file-attachments");
    assert.deepEqual(request.body, {
      path: "/系统分享/a.pdf",
      filename: "a.pdf",
      workspaceId: "owner",
    });
  });

  await test("native share directory plan targets the shared file parent directory", async () => {
    const model = await loadUploadSidebarModel();
    const plan = model.nativeShareDirectoryPlan({
      files: [{ path: "/系统分享/HomeAI/report.md", name: "report.md", workspaceId: "owner" }],
      workspaceId: "owner",
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.directoryPath, "/系统分享/HomeAI");

    const empty = model.nativeShareDirectoryPlan({ files: [] });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, "native_share_file_missing");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
