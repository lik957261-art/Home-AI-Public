"use strict";

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function requestedDateForText(text) {
  if (/今天|今日|today/i.test(text)) return "today";
  if (/昨天|昨日|前一自然日|previous\s+day|yesterday/i.test(text)) return "previous_day";
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : "";
}

function shouldPrepareDiscussionContext(text) {
  const value = cleanString(text, 2000).toLowerCase();
  if (!value) return false;
  const asksAnalysis = /(总结|摘要|分析|复盘|归纳|待办|风险|阻塞|follow-?up|summary|summari[sz]e|analy[sz]e|todo|risk)/i.test(value);
  const mentionsDiscussion = /(讨论|聊天|消息|会话|工作区|workspace|thread|conversation|chat)/i.test(value);
  const mentionsHomeAiScope = /(home\s*ai|hermes|各工作区|所有工作区|跨工作区|工作区)/i.test(value);
  return asksAnalysis && mentionsDiscussion && mentionsHomeAiScope && Boolean(requestedDateForText(value));
}

function instructionForPreparedContext(result) {
  const context = result?.context || {};
  const audit = context.audit || {};
  const markdown = cleanString(result?.markdown, 60_000);
  if (!markdown) return "";
  return [
    "[HOME AI DATA CONTEXT]",
    `Type: ${cleanString(result.type || context.type, 120)}`,
    `Target date: ${cleanString(context.targetDate, 80)}`,
    `Audit: workspaces=${audit.workspaceCount || 0}, threads=${audit.threadCount || 0}, included_messages=${audit.includedMessageCount || 0}, excluded=${audit.excludedNoiseOrOutOfScopeCount || 0}`,
    "Use this bounded host-generated data context as the primary evidence source for the user's current request. Do not search unrelated filesystem paths or ask to read raw SQLite.",
    "",
    markdown,
  ].join("\n");
}

function createChatDataContextSelectorService(options = {}) {
  const dataContextService = options.dataContextService;

  function prepareForMessage(input = {}) {
    const text = cleanString(input.text, 4000);
    if (!shouldPrepareDiscussionContext(text)) return { ok: true, selected: false, instructions: "" };
    if (!dataContextService || typeof dataContextService.prepare !== "function") {
      return { ok: false, selected: true, error: "data_context_service_unavailable", instructions: "" };
    }
    try {
      const result = dataContextService.prepare({
        type: "discussion_activity_daily",
        date: requestedDateForText(text) || "previous_day",
        scope: {
          workspaceId: cleanString(input.workspaceId || input.actorWorkspaceId || "owner", 120),
          actorId: cleanString(input.actorId || input.principalId || input.workspaceId || "owner", 120),
        },
        maxThreads: input.maxThreads || 24,
        maxMessagesPerThread: input.maxMessagesPerThread || 12,
        maxExcerptChars: input.maxExcerptChars || 260,
      });
      return {
        ok: true,
        selected: true,
        type: result.type,
        context: result.context,
        instructions: instructionForPreparedContext(result),
      };
    } catch (err) {
      return {
        ok: false,
        selected: true,
        error: cleanString(err?.message || err, 240),
        code: cleanString(err?.code || "data_context_prepare_failed", 80),
        instructions: "",
      };
    }
  }

  return { prepareForMessage };
}

module.exports = {
  createChatDataContextSelectorService,
  requestedDateForText,
  shouldPrepareDiscussionContext,
};
