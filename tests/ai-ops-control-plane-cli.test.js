"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "ai-ops-control-plane.js");

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ai-ops-cli-"));
}

{
  const result = run([
    "intake",
    "--task", "visual PWA plugin bottom nav bug",
    "--changed-file", "public/app-embedded-plugin-ui.js",
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.harnessClass, "H2");
  assert.equal(result.rootCauseGovernance.required, true);
  assert.ok(result.blockedIf.includes("root_cause_classification_missing"));
  assert.ok(result.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
  assert.equal(result.visualLane.required, true);
  assert.ok(result.requiredChecks.some((item) => item.command.includes("lane allocate")));
}

{
  const result = run([
    "required-checks",
    "--task", "production deploy plugin MCP",
    "--changed-file", "adapters/hermes-plugin-service.js",
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.harnessClass, "H1");
  assert.equal(result.rootCauseGovernanceRequired, true);
  assert.ok(result.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
  assert.ok(result.requiredChecks.some((item) => item.command.includes("hermes-plugin-service.test.js")));
}

{
  const root = tempRoot();
  const stateFile = path.join(root, "lanes.json");
  const allocated = run([
    "lane", "allocate",
    "--plugin-id", "codex-mobile",
    "--requester", "cli-test",
    "--state-file", stateFile,
    "--ttl-ms", "10000",
    "--json",
  ]);
  assert.equal(allocated.ok, true);
  assert.equal(allocated.lane.id, "ios-pwa-1");
  const listed = run(["lane", "list", "--state-file", stateFile, "--json"]);
  assert.equal(listed.lanes.filter((lane) => lane.lease).length, 1);
  const released = run(["lane", "release", "--lease-id", allocated.lane.lease.id, "--state-file", stateFile, "--json"]);
  assert.equal(released.ok, true);
}

{
  const root = tempRoot();
  const ledger = path.join(root, "ledger.jsonl");
  const appended = run([
    "evidence", "append",
    "--kind", "test",
    "--status", "passed",
    "--summary", "CLI test passed",
    "--command", "node tests/ai-ops-control-plane-cli.test.js",
    "--ledger", ledger,
    "--json",
  ]);
  assert.equal(appended.ok, true);
  const verified = run(["evidence", "verify", "--require-kind", "test", "--require-status", "passed", "--ledger", ledger, "--json"]);
  assert.equal(verified.ok, true);
}

{
  const root = tempRoot();
  const created = run([
    "incident", "create",
    "--symptom", "Gateway tool schema missing after plugin grant",
    "--issue-code", "gateway_schema_missing",
    "--workspace-id", "weixin_stephen",
    "--plugin-id", "finance",
    "--dir", root,
    "--json",
  ]);
  assert.equal(created.ok, true);
  assert.ok(fs.existsSync(created.file));
  const listed = run(["incident", "list", "--dir", root, "--json"]);
  assert.equal(listed.incidents.length, 1);
  assert.equal(listed.incidents[0].issueCode, "gateway_schema_missing");
}

{
  const root = tempRoot();
  const caseFile = path.join(root, "case.json");
  const eventsFile = path.join(root, "events.json");
  fs.writeFileSync(caseFile, JSON.stringify({
    case_id: "diagcase_cli",
    status: "card_candidate",
    severity: "H2",
    event_count: 3,
    workspace_id: "owner",
    plugin_id: "wardrobe",
    source_surface: "embedded-plugin",
    diagnostic_type: "retry_exhausted",
    category: "outfit_retry_failed",
    route: "/?view=plugin&pluginId=wardrobe",
    build_id: "client-test",
    summary: "Wardrobe retry failed",
  }));
  fs.writeFileSync(eventsFile, JSON.stringify([
    {
      event_id: "diagevt_cli",
      severity: "H2",
      confidence: 0.8,
      payload: { error_code: "retry_exhausted" },
      evidence: { breadcrumbs: [{ kind: "api", code: "attempt_failed" }] },
    },
  ]));
  const planned = run([
    "remediation", "plan",
    "--case-json", `@${caseFile}`,
    "--events-json", `@${eventsFile}`,
    "--json",
  ]);
  assert.equal(planned.ok, true);
  assert.equal(planned.eligible, true);
  assert.equal(planned.target.targetThreadTitle, "男装衣橱");
  assert.equal(planned.taskCard.reasoningEffort, "xhigh");
  assert.match(planned.taskCard.body, /AI Ops Diagnostic Remediation Task/);
}

{
  const result = spawnSync(process.execPath, [script, "lane", "allocate", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plugin_id_required/);
}

console.log("AI Operations Control Plane CLI tests passed");
