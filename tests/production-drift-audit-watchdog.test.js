"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const watchdog = path.join(repoRoot, "scripts", "homeai-production-drift-audit-watchdog.sh");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-drift-watchdog-"));
const appScripts = path.join(root, "app", "scripts");
const outDir = path.join(root, "data", "production-drift-audit");
const marker = path.join(root, "data", "repair-applied");
fs.mkdirSync(appScripts, { recursive: true });

fs.writeFileSync(path.join(appScripts, "macos-production-profile-audit.js"), `
"use strict";
const fs = require("node:fs");
const marker = ${JSON.stringify(marker)};
const repaired = fs.existsSync(marker);
process.stdout.write(JSON.stringify({
  ok: repaired,
  issues: repaired ? [] : ["codex_auth_json_unreadable:hm-owner-openai-1"],
  warnings: [],
}) + "\\n");
`);

fs.writeFileSync(path.join(appScripts, "macos-production-drift-reconcile.js"), `
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const marker = ${JSON.stringify(marker)};
fs.mkdirSync(path.dirname(marker), { recursive: true });
fs.writeFileSync(marker, "1\\n");
process.stdout.write(JSON.stringify({
  ok: true,
  execute: true,
  actionCount: 1,
  rows: [{ type: "codex-shared-auth-permissions", action: "repair", ok: true, status: 0 }],
}) + "\\n");
`);

execFileSync("bash", [watchdog], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HERMES_MOBILE_ROOT: root,
    HERMES_MOBILE_APP_DIR: path.join(root, "app"),
    HERMES_MOBILE_NODE_EXE: process.execPath,
    HOMEAI_PRODUCTION_DRIFT_AUDIT_OUTPUT_DIR: outDir,
    HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR: "1",
  },
  stdio: "pipe",
});

const latest = JSON.parse(fs.readFileSync(path.join(outDir, "latest.json"), "utf8"));
assert.equal(latest.ok, true);
assert.equal(latest.auditOk, true);
assert.equal(latest.coreDriftIssueCount, 0);
assert.equal(latest.autoRepair.enabled, true);
assert.equal(latest.autoRepair.attempted, true);
assert.equal(latest.autoRepair.ok, true);
assert.equal(latest.autoRepair.repair.ok, true);
assert.deepEqual(latest.autoRepair.repair.rows.map((row) => `${row.type}:${row.action}:${row.ok}`), [
  "codex-shared-auth-permissions:repair:true",
]);
assert.equal(fs.existsSync(marker), true);

const summary = fs.readFileSync(path.join(outDir, "summary.md"), "utf8");
assert.match(summary, /autoRepairAttempted: true/);
assert.match(summary, /codex-shared-auth-permissions: repair ok=true/);
assert.equal(summary.includes("access_token"), false);

console.log("production drift audit watchdog tests passed");
