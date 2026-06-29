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
const {
  attachPreparedIntentToMessage,
  extractPreparedIntentFromCompletedResponse,
} = require("./wardrobe-outfit-wear-intent-action-service");

const PLUGIN_CONVERSATION_ACTION_COMMENT_RE = /<!--\s*homeai-plugin-conversation-action\b([\s\S]*?)-->/gi;
const OWNER_TASK_REQUEST_COMMENT_RE = /<!--\s*homeai-owner-task-request\b([\s\S]*?)-->/gi;
const LEGACY_TASK_CARD_CLAIM_RE = /\bt_[a-z0-9]{6,}\b/ig;
const LEGACY_TASK_CARD_CONTEXT_RE = /(发卡|重新发卡|任务卡|卡片\s*ID|卡片ID|状态\s*[：:]\s*ready|指派\s*[：:]\s*codex|assigned\s*[:：]?\s*codex)/i;

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

function parseJsonCommentBody(body = "") {
  const text = String(body || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return { __parseError: true };
  }
}

function parsePluginConversationActionComments(text = "") {
  const source = String(text || "");
  const actions = [];
  const parseMatches = (regex, defaults = {}) => {
    regex.lastIndex = 0;
    let match = null;
    while ((match = regex.exec(source))) {
      const parsed = parseJsonCommentBody(match[1]);
      if (!parsed) continue;
      actions.push(Object.assign({}, defaults, parsed));
    }
  };
  parseMatches(PLUGIN_CONVERSATION_ACTION_COMMENT_RE);
  parseMatches(OWNER_TASK_REQUEST_COMMENT_RE, {
    pluginId: "home-ai",
    requestType: "capability_gap",
    sourceSurface: "host-conversation",
  });
  return actions;
}

function stripHtmlComments(value = "") {
  return String(value || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ").trim();
}

function compactText(value = "", max = 700) {
  const text = stripHtmlComments(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 3))}...`;
}

function firstLegacyTaskCardIds(value = "") {
  const out = [];
  LEGACY_TASK_CARD_CLAIM_RE.lastIndex = 0;
  let match = null;
  while ((match = LEGACY_TASK_CARD_CLAIM_RE.exec(String(value || "")))) {
    const id = match[0];
    if (!out.includes(id)) out.push(id);
    if (out.length >= 4) break;
  }
  return out;
}

function lineValueAfterLabel(output = "", labels = []) {
  const escaped = labels.map((label) => String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!escaped) return "";
  const re = new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[：:]\\s*([^\\n]+)`, "i");
  const match = String(output || "").match(re);
  return compactText(match?.[1] || "", 160);
}

function looksLikeLegacyTaskCardClaim(output = "") {
  const text = String(output || "");
  if (!text) return false;
  if (/\b(?:ainb|ttc)_[a-z0-9_-]+\b/i.test(text)) return false;
  if (!firstLegacyTaskCardIds(text).length) return false;
  return LEGACY_TASK_CARD_CONTEXT_RE.test(text);
}

function recoveredOwnerTaskRequestFromLegacyClaim(output = "") {
  if (!looksLikeLegacyTaskCardClaim(output)) return null;
  const cardIds = firstLegacyTaskCardIds(output);
  const title = lineValueAfterLabel(output, ["标题", "Title"])
    || "Gateway legacy task-card claim requires Home AI repair";
  const excerpt = compactText(output, 700);
  return {
    pluginId: "home-ai",
    requestType: "capability_gap",
    severity: "H2",
    title,
    summary: [
      "A Gateway reply claimed a legacy `t_*` card was created, but no real Home AI Owner-gated request marker or `ainb_*`/`ttc_*` id was present.",
      "Home AI recovered the claim into an Owner approval request so the implementation work is not silently lost.",
    ].join(" "),
    suggestedChange: [
      "Implement or verify the requested Home AI capability described by the bounded legacy-card claim.",
      "Prevent future ordinary or directory-bound runs from using legacy Kanban `t_*` cards as implementation repair cards.",
    ].join(" "),
    acceptance: [
      "A fresh ordinary or directory-bound Gateway run that needs implementation work creates a real Owner Action Inbox item (`ainb_*`) or Codex task card (`ttc_*`).",
      "Legacy `t_*` card claims without a real Home AI marker are recovered or flagged instead of disappearing from Inbox.",
    ].join(" "),
    evidence: {
      recovery: "legacy_task_card_claim_recovered",
      legacyCardIds: cardIds,
      affectedSurface: "ordinary_or_directory_bound_gateway",
      claimExcerpt: excerpt,
    },
  };
}

function completedOutputLooksLikeGatewayFailure(output) {
  const text = cleanString(output).replace(/\s+/g, " ");
  if (!text) return false;
  return /^API call failed after \d+ retr(?:y|ies)\b/i.test(text)
    || /^Gateway stream aborted before completion\b/i.test(text)
    || /^Hermes Gateway did not create a run within \d+ seconds\b/i.test(text)
    || /^Hermes Gateway no longer reports run \S+ after \d+ seconds\b/i.test(text);
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
  const pluginConversationActionBridgeService = options.pluginConversationActionBridgeService || null;
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
  const startQuotaFailoverRetry = typeof options.startQuotaFailoverRetry === "function"
    ? options.startQuotaFailoverRetry
    : (() => false);
  const stripPermissionApprovalMarkers = typeof options.stripPermissionApprovalMarkers === "function"
    ? options.stripPermissionApprovalMarkers
    : ((text) => String(text || ""));
  const supplementGatewayUsage = typeof options.supplementGatewayUsage === "function"
    ? options.supplementGatewayUsage
    : ((usage) => usage);
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;

  function submitPluginConversationActionRequests(thread, message, output, completedAt) {
    if (!pluginConversationActionBridgeService || typeof pluginConversationActionBridgeService.createRequest !== "function") return [];
    const parsedActions = parsePluginConversationActionComments(output);
    const recoveredLegacyAction = parsedActions.length ? null : recoveredOwnerTaskRequestFromLegacyClaim(output);
    const actions = recoveredLegacyAction ? [recoveredLegacyAction] : parsedActions;
    if (!actions.length) return [];
    return actions.map((action, index) => {
      if (action.__parseError) {
        addThreadEvent(thread, {
          event: "run.plugin_conversation_action_request_failed",
          timestamp: nowMs() / 1000,
          runId: message.runId || "",
          tool: "plugin_conversation_action",
          preview: JSON.stringify({ error: "invalid_json", index }),
          error: true,
        });
        return Promise.resolve({ ok: false, error: "invalid_json" });
      }
      const payload = Object.assign({}, action, {
        workspaceId: action.workspaceId || action.workspace_id || message.actorWorkspaceId || message.workspaceId || thread.workspaceId || "owner",
        sourceThreadId: action.sourceThreadId || action.source_thread_id || thread.id || "",
        sourceTurnId: action.sourceTurnId || action.source_turn_id || message.id || "",
        sourceSurface: action.sourceSurface || action.source_surface || (action.pluginId === "home-ai" || action.plugin_id === "home-ai" ? "host-conversation" : "host-plugin-conversation"),
        createdAt: action.createdAt || action.created_at || completedAt,
      });
      return Promise.resolve(pluginConversationActionBridgeService.createRequest(payload))
        .then((result) => {
          addThreadEvent(thread, {
            event: result?.ok
              ? (recoveredLegacyAction ? "run.plugin_conversation_action_request_recovered" : "run.plugin_conversation_action_request_created")
              : "run.plugin_conversation_action_request_failed",
            timestamp: nowMs() / 1000,
            runId: message.runId || "",
            tool: "plugin_conversation_action",
            preview: JSON.stringify({
              pluginId: payload.pluginId || payload.plugin_id || "",
              requestType: payload.requestType || payload.request_type || "",
              inboxItemId: result?.inboxItem?.id || "",
              recovery: recoveredLegacyAction ? "legacy_task_card_claim" : "",
              error: result?.ok ? "" : (result?.error || "create_request_failed"),
            }),
            error: !result?.ok,
          });
          saveState();
          return result;
        })
        .catch((err) => {
          addThreadEvent(thread, {
            event: "run.plugin_conversation_action_request_failed",
            timestamp: nowMs() / 1000,
            runId: message.runId || "",
            tool: "plugin_conversation_action",
            preview: JSON.stringify({
              pluginId: payload.pluginId || payload.plugin_id || "",
              requestType: payload.requestType || payload.request_type || "",
              error: err?.code || err?.message || "create_request_failed",
            }),
            error: true,
          });
          saveState();
          return { ok: false, error: err?.message || "create_request_failed" };
        });
    });
  }

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
    if (completedOutputLooksLikeGatewayFailure(output)) {
      const err = new Error(output);
      err.code = "gateway_completed_with_failure_output";
      const visibleRunId = responseRunId || message.runId || runId;
      if (startQuotaFailoverRetry(thread, message, { output, error: err, previousRunId: visibleRunId })) {
        saveState();
        broadcast({ type: "run.event", threadId: thread.id, runId, event: thread.events?.[thread.events.length - 1], thread: threadSummary(thread) });
        return { action: "openai_codex_quota_failover_retrying" };
      }
      return markRunFailed(thread.id, message.id, visibleRunId, err);
    }
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
    const wardrobeOutfitWearIntent = extractPreparedIntentFromCompletedResponse(event);
    if (wardrobeOutfitWearIntent) {
      attachPreparedIntentToMessage(message, wardrobeOutfitWearIntent, { updatedAt: completedAt });
    }
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
    submitPluginConversationActionRequests(thread, message, visibleOutput || output, completedAt);
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
  completedOutputLooksLikeGatewayFailure,
  createGatewayRunCompletionService,
  extractCompletedOutput,
  parsePluginConversationActionComments,
  usageWithRunMetadata,
};
