"use strict";

const crypto = require("node:crypto");

const KNOWN_WORKSPACES = Object.freeze([
  Object.freeze({ id: "home-ai", labels: ["home ai", "home-ai", "host", "platform", "平台"], path: "/Users/example/path" }),
  Object.freeze({ id: "finance", labels: ["finance", "记账", "财务"], path: "/Users/example/path" }),
  Object.freeze({ id: "wardrobe", labels: ["wardrobe", "衣橱"], path: "/Users/example/path" }),
  Object.freeze({ id: "note", labels: ["note", "笔记"], path: "/Users/example/path" }),
  Object.freeze({ id: "music", labels: ["music", "音乐"], path: "/Users/example/path" }),
  Object.freeze({ id: "growth", labels: ["growth", "成长"], path: "/Users/example/path" }),
  Object.freeze({ id: "health", labels: ["health", "healthy", "健康"], path: "/Users/example/path" }),
  Object.freeze({ id: "email", labels: ["email", "邮件"], path: "/Users/example/path" }),
  Object.freeze({ id: "moira", labels: ["moira", "星盘"], path: "/Users/example/path" }),
  Object.freeze({ id: "codex-mobile", labels: ["codex mobile", "codex-mobile", "codex"], path: "/Users/example/path" }),
  Object.freeze({ id: "movie", labels: ["movie", "影院", "电影"], path: "/Users/example/path" }),
]);

const LOOP_PHASES = Object.freeze([
  "intent_intake",
  "decision_gate",
  "work_breakdown",
  "implementation",
  "verification",
  "deployment",
  "audit_closure",
  "final_report",
]);

function clean(value, max = 1200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function nowIso(inputNow) {
  if (inputNow instanceof Date) return inputNow.toISOString();
  if (inputNow) return new Date(inputNow).toISOString();
  return new Date().toISOString();
}

function classifyIntentText(text) {
  const normalized = clean(text, 4000);
  const lower = normalized.toLowerCase();
  return {
    normalized,
    lower,
    mentionsAudit: /审计|audit|product reality|deep product/i.test(normalized),
    mentionsUi: /ui|界面|页面|按钮|文案|视觉|交互|设计|截图|布局|样式|体验|ux|redesign|重新设计/i.test(normalized),
    mentionsDeploy: /部署|上线|deploy|production|生产|release/i.test(normalized),
    mentionsImplementation: /实现|修复|修改|更改|改成|改为|改造|build|implement|fix|repair|接入|增加|开发|重构/i.test(normalized),
    mentionsResearch: /研究|可行性|方案|调研|explore|feasibility|investigate/i.test(normalized),
    mentionsDangerousDevice: /投影|projector|christie|trinnov|magnetar|设备控制|关机|开机|power|shutter|播放|一键播放/i.test(normalized),
    mentionsDataMigration: /迁移|migration|backfill|数据修复|批量修改|删除数据|重建|reindex/i.test(normalized),
    mentionsSecrets: /密码|secret|token|key|credential|cookie|access key|workspace key/i.test(normalized),
    wantsLowIntervention: /最小介入|自动|闭环|loop|循环|自主|不要停|继续|end.?to.?end/i.test(normalized),
  };
}

function inferWorkspaces(flags, explicitWorkspaces = []) {
  const requested = unique((explicitWorkspaces || []).map((item) => clean(item, 120).toLowerCase()));
  const found = [];
  for (const workspace of KNOWN_WORKSPACES) {
    if (requested.includes(workspace.id) || workspace.labels.some((label) => flags.lower.includes(label.toLowerCase()))) {
      found.push({ id: workspace.id, path: workspace.path });
    }
  }
  return found.length ? found : [{ id: "home-ai", path: "/Users/example/path" }];
}

function inferRisk(flags) {
  if (flags.mentionsDangerousDevice || flags.mentionsSecrets || flags.mentionsDataMigration) return "high";
  if (flags.mentionsDeploy) return "high";
  if (flags.mentionsImplementation || flags.mentionsAudit) return "medium";
  return "low";
}

function inferMode(flags) {
  const explicitMutationCommand = /修复|修改|更改|改成|改为|改造|build|implement|fix|repair|接入|增加|开发|重构|部署|上线|deploy|production|release/i.test(flags.normalized);
  if (flags.mentionsAudit && !explicitMutationCommand) return "audit";
  if (flags.mentionsResearch && !flags.mentionsImplementation && !flags.mentionsDeploy) return "research";
  if (flags.mentionsDeploy && !flags.mentionsImplementation) return "deployment";
  return "delivery";
}

function decisionGate(flags, risk, approvals = {}, mode = "delivery") {
  const required = [];
  if (!flags.normalized) required.push("requirement_definition");
  if (flags.mentionsUi && mode === "delivery") required.push("ui_product_decision");
  if ((risk === "high" || flags.mentionsDeploy) && !approvals.highRisk) required.push("high_risk_approval");
  if (flags.mentionsDangerousDevice && !approvals.deviceControl) required.push("device_control_approval");
  if (flags.mentionsDataMigration && !approvals.dataMutation) required.push("data_mutation_approval");
  if (flags.mentionsSecrets) required.push("secret_boundary_confirmation");
  return {
    required,
    userInterventionRequired: required.length > 0,
    canAutoContinue: required.length === 0,
  };
}

function nextPhases(mode, gate) {
  const phases = ["intent_intake"];
  if (gate.userInterventionRequired) phases.push("decision_gate");
  if (mode === "audit") return [...phases, "audit_closure", "final_report"];
  if (mode === "research") return [...phases, "work_breakdown", "verification", "final_report"];
  if (mode === "deployment") return [...phases, "deployment", "verification", "audit_closure", "final_report"];
  return [...phases, "work_breakdown", "implementation", "verification", "deployment", "audit_closure", "final_report"];
}

function buildTaskSlices(flags, workspaces, mode) {
  const slices = [];
  if (mode === "audit") {
    slices.push({
      id: "audit",
      ownerLayer: "dedicated_audit_thread",
      status: "pending",
      description: "Run a read-only audit and return findings or closure evidence.",
    });
    return slices;
  }
  if (flags.mentionsResearch) {
    slices.push({
      id: "research",
      ownerLayer: "implementation_thread",
      status: "pending",
      description: "Clarify feasibility, product direction, and architecture options before mutation.",
    });
  }
  if (flags.mentionsUi) {
    slices.push({
      id: "product_ui_decision",
      ownerLayer: "user_visible_decision",
      status: "requires_user",
      description: "Confirm visible product, UX, copy, or interaction decisions before implementation.",
    });
  }
  if (flags.mentionsImplementation || mode === "delivery") {
    slices.push(...workspaces.map((workspace) => ({
      id: `implement_${workspace.id}`,
      ownerLayer: workspace.id === "home-ai" ? "home_ai_workspace" : "plugin_workspace",
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      status: "pending",
      description: "Implement the scoped change in the owning workspace.",
    })));
  }
  if (flags.mentionsDeploy) {
    slices.push({
      id: "deploy",
      ownerLayer: "deployment_owner",
      status: "pending",
      description: "Deploy through the bounded central deploy contract and verify production readback.",
    });
  }
  slices.push({
    id: "closure_verification",
    ownerLayer: "verification_or_audit_thread",
    status: "pending",
    description: "Verify source, tests, production/user path, residual risk, and return-card closure.",
  });
  return slices;
}

function autonomyPolicy(gate, flags, risk, mode) {
  const stopConditions = [
    "missing_terminal_task_card_return",
    "production_user_path_unverified_after_runtime_change",
    "raw_secret_or_private_payload_required",
  ];
  if (flags.mentionsUi && mode === "delivery") stopConditions.push("unconfirmed_user_visible_product_decision");
  if (risk === "high") stopConditions.push("unapproved_high_risk_mutation");
  if (flags.mentionsDangerousDevice) stopConditions.push("unapproved_device_control");
  return {
    canAutoPlan: true,
    canAutoDispatch: !gate.userInterventionRequired,
    canAutoImplement: mode === "delivery" && !gate.userInterventionRequired && risk !== "high",
    canAutoDeploy: mode === "deployment" && !gate.userInterventionRequired && flags.mentionsDeploy && risk !== "high",
    stopConditions: unique(stopConditions),
  };
}

function createAutonomousDeliveryIntent(input = {}) {
  const flags = classifyIntentText(input.text || input.intent || input.requirement || "");
  const workspaces = inferWorkspaces(flags, input.workspaces || input.workspaceIds || []);
  const risk = inferRisk(flags);
  const mode = inferMode(flags);
  const gate = decisionGate(flags, risk, input.approvals || {}, mode);
  const phases = nextPhases(mode, gate);
  return {
    ok: Boolean(flags.normalized),
    schemaVersion: 1,
    id: input.id || `delivery-intent-${crypto.createHash("sha256").update(flags.normalized || nowIso(input.now)).digest("hex").slice(0, 12)}`,
    createdAt: nowIso(input.now),
    objective: flags.normalized,
    mode,
    risk,
    requestedLowIntervention: flags.wantsLowIntervention,
    targetWorkspaces: workspaces,
    userDecisionGate: gate,
    autonomyPolicy: autonomyPolicy(gate, flags, risk, mode),
    phases,
    taskSlices: buildTaskSlices(flags, workspaces, mode),
    privacyBoundary: {
      storesRawSecrets: false,
      storesPrivatePayloads: false,
      allowedEvidence: ["ids", "file paths", "commit ids", "bounded statuses", "short summaries"],
    },
    blockedIf: gate.required.map((item) => `user_decision_missing:${item}`),
  };
}

module.exports = {
  LOOP_PHASES,
  createAutonomousDeliveryIntent,
  classifyIntentText,
};
