"use strict";

const assert = require("node:assert/strict");

const {
  createWorkspaceDisplayPathService,
  defaultComparablePath,
  defaultPathInsideAnyRoot,
} = require("../adapters/workspace-display-path-service");

function normalizeLocalPath(value) {
  return String(value || "")
    .replace(/^\/mnt\/z\//i, "Z:/")
    .replaceAll("/", "\\");
}

function makeService(overrides = {}) {
  const projects = overrides.projects || [{
    id: "alpha",
    workspaceId: "owner",
    label: "Alpha",
    root: "Z:\\Workspace\\Hermes\\workspace\\Alpha",
    children: [{
      id: "reports",
      label: "Reports",
      root: "Z:\\Workspace\\Hermes\\workspace\\Alpha\\Reports",
    }],
  }, {
    id: "default",
    workspaceId: "owner",
    label: "General",
    root: "Z:\\Workspace\\Hermes\\workspace",
    source: "workspace-default",
  }, {
    id: "hidden",
    workspaceId: "owner",
    label: "Hidden",
    root: "Z:\\Workspace\\Hermes\\workspace\\Hidden",
    hidden: true,
  }];
  const workspaces = overrides.workspaces || [{
    id: "owner",
    label: "Owner Workspace",
    defaultWorkspace: "Z:\\Workspace\\Hermes\\workspace",
  }];
  return createWorkspaceDisplayPathService(Object.assign({
    ownerDriveRootNames: () => ["ChatGPT-Drive", "Hermes-Drive"],
    ownerRootFallbackLabel: () => "Hermes Owner",
    normalizeLocalPath,
    allProjectsForWorkspaceSync: (workspaceId) => projects.filter((project) => project.workspaceId === workspaceId),
    findWorkspace: (workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId) || null,
  }, overrides.options || {}));
}

function testSharedLabelsAndRouteSuffixes() {
  const service = makeService();
  const shared = {
    id: "shared",
    label: "Reports",
    root: "/volume1/Hermes-Alice/Reports",
    sharedByLabel: "Alice",
    permission: "read_only",
    source: "hermes-web-shared-directory",
  };

  assert.equal(service.sharedProjectOwnerLabel(shared), "Alice");
  assert.equal(service.sharedProjectRootOwnerLabel(shared), "Hermes-Alice");
  assert.equal(service.sharedProjectDisplayLabel(shared), "Reports");
  assert.equal(service.directoryRouteDisplayLabel(shared), "Reports (read-only)");
  assert.equal(
    service.directoryRouteDisplayLabel(Object.assign({}, shared, { label: "Reports (read-only)" })),
    "Reports (read-only)",
  );
  assert.equal(
    service.directoryRouteDisplayLabel(shared, { id: "inbox", label: "Inbox", inbound: true }),
    "Reports / Inbox (read-only) (inbound)",
  );
  assert.equal(service.sharedProjectRootOwnerLabel({
    label: "Family",
    root: "D:\\Sync\\ChatGPT-Drive\\Family",
  }), "Hermes Owner");
}

function testDirectRootAndChildRouteLabels() {
  const projects = [{
    id: "root",
    label: "Root Project",
    root: "C:/Root",
    children: [{ id: "child", label: "Child", root: "C:/Root/Child", source: "inbound" }],
  }];
  const service = makeService({ projects });

  assert.equal(service.directoryRouteDisplayPath({ label: "Direct Route", inbound: true }, projects, "Fallback"), "Direct Route (inbound)");
  assert.equal(service.directoryRouteDisplayPath({ projectId: "root", permission: "read_only" }, projects), "Root Project (read-only)");
  assert.equal(service.directoryRouteDisplayPath({ projectId: "root", subprojectId: "child" }, projects), "Root Project / Child (inbound)");
  assert.equal(service.directoryRouteDisplayPath({}, projects, "Fallback"), "Fallback");
}

function testDirectoryRouteCandidatesSortAndFilter() {
  const service = makeService();
  const candidates = service.directoryRouteCandidatesForWorkspace("owner");

  assert.deepEqual(candidates.map((item) => item.label), ["Alpha / Reports", "Alpha"]);
  assert.deepEqual(candidates.map((item) => item.subprojectId), ["reports", ""]);
}

function testLogicalDirectoryDisplayPath() {
  const service = makeService();
  const thread = { workspaceId: "owner" };

  assert.equal(
    service.logicalDirectoryDisplayPath(thread, "Z:\\Workspace\\Hermes\\workspace\\Alpha\\Reports\\q1.pdf"),
    "Alpha / Reports / q1.pdf",
  );
  assert.equal(
    service.logicalDirectoryDisplayPath(thread, "/mnt/z/Workspace/Hermes/workspace/Alpha/notes.md"),
    "Alpha / notes.md",
  );
  assert.equal(
    service.logicalDirectoryDisplayPath(thread, "/mnt/z/Workspace/Hermes/workspace/Loose/note.txt"),
    "Loose / note.txt",
  );
  assert.equal(service.logicalDirectoryDisplayPath(thread, "", "Directory"), "Directory");
  assert.equal(service.logicalDirectoryDisplayPath(thread, "D:\\Outside\\file.txt", "Fallback"), "Fallback");
}

function testLogicalFallbacksAndComparablePaths() {
  const service = makeService();

  assert.equal(service.logicalUserPathFallback("D:\\Work\\Hermes-Drive\\Health\\Report.pdf"), "Health / Report.pdf");
  assert.equal(service.logicalUserPathFallback("C:\\Users\\alice\\Desktop\\note.txt"), "\u7528\u6237\u76ee\u5f55 / Desktop / note.txt");
  assert.equal(service.logicalUserPathFallback("C:\\Users\\alice\\Documents\\Agent\\notes.md"), "Agent / notes.md");
  assert.equal(
    defaultComparablePath("\\\\wsl.localhost\\Ubuntu-24.04\\mnt\\z\\Work\\X\\File.txt"),
    "z:/work/x/file.txt",
  );
  assert.equal(defaultPathInsideAnyRoot("/mnt/z/Work/X/File.txt", ["Z:\\Work\\X"]), true);
}

testSharedLabelsAndRouteSuffixes();
testDirectRootAndChildRouteLabels();
testDirectoryRouteCandidatesSortAndFilter();
testLogicalDirectoryDisplayPath();
testLogicalFallbacksAndComparablePaths();

console.log("workspace-display-path-service tests passed");
