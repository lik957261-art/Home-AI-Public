"use strict";

const { buildRuntimeSloModel } = require("./home-ai-runtime-slo-service");
const {
  buildOwner3AQualityProgramSnapshot,
} = require("./owner-3a-quality-program-service");
const {
  createOwner3AQualityEvidenceService,
  sanitizeOwner3AQualityEvidence,
} = require("./owner-3a-quality-evidence-service");
const {
  createSystemResourceStatusService,
} = require("./system-resource-status-service");

const OWNER_SYSTEM_CONSOLE_VERSION = "20260701-owner-system-console-v1";

const STATUS_RANK = Object.freeze({
  ok: 0,
  unknown: 1,
  stale: 2,
  warning: 3,
  degraded: 4,
  blocked: 5,
});

const STATUS_TO_SEVERITY = Object.freeze({
  ok: "H3",
  unknown: "H3",
  stale: "H2",
  warning: "H2",
  degraded: "H1",
  blocked: "H1",
});

const CONSOLE_PAGES = Object.freeze([
  Object.freeze({ id: "overview", title: "概览", status: "ready" }),
  Object.freeze({ id: "system-status", title: "系统状态", status: "ready" }),
  Object.freeze({ id: "gateway-runtime", title: "Gateway 运行态", status: "not_collected" }),
  Object.freeze({ id: "plugin-matrix", title: "Plugin 矩阵", status: "not_collected" }),
  Object.freeze({ id: "ai-ops-diagnostics", title: "AI Ops 诊断", status: "not_collected" }),
  Object.freeze({ id: "deployments", title: "部署", status: "not_collected" }),
  Object.freeze({ id: "file-media-tools", title: "文件与媒体工具", status: "not_collected" }),
  Object.freeze({ id: "security-boundary", title: "安全与边界", status: "not_collected" }),
]);

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function redactSensitiveString(value, maxLength = 240) {
  const text = cleanString(value, maxLength);
  if (!text) return "";
  if (/([A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/private\/|\/var\/|\/opt\/|https?:\/\/|wss?:\/\/)/i.test(text)) return "redacted";
  if (/(password|secret|token|access.?key|cookie|authorization|bearer)/i.test(text)) return "redacted";
  return text;
}

function normalizeStatus(value, fallback = "unknown") {
  const status = cleanString(value, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (Object.hasOwn(STATUS_RANK, status)) return status;
  if (status === "healthy" || status === "ready" || status === "passed") return "ok";
  if (status === "failed" || status === "error") return "degraded";
  return fallback;
}

function statusRank(value) {
  return STATUS_RANK[normalizeStatus(value)] ?? STATUS_RANK.unknown;
}

function worstStatus(values = []) {
  return values.reduce((worst, value) => (
    statusRank(value) > statusRank(worst) ? normalizeStatus(value) : worst
  ), "ok");
}

function isAdvisoryOnlySignal(signal = {}) {
  return signal.signalId === "codex_mobile_runtime_pressure"
    && normalizeStatus(signal.status, "unknown") === "warning"
    && signal.boundedEvidence?.advisoryOnly === true;
}

function dayToDaySystemStatus(systemStatus = {}) {
  const signals = Array.isArray(systemStatus.signals) ? systemStatus.signals : [];
  const resourceStatuses = signals
    .filter((signal) => /^(host_|process|service|gateway|plugin|deploy)/.test(signal.category || ""))
    .filter((signal) => !isAdvisoryOnlySignal(signal))
    .map((signal) => signal.status);
  const resourceWorst = worstStatus(resourceStatuses);
  const rawOverall = normalizeStatus(systemStatus.overallStatus || systemStatus.status, "unknown");
  if (rawOverall === "warning" && statusRank(resourceWorst) < statusRank("warning")) return "ok";
  return worstStatus([rawOverall, resourceWorst]);
}

function severityForStatus(status) {
  return STATUS_TO_SEVERITY[normalizeStatus(status)] || "H3";
}

function boundedEvidence(value = {}) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, raw] of Object.entries(value).slice(0, 24)) {
    const safeKey = cleanString(key, 80).replace(/[^A-Za-z0-9._:-]+/g, "_");
    if (!safeKey) continue;
    if (raw == null) {
      out[safeKey] = null;
    } else if (typeof raw === "number") {
      out[safeKey] = Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0;
    } else if (typeof raw === "boolean") {
      out[safeKey] = raw;
    } else if (Array.isArray(raw)) {
      out[safeKey] = raw.slice(0, 12).map((item) => cleanString(item, 120));
    } else if (typeof raw === "object") {
      out[safeKey] = boundedEvidence(raw);
    } else {
      out[safeKey] = redactSensitiveString(raw, 180);
    }
  }
  return out;
}

function normalizeSignal(signal = {}, fallback = {}) {
  const status = normalizeStatus(signal.status, fallback.status || "unknown");
  const inheritedLabel = signal.label || signal.title || signal.name || arguments[1]?.label || arguments[1]?.title || "";
  return {
    signalId: cleanString(signal.signalId || signal.signal_id || fallback.signalId || "owner_console_signal", 120),
    label: redactSensitiveString(inheritedLabel, 120),
    category: cleanString(signal.category || fallback.category || "diagnostic", 80),
    status,
    severity: cleanString(signal.severity || severityForStatus(status), 20),
    summary: cleanString(signal.summary || fallback.summary || status, 220),
    boundedEvidence: boundedEvidence(signal.boundedEvidence || signal.bounded_evidence || signal.evidence || fallback.boundedEvidence || {}),
    lastCheckedAt: cleanString(signal.lastCheckedAt || signal.last_checked_at || fallback.lastCheckedAt || "", 80),
    source: cleanString(signal.source || fallback.source || "owner-system-console", 120),
    recommendedAction: cleanString(signal.recommendedAction || signal.recommended_action || fallback.recommendedAction || "observe", 180),
    actionRequiresOwnerConfirmation: Boolean(
      signal.actionRequiresOwnerConfirmation
      ?? signal.action_requires_owner_confirmation
      ?? fallback.actionRequiresOwnerConfirmation
      ?? false
    ),
  };
}

function normalizeSystemStatus(raw = {}, collectedAt = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const signals = Array.isArray(source.signals)
    ? source.signals.map((signal) => normalizeSignal(signal, { lastCheckedAt: collectedAt }))
    : [];
  const overallStatus = normalizeStatus(
    source.overallStatus || source.status || worstStatus(signals.map((signal) => signal.status)),
    signals.length ? "ok" : "unknown",
  );
  return Object.assign({}, source, {
    schemaVersion: Number(source.schemaVersion || 1),
    collectedAt: cleanString(source.collectedAt || source.lastCheckedAt || collectedAt, 80),
    overallStatus,
    signals,
  });
}

function normalizeAutonomousDeliveryControl(raw = {}, generatedAt = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const counts = boundedEvidence(source.counts || {});
  const status = normalizeStatus(source.status || (Number(counts.failed || 0) > 0 ? "degraded" : "ok"), "unknown");
  const items = Array.isArray(source.items)
    ? source.items.slice(0, 20).map((item) => boundedEvidence(item))
    : [];
  return {
    ok: status === "ok",
    schemaVersion: Number(source.schemaVersion || 1),
    status,
    workspaceId: cleanString(source.workspaceId, 120),
    counts,
    itemCount: Number(source.itemCount ?? items.length) || 0,
    items,
    lastCheckedAt: cleanString(source.lastCheckedAt || generatedAt, 80),
    source: cleanString(source.source?.name || source.source || "autonomous-delivery-coordinator", 120),
    policy: boundedEvidence(source.policy || {}),
  };
}

function normalizeAutonomousDeliveryLoop(raw = {}, generatedAt = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const counts = boundedEvidence(source.counts || {});
  const status = normalizeStatus(source.status || (
    Number(counts.blocked || 0) > 0 ? "degraded" : "ok"
  ), "unknown");
  const items = Array.isArray(source.items)
    ? source.items.slice(0, 20).map((item) => boundedEvidence(item))
    : [];
  return {
    ok: status === "ok",
    schemaVersion: Number(source.schemaVersion || 1),
    status,
    workspaceId: cleanString(source.workspaceId, 120),
    counts,
    itemCount: Number(source.itemCount ?? items.length) || 0,
    items,
    lastCheckedAt: cleanString(source.lastCheckedAt || source.generatedAt || generatedAt, 80),
    source: cleanString(source.source?.name || source.source || "autonomous-delivery-case-ledger", 120),
    policy: boundedEvidence(source.policy || {}),
  };
}

function normalizeLoopEngineeringStatus(raw = {}, generatedAt = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const counts = boundedEvidence(source.counts || {});
  const blocked = Number(counts.blocked || 0) || 0;
  const items = Array.isArray(source.items)
    ? source.items.slice(0, 20).map((item) => boundedEvidence(item))
    : [];
  const hasActiveBlockedItem = items.some((item) => normalizeStatus(item.status, "unknown") === "blocked"
    && item.nextRoute !== "codex_mobile_runtime_repair"
    && item.blockedReason !== "codex_at_loop_status_unreachable"
    && item.blockedReason !== "codex_at_loop_status_timeout"
    && item.blockedReason !== "codex_at_loop_status_http_failed"
    && item.blockedReason !== "codex_at_loop_status_disabled");
  const hasActiveBlockedEvidence = Boolean(
    source.policy?.currentActiveBlockedEvidence
    || source.policy?.activeBlockedEvidence
    || source.currentActiveBlockedEvidence
    || source.activeBlockedEvidence
    || hasActiveBlockedItem
  );
  const rawStatus = normalizeStatus(source.status || (blocked > 0 ? "blocked" : "ok"), "unknown");
  const status = rawStatus === "blocked" && !hasActiveBlockedEvidence ? "warning" : rawStatus;
  const normalizedCounts = Object.assign({}, counts, {
    blocked: status === "blocked" ? blocked : 0,
    advisoryBlocked: status === "blocked" ? 0 : blocked,
  });
  return {
    ok: status === "ok",
    schemaVersion: Number(source.schemaVersion || 1),
    status,
    counts: normalizedCounts,
    itemCount: Number(source.itemCount ?? items.length) || 0,
    items,
    lastCheckedAt: cleanString(source.lastCheckedAt || source.generatedAt || generatedAt, 80),
    source: cleanString(source.source?.name || source.source || "loop-engineering-plan-service", 120),
    policy: boundedEvidence(Object.assign({}, source.policy || {}, {
      activeBlockedEvidence: hasActiveBlockedEvidence,
      advisoryBlockedCount: normalizedCounts.advisoryBlocked,
    })),
  };
}

function autonomousDeliverySignal(control = {}, generatedAt = "") {
  const status = normalizeStatus(control.status, "unknown");
  const counts = control.counts || {};
  const failed = Number(counts.failed || 0) || 0;
  const deferred = Number(counts.deferredConflict || 0) || 0;
  const active = (Number(counts.dispatching || 0) || 0) + (Number(counts.sent || 0) || 0);
  const summary = status === "ok"
    ? "Autonomous Delivery 调度队列没有失败或冲突暂缓的切片。"
    : `Autonomous Delivery 需要 Owner 处理：失败 ${failed}，冲突暂缓 ${deferred}，进行中 ${active}。`;
  return normalizeSignal({
    signalId: "owner_console_autonomous_delivery_dispatch",
    label: "Autonomous Delivery 调度",
    category: "diagnostic",
    status,
    severity: severityForStatus(status),
    summary,
    boundedEvidence: {
      failed,
      deferredConflict: deferred,
      active,
      itemCount: control.itemCount || 0,
    },
    lastCheckedAt: control.lastCheckedAt || generatedAt,
    source: "autonomous-delivery-coordinator",
    recommendedAction: status === "ok" ? "observe" : "open_action_inbox_autonomous_delivery",
    actionRequiresOwnerConfirmation: status !== "ok",
  });
}

function autonomousDeliveryLoopSignal(loop = {}, generatedAt = "") {
  const status = normalizeStatus(loop.status, "unknown");
  const counts = loop.counts || {};
  const blocked = Number(counts.blocked || 0) || 0;
  const waitingReturn = Number(counts.waitingReturn || 0) || 0;
  const duplicateSuppressed = Number(counts.duplicateSuppressed || 0) || 0;
  const verifiedClosed = Number(counts.verifiedClosed || 0) || 0;
  const summary = status === "ok"
    ? "Autonomous Delivery 闭环 ledger 当前没有阻塞或等待回卡的 case。"
    : `Autonomous Delivery 闭环需要关注：阻塞 ${blocked}，等待回卡 ${waitingReturn}，已抑制重复 ${duplicateSuppressed}。`;
  return normalizeSignal({
    signalId: "owner_console_autonomous_delivery_loop",
    label: "Autonomous Delivery 闭环",
    category: "diagnostic",
    status,
    severity: severityForStatus(status),
    summary,
    boundedEvidence: {
      blocked,
      waitingReturn,
      duplicateSuppressed,
      verifiedClosed,
      itemCount: loop.itemCount || 0,
    },
    lastCheckedAt: loop.lastCheckedAt || generatedAt,
    source: "autonomous-delivery-case-ledger",
    recommendedAction: status === "ok" ? "observe" : "open_system_console_delivery_loop",
    actionRequiresOwnerConfirmation: status !== "ok",
  });
}

function loopEngineeringSignal(loopEngineering = {}, generatedAt = "") {
  const status = normalizeStatus(loopEngineering.status, "unknown");
  const counts = loopEngineering.counts || {};
  const open = Number(counts.open || 0) || 0;
  const blocked = Number(counts.blocked || 0) || 0;
  const advisoryBlocked = Number(counts.advisoryBlocked || 0) || 0;
  const waitingReturn = Number(counts.waitingReturn || 0) || 0;
  const summary = status === "ok"
    ? `Loop Engineering runtime 已接通：打开 ${open}，等待回卡 ${waitingReturn}。`
    : (status === "blocked"
        ? `运行阻塞：Loop Engineering 有当前阻塞 ${blocked}，等待回卡 ${waitingReturn}。`
        : `信息性提醒：Loop Engineering 投影待确认 ${advisoryBlocked}，等待回卡 ${waitingReturn}。`);
  return normalizeSignal({
    signalId: "owner_console_loop_engineering_runtime",
    label: "Loop Engineering runtime",
    category: "diagnostic",
    status,
    severity: severityForStatus(status),
    summary,
    boundedEvidence: {
      open,
      blocked,
      advisoryBlocked,
      waitingReturn,
      itemCount: loopEngineering.itemCount || 0,
    },
    lastCheckedAt: loopEngineering.lastCheckedAt || generatedAt,
    source: "codex-mobile-at-loop-status",
    recommendedAction: status === "ok" ? "observe" : "inspect_codex_mobile_at_loop_runtime",
    actionRequiresOwnerConfirmation: status !== "ok",
  });
}

function dimensionSignal(status, fields) {
  return normalizeSignal(Object.assign({
    status,
    severity: severityForStatus(status),
    lastCheckedAt: fields.generatedAt,
    source: "owner-system-console",
    actionRequiresOwnerConfirmation: false,
  }, fields));
}

function buildDimensions({ systemStatus, runtimeSloModel, autonomousDeliveryControl, autonomousDeliveryLoop, loopEngineeringStatus, generatedAt }) {
  const resourceStatuses = Array.isArray(systemStatus?.signals)
    ? systemStatus.signals
      .filter((signal) => /^(host_|process|service|gateway|plugin|deploy)/.test(signal.category || ""))
      .filter((signal) => !isAdvisoryOnlySignal(signal))
      .map((signal) => signal.status)
    : [];
  const availability = worstStatus([dayToDaySystemStatus(systemStatus), ...resourceStatuses]);
  const accuracy = runtimeSloModel?.ok ? "ok" : "degraded";
  const autonomy = worstStatus([
    runtimeSloModel?.policy?.selfCheckAutomationMayAutoDispatch ? "ok" : "warning",
    autonomousDeliveryControl?.status || "unknown",
    autonomousDeliveryLoop?.status || "unknown",
    loopEngineeringStatus?.status || "unknown",
  ]);
  return [
    dimensionSignal(availability, {
      signalId: "owner_console_availability",
      label: "可用性",
      category: "availability",
      summary: availability === "ok" ? "Runtime 资源和关键监听服务在当前阈值内。" : "Runtime 资源或服务压力需要关注。",
      boundedEvidence: {
        systemStatus: systemStatus?.overallStatus || "unknown",
        resourceSignalCount: resourceStatuses.length,
      },
      generatedAt,
      recommendedAction: availability === "ok" ? "observe" : "inspect_system_status",
    }),
    dimensionSignal(accuracy, {
      signalId: "owner_console_accuracy",
      label: "准确性",
      category: "accuracy",
      summary: accuracy === "ok" ? "Runtime SLO 信号映射已覆盖。" : "Runtime SLO 信号映射存在覆盖问题。",
      boundedEvidence: {
        runtimeSloModelVersion: runtimeSloModel?.modelVersion || "",
        unmappedSignalCount: runtimeSloModel?.unmappedSignalIds?.length || 0,
        signalCount: runtimeSloModel?.signalCount || 0,
      },
      generatedAt,
      recommendedAction: accuracy === "ok" ? "observe" : "run_runtime_slo_audit",
    }),
    dimensionSignal(autonomy, {
      signalId: "owner_console_autonomy",
      label: "自主性",
      category: "autonomy",
      summary: autonomy === "ok" ? "自检自动化策略可见且可路由。" : "自检自动化策略不完整。",
      boundedEvidence: {
        selfCheckAutomationMayAutoDispatch: Boolean(runtimeSloModel?.policy?.selfCheckAutomationMayAutoDispatch),
        ownerGateForFeatureOrCapabilityRequests: Boolean(runtimeSloModel?.policy?.ownerGateForFeatureOrCapabilityRequests),
        autonomousDeliveryStatus: autonomousDeliveryControl?.status || "unknown",
        autonomousDeliveryFailedCount: autonomousDeliveryControl?.counts?.failed || 0,
        autonomousDeliveryDeferredConflictCount: autonomousDeliveryControl?.counts?.deferredConflict || 0,
        autonomousDeliveryLoopStatus: autonomousDeliveryLoop?.status || "unknown",
        autonomousDeliveryWaitingReturnCount: autonomousDeliveryLoop?.counts?.waitingReturn || 0,
        autonomousDeliveryDuplicateSuppressedCount: autonomousDeliveryLoop?.counts?.duplicateSuppressed || 0,
        loopEngineeringRuntimeStatus: loopEngineeringStatus?.status || "unknown",
        loopEngineeringWaitingReturnCount: loopEngineeringStatus?.counts?.waitingReturn || 0,
      },
      generatedAt,
      recommendedAction: autonomy === "ok" ? "observe" : "open_action_inbox_autonomous_delivery",
      actionRequiresOwnerConfirmation: autonomy !== "ok",
    }),
  ];
}

function criticalSignals(signals = [], maxItems = 12) {
  return signals
    .filter((signal) => !isAdvisoryOnlySignal(signal))
    .filter((signal) => statusRank(signal.status) >= statusRank("warning"))
    .sort((a, b) => statusRank(b.status) - statusRank(a.status))
    .slice(0, maxItems);
}

function pageList(dimensions = []) {
  const overall = worstStatus(dimensions.map((item) => item.status));
  return CONSOLE_PAGES.map((page) => {
    if (page.id === "overview") return Object.assign({}, page, { status: overall });
    if (page.id === "system-status") {
      const availability = dimensions.find((item) => item.category === "availability");
      return Object.assign({}, page, { status: availability?.status || "unknown" });
    }
    return Object.assign({}, page);
  });
}

function createDefaultSystemResourceStatusService(options = {}) {
  if (options.disableDefaultSystemResourceStatusService === true) return null;
  if (options.systemResourceStatusService && typeof options.systemResourceStatusService.collect === "function") {
    return options.systemResourceStatusService;
  }
  return createSystemResourceStatusService({
    appRoot: options.appRoot || options.repoRoot || process.cwd(),
    dataRoot: options.DATA_DIR || options.dataDir,
    env: options.env || process.env,
    launchdLabels: options.ownerSystemConsoleLaunchdLabels,
    nowIso: options.nowIso,
    os: options.systemResourceOs || options.os,
    process: options.process || process,
    runCommand: options.systemResourceRunCommand,
    runtimeRoot: options.runtimeRoot || options.HERMES_RUNTIME_ROOT,
    thresholds: options.systemResourceThresholds,
  });
}

function createOwnerSystemConsoleService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const systemResourceStatusService = createDefaultSystemResourceStatusService(options);
  function effectiveOwnerWorkspaceId(context = {}) {
    const ownerAuth = context.ownerAuth && typeof context.ownerAuth === "object" ? context.ownerAuth : {};
    const candidate = ownerAuth.effectiveWorkspaceId
      || ownerAuth.workspaceId
      || ownerAuth.workspace?.id
      || context.effectiveWorkspaceId
      || context.workspaceId
      || options.ownerWorkspaceId;
    return cleanString(candidate, 120);
  }
  const collectSystemStatus = typeof options.collectSystemStatus === "function"
    ? options.collectSystemStatus
    : async () => {
      if (systemResourceStatusService && typeof systemResourceStatusService.collect === "function") {
        return systemResourceStatusService.collect();
      }
      return {
        schemaVersion: 1,
        overallStatus: "unknown",
        signals: [
          normalizeSignal({
            signalId: "owner_console_system_resource_not_collected",
            label: "系统资源采集",
            category: "service",
            status: "unknown",
            severity: "H3",
            summary: "系统资源采集器未配置。",
            source: "owner-system-console",
            recommendedAction: "configure_system_resource_collector",
          }),
        ],
      };
    };
  const runtimeSloModelBuilder = typeof options.runtimeSloModelBuilder === "function"
    ? options.runtimeSloModelBuilder
    : buildRuntimeSloModel;
  const collectAutonomousDeliveryControl = typeof options.collectAutonomousDeliveryControl === "function"
    ? options.collectAutonomousDeliveryControl
    : async (context = {}) => {
      const workspaceId = effectiveOwnerWorkspaceId(context);
      if (
        workspaceId
        && options.autonomousDeliveryCoordinatorService
        && typeof options.autonomousDeliveryCoordinatorService.dispatchControlSummary === "function"
      ) {
        return options.autonomousDeliveryCoordinatorService.dispatchControlSummary({ workspaceId });
      }
      return {
        schemaVersion: 1,
        status: "ok",
        counts: {},
        items: [],
        policy: { readOnlySummary: true, collectorConfigured: false },
      };
    };
  const collectAutonomousDeliveryLoop = typeof options.collectAutonomousDeliveryLoop === "function"
    ? options.collectAutonomousDeliveryLoop
    : async (context = {}) => {
      const workspaceId = effectiveOwnerWorkspaceId(context);
      if (
        workspaceId
        && options.autonomousDeliveryCoordinatorService
        && typeof options.autonomousDeliveryCoordinatorService.deliveryLoopStatusSummary === "function"
      ) {
        return options.autonomousDeliveryCoordinatorService.deliveryLoopStatusSummary({ workspaceId });
      }
      return {
        schemaVersion: 1,
        status: "ok",
        counts: {},
        items: [],
        policy: { readOnlySummary: true, collectorConfigured: false },
      };
    };
  const collectLoopEngineeringStatus = typeof options.collectLoopEngineeringStatus === "function"
    ? options.collectLoopEngineeringStatus
    : async () => ({
      schemaVersion: 1,
      status: "ok",
      counts: {},
      items: [],
      policy: { readOnlySummary: true, collectorConfigured: false },
    });
  const qualityProgramBuilder = typeof options.qualityProgramBuilder === "function"
    ? options.qualityProgramBuilder
    : buildOwner3AQualityProgramSnapshot;
  const qualityProgramEvidenceService = options.qualityProgramEvidenceService
    || createOwner3AQualityEvidenceService(options.qualityProgramEvidenceOptions || {});
  const collectQualityProgramEvidence = typeof options.collectQualityProgramEvidence === "function"
    ? options.collectQualityProgramEvidence
    : async () => qualityProgramEvidenceService.collect();

  async function systemStatus() {
    const generatedAt = nowIso();
    const raw = await collectSystemStatus();
    return normalizeSystemStatus(raw, generatedAt);
  }

  async function overview(requestContext = {}) {
    const generatedAt = nowIso();
    const collectorContext = Object.assign({}, requestContext, {
      effectiveWorkspaceId: effectiveOwnerWorkspaceId(requestContext),
    });
    const [
      rawSystemStatus,
      runtimeSloModel,
      rawAutonomousDeliveryControl,
      rawAutonomousDeliveryLoop,
      rawLoopEngineeringStatus,
      rawQualityProgramEvidence,
    ] = await Promise.all([
      collectSystemStatus(),
      Promise.resolve(runtimeSloModelBuilder({ nowIso: () => generatedAt })),
      Promise.resolve(collectAutonomousDeliveryControl(collectorContext)),
      Promise.resolve(collectAutonomousDeliveryLoop(collectorContext)),
      Promise.resolve(collectLoopEngineeringStatus(collectorContext)),
      Promise.resolve(collectQualityProgramEvidence()),
    ]);
    const normalizedSystemStatus = normalizeSystemStatus(rawSystemStatus, generatedAt);
    const autonomousDeliveryControl = normalizeAutonomousDeliveryControl(rawAutonomousDeliveryControl, generatedAt);
    const autonomousDeliveryLoop = normalizeAutonomousDeliveryLoop(rawAutonomousDeliveryLoop, generatedAt);
    const loopEngineeringStatus = normalizeLoopEngineeringStatus(rawLoopEngineeringStatus, generatedAt);
    const qualityProgramEvidence = sanitizeOwner3AQualityEvidence(rawQualityProgramEvidence);
    const dayToDayStatus = dayToDaySystemStatus(normalizedSystemStatus);
    const qualityProgramSystemStatus = Object.assign({}, normalizedSystemStatus, {
      status: dayToDayStatus,
      overallStatus: dayToDayStatus,
    });
    const qualityProgram = qualityProgramBuilder({
      autonomousDeliveryControl,
      autonomousDeliveryLoop,
      extraEvidence: qualityProgramEvidence.extraEvidence || {},
      nowIso: () => generatedAt,
      runtimeSloModel,
      systemStatus: qualityProgramSystemStatus,
    });
    const dimensions = buildDimensions({
      systemStatus: normalizedSystemStatus,
      runtimeSloModel,
      autonomousDeliveryControl,
      autonomousDeliveryLoop,
      loopEngineeringStatus,
      generatedAt,
    });
    const allSignals = [
      ...dimensions,
      ...(Array.isArray(normalizedSystemStatus.signals) ? normalizedSystemStatus.signals : []),
      autonomousDeliverySignal(autonomousDeliveryControl, generatedAt),
      autonomousDeliveryLoopSignal(autonomousDeliveryLoop, generatedAt),
      loopEngineeringSignal(loopEngineeringStatus, generatedAt),
    ];
    const overallStatus = worstStatus(dimensions.map((dimension) => dimension.status));
    const critical = criticalSignals(allSignals);
    return {
      ok: overallStatus === "ok",
      schemaVersion: 1,
      consoleVersion: OWNER_SYSTEM_CONSOLE_VERSION,
      generatedAt,
      overallStatus,
      overallSeverity: severityForStatus(overallStatus),
      dimensions,
      systemStatus: normalizedSystemStatus,
      autonomousDeliveryControl,
      autonomousDeliveryLoop,
      loopEngineeringStatus,
      qualityProgramEvidence,
      qualityProgram,
      criticalSignals: critical,
      pages: pageList(dimensions),
      latest: {
        deployment: {
          status: "not_collected",
          source: "owner-system-console-mvp",
        },
        diagnostic: {
          status: critical.length ? "attention" : "ok",
          signalCount: critical.length,
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
    overview,
    systemStatus,
  };
}

module.exports = {
  CONSOLE_PAGES,
  OWNER_SYSTEM_CONSOLE_VERSION,
  createOwnerSystemConsoleService,
  normalizeAutonomousDeliveryLoop,
  normalizeAutonomousDeliveryControl,
  normalizeLoopEngineeringStatus,
  normalizeSignal,
  normalizeSystemStatus,
  severityForStatus,
  worstStatus,
};
