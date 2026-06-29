#!/usr/bin/env node
"use strict";

const {
  DEFAULT_PUBLIC_REPO_URL,
  createPublicUpgradeRehearsalService,
} = require("../adapters/public-upgrade-rehearsal-service");

function clean(value, max = 400) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv = []) {
  const out = {
    publicRepoUrl: process.env.HOMEAI_PUBLIC_REPOSITORY_URL || DEFAULT_PUBLIC_REPO_URL,
    rehearsalRoot: "",
    hermesAgentRepositoryUrl: process.env.HOMEAI_HERMES_AGENT_REPOSITORY_URL || process.env.HERMES_MOBILE_HERMES_AGENT_REPOSITORY_URL || "",
    hermesAgentRef: process.env.HOMEAI_HERMES_AGENT_REF || process.env.HERMES_MOBILE_HERMES_AGENT_REF || "main",
    baseUrl: process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    reason: "public-upgrade-rehearsal",
    timeoutMs: 30000,
    execute: false,
    json: false,
    keepTemp: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo" || arg === "--public-repo-url") out.publicRepoUrl = clean(argv[++index] || out.publicRepoUrl, 500);
    else if (arg === "--root" || arg === "--rehearsal-root") out.rehearsalRoot = clean(argv[++index] || "");
    else if (arg === "--hermes-agent-repository-url") out.hermesAgentRepositoryUrl = clean(argv[++index] || "", 500);
    else if (arg === "--hermes-agent-ref") out.hermesAgentRef = clean(argv[++index] || "main", 120);
    else if (arg === "--base") out.baseUrl = clean(argv[++index] || out.baseUrl, 300);
    else if (arg === "--reason") out.reason = clean(argv[++index] || out.reason, 120);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--keep-temp") out.keepTemp = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000) out.timeoutMs = 30000;
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/homeai-public-upgrade-rehearsal.js [options]",
    "",
    "Default mode is plan-only. Add --execute to clone the published public repo",
    "into a temporary root and run source-only target upgrade rehearsal checks.",
    "",
    "Options:",
    "  --repo <url>                         Public Home AI repository URL.",
    "  --root <path>                        Temporary rehearsal root.",
    "  --hermes-agent-repository-url <url>  Hermes Agent repository URL for upgrade plan.",
    "  --hermes-agent-ref <ref>             Hermes Agent ref, default main.",
    "  --base <url>                         Target production base URL used in plan only.",
    "  --reason <slug>                      Upgrade reason slug for generated plan.",
    "  --keep-temp                          Keep temporary rehearsal checkout.",
    "  --timeout-ms <ms>                    Per-command timeout, default 30000.",
    "  --execute                            Execute the rehearsal.",
    "  --json                               Print JSON output.",
  ].join("\n"));
}

function serviceOptions(options) {
  return {
    timeoutMs: options.timeoutMs,
  };
}

function rehearsalOptions(options) {
  return {
    publicRepoUrl: options.publicRepoUrl,
    rehearsalRoot: options.rehearsalRoot || undefined,
    hermesAgentRepositoryUrl: options.hermesAgentRepositoryUrl || undefined,
    hermesAgentRef: options.hermesAgentRef,
    baseUrl: options.baseUrl,
    reason: options.reason,
    keepTemp: options.keepTemp,
    execute: options.execute,
  };
}

function renderText(report = {}) {
  const lines = [
    `ok: ${report.ok === true}`,
    `mode: ${report.mode || "plan"}`,
    `publicRepoUrl: ${report.publicRepoUrl || ""}`,
  ];
  if (report.paths?.rehearsalRoot) lines.push(`rehearsalRoot: ${report.paths.rehearsalRoot}`);
  if (Number.isFinite(Number(report.actionCount))) lines.push(`actionCount: ${report.actionCount}`);
  if (Number.isFinite(Number(report.stepCount))) lines.push(`stepCount: ${report.stepCount}`);
  if (report.error) lines.push(`error: ${report.error}`);
  if (report.tempRemoved === true) lines.push("tempRemoved: true");
  const actions = Array.isArray(report.actions) ? report.actions : [];
  if (actions.length) {
    lines.push("actions:");
    for (const action of actions.slice(0, 20)) lines.push(`- ${action.type}`);
  }
  const steps = Array.isArray(report.steps) ? report.steps : [];
  if (steps.length) {
    lines.push("steps:");
    for (const step of steps.slice(0, 30)) {
      const ok = step.ok === true
        || step.result?.ok === true
        || step.json?.ok === true
        || step.summary?.ok === true
        || step.detail?.ok === true
        || (step.type === "upgrade-plan-missing-sources-fail-closed"
          && Number(step.summary?.missingSourceBlockerCount || 0) > 0
          && Number(step.summary?.issueCount || 0) === 0);
      lines.push(`- ${step.type}: ${ok ? "ok" : "not_ok"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const service = createPublicUpgradeRehearsalService(serviceOptions(args));
  const report = args.execute
    ? await service.executeRehearsal(rehearsalOptions(args))
    : service.buildPlan(rehearsalOptions(args));
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderText(report));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: clean(err?.message || err, 500) })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  rehearsalOptions,
  renderText,
  serviceOptions,
};
