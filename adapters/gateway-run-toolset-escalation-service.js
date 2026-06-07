"use strict";

const TOOLSET_ESCALATION_MARKER = "HERMES_TOOLSET_ESCALATION_REQUIRED";
const COMMON_WEB_COMPANION_TOOLSETS = Object.freeze(["web", "search", "browser"]);

function cleanString(value) {
  return String(value || "").trim();
}

function parseJsonObject(value) {
  const text = cleanString(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_nestedErr) {
      return null;
    }
  }
}

function boundedText(value, maxChars = 240) {
  const text = cleanString(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function uniqueCleanStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function routeToolsetMetadata(message = {}) {
  const runOptions = message?.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
  const policy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
    ? runOptions.access_policy_context
    : {};
  return runOptions.toolsetRouting || policy.toolset_routing || policy.toolsetRouting || {};
}

function routeSelectedToolsets(message = {}) {
  const routing = routeToolsetMetadata(message);
  const runOptions = message?.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
  const policy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
    ? runOptions.access_policy_context
    : {};
  return uniqueCleanStrings(
    routing.selected_toolsets
    || routing.selectedToolsets
    || policy.allowed_toolsets
    || policy.allowedToolsets
    || [],
  );
}

function routeOmittedAuthorizedToolsets(message = {}) {
  const routing = routeToolsetMetadata(message);
  return uniqueCleanStrings(
    routing.omitted_authorized_toolsets
    || routing.omittedAuthorizedToolsets
    || routing.omitted_toolsets
    || routing.omittedToolsets
    || [],
  );
}

function parseToolsetEscalationRequest(text, message = {}) {
  const value = String(text || "");
  const markerAt = value.indexOf(TOOLSET_ESCALATION_MARKER);
  if (markerAt < 0) return null;
  const tail = value.slice(markerAt + TOOLSET_ESCALATION_MARKER.length);
  const parsed = parseJsonObject(tail) || parseJsonObject(value);
  const requested = uniqueCleanStrings(
    parsed?.toolsets
    || parsed?.selected_toolsets
    || parsed?.selectedToolsets
    || parsed?.allowed_toolsets
    || parsed?.allowedToolsets
    || [],
  );
  const omitted = routeOmittedAuthorizedToolsets(message);
  const selected = routeSelectedToolsets(message);
  const omittedSet = new Set(omitted);
  const knownAuthorized = uniqueCleanStrings([...selected, ...omitted]);
  const knownAuthorizedSet = new Set(knownAuthorized);
  const toolsets = knownAuthorizedSet.size
    ? requested.filter((item) => knownAuthorizedSet.has(item))
    : requested;
  const retryableToolsets = omittedSet.size
    ? requested.filter((item) => omittedSet.has(item))
    : toolsets;
  const blockedToolsets = knownAuthorizedSet.size
    ? requested.filter((item) => !knownAuthorizedSet.has(item))
    : [];
  return {
    toolsets,
    requestedToolsets: requested,
    retryableToolsets,
    blockedToolsets,
    reason: boundedText(parsed?.reason || parsed?.message || "model_requested_toolset_expansion"),
    source: retryableToolsets.length ? "model_toolset_escalation" : "model_toolset_schema_mismatch",
  };
}

function toolsetEscalationMessage(request = {}) {
  const toolsets = uniqueCleanStrings(request.toolsets || []);
  const retryableToolsets = uniqueCleanStrings(request.retryableToolsets || []);
  const blockedToolsets = uniqueCleanStrings(request.blockedToolsets || []);
  const reason = boundedText(request.reason || "");
  const toolsetText = toolsets.length ? toolsets.join(", ") : "additional authorized toolsets";
  const blockedText = blockedToolsets.length ? `\n\nBlocked toolsets: ${blockedToolsets.join(", ")}` : "";
  const reasonText = reason ? `\n\nReason: ${reason}` : "";
  if (!retryableToolsets.length) {
    return `当前运行需要的工具集无法在本轮继续扩展：${toolsetText}。请重新发起任务，或进入对应插件话题后重试。${blockedText}${reasonText}`;
  }
  return `当前运行需要额外工具集：${toolsetText}。自动升级重试未能继续执行。请重新发起任务，或进入对应插件话题后重试。${reasonText}`;
}

function sanitizeToolsetEscalationVisibleText(text = "") {
  const value = String(text || "");
  const markerAt = value.indexOf(TOOLSET_ESCALATION_MARKER);
  if (markerAt < 0) return { text: value, found: false };
  return { text: value.slice(0, markerAt).trimEnd(), found: true };
}

function expandCommonWebEscalationToolsets(selectedToolsets = [], authorizedToolsets = []) {
  const selected = uniqueCleanStrings(selectedToolsets);
  const authorized = new Set(uniqueCleanStrings(authorizedToolsets));
  if (!selected.some((toolset) => COMMON_WEB_COMPANION_TOOLSETS.includes(toolset))) return selected;
  return uniqueCleanStrings([
    ...selected,
    ...COMMON_WEB_COMPANION_TOOLSETS.filter((toolset) => authorized.has(toolset)),
  ]);
}

function findEscalationUserMessage(thread = {}, assistantMessage = {}) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const replyToId = cleanString(assistantMessage.replyToMessageId || assistantMessage.reply_to_message_id);
  if (replyToId) {
    const direct = messages.find((message) => cleanString(message.id) === replyToId && message.role === "user");
    if (direct) return direct;
  }
  const assistantId = cleanString(assistantMessage.id);
  const assistantIndex = assistantId ? messages.findIndex((message) => cleanString(message.id) === assistantId) : -1;
  const before = messages.slice(0, assistantIndex >= 0 ? assistantIndex : messages.length);
  const taskGroupId = cleanString(assistantMessage.taskGroupId || assistantMessage.task_group_id);
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const message = before[index];
    if (message?.role !== "user") continue;
    if (taskGroupId && cleanString(message.taskGroupId || message.task_group_id) !== taskGroupId) continue;
    return message;
  }
  for (let index = before.length - 1; index >= 0; index -= 1) {
    if (before[index]?.role === "user") return before[index];
  }
  return null;
}

module.exports = {
  expandCommonWebEscalationToolsets,
  findEscalationUserMessage,
  parseToolsetEscalationRequest,
  routeOmittedAuthorizedToolsets,
  routeSelectedToolsets,
  sanitizeToolsetEscalationVisibleText,
  toolsetEscalationMessage,
  uniqueCleanStrings,
};
