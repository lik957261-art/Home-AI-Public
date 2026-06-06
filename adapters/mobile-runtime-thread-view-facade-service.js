"use strict";

const { createThreadViewService: defaultCreateThreadViewService } = require("./thread-view-service");

function requiredFactory(options, name, fallback = null) {
  const value = options[name] || fallback;
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeThreadViewFacadeService requires ${name}`);
}

function defaultCompactText(value, maxChars) {
  const text = String(value || "");
  if (!maxChars || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}

function createMobileRuntimeThreadViewFacadeService(options = {}) {
  const createThreadViewService = requiredFactory(options, "createThreadViewService", defaultCreateThreadViewService);
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const maxEventPreviewChars = Math.max(0, Number(options.maxEventPreviewChars || 240) || 240);
  const maxStoredEventsPerThread = Math.max(1, Number(options.maxStoredEventsPerThread || 80) || 80);
  let threadViewService = null;

  function getThreadViewService() {
    if (!threadViewService) {
      threadViewService = createThreadViewService({
        compactArtifactsForMessage: options.compactArtifactsForMessage,
        compactText,
        comparablePath: options.comparablePath,
        findThreadForMessage: options.findThreadForMessage,
        isSingleWindowConversationTaskGroupId: options.isSingleWindowConversationTaskGroupId,
        maxApiTextChars: options.maxApiTextChars,
        maxStoredEventsPerThread,
        normalizeTaskGroupMeta: options.normalizeTaskGroupMeta,
        projectSearchLabels: options.projectSearchLabels,
        publicChatGroup: options.publicChatGroup,
        publicExternalIngress: options.publicExternalIngress,
        publicWeixinOutboundDelivery: options.publicWeixinOutboundDelivery,
        sanitizeTaskTitle: options.sanitizeTaskTitle,
        searchableText: options.searchableText,
        singleWindowChatTaskGroupId: options.singleWindowChatTaskGroupId,
        singleWindowGroupChatTaskGroupId: options.singleWindowGroupChatTaskGroupId,
        singleWindowProjectId: options.singleWindowProjectId,
        state: options.state,
        threadMessageInitialLimit: options.threadMessageInitialLimit,
        threadMessageSearchLimit: options.threadMessageSearchLimit,
      });
    }
    return threadViewService;
  }

  function callThreadView(methodName, args) {
    return getThreadViewService()[methodName](...args);
  }

  function compactEventPreview(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value || "");
    }
  }

  function addThreadEvent(thread, event) {
    thread.events = thread.events || [];
    thread.events.push({
      event: String(event.event || event.type || "event"),
      timestamp: event.timestamp || Date.now() / 1000,
      runId: event.runId || event.run_id || null,
      tool: event.tool || null,
      preview: compactText(compactEventPreview(event.preview || event.text || event.error || ""), maxEventPreviewChars),
      duration: event.duration || null,
      error: Boolean(event.error),
    });
    if (thread.events.length > maxStoredEventsPerThread) {
      thread.events = thread.events.slice(-maxStoredEventsPerThread);
    }
  }

  return Object.freeze({
    getThreadViewService,
    compactEventPreview,
    addThreadEvent,
    threadSummary: (...args) => callThreadView("threadSummary", args),
    taskGroupsForThread: (...args) => callThreadView("taskGroupsForThread", args),
    messageOwnerWorkspaceId: (...args) => callThreadView("messageOwnerWorkspaceId", args),
    taskGroupOwnerWorkspaceId: (...args) => callThreadView("taskGroupOwnerWorkspaceId", args),
    taskGroupTaskId: (...args) => callThreadView("taskGroupTaskId", args),
    taskGroupPrompt: (...args) => callThreadView("taskGroupPrompt", args),
    taskGroupTitle: (...args) => callThreadView("taskGroupTitle", args),
    taskGroupPreview: (...args) => callThreadView("taskGroupPreview", args),
    taskGroupStatus: (...args) => callThreadView("taskGroupStatus", args),
    taskGroupHaystack: (...args) => callThreadView("taskGroupHaystack", args),
    textIncludesPath: (...args) => callThreadView("textIncludesPath", args),
    taskGroupMatchesProject: (...args) => callThreadView("taskGroupMatchesProject", args),
    singleWindowProjectTaskSummaries: (...args) => callThreadView("singleWindowProjectTaskSummaries", args),
    messagesForThreadMode: (...args) => callThreadView("messagesForThreadMode", args),
    messagePageTaskGroupId: (...args) => callThreadView("messagePageTaskGroupId", args),
    threadMessagesPage: (...args) => callThreadView("threadMessagesPage", args),
    searchThreadMessages: (...args) => callThreadView("searchThreadMessages", args),
    compactThread: (...args) => callThreadView("compactThread", args),
    compactThreadWithMessagePage: (...args) => callThreadView("compactThreadWithMessagePage", args),
    compactMessage: (...args) => callThreadView("compactMessage", args),
  });
}

module.exports = {
  createMobileRuntimeThreadViewFacadeService,
};
