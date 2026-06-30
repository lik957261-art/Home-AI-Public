"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { appendEvidenceRecord } = require("../adapters/ai-operations-control-plane-service");
const {
  CLOSURE_NOTIFICATION_TYPE,
  DEPLOYMENT_NOTIFICATION_TYPE,
  FINAL_REPORT_NOTIFICATION_TYPE,
  NOTIFICATION_TYPE,
  REPAIR_NOTIFICATION_TYPE,
  VERIFICATION_NOTIFICATION_TYPE,
  createAutonomousDeliveryCoordinatorService,
  deliveryFinalReportForCase,
} = require("../adapters/autonomous-delivery-coordinator-service");

function tempStore() {
  return createMobileSqliteStore({
    dbPath: path.join(os.tmpdir(), `homeai-autonomous-delivery-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite3`),
  });
}

function createServices(options = {}) {
  const store = tempStore();
  const sent = [];
  const actionInboxService = createActionInboxService({
    makeId(prefix) {
      return `${prefix}_test_${Math.random().toString(36).slice(2, 8)}`;
    },
    nowIso: () => "2026-06-26T00:00:00.000Z",
    store,
  });
  const coordinator = createAutonomousDeliveryCoordinatorService({
    actionInboxService,
    nowIso: () => "2026-06-26T00:00:00.000Z",
    store: options.storeFactory ? () => store : store,
    taskCardService: options.taskCardService || {
      async sendTaskCard(input) {
        sent.push(input);
        return { ok: true, cardIds: [`ttc_${sent.length}`], targetThreadId: "thread-target" };
      },
    },
  });
  return { actionInboxService, coordinator, sent, store };
}

function tempLedgerPath() {
  return path.join(os.tmpdir(), `homeai-autonomous-delivery-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

async function testCoordinatorAcceptsRuntimeStoreFactory() {
  const { coordinator } = createServices({ storeFactory: true });
  const result = await coordinator.createCase({
    text: "研究 Music 收藏页元数据整理可行性",
    workspaceId: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.case.status, "ready_to_start");
}

async function testCreateCasePersistsLedgerAndOwnerDecisionItem() {
  const { actionInboxService, coordinator, store } = createServices();
  const result = await coordinator.createCase({
    text: "研究 Music 收藏页元数据整理可行性",
    workspaceId: "owner",
  });
  assert.equal(result.ok, true);
  assert.equal(result.case.mode, "research");
  assert.equal(result.case.status, "ready_to_start");
  assert.ok(result.slices.some((slice) => slice.sliceKey === "research"));
  const researchSlice = result.slices.find((slice) => slice.sliceKey === "research");
  assert.ok(researchSlice.aiOps);
  assert.equal(researchSlice.aiOps.harnessClass, "H2");
  assert.ok(researchSlice.aiOps.requiredChecks.some((item) => item.command === "node tests/autonomous-delivery-coordinator-service.test.js"));
  assert.equal(researchSlice.aiOps.rootCauseGovernance.required, true);
  assert.equal(result.inboxItem.sourceType, "autonomous_delivery");
  assert.equal(result.inboxItem.sourceRef.notificationType, NOTIFICATION_TYPE);
  assert.equal(result.inboxItem.actionLabel, "开始执行");
  assert.equal(store.listAutonomousDeliveryCases({ workspaceId: "owner" }).length, 1);
  assert.equal(store.listAutonomousDeliverySlices({ caseId: result.case.caseId }).length, result.slices.length);
  const inbox = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" });
  assert.equal(inbox.items.length, 1);
}

async function testManualStartDispatchesNonHighRiskSliceAndCompletesInboxItem() {
  const { actionInboxService, coordinator, sent } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({
    caseId: created.case.caseId,
    inboxItemId: created.inboxItem.id,
    confirmDecisions: true,
    ownerPrompt: "Keep this read-only.",
  });
  assert.equal(started.ok, true);
  assert.equal(started.case.status, "running");
  assert.equal(started.dispatched.length, 1);
  assert.equal(started.dispatched[0].slice.status, "dispatched");
  assert.deepEqual(started.dispatched[0].taskCardIds, ["ttc_1"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].targetThreadTitle, "Note");
  assert.match(sent[0].body, /Owner Additional Prompt/);
  assert.match(sent[0].body, /AI Ops Required Checks/);
  assert.match(sent[0].body, /node tests\/autonomous-delivery-coordinator-service\.test\.js/);
  const item = actionInboxService.getItem({ itemId: created.inboxItem.id }).item;
  assert.equal(item.status, "done");
}

async function testHighRiskCaseDoesNotDispatch() {
  const { coordinator, sent } = createServices();
  const created = await coordinator.createCase({
    text: "接入 Movie 投影仪 power 控制并部署",
    workspaceId: "owner",
    approvals: { highRisk: true },
  });
  const started = await coordinator.startCase({
    caseId: created.case.caseId,
    confirmDecisions: true,
  });
  assert.equal(started.ok, false);
  assert.equal(started.error, "autonomous_delivery_high_risk_manual_only");
  assert.equal(sent.length, 0);
}

async function testRecordReturnMovesCaseToVerificationWaiting() {
  const { actionInboxService, coordinator } = createServices();
  const ledgerPath = tempLedgerPath();
  appendEvidenceRecord({
    ledgerPath,
    kind: "test",
    status: "passed",
    summary: "coordinator focused test passed",
    command: "node tests/autonomous-delivery-coordinator-service.test.js",
    commit: "abcdef1234567890",
    artifactPaths: ["/Users/example/path"],
  });
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const sliceId = started.dispatched[0].slice.sliceId;
  const returned = coordinator.recordReturn({
    caseId: created.case.caseId,
    sliceId,
    status: "completed",
    returnCardId: "ttc_return_1",
    summary: "Research completed.",
    metadata: {
      evidenceRecords: [{
        kind: "test",
        status: "passed",
        summary: "focused test passed",
        command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456' http://example.test",
      }],
      commandsRun: ["node tests/autonomous-delivery-coordinator-service.test.js"],
      evidenceLedgerPath: ledgerPath,
      requiredKinds: ["test"],
      requiredStatuses: ["passed"],
      commitPrefix: "abcdef",
      artifactPaths: ["/Users/example/path"],
    },
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.slice.status, "completed");
  assert.equal(returned.case.status, "verification_waiting");
  assert.equal(returned.slice.aiOps.evidence.lastReturn.evidenceRecords.length, 1);
  assert.equal(returned.slice.aiOps.evidence.lastReturn.commandsRun.length, 1);
  assert.equal(returned.slice.aiOps.evidence.lastReturn.ledgerVerification.checked, true);
  assert.equal(returned.slice.aiOps.evidence.lastReturn.ledgerVerification.ok, true);
  assert.equal(returned.slice.aiOps.evidence.lastReturn.ledgerVerification.recordCount, 1);
  assert.equal(returned.slice.aiOps.evidence.lastReturn.artifactPointers.length, 1);
  assert.doesNotMatch(JSON.stringify(returned.slice.aiOps.evidence.lastReturn), /abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(JSON.stringify(returned.slice.aiOps.evidence.lastReturn), new RegExp(ledgerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(JSON.stringify(returned.slice.aiOps.evidence.lastReturn), /owner-sensitive\.png/);
  const inbox = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" });
  const review = inbox.items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE);
  assert.ok(review);
  assert.equal(review.itemType, "review");
  assert.equal(review.actionLabel, "查看验证");
  assert.equal(review.sourceRef.caseId, created.case.caseId);
  assert.equal(review.sourceRef.sliceId, sliceId);
}

async function testOwnerStartVerificationDispatchesAuditSliceAndCompletesReviewItem() {
  const { actionInboxService, coordinator, sent, store } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const parentSliceId = started.dispatched[0].slice.sliceId;
  coordinator.recordReturn({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    summary: "Implementation completed with focused tests.",
  });
  const review = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE);
  assert.ok(review);
  const verified = await coordinator.startVerification({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    inboxItemId: review.id,
    ownerPrompt: "Check source and host route evidence.",
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.case.status, "verification_dispatched");
  assert.equal(verified.autoDispatched, false);
  assert.equal(verified.verificationSlice.status, "dispatched");
  assert.equal(verified.verificationSlice.taskCardId, "ttc_2");
  assert.equal(verified.verificationSlice.parentSliceId, parentSliceId);
  assert.equal(verified.verificationSlice.verificationForTaskCardId, "ttc_1");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].targetThreadTitle, "Plugin Workspace Audit");
  assert.equal(sent[1].targetWorkspaceCwd, "/Users/example/path");
  assert.equal(sent[1].auditKind, "plugin");
  assert.match(sent[1].body, /Implementation return card: `ttc_return_1`/);
  assert.match(sent[1].body, /Owner Additional Verification Prompt/);
  assert.match(sent[1].body, /AI Ops Required Checks/);
  assert.equal(actionInboxService.getItem({ itemId: review.id }).item.status, "done");
  const verificationSlice = store.getAutonomousDeliverySliceByTaskCardId("ttc_2");
  assert.equal(verificationSlice.sliceId, verified.verificationSlice.sliceId);
}

async function testDeploymentReadbackReturnLanePrecedesVerification() {
  const { actionInboxService, coordinator, sent, store } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Music 收藏页测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const parentSliceId = started.dispatched[0].slice.sliceId;
  const returned = coordinator.recordReturn({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    summary: "Runtime behavior changed; not deployed yet.",
    runtimeChanged: true,
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.case.status, "deployment_waiting");
  assert.equal(returned.slice.deploymentRequired, true);

  const deploymentItem = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === DEPLOYMENT_NOTIFICATION_TYPE);
  assert.ok(deploymentItem);
  assert.equal(deploymentItem.actionLabel, "部署读回");
  assert.equal(deploymentItem.sourceRef.sliceId, parentSliceId);

  const deployment = await coordinator.startDeployment({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    inboxItemId: deploymentItem.id,
    ownerPrompt: "Use central deployment and include readback.",
    confirmDeployment: true,
  });
  assert.equal(deployment.ok, true);
  assert.equal(deployment.case.status, "deployment_dispatched");
  assert.equal(deployment.deploymentSlice.status, "dispatched");
  assert.equal(deployment.deploymentSlice.taskCardId, "ttc_2");
  assert.equal(deployment.deploymentSlice.parentSliceId, parentSliceId);
  assert.equal(deployment.parentSlice.deploymentTaskCardId, "ttc_2");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].targetThreadTitle, "");
  assert.equal(sent[1].targetWorkspaceCwd, "/Users/example/path");
  assert.equal(sent[1].auditKind, "deployment");
  assert.equal(sent[1].cardKind, "plugin_deployment");
  assert.equal(sent[1].pluginId, "music");
  assert.match(sent[1].body, /Deployment \/ Readback Task/);
  assert.match(sent[1].body, /Owner Additional Prompt/);
  assert.match(sent[1].body, /Deployment planning\/readback is required before closure/);
  assert.match(sent[1].body, /Implementation thread: `Music 06-23`/);
  assert.match(sent[1].body, /Do not require plugin workspaces to read or pass sudo password files/);
  assert.equal(actionInboxService.getItem({ itemId: deploymentItem.id }).item.status, "done");
  const deploymentSlice = store.getAutonomousDeliverySliceByTaskCardId("ttc_2");
  assert.equal(deploymentSlice.sliceId, deployment.deploymentSlice.sliceId);

  const deploymentLedgerPath = tempLedgerPath();
  appendEvidenceRecord({
    ledgerPath: deploymentLedgerPath,
    kind: "deploy",
    status: "passed",
    summary: "production readback passed",
    command: "npm run --silent deploy:macos -- --plugin music --json",
    commit: "1234abcd5678",
  });
  const deploymentReturn = coordinator.recordReturnForTaskCard({
    taskCardId: "ttc_2",
    status: "completed",
    returnCardId: "ttc_deploy_return_1",
    summary: "Deployment completed with production readback.",
    metadata: {
      evidenceLedgerPath: deploymentLedgerPath,
      requiredKinds: ["deploy"],
      requiredStatuses: ["passed"],
      commitPrefix: "1234abcd",
      artifactPaths: ["/Users/example/path"],
    },
  });
  assert.equal(deploymentReturn.ok, true);
  assert.equal(deploymentReturn.case.status, "verification_waiting");
  assert.equal(deploymentReturn.parentSlice.deploymentReturnCardId, "ttc_deploy_return_1");
  assert.equal(deploymentReturn.parentSlice.aiOps.evidence.deployment.ledgerVerification.checked, true);
  assert.equal(deploymentReturn.parentSlice.aiOps.evidence.deployment.ledgerVerification.ok, true);
  assert.equal(deploymentReturn.parentSlice.aiOps.evidence.deployment.ledgerVerification.recordCount, 1);
  assert.equal(deploymentReturn.parentSlice.aiOps.evidence.deployment.artifactPointerCount, 1);
  assert.doesNotMatch(JSON.stringify(deploymentReturn.parentSlice.aiOps.evidence.deployment), new RegExp(deploymentLedgerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(JSON.stringify(deploymentReturn.parentSlice.aiOps.evidence.deployment), /readback-owner\.png/);
  const verificationItem = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE
      && item.sourceRef?.sliceId === parentSliceId);
  assert.ok(verificationItem);
  assert.equal(verificationItem.sourceRef.deploymentReturnCardId, "ttc_deploy_return_1");

  const verified = await coordinator.startVerification({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    inboxItemId: verificationItem.id,
  });
  assert.equal(verified.ok, true);
  assert.match(sent[2].body, /Deployment \/ Readback Summary/);
  assert.match(sent[2].body, /Deployment completed with production readback/);
}

async function testVerificationReturnCreatesOwnerClosureDecisionWithoutRecursiveVerification() {
  const { actionInboxService, coordinator } = createServices();
  const ledgerPath = tempLedgerPath();
  appendEvidenceRecord({
    ledgerPath,
    kind: "verification",
    status: "passed",
    summary: "verification evidence passed",
    command: "node tests/autonomous-delivery-coordinator-service.test.js",
    commit: "feedface1234",
  });
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const parentSliceId = started.dispatched[0].slice.sliceId;
  coordinator.recordReturn({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    summary: "Implementation completed with focused tests.",
  });
  const review = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE);
  const verificationStarted = await coordinator.startVerification({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    inboxItemId: review.id,
  });
  const returned = coordinator.recordReturnForTaskCard({
    taskCardId: verificationStarted.verificationSlice.taskCardId,
    status: "completed",
    returnCardId: "ttc_verify_return_1",
    summary: "Verification closed with source/runtime evidence.",
    metadata: {
      evidenceLedgerPath: ledgerPath,
      requiredKinds: ["verification"],
      requiredStatuses: ["passed"],
      commitPrefix: "feedface",
    },
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.slice.status, "completed");
  assert.equal(returned.case.status, "verified_waiting");
  assert.equal(returned.closureSlice.status, "completed");

  const inbox = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" });
  const closure = inbox.items.find((item) => item.sourceRef?.notificationType === CLOSURE_NOTIFICATION_TYPE);
  assert.ok(closure);
  assert.equal(closure.itemType, "review");
  assert.equal(closure.actionLabel, "完成闭环");
  assert.equal(closure.sourceRef.caseId, created.case.caseId);
  assert.equal(closure.sourceRef.verificationSliceId, verificationStarted.verificationSlice.sliceId);
  const recursiveVerification = inbox.items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE
    && item.sourceRef?.sliceId === verificationStarted.verificationSlice.sliceId);
  assert.equal(recursiveVerification, undefined);

  const closed = await coordinator.closeCase({
    caseId: created.case.caseId,
    inboxItemId: closure.id,
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.case.status, "completed");
  assert.ok(closed.case.closedAt);
  assert.equal(actionInboxService.getItem({ itemId: closure.id }).item.status, "done");
  assert.ok(closed.finalReportItem);
  assert.equal(closed.finalReportItem.sourceRef.notificationType, FINAL_REPORT_NOTIFICATION_TYPE);
  assert.equal(closed.finalReportItem.sourceRef.caseId, created.case.caseId);
  assert.equal(closed.finalReportItem.actionLabel, "查看报告");
  assert.equal(closed.finalReportItem.itemType, "delivery");
  assert.match(closed.finalReportItem.sourceRef.detailMessage.body, /Autonomous Delivery Loop Final Report/);
  assert.match(closed.finalReportItem.sourceRef.detailMessage.body, /Verification closed with source\/runtime evidence/);
  assert.match(closed.finalReportItem.sourceRef.detailMessage.body, /AI Ops: \d+ required checks/);
  assert.match(closed.finalReportItem.sourceRef.detailMessage.body, /node tests\/autonomous-delivery-coordinator-service\.test\.js/);
  assert.match(closed.finalReportItem.sourceRef.detailMessage.body, /Evidence ledger: passed; records 1; ref evidence-ledger:/);
  assert.doesNotMatch(closed.finalReportItem.sourceRef.detailMessage.body, new RegExp(ledgerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(closed.finalReportItem.sourceRef.detailMessage.body, /Owner Additional Prompt/);

  const finalInbox = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" });
  const finalReport = finalInbox.items.find((item) => item.sourceRef?.notificationType === FINAL_REPORT_NOTIFICATION_TYPE);
  assert.ok(finalReport);
  assert.equal(finalReport.itemType, "delivery");
  assert.equal(finalReport.actionLabel, "查看报告");
}

async function testFailedVerificationReturnCreatesOwnerGatedRepairDispatch() {
  const { actionInboxService, coordinator, sent, store } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  const started = await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const parentSliceId = started.dispatched[0].slice.sliceId;
  coordinator.recordReturn({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    status: "completed",
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    summary: "Implementation completed with focused tests.",
  });
  const review = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE);
  const verificationStarted = await coordinator.startVerification({
    caseId: created.case.caseId,
    sliceId: parentSliceId,
    inboxItemId: review.id,
  });

  const failedVerification = coordinator.recordReturnForTaskCard({
    taskCardId: verificationStarted.verificationSlice.taskCardId,
    status: "partially_completed",
    returnCardId: "ttc_verify_return_partial",
    summary: "Verification found missing executable UI proof.",
  });
  assert.equal(failedVerification.ok, true);
  assert.equal(failedVerification.case.status, "repair_waiting");
  const repairItem = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === REPAIR_NOTIFICATION_TYPE);
  assert.ok(repairItem);
  assert.equal(repairItem.actionLabel, "发修复卡");
  assert.equal(repairItem.sourceRef.parentSliceId, parentSliceId);
  assert.equal(repairItem.sourceRef.verificationSliceId, verificationStarted.verificationSlice.sliceId);

  const repair = await coordinator.startRepair({
    caseId: created.case.caseId,
    sliceId: verificationStarted.verificationSlice.sliceId,
    inboxItemId: repairItem.id,
    ownerPrompt: "Add executable coverage.",
  });
  assert.equal(repair.ok, true);
  assert.equal(repair.case.status, "repair_dispatched");
  assert.equal(repair.repairSlice.status, "dispatched");
  assert.equal(repair.repairSlice.taskCardId, "ttc_3");
  assert.equal(repair.repairSlice.parentSliceId, parentSliceId);
  assert.equal(repair.repairSlice.verificationSliceId, verificationStarted.verificationSlice.sliceId);
  assert.equal(sent.length, 3);
  assert.equal(sent[2].targetThreadTitle, "Note");
  assert.match(sent[2].body, /Verification return card: `ttc_verify_return_partial`/);
  assert.match(sent[2].body, /Owner Additional Prompt/);
  assert.equal(actionInboxService.getItem({ itemId: repairItem.id }).item.status, "done");
  const repairSlice = store.getAutonomousDeliverySliceByTaskCardId("ttc_3");
  assert.equal(repairSlice.sliceId, repair.repairSlice.sliceId);

  const repairReturn = coordinator.recordReturnForTaskCard({
    taskCardId: "ttc_3",
    status: "completed",
    returnCardId: "ttc_repair_return_1",
    summary: "Repair completed.",
  });
  assert.equal(repairReturn.ok, true);
  assert.equal(repairReturn.case.status, "verification_waiting");
  const repairVerificationItem = actionInboxService.listItems({ workspaceId: "owner", sourceType: "autonomous_delivery" })
    .items.find((item) => item.sourceRef?.notificationType === VERIFICATION_NOTIFICATION_TYPE
      && item.sourceRef?.sliceId === repair.repairSlice.sliceId);
  assert.ok(repairVerificationItem);
}

function testFinalReportProjectsDeploymentEvidenceLedger() {
  const report = deliveryFinalReportForCase({
    caseId: "delivery_report_1",
    status: "completed",
    objective: "Deploy runtime change",
    mode: "delivery",
    risk: "medium",
  }, [{
    sliceId: "slice_1",
    sliceKey: "implementation",
    ownerLayer: "plugin_workspace",
    targetWorkspaceId: "music",
    status: "completed",
    aiOps: {
      harnessClass: "H2",
      requiredChecks: [],
      evidence: {
        deployment: {
          status: "completed",
          summary: "Production readback passed.",
          evidenceRecordCount: 1,
          commandCount: 1,
          artifactPointerCount: 1,
          ledgerVerification: {
            checked: true,
            ok: true,
            recordCount: 2,
            label: "evidence-ledger:abc123",
          },
        },
      },
    },
  }]);
  assert.match(report.markdown, /Deployment evidence projection: Production readback passed\./);
  assert.match(report.markdown, /Deployment evidence counts: 1 records, 1 commands/);
  assert.match(report.markdown, /Deployment evidence ledger: passed; records 2; ref evidence-ledger:abc123/);
  assert.match(report.markdown, /Deployment artifact pointers: 1 bounded references/);
}

async function testRecordReturnByTaskCardIdFindsDispatchedSlice() {
  const { coordinator } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const returned = coordinator.recordReturnForTaskCard({
    taskCardId: "ttc_1",
    status: "completed",
    returnCardId: "ttc_return_1",
    summary: "Implementation returned.",
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.slice.taskCardId, "ttc_1");
  assert.equal(returned.slice.status, "completed");
  assert.equal(returned.case.status, "verification_waiting");
}

async function testRecordReturnCardEventStoresOnlyBoundedReturnMetadata() {
  const { coordinator } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const returned = coordinator.recordReturnCardEvent({
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    title: "Return: completed",
    summary: "Implementation returned.",
    body: "raw task-card body must not be stored",
    prompt: "raw prompt must not be stored",
    token: "raw token must not be stored",
    metadata: {
      sourceThreadId: "thread-source",
      targetThreadId: "thread-target",
      workflowId: "workflow-1",
      terminal: true,
      ackPolicy: "none",
    },
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.slice.returnCardId, "ttc_return_1");
  assert.equal(returned.slice.returnCardEvent.sourceThreadId, "thread-source");
  const serialized = JSON.stringify(returned.slice);
  assert.doesNotMatch(serialized, /raw task-card body/);
  assert.doesNotMatch(serialized, /raw prompt/);
  assert.doesNotMatch(serialized, /raw token/);
}

async function testDuplicateReturnCardEventIsIdempotent() {
  const { coordinator } = createServices();
  const created = await coordinator.createCase({
    text: "增加 Note 附件导入测试覆盖",
    workspaceId: "owner",
  });
  await coordinator.startCase({ caseId: created.case.caseId, confirmDecisions: true });
  const first = coordinator.recordReturnCardEvent({
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    summary: "Implementation returned.",
  });
  const second = coordinator.recordReturnCardEvent({
    taskCardId: "ttc_1",
    returnCardId: "ttc_return_1",
    status: "completed",
    summary: "Duplicate delivery.",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyRecorded, true);
  assert.equal(second.slice.returnSummary, "Implementation returned.");
}

async function testUnknownTaskCardReturnDoesNotMutateCase() {
  const { coordinator } = createServices();
  const result = coordinator.recordReturnForTaskCard({
    taskCardId: "ttc_missing",
    status: "completed",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.error, "autonomous_delivery_task_card_slice_not_found");
}

async function run() {
  await testCreateCasePersistsLedgerAndOwnerDecisionItem();
  await testCoordinatorAcceptsRuntimeStoreFactory();
  await testManualStartDispatchesNonHighRiskSliceAndCompletesInboxItem();
  await testHighRiskCaseDoesNotDispatch();
  await testRecordReturnMovesCaseToVerificationWaiting();
  await testOwnerStartVerificationDispatchesAuditSliceAndCompletesReviewItem();
  await testDeploymentReadbackReturnLanePrecedesVerification();
  await testVerificationReturnCreatesOwnerClosureDecisionWithoutRecursiveVerification();
  await testFailedVerificationReturnCreatesOwnerGatedRepairDispatch();
  testFinalReportProjectsDeploymentEvidenceLedger();
  await testRecordReturnByTaskCardIdFindsDispatchedSlice();
  await testRecordReturnCardEventStoresOnlyBoundedReturnMetadata();
  await testDuplicateReturnCardEventIsIdempotent();
  await testUnknownTaskCardReturnDoesNotMutateCase();
  console.log("autonomous delivery coordinator service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
