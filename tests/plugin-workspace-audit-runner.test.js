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
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"name\":\"plugin-fixture\"}\n");
  fs.writeFileSync(path.join(workspace, "index.js"), "function main() { return true; }\nmodule.exports = { main };\n");
  fs.writeFileSync(path.join(workspace, "docs", "PRODUCT_REQUIREMENTS.md"), "# Product Requirements\n\nKeep implementation aligned with docs.\n");
  run("git", ["init"], workspace);
  run("git", ["config", "user.name", "Audit Harness"], workspace);
  run("git", ["config", "user.email", "audit@example.invalid"], workspace);
  run("git", ["add", "."], workspace);
  run("git", ["commit", "-m", "fixture"], workspace);
  fs.appendFileSync(path.join(workspace, "index.js"), "\n// TODO: verify plugin audit harness\n");
  return workspace;
}

function makePlainWorkspace(root) {
  const workspace = path.join(root, "plain-plugin");
  fs.mkdirSync(path.join(workspace, "docs", "IMPLEMENTATION_NOTES"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"name\":\"plain-plugin-fixture\"}\n");
  fs.writeFileSync(path.join(workspace, "index.js"), "export function main() { return true; }\n");
  fs.writeFileSync(path.join(workspace, "docs", "README.md"), "# Plain Plugin\n\nRuntime deployment without Git metadata.\n");
  fs.writeFileSync(path.join(workspace, "docs", "IMPLEMENTATION_NOTES", "runtime.md"), "# Runtime\n\nKeep audit useful without .git.\n");
  return workspace;
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-audit-runner-"));
  const workspace = makeGitWorkspace(tempRoot);
  const outputRoot = path.join(tempRoot, "output");
  const dbPath = path.join(tempRoot, "data", "hermes-mobile.sqlite3");
  const fakeCodexLog = path.join(tempRoot, "fake-codex-call.json");
  const fakeCodex = path.join(tempRoot, "fake-codex.js");
  const fakeTaskCardLog = path.join(tempRoot, "fake-task-card-call.json");
  const fakeTaskCard = path.join(tempRoot, "fake-task-card.js");
  const taskCardConfig = path.join(tempRoot, "task-card-config.json");
  fs.writeFileSync(fakeCodex, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const argv = process.argv.slice(2);",
    "fs.writeFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ argv, cwd: process.cwd() }, null, 2));",
    "const outputIndex = argv.indexOf('--output-last-message');",
    "if (outputIndex >= 0 && argv[outputIndex + 1]) fs.writeFileSync(argv[outputIndex + 1], 'index.js:1 MEDIUM - 来自只读审计的模拟问题\\n');",
    "console.log('Codex review executed in ' + process.cwd());",
    "console.log('transcript output should not be preferred over final message');",
  ].join("\n") + "\n");
  fs.chmodSync(fakeCodex, 0o755);
  fs.writeFileSync(fakeTaskCard, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const index = process.argv.indexOf('--json-file');",
    "const file = index >= 0 ? process.argv[index + 1] : '';",
    "const request = JSON.parse(fs.readFileSync(file, 'utf8'));",
    "fs.writeFileSync(process.env.FAKE_TASK_CARD_LOG, JSON.stringify({ request, cwd: process.cwd(), keyFile: process.env.CODEX_MOBILE_KEY_FILE || '' }, null, 2));",
    "console.log(JSON.stringify({ ok: true, card: { id: 'card-1' } }));",
  ].join("\n") + "\n");
  fs.chmodSync(fakeTaskCard, 0o755);
  fs.writeFileSync(taskCardConfig, JSON.stringify({
    sourceThreadId: "source-thread",
    plugins: {
      "codex-mobile": {
        targetThreadIds: ["target-thread"],
      },
    },
  }, null, 2));
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
      auditMode: "product_reality",
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
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_CONFIG_FILE: taskCardConfig,
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_SCRIPT: fakeTaskCard,
      HERMES_MOBILE_ROOT: "/Users/example/path",
      CODEX_MOBILE_KEY_FILE: "",
      FAKE_CODEX_LOG: fakeCodexLog,
      FAKE_TASK_CARD_LOG: fakeTaskCardLog,
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
  assert.match(payload.output, /Codex 只读审计/);
  assert.match(payload.output, /插件工作区产品现实一致性审计/);
  assert.match(payload.output, /文档、架构与实现抽样文件/);
  assert.match(payload.output, /docs\/PRODUCT_REQUIREMENTS\.md/);
  assert.match(payload.output, /index\.js:1 MEDIUM - 来自只读审计的模拟问题/);
  assert.match(payload.output, /跨线程任务卡/);
  assert.match(payload.output, /状态: sent/);
  assert.match(payload.output, /回卡要求: required/);
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
  assert.match(fakeCall.argv.join("\n"), /不要编辑文件/);
  assert.match(fakeCall.argv.join("\n"), /产品现实一致性审计/);
  assert.match(fakeCall.argv.join("\n"), /X High/);
  assert.match(fakeCall.argv.join("\n"), /deep-product-reality-audit-contract\.md/);
  assert.match(fakeCall.argv.join("\n"), /Core Journey Matrix/);
  assert.match(fakeCall.argv.join("\n"), /design_gap/);
  assert.match(fakeCall.argv.join("\n"), /surface_product_reality/);
  assert.match(fakeCall.argv.join("\n"), /不要找到一两个方便的小问题就结束/);
  assert.match(fakeCall.argv.join("\n"), /Return Card Required/);
  const fakeCardCall = JSON.parse(fs.readFileSync(fakeTaskCardLog, "utf8"));
  assert.equal(fakeCardCall.request.sourceThreadId, "source-thread");
  assert.deepEqual(fakeCardCall.request.targetThreadIds, ["target-thread"]);
  assert.equal(fakeCardCall.request.workflowId, "home-ai-plugin-workspace-audit");
  assert.equal(fakeCardCall.request.autoApprove, true);
  assert.equal(fakeCardCall.keyFile, "/Users/example/path");
  assert.match(fakeCardCall.request.body, /Keep profile, auth, thread state, and app-server\/mux ownership inside Codex Mobile/);
  assert.match(fakeCardCall.request.body, /Product Reality finding/);
  assert.match(fakeCardCall.request.body, /Return Card Required/);

  const store = createMobileSqliteStore({ dbPath });
  try {
    const items = store.listActionInboxItems({ workspaceId: "owner", sourceType: "automation", limit: 20 });
    assert.equal(items.length, 1);
    assert.equal(items[0].itemType, "review");
    assert.equal(items[0].sourceRef.kind, "plugin_workspace_audit");
    assert.equal(items[0].sourceRef.pluginId, "codex-mobile");
    assert.equal(items[0].sourceRef.rawDiff, undefined);
    assert.match(items[0].sourceRef.reportUrl, /\/api\/automations\/output\?jobId=audit_job_1/);
    assert.equal(items[0].sourceRef.latestDeliverable.name.startsWith("plugin-workspace-audit-codex-mobile-"), true);
    assert.match(items[0].sourceRef.latestDeliverable.url, /\/api\/automations\/output\?jobId=audit_job_1/);
  } finally {
    store.close();
  }

  const plainWorkspace = makePlainWorkspace(tempRoot);
  const plainJob = Object.assign({}, job, {
    id: "audit_plain_1",
    audit: Object.assign({}, job.audit, {
      workspacePath: plainWorkspace,
      workspacePathRef: "plain-runtime-fixture",
      executor: "none",
    }),
  });
  const plainJobFile = path.join(tempRoot, "plain-job.json");
  fs.writeFileSync(plainJobFile, JSON.stringify(plainJob));
  const plain = spawnSync(process.execPath, [
    runner,
    "--job-file",
    plainJobFile,
    "--output-root",
    outputRoot,
    "--json",
  ], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, {
      HERMES_WEB_DB_PATH: path.join(tempRoot, "data", "plain-hermes-mobile.sqlite3"),
      HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED: "0",
    }),
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  assert.equal(plain.status, 0, plain.stderr || plain.stdout);
  const plainPayload = JSON.parse(plain.stdout);
  assert.equal(plainPayload.ok, true);
  assert.equal(plainPayload.summary.findingCount, 0);
  assert.match(plainPayload.output, /工作区没有 Git 元数据，已改用文件系统抽样/);
  assert.match(plainPayload.output, /docs\/README\.md/);
  assert.match(plainPayload.output, /docs\/IMPLEMENTATION_NOTES\/runtime\.md/);
  assert.match(plainPayload.output, /index\.js/);
  assert.doesNotMatch(plainPayload.output, /HIGH - 工作区无法作为 Git 仓库读取/);

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
