#!/usr/bin/env node
"use strict";

const {
  buildMainThreadRoutingPreflight,
} = require("../adapters/main-thread-routing-preflight-service");

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    task: "",
    changedFiles: [],
    mode: "classify",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task" || arg === "--text" || arg === "--objective") {
      index += 1;
      options.task = requireValue(argv[index], arg);
    } else if (arg === "--changed-file" || arg === "--changedFile") {
      index += 1;
      options.changedFiles.push(requireValue(argv[index], arg));
    } else if (arg === "--mode") {
      index += 1;
      options.mode = requireValue(argv[index], arg);
    } else if (arg === "--worker-target") {
      index += 1;
      options.workerTargetAvailable = parseAvailability(requireValue(argv[index], arg));
    } else if (arg === "--plugin-worker-target") {
      index += 1;
      options.pluginWorkerTargetAvailable = parseAvailability(requireValue(argv[index], arg));
    } else if (arg === "--plugin-main-target") {
      index += 1;
      options.pluginMainTargetAvailable = parseAvailability(requireValue(argv[index], arg));
    } else if (arg === "--plugin-loop-target") {
      index += 1;
      options.pluginLoopTargetAvailable = parseAvailability(requireValue(argv[index], arg));
    } else if (arg === "--deploy-lane-target") {
      index += 1;
      options.deployLaneTargetAvailable = parseAvailability(requireValue(argv[index], arg));
    } else if (arg === "--routing-decision-recorded") {
      options.routingDecisionRecorded = true;
    } else if (arg === "--source-thread-id") {
      index += 1;
      options.sourceThreadId = requireValue(argv[index], arg);
    } else if (arg === "--source-thread-role") {
      index += 1;
      options.sourceThreadRole = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-id") {
      index += 1;
      options.targetThreadId = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-title") {
      index += 1;
      options.targetThreadTitle = requireValue(argv[index], arg);
    } else if (arg === "--target-cwd" || arg === "--target-workspace") {
      index += 1;
      options.targetCwd = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-purpose") {
      index += 1;
      options.targetThreadPurpose = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-role") {
      index += 1;
      options.targetThreadRole = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-status") {
      index += 1;
      options.targetThreadStatus = requireValue(argv[index], arg);
    } else if (arg === "--target-thread-archived") {
      options.targetThreadArchived = true;
    } else if (arg === "--target-thread-hidden") {
      options.targetThreadHidden = true;
    } else if (arg === "--dispatch-kind") {
      index += 1;
      options.dispatchKind = requireValue(argv[index], arg);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseAvailability(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["available", "true", "yes", "1"].includes(text)) return true;
  if (["unavailable", "false", "no", "0"].includes(text)) return false;
  throw new Error(`Invalid target availability: ${value}`);
}

function usage() {
  return [
    "Usage: node scripts/main-thread-routing-preflight.js --task <text> [--changed-file <path>] [--mode classify|enforce] [--routing-decision-recorded --source-thread-id <id> --target-thread-id <id> --target-thread-title <title> --target-thread-role <role>]",
    "",
    "Classifies whether Home AI main-thread work may stay inline or must route to Worker/plugin/deploy lanes.",
    "Plugin main/source threads can pass --source-thread-role plugin_main to classify non-trivial plugin work as plugin_worker.",
    "In enforce mode, non-inline work with --routing-decision-recorded must include a role-compatible target thread.",
    "Outputs bounded JSON only.",
  ].join("\n");
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = buildMainThreadRoutingPreflight(options);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      error: String(err?.message || err),
      source: "main_thread_routing_preflight_cli",
    }, null, 2));
    process.exitCode = 2;
  }
}

module.exports = {
  parseArgs,
};
