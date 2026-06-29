"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createExport } = require("../scripts/create-public-export");

const DEFAULT_TIMEOUT_MS = 30000;

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function normalizeRun(result = {}) {
  return {
    ok: result.ok === true || result.status === 0,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : (result.ok === true ? 0 : 1),
    stdout: clean(result.stdout, 8000),
    stderr: clean(result.stderr || result.error, 2000),
  };
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
        stdout: clean(stdout, 8000),
        stderr: clean(stderr || error?.message || "", 2000),
      });
    });
  });
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

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function defaultOutDir(repoRoot) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return path.join(repoRoot, "workspace", "public-export", `Home-AI-Public-${stamp}`);
}

function publicValidationCommands() {
  return [
    ["node", ["scripts/public-install-preflight.js", "--source-only", "--json"]],
    ["node", ["tests/public-release-closure-service.test.js"]],
    ["node", ["tests/homeai-public-release-closure-script.test.js"]],
    ["node", ["tests/public-upgrade-rehearsal-service.test.js"]],
    ["node", ["tests/homeai-public-upgrade-rehearsal-script.test.js"]],
    ["node", ["tests/public-plugin-sources.test.js"]],
    ["node", ["tests/public-upgrade-orchestrator-service.test.js"]],
    ["node", ["tests/homeai-public-upgrade-script.test.js"]],
    ["node", ["scripts/plugin-provisioning-coverage-audit.js"]],
  ];
}

function commandLabel(command, args = []) {
  return [command, ...args].join(" ");
}

function createPublicReleaseClosureService(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const runProcess = options.runProcess || defaultRunProcess;
  const createExportFn = options.createExport || createExport;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nodeCommand = options.nodeCommand || process.execPath;
  const gitCommand = options.gitCommand || "git";
  const rsyncCommand = options.rsyncCommand || "/usr/bin/rsync";
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  async function run(command, args = [], runOptions = {}) {
    return normalizeRun(await runProcess(command, args, {
      cwd: runOptions.cwd || repoRoot,
      timeoutMs: runOptions.timeoutMs || timeoutMs,
    }));
  }

  async function git(args = [], cwd = repoRoot) {
    return run(gitCommand, args, { cwd });
  }

  async function gitStatus(cwd) {
    const result = await git(["status", "--porcelain", "--untracked-files=normal"], cwd);
    return {
      ok: result.ok,
      dirtyFiles: result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 60) : [],
      stderr: result.stderr,
    };
  }

  async function gitRemote(cwd, remote = "public") {
    const result = await git(["remote", "get-url", remote], cwd);
    return {
      ok: result.ok,
      url: result.ok ? clean(result.stdout, 500) : "",
      error: result.stderr || "",
    };
  }

  function sourceChecks() {
    const pkg = readJson(path.join(repoRoot, "package.json"), {});
    const manifest = readJson(path.join(repoRoot, "config", "public-plugin-sources.json"), {});
    const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
    return {
      packageHasReleaseScript: Boolean(pkg?.scripts?.["release:public"]),
      packageHasUpgradeScript: Boolean(pkg?.scripts?.["upgrade:public"]),
      packageHasExportScript: Boolean(pkg?.scripts?.["export:public"]),
      manifestHasMoira: plugins.some((plugin) => plugin.id === "moira" && /MOIRA_chinese_astrology_public/.test(plugin.repositoryUrl || "")),
      manifestHasMovie: plugins.some((plugin) => plugin.id === "movie" && plugin.operatorAuthenticated === true),
      upgradeDocExists: fileExists(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "public-upgrade-loop.md")),
      exportScriptExists: fileExists(path.join(repoRoot, "scripts", "create-public-export.js")),
      releaseScriptExists: fileExists(path.join(repoRoot, "scripts", "homeai-public-release-closure.js")),
      upgradeScriptExists: fileExists(path.join(repoRoot, "scripts", "homeai-public-upgrade.js")),
    };
  }

  async function buildPlan(planOptions = {}) {
    const outDir = path.resolve(planOptions.outDir || defaultOutDir(repoRoot));
    const publicRepoPath = planOptions.publicRepoPath ? path.resolve(planOptions.publicRepoPath) : "";
    const checks = sourceChecks();
    const sourceStatus = await gitStatus(repoRoot);
    const publicRemote = await gitRemote(repoRoot, "public");
    const blockers = [];
    const issues = [];
    for (const [key, value] of Object.entries(checks)) {
      if (!value) issues.push({ code: `public_release_source_check_failed:${key}` });
    }
    if (!sourceStatus.ok) blockers.push({ code: "source_git_status_failed", detail: sourceStatus.stderr });
    if (sourceStatus.dirtyFiles.length && !planOptions.allowDirty) {
      blockers.push({ code: "source_dirty_blocks_public_release", dirtyFiles: sourceStatus.dirtyFiles });
    }
    if (!publicRemote.ok) blockers.push({ code: "public_remote_missing", remote: "public" });
    if ((planOptions.syncPublicRepo || planOptions.commitPublic || planOptions.pushPublic) && !publicRepoPath) {
      blockers.push({ code: "public_repo_path_required" });
    }
    if ((planOptions.commitPublic || planOptions.pushPublic) && !planOptions.syncPublicRepo) {
      blockers.push({ code: "public_repo_sync_required_for_commit_or_push" });
    }
    if (planOptions.pushPublic && !planOptions.commitPublic) {
      blockers.push({ code: "public_push_requires_commit_public" });
    }
    let publicRepoStatus = null;
    if (publicRepoPath) {
      publicRepoStatus = {
        path: publicRepoPath,
        present: dirExists(publicRepoPath),
        status: null,
      };
      if (!publicRepoStatus.present) {
        blockers.push({ code: "public_repo_path_missing", path: publicRepoPath });
      } else {
        publicRepoStatus.status = await gitStatus(publicRepoPath);
        if (!publicRepoStatus.status.ok) blockers.push({ code: "public_repo_git_status_failed", path: publicRepoPath });
        if (publicRepoStatus.status.dirtyFiles.length && !planOptions.allowPublicRepoDirty) {
          blockers.push({ code: "public_repo_dirty_blocks_sync", path: publicRepoPath, dirtyFiles: publicRepoStatus.status.dirtyFiles });
        }
      }
    }
    const actions = [
      { type: "create-public-export", outDir },
      ...publicValidationCommands().map(([command, args]) => ({
        type: "validate-public-export",
        command: commandLabel(command, args),
      })),
    ];
    if (publicRepoPath && planOptions.syncPublicRepo) actions.push({ type: "sync-public-repo", path: publicRepoPath });
    if (publicRepoPath && planOptions.commitPublic) actions.push({ type: "commit-public-repo", path: publicRepoPath });
    if (publicRepoPath && planOptions.pushPublic) actions.push({ type: "push-public-repo", path: publicRepoPath });
    return {
      ok: blockers.length === 0 && issues.length === 0,
      schemaVersion: 1,
      mode: planOptions.execute ? "execute" : "plan",
      generatedAt: nowIso(),
      repoRoot,
      outDir,
      publicRepoPath,
      checks,
      publicRemote,
      publicRepoStatus,
      actionCount: actions.length,
      actions,
      issueCount: issues.length,
      issues,
      blockerCount: blockers.length,
      blockers,
      policy: {
        cleanSourceRequired: !planOptions.allowDirty,
        publicRepoSyncExplicit: true,
        publicCommitExplicit: true,
        publicPushExplicit: true,
        rawSecretsInOutput: false,
      },
    };
  }

  async function executeClosure(executeOptions = {}) {
    const startedAt = nowIso();
    const plan = await buildPlan(Object.assign({}, executeOptions, { execute: true }));
    if (plan.blockers.length || plan.issues.length) {
      return Object.assign({}, plan, {
        ok: false,
        executed: false,
        error: "public_release_plan_blocked",
      });
    }
    const steps = [];
    const exportResult = createExportFn({
      outDir: plan.outDir,
      force: true,
      allowDirty: bool(executeOptions.allowDirty),
      skipPrivacyScan: bool(executeOptions.skipPrivacyScan),
    });
    steps.push({
      type: "create-public-export",
      ok: true,
      outDir: exportResult.outDir,
      sourceCommit: exportResult.report?.sourceCommit || "",
      fileCount: exportResult.report?.fileCount || 0,
      privacyScanSkipped: bool(executeOptions.skipPrivacyScan),
    });
    for (const [command, args] of publicValidationCommands()) {
      const actualCommand = command === "node" ? nodeCommand : command;
      const result = await run(actualCommand, args, { cwd: plan.outDir, timeoutMs: timeoutMs * 8 });
      steps.push({
        type: "validate-public-export",
        command: commandLabel(command, args),
        result,
      });
      if (!result.ok) return fail(plan, steps, "public_export_validation_failed");
    }
    if (plan.publicRepoPath && executeOptions.syncPublicRepo) {
      const sync = await run(rsyncCommand, [
        "-a",
        "--delete",
        "--exclude",
        ".git/",
        `${plan.outDir}/`,
        `${plan.publicRepoPath}/`,
      ], { cwd: repoRoot, timeoutMs: timeoutMs * 8 });
      steps.push({ type: "sync-public-repo", result: sync });
      if (!sync.ok) return fail(plan, steps, "public_repo_sync_failed");
      for (const [command, args] of publicValidationCommands()) {
        const actualCommand = command === "node" ? nodeCommand : command;
        const result = await run(actualCommand, args, { cwd: plan.publicRepoPath, timeoutMs: timeoutMs * 8 });
        steps.push({
          type: "validate-public-repo",
          command: commandLabel(command, args),
          result,
        });
        if (!result.ok) return fail(plan, steps, "public_repo_validation_failed");
      }
      if (executeOptions.commitPublic) {
        const add = await git(["add", "-A"], plan.publicRepoPath);
        steps.push({ type: "git-add-public-repo", result: add });
        if (!add.ok) return fail(plan, steps, "public_repo_git_add_failed");
        const status = await gitStatus(plan.publicRepoPath);
        steps.push({ type: "git-status-public-repo", result: { ok: status.ok, dirtyCount: status.dirtyFiles.length } });
        if (!status.ok) return fail(plan, steps, "public_repo_git_status_failed");
        if (status.dirtyFiles.length) {
          const message = clean(executeOptions.commitMessage || `Publish Home AI public release ${startedAt.slice(0, 10)}`, 160);
          const commit = await git(["commit", "-m", message], plan.publicRepoPath);
          steps.push({ type: "git-commit-public-repo", result: commit });
          if (!commit.ok) return fail(plan, steps, "public_repo_git_commit_failed");
        } else {
          steps.push({ type: "git-commit-public-repo", result: { ok: true, skipped: true, reason: "no_changes" } });
        }
      }
      if (executeOptions.pushPublic) {
        const push = await git(["push"], plan.publicRepoPath);
        steps.push({ type: "git-push-public-repo", result: push });
        if (!push.ok) return fail(plan, steps, "public_repo_git_push_failed");
      }
    }
    return {
      ok: true,
      schemaVersion: 1,
      mode: "execute",
      startedAt,
      completedAt: nowIso(),
      repoRoot,
      outDir: plan.outDir,
      publicRepoPath: plan.publicRepoPath,
      stepCount: steps.length,
      steps,
    };
  }

  function fail(plan, steps, error) {
    return {
      ok: false,
      schemaVersion: 1,
      mode: "execute",
      repoRoot,
      error,
      stepCount: steps.length,
      steps,
      initialPlan: plan,
    };
  }

  return Object.freeze({
    buildPlan,
    executeClosure,
  });
}

module.exports = {
  createPublicReleaseClosureService,
  publicValidationCommands,
};
