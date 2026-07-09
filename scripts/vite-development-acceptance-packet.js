"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildViteDevelopmentAcceptanceReport,
} = require("./vite-development-acceptance-report");

const VITE_DEV_ACCEPTANCE_PACKET_VERSION = "20260704-vite-dev-acceptance-packet-v1";

const REQUIRED_DELTA_IDS = Object.freeze([
  "intent_vs_requirements",
  "requirements_vs_design",
  "design_vs_implementation",
  "implementation_vs_validation",
  "user_journey_vs_acceptance",
  "privacy_boundary_vs_evidence",
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    acceptanceJson: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--acceptance-json") {
      options.acceptanceJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--acceptance-json=")) {
      options.acceptanceJson = arg.slice("--acceptance-json=".length);
    }
  }
  return options;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function stepById(report = {}) {
  const out = new Map();
  for (const step of Array.isArray(report.steps) ? report.steps : []) {
    out.set(step.id, step);
  }
  return out;
}

function passed(step) {
  return Boolean(step && step.status === "passed");
}

function makeAuditSection(id, source, evidence = [], present = true) {
  return {
    id,
    required: true,
    present: Boolean(present),
    source,
    evidence,
  };
}

function buildDeltaMatrix(report, steps) {
  const acceptancePassed = Boolean(report && report.ok === true);
  const sourceOnly = Boolean(report && report.sourceOnly === true);
  const noProductionWrites = Boolean(
    report &&
    report.productionWrites === false &&
    report.deployExecuted === false &&
    report.productionDeployAuthorized === false,
  );
  return [
    {
      id: "intent_vs_requirements",
      status: sourceOnly && noProductionWrites ? "passed" : "failed",
      evidence: ["development_only_objective", "production_cutover_forbidden"],
    },
    {
      id: "requirements_vs_design",
      status: passed(steps.get("vite_development_readiness"))
        && passed(steps.get("vite_preview_cache_policy"))
        && passed(steps.get("vite_owner_review_report"))
        ? "passed"
        : "failed",
      evidence: ["vite_development_readiness", "vite_preview_cache_policy", "vite_owner_review_report"],
    },
    {
      id: "design_vs_implementation",
      status: passed(steps.get("build_vite"))
        && passed(steps.get("audit_vite_globals"))
        && passed(steps.get("vite_preview_cache_policy"))
        ? "passed"
        : "failed",
      evidence: ["build_vite", "audit_vite_globals", "vite_preview_cache_policy"],
    },
    {
      id: "implementation_vs_validation",
      status: acceptancePassed ? "passed" : "failed",
      evidence: ["development_acceptance_report", "local_full_test_gate", "diff_hygiene"],
    },
    {
      id: "user_journey_vs_acceptance",
      status: passed(steps.get("vite_preview_routes_smoke"))
        && passed(steps.get("vite_real_backend_parity_smoke"))
        && passed(steps.get("vite_dev_user_journeys_smoke"))
        ? "passed"
        : "failed",
      evidence: ["vite_preview_routes_smoke", "vite_real_backend_parity_smoke", "vite_dev_user_journeys_smoke"],
    },
    {
      id: "privacy_boundary_vs_evidence",
      status: noProductionWrites ? "passed" : "failed",
      evidence: ["sourceOnly", "productionWrites=false", "deployExecuted=false", "productionDeployAuthorized=false"],
    },
  ];
}

function buildViteDevelopmentAcceptancePacket(options = {}) {
  const acceptanceReport = options.acceptanceReport || buildViteDevelopmentAcceptanceReport(options);
  const steps = stepById(acceptanceReport);
  const deltaMatrix = buildDeltaMatrix(acceptanceReport, steps);
  const missingDeltaIds = REQUIRED_DELTA_IDS.filter((id) => !deltaMatrix.some((entry) => entry.id === id));
  const failedDeltaIds = deltaMatrix.filter((entry) => entry.status !== "passed").map((entry) => entry.id);
  const ok = Boolean(acceptanceReport.ok === true && missingDeltaIds.length === 0 && failedDeltaIds.length === 0);
  const validationCommands = Array.from(steps.values()).map((step) => step.command).filter(Boolean);

  return {
    ok,
    status: ok ? "dev_acceptance_packet_ready" : "dev_acceptance_packet_incomplete",
    packetVersion: VITE_DEV_ACCEPTANCE_PACKET_VERSION,
    generatedAt: new Date().toISOString(),
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    target: "home-ai-vite-development-migration",
    scope: {
      workspace: "/Users/example/path",
      developmentOnly: true,
      productionCutoverAllowed: false,
      publicPushAllowed: false,
      userDataMutationAllowed: false,
    },
    migratedDevelopmentSurfaces: [
      "vite_app_preview_host",
      "runtime_facade",
      "runtime_state_event_bus",
      "owner_system_console_island",
      "ai_ops_feedback_island",
      "voice_input_status_island",
      "document_preview_island",
      "navigation_shell_island",
      "message_action_panel_island",
      "plugin_host_island",
      "plugin_iframe_lifecycle_model",
      "dialog_sheet_island",
      "toast_status_island",
      "pwa_push_status_island",
      "chat_runtime_island",
      "chat_attachment_file_input_controller",
    ],
    remainingProductionSurfaces: [
      "classic_public_index_shell",
      "classic_service_worker_default",
      "vite_preview_cache_policy_cutover_residual",
      "full_composer_production_replacement",
      "full_attachment_upload_production_replacement",
      "full_document_preview_production_replacement",
      "full_embedded_plugin_host_production_replacement",
      "production_cutover_source_change",
      "production_deploy_readback",
    ],
    auditPacket: {
      required: true,
      sections: [
        makeAuditSection("requirements_packet", "vite_full_frontend_migration_target", [
          "development_only",
          "no_production_cutover",
          "no_public_push",
          "focused_tests_required",
        ]),
        makeAuditSection("design_contract_packet", "vite_migration_docs", [
          "static_client_boundary",
          "vite_cutover_review_boundary",
          "vite_only_runtime_default",
          "vite_preview_cache_policy",
        ]),
        makeAuditSection("implementation_packet", "current_source_tree", [
          "vite_config",
          "src_vite_app",
          "src_vite_islands",
          "runtime_state_event_bus",
          "runtime_shell_mode_default_guard",
          "plugin_iframe_lifecycle_model",
          "vite_preview_cache_policy_check",
        ]),
        makeAuditSection("validation_packet", "vite_development_acceptance_report", validationCommands),
        makeAuditSection("privacy_packet", "source_only_privacy_boundary", [
          "no_raw_secrets",
          "no_production_writes",
          "no_deploy",
          "no_launch_tokens",
          "no_private_payloads",
        ]),
      ],
      deltaMatrix,
      missingDeltaIds,
      failedDeltaIds,
    },
    acceptanceSummary: {
      ok: Boolean(acceptanceReport.ok),
      status: acceptanceReport.status || "",
      reportVersion: acceptanceReport.reportVersion || "",
      stepCount: acceptanceReport.summary?.stepCount || 0,
      passedStepCount: acceptanceReport.summary?.passedStepCount || 0,
      failedStepCount: acceptanceReport.summary?.failedStepCount || 0,
      failedStepIds: acceptanceReport.summary?.failedStepIds || [],
    },
    riskRegister: [
      {
        id: "production_cutover_not_authorized",
        status: "controlled",
        evidence: "productionDeployAuthorized=false",
      },
      {
        id: "classic_runtime_fallback_retired",
        status: "controlled",
        evidence: "config/home-ai-shell-mode.json selects vite and rollback uses source/deploy history",
      },
      {
        id: "remaining_global_compatibility_bridge",
        status: "tracked",
        evidence: "audit_vite_globals unmanagedCount=0 with explicit allowlist",
      },
    ],
    ownerApprovalRequest: acceptanceReport.ownerApprovalRequest || {},
  };
}

function formatText(packet) {
  const lines = [
    `Vite dev acceptance packet: ${packet.status}`,
    `version: ${packet.packetVersion}`,
    `sourceOnly: ${packet.sourceOnly}`,
    `productionWrites: ${packet.productionWrites}`,
    `deployExecuted: ${packet.deployExecuted}`,
    `productionDeployAuthorized: ${packet.productionDeployAuthorized}`,
    `acceptance: ${packet.acceptanceSummary.passedStepCount}/${packet.acceptanceSummary.stepCount} passed`,
    `deltaMatrix: ${packet.auditPacket.deltaMatrix.filter((entry) => entry.status === "passed").length}/${packet.auditPacket.deltaMatrix.length} passed`,
  ];
  if (packet.auditPacket.failedDeltaIds.length) lines.push(`failedDeltaIds: ${packet.auditPacket.failedDeltaIds.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const acceptanceReport = options.acceptanceJson ? readJsonFile(options.acceptanceJson) : null;
  const packet = buildViteDevelopmentAcceptancePacket({ acceptanceReport });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(packet));
  }
  if (!packet.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_DELTA_IDS,
  VITE_DEV_ACCEPTANCE_PACKET_VERSION,
  buildViteDevelopmentAcceptancePacket,
  formatText,
  parseArgs,
};
