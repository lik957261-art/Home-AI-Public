#!/usr/bin/env node
"use strict";

const { createPublicUpgradeOrchestratorService } = require("../adapters/public-upgrade-orchestrator-service");

function clean(value, max = 400) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv = []) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    appPath: "",
    pluginRoot: "",
    runtimeRoot: "",
    manifestPath: "",
    hermesAgentSource: "",
    hermesAgentRepositoryUrl: process.env.HOMEAI_HERMES_AGENT_REPOSITORY_URL || process.env.HERMES_MOBILE_HERMES_AGENT_REPOSITORY_URL || "",
    hermesAgentRef: process.env.HOMEAI_HERMES_AGENT_REF || process.env.HERMES_MOBILE_HERMES_AGENT_REF || "main",
    baseUrl: process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    nodeCommand: process.env.HOMEAI_NODE || process.execPath || "node",
    npmCommand: process.env.HOMEAI_NPM || "npm",
    pythonCommand: process.env.HOMEAI_PYTHON || process.env.PYTHON || "python3",
    reason: "public-upgrade",
    timeoutMs: 30000,
    execute: false,
    json: false,
    cloneMissingPlugins: false,
    adoptNonGitSources: false,
    updateHermesAgent: false,
    installDependencies: false,
    installHermesAgentDependencies: false,
    forceDeploy: false,
    forceClosureValidation: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = clean(argv[++index] || out.root);
    else if (arg === "--app" || arg === "--app-path") out.appPath = clean(argv[++index] || "");
    else if (arg === "--plugin-root") out.pluginRoot = clean(argv[++index] || "");
    else if (arg === "--runtime-root") out.runtimeRoot = clean(argv[++index] || "");
    else if (arg === "--manifest") out.manifestPath = clean(argv[++index] || "");
    else if (arg === "--hermes-agent-source") out.hermesAgentSource = clean(argv[++index] || "");
    else if (arg === "--hermes-agent-repository-url") out.hermesAgentRepositoryUrl = clean(argv[++index] || "");
    else if (arg === "--hermes-agent-ref") out.hermesAgentRef = clean(argv[++index] || "main", 120);
    else if (arg === "--node-command") out.nodeCommand = clean(argv[++index] || out.nodeCommand);
    else if (arg === "--npm-command") out.npmCommand = clean(argv[++index] || out.npmCommand);
    else if (arg === "--python-command") out.pythonCommand = clean(argv[++index] || out.pythonCommand);
    else if (arg === "--base") out.baseUrl = clean(argv[++index] || out.baseUrl);
    else if (arg === "--reason") out.reason = clean(argv[++index] || out.reason, 120);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--clone-missing-plugins") out.cloneMissingPlugins = true;
    else if (arg === "--adopt-non-git-sources") out.adoptNonGitSources = true;
    else if (arg === "--update-hermes-agent") out.updateHermesAgent = true;
    else if (arg === "--install-dependencies") out.installDependencies = true;
    else if (arg === "--install-hermes-agent-dependencies") out.installHermesAgentDependencies = true;
    else if (arg === "--force-deploy") out.forceDeploy = true;
    else if (arg === "--force-closure-validation") out.forceClosureValidation = true;
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
    "Usage: node scripts/homeai-public-upgrade.js [options]",
    "",
    "Default mode is plan-only. Add --execute to mutate sources/deploy.",
    "",
    "Options:",
    "  --root <path>                         Production root, default /Users/example/path",
    "  --app <path>                          Home AI app source path override.",
    "  --plugin-root <path>                  Plugin source root override.",
    "  --runtime-root <path>                 Runtime root override.",
    "  --manifest <path>                     Public plugin source manifest override.",
    "  --base <url>                          Production base for closure validation.",
    "  --reason <slug>                       Deployment reason slug.",
    "  --clone-missing-plugins               Clone missing manifest plugin sources.",
    "  --adopt-non-git-sources              Adopt present public-export/bundle source dirs as Git checkouts.",
    "  --update-hermes-agent                 Fast-forward Hermes Agent official runtime source.",
    "  --hermes-agent-source <path>          Hermes Agent source checkout path.",
    "  --hermes-agent-repository-url <url>   Hermes Agent upstream repository URL.",
    "  --hermes-agent-ref <ref>              Hermes Agent branch, default main.",
    "  --node-command <path|name>            Node command used to repair the official Hermes Agent runtime.",
    "  --npm-command <path|name>             npm command used to repair the official Hermes Agent runtime.",
    "  --python-command <path|name>          Python 3.12+ command used to repair the official Hermes Agent runtime.",
    "  --install-dependencies                Run npm ci when source dependency files changed.",
    "  --install-hermes-agent-dependencies   Run python -m pip install -e for Hermes Agent.",
    "  --force-deploy                        Deploy Home AI even when source did not update.",
    "  --force-closure-validation            Run provider/profile closure validation even with no updates.",
    "  --execute                             Execute the upgrade plan.",
    "  --json                                Print JSON output.",
  ].join("\n"));
}

function serviceOptions(options) {
  return {
    root: options.root,
    appPath: options.appPath || undefined,
    pluginRoot: options.pluginRoot || undefined,
    runtimeRoot: options.runtimeRoot || undefined,
    manifestPath: options.manifestPath || undefined,
    hermesAgentSource: options.hermesAgentSource || undefined,
    hermesAgentRepositoryUrl: options.hermesAgentRepositoryUrl || undefined,
    hermesAgentRef: options.hermesAgentRef || undefined,
    installerNodeCommand: options.nodeCommand || undefined,
    npmCommand: options.npmCommand || undefined,
    pythonCommand: options.pythonCommand || undefined,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
  };
}

function executionOptions(options) {
  return {
    execute: options.execute,
    reason: options.reason,
    cloneMissingPlugins: options.cloneMissingPlugins,
    adoptNonGitSources: options.adoptNonGitSources,
    updateHermesAgent: options.updateHermesAgent,
    installDependencies: options.installDependencies,
    installHermesAgentDependencies: options.installHermesAgentDependencies,
    forceDeploy: options.forceDeploy,
    forceClosureValidation: options.forceClosureValidation,
  };
}

function renderText(report = {}) {
  const lines = [
    `ok: ${report.ok === true}`,
    `mode: ${report.mode || "plan"}`,
    `root: ${report.root || ""}`,
  ];
  if (report.generatedAt) lines.push(`generatedAt: ${report.generatedAt}`);
  if (report.startedAt) lines.push(`startedAt: ${report.startedAt}`);
  if (Number.isFinite(Number(report.actionCount))) lines.push(`actionCount: ${report.actionCount}`);
  if (Number.isFinite(Number(report.blockerCount))) lines.push(`blockerCount: ${report.blockerCount}`);
  if (Number.isFinite(Number(report.issueCount))) lines.push(`issueCount: ${report.issueCount}`);
  if (report.error) lines.push(`error: ${report.error}`);
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  if (blockers.length) {
    lines.push("blockers:");
    for (const blocker of blockers.slice(0, 20)) {
      lines.push(`- ${blocker.code}${blocker.id ? `:${blocker.id}` : ""}`);
    }
  }
  const actions = Array.isArray(report.actions) ? report.actions : [];
  if (actions.length) {
    lines.push("actions:");
    for (const action of actions.slice(0, 30)) {
      lines.push(`- ${action.type}${action.target ? `:${action.target}` : action.pluginId ? `:${action.pluginId}` : ""}`);
    }
  }
  const steps = Array.isArray(report.steps) ? report.steps : [];
  if (steps.length) {
    lines.push("steps:");
    for (const step of steps.slice(0, 30)) {
      const ok = step.result?.ok === true || step.result?.json?.ok === true;
      lines.push(`- ${step.type}${step.target ? `:${step.target}` : ""}: ${ok ? "ok" : "not_ok"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const service = createPublicUpgradeOrchestratorService(serviceOptions(args));
  const report = args.execute
    ? await service.executeUpgrade(executionOptions(args))
    : await service.buildPlan(executionOptions(args));
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
  executionOptions,
  parseArgs,
  renderText,
  serviceOptions,
};
