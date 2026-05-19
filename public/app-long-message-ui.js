"use strict";

const ACTIVE_MESSAGE_RICH_RENDER_LIMIT = 6000;
const LONG_MESSAGE_COLLAPSE_LIMIT = 18000;
const LONG_MESSAGE_PREVIEW_HEAD_CHARS = 3600;
const LONG_MESSAGE_PREVIEW_TAIL_CHARS = 7200;

function assistantMessageIsActive(message = {}) {
  return ["queued", "running"].includes(String(message?.status || ""));
}

function longMessageId(message = {}) {
  return String(message?.id || "");
}

function longMessageIsExpanded(message = {}) {
  const id = longMessageId(message);
  return Boolean(id && state.expandedLongMessageIds?.has(id));
}

function shouldRenderLongMessagePreview(text, message = {}) {
  if (message?.role !== "assistant") return false;
  const active = assistantMessageIsActive(message);
  const length = String(text || "").length;
  if (active) return length > ACTIVE_MESSAGE_RICH_RENDER_LIMIT;
  return length > LONG_MESSAGE_COLLAPSE_LIMIT && !longMessageIsExpanded(message);
}

function shouldOfferLongMessageCollapse(text, message = {}) {
  return Boolean(
    message?.role === "assistant"
    && !assistantMessageIsActive(message)
    && String(text || "").length > LONG_MESSAGE_COLLAPSE_LIMIT
    && longMessageIsExpanded(message)
  );
}

function longMessagePreviewParts(text, active) {
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
  const id = longMessageId(message);
  if (!id) return "";
  const attr = expanded ? "data-collapse-long-message" : "data-expand-long-message";
  const label = expanded ? "\u6536\u8d77\u957f\u56de\u590d" : "\u5c55\u5f00\u5b8c\u6574\u5185\u5bb9";
  return `<button class="long-message-toggle" type="button" ${attr}="${escapeHtml(id)}">${label}</button>`;
}

function renderLongMessageCollapseButton(message) {
  return `<div class="long-message-control">${renderLongMessageToggle(message, true)}</div>`;
}

function renderLongMessagePreview(text, aliases, message = {}) {
  const active = assistantMessageIsActive(message);
  const parts = longMessagePreviewParts(text, active);
  const omitted = parts.omitted > 0
    ? `<div class="long-message-gap">${escapeHtml(`\u5df2\u7701\u7565 ${parts.omitted.toLocaleString()} \u4e2a\u5b57\u7b26`)}</div>`
    : "";
  const head = parts.head ? `<div class="long-message-preview-text">${escapeHtml(parts.head)}</div>` : "";
  const tail = parts.tail ? `<div class="long-message-preview-text">${escapeHtml(parts.tail)}</div>` : "";
  const noticeTitle = active ? "\u6b63\u5728\u751f\u6210\u957f\u56de\u590d" : "\u957f\u56de\u590d\u5df2\u6298\u53e0";
  const noticeBody = active
    ? "\u4e3a\u4fdd\u6301\u754c\u9762\u6d41\u7545\uff0c\u5148\u663e\u793a\u6700\u65b0\u5185\u5bb9\uff1b\u5b8c\u6210\u540e\u53ef\u5c55\u5f00\u5168\u6587\u3002"
    : "\u663e\u793a\u5f00\u5934\u548c\u7ed3\u5c3e\uff1b\u590d\u5236\u6309\u94ae\u4ecd\u4f1a\u590d\u5236\u5b8c\u6574\u5185\u5bb9\u3002";
  const toggle = active ? "" : `<div class="long-message-control">${renderLongMessageToggle(message, false)}</div>`;
  return `<div class="text-content message-prose long-message-preview${active ? " streaming" : ""}">
    ${aliases}
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
      if (!id) return;
      state.expandedLongMessageIds.add(id);
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
      if (!id) return;
      state.expandedLongMessageIds.delete(id);
      renderCurrentThread({ stickToBottom: false });
    });
  });
}
