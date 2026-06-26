#!/usr/bin/env node
"use strict";

const { createAutonomousDeliveryIntent } = require("../adapters/autonomous-delivery-intake-service");

function usage() {
  return [
    "Usage:",
    "  node scripts/autonomous-delivery-loop.js intake --text <requirement> [--workspace <id>] [--approve-high-risk] [--json]",
  ].join("\n");
}

function parseFlags(argv) {
  const out = { _: [], workspaces: [], json: false, approvals: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") out.json = true;
    else if (arg === "--text" || arg === "--task" || arg === "--requirement") out.text = argv[++index] || "";
    else if (arg === "--workspace") out.workspaces.push(argv[++index] || "");
    else if (arg === "--approve-high-risk") out.approvals.highRisk = true;
    else if (arg === "--approve-device-control") out.approvals.deviceControl = true;
    else if (arg === "--approve-data-mutation") out.approvals.dataMutation = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    else out._.push(arg);
  }
  return out;
}

function print(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok === false) {
    console.error("intent_required");
    process.exitCode = 1;
    return;
  }
  console.log(`${result.mode} ${result.risk} ${result.targetWorkspaces.map((item) => item.id).join(",")}`);
  if (result.userDecisionGate.userInterventionRequired) {
    console.log(`requires_user=${result.userDecisionGate.required.join(",")}`);
  }
}

function handle(command, options) {
  if (options.help || !command) return { ok: true, usage: usage() };
  if (command !== "intake") throw new Error(`Unknown command: ${command}`);
  return createAutonomousDeliveryIntent(options);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "";
  const options = parseFlags(argv.slice(1));
  const result = handle(command, options);
  if (result.usage) {
    console.log(result.usage);
    return;
  }
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
