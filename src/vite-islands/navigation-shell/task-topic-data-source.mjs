import { sanitizeRouteValue } from "./task-topic-action-model.mjs";

const TASK_TOPIC_DATA_SOURCE_VERSION = "20260702-vite-task-topic-data-source-v1";
const DEFAULT_TASK_ROOT_MESSAGE_LIMIT = 30;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function positiveInt(value, fallback = DEFAULT_TASK_ROOT_MESSAGE_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 100);
  return fallback;
}

function taskTopicRootThreadId(state = {}, options = {}) {
  return sanitizeRouteValue(
    options.threadId
      || state.taskListThreadId
      || state.threadId
      || state.currentThreadId
      || state.currentThread?.id
      || "",
    160,
  );
}

function taskTopicReadRequest(state = {}, options = {}) {
  const threadId = taskTopicRootThreadId(state, options);
  if (!threadId) {
    return Object.freeze({
      ok: false,
      skipReason: "missing_thread_id",
      path: "",
      threadId: "",
    });
  }
  const params = new URLSearchParams();
  params.set("messageMode", "tasks");
  params.set("messageLimit", String(positiveInt(options.messageLimit || DEFAULT_TASK_ROOT_MESSAGE_LIMIT)));
  const taskGroupId = sanitizeRouteValue(options.taskGroupId || state.currentTaskGroupId || state.taskGroupId || "", 160);
  if (taskGroupId) params.set("taskGroupId", taskGroupId);
  return Object.freeze({
    ok: true,
    skipReason: "",
    method: "GET",
    threadId,
    taskGroupId,
    path: `/api/threads/${encodeURIComponent(threadId)}?${params.toString()}`,
    source: "thread_read_api",
  });
}

function nonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

function threadReadMessageCount(thread = {}) {
  if (Array.isArray(thread.messages)) return thread.messages.length;
  if (Array.isArray(thread.items)) return thread.items.length;
  if (Array.isArray(thread.messagesPage?.items)) return thread.messagesPage.items.length;
  if (Array.isArray(thread.messagesPage?.messages)) return thread.messagesPage.messages.length;
  return nonNegativeInt(thread.messagesPage?.total, 0);
}

function threadReadLoadedMessageCount(thread = {}) {
  const page = thread.messagesPage && typeof thread.messagesPage === "object" ? thread.messagesPage : {};
  if (Number.isFinite(Number(page.loaded))) return nonNegativeInt(page.loaded, 0);
  if (Array.isArray(page.items)) return page.items.length;
  if (Array.isArray(page.messages)) return page.messages.length;
  if (Array.isArray(thread.messages)) return thread.messages.length;
  if (Array.isArray(thread.items)) return thread.items.length;
  return 0;
}

function threadReadTotalMessageCount(thread = {}) {
  const page = thread.messagesPage && typeof thread.messagesPage === "object" ? thread.messagesPage : {};
  if (Number.isFinite(Number(page.total))) return nonNegativeInt(page.total, 0);
  return threadReadLoadedMessageCount(thread);
}

function normalizeThreadReadPayload(payload = {}, request = {}) {
  const thread = payload?.thread && typeof payload.thread === "object" ? payload.thread : null;
  const threadId = sanitizeRouteValue(thread?.id || "", 160);
  if (!thread || !threadId) {
    return Object.freeze({
      ok: false,
      error: "thread_payload_missing",
      thread: null,
      threadId: "",
      source: cleanString(payload?.source || "", 120),
      mockVersion: cleanString(payload?.mockVersion || "", 120),
    });
  }
  return Object.freeze({
    ok: true,
    error: "",
    thread,
    threadId,
    selectedTaskGroupId: sanitizeRouteValue(thread.messagesPage?.taskGroupId || request.taskGroupId || "", 160),
    messageMode: cleanString(thread.messagesPage?.mode || "tasks", 80),
    messageCount: threadReadTotalMessageCount(thread),
    loadedMessageCount: threadReadLoadedMessageCount(thread),
    totalMessageCount: threadReadTotalMessageCount(thread),
    hasMoreBefore: Boolean(thread.messagesPage?.hasMoreBefore),
    oldestMessageId: cleanString(thread.messagesPage?.oldestMessageId || "", 120),
    newestMessageId: cleanString(thread.messagesPage?.newestMessageId || "", 120),
    source: cleanString(payload?.source || "thread_read_api", 120),
    mockVersion: cleanString(payload?.mockVersion || "", 120),
  });
}

async function loadTaskTopicRootThread(options = {}) {
  const api = options.api;
  const request = taskTopicReadRequest(options.state || {}, options);
  if (!request.ok) {
    return Object.freeze({
      ok: false,
      skipped: true,
      request,
      error: request.skipReason,
      thread: null,
    });
  }
  if (typeof api !== "function") {
    return Object.freeze({
      ok: false,
      skipped: true,
      request,
      error: "api_unavailable",
      thread: null,
    });
  }
  try {
    const payload = await api(request.path, { method: request.method });
    const normalized = normalizeThreadReadPayload(payload, request);
    return Object.freeze(Object.assign({}, normalized, {
      request,
      skipped: false,
    }));
  } catch (error) {
    return Object.freeze({
      ok: false,
      skipped: false,
      request,
      error: cleanString(error?.code || error?.message || "thread_read_failed", 200),
      status: error?.status || 0,
      thread: null,
      source: "thread_read_api",
    });
  }
}

export {
  DEFAULT_TASK_ROOT_MESSAGE_LIMIT,
  TASK_TOPIC_DATA_SOURCE_VERSION,
  cleanString,
  loadTaskTopicRootThread,
  nonNegativeInt,
  normalizeThreadReadPayload,
  positiveInt,
  taskTopicReadRequest,
  taskTopicRootThreadId,
  threadReadLoadedMessageCount,
  threadReadMessageCount,
  threadReadTotalMessageCount,
};
