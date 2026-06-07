"use strict";

const gatewayRunLifecycle = require("./gateway-run-lifecycle-service");
const { gatewayRunUserFacingError } = require("./gateway-run-error-message-service");
const {
  QUEUED_CHAT_INSTRUCTIONS,
  QUEUED_TASK_INSTRUCTIONS,
  createGatewayRunQueueProjectionService,
  normalizeSingleWindowMode,
  queuedRunInstructions,
} = require("./gateway-run-queue-projection-service");

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

function safeErrorMessage(err) {
  return gatewayRunUserFacingError(err);
}

function lifecycleHelpers(options = {}) {
  return Object.assign(
    {},
    gatewayRunLifecycle,
    objectValue(options.gatewayRunLifecycleService || options.lifecycleHelpers || options.lifecycle, {}),
  );
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
  const compactMessage = callOrDefault(options.compactMessage, (message) => message);
  const threadSummary = callOrDefault(options.threadSummary, (thread) => thread);
  const scheduleImmediate = callOrDefault(options.scheduleImmediate || options.setImmediate, setImmediate);
  const projectionService = options.projectionService || createGatewayRunQueueProjectionService({
    compactConversationHistory: options.compactConversationHistory,
    makeAssistantMessageId: options.makeAssistantMessageId,
    nowIso,
  });
  const buildQueuedRunOptions = (...args) => projectionService.buildQueuedRunOptions(...args);
  const compactQueuedConversationHistory = (...args) => projectionService.compactQueuedConversationHistory(...args);
  const createQueuedAssistantMessage = (...args) => projectionService.createQueuedAssistantMessage(...args);

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
