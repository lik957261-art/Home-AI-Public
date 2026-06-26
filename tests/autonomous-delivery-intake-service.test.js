"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createAutonomousDeliveryIntent } = require("../adapters/autonomous-delivery-intake-service");

const repoRoot = path.resolve(__dirname, "..");

{
  const intent = createAutonomousDeliveryIntent({
    text: "继续审计财务插件，按照 Deep Product Reality v4 输出架构、实现、UX 改进意见",
    now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(intent.ok, true);
  assert.equal(intent.mode, "audit");
  assert.equal(intent.risk, "medium");
  assert.deepEqual(intent.targetWorkspaces.map((item) => item.id), ["finance"]);
  assert.ok(intent.phases.includes("audit_closure"));
  assert.equal(intent.autonomyPolicy.canAutoDispatch, true);
  assert.equal(intent.autonomyPolicy.canAutoImplement, false);
  assert.equal(intent.autonomyPolicy.stopConditions.includes("unconfirmed_user_visible_product_decision"), false);
  assert.equal(intent.taskSlices[0].ownerLayer, "dedicated_audit_thread");
}

{
  const intent = createAutonomousDeliveryIntent({
    text: "把记账报表界面重新设计一下，先确认 UI 再实现",
    now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(intent.mode, "delivery");
  assert.equal(intent.userDecisionGate.userInterventionRequired, true);
  assert.ok(intent.userDecisionGate.required.includes("ui_product_decision"));
  assert.equal(intent.autonomyPolicy.canAutoDispatch, false);
  assert.ok(intent.taskSlices.some((item) => item.id === "product_ui_decision" && item.status === "requires_user"));
}

{
  const intent = createAutonomousDeliveryIntent({
    text: "修复 Finance 附件上传失败并部署上线",
    approvals: { highRisk: true },
    now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(intent.risk, "high");
  assert.equal(intent.userDecisionGate.userInterventionRequired, false);
  assert.equal(intent.autonomyPolicy.canAutoDispatch, true);
  assert.equal(intent.autonomyPolicy.canAutoDeploy, false);
  assert.ok(intent.taskSlices.some((item) => item.id === "deploy"));
}

{
  const intent = createAutonomousDeliveryIntent({
    text: "接入 Movie 一键播放和投影仪控制，尽量自动闭环",
    approvals: { highRisk: true },
    now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(intent.risk, "high");
  assert.deepEqual(intent.targetWorkspaces.map((item) => item.id), ["movie"]);
  assert.ok(intent.userDecisionGate.required.includes("device_control_approval"));
  assert.ok(intent.autonomyPolicy.stopConditions.includes("unapproved_device_control"));
  assert.equal(intent.requestedLowIntervention, true);
}

{
  const intent = createAutonomousDeliveryIntent({
    text: "研究影院插件的 NAS DLNA 播放可行性，不要改设备",
    now: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(intent.mode, "research");
  assert.deepEqual(intent.targetWorkspaces.map((item) => item.id), ["movie"]);
  assert.ok(intent.taskSlices.some((item) => item.id === "research"));
  assert.equal(intent.autonomyPolicy.canAutoImplement, false);
}

{
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "autonomous-delivery-loop.js"),
    "intake",
    "--text",
    "部署 Home AI 审计 loop 规则",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "deployment");
  assert.equal(parsed.userDecisionGate.userInterventionRequired, true);
  assert.ok(parsed.userDecisionGate.required.includes("high_risk_approval"));
}

console.log("autonomous delivery intake service tests passed");
