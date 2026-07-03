const MESSAGE_ACTION_PANEL_VERSION = "20260702-vite-message-action-panel-model-v1";
const ACTION_KIND_WARDROBE_OUTFIT_WEAR = "outfit_wear_intent";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function boundedArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
}

function wardrobeOutfitWearActionState(message = {}) {
  return firstObject(
    message?.pluginActions?.wardrobeOutfitWearIntent,
    message?.pluginActions?.outfit_wear_intent,
    message?.plugin_actions?.wardrobeOutfitWearIntent,
    message?.plugin_actions?.outfit_wear_intent,
    message?.wardrobeOutfitWearIntent,
    message?.outfit_wear_intent,
    message?.outfitWearIntent,
    message?.metadata?.wardrobeOutfitWearIntent,
    message?.metadata?.outfit_wear_intent,
    message?.metadata?.outfitWearIntent,
    message?.rawJson?.pluginActions?.wardrobeOutfitWearIntent,
    message?.rawJson?.pluginActions?.outfit_wear_intent,
    message?.rawJson?.plugin_actions?.wardrobeOutfitWearIntent,
    message?.rawJson?.plugin_actions?.outfit_wear_intent,
    message?.rawJson?.wardrobeOutfitWearIntent,
    message?.rawJson?.outfit_wear_intent,
    message?.rawJson?.outfitWearIntent,
  );
}

function wardrobeOutfitWearActionDiagnostic(message = {}) {
  return firstObject(
    message?.pluginActionDiagnostics?.wardrobeOutfitWearIntent,
    message?.pluginActionDiagnostics?.outfit_wear_intent,
    message?.plugin_action_diagnostics?.wardrobeOutfitWearIntent,
    message?.plugin_action_diagnostics?.outfit_wear_intent,
  );
}

function wardrobeOutfitWearActionLabel(action = {}) {
  const status = cleanString(action.status, 80);
  if (status === "running") return "写入中";
  if (status === "needs_confirmation") return "确认替换";
  if (status === "stored") {
    const outfitId = cleanString(action.outfitId || action.outfit_id, 80);
    const verified = Boolean(action.readbackVerified || action.readback_verified);
    return `已入库${outfitId ? ` #${outfitId}` : ""}${verified ? " · 已验证" : ""}`;
  }
  if (status === "error") return "写入失败";
  return "入库";
}

function wardrobeOutfitWearDiagnosticLabel(diagnostic = {}) {
  const reason = cleanString(diagnostic.reason || diagnostic.code, 120);
  if (reason === "expired") return "已过期";
  if (reason === "prepare_tool_output_not_attached" || diagnostic.code === "intent_metadata_missing") return "需重新生成";
  return "不可入库";
}

function normalizedWardrobeStatus(action = {}, diagnostic = null) {
  const status = cleanString(action.status, 80);
  if (["ready", "running", "needs_confirmation", "stored", "error"].includes(status)) return status;
  if (diagnostic) return "blocked";
  return "";
}

function itemCodeEvidence(items = []) {
  return boundedArray(items)
    .map((item) => cleanString(item?.code || item?.item_code || item?.id, 80))
    .filter(Boolean)
    .slice(0, 8);
}

function wardrobeActionDetail(action = {}, diagnostic = null) {
  if (diagnostic) {
    const reason = cleanString(diagnostic.reason || diagnostic.code || "intent_unavailable", 120);
    if (reason === "expired") return "衣橱入库动作已过期，请重新生成搭配建议。";
    return "这条消息暂时没有可执行的衣橱入库动作。";
  }
  const status = cleanString(action.status, 80);
  if (status === "stored") {
    const outfitId = cleanString(action.outfitId || action.outfit_id, 80);
    const verified = Boolean(action.readbackVerified || action.readback_verified);
    return `衣橱穿着记录已写入${outfitId ? ` #${outfitId}` : ""}${verified ? "，已回读验证。" : "。"}`;
  }
  if (status === "error") return cleanString(action.error || action.reason || "衣橱入库失败。", 180);
  const intent = action.intent || {};
  const wearDate = cleanString(intent.wear_date || intent.wearDate, 80);
  const codes = itemCodeEvidence(intent.items);
  const parts = [];
  if (wearDate) parts.push(wearDate);
  if (codes.length) parts.push(`${codes.length} 件`);
  if (status === "needs_confirmation") parts.push("需要确认替换");
  return parts.length ? parts.join(" · ") : "可写入衣橱穿着记录。";
}

function buildWardrobeOutfitWearActionView(message = {}) {
  const action = wardrobeOutfitWearActionState(message);
  const diagnostic = wardrobeOutfitWearActionDiagnostic(message);
  if (!action && !diagnostic) {
    return Object.freeze({
      kind: ACTION_KIND_WARDROBE_OUTFIT_WEAR,
      visible: false,
      status: "missing",
      label: "",
      detail: "",
      enabled: false,
      reason: "not_present",
      itemCodes: Object.freeze([]),
    });
  }
  const status = normalizedWardrobeStatus(action || {}, diagnostic);
  if (action && action.kind !== ACTION_KIND_WARDROBE_OUTFIT_WEAR) {
    return Object.freeze({
      kind: ACTION_KIND_WARDROBE_OUTFIT_WEAR,
      visible: false,
      status: "unsupported",
      label: "",
      detail: "",
      enabled: false,
      reason: "unsupported_action_kind",
      itemCodes: Object.freeze([]),
    });
  }
  const enabled = Boolean(action)
    && ["ready", "needs_confirmation"].includes(status)
    && action.executable !== false;
  const itemCodes = itemCodeEvidence(action?.intent?.items || []);
  return Object.freeze({
    kind: ACTION_KIND_WARDROBE_OUTFIT_WEAR,
    visible: true,
    status: status || "unknown",
    label: diagnostic ? wardrobeOutfitWearDiagnosticLabel(diagnostic) : wardrobeOutfitWearActionLabel(action || {}),
    detail: wardrobeActionDetail(action || {}, diagnostic),
    enabled,
    reason: diagnostic ? cleanString(diagnostic.reason || diagnostic.code || "intent_unavailable", 120) : "",
    messageId: cleanString(message.id || message.messageId, 160),
    outfitId: cleanString(action?.outfitId || action?.outfit_id, 80),
    readbackVerified: Boolean(action?.readbackVerified || action?.readback_verified),
    wearDate: cleanString(action?.intent?.wear_date || action?.intent?.wearDate, 80),
    itemCount: boundedArray(action?.intent?.items).length,
    itemCodes: Object.freeze(itemCodes),
    actionRequiresConfirmation: status === "needs_confirmation",
  });
}

function usageSummary(message = {}) {
  const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
  const total = Number(usage.total_tokens ?? usage.total ?? 0);
  const model = cleanString(
    usage.model
      || usage.model_name
      || usage.response_model
      || message.model
      || "",
    120,
  );
  const provider = cleanString(usage.provider || usage.model_provider || message.provider || "", 80);
  return Object.freeze({
    visible: Boolean(total || model || provider),
    totalTokens: Number.isFinite(total) && total > 0 ? total : 0,
    model,
    provider,
    label: total > 0 ? `Usage ${total}` : "Usage",
  });
}

function messageTextPreview(message = {}) {
  const content = message.content ?? message.text ?? message.summary ?? "";
  if (Array.isArray(content)) {
    return cleanString(content.map((item) => item?.text || item?.content || "").filter(Boolean).join(" "), 160);
  }
  if (content && typeof content === "object") {
    return cleanString(content.text || content.content || content.summary || "", 160);
  }
  return cleanString(content, 160);
}

function buildMessageActionPanelViewModel(message = {}, options = {}) {
  const wardrobe = buildWardrobeOutfitWearActionView(message);
  const usage = usageSummary(message);
  const role = cleanString(message.role || "assistant", 40);
  const visibleActions = [wardrobe].filter((action) => action.visible);
  const actionExecutionEnabled = Boolean(options.actionExecutionEnabled);
  return Object.freeze({
    panelVersion: MESSAGE_ACTION_PANEL_VERSION,
    messageId: cleanString(message.id || message.messageId, 160),
    role,
    title: cleanString(options.title || "消息动作预览", 120),
    textPreview: messageTextPreview(message),
    usage,
    actions: Object.freeze(visibleActions),
    wardrobe,
    hasActions: visibleActions.length > 0,
    emptyText: "这条消息没有可迁移的动作元数据。",
    readOnly: !actionExecutionEnabled,
    actionExecutionEnabled,
  });
}

export {
  ACTION_KIND_WARDROBE_OUTFIT_WEAR,
  MESSAGE_ACTION_PANEL_VERSION,
  buildMessageActionPanelViewModel,
  buildWardrobeOutfitWearActionView,
  cleanString,
  itemCodeEvidence,
  messageTextPreview,
  normalizedWardrobeStatus,
  usageSummary,
  wardrobeOutfitWearActionDiagnostic,
  wardrobeOutfitWearActionLabel,
  wardrobeOutfitWearActionState,
  wardrobeOutfitWearDiagnosticLabel,
};
