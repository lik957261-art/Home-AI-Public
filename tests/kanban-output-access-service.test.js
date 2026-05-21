"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createKanbanOutputAccessService,
} = require("../adapters/kanban-output-access-service");

function makeService(overrides = {}) {
  const calls = { policy: 0 };
  const fsMock = {
    statSync(filePath) {
      if (String(filePath || "").includes("missing")) {
        const err = new Error("missing");
        err.code = "ENOENT";
        throw err;
      }
      return {
        isFile: () => true,
        size: 1234,
        mtime: new Date("2026-05-18T00:00:00.000Z"),
      };
    },
  };
  const service = createKanbanOutputAccessService(Object.assign({
    fs: fsMock,
    path: path.win32,
    artifactRoot: "C:\\ProgramData\\HermesMobile\\data\\artifacts\\kanban-reading",
    safeStorageSegment(value) {
      return String(value || "owner").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "item";
    },
    normalizeLocalPath(value) {
      return path.win32.resolve(String(value || ""));
    },
    authCanAccessWorkspace: () => false,
    isPathAllowedForThread() {
      calls.policy += 1;
      return false;
    },
    mimeFor: () => "text/markdown; charset=utf-8",
    workspaceDisplayPathService: {
      logicalUserPathFallback(rawPath, fallback) {
        return `display:${fallback}`;
      },
    },
  }, overrides));
  return { service, calls };
}

function testWorkspaceArtifactRootIsVisibleOutput() {
  const { service, calls } = makeService();
  const rawPath = "C:\\ProgramData\\HermesMobile\\data\\artifacts\\kanban-reading\\weixin_stephen\\case-1\\card-1\\report.md";
  const resolved = service.resolveFile("weixin_stephen", rawPath, null);
  assert.equal(Boolean(resolved.file), true);
  assert.equal(resolved.file.name, "report.md");
  assert.equal(resolved.file.mime, "text/markdown; charset=utf-8");
  assert.equal(resolved.file.displayPath, "display:report.md");
  assert.equal(calls.policy, 0);
}

function testOtherWorkspaceArtifactRootIsNotVisible() {
  const { service } = makeService();
  const rawPath = "C:\\ProgramData\\HermesMobile\\data\\artifacts\\kanban-reading\\owner\\case-1\\card-1\\report.md";
  const resolved = service.resolveFile("weixin_stephen", rawPath, null);
  assert.equal(resolved.file, undefined);
  assert.equal(resolved.status, 404);
}

function testHelperClassifiesWorkspaceArtifactRoot() {
  const { service } = makeService();
  assert.equal(service.pathInsideWorkspaceArtifactRoot(
    "weixin_stephen",
    "C:\\ProgramData\\HermesMobile\\data\\artifacts\\kanban-reading\\weixin_stephen\\case\\card\\report.md",
  ), true);
  assert.equal(service.pathInsideWorkspaceArtifactRoot(
    "weixin_stephen",
    "C:\\ProgramData\\HermesMobile\\data\\artifacts\\kanban-reading\\owner\\case\\card\\report.md",
  ), false);
}

testWorkspaceArtifactRootIsVisibleOutput();
testOtherWorkspaceArtifactRootIsNotVisible();
testHelperClassifiesWorkspaceArtifactRoot();
console.log("kanban output access service tests passed");
