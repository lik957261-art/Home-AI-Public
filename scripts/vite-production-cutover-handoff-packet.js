"use strict";

const path = require("node:path");

const {
  PLANNED_DEPLOY_COMMAND,
  PLANNED_VALIDATION_COMMANDS,
  REQUIRED_OWNER_APPROVAL_TEXT,
  REQUIRED_PRODUCTION_READBACK_CHECKS,
  runViteProductionCutoverPreflight,
} = require("./vite-production-cutover-preflight");

const HANDOFF_PACKET_VERSION = "20260703-vite-production-cutover-handoff-packet-v1";

const DEFAULT_DEPLOY_LANE_POOL = Object.freeze([
  "Home AI Deploy",
  "Home AI Deploy Lane A",
  "Home AI Deploy Lane B",
  "Home AI Deploy Lane C",
]);

const CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND =
  "npm run validate:vite-cutover-source -- --contract-json <cutover-source-change-contract.json> --require-ok";

const PRODUCTION_READBACK_VALIDATION_COMMAND =
  "npm run validate:vite-cutover-readback -- --readback-json <production-readback.json> --require-ok";

const PRIVACY_BOUNDARY = Object.freeze([
  "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private message bodies, private plugin records, database rows, screenshots with private data, or long logs.",
  "Use bounded status codes, metadata, route names, counts, cache versions, manifest ids, and readback booleans.",
  "Do not print Owner access keys, workspace keys, bearer values, or launch-token-bearing URLs.",
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

function buildDeployLaneCardBody({ repoRoot, preflight }) {
  const validationList = PLANNED_VALIDATION_COMMANDS.map((command) => `- \`${command}\``).join("\n");
  const readbackList = REQUIRED_PRODUCTION_READBACK_CHECKS
    .map((check) => `- \`${check.id}\`: ${check.summary}`)
    .join("\n");
  const privacyList = PRIVACY_BOUNDARY.map((item) => `- ${item}`).join("\n");

  return [
    "# Home AI Vite Production Cutover Deploy Lane Draft",
    "",
    "Status: draft only. Do not execute until the Home AI implementation thread has created and validated the separate fail-closed production cutover source change.",
    "",
    `Workspace: \`${repoRoot}\``,
    `Preflight version: \`${preflight.preflightVersion}\``,
    "",
    "## Preconditions",
    "",
    "- Exact Owner approval text was recorded in the implementation thread.",
    "- Development readiness is green.",
    "- A separate fail-closed production cutover source change exists.",
    `- The source-change contract passed: \`${CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND}\`.`,
    "- The implementation thread reran the validation commands on that source change.",
    "- A live non-terminal deploy lane has been selected from the Home AI deploy lane pool.",
    "- This draft has been converted into a real deploy-lane task card only after those preconditions are true.",
    "",
    "## Validation Required Before Deploy",
    "",
    validationList,
    "",
    "## Planned Deploy Command",
    "",
    "```sh",
    PLANNED_DEPLOY_COMMAND,
    "```",
    "",
    "## Required Production Readback",
    "",
    readbackList,
    "",
    "## Required Readback Validator",
    "",
    "```sh",
    PRODUCTION_READBACK_VALIDATION_COMMAND,
    "```",
    "",
    "## Privacy Boundary",
    "",
    privacyList,
    "",
  ].join("\n");
}

function buildDeployLaneCardDraft({ repoRoot, preflight }) {
  return {
    sendable: false,
    notSendableReason: "cutover_source_change_not_created",
    title: "Deploy Home AI Vite production cutover after source cutover change",
    target: {
      kind: "home_ai_deploy_lane_pool",
      preferredThreadTitles: DEFAULT_DEPLOY_LANE_POOL,
    },
    workflowMode: "manual",
    requestedReasoningEffort: "high",
    conflictRule:
      "If the source ref, cutover source change, validation evidence, or production shell mode is unclear, return blocked instead of deploying.",
    requiredPreSendGates: [
      {
        id: "owner_approval_recorded",
        status: "satisfied_by_packet",
        evidence: "Exact Owner approval text is recorded in the source implementation thread.",
      },
      {
        id: "cutover_source_change_validated",
        status: "not_satisfied",
        requiredCommand: CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND,
      },
      {
        id: "deploy_lane_selected",
        status: "not_satisfied",
        candidateThreadTitles: DEFAULT_DEPLOY_LANE_POOL,
      },
      {
        id: "production_readback_validator_planned",
        status: "planned",
        requiredCommand: PRODUCTION_READBACK_VALIDATION_COMMAND,
      },
    ],
    bodyMarkdown: buildDeployLaneCardBody({ repoRoot, preflight }),
  };
}

function buildViteProductionCutoverHandoffPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const env = options.env || process.env;
  const ownerApprovalText =
    options.ownerApprovalText || env.HOMEAI_VITE_CUTOVER_OWNER_APPROVAL_TEXT || "";
  const preflight =
    options.preflight ||
    runViteProductionCutoverPreflight({
      repoRoot,
      ownerApprovalText,
      requireBuiltAssets: options.requireBuiltAssets !== false,
      env,
      readiness: options.readiness,
    });

  const readinessOk = Boolean(preflight.readinessSummary && preflight.readinessSummary.ok);
  const ownerApprovalRecorded = Boolean(preflight.ownerApproval && preflight.ownerApproval.approved);
  const ok = Boolean(preflight.ok && ownerApprovalRecorded);
  const status = ok ? "handoff_packet_ready" : "blocked";
  const blockedReason = ok
    ? ""
    : !readinessOk
      ? "vite_development_readiness_failed"
      : preflight.blockedReason || "owner_approval_required";

  return {
    ok,
    status,
    blockedReason,
    packetVersion: HANDOFF_PACKET_VERSION,
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    deployCardSent: false,
    taskCardCreated: false,
    productionDeployAuthorized: false,
    ownerApproval: {
      required: true,
      recorded: ownerApprovalRecorded,
      code: preflight.ownerApproval ? preflight.ownerApproval.code : "owner_approval_required",
      requiredText: REQUIRED_OWNER_APPROVAL_TEXT,
    },
    developmentReadiness: preflight.readinessSummary,
    cutoverSourceChange: {
      required: true,
      status: "not_created",
      summary:
        "A separate fail-closed production shell/config switch source change is still required before any deploy-lane card can be sent.",
    },
    deployLaneCardDraft: ok
      ? buildDeployLaneCardDraft({
        repoRoot,
        preflight,
      })
      : null,
    plannedValidationCommands: PLANNED_VALIDATION_COMMANDS,
    plannedDeployCommand: PLANNED_DEPLOY_COMMAND,
    requiredProductionReadback: REQUIRED_PRODUCTION_READBACK_CHECKS,
    privacyBoundary: PRIVACY_BOUNDARY,
    nextActions: ok
      ? [
        "Create the separate fail-closed production cutover source change.",
        "Run the planned validation commands on that source change.",
        "Only after validation passes, convert the draft into a real deploy-lane task card.",
      ]
      : [
        "Keep current production deployment state unchanged.",
        "Do not create or send a deploy-lane card.",
        "Resolve the blocked reason before preparing a cutover work order.",
      ],
  };
}

function formatText(packet) {
  const lines = [
    `Vite production cutover handoff packet: ${packet.status}`,
    `version: ${packet.packetVersion}`,
    `sourceOnly: ${packet.sourceOnly}`,
    `productionWrites: ${packet.productionWrites}`,
    `deployExecuted: ${packet.deployExecuted}`,
    `deployCardSent: ${packet.deployCardSent}`,
    `productionDeployAuthorized: ${packet.productionDeployAuthorized}`,
    `ownerApproval: ${packet.ownerApproval.code}`,
    `cutoverSourceChange: ${packet.cutoverSourceChange.status}`,
  ];
  if (packet.blockedReason) {
    lines.push(`blockedReason: ${packet.blockedReason}`);
  }
  if (packet.deployLaneCardDraft) {
    lines.push(`deployLaneDraft: ${packet.deployLaneCardDraft.title}`);
    lines.push(`deployLaneDraftSendable: ${packet.deployLaneCardDraft.sendable}`);
    lines.push(`deployLaneDraftReason: ${packet.deployLaneCardDraft.notSendableReason}`);
  }
  lines.push("nextActions:");
  for (const action of packet.nextActions) {
    lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const packet = buildViteProductionCutoverHandoffPacket(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(packet));
  }
  if (options.requireApproved && !packet.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND,
  DEFAULT_DEPLOY_LANE_POOL,
  HANDOFF_PACKET_VERSION,
  PRIVACY_BOUNDARY,
  PRODUCTION_READBACK_VALIDATION_COMMAND,
  buildDeployLaneCardDraft,
  buildViteProductionCutoverHandoffPacket,
  formatText,
  parseArgs,
};
