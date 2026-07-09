"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

async function loadModel() {
  return import(path.join(repoRoot, "src/vite-islands/document-preview/directory-automation-model.mjs"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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

const helpers = {
  directoryAliasKey(value) {
    return String(value || "").trim().toLowerCase();
  },
  comparableDirectoryPath(value) {
    return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
  },
  pathMatchesDirectoryRoot(pathText, rootText) {
    const pathValue = helpers.comparableDirectoryPath(pathText);
    const rootValue = helpers.comparableDirectoryPath(rootText);
    return Boolean(pathValue && rootValue && (pathValue === rootValue || pathValue.startsWith(`${rootValue}/`)));
  },
  directoryRouteDisplayPath(_route, fallback) {
    return `Route: ${fallback}`;
  },
  logicalDirectoryDisplayPath(pathText, label) {
    return `${label}: ${pathText}`;
  },
  relativeDisplayTailForDirectory(pathText, rootText) {
    const pathValue = String(pathText || "").replaceAll("\\", "/").replace(/\/+$/g, "");
    const rootValue = String(rootText || "").replaceAll("\\", "/").replace(/\/+$/g, "");
    return pathValue === rootValue ? "" : pathValue.slice(rootValue.length + 1);
  },
  artifactKind({ name, mime }) {
    return mime === "application/pdf" || /\.pdf$/i.test(String(name || "")) ? "pdf" : "file";
  },
  artifactHref({ url, name }) {
    return url || `/files/${encodeURIComponent(name || "item")}`;
  },
  formatBytes(value) {
    return `${Number(value || 0)} B`;
  },
  formatTime(value) {
    return value ? `time:${value}` : "";
  },
  ownerDriveRootIndexForParts(parts) {
    return parts.indexOf("Users");
  },
  ownerRootFallbackLabel: "Owner",
};

(async () => {
  const model = await loadModel();

  await test("directory automation model stays browser-boundary free", () => {
    const source = read("src/vite-islands/document-preview/directory-automation-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.match(source, /DIRECTORY_AUTOMATION_MODEL_VERSION/);
  });

  await test("route groups dedupe child aliases and keep shortest root child", () => {
    const project = {
      children: [
        { id: "deep", label: "Photos / 2026", root: "/root/photos/2026" },
        { id: "root", label: "Photos", root: "/root/photos" },
        { id: "docs", label: "Docs", root: "/root/docs" },
      ],
    };
    const groups = model.routeGroupsPlan({ project, helpers });
    assert.deepEqual(groups.map((group) => [group.key, group.rootChild.id]), [
      ["photos", "root"],
      ["docs", "docs"],
    ]);
    assert.deepEqual(model.directoryRouteOptionsPlan({ project, helpers }), [
      { id: "root", label: "Photos" },
      { id: "docs", label: "Docs" },
    ]);
  });

  await test("directory boundary and parent plans stay inside selected root", () => {
    const projects = [
      { id: "health", label: "Health", root: "/workspace/health" },
      { id: "docs", label: "Docs", root: "/workspace/docs" },
    ];
    const input = {
      pathText: "/workspace/health/labs/blood.pdf",
      directoryRootPath: "/workspace/health",
      projects,
      workspace: { id: "owner", label: "Owner", defaultWorkspace: "/workspace" },
      helpers,
    };
    assert.deepEqual(model.directoryBoundaryTargetPlan(input), {
      id: "health",
      label: "Health",
      root: "/workspace/health",
    });
    assert.equal(model.isDirectoryAtRouteRootPlan(input), false);
    assert.equal(model.parentDirectoryPathPlan(input), "/workspace/health/labs");
    assert.equal(model.parentDirectoryPathPlan({ ...input, pathText: "/workspace/health" }), "");
  });

  await test("attachment and breadcrumb plans project route metadata", () => {
    const project = {
      id: "health",
      label: "Health",
      root: "/workspace/health",
      children: [{ id: "labs", label: "Labs", root: "/workspace/health/labs" }],
    };
    const attachment = model.directoryAttachmentFromRoutePlan({
      project,
      subprojectId: "labs",
      pathText: "/workspace/health/labs/blood.pdf",
      helpers,
    });
    assert.deepEqual(attachment, {
      projectId: "health",
      subprojectId: "labs",
      label: "Route: Health / Labs",
      path: "/workspace/health/labs/blood.pdf",
      root: "/workspace/health/labs",
    });

    const crumbs = model.directoryBreadcrumbItemsPlan({
      activePath: "/workspace/health/labs/blood.pdf",
      projects: [project],
      helpers,
    });
    assert.deepEqual(crumbs.map((item) => item.label), ["目录", "Health", "Labs", "blood.pdf"]);
  });

  await test("entry and root-project plans stay data-only", () => {
    const pdf = { type: "file", name: "report.pdf", mime: "application/pdf", size: 123, mtime: "2026-07-05" };
    assert.equal(model.directoryEntryKindPlan({ entry: pdf, helpers }), "pdf");
    assert.equal(model.directoryEntryHrefPlan({ entry: pdf, helpers }), "/files/report.pdf");
    assert.deepEqual(model.directoryEntryDocumentAttrsPlan({ entry: pdf }), {
      enabled: true,
      name: "report.pdf",
      mime: "application/pdf",
    });
    assert.equal(model.directoryEntryMetaPlan({ entry: pdf, helpers }), "123 B | time:2026-07-05");
    assert.equal(model.directorySearchMatchesPlan({ entry: pdf, search: "REPORT" }), true);

    const shared = { id: "shared", root: "/share", source: "shared-allowed-root", shared: true };
    const workspace = { id: "team", root: "/workspace/team", source: "workspace-directory" };
    assert.equal(model.isDirectorySharedRootProjectPlan(shared), true);
    assert.equal(model.isShareableRootProjectPlan(workspace), true);
    assert.equal(model.canDeleteDirectoryRootProjectPlan(workspace), true);
    assert.equal(model.directoryRootProjectLabelPlan({ id: "sync", label: "Sync" }), "同步文件夹");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
