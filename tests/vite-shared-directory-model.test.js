"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/document-preview/shared-directory-model.mjs");
const source = fs.readFileSync(modelPath, "utf8");

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
  const model = await import(`file://${modelPath}`);

  await test("shared directory model stays browser-boundary free", () => {
    assert.equal(model.SHARED_DIRECTORY_MODEL_VERSION, "20260705-vite-shared-directory-model-v1");
    assert.doesNotMatch(source, /(?:^|[^\w-])window(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /(?:^|[^\w-])document(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bsessionStorage\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bFileReader\b|\bBlob\b|createObjectURL|revokeObjectURL/);
  });

  await test("manager and access plans project rows without markup side effects", () => {
    const plan = model.sharedDirectoryManagerViewPlan({
      items: [{
        id: "share-a",
        label: "Docs",
        createdByLabel: "Owner",
        permission: "read_only",
        permissionLabel: "Team · read",
        targetWorkspaceIds: ["child"],
        targetLabels: ["Child"],
        scope: "selected_workspaces",
        canManage: true,
        canUnshare: true,
      }],
      workspaces: [{ id: "owner", label: "Owner" }, { id: "child", label: "Child" }],
      editingAccessId: "share-a",
    });
    assert.equal(plan.state, "ready");
    assert.equal(plan.rows[0].controls.visible, true);
    assert.equal(plan.rows[0].controls.permission, "read_only");
    assert.equal(plan.rows[0].controls.targetsHidden, false);
    assert.deepEqual(plan.rows[0].controls.workspaceChoices.map((item) => [item.id, item.checked]), [["owner", false], ["child", true]]);

    assert.equal(model.sharedDirectoryManagerViewPlan({ loading: true }).state, "loading");
    assert.equal(model.sharedDirectoryManagerViewPlan({ error: "failed" }).state, "error");
    assert.equal(model.sharedDirectoryManagerViewPlan({ items: [] }).state, "empty");
  });

  await test("directory entry plans compose injected preview helpers", () => {
    const helpers = {
      directoryEntryKind: () => "pdf",
      directoryEntryMeta: () => "12 KB | today",
      directoryEntryHref: () => "/preview/report.pdf",
      directoryEntryDocumentAttrs: () => " data-task-document-name=\"report.pdf\"",
      directorySearchMatches: (entry, search) => entry.name.toLowerCase().includes(search),
    };
    const row = model.directoryEntryRowPlan({
      type: "file",
      name: "Report.pdf",
      path: "/root/Report.pdf",
      mime: "application/pdf",
    }, { selectingServerFile: false }, helpers);
    assert.equal(row.mainKind, "document-link");
    assert.equal(row.kind, "pdf");
    assert.equal(row.href, "/preview/report.pdf");
    assert.equal(row.menu.visible, true);
    assert.equal(row.menu.actions.some((action) => action.kind === "rename"), true);

    const view = model.directoryEntriesViewPlan({
      activePath: "/root",
      previewEntries: [{ type: "file", name: "Report.pdf", path: "/root/Report.pdf" }],
      search: "report",
    }, helpers);
    assert.equal(view.state, "ready");
    assert.equal(view.rows[0].name, "Report.pdf");

    const empty = model.directoryEntriesViewPlan({
      activePath: "/root",
      previewEntries: [{ type: "file", name: "Report.pdf", path: "/root/Report.pdf" }],
      search: "missing",
    }, helpers);
    assert.equal(empty.state, "empty");
    assert.equal(empty.statusText, "No matching items.");
  });

  await test("delete, rename, share, and access request plans stay data-only", () => {
    const arm = model.deleteDirectoryEntryPlan({
      path: "/root/folder",
      name: "folder",
      type: "directory",
      now: 1000,
      armedUntil: 0,
    });
    assert.equal(arm.action, "arm");
    assert.equal(arm.confirmUntil, 6000);
    assert.match(arm.message, /删除目录/);

    const del = model.deleteDirectoryEntryPlan({
      path: "/root/folder",
      name: "folder",
      type: "directory",
      now: 1000,
      armedUntil: 2000,
    });
    assert.equal(del.action, "delete");
    assert.equal(del.progressText, "正在删除目录...");
    assert.deepEqual(model.directoryDeleteRequestPlan({
      threadId: "thread-1",
      path: "/root/folder",
      ownerElevationOnceToken: "once",
    }), {
      threadId: "thread-1",
      path: "/root/folder",
      ownerElevationOnceToken: "once",
    });

    assert.deepEqual(model.renameDirectoryPromptPlan({ oldName: "old.txt", type: "file" }), {
      title: "重命名文件",
      inputLabel: "新的文件名称",
      defaultValue: "old.txt",
      confirmLabel: "保存",
      progressText: "正在改名文件...",
    });
    assert.deepEqual(model.directoryRenameRequestPlan({ threadId: "thread-1", path: "/root/old.txt", nextName: "new.txt" }), {
      threadId: "thread-1",
      path: "/root/old.txt",
      name: "new.txt",
    });

    const share = model.shareRootDirectoryProjectPlan({
      project: { root: "/root", label: "Docs" },
    }, {
      directoryRootProjectLabel: () => "Docs",
    });
    assert.equal(share.requestPath, "/root");
    assert.equal(share.requestName, "Docs");

    assert.deepEqual(model.sharedDirectoryAccessTogglePlan({ currentEditingId: "a", id: "a" }), { nextEditingId: "" });
    assert.deepEqual(model.sharedDirectoryAccessUpdateRequestPlan({
      workspaceId: "owner",
      id: "share-a",
      permission: "read_only",
      allWorkspaces: false,
      targetWorkspaceIds: ["child", ""],
    }), {
      workspaceId: "owner",
      id: "share-a",
      permission: "read_only",
      scope: "selected_workspaces",
      targetWorkspaceIds: ["child"],
    });
    assert.deepEqual(model.unshareDirectoryRequestPlan({ workspaceId: "owner", id: "share-a" }), {
      workspaceId: "owner",
      id: "share-a",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
