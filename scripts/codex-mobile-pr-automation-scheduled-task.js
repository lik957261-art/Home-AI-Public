#!/usr/bin/env node
"use strict";

const {
  DEFAULT_CHECKOUT,
  DEFAULT_PRIVATE_REPOSITORY,
  DEFAULT_PUBLIC_REPOSITORY,
  DEFAULT_SOURCE_REF,
  runScheduledTask,
} = require("../adapters/codex-mobile-pr-automation-scheduled-task-service");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log([
    "Usage: node scripts/codex-mobile-pr-automation-scheduled-task.js [--json]",
    "",
    "Runs the Home AI Owner scheduled-task wrapper for Codex Mobile PR automation.",
    "The wrapper resolves the planner from Codex Mobile origin/main or a clean source",
    "worktree and does not merge, deploy, push public, or close PRs directly.",
    "",
    "Options:",
    "  --codex-mobile-checkout <dir>  Shared Codex Mobile checkout.",
    "  --source-ref <ref>             Planner source ref. Defaults to origin/main.",
    "  --source-root <dir>            Explicit already-resolved planner source root.",
    "  --worktree-root <dir>          Stable clean source worktree root.",
    "  --state-file <file>            Stable metadata-only planner state path.",
    "  --private-repo <owner/name>    Private repository.",
    "  --public-repo <owner/name>     Public repository.",
    "  --fixture <file>               Planner fixture for tests/dry runs.",
    "  --shared-checkout-only         Do not use a clean worktree.",
    "  --json                         Print JSON.",
    "  --help                         Show this help.",
  ].join("\n"));
}

function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }
  const result = runScheduledTask({
    checkout: argValue("--codex-mobile-checkout", process.env.CODEX_MOBILE_PR_AUTOMATION_CHECKOUT || DEFAULT_CHECKOUT),
    sourceRef: argValue("--source-ref", process.env.CODEX_MOBILE_PR_AUTOMATION_SOURCE_REF || DEFAULT_SOURCE_REF),
    sourceRoot: argValue("--source-root", process.env.CODEX_MOBILE_PR_AUTOMATION_SOURCE_ROOT || ""),
    worktreeRoot: argValue("--worktree-root", process.env.HOMEAI_CODEX_MOBILE_PR_AUTOMATION_SOURCE_ROOT || ""),
    stateFile: argValue("--state-file", process.env.HOMEAI_CODEX_MOBILE_PR_AUTOMATION_STATE_FILE || process.env.CODEX_MOBILE_PR_AUTOMATION_STATE || ""),
    privateRepository: argValue("--private-repo", process.env.CODEX_MOBILE_PRIVATE_REPOSITORY || DEFAULT_PRIVATE_REPOSITORY),
    publicRepository: argValue("--public-repo", process.env.CODEX_MOBILE_PUBLIC_REPOSITORY || DEFAULT_PUBLIC_REPOSITORY),
    fixture: argValue("--fixture", ""),
    useCleanWorktree: !hasFlag("--shared-checkout-only"),
    env: process.env,
  });
  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const readback = result.readback || {};
    console.log(`codex mobile pr automation: ok=${result.ok !== false} job=${result.job?.id || ""} state=${result.state || ""} issueCode=${result.issueCode || readback.issueCode || ""}`);
  }
  if (result.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, code: err?.code || "codex_mobile_pr_automation_wrapper_failed", error: String(err?.message || err).slice(0, 240) }));
    process.exit(1);
  }
}

module.exports = {
  main,
};
