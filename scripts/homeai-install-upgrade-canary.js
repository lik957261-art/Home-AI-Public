#!/usr/bin/env node
"use strict";

const {
  createHomeAiInstallUpgradeCanaryService,
} = require("../adapters/home-ai-install-upgrade-canary-service");

function parseArgs(argv = []) {
  const out = {
    execute: false,
    executePublicRehearsal: false,
    json: false,
    markdown: false,
    cleanTargetReadback: null,
    timeoutMs: 120000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") out.execute = true;
    else if (arg === "--execute-public-rehearsal") out.executePublicRehearsal = true;
    else if (arg === "--clean-target-readback-json") out.cleanTargetReadback = parseJsonArg(argv[++index] || "", "clean_target_readback");
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--json") out.json = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000) out.timeoutMs = 120000;
  return out;
}

function parseJsonArg(value, label) {
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object_required");
    return parsed;
  } catch (err) {
    throw new Error(`${label}_json_invalid:${String(err?.message || err).slice(0, 160)}`);
  }
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/homeai-install-upgrade-canary.js [options]",
    "",
    "Default mode is plan-only. Add --execute to run local source-safe install",
    "and upgrade closure checks. Add --execute-public-rehearsal only when the",
    "operator wants the canary to run the public repository clone rehearsal.",
    "Clean install/upgrade completion requires bounded lane readback passed via",
    "--clean-target-readback-json; local --execute remains source-safe rehearsal.",
    "",
    "Options:",
    "  --execute                    Run local source-safe canary phases.",
    "  --execute-public-rehearsal   Also run public upgrade rehearsal clone checks.",
    "  --clean-target-readback-json <json>",
    "                               Attach install/deploy-lane clean-target readback.",
    "  --timeout-ms <ms>            Per-phase timeout, default 120000.",
    "  --json                       Print JSON.",
    "  --markdown                   Print Markdown summary.",
  ].join("\n") + "\n");
}

function renderMarkdown(report = {}) {
  const lines = [
    "# Home AI Install / Upgrade Canary",
    "",
    `- ok: ${report.ok === true}`,
    `- mode: ${report.mode || ""}`,
    `- executionClass: ${report.executionClass || ""}`,
    `- closureStatus: ${report.closureStatus || ""}`,
    `- canaryVersion: ${report.canaryVersion || ""}`,
    `- phaseCount: ${report.phaseCount || 0}`,
  ];
  if (Number.isFinite(Number(report.failedPhaseCount))) lines.push(`- failedPhaseCount: ${report.failedPhaseCount}`);
  if (report.stageCoverage) {
    lines.push(`- coveredStageCount: ${report.stageCoverage.coveredStageCount || 0}/${report.stageCoverage.stageCount || 0}`);
    const missing = Array.isArray(report.stageCoverage.missingStageIds) ? report.stageCoverage.missingStageIds : [];
    if (missing.length) lines.push(`- missingStages: ${missing.join(", ")}`);
  }
  if (report.policy) {
    lines.push(`- productionWrites: ${report.policy.productionWrites === true || report.policy.defaultProductionWrites === true}`);
    lines.push(`- networkClone: ${report.policy.networkClone === true}`);
    lines.push(`- cleanTargetCanaryRequiredForCompletion: ${report.policy.cleanTargetCanaryRequiredForCompletion === true}`);
  }
  if (report.cleanTargetEnvironment) {
    lines.push(`- cleanTargetEnvironment: ${report.cleanTargetEnvironment.status || "unknown"}`);
    const issueCodes = Array.isArray(report.cleanTargetEnvironment.issueCodes)
      ? report.cleanTargetEnvironment.issueCodes
      : [];
    if (issueCodes.length) lines.push(`- cleanTargetEnvironmentIssues: ${issueCodes.join(", ")}`);
  }
  if (report.cleanTargetCanary) {
    lines.push(`- cleanTargetCanary: ${report.cleanTargetCanary.status || "not_run"}`);
    lines.push(`- cleanTargetNoCompletionClaim: ${report.cleanTargetCanary.noCompletionClaim === true}`);
    const canaryIssues = Array.isArray(report.cleanTargetCanary.issueCodes)
      ? report.cleanTargetCanary.issueCodes
      : [];
    if (canaryIssues.length) lines.push(`- cleanTargetCanaryIssues: ${canaryIssues.join(", ")}`);
  }
  const stages = report.stageCoverage && Array.isArray(report.stageCoverage.stages) ? report.stageCoverage.stages : [];
  if (stages.length) {
    lines.push("", "## Stage Coverage", "");
    for (const stage of stages) {
      lines.push(`- ${stage.id}: ${stage.covered === true ? "covered" : "missing"}`);
    }
  }
  const steps = Array.isArray(report.steps) ? report.steps : Array.isArray(report.phases) ? report.phases : [];
  if (steps.length) {
    lines.push("", "## Phases", "");
    for (const step of steps) {
      const status = step.ok === false ? "failed" : "ok";
      lines.push(`- ${step.id}: ${status}`);
    }
  }
  if (Array.isArray(report.issues) && report.issues.length) {
    lines.push("", "## Issues", "");
    for (const issue of report.issues) lines.push(`- ${issue.code}${issue.phaseId ? ` (${issue.phaseId})` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const service = createHomeAiInstallUpgradeCanaryService({ timeoutMs: args.timeoutMs });
  const report = await service.executeCanary(Object.assign({}, args, { env: process.env }));
  if (args.markdown && !args.json) process.stdout.write(renderMarkdown(report));
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.ok !== true) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 500) })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  parseJsonArg,
  renderMarkdown,
};
