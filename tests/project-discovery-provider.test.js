"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProjectDiscoveryProvider } = require("../adapters/project-discovery-provider");

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-project-provider-"));
  const driveRoot = path.join(tempRoot, "ChatGPT-Drive");
  fs.mkdirSync(path.join(driveRoot, "Mapped", "Sub"), { recursive: true });
  fs.mkdirSync(path.join(driveRoot, "PhysicalOnly"), { recursive: true });

  const calls = [];
  const provider = createProjectDiscoveryProvider({
    repoRoot: tempRoot,
    singleWindowProjectId: "single-window",
    singleWindowThreadTitle: "Single Window",
    normalizeLocalPath: (value) => String(value || ""),
    makeId: (prefix) => `${prefix}-generated`,
    workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
    findWorkspace: (workspaceId) => ({ id: workspaceId, label: `Workspace ${workspaceId}`, policy: { principal_id: `principal:${workspaceId}` } }),
    sharedProjectsForWorkspace(workspaceId) {
      return [{
        id: "shared",
        workspaceId,
        label: "Shared",
        root: path.join(driveRoot, "ExternalShared"),
        source: "hermes-web-shared-directory",
        shared: true,
      }];
    },
    async runDirectoryBridge(payload) {
      calls.push(payload);
      return {
        ok: true,
        entries: [{
          type: "directory",
          name: "RemoteA",
          path: "/volume1/Hermes-Test/RemoteA",
          children: [{ type: "directory", name: "Child", path: "/volume1/Hermes-Test/RemoteA/Child" }],
        }],
      };
    },
  });

  const ownerProjects = provider.projectsForWorkspace({
    id: "owner",
    defaultWorkspace: driveRoot,
    policy: { access_mode: "unrestricted" },
  }, [{
    project_key: "mapped-sub",
    windows_root: path.join(driveRoot, "Mapped", "Sub"),
    aliases: ["Mapped / Sub"],
  }]);
  assert.equal(ownerProjects.some((project) => project.id === "single-window"), true);
  assert.equal(ownerProjects.some((project) => project.label === "Mapped"), true);
  assert.equal(ownerProjects.some((project) => project.label === "PhysicalOnly"), true);
  assert.equal(ownerProjects.some((project) => project.id === "shared"), true);

  const workspaceRoot = path.join(tempRoot, "Workspace");
  fs.mkdirSync(path.join(workspaceRoot, "ProjectA"), { recursive: true });
  const workspaceProjects = provider.projectsForWorkspace({
    id: "workspace_a",
    defaultWorkspace: workspaceRoot,
    policy: {
      access_mode: "restricted",
      default_workspace: workspaceRoot,
      allowed_roots: [workspaceRoot],
    },
  }, []);
  assert.equal(workspaceProjects.some((project) => project.label === "ProjectA"), true);
  assert.equal(provider.isShareableRootProject(workspaceProjects.find((project) => project.label === "ProjectA")), true);
  assert.equal(provider.isShareableRootProject(workspaceProjects.find((project) => project.id === "single-window")), false);

  const remoteProjects = await provider.remoteWorkspaceDirectoryProjects({
    id: "workspace_remote",
    label: "Remote Workspace",
    defaultWorkspace: "/volume1/Hermes-Test",
    policy: {
      default_workspace: "/volume1/Hermes-Test",
      allowed_roots: ["/volume1/Hermes-Test"],
    },
  });
  assert.deepEqual(calls.at(-1), { action: "tree", path: "/volume1/Hermes-Test" });
  assert.equal(remoteProjects[0].label, "RemoteA");
  assert.equal(remoteProjects[0].children[0].label, "Child");

  const deduped = provider.dedupeProjects([
    { id: "normal", workspaceId: "w", root: "/r", source: "project-directory-map" },
    { id: "shared", workspaceId: "w", root: "/r", source: "hermes-web-shared-directory", shared: true },
  ]);
  assert.deepEqual(deduped.map((project) => project.id), ["shared"]);
}

run()
  .then(() => console.log("project-discovery-provider contract passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
