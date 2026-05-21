"use strict";

const assert = require("node:assert/strict");
const { createFileArtifactResolverService } = require("../adapters/file-artifact-resolver-service");

const mtime = new Date("2026-05-15T00:00:00.000Z");
const state = {
  artifacts: [
    {
      id: "artifact1",
      path: "C:\\owner\\report.md",
      displayPath: "report.md",
      name: "report.md",
      mime: "text/markdown; charset=utf-8",
      threadId: "thread1",
      workspaceId: "owner",
    },
    {
      id: "global1",
      path: "C:\\global\\readme.txt",
      name: "readme.txt",
      mime: "text/plain; charset=utf-8",
    },
  ],
  threads: [
    { id: "thread1", workspaceId: "owner", projectId: "p", subprojectId: "s" },
  ],
};

const service = createFileArtifactResolverService({
  state: () => state,
  fs: {
    existsSync(filePath) {
      return !String(filePath).includes("missing");
    },
    statSync(filePath) {
      return {
        size: filePath.endsWith(".md") ? 100 : 42,
        mtime,
        isFile() {
          return !String(filePath).endsWith("\\dir");
        },
      };
    },
  },
  normalizeLocalPath(value) {
    return String(value || "");
  },
  resolveBrowserPath(thread, query) {
    const raw = String(query.get("path") || "");
    if (!raw) return null;
    return {
      localPath: raw,
      displayPath: raw,
      workspacePath: `Workspace/${raw.split("\\").pop()}`,
    };
  },
  logicalUserPathFallback(value) {
    return `User/${value}`;
  },
  logicalDirectoryDisplayPath(_thread, value, label) {
    return `Dir/${label || value}`;
  },
  mimeFor(filePath) {
    return filePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/octet-stream";
  },
  authCanAccessWorkspace(auth, workspaceId) {
    return auth?.workspaceId === workspaceId;
  },
  artifactAccessibleToAuth(auth, thread) {
    return auth?.workspaceId === thread.workspaceId;
  },
  isPathAllowedForThread(_thread, localPath) {
    return !String(localPath).includes("blocked");
  },
  isPathAllowed(localPath) {
    return String(localPath).startsWith("C:\\global");
  },
  isOwnerAuth(auth) {
    return auth?.workspaceId === "owner";
  },
  findArtifactReferenceById(id) {
    if (id !== "ref1") return null;
    return {
      thread: state.threads[0],
      message: { id: "msg1" },
      artifact: {
        name: "recovered.md",
        path: "C:\\owner\\missing.md",
        displayPath: "missing.md",
        mime: "text/markdown; charset=utf-8",
      },
    };
  },
  findArtifactReference(artifact) {
    if (artifact.name !== "recovered.md") return null;
    return {
      thread: state.threads[0],
      message: { id: "msg1" },
    };
  },
  resolveArtifactPathFromMessage() {
    return { localPath: "C:\\owner\\recovered.md", rawPath: "recovered.md" };
  },
});

{
  const resolved = service.resolveArtifactForRequest("artifact1", { workspaceId: "owner" });
  assert.equal(resolved.artifact.localPath, "C:\\owner\\report.md");
  assert.equal(resolved.thread.id, "thread1");
}

{
  const denied = service.resolveArtifactForRequest("artifact1", { workspaceId: "child" });
  assert.equal(denied.status, 404);
}

{
  const recovered = service.resolveArtifactForRequest("ref1", { workspaceId: "owner" });
  assert.equal(recovered.artifact.localPath, "C:\\owner\\recovered.md");
  assert.equal(recovered.artifact.threadId, "thread1");
}

{
  const globalDenied = service.resolveArtifactForRequest("global1", { workspaceId: "child" });
  assert.equal(globalDenied.status, 404);
  const globalAllowed = service.resolveArtifactForRequest("global1", { workspaceId: "owner" });
  assert.equal(globalAllowed.artifact.localPath, "C:\\global\\readme.txt");
}

{
  const byArtifact = service.resolveFileForBrowserRequest(new URLSearchParams({ artifactId: "artifact1" }), { workspaceId: "owner" });
  assert.deepEqual(byArtifact.file, {
    localPath: "C:\\owner\\report.md",
    displayPath: "User/report.md",
    name: "report.md",
    mime: "text/markdown; charset=utf-8",
    size: 100,
    updatedAt: "2026-05-15T00:00:00.000Z",
  });
  const byPath = service.resolveFileForBrowserRequest(new URLSearchParams({ threadId: "thread1", path: "C:\\owner\\note.txt" }), { workspaceId: "owner" });
  assert.equal(byPath.file.displayPath, "Workspace/note.txt");
  assert.equal(byPath.file.name, "note.txt");
}

console.log("file-artifact-resolver-service tests passed");
