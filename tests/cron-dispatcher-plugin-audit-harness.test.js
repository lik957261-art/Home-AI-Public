"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const dispatcher = fs.readFileSync(path.join(repoRoot, "scripts", "hermes-mobile-cron-dispatcher.py"), "utf8");
const runner = fs.readFileSync(path.join(repoRoot, "scripts", "plugin-workspace-audit-runner.js"), "utf8");
const coreProviders = fs.readFileSync(path.join(repoRoot, "adapters", "mobile-runtime-core-providers.js"), "utf8");

assert.match(dispatcher, /def _run_plugin_workspace_audit_job/);
assert.match(dispatcher, /plugin-workspace-audit-runner\.js/);
assert.match(dispatcher, /str\(job\.get\("kind"\) or ""\)\.strip\(\) == "plugin_workspace_audit"[\s\S]*?return False/);
assert.match(dispatcher, /if str\(job\.get\("kind"\) or ""\)\.strip\(\) == "plugin_workspace_audit":[\s\S]*?_run_plugin_workspace_audit_job\(job\)/);
assert.match(dispatcher, /save_job_output\(job_id, output or error\)/);
assert.match(dispatcher, /mark_job_run\(job_id, success, error\)/);
assert.doesNotMatch(dispatcher, /plugin_workspace_audit[\s\S]{0,300}run_job\(prepared_job\)/);

assert.match(runner, /plugin_audit_readonly_required/);
assert.match(runner, /runGit\(realPath, \["status", "--short"\]/);
assert.match(runner, /MEDIA:\$\{report\.reportPath\}/);
assert.match(runner, /createMobileSqliteStore/);
assert.match(runner, /upsertAuditInboxItem/);
assert.match(runner, /HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED/);
assert.match(runner, /HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME/);
assert.match(runner, /const args = \[\s*"exec"/);
assert.match(runner, /"--sandbox",\s*"read-only"/);
assert.match(runner, /"--ignore-user-config"/);
assert.match(runner, /redactWorkspacePath/);
assert.match(runner, /report intentionally omits the target workspace absolute path/i);
assert.match(coreProviders, /parseAuditTargetConfig/);
assert.match(coreProviders, /allowedExceptionRoots[\s\S]*parseAuditTargetConfig\(\{ env \}\)/);

console.log("cron dispatcher plugin audit harness passed");
