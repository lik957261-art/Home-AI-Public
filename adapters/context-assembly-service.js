"use strict";

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTaskGroupId(value) {
  return cleanString(value) || "chat";
}

function textIncludesHistoricalLookup(text) {
  return /\b(previous|earlier|history|context|source|evidence|remember)\b|之前|上次|历史|依据|来源|证据|记得/.test(String(text || ""));
}

function textLooksToolDense(text) {
  return /tool|function|http_request|x_search|web_search|api|json|stack trace|traceback|日志|工具|函数|接口|报错|错误/.test(String(text || "").toLowerCase());
}

function syntheticMessage(content) {
  return content ? { role: "assistant", content } : null;
}

function formatSummary(summary = {}) {
  if (!summary || typeof summary !== "object") return "";
  const lines = [
    "[Hermes topic summary]",
    summary.objective ? `Objective: ${summary.objective}` : "",
    summary.currentState ? `Current state: ${summary.currentState}` : "",
    summary.latestUserSignal ? `Latest user signal: ${summary.latestUserSignal}` : "",
    Array.isArray(summary.recentSignals) && summary.recentSignals.length
      ? `Recent signals: ${summary.recentSignals.map((item) => `${item.role || "event"} ${item.refId || ""}: ${item.preview || ""}`).join(" | ")}`
      : "",
    Array.isArray(summary.sourceRefs) && summary.sourceRefs.length ? `Source refs: ${summary.sourceRefs.join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatWorkingState(state = {}) {
  if (!state || typeof state !== "object") return "";
  const lines = [
    "[Hermes working state]",
    state.status ? `Status: ${state.status}` : "",
    state.activeTask ? `Active task: ${state.activeTask}` : "",
    state.currentStep ? `Current step: ${state.currentStep}` : "",
    state.nextStep ? `Next step: ${state.nextStep}` : "",
    Array.isArray(state.sourceRefs) && state.sourceRefs.length ? `Source refs: ${state.sourceRefs.join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatEvidenceRefs(refs = [], maxCount = 6) {
  const lines = (Array.isArray(refs) ? refs : []).slice(-Math.max(0, maxCount)).map((ref) => (
    `- ${ref.refId || ref.targetId || "ref"} ${ref.role || ref.refType || ""}: ${ref.preview || ""}`
  ));
  return lines.length ? ["[Hermes evidence refs]", ...lines].join("\n") : "";
}

function createContextAssemblyService(options = {}) {
  const legacyBuildConversationHistory = typeof options.legacyBuildConversationHistory === "function"
    ? options.legacyBuildConversationHistory
    : (() => []);
  const compactText = typeof options.compactText === "function" ? options.compactText : ((value, limit) => String(value || "").slice(0, limit));
  const topicContextService = options.topicContextService || null;
  const mode = cleanString(options.mode || "legacy").toLowerCase();
  const maxApiTextChars = Math.max(1000, Number(options.maxApiTextChars || 80_000) || 80_000);
  const normalRecentMessages = Math.max(2, Number(options.normalRecentMessages || 10) || 10);
  const toolDenseRecentMessages = Math.max(2, Number(options.toolDenseRecentMessages || 4) || 4);
  const historicalEvidenceRefs = Math.max(0, Number(options.historicalEvidenceRefs || 8) || 8);
  let lastAssemblyDebug = null;

  function latestMessage(thread = {}, latestUserMessageId = "") {
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    const index = messages.findIndex((message) => message.id === latestUserMessageId);
    return index >= 0 ? messages[index] : null;
  }

  function profileFor(thread = {}, latest = {}, priorMessages = []) {
    const latestText = cleanString(latest?.content);
    const recentText = priorMessages.slice(-6).map((message) => message.content || "").join("\n");
    if (textLooksToolDense(latestText) || textLooksToolDense(recentText)) return "tool_dense";
    if (textIncludesHistoricalLookup(latestText)) return "historical_lookup";
    if (String(thread?.status || "") === "running") return "tool_dense";
    return "normal_chat";
  }

  function buildLayeredHistory(thread = {}, latestUserMessageId = "", policy = {}) {
    const allMessages = Array.isArray(thread.messages) ? thread.messages : [];
    const latestIndex = allMessages.findIndex((message) => message.id === latestUserMessageId);
    const latest = latestIndex >= 0 ? allMessages[latestIndex] : null;
    if (thread?.singleWindow && !latest?.taskGroupId) return [];
    const priorMessages = allMessages
      .slice(0, latestIndex >= 0 ? latestIndex : allMessages.length)
      .filter((message) => !thread?.singleWindow || message.taskGroupId === latest.taskGroupId)
      .filter((message) => (message.role === "user" || message.role === "assistant") && message.status !== "running")
      .filter((message) => cleanString(message.content));
    const profile = profileFor(thread, latest, priorMessages);
    const taskGroupId = normalizeTaskGroupId(latest?.taskGroupId);
    let topicContext = { summary: null, workingState: null, refs: [] };
    try {
      topicContext = topicContextService?.readTopicContext
        ? topicContextService.readTopicContext(thread.id, taskGroupId)
        : topicContext;
    } catch (_) {
      topicContext = { summary: null, workingState: null, refs: [] };
    }
    if (!topicContext.summary && !topicContext.workingState) {
      const fallback = legacyBuildConversationHistory(thread, latestUserMessageId, policy);
      lastAssemblyDebug = {
        mode: "layered",
        profile,
        taskGroupId,
        summaryVersion: null,
        recentMessageCount: fallback.length,
        evidenceChunkCount: 0,
        estimatedChars: fallback.reduce((sum, message) => sum + String(message.content || "").length, 0),
        fallbackUsed: true,
      };
      return fallback;
    }
    const synthetic = [
      syntheticMessage(formatSummary(topicContext.summary)),
      syntheticMessage(formatWorkingState(topicContext.workingState)),
      profile === "historical_lookup" ? syntheticMessage(formatEvidenceRefs(topicContext.refs, historicalEvidenceRefs)) : null,
    ].filter(Boolean).map((message) => ({
      role: message.role,
      content: compactText(message.content, Math.min(maxApiTextChars, 6000)),
    }));
    const recentLimit = profile === "tool_dense" ? toolDenseRecentMessages : normalRecentMessages;
    const recentHistory = legacyBuildConversationHistory(
      Object.assign({}, thread, { messages: allMessages.slice(Math.max(0, latestIndex - recentLimit), latestIndex >= 0 ? latestIndex + 1 : allMessages.length) }),
      latestUserMessageId,
      policy,
    );
    const messages = synthetic.concat(recentHistory);
    lastAssemblyDebug = {
      mode: "layered",
      profile,
      taskGroupId,
      summaryVersion: topicContext.summary?.summaryVersion || null,
      recentMessageCount: recentHistory.length,
      evidenceChunkCount: profile === "historical_lookup" ? Math.min(historicalEvidenceRefs, topicContext.refs?.length || 0) : 0,
      estimatedChars: messages.reduce((sum, message) => sum + String(message.content || "").length, 0),
      fallbackUsed: !topicContext.summary && !topicContext.workingState,
    };
    return messages;
  }

  function buildConversationHistory(thread = {}, latestUserMessageId = "", policy = {}) {
    if (mode === "legacy") {
      const messages = legacyBuildConversationHistory(thread, latestUserMessageId, policy);
      const latest = latestMessage(thread, latestUserMessageId);
      lastAssemblyDebug = {
        mode: "legacy",
        profile: "legacy",
        taskGroupId: normalizeTaskGroupId(latest?.taskGroupId),
        recentMessageCount: messages.length,
        evidenceChunkCount: 0,
        estimatedChars: messages.reduce((sum, message) => sum + String(message.content || "").length, 0),
        fallbackUsed: true,
      };
      return messages;
    }
    return buildLayeredHistory(thread, latestUserMessageId, policy);
  }

  return Object.freeze({
    buildConversationHistory,
    lastAssemblyDebug: () => lastAssemblyDebug,
    profileFor,
  });
}

module.exports = {
  createContextAssemblyService,
  formatEvidenceRefs,
  formatSummary,
  formatWorkingState,
};
