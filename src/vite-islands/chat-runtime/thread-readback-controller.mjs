import {
  initialChatRuntimeState,
} from "./model.mjs";

const CHAT_THREAD_READBACK_CONTROLLER_VERSION = "20260703-vite-chat-thread-readback-controller-v1";
const DEFAULT_THREAD_READBACK_TIMEOUT_MS = 30000;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function encodePathSegment(value) {
  return encodeURIComponent(cleanString(value, 240));
}

function appendQuery(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

function buildThreadReadbackRequest(input = {}) {
  const threadId = cleanString(input.threadId || input.thread?.id || "", 240);
  if (!threadId) {
    return Object.freeze({ ok: false, code: "thread_id_missing", method: "GET", path: "", timeoutMs: DEFAULT_THREAD_READBACK_TIMEOUT_MS });
  }
  const query = {};
  if (input.messageLimit !== undefined) query.messageLimit = Math.max(1, Math.min(200, Number(input.messageLimit) || 30));
  if (input.messageMode) query.messageMode = cleanString(input.messageMode, 80);
  if (input.taskGroupId) query.taskGroupId = cleanString(input.taskGroupId, 180);
  return Object.freeze({
    ok: true,
    code: "",
    method: "GET",
    path: appendQuery(`/api/threads/${encodePathSegment(threadId)}`, query),
    timeoutMs: Number(input.timeoutMs || DEFAULT_THREAD_READBACK_TIMEOUT_MS),
  });
}

function normalizeThreadReadbackResult(result = {}) {
  const thread = isObject(result.thread) ? result.thread : isObject(result.data?.thread) ? result.data.thread : null;
  if (!thread || !cleanString(thread.id, 240)) {
    return Object.freeze({
      ok: false,
      code: "thread_readback_missing_thread",
      thread: null,
      source: cleanString(result.source || result.data?.source || "", 120),
    });
  }
  return Object.freeze({
    ok: true,
    code: "",
    thread,
    source: cleanString(result.source || result.data?.source || "", 120),
  });
}

function statusPayload(input = {}) {
  return Object.freeze({
    status: cleanString(input.status || "idle", 80),
    message: cleanString(input.message || "", 400),
    source: cleanString(input.source || "", 120),
    threadId: cleanString(input.threadId || "", 180),
    messageCount: Number(input.messageCount || 0) || 0,
    error: cleanString(input.error || "", 240),
  });
}

function applyThreadReadbackState(state = {}, readback = {}, options = {}) {
  const current = initialChatRuntimeState(state);
  const normalized = normalizeThreadReadbackResult(readback);
  if (!normalized.ok) {
    return initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: "thread.readback_failed",
      diagnostics: current.diagnostics.concat({
        code: normalized.code,
        source: normalized.source || cleanString(options.source || "", 120),
      }),
    }));
  }
  const nextThread = Object.assign({}, normalized.thread, {
    id: current.thread.id,
  });
  const patch = Object.freeze({
    type: "thread_readback",
    source: normalized.source || cleanString(options.source || "", 120),
    messageCount: Array.isArray(nextThread.messages) ? nextThread.messages.length : 0,
  });
  return initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: "thread.readback",
    thread: nextThread,
    renderPatches: current.renderPatches.concat(patch),
    refreshRequests: Object.freeze([]),
  }));
}

function createChatThreadReadbackController(options = {}) {
  const source = cleanString(options.source || "vite_chat_thread_readback", 120);
  const getState = typeof options.getState === "function" ? options.getState : () => ({});
  const setState = typeof options.setState === "function" ? options.setState : () => {};
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : (status) => status;

  function report(input = {}) {
    return onStatus(statusPayload(Object.assign({ source }, input)));
  }

  async function readLatest(input = {}) {
    const state = initialChatRuntimeState(input.state || getState());
    const request = buildThreadReadbackRequest({
      threadId: input.threadId || state.thread.id,
      messageLimit: input.messageLimit || options.messageLimit || 30,
      messageMode: input.messageMode,
      taskGroupId: input.taskGroupId,
      timeoutMs: input.timeoutMs || options.timeoutMs,
    });
    if (!request.ok) {
      const status = report({
        status: "blocked",
        message: "Thread readback unavailable",
        error: request.code || "thread_readback_request_invalid",
      });
      return Object.freeze({ ok: false, status, request, state, result: null });
    }
    report({
      status: "reading",
      message: "Reading latest thread state",
      threadId: state.thread.id,
    });
    try {
      if (typeof options.api !== "function") throw new Error("thread_readback_requires_runtime_api");
      const result = await options.api(request.path, {
        method: request.method,
        timeoutMs: request.timeoutMs,
      });
      const normalized = normalizeThreadReadbackResult(result);
      if (!normalized.ok) {
        const error = new Error(normalized.code);
        error.code = normalized.code;
        throw error;
      }
      const nextState = applyThreadReadbackState(state, result, { source });
      setState(nextState, {
        action: "thread_readback_result",
        eventType: "thread.readback",
        patch: {
          type: "thread_readback",
          source: normalized.source || source,
          messageCount: Array.isArray(normalized.thread.messages) ? normalized.thread.messages.length : 0,
        },
      });
      const status = report({
        status: "read",
        message: "Thread readback returned",
        source: normalized.source || source,
        threadId: normalized.thread.id,
        messageCount: Array.isArray(normalized.thread.messages) ? normalized.thread.messages.length : 0,
      });
      return Object.freeze({ ok: true, status, request, state: nextState, result });
    } catch (error) {
      const failedState = applyThreadReadbackState(state, {
        source,
        error: error?.code || error?.message || "thread_readback_failed",
      }, { source });
      setState(failedState, {
        action: "thread_readback_error",
        eventType: "thread.readback_failed",
        patch: {
          type: "thread_readback_error",
          code: error?.code || error?.message || "thread_readback_failed",
        },
      });
      const status = report({
        status: "error",
        message: "Thread readback failed",
        threadId: state.thread.id,
        error: error?.code || error?.message || "thread_readback_failed",
      });
      return Object.freeze({ ok: false, status, request, state: failedState, result: null, error });
    }
  }

  return Object.freeze({
    version: CHAT_THREAD_READBACK_CONTROLLER_VERSION,
    readLatest,
  });
}

export {
  CHAT_THREAD_READBACK_CONTROLLER_VERSION,
  DEFAULT_THREAD_READBACK_TIMEOUT_MS,
  applyThreadReadbackState,
  buildThreadReadbackRequest,
  createChatThreadReadbackController,
  normalizeThreadReadbackResult,
};
