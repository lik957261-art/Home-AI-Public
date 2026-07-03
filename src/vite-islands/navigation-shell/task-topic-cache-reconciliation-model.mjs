function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function numericCount(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function selectedTaskGroupIdForRead(result = {}) {
  return cleanString(
    result.selectedTaskGroupId
      || result.request?.taskGroupId
      || result.thread?.messagesPage?.taskGroupId
      || "",
    160,
  );
}

function readCacheSignature(threadId = "", taskGroupId = "") {
  const safeThreadId = cleanString(threadId, 160);
  if (!safeThreadId) return "";
  return [safeThreadId, cleanString(taskGroupId, 160) || "root"].join(":");
}

function baseReadPatch(result = {}) {
  return {
    taskTopicReadStatus: "ok",
    taskTopicReadError: "",
    taskTopicReadSource: cleanString(result.source || "thread_read_api", 120),
    taskTopicReadMockVersion: cleanString(result.mockVersion || "", 120),
    taskTopicReadTaskGroupId: selectedTaskGroupIdForRead(result),
    taskTopicReadMessageMode: cleanString(result.messageMode || result.thread?.messagesPage?.mode || "tasks", 80),
    taskTopicReadMessageCount: numericCount(result.messageCount),
    taskTopicReadLoadedMessageCount: numericCount(result.loadedMessageCount),
    taskTopicReadTotalMessageCount: numericCount(result.totalMessageCount ?? result.messageCount),
    taskTopicReadHasMoreBefore: Boolean(result.hasMoreBefore),
    taskTopicReadOldestMessageId: cleanString(result.oldestMessageId || "", 120),
    taskTopicReadNewestMessageId: cleanString(result.newestMessageId || "", 120),
  };
}

function buildTaskTopicReadSuccessPatch(result = {}, state = {}) {
  const thread = result.thread && typeof result.thread === "object" ? result.thread : null;
  const threadId = cleanString(result.threadId || thread?.id || state.taskListThreadId || "", 160);
  const taskGroupId = selectedTaskGroupIdForRead(result);
  const common = baseReadPatch(result);
  if (!thread || !threadId) {
    return Object.freeze(Object.assign(common, {
      taskTopicReadStatus: "error",
      taskTopicReadError: "thread_payload_missing",
    }));
  }
  if (taskGroupId) {
    return Object.freeze(Object.assign(common, {
      taskListThreadId: threadId,
      taskTopicSelectedThread: thread,
      taskTopicSelectedThreadId: threadId,
      taskTopicSelectedCache: {
        signature: readCacheSignature(threadId, taskGroupId),
        source: common.taskTopicReadSource,
        loadedAt: new Date().toISOString(),
      },
    }));
  }
  return Object.freeze(Object.assign(common, {
    taskListThread: thread,
    taskListThreadId: threadId,
    taskTopicSelectedThread: null,
    taskTopicSelectedThreadId: "",
    taskTopicSelectedCache: null,
    taskListRootCache: {
      signature: readCacheSignature(threadId, ""),
      source: common.taskTopicReadSource,
      loadedAt: new Date().toISOString(),
    },
  }));
}

function buildTaskTopicReadFailurePatch(result = {}) {
  return Object.freeze({
    taskTopicReadStatus: result.skipped ? "skipped" : "error",
    taskTopicReadError: cleanString(result.error || "thread_read_failed", 200),
    taskTopicReadSource: cleanString(result.source || "thread_read_api", 120),
    taskTopicReadTaskGroupId: selectedTaskGroupIdForRead(result),
  });
}

function buildTaskTopicReadStatePatch(result = {}, state = {}) {
  if (result.ok && result.thread) {
    return buildTaskTopicReadSuccessPatch(result, state);
  }
  return buildTaskTopicReadFailurePatch(result);
}

export {
  baseReadPatch,
  buildTaskTopicReadFailurePatch,
  buildTaskTopicReadStatePatch,
  buildTaskTopicReadSuccessPatch,
  cleanString,
  numericCount,
  readCacheSignature,
  selectedTaskGroupIdForRead,
};
