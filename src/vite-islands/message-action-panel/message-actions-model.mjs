import {
  ACTION_KIND_WARDROBE_OUTFIT_WEAR,
  buildWardrobeOutfitWearActionView,
  cleanString,
  wardrobeOutfitWearActionDiagnostic,
  wardrobeOutfitWearActionLabel,
  wardrobeOutfitWearActionState,
  wardrobeOutfitWearDiagnosticLabel,
} from "./model.mjs";

const MESSAGE_ACTIONS_MODEL_VERSION = "20260705-vite-message-actions-model-v1";

function canUseMessageReplyActionsPlan(message = {}) {
  return Boolean(message?.role === "assistant" && message?.id && !message.revokedAt);
}

function messageScrollButtonPlan(message = {}, position = "start") {
  if (!canUseMessageReplyActionsPlan(message)) {
    return Object.freeze({ visible: false, messageId: "", position: "start", label: "", title: "", glyph: "" });
  }
  const end = position === "end";
  return Object.freeze({
    visible: true,
    messageId: cleanString(message.id, 180),
    position: end ? "end" : "start",
    label: end ? "Jump to reply end" : "Jump to reply start",
    title: end ? "End" : "Start",
    glyph: end ? "&#8595;" : "&#8593;",
  });
}

function messageScrollEligibleByContentPlan(message = {}) {
  if (!canUseMessageReplyActionsPlan(message)) return Object.freeze({ eligible: false, estimatedLines: 0 });
  const content = String(message.content || "");
  if (!content.trim()) return Object.freeze({ eligible: false, estimatedLines: 0 });
  const estimatedLines = content.split(/\r\n|\r|\n/).reduce((total, line) => {
    const cjk = (line.match(/[\u2e80-\u9fff\uac00-\ud7af]/g) || []).length;
    const ascii = Math.max(0, line.length - cjk);
    const units = cjk + (ascii * 0.55);
    return total + Math.max(1, Math.ceil(units / 18));
  }, 0);
  return Object.freeze({ eligible: estimatedLines > 22, estimatedLines });
}

function messageActionStripPlan(message = {}, options = {}) {
  const canUse = canUseMessageReplyActionsPlan(message);
  const scrollPosition = options.scrollPosition === "end" ? "end" : "start";
  return Object.freeze({
    version: MESSAGE_ACTIONS_MODEL_VERSION,
    canUse,
    scrollPosition,
    controls: Object.freeze(canUse ? ["scroll", "copy", "image", "note"] : []),
  });
}

function wardrobeOutfitWearButtonPlan(message = {}) {
  const view = buildWardrobeOutfitWearActionView(message);
  if (!view.visible) return Object.freeze({ visible: false, htmlKind: "none" });
  if (view.status === "blocked") {
    const reason = cleanString(view.reason || "intent_unavailable", 120);
    return Object.freeze({
      visible: true,
      htmlKind: "diagnostic",
      status: "blocked",
      title: reason === "expired"
        ? "衣橱入库动作已过期，请重新生成搭配建议"
        : "这条消息暂时没有可执行的衣橱入库动作",
      label: view.label || wardrobeOutfitWearDiagnosticLabel(wardrobeOutfitWearActionDiagnostic(message) || {}),
      iconOnly: true,
      disabled: true,
    });
  }
  if (view.kind !== ACTION_KIND_WARDROBE_OUTFIT_WEAR || !["ready", "running", "needs_confirmation", "stored", "error"].includes(view.status)) {
    return Object.freeze({ visible: false, htmlKind: "unsupported" });
  }
  const status = view.status;
  return Object.freeze({
    visible: true,
    htmlKind: "action",
    messageId: view.messageId,
    status,
    label: view.label,
    iconOnly: true,
    disabled: status === "running" || status === "stored" || status === "error" || !view.enabled,
    title: status === "stored"
      ? `已写入衣橱穿着记录${view.outfitId ? ` #${view.outfitId}` : ""}${view.readbackVerified ? " · 已回读验证" : ""}`
      : `写入衣橱穿着记录${view.wearDate ? ` ${view.wearDate}` : ""}${view.itemCount ? ` · ${view.itemCount}件` : ""}`,
  });
}

function wardrobeReplaceConfirmPlan(action = {}) {
  const intent = action.intent || {};
  const wearDate = cleanString(intent.wear_date || intent.wearDate, 120);
  return Object.freeze({
    title: "确认替换",
    message: `这一天已有穿着记录${wearDate ? `（${wearDate}）` : ""}。`,
    detail: "确认后会用这条推荐替换当天记录。",
    confirmLabel: "确认替换",
    cancelLabel: "取消",
  });
}

function wardrobeOutfitWearActionRequestPlan(input = {}) {
  return Object.freeze({
    path: "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent",
    method: "POST",
    body: Object.freeze({
      threadId: cleanString(input.threadId, 220),
      messageId: cleanString(input.messageId, 220),
      workspaceId: cleanString(input.workspaceId, 220),
      confirmReplace: Boolean(input.confirmReplace),
      mode: input.confirmReplace ? "replace" : "create_only",
    }),
  });
}

function messageScrollVisibilityPlan(input = {}) {
  const viewportHeight = Math.max(0, Number(input.viewportHeight) || 0);
  const messageHeight = Math.max(0, Number(input.messageHeight) || 0);
  const showThreshold = Math.max(180, viewportHeight - 24);
  const hideThreshold = Math.max(160, viewportHeight - 96);
  const measured = viewportHeight > 0 && messageHeight > 0;
  const measuredLong = measured && messageHeight > showThreshold;
  const contentEligible = Boolean(input.previouslyEligible || measuredLong || input.wasShown);
  const suppressForActiveRun = Boolean(input.hasRunProgress && !contentEligible && !input.wasShown);
  const shouldShow = viewportHeight > 0 && !suppressForActiveRun && (
    input.canReturnToStart
    || input.canJumpToEnd
    || measuredLong
    || (!measured && contentEligible)
    || (contentEligible && messageHeight > hideThreshold)
  );
  return Object.freeze({
    contentEligible,
    measuredLong,
    suppressForActiveRun,
    shouldShow,
    startFooterVisible: Boolean(input.isStartButton && contentEligible && input.canReturnToStart && input.footerVisible),
    endVisible: Boolean(!input.isStartButton && !input.atBottom && shouldShow && input.canJumpToEnd),
  });
}

export {
  MESSAGE_ACTIONS_MODEL_VERSION,
  canUseMessageReplyActionsPlan,
  messageActionStripPlan,
  messageScrollButtonPlan,
  messageScrollEligibleByContentPlan,
  messageScrollVisibilityPlan,
  wardrobeOutfitWearActionDiagnostic,
  wardrobeOutfitWearActionLabel,
  wardrobeOutfitWearActionRequestPlan,
  wardrobeOutfitWearActionState,
  wardrobeOutfitWearButtonPlan,
  wardrobeOutfitWearDiagnosticLabel,
  wardrobeReplaceConfirmPlan,
};
