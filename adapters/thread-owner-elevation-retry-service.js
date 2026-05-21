"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function callOrDefault(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function requiredDependency(name) {
  return () => {
    const err = new Error(`${name} dependency is required`);
    err.status = 500;
    err.code = "owner_elevation_retry_service_misconfigured";
    throw err;
  };
}

function defaultIsOwnerAuth(auth) {
  return Boolean(auth?.isOwner || auth?.role === "owner");
}

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultMakeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`;
}

function sanitizeOwnerElevationScope(value) {
  const scope = cleanString(value);
  if (/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(scope)) return scope;
  return "owner_high_privilege";
}

function findAssistantMessageById(thread, messageId) {
  const id = cleanString(messageId);
  return (Array.isArray(thread?.messages) ? thread.messages : [])
    .find((item) => cleanString(item?.id) === id && item?.role === "assistant") || null;
}

function precedingUserMessageForAssistant(thread, assistantMessage) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const index = messages.findIndex((item) => cleanString(item?.id) === cleanString(assistantMessage?.id));
  for (let i = (index >= 0 ? index - 1 : messages.length - 1); i >= 0; i -= 1) {
    const candidate = messages[i];
    if (!candidate || candidate.role !== "user") continue;
    if (assistantMessage?.taskGroupId && candidate.taskGroupId !== assistantMessage.taskGroupId) continue;
    return candidate;
  }
  return null;
}

function result(status, payload, extra = {}) {
  return Object.assign({
    ok: status >= 200 && status < 300,
    status,
    payload,
  }, extra);
}

function concurrencyPayload(concurrencyError, runConcurrencySnapshot) {
  return {
    error: concurrencyError.message,
    code: concurrencyError.code,
    concurrency: concurrencyError.snapshot || runConcurrencySnapshot(),
  };
}

function bodyError(body) {
  if (!body || typeof body !== "object") return null;
  return body.__error || null;
}

function bodyObject(body) {
  return body && typeof body === "object" ? body : {};
}

function ownerElevationOnceTokenFromBody(body) {
  return body.ownerElevationOnceToken || body.owner_elevation_once_token || "";
}

function buildOwnerElevationRetryMessage(input = {}) {
  const userMessage = input.userMessage || {};
  const sourceMessage = input.sourceMessage || {};
  const actorWorkspaceId = cleanString(input.actorWorkspaceId, "owner") || "owner";
  const createdAt = cleanString(input.createdAt);
  return {
    id: input.id,
    role: "assistant",
    content: "",
    status: "queued",
    runId: null,
    createdAt,
    updatedAt: createdAt,
    queuedAt: createdAt,
    artifacts: [],
    taskGroupId: userMessage.taskGroupId || sourceMessage.taskGroupId || "",
    messageKind: "ai",
    senderWorkspaceId: "hermes",
    senderPrincipalId: "hermes",
    senderLabel: "Hermes",
    actorWorkspaceId,
    reasoningEffort: userMessage.reasoningEffort || sourceMessage.reasoningEffort || "",
    singleWindowMode: userMessage.singleWindowMode || sourceMessage.singleWindowMode || "",
    elevatedFromMessageId: sourceMessage.id,
  };
}

function buildOwnerElevationRunOptions(input = {}) {
  const assistantMessage = input.assistantMessage || {};
  const ownerElevationInstructions = callOrDefault(input.ownerElevationInstructions, () => "");
  return {
    reasoning_effort: assistantMessage.reasoningEffort || "",
    singleWindowMode: assistantMessage.singleWindowMode || "",
    actorWorkspaceId: cleanString(input.actorWorkspaceId, "owner") || "owner",
    gatewayRouting: input.gatewayRouting || {},
    instructions: ownerElevationInstructions({ elevationScope: input.elevationScope }),
  };
}

function applyQueuedRetryState(input = {}) {
  const thread = input.thread;
  const assistantMessage = input.assistantMessage;
  const createdAt = cleanString(input.createdAt);
  if (!Array.isArray(thread?.messages)) {
    const err = new Error("Thread message list is not available");
    err.status = 500;
    err.code = "invalid_thread_messages";
    throw err;
  }
  thread.messages.push(assistantMessage);
  thread.status = "queued";
  thread.updatedAt = createdAt;
  return thread;
}

function createThreadOwnerElevationRetryService(options = {}) {
  const isOwnerAuth = callOrDefault(options.isOwnerAuth, defaultIsOwnerAuth);
  const findAssistantMessage = callOrDefault(options.findAssistantMessage, findAssistantMessageById);
  const findPrecedingUserMessage = callOrDefault(options.precedingUserMessageForAssistant, precedingUserMessageForAssistant);
  const runConcurrencyError = callOrDefault(options.runConcurrencyError, () => null);
  const runConcurrencySnapshot = callOrDefault(options.runConcurrencySnapshot, () => ({}));
  const sanitizeElevationScope = callOrDefault(options.sanitizeElevationScope, sanitizeOwnerElevationScope);
  const gatewayRoutingForModelRun = callOrDefault(
    options.gatewayRoutingForModelRun,
    requiredDependency("gatewayRoutingForModelRun"),
  );
  const ownerElevationInstructions = callOrDefault(options.ownerElevationInstructions, () => "");
  const nowIso = callOrDefault(options.nowIso, defaultNowIso);
  const makeId = callOrDefault(options.makeId, defaultMakeId);
  const saveState = callOrDefault(options.saveState, () => {});
  const broadcast = callOrDefault(options.broadcast, () => {});
  const startRunForThread = callOrDefault(options.startRunForThread, requiredDependency("startRunForThread"));
  const removeThreadActiveRun = callOrDefault(options.removeThreadActiveRun, () => {});
  const compactThread = callOrDefault(options.compactThread, (thread) => thread);
  const compactMessage = callOrDefault(options.compactMessage, (message) => message);
  const threadSummary = callOrDefault(options.threadSummary, (thread) => thread);

  function broadcastQueuedMessage(thread, assistantMessage) {
    broadcast({
      type: "message.updated",
      threadId: thread.id,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
  }

  function markRetryStartFailed(thread, assistantMessage, err) {
    const failedAt = nowIso();
    assistantMessage.status = "failed";
    assistantMessage.error = err?.message || String(err);
    assistantMessage.failedAt = failedAt;
    assistantMessage.updatedAt = failedAt;
    removeThreadActiveRun(thread, assistantMessage.runId, "failed");
    thread.updatedAt = failedAt;
    saveState();
    broadcast({
      type: "run.failed",
      threadId: thread.id,
      message: compactMessage(assistantMessage),
      thread: threadSummary(thread),
    });
    return { failedAt, error: assistantMessage.error };
  }

  async function retryOwnerElevation(input = {}) {
    const ownerAuth = input.ownerAuth || input.auth || null;
    if (!isOwnerAuth(ownerAuth)) {
      return result(403, { error: "Owner access is required" }, { code: "owner_required" });
    }

    const thread = input.thread || null;
    if (!thread) {
      return result(404, { error: "Thread not found" }, { code: "thread_not_found" });
    }

    const parseError = bodyError(input.body);
    if (parseError) {
      return result(400, {
        error: parseError.message || "Invalid request body",
      }, { code: "invalid_request_body", thread });
    }

    const messageId = cleanString(input.messageId || input.message_id);
    const sourceMessage = input.message || findAssistantMessage(thread, messageId);
    if (!sourceMessage || sourceMessage.role !== "assistant") {
      return result(404, { error: "Assistant message not found" }, { code: "assistant_message_not_found", thread });
    }

    if (!sourceMessage.elevationRequired) {
      return result(409, {
        error: "This message is not waiting for Owner elevation approval",
      }, { code: "message_not_waiting_for_owner_elevation", thread, sourceMessage });
    }

    const userMessage = input.userMessage || findPrecedingUserMessage(thread, sourceMessage);
    if (!userMessage) {
      return result(400, { error: "Original user message was not found" }, {
        code: "original_user_message_not_found",
        thread,
        sourceMessage,
      });
    }

    const actorWorkspaceId = "owner";
    const concurrencyError = runConcurrencyError(actorWorkspaceId);
    if (concurrencyError) {
      return result(concurrencyError.status || 429, concurrencyPayload(concurrencyError, runConcurrencySnapshot), {
        code: concurrencyError.code || "run_concurrency_limit",
        thread,
        sourceMessage,
        userMessage,
      });
    }

    const body = bodyObject(input.body);
    let assistantMessage = null;
    try {
      const elevationScope = sanitizeElevationScope(
        body.elevationScope || body.elevation_scope || sourceMessage.elevationScope || "owner_high_privilege",
      );
      const gatewayRouting = gatewayRoutingForModelRun(ownerAuth, userMessage.content, {
        actorWorkspaceId,
        maintenanceMode: true,
        ownerElevationOnceToken: ownerElevationOnceTokenFromBody(body),
        elevationScope,
      });
      const createdAt = nowIso();
      assistantMessage = buildOwnerElevationRetryMessage({
        id: makeId("msg"),
        createdAt,
        userMessage,
        sourceMessage,
        actorWorkspaceId,
      });
      const runOptions = buildOwnerElevationRunOptions({
        assistantMessage,
        actorWorkspaceId,
        gatewayRouting,
        elevationScope,
        ownerElevationInstructions,
      });
      assistantMessage.runOptions = runOptions;
      applyQueuedRetryState({ thread, assistantMessage, createdAt });
      saveState();
      broadcastQueuedMessage(thread, assistantMessage);

      const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
      return result(202, { ok: true, run, thread: compactThread(thread) }, {
        thread,
        sourceMessage,
        userMessage,
        assistantMessage,
        run,
        runOptions,
        elevationScope,
      });
    } catch (err) {
      if (assistantMessage) markRetryStartFailed(thread, assistantMessage, err);
      return result(err?.status || 502, {
        error: err?.message || String(err),
        code: err?.code || "owner_elevation_retry_failed",
        elevationRequired: Boolean(err?.elevationRequired),
        elevationScope: err?.elevationScope || "",
        thread: compactThread(thread),
      }, {
        code: err?.code || "owner_elevation_retry_failed",
        error: err,
        thread,
        sourceMessage,
        userMessage,
        assistantMessage,
      });
    }
  }

  return Object.freeze({
    applyQueuedRetryState,
    buildOwnerElevationRetryMessage,
    buildOwnerElevationRunOptions,
    markRetryStartFailed,
    retryOwnerElevation,
  });
}

module.exports = {
  applyQueuedRetryState,
  buildOwnerElevationRetryMessage,
  buildOwnerElevationRunOptions,
  createThreadOwnerElevationRetryService,
  findAssistantMessageById,
  ownerElevationOnceTokenFromBody,
  precedingUserMessageForAssistant,
  sanitizeOwnerElevationScope,
};
