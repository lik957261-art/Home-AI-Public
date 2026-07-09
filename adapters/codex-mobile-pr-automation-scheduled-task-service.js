"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const JOB_ID = "codex_mobile_pr_automation_hourly";
const JOB_NAME = "Codex Mobile PR Automation";
const DEFAULT_CADENCE = "0 * * * *";
const DEFAULT_CHECKOUT = "/Users/example/path";
const DEFAULT_SOURCE_REF = "origin/main";
const DEFAULT_PRIVATE_REPOSITORY = "pentiumxp/codex-mobile-web";
const DEFAULT_PUBLIC_REPOSITORY = "pentiumxp/codex-mobile-web-public";
const PLANNER_SCRIPT = "scripts/codex-mobile-pr-automation.js";
const PRIVATE_KEY_RE = /secret|token|cookie|password|access[_ -]?key|launch[_ -]?token|authorization|endpoint|payload|body|prompt|raw|log|screenshot|database|db|private/i;

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function safeToken(value, fallback = "source", max = 120) {
  const text = clean(value, max)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

function redact(value, key = "") {
  if (value == null) return value;
  if (PRIVATE_KEY_RE.test(String(key || ""))) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, key));
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 40)) {
      out[childKey] = redact(childValue, childKey);
    }
    return out;
  }
  if (typeof value === "string") return clean(value, 600);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return clean(String(value), 120);
}

function defaultStateFile(options = {}) {
  const env = options.env || process.env;
  const explicit = clean(options.stateFile || env.HOMEAI_CODEX_MOBILE_PR_AUTOMATION_STATE_FILE || env.CODEX_MOBILE_PR_AUTOMATION_STATE || "", 1000);
  if (explicit) return explicit;
  const dataDir = clean(options.dataDir || env.HERMES_WEB_DATA_DIR || env.HERMES_MOBILE_DATA_DIR || "", 1000);
  if (dataDir) return path.join(dataDir, "owner-governance", "codex-mobile-pr-automation-state.json");
  return path.join(process.cwd(), ".agent-context", "codex-mobile-pr-automation-state.json");
}

function defaultWorktreeRoot(options = {}) {
  const env = options.env || process.env;
  const explicit = clean(options.worktreeRoot || env.HOMEAI_CODEX_MOBILE_PR_AUTOMATION_SOURCE_ROOT || "", 1000);
  if (explicit) return explicit;
  const dataDir = clean(options.dataDir || env.HERMES_WEB_DATA_DIR || env.HERMES_MOBILE_DATA_DIR || "", 1000);
  if (dataDir) return path.join(dataDir, "owner-governance", "codex-mobile-pr-automation-source");
  return path.join(process.cwd(), ".agent-context", "codex-mobile-pr-automation-source");
}

function execText(command, args, options = {}) {
  const runner = options.execFileSync || execFileSync;
  return runner(command, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30000,
  });
}

function gitText(checkout, args, options = {}) {
  return execText("git", args, Object.assign({}, options, { cwd: checkout }));
}

function localPlannerExists(sourceRoot) {
  try {
    return fs.statSync(path.join(sourceRoot, PLANNER_SCRIPT)).isFile();
  } catch (_err) {
    return false;
  }
}

function refHasPlanner(checkout, sourceRef, options = {}) {
  try {
    gitText(checkout, ["cat-file", "-e", `${sourceRef}:${PLANNER_SCRIPT}`], options);
    return true;
  } catch (_err) {
    return false;
  }
}

function commitForRef(checkout, sourceRef, options = {}) {
  try {
    return clean(gitText(checkout, ["rev-parse", sourceRef], options), 80);
  } catch (_err) {
    return "";
  }
}

function sharedCheckoutStatus(checkout, sourceRef, options = {}) {
  const status = {
    checkout,
    sourceRef,
    localPlannerExists: localPlannerExists(checkout),
    refPlannerExists: false,
    dirty: false,
    behind: 0,
    ahead: 0,
    checkoutIssueCode: "",
  };
  try {
    const porcelain = gitText(checkout, ["status", "--porcelain"], options);
    status.dirty = porcelain.trim().length > 0;
  } catch (_err) {
    status.checkoutIssueCode = "planner_checkout_unreadable";
    return status;
  }
  status.refPlannerExists = refHasPlanner(checkout, sourceRef, options);
  try {
    const output = clean(gitText(checkout, ["rev-list", "--left-right", "--count", `HEAD...${sourceRef}`], options), 80);
    const [ahead, behind] = output.split(/\s+/).map((item) => Number(item || 0));
    status.ahead = Number.isFinite(ahead) ? ahead : 0;
    status.behind = Number.isFinite(behind) ? behind : 0;
  } catch (_err) {}
  if (!status.localPlannerExists && status.refPlannerExists) {
    status.checkoutIssueCode = "planner_checkout_stale";
  } else if (!status.localPlannerExists && !status.refPlannerExists) {
    status.checkoutIssueCode = "planner_source_missing";
  } else if (status.dirty) {
    status.checkoutIssueCode = "shared_checkout_dirty";
  }
  return status;
}

function ensureCleanSourceWorktree({ checkout, sourceRef, worktreeRoot, options = {} }) {
  const commit = commitForRef(checkout, sourceRef, options);
  if (!commit) {
    return { ok: false, issueCode: "planner_source_ref_unresolved" };
  }
  const sourceDir = path.join(worktreeRoot, safeToken(sourceRef), commit.slice(0, 12));
  if (!localPlannerExists(sourceDir)) {
    fs.mkdirSync(path.dirname(sourceDir), { recursive: true });
    gitText(checkout, ["worktree", "add", "--detach", "--force", sourceDir, commit], options);
  }
  if (!localPlannerExists(sourceDir)) {
    return { ok: false, issueCode: "planner_source_missing_after_worktree", sourceDir, sourceRef, commit };
  }
  return {
    ok: true,
    strategy: "clean_detached_worktree",
    sourceDir,
    sourceRef,
    commit,
  };
}

function resolvePlannerSource(options = {}) {
  const checkout = path.resolve(clean(options.checkout || options.codexMobileCheckout || DEFAULT_CHECKOUT, 1000));
  const sourceRef = clean(options.sourceRef || DEFAULT_SOURCE_REF, 160);
  const explicitSourceRoot = clean(options.sourceRoot || "", 1000);
  if (explicitSourceRoot) {
    const sourceDir = path.resolve(explicitSourceRoot);
    return localPlannerExists(sourceDir)
      ? { ok: true, strategy: "explicit_source_root", sourceDir, sourceRef: "", sharedCheckout: null }
      : { ok: false, issueCode: "planner_source_missing", sourceDir, sourceRef: "", sharedCheckout: null };
  }
  const sharedCheckout = sharedCheckoutStatus(checkout, sourceRef, options);
  if (sharedCheckout.refPlannerExists && options.useCleanWorktree !== false) {
    const prepared = ensureCleanSourceWorktree({
      checkout,
      sourceRef,
      worktreeRoot: path.resolve(defaultWorktreeRoot(options)),
      options,
    });
    return Object.assign({}, prepared, { sharedCheckout });
  }
  if (sharedCheckout.dirty) {
    return { ok: false, issueCode: "shared_checkout_dirty", strategy: "blocked_shared_checkout", sourceDir: checkout, sourceRef, sharedCheckout };
  }
  if (sharedCheckout.localPlannerExists) {
    return { ok: true, strategy: "shared_checkout", sourceDir: checkout, sourceRef: "", commit: commitForRef(checkout, "HEAD", options), sharedCheckout };
  }
  return { ok: false, issueCode: sharedCheckout.checkoutIssueCode || "planner_source_missing", strategy: "unresolved", sourceDir: checkout, sourceRef, sharedCheckout };
}

function summarizePlannerRun(run = {}) {
  const selected = run.selectedPullRequest || {};
  const summary = run.openPullRequestSummary || {};
  const requests = Array.isArray(run.taskCardRequests) ? run.taskCardRequests : [];
  const actions = Array.isArray(run.actions) ? run.actions : [];
  return redact({
    state: clean(run.state || "unknown", 120),
    issueCode: clean(run.issueCode || "", 160),
    privateOpenPullRequestCount: Number(summary.privateCount || 0),
    publicOpenPullRequestCount: Number(summary.publicCount || 0),
    selectedPullRequest: selected.identity ? {
      identity: clean(selected.identity, 180),
      repoKind: clean(selected.repoKind, 40),
      repository: clean(selected.repository, 160),
      number: selected.number,
      headShort: clean(selected.headShort || selected.selectedHeadShort || selected.headRefOid || "", 40).slice(0, 12),
    } : null,
    nextAction: clean(actions[0]?.type || requests[0]?.purpose || run.issueCode || run.state || "", 160),
    taskCardRequestCount: requests.length,
    taskCardId: clean(run.taskCardId || requests[0]?.taskCardId || "", 160),
    taskCardIdempotencyKey: clean(requests[0]?.idempotencyKey || "", 220),
    privacy: clean(run.privacy || "metadata_only", 80),
  });
}

function runScheduledTask(options = {}) {
  const env = Object.assign({}, process.env, options.env || {});
  const stateFile = defaultStateFile(options);
  const privateRepository = clean(options.privateRepository || env.CODEX_MOBILE_PRIVATE_REPOSITORY || DEFAULT_PRIVATE_REPOSITORY, 180);
  const publicRepository = clean(options.publicRepository || env.CODEX_MOBILE_PUBLIC_REPOSITORY || DEFAULT_PUBLIC_REPOSITORY, 180);
  const source = resolvePlannerSource(options);
  if (!source.ok) {
    return {
      ok: false,
      job: { id: JOB_ID, name: JOB_NAME, cadence: DEFAULT_CADENCE },
      state: "blocked",
      issueCode: source.issueCode || "planner_source_unresolved",
      source,
      stateFile,
      privacy: "metadata_only",
    };
  }
  const scriptPath = path.join(source.sourceDir, PLANNER_SCRIPT);
  const args = [
    scriptPath,
    "--json",
    "--write-state",
    "--state-file",
    stateFile,
    "--workspace-cwd",
    source.sourceDir,
    "--private-repo",
    privateRepository,
    "--public-repo",
    publicRepository,
  ];
  if (options.fixture) args.push("--fixture", path.resolve(String(options.fixture)));
  let plannerRun;
  try {
    const output = execText(process.execPath, args, {
      cwd: source.sourceDir,
      env: Object.assign({}, env, {
        CODEX_MOBILE_PRIVATE_REPOSITORY: privateRepository,
        CODEX_MOBILE_PUBLIC_REPOSITORY: publicRepository,
        CODEX_MOBILE_PR_AUTOMATION_STATE: stateFile,
      }),
      timeoutMs: options.timeoutMs || 120000,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
      execFileSync: options.execFileSync,
    });
    plannerRun = JSON.parse(output || "{}");
  } catch (err) {
    return {
      ok: false,
      job: { id: JOB_ID, name: JOB_NAME, cadence: DEFAULT_CADENCE },
      state: "blocked",
      issueCode: "planner_execution_failed",
      error: clean(err?.message || err, 240),
      source,
      stateFile,
      privacy: "metadata_only",
    };
  }
  return {
    ok: true,
    job: { id: JOB_ID, name: JOB_NAME, cadence: DEFAULT_CADENCE },
    state: clean(plannerRun.state || "unknown", 120),
    issueCode: clean(plannerRun.issueCode || "", 160),
    source: redact({
      strategy: source.strategy,
      sourceRef: source.sourceRef,
      commit: source.commit || "",
      sourceDir: source.sourceDir,
      sharedCheckout: source.sharedCheckout,
    }),
    stateFile,
    readback: summarizePlannerRun(plannerRun),
    plannerRun: redact(plannerRun),
    privacy: "metadata_only",
  };
}

module.exports = {
  JOB_ID,
  JOB_NAME,
  DEFAULT_CADENCE,
  DEFAULT_CHECKOUT,
  DEFAULT_SOURCE_REF,
  DEFAULT_PRIVATE_REPOSITORY,
  DEFAULT_PUBLIC_REPOSITORY,
  PLANNER_SCRIPT,
  defaultStateFile,
  defaultWorktreeRoot,
  resolvePlannerSource,
  runScheduledTask,
  sharedCheckoutStatus,
  summarizePlannerRun,
};
