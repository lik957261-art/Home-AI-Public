"use strict";

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  const limit = Math.max(1, Number(maxChars || text.length || 1) || 1);
  if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.45);
  const tail = limit - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function defaultAppendBounded(current, delta, maxChars) {
  const next = `${current || ""}${delta || ""}`;
  const limit = Math.max(1, Number(maxChars || next.length || 1) || 1);
  if (next.length <= limit) return next;
  const edgeChars = Math.floor(limit * 0.45);
  return `${next.slice(0, edgeChars)}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-edgeChars)}`;
}

function createGatewayRunContentService(options = {}) {
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const maxMessageChars = Math.max(1, Number(options.maxMessageChars || 12000) || 12000);

  function appendBounded(current, delta, maxChars = maxMessageChars) {
    return defaultAppendBounded(current, delta, maxChars);
  }

  function compactFullContent(value) {
    return compactText(value, maxMessageChars);
  }

  return {
    appendBounded,
    compactFullContent,
  };
}

module.exports = {
  createGatewayRunContentService,
  defaultAppendBounded,
  defaultCompactText,
};
