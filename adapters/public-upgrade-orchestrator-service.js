"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_BRANCH = "main";
const DEFAULT_TIMEOUT_MS = 30000;

function cleanString(value, max = 400) {
  return String(value || "").trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePluginId(value = "") {
  const text = cleanString(value, 120).toLowerCase();
  if (text === "health") return "healthy";
  return text;
}

function targetPluginId(value = "") {
  const text = cleanString(value, 120).toLowerCase();
  return text === "healthy" ? "health" : text;
}

function safeSlug(value = "upgrade") {
  return cleanString(value, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upgrade";
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function dirExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch (_) {
    return false;
  }
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
        stdout: cleanString(stdout, 8000),
        stderr: cleanString(stderr || error?.message || "", 2000),
      });
    });
  });
}

function normalizeRun(result = {}) {
  return {
    ok: result.ok === true || result.status === 0,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: cleanString(result.stdout, 8000),
    stderr: cleanString(result.stderr || result.error, 2000),
  };
}

function gitStatusSummary(result = {}) {
  const text = cleanString(result.stdout, 1200);
  return text ? text.split(/\r?\n/).filter(Boolean).slice(0, 40) : [];
}

function parseRemoteCommit(stdout = "") {
  return cleanString(stdout, 400).split(/\s+/)[0] || "";
}

function hasDependencyFile(paths = []) {
  return paths.some((item) => /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pyproject\.toml|requirements[^/]*\.txt|uv\.lock|poetry\.lock)$/i.test(item));
}

function hasPackageLock(targetPath) {
  return fileExists(path.join(targetPath, "package-lock.json"));
}

function createPublicUpgradeOrchestratorService(options = {}) {
  const pathApi = options.path || path;
  const fsApi = options.fs || fs;
  const runProcess = options.runProcess || defaultRunProcess;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const root = pathApi.resolve(options.root || process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT);
  const appPath = pathApi.resolve(options.appPath || pathApi.join(root, "app"));
  const pluginRoot = pathApi.resolve(options.pluginRoot || pathApi.join(root, "plugins"));
  const runtimeRoot = pathApi.resolve(options.runtimeRoot || pathApi.join(root, "runtime"));
  const nodePath = pathApi.resolve(options.nodePath || pathApi.join(runtimeRoot, "node-current", "bin", "node"));
  const npmCommand = options.npmCommand || process.env.HOMEAI_NPM || "npm";
  const gitCommand = options.gitCommand || process.env.HOMEAI_GIT || "git";
  const manifestPath = pathApi.resolve(options.manifestPath || pathApi.join(appPath, "config", "public-plugin-sources.json"));
  const homeAiRepositoryUrl = cleanString(options.homeAiRepositoryUrl || process.env.HOMEAI_PUBLIC_REPOSITORY_URL || "", 500);
  const hermesAgentSource = pathApi.resolve(options.hermesAgentSource || pathApi.join(runtimeRoot, "hermes-agent-official", "source"));
  const hermesAgentPython = pathApi.resolve(options.hermesAgentPython || pathApi.join(runtimeRoot, "hermes-agent-official", "venv", "bin", "python"));
  const hermesAgentRepositoryUrl = cleanString(options.hermesAgentRepositoryUrl || process.env.HOMEAI_HERMES_AGENT_REPOSITORY_URL || process.env.HERMES_MOBILE_HERMES_AGENT_REPOSITORY_URL || "");
  const hermesAgentRef = cleanString(options.hermesAgentRef || process.env.HOMEAI_HERMES_AGENT_REF || process.env.HERMES_MOBILE_HERMES_AGENT_REF || DEFAULT_BRANCH) || DEFAULT_BRANCH;
  const baseUrl = cleanString(options.baseUrl || process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797", 300);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  async function runGit(args = [], runOptions = {}) {
    return normalizeRun(await runProcess(gitCommand, args, {
      cwd: runOptions.cwd || appPath,
      timeoutMs: runOptions.timeoutMs || timeoutMs,
    }));
  }

  async function repoStatus(input = {}) {
    const repoPath = pathApi.resolve(input.path || "");
    const id = cleanString(input.id, 120);
    const repositoryUrl = cleanString(input.repositoryUrl || "", 500);
    const ref = cleanString(input.ref || DEFAULT_BRANCH, 120) || DEFAULT_BRANCH;
    const base = {
      id,
      path: repoPath,
      repositoryUrl,
      ref,
      present: dirExists(repoPath),
      gitCheckout: false,
      clean: false,
      currentCommit: "",
      latestCommit: "",
      updateAvailable: false,
      canAttemptFastForward: false,
      dirtyFiles: [],
      warning: "",
    };
    if (!base.present) {
      return Object.assign(base, { warning: "source_directory_missing" });
    }
    const inside = await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: repoPath });
    if (!inside.ok || inside.stdout !== "true") {
      return Object.assign(base, { warning: "source_directory_not_git_checkout" });
    }
    const head = await runGit(["rev-parse", "HEAD"], { cwd: repoPath });
    const dirty = await runGit(["status", "--porcelain", "--untracked-files=normal"], { cwd: repoPath });
    const remote = await runGit(["ls-remote", repositoryUrl || "origin", `refs/heads/${ref}`], { cwd: repoPath });
    const latestCommit = remote.ok ? parseRemoteCommit(remote.stdout) : "";
    const currentCommit = head.ok ? cleanString(head.stdout, 120) : "";
    const dirtyFiles = dirty.ok ? gitStatusSummary(dirty) : [];
    const updateAvailable = Boolean(latestCommit && currentCommit && latestCommit !== currentCommit);
    return Object.assign(base, {
      gitCheckout: true,
      clean: dirty.ok && dirtyFiles.length === 0,
      currentCommit,
      latestCommit,
      updateAvailable,
      canAttemptFastForward: Boolean(updateAvailable && dirty.ok && dirtyFiles.length === 0),
      dirtyFiles,
      warning: remote.ok ? "" : (remote.stderr || "remote_commit_unreadable"),
    });
  }

  function manifest() {
    return readJson(manifestPath, { schemaVersion: 0, plugins: [] }) || { schemaVersion: 0, plugins: [] };
  }

  function pluginEntries() {
    const parsed = manifest();
    return Array.isArray(parsed.plugins) ? parsed.plugins : [];
  }

  function pluginPath(entry = {}) {
    return pathApi.resolve(pluginRoot, cleanString(entry.sourceDir || entry.id, 160));
  }

  async function buildPlan(planOptions = {}) {
    const parsed = manifest();
    const issues = [];
    const actions = [];
    if (parsed.schemaVersion !== 1) issues.push({ code: "public_plugin_sources_schema_version_invalid", path: manifestPath });
    if (!Array.isArray(parsed.plugins)) issues.push({ code: "public_plugin_sources_plugins_not_array", path: manifestPath });
    const homeAi = parsed.homeAi || {};
    const appRepo = await repoStatus({
      id: "home-ai",
      path: appPath,
      repositoryUrl: homeAiRepositoryUrl || homeAi.repositoryUrl || "",
      ref: homeAi.ref || DEFAULT_BRANCH,
    });
    if (appRepo.updateAvailable) actions.push({ type: "fast-forward-source", target: "home-ai", path: appPath });
    if (appRepo.updateAvailable) actions.push({ type: "deploy", target: "home-ai", command: deployCommand({ target: "home-ai", reason: planOptions.reason }) });

    const plugins = [];
    for (const entry of pluginEntries()) {
      const id = cleanString(entry.id, 120);
      const sourcePath = pluginPath(entry);
      const status = await repoStatus({
        id,
        path: sourcePath,
        repositoryUrl: entry.repositoryUrl || "",
        ref: entry.ref || DEFAULT_BRANCH,
      });
      const plugin = Object.assign({}, entry, {
        id,
        deployPlugin: normalizePluginId(id),
        sourcePath,
        operatorAuthenticated: bool(entry.operatorAuthenticated),
        status,
      });
      plugins.push(plugin);
      if (!status.present) {
        actions.push({
          type: "clone-plugin-source",
          pluginId: id,
          path: sourcePath,
          repositoryUrl: entry.repositoryUrl || "",
          ref: entry.ref || DEFAULT_BRANCH,
          requiresOption: "cloneMissingPlugins",
        });
        if (planOptions.cloneMissingPlugins) {
          actions.push({
            type: "deploy",
            target: `plugin:${id}`,
            pluginId: id,
            command: deployCommand({ pluginId: id, sourcePath, reason: planOptions.reason }),
          });
        }
      } else if (status.updateAvailable) {
        actions.push({ type: "fast-forward-source", target: `plugin:${id}`, pluginId: id, path: sourcePath });
        actions.push({
          type: "deploy",
          target: `plugin:${id}`,
          pluginId: id,
          command: deployCommand({ pluginId: id, sourcePath, reason: planOptions.reason }),
        });
      }
    }

    const hermesAgent = await repoStatus({
      id: "hermes-agent-official",
      path: hermesAgentSource,
      repositoryUrl: hermesAgentRepositoryUrl || "origin",
      ref: hermesAgentRef,
    });
    if (!fileExists(hermesAgentPython)) {
      issues.push({ code: "hermes_agent_runtime_python_missing", path: hermesAgentPython });
    }
    if (hermesAgent.updateAvailable) {
      actions.push({
        type: "fast-forward-hermes-agent",
        target: "hermes-agent-official",
        path: hermesAgentSource,
        requiresOption: "updateHermesAgent",
      });
      actions.push({
        type: "provider-profile-audit",
        command: profileAuditCommand(),
      });
    }

    actions.push({ type: "closure-validation", command: closureCommand() });

    const blockers = [];
    for (const repo of [appRepo, ...plugins.map((item) => item.status), hermesAgent]) {
      if (repo.updateAvailable && !repo.clean) blockers.push({ code: "source_dirty_blocks_fast_forward", id: repo.id, dirtyFiles: repo.dirtyFiles });
      if (repo.warning && repo.present) blockers.push({ code: repo.warning, id: repo.id });
    }
    for (const plugin of plugins) {
      if (!plugin.status.present && !planOptions.cloneMissingPlugins) {
        blockers.push({ code: "plugin_source_missing_requires_clone_missing_plugins", id: plugin.id, path: plugin.sourcePath });
      }
      if (plugin.operatorAuthenticated && !plugin.status.present && !planOptions.cloneMissingPlugins) {
        blockers.push({ code: "operator_authenticated_plugin_source_missing", id: plugin.id, repositoryUrl: plugin.repositoryUrl });
      }
    }
    if (hermesAgent.updateAvailable && !planOptions.updateHermesAgent) {
      blockers.push({ code: "hermes_agent_update_available_requires_update_hermes_agent", id: "hermes-agent-official" });
    }

    return {
      ok: blockers.length === 0 && issues.length === 0,
      schemaVersion: 1,
      mode: planOptions.execute ? "execute" : "plan",
      generatedAt: nowIso(),
      root,
      appPath,
      pluginRoot,
      manifestPath,
      baseUrl,
      homeAi: appRepo,
      plugins,
      hermesAgent: Object.assign({}, hermesAgent, {
        pythonPath: hermesAgentPython,
        providerIngress: "Hermes Agent runtime and Gateway provider profiles are validated by profile audit and closure validation",
      }),
      actionCount: actions.length,
      actions,
      issueCount: issues.length,
      issues,
      blockerCount: blockers.length,
      blockers,
      policy: {
        ownerOnly: true,
        cleanFastForwardOnly: true,
        cloneMissingPluginsRequiresOption: true,
        hermesAgentUpdateRequiresOption: true,
        deployAfterSourceUpdate: true,
        closureValidationRequired: true,
        rawSecretsInOutput: false,
      },
    };
  }

  function deployCommand(input = {}) {
    const reason = safeSlug(input.reason || `public-upgrade-${Date.now()}`);
    const args = [pathApi.join(appPath, "scripts", "deploy-macos-production.js")];
    if (input.target === "home-ai") {
      args.push("--target", "home-ai");
    } else {
      args.push("--plugin", targetPluginId(input.pluginId));
      if (input.sourcePath) args.push("--source", input.sourcePath);
    }
    args.push("--mac-root", root, "--reason", reason, "--execute", "--json");
    return [nodePath, ...args];
  }

  function profileAuditCommand() {
    return [
      nodePath,
      pathApi.join(appPath, "scripts", "macos-production-profile-audit.js"),
      "--root",
      root,
      "--expected-workspaces",
      "owner",
      "--json",
      "--no-strict",
    ];
  }

  function closureCommand() {
    return [
      nodePath,
      pathApi.join(appPath, "scripts", "macos-production-closure-validation.js"),
      "--root",
      root,
      "--base",
      baseUrl,
      "--json",
    ];
  }

  async function fastForward(repo = {}) {
    const repoPath = pathApi.resolve(repo.path || "");
    const remote = cleanString(repo.repositoryUrl || "origin", 500) || "origin";
    const ref = cleanString(repo.ref || DEFAULT_BRANCH, 120) || DEFAULT_BRANCH;
    const fetch = await runGit(["fetch", remote, ref], { cwd: repoPath, timeoutMs: timeoutMs * 2 });
    if (!fetch.ok) return { ok: false, error: fetch.stderr || "git_fetch_failed" };
    const diff = await runGit(["diff", "--name-only", "HEAD", "FETCH_HEAD"], { cwd: repoPath });
    const changedPaths = diff.ok ? cleanString(diff.stdout, 8000).split(/\r?\n/).filter(Boolean).slice(0, 400) : [];
    const ancestor = await runGit(["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"], { cwd: repoPath });
    if (!ancestor.ok) return { ok: false, error: "remote_branch_not_fast_forward", changedPaths };
    const merge = await runGit(["merge", "--ff-only", "FETCH_HEAD"], { cwd: repoPath, timeoutMs: timeoutMs * 2 });
    if (!merge.ok) return { ok: false, error: merge.stderr || "git_fast_forward_failed", changedPaths };
    return {
      ok: true,
      updated: true,
      changedPaths,
      dependencyFilesChanged: hasDependencyFile(changedPaths),
    };
  }

  async function clonePlugin(plugin = {}) {
    const target = pathApi.resolve(plugin.sourcePath || plugin.path || "");
    if (dirExists(target)) return { ok: true, skipped: true, reason: "target_exists", path: target };
    const parent = pathApi.dirname(target);
    fsApi.mkdirSync(parent, { recursive: true });
    const clone = normalizeRun(await runProcess(gitCommand, [
      "clone",
      "--branch",
      cleanString(plugin.ref || DEFAULT_BRANCH, 120) || DEFAULT_BRANCH,
      "--depth",
      "1",
      cleanString(plugin.repositoryUrl || "", 500),
      target,
    ], { cwd: parent, timeoutMs: timeoutMs * 4 }));
    return clone.ok
      ? { ok: true, path: target }
      : { ok: false, error: clone.stderr || "plugin_clone_failed", path: target };
  }

  async function runCommand(command = [], options = {}) {
    const [cmd, ...args] = command;
    if (!cmd) return { ok: false, error: "command_missing" };
    const result = normalizeRun(await runProcess(cmd, args, {
      cwd: options.cwd || appPath,
      timeoutMs: options.timeoutMs || timeoutMs * 8,
    }));
    let json = null;
    if (result.stdout && /^[\s\r\n]*[{[]/.test(result.stdout)) {
      try { json = JSON.parse(result.stdout); } catch (_) {}
    }
    return Object.assign({}, result, {
      json,
      stdout: result.stdout ? cleanString(result.stdout, 2000) : "",
      stderr: result.stderr ? cleanString(result.stderr, 1200) : "",
    });
  }

  async function installDependencies(targetPath, label) {
    const result = await runCommand([npmCommand, "ci", "--omit=dev", "--no-audit", "--no-fund"], {
      cwd: targetPath,
      timeoutMs: timeoutMs * 8,
    });
    return Object.assign({ target: label, path: targetPath }, result);
  }

  async function executeUpgrade(executeOptions = {}) {
    const startedAt = nowIso();
    const initialPlan = await buildPlan(Object.assign({}, executeOptions, { execute: true }));
    if (initialPlan.blockers.length || initialPlan.issues.length) {
      return Object.assign({}, initialPlan, {
        ok: false,
        executed: false,
        error: "upgrade_plan_blocked",
      });
    }
    const steps = [];
    const updatedPlugins = [];
    let appUpdated = false;
    let hermesAgentUpdated = false;

    if (initialPlan.homeAi.updateAvailable) {
      const update = await fastForward(initialPlan.homeAi);
      steps.push({ type: "fast-forward-source", target: "home-ai", result: update });
      if (!update.ok) return fail(initialPlan, steps, "home_ai_fast_forward_failed");
      appUpdated = true;
      if (update.dependencyFilesChanged || executeOptions.installDependencies) {
        const deps = await installDependencies(appPath, "home-ai");
        steps.push({ type: "install-dependencies", target: "home-ai", result: deps });
        if (!deps.ok) return fail(initialPlan, steps, "home_ai_dependency_install_failed");
      }
    }

    for (const plugin of initialPlan.plugins) {
      let clonedPlugin = false;
      if (!plugin.status.present && executeOptions.cloneMissingPlugins) {
        const cloned = await clonePlugin(plugin);
        steps.push({ type: "clone-plugin-source", pluginId: plugin.id, result: cloned });
        if (!cloned.ok) return fail(initialPlan, steps, "plugin_clone_failed");
        clonedPlugin = true;
        updatedPlugins.push(plugin.id);
        if (executeOptions.installDependencies || hasPackageLock(plugin.sourcePath)) {
          const deps = await installDependencies(plugin.sourcePath, `plugin:${plugin.id}`);
          steps.push({ type: "install-dependencies", target: `plugin:${plugin.id}`, pluginId: plugin.id, result: deps });
          if (!deps.ok) return fail(initialPlan, steps, `plugin_dependency_install_failed:${plugin.id}`);
        }
      }
      const currentStatus = await repoStatus({
        id: plugin.id,
        path: plugin.sourcePath,
        repositoryUrl: plugin.repositoryUrl,
        ref: plugin.ref || DEFAULT_BRANCH,
      });
      if (currentStatus.updateAvailable) {
        const update = await fastForward(currentStatus);
        steps.push({ type: "fast-forward-source", target: `plugin:${plugin.id}`, pluginId: plugin.id, result: update });
        if (!update.ok) return fail(initialPlan, steps, `plugin_fast_forward_failed:${plugin.id}`);
        if (!updatedPlugins.includes(plugin.id)) updatedPlugins.push(plugin.id);
        if (update.dependencyFilesChanged || executeOptions.installDependencies) {
          const deps = await installDependencies(plugin.sourcePath, `plugin:${plugin.id}`);
          steps.push({ type: "install-dependencies", target: `plugin:${plugin.id}`, pluginId: plugin.id, result: deps });
          if (!deps.ok) return fail(initialPlan, steps, `plugin_dependency_install_failed:${plugin.id}`);
        }
      } else if (clonedPlugin && !updatedPlugins.includes(plugin.id)) {
        updatedPlugins.push(plugin.id);
      }
    }

    if (initialPlan.hermesAgent.updateAvailable && executeOptions.updateHermesAgent) {
      const update = await fastForward(initialPlan.hermesAgent);
      steps.push({ type: "fast-forward-hermes-agent", target: "hermes-agent-official", result: update });
      if (!update.ok) return fail(initialPlan, steps, "hermes_agent_fast_forward_failed");
      hermesAgentUpdated = true;
      if (update.dependencyFilesChanged || executeOptions.installHermesAgentDependencies) {
        const deps = await runCommand([hermesAgentPython, "-m", "pip", "install", "-e", hermesAgentSource], {
          cwd: hermesAgentSource,
          timeoutMs: timeoutMs * 10,
        });
        steps.push({ type: "install-hermes-agent-dependencies", target: "hermes-agent-official", result: deps });
        if (!deps.ok) return fail(initialPlan, steps, "hermes_agent_dependency_install_failed");
      }
    }

    if (appUpdated || executeOptions.forceDeploy) {
      const deploy = await runCommand(deployCommand({ target: "home-ai", reason: executeOptions.reason }), { timeoutMs: timeoutMs * 20 });
      steps.push({ type: "deploy", target: "home-ai", result: deploy });
      if (!deploy.ok || deploy.json?.ok === false) return fail(initialPlan, steps, "home_ai_deploy_failed");
    }

    for (const pluginId of updatedPlugins) {
      const plugin = initialPlan.plugins.find((item) => item.id === pluginId);
      const deploy = await runCommand(deployCommand({ pluginId, sourcePath: plugin?.sourcePath, reason: executeOptions.reason }), { timeoutMs: timeoutMs * 20 });
      steps.push({ type: "deploy", target: `plugin:${pluginId}`, pluginId, result: deploy });
      if (!deploy.ok || deploy.json?.ok === false) return fail(initialPlan, steps, `plugin_deploy_failed:${pluginId}`);
    }

    if (hermesAgentUpdated || appUpdated || updatedPlugins.length || executeOptions.forceClosureValidation) {
      const profile = await runCommand(profileAuditCommand(), { timeoutMs: timeoutMs * 6 });
      steps.push({ type: "provider-profile-audit", result: profile });
      if (!profile.ok || profile.json?.ok === false || Number(profile.json?.issueCount || 0) > 0) {
        return fail(initialPlan, steps, "provider_profile_audit_failed");
      }
      const closure = await runCommand(closureCommand(), { timeoutMs: timeoutMs * 20 });
      steps.push({ type: "closure-validation", result: closure });
      if (!closure.ok || closure.json?.ok === false) return fail(initialPlan, steps, "closure_validation_failed");
    }

    return {
      ok: true,
      schemaVersion: 1,
      mode: "execute",
      startedAt,
      completedAt: nowIso(),
      root,
      appUpdated,
      updatedPlugins,
      hermesAgentUpdated,
      stepCount: steps.length,
      steps,
      finalPlan: await buildPlan(Object.assign({}, executeOptions, { execute: false })),
    };
  }

  function fail(plan, steps, error) {
    return {
      ok: false,
      schemaVersion: 1,
      mode: "execute",
      root,
      error,
      stepCount: steps.length,
      steps,
      initialPlan: plan,
    };
  }

  return Object.freeze({
    buildPlan,
    executeUpgrade,
    paths: {
      root,
      appPath,
      pluginRoot,
      runtimeRoot,
      manifestPath,
      hermesAgentSource,
      hermesAgentPython,
    },
  });
}

module.exports = {
  createPublicUpgradeOrchestratorService,
  hasDependencyFile,
  hasPackageLock,
  normalizePluginId,
  targetPluginId,
};
