"use strict";

const {
  extractOutputItemText,
  loadedSkillFromRunEvent,
  loadedToolFromRunEvent,
  loadedToolFromOutputItem,
  mergeLoadedSkills,
  mergeLoadedTools,
  outputItemCallId,
  outputItemFunctionName,
  outputItemPreview,
  outputItemToolName,
  runToolNameForCallId,
} = require("./gateway-run-evidence-service");
const {
  parseToolsetEscalationRequest,
  sanitizeToolsetEscalationVisibleText,
} = require("./gateway-run-toolset-escalation-service");
const {
  ACTION_KEY: WARDROBE_OUTFIT_WEAR_INTENT_ACTION_KEY,
  attachPreparedIntentToMessage,
  extractPreparedIntentFromOutputItemEvent,
} = require("./wardrobe-outfit-wear-intent-action-service");

function cleanString(value) {
  return String(value || "").trim();
}

function compactFallback(value) {
  return value;
}

function createGatewayRunOutputEventService(options = {}) {
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const broadcastMessageUpdated = typeof options.broadcastMessageUpdated === "function"
    ? options.broadcastMessageUpdated
    : (() => {});
  const compactFullContent = typeof options.compactFullContent === "function" ? options.compactFullContent : compactFallback;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const scheduleStreamingStateSave = typeof options.scheduleStreamingStateSave === "function"
    ? options.scheduleStreamingStateSave
    : saveState;
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;

  function applyMessageOutputText(context, text, source = "message_output") {
    const { thread, message } = context;
    const value = String(text || "");
    if (!value) return { action: `empty_${source}` };
    const feedbackAt = nowIso();
    const sanitized = sanitizeToolsetEscalationVisibleText(value);
    if (sanitized.found) {
      const pendingRequest = parseToolsetEscalationRequest(value, message);
      if (pendingRequest) message.pendingToolsetEscalationRequest = pendingRequest;
      message.content = compactFullContent(sanitized.text);
    } else {
      message.content = compactFullContent(value);
    }
    if (!message.firstFeedbackAt) message.firstFeedbackAt = feedbackAt;
    message.updatedAt = feedbackAt;
    thread.updatedAt = feedbackAt;
    scheduleStreamingStateSave();
    broadcastMessageUpdated(thread, message);
    return { action: sanitized.found ? `${source}_sanitized_toolset_escalation` : source };
  }

  function eventRunIdFor(context) {
    const { message, responseRunId, runId, stream } = context;
    return cleanString(message?.runId || responseRunId || stream?.realRunId || runId);
  }

  function broadcastRunEvent(thread, runId) {
    broadcast({
      type: "run.event",
      threadId: thread.id,
      runId,
      event: thread.events?.[thread.events.length - 1],
      thread: threadSummary(thread),
    });
  }

  function recordWardrobeOutfitWearIntentMetadata(context, event, functionName) {
    const { thread, runId, message } = context;
    const intent = extractPreparedIntentFromOutputItemEvent(event, { functionName });
    if (!intent) return null;
    const existingKey = cleanString(message.pluginActions?.[WARDROBE_OUTFIT_WEAR_INTENT_ACTION_KEY]?.intent?.idempotency_key);
    if (existingKey && existingKey === intent.idempotency_key) return null;
    const updatedAt = nowIso();
    const action = attachPreparedIntentToMessage(message, intent, { updatedAt });
    if (!action) return null;
    message.updatedAt = updatedAt;
    thread.updatedAt = updatedAt;
    addThreadEvent(thread, {
      event: "run.wardrobe_outfit_wear_intent_metadata_attached",
      timestamp: nowMs() / 1000,
      runId: eventRunIdFor(context) || runId,
      tool: "wardrobe_outfit_wear_intent",
      preview: JSON.stringify({
        status: action.status,
        executable: action.executable,
        itemCount: Array.isArray(intent.items) ? intent.items.length : 0,
        source: "response.output_item",
      }),
      error: false,
    });
    return action;
  }

  function recordOutputItemEvent(context, event) {
    const { thread, runId, eventName, message } = context;
    const eventRunId = eventRunIdFor(context);
    const item = event.item || event.output_item || event.outputItem || {};
    const tool = outputItemToolName(item);
    let preview = outputItemPreview(item);
    if (cleanString(tool).toLowerCase() === "function_call_output") {
      const callId = outputItemCallId(item);
      const name = outputItemFunctionName(item)
        || runToolNameForCallId(thread, eventRunId, callId)
        || runToolNameForCallId(thread, runId, callId);
      preview = (name || callId) ? JSON.stringify({ name, callId }) : "";
      if (recordWardrobeOutfitWearIntentMetadata(context, event, name)) {
        broadcastMessageUpdated(thread, message);
      }
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
    const outputText = extractOutputItemText(item);
    if (outputText) applyMessageOutputText(context, outputText, "output_item_text");
    saveState();
    broadcastRunEvent(thread, eventRunId || runId);
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
      broadcastRunEvent(thread, eventRunId || runId);
    }
    return { action: "output_item" };
  }

  function recordFinalMessageDoneEvent(context, event = {}) {
    const { thread, runId } = context;
    const eventRunId = eventRunIdFor(context);
    const finalText = String(event.text || "");
    if (finalText) applyMessageOutputText(context, finalText, "output_text_done");
    addThreadEvent(thread, {
      event: "run.final_message_done",
      timestamp: nowMs() / 1000,
      runId: eventRunId || runId,
      tool: "message",
      preview: "",
      error: false,
    });
    saveState();
    broadcastRunEvent(thread, eventRunId || runId);
    return { action: "final_message_done" };
  }

  return Object.freeze({
    applyMessageOutputText,
    recordFinalMessageDoneEvent,
    recordOutputItemEvent,
  });
}

module.exports = {
  createGatewayRunOutputEventService,
};
