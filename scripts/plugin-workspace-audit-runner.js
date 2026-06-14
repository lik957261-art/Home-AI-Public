"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createPluginWorkspaceAuditService } = require("../adapters/plugin-workspace-audit-service");

const MAX_COMMAND_BYTES = 80_000;
const MAX_CODEX_BYTES = 120_000;

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function parseArgs(argv) {
  const out = { jobFile: "", outputRoot: "", json: false, skipInbox: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--job-file") out.jobFile = argv[++index] || "";
    else if (arg === "--output-root") out.outputRoot = argv[++index] || "";
    else if (arg === "--json") out.json = true;
    else if (arg === "--skip-inbox") out.skipInbox = true;
    else if (arg === "--help") {
      console.log("Usage: node scripts/plugin-workspace-audit-runner.js --job-file <job.json> [--output-root <dir>] [--json]");
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  if (!out.jobFile) throw new Error("job_file_required");
  return out;
}

function safeSlug(value, fallback = "item") {
  const slug = clean(value, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function outputRoot(options = {}) {
  const configured = options.outputRoot
    || process.env.HERMES_WEB_CRON_OUTPUT_ROOT
    || process.env.HERMES_MOBILE_CRON_OUTPUT_ROOT
    || "";
  if (configured) return path.resolve(configured);
  const hermesHome = process.env.HERMES_HOME || path.join(process.env.HOME || process.cwd(), ".hermes");
  return path.join(hermesHome, "cron", "output");
}

function readJob(filePath) {
  const job = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("job_json_invalid");
  return job;
}

function runGit(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: Math.max(1000, Number(options.timeoutMs || 8000) || 8000),
    maxBuffer: Math.max(MAX_COMMAND_BYTES, Number(options.maxBuffer || MAX_COMMAND_BYTES) || MAX_COMMAND_BYTES),
  });
  return {
    ok: result.status === 0,
    status: Number(result.status || 0),
    stdout: clean(result.stdout, options.maxText || 12000),
    stderr: clean(result.stderr, options.maxText || 4000),
  };
}

function splitLines(text, limit = 40) {
  return String(text || "").split(/\r?\n/).map((line) => clean(line, 500)).filter(Boolean).slice(0, limit);
}

function envFlag(name, fallback = false) {
  const raw = clean(process.env[name], 40).toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

function gitFileList(cwd, args, limit = 80) {
  const result = runGit(cwd, args, { maxText: 30_000 });
  return {
    ok: result.ok,
    files: splitLines(result.stdout, limit).filter((item) => !item.startsWith("warning:")),
    error: result.ok ? "" : clean(result.stderr || result.stdout, 400),
  };
}

function rgTodoScan(cwd) {
  const result = spawnSync("rg", [
    "-n",
    "--max-count",
    "3",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.git/**",
    "--glob",
    "!dist/**",
    "--glob",
    "!build/**",
    "TODO|FIXME|HACK|XXX",
  ], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8000,
    maxBuffer: MAX_COMMAND_BYTES,
  });
  if (result.status !== 0 && !result.stdout) return [];
  return splitLines(result.stdout, 20);
}

function secretLikeTrackedFiles(files = []) {
  return files.filter((name) => /(^|\/)(\.env|[^/]*(?:secret|token|private|credential|password)[^/]*)$|\.pem$|\.key$|\.p12$/i.test(name)).slice(0, 20);
}

function modeFileSample(cwd, mode) {
  if (mode === "dirty_diff") return gitFileList(cwd, ["status", "--short"], 80);
  if (mode === "full_sample") return gitFileList(cwd, ["ls-files"], 120);
  const recent = gitFileList(cwd, ["diff", "--name-only", "HEAD~5..HEAD"], 80);
  if (recent.ok && recent.files.length) return recent;
  return gitFileList(cwd, ["ls-files"], 80);
}

function finding(severity, title, evidence = [], rationale = "") {
  return { severity, title: clean(title, 180), evidence: evidence.slice(0, 20), rationale: clean(rationale, 500) };
}

function redactWorkspacePath(text, workspacePath) {
  let out = String(text || "");
  const real = clean(workspacePath, 4000);
  if (!real) return out;
  const variants = new Set([real, real.replace(/\\/g, "/")]);
  if (real.startsWith("/private/")) variants.add(real.slice("/private".length));
  if (real.startsWith("/var/")) variants.add(`/private${real}`);
  for (const variant of variants) out = out.split(variant).join("[workspace]");
  return out;
}

function codexAuditConfig() {
  const enabled = envFlag("HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED")
    || envFlag("HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED");
  const command = clean(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND
      || "codex",
    2000,
  );
  const model = clean(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_MODEL
      || "",
    200,
  );
  const timeoutMs = Math.max(30_000, Number(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
      || 600_000,
  ) || 600_000);
  return { enabled, command, model, timeoutMs };
}

function buildCodexPrompt(job, audit) {
  return [
    "You are running a Home AI plugin workspace audit.",
    "",
    "Hard constraints:",
    "- This is a read-only audit. Do not edit files, create files, install packages, run migrations, commit, push, deploy, restart services, or mutate databases.",
    "- Inspect only the current working directory and use relative paths in the final answer.",
    "- Do not print raw secrets, tokens, private keys, environment values, subscription endpoints, or full large logs.",
    "- If a check could write cache/build artifacts, skip it and say why.",
    "",
    "Review stance:",
    "- Prioritize concrete bugs, regressions, security/privacy risks, data-loss risks, and missing tests.",
    "- Lead with findings ordered by severity and include file/line references when available.",
    "- Keep the final answer concise. If there are no findings, say so and mention residual test gaps.",
    "",
    `Job id: ${clean(job.id, 80) || "unknown"}`,
    `Plugin: ${audit.pluginTitle || audit.pluginId}`,
    `Audit mode: ${audit.mode}`,
    `Revision: ${audit.head || "unknown"}`,
    `Branch: ${audit.branch || "unknown"}`,
    "",
    "Deterministic pre-scan summary:",
    `- Top severity: ${audit.topSeverity}`,
    `- Finding count: ${audit.findingCount}`,
    audit.statusLines.length ? "- Git status:\n" + audit.statusLines.slice(0, 20).map((line) => `  - ${line}`).join("\n") : "- Git status: clean or unavailable",
    audit.diffStat.length ? "- Diff stat:\n" + audit.diffStat.slice(0, 20).map((line) => `  - ${line}`).join("\n") : "- Diff stat: none or unavailable",
  ].join("\n");
}

function runCodexReview(job, audit, workspacePath) {
  const config = codexAuditConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      ok: true,
      status: "disabled",
      output: "Codex read-only review is disabled by runtime configuration.",
    };
  }
  const args = [
    "exec",
    "--sandbox",
    "read-only",
    "--cd",
    workspacePath,
    "--ephemeral",
    "--ignore-user-config",
    "--color",
    "never",
    "--skip-git-repo-check",
  ];
  if (config.model) args.push("--model", config.model);
  args.push(buildCodexPrompt(job, audit));
  const result = spawnSync(config.command, args, {
    cwd: workspacePath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: config.timeoutMs,
    maxBuffer: MAX_CODEX_BYTES,
    env: Object.assign({}, process.env, {
      HOME: os.homedir() || process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir() || process.env.HOME || "", ".codex"),
      NO_COLOR: "1",
      TERM: "dumb",
    }),
  });
  const stdout = redactWorkspacePath(clean(result.stdout, 80_000), workspacePath);
  const stderr = redactWorkspacePath(clean(result.stderr, 12_000), workspacePath);
  const timedOut = result.error && result.error.code === "ETIMEDOUT";
  const status = timedOut ? "timeout" : (result.error ? clean(result.error.code || result.error.message, 120) : String(Number(result.status || 0)));
  return {
    enabled: true,
    ok: result.status === 0 && !timedOut,
    status,
    command: path.basename(config.command),
    output: stdout || "(Codex produced no stdout.)",
    error: stderr,
  };
}

function buildAudit(job) {
  const audit = job.audit && typeof job.audit === "object" ? job.audit : {};
  if (job.kind !== "plugin_workspace_audit" || audit.kind !== "plugin_workspace_audit") throw new Error("plugin_audit_job_required");
  if (job.readonly !== true || audit.readonly !== true) throw new Error("plugin_audit_readonly_required");
  const workspacePath = clean(audit.workspacePath || audit.workspace_path, 2000);
  if (!workspacePath || !path.isAbsolute(workspacePath)) throw new Error("plugin_audit_workspace_path_invalid");
  const realPath = fs.realpathSync.native(workspacePath);
  if (!fs.statSync(realPath).isDirectory()) throw new Error("plugin_audit_workspace_not_directory");
  const mode = clean(audit.auditMode || audit.audit_mode || "recent_changes", 40) || "recent_changes";
  const pluginId = clean(audit.pluginId || audit.plugin_id, 80);
  const pluginTitle = clean(audit.pluginTitle || audit.plugin_title || pluginId, 120);
  const pathRef = clean(audit.workspacePathRef || audit.workspace_path_ref || "configured", 120);

  const head = runGit(realPath, ["rev-parse", "--short=12", "HEAD"], { maxText: 2000 });
  const branch = runGit(realPath, ["branch", "--show-current"], { maxText: 2000 });
  const status = runGit(realPath, ["status", "--short"], { maxText: 16_000 });
  const log = runGit(realPath, ["log", "--oneline", "--max-count=8"], { maxText: 8000 });
  const diffStat = runGit(realPath, ["diff", "--stat"], { maxText: 12_000 });
  const sample = modeFileSample(realPath, mode);
  const tracked = gitFileList(realPath, ["ls-files"], 400);
  const todoHits = rgTodoScan(realPath);
  const secretFiles = secretLikeTrackedFiles(tracked.files);
  const statusLines = splitLines(status.stdout, 80);
  const findings = [];

  if (!head.ok) {
    findings.push(finding("high", "Workspace is not readable as a Git repository", [head.stderr || head.stdout], "The read-only audit could not establish source revision metadata."));
  }
  if (statusLines.length) {
    findings.push(finding("medium", "Workspace has uncommitted changes", statusLines.slice(0, 20), "Read-only audit results may include local changes that have not been reviewed or pushed."));
  }
  if (secretFiles.length) {
    findings.push(finding("high", "Tracked files look secret-like", secretFiles, "The audit detected tracked filenames that commonly carry secrets. It did not read or print file contents."));
  }
  if (todoHits.length) {
    findings.push(finding("low", "TODO/FIXME markers are present", todoHits, "These markers may represent intentional backlog or unfinished code paths."));
  }
  if (!findings.length) {
    findings.push(finding("info", "No deterministic findings from read-only metadata scan", [], "The runner completed git metadata and bounded source marker checks without detecting configured risk markers."));
  }
  const severityRank = { high: 3, medium: 2, low: 1, info: 0 };
  const topSeverity = findings.reduce((acc, item) => (severityRank[item.severity] > severityRank[acc] ? item.severity : acc), "info");
  const auditResult = {
    pluginId,
    pluginTitle,
    targetWorkspaceId: clean(audit.targetWorkspaceId || audit.target_workspace_id || job.owner_principal_id || "owner", 120),
    pathRef,
    mode,
    head: head.ok ? clean(head.stdout, 80) : "",
    branch: branch.ok ? clean(branch.stdout, 80) : "",
    statusLines,
    diffStat: splitLines(diffStat.stdout, 30),
    recentLog: splitLines(log.stdout, 12),
    sampledFiles: sample.files,
    findings,
    findingCount: findings.filter((item) => item.severity !== "info").length,
    topSeverity,
    diagnostics: {
      gitStatusOk: status.ok,
      sampledFileCount: sample.files.length,
      todoHitCount: todoHits.length,
      generatedAt: new Date().toISOString(),
    },
  };
  auditResult.codex = runCodexReview(job, auditResult, realPath);
  if (auditResult.codex.enabled && !auditResult.codex.ok) {
    auditResult.findings.unshift(finding(
      "high",
      "Codex read-only review failed",
      [auditResult.codex.error || `status=${auditResult.codex.status}`],
      "The deterministic audit completed, but the configured Codex read-only executor did not return a usable review.",
    ));
    auditResult.findingCount = auditResult.findings.filter((item) => item.severity !== "info").length;
    auditResult.topSeverity = auditResult.findings.reduce((acc, item) => (severityRank[item.severity] > severityRank[acc] ? item.severity : acc), "info");
  }
  return auditResult;
}

function markdownList(items = [], fallback = "- None") {
  if (!items.length) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

function renderReport(job, audit) {
  const findings = audit.findings.map((item, index) => [
    `### ${index + 1}. ${item.severity.toUpperCase()} - ${item.title}`,
    item.rationale ? `Rationale: ${item.rationale}` : "",
    item.evidence.length ? "Evidence:" : "",
    item.evidence.map((line) => `- \`${line.replace(/`/g, "'")}\``).join("\n"),
  ].filter(Boolean).join("\n\n")).join("\n\n");
  return [
    `# Plugin Workspace Audit - ${audit.pluginTitle || audit.pluginId}`,
    "",
    "## Summary",
    "",
    `- Job id: ${clean(job.id, 80) || "unknown"}`,
    `- Plugin: ${audit.pluginId}`,
    `- Target workspace: ${audit.targetWorkspaceId || "owner"}`,
    `- Workspace path ref: ${audit.pathRef}`,
    `- Audit mode: ${audit.mode}`,
    `- Revision: ${audit.head || "unknown"}`,
    `- Branch: ${audit.branch || "unknown"}`,
    `- Top severity: ${audit.topSeverity}`,
    `- Finding count: ${audit.findingCount}`,
    `- Generated at: ${audit.diagnostics.generatedAt}`,
    "",
    "## Findings",
    "",
    findings,
    "",
    "## Git Status",
    "",
    markdownList(audit.statusLines),
    "",
    "## Diff Stat",
    "",
    markdownList(audit.diffStat),
    "",
    "## Recent Commits",
    "",
    markdownList(audit.recentLog),
    "",
    "## Sampled Files",
    "",
    markdownList(audit.sampledFiles.slice(0, 80)),
    "",
    "## Codex Read-Only Review",
    "",
    `- Enabled: ${audit.codex?.enabled ? "yes" : "no"}`,
    `- Status: ${audit.codex?.status || "unknown"}`,
    audit.codex?.command ? `- Command: ${audit.codex.command}` : "",
    audit.codex?.error ? "### Executor Diagnostics" : "",
    audit.codex?.error ? "```text\n" + audit.codex.error.replace(/```/g, "'''") + "\n```" : "",
    "### Review Output",
    "",
    "```text",
    clean(audit.codex?.output || "No Codex review output.", 80_000).replace(/```/g, "'''"),
    "```",
    "",
    "## Read-Only Enforcement",
    "",
    "- The runner used bounded metadata/source-inspection commands only.",
    "- It did not edit files, run migrations, install packages, commit, push, deploy, restart services, or read secret file contents.",
    "- The report intentionally omits the target workspace absolute path; only the configured path reference is shown.",
  ].join("\n");
}

function writeReport(job, audit, markdown, options = {}) {
  const jobId = safeSlug(job.id || "job", "job");
  const root = path.join(outputRoot(options), jobId);
  fs.mkdirSync(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const fileName = `plugin-workspace-audit-${safeSlug(audit.pluginId, "plugin")}-${stamp}.md`;
  const reportPath = path.join(root, fileName);
  fs.writeFileSync(reportPath, markdown, { encoding: "utf8", mode: 0o600 });
  return { reportPath, fileName };
}

function dbPathFromEnv() {
  const explicit = process.env.HERMES_WEB_DB_PATH || process.env.HERMES_MOBILE_DB_PATH || "";
  if (explicit) return explicit;
  const dataDir = process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || "";
  return dataDir ? path.join(dataDir, "hermes-mobile.sqlite3") : "";
}

function upsertInbox(job, audit, report, options = {}) {
  if (options.skipInbox) return { ok: true, skipped: true, reason: "skip_inbox" };
  const dbPath = dbPathFromEnv();
  if (!dbPath) return { ok: true, skipped: true, reason: "db_path_unconfigured" };
  const store = createMobileSqliteStore({ dbPath });
  try {
    const actionInboxService = createActionInboxService({ store });
    const service = createPluginWorkspaceAuditService({ actionInboxService });
    return service.upsertAuditInboxItem({
      workspaceId: audit.targetWorkspaceId || "owner",
      pluginId: audit.pluginId,
      auditRunId: `${clean(job.id, 80) || "job"}:${report.fileName}`,
      severity: audit.topSeverity,
      findingCount: audit.findingCount,
      title: audit.findingCount ? `${audit.pluginTitle || audit.pluginId} audit needs review` : `${audit.pluginTitle || audit.pluginId} audit completed`,
      summary: audit.findingCount
        ? `${audit.findingCount} finding(s), top severity ${audit.topSeverity}.`
        : "Read-only plugin workspace audit completed without deterministic findings.",
      sourceRef: {
        automationId: clean(job.id, 80),
        jobId: clean(job.id, 80),
        reportUrl: `/api/automations/output?jobId=${encodeURIComponent(clean(job.id, 80))}&file=${encodeURIComponent(report.fileName)}`,
      },
      deepLink: `/?view=automation&automationId=${encodeURIComponent(clean(job.id, 80))}&returnTo=inbox`,
    });
  } finally {
    store.close();
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const job = readJob(options.jobFile);
  const audit = buildAudit(job);
  const markdown = renderReport(job, audit);
  const report = writeReport(job, audit, markdown, options);
  const inbox = upsertInbox(job, audit, report, options);
  const finalOutput = [
    markdown,
    "",
    `MEDIA:${report.reportPath}`,
  ].join("\n");
  const payload = {
    ok: true,
    output: finalOutput,
    reportPath: report.reportPath,
    reportFile: report.fileName,
    summary: {
      pluginId: audit.pluginId,
      topSeverity: audit.topSeverity,
      findingCount: audit.findingCount,
    },
    inbox,
  };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(finalOutput);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: clean(err?.message || err, 1000) };
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  buildAudit,
  renderReport,
  upsertInbox,
};
