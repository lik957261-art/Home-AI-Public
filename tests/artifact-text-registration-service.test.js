"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArtifactTextRegistrationService } = require("../adapters/artifact-text-registration-service");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-artifact-text-"));

function writeFile(relativePath, content = "x") {
  const filePath = path.join(tmpRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function parseMediaPaths(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("MEDIA:"))
    .map((line) => line.slice("MEDIA:".length).trim())
    .filter(Boolean);
}

try {
  const reportPdf = writeFile(path.join("run", "report.pdf"), "pdf");
  const reportMarkdown = writeFile(path.join("run", "report.md"), "# Report");
  const plainText = writeFile(path.join("run", "note.txt"), "note");
  const projectMarkdownOld = writeFile(path.join("project", "topic.md"), "old");
  const projectMarkdownNew = writeFile(path.join("project", "nested", "topic.md"), "new");
  writeFile(path.join("project", ".hidden", "topic.md"), "hidden");
  writeFile(path.join("project", "node_modules", "topic.md"), "module");
  fs.utimesSync(projectMarkdownOld, new Date("2026-05-14T00:00:00.000Z"), new Date("2026-05-14T00:00:00.000Z"));
  fs.utimesSync(projectMarkdownNew, new Date("2026-05-15T00:00:00.000Z"), new Date("2026-05-15T00:00:00.000Z"));

  const state = {
    artifacts: [
      {
        id: "pdf1",
        path: reportPdf,
        displayPath: reportPdf,
        name: "report.pdf",
        displayName: "Readable PDF",
        mime: "application/pdf",
        size: 1,
        threadId: "thread1",
        messageId: "old-message",
      },
    ],
    threads: [
      {
        id: "thread1",
        workspaceId: "owner",
        projectId: "project1",
        subprojectId: "",
        messages: [{ id: "message1" }],
      },
    ],
  };
  const thread = state.threads[0];
  const allowedRoot = path.join(tmpRoot, "run");
  const projectRoot = path.join(tmpRoot, "project");
  let idCounter = 0;
  const cache = new Map();
  const service = createArtifactTextRegistrationService({
    state: () => state,
    sourceMarkdownSearchCache: cache,
    extractArtifactPaths: parseMediaPaths,
    normalizeLocalPath(value) {
      return String(value || "");
    },
    isPathAllowedForThread(_thread, localPath) {
      return path.resolve(localPath).startsWith(path.resolve(allowedRoot));
    },
    findProject(workspaceId, projectId) {
      if (workspaceId === "owner" && projectId === "project1") return { root: projectRoot };
      return null;
    },
    findSubproject() {
      return null;
    },
    effectiveProjectForThread() {
      return null;
    },
    mimeFor(filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".md") return "text/markdown; charset=utf-8";
      if (ext === ".pdf") return "application/pdf";
      return "application/octet-stream";
    },
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    nowIso() {
      return "2026-05-15T12:00:00.000Z";
    },
  });

  {
    const latest = service.findMarkdownByStemUnderRoot(projectRoot, "topic");
    assert.equal(latest, projectMarkdownNew);
    assert.equal(service.findMarkdownByStemUnderRoot(projectRoot, "missing"), "");
    const limited = createArtifactTextRegistrationService({
      sourceMarkdownSearchLimit: 1,
    });
    assert.equal(limited.findMarkdownByStemUnderRoot(projectRoot, "topic"), "");
  }

  {
    const found = service.findSourceMarkdownForArtifact(thread, { name: "topic.pdf", path: reportPdf });
    assert.equal(found, projectMarkdownNew);
    assert.equal(cache.size, 1);
    assert.equal(service.findSourceMarkdownForArtifact(thread, { name: "topic.pdf", path: reportPdf }), projectMarkdownNew);
  }

  {
    assert.equal(service.companionMarkdownPathForArtifact(thread, { name: "report.pdf", path: reportPdf }), reportMarkdown);
    assert.equal(service.companionMarkdownPathForArtifact(thread, { name: "note.txt", path: plainText }), "");
  }

  {
    const created = service.registerArtifactsFromText(thread, { id: "message2" }, `done\nMEDIA:${reportMarkdown}\nMEDIA:${path.join(tmpRoot, "blocked.md")}`);
    assert.deepEqual(created, [{
      id: "artifact_1",
      name: "report.md",
      mime: "text/markdown; charset=utf-8",
      size: 8,
      url: "/api/artifacts/artifact_1",
    }]);
    assert.equal(state.artifacts.at(-1).path, reportMarkdown);
    assert.equal(state.artifacts.at(-1).threadId, "thread1");
    assert.equal(state.artifacts.at(-1).messageId, "message2");

    const reused = service.registerArtifactsFromText(thread, { id: "message3" }, `MEDIA:${reportMarkdown}`);
    assert.equal(reused[0].id, "artifact_1");
    assert.equal(state.artifacts.filter((artifact) => artifact.path === reportMarkdown).length, 1);
    assert.equal(state.artifacts.at(-1).messageId, "message3");
  }

  {
    const compacted = service.compactArtifactsForMessage({
      id: "message4",
      content: `MEDIA:${reportMarkdown}`,
      artifacts: [{ id: "pdf1" }],
    }, thread);
    assert.equal(compacted.length, 2);
    assert.equal(compacted[0].source, "source-markdown");
    assert.equal(compacted[0].name, "report.md");
    assert.match(compacted[0].url, /^\/api\/files\?threadId=thread1&path=/);
    assert.equal(compacted[1].id, "pdf1");
    assert.equal(compacted[1].displayName, "Readable PDF");
  }

  {
    const denied = service.publicMarkdownPreviewArtifact(thread, projectMarkdownNew, "base");
    assert.equal(denied, null);
  }
} finally {
  if (tmpRoot.startsWith(os.tmpdir())) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

console.log("artifact text registration service tests passed");
