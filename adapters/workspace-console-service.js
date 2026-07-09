"use strict";

const {
  DEFAULT_PLUGIN_TARGETS,
} = require("./ai-ops-diagnostic-remediation-service");

const WORKSPACE_CONSOLE_VERSION = "20260708-codex-workspace-console-v2";

const DEFAULT_CODEX_WORKSPACE_ORDER = Object.freeze([
  "home-ai",
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

const CODEX_WORKSPACE_ALIASES = Object.freeze({
  homeai: "home-ai",
  healthy: "health",
});

const DEPLOY_LANE_BY_WORKSPACE = Object.freeze({
  "codex-mobile": "Codex Mobile Deploy Lane",
  movie: "Movie Deploy Lane",
});

const STATUS_LABELS = Object.freeze({
  ok: "正常",
  online: "在线",
  warning: "注意",
  pending: "待配置",
  stale: "过期",
  offline: "离线",
  blocked: "阻塞",
  unknown: "未知",
});

const STATUS_RANK = Object.freeze({
  ok: 0,
  online: 0,
  pending: 1,
  warning: 1,
  stale: 1,
  offline: 2,
  blocked: 3,
  unknown: 1,
});

function cleanString(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cleanList(values, maxItems = 12, maxLength = 120) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    const value = cleanString(item, maxLength);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function safePathLabel(value) {
  const raw = cleanString(value, 600);
  if (!raw) return "";
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-2).join("/");
  if (/^(?:[A-Za-z]:\\|\\\\|\/)/.test(raw)) return tail ? `.../${tail}` : "hidden";
  return raw.slice(0, 160);
}

function statusLabel(status) {
  const normalized = cleanString(status, 40).toLowerCase();
  return STATUS_LABELS[normalized] || STATUS_LABELS.unknown;
}

function statusRank(status) {
  const normalized = cleanString(status, 40).toLowerCase();
  return Object.prototype.hasOwnProperty.call(STATUS_RANK, normalized) ? STATUS_RANK[normalized] : STATUS_RANK.unknown;
}

function worstStatus(statuses) {
  let selected = "ok";
  for (const status of statuses || []) {
    const value = cleanString(status, 40).toLowerCase();
    if (!value) continue;
    if (statusRank(value) > statusRank(selected)) selected = value;
  }
  return selected;
}

function boundedRecord(source, allowedKeys = []) {
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const key of allowedKeys) {
    const value = source[key];
    if (value == null || value === "") continue;
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else out[key] = cleanString(value, 240);
  }
  return out;
}

function canonicalCodexWorkspaceId(value) {
  const id = cleanString(value, 100)
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return CODEX_WORKSPACE_ALIASES[id] || id || "workspace";
}

function lanePlan(status, label = "", extra = {}) {
  const normalized = cleanString(status || "unknown", 40).toLowerCase() || "unknown";
  return Object.freeze(Object.assign({
    status: normalized,
    statusLabel: statusLabel(normalized),
    label: cleanString(label || "", 160),
  }, extra));
}

function codexWorkspaceDeployLane(pluginId, target = {}) {
  const explicit = cleanString(target.deployLaneTitle || target.deployThreadTitle || target.deployLane || "", 160);
  const label = explicit || DEPLOY_LANE_BY_WORKSPACE[pluginId] || "Home AI Deploy lane pool";
  return lanePlan("ok", label, {
    policy: explicit ? "explicit" : "contract_default",
  });
}

function threadPlan(target = {}) {
  const threadId = cleanString(target.targetThreadId || target.sourceThreadId || target.threadId || "", 180);
  const title = cleanString(target.targetThreadTitle || target.sourceThreadTitle || target.threadTitle || "", 180);
  const titlePrefix = cleanString(target.targetThreadTitlePrefix || target.sourceThreadTitlePrefix || target.threadTitlePrefix || "", 180);
  const label = title || titlePrefix || (threadId ? "thread id configured" : "");
  const status = label || threadId ? "ok" : "warning";
  return lanePlan(status, label || "未解析", {
    threadIdPresent: Boolean(threadId),
    titlePrefix,
  });
}

function workerLanePlan(target = {}) {
  const threadId = cleanString(target.workerLaneThreadId || target.workerThreadId || "", 180);
  const title = cleanString(target.workerLaneTitle || target.workerThreadTitle || "", 180);
  const titlePrefix = cleanString(target.workerLaneTitlePrefix || target.workerThreadTitlePrefix || "", 180);
  const label = title || titlePrefix || (threadId ? "worker lane configured" : "");
  if (label || threadId) {
    return lanePlan("ok", label, { threadIdPresent: Boolean(threadId), titlePrefix });
  }
  return lanePlan("warning", "未配置", { issueCode: "worker_lane_missing" });
}

function auditLanePlan(target = {}) {
  const title = cleanString(target.auditLaneTitle || target.auditThreadTitle || "", 180);
  const titlePrefix = cleanString(target.auditLaneTitlePrefix || target.auditThreadTitlePrefix || "", 180);
  if (title || titlePrefix) return lanePlan("ok", title || titlePrefix, { titlePrefix });
  return lanePlan("unknown", "未配置");
}

function normalizeCodexWorkspaceTargets(targets = {}) {
  const source = Object.assign({}, DEFAULT_PLUGIN_TARGETS, targets || {});
  const keys = [...DEFAULT_CODEX_WORKSPACE_ORDER, ...Object.keys(source)];
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    const pluginId = canonicalCodexWorkspaceId(key);
    if (seen.has(pluginId)) continue;
    const target = source[key] || source[pluginId] || {};
    const label = cleanString(target.label || (pluginId === "home-ai" ? "Home AI" : pluginId), 160);
    const normalized = Object.freeze({
      pluginId,
      label,
      projectId: cleanString(target.projectId || target.workspaceId || pluginId, 160),
      targetWorkspace: cleanString(target.targetWorkspace || target.targetWorkspaceCwd || target.cwd || "", 1000),
      targetThreadId: cleanString(target.targetThreadId || target.threadId || "", 180),
      targetThreadTitle: cleanString(target.targetThreadTitle || target.threadTitle || "", 180),
      targetThreadTitlePrefix: cleanString(target.targetThreadTitlePrefix || target.threadTitlePrefix || "", 180),
      sourceThreadId: cleanString(target.sourceThreadId || "", 180),
      sourceThreadTitle: cleanString(target.sourceThreadTitle || "", 180),
      sourceThreadTitlePrefix: cleanString(target.sourceThreadTitlePrefix || "", 180),
      workerLaneThreadId: cleanString(target.workerLaneThreadId || target.workerThreadId || "", 180),
      workerLaneTitle: cleanString(target.workerLaneTitle || target.workerThreadTitle || "", 180),
      workerLaneTitlePrefix: cleanString(target.workerLaneTitlePrefix || target.workerThreadTitlePrefix || "", 180),
      auditLaneTitle: cleanString(target.auditLaneTitle || target.auditThreadTitle || "", 180),
      auditLaneTitlePrefix: cleanString(target.auditLaneTitlePrefix || target.auditThreadTitlePrefix || "", 180),
      deployLaneTitle: cleanString(target.deployLaneTitle || target.deployThreadTitle || "", 180),
    });
    seen.add(pluginId);
    out.push(normalized);
  }
  return out;
}

function activityForWorkspace(pluginId, activityByWorkspace = {}) {
  if (!activityByWorkspace || typeof activityByWorkspace !== "object") return {};
  return activityByWorkspace[pluginId] || activityByWorkspace[canonicalCodexWorkspaceId(pluginId)] || {};
}

function terminalReturnPlan(activity = {}) {
  const source = activity.latestTerminalReturn || activity.latestReturn || activity.return || null;
  if (!source || typeof source !== "object") return null;
  return Object.freeze(boundedRecord(source, ["taskCardId", "status", "title", "summary", "returnedAt", "updatedAt"]));
}

function codexWorkspaceStatus(target = {}, options = {}) {
  const pluginId = canonicalCodexWorkspaceId(target.pluginId || target.projectId || target.label);
  const activity = activityForWorkspace(pluginId, options.activityByWorkspace);
  const mainThread = threadPlan(target);
  const workerLane = workerLanePlan(target);
  const deployLane = codexWorkspaceDeployLane(pluginId, target);
  const auditLane = auditLanePlan(target);
  const issueCodes = cleanList([
    target.targetWorkspace ? "" : "codex_workspace_cwd_missing",
    mainThread.status === "ok" ? "" : "codex_workspace_thread_unresolved",
    workerLane.issueCode || "",
    ...(Array.isArray(activity.issueCodes) ? activity.issueCodes : []),
  ], 12, 120);
  const blockerCodes = cleanList(activity.blockerCodes, 8, 120);
  const status = blockerCodes.length
    ? "blocked"
    : worstStatus([
      mainThread.status,
      workerLane.status,
      deployLane.status,
      ...(issueCodes.length ? ["warning"] : []),
    ]);
  const latestDailySummary = activity.latestDailySummary
    ? Object.freeze(boundedRecord(activity.latestDailySummary, ["at", "status", "summary", "reportLocation"]))
    : null;
  return Object.freeze({
    id: pluginId,
    kind: "local_codex",
    kindLabel: "本机 Codex",
    name: cleanString(target.label || pluginId, 160),
    pluginId,
    projectId: cleanString(target.projectId || pluginId, 160),
    status,
    statusLabel: statusLabel(status),
    cwdLabel: safePathLabel(target.targetWorkspace),
    mainThread,
    workerLane,
    deployLane,
    auditLane,
    activeTaskCardCount: Number(activity.activeTaskCardCount || 0) || 0,
    pendingApprovalCount: Number(activity.pendingApprovalCount || 0) || 0,
    deployPendingCount: Number(activity.deployPendingCount || 0) || 0,
    escalationCount: Number(activity.escalationCount || 0) || 0,
    latestTaskCard: activity.latestTaskCard
      ? Object.freeze(boundedRecord(activity.latestTaskCard, ["taskCardId", "status", "title", "summary", "updatedAt", "lastHeartbeatAt"]))
      : null,
    latestTerminalReturn: terminalReturnPlan(activity),
    latestDailySummary,
    latestDailySummaryStatus: latestDailySummary ? cleanString(latestDailySummary.status || "ready", 80) : "not_collected",
    blockerCodes: Object.freeze(blockerCodes),
    issueCodes: Object.freeze(issueCodes),
    metadata: Object.freeze({
      source: "codex_workspace_target_registry",
      pathLabelPolicy: "compact_tail_only",
      readOnly: true,
    }),
  });
}

function localWorkspaceIssueCodes(workspace) {
  const issues = [];
  const accessKeyStatus = workspace?.accessKeyStatus || {};
  if (workspace?.id && workspace.id !== "owner" && accessKeyStatus && accessKeyStatus.hasKey === false) {
    issues.push("workspace_access_key_missing");
  }
  if (cleanString(workspace?.outboundStatus).toLowerCase() === "error") {
    issues.push("workspace_outbound_status_error");
  }
  return issues;
}

function localWorkspaceStatus(workspace = {}) {
  const issues = localWorkspaceIssueCodes(workspace);
  const status = issues.length ? "pending" : "ok";
  const workDirectories = Array.isArray(workspace.workDirectories) ? workspace.workDirectories : [];
  const bindings = Array.isArray(workspace.bindings) ? workspace.bindings : [];
  const defaultPath = workspace.defaultWorkspace || workspace.localConfig?.defaultWorkspace || workDirectories[0]?.path || "";
  return Object.freeze({
    id: cleanString(workspace.id || workspace.principalId || "workspace", 128),
    kind: "local",
    kindLabel: "本地",
    name: cleanString(workspace.label || workspace.id || "Workspace", 160),
    status,
    statusLabel: statusLabel(status),
    source: cleanString(workspace.source || "local", 80),
    role: cleanString(workspace.role || "", 80),
    accessMode: cleanString(workspace.accessMode || "", 80),
    identityLabel: safePathLabel(defaultPath) || cleanString(workspace.principalId || workspace.id || "", 160),
    workDirectoryCount: workDirectories.length,
    pluginBindingCount: bindings.length,
    activeTaskCardCount: 0,
    pendingApprovalCount: 0,
    latestDailySummary: null,
    latestDailySummaryStatus: "not_collected",
    issueCodes: Object.freeze(issues),
    metadata: Object.freeze({
      restrictedMedia: Boolean(workspace.restrictedMedia),
      accountType: cleanString(workspace.accountType || "", 80),
      maxParallelTasks: Number(workspace.maxParallelTasks || 0) || 0,
    }),
  });
}

function remoteSessionStatus(entry = {}) {
  const session = entry.workspace?.session || {};
  const raw = cleanString(session.state || entry.workspace?.status || "", 40).toLowerCase();
  if (raw === "connected" || raw === "online") return "online";
  if (raw === "auth_failed" || raw === "config_invalid") return "blocked";
  if (raw === "stale") return "stale";
  if (raw === "offline" || raw === "disconnected") return "offline";
  if (raw === "connecting") return "pending";
  return "unknown";
}

function remoteIssueCodes(entry = {}) {
  const session = entry.workspace?.session || {};
  const issues = cleanList([
    session.failureCode,
    session.configIssueCode,
    entry.latestEscalation?.severity ? `latest_escalation_${entry.latestEscalation.severity}` : "",
  ], 8, 120);
  return issues;
}

function escalationStatus(entry = {}) {
  const severity = cleanString(entry.latestEscalation?.severity, 40).toLowerCase();
  if (/^(h1|critical|high|blocked)$/.test(severity)) return "blocked";
  if (severity) return "warning";
  return "";
}

function remoteWorkspaceStatus(entry = {}) {
  const workspace = entry.workspace || {};
  const session = workspace.session || {};
  const baseStatus = remoteSessionStatus(entry);
  const escalation = escalationStatus(entry);
  const status = escalation ? worstStatus([baseStatus, escalation]) : baseStatus;
  const activeTaskCards = Array.isArray(entry.activeTaskCards) ? entry.activeTaskCards : [];
  const latestTaskCard = activeTaskCards[0] || null;
  return Object.freeze({
    id: cleanString(workspace.workspaceId || "remote-workspace", 128),
    kind: "remote_codex",
    kindLabel: "远程 Codex",
    name: cleanString(workspace.nodeName || workspace.projectRootLabel || workspace.workspaceId || "Remote workspace", 160),
    status,
    statusLabel: statusLabel(status),
    connectionStatus: cleanString(session.state || workspace.status || "", 80),
    nodeId: cleanString(workspace.nodeId || "", 120),
    cwdLabel: cleanString(workspace.projectRootLabel || workspace.workspaceId || "", 160),
    sessionState: cleanString(session.state || workspace.status || "", 80),
    lastHeartbeatAt: cleanString(workspace.lastHeartbeatAt || session.lastHeartbeatAt || "", 80) || null,
    lastSeenAt: cleanString(session.lastSeenAt || workspace.lastHeartbeatAt || "", 80) || null,
    lastPollAt: cleanString(workspace.lastPollAt || session.lastPollAt || "", 80) || null,
    activeTaskCardCount: Number(entry.activeTaskCardCount || activeTaskCards.length || 0) || 0,
    pendingApprovalCount: 0,
    latestTaskCard: latestTaskCard
      ? Object.freeze(boundedRecord(latestTaskCard, ["taskCardId", "status", "title", "summary", "updatedAt", "lastHeartbeatAt"]))
      : null,
    latestDailySummary: entry.latestDailySummary
      ? Object.freeze(boundedRecord(entry.latestDailySummary, ["at", "summary"]))
      : null,
    latestDailySummaryStatus: entry.latestDailySummary ? "ready" : "not_collected",
    escalationCount: Number(entry.escalationCount || 0) || 0,
    latestEscalation: entry.latestEscalation
      ? Object.freeze(boundedRecord(entry.latestEscalation, ["at", "severity", "summary"]))
      : null,
    issueCodes: Object.freeze(remoteIssueCodes(entry)),
    metadata: Object.freeze({
      projectType: cleanString(workspace.projectType || "", 80),
      contractVersion: cleanString(workspace.contractVersion || "", 80),
      activeLongPollCount: Number(session.activeLongPollCount || 0) || 0,
      sessionDesign: cleanString(session.mode || "", 80),
    }),
  });
}

function sectionStatus(items) {
  if (!items.length) return "unknown";
  return worstStatus(items.map((item) => item.status));
}

function createWorkspaceConsoleService(deps = {}) {
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const listLocalWorkspaces = typeof deps.listLocalWorkspaces === "function" ? deps.listLocalWorkspaces : () => [];
  const codexWorkspaceTargets = deps.codexWorkspaceTargets || {};
  const codexWorkspaceActivity = deps.codexWorkspaceActivity || {};
  const codexWorkspaceActivityProvider = typeof deps.codexWorkspaceActivityProvider === "function"
    ? deps.codexWorkspaceActivityProvider
    : null;
  const remoteManagedWorkspaceService = deps.remoteManagedWorkspaceService || null;

  async function summary() {
    const adminLocalWorkspaceItems = (await Promise.resolve(listLocalWorkspaces()))
      .filter(Boolean)
      .map((workspace) => localWorkspaceStatus(workspace));
    const activityByWorkspace = codexWorkspaceActivityProvider
      ? await Promise.resolve(codexWorkspaceActivityProvider())
      : codexWorkspaceActivity;
    const localCodexItems = normalizeCodexWorkspaceTargets(codexWorkspaceTargets)
      .map((target) => codexWorkspaceStatus(target, { activityByWorkspace }));
    const remoteStatus = remoteManagedWorkspaceService && typeof remoteManagedWorkspaceService.status === "function"
      ? await Promise.resolve(remoteManagedWorkspaceService.status())
      : { ok: true, workspaces: [], count: 0, controlPlane: { enrollment: { state: "not_configured" } } };
    const remoteItems = (Array.isArray(remoteStatus?.workspaces) ? remoteStatus.workspaces : [])
      .filter(Boolean)
      .map((entry) => remoteWorkspaceStatus(entry));
    const items = [...localCodexItems, ...remoteItems];
    const counts = {
      total: items.length,
      localCodex: localCodexItems.length,
      remoteCodex: remoteItems.length,
      local: localCodexItems.length,
      remote: remoteItems.length,
      adminLocalWorkspaceProjection: adminLocalWorkspaceItems.length,
      blocked: items.filter((item) => item.status === "blocked").length,
      stale: items.filter((item) => item.status === "stale").length,
      offline: items.filter((item) => item.status === "offline").length,
      pending: items.filter((item) => item.status === "pending").length,
      activeTaskCards: items.reduce((sum, item) => sum + (Number(item.activeTaskCardCount) || 0), 0),
      pendingApprovals: items.reduce((sum, item) => sum + (Number(item.pendingApprovalCount) || 0), 0),
      deployPending: items.reduce((sum, item) => sum + (Number(item.deployPendingCount) || 0), 0),
      escalations: items.reduce((sum, item) => sum + (Number(item.escalationCount) || 0), 0),
    };
    const overallStatus = items.length ? worstStatus(items.map((item) => item.status)) : "unknown";
    return {
      ok: overallStatus !== "blocked",
      consoleVersion: WORKSPACE_CONSOLE_VERSION,
      generatedAt: nowIso(),
      overallStatus,
      overallStatusLabel: statusLabel(overallStatus),
      counts,
      sections: {
        localCodex: {
          id: "localCodex",
          title: "本机 Codex 工作区",
          status: sectionStatus(localCodexItems),
          statusLabel: statusLabel(sectionStatus(localCodexItems)),
          count: localCodexItems.length,
          items: localCodexItems,
        },
        remoteCodex: {
          id: "remoteCodex",
          title: "远程 Codex 工作区",
          status: sectionStatus(remoteItems),
          statusLabel: statusLabel(sectionStatus(remoteItems)),
          count: remoteItems.length,
          controlPlane: remoteStatus?.controlPlane || {},
          items: remoteItems,
        },
      },
      diagnostics: {
        adminLocalWorkspaceProjection: {
          id: "adminLocalWorkspaceProjection",
          hidden: true,
          title: "本地工作区管理投影",
          intendedSurface: "navigation_workspace_plugin_management_rebuild",
          status: sectionStatus(adminLocalWorkspaceItems),
          statusLabel: statusLabel(sectionStatus(adminLocalWorkspaceItems)),
          count: adminLocalWorkspaceItems.length,
          items: adminLocalWorkspaceItems,
        },
      },
      policy: {
        ownerOnly: true,
        readOnlyMvp: true,
        actionExecutionEnabled: false,
        boundedMetadataOnly: true,
      },
    };
  }

  return {
    summary,
  };
}

module.exports = {
  WORKSPACE_CONSOLE_VERSION,
  cleanString,
  codexWorkspaceStatus,
  localWorkspaceStatus,
  normalizeCodexWorkspaceTargets,
  remoteWorkspaceStatus,
  statusLabel,
  worstStatus,
  createWorkspaceConsoleService,
};
