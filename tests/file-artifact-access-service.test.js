"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { createFileArtifactAccessService } = require("../adapters/file-artifact-access-service");

const state = { artifacts: [] };
const existing = new Set([path.join("C:\\root", "file.md")]);
const service = createFileArtifactAccessService({
  dataDir: "C:\\data",
  workspaceUploadDirName: "Learning Uploads",
  workspaceUploadSubdir: "uploads",
  state: () => state,
  fs: {
    existsSync(filePath) {
      return existing.has(filePath);
    },
    statSync() {
      return { size: 1234 };
    },
  },
  findWorkspace(workspaceId) {
    if (workspaceId === "owner") return { defaultWorkspace: "C:\\owner" };
    if (workspaceId === "child") return { policy: { default_workspace: "C:\\child" } };
    if (workspaceId === "protected") return { defaultWorkspace: "C:\\Windows" };
    return null;
  },
  normalizeLocalPath(value) {
    return String(value || "");
  },
  rootConflictsWithProtected(value) {
    return /^C:\\Windows/i.test(String(value || ""));
  },
  pathInsideAnyRoot(candidate, roots) {
    const target = String(candidate || "").toLowerCase();
    return roots.some((root) => target.startsWith(String(root || "").toLowerCase()));
  },
  chatGroupMemberWorkspaceIds(thread) {
    return thread.groupMembers || [];
  },
  authCanAccessWorkspace(auth, workspaceId) {
    return auth?.workspaceId === workspaceId || auth?.shared?.includes(workspaceId);
  },
  makeId(prefix) {
    return `${prefix}_1`;
  },
  nowIso() {
    return "2026-05-15T00:00:00.000Z";
  },
  mimeFor(filePath) {
    return filePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/octet-stream";
  },
});

{
  assert.equal(service.safeFileName("../bad:name?.md"), "bad_name_.md");
  assert.equal(service.safeDirectoryName("New Folder."), "New Folder");
  assert.equal(service.safeDirectoryName(".."), "");
  assert.equal(service.uniqueChildPath("C:\\root", "file.md"), path.join("C:\\root", "file (1).md"));
}

{
  const thread = { id: "thread:a", workspaceId: "owner", groupMembers: ["child"] };
  assert.equal(service.workspaceDefaultRoot("child"), "C:\\child");
  assert.equal(service.workspaceDefaultRoot("protected"), "");
  assert.equal(
    service.workspaceUploadRoot("child", thread.id),
    path.resolve("C:\\child", "Learning Uploads", "uploads", "thread_a"),
  );
  assert.deepEqual(service.uploadRootsForThread(thread), [
    path.join("C:\\data", "uploads", "thread:a"),
    path.resolve("C:\\owner", "Learning Uploads", "uploads", "thread_a"),
    path.resolve("C:\\child", "Learning Uploads", "uploads", "thread_a"),
  ]);
  assert.equal(service.uploadWorkspaceIdForRequest({ workspaceId: "owner", shared: ["child"] }, thread, { workspaceId: "child" }), "child");
  assert.equal(service.uploadWorkspaceIdForRequest({ workspaceId: "other" }, thread, { workspaceId: "child" }), "owner");
  assert.deepEqual(
    service.workspaceUploadDirectoryForRequest({ workspaceId: "child" }, thread, {}),
    { workspaceId: "child", uploadDir: path.resolve("C:\\child", "Learning Uploads", "uploads", "thread_a") },
  );
}

{
  const thread = { id: "thread1", workspaceId: "owner", projectId: "p", subprojectId: "s" };
  const created = service.registerUploadArtifact(thread, null, "C:\\owner\\report.md", "report.md", { workspaceId: "child" });
  assert.deepEqual(created, {
    id: "artifact_1",
    name: "report.md",
    mime: "text/markdown; charset=utf-8",
    size: 1234,
    url: "/api/artifacts/artifact_1",
    workspaceId: "child",
  });
  assert.equal(created.path, undefined);
  assert.equal(created.displayPath, undefined);
  assert.equal(created.localPath, undefined);
  assert.deepEqual(service.publicArtifactFromClient({ id: "artifact_1" }), {
    id: "artifact_1",
    name: "report.md",
    mime: "text/markdown; charset=utf-8",
    size: 1234,
    url: "/api/artifacts/artifact_1",
  });
  service.attachUploadedArtifactsToMessage(thread, {
    id: "msg1",
    actorWorkspaceId: "child",
    artifacts: [{ id: "artifact_1" }],
  });
  assert.equal(state.artifacts[0].messageId, "msg1");
  assert.equal(state.artifacts[0].workspaceId, "child");
  assert.equal(state.artifacts[0].projectId, "p");
  assert.equal(state.artifacts[0].subprojectId, "s");
}

console.log("file-artifact-access-service tests passed");
