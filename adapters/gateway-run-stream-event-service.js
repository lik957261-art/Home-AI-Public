"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function responseRunIdFromEvent(event = {}) {
  return cleanString(event.response?.id || event.response_id || event.responseId || "");
}

function originalRunIdFromEvent(event = {}) {
  return cleanString(event.run_id || event.runId || "");
}

function eventNameFromEvent(event = {}) {
  return cleanString(event.event || event.type || "");
}

const WEB_SEARCH_TOOL_NAMES = new Set(["mobile_web_search", "web_search", "web_search_call"]);
const TERMINAL_GATEWAY_EVENTS = new Set([
  "response.completed",
  "run.completed",
  "response.failed",
  "run.failed",
  "response.incomplete",
  "run.cancelled",
]);

function outputItemFromEvent(event = {}) {
  return event.item || event.output_item || event.outputItem || {};
}

function toolCallNameFromEvent(event = {}) {
  if (eventNameFromEvent(event) !== "response.output_item.added") return "";
  const item = outputItemFromEvent(event);
  const itemType = cleanString(item.type || event.item_type || event.itemType).toLowerCase();
  const name = cleanString(
    item.name
    || item.function?.name
    || item.tool_name
    || item.toolName
    || event.name
    || event.tool_name
    || event.toolName,
  );
  if (name) return name;
  if (itemType === "web_search_call") return "web_search_call";
  return "";
}

function isWebSearchToolCall(name) {
  return WEB_SEARCH_TOOL_NAMES.has(cleanString(name).toLowerCase());
}

function isTerminalGatewayEvent(eventName) {
  return TERMINAL_GATEWAY_EVENTS.has(cleanString(eventName));
}

function outputItemHasMessageText(item = {}) {
  if (cleanString(item.type).toLowerCase() !== "message") return false;
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (part?.type === "output_text" && cleanString(part.text)) return true;
  }
  return false;
}

function modelStreamEventPreview(message, details = {}) {
  const suffix = Object.entries(details || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return suffix ? `${message} (${suffix})` : message;
}

function normalizeLimit(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function createGatewayRunStreamEventService(options = {}) {
  const webSearchMaxCallsForStream = typeof options.webSearchMaxCallsForStream === "function"
    ? options.webSearchMaxCallsForStream
    : (() => 0);
  const emitRunStreamEvent = typeof options.emitRunStreamEvent === "function"
    ? options.emitRunStreamEvent
    : (() => false);
  const abortActiveStreamAsFailed = typeof options.abortActiveStreamAsFailed === "function"
    ? options.abortActiveStreamAsFailed
    : (() => false);

  function recordToolBudgetForEvent(publicRunId, event, stream) {
    const toolName = toolCallNameFromEvent(event);
    if (!stream || !isWebSearchToolCall(toolName)) return { action: "ignored" };
    const limit = normalizeLimit(webSearchMaxCallsForStream(stream, event));
    if (!limit) return { action: "disabled", tool: toolName };
    stream.toolBudgetCounters = stream.toolBudgetCounters || Object.create(null);
    const count = Math.max(0, Number(stream.toolBudgetCounters.webSearch || 0) || 0) + 1;
    stream.toolBudgetCounters.webSearch = count;
    if (count <= limit) {
      return { action: "counted", tool: toolName, group: "web_search", count, limit };
    }
    const reason = `Hermes Mobile stopped this run because ${toolName} exceeded the configured Web search limit (${count}/${limit}).`;
    const runId = stream.realRunId || publicRunId;
    emitRunStreamEvent(
      publicRunId,
      "run.tool_budget_exceeded",
      modelStreamEventPreview("\u7f51\u7edc\u641c\u7d22\u8d85\u8fc7\u8fd0\u884c\u9884\u7b97\uff0c\u5df2\u505c\u6b62\u8fd0\u884c", {
        tool: toolName,
        count,
        limit,
      }),
      { runId, error: true },
    );
    abortActiveStreamAsFailed(publicRunId, reason);
    return { action: "aborted", tool: toolName, group: "web_search", count, limit, reason };
  }

  return Object.freeze({
    eventNameFromEvent,
    isTerminalGatewayEvent,
    modelStreamEventPreview,
    originalRunIdFromEvent,
    outputItemFromEvent,
    outputItemHasMessageText,
    recordToolBudgetForEvent,
    responseRunIdFromEvent,
    toolCallNameFromEvent,
  });
}

module.exports = {
  createGatewayRunStreamEventService,
  eventNameFromEvent,
  isTerminalGatewayEvent,
  modelStreamEventPreview,
  originalRunIdFromEvent,
  outputItemFromEvent,
  outputItemHasMessageText,
  responseRunIdFromEvent,
  toolCallNameFromEvent,
};
