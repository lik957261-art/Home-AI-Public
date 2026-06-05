"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const harness = fs.readFileSync(path.join(repoRoot, "scripts", "macos-worker-filesystem-access-harness.js"), "utf8");
const docsIndex = fs.readFileSync(path.join(repoRoot, "docs", "DOCS_INDEX.md"), "utf8");
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");

assert.match(harness, /macos_worker_filesystem_access_harness/);
assert.match(harness, /HERMES_MOBILE_ROOT/);
assert.match(harness, /\/Users\/hermes-host\/HermesMobile/);
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
assert.match(harness, /<HERMES_MOBILE_ROOT>/);
assert.doesNotMatch(harness, /owner-web-key|access-key\.txt|api-server-key|Authorization|Bearer/);

assert.match(docsIndex, /Mac worker filesystem access/);
assert.match(deploymentDoc, /macos-worker-filesystem-access-harness\.js/);

console.log("macOS worker filesystem access harness tests passed");
