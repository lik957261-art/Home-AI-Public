function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function validThread(thread = null) {
  return Boolean(thread && typeof thread === "object" && cleanString(thread.id, 160));
}

function countThreadTopics(thread = {}) {
  return [
    Array.isArray(thread.taskGroups) ? thread.taskGroups.length : 0,
    Array.isArray(thread.sharedTopicGroups) ? thread.sharedTopicGroups.length : 0,
    Array.isArray(thread.pluginTopicGroups) ? thread.pluginTopicGroups.length : 0,
    Array.isArray(thread.directoryTopicCollections) ? thread.directoryTopicCollections.length : 0,
  ].reduce((total, count) => total + count, 0);
}

function taskListThreadCacheEligible(thread = null) {
  if (!validThread(thread)) return false;
  if (thread.singleWindow === false) return false;
  const page = thread.messagesPage || {};
  const mode = cleanString(page.mode, 40).toLowerCase();
  const taskGroupId = cleanString(page.taskGroupId, 160);
  return !(mode === "tasks" && taskGroupId);
}

function threadSourceCandidates(state = {}, options = {}) {
  return [
    ["options.currentThread", options.currentThread],
    ["state.taskListThread", state.taskListThread],
    ["state.taskListRootCache.thread", state.taskListRootCache?.thread],
    ["state.cachedTaskListRoot.thread", state.cachedTaskListRoot?.thread],
    ["state.currentThread", state.currentThread],
  ];
}

function selectTaskTopicRootThread(state = {}, options = {}) {
  for (const [source, thread] of threadSourceCandidates(state, options)) {
    if (!validThread(thread)) continue;
    if (source.includes("taskListThread") && !taskListThreadCacheEligible(thread)) continue;
    return Object.freeze({
      source,
      thread,
      threadId: cleanString(thread.id, 160),
      usedTaskListThreadCache: source === "state.taskListThread",
      topicCount: countThreadTopics(thread),
    });
  }
  return Object.freeze({
    source: "none",
    thread: Object.freeze({}),
    threadId: cleanString(state.currentThreadId || state.taskListThreadId || "", 160),
    usedTaskListThreadCache: false,
    topicCount: 0,
  });
}

function cacheSignatureForThread(thread = null) {
  if (!validThread(thread)) return "";
  return [
    cleanString(thread.id, 160),
    String(countThreadTopics(thread)),
    cleanString(thread.updatedAt || thread.lastMessageAt || "", 80),
  ].join(":");
}

function buildTaskTopicCompatibilityState(state = {}, options = {}) {
  const selection = selectTaskTopicRootThread(state, options);
  const selectedThread = selection.thread;
  const derivedTaskListRootCache = state.taskListRootCache
    || state.cachedTaskListRoot
    || (validThread(selectedThread) ? { signature: cacheSignatureForThread(selectedThread) } : null);
  return Object.freeze({
    state: Object.freeze(Object.assign({}, state, {
      currentThread: selectedThread,
      currentThreadId: selection.threadId || state.currentThreadId || "",
      taskListRootCache: derivedTaskListRootCache,
    })),
    selectedThread,
    source: selection.source,
    threadId: selection.threadId,
    usedTaskListThreadCache: selection.usedTaskListThreadCache,
    topicCount: selection.topicCount,
    cacheSignature: derivedTaskListRootCache?.signature || "",
  });
}

export {
  buildTaskTopicCompatibilityState,
  cacheSignatureForThread,
  cleanString,
  countThreadTopics,
  selectTaskTopicRootThread,
  taskListThreadCacheEligible,
  validThread,
};
