"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function runJson(args) {
  const output = execFileSync(process.execPath, ["scripts/homeai-self-improving-loop.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function runJsonAllowFailure(args) {
  const result = spawnSync(process.execPath, ["scripts/homeai-self-improving-loop.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function testMatrixCli() {
  const matrix = runJson(["--matrix", "--json"]);
  assert.equal(matrix.ok, true);
  assert.equal(matrix.signals.some((signal) => signal.id === "mcp_schema_closure"), true);
}

function testDryRunAuditCardsDoNotDispatch() {
  const result = runJsonAllowFailure([
    "--observations-json",
    JSON.stringify([{ signalId: "audit_thread_liveness", status: "failed", errorCode: "audit_thread_not_found" }]),
    "--create-audit-cards",
    "--audit-scope",
    "all",
    "--json",
  ]);
  assert.equal(result.execute, false);
  assert.equal(result.auditRequests.cardCount, 2);
  assert.deepEqual(result.dispatchResults, []);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "audit_thread_not_found");
}

function testMarkdownOutput() {
  const output = execFileSync(process.execPath, ["scripts/homeai-self-improving-loop.js", "--matrix", "--markdown"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.match(output, /Home AI Self-Improving Loop/);
  assert.match(output, /gateway_profile_health/);
}

function testCoverageAuditCli() {
  const result = runJson(["--coverage-audit", "--json"]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "covered");
  assert.equal(result.requirements.some((item) => item.id === "plugin_deploy_auth_or_lane_regression"), true);
  assert.equal(
    result.requirements.find((item) => item.id === "plugin_deploy_auth_or_lane_regression").missingClosureReadbacks.length,
    0,
  );
}

function testCollectProductionObservationsFromReplayPayloads() {
  const result = runJson([
    "--collect-production-observations",
    "--status-smoke-json",
    JSON.stringify({
      ok: true,
      activeGlobal: 0,
      gatewayPool: { enabled: true, mode: "hybrid", workerCount: 39 },
      gatewayWorkerPolicyContract: { ok: true },
      wrongHeaderDenied: true,
      originIdentity: { title: "Home AI" },
    }),
    "--cron-audit-json",
    JSON.stringify({
      ok: true,
      jobCount: 8,
      skillCount: 10,
      sourceIssueCount: 0,
      configIssueCount: 0,
      statusIssueCount: 0,
    }),
    "--production-diagnostics-json",
    JSON.stringify({ ok: true, diagnosticCount: 27, diagnostics: [], issues: [] }),
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.productionCollection.enabled, true);
  assert.equal(result.productionCollection.observationCount, 3);
  assert.equal(result.productionCollection.signals.some((item) => item.signalId === "automation_cron_health"), true);
}

function testCollectProductionDiagnosticsFailureProducesReport() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--skip-cron-audit",
    "--production-diagnostics-json",
    JSON.stringify({
      ok: false,
      error: "diagnostic_doc_reference_missing",
      diagnosticCount: 27,
      issues: [{ code: "diagnostic_doc_reference_missing" }],
    }),
    "--json",
  ]);
  assert.equal(result.productionCollection.observationCount, 1);
  assert.equal(result.evaluation.issueCount, 1);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "diagnostic_doc_reference_missing");
}

function cronPermissionBlockedPayload() {
  return {
    ok: false,
    jobCount: 0,
    skillCount: 0,
    sourceIssueCount: 3,
    sourceIssues: [
      { code: "cron_jobs_store_unreadable", path: "/private/cron/jobs.json", detail: "EACCES" },
      { code: "cron_skill_store_unreadable", path: "/private/cron/skills", detail: "EACCES" },
      { code: "cron_runtime_script_installed_unreadable", script: "homeai-disaster-backup-cron.sh", detail: "EACCES" },
    ],
    configIssueCount: 0,
    statusIssueCount: 0,
  };
}

function testSourceCollectorPermissionBlockIsSkipped() {
  const result = runJson([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--cron-audit-json",
    JSON.stringify(cronPermissionBlockedPayload()),
    "--skip-production-diagnostics",
    "--collector-context",
    "source",
    "--json",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.productionCollection.collectorContext, "source");
  assert.equal(result.productionCollection.skippedObservationCount, 1);
  assert.equal(result.productionCollection.signals[0].status, "skipped");
  assert.equal(result.productionCollection.signals[0].errorCode, "automation_cron_audit_permission_blocked");
  assert.equal(result.productionCollection.signals[0].diagnosticEligible, false);
  assert.equal(result.evaluation.issueCount, 0);
  assert.equal(result.evaluation.skippedObservationCount, 1);
}

function testProductionCollectorPermissionBlockIsDiagnostic() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--skip-status-smoke",
    "--cron-audit-json",
    JSON.stringify(cronPermissionBlockedPayload()),
    "--skip-production-diagnostics",
    "--collector-context",
    "production",
    "--json",
  ]);
  assert.equal(result.productionCollection.collectorContext, "production");
  assert.equal(result.productionCollection.signals[0].status, "failed");
  assert.equal(result.productionCollection.signals[0].diagnosticEligible, true);
  assert.equal(result.evaluation.issueCount, 1);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "automation_cron_audit_permission_blocked");
}

function testCollectorPlainErrorCodeIsPreserved() {
  const result = runJsonAllowFailure([
    "--collect-production-observations",
    "--access-key-file",
    "/tmp/homeai-self-loop-missing-key",
    "--skip-cron-audit",
    "--skip-production-diagnostics",
    "--json",
  ]);
  assert.equal(result.productionCollection.observationCount, 1);
  assert.equal(result.evaluation.diagnosticEvents[0].error_code, "production_status_smoke_access_key_file_unreadable");
}

function testInvalidObservationJsonFailsBounded() {
  const result = spawnSync(process.execPath, [
    "scripts/homeai-self-improving-loop.js",
    "--observations-json",
    "{",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "observations_json_invalid");
}

testMatrixCli();
testDryRunAuditCardsDoNotDispatch();
testMarkdownOutput();
testCoverageAuditCli();
testCollectProductionObservationsFromReplayPayloads();
testCollectProductionDiagnosticsFailureProducesReport();
testSourceCollectorPermissionBlockIsSkipped();
testProductionCollectorPermissionBlockIsDiagnostic();
testCollectorPlainErrorCodeIsPreserved();
testInvalidObservationJsonFailsBounded();

console.log("Home AI self-improving loop script tests passed");
