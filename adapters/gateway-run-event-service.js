"use strict";

const {
  extractGatewayRunIds,
  withActiveRunRemoved,
  withActiveRunReplaced,
} = require("./gateway-run-lifecycle-service");

function cleanString(value) {
  return String(value || "").trim();
}

const DEFAULT_RESPONSE_SKILL = Object.freeze({
  id: "response-grounding-baseline",
  label: "response-grounding-baseline",
  path: "response-grounding-baseline",
  namespace: "",
});
const TOOLSET_ESCALATION_MARKER = "HERMES_TOOLSET_ESCALATION_REQUIRED";

function compactFallback(value) {
  return value;
}

function defaultState() {
  return { threads: [] };
}

function safeErrorMessage(err) {
  return err?.message || String(err || "");
}

function isSyntheticHermesMobileRunEvent(event = {}) {
  return Boolean(event.hermes_mobile_synthetic || event.hermesMobileSynthetic);
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

function routeToolsetMetadata(message = {}) {
  const runOptions = message?.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
  const policy = runOptions.access_policy_context && typeof runOptions.access_policy_context === "object"
    ? runOptions.access_policy_context
    : {};
  return runOptions.toolsetRouting || policy.toolset_routing || policy.toolsetRouting || {};
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
  const routing = routeToolsetMetadata(message);
  const omitted = uniqueCleanStrings(
    routing.omitted_authorized_toolsets
    || routing.omittedAuthorizedToolsets
    || routing.omitted_toolsets
    || routing.omittedToolsets
    || [],
  );
  const omittedSet = new Set(omitted);
  const toolsets = omittedSet.size ? requested.filter((item) => omittedSet.has(item)) : requested;
  if (!toolsets.length) return null;
  return {
    toolsets,
    reason: boundedText(parsed?.reason || parsed?.message || "model_requested_toolset_expansion"),
    source: "model_toolset_escalation",
  };
}

function toolsetEscalationMessage(request = {}) {
  const toolsets = uniqueCleanStrings(request.toolsets || []);
  const reason = boundedText(request.reason || "");
  const toolsetText = toolsets.length ? toolsets.join(", ") : "additional authorized toolsets";
  const reasonText = reason ? `\n\nReason: ${reason}` : "";
  return `当前执行工具集不足，需要重新开放工具集：${toolsetText}。Hermes Mobile 已拦截内部工具集升级标记，没有把原始标记作为答案继续展示。${reasonText}`;
}

function normalizeSkillReference(value) {
  let text = cleanString(value);
  if (!text) return "";
  text = text.replaceAll("\\", "/").replace(/^["'`]+|["'`]+$/g, "").trim();
  const skillRoot = text.match(/(?:^|\/)skills\/(.+?)(?:\/SKILL\.md)?$/i);
  if (skillRoot) text = skillRoot[1];
  text = text.replace(/\/SKILL\.md$/i, "").replace(/^skills\//i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(text)) return "";
  return text.slice(0, 240);
}

function skillReferenceFromValue(value) {
  if (!value) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    return normalizeSkillReference(
      value.path || value.skillPath || value.skill_path || value.skill || value.name || value.id || "",
    );
  }
  const parsed = parseJsonObject(value);
  if (parsed) return skillReferenceFromValue(parsed);
  return normalizeSkillReference(value);
}

function skillEntryFromReference(reference) {
  const pathValue = normalizeSkillReference(reference);
  if (!pathValue) return null;
  const parts = pathValue.split("/").filter(Boolean);
  const id = parts[parts.length - 1] || pathValue;
  return {
    id,
    label: id,
    path: pathValue,
    namespace: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
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

function loadedSkillFromRunEvent(event = {}) {
  if (cleanString(event.tool).toLowerCase() !== "skill_view") return null;
  const reference = skillReferenceFromValue(event.preview || event.arguments || event.input || event.text || "");
  return skillEntryFromReference(reference);
}

function loadedSkillsForRun(thread = {}, runIds = "") {
  const ids = new Set(uniqueCleanStrings(Array.isArray(runIds) ? runIds : [runIds]));
  if (!ids.size) return [];
  const byPath = new Map();
  for (const event of Array.isArray(thread.events) ? thread.events : []) {
    const eventRunId = cleanString(event?.runId || event?.run_id);
    if (!eventRunId || !ids.has(eventRunId)) continue;
    const skill = loadedSkillFromRunEvent(event);
    if (!skill) continue;
    const key = skill.path.toLowerCase();
    if (!byPath.has(key)) byPath.set(key, skill);
  }
  return [...byPath.values()];
}

function mergeLoadedSkills(...sources) {
  const byPath = new Map();
  for (const source of sources) {
    const skills = Array.isArray(source) ? source : [source];
    for (const skill of skills) {
      if (!skill || typeof skill !== "object") continue;
      const entry = skillEntryFromReference(skill.path || skill.skillPath || skill.name || skill.id || "");
      if (!entry) continue;
      const key = entry.path.toLowerCase();
      if (!byPath.has(key)) byPath.set(key, Object.assign({}, entry, skill, { path: entry.path }));
    }
  }
  return [...byPath.values()];
}

function normalizeToolName(value) {
  const parsed = parseJsonObject(value);
  const raw = parsed
    ? (parsed.name || parsed.tool || parsed.function || parsed.functionName || parsed.function_name || "")
    : value;
  const text = cleanString(raw);
  if (!text || !/^[A-Za-z0-9_.:-]+$/.test(text)) return "";
  const lower = text.toLowerCase();
  if (["message", "function_call", "function_call_output", "skill_view"].includes(lower)) return "";
  return text.slice(0, 96);
}

function toolEntryFromName(value) {
  const name = normalizeToolName(value);
  if (!name) return null;
  return { id: name.toLowerCase(), name, label: name };
}

function loadedToolFromRunEvent(event = {}) {
  const tool = cleanString(event.tool).toLowerCase();
  if (tool !== "function_call" && tool !== "function_call_output") return null;
  return toolEntryFromName(event.preview || event.arguments || event.input || event.text || "");
}

function loadedToolFromOutputItem(item = {}) {
  const type = cleanString(item.type).toLowerCase();
  if (!type || type === "message") return null;
  const name = outputItemFunctionName(item)
    || item.name
    || item.tool
    || item.tool_name
    || (type.includes("search") || type.includes("tool") || (type.endsWith("_call") && type !== "function_call") ? type : "");
  if (cleanString(name).toLowerCase() === "skill_view") return null;
  return toolEntryFromName(name);
}

function mergeLoadedTools(...sources) {
  const byName = new Map();
  for (const source of sources) {
    const tools = Array.isArray(source) ? source : [source];
    for (const tool of tools) {
      const entry = toolEntryFromName(typeof tool === "object" ? (tool.name || tool.label || tool.id || "") : tool);
      if (!entry) continue;
      const key = entry.id;
      if (!byName.has(key)) byName.set(key, Object.assign({}, entry, typeof tool === "object" ? tool : null, { name: entry.name, label: entry.label }));
    }
  }
  return [...byName.values()];
}

function outputItemToolName(item = {}) {
  const type = cleanString(item.type).toLowerCase();
  if (outputItemFunctionName(item) === "skill_view") return "skill_view";
  if (type === "function_call" || type === "function_call_output") return type;
  return cleanString(item.name || item.type || "");
}

function outputItemCallId(item = {}) {
  return cleanString(item.call_id || item.callId || item.id || "");
}

function outputItemFunctionName(item = {}) {
  return cleanString(
    item.name
    || item.function?.name
    || item.tool_name
    || item.toolName
    || item.output?.name
    || "",
  );
}

function parseOutputItemPreview(value = "") {
  const text = cleanString(value);
  if (!text || !text.startsWith("{")) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function runToolNameForCallId(thread = {}, runId = "", callId = "") {
  const id = cleanString(callId);
  if (!id) return "";
  for (let index = (thread.events || []).length - 1; index >= 0; index -= 1) {
    const event = thread.events[index] || {};
    if (cleanString(event.runId || event.run_id) !== cleanString(runId)) continue;
    const preview = parseOutputItemPreview(event.preview);
    if (cleanString(preview.callId || preview.call_id) !== id) continue;
    const name = cleanString(preview.name || preview.function || preview.tool);
    if (name) return name;
  }
  return "";
}

function outputItemPreview(item = {}) {
  const tool = outputItemToolName(item).toLowerCase();
  const type = cleanString(item.type).toLowerCase();
  const source = item.arguments || item.output || item.input || item.text || "";
  if (tool === "skill_view") {
    const reference = skillReferenceFromValue(source);
    return reference ? JSON.stringify({ name: reference }) : "";
  }
  if (tool === "function_call" || type === "function_call") {
    const name = outputItemFunctionName(item);
    const callId = outputItemCallId(item);
    return (name || callId) ? JSON.stringify({ name, callId }) : "";
  }
  if (item.error) return cleanString(item.error).slice(0, 240);
  return "";
}

function defaultAppendBounded(current, delta, maxChars = 12000) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  const side = Math.floor(maxChars * 0.45);
  return `${next.slice(0, side)}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-side)}`;
}

function extractCompletedOutput(event = {}) {
  if (event.output) return String(event.output);
  const response = event.response || {};
  const chunks = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === "output_text" && part.text) chunks.push(String(part.text));
    }
  }
  return chunks.join("\n\n").trim();
}

function loadedSkillsFromCompletedResponse(event = {}) {
  const response = event.response || {};
  const skills = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (cleanString(outputItemToolName(item)).toLowerCase() !== "skill_view") continue;
    const preview = outputItemPreview(item);
    const skill = loadedSkillFromRunEvent({ tool: "skill_view", preview });
    if (skill) skills.push(skill);
  }
  return mergeLoadedSkills(skills);
}

function loadedToolsForRun(thread = {}, runIds = "") {
  const ids = new Set(uniqueCleanStrings(Array.isArray(runIds) ? runIds : [runIds]));
  if (!ids.size) return [];
  const tools = [];
  for (const event of Array.isArray(thread.events) ? thread.events : []) {
    const eventRunId = cleanString(event?.runId || event?.run_id);
    if (!eventRunId || !ids.has(eventRunId)) continue;
    const tool = loadedToolFromRunEvent(event);
    if (tool) tools.push(tool);
  }
  return mergeLoadedTools(tools);
}

function loadedToolsFromCompletedResponse(event = {}) {
  const response = event.response || {};
  const tools = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const type = cleanString(item.type).toLowerCase();
    const tool = cleanString(outputItemToolName(item)).toLowerCase();
    if (tool === "skill_view") continue;
    const preview = outputItemPreview(item);
    const entry = loadedToolFromRunEvent({ tool: "function_call", preview })
      || loadedToolFromOutputItem(item);
    if (entry) tools.push(entry);
  }
  return mergeLoadedTools(tools);
}

function usageWithRunMetadata(usage, event = {}, message = {}) {
  const next = Object.assign({}, usage || {});
  const runOptions = message?.runOptions && typeof message.runOptions === "object" ? message.runOptions : {};
  const response = event?.response && typeof event.response === "object" ? event.response : {};
  const model = cleanString(
    response.model
    || event.model
    || runOptions.model
    || message.model
    || message.modelName
    || next.model
    || next.model_name
    || next.response_model,
  );
  const provider = cleanString(
    response.provider
    || event.provider
    || runOptions.provider
    || message.modelProvider
    || message.model_provider
    || message.provider
    || next.provider
    || next.model_provider
    || next.billing_provider,
  );
  const reasoningEffort = cleanString(
    response.reasoning_effort
    || response.reasoning?.effort
    || event.reasoning_effort
    || runOptions.reasoning_effort
    || runOptions.reasoningEffort
    || message.reasoningEffort
    || message.reasoning_effort
    || next.reasoning_effort
    || next.reasoningEffort,
  );
  if (model) next.model = model;
  if (provider) {
    next.provider = provider;
    next.model_provider = provider;
  }
  if (reasoningEffort) {
    next.reasoning_effort = reasoningEffort;
    next.reasoningEffort = reasoningEffort;
  }
  return Object.keys(next).length ? next : null;
}

function findRunTargetInState(state, runId) {
  const id = cleanString(runId);
  if (!id) return null;
  for (const thread of state?.threads || []) {
    const message = (thread.messages || []).find((item) => cleanString(item.runId) === id);
    if (message) return { threadId: thread.id, messageId: message.id };
  }
  return null;
}

function createGatewayRunEventService(options = {}) {
  const stateProvider = typeof options.state === "function"
    ? options.state
    : (() => options.state || defaultState());
  const activeStreams = options.activeStreams instanceof Map ? options.activeStreams : new Map();
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const maxMessageChars = Math.max(1, Number(options.maxMessageChars || 12000) || 12000);

  const appendBounded = typeof options.appendBounded === "function" ? options.appendBounded : defaultAppendBounded;
  const compactFullContent = typeof options.compactFullContent === "function"
    ? options.compactFullContent
    : ((value) => defaultAppendBounded("", value, maxMessageChars));
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const setTimer = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === "function" ? options.clearTimeout : clearTimeout;
  const streamingSaveThrottleMs = Math.max(0, Number(options.streamingSaveThrottleMs ?? 1200) || 0);
  const logError = typeof options.logError === "function" ? options.logError : ((err) => {
    try {
      console.error(err);
    } catch (_) {}
  });
  const topicContextCompactionService = options.topicContextCompactionService || null;
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const registerArtifactsFromText = typeof options.registerArtifactsFromText === "function"
    ? options.registerArtifactsFromText
    : (() => []);
  const supplementGatewayUsage = typeof options.supplementGatewayUsage === "function"
    ? options.supplementGatewayUsage
    : ((usage) => usage);
  const modelPermissionApprovalRequest = typeof options.modelPermissionApprovalRequest === "function"
    ? options.modelPermissionApprovalRequest
    : (() => null);
  const isOrdinaryToolSchemaElevationRequest = typeof options.isOrdinaryToolSchemaElevationRequest === "function"
    ? options.isOrdinaryToolSchemaElevationRequest
    : (() => false);
  const stripPermissionApprovalMarkers = typeof options.stripPermissionApprovalMarkers === "function"
    ? options.stripPermissionApprovalMarkers
    : ((text) => String(text || ""));
  const enqueueExternalDeliveryForTerminalMessage = typeof options.enqueueExternalDeliveryForTerminalMessage === "function"
    ? options.enqueueExternalDeliveryForTerminalMessage
    : (() => {});
  const replaceThreadActiveRun = typeof options.replaceThreadActiveRun === "function"
    ? options.replaceThreadActiveRun
    : ((thread, oldRunId, newRunId) => Object.assign(thread, withActiveRunReplaced(thread, oldRunId, newRunId)));
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function"
    ? options.removeThreadActiveRun
    : ((thread, runId, idleStatus) => Object.assign(thread, withActiveRunRemoved(thread, runId, idleStatus)));
  const scheduleNextQueuedRunForTaskGroup = typeof options.scheduleNextQueuedRunForTaskGroup === "function"
    ? options.scheduleNextQueuedRunForTaskGroup
    : (() => {});
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function"
    ? options.notifyTaskTerminal
    : ((thread, message, status) => options.webPushDeliveryService?.notifyTaskTerminal?.(thread, message, status));
  let streamingSaveTimer = null;
  let streamingSavePending = false;

  function state() {
    const value = stateProvider();
    return value && typeof value === "object" ? value : defaultState();
  }

  function findRunTarget(runId) {
    const id = cleanString(runId);
    const active = activeStreams.get(id);
    if (active?.threadId && active?.messageId) {
      return { threadId: active.threadId, messageId: active.messageId };
    }
    return findRunTargetInState(state(), id);
  }

  function resolveRunEventContext(event = {}) {
    const ids = extractGatewayRunIds(event);
    const stream = activeStreams.get(ids.runId)
      || activeStreams.get(ids.originalRunId)
      || activeStreams.get(ids.responseRunId)
      || null;
    if (stream && !isSyntheticHermesMobileRunEvent(event)) stream.lastEventAt = nowMs();
    const target = findRunTarget(ids.runId)
      || findRunTarget(ids.originalRunId)
      || findRunTarget(ids.responseRunId);
    const thread = target ? (state().threads || []).find((item) => item.id === target.threadId) : null;
    const message = thread ? (thread.messages || []).find((item) => item.id === target.messageId) : null;
    return Object.assign({}, ids, { stream, target, thread: thread || null, message: message || null });
  }

  function broadcastMessageUpdated(thread, message) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(message),
      thread: threadSummary(thread),
    });
  }

  function clearStreamingSaveTimer() {
    if (streamingSaveTimer) clearTimer(streamingSaveTimer);
    streamingSaveTimer = null;
    streamingSavePending = false;
  }

  function scheduleStreamingStateSave() {
    if (!streamingSaveThrottleMs) {
      saveState();
      return;
    }
    if (streamingSavePending) return;
    streamingSavePending = true;
    streamingSaveTimer = setTimer(() => {
      streamingSaveTimer = null;
      streamingSavePending = false;
      try {
        saveState();
      } catch (err) {
        logError(`Hermes Mobile streaming state save failed: ${err.message || String(err)}`);
      }
    }, streamingSaveThrottleMs);
    if (streamingSaveTimer && typeof streamingSaveTimer.unref === "function") streamingSaveTimer.unref();
  }

  function compactTerminalTopicContext(thread, message, reason) {
    if (!topicContextCompactionService || typeof topicContextCompactionService.compactTaskGroup !== "function") return null;
    if (!message?.taskGroupId) return null;
    try {
      return topicContextCompactionService.compactTaskGroup(thread, message.taskGroupId, { reason });
    } catch (err) {
      logError(`Hermes Mobile topic context compaction failed: ${err.message || String(err)}`);
      return { changed: false, error: err.message || String(err) };
    }
  }

  function markResponseCreated(context) {
    const { thread, message, runId, responseRunId, stream } = context;
    if (responseRunId && responseRunId !== runId) {
      const aliasStream = stream || activeStreams.get(runId);
      if (aliasStream) {
        aliasStream.realRunId = responseRunId;
        activeStreams.set(responseRunId, aliasStream);
      }
      if (!message.originalRunId) message.originalRunId = runId;
      message.responseRunId = responseRunId;
      message.runId = responseRunId;
      replaceThreadActiveRun(thread, runId, responseRunId);
    }
    saveState();
    broadcastMessageUpdated(thread, message);
    return { action: "response_created", runId, responseRunId };
  }

  function applyDelta(context, event) {
    const { thread, message } = context;
    const delta = String(event.delta || event.text || "");
    if (!delta) return { action: "empty_delta" };
    const feedbackAt = nowIso();
    message.content = appendBounded(message.content || "", delta, maxMessageChars);
    if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
    message.updatedAt = feedbackAt;
    thread.updatedAt = feedbackAt;
    scheduleStreamingStateSave();
    broadcast({
      type: "message.delta",
      threadId: thread.id,
      messageId: message.id,
      delta,
      firstFeedbackAt: message.firstFeedbackAt,
      updatedAt: message.updatedAt,
      thread: threadSummary(thread),
    });
    return { action: "delta", delta };
  }

  function recordOutputItemEvent(context, event) {
    const { thread, runId, eventName, message, responseRunId, stream } = context;
    const eventRunId = cleanString(message?.runId || responseRunId || stream?.realRunId || runId);
    const item = event.item || event.output_item || event.outputItem || {};
    const tool = outputItemToolName(item);
    let preview = outputItemPreview(item);
    if (cleanString(tool).toLowerCase() === "function_call_output") {
      const callId = outputItemCallId(item);
      const name = outputItemFunctionName(item)
        || runToolNameForCallId(thread, eventRunId, callId)
        || runToolNameForCallId(thread, runId, callId);
      preview = (name || callId) ? JSON.stringify({ name, callId }) : "";
    }
    addThreadEvent(thread, {
      event: eventName,
      timestamp: nowMs() / 1000,
      runId: eventRunId || runId,
      tool,
      preview,
      error: false,
    });
    const loadedSkill = loadedSkillFromRunEvent({ tool, preview });
    if (loadedSkill) message.loadedSkills = mergeLoadedSkills(message.loadedSkills, loadedSkill);
    const loadedTool = loadedToolFromRunEvent({ tool, preview }) || loadedToolFromOutputItem(item);
    if (loadedTool) message.loadedTools = mergeLoadedTools(message.loadedTools, loadedTool);
    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    if (eventName === "response.output_item.added" && cleanString(tool).toLowerCase() === "message") {
      addThreadEvent(thread, {
        event: "run.final_message_started",
        timestamp: nowMs() / 1000,
        runId: eventRunId || runId,
        tool: "message",
        preview: "",
        error: false,
      });
      saveState();
      broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    }
    return { action: "output_item" };
  }

  function recordFinalMessageDoneEvent(context) {
    const { thread, runId, message, responseRunId, stream } = context;
    const eventRunId = cleanString(message?.runId || responseRunId || stream?.realRunId || runId);
    addThreadEvent(thread, {
      event: "run.final_message_done",
      timestamp: nowMs() / 1000,
      runId: eventRunId || runId,
      tool: "message",
      preview: "",
      error: false,
    });
    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId: eventRunId || runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    return { action: "final_message_done" };
  }

  function markRunCompleted(context, event) {
    const { thread, message, runId, originalRunId, responseRunId, stream } = context;
    clearStreamingSaveTimer();
    const output = extractCompletedOutput(event) || String(message.content || "");
    const toolsetEscalationRequest = parseToolsetEscalationRequest(output, message);
    const approvalRequest = modelPermissionApprovalRequest(output, message);
    const validApprovalRequest = isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message) ? null : approvalRequest;
    const visibleOutput = toolsetEscalationRequest
      ? toolsetEscalationMessage(toolsetEscalationRequest)
      : (approvalRequest ? stripPermissionApprovalMarkers(output) : output);
    const completedAt = nowIso();
    message.content = compactFullContent(visibleOutput || output);
    message.status = "done";
    message.usage = usageWithRunMetadata(
      supplementGatewayUsage(event.usage || event.response?.usage || null, runId, message),
      event,
      message,
    );
    message.loadedSkills = mergeLoadedSkills(
      DEFAULT_RESPONSE_SKILL,
      message.loadedSkills,
      loadedSkillsForRun(thread, [
        runId,
        originalRunId,
        responseRunId,
        message.runId,
        stream?.realRunId,
      ]),
      loadedSkillsFromCompletedResponse(event),
    );
    message.loadedTools = mergeLoadedTools(
      message.loadedTools,
      loadedToolsForRun(thread, [
        runId,
        originalRunId,
        responseRunId,
        message.runId,
        stream?.realRunId,
      ]),
      loadedToolsFromCompletedResponse(event),
    );
    if (validApprovalRequest) {
      message.elevationRequired = true;
      message.elevationScope = validApprovalRequest.elevationScope;
      message.elevationReason = validApprovalRequest.elevationReason;
      message.elevationSource = validApprovalRequest.elevationSource;
    } else {
      message.elevationRequired = false;
      message.elevationScope = "";
      message.elevationReason = "";
      message.elevationSource = "";
    }
    if (toolsetEscalationRequest) {
      message.toolsetEscalationRequired = true;
      message.toolsetEscalationToolsets = toolsetEscalationRequest.toolsets;
      message.toolsetEscalationReason = toolsetEscalationRequest.reason;
      message.toolsetEscalationSource = toolsetEscalationRequest.source;
      addThreadEvent(thread, {
        event: "run.toolset_escalation_required",
        timestamp: nowMs() / 1000,
        runId: responseRunId || message.runId || runId,
        tool: "toolset",
        preview: JSON.stringify({
          toolsets: toolsetEscalationRequest.toolsets,
          reason: toolsetEscalationRequest.reason,
        }),
        error: false,
      });
    } else {
      message.toolsetEscalationRequired = false;
      message.toolsetEscalationToolsets = [];
      message.toolsetEscalationReason = "";
      message.toolsetEscalationSource = "";
    }
    if (!message.firstFeedbackAt && (visibleOutput || output)) message.firstFeedbackAt = completedAt;
    message.completedAt = completedAt;
    message.updatedAt = completedAt;
    message.artifacts = registerArtifactsFromText(thread, message, visibleOutput || output);
    enqueueExternalDeliveryForTerminalMessage(thread, message, "done");
    removeThreadActiveRun(thread, runId, "idle");
    thread.updatedAt = completedAt;
    compactTerminalTopicContext(thread, message, "run-completed");
    saveState();
    broadcast({ type: "run.completed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
    notifyTaskTerminal(thread, message, "done");
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return { action: "completed", output: visibleOutput || output };
  }

  function markRunFailed(threadId, messageId, runId, err) {
    const thread = (state().threads || []).find((item) => item.id === threadId);
    if (!thread) return { action: "missing_thread" };
    const message = (thread.messages || []).find((item) => item.id === messageId);
    if (!message) return { action: "missing_message" };
    if (["done", "failed", "cancelled"].includes(message.status)) return { action: "terminal_ignored" };
    clearStreamingSaveTimer();
    const failedAt = nowIso();
    message.status = "failed";
    message.error = safeErrorMessage(err);
    message.failedAt = failedAt;
    message.updatedAt = failedAt;
    enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
    removeThreadActiveRun(thread, runId, "failed");
    thread.updatedAt = failedAt;
    compactTerminalTopicContext(thread, message, "run-failed");
    saveState();
    broadcast({ type: "run.failed", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
    notifyTaskTerminal(thread, message, "failed");
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return { action: "failed", error: message.error };
  }

  function markRunCancelled(threadId, messageId, runId) {
    const thread = (state().threads || []).find((item) => item.id === threadId);
    if (!thread) return { action: "missing_thread" };
    const message = (thread.messages || []).find((item) => item.id === messageId);
    if (!message) return { action: "missing_message" };
    if (["done", "failed", "cancelled"].includes(message.status)) return { action: "terminal_ignored" };
    clearStreamingSaveTimer();
    const cancelledAt = nowIso();
    message.status = "cancelled";
    message.cancelledAt = cancelledAt;
    message.updatedAt = cancelledAt;
    removeThreadActiveRun(thread, runId, "idle");
    thread.updatedAt = cancelledAt;
    compactTerminalTopicContext(thread, message, "run-cancelled");
    saveState();
    broadcast({ type: "run.cancelled", threadId, runId, message: compactMessage(message), thread: threadSummary(thread) });
    scheduleNextQueuedRunForTaskGroup(thread, message.taskGroupId);
    return { action: "cancelled" };
  }

  function applyHermesRunEvent(event = {}) {
    const context = resolveRunEventContext(event);
    const { eventName, runId, thread, message } = context;
    if (!thread || !message) return { action: "missing_target", eventName, runId };

    if (eventName === "response.created") return markResponseCreated(context);
    if (eventName === "message.delta" || eventName === "response.output_text.delta") return applyDelta(context, event);
    if (eventName === "response.output_item.added" || eventName === "response.output_item.done") {
      return recordOutputItemEvent(context, event);
    }
    if (eventName === "response.output_text.done") return recordFinalMessageDoneEvent(context);

    addThreadEvent(thread, event);

    if (eventName === "run.completed" || eventName === "response.completed") return markRunCompleted(context, event);
    if (eventName === "run.failed" || eventName === "response.failed") {
      return markRunFailed(thread.id, message.id, runId, event.error?.message || event.error || "run failed");
    }
    if (eventName === "run.cancelled" || eventName === "response.incomplete") {
      return markRunCancelled(thread.id, message.id, runId);
    }

    saveState();
    broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
    return { action: "event", eventName };
  }

  function reconcileDetachedActiveRuns(reason = "Hermes Mobile restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
    let changed = false;
    const failedAt = nowIso();
    for (const thread of state().threads || []) {
      let threadChanged = false;
      for (const message of thread.messages || []) {
        if (!["queued", "running"].includes(String(message.status || ""))) continue;
        const runId = cleanString(message.runId);
        if (message.status === "queued" && !runId) continue;
        if (runId && activeStreams.has(runId)) continue;
        message.status = "failed";
        message.error = reason;
        message.failedAt = failedAt;
        message.updatedAt = failedAt;
        enqueueExternalDeliveryForTerminalMessage(thread, message, "failed");
        if (runId) removeThreadActiveRun(thread, runId, "failed");
        changed = true;
        threadChanged = true;
        broadcast({ type: "run.failed", threadId: thread.id, runId, message: compactMessage(message), thread: threadSummary(thread) });
      }
      if (!thread.activeRunIds?.length && thread.status === "running") thread.status = "failed";
      if (threadChanged) thread.updatedAt = failedAt;
    }
    if (changed) saveState();
    for (const thread of state().threads || []) {
      if ((thread.activeRunIds || []).length) continue;
      const queued = (thread.messages || []).find((message) => (
        message.role === "assistant" && message.status === "queued" && !message.runId && message.taskGroupId
      ));
      if (queued) scheduleNextQueuedRunForTaskGroup(thread, queued.taskGroupId);
    }
    return changed;
  }

  return Object.freeze({
    activeStreams,
    applyHermesRunEvent,
    extractCompletedOutput,
    findRunTarget,
    markRunCancelled,
    markRunFailed,
    reconcileDetachedActiveRuns,
    resolveRunEventContext,
  });
}

module.exports = {
  createGatewayRunEventService,
  extractCompletedOutput,
  findRunTargetInState,
};
