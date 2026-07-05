"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const repoRoot = path.resolve(__dirname, "..");
const harness = fs.readFileSync(path.join(repoRoot, "scripts", "macos-worker-filesystem-access-harness.js"), "utf8");
const docsIndex = fs.readFileSync(path.join(repoRoot, "docs", "DOCS_INDEX.md"), "utf8");
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const { scanDriveDirectoriesMissingOwnerWrite } = require("../scripts/macos-worker-filesystem-access-harness");

assert.match(harness, /macos_worker_filesystem_access_harness/);
assert.match(harness, /HERMES_MOBILE_ROOT/);
assert.match(harness, /\/Users\/example\/path/);
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
assert.match(harness, /drive-directory-owner-write/);
assert.match(harness, /scanDriveDirectoriesMissingOwnerWrite/);
assert.match(harness, /owner_write_missing/);
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
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS worker filesystem access harness tests passed");
