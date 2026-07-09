"use strict";

const THREAD_LIST_MODEL_ESM_PATH = "/vite-islands/thread-list-model/thread-list-model.js";
let threadListModel = null;
let threadListModelPromise = null;

function importThreadListModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (threadListModel) return Promise.resolve(threadListModel);
  if (threadListModelPromise) return threadListModelPromise;
  const importer = rootRef?.__homeAiImportThreadListModel || ((importPath) => import(importPath));
  threadListModelPromise = Promise.resolve()
    .then(() => importer(THREAD_LIST_MODEL_ESM_PATH))
    .then((model) => {
      threadListModel = model || null;
      return threadListModel;
    })
    .catch((error) => {
      threadListModelPromise = null;
      if (rootRef?.console?.debug) rootRef.console.debug("thread list model unavailable", error?.message || error);
      return null;
    });
  return threadListModelPromise;
}

function currentThreadListModel() {
  return threadListModel;
}

if (typeof window !== "undefined") {
  importThreadListModel(window).catch(() => null);
}

function renderThreads() {
  const plan = currentThreadListModel()?.threadSidebarListPlan?.({
    viewMode: state.viewMode,
    singleWindowMode: state.singleWindowMode,
    currentThreadId: state.currentThreadId,
    threads: (state.threads || []).map((thread) => Object.assign({}, thread, {
      updatedAtLabel: formatTime(thread.updatedAt),
    })),
  });
  const delegate = plan?.delegate || "";
  if ((delegate || state.viewMode) === "automation") {
    renderAutomationView();
    return;
  }
  if ((delegate || state.viewMode) === "inbox") {
    renderActionInboxView();
    return;
  }
  if ((delegate || state.viewMode) === "todos") {
    renderTodoList();
    return;
  }
  if ((delegate || state.viewMode) === "projects") {
    renderDirectorySidebar();
    return;
  }
  const list = $("threadList");
  if (plan?.clearList || state.viewMode === "single" || state.viewMode === "tasks") {
    list.innerHTML = "";
    return;
  }
  if (plan?.empty || !state.threads.length) {
    const emptyText = plan?.emptyText || (state.viewMode === "single" ? (state.singleWindowMode === "chat" ? "聊天为空。" : "话题流为空。") : "No threads in this project.");
    list.innerHTML = `<div class="empty-state small">${escapeHtml(emptyText)}</div>`;
    return;
  }
  const cards = Array.isArray(plan?.cards)
    ? plan.cards
    : state.threads.map((thread) => ({
      type: thread.singleWindowTask ? "projectTask" : "thread",
      id: thread.id,
      active: thread.id === state.currentThreadId,
      sourceThreadId: thread.sourceThreadId || "",
      taskGroupId: thread.taskGroupId || "",
      title: thread.title || thread.taskGroupId || thread.id || "Topic",
      preview: thread.preview || "No messages yet",
      meta: thread.singleWindowTask ? `topic | ${thread.status || "idle"} | ${formatTime(thread.updatedAt)}` : `${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`,
    }));
  list.innerHTML = cards.map((card) => {
    const active = card.active ? " active" : "";
    if (card.type === "projectTask") {
      return `<button class="thread-card project-task-card${active}" type="button" data-project-task-thread="${escapeHtml(card.sourceThreadId || "")}" data-project-task-group="${escapeHtml(card.taskGroupId || "")}">
        <div class="thread-card-title">${escapeHtml(card.title || card.taskGroupId || "Topic")}</div>
        <div class="thread-card-preview">${escapeHtml(card.preview || "No messages yet")}</div>
        <div class="thread-card-meta">${escapeHtml(card.meta || "")}</div>
      </button>`;
    }
    return `<button class="thread-card${active}" type="button" data-thread="${escapeHtml(card.id)}">
      <div class="thread-card-title">${escapeHtml(card.title || card.id)}</div>
      <div class="thread-card-preview">${escapeHtml(card.preview || "No messages yet")}</div>
      <div class="thread-card-meta">${escapeHtml(card.meta || "")}</div>
    </button>`;
  }).join("");
  list.querySelectorAll("[data-project-task-thread]").forEach((button) => {
    button.addEventListener("click", () => openProjectTask(button.dataset.projectTaskThread, button.dataset.projectTaskGroup).catch(showError));
  });
  list.querySelectorAll("[data-thread]").forEach((button) => {
    button.addEventListener("click", () => selectThread(button.dataset.thread).catch(showError));
  });
}

function renderChatScopeHeader(thread) {
  const header = $("chatScopeHeader");
  if (!header) return;
  if (!isSingleWindowChatView() || !thread) {
    header.hidden = true;
    header.innerHTML = "";
    return;
  }
  ensureChatScopeReadBaselines(thread);
  markActiveChatScopeRead(thread);
  const groupSelected = isGroupChatView();
  const canSelectGroup = groupSelected || groupChatSelectable(thread);
  const plan = currentThreadListModel()?.chatScopeHeaderPlan?.({
    singleWindowChatView: isSingleWindowChatView(),
    hasThread: Boolean(thread),
    groupSelected,
    canSelectGroup,
    unread: {
      chat: unreadChatScopeCount(thread, "chat"),
      group: unreadChatScopeCount(thread, "group"),
    },
  });
  const legacyButton = (scope, label, selected, canSelect) => {
    const unread = selected ? 0 : unreadChatScopeCount(thread, scope);
    const countText = unread ? (unread > 99 ? "99+" : String(unread)) : "";
    return {
      scope,
      label,
      selected,
      disabled: !canSelect,
      unreadText: countText,
      ariaLabel: countText ? `${label}\uff0c${countText}\u6761\u672a\u8bfb` : label,
    };
  };
  const buttons = Array.isArray(plan?.buttons)
    ? plan.buttons
    : [
      legacyButton("chat", "\u804a\u5929", !groupSelected, true),
      legacyButton("group", "\u7fa4", groupSelected, canSelectGroup),
    ];
  const scopeButton = (button) => {
    const unreadBadge = button.unreadText
      ? `<span class="chat-scope-header-badge">${escapeHtml(button.unreadText)}</span>`
      : "";
    return `<button class="chat-scope-header-button${button.selected ? " active" : ""}" type="button" role="tab" aria-selected="${button.selected ? "true" : "false"}" aria-label="${escapeHtml(button.ariaLabel || button.label)}" data-chat-scope="${escapeHtml(button.scope)}" ${button.disabled ? "disabled" : ""}>
      ${escapeHtml(button.label)}${unreadBadge}
    </button>`;
  };
  header.hidden = false;
  header.innerHTML = `<div class="chat-scope-segment" role="tablist" aria-label="${"\u804a\u5929\u5207\u6362"}">
    ${buttons.map(scopeButton).join("")}
  </div>`;
  wireChatScopeHeader(header);
}

function renderChatHistoryPager(thread) {
  const page = thread?.messagesPage || {};
  const plan = currentThreadListModel()?.chatHistoryPagerPlan?.({
    singleWindowChatView: isSingleWindowChatView(),
    page,
    messageCount: chatMessagesForThread(thread).length,
    loading: state.olderChatMessagesLoading,
  });
  if (plan && !plan.visible) return "";
  if (!plan && !isSingleWindowChatView()) return "";
  const hasMore = page.hasMoreBefore !== false && Boolean(page.oldestMessageId || page.total > chatMessagesForThread(thread).length);
  if (!plan && !hasMore && !state.olderChatMessagesLoading) return "";
  const loading = plan?.disabled ?? state.olderChatMessagesLoading;
  const label = plan?.label || (state.olderChatMessagesLoading ? "Loading..." : "Load earlier messages");
  return `<div class="chat-history-pager">
    <button type="button" data-load-older-chat ${loading ? "disabled" : ""}>
      ${escapeHtml(label)}
    </button>
  </div>`;
}

function wireChatHistoryPager(root) {
  root?.querySelector?.("[data-load-older-chat]")?.addEventListener("click", () => {
    loadOlderChatMessages().catch(showError);
  });
}

function renderTaskHistoryPager(thread, taskGroupId = state.currentTaskGroupId) {
  const page = thread?.messagesPage || {};
  const messages = typeof taskGroupMessagesForThread === "function"
    ? taskGroupMessagesForThread(thread, taskGroupId)
    : [];
  const plan = currentThreadListModel()?.taskHistoryPagerPlan?.({
    taskDetailView: isTaskDetailView(),
    searchMode: isChatSearchMode(),
    page,
    taskGroupId,
    messageCount: messages.length,
    loading: state.olderTaskMessagesLoading,
  });
  if (plan && !plan.visible) return "";
  if (!plan && (!isTaskDetailView() || isChatSearchMode())) return "";
  const mode = String(page.mode || "").trim().toLowerCase();
  if (!plan && (!["tasks", "task"].includes(mode) || String(page.taskGroupId || "") !== String(taskGroupId || ""))) return "";
  const hasMore = page.hasMoreBefore !== false && Boolean(page.oldestMessageId || page.total > messages.length);
  if (!plan && !hasMore && !state.olderTaskMessagesLoading) return "";
  const loading = plan?.disabled ?? state.olderTaskMessagesLoading;
  const label = plan?.label || (state.olderTaskMessagesLoading ? "加载中..." : "加载更早消息");
  return `<div class="chat-history-pager">
    <button type="button" data-load-older-task ${loading ? "disabled" : ""}>
      ${escapeHtml(label)}
    </button>
  </div>`;
}

function wireTaskHistoryPager(root) {
  root?.querySelector?.("[data-load-older-task]")?.addEventListener("click", () => {
    loadOlderTaskMessages().catch(showError);
  });
}

function wireChatScopeHeader(root) {
  root?.querySelectorAll?.("[data-chat-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      selectChatScope(button.dataset.chatScope).catch(showError);
    });
  });
}

function chatConversationRenderSignature(messages = [], historyPager = "") {
  const plan = currentThreadListModel()?.chatConversationRenderSignaturePlan?.({
    messages,
    historyPager,
    searchOpen: state.chatSearchOpen,
    searchQuery: currentChatSearchQuery(),
    searchIndex: state.chatSearchIndex || 0,
    searchMatches: state.chatSearchMatches || [],
    scope: activeChatScope(),
    threadId: state.currentThreadId || "",
  });
  if (plan?.signature) return plan.signature;
  const searchKey = [
    state.chatSearchOpen ? "1" : "0",
    currentChatSearchQuery(),
    String(state.chatSearchIndex || 0),
    (state.chatSearchMatches || []).join(","),
  ].join("|");
  const messageKey = messages.map((message) => JSON.stringify({
    id: message?.id || "",
    role: message?.role || "",
    status: message?.status || "",
    content: message?.content || "",
    error: message?.error || "",
    usage: message?.usage || null,
    artifacts: message?.artifacts || [],
    revokedAt: message?.revokedAt || "",
    updatedAt: message?.updatedAt || "",
    taskGroupId: message?.taskGroupId || "",
    externalDelivery: message?.externalDelivery || null,
    skills: message?.skills || message?.skillCalls || null,
    runProgress: message?.runProgress || message?.progress || null,
  })).join("\n");
  return JSON.stringify({
    scope: activeChatScope(),
    threadId: state.currentThreadId || "",
    pager: historyPager || "",
    search: searchKey,
    messages: messageKey,
  });
}

function chatMessagesAlreadyRendered(conversation, signature) {
  const plan = currentThreadListModel()?.chatRenderReusePlan?.({
    singleWindowChatView: isSingleWindowChatView(),
    hasConversation: Boolean(conversation),
    signature,
    existingSignature: conversation?.dataset?.chatRenderSignature || "",
    hasRenderedContent: Boolean(conversation?.querySelector?.("[data-message-id], .chat-history-pager, .empty-state")),
  });
  if (plan) return Boolean(plan.reuse);
  return Boolean(
    isSingleWindowChatView()
    && conversation
    && signature
    && conversation.dataset.chatRenderSignature === signature
    && conversation.querySelector("[data-message-id], .chat-history-pager, .empty-state")
  );
}

function wireRenderedChatConversation(conversation) {
  if (typeof hydrateInlineMarkdownImages === "function") hydrateInlineMarkdownImages(conversation);
  wireChatHistoryPager(conversation);
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireSkillLinks(conversation);
  wireUsagePanels(conversation);
  wireMessageSkillPanels(conversation);
  wireRunProgressHistoryPanels(conversation);
  wireLongMessageButtons(conversation);
  wireChatSearchControls(conversation);
  syncRunProgressTicker(conversation);
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  scheduleMessageScrollButtonVisibilitySettle(conversation, [120, 360, 900, 1600]);
}

function refreshRenderedChatConversationVisuals(conversation) {
  if (typeof hydrateInlineMarkdownImages === "function") hydrateInlineMarkdownImages(conversation);
  syncRunProgressTicker(conversation);
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  scheduleMessageScrollButtonVisibilitySettle(conversation, [120, 360, 900, 1600]);
}

function renderCurrentThread(options = {}) {
  try {
    renderCurrentThreadUnsafe(options);
  } catch (err) {
    console.error("renderCurrentThread failed", err);
    showError(err);
    const conversation = $("conversation");
    if (conversation && !conversation.innerHTML.trim()) {
      conversation.innerHTML = `<div class="empty-state">View render failed. Refreshing...</div>`;
    }
    requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 500 });
  }
}

function renderCurrentThreadUnsafe(options = {}) {
  renderChatScopeHeader(null);
  if (typeof commitPendingMainConversationSurfacePark === "function") commitPendingMainConversationSurfacePark();
  if (isSkillDetailView()) {
    renderSkillDetailPanel();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "inbox") {
    renderActionInboxView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoPanel();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectoryView();
    return;
  }
  const thread = state.currentThread;
  const conversation = $("conversation");
  if (thread && typeof retainRestoredMainConversationSurfaceIfFresh === "function" && retainRestoredMainConversationSurfaceIfFresh(options)) return;
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const forceChatBottom = readAnchorActive || userScrollProtected ? false : shouldForceChatStickToBottom();
  const stickToBottom = !readAnchorActive && !userScrollProtected && Boolean(options.stickToBottom || forceChatBottom);
  let bottomOffset = state.preservedBottomOffset;
  if (forceChatBottom) bottomOffset = 0;
  if (!stickToBottom && conversation.scrollHeight) {
    bottomOffset = conversation.scrollHeight - conversation.scrollTop;
  }
  if (!thread) {
    $("threadTitle").textContent = "Select or create a thread";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "Message Home AI..." });
    delete conversation.dataset.chatRenderSignature;
    conversation.innerHTML = `<div class="empty-state">Create a thread to start a zero-context Home AI task.</div>`;
    updateNavigationControls();
    ensureVerticalScrollAffordance(conversation);
    return;
  }
  if (state.viewMode === "tasks" && thread.singleWindow) {
    renderTaskWindow(thread, conversation, options, bottomOffset);
    return;
  }
  updateNavigationControls();
  configureComposer({ enabled: true, placeholder: "Message Home AI..." });
  const infoStream = isSingleWindowView();
  const groupChat = isGroupChatView();
  $("threadTitle").textContent = infoStream
    ? (state.singleWindowMode === "chat" ? (groupChat ? "群聊" : "聊天") : "话题流")
    : (thread.title || thread.id);
  renderChatScopeHeader(thread);
  if (isSingleWindowChatView()) $("threadTitle").textContent = "";
  const project = state.projects.find((item) => item.id === thread.projectId);
  const subproject = (project?.children || []).find((item) => item.id === thread.subprojectId);
  let displayMessages = isSingleWindowChatView() ? chatMessagesForThread(thread) : (thread.messages || []);
  if (isSingleWindowChatView() && !displayMessages.length && (thread.messages || []).length) {
    const cached = chatMessagesForThread(chatScopeThread(thread, activeChatScope()));
    displayMessages = cached.length ? cached : displayMessages;
  }
  const activeRuns = isSingleWindowChatView() ? activeChatRunIds(thread) : activeThreadRunIds(thread);
  const projectScope = project ? projectDisplayLabel(project) : "";
  const scope = infoStream || thread.singleWindow
    ? ""
    : subproject
    ? `${projectScope || thread.projectId} / ${subproject.label || subproject.id}`
    : (projectScope || thread.projectId || "general");
  $("threadMeta").textContent = groupChat
    ? groupChatMemberLabels(thread).join(" · ")
    : (scope ? `${scope} | session ${thread.hermesSessionId || ""}` : "");
  $("interruptRun").disabled = !activeRuns.length;
  if (isSingleWindowChatView()) $("threadMeta").textContent = "";
  if (isSingleWindowChatView()) {
    syncChatSearchMatches();
  }
  const historyPager = renderChatHistoryPager(thread);
  const transientChatGap = isSingleWindowChatView()
    && !displayMessages.length
    && (thread.messages || []).length
    && (
      (!userScrollProtected && shouldForceChatStickToBottom())
      || currentThreadHasPendingMessages(thread)
      || state.currentThreadRefreshInFlight
    );
  const keepRenderedChatMessages = isSingleWindowChatView()
    && !displayMessages.length
    && conversation.querySelector("[data-message-id]")
    && (
      transientChatGap
      || (!userScrollProtected && shouldForceChatStickToBottom())
      || currentThreadHasPendingMessages(thread)
      || state.currentThreadRefreshInFlight
    );
  if (keepRenderedChatMessages) {
    requestCurrentThreadRefresh({ stickToBottom: !readAnchorActive && !userScrollProtected, delayMs: 120 });
    scheduleConversationViewportRefresh(conversation);
    return;
  }
  const chatRenderSignature = isSingleWindowChatView()
    ? chatConversationRenderSignature(displayMessages, historyPager)
    : "";
  if (chatMessagesAlreadyRendered(conversation, chatRenderSignature)) {
    refreshRenderedChatConversationVisuals(conversation);
    if (readAnchorActive && typeof restoreConversationReadAnchorScroll === "function" && restoreConversationReadAnchorScroll(conversation)) {
      state.conversationPinnedToBottom = false;
    } else if (stickToBottom) {
      conversation.scrollTop = conversation.scrollHeight;
      state.conversationPinnedToBottom = true;
      scheduleConversationBottomStick();
    } else {
      state.conversationPinnedToBottom = isNearBottom();
    }
    if (isSingleWindowChatView()) scheduleConversationViewportRefresh(conversation);
    return;
  }
  conversation.innerHTML = `${historyPager}${displayMessages.map(renderMessage).join("") || `<div class="empty-state">${transientChatGap ? "Refreshing messages..." : "No messages yet."}</div>`}`;
  if (chatRenderSignature) conversation.dataset.chatRenderSignature = chatRenderSignature;
  else delete conversation.dataset.chatRenderSignature;
  wireRenderedChatConversation(conversation);
  if (consumeChatRouteScrollTarget(displayMessages)) {
    if (isSingleWindowChatView()) scheduleConversationViewportRefresh(conversation);
  } else if (state.chatSearchScrollPending) {
    state.chatSearchScrollPending = false;
    requestAnimationFrame(() => scrollToCurrentChatSearchMatch(conversation));
  } else if (readAnchorActive && typeof restoreConversationReadAnchorScroll === "function" && restoreConversationReadAnchorScroll(conversation)) {
    state.conversationPinnedToBottom = false;
  } else if (stickToBottom) {
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
    if (isSingleWindowChatView()) scheduleConversationBottomStick();
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
  if (isSingleWindowChatView()) scheduleConversationViewportRefresh(conversation);
}

function taskGroupHasPendingMessages(thread = state.currentThread, taskGroupId = "") {
  const plan = currentThreadListModel()?.taskGroupPendingMessagesPlan?.({ thread, taskGroupId });
  if (plan) return Boolean(plan.pending);
  const id = String(taskGroupId || "").trim();
  if (!thread || !id) return false;
  return (thread.messages || []).some((message) => (
    String(message?.taskGroupId || "") === id
    && ["queued", "running"].includes(String(message?.status || ""))
  ));
}

function setTopicPluginDock(html = "") {
  const dock = $("topicPluginDock");
  if (!dock) return;
  const content = String(html || "").trim();
  dock.innerHTML = content
    ? `${content}${typeof renderGlobalPluginDockHandle === "function" ? renderGlobalPluginDockHandle() : ""}`
    : "";
  const hasDockContent = Boolean(dock.innerHTML.trim());
  dock.hidden = true;
  dock.setAttribute("aria-hidden", "true");
  if (hasDockContent && typeof syncGlobalPluginDockState === "function") syncGlobalPluginDockState(dock);
  if (hasDockContent && typeof wirePluginTopicCards === "function") wirePluginTopicCards(dock);
  if (hasDockContent && typeof wireGlobalPluginDockGestures === "function") wireGlobalPluginDockGestures(dock);
  if (typeof updateTopicPluginDockChrome === "function") {
    updateTopicPluginDockChrome(hasDockContent && typeof isTaskListView === "function" ? isTaskListView() : false);
  }
}

function directoryTopicRenderSignature(threadId = "", groups = [], collections = null) {
  const plan = currentThreadListModel()?.directoryTopicRenderSignaturePlan?.({
    threadId,
    collections,
    groups: Array.isArray(collections) ? [] : (groups || []).map((group) => ({
      id: group?.id || "",
      routeKey: typeof directoryTopicPrimaryRoute === "function"
        ? directoryTopicRouteKey(directoryTopicPrimaryRoute(group), group)
        : "",
      pluginTopic: Boolean(group?.pluginTopic),
      sharedTopic: Boolean(group?.sharedTopic),
      sourceThreadId: group?.sourceThreadId || "",
    })),
  });
  if (plan?.signature) return plan.signature;
  if (Array.isArray(collections)) {
    const entries = collections.map((collection) => [
      collection?.key || "",
      collection?.updatedAt || "",
      (collection?.groups || []).map((group) => group?.id || "").join(","),
    ].join(":")).sort();
    return [threadId || "", entries.join("|")].join("::");
  }
  const entries = (groups || []).map((group) => {
    const routeKey = typeof directoryTopicPrimaryRoute === "function"
      ? directoryTopicRouteKey(directoryTopicPrimaryRoute(group), group)
      : "";
    return [
      group?.id || "",
      routeKey,
      group?.pluginTopic ? "plugin" : "",
      group?.sharedTopic ? "shared" : "",
      group?.sourceThreadId || "",
    ].join(":");
  }).sort();
  return [threadId || "", entries.join("|")].join("::");
}

function renderTaskWindow(thread, conversation, options, bottomOffset) {
  delete conversation.dataset.chatRenderSignature;
  const pluginTopicGroups = typeof pluginTopicGroupsForTaskList === "function"
    ? pluginTopicGroupsForTaskList(thread)
    : [];
  const allGroups = taskListGroupsForThread(thread)
    .filter(topicGroupVisibleInTaskList)
    .concat(sharedCaseTopicGroupsForTaskList(thread))
    .concat(pluginTopicGroups)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const displayGroups = allGroups.slice();
  const search = currentSearchText().toLowerCase();
  const groups = displayGroups.filter((group) => {
    if (!taskMatchesDirectoryFilter(group)) return false;
    if (!search) return true;
    const skillText = taskSkills(group).map((skill) => `${skill.label} ${skill.path}`).join("\n");
    return `${taskDisplayId(group)}\n${taskTitle(group)}\n${taskPrompt(group)}\n${taskSummary(group)}\n${skillText}`.toLowerCase().includes(search);
  });
  const selected = allGroups.find((group) => group.id === state.currentTaskGroupId) || null;
  const allActiveRuns = activeThreadRunIds(thread);

  if (state.currentTaskGroupId && !selected) {
    if (taskGroupHasPendingMessages(thread, state.currentTaskGroupId) || state.currentThreadRefreshInFlight) {
      $("threadTitle").textContent = "";
      $("threadMeta").textContent = "";
      $("interruptRun").disabled = !allActiveRuns.length;
      configureComposer({ enabled: false, placeholder: "Restoring topic..." });
      conversation.innerHTML = `<div class="empty-state">Restoring topic...</div>`;
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 220 });
      updateNavigationControls();
      ensureVerticalScrollAffordance(conversation);
      scheduleMessageScrollButtonVisibility(conversation);
      return;
    }
    if (state.routeScrollTaskGroupId === state.currentTaskGroupId) clearRouteScrollTarget();
    state.currentTaskGroupId = "";
  }
  if (!state.currentTaskGroupId) {
    $("threadTitle").textContent = "话题列表";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !allActiveRuns.length;
    const directoryTopicDraftOpen = typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive();
    configureComposer({
      enabled: false,
      hidden: true,
      placeholder: "Open a topic to reply",
    });
    if (directoryTopicDraftOpen && state.pendingTaskDirectory?.projectId) {
      const label = String(state.pendingTaskDirectory.label || state.pendingTaskDirectory.projectId || "").trim();
      $("threadTitle").textContent = "新建话题";
      configureComposer({
        enabled: true,
        hidden: false,
        placeholder: label ? `Message ${label}...` : "Message this directory...",
      });
      conversation.innerHTML = `<div class="empty-state">${escapeHtml(label ? `Start a topic for ${label}.` : "Start a topic for this directory.")}</div>`;
      setTopicPluginDock("");
      wireTaskDirectoryFilterControls(conversation);
      wireSkillLinks(conversation);
      updateNavigationControls();
      ensureVerticalScrollAffordance(conversation);
      scheduleMessageScrollButtonVisibility(conversation);
      focusComposerSoon();
      return;
    }
    const indexedDirectoryTopicCollections = Array.isArray(thread.directoryTopicCollections)
      ? thread.directoryTopicCollections
      : null;
    const directoryTopicSourceGroups = groups.filter((group) => !(typeof isPluginTopicTaskGroup === "function" ? isPluginTopicTaskGroup(group) : group.pluginTopic));
    const computedDirectoryTopicCollections = !indexedDirectoryTopicCollections && typeof directoryTopicCollectionsForGroups === "function"
      ? directoryTopicCollectionsForGroups(directoryTopicSourceGroups)
      : null;
    const directoryTopicSignature = directoryTopicRenderSignature(thread.id, groups, indexedDirectoryTopicCollections);
    const directoryTopicCollectionsReady = options.directoryTopicCollectionsReady === true
      || Boolean(indexedDirectoryTopicCollections)
      || Boolean(computedDirectoryTopicCollections)
      || state.directoryTopicCollectionsReadySignature === directoryTopicSignature;
    if (directoryTopicCollectionsReady) {
      state.directoryTopicCollectionsReadySignature = directoryTopicSignature;
      state.directoryTopicRenderPendingSignature = "";
    }
    const rawDirectoryTopicCollections = indexedDirectoryTopicCollections || computedDirectoryTopicCollections || [];
    const claimedDirectoryTopicCollections = typeof pluginTopicClaimedDirectoryTopicCollections === "function"
      ? pluginTopicClaimedDirectoryTopicCollections(rawDirectoryTopicCollections)
      : [];
    const directoryTopicCollections = typeof pluginTopicFilterDirectoryTopicCollectionsForRoot === "function"
      ? pluginTopicFilterDirectoryTopicCollectionsForRoot(rawDirectoryTopicCollections)
      : rawDirectoryTopicCollections;
    const directoryTopicGroupIds = typeof directoryTopicCollectionGroupIds === "function"
      ? directoryTopicCollectionGroupIds(directoryTopicCollections)
      : new Set();
    const allDirectoryTopicGroupIds = typeof directoryTopicCollectionGroupIds === "function"
      ? directoryTopicCollectionGroupIds(rawDirectoryTopicCollections)
      : directoryTopicGroupIds;
    const filterBanner = renderTaskDirectoryFilterBanner();
    const pluginTopicCards = typeof renderPluginTopicCards === "function"
      ? renderPluginTopicCards({
        claimedDirectoryTopicCollections,
      })
      : "";
    const pluginAppDock = typeof renderPluginAppLauncher === "function" ? renderPluginAppLauncher() : "";
    const directoryTopicCards = typeof renderDirectoryTopicCards === "function"
      ? renderDirectoryTopicCards(directoryTopicCollections, { associatedWithDirectoryPlugin: true })
      : "";
    const regularGroups = groups.filter((group) => {
      if (typeof isPluginTopicTaskGroup === "function" ? isPluginTopicTaskGroup(group) : group.pluginTopic) return false;
      const hasDirectoryTopicRoute = typeof directoryTopicPrimaryRoute === "function"
        ? Boolean(directoryTopicPrimaryRoute(group))
        : false;
      return directoryTopicCollectionsReady ? !allDirectoryTopicGroupIds.has(group.id) : !hasDirectoryTopicRoute;
    });
    conversation.innerHTML = regularGroups.length || pluginTopicCards || directoryTopicCards
      ? `${filterBanner}${pluginTopicCards}${directoryTopicCards}<div class="task-grid">${regularGroups.map(renderTaskCard).join("")}</div>`
      : `${filterBanner}${pluginTopicCards}${directoryTopicCards}<div class="empty-state">${state.taskDirectoryFilter ? "No topics in this directory." : "No topics yet. Send a message to create one."}</div>`;
    setTopicPluginDock(pluginAppDock);
    conversation.querySelectorAll("[data-open-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const sourceThreadId = String(button.dataset.openTaskThread || "");
        if (sourceThreadId && sourceThreadId !== state.currentThreadId) {
          openSharedTaskGroupFromList(sourceThreadId, button.dataset.openTask).catch(showError);
          return;
        }
        openTaskGroupFromList(button.dataset.openTask);
      });
    });
    wireTaskDocumentLinks(conversation);
    wireTaskSwipeActions(conversation);
    wireTaskCardMenus(conversation);
    wireTaskDirectoryFilterControls(conversation);
    if (typeof wirePluginTopicCards === "function") wirePluginTopicCards(conversation);
    if (typeof wireDirectoryTopicCards === "function") wireDirectoryTopicCards(conversation);
    wireSkillLinks(conversation);
    if (!directoryTopicCollectionsReady && typeof directoryTopicCollectionsForGroups === "function") {
      scheduleDeferredDirectoryTopicRender(thread.id, options.restoreScrollTop, directoryTopicSignature);
    }
  } else {
    if (isChatSearchMode()) syncChatSearchMatches();
    const selectedMessages = typeof taskGroupMessagesForThread === "function"
      ? taskGroupMessagesForThread(thread, selected.id, selected.messages || [])
      : (selected.messages || []);
    const groupActiveRuns = selectedMessages
      .filter((message) => ["queued", "running"].includes(message.status))
      .map((message) => message.runId)
      .filter(Boolean);
    $("threadTitle").textContent = "";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !groupActiveRuns.length;
    const sharedChatDisabled = sharedTopicChatDisabledForSelectedWorkspace(selected);
    configureComposer({
      enabled: !sharedChatDisabled,
      placeholder: sharedChatDisabled
        ? "\u65e0\u6743\u53d1\u8a00"
        : (selected.sharedTopic ? "\u53d1\u5230\u5b66\u4e60\u8bdd\u9898\uff1b@ChatGPT \u624d\u4f1a\u8c03\u7528 AI" : "Reply in this task..."),
    });
    const keepRenderedTaskMessages = !selectedMessages.length
      && conversation.querySelector("[data-message-id]")
      && (
        currentThreadHasPendingMessages(thread)
        || state.currentThreadRefreshInFlight
        || groupActiveRuns.length
      );
    if (keepRenderedTaskMessages) {
      requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 120 });
      scheduleConversationViewportRefresh(conversation);
      return;
    }
    const taskHistoryPager = renderTaskHistoryPager(thread, selected.id);
    conversation.innerHTML = `${taskHistoryPager}${selectedMessages.map(renderMessage).join("") || `<div class="empty-state">No task messages yet.</div>`}`;
    renderTaskDetailToolbar(selected);
  }
  if (typeof hydrateInlineMarkdownImages === "function") hydrateInlineMarkdownImages(conversation);
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireSkillLinks(conversation);
  wireQuoteButtons(conversation);
  wireTaskHistoryPager(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireUsagePanels(conversation);
  wireMessageSkillPanels(conversation);
  wireRunProgressHistoryPanels(conversation);
  wireLongMessageButtons(conversation);
  syncRunProgressTicker(conversation);
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  scheduleMessageScrollButtonVisibilitySettle(conversation, [120, 360, 900, 1600]);

  if (selected && consumeTaskRouteScrollTarget(selected)) {
    return;
  }
  const readAnchorActive = typeof conversationReadAnchorActive === "function" && conversationReadAnchorActive(conversation);
  if (readAnchorActive && typeof restoreConversationReadAnchorScroll === "function" && restoreConversationReadAnchorScroll(conversation)) {
    state.conversationPinnedToBottom = false;
  } else if (!state.currentTaskGroupId && Number.isFinite(Number(options.restoreScrollTop))) {
    const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
    conversation.scrollTop = Math.min(maxTop, Math.max(0, Number(options.restoreScrollTop) || 0));
    state.conversationPinnedToBottom = false;
  } else if (!readAnchorActive && options.stickToBottom) {
    conversation.scrollTop = state.currentTaskGroupId ? conversation.scrollHeight : 0;
    state.conversationPinnedToBottom = Boolean(state.currentTaskGroupId);
  } else if (!readAnchorActive && Date.now() < Number(state.forceChatStickToBottomUntil || 0) && state.currentTaskGroupId) {
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
  if (state.currentTaskGroupId) scheduleConversationViewportRefresh(conversation);
}

function scheduleDeferredDirectoryTopicRender(threadId = "", restoreScrollTop = null, signature = "") {
  if (signature && state.directoryTopicCollectionsReadySignature === signature) return;
  if (state.directoryTopicRenderPending && (!signature || state.directoryTopicRenderPendingSignature === signature)) return;
  state.directoryTopicRenderPending = true;
  state.directoryTopicRenderPendingSignature = signature || state.directoryTopicRenderPendingSignature || "";
  const currentScrollTop = $("conversation")?.scrollTop || 0;
  const scheduledScrollTop = currentScrollTop;
  const nextRestoreScrollTop = Number.isFinite(Number(restoreScrollTop))
    ? Math.max(0, Number(restoreScrollTop) || 0)
    : currentScrollTop;
  const expectedSignature = state.directoryTopicRenderPendingSignature;
  const renderDeferred = () => {
    state.directoryTopicRenderPending = false;
    state.directoryTopicRenderPendingSignature = "";
    if (state.viewMode !== "tasks" || state.currentTaskGroupId) return;
    if (state.scrollFeedback?.dragging || state.taskSwipe?.dragging || state.sidebarSwipe?.dragging) {
      scheduleDeferredDirectoryTopicRender(threadId, $("conversation")?.scrollTop || nextRestoreScrollTop, expectedSignature);
      return;
    }
    if (threadId && state.currentThread?.id !== threadId) return;
    if (expectedSignature && state.directoryTopicCollectionsReadySignature === expectedSignature) return;
    const liveScrollTop = $("conversation")?.scrollTop || 0;
    const restoreAtRenderTop = Math.abs(liveScrollTop - scheduledScrollTop) > 1
      ? liveScrollTop
      : nextRestoreScrollTop;
    renderCurrentThread({
      stickToBottom: false,
      restoreScrollTop: restoreAtRenderTop,
      directoryTopicCollectionsReady: true,
    });
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(renderDeferred);
  });
}
