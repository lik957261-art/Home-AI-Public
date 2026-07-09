"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  DEFAULT_PLUGIN_TARGETS,
} = require("./ai-ops-diagnostic-remediation-service");

const JOB_ID = "plugin_daily_progress_rollup";
const JOB_NAME = "插件每日进展汇总";
const DAILY_ANALYSIS_REASONING_EFFORT = "xhigh";
const DEFAULT_CADENCE = "30 23 * * *";
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const APP_WORKSPACE_CWD = "/Users/example/path";
const DEFAULT_PLUGIN_IDS = Object.freeze([
  "codex-mobile",
  "music",
  "movie",
  "wardrobe",
  "finance",
  "growth",
  "note",
  "email",
  "health",
  "moira",
]);
const TERMINAL_STATUSES = Object.freeze(["returned", "no_activity", "blocked", "stale_report", "missing_report"]);
const REUSABLE_ACTIVE_STATUSES = Object.freeze(["dispatched"]);
const REPORT_RETURN_STATUSES = Object.freeze(["returned", "blocked"]);
const PRIVATE_KEY_RE = /secret|token|cookie|password|access[_ -]?key|launch[_ -]?token|authorization|endpoint|payload|body|prompt|raw|log|screenshot|database|db|private/i;

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cleanBlock(value, max = 1200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 1200));
}

function safeToken(value, fallback = "unknown", max = 80) {
  const text = clean(value, max)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sha(value, chars = 12) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, chars);
}

function localDate(input, timeZone = DEFAULT_TIMEZONE) {
  const date = input instanceof Date ? input : new Date(input || Date.now());
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch (_err) {
    return date.toISOString().slice(0, 10);
  }
}

function runIdForDate(date) {
  return `${JOB_ID}_${String(date || "").replace(/[^0-9]/g, "")}`;
}

function defaultStateFile(options = {}) {
  const env = options.env || process.env;
  const explicit = clean(options.stateFile || env.HOMEAI_PLUGIN_DAILY_ROLLUP_STATE_FILE || "", 1000);
  if (explicit) return explicit;
  const dataDir = clean(options.dataDir || env.HERMES_WEB_DATA_DIR || env.HERMES_MOBILE_DATA_DIR || "", 1000);
  if (dataDir) return path.join(dataDir, "owner-governance", "plugin-daily-progress-rollup.json");
  return path.join(process.cwd(), ".agent-context", "plugin-daily-progress-rollup.json");
}

function readStateFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (_err) {}
  return { schemaVersion: 1, runs: {} };
}

function writeStateFile(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (_err) {}
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
  if (typeof value === "string") return cleanBlock(value, 600);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return clean(String(value), 120);
}

function normalizePluginTarget(pluginId, target = {}) {
  const id = safeToken(pluginId);
  const normalized = {
    pluginId: id,
    label: clean(target.label || id, 120),
    targetWorkspace: clean(target.targetWorkspace || target.targetWorkspaceCwd || target.cwd || "", 1000),
    targetThreadId: clean(target.targetThreadId || target.threadId || "", 180),
    targetThreadTitle: clean(target.targetThreadTitle || target.threadTitle || "", 180),
    targetThreadTitlePrefix: clean(target.targetThreadTitlePrefix || target.threadTitlePrefix || "", 180),
  };
  normalized.resolvable = Boolean(normalized.targetWorkspace && (
    normalized.targetThreadId || normalized.targetThreadTitle || normalized.targetThreadTitlePrefix
  ));
  normalized.issueCode = normalized.resolvable ? "" : "target_unresolved";
  return normalized;
}

function defaultPluginTargets() {
  const source = Object.assign({}, DEFAULT_PLUGIN_TARGETS);
  const out = {};
  for (const pluginId of DEFAULT_PLUGIN_IDS) {
    out[pluginId] = normalizePluginTarget(pluginId, source[pluginId] || {});
  }
  return out;
}

function normalizePluginTargets(targets = {}) {
  const source = Object.keys(targets).length ? targets : defaultPluginTargets();
  const out = [];
  const seen = new Set();
  for (const pluginId of DEFAULT_PLUGIN_IDS) {
    const target = source[pluginId] || {};
    const normalized = normalizePluginTarget(pluginId, target);
    if (!seen.has(normalized.pluginId)) {
      seen.add(normalized.pluginId);
      out.push(normalized);
    }
  }
  for (const [pluginId, target] of Object.entries(source)) {
    const normalized = normalizePluginTarget(pluginId, target);
    if (!seen.has(normalized.pluginId) && normalized.pluginId !== "healthy") {
      seen.add(normalized.pluginId);
      out.push(normalized);
    }
  }
  return out;
}

function summaryCardBody({ date, runId, plugin }) {
  return [
    `# 插件日报分析请求 - ${plugin.label}`,
    "",
    `Home AI 平台正在收集 ${date} 的插件日报，用于生成 Owner 可读的整体分析报告。`,
    "",
    "## 执行要求",
    "",
    "- 这是只读日报分析卡，不要求源码修改。",
    "- 不要部署、重启、提交、推送或读取私密内容。",
    "- 请使用最高等级推理完成分析，并用中文 terminal return 返回边界化元数据。",
    "- 如果今天无活动，请返回 `no_activity`，并说明当前状态和是否存在风险。",
    "",
    "## 请按这些中文小节返回",
    "",
    "- 今日核心进展：说明完成了什么，不要只列文件名。",
    "- 对用户或产品的实际影响：说明这些进展解决了什么问题、提升了什么能力。",
    "- 验证和部署状态：列出测试、构建、部署、读回的 bounded 状态。",
    "- 当前阻塞与风险：说明影响范围、是否影响生产闭环。",
    "- 重复问题或系统性问题：例如派卡、部署读回、权限、线程生命周期、状态账本问题。",
    "- 明日建议优先级：给出排序和理由。",
    "- 需要 Owner 审批或中央协助的事项：没有则写无。",
    "- 隐私边界确认：确认未包含私密原文或敏感载荷。",
    "",
    "## 隐私边界",
    "",
    "不要包含原始日志、密钥、Cookie、启动令牌、访问密钥、接口正文、私有线程正文、数据库行、供应商载荷、含私密信息截图、完整提示词或长 diff。",
    "",
    "## 关联信息",
    "",
    `rollupRunId: ${runId}`,
    `rollupDate: ${date}`,
    `pluginId: ${plugin.pluginId}`,
  ].join("\n");
}

function targetThreadIdForDispatch(plugin) {
  if (plugin.targetThreadTitle || plugin.targetThreadTitlePrefix) return "";
  return plugin.targetThreadId || "";
}

function targetThreadTitleForDispatch(plugin) {
  return plugin.targetThreadTitle || "";
}

function requestIdForDispatch({ date, plugin, dispatchAttempt }) {
  const base = `${JOB_ID}:${date}:${plugin.pluginId}`;
  const attempt = Math.max(1, Number(dispatchAttempt) || 1);
  return attempt > 1 ? `${base}:attempt${attempt}` : base;
}

function hasReusableReport(entry = {}) {
  const status = clean(entry.status, 80);
  return Boolean(entry.return && REPORT_RETURN_STATUSES.includes(status));
}

function hasReusableActiveCard(entry = {}) {
  const status = clean(entry.status, 80);
  return Boolean(entry.taskCardId && REUSABLE_ACTIVE_STATUSES.includes(status) && !entry.return);
}

function duplicateSuppressedEntry(entry, reason) {
  return Object.assign({}, entry, {
    duplicateSuppressed: true,
    duplicateSuppressedReason: reason,
  });
}

function nextDispatchAttempt(entry = {}, force = false) {
  if (!entry || force) return Math.max(1, Number(entry?.dispatchAttempt || 0) + 1);
  if (!entry.taskCardId && !entry.issueCode && !entry.status) return 1;
  return Math.max(2, Number(entry.dispatchAttempt || 1) + 1);
}

function buildDispatchCard({ date, runId, plugin, sourceThread, dispatchAttempt }) {
  return {
    title: `插件日报分析 - ${plugin.label} - ${date}`,
    summary: `请 ${plugin.label} 返回 ${date} 的中文日报分析，用于 Home AI 生成 Owner 总体报告。`,
    body: summaryCardBody({ date, runId, plugin }),
    cardKind: "plugin_daily_progress_rollup",
    category: "governance",
    pluginId: plugin.pluginId,
    sourceWorkspaceCwd: sourceThread.sourceWorkspaceCwd || APP_WORKSPACE_CWD,
    sourceThreadId: sourceThread.sourceThreadId || "",
    sourceThreadTitle: sourceThread.sourceThreadTitle || "",
    sourceThreadTitlePrefix: sourceThread.sourceThreadTitlePrefix || "Home AI",
    replyToThreadId: sourceThread.replyToThreadId || sourceThread.sourceThreadId || "",
    replyToThreadTitle: sourceThread.replyToThreadTitle || sourceThread.sourceThreadTitle || "",
    replyToThreadTitlePrefix: sourceThread.replyToThreadTitlePrefix || sourceThread.sourceThreadTitlePrefix || "Home AI",
    targetWorkspaceCwd: plugin.targetWorkspace,
    targetWorkspace: plugin.targetWorkspace,
    targetThreadId: targetThreadIdForDispatch(plugin),
    targetThreadTitle: targetThreadTitleForDispatch(plugin),
    targetThreadTitlePrefix: plugin.targetThreadTitlePrefix,
    requestId: requestIdForDispatch({ date, plugin, dispatchAttempt }),
    workflowMode: "manual",
    reasoningEffort: DAILY_ANALYSIS_REASONING_EFFORT,
  };
}

function emptyRun({ date, nowIso, triggerSource, stateFile }) {
  const runId = runIdForDate(date);
  return {
    runId,
    date,
    jobId: JOB_ID,
    jobName: JOB_NAME,
    cadence: DEFAULT_CADENCE,
    timezone: DEFAULT_TIMEZONE,
    triggerSource: clean(triggerSource || "scheduled", 80),
    createdAt: nowIso,
    updatedAt: nowIso,
    status: "running",
    stateFile,
    plugins: {},
    report: null,
  };
}

function normalizeReturn(input = {}) {
  const status = clean(input.status || input.terminalStatus || input.terminal_status || "returned", 80);
  return redact({
    status: TERMINAL_STATUSES.includes(status) ? status : "returned",
    completedWork: arrayValue(input.completedWork || input.completed_work).map((item) => clean(item, 220)).slice(0, 12),
    commits: arrayValue(input.commits || input.refs).map((item) => clean(item, 120)).slice(0, 12),
    changedFiles: arrayValue(input.changedFiles || input.changed_files || input.modules).map((item) => clean(item, 180)).slice(0, 20),
    validation: cleanBlock(input.validation || input.tests || input.testStatus || input.test_status || "", 600),
    deployReadback: cleanBlock(input.deployReadback || input.deploy_readback || input.deployStatus || input.deploy_status || "", 400),
    productImpact: cleanBlock(input.productImpact || input.product_impact || input.actualImpact || input.actual_impact || "", 500),
    blockers: arrayValue(input.blockers).map((item) => clean(item, 220)).slice(0, 12),
    risks: arrayValue(input.risks).map((item) => clean(item, 220)).slice(0, 12),
    repeatedIssues: arrayValue(input.repeatedIssues || input.repeated_issues || input.systemicIssues || input.systemic_issues).map((item) => clean(item, 220)).slice(0, 12),
    ownerApprovalsNeeded: arrayValue(input.ownerApprovalsNeeded || input.owner_approvals_needed).map((item) => clean(item, 180)).slice(0, 12),
    centralHelpRequested: arrayValue(input.centralHelpRequested || input.central_help_requested).map((item) => clean(item, 180)).slice(0, 12),
    nextFocus: cleanBlock(input.nextFocus || input.next_focus || input.tomorrowPriority || input.tomorrow_priority || input.tomorrow || "", 400),
    summary: cleanBlock(input.summary || "", 500),
    returnedAt: clean(input.returnedAt || input.returned_at || "", 80),
    taskCardId: clean(input.taskCardId || input.task_card_id || "", 160),
  });
}

function statusCounts(run = {}) {
  const counts = {
    selected: 0,
    dispatched: 0,
    returned: 0,
    no_activity: 0,
    missing_report: 0,
    stale_report: 0,
    blocked: 0,
    target_unresolved: 0,
    dispatch_failed: 0,
    pending: 0,
  };
  for (const plugin of Object.values(run.plugins || {})) {
    counts.selected += 1;
    const status = clean(plugin.status, 80);
    if (counts[status] != null) counts[status] += 1;
    if (status === "returned" && plugin.return?.status === "no_activity") counts.no_activity += 1;
    if (status === "dispatched") counts.pending += 1;
  }
  return counts;
}

const STATUS_LABELS = Object.freeze({
  running: "运行中",
  collecting: "正在收集",
  report_ready: "报告已生成",
  dispatched: "已派卡待返回",
  returned: "已返回",
  no_activity: "无活动",
  missing_report: "缺失报告",
  stale_report: "报告过期",
  blocked: "阻塞",
  target_unresolved: "目标未解析",
  dispatch_failed: "派卡失败",
  pending: "待返回",
});

function statusLabel(status) {
  return STATUS_LABELS[clean(status, 80)] || clean(status || "未知", 80);
}

function pluginDisplayName(plugin = {}) {
  const label = clean(plugin.label || "", 120);
  const id = clean(plugin.pluginId || "", 120);
  return label && label !== id ? `${label}（${id}）` : id || label || "未知工作区";
}

function lineItems(items, emptyText) {
  const lines = arrayValue(items).filter(Boolean).slice(0, 24);
  return lines.length ? lines.map((item) => `- ${item}`) : [`- ${emptyText}`];
}

function appendPrefixed(out, plugin, values, formatter) {
  for (const value of arrayValue(values)) {
    const text = cleanBlock(value, 400);
    if (text) out.push(formatter(pluginDisplayName(plugin), text));
  }
}

function buildReportFacts(plugins) {
  const facts = {
    completed: [],
    impact: [],
    validation: [],
    deployReadback: [],
    blockers: [],
    risks: [],
    repeatedIssues: [],
    approvals: [],
    centralHelp: [],
    nextFocus: [],
    issueCodes: [],
  };
  for (const plugin of plugins) {
    const ret = objectValue(plugin.return);
    appendPrefixed(facts.completed, plugin, ret.completedWork, (name, text) => `${name}：${text}`);
    if (ret.summary) facts.completed.push(`${pluginDisplayName(plugin)}：${ret.summary}`);
    if (ret.productImpact) facts.impact.push(`${pluginDisplayName(plugin)}：${ret.productImpact}`);
    if (ret.validation) facts.validation.push(`${pluginDisplayName(plugin)}：${ret.validation}`);
    if (ret.deployReadback) facts.deployReadback.push(`${pluginDisplayName(plugin)}：${ret.deployReadback}`);
    appendPrefixed(facts.blockers, plugin, ret.blockers, (name, text) => `${name}：${text}`);
    appendPrefixed(facts.risks, plugin, ret.risks, (name, text) => `${name}：${text}`);
    appendPrefixed(facts.repeatedIssues, plugin, ret.repeatedIssues, (name, text) => `${name}：${text}`);
    appendPrefixed(facts.approvals, plugin, ret.ownerApprovalsNeeded, (name, text) => `${name}：${text}`);
    appendPrefixed(facts.centralHelp, plugin, ret.centralHelpRequested, (name, text) => `${name}：${text}`);
    if (ret.nextFocus) facts.nextFocus.push(`${pluginDisplayName(plugin)}：${ret.nextFocus}`);
    if (plugin.issueCode) facts.issueCodes.push(`${pluginDisplayName(plugin)}：问题代码 \`${clean(plugin.issueCode, 120)}\``);
  }
  return facts;
}

function overallStatusText(counts) {
  if (counts.blocked || counts.dispatch_failed || counts.target_unresolved) return "需要关注";
  if (counts.missing_report || counts.stale_report) return "信息不完整";
  if (counts.pending) return "等待回报";
  if (counts.selected && counts.returned >= counts.selected) return "报告完整";
  return "运行中";
}

function executiveSummary(run, counts, facts) {
  const status = overallStatusText(counts);
  const coverage = `本次日报覆盖 ${counts.selected} 个工作区，已返回 ${counts.returned} 个，其中无活动 ${counts.no_activity} 个，待返回 ${counts.pending} 个，缺失 ${counts.missing_report} 个，过期 ${counts.stale_report} 个，阻塞 ${counts.blocked} 个，目标未解析 ${counts.target_unresolved} 个，派卡失败 ${counts.dispatch_failed} 个。`;
  const progress = facts.completed.length
    ? `已返回内容显示今天至少形成 ${facts.completed.length} 条可归纳进展，主要价值集中在功能交付、验证闭环和治理状态透明化。`
    : "当前还没有足够的已返回成果可做完整归纳，报告可信度主要受待返回或缺失工作区影响。";
  const risk = (facts.blockers.length || facts.risks.length || counts.dispatch_failed || counts.target_unresolved)
    ? "需要优先关注阻塞、目标解析、派卡和部署读回类问题，避免日报链路只完成派发而没有形成可闭环的 Owner 决策材料。"
    : "目前未从结构化返回中看到需要立即升级的阻塞，但仍需等待未返回工作区补齐信息。";
  return `总体状态为“${status}”。${coverage}${progress}${risk}`;
}

function systemicIssueLines(counts, facts) {
  const lines = [];
  if (counts.target_unresolved) lines.push(`目标解析仍是系统性风险：${counts.target_unresolved} 个工作区未解析到可投递目标，需要修复 registry 或线程生命周期状态。`);
  if (counts.dispatch_failed) lines.push(`派卡链路存在系统性风险：${counts.dispatch_failed} 个工作区派卡失败，需要检查 task-card transport、idempotency 和目标状态。`);
  if (counts.missing_report || counts.stale_report || counts.pending) lines.push(`日报完整性仍不足：${counts.pending} 个待返回、${counts.missing_report} 个缺失、${counts.stale_report} 个过期；总体报告应按当前可信度阅读。`);
  if (facts.repeatedIssues.length) lines.push(...facts.repeatedIssues.slice(0, 10));
  if (facts.deployReadback.some((item) => /deploy|部署|readback|读回/i.test(item))) lines.push("部署和读回仍是需要持续追踪的闭环点：已返回内容中出现部署/读回状态，建议明日优先核实是否已经进入生产可见状态。");
  if (!lines.length) lines.push("未从当前结构化返回中发现重复性系统问题；主要后续工作是等待未返回工作区补齐日报。");
  return lines;
}

function priorityLines(counts, facts) {
  const lines = [];
  if (counts.target_unresolved || counts.dispatch_failed) lines.push("第一优先级：修复日报派发和目标解析问题，确保所有受治理工作区都能收到并返回日报。");
  if (facts.blockers.length || facts.risks.length) lines.push("第二优先级：处理已返回阻塞和风险，尤其是会影响生产部署、读回或 Owner 决策的事项。");
  if (facts.validation.length || facts.deployReadback.length) lines.push("第三优先级：把已完成源码验证推进到部署读回闭环，避免只停留在本地测试通过。");
  if (facts.nextFocus.length) lines.push(...facts.nextFocus.slice(0, 10));
  if (!lines.length) lines.push("明日建议先补齐缺失工作区日报，再根据完整信息排序 repair、audit、deploy 或 no-action。");
  return lines;
}

function reportNeedsCollection(run = {}, counts = statusCounts(run)) {
  return counts.pending > 0 && clean(run.status, 80) !== "report_ready";
}

function pluginDetail(plugin) {
  const ret = objectValue(plugin.return);
  const progress = arrayValue(ret.completedWork).length ? arrayValue(ret.completedWork).join("；") : ret.summary || "尚未返回可归纳进展。";
  const impact = ret.productImpact || "未提供明确用户或产品影响，需要后续日报补充。";
  const validation = ret.validation || ret.deployReadback || "未提供验证或部署读回状态。";
  const risks = [...arrayValue(ret.blockers), ...arrayValue(ret.risks)];
  const riskText = risks.length ? risks.join("；") : plugin.issueCode ? `存在问题代码 \`${clean(plugin.issueCode, 120)}\`。` : "未报告阻塞或风险。";
  const next = ret.nextFocus || "等待该工作区补充下一步优先级，或由 Home AI 根据整体风险排序。";
  return [
    `### ${pluginDisplayName(plugin)}`,
    "",
    `- 状态：${statusLabel(plugin.status)}${plugin.issueCode ? `（问题代码：\`${clean(plugin.issueCode, 120)}\`）` : ""}`,
    `- 进展分析：${cleanBlock(progress, 700)}`,
    `- 价值判断：${cleanBlock(impact, 500)}`,
    `- 验证/部署：${cleanBlock(validation, 500)}`,
    `- 风险/阻塞：${cleanBlock(riskText, 500)}`,
    `- 下一步：${cleanBlock(next, 500)}`,
  ].join("\n");
}

function generateReport(run = {}) {
  const counts = statusCounts(run);
  const plugins = Object.values(run.plugins || {}).sort((a, b) => clean(a.pluginId).localeCompare(clean(b.pluginId)));
  const facts = buildReportFacts(plugins);
  const recommendations = priorityLines(counts, facts);
  const integrityIssues = [
    counts.pending ? `${counts.pending} 个工作区仍待返回` : "",
    counts.missing_report ? `${counts.missing_report} 个工作区缺失报告` : "",
    counts.stale_report ? `${counts.stale_report} 个工作区报告过期` : "",
    counts.target_unresolved ? `${counts.target_unresolved} 个工作区目标未解析` : "",
    counts.dispatch_failed ? `${counts.dispatch_failed} 个工作区派卡失败` : "",
  ].filter(Boolean);
  const markdown = [
    `# 工作区日报 - ${run.date}`,
    "",
    `运行编号：${run.runId || "未知"}`,
    `报告状态：${statusLabel(run.status || "running")}`,
    "",
    "## 执行摘要",
    "",
    executiveSummary(run, counts, facts),
    "",
    "## 全局状态概览",
    "",
    `本次选择 ${counts.selected} 个工作区；已返回 ${counts.returned} 个；无活动 ${counts.no_activity} 个；待返回 ${counts.pending} 个；缺失 ${counts.missing_report} 个；过期 ${counts.stale_report} 个；阻塞 ${counts.blocked} 个；目标未解析 ${counts.target_unresolved} 个；派卡失败 ${counts.dispatch_failed} 个。`,
    "",
    "## 关键成果分析",
    "",
    facts.completed.length
      ? "已返回工作区的进展说明今天存在可验证推进。下面按工作区归纳核心成果，并结合后续详析判断其产品价值。"
      : "目前缺少足够的已返回进展，不能把未返回工作区默认为无风险或无进展。",
    ...lineItems(facts.completed, "尚未收到可归纳的核心成果。"),
    "",
    "## 产品价值与稳定性影响",
    "",
    ...lineItems(facts.impact, "已返回内容未明确说明用户或产品影响；后续日报需要补充价值判断，而不只是列出文件或提交。"),
    "",
    "## 风险与阻塞分析",
    "",
    ...lineItems([...facts.blockers, ...facts.risks, ...facts.issueCodes], "当前结构化返回中未报告明确阻塞；仍需等待未返回工作区补齐信息。"),
    "",
    "## 系统性问题",
    "",
    ...lineItems(systemicIssueLines(counts, facts), "未发现系统性问题。"),
    "",
    "## 明日优先级建议",
    "",
    ...lineItems(recommendations, "明日先补齐缺失日报，再按风险排序后续 repair/audit/deploy。"),
    "",
    "## 需要 Owner 审批或中央协助",
    "",
    ...lineItems([...facts.approvals, ...facts.centralHelp], "当前已返回内容未提出 Owner 审批或中央协助请求。"),
    "",
    "## 各工作区详析",
    "",
    ...(plugins.length ? plugins.map(pluginDetail) : ["尚未选择工作区，无法生成详析。"]),
    "",
    "## 数据完整性说明",
    "",
    integrityIssues.length
      ? `本报告仍有数据完整性限制：${integrityIssues.join("；")}。这些限制会降低总体判断可信度，不能把未返回或未解析工作区视为已完成。`
      : "本次日报没有缺失、过期、派卡失败或目标未解析记录，数据完整性满足 Owner 日报阅读要求。",
    "",
    "## 隐私边界",
    "",
    "本报告仅使用边界化元数据和工作区返回摘要，不包含原始插件线程正文、原始任务正文、原始日志、密钥、Cookie、启动令牌、接口正文、数据库行、供应商载荷、完整提示词、含私密信息截图或长 diff。",
  ].join("\n");
  return {
    generatedAt: run.updatedAt || run.createdAt || "",
    reportKind: "final_analysis",
    final: true,
    awaitingPluginReturns: false,
    counts,
    recommendations: recommendations.slice(0, 20),
    markdownPreview: markdown.slice(0, 12000),
    reportLocation: `state:${run.stateFile || "plugin-daily-progress-rollup"}/runs/${run.runId}/report`,
  };
}

function publicRun(run = {}) {
  const plugins = Object.values(run.plugins || {}).map((plugin) => ({
    pluginId: plugin.pluginId,
    label: plugin.label,
    status: plugin.status,
    issueCode: plugin.issueCode || "",
    taskCardId: plugin.taskCardId || "",
    targetThreadId: plugin.targetThreadId || "",
    targetThreadTitle: plugin.targetThreadTitle || plugin.targetThreadTitlePrefix || "",
    targetThreadTitlePrefix: plugin.targetThreadTitlePrefix || "",
    targetWorkspace: plugin.targetWorkspace || "",
    dispatchAttempt: plugin.dispatchAttempt || 0,
    duplicateSuppressed: plugin.duplicateSuppressed === true,
    duplicateSuppressedReason: plugin.duplicateSuppressedReason || "",
    requestId: plugin.requestId || "",
    returnedAt: plugin.return?.returnedAt || "",
  })).sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  return {
    runId: run.runId,
    date: run.date,
    jobId: run.jobId || JOB_ID,
    jobName: run.jobName || JOB_NAME,
    cadence: run.cadence || DEFAULT_CADENCE,
    timezone: run.timezone || DEFAULT_TIMEZONE,
    triggerSource: run.triggerSource || "",
    status: run.status || "",
    createdAt: run.createdAt || "",
    updatedAt: run.updatedAt || "",
    selectedPluginCount: plugins.length,
    counts: statusCounts(run),
    plugins,
    report: reportNeedsCollection(run) ? null : (run.report || generateReport(run)),
  };
}

function createPluginDailyProgressRollupService(options = {}) {
  const stateFile = defaultStateFile(options);
  const pluginTargets = options.pluginTargets || defaultPluginTargets();
  const taskCardService = options.taskCardService || null;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const nowDate = typeof options.nowDate === "function" ? options.nowDate : () => new Date();
  const sourceThread = {
    sourceWorkspaceCwd: options.sourceWorkspaceCwd || APP_WORKSPACE_CWD,
    sourceThreadId: options.sourceThreadId || "",
    sourceThreadTitle: options.sourceThreadTitle || "",
    sourceThreadTitlePrefix: options.sourceThreadTitlePrefix || "Home AI",
    replyToThreadId: options.replyToThreadId || "",
    replyToThreadTitle: options.replyToThreadTitle || "",
    replyToThreadTitlePrefix: options.replyToThreadTitlePrefix || "Home AI",
  };

  function readState() {
    const state = readStateFile(stateFile);
    if (!state.runs || typeof state.runs !== "object" || Array.isArray(state.runs)) state.runs = {};
    return state;
  }

  function writeState(state) {
    writeStateFile(stateFile, state);
  }

  function scheduledJobDescriptor() {
    return {
      id: JOB_ID,
      name: JOB_NAME,
      cadence: "daily",
      schedule: DEFAULT_CADENCE,
      timezone: DEFAULT_TIMEZONE,
      script: "plugin-daily-progress-rollup-cron.sh",
      ownerPrincipalId: "owner",
      stateFile,
    };
  }

  function targets() {
    return normalizePluginTargets(pluginTargets);
  }

  function status(input = {}) {
    const state = readState();
    const date = clean(input.date || localDate(nowDate(), DEFAULT_TIMEZONE), 40);
    const run = state.runs[runIdForDate(date)] || null;
    const latest = Object.values(state.runs)
      .sort((a, b) => clean(b.updatedAt || b.createdAt).localeCompare(clean(a.updatedAt || a.createdAt)))[0] || null;
    return {
      ok: true,
      job: scheduledJobDescriptor(),
      stateFile,
      targetCount: targets().length,
      current: run ? publicRun(run) : null,
      latest: latest ? publicRun(latest) : null,
    };
  }

  async function dispatchPluginCard(run, plugin, optionsForRun = {}) {
    const existing = run.plugins[plugin.pluginId];
    if (!optionsForRun.force && hasReusableReport(existing)) {
      return duplicateSuppressedEntry(existing, "report_already_returned");
    }
    if (!optionsForRun.force && hasReusableActiveCard(existing)) {
      return duplicateSuppressedEntry(existing, "active_card_already_dispatched");
    }
    if (!plugin.resolvable) {
      return {
        pluginId: plugin.pluginId,
        label: plugin.label,
        status: "target_unresolved",
        issueCode: plugin.issueCode || "target_unresolved",
        targetWorkspace: plugin.targetWorkspace,
      };
    }
    const dispatchAttempt = nextDispatchAttempt(existing, optionsForRun.force);
    const card = buildDispatchCard({ date: run.date, runId: run.runId, plugin, sourceThread, dispatchAttempt });
    if (optionsForRun.dryRun) {
      return {
        pluginId: plugin.pluginId,
        label: plugin.label,
        status: "dispatched",
        dryRun: true,
        dispatchAttempt,
        requestId: card.requestId,
        taskCardId: `dry_${sha(card.requestId)}`,
        targetThreadId: card.targetThreadId,
        targetThreadTitle: card.targetThreadTitle || plugin.targetThreadTitle,
        targetThreadTitlePrefix: plugin.targetThreadTitlePrefix,
      };
    }
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return {
        pluginId: plugin.pluginId,
        label: plugin.label,
        status: "dispatch_failed",
        issueCode: "task_card_service_unavailable",
        dispatchAttempt,
        requestId: card.requestId,
      };
    }
    try {
      const sent = await Promise.resolve(taskCardService.sendTaskCard(card));
      return {
        pluginId: plugin.pluginId,
        label: plugin.label,
        status: "dispatched",
        dispatchAttempt,
        requestId: card.requestId,
        taskCardId: arrayValue(sent.cardIds)[0] || "",
        targetThreadId: clean(sent.targetThreadId || plugin.targetThreadId, 180),
        targetThreadTitle: clean(sent.targetThread?.title || plugin.targetThreadTitle || plugin.targetThreadTitlePrefix, 180),
        targetWorkspace: clean(sent.targetThread?.cwd || plugin.targetWorkspace, 1000),
        sentAt: nowIso(),
      };
    } catch (err) {
      return {
        pluginId: plugin.pluginId,
        label: plugin.label,
        status: clean(err?.code, 120) === "target_thread_archived" ? "target_unresolved" : "dispatch_failed",
        issueCode: clean(err?.code || "task_card_dispatch_failed", 120),
        dispatchAttempt,
        requestId: card.requestId,
        targetThreadId: plugin.targetThreadId,
        targetThreadTitle: plugin.targetThreadTitle || plugin.targetThreadTitlePrefix,
      };
    }
  }

  async function trigger(input = {}) {
    const date = clean(input.date || localDate(nowDate(), DEFAULT_TIMEZONE), 40);
    const triggerSource = clean(input.triggerSource || input.trigger_source || (input.manual ? "manual" : "scheduled"), 80);
    const state = readState();
    const runId = runIdForDate(date);
    const now = nowIso();
    const run = state.runs[runId] || emptyRun({ date, nowIso: now, triggerSource, stateFile });
    run.triggerSource = triggerSource;
    run.updatedAt = now;
    run.status = "collecting";
    for (const plugin of targets()) {
      run.plugins[plugin.pluginId] = await dispatchPluginCard(run, plugin, input);
    }
    const counts = statusCounts(run);
    run.status = counts.pending ? "collecting" : "report_ready";
    run.report = counts.pending ? null : generateReport(run);
    state.runs[runId] = run;
    writeState(state);
    return {
      ok: true,
      duplicateSuppressed: Object.values(run.plugins).some((plugin) => plugin.duplicateSuppressed),
      run: publicRun(run),
    };
  }

  function recordReturn(input = {}) {
    const date = clean(input.date || localDate(nowDate(), DEFAULT_TIMEZONE), 40);
    const pluginId = safeToken(input.pluginId || input.plugin_id, "", 80);
    if (!pluginId) {
      const err = new Error("plugin_id_required");
      err.status = 400;
      err.code = "plugin_id_required";
      throw err;
    }
    const state = readState();
    const runId = clean(input.runId || input.run_id || runIdForDate(date), 120);
    const run = state.runs[runId];
    if (!run) {
      const err = new Error("rollup_run_not_found");
      err.status = 404;
      err.code = "rollup_run_not_found";
      throw err;
    }
    const current = run.plugins[pluginId] || {
      pluginId,
      label: clean(input.label || pluginId, 120),
      status: "returned",
    };
    const ret = normalizeReturn(Object.assign({}, input.return || {}, input));
    current.status = ret.status === "no_activity" ? "returned" : ret.status;
    current.return = Object.assign({}, ret, {
      returnedAt: ret.returnedAt || nowIso(),
    });
    if (ret.taskCardId) current.taskCardId = ret.taskCardId;
    run.plugins[pluginId] = current;
    run.updatedAt = nowIso();
    const counts = statusCounts(run);
    run.status = counts.pending ? "collecting" : "report_ready";
    run.report = counts.pending ? null : generateReport(run);
    state.runs[runId] = run;
    writeState(state);
    return { ok: true, run: publicRun(run), plugin: publicRun(run).plugins.find((item) => item.pluginId === pluginId) };
  }

  function finalize(input = {}) {
    const date = clean(input.date || localDate(nowDate(), DEFAULT_TIMEZONE), 40);
    const state = readState();
    const runId = clean(input.runId || input.run_id || runIdForDate(date), 120);
    const run = state.runs[runId];
    if (!run) {
      const err = new Error("rollup_run_not_found");
      err.status = 404;
      err.code = "rollup_run_not_found";
      throw err;
    }
    const terminalizeAs = clean(input.missingStatus || input.missing_status || "missing_report", 80);
    for (const plugin of Object.values(run.plugins || {})) {
      if (plugin.status === "dispatched") plugin.status = terminalizeAs === "stale_report" ? "stale_report" : "missing_report";
    }
    run.status = "report_ready";
    run.updatedAt = nowIso();
    run.report = generateReport(run);
    state.runs[runId] = run;
    writeState(state);
    return { ok: true, run: publicRun(run) };
  }

  return {
    jobId: JOB_ID,
    jobName: JOB_NAME,
    stateFile,
    scheduledJobDescriptor,
    targets,
    status,
    trigger,
    recordReturn,
    finalize,
    generateReport,
  };
}

module.exports = {
  DEFAULT_CADENCE,
  DEFAULT_PLUGIN_IDS,
  DEFAULT_TIMEZONE,
  JOB_ID,
  JOB_NAME,
  clean,
  createPluginDailyProgressRollupService,
  defaultStateFile,
  generateReport,
  localDate,
  normalizePluginTargets,
  normalizeReturn,
  runIdForDate,
  statusCounts,
};
