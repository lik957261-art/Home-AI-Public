"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createPluginWorkspaceAuditService } = require("../adapters/plugin-workspace-audit-service");

const MAX_COMMAND_BYTES = 80_000;
const MAX_CODEX_BYTES = 5_000_000;
const DEFAULT_CODEX_TASK_CARD_SCRIPT = "/Users/example/path";

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

function fileSystemFileList(cwd, limit = 160) {
  const files = [];
  const ignoredDirs = new Set([
    ".git",
    ".codegraph",
    ".codex",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "logs",
    "tmp",
    "temp",
  ]);
  function walk(dir, prefix = "") {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= limit) break;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) walk(fullPath, relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }
  walk(cwd);
  return { ok: true, files, error: "" };
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
  if (mode === "alignment") {
    const tracked = gitFileList(cwd, ["ls-files"], 160);
    const source = tracked.ok ? tracked : fileSystemFileList(cwd, 220);
    const priority = [
      ".agent-context/PROJECT_CONTEXT.md",
      ".agent-context/HANDOFF.md",
      "docs/README.md",
      "docs/DOCS_INDEX.md",
      "docs/PRODUCT_REQUIREMENTS.md",
      "docs/ARCHITECTURE.md",
      "docs/ARCHITECTURE_BOUNDARY.md",
      "docs/TEST_MATRIX.md",
    ];
    const files = source.files || [];
    const selected = [
      ...priority.filter((name) => files.includes(name)),
      ...files.filter((name) => /^docs\/IMPLEMENTATION_NOTES\/.+\.md$/i.test(name)).slice(0, 24),
      ...files.filter((name) => /\.(js|ts|tsx|jsx|py|sh|md)$/i.test(name) && !name.startsWith("docs/")).slice(0, 80),
    ];
    return {
      ok: source.ok,
      files: [...new Set(selected)].slice(0, 120),
      error: source.error || tracked.error,
      source: tracked.ok ? "git" : "filesystem",
    };
  }
  if (mode === "dirty_diff") return gitFileList(cwd, ["status", "--short"], 80);
  if (mode === "full_sample") {
    const tracked = gitFileList(cwd, ["ls-files"], 120);
    return tracked.ok ? Object.assign({}, tracked, { source: "git" }) : Object.assign(fileSystemFileList(cwd, 120), { source: "filesystem" });
  }
  const recent = gitFileList(cwd, ["diff", "--name-only", "HEAD~5..HEAD"], 80);
  if (recent.ok && recent.files.length) return Object.assign({}, recent, { source: "git" });
  const tracked = gitFileList(cwd, ["ls-files"], 80);
  return tracked.ok ? Object.assign({}, tracked, { source: "git" }) : Object.assign(fileSystemFileList(cwd, 80), { source: "filesystem" });
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
  const codexHome = clean(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_HOME
      || "",
    2000,
  );
  const timeoutMs = Math.max(30_000, Number(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_TIMEOUT_MS
      || 600_000,
  ) || 600_000);
  return { enabled, command, model, codexHome, timeoutMs };
}

function listFromEnv(nameA, nameB) {
  const raw = clean(process.env[nameA] || process.env[nameB] || "", 4000);
  return raw
    .split(/[,\n;，；]+/u)
    .map((item) => clean(item, 300))
    .filter(Boolean);
}

function readTaskCardConfigFile() {
  const configured = clean(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_CONFIG_FILE
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_CONFIG_FILE
      || "",
    2000,
  );
  const fallback = process.env.HERMES_MOBILE_ROOT
    ? path.join(process.env.HERMES_MOBILE_ROOT, "data", "plugin-workspace-audit-task-cards.json")
    : "";
  const filePath = configured || fallback;
  if (!filePath) return {};
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return { __error: clean(err?.message || err, 300), __file: filePath };
  }
}

function listFromConfig(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 300)).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(/[,\n;，；]+/u)
    .map((item) => clean(item, 300))
    .filter(Boolean)
    .slice(0, 12);
}

function taskCardConfig(pluginId = "") {
  const pluginEnvKey = String(pluginId || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const fileConfig = readTaskCardConfigFile();
  const plugins = fileConfig.plugins && typeof fileConfig.plugins === "object" && !Array.isArray(fileConfig.plugins)
    ? fileConfig.plugins
    : {};
  const pluginFileConfig = plugins[pluginId] && typeof plugins[pluginId] === "object" && !Array.isArray(plugins[pluginId])
    ? plugins[pluginId]
    : {};
  const sourceThreadId = clean(
    process.env[`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_${pluginEnvKey}_TASK_CARD_SOURCE_THREAD_ID`]
      || process.env[`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_${pluginEnvKey}_TASK_CARD_SOURCE_THREAD_ID`]
      || process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_SOURCE_THREAD_ID
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_SOURCE_THREAD_ID
      || pluginFileConfig.sourceThreadId
      || pluginFileConfig.source_thread_id
      || fileConfig.sourceThreadId
      || fileConfig.source_thread_id
      || "",
    300,
  );
  const pluginTargets = listFromEnv(
    `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_${pluginEnvKey}_TASK_CARD_TARGET_THREADS`,
    `HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_${pluginEnvKey}_TASK_CARD_TARGET_THREADS`,
  );
  const defaultTargets = listFromEnv(
    "HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_TARGET_THREADS",
    "HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_TARGET_THREADS",
  );
  const pluginFileTargets = listFromConfig(pluginFileConfig.targetThreadIds || pluginFileConfig.target_thread_ids || pluginFileConfig.targetThreads || pluginFileConfig.target_threads);
  const defaultFileTargets = listFromConfig(fileConfig.targetThreadIds || fileConfig.target_thread_ids || fileConfig.targetThreads || fileConfig.target_threads);
  const enabled = envFlag("HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_ENABLED")
    || envFlag("HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_ENABLED")
    || Boolean(pluginFileConfig.enabled || fileConfig.enabled)
    || Boolean(sourceThreadId && (pluginTargets.length || defaultTargets.length || pluginFileTargets.length || defaultFileTargets.length));
  const script = clean(
    process.env.HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_SCRIPT
      || process.env.HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_SCRIPT
      || DEFAULT_CODEX_TASK_CARD_SCRIPT,
    2000,
  );
  const pending = envFlag("HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_PENDING")
    || envFlag("HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TASK_CARD_PENDING");
  return {
    enabled,
    sourceThreadId,
    targetThreadIds: pluginTargets.length ? pluginTargets : defaultTargets.length ? defaultTargets : pluginFileTargets.length ? pluginFileTargets : defaultFileTargets,
    script,
    pending,
    configError: fileConfig.__error || "",
  };
}

function taskCardTitle(audit = {}) {
  return `[Plugin Audit] ${audit.pluginTitle || audit.pluginId} ${audit.mode || "alignment"}`;
}

function taskCardIdempotency(job, audit = {}) {
  return [
    "plugin-workspace-audit",
    clean(audit.pluginId, 80) || "plugin",
    clean(audit.mode, 40) || "alignment",
    clean(job.id, 80) || "job",
    clean(audit.head, 80) || "unknown",
  ].join(":");
}

function buildAuditTaskCardRequest(job, audit = {}, report = {}) {
  const title = taskCardTitle(audit);
  const issueLines = audit.findings
    .filter((item) => item.severity !== "info")
    .slice(0, 8)
    .map((item) => `- ${item.severity.toUpperCase()}: ${item.title}`);
  const body = [
    "## Scope",
    "",
    `Plugin: ${audit.pluginTitle || audit.pluginId}`,
    `Audit mode: ${audit.mode}`,
    `Target workspace: ${audit.targetWorkspaceId || "owner"}`,
    `Workspace path ref: ${audit.pathRef}`,
    `Source revision: ${audit.head || "unknown"}`,
    `Report file: ${report.fileName || "not-written-yet"}`,
    "",
    "## Deterministic Audit Summary",
    "",
    `Top severity: ${audit.topSeverity}`,
    `Finding count: ${audit.findingCount}`,
    issueLines.length ? issueLines.join("\n") : "- No deterministic non-info findings.",
    "",
    "## Required Workflow",
    "",
    "- Use the target plugin thread/workspace and Home AI platform docs.",
    "- Do not rely on a separate Home AI cron-spawned Codex process.",
    "- Keep profile, auth, thread state, and app-server/mux ownership inside Codex Mobile.",
    "- Start with read-only inspection. If a repair is needed, keep changes scoped to the plugin-owned surface or explicitly hand Home AI host issues back to the host thread.",
    "- Do not print secrets, access keys, tokens, push endpoints, private database paths, or long raw logs.",
    "",
    "## Acceptance",
    "",
    "- Reply with findings first, ordered by severity.",
    "- Include file/line references where available.",
    "- State whether a follow-up repair is needed or no issue was found.",
  ].join("\n");
  return {
    sourceThreadId: "",
    targetThreadIds: [],
    title,
    summary: `${audit.pluginTitle || audit.pluginId} plugin workspace audit follow-up`,
    body,
    idempotencyKey: taskCardIdempotency(job, audit),
    requestId: taskCardIdempotency(job, audit),
    workflowMode: "autonomous",
    workflowId: "home-ai-plugin-workspace-audit",
    pending: false,
    autoApprove: true,
  };
}

function maybeSendAuditTaskCard(job, audit = {}, report = {}) {
  const request = buildAuditTaskCardRequest(job, audit, report);
  const config = taskCardConfig(audit.pluginId);
  const taskCard = {
    enabled: config.enabled,
    ok: true,
    status: "draft",
    request,
  };
  if (config.configError) {
    taskCard.ok = false;
    taskCard.status = "config_error";
    taskCard.message = `跨线程 task-card 配置文件无效: ${config.configError}`;
    return taskCard;
  }
  if (!config.enabled) {
    taskCard.status = "not_configured";
    taskCard.message = "跨线程 task-card 未配置 sourceThreadId/targetThreadIds，已仅生成草稿。";
    return taskCard;
  }
  if (!config.sourceThreadId || !config.targetThreadIds.length) {
    taskCard.ok = false;
    taskCard.status = "missing_thread_mapping";
    taskCard.message = "跨线程 task-card 需要明确 sourceThreadId 和 targetThreadIds，避免多 profile/多线程串线。";
    return taskCard;
  }
  const sendRequest = Object.assign({}, request, {
    sourceThreadId: config.sourceThreadId,
    targetThreadIds: config.targetThreadIds,
    pending: Boolean(config.pending),
    autoApprove: !config.pending,
  });
  const tempFile = path.join(os.tmpdir(), `home-ai-plugin-audit-card-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tempFile, `${JSON.stringify(sendRequest, null, 2)}\n`, "utf8");
  const taskCardEnv = Object.assign({}, process.env);
  if (!taskCardEnv.CODEX_MOBILE_BASE_URL) taskCardEnv.CODEX_MOBILE_BASE_URL = "http://127.0.0.1:8787";
  if (!taskCardEnv.CODEX_MOBILE_KEY_FILE) {
    taskCardEnv.CODEX_MOBILE_KEY_FILE = taskCardEnv.HERMES_MOBILE_CODEX_PLUGIN_ACCESS_KEY_PATH
      || taskCardEnv.HERMES_WEB_CODEX_PLUGIN_ACCESS_KEY_PATH
      || (taskCardEnv.HERMES_MOBILE_ROOT ? path.join(taskCardEnv.HERMES_MOBILE_ROOT, "data", "secrets", "codex-mobile-access-key.secret") : "");
  }
  try {
    const result = spawnSync(process.execPath, [config.script, "--json-file", tempFile], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: MAX_COMMAND_BYTES,
      env: taskCardEnv,
    });
    let response = {};
    try {
      response = JSON.parse(result.stdout || "{}");
    } catch (_) {
      response = { raw: clean(result.stdout, 4000) };
    }
    taskCard.request = sendRequest;
    taskCard.status = result.status === 0 && response.ok !== false ? "sent" : "failed";
    taskCard.ok = taskCard.status === "sent";
    taskCard.response = response;
    taskCard.error = taskCard.ok ? "" : clean(result.stderr || result.stdout, 4000);
    return taskCard;
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}

function buildCodexPrompt(job, audit) {
  const alignment = audit.mode === "alignment";
  return [
    alignment ? "你正在执行 Home AI 插件工作区目标一致性审计。" : "你正在执行 Home AI 插件工作区审计。",
    "",
    "硬性约束：",
    "- 这是只读审计。不要编辑文件、创建文件、安装包、运行迁移、提交、推送、部署、重启服务或修改数据库。",
    "- 只检查当前工作目录，最终回复中的路径使用相对路径。",
    "- 不要输出原始 secrets、tokens、private keys、环境变量值、subscription endpoints 或完整长日志。",
    "- 如果某项检查可能写入缓存或构建产物，跳过并说明原因。",
    "",
    "交付语言：",
    "- 最终审计结论必须使用简体中文。",
    "- 文件路径、函数名、变量名、错误码、命令、配置项和代码标识保持原文。",
    "",
    "审计口径：",
    alignment
      ? "- 先读取工作区文档目标，再对照实现状态，判断目标已实现、部分实现、未实现、实现偏离文档、文档过期和缺失测试。"
      : "- 优先指出具体 bug、回归风险、安全/隐私风险、数据丢失风险和缺失测试。",
    alignment
      ? "- 覆盖产品目标、安全/隐私、跨平台、部署产品化、扩展性、性能、UI/交互一致性和 Harness 覆盖。"
      : "",
    alignment
      ? "- 建议任务卡只能作为后续人工确认或独立线程执行的建议，不要在本审计中修改代码。"
      : "",
    "- 先列问题，按严重程度排序；能定位时给出文件/行号引用。",
    "- 回复保持精简。如果没有发现问题，明确说明，并列出剩余测试缺口。",
    "",
    alignment ? "优先阅读这些目标文档（如果存在）：" : "",
    alignment ? "- `.agent-context/PROJECT_CONTEXT.md`, `.agent-context/HANDOFF.md`, `docs/README.md`, `docs/DOCS_INDEX.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/TEST_MATRIX.md`。" : "",
    "",
    `Job id: ${clean(job.id, 80) || "unknown"}`,
    `插件：${audit.pluginTitle || audit.pluginId}`,
    `审计模式：${audit.mode}`,
    `版本：${audit.head || "unknown"}`,
    `分支：${audit.branch || "unknown"}`,
    "",
    "确定性预扫描摘要：",
    `- 最高严重级别：${audit.topSeverity}`,
    `- 问题数量：${audit.findingCount}`,
    audit.statusLines.length ? "- Git status:\n" + audit.statusLines.slice(0, 20).map((line) => `  - ${line}`).join("\n") : "- Git status: clean or unavailable",
    audit.diffStat.length ? "- Diff stat:\n" + audit.diffStat.slice(0, 20).map((line) => `  - ${line}`).join("\n") : "- Diff stat: none or unavailable",
    audit.sampledFiles.length ? "- 抽样文件:\n" + audit.sampledFiles.slice(0, 30).map((line) => `  - ${line}`).join("\n") : "",
  ].filter(Boolean).join("\n");
}

function runCodexReview(job, audit, workspacePath) {
  const config = codexAuditConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      ok: true,
      status: "disabled",
      output: "运行时配置未启用 Codex 只读审计。",
    };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-audit-codex-"));
  const finalMessagePath = path.join(tempDir, "last-message.txt");
  const args = [
    "exec",
    "--sandbox",
    "read-only",
    "--cd",
    workspacePath,
    "--ephemeral",
    "--ignore-user-config",
    "--output-last-message",
    finalMessagePath,
    "--color",
    "never",
    "--skip-git-repo-check",
  ];
  if (config.model) args.push("--model", config.model);
  args.push(buildCodexPrompt(job, audit));
  const codexHome = config.codexHome || path.join(os.homedir() || process.env.HOME || "", ".codex");
  const codexParentHome = codexHome.endsWith(`${path.sep}.codex`) ? path.dirname(codexHome) : (os.homedir() || process.env.HOME || "");
  try {
    const result = spawnSync(config.command, args, {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: config.timeoutMs,
      maxBuffer: MAX_CODEX_BYTES,
      env: Object.assign({}, process.env, {
        HOME: codexParentHome,
        CODEX_HOME: codexHome,
        NO_COLOR: "1",
        TERM: "dumb",
      }),
    });
    const finalMessage = fs.existsSync(finalMessagePath) ? fs.readFileSync(finalMessagePath, "utf8") : "";
    const stdout = redactWorkspacePath(clean(result.stdout, 12_000), workspacePath);
    const stderr = redactWorkspacePath(clean(result.stderr, 12_000), workspacePath);
    const output = redactWorkspacePath(clean(finalMessage || stdout, 80_000), workspacePath);
    const timedOut = result.error && result.error.code === "ETIMEDOUT";
    const status = timedOut ? "timeout" : (result.error ? clean(result.error.code || result.error.message, 120) : String(Number(result.status || 0)));
    const ok = result.status === 0 && !timedOut;
    return {
      enabled: true,
      ok,
      status,
      command: path.basename(config.command),
      output: output || "(Codex produced no final message.)",
      error: ok ? "" : stderr,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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

  if (!head.ok && !sample.files.length) {
    findings.push(finding("high", "工作区无法读取 Git 元数据且没有可抽样文件", [head.stderr || head.stdout, sample.error].filter(Boolean), "只读审计无法建立源码版本元数据，也无法用文件系统抽样继续审计。"));
  } else if (!head.ok) {
    findings.push(finding("info", "工作区没有 Git 元数据，已改用文件系统抽样", [head.stderr || head.stdout].filter(Boolean), "生产部署目录可能不包含 .git；runner 已继续读取有边界的文档和源码文件列表。"));
  }
  if (statusLines.length) {
    findings.push(finding("medium", "工作区存在未提交变更", statusLines.slice(0, 20), "只读审计结果可能包含尚未审查或推送的本地变更。"));
  }
  if (secretFiles.length) {
    findings.push(finding("high", "已跟踪文件名疑似包含敏感配置", secretFiles, "审计发现了常见于 secrets 的已跟踪文件名；未读取或打印文件内容。"));
  }
  if (todoHits.length) {
    findings.push(finding("low", "存在 TODO/FIXME 标记", todoHits, "这些标记可能代表计划内 backlog 或尚未完成的代码路径。"));
  }
  if (!findings.length) {
    findings.push(finding("info", "只读元数据扫描未发现确定性问题", [], "runner 已完成 Git 元数据和有边界的源码标记检查，未发现配置的风险标记。"));
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
      sampleSource: sample.source || (sample.ok ? "git" : "unknown"),
      sampledFileCount: sample.files.length,
      todoHitCount: todoHits.length,
      generatedAt: new Date().toISOString(),
    },
  };
  auditResult.codex = runCodexReview(job, auditResult, realPath);
  if (auditResult.codex.enabled && !auditResult.codex.ok) {
    auditResult.findings.unshift(finding(
      "high",
      "Codex 只读审计执行失败",
      [auditResult.codex.error || `status=${auditResult.codex.status}`],
      "确定性审计已完成，但配置的 Codex 只读执行器没有返回可用审计结论。",
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
    item.rationale ? `理由: ${item.rationale}` : "",
    item.evidence.length ? "证据:" : "",
    item.evidence.map((line) => `- \`${line.replace(/`/g, "'")}\``).join("\n"),
  ].filter(Boolean).join("\n\n")).join("\n\n");
  return [
    audit.mode === "alignment"
      ? `# 插件工作区目标一致性审计 - ${audit.pluginTitle || audit.pluginId}`
      : `# 插件工作区审计 - ${audit.pluginTitle || audit.pluginId}`,
    "",
    "## 摘要",
    "",
    `- 任务 id: ${clean(job.id, 80) || "unknown"}`,
    `- 插件: ${audit.pluginId}`,
    `- 目标工作区: ${audit.targetWorkspaceId || "owner"}`,
    `- 工作区路径引用: ${audit.pathRef}`,
    `- 审计模式: ${audit.mode}`,
    `- 版本: ${audit.head || "unknown"}`,
    `- 分支: ${audit.branch || "unknown"}`,
    `- 最高严重级别: ${audit.topSeverity}`,
    `- 问题数量: ${audit.findingCount}`,
    `- 生成时间: ${audit.diagnostics.generatedAt}`,
    "",
    "## 问题",
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
    "## 最近提交",
    "",
    markdownList(audit.recentLog),
    "",
    audit.mode === "alignment" ? "## 文档与实现抽样文件" : "## 抽样文件",
    "",
    markdownList(audit.sampledFiles.slice(0, 80)),
    "",
    "## Codex 只读审计",
    "",
    `- 已启用: ${audit.codex?.enabled ? "yes" : "no"}`,
    `- 状态: ${audit.codex?.status || "unknown"}`,
    audit.codex?.command ? `- 命令: ${audit.codex.command}` : "",
    audit.codex?.error ? "### 执行器诊断" : "",
    audit.codex?.error ? "```text\n" + audit.codex.error.replace(/```/g, "'''") + "\n```" : "",
    "### 审计结论",
    "",
    "```text",
    clean(audit.codex?.output || "No Codex review output.", 80_000).replace(/```/g, "'''"),
    "```",
    "",
    "## 只读约束",
    "",
    "- runner 只使用有边界的元数据和源码检查命令。",
    "- 未编辑文件、运行迁移、安装包、提交、推送、部署、重启服务或读取 secret 文件内容。",
    "- 报告有意省略目标工作区绝对路径，只显示配置的路径引用。",
    "",
    "## 跨线程任务卡",
    "",
    `- 状态: ${audit.taskCard?.status || "not_configured"}`,
    audit.taskCard?.message ? `- 说明: ${audit.taskCard.message}` : "",
    audit.taskCard?.request?.title ? `- 标题: ${audit.taskCard.request.title}` : "",
    audit.taskCard?.request?.targetThreadIds?.length ? `- 目标线程数: ${audit.taskCard.request.targetThreadIds.length}` : "",
    audit.taskCard?.error ? "### 发送诊断" : "",
    audit.taskCard?.error ? "```text\n" + audit.taskCard.error.replace(/```/g, "'''") + "\n```" : "",
  ].join("\n");
}

function auditReportTarget(job, audit, options = {}) {
  const jobId = safeSlug(job.id || "job", "job");
  const root = path.join(outputRoot(options), jobId);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const fileName = `plugin-workspace-audit-${safeSlug(audit.pluginId, "plugin")}-${stamp}.md`;
  const reportPath = path.join(root, fileName);
  return { root, reportPath, fileName };
}

function writeReport(reportTarget, markdown) {
  const reportPath = reportTarget.reportPath;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown, { encoding: "utf8", mode: 0o600 });
  return { reportPath, fileName: reportTarget.fileName };
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
      auditMode: audit.mode,
      triggerMode: clean(job.triggerMode || job.trigger_mode || job.audit?.triggerMode || job.audit?.trigger_mode || "scheduled", 80) || "scheduled",
      title: audit.findingCount ? `${audit.pluginTitle || audit.pluginId} audit needs review` : `${audit.pluginTitle || audit.pluginId} audit completed`,
      summary: audit.findingCount
        ? `${audit.findingCount} finding(s), top severity ${audit.topSeverity}.`
        : "Read-only plugin workspace audit completed without deterministic findings.",
      sourceRef: {
        automationId: clean(job.id, 80),
        jobId: clean(job.id, 80),
        auditMode: audit.mode,
        triggerMode: clean(job.triggerMode || job.trigger_mode || job.audit?.triggerMode || job.audit?.trigger_mode || "scheduled", 80) || "scheduled",
        reportUrl: `/api/automations/output?jobId=${encodeURIComponent(clean(job.id, 80))}&file=${encodeURIComponent(report.fileName)}`,
        latestDeliverable: {
          name: report.fileName,
          url: `/api/automations/output?jobId=${encodeURIComponent(clean(job.id, 80))}&file=${encodeURIComponent(report.fileName)}`,
          mime: "text/markdown; charset=utf-8",
        },
        latestDocumentName: report.fileName,
      },
      deepLink: `/api/automations/output?jobId=${encodeURIComponent(clean(job.id, 80))}&file=${encodeURIComponent(report.fileName)}`,
    });
  } finally {
    store.close();
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const job = readJob(options.jobFile);
  const audit = buildAudit(job);
  const reportTarget = auditReportTarget(job, audit, options);
  const report = { reportPath: reportTarget.reportPath, fileName: reportTarget.fileName };
  audit.taskCard = maybeSendAuditTaskCard(job, audit, report);
  const markdown = renderReport(job, audit);
  writeReport(reportTarget, markdown);
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
