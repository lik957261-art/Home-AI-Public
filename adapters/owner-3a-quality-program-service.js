"use strict";

const STATUS_RANK = Object.freeze({
  ok: 0,
  partial: 1,
  warning: 2,
  degraded: 3,
  blocked: 4,
  stale: 5,
  unknown: 6,
});

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, fallback = "unknown", maxLength = 120) {
  const token = cleanString(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function normalizeStatus(value, fallback = "unknown") {
  const status = safeToken(value, fallback, 40).toLowerCase();
  if (Object.hasOwn(STATUS_RANK, status)) return status;
  if (status === "healthy" || status === "ready" || status === "covered" || status === "passed") return "ok";
  if (status === "not_collected" || status === "missing") return "warning";
  if (status === "failed" || status === "error") return "degraded";
  return fallback;
}

function worstStatus(values = []) {
  return values.reduce((worst, value) => (
    STATUS_RANK[normalizeStatus(value)] > STATUS_RANK[normalizeStatus(worst)] ? normalizeStatus(value) : worst
  ), "ok");
}

function boundedEvidence(value = {}) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    const safeKey = safeToken(key, "", 80);
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
      out[safeKey] = cleanString(raw, 180);
    }
  }
  return out;
}

function signalIds(runtimeSloModel = {}) {
  if (Array.isArray(runtimeSloModel.signalIds)) return runtimeSloModel.signalIds.map((id) => safeToken(id, "", 120)).filter(Boolean);
  if (Array.isArray(runtimeSloModel.slos)) return runtimeSloModel.slos.map((slo) => safeToken(slo.signalId, "", 120)).filter(Boolean);
  if (Array.isArray(runtimeSloModel.dimensions)) {
    const ids = [];
    for (const dimension of runtimeSloModel.dimensions) {
      if (Array.isArray(dimension.signalIds)) ids.push(...dimension.signalIds);
    }
    return ids.map((id) => safeToken(id, "", 120)).filter(Boolean);
  }
  return [];
}

function hasSignals(runtimeSloModel = {}, required = []) {
  const ids = new Set(signalIds(runtimeSloModel));
  return required.every((id) => ids.has(id));
}

function cleanTargetReadiness(extra = {}, cleanInstallLive = "") {
  const directEvidence = extra.cleanTargetCanary && typeof extra.cleanTargetCanary === "object"
    ? extra.cleanTargetCanary
    : {};
  const aggregateEvidence = extra.installUpgradeCanary && typeof extra.installUpgradeCanary === "object"
    ? extra.installUpgradeCanary
    : {};
  const evidence = Object.assign({}, aggregateEvidence, directEvidence);
  const environmentStatus = normalizeStatus(evidence.cleanTargetEnvironmentStatus || "", "");
  const issueCodes = Array.isArray(evidence.cleanTargetEnvironmentIssues)
    ? evidence.cleanTargetEnvironmentIssues
    : [];
  const canaryStatus = normalizeStatus(evidence.cleanTargetCanaryStatus || "", "");
  const skipped = evidence.skipped === true;
  const status = environmentStatus === "blocked"
    ? "blocked"
    : (cleanInstallLive || canaryStatus || (skipped ? "partial" : ""));
  return {
    status,
    evidence,
    environmentStatus,
    issueCodes,
    canaryStatus,
    skipped,
  };
}

function requirement(id, title, status, evidence = {}, gap = "") {
  const normalizedStatus = normalizeStatus(status, "unknown");
  const weight = normalizedStatus === "ok" ? 1 : (normalizedStatus === "partial" ? 0.5 : 0);
  return {
    id: safeToken(id, "requirement", 120),
    title: cleanString(title, 180),
    status: normalizedStatus,
    weight,
    boundedEvidence: boundedEvidence(evidence),
    gap: cleanString(gap, 220),
  };
}

function workstream(id, title, dimension, requirements = []) {
  const count = requirements.length || 1;
  const progressPercent = Math.round((requirements.reduce((sum, item) => sum + Number(item.weight || 0), 0) / count) * 100);
  const status = worstStatus(requirements.map((item) => {
    if (item.status === "partial") return "warning";
    return item.status;
  }));
  return {
    id: safeToken(id, "workstream", 120),
    title: cleanString(title, 160),
    dimension: safeToken(dimension, "autonomy", 40),
    status,
    progressPercent,
    requirements,
  };
}

function buildOwner3AQualityProgramSnapshot(input = {}) {
  const generatedAt = typeof input.nowIso === "function" ? input.nowIso() : new Date().toISOString();
  const runtimeSloModel = input.runtimeSloModel && typeof input.runtimeSloModel === "object" ? input.runtimeSloModel : {};
  const systemStatus = input.systemStatus && typeof input.systemStatus === "object" ? input.systemStatus : {};
  const autonomousDeliveryControl = input.autonomousDeliveryControl && typeof input.autonomousDeliveryControl === "object"
    ? input.autonomousDeliveryControl
    : {};
  const extra = input.extraEvidence && typeof input.extraEvidence === "object" ? input.extraEvidence : {};
  const runtimeSignals = signalIds(runtimeSloModel);
  const systemOverall = normalizeStatus(systemStatus.overallStatus || systemStatus.status, "unknown");
  const autonomousStatus = normalizeStatus(autonomousDeliveryControl.status, "ok");
  const dispatchFailed = Number(autonomousDeliveryControl.counts?.failed || 0) || 0;
  const dispatchDeferred = Number(autonomousDeliveryControl.counts?.deferredConflict || 0) || 0;
  const installUpgradeObserved = normalizeStatus(extra.installUpgradeCanaryObservedStatus || "", "");
  const cleanInstallLive = normalizeStatus(extra.cleanInstallCanaryStatus || extra.installCanaryStatus || "", "");
  const wardrobeReferenceAction = normalizeStatus(extra.wardrobeReferenceActionStatus || "", "");
  const deterministicActionGeneralization = normalizeStatus(extra.deterministicActionGeneralizationStatus || "", "");
  const cleanTarget = cleanTargetReadiness(extra, cleanInstallLive);

  const workstreams = [
    workstream("runtime_slo_diagnostic_closure", "Runtime SLO 与诊断闭环", "availability", [
      requirement(
        "runtime_slo_model_mapped",
        "维护中的 SLO 信号已映射到 3A 维度。",
        runtimeSloModel.ok && Number(runtimeSloModel.signalCount || runtimeSignals.length) > 0 ? "ok" : "degraded",
        {
          modelVersion: runtimeSloModel.modelVersion || "",
          matrixVersion: runtimeSloModel.matrixVersion || "",
          signalCount: runtimeSloModel.signalCount || runtimeSignals.length,
          unmappedSignalCount: runtimeSloModel.unmappedSignalIds?.length || 0,
        },
        "运行 Runtime SLO 审计并补齐缺失信号映射。",
      ),
      requirement(
        "production_resource_signal_visible",
        "生产资源和监听服务健康状态已进入控制台。",
        systemOverall === "ok" ? "ok" : (systemOverall === "unknown" ? "partial" : systemOverall),
        { systemOverall },
        "采集或修复实时系统状态证据。",
      ),
      requirement(
        "diagnostic_signals_routeable",
        "H1/H2 SLO 失败有诊断分类和维修路由。",
        runtimeSloModel.policy?.closureRequiresReadback && runtimeSloModel.policy?.selfCheckAutomationMayAutoDispatch ? "ok" : "partial",
        {
          closureRequiresReadback: Boolean(runtimeSloModel.policy?.closureRequiresReadback),
          selfCheckAutomationMayAutoDispatch: Boolean(runtimeSloModel.policy?.selfCheckAutomationMayAutoDispatch),
        },
        "保持闭环回读和自检自动发卡策略显式可见。",
      ),
    ]),
    workstream("fresh_install_upgrade_canary", "全新安装与升级 Canary", "availability", [
      requirement(
        "install_upgrade_signal_covered",
        "安装和公开升级 Canary 信号已纳入维护中的 SLO 模型。",
        hasSignals(runtimeSloModel, ["install_upgrade_canary", "public_upgrade_rehearsal"]) ? "ok" : "degraded",
        { hasInstallUpgradeCanary: runtimeSignals.includes("install_upgrade_canary"), hasPublicUpgradeRehearsal: runtimeSignals.includes("public_upgrade_rehearsal") },
        "把 Canary 信号加入维护中的 SLO 模型。",
      ),
      requirement(
        "install_upgrade_canary_observed",
        "每日自检已观察到有边界的安装/升级 Canary 报告。",
        installUpgradeObserved || "partial",
        extra.installUpgradeCanary || { installUpgradeCanaryObservedStatus: installUpgradeObserved || "not_collected" },
        "持久化自改进循环的安装/升级 Canary 摘要，供 Owner 控制台回读。",
      ),
      requirement(
        "clean_target_live_canary",
        "干净的类生产目标可证明安装/升级不依赖手工补丁。",
        cleanTarget.status || "partial",
        Object.assign(
          {
            cleanInstallCanaryStatus: cleanInstallLive || "not_collected",
            cleanTargetEnvironmentStatus: cleanTarget.environmentStatus || "not_collected",
          },
          cleanTarget.evidence,
        ),
        cleanTarget.environmentStatus === "blocked"
          ? "先提供隔离干净目标、安全 fixture/回读 payload 和操作员门控应用权限，再重跑 lane Canary。"
          : "目标可用后运行或接入 clean-target Canary 回读。",
      ),
    ]),
    workstream("gateway_message_action_contract", "Gateway 输出到消息动作契约", "accuracy", [
      requirement(
        "plugin_action_metadata_signal",
        "Plugin 动作元数据闭环已纳入 SLO。",
        hasSignals(runtimeSloModel, ["plugin_action_metadata_health"]) ? "ok" : "degraded",
        { hasPluginActionMetadataHealth: runtimeSignals.includes("plugin_action_metadata_health") },
        "保持 Plugin 动作元数据在维护中的 SLO 集合内。",
      ),
      requirement(
        "wardrobe_reference_action_contract",
        "衣橱参考动作的附加、渲染、执行和回读契约已有边界闭环报告。",
        wardrobeReferenceAction || "partial",
        extra.pluginActionReference || { wardrobeReferenceActionStatus: wardrobeReferenceAction || "not_collected" },
        "持久化 Plugin 动作元数据闭环摘要，供 Owner 控制台回读。",
      ),
      requirement(
        "deterministic_action_generalization",
        "确定性动作的附加、渲染、执行和回读契约已从衣橱参考路径泛化。",
        deterministicActionGeneralization || "partial",
        extra.deterministicActionGeneralization || { status: deterministicActionGeneralization || "reference_path_covered" },
        "保持 Plugin 动作元数据聚合闭环在多个动作族上通过。",
      ),
    ]),
    workstream("self_improving_loop_closure", "自改进循环闭环", "autonomy", [
      requirement(
        "task_card_dispatch_signal",
        "任务卡调度是维护中的自主性信号。",
        hasSignals(runtimeSloModel, ["task_card_dispatch", "audit_thread_liveness", "production_self_diagnostics"]) ? "ok" : "degraded",
        {
          hasTaskCardDispatch: runtimeSignals.includes("task_card_dispatch"),
          hasAuditThreadLiveness: runtimeSignals.includes("audit_thread_liveness"),
          hasProductionSelfDiagnostics: runtimeSignals.includes("production_self_diagnostics"),
        },
        "同时维护任务卡调度、审计存活和生产诊断信号。",
      ),
      requirement(
        "dispatch_queue_clear",
        "Autonomous Delivery 没有未解决的失败或冲突暂缓切片。",
        autonomousStatus === "ok" ? "ok" : autonomousStatus,
        { autonomousStatus, dispatchFailed, dispatchDeferred },
        "使用行动收件箱或协调器重试、解决失败/暂缓切片。",
      ),
    ]),
    workstream("architecture_governance_hardening", "架构治理加固", "autonomy", [
      requirement(
        "runtime_policy_guardrails",
        "禁止静默降级、禁止把重启当闭环、要求回读的策略可见。",
        runtimeSloModel.policy?.noSilentFallback && runtimeSloModel.policy?.noRestartAsClosure && runtimeSloModel.policy?.closureRequiresReadback ? "ok" : "partial",
        {
          noSilentFallback: Boolean(runtimeSloModel.policy?.noSilentFallback),
          noRestartAsClosure: Boolean(runtimeSloModel.policy?.noRestartAsClosure),
          closureRequiresReadback: Boolean(runtimeSloModel.policy?.closureRequiresReadback),
        },
        "保持治理策略在 Runtime SLO 模型中可见。",
      ),
      requirement(
        "owner_gated_capability_requests",
        "功能/能力请求保持 Owner 门控，H1/H2 自检维修可自动发卡。",
        runtimeSloModel.policy?.ownerGateForFeatureOrCapabilityRequests && runtimeSloModel.policy?.selfCheckAutomationMayAutoDispatch ? "ok" : "partial",
        {
          ownerGateForFeatureOrCapabilityRequests: Boolean(runtimeSloModel.policy?.ownerGateForFeatureOrCapabilityRequests),
          selfCheckAutomationMayAutoDispatch: Boolean(runtimeSloModel.policy?.selfCheckAutomationMayAutoDispatch),
        },
        "保持功能/能力派发与自检维修派发分离。",
      ),
    ]),
  ];

  const requirementCount = workstreams.reduce((sum, item) => sum + item.requirements.length, 0);
  const weighted = workstreams.reduce((sum, item) => (
    sum + item.requirements.reduce((inner, req) => inner + Number(req.weight || 0), 0)
  ), 0);
  const progressPercent = Math.round((weighted / Math.max(1, requirementCount)) * 100);
  const status = worstStatus(workstreams.map((item) => item.status));
  const gaps = workstreams.flatMap((item) => item.requirements
    .filter((req) => req.status !== "ok")
    .map((req) => ({
      workstreamId: item.id,
      requirementId: req.id,
      status: req.status,
      gap: req.gap,
    }))).slice(0, 12);

  return {
    ok: status === "ok",
    schemaVersion: 1,
    generatedAt,
    status,
    progressPercent,
    requirementCount,
    completedRequirementCount: workstreams.reduce((sum, item) => (
      sum + item.requirements.filter((req) => req.status === "ok").length
    ), 0),
    workstreams,
    gaps,
    policy: {
      ownerOnly: true,
      readOnly: true,
      boundedMetadataOnly: true,
      noCompletionClaim: progressPercent < 100,
    },
  };
}

module.exports = {
  buildOwner3AQualityProgramSnapshot,
  cleanString,
  normalizeStatus,
  worstStatus,
};
