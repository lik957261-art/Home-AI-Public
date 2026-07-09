"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildViteDevelopmentAcceptancePacket,
} = require("./vite-development-acceptance-packet");

const VITE_DEV_GOAL_AUDIT_VERSION = "20260704-vite-development-goal-audit-v1";

const REQUIRED_MIGRATED_SURFACES = Object.freeze([
  "vite_app_preview_host",
  "runtime_facade",
  "runtime_state_event_bus",
  "owner_system_console_island",
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
]);

const REQUIRED_REMAINING_PRODUCTION_SURFACES = Object.freeze([
  "classic_public_index_shell",
  "classic_service_worker_default",
  "vite_preview_cache_policy_cutover_residual",
  "full_composer_production_replacement",
  "full_attachment_upload_production_replacement",
  "full_document_preview_production_replacement",
  "full_embedded_plugin_host_production_replacement",
  "production_cutover_source_change",
  "production_deploy_readback",
]);

const REQUIRED_VALIDATION_COMMAND_MARKERS = Object.freeze([
  "npm run --silent build:vite",
  "npm run --silent audit:vite-globals -- --json",
  "node tests/vite-dev-preview-routes-smoke.test.js",
  "node tests/vite-dev-real-backend-parity-smoke.test.js",
  "npm run --silent smoke:vite-dev-user-journeys",
  "npm run --silent check:vite-readiness",
  "npm run --silent check:vite-cache-policy",
  "npm run --silent review:vite-cutover",
  "npm run --silent plan:vite-cutover",
  "npm run --silent packet:vite-cutover",
  "npm run --silent check",
  "npm test --silent",
  "git diff --check",
]);

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
    requireOk: false,
    packetJson: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--require-ok") {
      options.requireOk = true;
    } else if (arg === "--packet-json") {
      options.packetJson = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--packet-json=")) {
      options.packetJson = arg.slice("--packet-json=".length);
    }
  }
  return options;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function asSet(values = []) {
  return new Set(Array.isArray(values) ? values : []);
}

function missingFrom(required, actualValues) {
  const actual = asSet(actualValues);
  return required.filter((item) => !actual.has(item));
}

function validationCommands(packet = {}) {
  const section = (packet.auditPacket?.sections || []).find((entry) => entry.id === "validation_packet");
  return Array.isArray(section?.evidence) ? section.evidence : [];
}

function deltaStatus(packet = {}) {
  const entries = Array.isArray(packet.auditPacket?.deltaMatrix) ? packet.auditPacket.deltaMatrix : [];
  const missingDeltaIds = missingFrom(REQUIRED_DELTA_IDS, entries.map((entry) => entry.id));
  const failedDeltaIds = entries
    .filter((entry) => REQUIRED_DELTA_IDS.includes(entry.id) && entry.status !== "passed")
    .map((entry) => entry.id);
  return { entries, missingDeltaIds, failedDeltaIds };
}

function check(id, ok, summary, extra = {}) {
  const passed = Boolean(ok);
  return Object.freeze({
    id,
    ...extra,
    ok: passed,
    status: passed ? "passed" : "failed",
    summary,
  });
}

function buildViteDevelopmentGoalAudit(options = {}) {
  const packet = options.packet || (options.packetJson
    ? readJsonFile(options.packetJson)
    : buildViteDevelopmentAcceptancePacket(options));
  const commands = validationCommands(packet);
  const delta = deltaStatus(packet);
  const missingSurfaces = missingFrom(REQUIRED_MIGRATED_SURFACES, packet.migratedDevelopmentSurfaces || []);
  const missingRemainingProduction = missingFrom(
    REQUIRED_REMAINING_PRODUCTION_SURFACES,
    packet.remainingProductionSurfaces || [],
  );
  const missingValidationCommands = REQUIRED_VALIDATION_COMMAND_MARKERS
    .filter((marker) => !commands.some((command) => String(command || "").includes(marker)));

  const checks = [
    check(
      "dev_acceptance_packet_ready",
      packet.ok === true && packet.status === "dev_acceptance_packet_ready",
      "Development acceptance packet is ready.",
      { packetStatus: packet.status || "" },
    ),
    check(
      "source_only_boundary",
      packet.sourceOnly === true
        && packet.productionWrites === false
        && packet.deployExecuted === false
        && packet.productionDeployAuthorized === false
        && packet.scope?.developmentOnly === true
        && packet.scope?.productionCutoverAllowed === false
        && packet.scope?.publicPushAllowed === false
        && packet.scope?.userDataMutationAllowed === false,
      "Development target stays source-only with no production cutover, public push, deployment, or user-data mutation.",
    ),
    check(
      "migrated_development_surfaces",
      missingSurfaces.length === 0,
      "Required Vite development surfaces are represented in the packet.",
      { missing: missingSurfaces },
    ),
    check(
      "remaining_production_boundary",
      missingRemainingProduction.length === 0,
      "Remaining production surfaces are explicit and separate from the development target.",
      { missing: missingRemainingProduction },
    ),
    check(
      "audit_packet_delta_matrix",
      delta.missingDeltaIds.length === 0
        && delta.failedDeltaIds.length === 0
        && Array.isArray(packet.auditPacket?.sections)
        && packet.auditPacket.sections.length >= 5,
      "Audit Packet and Delta Matrix prove development intent/design/implementation/validation/privacy alignment.",
      {
        missingDeltaIds: delta.missingDeltaIds,
        failedDeltaIds: delta.failedDeltaIds,
      },
    ),
    check(
      "validation_command_coverage",
      missingValidationCommands.length === 0,
      "Validation packet covers build, global audit, browser smoke, real backend parity, readiness, cache policy, cutover block, local tests, and diff hygiene.",
      { missing: missingValidationCommands },
    ),
    check(
      "acceptance_summary",
      packet.acceptanceSummary?.ok === true
        && packet.acceptanceSummary?.status === "development_acceptance_passed"
        && Number(packet.acceptanceSummary?.failedStepCount || 0) === 0
        && Number(packet.acceptanceSummary?.passedStepCount || 0) >= 16,
      "Development acceptance summary has no failed steps.",
      packet.acceptanceSummary || {},
    ),
    check(
      "production_cutover_plan_boundary",
      packet.ownerApprovalRequest?.status === "ready_to_request_owner_approval"
        && packet.ownerApprovalRequest?.requiredForProduction === true
        && packet.ownerApprovalRequest?.productionWrites === false
        && packet.ownerApprovalRequest?.deployExecuted === false
        && packet.ownerApprovalRequest?.deployCardSent === false
        && Array.isArray(packet.ownerApprovalRequest?.afterApprovalSequence)
        && packet.ownerApprovalRequest.afterApprovalSequence.includes("central_mac_deploy_and_bounded_readback"),
      "Production cutover is prepared only as a future Owner-approval sequence.",
      {
        ownerApprovalStatus: packet.ownerApprovalRequest?.status || "",
        nextAllowedAction: packet.ownerApprovalRequest?.nextAllowedAction || "",
      },
    ),
  ];

  const failed = checks.filter((entry) => !entry.ok);
  const ok = failed.length === 0;
  return {
    ok,
    status: ok ? "development_goal_complete_verified" : "development_goal_incomplete",
    auditVersion: VITE_DEV_GOAL_AUDIT_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    target: "home-ai-vite-development-migration",
    summary: {
      checkCount: checks.length,
      passedCount: checks.length - failed.length,
      failedCount: failed.length,
      failedIds: failed.map((entry) => entry.id),
    },
    checks,
    nextActions: ok
      ? [
        "Do not deploy from this development goal.",
        "Open a separate production cutover task only after exact Owner approval.",
      ]
      : [
        "Keep the Vite development goal active.",
        "Close the failed source-only checks before requesting production cutover approval.",
      ],
  };
}

function formatText(result) {
  const lines = [
    `Vite development goal audit: ${result.status}`,
    `version: ${result.auditVersion}`,
    `sourceOnly: ${result.sourceOnly}`,
    `productionWrites: ${result.productionWrites}`,
    `deployExecuted: ${result.deployExecuted}`,
    `productionDeployAuthorized: ${result.productionDeployAuthorized}`,
    `checks: ${result.summary.passedCount}/${result.summary.checkCount} passed`,
  ];
  if (result.summary.failedIds.length) lines.push(`failed: ${result.summary.failedIds.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = buildViteDevelopmentGoalAudit(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatText(result));
  if (options.requireOk && !result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_DELTA_IDS,
  REQUIRED_MIGRATED_SURFACES,
  REQUIRED_REMAINING_PRODUCTION_SURFACES,
  REQUIRED_VALIDATION_COMMAND_MARKERS,
  VITE_DEV_GOAL_AUDIT_VERSION,
  buildViteDevelopmentGoalAudit,
  formatText,
  parseArgs,
};
