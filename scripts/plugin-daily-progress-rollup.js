#!/usr/bin/env node
"use strict";

const { createCodexThreadTaskCardService } = require("../adapters/codex-thread-task-card-service");
const {
  createPluginDailyProgressRollupService,
} = require("../adapters/plugin-daily-progress-rollup-service");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log([
    "Usage: node scripts/plugin-daily-progress-rollup.js [--trigger|--status|--finalize] [--json]",
    "",
    "Options:",
    "  --trigger                    Dispatch summary cards and generate/update the Owner report.",
    "  --status                     Print current/latest rollup status.",
    "  --finalize                   Mark pending plugin reports missing/stale and regenerate report.",
    "  --date <yyyy-mm-dd>          Rollup date. Defaults to Asia/Shanghai today.",
    "  --trigger-source <value>     scheduled or manual.",
    "  --dry-run                    Do not send task cards; produce deterministic dry ids.",
    "  --state-file <file>          Stable metadata-only state path.",
    "  --source-thread-id <id>      Source Home AI thread id for dispatch correlation.",
    "  --source-thread-title <name> Source Home AI thread title.",
    "  --help                       Show this help.",
  ].join("\n"));
}

function createService() {
  return createPluginDailyProgressRollupService({
    env: process.env,
    stateFile: argValue("--state-file", ""),
    dataDir: argValue("--data-dir", ""),
    sourceThreadId: argValue("--source-thread-id", process.env.HOMEAI_PLUGIN_DAILY_ROLLUP_SOURCE_THREAD_ID || ""),
    sourceThreadTitle: argValue("--source-thread-title", process.env.HOMEAI_PLUGIN_DAILY_ROLLUP_SOURCE_THREAD_TITLE || ""),
    sourceThreadTitlePrefix: argValue("--source-thread-title-prefix", process.env.HOMEAI_PLUGIN_DAILY_ROLLUP_SOURCE_THREAD_TITLE_PREFIX || "Home AI"),
    taskCardService: hasFlag("--dry-run") ? null : createCodexThreadTaskCardService({ env: process.env }),
  });
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }
  const service = createService();
  let result;
  if (hasFlag("--trigger")) {
    result = await service.trigger({
      date: argValue("--date", ""),
      triggerSource: argValue("--trigger-source", hasFlag("--manual") ? "manual" : "scheduled"),
      dryRun: hasFlag("--dry-run"),
    });
  } else if (hasFlag("--finalize")) {
    result = service.finalize({
      date: argValue("--date", ""),
      missingStatus: argValue("--missing-status", "missing_report"),
    });
  } else {
    result = service.status({ date: argValue("--date", "") });
  }
  if (hasFlag("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    const run = result.run || result.current || result.latest || {};
    console.log(`插件每日进展汇总：ok=${result.ok !== false} job=${service.jobId} run=${run.runId || ""} status=${run.status || ""}`);
  }
  if (result.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, code: err?.code || "plugin_daily_progress_rollup_failed", error: String(err?.message || err).slice(0, 240) }));
    process.exit(1);
  });
}

module.exports = {
  createService,
};
