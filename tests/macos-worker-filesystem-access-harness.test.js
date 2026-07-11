"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const repoRoot = path.resolve(__dirname, "..");
const harness = fs.readFileSync(path.join(repoRoot, "scripts", "macos-worker-filesystem-access-harness.js"), "utf8");
const docsIndex = fs.readFileSync(path.join(repoRoot, "docs", "DOCS_INDEX.md"), "utf8");
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const {
  catalogWorkspaceChecks,
  catalogWorkspaceDenyChecks,
  catalogWorkspaceTargets,
  macUserForWorkspaceId,
  macUserFromWorkspaceRecord,
  missingWorkerUserStatus,
  safeMacUser,
  safeWorkspaceId,
  scanDriveDirectoriesMissingOwnerWrite,
  targetWorkspaceChecks,
  targetWorkspaceDenyChecks,
} = require("../scripts/macos-worker-filesystem-access-harness");

assert.match(harness, /macos_worker_filesystem_access_harness/);
assert.match(harness, /HERMES_MOBILE_ROOT/);
assert.match(harness, /process\.env\.HERMES_MOBILE_ROOT \|\| "\/Users\/example\/path"/);
assert.match(harness, /hm-owner/);
assert.match(harness, /hm-wuping/);
assert.match(harness, /weixin_stephen/);
assert.match(harness, /user-981731fe/);
assert.match(harness, /user-a87aaa61/);
assert.match(harness, /defaultDenyChecks/);
assert.match(harness, /deny-owner-skill-store/);
assert.match(harness, /deny-wuping-plugin-private/);
assert.match(harness, /expectedDenied/);
assert.match(harness, /!access\.readable && !access\.writable/);
assert.match(harness, /sudo/);
assert.match(harness, /write_smoke/);
assert.match(harness, /effectiveWritable = writeSmoke \? access\.writeSmoke : access\.writable/);
assert.match(harness, /drive-directory-owner-write/);
assert.match(harness, /scanDriveDirectoriesMissingOwnerWrite/);
assert.match(harness, /owner_write_missing/);
assert.match(harness, /--target-only/);
assert.match(harness, /--workspace-id/);
assert.match(harness, /--mac-user/);
assert.match(harness, /--workspace-catalog-targets/);
assert.match(harness, /data", "drive", "users"/);
assert.match(harness, /<HERMES_MOBILE_ROOT>/);
assert.doesNotMatch(harness, /owner-web-key|access-key\.txt|api-server-key|Authorization|Bearer/);

assert.match(docsIndex, /Mac worker filesystem access/);
assert.match(deploymentDoc, /macos-worker-filesystem-access-harness\.js/);
assert.match(deploymentDoc, /owner write bit/i);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-worker-fs-harness-"));
try {
  const driveUsersRoot = path.join(tempRoot, "data", "drive", "users");
  const importedDir = path.join(driveUsersRoot, "owner", "imported");
  fs.mkdirSync(importedDir, { recursive: true, mode: 0o755 });
  fs.chmodSync(importedDir, 0o555);
  const failed = scanDriveDirectoriesMissingOwnerWrite(tempRoot, { limit: 10 });
  assert.equal(failed.status, "failed");
  assert.ok(failed.findings.some((item) => item.reason === "owner_write_missing" && item.path.endsWith("/owner/imported")));
  fs.chmodSync(importedDir, 0o755);
  const passed = scanDriveDirectoriesMissingOwnerWrite(tempRoot, { limit: 10 });
  assert.equal(passed.status, "ok");
  assert.equal(passed.findings.length, 0);

  assert.equal(safeWorkspaceId("TWH"), "twh");
  assert.equal(safeWorkspaceId("../twh"), "");
  assert.equal(safeMacUser("hm-twh"), "hm-twh");
  assert.equal(safeMacUser("root"), "");
  assert.equal(macUserForWorkspaceId("TWH"), "hm-twh");
  assert.equal(macUserForWorkspaceId("weixin_wuping"), "hm-weixin-wuping");
  assert.equal(macUserFromWorkspaceRecord({ id: "twh" }), "hm-twh");
  assert.equal(macUserFromWorkspaceRecord({ id: "twh", mac_user: "hm-explicit" }), "hm-explicit");
  assert.equal(macUserFromWorkspaceRecord({ id: "twh", paths: { workerHome: "/Users/example/path" } }), "hm-from-path");
  assert.equal(missingWorkerUserStatus({ required: true }, { workspaceCatalogTargets: false }), "failed");
  assert.equal(missingWorkerUserStatus({ required: true }, { workspaceCatalogTargets: true }), "skipped");
  assert.equal(missingWorkerUserStatus({ required: false }, { workspaceCatalogTargets: false }), "skipped");
  const targetChecks = targetWorkspaceChecks(tempRoot, "twh", "hm-twh");
  assert.deepEqual(targetChecks.map((item) => item.user), ["hm-twh"]);
  assert.deepEqual(targetChecks[0].paths, [
    path.join(tempRoot, "data", "drive", "users", "twh"),
    path.join(tempRoot, "data", "uploads"),
  ]);
  const targetDeny = targetWorkspaceDenyChecks(tempRoot, "twh", "hm-twh");
  assert.equal(targetDeny[0].user, "hm-twh");
  assert.match(targetDeny[0].label, /twh-deny-owner-skill-store/);
  fs.mkdirSync(path.join(tempRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "data", "workspaces.json"), JSON.stringify({
    workspaces: [
      { id: "owner" },
      { id: "TWH" },
      { id: "../bad" },
      { id: "child", macUser: "hm-child-custom" },
      { id: "child", macUser: "hm-child-custom" },
    ],
  }), "utf8");
  const catalogTargets = catalogWorkspaceTargets(tempRoot);
  assert.deepEqual(catalogTargets, [
    { workspaceId: "child", macUser: "hm-child-custom" },
    { workspaceId: "twh", macUser: "hm-twh" },
  ]);
  const catalogChecks = catalogWorkspaceChecks(tempRoot, catalogTargets);
  assert.equal(catalogChecks.length, 2);
  assert.ok(catalogChecks.some((item) => item.user === "hm-twh" && item.paths.includes(path.join(tempRoot, "data", "uploads"))));
  const catalogDenyChecks = catalogWorkspaceDenyChecks(tempRoot, catalogTargets);
  assert.equal(catalogDenyChecks.length, 2);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS worker filesystem access harness tests passed");
