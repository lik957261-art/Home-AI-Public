const CHAT_COMPOSER_MODEL_VERSION = "20260702-vite-chat-composer-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRunIds(value) {
  return Array.isArray(value) ? value.map((id) => cleanString(id, 180)).filter(Boolean) : [];
}

function normalizeArtifacts(value) {
  return Array.isArray(value) ? value.filter(isObject).slice(0, 20) : [];
}

function composerHasDraft(input = {}) {
  return Boolean(cleanString(input.text || input.draftText || "", 240000));
}

function composerHasContent(input = {}) {
  return composerHasDraft(input) || Boolean(normalizeArtifacts(input.pendingArtifacts || input.body?.artifacts).length);
}

function shouldUseComposerStopMode(input = {}) {
  if (input.searchMode) return false;
  if (!normalizeRunIds(input.activeRunIds).length) return false;
  if (input.singleWindowView && composerHasContent(input)) return false;
  return true;
}

function buildComposerActionState(input = {}) {
  const text = cleanString(input.text || input.draftText || "", 240000);
  const hasDraft = Boolean(text);
  const pendingArtifactCount = normalizeArtifacts(input.pendingArtifacts).length;
  const searchMode = Boolean(input.searchMode);
  const searchDraft = cleanString(input.searchDraft || text, 4000);
  const stopMode = shouldUseComposerStopMode(Object.assign({}, input, { text }));
  const taskListRoot = Boolean(input.taskListRoot);
  const hidden = taskListRoot || Boolean(input.hidden);
  const shellLocked = Boolean(input.shellLocked) && !hidden && !searchMode;
  const enabled = taskListRoot ? false : Boolean(input.enabled);
  const visuallyEnabled = enabled || shellLocked || searchMode;
  const sendAvailable = Boolean(hasDraft || pendingArtifactCount);
  let mode = "disabled";
  let label = "发送";
  let classicVisualLabel = "Send";
  let disabled = !visuallyEnabled || !sendAvailable;
  if (searchMode) {
    mode = "search";
    label = "搜索";
    classicVisualLabel = "搜索";
    disabled = !searchDraft;
  } else if (stopMode) {
    mode = "stop";
    label = "停止";
    classicVisualLabel = "Stop";
    disabled = false;
  } else if (visuallyEnabled) {
    mode = "send";
    label = "发送";
    classicVisualLabel = "Send";
    disabled = !sendAvailable || Boolean(input.sendInFlight || input.composing);
  }
  return Object.freeze({
    version: CHAT_COMPOSER_MODEL_VERSION,
    mode,
    label,
    classicVisualLabel,
    disabled,
    hidden,
    enabled,
    visuallyEnabled,
    shellLocked,
    stopMode,
    searchMode,
    hasDraft,
    pendingArtifactCount,
    activeRunCount: normalizeRunIds(input.activeRunIds).length,
    enterKeyHint: searchMode ? "search" : "send",
    ariaLabel: searchMode ? "Search chat" : "Message Home AI",
  });
}

function optimisticSendTaskGroupId(input = {}) {
  if (input.body?.taskGroupId) return cleanString(input.body.taskGroupId, 180);
  if (input.viewMode === "single" && input.singleWindowMode === "chat") return cleanString(input.activeChatTaskGroupId || "", 180);
  return "";
}

function optimisticSendShouldAppendAssistant(input = {}) {
  return !(input.viewMode === "single" && input.singleWindowMode === "chat" && input.body?.messageKind === "plain");
}

function createOptimisticSendPlan(input = {}) {
  const threadId = cleanString(input.threadId || input.thread?.id || "", 180);
  const text = cleanString(input.text || "", 240000);
  const pendingArtifactCount = normalizeArtifacts(input.pendingArtifacts || input.body?.artifacts).length;
  if (!threadId || (!text && !pendingArtifactCount)) {
    return Object.freeze({
      ok: false,
      code: !threadId ? "thread_id_missing" : "message_content_missing",
      threadId,
      messages: Object.freeze([]),
      token: null,
    });
  }
  const nowIso = cleanString(input.nowIso || new Date(0).toISOString(), 80);
  const queuedAt = cleanString(input.queuedAt || nowIso, 80);
  const baseId = cleanString(input.baseId || `local_send_${Date.parse(nowIso) || 0}_vite`, 180);
  const taskGroupId = optimisticSendTaskGroupId(input);
  const messageKind = cleanString(input.body?.messageKind || "", 80);
  const userMessage = Object.freeze({
    id: `${baseId}_user`,
    role: "user",
    content: text || `已附加 ${pendingArtifactCount} 个文件`,
    status: "done",
    createdAt: nowIso,
    updatedAt: nowIso,
    taskGroupId,
    messageKind,
    artifactCount: pendingArtifactCount,
    localPendingSend: true,
    localPendingSendId: baseId,
  });
  const messages = [userMessage];
  if (optimisticSendShouldAppendAssistant(input)) {
    messages.push(Object.freeze({
      id: `${baseId}_assistant`,
      role: "assistant",
      content: "",
      status: "queued",
      createdAt: queuedAt,
      updatedAt: queuedAt,
      queuedAt,
      taskGroupId,
      localRunProgressEvents: Object.freeze([Object.freeze({
        event: "run.request_preparing",
        timestamp: Math.floor((Date.parse(queuedAt) || 0) / 1000),
        preview: "正在准备模型回复",
      })]),
      localPendingSend: true,
      localPendingSendId: baseId,
    }));
  }
  return Object.freeze({
    ok: true,
    code: "",
    threadId,
    messages: Object.freeze(messages),
    token: Object.freeze({
      threadId,
      ids: Object.freeze(messages.map((message) => message.id)),
      localPendingSendId: baseId,
    }),
    viewport: Object.freeze({
      forceStickToBottomMs: 12000,
      bottomFollowMs: 5000,
      settleMs: 900,
    }),
  });
}

function applyOptimisticSendPlan(thread = {}, plan = {}) {
  if (!plan?.ok || !Array.isArray(plan.messages)) return Object.assign({}, thread);
  const existing = Array.isArray(thread.messages) ? thread.messages : [];
  return Object.freeze(Object.assign({}, thread, {
    messages: Object.freeze(existing.concat(plan.messages)),
  }));
}

function clearOptimisticSendPlan(thread = {}, token = {}) {
  const ids = new Set(Array.isArray(token.ids) ? token.ids : []);
  if (!ids.size || cleanString(thread.id, 180) !== cleanString(token.threadId, 180)) {
    return Object.freeze(Object.assign({}, thread));
  }
  const existing = Array.isArray(thread.messages) ? thread.messages : [];
  return Object.freeze(Object.assign({}, thread, {
    messages: Object.freeze(existing.filter((message) => !ids.has(message?.id))),
  }));
}

export {
  CHAT_COMPOSER_MODEL_VERSION,
  applyOptimisticSendPlan,
  buildComposerActionState,
  clearOptimisticSendPlan,
  composerHasContent,
  composerHasDraft,
  createOptimisticSendPlan,
  optimisticSendShouldAppendAssistant,
  optimisticSendTaskGroupId,
  shouldUseComposerStopMode,
};
