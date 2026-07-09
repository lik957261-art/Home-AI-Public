const TASK_GROUP_MODEL_VERSION = "20260704-vite-task-group-model-v1";

const DEFAULT_CHAT_TASK_GROUP_ID = "chat";
const DEFAULT_GROUP_CHAT_TASK_GROUP_ID = "group-chat";

function cleanString(value = "", max = 800) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 800));
}

function messageTimelineTimestampPlan(message = {}) {
  if (!message) return "";
  return cleanString(
    message.completedAt
    || message.failedAt
    || message.cancelledAt
    || message.submittedAt
    || message.updatedAt
    || message.createdAt
    || "",
    120,
  );
}

function topicGroupVisibleInTaskListPlan(group = {}) {
  const caseId = cleanString(group?.kanbanCaseId, 200);
  const caseMode = cleanString(group?.kanbanCaseMode, 80);
  return !(caseId || caseMode);
}

function selectedSharedTopicGroupPlan(input = {}) {
  if (input.viewMode !== "tasks" || !input.currentTaskGroupId || !input.currentThread?.singleWindow) return null;
  const id = cleanString(input.currentTaskGroupId, 240);
  return (Array.isArray(input.groups) ? input.groups : [])
    .find((group) => group?.id === id && group.sharedTopic) || null;
}

function currentTaskThreadIsSharedTopicThreadPlan(input = {}) {
  if (input.viewMode !== "tasks" || !input.currentThreadId || !Array.isArray(input.caseTopicThreads)) return false;
  const id = cleanString(input.currentThreadId, 240);
  return input.caseTopicThreads.some((thread) => thread?.id === id);
}

function taskListThreadCacheEligiblePlan(thread = {}) {
  if (!thread?.id || !thread.singleWindow) return false;
  const page = thread.messagesPage || {};
  const mode = cleanString(page.mode, 40).toLowerCase();
  if (mode === "tasks" && cleanString(page.taskGroupId, 240)) return false;
  return true;
}

function activeChatTaskGroupIdPlan(input = {}) {
  if (input.groupChat) return cleanString(input.groupChatTaskGroupId, 120) || DEFAULT_GROUP_CHAT_TASK_GROUP_ID;
  return cleanString(input.chatTaskGroupId, 120) || DEFAULT_CHAT_TASK_GROUP_ID;
}

function chatMessagesForThreadPlan(thread = {}, taskGroupId = DEFAULT_CHAT_TASK_GROUP_ID) {
  const groupId = cleanString(taskGroupId || DEFAULT_CHAT_TASK_GROUP_ID, 240);
  return (Array.isArray(thread?.messages) ? thread.messages : [])
    .filter((message) => cleanString(message?.taskGroupId, 240) === groupId);
}

function sortedThreadMessagesPlan(messages = []) {
  return (Array.isArray(messages) ? messages : []).slice().sort((a, b) => {
    const timeCompare = messageTimelineTimestampPlan(a).localeCompare(messageTimelineTimestampPlan(b));
    if (timeCompare) return timeCompare;
    return cleanString(a?.id, 240).localeCompare(cleanString(b?.id, 240));
  });
}

function isSyntheticTaskSummaryMessagePlan(message = {}) {
  return /:last-(user|receipt)$/.test(cleanString(message?.id, 300));
}

function taskGroupMessagesForThreadPlan(thread = {}, taskGroupId = "", fallbackMessages = []) {
  const id = cleanString(taskGroupId, 240);
  if (!id) return [];
  const realThreadMessages = (Array.isArray(thread?.messages) ? thread.messages : [])
    .filter((message) => (
      cleanString(message?.taskGroupId, 240) === id
      && !isSyntheticTaskSummaryMessagePlan(message)
    ));
  if (realThreadMessages.length) return sortedThreadMessagesPlan(realThreadMessages);
  return sortedThreadMessagesPlan((Array.isArray(fallbackMessages) ? fallbackMessages : [])
    .filter((message) => cleanString(message?.taskGroupId, 240) === id));
}

function boundedMessageLimitPlan(value, fallback = 30) {
  return Math.max(1, Number(value || fallback) || Number(fallback) || 30);
}

function taskGroupWithThreadMessagesPlan(thread = {}, group = null) {
  if (!group?.id) return group || null;
  return Object.assign({}, group, {
    messages: taskGroupMessagesForThreadPlan(thread, group.id, group.messages || []),
  });
}

function messagePageParamsPlan(input = {}) {
  const modeValue = cleanString(input.mode, 40).toLowerCase();
  const mode = modeValue === "tasks" || modeValue === "task" ? "tasks" : "chat";
  const entries = [
    ["messageMode", mode],
    ["limit", String(boundedMessageLimitPlan(input.limit, input.defaultLimit || 10))],
  ];
  if (mode === "tasks") {
    entries.push(["taskGroupId", cleanString(input.taskGroupId || input.currentTaskGroupId, 240)]);
  } else {
    entries.push(["groupChat", input.groupChat ? "1" : "0"]);
  }
  if (input.before) entries.push(["before", String(input.before)]);
  if (input.search) entries.push(["search", String(input.search)]);
  return Object.freeze(entries);
}

function messagesForPageScopePlan(input = {}) {
  const thread = input.thread || {};
  const scopedPage = input.page || thread.messagesPage || {};
  const mode = cleanString(scopedPage.mode, 40).toLowerCase();
  if (mode === "tasks" || mode === "task") {
    return taskGroupMessagesForThreadPlan(thread, scopedPage.taskGroupId || input.currentTaskGroupId || "");
  }
  if (mode === "chat") {
    return chatMessagesForThreadPlan(thread, scopedPage.taskGroupId || input.activeChatTaskGroupId || DEFAULT_CHAT_TASK_GROUP_ID);
  }
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function taskDetailPreviewThreadPlan(input = {}) {
  const thread = input.thread;
  const id = cleanString(input.taskGroupId, 240);
  if (!thread?.id || !id) return thread;
  const boundedLimit = boundedMessageLimitPlan(input.limit, input.defaultLimit || 30);
  const selectedMessages = taskGroupMessagesForThreadPlan(thread, id).slice(-boundedLimit);
  const otherMessages = (Array.isArray(thread.messages) ? thread.messages : [])
    .filter((message) => cleanString(message?.taskGroupId, 240) !== id);
  const page = thread.messagesPage || null;
  const pageMode = cleanString(page?.mode, 40).toLowerCase();
  const scopedPage = pageMode && ["tasks", "task"].includes(pageMode) && cleanString(page.taskGroupId, 240) !== id
    ? null
    : page;
  return Object.assign({}, thread, {
    messages: sortedThreadMessagesPlan(otherMessages.concat(selectedMessages)),
    messagesPage: scopedPage,
  });
}

function mergeMessagesPagePlan(input = {}) {
  const existingPage = input.existingPage || null;
  const incomingPage = input.incomingPage || null;
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const merged = Object.assign({}, existingPage || {}, incomingPage || {});
  const sameScope = !existingPage || !incomingPage
    || (
      cleanString(existingPage.mode, 40) === cleanString(incomingPage.mode, 40)
      && cleanString(existingPage.taskGroupId, 240) === cleanString(incomingPage.taskGroupId, 240)
    );
  merged.loaded = messages.length;
  merged.oldestMessageId = messages[0]?.id || "";
  merged.newestMessageId = messages[messages.length - 1]?.id || "";
  if ((sameScope && existingPage?.hasMoreBefore === false) || incomingPage?.hasMoreBefore === false) {
    merged.hasMoreBefore = false;
  }
  return merged;
}

function incomingThreadHasActiveRunPlan(thread = {}) {
  if (!thread) return false;
  if (["queued", "running"].includes(cleanString(thread.status, 40))) return true;
  if (cleanString(thread.activeRunId, 240)) return true;
  return Array.isArray(thread.activeRunIds) && thread.activeRunIds.some((id) => cleanString(id, 240));
}

function shouldPreserveMessageOutsideIncomingPagePlan(message = {}, incomingThread = null) {
  if (!["queued", "running"].includes(cleanString(message?.status, 40))) return false;
  if (!incomingThread) return true;
  return incomingThreadHasActiveRunPlan(incomingThread);
}

function localPendingSendReplacedByIncomingPlan(message = {}, incomingMessages = [], existingMessages = []) {
  if (!message?.localPendingSend || !Array.isArray(incomingMessages) || !incomingMessages.length) return false;
  const role = cleanString(message.role, 40);
  const taskGroupId = cleanString(message.taskGroupId, 240);
  const content = String(message.content || "");
  const pendingSendId = cleanString(message.localPendingSendId, 240);
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const serverMessages = [...incomingMessages, ...existing]
    .filter((item) => item && !item.localPendingSend);
  const sameTaskGroup = (incoming) => {
    const incomingTaskGroupId = cleanString(incoming?.taskGroupId, 240);
    return taskGroupId && incomingTaskGroupId && incomingTaskGroupId === taskGroupId;
  };
  if (role === "user") {
    return serverMessages.some((incoming) => (
      cleanString(incoming.role, 40) === "user"
      && String(incoming.content || "") === content
    ));
  }
  if (role === "assistant") {
    if (serverMessages.some((incoming) => cleanString(incoming.role, 40) === "assistant" && sameTaskGroup(incoming))) return true;
    const localUser = existing.find((item) => (
      item?.localPendingSend
      && cleanString(item.role, 40) === "user"
      && (
        (pendingSendId && cleanString(item.localPendingSendId, 240) === pendingSendId)
        || cleanString(item.taskGroupId, 240) === taskGroupId
      )
    ));
    const localUserContent = String(localUser?.content || "");
    if (Boolean(localUserContent) && serverMessages.some((incoming) => (
      cleanString(incoming.role, 40) === "user"
      && String(incoming.content || "") === localUserContent
    ))) return true;
    return !content && incomingMessages.some((incoming) => (
      incoming
      && !incoming.localPendingSend
      && cleanString(incoming.role, 40) === "assistant"
    ));
  }
  return serverMessages.some((incoming) => {
    if (!incoming || incoming.localPendingSend) return false;
    if (cleanString(incoming.role, 40) !== role) return false;
    return sameTaskGroup(incoming);
  });
}

function localPendingRunProgressEventsForIncomingPlan(incoming = {}, incomingMessages = [], existingMessages = []) {
  if (!incoming || incoming.localPendingSend || cleanString(incoming.role, 40) !== "assistant") return [];
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const localAssistant = existing.find((message) => (
    message?.localPendingSend
    && cleanString(message.role, 40) === "assistant"
    && Array.isArray(message.localRunProgressEvents)
    && message.localRunProgressEvents.length
    && localPendingSendReplacedByIncomingPlan(message, [incoming], existing)
  ));
  return Array.isArray(localAssistant?.localRunProgressEvents)
    ? localAssistant.localRunProgressEvents
    : [];
}

function activeChatRunIdsPlan(input = {}) {
  return chatMessagesForThreadPlan(input.thread, input.taskGroupId || DEFAULT_CHAT_TASK_GROUP_ID)
    .filter((message) => ["queued", "running"].includes(cleanString(message.status, 40)))
    .map((message) => message.runId)
    .filter(Boolean);
}

function oldestLoadedChatMessageIdPlan(input = {}) {
  return chatMessagesForThreadPlan(input.thread, input.taskGroupId || DEFAULT_CHAT_TASK_GROUP_ID)[0]?.id || "";
}

export {
  DEFAULT_CHAT_TASK_GROUP_ID,
  DEFAULT_GROUP_CHAT_TASK_GROUP_ID,
  TASK_GROUP_MODEL_VERSION,
  activeChatRunIdsPlan,
  activeChatTaskGroupIdPlan,
  boundedMessageLimitPlan,
  chatMessagesForThreadPlan,
  cleanString,
  currentTaskThreadIsSharedTopicThreadPlan,
  incomingThreadHasActiveRunPlan,
  isSyntheticTaskSummaryMessagePlan,
  localPendingRunProgressEventsForIncomingPlan,
  localPendingSendReplacedByIncomingPlan,
  mergeMessagesPagePlan,
  messagePageParamsPlan,
  messageTimelineTimestampPlan,
  messagesForPageScopePlan,
  oldestLoadedChatMessageIdPlan,
  selectedSharedTopicGroupPlan,
  shouldPreserveMessageOutsideIncomingPagePlan,
  sortedThreadMessagesPlan,
  taskDetailPreviewThreadPlan,
  taskGroupMessagesForThreadPlan,
  taskGroupWithThreadMessagesPlan,
  taskListThreadCacheEligiblePlan,
  topicGroupVisibleInTaskListPlan,
};
