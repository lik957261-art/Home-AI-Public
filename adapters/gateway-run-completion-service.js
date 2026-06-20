"use strict";

const {
  loadedSkillsForRun,
  loadedSkillsFromCompletedResponse,
  loadedToolsForRun,
  loadedToolsFromCompletedResponse,
  mergeLoadedSkills,
  mergeLoadedTools,
} = require("./gateway-run-evidence-service");
const {
  parseToolsetEscalationRequest,
  toolsetEscalationMessage,
} = require("./gateway-run-toolset-escalation-service");
const { receiptSummaryTitleFromText } = require("./directory-topic-index-service");
const { validateWardrobeOutfitWorkflowCompletion } = require("./wardrobe-outfit-workflow-gate-service");

function cleanString(value) {
  return String(value || "").trim();
}

function compactReceiptTitle(value, max = 160) {
  const text = receiptSummaryTitleFromText(value, { max });
  if (!text || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}...`;
}

function compactFallback(value) {
  return value;
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

function createGatewayRunCompletionService(options = {}) {
  const addThreadEvent = typeof options.addThreadEvent === "function" ? options.addThreadEvent : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const clearStreamingSaveTimer = typeof options.clearStreamingSaveTimer === "function" ? options.clearStreamingSaveTimer : (() => {});
  const compactFullContent = typeof options.compactFullContent === "function" ? options.compactFullContent : compactFallback;
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const compactTerminalTopicContext = typeof options.compactTerminalTopicContext === "function" ? options.compactTerminalTopicContext : (() => null);
  const directoryTopicIndexService = options.directoryTopicIndexService || null;
  const enqueueExternalDeliveryForTerminalMessage = typeof options.enqueueExternalDeliveryForTerminalMessage === "function"
    ? options.enqueueExternalDeliveryForTerminalMessage
    : (() => {});
  const isOrdinaryToolSchemaElevationRequest = typeof options.isOrdinaryToolSchemaElevationRequest === "function"
    ? options.isOrdinaryToolSchemaElevationRequest
    : (() => false);
  const markRunFailed = typeof options.markRunFailed === "function" ? options.markRunFailed : (() => ({ action: "failed" }));
  const modelPermissionApprovalRequest = typeof options.modelPermissionApprovalRequest === "function"
    ? options.modelPermissionApprovalRequest
    : (() => null);
  const notifyTaskTerminal = typeof options.notifyTaskTerminal === "function" ? options.notifyTaskTerminal : (() => {});
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const registerArtifactsFromText = typeof options.registerArtifactsFromText === "function"
    ? options.registerArtifactsFromText
    : (() => []);
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function" ? options.removeThreadActiveRun : (() => {});
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const scheduleNextQueuedRunForTaskGroup = typeof options.scheduleNextQueuedRunForTaskGroup === "function"
    ? options.scheduleNextQueuedRunForTaskGroup
    : (() => {});
  const startEscalatedToolsetRetry = typeof options.startEscalatedToolsetRetry === "function"
    ? options.startEscalatedToolsetRetry
    : (() => false);
  const stripPermissionApprovalMarkers = typeof options.stripPermissionApprovalMarkers === "function"
    ? options.stripPermissionApprovalMarkers
    : ((text) => String(text || ""));
  const supplementGatewayUsage = typeof options.supplementGatewayUsage === "function"
    ? options.supplementGatewayUsage
    : ((usage) => usage);
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;

  function updateTaskGroupReceiptMeta(thread, message, completedAt) {
    const taskGroupId = cleanString(message?.taskGroupId);
    if (!thread || !taskGroupId || taskGroupId === "chat" || taskGroupId === "group-chat") return;
    if (!thread.taskGroupMeta || typeof thread.taskGroupMeta !== "object" || Array.isArray(thread.taskGroupMeta)) {
      thread.taskGroupMeta = {};
    }
    const existing = thread.taskGroupMeta[taskGroupId] && typeof thread.taskGroupMeta[taskGroupId] === "object"
      ? thread.taskGroupMeta[taskGroupId]
      : {};
    thread.taskGroupMeta[taskGroupId] = Object.assign({}, existing, {
      pluginTopic: Boolean(existing.pluginTopic || taskGroupId.startsWith("plugin:")),
      lastReceiptTitle: compactReceiptTitle(message.content || ""),
      lastMessageId: cleanString(message.id || existing.lastMessageId),
      updatedAt: completedAt || existing.updatedAt || nowIso(),
      createdAt: existing.createdAt || completedAt || nowIso(),
    });
  }

  function markRunCompleted(context, event) {
    const { thread, message, runId, originalRunId, responseRunId, stream } = context;
    if (["done", "failed", "cancelled"].includes(String(message?.status || ""))) {
      return { action: "terminal_ignored", status: message.status };
    }
    clearStreamingSaveTimer();
    const output = extractCompletedOutput(event) || String(message.content || "");
    const toolsetEscalationRequest = parseToolsetEscalationRequest(output, message) || message.pendingToolsetEscalationRequest || null;
    const approvalRequest = modelPermissionApprovalRequest(output, message);
    const validApprovalRequest = isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message) ? null : approvalRequest;
    if (toolsetEscalationRequest) {
      delete message.pendingToolsetEscalationRequest;
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
          requested_toolsets: toolsetEscalationRequest.requestedToolsets || toolsetEscalationRequest.toolsets,
          retryable_toolsets: toolsetEscalationRequest.retryableToolsets || [],
          blocked_toolsets: toolsetEscalationRequest.blockedToolsets || [],
          reason: toolsetEscalationRequest.reason,
        }),
        error: false,
      });
      removeThreadActiveRun(thread, runId, "idle");
      if (startEscalatedToolsetRetry(thread, message, toolsetEscalationRequest, responseRunId || message.runId || runId)) {
        saveState();
        broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
        return { action: "toolset_escalation_retrying", toolsets: toolsetEscalationRequest.toolsets };
      }
    }
    const visibleOutput = toolsetEscalationRequest
      ? toolsetEscalationMessage(toolsetEscalationRequest)
      : (approvalRequest ? stripPermissionApprovalMarkers(output) : output);
    const completedAt = nowIso();
    const relatedRunIds = [runId, originalRunId, responseRunId, message.runId, stream?.realRunId];
    const nextLoadedSkills = mergeLoadedSkills(
      message.loadedSkills,
      loadedSkillsForRun(thread, relatedRunIds),
      loadedSkillsFromCompletedResponse(event),
    );
    const nextLoadedTools = mergeLoadedTools(
      message.loadedTools,
      loadedToolsForRun(thread, relatedRunIds),
      loadedToolsFromCompletedResponse(event),
    );
    const nextUsage = usageWithRunMetadata(
      supplementGatewayUsage(event.usage || event.response?.usage || null, runId, message),
      event,
      message,
    );
    const wardrobeCompletionGate = validateWardrobeOutfitWorkflowCompletion({
      message,
      output: visibleOutput || output,
      loadedSkills: nextLoadedSkills,
      loadedTools: nextLoadedTools,
    });
    if (wardrobeCompletionGate.active && !wardrobeCompletionGate.ok) {
      message.content = "";
      message.loadedSkills = nextLoadedSkills;
      message.loadedTools = nextLoadedTools;
      message.usage = nextUsage;
      addThreadEvent(thread, {
        event: "run.wardrobe_outfit_completion_gate_failed",
        timestamp: nowMs() / 1000,
        runId: responseRunId || message.runId || runId,
        tool: "wardrobe_workflow_gate",
        preview: wardrobeCompletionGate.eventPreview || "",
        error: true,
      });
      const err = new Error(wardrobeCompletionGate.message || "Wardrobe outfit completion gate failed.");
      err.code = wardrobeCompletionGate.errorCode || "wardrobe_completion_gate_failed";
      err.details = {
        reason: wardrobeCompletionGate.reason,
        missing: wardrobeCompletionGate.missing,
      };
      return markRunFailed(thread.id, message.id, responseRunId || message.runId || runId, err);
    }
    message.content = compactFullContent(visibleOutput || output);
    message.status = "done";
    message.usage = nextUsage;
    message.loadedSkills = nextLoadedSkills;
    message.loadedTools = nextLoadedTools;
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
    if (!toolsetEscalationRequest) {
      delete message.pendingToolsetEscalationRequest;
      message.toolsetEscalationRequired = false;
      message.toolsetEscalationToolsets = [];
      message.toolsetEscalationReason = "";
      message.toolsetEscalationSource = "";
    }
    if (!message.firstFeedbackAt && (visibleOutput || output)) message.firstFeedbackAt = completedAt;
    message.completedAt = completedAt;
    message.updatedAt = completedAt;
    message.artifacts = registerArtifactsFromText(thread, message, visibleOutput || output);
    if (directoryTopicIndexService && typeof directoryTopicIndexService.upsertThreadTopicIndex === "function") {
      directoryTopicIndexService.upsertThreadTopicIndex(thread, {
        taskGroupId: message.taskGroupId,
        actorWorkspaceId: message.actorWorkspaceId || message.senderWorkspaceId || thread.workspaceId,
        updatedAt: completedAt,
        lastMessageId: message.id,
        message,
      });
    }
    updateTaskGroupReceiptMeta(thread, message, completedAt);
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

  return Object.freeze({
    markRunCompleted,
  });
}

module.exports = {
  createGatewayRunCompletionService,
  extractCompletedOutput,
  usageWithRunMetadata,
};
