"use strict";

const {
  buildDiagnosticRemediationPlan,
} = require("./ai-ops-diagnostic-remediation-service");

const OWNER_WORKSPACE_ID = "owner";
const APP_WORKSPACE = "/Users/example/path";
const NOTIFICATION_TYPE = "ai_ops.diagnostic_remediation_candidate";

function clean(value, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function severityPriority(severity) {
  const value = clean(severity, 20).toUpperCase();
  if (value === "H1") return "urgent";
  if (value === "H2") return "high";
  return "normal";
}

function caseAlreadyDispatched(caseRecord = {}) {
  return clean(caseRecord.status, 80) === "card_sent";
}

function isSelfCheckAutomationPlan(plan = {}) {
  const evidence = objectValue(plan.evidence);
  return clean(plan.dispatch?.policy, 80) === "auto_self_check"
    || (clean(evidence.plugin_id || plan.plugin_id, 80) === "home-ai"
    && clean(evidence.source_surface, 120) === "home-ai-self-check"
    && clean(evidence.diagnostic_type, 160) === "self_check_signal_failed"
    && clean(evidence.category, 160).startsWith("self_check_"));
}

function caseEvents(diagnosticIntakeService, caseId) {
  const result = diagnosticIntakeService.listEvents({ case_id: caseId, limit: 20 });
  return Array.isArray(result?.events) ? result.events : [];
}

function ownerNotificationForPlan(plan = {}) {
  const evidence = objectValue(plan.evidence);
  const caseId = clean(plan.case_id || evidence.case_id, 160);
  const pluginId = clean(plan.plugin_id || evidence.plugin_id || "home-ai", 80);
  const summary = [
    `${pluginId} ${clean(evidence.severity || "H2", 20)} diagnostic case ${caseId}`,
    `Owning layer: ${clean(plan.owningLayer || "unknown", 120)}`,
    `Target: ${clean(plan.target?.targetThreadTitle || plan.target?.label || "unknown", 180)}`,
  ].join("\n");
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "ai_ops",
    sourceId: caseId,
    itemType: "error",
    status: "open",
    priority: severityPriority(evidence.severity),
    title: clean(`诊断需要修复：${pluginId} ${evidence.category || evidence.diagnostic_type || caseId}`, 180),
    summary,
    actionLabel: "发修复卡",
    dedupeKey: `ai-ops-diagnostic-remediation:${caseId}:owner`,
    reopen: true,
    sourceRef: {
      notificationType: NOTIFICATION_TYPE,
      caseId,
      pluginId,
      originalWorkspaceId: clean(evidence.workspace_id || "", 120),
      severity: clean(evidence.severity || "", 20),
      category: clean(evidence.category || evidence.diagnostic_type || "", 120),
      owningLayer: clean(plan.owningLayer || "", 120),
      targetKind: clean(plan.targetKind || "", 80),
      targetThreadTitle: clean(plan.target?.targetThreadTitle || "", 180),
      targetWorkspace: clean(plan.target?.targetWorkspace || "", 500),
      remediationStatus: clean(plan.status || "", 80),
    },
    rawJson: {
      remediationPlan: {
        status: clean(plan.status || "", 80),
        caseId,
        targetKind: clean(plan.targetKind || "", 80),
        owningLayer: clean(plan.owningLayer || "", 120),
        blockedReasons: Array.isArray(plan.blockedReasons) ? plan.blockedReasons.map((item) => clean(item, 120)).filter(Boolean) : [],
        taskCard: plan.taskCard || null,
      },
    },
  };
}

function createAiOpsDiagnosticRemediationWorkflowService(options = {}) {
  const diagnosticIntakeService = options.diagnosticIntakeService;
  const actionInboxService = options.actionInboxService;
  const taskCardService = options.taskCardService;
  const buildPlan = typeof options.buildPlan === "function" ? options.buildPlan : buildDiagnosticRemediationPlan;
  const sendPushNotification = typeof options.sendPushNotification === "function" ? options.sendPushNotification : null;
  const appRouteUrl = typeof options.appRouteUrl === "function"
    ? options.appRouteUrl
    : ((params = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        const text = clean(value, 300);
        if (text) query.set(key, text);
      }
      const serialized = query.toString();
      return serialized ? `/?${serialized}` : "/";
    });

  function requireDiagnosticService() {
    if (!diagnosticIntakeService || typeof diagnosticIntakeService.getCase !== "function" || typeof diagnosticIntakeService.listEvents !== "function") {
      throw new Error("diagnostic remediation workflow requires diagnosticIntakeService");
    }
    return diagnosticIntakeService;
  }

  function planForCase(caseId) {
    const service = requireDiagnosticService();
    const caseRecord = service.getCase(caseId);
    if (!caseRecord) return { ok: false, status: 404, error: "diagnostic_case_not_found" };
    const events = caseEvents(service, caseRecord.case_id);
    const plan = buildPlan({
      case: caseRecord,
      events,
      sourceThreadTitle: "Home AI Diagnostic Remediation",
    });
    return { ok: true, case: caseRecord, events, plan };
  }

  async function notifyOwner(input = {}) {
    const caseId = clean(input.caseId || input.case_id, 160);
    const planned = planForCase(caseId);
    if (!planned.ok) return planned;
    if (!planned.plan?.eligible || planned.plan.status !== "ready_to_dispatch") {
      return {
        ok: true,
        notified: false,
        reason: "plan_not_ready_to_dispatch",
        plan: planned.plan,
      };
    }
    if (isSelfCheckAutomationPlan(planned.plan)) {
      const dispatched = await dispatchTaskCard({
        case_id: caseId,
        actor: "home-ai-self-check",
        reason: "auto_self_check_task_card",
      });
      return {
        ok: dispatched?.ok !== false,
        notified: false,
        autoDispatched: Boolean(dispatched?.dispatched),
        reason: clean(dispatched?.reason || dispatched?.error || "auto_self_check_task_card", 160),
        plan: planned.plan,
        taskCardResult: dispatched?.taskCardResult,
        dispatchResult: dispatched,
      };
    }
    if (!actionInboxService || typeof actionInboxService.upsertSourceItem !== "function") {
      return { ok: false, status: 503, error: "action_inbox_service_unavailable", plan: planned.plan };
    }
    const inboxResult = await Promise.resolve(actionInboxService.upsertSourceItem(ownerNotificationForPlan(planned.plan)));
    if (!inboxResult?.ok) return inboxResult || { ok: false, status: 500, error: "action_inbox_upsert_failed" };
    let push = null;
    if (sendPushNotification) {
      const url = appRouteUrl({
        view: "inbox",
        workspaceId: OWNER_WORKSPACE_ID,
        inboxItemId: inboxResult.item?.id || "",
      });
      push = await Promise.resolve(sendPushNotification({
        title: inboxResult.item?.title || "诊断需要修复",
        body: inboxResult.item?.summary || "Home AI 发现可发卡修复的诊断事件。",
        tag: `homeai-diagnostic-remediation-${planned.plan.case_id}`,
        requireInteraction: true,
        renotify: true,
        data: {
          url,
          viewMode: "inbox",
          workspaceId: OWNER_WORKSPACE_ID,
          inboxItemId: inboxResult.item?.id || "",
          messageType: "ai_ops_diagnostic_remediation",
          diagnosticCaseId: planned.plan.case_id,
        },
      }, {
        principalId: OWNER_WORKSPACE_ID,
        urgency: severityPriority(planned.plan.evidence?.severity) === "normal" ? "normal" : "high",
        ttl: 24 * 60 * 60,
      })).catch((err) => ({
        ok: false,
        error: clean(err?.message || err || "diagnostic_remediation_push_failed", 240),
      }));
    }
    return {
      ok: true,
      notified: true,
      inboxItem: inboxResult.item,
      event: inboxResult.event,
      push,
      plan: planned.plan,
    };
  }

  async function dispatchTaskCard(input = {}) {
    const caseId = clean(input.caseId || input.case_id, 160);
    const planned = planForCase(caseId);
    if (!planned.ok) return planned;
    if (caseAlreadyDispatched(planned.case)) {
      return {
        ok: true,
        dispatched: false,
        alreadyDispatched: true,
        reason: "diagnostic_remediation_task_card_already_sent",
        plan: planned.plan,
        case: planned.case,
      };
    }
    if (!planned.plan?.eligible || planned.plan.status !== "ready_to_dispatch") {
      return {
        ok: false,
        status: 409,
        error: "diagnostic_remediation_plan_not_dispatchable",
        blockedReasons: planned.plan?.blockedReasons || [],
        plan: planned.plan,
      };
    }
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable", plan: planned.plan };
    }
    const taskCard = Object.assign({}, planned.plan.taskCard || {});
    const dispatchInput = Object.assign({}, taskCard, {
      sourceWorkspaceCwd: APP_WORKSPACE,
      targetWorkspaceCwd: taskCard.targetWorkspace,
    });
    if (planned.plan.targetKind === "home-ai") {
      dispatchInput.targetThreadTitle = "";
      dispatchInput.targetThreadTitlePrefix = "Home AI";
    }
    const sent = await taskCardService.sendTaskCard(dispatchInput);
    if (typeof diagnosticIntakeService.updateCaseStatus === "function") {
      const actor = clean(input.actor || "ai-ops-diagnostic-workflow", 80);
      const updateReason = clean(input.reason
        || (actor === OWNER_WORKSPACE_ID ? "owner_triggered_task_card" : "diagnostic_remediation_task_card"), 120);
      diagnosticIntakeService.updateCaseStatus({
        case_id: caseId,
        status: "card_sent",
        reason: updateReason,
        actor,
      });
    }
    return {
      ok: true,
      dispatched: true,
      plan: planned.plan,
      taskCardResult: sent,
      case: typeof diagnosticIntakeService.getCase === "function" ? diagnosticIntakeService.getCase(caseId) : planned.case,
    };
  }

  return Object.freeze({
    dispatchTaskCard,
    notifyOwner,
    planForCase,
  });
}

module.exports = {
  NOTIFICATION_TYPE,
  OWNER_WORKSPACE_ID,
  createAiOpsDiagnosticRemediationWorkflowService,
  isSelfCheckAutomationPlan,
  ownerNotificationForPlan,
};
