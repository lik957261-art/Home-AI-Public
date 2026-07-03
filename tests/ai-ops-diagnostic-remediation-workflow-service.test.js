"use strict";

const assert = require("node:assert/strict");
const {
  NOTIFICATION_TYPE,
  createAiOpsDiagnosticRemediationWorkflowService,
  isSelfCheckAutomationPlan,
  ownerNotificationForPlan,
} = require("../adapters/ai-ops-diagnostic-remediation-workflow-service");
const {
  buildDiagnosticRemediationPlan,
} = require("../adapters/ai-ops-diagnostic-remediation-service");

function caseRecord(overrides = {}) {
  return Object.assign({
    case_id: "diagcase_wardrobe_retry",
    status: "card_candidate",
    severity: "H2",
    event_count: 3,
    workspace_id: "weixin_wuping",
    plugin_id: "wardrobe",
    source_surface: "embedded-plugin",
    diagnostic_type: "retry_exhausted",
    category: "outfit_retry_failed",
    route: "/?view=plugin&pluginId=wardrobe&pluginRoute=outfit&workspaceId=weixin_wuping",
    build_id: "client-test",
    summary: "Wardrobe outfit retry failed",
    latest_event_id: "diagevt_latest",
  }, overrides);
}

function event(overrides = {}) {
  return Object.assign({
    event_id: "diagevt_1",
    case_id: "diagcase_wardrobe_retry",
    severity: "H2",
    confidence: 0.84,
    event_hash: "eventhash",
    payload: { error_code: "retry_exhausted" },
    evidence: {
      breadcrumbs: [
        { kind: "api", code: "attempt_failed" },
        { kind: "api", code: "attempt_failed" },
        { kind: "api", code: "attempt_failed" },
      ],
      redaction: {
        raw_content_included: false,
        raw_secrets_included: false,
        raw_images_included: false,
      },
    },
  }, overrides);
}

function selfCheckCase(overrides = {}) {
  return caseRecord(Object.assign({
    case_id: "diagcase_self_check",
    workspace_id: "owner",
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_plugin_proxy",
    route: "/system/self-check",
    build_id: "20260628-self-improving-loop-v3",
    summary: "self check plugin proxy latency",
    latest_event_id: "diagevt_self_check",
  }, overrides));
}

function selfCheckEvent(overrides = {}) {
  return event(Object.assign({
    event_id: "diagevt_self_check",
    case_id: "diagcase_self_check",
    payload: { error_code: "proxy_gap_2_10s" },
  }, overrides));
}

function capabilityGapCase(overrides = {}) {
  return caseRecord(Object.assign({
    case_id: "diagcase_capability_gap",
    workspace_id: "owner",
    plugin_id: "home-ai",
    source_surface: "host-conversation",
    diagnostic_type: "capability_gap",
    category: "capability_gap",
    route: "/api/plugin-conversation/actions",
    summary: "PPTX generation capability missing",
    latest_event_id: "diagevt_capability_gap",
  }, overrides));
}

function diagnosticService(initialCase = caseRecord(), initialEvents = [event()]) {
  const state = { status: initialCase.status };
  return {
    state,
    getCase(caseId) {
      if (caseId !== initialCase.case_id) return null;
      return Object.assign({}, initialCase, { status: state.status });
    },
    listEvents() {
      return { ok: true, events: initialEvents };
    },
    updateCaseStatus(input) {
      state.status = input.status;
      state.lastUpdate = input;
      return { ok: true, case: this.getCase(initialCase.case_id) };
    },
  };
}

async function run() {
{
  const plan = buildDiagnosticRemediationPlan({ case: caseRecord(), events: [event()] });
  const item = ownerNotificationForPlan(plan);
  assert.equal(item.workspaceId, "owner");
  assert.equal(item.assigneeWorkspaceId, "owner");
  assert.equal(item.sourceType, "ai_ops");
  assert.equal(item.itemType, "error");
  assert.equal(item.actionLabel, "发修复卡");
  assert.equal(item.sourceRef.notificationType, NOTIFICATION_TYPE);
  assert.equal(item.sourceRef.originalWorkspaceId, "weixin_wuping");
  assert.equal(item.sourceRef.targetThreadTitle, "男装衣橱");
  assert.equal(item.rawJson.remediationPlan.taskCard.reasoningEffort, "xhigh");
}

{
  const upserts = [];
  const pushes = [];
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: diagnosticService(),
    actionInboxService: {
      upsertSourceItem(input) {
        upserts.push(input);
        return { ok: true, item: Object.assign({ id: "ainb_diag_1" }, input), event: { id: "event_1" } };
      },
    },
    sendPushNotification(payload, options) {
      pushes.push({ payload, options });
      return { ok: true, sent: 1 };
    },
  });
  const result = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  assert.equal(result.ok, true);
  assert.equal(result.notified, true);
  assert.equal(result.inboxItem.workspaceId, "owner");
  assert.equal(upserts.length, 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].options.principalId, "owner");
  assert.equal(pushes[0].payload.data.workspaceId, "owner");
  assert.equal(pushes[0].payload.data.diagnosticCaseId, "diagcase_wardrobe_retry");
}

{
  const items = new Map();
  const pushes = [];
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: diagnosticService(),
    actionInboxService: {
      upsertSourceItem(input) {
        const before = items.get(input.dedupeKey);
        const item = Object.assign({ id: before?.id || "ainb_diag_dedupe" }, before || {}, input);
        items.set(input.dedupeKey, item);
        return {
          ok: true,
          item,
          event: { eventType: before ? "source_updated" : "source_created" },
          created: !before,
          updated: Boolean(before),
          reopened: false,
        };
      },
    },
    sendPushNotification(payload, options) {
      pushes.push({ payload, options });
      return { ok: true, sent: 1 };
    },
  });
  const first = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  const second = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.notified, true);
  assert.equal(second.notified, false);
  assert.equal(first.inboxItem.id, second.inboxItem.id);
  assert.equal(pushes.length, 1);
}

{
  const items = new Map();
  const pushes = [];
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: diagnosticService(),
    actionInboxService: {
      upsertSourceItem(input) {
        const before = items.get(input.dedupeKey);
        const terminalBefore = ["done", "dismissed", "archived"].includes(String(before?.status || ""));
        const item = Object.assign({ id: before?.id || "ainb_diag_dismissed" }, before || {}, input, {
          status: terminalBefore && !input.reopen ? before.status : input.status,
        });
        items.set(input.dedupeKey, item);
        return {
          ok: true,
          item,
          event: { eventType: before ? "source_updated" : "source_created" },
          created: !before,
          updated: Boolean(before),
          reopened: Boolean(before && terminalBefore && input.reopen && item.status !== before.status),
        };
      },
    },
    sendPushNotification(payload, options) {
      pushes.push({ payload, options });
      return { ok: true, sent: 1 };
    },
  });
  const first = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  assert.equal(first.notified, true);
  items.set(first.inboxItem.dedupeKey, Object.assign({}, first.inboxItem, { status: "dismissed" }));
  const repeated = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.notified, false);
  assert.equal(repeated.inboxItem.status, "dismissed");
  assert.equal(pushes.length, 1);
}

{
  const upserts = [];
  const sent = [];
  const ds = diagnosticService(selfCheckCase(), [selfCheckEvent()]);
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      upsertSourceItem(input) {
        upserts.push(input);
        throw new Error("self-check diagnostics should auto-dispatch instead of notifying owner");
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_self_check_1"], targetThreadId: "thread-home-ai" };
      },
    },
  });
  const planned = service.planForCase("diagcase_self_check").plan;
  assert.equal(isSelfCheckAutomationPlan(planned), true);
  const result = await service.notifyOwner({ case_id: "diagcase_self_check" });
  assert.equal(result.ok, true);
  assert.equal(result.notified, false);
  assert.equal(result.autoDispatched, true);
  assert.deepEqual(result.taskCardResult.cardIds, ["ttc_self_check_1"]);
  assert.equal(upserts.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].targetThreadTitlePrefix, "Home AI");
  assert.equal(ds.state.status, "card_sent");
  assert.equal(ds.state.lastUpdate.reason, "auto_self_check_task_card");
  assert.equal(ds.state.lastUpdate.actor, "home-ai-self-check");
}

{
  const upserts = [];
  const sent = [];
  const ds = diagnosticService(capabilityGapCase(), [event({
    case_id: "diagcase_capability_gap",
    event_id: "diagevt_capability_gap",
    payload: { error_code: "capability_gap" },
  })]);
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      upsertSourceItem(input) {
        upserts.push(input);
        return { ok: true, item: Object.assign({ id: "ainb_capability_gap" }, input), event: { id: "event_gap" } };
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_should_not_auto_send"] };
      },
    },
  });
  const planned = service.planForCase("diagcase_capability_gap").plan;
  assert.equal(isSelfCheckAutomationPlan(planned), false);
  const result = await service.notifyOwner({ case_id: "diagcase_capability_gap" });
  assert.equal(result.ok, true);
  assert.equal(result.notified, true);
  assert.equal(result.autoDispatched, undefined);
  assert.equal(upserts.length, 1);
  assert.equal(sent.length, 0);
  assert.equal(ds.state.status, "card_candidate");
}

{
  const sent = [];
  const completed = [];
  const ds = diagnosticService();
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      completeItem(input) {
        completed.push(input);
        return { ok: true, item: { id: input.itemId, status: "done" } };
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_diag_1"], targetThreadId: "thread-wardrobe" };
      },
    },
  });
  const result = await service.dispatchTaskCard({
    caseId: "diagcase_wardrobe_retry",
    itemId: "ainb_diag_1",
    actor: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, true);
  assert.deepEqual(result.taskCardResult.cardIds, ["ttc_diag_1"]);
  assert.equal(sent[0].targetThreadTitle, "男装衣橱");
  assert.equal(sent[0].targetWorkspaceCwd, "/Users/example/path");
  assert.equal(sent[0].reasoningEffort, "xhigh");
  assert.deepEqual(completed, [{
    itemId: "ainb_diag_1",
    actorWorkspaceId: "owner",
    actorPrincipalId: "owner",
    payload: {
      reason: "diagnostic_remediation_task_card_sent",
      taskCardIds: ["ttc_diag_1"],
    },
  }]);
  assert.equal(result.inboxItem.status, "done");
  assert.deepEqual(result.inboxCompletion, { ok: true, error: "" });
  assert.equal(ds.state.status, "card_sent");
  assert.equal(ds.state.lastUpdate.reason, "owner_triggered_task_card");
}

{
  const sent = [];
  const completed = [];
  const ds = diagnosticService();
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      completeItem(input) {
        completed.push(input);
        throw new Error("inbox row already completed elsewhere");
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_diag_1"] };
      },
    },
  });
  const result = await service.dispatchTaskCard({
    caseId: "diagcase_wardrobe_retry",
    itemId: "ainb_diag_1",
    actor: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, true);
  assert.deepEqual(result.taskCardIds, ["ttc_diag_1"]);
  assert.equal(sent.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(result.inboxItem, undefined);
  assert.deepEqual(result.inboxCompletion, {
    ok: false,
    error: "inbox row already completed elsewhere",
  });
  assert.equal(ds.state.status, "card_sent");
}

{
  const sent = [];
  const completed = [];
  const ds = diagnosticService();
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      completeItem(input) {
        completed.push(input);
        return { ok: true, item: { id: input.itemId, status: "done" } };
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: false, status: 404, error: "target_thread_not_visible" };
      },
    },
  });
  const result = await service.dispatchTaskCard({ caseId: "diagcase_wardrobe_retry", actor: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error, "diagnostic_remediation_task_card_dispatch_failed");
  assert.equal(result.dispatchFailure.code, "target_thread_not_visible");
  assert.equal(sent.length, 1);
  assert.equal(completed.length, 0);
  assert.equal(ds.state.status, "card_candidate");
}

{
  const sent = [];
  const completed = [];
  const ds = diagnosticService(caseRecord({ status: "card_sent" }), [event()]);
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    actionInboxService: {
      completeItem(input) {
        completed.push(input);
        return { ok: true, item: { id: input.itemId, status: "done" } };
      },
    },
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_should_not_send"] };
      },
    },
  });
  const result = await service.dispatchTaskCard({
    caseId: "diagcase_wardrobe_retry",
    itemId: "ainb_diag_already_sent",
    actor: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, false);
  assert.equal(result.alreadyDispatched, true);
  assert.equal(result.reason, "diagnostic_remediation_task_card_already_sent");
  assert.equal(sent.length, 0);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].payload.alreadyDispatched, true);
  assert.equal(result.inboxItem.status, "done");
  assert.deepEqual(result.inboxCompletion, { ok: true, error: "" });
}

{
  const upserts = [];
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: diagnosticService(caseRecord({ status: "card_sent" }), [event({ confidence: 0.9 })]),
    actionInboxService: {
      upsertSourceItem(input) {
        upserts.push(input);
        return { ok: true, item: Object.assign({ id: "ainb_diag_resent" }, input), event: { id: "event_resent" } };
      },
    },
  });
  const result = await service.notifyOwner({ case_id: "diagcase_wardrobe_retry" });
  assert.equal(result.ok, true);
  assert.equal(result.notified, false);
  assert.equal(result.reason, "plan_not_ready_to_dispatch");
  assert.equal(upserts.length, 0);
}

{
  const lowSeverity = caseRecord({ status: "inbox_waiting", severity: "H3" });
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: diagnosticService(lowSeverity, [event({ severity: "H3", confidence: 0.3 })]),
    actionInboxService: {
      upsertSourceItem() {
        throw new Error("should not upsert for blocked plans");
      },
    },
  });
  const result = await service.notifyOwner({ caseId: "diagcase_wardrobe_retry" });
  assert.equal(result.ok, true);
  assert.equal(result.notified, false);
  assert.equal(result.reason, "plan_not_ready_to_dispatch");
}

console.log("AI Ops diagnostic remediation workflow service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
