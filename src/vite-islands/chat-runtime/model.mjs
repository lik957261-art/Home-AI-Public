const CHAT_RUNTIME_MODEL_VERSION = "20260702-vite-chat-runtime-model-v1";
const STREAMING_MESSAGE_LIVE_BUFFER_CHARS = 16000;
const STREAMING_MESSAGE_TAIL_RATIO = 0.75;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeMessages(messages) {
  return Array.isArray(messages) ? messages.filter(isObject) : [];
}

function messageTerminalStatus(message = {}) {
  return ["done", "failed", "cancelled"].includes(cleanString(message.status, 80));
}

function messageActiveStatus(message = {}) {
  return ["queued", "running"].includes(cleanString(message.status, 80));
}

function appendStreamingMessageBounded(current = "", delta = "", options = {}) {
  const maxChars = Math.max(1000, Number(options.maxChars || STREAMING_MESSAGE_LIVE_BUFFER_CHARS) || STREAMING_MESSAGE_LIVE_BUFFER_CHARS);
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  const tailChars = Math.floor(maxChars * STREAMING_MESSAGE_TAIL_RATIO);
  const tail = next.slice(-tailChars);
  return `[live content truncated: ${next.length} chars total]\n\n${tail}`;
}

function messageSortKey(message = {}) {
  return cleanString(message.createdAt || message.created_at || message.updatedAt || message.updated_at || "", 80);
}

function sortedMessages(messages = []) {
  return normalizeMessages(messages).slice().sort((a, b) => {
    const left = messageSortKey(a);
    const right = messageSortKey(b);
    if (left || right) return left.localeCompare(right);
    return cleanString(a.id, 180).localeCompare(cleanString(b.id, 180));
  });
}

function mergeMessage(existing = {}, incoming = {}) {
  return Object.assign({}, isObject(existing) ? existing : {}, isObject(incoming) ? incoming : {});
}

function upsertMessage(messages = [], incoming = {}) {
  const id = cleanString(incoming.id || incoming.messageId, 180);
  if (!id) return { messages: sortedMessages(messages), index: -1, inserted: false, message: null };
  const nextMessages = normalizeMessages(messages).slice();
  const index = nextMessages.findIndex((message) => cleanString(message.id, 180) === id);
  if (index >= 0) {
    nextMessages[index] = mergeMessage(nextMessages[index], incoming);
  } else {
    nextMessages.push(Object.assign({}, incoming, { id }));
  }
  const sorted = sortedMessages(nextMessages);
  return {
    messages: sorted,
    index,
    inserted: index < 0,
    message: sorted.find((message) => cleanString(message.id, 180) === id) || null,
  };
}

function initialChatRuntimeState(input = {}) {
  const thread = isObject(input.thread) ? input.thread : {};
  return Object.freeze({
    modelVersion: CHAT_RUNTIME_MODEL_VERSION,
    thread: Object.freeze(Object.assign({}, thread, {
      id: cleanString(thread.id || input.threadId || "thread_vite_chat_runtime_preview", 180),
      messages: Object.freeze(sortedMessages(thread.messages || [])),
      activeRunId: cleanString(thread.activeRunId || "", 180),
      activeRunIds: Object.freeze(Array.isArray(thread.activeRunIds) ? thread.activeRunIds.map((id) => cleanString(id, 180)).filter(Boolean) : []),
      status: cleanString(thread.status || "", 80),
      updatedAt: cleanString(thread.updatedAt || "", 80),
    })),
    appliedEventCount: Number(input.appliedEventCount || 0) || 0,
    latestEventType: cleanString(input.latestEventType || "", 120),
    renderPatches: Object.freeze(Array.isArray(input.renderPatches) ? input.renderPatches.slice() : []),
    refreshRequests: Object.freeze(Array.isArray(input.refreshRequests) ? input.refreshRequests.slice() : []),
    runEvents: Object.freeze(Array.isArray(input.runEvents) ? input.runEvents.slice() : []),
    diagnostics: Object.freeze(Array.isArray(input.diagnostics) ? input.diagnostics.slice() : []),
  });
}

function activeRunIdsFromThread(thread = {}) {
  const ids = Array.isArray(thread.activeRunIds) ? thread.activeRunIds : [];
  const activeRunId = cleanString(thread.activeRunId, 180);
  return ids.map((id) => cleanString(id, 180)).filter(Boolean).concat(activeRunId ? [activeRunId] : []);
}

function threadHasActiveRun(thread = {}) {
  return activeRunIdsFromThread(thread).length > 0 || ["queued", "running"].includes(cleanString(thread.status, 80));
}

function threadHasActiveMessages(thread = {}) {
  return normalizeMessages(thread.messages).some(messageActiveStatus);
}

function refreshRequestForTerminal(message = {}, options = {}) {
  if (!messageTerminalStatus(message)) return null;
  const userScrollProtected = Boolean(options.userScrollProtected);
  return Object.freeze({
    reason: "terminal_receipt",
    messageId: cleanString(message.id || message.messageId, 180),
    runId: cleanString(message.runId || message.run_id || "", 180),
    stickToBottom: !userScrollProtected,
    delayMs: Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 0,
    protectedByUserScroll: userScrollProtected,
  });
}

function appendPatch(patches = [], patch = {}) {
  return patches.concat(Object.freeze(Object.assign({}, patch)));
}

function applyMessageDelta(state, payload, options = {}) {
  const current = initialChatRuntimeState(state);
  const threadId = cleanString(payload.threadId || payload.thread_id, 180);
  const messageId = cleanString(payload.messageId || payload.message_id, 180);
  if (!threadId || threadId !== current.thread.id || !messageId) {
    return initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: "message.delta",
      appliedEventCount: current.appliedEventCount + 1,
      diagnostics: current.diagnostics.concat({ code: "delta_ignored_scope_mismatch", threadId, messageId }),
    }));
  }
  const messages = normalizeMessages(current.thread.messages);
  const existing = messages.find((message) => cleanString(message.id, 180) === messageId);
  if (!existing) {
    return initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: "message.delta",
      appliedEventCount: current.appliedEventCount + 1,
      diagnostics: current.diagnostics.concat({ code: "delta_ignored_missing_message", threadId, messageId }),
    }));
  }
  const updatedAt = cleanString(payload.updatedAt || payload.updated_at || options.nowIso || new Date(0).toISOString(), 80);
  const nextMessage = Object.assign({}, existing, {
    content: appendStreamingMessageBounded(existing.content || "", payload.delta || "", options),
    firstFeedbackAt: existing.firstFeedbackAt || cleanString(payload.firstFeedbackAt || payload.first_feedback_at || updatedAt, 80),
    updatedAt,
  });
  const upsert = upsertMessage(messages, nextMessage);
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: "message.delta",
    appliedEventCount: current.appliedEventCount + 1,
    thread: Object.assign({}, current.thread, {
      messages: upsert.messages,
      updatedAt: updatedAt || current.thread.updatedAt,
    }),
    renderPatches: appendPatch(current.renderPatches, {
      type: "streaming_patch",
      messageId,
      contentLength: String(nextMessage.content || "").length,
      render: "patch_visible_assistant",
    }),
  }));
}

function applyMessageUpsert(state, payload, options = {}) {
  const current = initialChatRuntimeState(state);
  const threadId = cleanString(payload.threadId || payload.thread_id || payload.thread?.id, 180);
  if (threadId && threadId !== current.thread.id) {
    return initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: cleanString(payload.type || "message", 120),
      appliedEventCount: current.appliedEventCount + 1,
      diagnostics: current.diagnostics.concat({ code: "message_ignored_scope_mismatch", threadId }),
    }));
  }
  const incoming = isObject(payload.message) ? payload.message : payload;
  const upsert = upsertMessage(current.thread.messages, incoming);
  const mergedThread = Object.assign({}, current.thread, isObject(payload.thread) ? payload.thread : {}, {
    id: current.thread.id,
    messages: upsert.messages,
    updatedAt: cleanString(payload.thread?.updatedAt || incoming.updatedAt || current.thread.updatedAt, 80),
    activeRunId: cleanString(payload.thread?.activeRunId ?? current.thread.activeRunId, 180),
    activeRunIds: Array.isArray(payload.thread?.activeRunIds) ? payload.thread.activeRunIds : current.thread.activeRunIds,
    status: cleanString(payload.thread?.status ?? current.thread.status, 80),
  });
  const projection = incoming.role === "assistant" && upsert.index >= 0 ? "patched" : "scheduled";
  const refresh = refreshRequestForTerminal(incoming, options);
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: cleanString(payload.type || "message", 120),
    appliedEventCount: current.appliedEventCount + 1,
    thread: mergedThread,
    renderPatches: appendPatch(current.renderPatches, {
      type: "message_upsert",
      messageId: cleanString(incoming.id || incoming.messageId, 180),
      projection,
      terminal: messageTerminalStatus(incoming),
      inserted: upsert.inserted,
    }),
    refreshRequests: refresh ? current.refreshRequests.concat(refresh) : current.refreshRequests,
  }));
}

function applyThreadUpdated(state, payload, options = {}) {
  const current = initialChatRuntimeState(state);
  const incomingThread = isObject(payload.thread) ? payload.thread : {};
  const threadId = cleanString(incomingThread.id || payload.threadId || payload.thread_id, 180);
  if (threadId && threadId !== current.thread.id) {
    return initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: "thread.updated",
      appliedEventCount: current.appliedEventCount + 1,
      diagnostics: current.diagnostics.concat({ code: "thread_update_ignored_scope_mismatch", threadId }),
    }));
  }
  const wasRunning = threadHasActiveRun(current.thread) || threadHasActiveMessages(current.thread);
  const nextThread = Object.assign({}, current.thread, incomingThread, {
    id: current.thread.id,
    messages: current.thread.messages,
    activeRunId: cleanString(incomingThread.activeRunId ?? current.thread.activeRunId, 180),
    activeRunIds: Array.isArray(incomingThread.activeRunIds) ? incomingThread.activeRunIds : current.thread.activeRunIds,
    status: cleanString(incomingThread.status ?? current.thread.status, 80),
    updatedAt: cleanString(incomingThread.updatedAt || current.thread.updatedAt, 80),
  });
  const nowRunning = threadHasActiveRun(nextThread);
  const terminalSummaryRefresh = wasRunning && !nowRunning;
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: "thread.updated",
    appliedEventCount: current.appliedEventCount + 1,
    thread: nextThread,
    renderPatches: appendPatch(current.renderPatches, {
      type: "thread_summary",
      terminalSummaryRefresh,
      activeRunIds: activeRunIdsFromThread(nextThread),
    }),
    refreshRequests: terminalSummaryRefresh
      ? current.refreshRequests.concat(Object.freeze({
        reason: "terminal_summary",
        messageId: "",
        runId: cleanString(current.thread.activeRunId || "", 180),
        stickToBottom: !Boolean(options.userScrollProtected),
        delayMs: 180,
        protectedByUserScroll: Boolean(options.userScrollProtected),
      }))
      : current.refreshRequests,
  }));
}

function applyRunEvent(state, payload) {
  const current = initialChatRuntimeState(state);
  const event = Object.freeze({
    type: cleanString(payload.event || payload.type || "run.event", 120),
    runId: cleanString(payload.runId || payload.run_id || payload.id, 180),
    status: cleanString(payload.status || "", 80),
    summary: cleanString(payload.summary || payload.message || "", 240),
  });
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: "run.event",
    appliedEventCount: current.appliedEventCount + 1,
    runEvents: current.runEvents.concat(event).slice(-20),
    renderPatches: appendPatch(current.renderPatches, {
      type: "run_event",
      runId: event.runId,
      status: event.status,
    }),
  }));
}

function applyChatRuntimeEvent(state, payload = {}, options = {}) {
  const eventType = cleanString(payload.type || payload.event || "", 120);
  if (eventType === "message.delta") return applyMessageDelta(state, payload, options);
  if (eventType === "thread.updated") return applyThreadUpdated(state, payload, options);
  if (eventType === "run.event") return applyRunEvent(state, payload, options);
  if (isObject(payload.message) || payload.role || payload.id) return applyMessageUpsert(state, payload, options);
  const current = initialChatRuntimeState(state);
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: eventType || "unknown",
    appliedEventCount: current.appliedEventCount + 1,
    diagnostics: current.diagnostics.concat({ code: "unsupported_event", eventType: eventType || "unknown" }),
  }));
}

function buildChatRuntimeViewModel(state = {}) {
  const current = initialChatRuntimeState(state);
  const messages = normalizeMessages(current.thread.messages);
  const assistant = messages.filter((message) => message.role === "assistant");
  const activeMessages = messages.filter(messageActiveStatus);
  const terminalMessages = messages.filter(messageTerminalStatus);
  const latestMessage = messages[messages.length - 1] || null;
  return Object.freeze({
    modelVersion: CHAT_RUNTIME_MODEL_VERSION,
    threadId: current.thread.id,
    latestEventType: current.latestEventType,
    appliedEventCount: current.appliedEventCount,
    messageCount: messages.length,
    assistantCount: assistant.length,
    activeMessageCount: activeMessages.length,
    terminalMessageCount: terminalMessages.length,
    refreshRequestCount: current.refreshRequests.length,
    latestRefreshReason: current.refreshRequests[current.refreshRequests.length - 1]?.reason || "",
    latestPatchType: current.renderPatches[current.renderPatches.length - 1]?.type || "",
    latestMessagePreview: cleanString(latestMessage?.content || "", 160),
    diagnostics: Object.freeze(current.diagnostics.slice(-5)),
    messages: Object.freeze(messages.map((message) => Object.freeze({
      id: cleanString(message.id, 180),
      role: cleanString(message.role || "assistant", 40),
      status: cleanString(message.status || "", 80),
      runId: cleanString(message.runId || message.run_id || "", 180),
      contentPreview: cleanString(message.content || "", 180),
      contentLength: String(message.content || "").length,
      terminal: messageTerminalStatus(message),
      active: messageActiveStatus(message),
      updatedAt: cleanString(message.updatedAt || message.updated_at || "", 80),
    }))),
    refreshRequests: Object.freeze(current.refreshRequests.slice(-5)),
    renderPatches: Object.freeze(current.renderPatches.slice(-5)),
    runEvents: Object.freeze(current.runEvents.slice(-5)),
  });
}

export {
  CHAT_RUNTIME_MODEL_VERSION,
  STREAMING_MESSAGE_LIVE_BUFFER_CHARS,
  appendStreamingMessageBounded,
  applyChatRuntimeEvent,
  applyMessageDelta,
  applyMessageUpsert,
  applyRunEvent,
  applyThreadUpdated,
  buildChatRuntimeViewModel,
  initialChatRuntimeState,
  messageActiveStatus,
  messageTerminalStatus,
  sortedMessages,
  upsertMessage,
};
