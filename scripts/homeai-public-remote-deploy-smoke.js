#!/usr/bin/env node
"use strict";

const {
  DEFAULT_PUBLIC_REPO_URL,
  DEFAULT_NODE_VERSION,
  buildPlan,
  runRemoteDeploySmoke,
} = require("../adapters/public-remote-deploy-smoke-service");

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv = []) {
  const out = {
    execute: false,
    json: false,
    sshTarget: process.env.HOMEAI_REMOTE_DEPLOY_SSH_TARGET || "",
    sshCommand: process.env.HOMEAI_REMOTE_DEPLOY_SSH_COMMAND || "ssh",
    sshConfig: process.env.HOMEAI_REMOTE_DEPLOY_SSH_CONFIG || "",
    identityFile: process.env.HOMEAI_REMOTE_DEPLOY_IDENTITY_FILE || "",
    port: process.env.HOMEAI_REMOTE_DEPLOY_SSH_PORT || "",
    publicRepoUrl: process.env.HOMEAI_PUBLIC_REPOSITORY_URL || DEFAULT_PUBLIC_REPO_URL,
    nodeVersion: process.env.HOMEAI_REMOTE_DEPLOY_NODE_VERSION || DEFAULT_NODE_VERSION,
    remoteRoot: process.env.HOMEAI_REMOTE_DEPLOY_ROOT || "",
    productionRoot: process.env.HOMEAI_REMOTE_PRODUCTION_ROOT || "",
    sudoPasswordFile: process.env.HOMEAI_REMOTE_DEPLOY_SUDO_PASSWORD_FILE || "",
    timeoutMs: 180000,
    connectTimeoutSeconds: 15,
    keepRemoteTemp: false,
    runGuidedInstall: false,
    cycleInstall: false,
    executeProductionUpgrade: false,
    reason: "public-remote-deploy-smoke",
    sshOptions: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--ssh-target" || arg === "--target") out.sshTarget = clean(argv[++index] || "");
    else if (arg === "--ssh-command") out.sshCommand = clean(argv[++index] || "ssh", 200);
    else if (arg === "--ssh-config") out.sshConfig = clean(argv[++index] || "", 400);
    else if (arg === "--identity-file" || arg === "--ssh-key") out.identityFile = clean(argv[++index] || "", 400);
    else if (arg === "--port") out.port = clean(argv[++index] || "", 20);
    else if (arg === "--ssh-option") out.sshOptions.push(clean(argv[++index] || "", 200));
    else if (arg === "--public-repo-url" || arg === "--repo") out.publicRepoUrl = clean(argv[++index] || DEFAULT_PUBLIC_REPO_URL, 500);
    else if (arg === "--node-version") out.nodeVersion = clean(argv[++index] || DEFAULT_NODE_VERSION, 40);
    else if (arg === "--remote-root") out.remoteRoot = clean(argv[++index] || "", 300);
    else if (arg === "--production-root") out.productionRoot = clean(argv[++index] || "", 300);
    else if (arg === "--sudo-password-file") out.sudoPasswordFile = clean(argv[++index] || "", 500);
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--connect-timeout-seconds") out.connectTimeoutSeconds = Number(argv[++index] || out.connectTimeoutSeconds);
    else if (arg === "--keep-remote-temp") out.keepRemoteTemp = true;
    else if (arg === "--run-guided-install") out.runGuidedInstall = true;
    else if (arg === "--cycle-install") out.cycleInstall = true;
    else if (arg === "--execute-production-upgrade") out.executeProductionUpgrade = true;
    else if (arg === "--reason") out.reason = clean(argv[++index] || out.reason, 120);
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000) out.timeoutMs = 180000;
  if (!Number.isFinite(out.connectTimeoutSeconds) || out.connectTimeoutSeconds < 1) out.connectTimeoutSeconds = 15;
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/homeai-public-remote-deploy-smoke.js [options]",
    "",
    "Default mode is plan-only. Add --execute to run bounded remote smoke checks over SSH.",
    "",
    "Remote smoke steps:",
    "  1. probe remote macOS/tool availability;",
    "  2. clone the published Home AI public repository into a remote /tmp root;",
    "  3. run public source preflight;",
    "  4. run macOS fresh-install rehearsal in a remote sandbox root;",
    "  5. run public upgrade rehearsal.",
    "  Add --cycle-install to run sandbox install, delete the sandbox target root, then reinstall.",
    "",
    "Options:",
    "  --ssh-target <target>              SSH target or alias. Required with --execute.",
    "  --identity-file <path>             Optional SSH identity file.",
    "  --ssh-config <path>                Optional SSH config file.",
    "  --port <port>                      Optional SSH port.",
    "  --ssh-option <arg>                 Extra single SSH argument, repeatable.",
    "  --public-repo-url <url>            Public repo URL, default Home-AI-Public HTTPS.",
    "  --node-version <version>           Node runtime version for temp bootstrap, default current Home AI runtime.",
    "  --remote-root <path>               Remote temp root. Must be /tmp or /var/tmp homeai-public-remote-deploy-smoke-*.",
    "  --run-guided-install               Also run installer --guided in the remote sandbox root.",
    "  --cycle-install                    Run sandbox guided install, delete sandbox target root, then reinstall.",
    "  --execute-production-upgrade        Also run upgrade:public --execute on --production-root.",
    "  --production-root <path>            Required with --execute-production-upgrade.",
    "  --sudo-password-file <path>         Optional local sudo password file copied to remote temp root for production upgrade.",
    "  --keep-remote-temp                 Keep the remote temp root for inspection.",
    "  --reason <slug>                    Production upgrade reason if explicitly executed.",
    "  --json                            Print JSON.",
  ].join("\n"));
}

function renderText(report = {}) {
  const lines = [
    `ok: ${report.ok === true}`,
    `mode: ${report.mode || "plan"}`,
    `sshTarget: ${report.sshTarget || ""}`,
    `remoteRoot: ${report.remoteRoot || ""}`,
    `actionCount: ${Number(report.actionCount || 0)}`,
  ];
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  if (blockers.length) {
    lines.push("blockers:");
    for (const blocker of blockers) lines.push(`- ${blocker.code || "unknown"}`);
  }
  const actions = Array.isArray(report.actions) ? report.actions : [];
  if (actions.length) {
    lines.push("actions:");
    for (const action of actions) lines.push(`- ${action.type || ""}`);
  }
  const steps = Array.isArray(report.steps) ? report.steps : [];
  if (steps.length) {
    lines.push("steps:");
    for (const step of steps) lines.push(`- ${step.type}: ${step.ok === true && step.summary?.ok !== false ? "ok" : "not_ok"}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = args.execute ? await runRemoteDeploySmoke(args) : buildPlan(args);
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderText(report));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: clean(error?.message || error, 500) })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  renderText,
};
