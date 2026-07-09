"use strict";

const {
  buildDiagnosticRemediationPlan,
} = require("./ai-ops-diagnostic-remediation-service");
const {
  exceptionTaskCardResult,
  normalizeTaskCardDispatchResult,
} = require("./task-card-dispatch-result-service");

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

function isAutomaticDiagnosticDispatchPlan(plan = {}) {
  const evidence = objectValue(plan.evidence);
  const policy = clean(plan.dispatch?.policy, 80);
  return plan.dispatch?.executeAutomatically === true
    || policy.startsWith("auto_")
    || (clean(evidence.plugin_id || plan.plugin_id, 80) === "home-ai"
    && clean(evidence.source_surface, 120) === "home-ai-self-check"
    && clean(evidence.diagnostic_type, 160) === "self_check_signal_failed"
    && clean(evidence.category, 160).startsWith("self_check_"));
}

function isSelfCheckAutomationPlan(plan = {}) {
  return clean(plan.dispatch?.policy, 80) === "auto_self_check";
}

function caseEvents(diagnosticIntakeService, caseId) {
  const result = diagnosticIntakeService.listEvents({ case_id: caseId, limit: 20 });
  return Array.isArray(result?.events) ? result.events : [];
}

function shouldNotifyOwner(inboxResult = {}) {
  if (inboxResult.created === true || inboxResult.reopened === true) return true;
  if (inboxResult.created === false || inboxResult.updated === true) return false;
  const eventType = clean(inboxResult.event?.eventType || inboxResult.event?.event_type, 80);
  if (!eventType) return true;
  return eventType === "source_created";
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
    reopen: false,
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

async function completeDispatchInboxItem(actionInboxService, input = {}, payload = {}) {
  const itemId = clean(input.itemId || input.item_id || input.inboxItemId || input.inbox_item_id, 160);
  if (!itemId || !actionInboxService || typeof actionInboxService.completeItem !== "function") return null;
  try {
    return await Promise.resolve(actionInboxService.completeItem({
      itemId,
      actorWorkspaceId: OWNER_WORKSPACE_ID,
      actorPrincipalId: clean(input.actor || OWNER_WORKSPACE_ID, 80),
      payload: Object.assign({
        reason: "diagnostic_remediation_task_card_sent",
      }, objectValue(payload)),
    }));
  } catch (err) {
    return {
      ok: false,
      error: clean(err?.message || err || "diagnostic_remediation_inbox_complete_failed", 240),
    };
  }
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
    if (isAutomaticDiagnosticDispatchPlan(planned.plan)) {
      const selfCheck = isSelfCheckAutomationPlan(planned.plan);
      const reason = selfCheck ? "auto_self_check_task_card" : "auto_diagnostic_task_card";
      const dispatched = await dispatchTaskCard({
        case_id: caseId,
        actor: selfCheck ? "home-ai-self-check" : "ai-ops-diagnostic-workflow",
        reason,
      });
      return {
        ok: dispatched?.ok !== false,
        notified: false,
        autoDispatched: Boolean(dispatched?.dispatched),
        reason: clean(dispatched?.reason || dispatched?.error || reason, 160),
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
    const ownerPushRequired = shouldNotifyOwner(inboxResult);
    let push = null;
    if (sendPushNotification && ownerPushRequired) {
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
      notified: Boolean(ownerPushRequired),
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
      const completeResult = await completeDispatchInboxItem(actionInboxService, input, {
        alreadyDispatched: true,
      });
      return {
        ok: true,
        dispatched: false,
        alreadyDispatched: true,
        reason: "diagnostic_remediation_task_card_already_sent",
        plan: planned.plan,
        case: planned.case,
        inboxItem: completeResult?.item,
        inboxCompletion: completeResult ? {
          ok: completeResult.ok !== false,
          error: clean(completeResult.error || "", 160),
        } : null,
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
    let sent;
    try {
      sent = await Promise.resolve(taskCardService.sendTaskCard(dispatchInput));
    } catch (err) {
      sent = exceptionTaskCardResult(err);
    }
    const dispatchResult = normalizeTaskCardDispatchResult(sent, {
      targetWorkspaceId: clean(planned.plan.target?.workspaceId || planned.plan.plugin_id || planned.case?.plugin_id || "", 120),
      targetWorkspace: taskCard.targetWorkspace || "",
      targetThreadTitle: taskCard.targetThreadTitle || taskCard.targetThreadTitlePrefix || "",
      targetThreadId: taskCard.targetThreadId || "",
    });
    if (!dispatchResult.ok) {
      return {
        ok: false,
        status: 502,
        error: "diagnostic_remediation_task_card_dispatch_failed",
        plan: planned.plan,
        taskCardResult: sent,
        dispatchFailure: dispatchResult.failure,
        case: planned.case,
      };
    }
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
    const completeResult = await completeDispatchInboxItem(actionInboxService, input, {
      taskCardIds: dispatchResult.cardIds,
    });
    return {
      ok: true,
      dispatched: true,
      plan: planned.plan,
      taskCardResult: sent,
      taskCardIds: dispatchResult.cardIds,
      inboxItem: completeResult?.item,
      inboxCompletion: completeResult ? {
        ok: completeResult.ok !== false,
        error: clean(completeResult.error || "", 160),
      } : null,
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
  isAutomaticDiagnosticDispatchPlan,
  isSelfCheckAutomationPlan,
  ownerNotificationForPlan,
};
