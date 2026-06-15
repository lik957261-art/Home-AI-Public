"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGatewayHealthDiagnosticService,
  isGatewayHealthFailure,
  isGatewayRunFailure,
} = require("../adapters/gateway-health-diagnostic-service");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-gateway-health-diagnostic-"));
}

async function testGatewayHealthFailureDiagnosticWritesBoundedReport() {
  const root = makeTempRoot();
  const dataDir = path.join(root, "data");
  const reportRoot = path.join(dataDir, "diagnostics", "gateway-health");
  const keyPath = path.join(dataDir, "secrets", "gateway-workers", "hm-wuping-openai-1.key");
  const manifestPath = path.join(dataDir, "gateway-pool-manifest.json");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "worker-key-secret\n", "utf8");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    workers: [{
      profile: "hm-wuping-openai-1",
      provider: "openai-codex",
      host: "127.0.0.1",
      port: 18752,
      apiKeyFile: keyPath,
      launchdLabel: "com.hermesmobile.gateway.hm-wuping.openai.1",
      allowedWorkspaceIds: ["weixin_wuping"],
    }],
  }, null, 2)}\n`, "utf8");

  const service = createGatewayHealthDiagnosticService({
    dataDir,
    reportRoot,
    manifestPaths: [manifestPath],
    nowIso: () => "2026-06-15T09:40:00.000Z",
    fetch: async (url, init) => {
      assert.equal(url, "http://127.0.0.1:18752/health");
      assert.equal(init.headers.Authorization, "Bearer worker-key-secret");
      return { status: 200 };
    },
  });

  const report = await service.runGatewayWorkerFailureDiagnostic({
    thread: { id: "thread_morc8v2h_df85c917", workspaceId: "weixin_wuping" },
    runId: "web_abc",
    event: {
      event: "run.gateway_worker_start_failed",
      failureCode: "health_check_failed",
      profileId: "hm-wuping-openai-1",
      provider: "openai-codex",
      workspaceId: "weixin_wuping",
      diagnostic: "Gateway worker did not become healthy after start.",
    },
  });

  assert.equal(report.kind, "gateway_worker_health_failure");
  assert.equal(report.manifest.workerFound, true);
  assert.equal(report.worker.profileId, "hm-wuping-openai-1");
  assert.equal(report.worker.workspaceIds[0], "weixin_wuping");
  assert.equal(report.worker.apiKeyFile.exists, true);
  assert.equal(report.checks.health.attempted, true);
  assert.equal(report.checks.health.ok, true);
  assert.equal(report.repair.autoRepairPolicy, "report_only");
  assert.deepEqual(report.repair.safeActions, []);
  assert.equal(report.repair.codexRepairTaskCard.requiresOwnerApproval, true);
  assert.equal(report.repair.codexRepairTaskCard.status, "pending_owner_approval");
  assert.equal(report.repair.codexRepairTaskCard.reportPath, report.reportPath);
  assert.ok(fs.existsSync(report.reportPath));
  const saved = fs.readFileSync(report.reportPath, "utf8");
  assert.ok(saved.includes("hm-wuping-openai-1"));
  assert.ok(!saved.includes("worker-key-secret"));
}

function testHealthFailurePredicateIsNarrow() {
  assert.equal(isGatewayHealthFailure({
    event: { failureCode: "health_check_failed" },
  }), true);
  assert.equal(isGatewayHealthFailure({
    err: { code: "gateway_elastic_worker_start_failed", details: { failureCode: "health_check_failed" } },
  }), true);
  assert.equal(isGatewayHealthFailure({
    event: { failureCode: "invalid_key" },
  }), false);
}

async function testGatewayRunFailureDiagnosticWritesGenericReport() {
  const root = makeTempRoot();
  const dataDir = path.join(root, "data");
  const reportRoot = path.join(dataDir, "diagnostics", "gateway-runtime");
  const keyPath = path.join(dataDir, "secrets", "gateway-workers", "hm-wuping-openai-2.key");
  const manifestPath = path.join(dataDir, "gateway-pool-manifest.json");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "generic-worker-secret\n", "utf8");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    workers: [{
      profile: "hm-wuping-openai-2",
      provider: "openai-codex",
      host: "127.0.0.1",
      port: 18758,
      apiKeyFile: keyPath,
      allowedWorkspaceIds: ["weixin_wuping"],
    }],
  }, null, 2)}\n`, "utf8");
  const service = createGatewayHealthDiagnosticService({
    dataDir,
    reportRoot,
    manifestPaths: [manifestPath],
    nowIso: () => "2026-06-15T10:10:00.000Z",
    fetch: async () => ({ status: 503 }),
  });

  const report = await service.runGatewayRunFailureDiagnostic({
    event: { event: "run.stream_failed", preview: "This operation was aborted" },
    runId: "resp_1",
    thread: { id: "thread_1", workspaceId: "weixin_wuping" },
    message: { id: "assistant_1", status: "failed", taskGroupId: "chat", content: "" },
    stream: {
      gatewayProfile: "hm-wuping-openai-2",
      gatewayUrl: "http://127.0.0.1:18758",
      gatewaySource: "worker_pool",
      startedAt: 10,
      lastEventAt: 20,
      failureReason: "stale",
    },
  });

  assert.equal(report.kind, "gateway_run_failure");
  assert.equal(report.trigger.eventName, "run.stream_failed");
  assert.equal(report.worker.profileId, "hm-wuping-openai-2");
  assert.equal(report.worker.activeStream.gatewaySource, "worker_pool");
  assert.equal(report.checks.health.attempted, true);
  assert.equal(report.checks.health.ok, false);
  assert.equal(report.repair.codexRepairTaskCard.requiresOwnerApproval, true);
  assert.ok(fs.existsSync(report.reportPath));
  const saved = fs.readFileSync(report.reportPath, "utf8");
  assert.ok(saved.includes("gateway_run_failure"));
  assert.ok(!saved.includes("generic-worker-secret"));
}

function testRunFailurePredicateCoversTerminalFailures() {
  assert.equal(isGatewayRunFailure({ event: { event: "run.stream_failed" } }), true);
  assert.equal(isGatewayRunFailure({ event: { event: "response.failed" } }), true);
  assert.equal(isGatewayRunFailure({ status: "failed" }), true);
  assert.equal(isGatewayRunFailure({ event: { event: "run.cancelled" } }), false);
}

function testTriggerGatewayWorkerFailureDiagnosticFiltersAndDedupes() {
  const root = makeTempRoot();
  const calls = [];
  const service = createGatewayHealthDiagnosticService({
    dataDir: root,
    manifestPaths: [],
    nowMs: () => 1000,
    cooldownMs: 5000,
    setImmediate: (fn) => calls.push(fn),
  });

  assert.deepEqual(service.triggerGatewayWorkerFailureDiagnostic({
    runId: "run_1",
    event: { profileId: "profile_1", failureCode: "invalid_key" },
  }), { scheduled: false, reason: "not_health_check_failed" });
  assert.deepEqual(service.triggerGatewayWorkerFailureDiagnostic({
    runId: "run_1",
    event: { profileId: "profile_1", failureCode: "health_check_failed" },
  }), {
    scheduled: true,
    reason: "health_check_failed",
    profileId: "profile_1",
    runId: "run_1",
  });
  assert.deepEqual(service.triggerGatewayWorkerFailureDiagnostic({
    runId: "run_1",
    event: { profileId: "profile_1", failureCode: "health_check_failed" },
  }), { scheduled: false, reason: "cooldown" });
  assert.equal(calls.length, 1);
}

async function main() {
  await testGatewayHealthFailureDiagnosticWritesBoundedReport();
  await testGatewayRunFailureDiagnosticWritesGenericReport();
  testHealthFailurePredicateIsNarrow();
  testRunFailurePredicateCoversTerminalFailures();
  testTriggerGatewayWorkerFailureDiagnosticFiltersAndDedupes();
  console.log("gateway health diagnostic service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
