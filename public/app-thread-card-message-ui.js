"use strict";

const THREAD_CARD_MESSAGE_MODEL_ESM_PATH = "/vite-islands/thread-card-message-model/thread-card-message-model.js";
let threadCardMessageModel = null;
let threadCardMessageModelPromise = null;

function importThreadCardMessageModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (threadCardMessageModel) return Promise.resolve(threadCardMessageModel);
  if (!threadCardMessageModelPromise) {
    const importer = typeof rootRef.__homeAiImportThreadCardMessageModel === "function"
      ? rootRef.__homeAiImportThreadCardMessageModel
      : (path) => import(path);
    threadCardMessageModelPromise = Promise.resolve()
      .then(() => importer(THREAD_CARD_MESSAGE_MODEL_ESM_PATH))
      .then((model) => {
        threadCardMessageModel = model || null;
        return threadCardMessageModel;
      })
      .catch((error) => {
        threadCardMessageModelPromise = null;
        throw error;
      });
  }
  return threadCardMessageModelPromise;
}

function currentThreadCardMessageModel() {
  return threadCardMessageModel;
}

if (typeof window !== "undefined") {
  importThreadCardMessageModel().catch(() => null);
}

function renderTaskCard(group) {
  const sharedTopic = Boolean(group.sharedTopic || group.sourceThreadId);
  const latestArtifact = sharedTopic ? null : latestTaskListDocument(group);
  const plan = currentThreadCardMessageModel()?.taskCardViewPlan?.({
    id: group?.id,
    sharedTopic: group?.sharedTopic,
    sourceThreadId: group?.sourceThreadId,
    sourceThreadTitle: group?.sourceThreadTitle,
    title: taskTitle(group) || "Untitled topic",
    updatedAtLabel: formatTime(group?.updatedAt),
    hasArtifact: Boolean(latestArtifact),
  });
  const taskCardSharedTopic = plan?.sharedTopic ?? sharedTopic;
  const artifactChips = latestArtifact ? `<span class="task-doc-item">
    <a class="task-doc-icon doc-${escapeHtml(artifactKind(latestArtifact))}" href="${escapeHtml(artifactHref(latestArtifact))}" target="_self" data-task-doc data-artifact-mime="${escapeHtml(latestArtifact?.mime || "")}" data-artifact-name="${escapeHtml(artifactDisplayName(latestArtifact))}" title="${escapeHtml(artifactDisplayName(latestArtifact))}" aria-label="${escapeHtml(artifactDisplayName(latestArtifact))}">
      ${escapeHtml(iconForArtifact(latestArtifact))}
    </a>
    ${renderArtifactDirectoryButton(latestArtifact, { compact: true })}
  </span>` : "";
  const groupId = plan?.id ?? group.id;
  const sourceThreadId = plan?.sourceThreadId ?? group.sourceThreadId;
  const sourceThreadAttr = sourceThreadId ? ` data-open-task-thread="${escapeHtml(sourceThreadId)}"` : "";
  const sharedBadgeLabel = plan?.sharedBadgeLabel ?? (group.sourceThreadTitle || "\u5171\u4eab\u5b66\u4e60\u8bdd\u9898");
  const sharedBadge = taskCardSharedTopic ? `<span class="task-row-shared">${escapeHtml(sharedBadgeLabel)}</span>` : "";
  const title = plan?.title ?? (taskTitle(group) || "Untitled topic");
  const updatedAtLabel = plan?.updatedAtLabel ?? formatTime(group.updatedAt);
  return `<article class="task-card task-card-collapsed task-swipe-row${plan?.articleClassSuffix ?? (taskCardSharedTopic ? " shared-topic-card" : "")}" data-task-swipe-card data-task-id="${escapeHtml(groupId)}">
    ${taskCardSharedTopic ? "" : `<button class="task-swipe-delete" type="button" data-delete-task="${escapeHtml(groupId)}" aria-label="Delete topic">&#21024;&#38500;</button>`}
    <div class="task-swipe-content" data-task-swipe-content>
      ${taskCardSharedTopic ? "" : `<div class="task-card-menu-wrap">
        <button class="task-card-menu-button" type="button" data-task-card-menu="${escapeHtml(groupId)}" aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
        <div class="task-card-menu" hidden>
          <button class="task-card-menu-item" type="button" data-rename-task="${escapeHtml(groupId)}">修改话题名</button>
        </div>
      </div>`}
      <button class="task-card-main" type="button" data-open-task="${escapeHtml(groupId)}"${sourceThreadAttr}>
        <span class="task-title-line">${escapeHtml(title)}</span>
        <span class="task-row-meta">${escapeHtml(updatedAtLabel)}${sharedBadge}</span>
      </button>
      ${taskCardSharedTopic ? "" : `<div class="task-card-assets">
        <div class="task-docs${artifactChips ? "" : " empty"}" aria-label="Topic documents">
          ${artifactChips}
        </div>
        ${renderTaskDirectoryBadges(group, { empty: true })}
      </div>`}
    </div>
  </article>`;
}

function messageTaskGroup(message) {
  const plannedId = currentThreadCardMessageModel()?.messageTaskGroupIdPlan?.(message)?.taskGroupId;
  const taskGroupId = plannedId || message?.taskGroupId;
  if (!taskGroupId || !state.currentThread) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === taskGroupId) || null;
}

function quotePreviewForMessage(message, group = null) {
  const contentPreview = compactDisplayText(message?.content || "", 92);
  const plan = currentThreadCardMessageModel()?.quotePreviewPlan?.({
    contentPreview,
    taskSummary: taskSummary(group),
    taskTitle: taskTitle(group),
    defaultLabel: "Quoted topic",
  });
  return plan?.preview || contentPreview || taskSummary(group) || taskTitle(group) || "Quoted topic";
}

function renderMessageQuoteAction(message) {
  const taskId = messageTaskDisplayId(message);
  const plan = currentThreadCardMessageModel()?.messageQuoteActionPlan?.({
    singleWindowView: isSingleWindowView(),
    singleWindowChatView: isSingleWindowChatView(),
    role: message?.role,
    messageId: message?.id,
    taskGroupId: message?.taskGroupId,
    taskDisplayId: taskId,
    shortTaskDisplayId: shortTaskDisplayId(taskId),
  });
  if (plan) {
    if (!plan.visible) return "";
    return `<button class="message-quote-button" type="button" data-quote-message="${escapeHtml(plan.messageId)}" title="${escapeHtml(plan.title)}">${escapeHtml(plan.label)}</button>`;
  }
  if (!isSingleWindowView() || isSingleWindowChatView() || message?.role !== "assistant" || !message?.taskGroupId) return "";
  return `<button class="message-quote-button" type="button" data-quote-message="${escapeHtml(message.id)}" title="引用 ${escapeHtml(taskId)}">引用 ${escapeHtml(shortTaskDisplayId(taskId))}</button>`;
}

function canRevokeGroupMessage(message) {
  const plan = currentThreadCardMessageModel()?.groupMessageRevokeActionPlan?.({
    groupChatView: isGroupChatView(),
    message,
    selectedWorkspaceId: state.selectedWorkspaceId,
    authWorkspaceId: state.auth?.workspaceId,
    isOwner: state.auth?.isOwner,
    groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    revokeLabel: GROUP_REVOKE_LABEL,
  });
  if (plan) return Boolean(plan.visible);
  if (!isGroupChatView() || !message || message.revokedAt) return false;
  if (message.role !== "user" || message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (state.auth?.isOwner) return true;
  const activeWorkspaceId = String(state.selectedWorkspaceId || state.auth?.workspaceId || "").trim();
  return Boolean(activeWorkspaceId && activeWorkspaceId === message.senderWorkspaceId);
}

function renderMessageRevokeAction(message) {
  const plan = currentThreadCardMessageModel()?.groupMessageRevokeActionPlan?.({
    groupChatView: isGroupChatView(),
    message,
    selectedWorkspaceId: state.selectedWorkspaceId,
    authWorkspaceId: state.auth?.workspaceId,
    isOwner: state.auth?.isOwner,
    groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    revokeLabel: GROUP_REVOKE_LABEL,
  });
  if (plan) {
    if (!plan.visible) return "";
    return `<button class="message-revoke-button" type="button" data-revoke-message="${escapeHtml(plan.messageId)}" title="${escapeHtml(plan.label)}">${escapeHtml(plan.label)}</button>`;
  }
  if (!canRevokeGroupMessage(message)) return "";
  return `<button class="message-revoke-button" type="button" data-revoke-message="${escapeHtml(message.id || "")}" title="${escapeHtml(GROUP_REVOKE_LABEL)}">${escapeHtml(GROUP_REVOKE_LABEL)}</button>`;
}

function renderExternalDeliveryStatus(_message) {
  return "";
}

function messageUsesSenderLabel(message) {
  const plan = currentThreadCardMessageModel()?.messageSenderLabelPlan?.({
    groupChatView: isGroupChatView(),
    sharedTopic: Boolean(messageTaskGroup(message)?.sharedTopic),
    role: message?.role,
    messageKind: message?.messageKind,
  });
  if (plan) return Boolean(plan.useSenderLabel);
  if (isGroupChatView()) return true;
  return Boolean(messageTaskGroup(message)?.sharedTopic);
}

function userMessageSenderLabel(message) {
  return message?.senderLabel
    || workspaceLabelById(message?.senderWorkspaceId || message?.actorWorkspaceId || "")
    || "You";
}

function renderMessage(message) {
  const revoked = Boolean(message.revokedAt);
  const senderPlan = currentThreadCardMessageModel()?.messageSenderLabelPlan?.({
    groupChatView: isGroupChatView(),
    sharedTopic: Boolean(messageTaskGroup(message)?.sharedTopic),
    role: message?.role,
    senderLabel: message?.senderLabel,
    workspaceLabel: workspaceLabelById(message?.senderWorkspaceId || message?.actorWorkspaceId || ""),
    messageKind: message?.messageKind,
  });
  const useSenderLabel = senderPlan ? senderPlan.useSenderLabel : messageUsesSenderLabel(message);
  const roleLabel = senderPlan?.roleLabel || (useSenderLabel && message.role === "user"
    ? userMessageSenderLabel(message)
    : (message.role === "user" ? "You" : "Home AI"));
  const kindLabel = senderPlan?.kindLabel ?? (useSenderLabel && message.role === "user" && message.messageKind === "ai" ? " · AI" : "");
  const timeLabel = messageDisplayTimeLabel(message);
  const searchClass = chatSearchClassForMessage(message);
  const activeAssistantClass = !revoked
    && message.role === "assistant"
    && ["queued", "running"].includes(String(message.status || ""))
    ? " streaming-active"
    : "";
  const preservePromptClass = activeAssistantClass && typeof runProgressPromptPreserveClassForMessage === "function"
    ? runProgressPromptPreserveClassForMessage(state.currentThread, message)
    : "";
  const scrollEligibleAttr = messageScrollEligibleByContent(message) ? ` data-message-scroll-eligible="1"` : "";
  const articlePlan = currentThreadCardMessageModel()?.messageArticlePlan?.({
    revoked,
    role: message?.role,
    status: message?.status,
    messageId: message?.id,
    searchClass,
    preservePromptClass,
    scrollEligible: Boolean(scrollEligibleAttr),
    hasUsage: Boolean(message?.usage),
    hasError: Boolean(message?.error),
    hasArtifacts: Array.isArray(message?.artifacts) && message.artifacts.length > 0,
  });
  const status = articlePlan?.status ?? (!revoked && message.status && message.status !== "done" ? ` - ${message.status}` : "");
  const usage = !revoked && message.usage ? renderUsage(message.usage, message) : "";
  const footer = renderMessageFooter(message, usage);
  const error = !revoked && message.error ? `<div class="error-box">${escapeHtml(message.error)}</div>` : "";
  const artifacts = !revoked && Array.isArray(message.artifacts) && message.artifacts.length ? renderArtifacts(message.artifacts) : "";
  const externalDelivery = !revoked ? renderExternalDeliveryStatus(message) : "";
  const body = revoked ? `<div class="message-revoked-text">${escapeHtml(GROUP_MESSAGE_REVOKED_TEXT)}</div>` : renderText(message.content || "", message);
  const runProgress = !revoked ? renderMessageRunProgress(state.currentThread, message) : "";
  const articleClass = articlePlan?.articleClass || `message ${message.role || "assistant"}${searchClass}${activeAssistantClass}${preservePromptClass}${revoked ? " revoked" : ""}`;
  const messageId = articlePlan?.messageId ?? (message.id || "");
  return `<article class="${escapeHtml(articleClass)}" data-message-id="${escapeHtml(messageId)}"${scrollEligibleAttr}>
    <div class="message-head">
      <div class="message-head-main-wrap">
        <span class="message-head-main">${escapeHtml(roleLabel)}${escapeHtml(kindLabel)}${escapeHtml(status)}</span>
      </div>
      <div class="message-head-actions">
        ${renderMessageQuoteAction(message)}
        ${renderMessageRevokeAction(message)}
        <span>${escapeHtml(timeLabel)}</span>
      </div>
    </div>
    <div class="message-body">${body}${runProgress}${error}${artifacts}${externalDelivery}${footer}</div>
  </article>`;
}

function wireQuoteButtons(root) {
  root?.querySelectorAll?.("[data-quote-message]").forEach((button) => {
    if (button.dataset.boundQuoteMessage) return;
    button.dataset.boundQuoteMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const message = (state.currentThread?.messages || []).find((item) => item.id === button.dataset.quoteMessage);
      setQuotedReply(message);
    });
  });
}

function wireMessageRevokeButtons(root) {
  root?.querySelectorAll?.("[data-revoke-message]").forEach((button) => {
    if (button.dataset.boundRevokeMessage) return;
    button.dataset.boundRevokeMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const messageId = String(button.dataset.revokeMessage || "");
      const threadId = state.currentThread?.id || "";
      if (!messageId || !threadId) return;
      const confirmed = await openAppConfirmDialog({
        title: "撤回群聊消息",
        message: "\u64a4\u56de\u8fd9\u6761\u7fa4\u804a\u6d88\u606f\uff1f",
        confirmLabel: "撤回",
        danger: true,
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        const result = await api(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/revoke`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (result?.thread) state.currentThread = mergeCurrentThread(result.thread);
        if (Array.isArray(result?.messages)) {
          for (const message of result.messages) upsertMessage(message);
        }
        renderCurrentThread({ stickToBottom: false });
      } catch (err) {
        showError(err.message || String(err));
      } finally {
        button.disabled = false;
      }
    });
  });
}

function setQuotedReply(message) {
  const group = messageTaskGroup(message);
  const taskDisplayId = messageTaskDisplayId(message);
  const preview = quotePreviewForMessage(message, group);
  const plan = currentThreadCardMessageModel()?.quotedReplyStatePlan?.({
    singleWindowView: isSingleWindowView(),
    singleWindowChatView: isSingleWindowChatView(),
    message,
    group,
    taskDisplayId,
    shortTaskDisplayId: shortTaskDisplayId(taskDisplayId),
    preview,
  });
  if (plan) {
    if (!plan.ok) return;
    state.quotedReply = plan.quote;
  } else {
    if (!isSingleWindowView() || isSingleWindowChatView() || !message?.taskGroupId) return;
    state.quotedReply = {
      taskGroupId: message.taskGroupId,
      messageId: message.id,
      label: taskDisplayId,
      shortLabel: shortTaskDisplayId(taskDisplayId),
      preview,
    };
  }
  renderQuotedReply();
  configureComposer({ enabled: true, placeholder: "Message Home AI..." });
  focusComposerSoon();
}

function clearQuotedReply(options = {}) {
  state.quotedReply = null;
  if (options.render !== false) {
    renderQuotedReply();
    configureComposer({ enabled: Boolean(state.currentThreadId), placeholder: "Message Home AI..." });
  }
}

function renderQuotedReply() {
  let panel = $("quotedReply");
  const composer = $("composer");
  const input = $("messageInput");
  if (!panel && composer && input) {
    panel = document.createElement("div");
    panel.id = "quotedReply";
    panel.className = "quoted-reply hidden";
    composer.insertBefore(panel, input);
  }
  if (!panel) return;
  const quote = isSingleWindowView() && !isSingleWindowChatView() ? state.quotedReply : null;
  if (!quote) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    delete panel.dataset.messageId;
    delete panel.dataset.taskGroupId;
    return;
  }
  panel.classList.remove("hidden");
  panel.dataset.messageId = quote.messageId || "";
  panel.dataset.taskGroupId = quote.taskGroupId || "";
  panel.innerHTML = `
    <div class="quoted-reply-text" title="Topic ID: ${escapeHtml(quote.label || "topic")}">
      <strong>Topic ID: ${escapeHtml(quote.shortLabel || shortTaskDisplayId(quote.label) || "topic")}</strong>
      <span>${escapeHtml(quote.preview || "")}</span>
    </div>
    <button class="quoted-reply-clear" type="button" aria-label="Clear quoted reply">×</button>
  `;
  panel.querySelector(".quoted-reply-clear")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearQuotedReply();
  });
}

function activeQuotedReplyForSend() {
  const quote = state.viewMode === "single" ? state.quotedReply : null;
  const panel = $("quotedReply");
  const plan = currentThreadCardMessageModel()?.activeQuotedReplyPlan?.({
    singleWindowChatView: isSingleWindowChatView(),
    viewMode: state.viewMode,
    quote,
    panelPresent: Boolean(panel),
    panelHidden: Boolean(panel?.classList?.contains?.("hidden")),
    panelMessageId: panel?.dataset?.messageId,
    panelTaskGroupId: panel?.dataset?.taskGroupId,
  });
  if (plan) return plan.quote || null;
  if (isSingleWindowChatView()) return null;
  if (!quote?.taskGroupId || !quote?.messageId) return null;
  if (!panel || panel.classList.contains("hidden")) return null;
  if (panel.dataset.messageId !== quote.messageId) return null;
  if (panel.dataset.taskGroupId !== quote.taskGroupId) return null;
  return quote;
}
