"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const DEFAULT_PUBLIC_REPO_URL = "https://github.com/pentiumxp/Home-AI-Public.git";
const DEFAULT_TIMEOUT_MS = 30000;

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeRun(result = {}) {
  const normalized = {
    ok: result.ok === true || result.status === 0,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: clean(result.stdout, 12000),
    stderr: clean(result.stderr || result.error, 2000),
  };
  Object.defineProperty(normalized, "rawStdout", {
    value: String(result.rawStdout || result.stdout || ""),
    enumerable: false,
  });
  return normalized;
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
        status: typeof error?.code === "number" ? error.code : 0,
        stdout: clean(stdout, 12000),
        rawStdout: String(stdout || ""),
        stderr: clean(stderr || error?.message || "", 2000),
      });
    });
  });
}

function parseJsonOutput(result = {}) {
  const stdout = String(result.rawStdout || result.stdout || "");
  const start = stdout.search(/[\[{]/);
  if (start < 0) return null;
  const candidate = stdout.slice(start);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

function defaultRehearsalRoot() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return path.join(os.tmpdir(), `Home-AI-Public-upgrade-rehearsal-${stamp}`);
}

function safeResetDir(targetPath) {
  const resolved = path.resolve(targetPath);
  const basename = path.basename(resolved).toLowerCase();
  const forbidden = new Set([
    path.parse(resolved).root,
    os.homedir(),
  ].map((item) => path.resolve(item)));
  if (forbidden.has(resolved) || !basename.includes("home-ai-public-upgrade-rehearsal")) {
    throw new Error(`unsafe_rehearsal_root:${resolved}`);
  }
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function writePlaceholderExecutable(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "#!/bin/sh\nexit 0\n", "utf8");
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (_) {}
}

function commandLabel(command, args = []) {
  return [command, ...args].join(" ");
}

function compactRunResult(result = {}, stdoutMax = 1000, stderrMax = 500) {
  return {
    ok: result.ok === true,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: clean(result.stdout, stdoutMax),
    stderr: clean(result.stderr, stderrMax),
  };
}

function summarizeUpgradePlan(report = {}) {
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const plugins = Array.isArray(report.plugins) ? report.plugins : [];
  const actions = Array.isArray(report.actions) ? report.actions : [];
  return {
    ok: report.ok === true,
    issueCount: issues.length,
    blockerCount: blockers.length,
    actionCount: actions.length,
    pluginCount: plugins.length,
    missingSourceBlockerCount: blockers.filter((item) => item.code === "plugin_source_missing_requires_clone_missing_plugins").length,
    cloneActionCount: actions.filter((item) => item.type === "clone-plugin-source").length,
    deployActionCount: actions.filter((item) => item.type === "deploy" && item.pluginId).length,
    movieOperatorAuthenticated: plugins.some((item) => item.id === "movie" && item.operatorAuthenticated === true),
    closureValidationPresent: actions.some((item) => item.type === "closure-validation"),
    rawSecretsInOutput: report.policy?.rawSecretsInOutput === false ? false : undefined,
  };
}

function createPublicUpgradeRehearsalService(options = {}) {
  const runProcess = options.runProcess || defaultRunProcess;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const gitCommand = options.gitCommand || "git";
  const nodeCommand = options.nodeCommand || process.execPath;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  function paths(input = {}) {
    const rehearsalRoot = path.resolve(input.rehearsalRoot || defaultRehearsalRoot());
    const appPath = path.join(rehearsalRoot, "app");
    const targetRoot = path.join(rehearsalRoot, "target-root");
    const pluginRoot = path.join(targetRoot, "plugins");
    const runtimeRoot = path.join(targetRoot, "runtime");
    const hermesAgentSource = path.join(runtimeRoot, "hermes-agent-official", "source");
    const hermesAgentPython = path.join(runtimeRoot, "hermes-agent-official", "venv", "bin", "python");
    return {
      rehearsalRoot,
      appPath,
      targetRoot,
      pluginRoot,
      runtimeRoot,
      manifestPath: path.join(appPath, "config", "public-plugin-sources.json"),
      hermesAgentSource,
      hermesAgentPython,
    };
  }

  function buildPlan(planOptions = {}) {
    const resolved = paths(planOptions);
    const publicRepoUrl = clean(planOptions.publicRepoUrl || DEFAULT_PUBLIC_REPO_URL, 500);
    const actions = [
      {
        type: "clone-public-home-ai",
        command: commandLabel(gitCommand, ["clone", "--depth", "1", publicRepoUrl, resolved.appPath]),
      },
      {
        type: "seed-target-runtime-placeholder",
        path: resolved.hermesAgentPython,
      },
      {
        type: "public-source-preflight",
        command: commandLabel(nodeCommand, ["scripts/public-install-preflight.js", "--source-only", "--json"]),
      },
      {
        type: "upgrade-plan-missing-sources-fail-closed",
        command: commandLabel(nodeCommand, upgradeArgs(resolved, planOptions, { cloneMissingPlugins: false })),
      },
      {
        type: "upgrade-plan-with-operator-clone-gate",
        command: commandLabel(nodeCommand, upgradeArgs(resolved, planOptions, { cloneMissingPlugins: true })),
      },
    ];
    return {
      ok: true,
      schemaVersion: 1,
      mode: planOptions.execute ? "execute" : "plan",
      generatedAt: nowIso(),
      publicRepoUrl,
      keepTemp: planOptions.keepTemp === true,
      paths: resolved,
      actionCount: actions.length,
      actions,
      policy: {
        productionWrites: false,
        tempRootOnly: true,
        missingPluginSourcesMustFailClosed: true,
        cloneMissingPluginsRequiresExplicitGate: true,
        rawSecretsInOutput: false,
      },
    };
  }

  function upgradeArgs(resolved, options = {}, gates = {}) {
    const args = [
      "scripts/homeai-public-upgrade.js",
      "--json",
      "--root",
      resolved.targetRoot,
      "--app",
      resolved.appPath,
      "--plugin-root",
      resolved.pluginRoot,
      "--runtime-root",
      resolved.runtimeRoot,
      "--manifest",
      resolved.manifestPath,
      "--hermes-agent-source",
      resolved.hermesAgentSource,
      "--hermes-agent-repository-url",
      clean(options.hermesAgentRepositoryUrl || "", 500),
      "--hermes-agent-ref",
      clean(options.hermesAgentRef || "main", 120),
      "--base",
      clean(options.baseUrl || "http://127.0.0.1:8797", 300),
      "--reason",
      clean(options.reason || "public-upgrade-rehearsal", 120),
    ];
    if (gates.cloneMissingPlugins) args.push("--clone-missing-plugins");
    return args;
  }

  async function run(command, args = [], runOptions = {}) {
    return normalizeRun(await runProcess(command, args, {
      cwd: runOptions.cwd || process.cwd(),
      timeoutMs: runOptions.timeoutMs || timeoutMs,
    }));
  }

  async function executeRehearsal(executeOptions = {}) {
    const startedAt = nowIso();
    const plan = buildPlan(Object.assign({}, executeOptions, { execute: true }));
    const resolved = plan.paths;
    const steps = [];
    try {
      safeResetDir(resolved.rehearsalRoot);
      const clone = await run(gitCommand, ["clone", "--depth", "1", plan.publicRepoUrl, resolved.appPath], {
        cwd: resolved.rehearsalRoot,
        timeoutMs: timeoutMs * 4,
      });
      steps.push({ type: "clone-public-home-ai", result: compactRunResult(clone, 400, 400) });
      if (!clone.ok) return fail(plan, steps, "public_repo_clone_failed");

      writePlaceholderExecutable(resolved.hermesAgentPython);
      steps.push({ type: "seed-target-runtime-placeholder", ok: true, path: resolved.hermesAgentPython });

      const preflight = await run(nodeCommand, ["scripts/public-install-preflight.js", "--source-only", "--json"], {
        cwd: resolved.appPath,
        timeoutMs: timeoutMs * 4,
      });
      const preflightJson = parseJsonOutput(preflight);
      steps.push({
        type: "public-source-preflight",
        result: compactRunResult(preflight),
        summary: {
          ok: preflightJson?.ok === true,
          issueCount: Array.isArray(preflightJson?.issues) ? preflightJson.issues.length : null,
          requiredPluginCount: preflightJson?.requiredPluginCount || null,
        },
      });
      if (!preflight.ok || preflightJson?.ok !== true) return fail(plan, steps, "public_source_preflight_failed");

      const blocked = await run(nodeCommand, upgradeArgs(resolved, executeOptions, { cloneMissingPlugins: false }), {
        cwd: resolved.appPath,
        timeoutMs: timeoutMs * 4,
      });
      const blockedJson = parseJsonOutput(blocked);
      steps.push({
        type: "upgrade-plan-missing-sources-fail-closed",
        result: compactRunResult(blocked, 0, 300),
        summary: summarizeUpgradePlan(blockedJson || {}),
      });
      const blockedCheck = validateExpectedMissingSourcePlan(blockedJson);
      steps.push({ type: "validate-missing-source-fail-closed", ok: blockedCheck.ok, detail: blockedCheck });
      if (!blockedCheck.ok) return fail(plan, steps, "missing_source_fail_closed_validation_failed");

      const operatorPlan = await run(nodeCommand, upgradeArgs(resolved, executeOptions, { cloneMissingPlugins: true }), {
        cwd: resolved.appPath,
        timeoutMs: timeoutMs * 4,
      });
      const operatorJson = parseJsonOutput(operatorPlan);
      steps.push({
        type: "upgrade-plan-with-operator-clone-gate",
        result: compactRunResult(operatorPlan, 0, 300),
        summary: summarizeUpgradePlan(operatorJson || {}),
      });
      const operatorCheck = validateOperatorCloneGatePlan(operatorJson);
      steps.push({ type: "validate-operator-clone-gate-plan", ok: operatorCheck.ok, detail: operatorCheck });
      if (!operatorCheck.ok) return fail(plan, steps, "operator_clone_gate_plan_validation_failed");

      const completed = {
        ok: true,
        schemaVersion: 1,
        mode: "execute",
        startedAt,
        completedAt: nowIso(),
        publicRepoUrl: plan.publicRepoUrl,
        tempRemoved: false,
        paths: resolved,
        stepCount: steps.length,
        steps,
      };
      if (!executeOptions.keepTemp) {
        fs.rmSync(resolved.rehearsalRoot, { recursive: true, force: true });
        completed.tempRemoved = true;
      }
      return completed;
    } catch (err) {
      return fail(plan, steps, clean(err?.message || err, 500));
    }
  }

  function validateExpectedMissingSourcePlan(report = {}) {
    const blockers = Array.isArray(report?.blockers) ? report.blockers : [];
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const pluginRows = Array.isArray(report?.plugins) ? report.plugins : [];
    const missingSourceBlockers = blockers.filter((item) => item.code === "plugin_source_missing_requires_clone_missing_plugins");
    return {
      ok: report?.ok === false && issues.length === 0 && missingSourceBlockers.length > 0,
      reportOk: report?.ok === true,
      issueCount: issues.length,
      missingSourceBlockerCount: missingSourceBlockers.length,
      pluginCount: pluginRows.length,
      hasMovieOperatorAuthBlocker: blockers.some((item) => item.code === "operator_authenticated_plugin_source_missing" && item.id === "movie"),
    };
  }

  function validateOperatorCloneGatePlan(report = {}) {
    const actions = Array.isArray(report?.actions) ? report.actions : [];
    const plugins = Array.isArray(report?.plugins) ? report.plugins : [];
    const cloneActions = actions.filter((item) => item.type === "clone-plugin-source");
    const deployActions = actions.filter((item) => item.type === "deploy" && item.pluginId);
    const movie = plugins.find((item) => item.id === "movie");
    return {
      ok: report?.ok === true
        && cloneActions.length > 0
        && deployActions.length > 0
        && actions.some((item) => item.type === "closure-validation")
        && report?.policy?.rawSecretsInOutput === false
        && movie?.operatorAuthenticated === true,
      reportOk: report?.ok === true,
      cloneActionCount: cloneActions.length,
      deployActionCount: deployActions.length,
      pluginCount: plugins.length,
      movieOperatorAuthenticated: movie?.operatorAuthenticated === true,
      closureValidationPresent: actions.some((item) => item.type === "closure-validation"),
    };
  }

  function fail(plan, steps, error) {
    return {
      ok: false,
      schemaVersion: 1,
      mode: "execute",
      error,
      publicRepoUrl: plan.publicRepoUrl,
      paths: plan.paths,
      stepCount: steps.length,
      steps,
    };
  }

  return Object.freeze({
    buildPlan,
    executeRehearsal,
    validateExpectedMissingSourcePlan,
    validateOperatorCloneGatePlan,
  });
}

module.exports = {
  DEFAULT_PUBLIC_REPO_URL,
  createPublicUpgradeRehearsalService,
};
