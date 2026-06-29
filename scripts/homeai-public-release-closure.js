#!/usr/bin/env node
"use strict";

const { createPublicReleaseClosureService } = require("../adapters/public-release-closure-service");

function clean(value, max = 400) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv = []) {
  const out = {
    outDir: "",
    publicRepoPath: "",
    commitMessage: "",
    timeoutMs: 30000,
    execute: false,
    json: false,
    syncPublicRepo: false,
    commitPublic: false,
    pushPublic: false,
    allowDirty: false,
    allowPublicRepoDirty: false,
    skipPrivacyScan: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out" || arg === "--out-dir") out.outDir = clean(argv[++index] || "");
    else if (arg === "--public-repo") out.publicRepoPath = clean(argv[++index] || "");
    else if (arg === "--commit-message") out.commitMessage = clean(argv[++index] || "", 160);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--sync-public-repo") out.syncPublicRepo = true;
    else if (arg === "--commit-public") out.commitPublic = true;
    else if (arg === "--push-public") out.pushPublic = true;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else if (arg === "--allow-public-repo-dirty") out.allowPublicRepoDirty = true;
    else if (arg === "--skip-privacy-scan") out.skipPrivacyScan = true;
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
    "Usage: node scripts/homeai-public-release-closure.js [options]",
    "",
    "Default mode is plan-only. Add --execute to create a public export.",
    "Sync, commit, and push to the public repository are separate explicit gates.",
    "",
    "Options:",
    "  --out <path>                  Public export output directory.",
    "  --public-repo <path>          Local checkout of the public repository.",
    "  --sync-public-repo            Sync the verified export into --public-repo.",
    "  --commit-public               Commit changes in --public-repo after sync.",
    "  --push-public                 Push --public-repo after the explicit commit.",
    "  --commit-message <text>       Commit message for the public repository.",
    "  --allow-dirty                 Permit dirty private source while exporting.",
    "  --allow-public-repo-dirty     Permit dirty public checkout before sync.",
    "  --skip-privacy-scan           Skip export privacy scan; use only for debugging.",
    "  --timeout-ms <ms>             Per-command timeout, default 30000.",
    "  --execute                     Execute the release closure.",
    "  --json                        Print JSON output.",
  ].join("\n"));
}

function serviceOptions(options) {
  return {
    timeoutMs: options.timeoutMs,
  };
}

function closureOptions(options) {
  return {
    execute: options.execute,
    outDir: options.outDir || undefined,
    publicRepoPath: options.publicRepoPath || undefined,
    syncPublicRepo: options.syncPublicRepo,
    commitPublic: options.commitPublic,
    pushPublic: options.pushPublic,
    commitMessage: options.commitMessage || undefined,
    allowDirty: options.allowDirty,
    allowPublicRepoDirty: options.allowPublicRepoDirty,
    skipPrivacyScan: options.skipPrivacyScan,
  };
}

function renderText(report = {}) {
  const lines = [
    `ok: ${report.ok === true}`,
    `mode: ${report.mode || "plan"}`,
    `repoRoot: ${report.repoRoot || ""}`,
  ];
  if (report.outDir) lines.push(`outDir: ${report.outDir}`);
  if (report.publicRepoPath) lines.push(`publicRepoPath: ${report.publicRepoPath}`);
  if (report.generatedAt) lines.push(`generatedAt: ${report.generatedAt}`);
  if (report.startedAt) lines.push(`startedAt: ${report.startedAt}`);
  if (Number.isFinite(Number(report.actionCount))) lines.push(`actionCount: ${report.actionCount}`);
  if (Number.isFinite(Number(report.blockerCount))) lines.push(`blockerCount: ${report.blockerCount}`);
  if (Number.isFinite(Number(report.issueCount))) lines.push(`issueCount: ${report.issueCount}`);
  if (Number.isFinite(Number(report.stepCount))) lines.push(`stepCount: ${report.stepCount}`);
  if (report.error) lines.push(`error: ${report.error}`);
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  if (blockers.length) {
    lines.push("blockers:");
    for (const blocker of blockers.slice(0, 20)) lines.push(`- ${blocker.code}`);
  }
  const issues = Array.isArray(report.issues) ? report.issues : [];
  if (issues.length) {
    lines.push("issues:");
    for (const issue of issues.slice(0, 20)) lines.push(`- ${issue.code}`);
  }
  const actions = Array.isArray(report.actions) ? report.actions : [];
  if (actions.length) {
    lines.push("actions:");
    for (const action of actions.slice(0, 30)) lines.push(`- ${action.type}`);
  }
  const steps = Array.isArray(report.steps) ? report.steps : [];
  if (steps.length) {
    lines.push("steps:");
    for (const step of steps.slice(0, 40)) {
      const ok = step.ok === true || step.result?.ok === true || step.result?.skipped === true;
      lines.push(`- ${step.type}: ${ok ? "ok" : "not_ok"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const service = createPublicReleaseClosureService(serviceOptions(args));
  const report = args.execute
    ? await service.executeClosure(closureOptions(args))
    : await service.buildPlan(closureOptions(args));
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderText(report));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    const error = { ok: false, error: clean(err?.message || err, 500) };
    process.stderr.write(`${JSON.stringify(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  closureOptions,
  parseArgs,
  renderText,
  serviceOptions,
};
