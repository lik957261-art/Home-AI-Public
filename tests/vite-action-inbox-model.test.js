"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/action-inbox-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("action inbox model stays browser-global free", () => {
    const source = read("src/vite-islands/navigation-shell/action-inbox-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /ACTION_INBOX_MODEL_VERSION/);
  });

  await test("audit targets and task-card error plans are deterministic", () => {
    assert.equal(model.actionInboxValidAuditTargetIdPlan("music"), "music");
    assert.equal(model.actionInboxValidAuditTargetIdPlan("unknown"), "home-ai");
    assert.equal(model.actionInboxSafeTokenPlan("bad value !", "x"), "bad_value");
    const item = {
      id: "ainb-1",
      sourceType: "autonomous_delivery",
      sourceRef: { caseId: "case-1", sliceId: "slice-1" },
    };
    assert.equal(model.actionInboxTaskCardDispatchKeyPlan(item, "autonomous-delivery-start"), "autonomous-delivery-start:autonomous_delivery:case-1:slice-1");
    assert.equal(model.actionInboxErrorCodePlan({ code: "bad request" }), "bad_request");
    assert.equal(model.actionInboxTaskCardFailureCategoryPlan("autonomous-delivery-start-repair"), "action_inbox_autonomous_delivery_repair_failed");
  });

  await test("labels, tones, counts, and filters match classic behavior", () => {
    assert.equal(model.actionInboxStatusLabelPlan("waiting"), "稍后");
    assert.equal(model.actionInboxSourceLabelPlan("automation"), "自动化");
    assert.equal(model.actionInboxPluginLabelPlan({ sourceType: "plugin", sourceRef: { pluginId: "finance" } }), "记账");
    assert.equal(model.actionInboxTypeLabelPlan("approval"), "审批");
    assert.equal(model.actionInboxSourceTonePlan("chat"), "source-chat");
    assert.equal(model.actionInboxStatusTonePlan("dismissed"), "muted");
    assert.equal(model.actionInboxIsTerminalStatusPlan("archived"), true);
    assert.equal(model.actionInboxCountsTextPlan({ byStatus: { open: 2, waiting: 1, done: 3 }, byItemType: { todo: 4 } }), "待办 4 · 待处理 2 · 稍后 1 · 已完成 3");
    assert.equal(String(model.actionInboxFilterQueryPlan({ workspaceId: "owner", filter: "todo" })), "workspaceId=owner&limit=120&itemType=todo&sourceType=manual");
    assert.deepEqual(model.actionInboxItemsForActiveFilterPlan([
      { id: "manual", sourceType: "manual", itemType: "todo" },
      { id: "automation", sourceType: "automation", itemType: "todo" },
      { id: "delivery", itemType: "delivery" },
    ], "todo").map((item) => item.id), ["manual"]);
  });

  await test("todo due, display text, deliverable, and detail plans normalize items", () => {
    const item = {
      itemType: "todo",
      title: "待办提醒",
      summary: "截止：2026-05-27T08:00:00.000Z",
      sourceRef: {
        scheduledTodo: true,
        automationTitle: "Read chapter",
        detailMessage: { format: "markdown", sourceTurnId: "turn-1", body: "# Body", truncated: true },
      },
    };
    assert.equal(model.actionInboxTodoDueAtPlan(item), "2026-05-27T08:00:00.000Z");
    assert.equal(model.actionInboxTodoDueTextPlan({ item, compactTime: "05/27 16:00" }), "05/27 16:00");
    assert.equal(model.actionInboxDisplayTitlePlan({ item, dueText: "05/27 16:00" }), "Read chapter");
    assert.equal(model.actionInboxDisplaySummaryPlan({ item, dueText: "05/27 16:00" }), "");
    assert.deepEqual(model.actionInboxDetailMessagePlan(item), {
      format: "markdown",
      sourceTurnId: "turn-1",
      body: "# Body",
      truncated: true,
    });
    assert.deepEqual(model.actionInboxPrimaryDeliverablePlan({
      sourceType: "automation",
      itemType: "delivery",
      sourceRef: { latestDeliverableUrl: "/api/automations/deliverable?id=1", latestDocumentName: "out.md" },
    }), { url: "/api/automations/deliverable?id=1", name: "out.md", mime: "" });
    assert.equal(model.actionInboxDeliverableKindPlan({ name: "out.pdf" }), "pdf");
  });

  await test("request classifiers preserve return values", () => {
    assert.equal(model.actionInboxIsFinanceLedgerJoinRequestPlan({
      sourceType: "plugin",
      sourceRef: { pluginId: "finance", notificationType: "finance.ledger_join_request" },
    }), true);
    assert.equal(model.actionInboxIsDiagnosticRemediationCandidatePlan({
      sourceType: "ai_ops",
      sourceId: "case-1",
      sourceRef: { notificationType: "ai_ops.diagnostic_remediation_candidate" },
    }), "case-1");
    assert.equal(model.actionInboxIsPluginConversationRepairRequestPlan({
      sourceType: "plugin_conversation",
      sourceRef: { notificationType: "plugin_conversation.repair_request", requestId: "req-1" },
    }), "req-1");
    assert.equal(model.actionInboxIsAutonomousDeliveryStartRequestPlan({
      sourceType: "autonomous_delivery",
      sourceRef: { notificationType: "autonomous_delivery.start_required", caseId: "case-1" },
    }), "case-1");
    assert.equal(model.actionInboxIsAutonomousDeliveryVerificationRequestPlan({
      sourceType: "autonomous_delivery",
      sourceRef: { notificationType: "autonomous_delivery.verification_required", caseId: "case-1", sliceId: "slice-1" },
    }), "slice-1");
    assert.equal(model.actionInboxIsAutonomousDeliveryRepairRequestPlan({
      sourceType: "autonomous_delivery",
      sourceRef: { notificationType: "autonomous_delivery.repair_required", caseId: "case-1", verificationSliceId: "verify-1" },
    }), "verify-1");
    assert.equal(model.actionInboxShouldShowLoadingPlan({ hasItems: false, hasCounts: false, hasDetail: false }), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
