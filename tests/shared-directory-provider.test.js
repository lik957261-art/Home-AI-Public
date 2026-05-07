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
  const usersPath = path.join(tempRoot, "weixin-users.json");
  fs.writeFileSync(usersPath, JSON.stringify({
    users: [{
      principal_id: "weixin_wuping",
      allowed_roots: [
        "/volume1/Hermes-WuPing",
        "/volume1/Hermes-WuPing/SharedHealth",
      ],
      delivery_roots: ["/volume1/Hermes-WuPing/SharedHealth"],
    }],
  }, null, 2), "utf8");

  const workspaces = [{
    id: "owner",
    label: "Owner",
    defaultWorkspace: "/repo",
    policy: { principal_id: "owner", access_mode: "unrestricted" },
  }, {
    id: "weixin_wuping",
    label: "WuPing",
    defaultWorkspace: "/volume1/Hermes-WuPing",
    policy: {
      principal_id: "weixin_wuping",
      access_mode: "restricted",
      default_workspace: "/volume1/Hermes-WuPing",
      allowed_roots: [
        "/volume1/Hermes-WuPing",
        "/volume1/Hermes-WuPing/SharedHealth",
      ],
    },
  }, {
    id: "weixin_qifan",
    label: "QiFan",
    defaultWorkspace: "/volume1/Hermes-QiFan",
    policy: {
      principal_id: "weixin_qifan",
      access_mode: "restricted",
      default_workspace: "/volume1/Hermes-QiFan",
      allowed_roots: ["/volume1/Hermes-QiFan"],
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
    path: "/volume1/Hermes-WuPing/Reports",
    label: "Reports",
    createdBy: "weixin_wuping",
    createdByPrincipalId: "weixin_wuping",
    permission: "read_only",
    scope: "selected_workspaces",
    targetWorkspaceIds: ["weixin_qifan"],
    aliases: ["Daily Reports"],
  });
  assert.equal(provider.id(record).startsWith("share-"), true);
  assert.deepEqual(provider.roots("weixin_qifan"), ["/volume1/Hermes-WuPing/Reports"]);
  assert.deepEqual(provider.roots("unlisted"), []);
  assert.equal(provider.publicRecord(record, "weixin_qifan").canManage, false);
  assert.equal(provider.publicRecord(record, "weixin_wuping").canManage, true);

  const qifanProjects = provider.projectsForWorkspace("weixin_qifan", workspaces);
  assert.equal(qifanProjects.length, 1);
  assert.equal(qifanProjects[0].label, "Reports");
  assert.equal(qifanProjects[0].sharedByLabel, "WuPing");
  assert.equal(provider.isWriteAllowed({ workspaceId: "weixin_qifan" }, "", "/volume1/Hermes-WuPing/Reports/out.pdf"), false);

  const updated = provider.updateAccess(provider.id(record), "weixin_wuping", {
    permission: "read_write",
    scope: "all_workspaces",
  });
  assert.equal(updated.permission, "read_write");
  assert.equal(updated.scope, "all_workspaces");
  assert.equal(provider.isWriteAllowed({ workspaceId: "weixin_qifan" }, "", "/volume1/Hermes-WuPing/Reports/out.pdf"), true);

  const aclRecords = provider.aclRecords();
  assert.equal(aclRecords.length, 1);
  assert.equal(aclRecords[0].label, "SharedHealth");
  assert.equal(provider.publicRecord(aclRecords[0], "owner").source, "acl-allowed-root");
  assert.equal(provider.directoriesForWorkspace("owner").length, 2);

  const removedAcl = provider.removeAcl(provider.id(aclRecords[0]), "owner");
  assert.equal(removedAcl.path, "/volume1/Hermes-WuPing/SharedHealth");
  const usersAfterRemove = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  assert.deepEqual(usersAfterRemove.users[0].allowed_roots, ["/volume1/Hermes-WuPing"]);
  assert.deepEqual(usersAfterRemove.users[0].delivery_roots, []);

  const removedExplicit = provider.removeRecord(provider.id(updated), "weixin_wuping");
  assert.equal(removedExplicit.path, "/volume1/Hermes-WuPing/Reports");
  assert.deepEqual(provider.loadRecords(), []);
}

run();
console.log("shared-directory-provider contract passed.");
