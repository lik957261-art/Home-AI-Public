#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildDeployLaneLockRecord,
  summarizePublicUpgradeDailySmoke,
  validateDeployLaneLockRecord,
  validateRoutinePluginDeploymentCard,
} = require("../adapters/deploy-upgrade-lane-closure-service");

const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = { json: false, rehearsalJson: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--rehearsal-json") {
      options.rehearsalJson = argv[index + 1] || "";
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function samplePublicUpgradePayload() {
  return {
    ok: true,
    tempRemoved: true,
    stepCount: 10,
    steps: [
      { type: "public-source-preflight", result: { ok: true }, summary: { ok: true } },
      { type: "validate-missing-source-fail-closed", ok: true, detail: { ok: true, missingSourceBlockerCount: 10, pluginCount: 10 } },
      { type: "validate-operator-clone-gate-plan", ok: true, detail: { ok: true, cloneActionCount: 10, deployActionCount: 10, pluginCount: 10, movieOperatorAuthenticated: true, closureValidationPresent: true } },
      { type: "validate-hermes-runtime-repair-required", ok: true, detail: { ok: true, runtimeRepairBlockerPresent: true, runtimeRepairActionPresent: true } },
      { type: "validate-hermes-runtime-repair-gate-plan", ok: true, detail: { ok: true, runtimeRepairActionPresent: true, closureValidationPresent: true } },
      { type: "validate-non-git-source-adoption-required", ok: true, detail: { ok: true, sourceDirectoryNotGitBlockerCount: 2, hasHomeAiBlocker: true } },
      { type: "validate-source-adoption-gate-plan", ok: true, detail: { ok: true, adoptActionCount: 2, deployActionCount: 10, pluginCount: 10, closureValidationPresent: true } },
    ],
  };
}

function loadRehearsalPayload(filePath) {
  if (!filePath) return samplePublicUpgradePayload();
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function sourceMarkerChecks() {
  const checks = [
    ["docs/MODULES/deployment.md", "cardKind=plugin_deployment"],
    ["docs/MODULES/deployment.md", "pluginId=<plugin-id>"],
    ["docs/MODULES/deployment.md", "terminal receipt"],
    ["docs/MODULES/deployment.md", "deploy lane pool"],
    ["docs/IMPLEMENTATION_NOTES/public-upgrade-loop.md", "Hermes Agent"],
    ["docs/IMPLEMENTATION_NOTES/public-upgrade-loop.md", "Provider"],
    ["docs/IMPLEMENTATION_NOTES/public-upgrade-loop.md", "source-adoption"],
    ["docs/TEST_MATRIX.md", "deploy-upgrade-lane-closure-smoke.js"],
  ];
  return checks.map(([relativePath, marker]) => {
    const body = read(relativePath);
    return { relativePath, marker, ok: body.includes(marker) };
  });
}

function run(options = {}) {
  const validCard = validateRoutinePluginDeploymentCard({
    cardKind: "plugin_deployment",
    pluginId: "movie",
    deployReason: "movie-example",
    title: "Deploy Movie example",
    body: "Deploy request",
  });
  const receiptCard = validateRoutinePluginDeploymentCard({
    cardKind: "plugin_deployment",
    pluginId: "movie",
    deployReason: "movie-example",
    title: "Return: Movie deployment completed",
    body: "Return policy: terminal receipt",
    status: "completed",
  });
  const lockRecord = buildDeployLaneLockRecord({
    pluginId: "codex-mobile-web",
    launchdLabel: "com.hermesmobile.plugin.codex-mobile",
    productionPath: "/Users/example/path",
    deployReason: "codex-mobile-example",
    laneTitle: "Codex Mobile Deploy Lane",
    laneThreadId: "example-thread",
    phase: "hash-readback",
    startedAt: "2026-07-01T00:00:00.000Z",
  });
  const lockValidation = validateDeployLaneLockRecord(lockRecord);
  const publicUpgrade = summarizePublicUpgradeDailySmoke(loadRehearsalPayload(options.rehearsalJson));
  const markerChecks = sourceMarkerChecks();
  const issues = [];
  if (validCard.ok !== true) issues.push({ code: "valid_deploy_card_failed", detail: validCard });
  if (receiptCard.ok !== false || receiptCard.error !== "deploy_card_is_terminal_receipt") {
    issues.push({ code: "receipt_deploy_card_not_rejected", detail: receiptCard });
  }
  if (lockValidation.ok !== true) issues.push({ code: "deploy_lane_lock_invalid", detail: lockValidation });
  if (publicUpgrade.ok !== true) issues.push({ code: publicUpgrade.error || "public_upgrade_daily_smoke_failed", detail: publicUpgrade });
  for (const check of markerChecks) {
    if (!check.ok) issues.push({ code: "source_marker_missing", relativePath: check.relativePath, marker: check.marker });
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    issues,
    deployCard: {
      validRequestOk: validCard.ok,
      terminalReceiptRejected: receiptCard.ok === false && receiptCard.error === "deploy_card_is_terminal_receipt",
    },
    deployLaneLock: {
      ok: lockValidation.ok,
      pluginId: lockValidation.pluginId,
      phase: lockValidation.phase,
      productionPathHash: lockRecord.productionPathHash,
    },
    publicUpgrade,
    markerChecks,
  };
}

function main() {
  let report;
  try {
    report = run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    report = { ok: false, schemaVersion: 1, error: error.message, issues: [{ code: "deploy_upgrade_lane_smoke_exception" }] };
  }
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.ok) {
    process.stdout.write("deploy-upgrade lane closure smoke passed\n");
  } else {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { run };
