"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSharedDirectoryProvider } = require("../adapters/shared-directory-provider");

function readJsonFirst(paths, fallback = {}) {
  for (const candidate of paths || []) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    return { data: JSON.parse(fs.readFileSync(candidate, "utf8")), path: candidate };
  }
  return { data: fallback, path: "" };
}

function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-shared-directory-provider-"));
  const storagePath = path.join(tempRoot, "shared-directories.json");
  const usersPath = path.join(tempRoot, "workspace-users.json");
  fs.writeFileSync(usersPath, JSON.stringify({
    users: [{
      principal_id: "weixin_alice",
      allowed_roots: [
        "/volume1/Hermes-Alice",
        "/volume1/Hermes-Alice/SharedHealth",
      ],
      delivery_roots: ["/volume1/Hermes-Alice/SharedHealth"],
    }],
  }, null, 2), "utf8");

  const workspaces = [{
    id: "owner",
    label: "Owner",
    defaultWorkspace: "/repo",
    policy: { principal_id: "owner", access_mode: "unrestricted" },
  }, {
    id: "weixin_alice",
    label: "Alice",
    defaultWorkspace: "/volume1/Hermes-Alice",
    policy: {
      principal_id: "weixin_alice",
      access_mode: "restricted",
      default_workspace: "/volume1/Hermes-Alice",
      allowed_roots: [
        "/volume1/Hermes-Alice",
        "/volume1/Hermes-Alice/SharedHealth",
      ],
    },
  }, {
    id: "weixin_bob",
    label: "Bob",
    defaultWorkspace: "/volume1/Hermes-Bob",
    policy: {
      principal_id: "weixin_bob",
      access_mode: "restricted",
      default_workspace: "/volume1/Hermes-Bob",
      allowed_roots: ["/volume1/Hermes-Bob"],
    },
  }];

  const provider = createSharedDirectoryProvider({
    storagePath,
    ensureDataDir: () => fs.mkdirSync(path.dirname(storagePath), { recursive: true }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    readJsonFirst,
    usersPaths: [usersPath],
    loadCatalog: () => ({ workspaces }),
    findWorkspace: (workspaceId) => workspaces.find((item) => item.id === workspaceId) || null,
    workspacePrincipal: (workspaceId) => workspaces.find((item) => item.id === workspaceId)?.policy?.principal_id || workspaceId,
  });

  const record = provider.upsert({
    path: "/volume1/Hermes-Alice/Reports",
    label: "Reports",
    createdBy: "weixin_alice",
    createdByPrincipalId: "weixin_alice",
    permission: "read_only",
    scope: "selected_workspaces",
    targetWorkspaceIds: ["weixin_bob"],
    aliases: ["Daily Reports"],
  });
  assert.equal(provider.id(record).startsWith("share-"), true);
  assert.deepEqual(provider.roots("weixin_bob"), ["/volume1/Hermes-Alice/Reports"]);
  assert.deepEqual(provider.roots("unlisted"), []);
  assert.equal(provider.publicRecord(record, "weixin_bob").canManage, false);
  assert.equal(provider.publicRecord(record, "weixin_alice").canManage, true);

  const bobProjects = provider.projectsForWorkspace("weixin_bob", workspaces);
  assert.equal(bobProjects.length, 1);
  assert.equal(bobProjects[0].label, "Reports");
  assert.equal(bobProjects[0].sharedByLabel, "Alice");
  assert.equal(provider.isWriteAllowed({ workspaceId: "weixin_bob" }, "", "/volume1/Hermes-Alice/Reports/out.pdf"), false);

  const catalogBuildProvider = createSharedDirectoryProvider({
    storagePath,
    ensureDataDir: () => fs.mkdirSync(path.dirname(storagePath), { recursive: true }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    readJsonFirst,
    usersPaths: [usersPath],
    loadCatalog: () => { throw new Error("projectsForWorkspace must not load catalog during catalog build"); },
    findWorkspace: () => { throw new Error("projectsForWorkspace must use the provided workspace snapshot"); },
    workspacePrincipal: () => { throw new Error("projectsForWorkspace must not call workspacePrincipal during catalog build"); },
  });
  const snapshotProjects = catalogBuildProvider.projectsForWorkspace("weixin_bob", workspaces);
  assert.equal(snapshotProjects.length, 1);
  assert.equal(snapshotProjects[0].sharedByLabel, "Alice");
  assert.deepEqual(catalogBuildProvider.roots("weixin_bob", "weixin_bob"), ["/volume1/Hermes-Alice/Reports"]);

  const updated = provider.updateAccess(provider.id(record), "weixin_alice", {
    permission: "read_write",
    scope: "all_workspaces",
  });
  assert.equal(updated.permission, "read_write");
  assert.equal(updated.scope, "all_workspaces");
  assert.equal(provider.isWriteAllowed({ workspaceId: "weixin_bob" }, "", "/volume1/Hermes-Alice/Reports/out.pdf"), true);

  const aclRecords = provider.aclRecords();
  assert.equal(aclRecords.length, 1);
  assert.equal(aclRecords[0].label, "SharedHealth");
  assert.equal(provider.publicRecord(aclRecords[0], "owner").source, "acl-allowed-root");
  assert.equal(provider.directoriesForWorkspace("owner").length, 2);

  const removedAcl = provider.removeAcl(provider.id(aclRecords[0]), "owner");
  assert.equal(removedAcl.path, "/volume1/Hermes-Alice/SharedHealth");
  const usersAfterRemove = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  assert.deepEqual(usersAfterRemove.users[0].allowed_roots, ["/volume1/Hermes-Alice"]);
  assert.deepEqual(usersAfterRemove.users[0].delivery_roots, []);

  const removedExplicit = provider.removeRecord(provider.id(updated), "weixin_alice");
  assert.equal(removedExplicit.path, "/volume1/Hermes-Alice/Reports");
  assert.deepEqual(provider.loadRecords(), []);
}

run();
console.log("shared-directory-provider contract passed.");
