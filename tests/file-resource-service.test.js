"use strict";

const assert = require("node:assert/strict");
const {
  extractArtifactPaths,
  mimeFor,
  normalizeDisplayPath,
  previewStrategyForFile,
  publicFileMetadata,
  safeDirectoryName,
  safeFileName,
} = require("../adapters/file-resource-service");

function testExtractArtifactPaths() {
  const got = extractArtifactPaths([
    "Saved MEDIA: C:\\Users\\owner\\Documents\\report.pdf.",
    "Also see /mnt/c/ProgramData/HermesMobile/data/drive/users/owner/notes.md)",
    "and \\\\wsl.localhost\\Ubuntu-24.04\\home\\xuxin\\out\\chart.png",
    "ignore relative/path.txt and https://example.test/file.pdf",
  ].join("\n"));

  assert.deepEqual(got, [
    "C:\\Users\\owner\\Documents\\report.pdf",
    "/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/notes.md",
    "\\\\wsl.localhost\\Ubuntu-24.04\\home\\xuxin\\out\\chart.png",
  ]);
  assert.deepEqual(extractArtifactPaths(""), []);
  assert.deepEqual(extractArtifactPaths(null), []);
}

function testSafeMetadataDoesNotLeakRawPaths() {
  const projected = publicFileMetadata({
    localPath: "C:\\Users\\xuxin\\Documents\\Agent\\workspace\\secret-project\\raw.md",
    path: "C:\\Users\\xuxin\\Documents\\Agent\\workspace\\secret-project\\raw.md",
    displayPath: "C:\\Users\\xuxin\\Documents\\Agent\\workspace\\secret-project\\raw.md",
    name: "raw.md",
    size: 123,
    updatedAt: "2026-05-14T00:00:00.000Z",
  }, { threadId: "thread-1" });

  assert.equal(projected.name, "raw.md");
  assert.equal(projected.path, "raw.md");
  assert.equal(projected.displayPath, "raw.md");
  assert.equal(projected.workspacePath, "raw.md");
  assert.equal(projected.mime, "text/markdown; charset=utf-8");
  assert.match(projected.url, /^\/api\/files\?threadId=thread-1&path=raw\.md$/);
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /Users\\xuxin|secret-project|Documents\\Agent/);

  const logical = publicFileMetadata({
    localPath: "D:\\private\\report.txt",
    displayPath: "Project A/Reports/report.txt",
    size: 7,
  });
  assert.equal(logical.path, "Project A/Reports/report.txt");
  assert.doesNotMatch(JSON.stringify(logical), /D:\\private/);
}

function testPreviewStrategyAndMime() {
  assert.equal(mimeFor("README.md"), "text/markdown; charset=utf-8");
  assert.equal(mimeFor("notes.txt"), "text/plain; charset=utf-8");
  assert.equal(mimeFor("contract.zip"), "application/zip");
  assert.equal(mimeFor("data.unknown"), "application/octet-stream");

  assert.deepEqual(previewStrategyForFile({ localPath: "draft.docx" }), { kind: "docx" });
  assert.deepEqual(previewStrategyForFile({ localPath: "README.md" }), { kind: "text" });
  assert.deepEqual(previewStrategyForFile({ localPath: "data.bin", mime: "text/plain" }), { kind: "text" });
  assert.deepEqual(previewStrategyForFile({ localPath: "image.png", mime: "image/png" }), {
    kind: "unsupported",
    reason: "unsupported_type",
  });
}

function testSanitizationAndFailClosed() {
  assert.equal(safeFileName("../bad:name?.md"), "bad_name_.md");
  assert.equal(safeFileName("\u0000"), "upload.bin");
  assert.equal(safeDirectoryName(".."), "");
  assert.equal(safeDirectoryName("New Folder."), "New Folder");
  assert.equal(normalizeDisplayPath("Project\\..\\safe?.txt", "fallback.txt"), "Project/safe_.txt");
  assert.equal(normalizeDisplayPath("C:\\raw\\safe.txt", "safe.txt"), "safe.txt");

  assert.equal(publicFileMetadata(null), null);
  assert.deepEqual(previewStrategyForFile(null), { kind: "unsupported", reason: "missing_file" });
}

function run() {
  testExtractArtifactPaths();
  testSafeMetadataDoesNotLeakRawPaths();
  testPreviewStrategyAndMime();
  testSanitizationAndFailClosed();
  console.log("file resource service tests passed");
}

run();
