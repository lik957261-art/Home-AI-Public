"use strict";

const assert = require("node:assert/strict");
const {
  NOTIFICATION_TYPE,
  createAiOpsDiagnosticRemediationWorkflowService,
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
  const sent = [];
  const ds = diagnosticService();
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_diag_1"], targetThreadId: "thread-wardrobe" };
      },
    },
  });
  const result = await service.dispatchTaskCard({ caseId: "diagcase_wardrobe_retry", actor: "owner" });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, true);
  assert.deepEqual(result.taskCardResult.cardIds, ["ttc_diag_1"]);
  assert.equal(sent[0].targetThreadTitle, "男装衣橱");
  assert.equal(sent[0].targetWorkspaceCwd, "/Users/example/path");
  assert.equal(sent[0].reasoningEffort, "xhigh");
  assert.equal(ds.state.status, "card_sent");
  assert.equal(ds.state.lastUpdate.reason, "owner_triggered_task_card");
}

{
  const sent = [];
  const ds = diagnosticService(caseRecord({ status: "card_sent" }), [event()]);
  const service = createAiOpsDiagnosticRemediationWorkflowService({
    diagnosticIntakeService: ds,
    taskCardService: {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: ["ttc_should_not_send"] };
      },
    },
  });
  const result = await service.dispatchTaskCard({ caseId: "diagcase_wardrobe_retry", actor: "owner" });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, false);
  assert.equal(result.alreadyDispatched, true);
  assert.equal(result.reason, "diagnostic_remediation_task_card_already_sent");
  assert.equal(sent.length, 0);
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
