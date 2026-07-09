const LONG_MESSAGE_MODEL_VERSION = "20260705-vite-long-message-model-v1";

const ACTIVE_MESSAGE_RICH_RENDER_LIMIT = 6000;
const LONG_MESSAGE_COLLAPSE_LIMIT = 18000;
const LONG_MESSAGE_PREVIEW_HEAD_CHARS = 3600;
const LONG_MESSAGE_PREVIEW_TAIL_CHARS = 7200;

function textValue(value) {
  return String(value || "");
}

function assistantMessageActivePlan(message = {}) {
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    active: ["queued", "running"].includes(String(message?.status || "")),
  });
}

function longMessageIdPlan(message = {}) {
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    id: String(message?.id || ""),
  });
}

function longMessageExpandedPlan(input = {}) {
  const id = longMessageIdPlan(input.message).id;
  const expandedIds = input.expandedIds;
  const expanded = Boolean(id && (
    (expandedIds instanceof Set && expandedIds.has(id))
    || (Array.isArray(expandedIds) && expandedIds.includes(id))
  ));
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    id,
    expanded,
  });
}

function longMessagePreviewDecisionPlan(input = {}) {
  const message = input.message || {};
  const active = assistantMessageActivePlan(message).active;
  const expanded = Boolean(input.expanded);
  const length = textValue(input.text).length;
  const shouldRender = message?.role === "assistant"
    && (active
      ? length > ACTIVE_MESSAGE_RICH_RENDER_LIMIT
      : length > LONG_MESSAGE_COLLAPSE_LIMIT && !expanded);
  const shouldOfferCollapse = Boolean(
    message?.role === "assistant"
    && !active
    && length > LONG_MESSAGE_COLLAPSE_LIMIT
    && expanded
  );
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    active,
    expanded,
    length,
    shouldRender,
    shouldOfferCollapse,
  });
}

function longMessagePreviewPartsPlan(input = {}) {
  const value = textValue(input.text);
  const active = Boolean(input.active);
  if (active) {
    const tail = value.slice(-LONG_MESSAGE_PREVIEW_TAIL_CHARS);
    return Object.freeze({
      version: LONG_MESSAGE_MODEL_VERSION,
      head: "",
      tail,
      omitted: Math.max(0, value.length - tail.length),
    });
  }
  const head = value.slice(0, LONG_MESSAGE_PREVIEW_HEAD_CHARS);
  const tail = value.slice(-LONG_MESSAGE_PREVIEW_TAIL_CHARS);
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    head,
    tail,
    omitted: Math.max(0, value.length - head.length - tail.length),
  });
}

function longMessageTogglePlan(input = {}) {
  const id = longMessageIdPlan(input.message).id;
  const expanded = Boolean(input.expanded);
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    id,
    visible: Boolean(id),
    expanded,
    attr: expanded ? "data-collapse-long-message" : "data-expand-long-message",
    label: expanded ? "\u6536\u8d77\u957f\u56de\u590d" : "\u5c55\u5f00\u5b8c\u6574\u5185\u5bb9",
  });
}

function longMessagePreviewViewPlan(input = {}) {
  const expanded = Boolean(input.expanded);
  const decision = longMessagePreviewDecisionPlan({
    text: input.text,
    message: input.message,
    expanded,
  });
  const parts = longMessagePreviewPartsPlan({
    text: input.text,
    active: decision.active,
  });
  const toggle = decision.active
    ? Object.freeze({ version: LONG_MESSAGE_MODEL_VERSION, visible: false })
    : longMessageTogglePlan({ message: input.message, expanded: false });
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    active: decision.active,
    expanded,
    aliases: textValue(input.aliases),
    parts,
    omittedLabel: parts.omitted > 0 ? `\u5df2\u7701\u7565 ${parts.omitted.toLocaleString()} \u4e2a\u5b57\u7b26` : "",
    noticeTitle: decision.active ? "\u6b63\u5728\u751f\u6210\u957f\u56de\u590d" : "\u957f\u56de\u590d\u5df2\u6298\u53e0",
    noticeBody: decision.active
      ? "\u4e3a\u4fdd\u6301\u754c\u9762\u6d41\u7545\uff0c\u5148\u663e\u793a\u6700\u65b0\u5185\u5bb9\uff1b\u5b8c\u6210\u540e\u53ef\u5c55\u5f00\u5168\u6587\u3002"
      : "\u663e\u793a\u5f00\u5934\u548c\u7ed3\u5c3e\uff1b\u590d\u5236\u6309\u94ae\u4ecd\u4f1a\u590d\u5236\u5b8c\u6574\u5185\u5bb9\u3002",
    toggle,
  });
}

function longMessageToggleActionPlan(input = {}) {
  const action = String(input.action || "");
  const messageId = String(input.messageId || "");
  const expandedIds = input.expandedIds instanceof Set
    ? Array.from(input.expandedIds)
    : (Array.isArray(input.expandedIds) ? input.expandedIds.map((id) => String(id || "")) : []);
  const nextExpandedIds = new Set(expandedIds.filter(Boolean));
  if (messageId && action === "expand") nextExpandedIds.add(messageId);
  if (messageId && action === "collapse") nextExpandedIds.delete(messageId);
  return Object.freeze({
    version: LONG_MESSAGE_MODEL_VERSION,
    action,
    messageId,
    shouldRender: Boolean(messageId && (action === "expand" || action === "collapse")),
    mutation: action === "collapse" ? "delete" : (action === "expand" ? "add" : "none"),
    nextExpandedIds: Object.freeze(Array.from(nextExpandedIds)),
  });
}

export {
  ACTIVE_MESSAGE_RICH_RENDER_LIMIT,
  LONG_MESSAGE_COLLAPSE_LIMIT,
  LONG_MESSAGE_MODEL_VERSION,
  LONG_MESSAGE_PREVIEW_HEAD_CHARS,
  LONG_MESSAGE_PREVIEW_TAIL_CHARS,
  assistantMessageActivePlan,
  longMessageExpandedPlan,
  longMessageIdPlan,
  longMessagePreviewDecisionPlan,
  longMessagePreviewPartsPlan,
  longMessagePreviewViewPlan,
  longMessageToggleActionPlan,
  longMessageTogglePlan,
};
