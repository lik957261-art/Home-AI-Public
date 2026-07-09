"use strict";

export const ACTION_INBOX_MODEL_VERSION = "20260705-action-inbox-model-v1";

export const ACTION_INBOX_AUDIT_TARGETS = Object.freeze([
  Object.freeze({ id: "home-ai", label: "Home AI 宿主", thread: "Home AI Platform Audit" }),
  Object.freeze({ id: "codex-mobile", label: "Codex", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "finance", label: "记账", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "wardrobe", label: "衣橱", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "health", label: "健康", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "music", label: "Music", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "movie", label: "影院", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "email", label: "邮件", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "note", label: "笔记", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "growth", label: "成长", thread: "Plugin Workspace Audit" }),
  Object.freeze({ id: "moira", label: "星盘", thread: "Plugin Workspace Audit" }),
]);

function clean(value = "", max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function lower(value = "") {
  return clean(value, 240).toLowerCase();
}

function sourceRef(item = {}) {
  return item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
}

export function actionInboxAuditTargetOptionsPlan() {
  return ACTION_INBOX_AUDIT_TARGETS;
}

export function actionInboxValidAuditTargetIdPlan(value) {
  const id = clean(value, 120);
  return ACTION_INBOX_AUDIT_TARGETS.some((target) => target.id === id) ? id : "home-ai";
}

export function actionInboxSafeTokenPlan(value, emptyValue = "unknown", limit = 120) {
  const text = String(value == null ? "" : value)
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, Math.max(1, Number(limit) || 120));
  return text || emptyValue;
}

export function actionInboxTaskCardDispatchKeyPlan(item = {}, action = "") {
  const ref = sourceRef(item);
  const sourceId = [
    clean(ref.caseId || ref.requestId || ref.request_id || item?.sourceId || item?.source_id || item?.id, 160),
    clean(ref.sliceId || ref.slice_id, 160),
  ].filter(Boolean).join(":");
  return [
    actionInboxSafeTokenPlan(action, "task_card_action", 80),
    actionInboxSafeTokenPlan(item?.sourceType || item?.source_type || "inbox", "inbox", 80),
    actionInboxSafeTokenPlan(sourceId, "item", 160),
  ].join(":");
}

export function actionInboxErrorCodePlan(error) {
  return actionInboxSafeTokenPlan(error?.code || error?.error || error?.message || error || "task_card_dispatch_failed", "task_card_dispatch_failed", 120);
}

export function actionInboxErrorMessagePlan(error) {
  const message = String(error?.message || error?.error || error || "发送失败").trim().replace(/\s+/g, " ");
  return message.slice(0, 160) || "发送失败";
}

export function actionInboxTaskCardFailureCategoryPlan(action = "") {
  if (action === "plugin-conversation-send-card") return "action_inbox_plugin_conversation_task_card_failed";
  if (action === "autonomous-delivery-start") return "action_inbox_autonomous_delivery_start_failed";
  if (action === "autonomous-delivery-start-verification") return "action_inbox_autonomous_delivery_verification_failed";
  if (action === "autonomous-delivery-start-deployment") return "action_inbox_autonomous_delivery_deployment_failed";
  if (action === "autonomous-delivery-start-repair") return "action_inbox_autonomous_delivery_repair_failed";
  if (action === "autonomous-delivery-close") return "action_inbox_autonomous_delivery_close_failed";
  if (action === "diagnostic-remediation-send-card") return "action_inbox_diagnostic_task_card_failed";
  return "action_inbox_diagnostic_task_card_failed";
}

export function actionInboxStatusLabelPlan(status) {
  const value = lower(status);
  if (value === "waiting") return "稍后";
  if (value === "done") return "已完成";
  if (value === "dismissed") return "已忽略";
  if (value === "archived") return "已归档";
  return "待处理";
}

export function actionInboxSourceLabelPlan(sourceType) {
  const value = lower(sourceType);
  if (value === "growth") return "成长";
  if (value === "automation") return "自动化";
  if (value === "manual") return "待办";
  if (value === "chat") return "任务回执";
  if (value === "directory") return "目录";
  if (value === "autonomous_delivery") return "交付 Loop";
  return value || "收件";
}

export function actionInboxPluginLabelPlan(item = {}) {
  const ref = sourceRef(item);
  const pluginId = clean(ref.pluginId, 120);
  const sourceType = lower(item?.sourceType || item?.source_type);
  if (sourceType === "ai_ops") return "AI Ops";
  if (sourceType === "autonomous_delivery") return "交付 Loop";
  if (pluginId === "finance") return "记账";
  if (pluginId === "wardrobe") return "衣橱";
  if (pluginId === "health" || pluginId === "healthy") return "健康";
  if (pluginId === "home-ai") return "Home AI";
  if (pluginId === "music") return "Music";
  if (pluginId === "movie") return "影院";
  if (pluginId === "codex-mobile") return "Codex";
  if (sourceType === "plugin_conversation") return "插件会话";
  return actionInboxSourceLabelPlan(item.sourceType);
}

export function actionInboxTypeLabelPlan(itemType) {
  const value = lower(itemType);
  if (value === "delivery") return "交付";
  if (value === "error") return "异常";
  if (value === "review") return "审阅";
  if (value === "reflection") return "反思";
  if (value === "revision") return "修订";
  if (value === "approval") return "审批";
  if (value === "mention") return "提及";
  if (value === "info") return "通知";
  if (value === "todo") return "待办";
  return value || "事项";
}

export function actionInboxSourceTonePlan(sourceType) {
  const value = lower(sourceType);
  if (value === "automation") return "source-automation";
  if (value === "growth") return "source-growth";
  if (value === "manual") return "source-manual";
  if (value === "chat") return "source-chat";
  if (value === "plugin" || value === "autonomous_delivery") return "source-plugin";
  return "source-default";
}

export function actionInboxStatusTonePlan(status) {
  const value = lower(status);
  if (value === "done") return "done";
  if (value === "dismissed" || value === "archived") return "muted";
  if (value === "waiting") return "waiting";
  return "open";
}

export function actionInboxIsTerminalStatusPlan(status) {
  return ["done", "dismissed", "archived"].includes(lower(status));
}

export function actionInboxTodoDueAtPlan(item = {}) {
  const explicit = clean(item?.dueAt || item?.due_at, 240);
  if (explicit) return explicit;
  const summary = String(item?.summary || "");
  const match = summary.match(/(?:截止|到期|时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i);
  return match ? match[1] : "";
}

export function actionInboxTodoDueTextPlan({ item = {}, compactTime = "" } = {}) {
  if (lower(item?.itemType || item?.item_type) !== "todo") return "";
  return actionInboxTodoDueAtPlan(item) ? String(compactTime || "") : "";
}

export function actionInboxDisplayTitlePlan({ item = {}, dueText = "" } = {}) {
  const dueAt = actionInboxTodoDueAtPlan(item);
  const ref = sourceRef(item);
  let title = String(item?.title || item?.summary || item?.id || "收件");
  if (ref.scheduledTodo && title.trim() === "待办提醒") {
    title = String(ref.automationTitle || ref.reminderTitle || item?.summary || title)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^交付文件\s*[:：]/.test(line))
      || title;
  }
  return title.replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?/g, dueAt ? dueText : "");
}

export function actionInboxDisplaySummaryPlan({ item = {}, dueText = "" } = {}) {
  const summary = String(item?.summary || "");
  if (!dueText) return summary;
  const normalized = summary.replace(/(?:截止|到期|时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/ig, `截止 ${dueText}`);
  return normalized === `截止 ${dueText}` ? "" : normalized;
}

export function actionInboxDetailMessagePlan(item = {}) {
  const ref = sourceRef(item);
  const detail = ref.detailMessage && typeof ref.detailMessage === "object" ? ref.detailMessage : null;
  const body = clean(detail?.body, 100000);
  if (!body) return null;
  return {
    format: lower(detail.format) === "markdown" ? "markdown" : "text",
    sourceTurnId: clean(detail.sourceTurnId || detail.source_turn_id, 240),
    body,
    truncated: Boolean(detail.truncated),
  };
}

export function actionInboxFilterQueryPlan({ workspaceId = "owner", filter = "open", sourceFilter = "", search = "" } = {}) {
  const params = new URLSearchParams({ workspaceId: workspaceId || "owner", limit: "120" });
  const normalizedFilter = clean(filter || "open", 80);
  if (normalizedFilter === "todo") {
    params.set("itemType", "todo");
    params.set("sourceType", "manual");
  } else {
    params.set("excludeItemType", "todo");
  }
  if (normalizedFilter === "all") params.set("includeDone", "1");
  else if (normalizedFilter && normalizedFilter !== "todo") params.set("status", normalizedFilter);
  if (sourceFilter) params.set("sourceType", sourceFilter);
  if (search) params.set("search", search);
  return params;
}

export function actionInboxCountsTextPlan(counts = {}) {
  const byStatus = counts.byStatus || {};
  const byItemType = counts.byItemType || {};
  const todo = Number(byItemType.todo || 0);
  const open = Number(byStatus.open || 0);
  const waiting = Number(byStatus.waiting || 0);
  const done = Number(byStatus.done || 0);
  return `待办 ${todo} · 待处理 ${open} · 稍后 ${waiting} · 已完成 ${done}`;
}

export function actionInboxItemTypePlan(item = {}) {
  return lower(item?.itemType || item?.item_type);
}

export function actionInboxIsManualTodoPlan(item = {}) {
  return lower(item?.sourceType || item?.source_type) === "manual" && actionInboxItemTypePlan(item) === "todo";
}

export function actionInboxItemsForActiveFilterPlan(items = [], filter = "open") {
  const list = Array.isArray(items) ? items : [];
  if (lower(filter) === "todo") return list.filter(actionInboxIsManualTodoPlan);
  return list.filter((item) => actionInboxItemTypePlan(item) !== "todo");
}

export function actionInboxLinkTargetsLegacyTodoPlan(link = "", origin = "http://localhost") {
  const value = clean(link, 2000);
  if (!value) return false;
  try {
    const parsed = new URL(value, origin || "http://localhost");
    const view = lower(parsed.searchParams.get("view") || parsed.searchParams.get("viewMode"));
    return view === "todos" || parsed.searchParams.has("todoId");
  } catch (_) {
    return /(?:[?&](?:view|viewMode)=todos\b|[?&]todoId=)/i.test(value);
  }
}

export function actionInboxLatestDeliverablePlan(item = {}) {
  const ref = sourceRef(item);
  const direct = ref.latestDeliverable && typeof ref.latestDeliverable === "object" ? ref.latestDeliverable : {};
  let url = clean(direct.url || ref.latestDeliverableUrl || ref.latest_document_url, 2000);
  if (!url) {
    const signature = clean(ref.signature, 4000);
    const match = signature.match(/(\/api\/automations\/deliverable\?[^|]+)/);
    if (match) url = match[1];
  }
  if (!url) return null;
  return {
    url,
    name: clean(direct.name || ref.latestDocumentName || ref.latest_document_name || "delivery.md", 240) || "delivery.md",
    mime: clean(direct.mime || direct.contentType || ref.latestDeliverableMime, 240),
  };
}

export function actionInboxPrimaryDeliverablePlan(item = {}) {
  const sourceType = lower(item?.sourceType || item?.source_type);
  const itemType = lower(item?.itemType || item?.item_type);
  const ref = sourceRef(item);
  const canReadDirectly = itemType === "delivery" || itemType === "review" || (itemType === "todo" && ref.scheduledTodo);
  if (sourceType !== "automation" || !canReadDirectly) return null;
  return actionInboxLatestDeliverablePlan(item);
}

export function actionInboxNotificationRequestPlan(item = {}, expectedSourceType = "", expectedNotificationType = "", requireSlice = false) {
  const ref = sourceRef(item);
  const sourceType = lower(item?.sourceType || item?.source_type);
  const notificationType = clean(ref.notificationType, 240);
  const caseId = clean(ref.caseId || ref.case_id || item?.sourceId || item?.source_id, 240);
  const sliceId = clean(ref.sliceId || ref.slice_id, 240);
  if (sourceType !== expectedSourceType || notificationType !== expectedNotificationType || !caseId) return "";
  if (requireSlice && !sliceId) return false;
  return requireSlice ? sliceId : caseId;
}

export function actionInboxIsFinanceLedgerJoinRequestPlan(item = {}) {
  const ref = sourceRef(item);
  return lower(item?.sourceType || item?.source_type) === "plugin"
    && clean(ref.pluginId) === "finance"
    && clean(ref.notificationType) === "finance.ledger_join_request";
}

export function actionInboxIsDiagnosticRemediationCandidatePlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "ai_ops", "ai_ops.diagnostic_remediation_candidate", false);
}

export function actionInboxIsPluginConversationRepairRequestPlan(item = {}) {
  const ref = sourceRef(item);
  return lower(item?.sourceType || item?.source_type) === "plugin_conversation"
    && clean(ref.notificationType) === "plugin_conversation.repair_request"
    && clean(ref.requestId || ref.request_id || item?.sourceId || item?.source_id);
}

export function actionInboxIsAutonomousDeliveryStartRequestPlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "autonomous_delivery", "autonomous_delivery.start_required", false);
}

export function actionInboxIsAutonomousDeliveryVerificationRequestPlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "autonomous_delivery", "autonomous_delivery.verification_required", true);
}

export function actionInboxIsAutonomousDeliveryClosureRequestPlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "autonomous_delivery", "autonomous_delivery.closure_required", false);
}

export function actionInboxIsAutonomousDeliveryFinalReportPlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "autonomous_delivery", "autonomous_delivery.final_report_ready", false);
}

export function actionInboxIsAutonomousDeliveryDeploymentRequestPlan(item = {}) {
  return actionInboxNotificationRequestPlan(item, "autonomous_delivery", "autonomous_delivery.deploy_readback_required", true);
}

export function actionInboxIsAutonomousDeliveryRepairRequestPlan(item = {}) {
  const ref = sourceRef(item);
  const caseId = clean(ref.caseId || ref.case_id || item?.sourceId || item?.source_id);
  const verificationSliceId = clean(ref.verificationSliceId || ref.verification_slice_id || ref.sliceId || ref.slice_id);
  return lower(item?.sourceType || item?.source_type) === "autonomous_delivery"
    && clean(ref.notificationType) === "autonomous_delivery.repair_required"
    && caseId
    && verificationSliceId;
}

export function actionInboxDeliverableKindPlan(deliverable = {}) {
  const name = lower(deliverable.name);
  const mime = lower(deliverable.mime);
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "word";
  if (mime.includes("spreadsheet") || name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "spreadsheet";
  if (mime.includes("markdown") || name.endsWith(".md")) return "markdown";
  if (mime.includes("text") || name.endsWith(".txt")) return "text";
  return "generic";
}

export function actionInboxShouldShowLoadingPlan({ forceLoading = false, hasItems = false, hasCounts = false, hasDetail = false } = {}) {
  if (forceLoading) return true;
  return !hasItems && !hasCounts && !hasDetail;
}
