"use strict";

const LONG_MESSAGE_MODEL_ESM_PATH = "/vite-islands/long-message-model/long-message-model.js";
let longMessageModel = null;
let longMessageModelPromise = null;

const ACTIVE_MESSAGE_RICH_RENDER_LIMIT = 6000;
const LONG_MESSAGE_COLLAPSE_LIMIT = 18000;
const LONG_MESSAGE_PREVIEW_HEAD_CHARS = 3600;
const LONG_MESSAGE_PREVIEW_TAIL_CHARS = 7200;

function importLongMessageModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (longMessageModel) return Promise.resolve(longMessageModel);
  if (!longMessageModelPromise) {
    const importer = typeof rootRef.__homeAiImportLongMessageModel === "function"
      ? rootRef.__homeAiImportLongMessageModel
      : (path) => import(path);
    longMessageModelPromise = Promise.resolve()
      .then(() => importer(LONG_MESSAGE_MODEL_ESM_PATH))
      .then((model) => {
        longMessageModel = model || null;
        return longMessageModel;
      })
      .catch((error) => {
        longMessageModelPromise = null;
        throw error;
      });
  }
  return longMessageModelPromise;
}

function currentLongMessageModel() {
  return longMessageModel;
}

if (typeof window !== "undefined") {
  importLongMessageModel().catch(() => null);
}

function assistantMessageIsActive(message = {}) {
  const plan = currentLongMessageModel()?.assistantMessageActivePlan?.(message);
  if (plan) return Boolean(plan.active);
  return ["queued", "running"].includes(String(message?.status || ""));
}

function longMessageId(message = {}) {
  const plan = currentLongMessageModel()?.longMessageIdPlan?.(message);
  if (plan) return String(plan.id || "");
  return String(message?.id || "");
}

function longMessageIsExpanded(message = {}) {
  const plan = currentLongMessageModel()?.longMessageExpandedPlan?.({
    message,
    expandedIds: state.expandedLongMessageIds,
  });
  if (plan) return Boolean(plan.expanded);
  const id = longMessageId(message);
  return Boolean(id && state.expandedLongMessageIds?.has(id));
}

function shouldRenderLongMessagePreview(text, message = {}) {
  const expanded = longMessageIsExpanded(message);
  const plan = currentLongMessageModel()?.longMessagePreviewDecisionPlan?.({
    text,
    message,
    expanded,
  });
  if (plan) return Boolean(plan.shouldRender);
  if (message?.role !== "assistant") return false;
  const active = assistantMessageIsActive(message);
  const length = String(text || "").length;
  if (active) return length > ACTIVE_MESSAGE_RICH_RENDER_LIMIT;
  return length > LONG_MESSAGE_COLLAPSE_LIMIT && !expanded;
}

function shouldOfferLongMessageCollapse(text, message = {}) {
  const expanded = longMessageIsExpanded(message);
  const plan = currentLongMessageModel()?.longMessagePreviewDecisionPlan?.({
    text,
    message,
    expanded,
  });
  if (plan) return Boolean(plan.shouldOfferCollapse);
  return Boolean(
    message?.role === "assistant"
    && !assistantMessageIsActive(message)
    && String(text || "").length > LONG_MESSAGE_COLLAPSE_LIMIT
    && expanded
  );
}

function longMessagePreviewParts(text, active) {
  const plan = currentLongMessageModel()?.longMessagePreviewPartsPlan?.({ text, active });
  if (plan) {
    return {
      head: String(plan.head || ""),
      tail: String(plan.tail || ""),
      omitted: Math.max(0, Number(plan.omitted) || 0),
    };
  }
  const value = String(text || "");
  if (active) {
    const tail = value.slice(-LONG_MESSAGE_PREVIEW_TAIL_CHARS);
    return { head: "", tail, omitted: Math.max(0, value.length - tail.length) };
  }
  const head = value.slice(0, LONG_MESSAGE_PREVIEW_HEAD_CHARS);
  const tail = value.slice(-LONG_MESSAGE_PREVIEW_TAIL_CHARS);
  return { head, tail, omitted: Math.max(0, value.length - head.length - tail.length) };
}

function renderLongMessageToggle(message, expanded) {
  const plan = currentLongMessageModel()?.longMessageTogglePlan?.({ message, expanded });
  const id = plan ? String(plan.id || "") : longMessageId(message);
  if (!id) return "";
  const attr = plan?.attr || (expanded ? "data-collapse-long-message" : "data-expand-long-message");
  const label = plan?.label || (expanded ? "\u6536\u8d77\u957f\u56de\u590d" : "\u5c55\u5f00\u5b8c\u6574\u5185\u5bb9");
  return `<button class="long-message-toggle" type="button" ${attr}="${escapeHtml(id)}">${label}</button>`;
}

function renderLongMessageCollapseButton(message) {
  return `<div class="long-message-control">${renderLongMessageToggle(message, true)}</div>`;
}

function renderLongMessagePreview(text, aliases, message = {}) {
  const active = assistantMessageIsActive(message);
  const view = currentLongMessageModel()?.longMessagePreviewViewPlan?.({
    text,
    aliases,
    message,
    expanded: longMessageIsExpanded(message),
  });
  const parts = view?.parts || longMessagePreviewParts(text, active);
  const omitted = parts.omitted > 0
    ? `<div class="long-message-gap">${escapeHtml(view?.omittedLabel || `\u5df2\u7701\u7565 ${parts.omitted.toLocaleString()} \u4e2a\u5b57\u7b26`)}</div>`
    : "";
  const head = parts.head ? `<div class="long-message-preview-text">${escapeHtml(parts.head)}</div>` : "";
  const tail = parts.tail ? `<div class="long-message-preview-text">${escapeHtml(parts.tail)}</div>` : "";
  const noticeTitle = view?.noticeTitle || (active ? "\u6b63\u5728\u751f\u6210\u957f\u56de\u590d" : "\u957f\u56de\u590d\u5df2\u6298\u53e0");
  const noticeBody = view?.noticeBody || (active
    ? "\u4e3a\u4fdd\u6301\u754c\u9762\u6d41\u7545\uff0c\u5148\u663e\u793a\u6700\u65b0\u5185\u5bb9\uff1b\u5b8c\u6210\u540e\u53ef\u5c55\u5f00\u5168\u6587\u3002"
    : "\u663e\u793a\u5f00\u5934\u548c\u7ed3\u5c3e\uff1b\u590d\u5236\u6309\u94ae\u4ecd\u4f1a\u590d\u5236\u5b8c\u6574\u5185\u5bb9\u3002");
  const toggle = active ? "" : `<div class="long-message-control">${renderLongMessageToggle(message, false)}</div>`;
  return `<div class="text-content message-prose long-message-preview${active ? " streaming" : ""}">
    ${view?.aliases || aliases}
    <div class="long-message-notice">
      <strong>${noticeTitle}</strong>
      <span>${noticeBody}</span>
    </div>
    ${head}${omitted}${tail}${toggle}
  </div>`;
}

function wireLongMessageButtons(root) {
  root?.querySelectorAll?.("[data-expand-long-message]").forEach((button) => {
    if (button.dataset.boundExpandLongMessage) return;
    button.dataset.boundExpandLongMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(button.dataset.expandLongMessage || "");
      const actionPlan = currentLongMessageModel()?.longMessageToggleActionPlan?.({
        action: "expand",
        messageId: id,
        expandedIds: state.expandedLongMessageIds,
      });
      if (actionPlan ? !actionPlan.shouldRender : !id) return;
      state.expandedLongMessageIds.add(actionPlan?.messageId || id);
      renderCurrentThread({ stickToBottom: false });
    });
  });
  root?.querySelectorAll?.("[data-collapse-long-message]").forEach((button) => {
    if (button.dataset.boundCollapseLongMessage) return;
    button.dataset.boundCollapseLongMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(button.dataset.collapseLongMessage || "");
      const actionPlan = currentLongMessageModel()?.longMessageToggleActionPlan?.({
        action: "collapse",
        messageId: id,
        expandedIds: state.expandedLongMessageIds,
      });
      if (actionPlan ? !actionPlan.shouldRender : !id) return;
      state.expandedLongMessageIds.delete(actionPlan?.messageId || id);
      renderCurrentThread({ stickToBottom: false });
    });
  });
}
