#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const controlPlane = require("../adapters/ai-operations-control-plane-service");

function usage() {
  return [
    "Usage:",
    "  node scripts/ai-ops-control-plane.js intake --task <text> [--changed-file <path>] [--json]",
    "  node scripts/ai-ops-control-plane.js required-checks [--task <text>] [--changed-file <path>] [--json]",
    "  node scripts/ai-ops-control-plane.js lane allocate --plugin-id <id> --requester <id> [--state-file <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js lane release --lease-id <id> [--state-file <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js lane list [--state-file <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js evidence append --kind <kind> --status <status> --summary <text> [--ledger <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js evidence list [--ledger <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js evidence verify [--require-kind <kind>] [--ledger <file>] [--json]",
    "  node scripts/ai-ops-control-plane.js incident create --symptom <text> [--issue-code <code>] [--dir <dir>] [--json]",
    "  node scripts/ai-ops-control-plane.js incident list [--dir <dir>] [--json]",
  ].join("\n");
}

function parseFlags(argv) {
  const out = { _: [], changedFiles: [], artifactPaths: [], reproductionSteps: [], expectedChecks: [], requiredKinds: [], requiredStatuses: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") out.json = true;
    else if (arg === "--task") out.taskText = argv[++index] || "";
    else if (arg === "--changed-file") out.changedFiles.push(argv[++index] || "");
    else if (arg === "--plugin-id") out.pluginId = argv[++index] || "";
    else if (arg === "--requester") out.requester = argv[++index] || "";
    else if (arg === "--state-file") out.stateFile = argv[++index] || "";
    else if (arg === "--lease-id") out.leaseId = argv[++index] || "";
    else if (arg === "--lane-id") out.laneId = argv[++index] || "";
    else if (arg === "--udid") out.udid = argv[++index] || "";
    else if (arg === "--ttl-ms") out.ttlMs = Number(argv[++index] || 0);
    else if (arg === "--ledger") out.ledgerPath = argv[++index] || "";
    else if (arg === "--kind") out.kind = argv[++index] || "";
    else if (arg === "--status") out.status = argv[++index] || "";
    else if (arg === "--summary") out.summary = argv[++index] || "";
    else if (arg === "--command") out.command = argv[++index] || "";
    else if (arg === "--commit") out.commit = argv[++index] || "";
    else if (arg === "--artifact") out.artifactPaths.push(argv[++index] || "");
    else if (arg === "--metadata-json") out.metadata = readJsonArg(argv[++index] || "{}");
    else if (arg === "--require-kind") out.requiredKinds.push(argv[++index] || "");
    else if (arg === "--require-status") out.requiredStatuses.push(argv[++index] || "");
    else if (arg === "--commit-prefix") out.commitPrefix = argv[++index] || "";
    else if (arg === "--dir") out.dir = argv[++index] || "";
    else if (arg === "--symptom") out.symptom = argv[++index] || "";
    else if (arg === "--issue-code") out.issueCode = argv[++index] || "";
    else if (arg === "--workspace-id") out.workspaceId = argv[++index] || "";
    else if (arg === "--route") out.route = argv[++index] || "";
    else if (arg === "--surface") out.surface = argv[++index] || "";
    else if (arg === "--client-version") out.clientVersion = argv[++index] || "";
    else if (arg === "--gateway-json") out.gateway = readJsonArg(argv[++index] || "{}");
    else if (arg === "--step") out.reproductionSteps.push(argv[++index] || "");
    else if (arg === "--expected-check") out.expectedChecks.push(argv[++index] || "");
    else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function readJsonArg(value) {
  const text = String(value || "{}");
  if (text.startsWith("@")) {
    return JSON.parse(fs.readFileSync(path.resolve(text.slice(1)), "utf8"));
  }
  return JSON.parse(text);
}

function print(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok === false) {
    console.error(result.error || result.issues?.join(", ") || "failed");
    process.exitCode = 1;
    return;
  }
  if (result.requiredChecks) {
    console.log(`${result.harnessClass || "H3"} ${result.modules?.join(", ") || ""}`.trim());
    for (const check of result.requiredChecks) console.log(`- ${check.command}`);
    return;
  }
  if (result.lane) {
    console.log(`${result.lane.id} ${result.lane.debugUrl} lease=${result.lane.lease?.id || ""}`);
    return;
  }
  if (result.record) {
    console.log(`${result.record.kind}:${result.record.status} ${result.record.id}`);
    return;
  }
  if (result.cassette) {
    console.log(`${result.id} ${result.file}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function assertRequired(value, name) {
  if (!String(value || "").trim()) throw new Error(`${name}_required`);
}

function handle(command, subcommand, options) {
  if (options.help || !command) return { ok: true, usage: usage() };
  if (command === "intake") {
    assertRequired(options.taskText, "task");
    return controlPlane.buildTaskContextPack(options);
  }
  if (command === "required-checks") {
    return controlPlane.selectRequiredChecks(options);
  }
  if (command === "lane") {
    if (subcommand === "allocate") {
      assertRequired(options.pluginId, "plugin_id");
      assertRequired(options.requester, "requester");
      return controlPlane.allocateVisualLane(options);
    }
    if (subcommand === "release") {
      if (!options.leaseId && !options.laneId) throw new Error("lease_id_or_lane_id_required");
      return controlPlane.releaseVisualLane(options);
    }
    if (subcommand === "list" || subcommand === "status") {
      return controlPlane.listVisualLanes(options);
    }
    throw new Error("lane_subcommand_required");
  }
  if (command === "evidence") {
    if (subcommand === "append") {
      assertRequired(options.kind, "kind");
      assertRequired(options.status, "status");
      assertRequired(options.summary, "summary");
      return controlPlane.appendEvidenceRecord(options);
    }
    if (subcommand === "list") return controlPlane.listEvidenceRecords(options);
    if (subcommand === "verify") return controlPlane.verifyEvidenceLedger(options);
    throw new Error("evidence_subcommand_required");
  }
  if (command === "incident") {
    if (subcommand === "create") {
      assertRequired(options.symptom, "symptom");
      return controlPlane.createIncidentCassette(options);
    }
    if (subcommand === "list") return controlPlane.listIncidentCassettes(options);
    throw new Error("incident_subcommand_required");
  }
  throw new Error(`Unknown command: ${command}`);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "";
  const subcommand = argv[1] && !argv[1].startsWith("--") ? argv[1] : "";
  const flagStart = subcommand ? 2 : 1;
  const options = parseFlags(argv.slice(flagStart));
  const result = handle(command, subcommand, options);
  print(result, options.json);
  if (result.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  }
}

module.exports = { handle, parseFlags };
