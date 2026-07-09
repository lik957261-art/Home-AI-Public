const CHAT_COMPOSER_SEND_UI_MODEL_VERSION = "20260704-vite-chat-composer-send-ui-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function normalizeMessages(thread = {}) {
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function latestUserTaskGroupId(thread = {}) {
  const latestUser = [...normalizeMessages(thread)].reverse().find((message) => message?.role === "user" && message.taskGroupId);
  return cleanString(latestUser?.taskGroupId, 180);
}

function createdTaskGroupIdFromSendResult(result = {}, thread = {}) {
  return cleanString(result?.taskGroupId || result?.run?.taskGroupId || latestUserTaskGroupId(thread), 180);
}

function sendResultViewportResetPlan(input = {}) {
  const viewMode = cleanString(input.viewMode, 40);
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    forceChatStickToBottomMs: 12000,
    conversationViewportBottomFollowMs: 5000,
    conversationViewportSettleMs: 900,
    suppressChatAutoBottomUntil: 0,
    clearPendingArtifacts: true,
    clearPendingTaskReasoningEffort: viewMode === "tasks",
    clearPendingTaskReasoningExplicit: viewMode === "tasks",
    resetComposerSearchSource: true,
    clearQuotedReply: true,
  });
}

function sendResultRoutePlan(input = {}) {
  const expectedThreadId = cleanString(input.expectedThreadId, 180);
  const currentThreadId = cleanString(input.currentThreadId || input.currentThreadObjectId, 180);
  const routeStillCurrent = input.routeStillCurrent !== false;
  const stale = Boolean(!routeStillCurrent || (expectedThreadId && currentThreadId !== expectedThreadId));
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    stale,
    expectedThreadId,
    currentThreadId,
    shouldMergeSummaryOnly: stale,
  });
}

function sendResultTaskGroupPlan(input = {}) {
  const createdTaskGroupId = cleanString(input.createdTaskGroupId, 180);
  const latestTaskGroupId = cleanString(input.latestTaskGroupId, 180);
  const createsNewTask = Boolean(input.createsNewTask);
  const consumedPendingDirectory = Boolean(input.consumedPendingDirectory);
  const viewMode = cleanString(input.viewMode, 40);
  const currentTaskGroupId = cleanString(input.currentTaskGroupId, 180);
  let nextCurrentTaskGroupId = currentTaskGroupId;
  let clearPendingTaskDirectory = false;
  let clearTaskDirectoryFilter = false;
  let refreshRequest = null;
  if (createsNewTask) {
    if (createdTaskGroupId) {
      nextCurrentTaskGroupId = createdTaskGroupId;
      clearPendingTaskDirectory = true;
      clearTaskDirectoryFilter = consumedPendingDirectory;
    } else if (!consumedPendingDirectory) {
      clearPendingTaskDirectory = true;
    } else {
      refreshRequest = Object.freeze({ stickToBottom: true, delayMs: 220 });
    }
  } else if (viewMode === "tasks" && !currentTaskGroupId && latestTaskGroupId) {
    nextCurrentTaskGroupId = latestTaskGroupId;
  }
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    nextCurrentTaskGroupId,
    clearPendingTaskDirectory,
    clearTaskDirectoryFilter,
    refreshRequest,
  });
}

function ownerElevationErrorPlan(input = {}) {
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    offer: Boolean(input.elevationRequired && input.isOwner),
  });
}

function ownerElevationMessagePlan(input = {}) {
  const status = cleanString(input.status, 80);
  const messageId = cleanString(input.messageId, 180);
  const threadId = cleanString(input.currentThreadId || input.currentThreadObjectId, 180);
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    offer: Boolean(
      input.elevationRequired
      && input.isOwner
      && input.selectedWorkspaceId === "owner"
      && status !== "queued"
      && status !== "running"
      && threadId
      && messageId
      && !input.retrying
    ),
  });
}

function ownerElevationConfirmMessagePlan(input = {}) {
  const scope = cleanString(input.elevationScope || input.code, 120);
  let message = "这次请求需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  if (scope === "automation_admin_write") {
    message = "这次请求会修改其他账号的自动化任务，需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  } else if (scope === "shared_skill_write") {
    message = "这次操作需要写入共享或系统级 Skill。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  } else if (scope === "owner_high_privilege" || scope === "owner_high_privilege_required") {
    message = "这次请求需要 Owner 高权限运行。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    scope,
    message,
  });
}

function ownerElevationComposerAvailablePlan(input = {}) {
  const viewMode = cleanString(input.viewMode, 40);
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    available: Boolean(
      !input.chatSearchMode
      && input.isOwner
      && input.selectedWorkspaceId === "owner"
      && (viewMode === "single" || viewMode === "tasks")
    ),
  });
}

function ownerElevationTagPattern() {
  return /(^|[\s([{,.;:!?\u3000\uff08\uff3b\u3010\uff0c\u3002\uff1b\uff1a\uff01\uff1f])[#\uff03]\s*(?:高权限|高權限|owner[-_\s]?high[-_\s]?privilege|high[-_\s]?privilege)\s*(?:本次|once)?/gi;
}

function ownerElevationOnceTagInfo(text) {
  return ownerElevationTagPattern().test(String(text || "")) ? Object.freeze({ present: true }) : null;
}

function stripOwnerElevationOnceTags(text) {
  return String(text || "")
    .replace(ownerElevationTagPattern(), (match, prefix = "") => prefix)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function activeGroupMentionTokenPlan(input = {}) {
  if (!input.composerMentionAvailable) return null;
  const text = String(input.text || "");
  const caret = Math.max(0, Math.min(text.length, Math.trunc(Number(input.caret) || 0)));
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("\uff20"));
  const hash = input.ownerElevationAvailable
    ? Math.max(before.lastIndexOf("#"), before.lastIndexOf("\uff03"))
    : -1;
  const start = Math.max(at, hash);
  if (start < 0) return null;
  const trigger = start === hash ? "#" : "@";
  const previous = start > 0 ? before[start - 1] : "";
  if (previous && !/[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?，。；：！？、]/.test(previous)) return null;
  const query = before.slice(start + 1);
  if (/[\s\r\n@\uff20#\uff03]/.test(query) || query.length > 40) return null;
  return Object.freeze({ start, end: caret, query, trigger });
}

function normalizeMentionSearchText(value) {
  return cleanString(value, 400).toLowerCase();
}

function mentionOptionsForQueryPlan(input = {}) {
  const needle = normalizeMentionSearchText(input.query);
  const members = Array.isArray(input.members) ? input.members : [];
  const limit = Math.max(1, Math.min(20, Math.trunc(Number(input.limit) || 8)));
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    options: Object.freeze(members.filter((member) => {
      if (!needle) return true;
      return normalizeMentionSearchText(member?.label).includes(needle)
        || normalizeMentionSearchText(member?.workspaceId).includes(needle)
        || normalizeMentionSearchText(member?.description).includes(needle)
        || normalizeMentionSearchText(member?.mentionText).includes(needle)
        || normalizeMentionSearchText(member?.reasoningEffort).includes(needle);
    }).slice(0, limit)),
  });
}

function chooseGroupMentionTextPlan(input = {}) {
  const token = input.token || {};
  const member = input.member || {};
  const text = String(input.text || "");
  const start = Math.max(0, Math.min(text.length, Math.trunc(Number(token.start) || 0)));
  const end = Math.max(start, Math.min(text.length, Math.trunc(Number(token.end) || start)));
  const insertion = `${String(member.mentionText || `@${member.label || ""}`).trimEnd()} `;
  return Object.freeze({
    version: CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
    text: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
    caret: start + insertion.length,
    insertion,
  });
}

export {
  CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
  activeGroupMentionTokenPlan,
  chooseGroupMentionTextPlan,
  createdTaskGroupIdFromSendResult,
  latestUserTaskGroupId,
  mentionOptionsForQueryPlan,
  ownerElevationComposerAvailablePlan,
  ownerElevationConfirmMessagePlan,
  ownerElevationErrorPlan,
  ownerElevationMessagePlan,
  ownerElevationOnceTagInfo,
  sendResultRoutePlan,
  sendResultTaskGroupPlan,
  sendResultViewportResetPlan,
  stripOwnerElevationOnceTags,
};
