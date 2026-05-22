"use strict";

const DEFAULT_SUMMARY_MAX_CHARS = 2400;
const DEFAULT_STATE_MAX_CHARS = 1200;
const DEFAULT_REF_PREVIEW_CHARS = 260;
const DEFAULT_MAX_REFS = 40;

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, limit) {
  const text = cleanString(value);
  const max = Math.max(0, Number(limit || 0) || 0);
  if (!max || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function stableJson(value) {
  return JSON.stringify(value || {});
}

function normalizeTaskGroupId(value) {
  return cleanString(value) || "chat";
}

function messageCreatedAt(message = {}) {
  return cleanString(message.createdAt || message.created_at || message.submittedAt || message.updatedAt);
}

function safeRole(role) {
  return role === "assistant" || role === "user" ? role : "event";
}

function compactMessageRef(message = {}, options = {}) {
  const content = truncate(message.content, options.refPreviewChars || DEFAULT_REF_PREVIEW_CHARS);
  if (!content) return null;
  return {
    refId: `message:${cleanString(message.id)}`,
    refType: "message",
    targetId: cleanString(message.id),
    role: safeRole(message.role),
    createdAt: messageCreatedAt(message),
    preview: content,
  };
}

function taskGroupMessages(thread = {}, taskGroupId = "") {
  const groupId = normalizeTaskGroupId(taskGroupId);
  return (Array.isArray(thread.messages) ? thread.messages : [])
    .filter((message) => normalizeTaskGroupId(message.taskGroupId || groupId) === groupId)
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.status !== "running")
    .filter((message) => cleanString(message.content));
}

function summaryFromRefs(thread = {}, taskGroupId = "", refs = [], previous = {}, options = {}) {
  const maxSummaryChars = options.summaryMaxChars || DEFAULT_SUMMARY_MAX_CHARS;
  const userRefs = refs.filter((ref) => ref.role === "user");
  const assistantRefs = refs.filter((ref) => ref.role === "assistant");
  const firstUser = userRefs[0];
  const lastUser = userRefs[userRefs.length - 1];
  const lastAssistant = assistantRefs[assistantRefs.length - 1];
  const recentSignals = refs.slice(-6).map((ref) => ({
    refId: ref.refId,
    role: ref.role,
    preview: truncate(ref.preview, 180),
  }));
  const summary = {
    schemaVersion: 1,
    topicId: cleanString(thread.id),
    taskGroupId: normalizeTaskGroupId(taskGroupId),
    summaryVersion: Number(previous.summaryVersion || 0) + 1,
    updatedAt: options.nowIso(),
    status: "active",
    objective: truncate(previous.objective || firstUser?.preview || thread.title || "Continue the topic.", 360),
    currentState: truncate(lastAssistant?.preview || lastUser?.preview || previous.currentState || "", 420),
    latestUserSignal: truncate(lastUser?.preview || previous.latestUserSignal || "", 260),
    recentSignals,
    sourceRefs: refs.slice(-12).map((ref) => ref.refId),
  };
  const text = stableJson(summary);
  if (text.length <= maxSummaryChars) return summary;
  return Object.assign({}, summary, {
    recentSignals: recentSignals.slice(-3),
    currentState: truncate(summary.currentState, 260),
    latestUserSignal: truncate(summary.latestUserSignal, 180),
    sourceRefs: summary.sourceRefs.slice(-6),
  });
}

function workingStateFromRefs(thread = {}, taskGroupId = "", refs = [], previous = {}, options = {}) {
  const last = refs[refs.length - 1];
  const lastUser = refs.filter((ref) => ref.role === "user").at(-1);
  const state = {
    schemaVersion: 1,
    topicId: cleanString(thread.id),
    taskGroupId: normalizeTaskGroupId(taskGroupId),
    stateVersion: Number(previous.stateVersion || 0) + 1,
    updatedAt: options.nowIso(),
    status: cleanString(thread.status) === "running" ? "running" : "active",
    activeTask: truncate(thread.title || previous.activeTask || normalizeTaskGroupId(taskGroupId), 180),
    currentStep: truncate(last?.preview || previous.currentStep || "", options.stateMaxChars || DEFAULT_STATE_MAX_CHARS),
    nextStep: truncate(lastUser?.preview ? "Answer the latest user request using the retained summary and recent evidence." : previous.nextStep || "", 220),
    sourceRefs: refs.slice(-6).map((ref) => ref.refId),
  };
  return state;
}

function createTopicContextCompactionService(options = {}) {
  const store = options.store || null;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const summaryMaxChars = Math.max(600, Number(options.summaryMaxChars || DEFAULT_SUMMARY_MAX_CHARS) || DEFAULT_SUMMARY_MAX_CHARS);
  const stateMaxChars = Math.max(300, Number(options.stateMaxChars || DEFAULT_STATE_MAX_CHARS) || DEFAULT_STATE_MAX_CHARS);
  const refPreviewChars = Math.max(80, Number(options.refPreviewChars || DEFAULT_REF_PREVIEW_CHARS) || DEFAULT_REF_PREVIEW_CHARS);
  const maxRefs = Math.max(5, Number(options.maxRefs || DEFAULT_MAX_REFS) || DEFAULT_MAX_REFS);

  function readTopicContext(topicId, taskGroupId) {
    const topic = cleanString(topicId);
    const group = normalizeTaskGroupId(taskGroupId);
    if (!store || !topic) return { summary: null, workingState: null, refs: [] };
    return {
      summary: typeof store.getTopicContextSummary === "function" ? store.getTopicContextSummary(topic, group) : null,
      workingState: typeof store.getTopicWorkingState === "function" ? store.getTopicWorkingState(topic, group) : null,
      refs: typeof store.listTopicContextRefs === "function" ? store.listTopicContextRefs({ topicId: topic, taskGroupId: group, limit: maxRefs }) : [],
    };
  }

  function compactTaskGroup(thread = {}, taskGroupId = "", compactOptions = {}) {
    const topicId = cleanString(thread.id);
    const groupId = normalizeTaskGroupId(taskGroupId || compactOptions.taskGroupId);
    if (!topicId || !groupId) return { changed: false, reason: "missing_topic" };
    const messages = taskGroupMessages(thread, groupId);
    if (!messages.length) return { changed: false, reason: "no_messages" };
    const existing = readTopicContext(topicId, groupId);
    const refs = messages
      .map((message) => compactMessageRef(message, { refPreviewChars }))
      .filter(Boolean)
      .slice(-maxRefs);
    const lastMessageId = cleanString(messages[messages.length - 1]?.id);
    if (existing.summary?.lastCompactedMessageId === lastMessageId && !compactOptions.force) {
      return { changed: false, reason: "already_compacted", topicId, taskGroupId: groupId };
    }
    const common = { nowIso, summaryMaxChars, stateMaxChars };
    const summary = Object.assign(summaryFromRefs(thread, groupId, refs, existing.summary || {}, common), {
      reason: cleanString(compactOptions.reason || "run-terminal"),
      lastCompactedMessageId: lastMessageId,
      lastCompactedAt: nowIso(),
    });
    const workingState = Object.assign(workingStateFromRefs(thread, groupId, refs, existing.workingState || {}, common), {
      lastCompactedMessageId: lastMessageId,
    });
    if (store && typeof store.upsertTopicContextSummary === "function") {
      store.upsertTopicContextSummary({
        topicId,
        taskGroupId: groupId,
        workspaceId: cleanString(thread.workspaceId),
        summary,
        summaryVersion: summary.summaryVersion,
        lastCompactedMessageId: lastMessageId,
      });
    }
    if (store && typeof store.upsertTopicWorkingState === "function") {
      store.upsertTopicWorkingState({
        topicId,
        taskGroupId: groupId,
        workspaceId: cleanString(thread.workspaceId),
        state: workingState,
        stateVersion: workingState.stateVersion,
        status: workingState.status,
      });
    }
    if (store && typeof store.replaceTopicContextRefs === "function") {
      store.replaceTopicContextRefs({
        topicId,
        taskGroupId: groupId,
        workspaceId: cleanString(thread.workspaceId),
        refs,
      });
    }
    return { changed: true, topicId, taskGroupId: groupId, summary, workingState, refs };
  }

  return Object.freeze({
    compactMessageRef,
    compactTaskGroup,
    readTopicContext,
  });
}

module.exports = {
  createTopicContextCompactionService,
  compactMessageRef,
  taskGroupMessages,
};
