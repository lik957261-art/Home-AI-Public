"use strict";

const QUEUED_CHAT_INSTRUCTIONS = "The latest user message is a queued Hermes Mobile continuous-chat turn. Treat it as the next message in the supplied same-task conversation_history.";
const QUEUED_TASK_INSTRUCTIONS = "The latest user message is a queued mobile follow-up to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task.";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function normalizeSingleWindowMode(value) {
  return cleanString(value).toLowerCase() === "chat" ? "chat" : "task";
}

function queuedRunInstructions(singleWindowMode) {
  return singleWindowMode === "chat" ? QUEUED_CHAT_INSTRUCTIONS : QUEUED_TASK_INSTRUCTIONS;
}

function createGatewayRunQueueProjectionService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const makeAssistantMessageId = typeof options.makeAssistantMessageId === "function"
    ? options.makeAssistantMessageId
    : ((prefix = "msg") => `${prefix}_${Date.now().toString(36)}`);
  const compactConversationHistory = typeof options.compactConversationHistory === "function"
    ? options.compactConversationHistory
    : ((messages) => (Array.isArray(messages) ? messages : []));

  function buildQueuedRunOptions(pair = {}) {
    const userMessage = objectValue(pair.user);
    const assistantMessage = objectValue(pair.assistant);
    const runOptions = objectValue(assistantMessage.runOptions);
    const singleWindowMode = normalizeSingleWindowMode(
      assistantMessage.singleWindowMode
        || assistantMessage.single_window_mode
        || userMessage.singleWindowMode
        || "",
    );
    return Object.assign({}, runOptions, {
      reasoning_effort: assistantMessage.reasoningEffort || "",
      singleWindowMode,
      instructions: [
        runOptions.instructions || "",
        queuedRunInstructions(singleWindowMode),
      ].filter(Boolean).join("\n\n"),
    });
  }

  function createQueuedAssistantMessage(input = {}) {
    const createdAt = cleanString(input.createdAt || input.created_at) || nowIso();
    const actorWorkspaceId = cleanString(input.actorWorkspaceId || input.actor_workspace_id || "owner", "owner");
    const fields = objectValue(input.fields || input.overrides, {});
    return Object.assign({
      id: cleanString(input.id) || makeAssistantMessageId(input.idPrefix || "msg"),
      role: "assistant",
      content: "",
      status: "queued",
      runId: null,
      createdAt,
      updatedAt: createdAt,
      queuedAt: createdAt,
      artifacts: [],
      taskGroupId: cleanString(input.taskGroupId || input.task_group_id),
      messageKind: "ai",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes",
      actorWorkspaceId,
      reasoningEffort: cleanString(input.reasoningEffort || input.reasoning_effort),
      singleWindowMode: normalizeSingleWindowMode(input.singleWindowMode || input.single_window_mode || ""),
    }, fields);
  }

  function compactQueuedConversationHistory(messages, maxMessages, maxChars, policy = {}) {
    return compactConversationHistory(messages, maxMessages, maxChars, policy);
  }

  return Object.freeze({
    buildQueuedRunOptions,
    compactQueuedConversationHistory,
    createQueuedAssistantMessage,
  });
}

module.exports = {
  QUEUED_CHAT_INSTRUCTIONS,
  QUEUED_TASK_INSTRUCTIONS,
  createGatewayRunQueueProjectionService,
  normalizeSingleWindowMode,
  queuedRunInstructions,
};
