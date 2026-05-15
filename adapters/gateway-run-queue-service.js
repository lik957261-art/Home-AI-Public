"use strict";

const gatewayRunLifecycle = require("./gateway-run-lifecycle-service");

const QUEUED_CHAT_INSTRUCTIONS = "The latest user message is a queued Hermes Mobile continuous-chat turn. Treat it as the next message in the supplied same-task conversation_history.";
const QUEUED_TASK_INSTRUCTIONS = "The latest user message is a queued mobile follow-up to an existing task group. Treat it as a follow-up to the supplied same-task conversation_history, not as a new independent task.";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function callOrDefault(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function requiredDependency(name) {
  return () => {
    const err = new Error(`${name} dependency is required`);
    err.status = 500;
    err.code = "gateway_run_queue_service_misconfigured";
    throw err;
  };
}

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultMakeAssistantMessageId(prefix = "msg") {
  return `${prefix}_${Date.now().toString(36)}`;
}

function normalizeSingleWindowMode(value) {
  return cleanString(value).toLowerCase() === "chat" ? "chat" : "task";
}

function safeErrorMessage(err) {
  return err?.message || String(err || "");
}

function lifecycleHelpers(options = {}) {
  return Object.assign(
    {},
    gatewayRunLifecycle,
    objectValue(options.gatewayRunLifecycleService || options.lifecycleHelpers || options.lifecycle, {}),
  );
}

function queuedRunInstructions(singleWindowMode) {
  if (singleWindowMode === "chat") return QUEUED_CHAT_INSTRUCTIONS;
  return QUEUED_TASK_INSTRUCTIONS;
}

function defaultMarkRunFailed(input = {}) {
  const thread = input.thread;
  const assistantMessage = input.assistantMessage || input.pair?.assistant;
  if (!thread || !assistantMessage) return;
  const failedAt = input.failedAt || defaultNowIso();
  assistantMessage.status = "failed";
  assistantMessage.error = input.error || safeErrorMessage(input.err);
  assistantMessage.failedAt = failedAt;
  assistantMessage.updatedAt = failedAt;
  thread.status = (thread.activeRunIds || []).length ? "running" : "failed";
  thread.updatedAt = failedAt;
  input.saveState();
  input.broadcast({
    type: "run.failed",
    threadId: thread.id,
    runId: "",
    message: input.compactMessage(assistantMessage),
    thread: input.threadSummary(thread),
  });
}

function createGatewayRunQueueService(options = {}) {
  const lifecycle = lifecycleHelpers(options);
  const nowIso = callOrDefault(options.nowIso, defaultNowIso);
  const saveState = callOrDefault(options.saveState, () => {});
  const broadcast = callOrDefault(options.broadcast, () => {});
  const startHermesRun = callOrDefault(
    options.startHermesRun || options.startRunForThread,
    requiredDependency("startHermesRun"),
  );
  const markRunFailed = callOrDefault(options.markRunFailed, defaultMarkRunFailed);
  const makeAssistantMessageId = callOrDefault(options.makeAssistantMessageId, defaultMakeAssistantMessageId);
  const compactConversationHistory = callOrDefault(
    options.compactConversationHistory,
    (messages) => (Array.isArray(messages) ? messages : []),
  );
  const compactMessage = callOrDefault(options.compactMessage, (message) => message);
  const threadSummary = callOrDefault(options.threadSummary, (thread) => thread);
  const scheduleImmediate = callOrDefault(options.scheduleImmediate || options.setImmediate, setImmediate);

  function addThreadActiveRun(thread, runId) {
    Object.assign(thread, lifecycle.withActiveRunAdded(thread, runId));
  }

  function replaceThreadActiveRun(thread, oldRunId, newRunId) {
    Object.assign(thread, lifecycle.withActiveRunReplaced(thread, oldRunId, newRunId));
  }

  function removeThreadActiveRun(thread, runId, idleStatus = "idle") {
    Object.assign(thread, lifecycle.withActiveRunRemoved(thread, runId, idleStatus));
  }

  function taskGroupHasRunningRun(thread, taskGroupId) {
    return lifecycle.taskGroupHasRunningRun(thread, taskGroupId);
  }

  function nextQueuedRunPairForTaskGroup(thread, taskGroupId) {
    return lifecycle.nextQueuedRunPairForTaskGroup(thread, taskGroupId);
  }

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

  function markQueuedRunStartFailed(thread, taskGroupId, err) {
    const pair = nextQueuedRunPairForTaskGroup(thread, taskGroupId);
    if (!pair) return;
    const failedAt = nowIso();
    markRunFailed({
      thread,
      taskGroupId,
      pair,
      userMessage: pair.user,
      assistantMessage: pair.assistant,
      runId: "",
      err,
      error: safeErrorMessage(err),
      failedAt,
      saveState,
      broadcast,
      compactMessage,
      threadSummary,
      defaultMarkRunFailed,
    });
  }

  async function startNextQueuedRunForTaskGroup(thread, taskGroupId) {
    const groupId = String(taskGroupId || "");
    if (!thread?.singleWindow || !groupId || taskGroupHasRunningRun(thread, groupId)) return null;
    const pair = nextQueuedRunPairForTaskGroup(thread, groupId);
    if (!pair) {
      if (!(thread.activeRunIds || []).length && thread.status === "queued") {
        thread.status = "idle";
        thread.updatedAt = nowIso();
        saveState();
        broadcast({ type: "thread.updated", thread: threadSummary(thread) });
      }
      return null;
    }
    return startHermesRun(thread, pair.user, pair.assistant, buildQueuedRunOptions(pair));
  }

  function scheduleNextQueuedRunForTaskGroup(thread, taskGroupId) {
    if (!thread?.singleWindow || !taskGroupId) return;
    scheduleImmediate(() => startNextQueuedRunForTaskGroup(thread, taskGroupId).catch((err) => {
      markQueuedRunStartFailed(thread, taskGroupId, err);
    }));
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
    addThreadActiveRun,
    buildQueuedRunOptions,
    compactQueuedConversationHistory,
    createQueuedAssistantMessage,
    markQueuedRunStartFailed,
    nextQueuedRunPairForTaskGroup,
    normalizeSingleWindowMode,
    queuedRunInstructions,
    removeThreadActiveRun,
    replaceThreadActiveRun,
    scheduleNextQueuedRunForTaskGroup,
    startNextQueuedRunForTaskGroup,
    taskGroupHasRunningRun,
  });
}

module.exports = {
  QUEUED_CHAT_INSTRUCTIONS,
  QUEUED_TASK_INSTRUCTIONS,
  createGatewayRunQueueService,
  defaultMarkRunFailed,
  normalizeSingleWindowMode,
  queuedRunInstructions,
};
