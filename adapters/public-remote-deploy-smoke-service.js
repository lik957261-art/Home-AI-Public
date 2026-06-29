"use strict";

const { execFile } = require("node:child_process");

const DEFAULT_PUBLIC_REPO_URL = "https://github.com/pentiumxp/Home-AI-Public.git";
const DEFAULT_TIMEOUT_MS = 180000;

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function boundedOutput(value, max = 2000) {
  return clean(value, max)
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/(key|token|secret|password)[=:][^\s]+/gi, "$1=[redacted]");
}

function shellQuote(value) {
  return `'${String(value == null ? "" : value).replace(/'/g, `'\\''`)}'`;
}

function safeRemoteTempRoot(value, stamp) {
  const raw = clean(value, 300);
  if (!raw) return `/tmp/homeai-public-remote-deploy-smoke-${stamp}`;
  if (/^\/(?:tmp|var\/tmp)\/homeai-public-remote-deploy-smoke-[A-Za-z0-9._-]+$/.test(raw)) return raw;
  return "";
}

function defaultRunProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      env: options.env || process.env,
      maxBuffer: options.maxBuffer || 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        status: typeof error?.code === "number" ? error.code : (error ? 1 : 0),
        stdout: String(stdout || ""),
        stderr: String(stderr || error?.message || ""),
      });
    });
  });
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (_) {
    return null;
  }
}

function keyValueSummary(stdout) {
  const out = {};
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function summarizeStep(type, result = {}) {
  const json = parseJsonOutput(result.stdout);
  if (type === "remote-system-probe") {
    const fields = keyValueSummary(result.stdout);
    const required = ["git", "node", "npm", "bash"];
    const missingTools = required.filter((tool) => !fields[tool]);
    return {
      ok: result.ok === true && missingTools.length === 0,
      uname: fields.uname || "",
      arch: fields.arch || "",
      missingTools,
    };
  }
  if (!json) return { ok: result.ok === true, jsonParsed: false };
  if (type === "public-source-preflight") {
    return {
      ok: json.ok === true,
      issueCount: Array.isArray(json.issues) ? json.issues.length : Number(json.issueCount || 0),
      requiredPluginCount: Number(json.requiredPluginCount || 0),
    };
  }
  if (type === "macos-fresh-install-rehearsal") {
    const missingArtifacts = Array.isArray(json.artifacts)
      ? json.artifacts.filter((artifact) => artifact && artifact.exists !== true).length
      : 0;
    return {
      ok: json.ok === true,
      phaseCount: Number(json.phaseCount || 0),
      missingArtifactCount: missingArtifacts,
      issueCount: Array.isArray(json.issues) ? json.issues.length : 0,
    };
  }
  if (type === "macos-guided-install-sandbox") {
    return {
      ok: json.ok === true,
      guidedExecutedCount: Number(json.guidedExecutedCount || json.execution?.guidedExecutedCount || 0),
      issueCount: Array.isArray(json.issues) ? json.issues.length : Number(json.issueCount || 0),
    };
  }
  if (type === "public-upgrade-rehearsal") {
    const cloneGate = Array.isArray(json.steps)
      ? json.steps.find((step) => step && step.type === "validate-operator-clone-gate-plan")
      : null;
    return {
      ok: json.ok === true,
      stepCount: Number(json.stepCount || 0),
      tempRemoved: json.tempRemoved === true,
      pluginCount: Number(cloneGate?.detail?.pluginCount || 0),
      cloneActionCount: Number(cloneGate?.detail?.cloneActionCount || 0),
      deployActionCount: Number(cloneGate?.detail?.deployActionCount || 0),
      movieOperatorAuthenticated: cloneGate?.detail?.movieOperatorAuthenticated === true,
    };
  }
  if (type === "public-production-upgrade") {
    return {
      ok: json.ok === true,
      mode: clean(json.mode, 40),
      actionCount: Number(json.actionCount || 0),
      issueCount: Number(json.issueCount || 0),
      blockerCount: Number(json.blockerCount || 0),
    };
  }
  return { ok: json.ok === true, jsonParsed: true };
}

function buildSshArgs(options = {}, remoteCommand) {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${Math.max(1, Number(options.connectTimeoutSeconds || 15) || 15)}`];
  if (options.sshConfig) args.push("-F", options.sshConfig);
  if (options.identityFile) args.push("-i", options.identityFile);
  if (options.port) args.push("-p", String(options.port));
  for (const item of options.sshOptions || []) {
    args.push(item);
  }
  args.push(options.sshTarget, remoteCommand);
  return args;
}

function remoteShell(script) {
  return `/bin/sh -lc ${shellQuote(script)}`;
}

function buildRemoteSteps(plan = {}) {
  const appPath = `${plan.remoteRoot}/Home-AI-Public`;
  const targetRoot = `${plan.remoteRoot}/target-root`;
  const steps = [
    {
      type: "remote-system-probe",
      script: [
        "set +e",
        "printf 'uname=%s\\n' \"$(/usr/bin/uname -s 2>/dev/null || uname -s 2>/dev/null)\"",
        "printf 'arch=%s\\n' \"$(/usr/bin/uname -m 2>/dev/null || uname -m 2>/dev/null)\"",
        "missing=0",
        "for tool in git node npm bash; do path=\"$(command -v \"$tool\" 2>/dev/null)\"; printf '%s=%s\\n' \"$tool\" \"$path\"; [ -n \"$path\" ] || missing=1; done",
        "exit \"$missing\"",
      ].join("\n"),
    },
    {
      type: "prepare-remote-root",
      script: `rm -rf ${shellQuote(plan.remoteRoot)} && mkdir -p ${shellQuote(plan.remoteRoot)}`,
    },
    {
      type: "clone-public-repo",
      script: `git clone --depth 1 ${shellQuote(plan.publicRepoUrl)} ${shellQuote(appPath)}`,
    },
    {
      type: "public-source-preflight",
      script: `cd ${shellQuote(appPath)} && node scripts/public-install-preflight.js --source-only --json`,
    },
    {
      type: "macos-fresh-install-rehearsal",
      script: `cd ${shellQuote(appPath)} && node scripts/macos-fresh-install-rehearsal.js --root ${shellQuote(targetRoot)} --json`,
    },
  ];
  if (plan.runGuidedInstall) {
    steps.push({
      type: "macos-guided-install-sandbox",
      script: `cd ${shellQuote(appPath)} && bash scripts/install-macos-production.sh --execute --guided --root ${shellQuote(targetRoot)} --json`,
    });
  }
  steps.push({
    type: "public-upgrade-rehearsal",
    script: `cd ${shellQuote(appPath)} && npm run --silent rehearse:public-upgrade -- --execute --json`,
  });
  if (plan.executeProductionUpgrade) {
    steps.push({
      type: "public-production-upgrade",
      script: [
        `cd ${shellQuote(appPath)}`,
        "npm run --silent upgrade:public --",
        `--root ${shellQuote(plan.productionRoot)}`,
        `--app ${shellQuote(appPath)}`,
        "--execute",
        "--clone-missing-plugins",
        "--force-closure-validation",
        `--reason ${shellQuote(plan.reason)}`,
        "--json",
      ].join(" "),
    });
  }
  return steps;
}

function buildPlan(options = {}) {
  const stamp = clean(options.stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), 40);
  const remoteRoot = safeRemoteTempRoot(options.remoteRoot, stamp);
  const blockers = [];
  if (!remoteRoot) blockers.push({ code: "remote_temp_root_invalid" });
  if (options.execute && !clean(options.sshTarget)) blockers.push({ code: "ssh_target_required" });
  if (options.executeProductionUpgrade && !clean(options.productionRoot)) blockers.push({ code: "production_root_required_for_upgrade_execute" });
  if (options.executeProductionUpgrade && !options.execute) blockers.push({ code: "execute_required_for_upgrade_execute" });
  const plan = {
    ok: blockers.length === 0,
    schemaVersion: 1,
    mode: options.execute ? "execute" : "plan",
    generatedAt: new Date().toISOString(),
    sshTarget: clean(options.sshTarget, 240),
    publicRepoUrl: clean(options.publicRepoUrl || DEFAULT_PUBLIC_REPO_URL, 500),
    remoteRoot,
    appPath: remoteRoot ? `${remoteRoot}/Home-AI-Public` : "",
    targetRoot: remoteRoot ? `${remoteRoot}/target-root` : "",
    productionRoot: clean(options.productionRoot, 300),
    runGuidedInstall: bool(options.runGuidedInstall),
    executeProductionUpgrade: bool(options.executeProductionUpgrade),
    keepRemoteTemp: bool(options.keepRemoteTemp),
    reason: clean(options.reason || "public-remote-deploy-smoke", 120),
    blockers,
  };
  plan.actions = remoteRoot ? buildRemoteSteps(plan).map((step) => ({ type: step.type })) : [];
  plan.actionCount = plan.actions.length;
  return plan;
}

async function runRemoteStep(step, options, runProcess) {
  const remoteCommand = remoteShell(step.script);
  const result = await runProcess(options.sshCommand || "ssh", buildSshArgs(options, remoteCommand), {
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  const normalized = {
    ok: result.ok === true || result.status === 0,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: boundedOutput(result.stdout, 8000),
    stderr: boundedOutput(result.stderr || result.error, 2000),
  };
  return {
    type: step.type,
    ok: normalized.ok,
    status: normalized.status,
    summary: summarizeStep(step.type, normalized),
    error: normalized.ok ? "" : (normalized.stderr || `remote_step_failed:${step.type}`),
  };
}

async function runRemoteDeploySmoke(options = {}, deps = {}) {
  const runProcess = deps.runProcess || defaultRunProcess;
  const plan = buildPlan(options);
  if (!options.execute || !plan.ok) return plan;

  const steps = [];
  const remoteSteps = buildRemoteSteps(plan);
  let ok = true;
  for (const step of remoteSteps) {
    const result = await runRemoteStep(step, { ...options, sshTarget: plan.sshTarget }, runProcess);
    steps.push(result);
    if (!result.ok || result.summary?.ok === false) {
      ok = false;
      break;
    }
  }
  let cleanup = { attempted: false, ok: true };
  if (!options.keepRemoteTemp && plan.remoteRoot) {
    const cleanupResult = await runRemoteStep({
      type: "cleanup-remote-root",
      script: `rm -rf ${shellQuote(plan.remoteRoot)}`,
    }, { ...options, sshTarget: plan.sshTarget }, runProcess);
    cleanup = { attempted: true, ok: cleanupResult.ok, status: cleanupResult.status };
    if (!cleanup.ok) ok = false;
  }
  return {
    ...plan,
    ok,
    completedAt: new Date().toISOString(),
    stepCount: steps.length,
    steps,
    cleanup,
  };
}

module.exports = {
  DEFAULT_PUBLIC_REPO_URL,
  buildPlan,
  buildRemoteSteps,
  buildSshArgs,
  runRemoteDeploySmoke,
  safeRemoteTempRoot,
  shellQuote,
  summarizeStep,
};
