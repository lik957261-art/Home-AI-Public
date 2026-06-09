"use strict";

function renderThreads() {
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "inbox") {
    renderActionInboxView();
    return;
  }
  if (state.viewMode === "learning") {
    renderLearningCoinsView();
    return;
  }
  if (state.viewMode === "todos") {
    renderTodoList();
    return;
  }
  if (state.viewMode === "projects") {
    renderDirectorySidebar();
    return;
  }
  const list = $("threadList");
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    list.innerHTML = "";
    return;
  }
  if (!state.threads.length) {
    list.innerHTML = `<div class="empty-state small">${state.viewMode === "single" ? (state.singleWindowMode === "chat" ? "聊天为空。" : "话题流为空。") : "No threads in this project."}</div>`;
    return;
  }
  list.innerHTML = state.threads.map((thread) => {
    const active = thread.id === state.currentThreadId ? " active" : "";
    if (thread.singleWindowTask) {
      return `<button class="thread-card project-task-card${active}" type="button" data-project-task-thread="${escapeHtml(thread.sourceThreadId || "")}" data-project-task-group="${escapeHtml(thread.taskGroupId || "")}">
        <div class="thread-card-title">${escapeHtml(thread.title || thread.taskGroupId || "Topic")}</div>
        <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
        <div class="thread-card-meta">${escapeHtml(`topic | ${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
      </button>`;
    }
    return `<button class="thread-card${active}" type="button" data-thread="${escapeHtml(thread.id)}">
      <div class="thread-card-title">${escapeHtml(thread.title || thread.id)}</div>
      <div class="thread-card-preview">${escapeHtml(thread.preview || "No messages yet")}</div>
      <div class="thread-card-meta">${escapeHtml(`${thread.status || "idle"} | ${formatTime(thread.updatedAt)}`)}</div>
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
  if (!isSingleWindowChatView() || !thread || isWeixinChatView()) {
    if (thread && isWeixinChatView()) markActiveChatScopeRead(thread);
    header.hidden = true;
    header.innerHTML = "";
    return;
  }
  ensureChatScopeReadBaselines(thread);
  markActiveChatScopeRead(thread);
  const groupSelected = isGroupChatView();
  const canSelectGroup = groupSelected || groupChatSelectable(thread);
  const scopeButton = (scope, label, selected, canSelect) => {
    const unread = selected ? 0 : unreadChatScopeCount(thread, scope);
    const unreadText = unread > 99 ? "99+" : String(unread);
    const unreadBadge = unread
      ? `<span class="chat-scope-header-badge">${escapeHtml(unreadText)}</span>`
      : "";
    const ariaLabel = unread ? `${label}\uff0c${unreadText}\u6761\u672a\u8bfb` : label;
    return `<button class="chat-scope-header-button${selected ? " active" : ""}" type="button" role="tab" aria-selected="${selected ? "true" : "false"}" aria-label="${escapeHtml(ariaLabel)}" data-chat-scope="${escapeHtml(scope)}" ${canSelect ? "" : "disabled"}>
      ${escapeHtml(label)}${unreadBadge}
    </button>`;
  };
  header.hidden = false;
  header.innerHTML = `<div class="chat-scope-segment" role="tablist" aria-label="${"\u804a\u5929\u5207\u6362"}">
    ${scopeButton("chat", "\u804a\u5929", !groupSelected, true)}
    ${scopeButton("group", "\u7fa4", groupSelected, canSelectGroup)}
  </div>`;
  wireChatScopeHeader(header);
}

function renderChatHistoryPager(thread) {
  if (!isSingleWindowChatView()) return "";
  const page = thread?.messagesPage || {};
  const hasMore = page.hasMoreBefore !== false && Boolean(page.oldestMessageId || page.total > chatMessagesForThread(thread).length);
  if (!hasMore && !state.olderChatMessagesLoading) return "";
  return `<div class="chat-history-pager">
    <button type="button" data-load-older-chat ${state.olderChatMessagesLoading ? "disabled" : ""}>
      ${state.olderChatMessagesLoading ? "Loading..." : "Load earlier messages"}
    </button>
  </div>`;
}

function wireChatHistoryPager(root) {
  root?.querySelector?.("[data-load-older-chat]")?.addEventListener("click", () => {
    loadOlderChatMessages().catch(showError);
  });
}

function wireChatScopeHeader(root) {
  root?.querySelectorAll?.("[data-chat-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      selectChatScope(button.dataset.chatScope).catch(showError);
    });
  });
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
  const forceChatBottom = shouldForceChatStickToBottom();
  const stickToBottom = Boolean(options.stickToBottom || forceChatBottom);
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
  const weixinChat = isWeixinChatView();
  const groupChat = isGroupChatView();
  $("threadTitle").textContent = infoStream
    ? (state.singleWindowMode === "chat" ? (groupChat ? "群聊" : "聊天") : "话题流")
    : (thread.title || thread.id);
  renderChatScopeHeader(thread);
  if (isSingleWindowChatView()) $("threadTitle").textContent = "";
  if (weixinChat) $("threadTitle").textContent = "\u5fae\u4fe1";
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
    && (shouldForceChatStickToBottom() || currentThreadHasPendingMessages(thread) || state.currentThreadRefreshInFlight);
  const keepRenderedChatMessages = isSingleWindowChatView()
    && !displayMessages.length
    && conversation.querySelector("[data-message-id]")
    && (
      transientChatGap
      || shouldForceChatStickToBottom()
      || currentThreadHasPendingMessages(thread)
      || state.currentThreadRefreshInFlight
    );
  if (keepRenderedChatMessages) {
    requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 120 });
    scheduleConversationViewportRefresh(conversation);
    return;
  }
  conversation.innerHTML = `${historyPager}${displayMessages.map(renderMessage).join("") || `<div class="empty-state">${transientChatGap ? "Refreshing messages..." : "No messages yet."}</div>`}`;
  wireChatHistoryPager(conversation);
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
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
  if (consumeChatRouteScrollTarget(displayMessages)) {
    if (isSingleWindowChatView()) scheduleConversationViewportRefresh(conversation);
  } else if (state.chatSearchScrollPending) {
    state.chatSearchScrollPending = false;
    requestAnimationFrame(() => scrollToCurrentChatSearchMatch(conversation));
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
  dock.innerHTML = String(html || "");
  dock.hidden = !dock.innerHTML.trim();
  dock.setAttribute("aria-hidden", dock.hidden ? "true" : "false");
  if (!dock.hidden && typeof wirePluginTopicCards === "function") wirePluginTopicCards(dock);
  if (typeof updateTopicPluginDockChrome === "function") updateTopicPluginDockChrome(isTaskListView());
}

function directoryTopicRenderSignature(threadId = "", groups = []) {
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
  setTopicPluginDock("");
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
    const directoryTopicSignature = directoryTopicRenderSignature(thread.id, groups);
    const directoryTopicCollectionsReady = options.directoryTopicCollectionsReady === true
      || state.directoryTopicCollectionsReadySignature === directoryTopicSignature;
    if (directoryTopicCollectionsReady) {
      state.directoryTopicCollectionsReadySignature = directoryTopicSignature;
      state.directoryTopicRenderPendingSignature = "";
    }
    const directoryTopicCollections = directoryTopicCollectionsReady && typeof directoryTopicCollectionsForGroups === "function"
      ? directoryTopicCollectionsForGroups(groups.filter((group) => !(typeof isPluginTopicTaskGroup === "function" ? isPluginTopicTaskGroup(group) : group.pluginTopic)))
      : [];
    const directoryTopicGroupIds = typeof directoryTopicCollectionGroupIds === "function"
      ? directoryTopicCollectionGroupIds(directoryTopicCollections)
      : new Set();
    const filterBanner = renderTaskDirectoryFilterBanner();
    const capabilityEntryHub = typeof renderCapabilityEntryHub === "function"
      ? renderCapabilityEntryHub({
        directoryRootCount: Array.isArray(state.projects) ? state.projects.length : 0,
        directoryTopicCount: directoryTopicCollectionsReady ? directoryTopicGroupIds.size : 0,
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
      return directoryTopicCollectionsReady ? !directoryTopicGroupIds.has(group.id) : !hasDirectoryTopicRoute;
    });
    conversation.innerHTML = regularGroups.length || capabilityEntryHub || directoryTopicCards
      ? `${filterBanner}${capabilityEntryHub}${directoryTopicCards}<div class="task-grid">${regularGroups.map(renderTaskCard).join("")}</div>`
      : `${filterBanner}${capabilityEntryHub}${directoryTopicCards}<div class="empty-state">${state.taskDirectoryFilter ? "No topics in this directory." : "No topics yet. Send a message to create one."}</div>`;
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
    const groupActiveRuns = (selected.messages || [])
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
    const selectedMessages = selected.messages || [];
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
    conversation.innerHTML = `${selectedMessages.map(renderMessage).join("") || `<div class="empty-state">No task messages yet.</div>`}`;
    renderTaskDetailToolbar(selected);
  }
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireSkillLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
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
  if (!state.currentTaskGroupId && Number.isFinite(Number(options.restoreScrollTop))) {
    const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
    conversation.scrollTop = Math.min(maxTop, Math.max(0, Number(options.restoreScrollTop) || 0));
    if (capabilityEntryHub && conversation.scrollTop > 0 && conversation.scrollTop <= 52) {
      conversation.scrollTop = 0;
    }
    state.conversationPinnedToBottom = false;
  } else if (options.stickToBottom) {
    conversation.scrollTop = state.currentTaskGroupId ? conversation.scrollHeight : 0;
    state.conversationPinnedToBottom = Boolean(state.currentTaskGroupId);
  } else if (Date.now() < Number(state.forceChatStickToBottomUntil || 0) && state.currentTaskGroupId) {
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
    renderCurrentThread({
      stickToBottom: false,
      restoreScrollTop: nextRestoreScrollTop,
      directoryTopicCollectionsReady: true,
    });
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(renderDeferred);
  });
}
