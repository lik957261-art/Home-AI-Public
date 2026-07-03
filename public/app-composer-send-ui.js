"use strict";

function showError(err) {
  $("connectionState").textContent = err.message || String(err);
}

function latestUserTaskGroupId(thread = {}) {
  const latestUser = [...(thread?.messages || [])].reverse().find((message) => message.role === "user" && message.taskGroupId);
  return latestUser?.taskGroupId || "";
}

function createdTaskGroupIdFromSendResult(result = {}, thread = state.currentThread) {
  return result?.taskGroupId || result?.run?.taskGroupId || latestUserTaskGroupId(thread);
}

function handleSendMessageResult(result, createsNewTask, consumedPendingDirectory, options = {}) {
  state.forceChatStickToBottomUntil = Date.now() + 12000;
  state.conversationViewportBottomFollowUntil = Date.now() + 5000;
  state.conversationViewportSettleUntil = Date.now() + 900;
  state.suppressChatAutoBottomUntil = 0;
  if (typeof clearConversationUserScrollProtection === "function") clearConversationUserScrollProtection();
  if (typeof clearConversationReadAnchor === "function") clearConversationReadAnchor();
  state.conversationPinnedToBottom = true;
  state.pendingArtifacts = [];
  if (state.viewMode === "tasks") state.pendingTaskReasoningEffort = "";
  if (state.viewMode === "tasks") state.pendingTaskReasoningExplicit = false;
  resetComposerSearchSource();
  clearQuotedReply({ render: false });
  renderPendingArtifacts();
  const routeSnapshot = options.routeSnapshot || null;
  const expectedThreadId = String(options.threadId || routeSnapshot?.currentThreadId || "");
  const routeStillCurrent = typeof currentThreadRouteMatches === "function"
    ? currentThreadRouteMatches(routeSnapshot)
    : true;
  if (!routeStillCurrent || (expectedThreadId && String(state.currentThreadId || state.currentThread?.id || "") !== expectedThreadId)) {
    if (result?.thread) {
      if (typeof mergeTaskListThreadFromThreadUpdate === "function") mergeTaskListThreadFromThreadUpdate(result.thread);
      if (typeof upsertThreadSummary === "function" && typeof summarizeThread === "function") {
        upsertThreadSummary(summarizeThread(result.thread));
      }
    }
    suppressComposerAutoFocus(1200);
    blurComposerInput();
    return;
  }
  state.currentThread = mergeCurrentThread(result.thread);
  if (typeof mergeTaskListThreadFromThreadUpdate === "function") {
    mergeTaskListThreadFromThreadUpdate(state.currentThread);
  }
  if (createsNewTask) {
    const createdTaskGroupId = createdTaskGroupIdFromSendResult(result, state.currentThread);
    if (createdTaskGroupId) {
      state.currentTaskGroupId = createdTaskGroupId;
      state.pendingTaskDirectory = null;
      if (consumedPendingDirectory) state.taskDirectoryFilter = null;
    } else if (!consumedPendingDirectory) {
      state.pendingTaskDirectory = null;
    } else if (typeof requestCurrentThreadRefresh === "function") {
      requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 220 });
    }
  } else if (state.viewMode === "tasks" && !state.currentTaskGroupId) {
    state.currentTaskGroupId = latestUserTaskGroupId(state.currentThread);
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  if (isSingleWindowChatView()) scheduleConversationBottomStick();
  suppressComposerAutoFocus(1200);
  blurComposerInput();
}

function shouldOfferOwnerElevation(err) {
  return Boolean(err?.elevationRequired && state.auth?.isOwner);
}

function shouldOfferOwnerElevationForMessage(message) {
  if (!message?.elevationRequired) return false;
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return false;
  const status = String(message.status || "");
  if (status === "queued" || status === "running") return false;
  if (!state.currentThreadId && !state.currentThread?.id) return false;
  if (state.ownerElevationRetryingMessageIds.has(message.id)) return false;
  return true;
}

async function offerOwnerElevationForMessage(message) {
  if (!shouldOfferOwnerElevationForMessage(message)) return false;
  const messageId = String(message.id || "");
  if (!messageId || state.ownerElevationPromptedMessageIds.has(messageId)) return false;
  state.ownerElevationPromptedMessageIds.add(messageId);
  const ok = await openOwnerElevationApprovalDialog({
    title: "Owner Approval",
    message: ownerElevationConfirmMessage(message),
    detail: message.elevationReason || "",
  });
  if (!ok) return false;
  state.ownerElevationRetryingMessageIds.add(messageId);
  let ownerElevationOnceRequested = false;
  try {
    let onceToken = "";
    if (!ownerElevationActive()) {
      await activateOwnerElevationOnce({ confirm: false });
      onceToken = state.ownerElevationOnceToken;
      ownerElevationOnceRequested = true;
    }
    const threadId = state.currentThreadId || state.currentThread?.id || "";
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/owner-elevation`, {
      method: "POST",
      body: JSON.stringify({
        elevationScope: message.elevationScope || "owner_high_privilege",
        ownerElevationOnceToken: onceToken,
      }),
    });
    if (result.thread) {
      state.currentThread = mergeCurrentThread(result.thread);
      state.currentThreadId = state.currentThread?.id || threadId;
      upsertThreadSummary(summarizeThread(state.currentThread));
      renderCurrentThread({ stickToBottom: true });
    }
    showPushToast("已批准高权限重跑", "success");
    return true;
  } finally {
    if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    state.ownerElevationRetryingMessageIds.delete(messageId);
  }
}

function ownerElevationConfirmMessage(err) {
  const scope = String(err?.elevationScope || err?.code || "").trim();
  if (scope === "automation_admin_write") {
    return "这次请求会修改其他账号的自动化任务，需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "shared_skill_write") {
    return "这次操作需要写入共享或系统级 Skill。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  if (scope === "owner_high_privilege" || scope === "owner_high_privilege_required") {
    return "这次请求需要 Owner 高权限运行。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
  }
  return "这次请求需要 Owner 提权。批准后只会把这一条消息路由到 Owner maintenance Gateway。是否批准？";
}

function ownerElevationComposerAvailable() {
  if (isChatSearchMode()) return false;
  return Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner" && (state.viewMode === "single" || state.viewMode === "tasks"));
}

function ownerElevationMentionOptions() {
  if (!ownerElevationComposerAvailable()) return [];
  return [{
    workspaceId: "owner-elevation-once",
    label: "高权限本次",
    virtual: true,
    mentionText: "#高权限本次",
    description: "只授权当前这一条 Owner 消息",
    ownerElevationOnce: true,
  }];
}

function ownerElevationTagPattern() {
  return /(^|[\s([{,.;:!?\u3000\uff08\uff3b\u3010\uff0c\u3002\uff1b\uff1a\uff01\uff1f])[#\uff03]\s*(?:高权限|高權限|owner[-_\s]?high[-_\s]?privilege|high[-_\s]?privilege)\s*(?:本次|once)?/gi;
}

function ownerElevationOnceTagInfo(text) {
  return ownerElevationTagPattern().test(String(text || "")) ? { present: true } : null;
}

function stripOwnerElevationOnceTags(text) {
  return String(text || "")
    .replace(ownerElevationTagPattern(), (match, prefix = "") => prefix)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function composerMentionAvailable() {
  if (isChatSearchMode()) return false;
  return state.viewMode === "single" || state.viewMode === "tasks";
}

function composerMentionMembers() {
  const groupMembers = isGroupChatView() ? groupChatMentionMembers(state.currentThread, { includeAi: false }) : [];
  return [...composerAiMentionOptions(), ...groupMembers];
}

function activeGroupMentionToken() {
  if (!composerMentionAvailable()) return null;
  const text = getComposerText();
  const caret = composerCaretOffset();
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("\uff20"));
  const hash = ownerElevationComposerAvailable()
    ? Math.max(before.lastIndexOf("#"), before.lastIndexOf("\uff03"))
    : -1;
  const start = Math.max(at, hash);
  if (start < 0) return null;
  const trigger = start === hash ? "#" : "@";
  const previous = start > 0 ? before[start - 1] : "";
  if (previous && !/[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?，。；：！？、]/.test(previous)) return null;
  const query = before.slice(start + 1);
  if (/[\s\r\n@\uff20#\uff03]/.test(query) || query.length > 40) return null;
  return { start, end: caret, query, trigger };
}

function mentionOptionsForQuery(query, members = composerMentionMembers()) {
  const needle = normalizeMentionSearch(query);
  return members.filter((member) => {
    if (!needle) return true;
    return normalizeMentionSearch(member.label).includes(needle)
      || normalizeMentionSearch(member.workspaceId).includes(needle)
      || normalizeMentionSearch(member.description).includes(needle)
      || normalizeMentionSearch(member.mentionText).includes(needle)
      || normalizeMentionSearch(member.reasoningEffort).includes(needle);
  }).slice(0, 8);
}

function closeGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  state.groupMentionOpen = false;
  state.groupMentionOptions = [];
  state.groupMentionIndex = 0;
  state.groupMentionToken = null;
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function renderGroupMentionMenu() {
  const menu = $("groupMentionMenu");
  if (!menu) return;
  const token = activeGroupMentionToken();
  if (!token) {
    closeGroupMentionMenu();
    return;
  }
  const options = token.trigger === "#"
    ? mentionOptionsForQuery(token.query, ownerElevationMentionOptions())
    : mentionOptionsForQuery(token.query);
  if (!options.length) {
    closeGroupMentionMenu();
    return;
  }
  state.groupMentionOpen = true;
  closeComposerSourceMenu();
  state.groupMentionOptions = options;
  state.groupMentionToken = token;
  state.groupMentionIndex = Math.min(Math.max(0, state.groupMentionIndex), options.length - 1);
  menu.hidden = false;
  menu.innerHTML = options.map((member, index) => `
    <button class="group-mention-option${index === state.groupMentionIndex ? " active" : ""}" type="button" data-group-mention-index="${index}">
      <span class="group-mention-name">${escapeHtml(member.mentionText || `@${member.label}`)}</span>
      ${member.description ? `<span class="group-mention-meta">${escapeHtml(member.description)}</span>` : ""}
    </button>`).join("");
}

function moveGroupMentionSelection(delta) {
  if (!state.groupMentionOpen || !state.groupMentionOptions.length) return;
  const total = state.groupMentionOptions.length;
  state.groupMentionIndex = (state.groupMentionIndex + delta + total) % total;
  renderGroupMentionMenu();
}

async function chooseGroupMention(index = state.groupMentionIndex) {
  if (!state.groupMentionOpen || !state.groupMentionToken) return false;
  const member = state.groupMentionOptions[index] || state.groupMentionOptions[0];
  if (!member) return false;
  if (member.ownerElevationOnce) clearOwnerElevationOnce();
  const token = state.groupMentionToken;
  const text = getComposerText();
  const insertion = `${String(member.mentionText || `@${member.label}`).trimEnd()} `;
  const next = `${text.slice(0, token.start)}${insertion}${text.slice(token.end)}`;
  setComposerText(next);
  $("messageInput")?.focus({ preventScroll: true });
  setComposerCaretOffset(token.start + insertion.length);
  closeGroupMentionMenu();
  updateComposerAction();
  return true;
}

function updateGroupMentionMenu() {
  if (!composerMentionAvailable()) {
    closeGroupMentionMenu();
    return;
  }
  renderGroupMentionMenu();
}
