"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

const repoRoot = path.resolve(__dirname, "..");
const runner = path.join(repoRoot, "scripts", "plugin-workspace-audit-runner.js");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function makeGitWorkspace(root) {
  const workspace = path.join(root, "plugin");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"name\":\"plugin-fixture\"}\n");
  fs.writeFileSync(path.join(workspace, "index.js"), "function main() { return true; }\nmodule.exports = { main };\n");
  run("git", ["init"], workspace);
  run("git", ["config", "user.name", "Audit Harness"], workspace);
  run("git", ["config", "user.email", "audit@example.invalid"], workspace);
  run("git", ["add", "."], workspace);
  run("git", ["commit", "-m", "fixture"], workspace);
  fs.appendFileSync(path.join(workspace, "index.js"), "\n// TODO: verify plugin audit harness\n");
  return workspace;
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-audit-runner-"));
  const workspace = makeGitWorkspace(tempRoot);
  const outputRoot = path.join(tempRoot, "output");
  const dbPath = path.join(tempRoot, "data", "hermes-mobile.sqlite3");
  const fakeCodexLog = path.join(tempRoot, "fake-codex-call.json");
  const fakeCodex = path.join(tempRoot, "fake-codex.js");
  fs.writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.writeFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ argv, cwd: process.cwd() }, null, 2));",
    "const outputIndex = argv.indexOf('--output-last-message');",
    "if (outputIndex >= 0 && argv[outputIndex + 1]) fs.writeFileSync(argv[outputIndex + 1], 'index.js:1 MEDIUM - fake issue from read-only review\\n');",
    "console.log('Codex review executed in ' + process.cwd());",
    "console.log('transcript output should not be preferred over final message');",
  ].join("\n") + "\n");
  fs.chmodSync(fakeCodex, 0o755);
  const job = {
    id: "audit_job_1",
    kind: "plugin_workspace_audit",
    name: "Codex audit",
    owner_principal_id: "owner",
    readonly: true,
    audit: {
      kind: "plugin_workspace_audit",
      pluginId: "codex-mobile",
      pluginTitle: "Codex",
      targetWorkspaceId: "owner",
      workspacePathRef: "test-registry",
      workspacePath: workspace,
      auditMode: "dirty_diff",
      executor: "codex_readonly",
      readonly: true,
    },
  };
  const jobFile = path.join(tempRoot, "job.json");
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const result = spawnSync(process.execPath, [
    runner,
    "--job-file",
    jobFile,
    "--output-root",
    outputRoot,
    "--json",
  ], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, {
      HERMES_WEB_DB_PATH: dbPath,
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: "1",
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND: fakeCodex,
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS: "30000",
      FAKE_CODEX_LOG: fakeCodexLog,
    }),
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.pluginId, "codex-mobile");
  assert.equal(payload.summary.findingCount >= 1, true);
  assert.match(payload.output, /MEDIA:/);
  assert.match(payload.output, /Codex Read-Only Review/);
  assert.match(payload.output, /index\.js:1 MEDIUM - fake issue/);
  assert.equal(payload.output.includes(workspace), false, "report must not expose target workspace absolute path");
  assert.equal(fs.existsSync(payload.reportPath), true);
  assert.equal(path.dirname(payload.reportPath), path.join(outputRoot, "audit_job_1"));
  const fakeCall = JSON.parse(fs.readFileSync(fakeCodexLog, "utf8"));
  assert.equal(fakeCall.cwd, fs.realpathSync.native(workspace));
  assert.equal(fakeCall.argv[0], "exec");
  assert.equal(fakeCall.argv.includes("--sandbox"), true);
  assert.equal(fakeCall.argv.includes("read-only"), true);
  assert.equal(fakeCall.argv.includes("--ephemeral"), true);
  assert.equal(fakeCall.argv.includes("--ignore-user-config"), true);
  assert.equal(fakeCall.argv.includes("--output-last-message"), true);
  assert.equal(fakeCall.argv.includes("--cd"), true);
  assert.match(fakeCall.argv.join("\n"), /Do not edit files/);

  const store = createMobileSqliteStore({ dbPath });
  try {
    const items = store.listActionInboxItems({ workspaceId: "owner", sourceType: "automation", limit: 20 });
    assert.equal(items.length, 1);
    assert.equal(items[0].itemType, "review");
    assert.equal(items[0].sourceRef.kind, "plugin_workspace_audit");
    assert.equal(items[0].sourceRef.pluginId, "codex-mobile");
    assert.equal(items[0].sourceRef.rawDiff, undefined);
    assert.match(items[0].sourceRef.reportUrl, /\/api\/automations\/output\?jobId=audit_job_1/);
  } finally {
    store.close();
  }

  const badJobFile = path.join(tempRoot, "bad-job.json");
  fs.writeFileSync(badJobFile, JSON.stringify(Object.assign({}, job, { readonly: false })));
  const denied = spawnSync(process.execPath, [runner, "--job-file", badJobFile, "--output-root", outputRoot, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /plugin_audit_readonly_required/);

  console.log("plugin workspace audit runner tests passed");
}

main();
