"use strict";

const path = require("node:path");

const {
  runViteDevelopmentReadinessCheck,
} = require("./vite-development-readiness-check");

const CUTOVER_PREFLIGHT_VERSION = "20260703-vite-production-cutover-preflight-v1";

const REQUIRED_OWNER_APPROVAL_TEXT =
  "批准 Home AI Vite 生产切换：允许创建生产 cutover 改动，并通过 Mac central deploy lane 部署和读回。";

const PLANNED_VALIDATION_COMMANDS = Object.freeze([
  "npm run build:vite",
  "npm run audit:vite-globals -- --json",
  "npm run verify:vite-dev",
  "npm run check:vite-readiness",
  "node tests/vite-production-cutover-preflight.test.js",
  "node tests/vite-development-readiness-check.test.js",
  "node tests/vite-dev-preview-routes-smoke.test.js",
  "node tests/vite-plugin-host-model.test.js",
  "node tests/vite-plugin-host-island.test.js",
  "node tests/vite-dev-real-backend-parity-smoke.test.js",
  "node tests/static-cache-version-harness.test.js",
  "node tests/vite-goal-state-audit.test.js",
  "npm run audit:vite-goal -- --acceptance-json <development-acceptance.json> --cutover-source-contract-json <cutover-source-change-contract.json> --production-readback-json <production-readback.json> --require-complete",
  "node tests/vite-cutover-source-change-validator.test.js",
  "npm run validate:vite-cutover-source -- --contract-json <cutover-source-change-contract.json> --require-ok",
  "node tests/vite-production-readback-validator.test.js",
  "npm run validate:vite-cutover-readback -- --readback-json <production-readback.json> --require-ok",
  "npm test",
  "npm run check",
  "git diff --check",
]);

const PLANNED_DEPLOY_COMMAND =
  "npm run --silent deploy:macos -- --execute --json --reason home-ai-vite-production-cutover";

const REQUIRED_PRODUCTION_READBACK_CHECKS = Object.freeze([
  {
    id: "central_deploy_result",
    summary: "Central Mac deploy returns ok=true and records a backup path.",
    evidence: ["deployResult.ok", "backupPath"],
    privacy: "metadata_only",
  },
  {
    id: "home_ai_listener_readback",
    summary: "Home AI listener restarts and public/authenticated status routes answer.",
    evidence: ["/api/public-config", "Owner /api/status?detail=1"],
    privacy: "bounded_status_only",
  },
  {
    id: "selected_shell_mode",
    summary: "Production shell route reports Vite-only mode and ignores Classic runtime override requests.",
    evidence: ["shellMode=vite", "shellModePolicy=vite-only", "classicOverrideIgnored"],
    privacy: "metadata_only",
  },
  {
    id: "service_worker_cache_version",
    summary: "Service Worker and cache version match the selected shell expectation.",
    evidence: ["serviceWorkerVersion", "cacheVersion"],
    privacy: "metadata_only",
  },
  {
    id: "vite_asset_manifest",
    summary: "Static Vite manifest and selected shell assets are reachable.",
    evidence: ["public/vite-islands/.vite/manifest.json", "selected shell assets"],
    privacy: "metadata_only",
  },
  {
    id: "owner_console_permission",
    summary: "Owner can open System Console from the feedback menu; non-Owner is denied.",
    evidence: ["owner shortcut visible", "nonOwnerDenied"],
    privacy: "no_private_payloads",
  },
  {
    id: "plugin_host_manifest_proxy",
    summary: "Embedded Plugin Host opens sampled Owner-visible plugins without exposing launch tokens.",
    evidence: ["sample manifest 200", "same-origin proxy iframe", "launchTokenRedacted"],
    privacy: "no_launch_tokens",
  },
  {
    id: "document_preview_delivery",
    summary: "Markdown preview, PPTX/document preview, and file delivery pass bounded smoke.",
    evidence: ["markdownRenderedInApp", "pptxOpenInMetadata", "downloadShareStatus"],
    privacy: "no_private_file_contents",
  },
  {
    id: "voice_pending_cancel",
    summary: "Voice long-press pending state can be canceled or auto-cleared.",
    evidence: ["pendingCancel", "terminalAutoHide"],
    privacy: "no_audio_payloads",
  },
  {
    id: "chat_sse_task_topic",
    summary: "Chat send, SSE readback, interrupt, and task/topic navigation pass bounded smoke.",
    evidence: ["sendStatus", "sseReadback", "interruptStatus", "taskTopicNavigation"],
    privacy: "bounded_message_metadata",
  },
  {
    id: "wardrobe_usage_action",
    summary: "Wardrobe Usage 入库 action renders and executes with verified readback.",
    evidence: ["outfitIntentButton", "executeStatus", "readbackVerified"],
    privacy: "no_item_payloads",
  },
  {
    id: "source_deploy_rollback_plan",
    summary: "Emergency recovery uses Git/source history and deployment backups, not a Classic runtime switch.",
    evidence: ["sourceRef", "deployBackup", "rollbackDeploymentPlan"],
    privacy: "metadata_only",
  },
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    ownerApprovalText: "",
    requireApproved: false,
    requireBuiltAssets: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-approved") {
      options.requireApproved = true;
    } else if (arg === "--no-require-built-assets") {
      options.requireBuiltAssets = false;
    } else if (arg === "--owner-approval-text") {
      options.ownerApprovalText = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--owner-approval-text=")) {
      options.ownerApprovalText = arg.slice("--owner-approval-text=".length);
    }
  }

  return options;
}

function normalizeApprovalText(text) {
  return String(text || "").trim();
}

function evaluateOwnerApproval(text) {
  const normalized = normalizeApprovalText(text);
  if (!normalized) {
    return {
      approved: false,
      status: "blocked",
      code: "owner_approval_required",
      summary: "Owner approval text is required before a Vite production cutover change can be created.",
    };
  }
  if (normalized !== REQUIRED_OWNER_APPROVAL_TEXT) {
    return {
      approved: false,
      status: "blocked",
      code: "owner_approval_text_mismatch",
      summary: "Owner approval text does not match the required production cutover approval.",
    };
  }
  return {
    approved: true,
    status: "approved",
    code: "owner_approval_recorded",
    summary: "Owner approval text matches the required production cutover approval.",
  };
}

function buildCutoverImplementationState() {
  return {
    status: "not_created",
    summary: "No production shell switch or Service Worker production cutover change exists in this preflight.",
    requiredNextState: "create_fail_closed_cutover_change",
  };
}

function runViteProductionCutoverPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const env = options.env || process.env;
  const ownerApprovalText =
    options.ownerApprovalText || env.HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT || "";
  const readiness =
    options.readiness ||
    runViteDevelopmentReadinessCheck({
      repoRoot,
      requireBuiltAssets: options.requireBuiltAssets !== false,
    });
  const approval = evaluateOwnerApproval(ownerApprovalText);
  const cutoverImplementation = buildCutoverImplementationState();
  const readinessOk = Boolean(readiness && readiness.ok);
  const ok = readinessOk && approval.approved;
  const status = !readinessOk
    ? "blocked"
    : approval.approved
      ? "ready_for_cutover_change"
      : "blocked";
  const blockedReason = !readinessOk
    ? "vite_development_readiness_failed"
    : approval.approved
      ? ""
      : approval.code;

  return {
    ok,
    status,
    blockedReason,
    preflightVersion: CUTOVER_PREFLIGHT_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    requiresOwnerApproval: true,
    ownerApproval: approval,
    requiredOwnerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
    readinessSummary: {
      ok: readinessOk,
      checkVersion: readiness && readiness.checkVersion,
      sourceOnly: Boolean(readiness && readiness.sourceOnly),
      productionDeployAuthorized: Boolean(readiness && readiness.productionDeployAuthorized),
      failedCount: readiness && readiness.summary ? readiness.summary.failedCount : null,
      warningCount: readiness && readiness.summary ? readiness.summary.warningCount : null,
    },
    cutoverImplementation,
    plannedValidationCommands: PLANNED_VALIDATION_COMMANDS,
    plannedDeployCommand: PLANNED_DEPLOY_COMMAND,
    requiredProductionReadback: REQUIRED_PRODUCTION_READBACK_CHECKS,
    nextActions: approval.approved
      ? [
        "Create a separate fail-closed production cutover change.",
        "Run the planned validation commands after that source change.",
        "Only then route the central Mac deploy/readback plan through an appropriate deploy lane.",
      ]
      : [
        "Keep production source and deployment state unchanged.",
        "Do not send a deploy-lane card for Vite production cutover.",
        "Request explicit Owner approval using the required approval text.",
      ],
  };
}

function formatText(result) {
  const lines = [
    `Vite production cutover preflight: ${result.status}`,
    `version: ${result.preflightVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `productionDeployAuthorized: ${result.productionDeployAuthorized}`,
    `ownerApproval: ${result.ownerApproval.code}`,
    `readinessOk: ${result.readinessSummary.ok}`,
  ];
  if (result.blockedReason) {
    lines.push(`blockedReason: ${result.blockedReason}`);
  }
  lines.push("nextActions:");
  for (const action of result.nextActions) {
    lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = runViteProductionCutoverPreflight(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result));
  }
  if (options.requireApproved && !result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CUTOVER_PREFLIGHT_VERSION,
  PLANNED_DEPLOY_COMMAND,
  PLANNED_VALIDATION_COMMANDS,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
  REQUIRED_OWNER_APPROVAL_TEXT,
  evaluateOwnerApproval,
  parseArgs,
  runViteProductionCutoverPreflight,
};
