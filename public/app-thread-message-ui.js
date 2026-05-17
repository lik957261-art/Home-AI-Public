"use strict";


async function createThread() {
  clearQuotedReply({ render: false });
  if (state.viewMode === "single") {
    await loadSingleWindow();
    return;
  }
  if (state.viewMode === "todos") {
    state.selectedTodoId = "";
    if (!state.todoCreateOpen) {
      state.kanbanComposerMessages = [];
      state.kanbanPlanDraft = null;
      finishKanbanComposerProgress();
    }
    state.todoCreateOpen = true;
    await loadTodos();
    if (isMobileLayout()) closeSidebar();
    focusTodoFormSoon();
    return;
  }
  if (state.viewMode === "tasks") {
    state.currentTaskGroupId = "";
    if (isMobileLayout()) closeSidebar();
    if (isCurrentSingleWindowLoaded()) {
      renderThreads();
      renderCurrentThread({ stickToBottom: true });
      focusComposerSoon();
      return;
    }
    await loadSingleWindow();
    focusComposerSoon();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
    return;
  }
  if (state.viewMode === "learning") {
    renderLearningCoinsView();
    return;
  }
  if (state.viewMode === "projects") {
    await loadDirectoryView();
    return;
  }
  state.transientProjectRoute = null;
  if (isMobileLayout()) closeSidebar();
  const draft = createDraftThread();
  state.currentThread = draft;
  state.currentThreadId = draft.id;
  state.threads = [draft, ...state.threads.filter((thread) => !isDraftThread(thread))];
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  focusComposerSoon();
}

async function selectThread(threadId) {
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.currentThreadId = threadId;
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
  if (isMobileLayout()) closeSidebar();
}

async function openProjectTask(sourceThreadId, taskGroupId) {
  if (!sourceThreadId || !taskGroupId) return;
  clearQuotedReply({ render: false });
  state.transientProjectRoute = null;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentThreadId = sourceThreadId;
  const result = await api(`/api/threads/${encodeURIComponent(sourceThreadId)}`);
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentTaskGroupId = taskGroupId;
  state.threads = [summarizeThread(state.currentThread)];
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

function configureComposer(options = {}) {
  const enabled = Boolean(options.enabled);
  const searchMode = isChatSearchMode();
  setComposerEditorEnabled(enabled || searchMode);
  setComposerPlaceholder(searchMode ? "搜索聊天" : composerPlaceholder(options.placeholder || "Message Hermes..."));
  $("attachFile").disabled = searchMode ? false : !enabled;
  $("sendMessage").disabled = searchMode ? !currentChatSearchDraft() : !enabled;
  updateComposerAction();
  renderQuotedReply();
}

function setComposerEnabled(enabled) {
  configureComposer({ enabled, placeholder: $("messageInput")?.dataset.placeholder || "Message Hermes..." });
}

function setComposerEditorEnabled(enabled) {
  const input = $("messageInput");
  if (!input) return;
  if ("disabled" in input) input.disabled = !enabled;
  else input.setAttribute("contenteditable", enabled ? "plaintext-only" : "false");
  input.dataset.disabled = enabled ? "" : "true";
  input.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setComposerPlaceholder(text) {
  const input = $("messageInput");
  if (input) {
    input.dataset.placeholder = text || "";
    if ("placeholder" in input) input.placeholder = text || "";
  }
}

function composerPlaceholder(fallback) {
  return isSingleWindowView() && !isSingleWindowChatView() && state.quotedReply ? "Reply to quoted task..." : fallback;
}

function renderThreads() {
  if (state.viewMode === "automation") {
    renderAutomationView();
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
  renderChatScopeHeader(null);
  if (isSkillDetailView()) {
    renderSkillDetailPanel();
    return;
  }
  if (state.viewMode === "automation") {
    renderAutomationView();
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
  let bottomOffset = state.preservedBottomOffset;
  if (!options.stickToBottom && conversation.scrollHeight) {
    bottomOffset = conversation.scrollHeight - conversation.scrollTop;
  }
  if (!thread) {
    $("threadTitle").textContent = "Select or create a thread";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "Message Hermes..." });
    conversation.innerHTML = `<div class="empty-state">Create a thread to start a zero-context Hermes task.</div>`;
    updateNavigationControls();
    ensureVerticalScrollAffordance(conversation);
    return;
  }
  if (state.viewMode === "tasks" && thread.singleWindow) {
    renderTaskWindow(thread, conversation, options, bottomOffset);
    return;
  }
  updateNavigationControls();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
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
  const displayMessages = isSingleWindowChatView() ? chatMessagesForThread(thread) : (thread.messages || []);
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
  const progressPanel = renderRunProgressPanel(thread, activeRuns);
  const historyPager = renderChatHistoryPager(thread);
  conversation.innerHTML = `${historyPager}${progressPanel}${displayMessages.map(renderMessage).join("") || `<div class="empty-state">No messages yet.</div>`}`;
  wireChatHistoryPager(conversation);
  wireTaskDocumentLinks(conversation);
  wireDirectoryProjectLinks(conversation);
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
  wireUsagePanels(conversation);
  wireChatSearchControls(conversation);
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  if (state.chatSearchScrollPending) {
    state.chatSearchScrollPending = false;
    requestAnimationFrame(() => scrollToCurrentChatSearchMatch(conversation));
  } else if (options.stickToBottom) {
    conversation.scrollTop = conversation.scrollHeight;
    state.conversationPinnedToBottom = true;
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
}

function renderTaskWindow(thread, conversation, options, bottomOffset) {
  const allGroups = taskListGroupsForThread(thread)
    .concat(sharedCaseTopicGroupsForTaskList(thread))
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
    if (state.routeScrollTaskGroupId === state.currentTaskGroupId) clearRouteScrollTarget();
    state.currentTaskGroupId = "";
  }
  if (!state.currentTaskGroupId) {
    $("threadTitle").textContent = "话题列表";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = !allActiveRuns.length;
    configureComposer({ enabled: true, placeholder: "New topic..." });
    const filterBanner = renderTaskDirectoryFilterBanner();
    const progressPanel = renderRunProgressPanel(thread, allActiveRuns);
    conversation.innerHTML = groups.length
      ? `${filterBanner}${progressPanel}<div class="task-grid">${groups.map(renderTaskCard).join("")}</div>`
      : `${filterBanner}${progressPanel}<div class="empty-state">${state.taskDirectoryFilter ? "No topics in this directory." : "No topics yet. Send a message to create one."}</div>`;
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
    wireSkillLinks(conversation);
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
    const progressPanel = renderRunProgressPanel(thread, groupActiveRuns);
    conversation.innerHTML = `${progressPanel}${(selected.messages || []).map(renderMessage).join("") || `<div class="empty-state">No task messages yet.</div>`}`;
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
  updateNavigationControls();
  ensureVerticalScrollAffordance(conversation);
  scheduleMessageScrollButtonVisibility(conversation);

  if (selected && consumeTaskRouteScrollTarget(selected)) {
    return;
  }
  if (options.stickToBottom) {
    conversation.scrollTop = state.currentTaskGroupId ? conversation.scrollHeight : 0;
    state.conversationPinnedToBottom = Boolean(state.currentTaskGroupId);
  } else {
    conversation.scrollTop = Math.max(0, conversation.scrollHeight - bottomOffset);
    state.conversationPinnedToBottom = isNearBottom();
  }
}

function messageDirectoryAliases(message) {
  const aliases = [];
  if (Array.isArray(message?.directoryAliases)) aliases.push(...message.directoryAliases);
  if (message?.directoryRoute) aliases.push(message.directoryRoute);
  return aliases
    .map((item) => ({
      label: item?.label || item?.name || "",
      path: item?.path || item?.root || "",
      projectId: item?.projectId || "",
      subprojectId: item?.subprojectId || "",
      source: "bound",
    }))
    .filter((item) => item.label || item.path);
}

function extractedTaskDirectoryAliases(group) {
  const aliases = [];
  for (const message of group?.messages || []) {
    aliases.push(...messageExtractedDirectoryAliases(message));
  }
  return aliases;
}

function messageExtractedDirectoryAliases(message) {
  const aliases = [];
  const extracted = extractDirectoryAliases(message?.content || "");
  for (const alias of extracted.aliases || []) {
    aliases.push(Object.assign({ messageId: message?.id || "", source: "extracted" }, alias));
  }
  aliases.push(...extractMediaDirectoryAliases(message?.content || "", message?.id || ""));
  return aliases;
}

function explicitTaskDirectoryAliases(group) {
  const aliases = [];
  if (group?.directoryRoute) aliases.push(Object.assign({ source: "bound" }, group.directoryRoute));
  for (const message of group?.messages || []) {
    aliases.push(...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)));
  }
  return aliases;
}

function uniqueAliases(aliases) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
}

function directoryAliasItemKey(item) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return route.projectId
    ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
    : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
}

function aliasFromDirectoryItem(item, extra = {}) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return Object.assign({}, displayAlias, {
    projectId: route.projectId || displayAlias.projectId || "",
    subprojectId: route.subprojectId || displayAlias.subprojectId || "",
    path: displayAlias.path || route.root || "",
  }, extra);
}

function isDeliveryDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  const projectId = String(route?.projectId || alias?.projectId || "");
  return Boolean(
    alias?.referenceKind === "delivery"
    || projectId === "hermes-sync-folder"
    || pathValue.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939")
    || label.includes("\u4e3b\u4ea4\u4ed8")
    || label.includes("\u540c\u6b65\u6839")
    || label.includes("\u9644\u52a0\u4efb\u52a1\u76ee\u5f55")
    || /sync(root|directory|folder)/i.test(label)
  );
}

function isTaskBindingDirectoryItem(item) {
  return Boolean(
    item?.route
    && !isDeliveryDirectoryAlias(item.displayAlias, item.route)
    && !isGenericDefaultDirectoryAlias(item.displayAlias)
    && !isOperationalTaskDirectoryAlias(item.displayAlias, item.route)
  );
}

function usableTaskBindingAliases(aliases) {
  return (aliases || []).filter((alias) => (
    alias
    && !alias.referenceKind
    && !isDeliveryDirectoryAlias(alias)
    && !isGenericDefaultDirectoryAlias(alias)
    && !isOperationalTaskDirectoryAlias(alias)
  ));
}

function selectTaskBindingAlias(candidates, context) {
  const items = directoryAliasItemsForAliases(candidates, context, { includeGenericDefault: false });
  const bindingItems = items.filter(isTaskBindingDirectoryItem);
  const primary = bindingItems.find((item) => isContextAnchorDirectoryRoute(item.route)) || bindingItems[0] || null;
  if (primary) return aliasFromDirectoryItem(primary, { source: "bound" });
  const fallback = usableTaskBindingAliases(candidates).find((alias) => alias.label || alias.path);
  return fallback ? Object.assign({}, fallback, { source: "bound" }) : null;
}

function taskPrimaryDirectoryAlias(group) {
  const context = taskDirectoryContext(group);
  for (const message of group?.messages || []) {
    const candidates = usableTaskBindingAliases([
      ...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)),
      ...messageExtractedDirectoryAliases(message),
    ]);
    const primary = selectTaskBindingAlias(candidates, context);
    if (primary) return primary;
  }
  const candidates = [
    ...explicitTaskDirectoryAliases(group),
    ...usableTaskBindingAliases(extractedTaskDirectoryAliases(group)),
  ];
  return selectTaskBindingAlias(candidates, context);
}

function taskDirectoryAliases(group) {
  const primary = taskPrimaryDirectoryAlias(group);
  return primary ? [primary] : [];
}

function taskReferenceDirectoryAliases(group) {
  const context = taskDirectoryContext(group);
  const primaryKeys = new Set(directoryAliasItemsForAliases(taskDirectoryAliases(group), context, { includeGenericDefault: false }).map(directoryAliasItemKey));
  const referenceAliases = extractedTaskDirectoryAliases(group)
    .filter((alias) => alias.referenceKind || isDeliveryDirectoryAlias(alias));
  const referenceItems = directoryAliasItemsForAliases(referenceAliases, context, { coalesce: false });
  return uniqueAliases(referenceItems
    .filter((item) => !primaryKeys.has(directoryAliasItemKey(item)))
    .map((item) => aliasFromDirectoryItem(item, { source: "reference", referenceKind: item.displayAlias?.referenceKind || "reference" })));
}

function directoryAliasItemsForAliases(aliases, context = null, options = {}) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  const items = [...unique.values()].map((alias) => {
    const genericDefault = isGenericDefaultDirectoryAlias(alias);
    const genericCurrentBound = isGenericCurrentBoundDirectoryAlias(alias);
    if (genericDefault && options.includeGenericDefault === false) return null;
    const boundRoute = genericCurrentBound ? explicitDirectoryRouteForContext(context) : null;
    if (genericCurrentBound && !boundRoute) return null;
    const semanticRoute = genericDefault ? semanticDirectoryRouteForMessage(context) : null;
    if (genericDefault && !semanticRoute) return null;
    const contextRoute = boundRoute || semanticRoute;
    const displayAlias = Object.assign({}, alias, contextRoute ? { label: contextRoute.label, path: contextRoute.root } : null);
    const route = contextRoute || resolveDirectoryProjectRoute(displayAlias);
    return { displayAlias, route };
  }).filter(Boolean);
  return uniqueDirectoryAliasItems(options.coalesce === false ? items : coalesceDirectoryAliasItems(items));
}

function directoryRoutesForAliases(aliases, context = null) {
  return directoryAliasItemsForAliases(aliases, context).filter((item) => item.route);
}

function taskDirectoryRoutes(group) {
  return directoryRoutesForAliases(taskDirectoryAliases(group), taskDirectoryContext(group)).map((item) => item.route);
}

function taskDirectoryRouteMatchesFilter(route, filter = state.taskDirectoryFilter) {
  if (!filter || !route) return true;
  if (String(route.projectId || "") !== String(filter.projectId || "")) return false;
  if (!filter.subprojectId) return true;
  return String(route.subprojectId || "") === String(filter.subprojectId || "");
}

function taskMatchesDirectoryFilter(group) {
  if (!state.taskDirectoryFilter) return true;
  return taskDirectoryRoutes(group).some((route) => taskDirectoryRouteMatchesFilter(route));
}

function taskDirectoryFilterLabel(filter = state.taskDirectoryFilter) {
  if (!filter) return "";
  if (filter.label) return filter.label;
  const project = state.projects.find((item) => item.id === filter.projectId);
  const subproject = (project?.children || []).find((item) => item.id === filter.subprojectId);
  if (project && subproject) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: subproject.id, label: projectDisplayLabel(project), root: subproject.root || project.root },
      `${projectDisplayLabel(project)} / ${subproject.label || subproject.id}`
    );
  }
  if (project) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: "", label: projectDisplayLabel(project), root: project.root },
      projectDisplayLabel(project)
    );
  }
  return filter.projectId || "";
}

function setTaskDirectoryFilter(projectId, subprojectId = "", label = "") {
  if (!projectId) return;
  const attachment = directoryAttachmentFromRoute(projectId, subprojectId || "", "", label || "");
  state.taskDirectoryFilter = { projectId, subprojectId: subprojectId || "", label: label || "", directory: attachment };
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  closeTopMoreMenu();
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function clearTaskDirectoryFilter(options = {}) {
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  closeTopMoreMenu();
  if (options.render !== false) {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
  }
}

function renderTaskDirectoryFilterBanner() {
  if (!state.taskDirectoryFilter) return "";
  return `<div class="task-filter-banner">
    <span class="task-filter-label">资料目录：${escapeHtml(taskDirectoryFilterLabel())}</span>
    <span class="task-filter-actions">
      <button type="button" data-clear-task-directory-filter>清除</button>
    </span>
  </div>`;
}

function wireTaskDirectoryFilterControls(root) {
  root?.querySelectorAll?.("[data-task-reasoning-effort]").forEach((select) => {
    if (select.dataset.boundTaskReasoningEffort) return;
    select.dataset.boundTaskReasoningEffort = "1";
    select.addEventListener("change", () => {
      state.pendingTaskReasoningEffort = select.value || "";
    });
  });
  root?.querySelectorAll?.("[data-clear-task-directory-filter]").forEach((button) => {
    if (button.dataset.boundClearTaskDirectoryFilter) return;
    button.dataset.boundClearTaskDirectoryFilter = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTaskDirectoryFilter();
    });
  });
}

function taskDirectoryContext(group) {
  return {
    taskGroupId: group?.id || "",
    content: (group?.messages || []).map((message) => message.content || "").join("\n"),
  };
}

function renderTaskDirectoryBadges(group, options = {}) {
  const context = taskDirectoryContext(group);
  const rendered = renderDirectoryAliases(taskDirectoryAliases(group), context);
  if (!rendered && options.empty) {
    return `<div class="task-card-directories task-card-directories-empty"><span>未绑定目录</span></div>`;
  }
  if (!rendered) return "";
  return `<div class="task-card-directories${options.compact ? " compact" : ""}">${rendered}</div>`;
}

function renderTaskDetailToolbar(group) {
  const toolbar = $("taskDetailToolbar");
  if (!toolbar) return;
  const sharedTopic = Boolean(group?.sharedTopic);
  const context = Object.assign({ toolbar: true }, taskDirectoryContext(group));
  const aliasButtons = renderDirectoryAliases(taskDirectoryAliases(group), context);
  const skillChips = renderTaskSkillChips(taskSkills(group), { compact: true });
  toolbar.innerHTML = `
    <div class="task-toolbar-meta">
      <div class="task-toolbar-directories">${aliasButtons || ""}</div>
      ${skillChips}
    </div>
    ${sharedTopic ? "" : `<div class="task-more-wrap">
      <button class="task-more-button" type="button" data-task-more aria-label="Topic menu" aria-expanded="false">...</button>
      <div class="task-more-menu" hidden>
        <button class="task-more-delete" type="button" data-delete-current-task>Delete</button>
      </div>
    </div>`}
  `;
  const moreButton = toolbar.querySelector("[data-task-more]");
  const moreMenu = toolbar.querySelector(".task-more-menu");
  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = Boolean(moreMenu?.hidden);
    if (moreMenu) moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  moreMenu?.addEventListener("click", (event) => event.stopPropagation());
  toolbar.querySelector("[data-delete-current-task]")?.addEventListener("click", () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
    deleteTaskGroup(group.id).catch(showError);
  });
  wireDirectoryProjectLinks(toolbar);
  wireSkillLinks(toolbar);
}

function kanbanStoryProgressItems(group) {
  if (!group) return [];
  if (group.mode === "assessment-plan") return kanbanAssessmentVisibleCardItems(group);
  if (group.mode === "study-plan") return kanbanReadingBaseCardItems(group);
  return group.cards || [];
}

function kanbanStoryCurrentItemForTopic(group) {
  if (!group) return null;
  if (group.mode === "assessment-plan") return kanbanAssessmentCaseCurrentItem(group);
  if (group.mode === "study-plan") return kanbanReadingCaseCurrentItem(group);
  return (group.cards || []).find((item) => !["done", "archived"].includes(normalizedKanbanStatus(item.todo))) || (group.cards || [])[0] || null;
}

function kanbanStoryItemCompletedForProgress(group, item) {
  const todo = item?.todo || {};
  if (group?.mode === "assessment-plan") return assessmentExamCompleted(todo);
  if (group?.mode === "study-plan") return readingSubmissionCompleted(todo);
  return ["done", "archived"].includes(normalizedKanbanStatus(todo));
}

function kanbanStoryTopicOutputs(group) {
  const items = group?.mode === "assessment-plan"
    ? kanbanAssessmentStoryVisibleCardItems(group)
    : (group?.cards || []);
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    for (const output of kanbanCardOutputs(item.todo)) {
      const key = String(output?.url || output?.path || output?.name || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(output);
    }
  }
  return out;
}

function renderKanbanTopicOutputChips(outputs) {
  const items = (outputs || []).slice(0, 3);
  if (!items.length) return "";
  const chips = items.map((output) => {
    const label = artifactDisplayName(output);
    return `<a class="kanban-topic-output-chip" href="${escapeHtml(artifactHref(output))}" data-task-doc title="${escapeHtml(label)}">${escapeHtml(iconForArtifact(output))} ${escapeHtml(compactDisplayText(label, 28))}</a>`;
  }).join("");
  const extra = outputs.length > items.length ? `<span class="kanban-topic-output-more">+${outputs.length - items.length}</span>` : "";
  return `<div class="kanban-topic-outputs">${chips}${extra}</div>`;
}

function renderTaskCard(group) {
  const sharedTopic = Boolean(group.sharedTopic || group.sourceThreadId);
  const latestArtifact = sharedTopic ? null : latestTaskListDocument(group);
  const skills = sharedTopic ? [] : taskSkills(group);
  const artifactChips = latestArtifact ? `<span class="task-doc-item">
    <a class="task-doc-icon doc-${escapeHtml(artifactKind(latestArtifact))}" href="${escapeHtml(artifactHref(latestArtifact))}" target="_blank" rel="noopener" data-task-doc title="${escapeHtml(artifactDisplayName(latestArtifact))}" aria-label="${escapeHtml(artifactDisplayName(latestArtifact))}">
      ${escapeHtml(iconForArtifact(latestArtifact))}
    </a>
    ${renderArtifactDirectoryButton(latestArtifact, { compact: true })}
  </span>` : "";
  const skillChips = renderTaskSkillChips(skills, { compact: true });
  const sourceThreadAttr = group.sourceThreadId ? ` data-open-task-thread="${escapeHtml(group.sourceThreadId)}"` : "";
  const sharedBadge = sharedTopic ? `<span class="task-row-shared">${escapeHtml(group.sourceThreadTitle || "\u5171\u4eab\u5b66\u4e60\u8bdd\u9898")}</span>` : "";
  return `<article class="task-card task-card-collapsed task-swipe-row${sharedTopic ? " shared-topic-card" : ""}" data-task-swipe-card data-task-id="${escapeHtml(group.id)}">
    ${sharedTopic ? "" : `<button class="task-swipe-delete" type="button" data-delete-task="${escapeHtml(group.id)}" aria-label="Delete topic">&#21024;&#38500;</button>`}
    <div class="task-swipe-content" data-task-swipe-content>
      ${sharedTopic ? "" : `<div class="task-card-menu-wrap">
        <button class="task-card-menu-button" type="button" data-task-card-menu="${escapeHtml(group.id)}" aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
        <div class="task-card-menu" hidden>
          <button class="task-card-menu-item" type="button" data-rename-task="${escapeHtml(group.id)}">修改话题名</button>
        </div>
      </div>`}
      <button class="task-card-main" type="button" data-open-task="${escapeHtml(group.id)}"${sourceThreadAttr}>
        <span class="task-title-line">${escapeHtml(taskTitle(group) || "Untitled topic")}</span>
        <span class="task-row-meta">${escapeHtml(formatTime(group.updatedAt))}${sharedBadge}</span>
      </button>
      ${sharedTopic ? "" : `<div class="task-card-assets">
        <div class="task-docs${artifactChips ? "" : " empty"}" aria-label="Topic documents">
          ${artifactChips}
        </div>
        ${skillChips}
        ${renderTaskDirectoryBadges(group, { empty: true })}
      </div>`}
    </div>
  </article>`;
}

function messageTaskGroup(message) {
  if (!message?.taskGroupId || !state.currentThread) return null;
  return taskGroupsForThread(state.currentThread).find((group) => group.id === message.taskGroupId) || null;
}

function quotePreviewForMessage(message, group = null) {
  return compactDisplayText(message?.content || "", 92)
    || taskSummary(group)
    || taskTitle(group)
    || "Quoted topic";
}

function renderMessageQuoteAction(message) {
  if (!isSingleWindowView() || isSingleWindowChatView() || message?.role !== "assistant" || !message?.taskGroupId) return "";
  const taskId = messageTaskDisplayId(message);
  return `<button class="message-quote-button" type="button" data-quote-message="${escapeHtml(message.id)}" title="引用 ${escapeHtml(taskId)}">引用 ${escapeHtml(shortTaskDisplayId(taskId))}</button>`;
}

function canRevokeGroupMessage(message) {
  if (!isGroupChatView() || !message || message.revokedAt) return false;
  if (message.role !== "user" || message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (state.auth?.isOwner) return true;
  return Boolean(state.auth?.workspaceId && state.auth.workspaceId === message.senderWorkspaceId);
}

function renderMessageRevokeAction(message) {
  if (!canRevokeGroupMessage(message)) return "";
  return `<button class="message-revoke-button" type="button" data-revoke-message="${escapeHtml(message.id || "")}" title="${escapeHtml(GROUP_REVOKE_LABEL)}">${escapeHtml(GROUP_REVOKE_LABEL)}</button>`;
}

function renderExternalDeliveryStatus(message) {
  if (isWeixinChatView()) return "";
  const delivery = message?.externalDelivery || null;
  if (!delivery || delivery.source !== "weixin") return "";
  if (delivery.terminalStatus !== "manual_forward") return "";
  const status = String(delivery.status || "").toLowerCase();
  if (status !== "sent") return "";
  const label = {
    sent: "\u5fae\u4fe1\u5df2\u8f6c\u53d1",
  }[status] || "\u5fae\u4fe1\u8f6c\u53d1";
  const error = delivery.error ? `: ${delivery.error}` : "";
  return `<div class="external-delivery-status status-${escapeHtml(status || "unknown")}">${escapeHtml(label + error)}</div>`;
}

function messageUsesSenderLabel(message) {
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
  const useSenderLabel = messageUsesSenderLabel(message);
  const roleLabel = useSenderLabel && message.role === "user"
    ? userMessageSenderLabel(message)
    : (message.role === "user" ? "You" : "Hermes");
  const kindLabel = useSenderLabel && message.role === "user" && message.messageKind === "ai" ? " · AI" : "";
  const status = !revoked && message.status && message.status !== "done" ? ` - ${message.status}` : "";
  const timeLabel = messageDisplayTimeLabel(message);
  const usage = !revoked && message.usage ? renderUsage(message.usage, message) : "";
  const footer = renderMessageFooter(message, usage);
  const error = !revoked && message.error ? `<div class="error-box">${escapeHtml(message.error)}</div>` : "";
  const artifacts = !revoked && Array.isArray(message.artifacts) && message.artifacts.length ? renderArtifacts(message.artifacts) : "";
  const externalDelivery = !revoked ? renderExternalDeliveryStatus(message) : "";
  const searchClass = chatSearchClassForMessage(message);
  const body = revoked ? `<div class="message-revoked-text">${escapeHtml(GROUP_MESSAGE_REVOKED_TEXT)}</div>` : renderText(message.content || "", message);
  return `<article class="message ${escapeHtml(message.role || "assistant")}${searchClass}${revoked ? " revoked" : ""}" data-message-id="${escapeHtml(message.id || "")}">
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
    <div class="message-body">${body}${error}${artifacts}${externalDelivery}${footer}</div>
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
      if (!window.confirm("\u64a4\u56de\u8fd9\u6761\u7fa4\u804a\u6d88\u606f\uff1f")) return;
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
  if (!isSingleWindowView() || isSingleWindowChatView() || !message?.taskGroupId) return;
  const group = messageTaskGroup(message);
  state.quotedReply = {
    taskGroupId: message.taskGroupId,
    messageId: message.id,
    label: messageTaskDisplayId(message),
    shortLabel: shortTaskDisplayId(messageTaskDisplayId(message)),
    preview: quotePreviewForMessage(message, group),
  };
  renderQuotedReply();
  configureComposer({ enabled: true, placeholder: "Message Hermes..." });
  focusComposerSoon();
}

function clearQuotedReply(options = {}) {
  state.quotedReply = null;
  if (options.render !== false) {
    renderQuotedReply();
    configureComposer({ enabled: Boolean(state.currentThreadId), placeholder: "Message Hermes..." });
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
  if (isSingleWindowChatView()) return null;
  const quote = state.viewMode === "single" ? state.quotedReply : null;
  if (!quote?.taskGroupId || !quote?.messageId) return null;
  const panel = $("quotedReply");
  if (!panel || panel.classList.contains("hidden")) return null;
  if (panel.dataset.messageId !== quote.messageId) return null;
  if (panel.dataset.taskGroupId !== quote.taskGroupId) return null;
  return quote;
}

function renderText(text, message = {}) {
  const directoryAliases = extractDirectoryAliases(text || "");
  const cleaned = cleanDisplayText(rewriteDirectoryPathsForDisplay(directoryAliases.text));
  const aliases = renderDirectoryAliases(directoryAliases.aliases, message);
  if (message?.role === "assistant") {
    return `<div class="text-content message-prose">${aliases}${renderRichText(cleaned)}</div>`;
  }
  return `<div class="text-content plain-text">${aliases}${escapeHtml(cleaned)}</div>`;
}

function cleanDisplayText(value) {
  return String(value || "")
    .split(/\n/)
    .filter((line) => !/^\s*MEDIA:\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function renderTable(lines) {
  const rows = lines
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()))
    .filter((row) => row.length > 1);
  if (!rows.length) return "";
  const isSeparator = (row) => row.every((cell) => /^:?-{3,}:?$/.test(cell));
  const hasHeader = rows.length > 1 && isSeparator(rows[1]);
  const header = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(2) : rows;
  const headerHtml = header.length ? `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>` : "";
  const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<div class="prose-table-wrap"><table>${headerHtml}${bodyHtml}</table></div>`;
}

function renderRichText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let tableLines = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    out.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listType = "";
    listItems = [];
  };
  const flushTable = () => {
    if (!tableLines.length) return;
    out.push(renderTable(tableLines));
    tableLines = [];
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushBlocks();
      out.push("<hr>");
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      out.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (codeLines) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushBlocks();
  return out.join("") || "";
}

function extractDirectoryAliases(text) {
  const aliases = [];
  const lines = String(text || "").split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)(?:[-*]\s*)?目录别名\s*[:：]\s*(.*)$/);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const prefix = match[1].trim();
    const tail = match[2] || "";
    const hasPath = tail.includes("=");
    const endIndex = hasPath ? tail.indexOf("。") : -1;
    const aliasBlock = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
    const remainder = endIndex >= 0 ? tail.slice(endIndex + 1).trimStart() : "";
    aliases.push(...parseDirectoryAliasEntries(aliasBlock));
    const restored = [prefix, remainder].filter(Boolean).join(" ");
    if (restored) cleaned.push(restored);
  }
  return { text: cleaned.join("\n").replace(/^\s+/, ""), aliases };
}

function parentDirectoryFromFilePath(pathText) {
  const value = String(pathText || "").trim().replace(/^`+|`+$/g, "");
  if (!value) return "";
  return value.replace(/[\\/][^\\/]+$/g, "");
}

function extractMediaDirectoryAliases(text, messageId = "") {
  const aliases = [];
  const mediaPattern = /^MEDIA:\s*(`?)(.+?)\1\s*$/gm;
  let match = null;
  while ((match = mediaPattern.exec(String(text || "")))) {
    const mediaPath = String(match[2] || "").trim();
    const directoryPath = parentDirectoryFromFilePath(mediaPath);
    if (!directoryPath) continue;
    aliases.push({
      messageId,
      label: "\u4ea4\u4ed8\u76ee\u5f55",
      path: directoryPath,
      source: "reference",
      referenceKind: "delivery",
    });
  }
  return aliases;
}

function parseDirectoryAliasEntries(block) {
  const blockHasExplicitPath = String(block || "").includes("=");
  return String(block || "")
    .split(/[;；]/)
    .map((entry) => {
      const [rawLabel, ...pathParts] = entry.split("=");
      const label = cleanDirectoryAliasLabel(rawLabel);
      const rawPath = pathParts.join("=").trim();
      const pathValue = rawPath.replace(/^`+|`+$/g, "").replace(/[。.,，]+$/g, "").trim();
      return { label, path: pathValue };
    })
    .filter((entry) => entry.label && (!blockHasExplicitPath || entry.path) && !isSkillLibraryAliasEntry(entry) && !/主交付|交付目录|交付文件|同步根|delivery|sync\s*root/i.test(entry.label));
}

function cleanDirectoryAliasLabel(value) {
  return String(value || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function isSkillLibraryAliasEntry(entry) {
  const label = directoryAliasKey(entry?.label || "");
  const pathValue = comparableDirectoryPath(entry?.path || "");
  return pathValue.includes(".hermes/skills") || label.includes("\u6280\u80fd\u5e93") || label.includes("skilllibrary");
}

function shortDirectoryAliasLabel(label) {
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(label || "").trim();
}

function directoryAliasKey(value) {
  return String(value || "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function comparableDirectoryPath(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function configuredOwnerDriveRootNames() {
  const names = Array.isArray(state.displayConfig?.ownerDriveRootNames)
    ? state.displayConfig.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return names.length ? names : ["ChatGPT-Drive"];
}

function ownerDriveRootIndexForParts(parts) {
  const names = new Set(configuredOwnerDriveRootNames().map((item) => item.toLowerCase()));
  return (parts || []).findIndex((part) => names.has(String(part || "").toLowerCase()));
}

function pathContainsOwnerDriveRoot(rawPath) {
  const parts = String(rawPath || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  return ownerDriveRootIndexForParts(parts) >= 0;
}

function pathMatchesDirectoryRoot(candidatePath, rootPath) {
  const candidate = comparableDirectoryPath(candidatePath);
  const root = comparableDirectoryPath(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function relativeDisplayTailForDirectory(rawPath, rootPath) {
  const raw = String(rawPath || "").trim().replaceAll("\\", "/");
  const root = String(rootPath || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  const comparableRaw = comparableDirectoryPath(rawPath);
  const comparableRoot = comparableDirectoryPath(rootPath);
  if (comparableRaw && comparableRoot && comparableRaw.startsWith(`${comparableRoot}/`)) {
    return comparableRaw.slice(comparableRoot.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function logicalUserPathFallback(rawPath, fallbackLabel = "") {
  const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
  const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
  if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
  const documentsIndex = lowerParts.findIndex((part) => part === "documents");
  const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
  if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
  if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
  const usersIndex = lowerParts.findIndex((part) => part === "users");
  if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["用户目录", ...parts.slice(usersIndex + 2)].join(" / ");
  return fallbackLabel || parts[parts.length - 1] || "";
}

function projectLabelCandidates(project, parentLabel = "") {
  const labels = [
    project?.label,
    ...(project?.aliases || []),
  ].filter(Boolean);
  if (parentLabel && project?.label) labels.push(`${parentLabel} / ${project.label}`);
  const expanded = [];
  for (const label of labels) {
    expanded.push(label, shortDirectoryAliasLabel(label));
  }
  return expanded.filter(Boolean);
}

function directoryProjectCandidates() {
  const candidates = [];
  for (const project of state.projects || []) {
    if (!project || project.hidden) continue;
    candidates.push({
      projectId: project.id,
      subprojectId: "",
      label: project.label || project.id,
      root: project.root || "",
      labels: projectLabelCandidates(project),
    });
    for (const child of project.children || []) {
      candidates.push({
        projectId: project.id,
        subprojectId: child.id,
        label: child.label || child.id,
        root: child.root || "",
        labels: projectLabelCandidates(child, project.label || ""),
      });
    }
  }
  return candidates;
}

function directoryRouteDisplayPath(route, fallbackLabel = "") {
  const project = (state.projects || []).find((item) => item.id === route?.projectId);
  const child = route?.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
  const projectLabel = project ? projectDisplayLabel(project) : (route?.label || fallbackLabel || "");
  if (child) return `${projectLabel} / ${child.label || child.id || route.label || fallbackLabel}`;
  return projectLabel || route?.label || fallbackLabel || "";
}

function logicalDirectoryDisplayPath(rawPath, fallbackLabel = "") {
  const value = String(rawPath || "").trim();
  if (!value) return fallbackLabel || "";
  const matches = directoryProjectCandidates()
    .filter((candidate) => candidate.root && pathMatchesDirectoryRoot(value, candidate.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  if (matches.length) {
    const route = matches[0];
    const base = directoryRouteDisplayPath(route, route.label || fallbackLabel);
    const tail = relativeDisplayTailForDirectory(value, route.root);
    return [base, tail].filter(Boolean).join(" / ");
  }
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(value, workspace.defaultWorkspace)) {
    const tail = relativeDisplayTailForDirectory(value, workspace.defaultWorkspace);
    return [workspace.label || "工作区", tail].filter(Boolean).join(" / ");
  }
  return logicalUserPathFallback(value, fallbackLabel);
}

function rewriteDirectoryPathsForDisplay(text) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\[^\\\s]+\\|\/\/wsl(?:\.localhost|\$)?\/[^/\s]+\/)[^\s`<>"']+/gi;
  return String(text || "").replace(pathPattern, (match) => {
    const suffixMatch = match.match(/[)\].,;:，。；、）】》]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const core = suffix ? match.slice(0, -suffix.length) : match;
    const logical = logicalDirectoryDisplayPath(core);
    return logical ? `${logical}${suffix}` : match;
  });
}

function isGenericDefaultDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "默认目录",
    "默认资料根",
    "资料根",
    "资料根目录",
    "defaultdirectory",
    "defaultdataroot",
  ].includes(label);
}

function isOperationalTaskDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  return Boolean(
    (label.includes("agent") && (label.includes("workspace") || label.includes("工作区")))
    || label.includes("hermesweb")
    || pathValue.includes("/documents/agent")
    || pathValue.includes("/documents/hermes-mobile-source")
    || pathValue.includes("/programdata/hermesmobile/app")
    || pathValue.includes("/workspace/hermes-web")
    || pathValue.includes("/tools/cli/hermes-web")
  );
}

function isGenericCurrentBoundDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "\u5f53\u524d\u7ed1\u5b9a\u76ee\u5f55",
    "\u5f53\u524d\u7ed1\u5b9a\u5de5\u4f5c\u533a",
    "\u7ed1\u5b9a\u76ee\u5f55",
    "\u4efb\u52a1\u7ed1\u5b9a\u76ee\u5f55",
    "\u672c\u4efb\u52a1\u76ee\u5f55",
    "currentbounddirectory",
    "bounddirectory",
    "attacheddirectory",
    "currentdirectory",
  ].includes(label);
}

function explicitDirectoryRouteForContext(context = null) {
  const aliases = [];
  const isChatContext = isSingleWindowConversationTaskGroupId(context?.taskGroupId);
  if (!isChatContext && context?.taskGroupId && state.currentThread) {
    const group = taskGroupsForThread(state.currentThread).find((item) => item.id === context.taskGroupId);
    if (group) aliases.push(...explicitTaskDirectoryAliases(group));
  }
  aliases.push(...messageDirectoryAliases(context));
  for (const alias of aliases) {
    if (isGenericDefaultDirectoryAlias(alias) || isGenericCurrentBoundDirectoryAlias(alias) || isDeliveryDirectoryAlias(alias)) continue;
    const route = resolveDirectoryProjectRoute(alias);
    if (route) return route;
  }
  return null;
}

function messageTaskSearchText(message) {
  const group = isSingleWindowConversationTaskGroupId(message?.taskGroupId) ? null : messageTaskGroup(message);
  return [message?.content || "", ...(group?.messages || []).map((item) => item.content || "")]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function semanticDirectoryRouteForMessage(message) {
  const text = messageTaskSearchText(message);
  if (!text) return null;
  const matches = [];
  for (const candidate of directoryProjectCandidates()) {
    for (const label of candidate.labels || []) {
      const key = directoryAliasKey(label);
      if (key.length >= 2 && text.includes(key)) {
        matches.push({
          candidate,
          score: key.length * 100 + comparableDirectoryPath(candidate.root).length,
        });
      }
    }
  }
  if (!matches.length) return null;
  return matches.sort((a, b) => b.score - a.score)[0].candidate;
}

function resolveDirectoryProjectRoute(alias) {
  const aliasLabel = directoryAliasKey(alias?.label);
  const aliasPath = alias?.path || "";
  const candidates = directoryProjectCandidates();
  const requestedProjectId = String(alias?.projectId || "").trim();
  const requestedSubprojectId = String(alias?.subprojectId || "").trim();
  if (requestedProjectId) {
    const exactProject = candidates.find((candidate) =>
      candidate.projectId === requestedProjectId && String(candidate.subprojectId || "") === requestedSubprojectId);
    if (exactProject) return exactProject;
    if (!requestedSubprojectId) {
      const rootProject = candidates.find((candidate) =>
        candidate.projectId === requestedProjectId && !candidate.subprojectId);
      if (rootProject) return rootProject;
    }
    const projectMatches = candidates
      .filter((candidate) => candidate.projectId === requestedProjectId && (!requestedSubprojectId || candidate.subprojectId === requestedSubprojectId))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
    if (projectMatches.length) return projectMatches[0];
  }
  const pathMatches = aliasPath
    ? candidates
      .filter((candidate) => pathMatchesDirectoryRoot(aliasPath, candidate.root))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)
    : [];
  if (pathMatches.length) return pathMatches[0];

  if (!aliasLabel) return null;
  const exact = candidates.filter((candidate) =>
    candidate.labels.some((label) => directoryAliasKey(label) === aliasLabel));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0];
  }
  return null;
}

function isGenericOwnerTopicRoute(route) {
  const projectId = String(route?.projectId || "");
  return GENERIC_OWNER_TOPIC_ROUTE_IDS.has(projectId)
    || GENERIC_OWNER_TOPIC_ROUTE_PREFIXES.some((prefix) => projectId.startsWith(prefix));
}

function isContextAnchorDirectoryRoute(route) {
  if (!route?.root) return false;
  if (route.subprojectId) return false;
  if (route.projectId === "single-window") return false;
  if (isGenericOwnerTopicRoute(route)) return false;
  return true;
}

function coalesceDirectoryAliasItems(items) {
  const anchors = (items || []).filter((item) => isContextAnchorDirectoryRoute(item.route));
  if (!anchors.length) return items || [];
  return (items || []).filter((item) => {
    if (!isGenericOwnerTopicRoute(item.route)) return true;
    return anchors.some((anchor) => pathMatchesDirectoryRoot(item.route.root, anchor.route.root));
  });
}

function uniqueDirectoryAliasItems(items) {
  const unique = new Map();
  for (const item of items || []) {
    const route = item.route || {};
    const displayAlias = item.displayAlias || {};
    const key = route.projectId
      ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
      : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function renderDirectoryAliases(aliases, message, options = {}) {
  const items = directoryAliasItemsForAliases(aliases, message, { coalesce: options.reference ? false : undefined });
  if (!items.length) return "";
  return `<div class="directory-aliases">${items.map(({ displayAlias, route }) => {
    let directoryPath = displayAlias.path || route?.root || "";
    if (route?.root && directoryPath && !pathMatchesDirectoryRoot(directoryPath, route.root)) directoryPath = route.root;
    const reference = Boolean(options.reference || displayAlias.referenceKind || displayAlias.source === "reference");
    const chipClass = `directory-alias-chip${reference ? " directory-alias-chip-reference" : ""}`;
    if (route) {
      const pathIsNested = Boolean(
        route.root
        && directoryPath
        && pathMatchesDirectoryRoot(directoryPath, route.root)
        && comparableDirectoryPath(directoryPath) !== comparableDirectoryPath(route.root)
      );
      const baseLabel = pathIsNested && displayAlias.label
        ? displayAlias.label
        : (reference || pathIsNested
        ? logicalDirectoryDisplayPath(directoryPath, route.label || displayAlias.label)
        : directoryRouteDisplayPath(route, route.label || displayAlias.label));
      const label = reference ? `\u4ea4\u4ed8 \u00b7 ${baseLabel}` : baseLabel;
      return `<span class="${chipClass} directory-alias-chip-mapped" title="${escapeHtml(label)}">
        <button class="directory-alias-open" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}" aria-label="打开目录管理">
          <span class="directory-alias-icon">DIR</span>
        </button>
        <button class="directory-alias-project" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}">
          ${escapeHtml(label)}
        </button>
      </span>`;
    }
    const fallbackLabel = reference ? `\u4ea4\u4ed8 \u00b7 ${shortDirectoryAliasLabel(displayAlias.label)}` : shortDirectoryAliasLabel(displayAlias.label);
    return `<button class="${chipClass}" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(displayAlias.label || "")}">
      <span class="directory-alias-icon">DIR</span>
      <span>${escapeHtml(fallbackLabel)}</span>
    </button>`;
  }).join("")}</div>`;
}

async function openDirectoryProjectRoute(projectId, subprojectId = "", pathText = "") {
  if (!projectId) return;
  if (!state.projects.some((project) => project.id === projectId)) return;
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.selectedProjectId = projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const project = currentProject();
  const hasSubproject = Boolean(subprojectId && (project?.children || []).some((item) => item.id === subprojectId));
  state.selectedSubprojectId = hasSubproject ? subprojectId : "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
  renderSubprojects();
  const directoryTarget = currentDirectoryTarget();
  const directoryRoot = project?.root || directoryTarget?.root || "";
  const requestedPath = String(pathText || "").trim();
  const targetPath = requestedPath && (!directoryRoot || pathMatchesDirectoryRoot(requestedPath, directoryRoot))
    ? requestedPath
    : (directoryTarget?.root || directoryRoot);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, directoryRoot || targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

async function openDirectoryPathInManager(pathText, label = "") {
  const targetPath = String(pathText || "").trim();
  if (!targetPath) throw new Error("No directory path is available.");
  const route = resolveDirectoryProjectRoute({ label, path: targetPath });
  if (route?.projectId) {
    await openDirectoryProjectRoute(route.projectId, route.subprojectId || "", targetPath);
    return;
  }
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  syncDirectoryRouteFromPath(targetPath);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

function wireDirectoryProjectLinks(root) {
  root?.querySelectorAll?.("[data-directory-project]").forEach((button) => {
    if (button.dataset.boundDirectoryProject) return;
    button.dataset.boundDirectoryProject = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryProjectRoute(
        button.dataset.projectId,
        button.dataset.subprojectId || "",
        button.dataset.directoryPath || ""
      ).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-directory-path-open]").forEach((button) => {
    if (button.dataset.boundDirectoryPathOpen) return;
    button.dataset.boundDirectoryPathOpen = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryPathInManager(button.dataset.directoryPath || "", button.dataset.directoryLabel || "").catch(showError);
    });
  });
}

function renderArtifacts(artifacts) {
  return `<div class="artifacts">${displayArtifacts(artifacts).map((artifact) => `<div class="artifact-row">
    <a class="artifact-card doc-${escapeHtml(artifactKind(artifact))}" href="${escapeHtml(artifactHref(artifact))}" target="_blank" rel="noopener" data-task-doc>
      <div class="artifact-icon">${escapeHtml(iconForArtifact(artifact))}</div>
      <div>
        <div class="artifact-name">${escapeHtml(artifactDisplayName(artifact))}</div>
        <div class="artifact-meta">${escapeHtml(`${artifact.mime || "file"} | ${formatBytes(artifact.size)}`)}</div>
      </div>
    </a>
    ${renderArtifactDirectoryButton(artifact)}
    ${renderArtifactWeixinButton(artifact)}
  </div>`).join("")}</div>`;
}

function iconForArtifact(artifact) {
  const kind = artifactKind(artifact);
  if (kind === "pdf") return "PDF";
  if (kind === "word") return "DOC";
  if (kind === "markdown") return "MD";
  if (kind === "html") return "HTML";
  if (kind === "text") return "TXT";
  return iconForMime(artifact?.mime);
}

function iconForMime(mime) {
  if (/pdf/i.test(mime || "")) return "PDF";
  if (/image/i.test(mime || "")) return "IMG";
  if (/video/i.test(mime || "")) return "VID";
  if (/audio/i.test(mime || "")) return "AUD";
  return "FILE";
}

function uniqueUsageLabels(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeUsageModelCalls(usage = {}) {
  const rows = [
    usage.api_call_model_routes,
    usage.api_call_models,
    usage.apiCallModelRoutes,
  ].find(Array.isArray) || [];
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      model: String(item.model || item.model_name || item.response_model || "").trim(),
      reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || item.effort || "").trim(),
    }));
}

function usageModelLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.model
    || usage.model_name
    || usage.response_model
    || message.model
    || message.modelName
    || "",
  ).trim();
  const models = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.model),
    ...modelRows.map((item) => item.model),
  ]);
  return models.length ? models.join(", ") : (state.defaultModel || state.assistantLabel || "");
}

function usageReasoningLabel(usage = {}, message = {}, apiCallRows = []) {
  const modelRows = normalizeUsageModelCalls(usage);
  const direct = String(
    usage.reasoning_effort
    || usage.reasoningEffort
    || usage.reasoning
    || message.reasoningEffort
    || message.reasoning_effort
    || "",
  ).trim();
  const efforts = uniqueUsageLabels([
    direct,
    ...apiCallRows.map((item) => item.reasoningEffort),
    ...modelRows.map((item) => item.reasoningEffort),
  ]);
  const labels = efforts.length ? efforts : [state.defaultReasoningEffort || "medium"];
  return labels.map((item) => reasoningEffortLabel(item)).join(", ");
}

function renderUsage(usage, message = {}) {
  const normalized = normalizeUsage(usage);
  const total = normalized.total || 0;
  if (!total) return "";
  const apiCallRows = normalizeUsageApiCalls(usage);
  const explicitApiCallCount = numericUsageValue(usage.api_calls, usage.api_call_count);
  const apiCallCount = explicitApiCallCount !== null
    ? explicitApiCallCount
    : (apiCallRows.length ? apiCallRows.length : null);
  const apiCost = normalizeUsageCost(usage);
  const rows = [
    ["Model", usageModelLabel(usage, message, apiCallRows)],
    ["Reasoning", usageReasoningLabel(usage, message, apiCallRows)],
    normalized.uncachedInput !== null ? ["Uncached input", normalized.uncachedInput] : null,
    ["Cached input", normalized.cachedInput !== null ? normalized.cachedInput : "Not reported"],
    ["Input total", normalized.input],
    ["Output", normalized.output],
    ["Reasoning output", normalized.reasoningOutput],
    ["API calls", apiCallCount !== null ? apiCallCount : "Not reported"],
    apiCost !== null ? ["API cost", apiCost] : null,
    ["Total", normalized.total],
  ].filter((row) => row && row[1] !== null && row[1] !== undefined);
  const detailRows = rows.map(([label, value]) => `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${formatUsageValue(value)}</strong></div>`).join("");
  const apiDetails = apiCallRows.length ? `<div class="usage-api-calls">
    <div class="usage-api-title">API calls</div>
    ${apiCallRows.map((call, index) => `<div class="usage-api-row">
      <div class="usage-api-main">#${index + 1} ${escapeHtml([call.model, call.reasoningEffort].filter(Boolean).join(" / ") || "API call")}</div>
      <div class="usage-api-meta">
        <span>in ${formatTokenCount(call.input)}</span>
        <span>cached ${formatTokenCount(call.cachedInput)}</span>
        <span>out ${formatTokenCount(call.output)}</span>
        <span>total ${formatTokenCount(call.total)}</span>
      </div>
    </div>`).join("")}
  </div>` : "";
  return `<details class="usage" title="Usage: ${formatTokenCount(total)} tokens"><summary aria-label="Usage: ${formatTokenCount(total)} tokens">Usage</summary><div class="usage-details">${detailRows}${apiDetails}</div></details>`;
}

function numericUsageValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeUsage(usage = {}) {
  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};
  const input = numericUsageValue(usage.input_tokens, usage.prompt_tokens, usage.input, usage.prompt);
  const output = numericUsageValue(usage.output_tokens, usage.completion_tokens, usage.output, usage.completion);
  const total = numericUsageValue(usage.total_tokens, usage.total, (input || 0) + (output || 0));
  const explicitCachedInput = numericUsageValue(
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_read_tokens,
    usage.cached_tokens,
    inputDetails.cached_tokens,
    inputDetails.cache_read_tokens,
  );
  const cacheWriteInput = numericUsageValue(
    usage.cache_write_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_creation_tokens,
    inputDetails.cache_write_tokens,
    inputDetails.cache_creation_tokens,
  ) || 0;
  const reasoningOutput = numericUsageValue(usage.reasoning_tokens, outputDetails.reasoning_tokens);
  const cachedRemainder = total !== null
    ? Math.max(0, total - (input || 0) - (output || 0) - (reasoningOutput || 0) - cacheWriteInput)
    : 0;
  const shouldInferCachedInput = explicitCachedInput === null
    ? cachedRemainder > 0
    : (explicitCachedInput === 0 && cachedRemainder > 0);
  const inferredCachedInput = shouldInferCachedInput ? cachedRemainder : 0;
  const cachedInput = shouldInferCachedInput ? inferredCachedInput : explicitCachedInput;
  const explicitUncached = numericUsageValue(
    usage.uncached_input_tokens,
    usage.input_tokens_uncached,
    usage.uncached_tokens,
    inputDetails.uncached_tokens,
  );
  const inputIncludesCached = !shouldInferCachedInput && explicitCachedInput !== null && input !== null && input >= cachedInput;
  const uncachedInput = explicitUncached !== null
    ? explicitUncached
    : (cachedInput !== null && input !== null ? Math.max(0, inputIncludesCached ? input - cachedInput : input) : null);
  const inputTotal = explicitUncached !== null
    ? explicitUncached + cachedInput
    : (inputIncludesCached ? input : ((input || 0) + (cachedInput || 0)));
  return {
    input: inputTotal,
    output,
    total,
    cachedInput,
    uncachedInput,
    reasoningOutput,
  };
}

function normalizeUsageApiCalls(usage = {}) {
  const rows = [
    usage.api_call_usage_routes,
    usage.api_call_usage,
    usage.api_calls_detail,
    usage.apiCalls,
  ].find(Array.isArray) || [];
  const modelRows = normalizeUsageModelCalls(usage);
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const modelRow = modelRows[index] || {};
      const input = numericUsageValue(item.input_tokens, item.prompt_tokens, item.input, item.prompt) || 0;
      const cachedInput = numericUsageValue(
        item.cache_read_tokens,
        item.cached_input_tokens,
        item.cache_read_input_tokens,
        item.cached_tokens,
      ) || 0;
      const output = numericUsageValue(item.output_tokens, item.completion_tokens, item.output, item.completion) || 0;
      return {
        model: String(item.model || item.model_name || modelRow.model || "").trim(),
        reasoningEffort: String(item.reasoning_effort || item.reasoningEffort || modelRow.reasoningEffort || "").trim(),
        input,
        cachedInput,
        output,
        total: numericUsageValue(item.total_tokens, item.total, input + cachedInput + output) || 0,
      };
    });
}

function normalizeUsageCost(usage = {}) {
  const status = String(usage.cost_status || usage.billing_status || "").trim().toLowerCase();
  const mode = String(usage.billing_mode || "").trim().toLowerCase();
  const actual = numericCostValue(usage.actual_cost_usd, usage.api_cost_usd, usage.cost_usd);
  const estimated = numericCostValue(usage.estimated_cost_usd, usage.estimated_api_cost_usd);
  const cost = actual !== null ? actual : estimated;
  if (status === "included" || mode === "subscription_included") return "Included";
  if (cost === null) return null;
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`;
}

function numericCostValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatUsageValue(value) {
  if (typeof value === "string") return escapeHtml(value);
  return formatTokenCount(value);
}
