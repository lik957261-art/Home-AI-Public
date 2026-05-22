"use strict";

function openTaskList() {
  clearQuotedReply({ render: false });
  state.skillDetail = null;
  const reloadTaskWindow = currentTaskThreadIsSharedTopicThread();
  state.currentTaskGroupId = "";
  if (reloadTaskWindow) {
    if (restoreTaskListThreadFromCache({ stickToBottom: true })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    loadSingleWindow({ groupChat: false, weixinChat: false }).catch(showError);
    return;
  }
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function openTodoList() {
  state.skillDetail = null;
  state.selectedTodoId = "";
  state.todoCreateOpen = false;
  renderTodos();
}

function openAutomationList() {
  state.skillDetail = null;
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  renderAutomationView();
}

function resetSidebarScroll() {
  const sidebar = $("sidebar");
  const threadList = $("threadList");
  if (sidebar) sidebar.scrollTop = 0;
  if (threadList) threadList.scrollTop = 0;
}

function sidebarBackToMenu() {
  if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    openTaskList();
    closeSidebar();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (kanbanComposerOpen()) {
    openTodoList();
    closeSidebar();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    closeSidebar();
    return;
  }
  if (isMobileLayout()) {
    closeSidebar();
    return;
  }
  resetSidebarScroll();
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 1099px)").matches;
}

function isMobileLandscapeCompactLayout() {
  return window.matchMedia("(max-width: 1099px) and (orientation: landscape) and (max-height: 620px)").matches;
}

function isCurrentSingleWindowLoaded() {
  return Boolean(
    state.currentThread &&
    state.currentThread.singleWindow &&
    (state.currentThread.workspaceId === state.selectedWorkspaceId || selectedWorkspaceInThreadGroup(state.currentThread))
  );
}

function suppressComposerAutoFocus(ms = 1200) {
  state.suppressComposerFocusUntil = Math.max(state.suppressComposerFocusUntil || 0, Date.now() + ms);
}

function composerAutoFocusAllowed() {
  return document.visibilityState !== "hidden" && Date.now() >= (state.suppressComposerFocusUntil || 0);
}

function blurComposerInput() {
  const input = $("messageInput");
  if (input && document.activeElement === input) input.blur();
  closeGroupMentionMenu();
}

function handleAppBackgrounded() {
  suppressComposerAutoFocus(1800);
  blurComposerInput();
  clearTodoAutoRefresh();
}

function handleAppForegrounded() {
  suppressComposerAutoFocus(900);
  blurComposerInput();
  if (state.viewMode === "todos") scheduleTodoAutoRefresh();
  scheduleConversationViewportRefresh();
}

function focusComposerSoon(options = {}) {
  window.requestAnimationFrame(() => {
    if (!options.force && !composerAutoFocusAllowed()) return;
    $("messageInput")?.focus({ preventScroll: true });
  });
}

function isSkillDetailView() {
  return Boolean(state.skillDetail);
}

function isTaskDetailView() {
  return !isSkillDetailView() && state.viewMode === "tasks" && Boolean(state.currentTaskGroupId) && Boolean(state.currentThread?.singleWindow);
}

function isTodoDetailView() {
  return state.viewMode === "todos" && Boolean(state.selectedTodoId);
}

function isTaskWindowView() {
  return state.viewMode === "tasks" && Boolean(state.currentThread?.singleWindow);
}

function isTaskListView() {
  return isTaskWindowView() && !state.currentTaskGroupId;
}

function isTodoView() {
  return state.viewMode === "todos";
}

function isAutomationView() {
  return state.viewMode === "automation";
}

function isAutomationDetailView() {
  return state.viewMode === "automation" && Boolean(state.selectedAutomationId);
}

function isSingleWindowView() {
  return state.viewMode === "single" && Boolean(state.currentThread?.singleWindow);
}

function isSingleWindowChatView() {
  return isSingleWindowView() && state.singleWindowMode === "chat";
}

function threadGroupMemberIds(thread = state.currentThread) {
  return Array.isArray(thread?.chatGroup?.memberWorkspaceIds) ? thread.chatGroup.memberWorkspaceIds : [];
}

function isThreadGroupChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.chatGroup?.enabled && threadGroupMemberIds(thread).length);
}

function selectedWorkspaceInThreadGroup(thread = state.currentThread) {
  return isThreadGroupChat(thread) && threadGroupMemberIds(thread).includes(state.selectedWorkspaceId);
}

function isThreadWeixinChat(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
}

function isWeixinChatView() {
  return isSingleWindowChatView() && state.weixinChatOpen && isThreadWeixinChat(state.currentThread);
}

function isGroupChatView() {
  return isSingleWindowChatView() && !isWeixinChatView() && state.groupChatOpen && selectedWorkspaceInThreadGroup(state.currentThread);
}

function groupChatSelectable(thread = state.currentThread) {
  return Boolean(thread?.singleWindow && (
    selectedWorkspaceInThreadGroup(thread)
    || state.groupChatAvailable
    || state.auth?.isOwner
  ));
}

function mergeChatScopeThread(existingThread, incomingThread) {
  if (!incomingThread) return existingThread || null;
  if (!existingThread || existingThread.id !== incomingThread.id) return incomingThread;
  const existingPage = existingThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const incomingMessages = Array.isArray(incomingThread.messages) ? incomingThread.messages : [];
  const existingThreadMessages = existingThread.messages || [];
  if (incomingPage && !incomingMessages.length && existingThreadMessages.length) {
    const messagesPage = mergeMessagesPage(existingPage, incomingPage, chatMessagesForThread(existingThread, incomingPage.taskGroupId || activeChatTaskGroupId()));
    return Object.assign({}, existingThread, incomingThread, { messages: existingThreadMessages, messagesPage });
  }
  const existingMessages = new Map((existingThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = incomingMessages.map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of existingThread.messages || []) {
    if (!incomingIds.has(message.id) && (!incomingPage || shouldPreserveMessageOutsideIncomingPage(message))) {
      messages.push(message);
    }
  }
  const sortedMessages = sortedThreadMessages(messages);
  const pageMessages = incomingPage?.mode === "chat" || existingPage?.mode === "chat"
    ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
    : sortedMessages;
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, pageMessages)
    : null;
  return Object.assign({}, existingThread, incomingThread, { messages: sortedMessages, messagesPage });
}

function rememberChatScopeThread(thread) {
  if (!thread?.singleWindow) return;
  if (isThreadWeixinChat(thread)) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, thread);
    state.weixinChatThreadId = state.weixinChatThread?.id || thread.id || "";
    state.weixinChatAvailable = true;
    return;
  }
  if (selectedWorkspaceInThreadGroup(thread)) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, thread);
    state.groupChatThreadId = state.groupChatThread?.id || thread.id || "";
    state.groupChatAvailable = true;
    return;
  }
  if (thread.workspaceId === state.selectedWorkspaceId) {
    state.privateChatThread = mergeChatScopeThread(state.privateChatThread, thread);
  }
}

function chatScopeThread(thread, scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "weixin") {
    if (thread?.id && thread.id === state.weixinChatThread?.id) return thread;
    return state.weixinChatThread || (isThreadWeixinChat(thread) ? thread : null);
  }
  if (normalized === "group") {
    if (thread?.id && thread.id === state.groupChatThread?.id) return thread;
    return state.groupChatThread || (selectedWorkspaceInThreadGroup(thread) ? thread : null);
  }
  if (thread?.id && thread.id === state.privateChatThread?.id) return thread;
  return state.privateChatThread || (!selectedWorkspaceInThreadGroup(thread) && !isThreadWeixinChat(thread) ? thread : null);
}

function chatScopeTaskGroupId(scope) {
  return String(scope || "").trim().toLowerCase() === "group"
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

function activeChatScope() {
  if (isWeixinChatView()) return "weixin";
  return isGroupChatView() ? "group" : "chat";
}

function chatScopeReadStorageKey(scope) {
  const normalized = String(scope || "chat").trim().toLowerCase() || "chat";
  return `hermesChatScopeRead:${state.selectedWorkspaceId || "owner"}:${normalized}:${chatScopeTaskGroupId(scope)}`;
}

function chatScopeMessageTimeMs(message) {
  const parsed = Date.parse(String(messageTimelineTimestamp(message) || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestChatScopeMessageTimeMs(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  return Math.max(0, ...chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope)).map(chatScopeMessageTimeMs));
}

function chatScopeReadAt(scope) {
  const value = Number(localStorage.getItem(chatScopeReadStorageKey(scope)) || "0");
  return Number.isFinite(value) && value > 0 ? value : CHAT_SCOPE_SESSION_STARTED_AT;
}

function setChatScopeReadAt(scope, value) {
  const timestamp = Math.max(0, Number(value) || 0);
  if (timestamp) localStorage.setItem(chatScopeReadStorageKey(scope), String(timestamp));
}

function ensureChatScopeReadBaselines(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  // Missing read markers intentionally fall back to the page-load timestamp.
  // That avoids counting old group messages while preserving badges for new SSE messages.
}

function markActiveChatScopeRead(thread = state.currentThread) {
  if (!isSingleWindowChatView() || !thread) return;
  const scope = activeChatScope();
  const latest = latestChatScopeMessageTimeMs(thread, scope);
  if (latest) setChatScopeReadAt(scope, latest);
}

function isOwnChatScopeMessage(message) {
  if (message?.role !== "user") return false;
  const ownerWorkspaceId = messageOwnerWorkspaceId(message, "");
  return Boolean(ownerWorkspaceId && ownerWorkspaceId === state.selectedWorkspaceId);
}

function unreadChatScopeCount(thread, scope) {
  const sourceThread = chatScopeThread(thread, scope);
  if (!isSingleWindowChatView() || !sourceThread) return 0;
  const readAt = chatScopeReadAt(scope);
  if (!readAt) return 0;
  return chatMessagesForThread(sourceThread, chatScopeTaskGroupId(scope))
    .filter((message) => chatScopeMessageTimeMs(message) > readAt)
    .filter((message) => !isOwnChatScopeMessage(message))
    .length;
}

function groupChatMemberLabels(thread = state.currentThread) {
  const members = Array.isArray(thread?.chatGroup?.members) ? thread.chatGroup.members : [];
  const labels = members.length ? members.map((item) => item.label || item.workspaceId).filter(Boolean) : threadGroupMemberIds(thread).map((workspaceId) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    return workspace?.label || workspaceId;
  }).filter(Boolean);
  return [...new Set([...labels, assistantDisplayLabel()])];
}

function groupChatMentionMembers(thread = state.currentThread, options = {}) {
  const members = Array.isArray(thread?.chatGroup?.members) && thread.chatGroup.members.length
    ? thread.chatGroup.members
    : threadGroupMemberIds(thread).map((workspaceId) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      return { workspaceId, label: workspace?.label || workspaceId };
    });
  const realMembers = members
    .map((member) => ({
      workspaceId: String(member.workspaceId || "").trim(),
      label: String(member.label || member.workspaceId || "").trim(),
    }))
    .filter((member) => member.workspaceId && member.workspaceId !== state.selectedWorkspaceId);
  if (options.includeAi === false) return realMembers;
  return [virtualAssistantMember(), ...realMembers];
}

function normalizeMentionSearch(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function fallbackReasoningCompactLabel(value) {
  const effort = String(value || "").trim().toLowerCase();
  if (effort === "low") return "\u4f4e";
  if (effort === "medium") return "\u4e2d";
  if (effort === "high") return "\u9ad8";
  if (effort === "xhigh") return "Xhigh";
  if (effort === "none") return "\u5173";
  return "\u4e2d";
}

function normalizeReasoningOptions(items) {
  const source = Array.isArray(items) && items.length
    ? items
    : TASK_REASONING_OPTIONS.filter((item) => item.value);
  const seen = new Set();
  return source
    .map((item) => {
      const value = String(item?.value || "").trim().toLowerCase();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = String(item?.label || item?.value || "").trim() || value;
      return {
        value,
        label,
        shortLabel: String(item?.shortLabel || item?.short_label || fallbackReasoningCompactLabel(value)).trim(),
      };
    })
    .filter(Boolean);
}

function configuredReasoningOptions() {
  return normalizeReasoningOptions(state.reasoningOptions);
}

function assistantDisplayLabel() {
  return String(state.assistantLabel || state.modelProvider || state.defaultModel || VIRTUAL_GROUP_AI_MEMBER.label || "AI").trim() || "AI";
}

function virtualAssistantMember() {
  const label = assistantDisplayLabel();
  return Object.assign({}, VIRTUAL_GROUP_AI_MEMBER, {
    label,
    mentionText: `@${label}`,
    description: [state.defaultModel, defaultReasoningLabel()].filter(Boolean).join(" / ") || "\u9ed8\u8ba4\u63a8\u7406",
  });
}

function composerModelOptions() {
  const label = assistantDisplayLabel();
  const modelLabel = state.defaultModel || label;
  return COMPOSER_MODEL_OPTIONS.map((option) => {
    if (option.id !== DEFAULT_COMPOSER_MODEL_ID) return option;
    return Object.assign({}, option, {
      label,
      mentionText: `@${label}`,
      description: [modelLabel, "\u8fd0\u884c\u65f6\u9ed8\u8ba4"].filter(Boolean).join(" / "),
      aliases: [...new Set([...(option.aliases || []), label, state.defaultModel, state.modelProvider].filter(Boolean))],
    });
  });
}

function composerModelOption(value) {
  const id = String(value || "").trim();
  return composerModelOptions().find((option) => option.id === id) || composerModelOptions()[0];
}

function selectedDefaultComposerModelOption() {
  return composerModelOption(state.defaultComposerModelId || DEFAULT_COMPOSER_MODEL_ID);
}

function composerModelMentionAliases(option = {}) {
  return new Set([
    option.id,
    option.label,
    option.model,
    option.provider,
    option.mentionText,
    ...(Array.isArray(option.aliases) ? option.aliases : []),
  ].map(normalizeMentionSearch).filter(Boolean));
}

function composerModelOptionForMention(primary, secondary = "") {
  const primaryKey = normalizeMentionSearch(primary);
  const secondaryKey = normalizeMentionSearch(secondary);
  if (!primaryKey) return null;
  const options = composerModelOptions();
  if (secondaryKey) {
    const combinedKey = `${primaryKey}${secondaryKey}`;
    const combined = options.find((option) => composerModelMentionAliases(option).has(combinedKey));
    if (combined) return combined;
  }
  return options.find((option) => composerModelMentionAliases(option).has(primaryKey)) || null;
}

function composerAiMentionOptions() {
  const label = "ChatGPT";
  const modelLabel = state.defaultModel || label;
  const defaultModelOption = composerModelOptions()[0];
  const chatGptXhigh = {
    workspaceId: "assistant-xhigh",
    label: `${label} X high`,
    virtual: true,
    mentionText: `@${label} X high`,
    description: [modelLabel, "X high"].filter(Boolean).join(" / "),
    reasoningEffort: "xhigh",
    model: defaultModelOption.model || "",
    provider: defaultModelOption.provider || "",
    modelExplicit: true,
  };
  const grokOptions = composerModelOptions()
    .filter((option) => option.id !== DEFAULT_COMPOSER_MODEL_ID)
    .map((option) => ({
      workspaceId: `assistant-model-${option.id}`,
      label: option.label,
      virtual: true,
      mentionText: option.mentionText || `@${option.label}`,
      description: [option.model, option.description].filter(Boolean).join(" / "),
      reasoningEffort: "",
      model: option.model || "",
      provider: option.provider || "",
      modelExplicit: true,
    }));
  return [chatGptXhigh, ...grokOptions].slice(0, 2);
}

function assistantMentionAliases() {
  const aliases = new Set();
  composerModelOptions().forEach((option) => {
    composerModelMentionAliases(option).forEach((alias) => aliases.add(alias));
  });
  return aliases;
}

function reasoningEffortFromAiAlias(value) {
  const alias = normalizeMentionSearch(value).replace(/[-_:\uFF1A]/g, "");
  if (!alias) return "";
  for (const option of configuredReasoningOptions()) {
    const aliases = [
      option.value,
      option.label,
      option.shortLabel,
    ].map((item) => normalizeMentionSearch(item).replace(/[-_:\uFF1A]/g, "")).filter(Boolean);
    if (aliases.includes(alias)) return option.value;
  }
  if (alias === "low" || alias === "\u4f4e" || alias === "\u4f4e\u63a8\u7406") return "low";
  if (alias === "medium" || alias === "med" || alias === "mid" || alias === "standard" || alias === "\u4e2d" || alias === "\u4e2d\u63a8\u7406" || alias === "\u9ed8\u8ba4" || alias === "\u6807\u51c6" || alias === "\u6a19\u6e96") return "medium";
  if (alias === "high" || alias === "\u9ad8" || alias === "\u9ad8\u63a8\u7406") return "high";
  if (alias === "xhi" || alias === "xhigh" || alias === "highest" || alias === "max" || alias === "maximum" || alias === "\u6781\u9ad8" || alias === "\u6975\u9ad8" || alias === "\u6700\u9ad8" || alias === "\u6700\u9ad8\u63a8\u7406") return "xhigh";
  return "";
}

function composerAiMentionInfo(text) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+(?:\s+[A-Za-z0-9_.\-\u4e00-\u9fff]+)?))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let model = "";
  let provider = "";
  let modelExplicit = false;
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const modelOption = composerModelOptionForMention(match[2], match[3] || "");
    if (!modelOption) continue;
    mentionsAi = true;
    model = modelOption.model || "";
    provider = modelOption.provider || "";
    modelExplicit = true;
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort, model, provider, modelExplicit };
}

function selectedComposerModel(text = getComposerText()) {
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.model || "";
  return selectedDefaultComposerModelOption().model || "";
}

function selectedComposerProvider(text = getComposerText()) {
  const mentionInfo = composerAiMentionInfo(text);
  if (mentionInfo.modelExplicit) return mentionInfo.provider || "";
  return selectedDefaultComposerModelOption().provider || "";
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
}


function composerHasDraft() {
  if (isChatSearchMode()) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

function isComposerStopMode() {
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
  if (typeof isCodexMuxView === "function" && isCodexMuxView() && composerHasDraft()) return false;
  return true;
}

function updateComposerAction() {
  const button = $("sendMessage");
  if (!button) return;
  const composer = $("composer");
  const attach = $("attachFile");
  const input = $("messageInput");
  const prevSearch = $("chatSearchPrev");
  const nextSearch = $("chatSearchNext");
  const searchMode = isChatSearchMode();
  composer?.classList.toggle("chat-search-composer", searchMode);
  input?.classList.toggle("chat-search-editor", searchMode);
  if (searchMode || !composerMentionAvailable()) closeGroupMentionMenu();
  updateComposerSourceControl();
  if (input) {
    input.setAttribute("enterkeyhint", searchMode ? "search" : "send");
    input.setAttribute("aria-label", searchMode ? "Search chat" : "Message Hermes");
  }
  if (searchMode) {
    if (attach) {
      attach.textContent = "×";
      attach.disabled = false;
      attach.setAttribute("aria-label", "关闭搜索");
      attach.setAttribute("title", "关闭搜索");
    }
    const draft = currentChatSearchDraft();
    button.textContent = "搜索";
    button.classList.remove("stop-mode");
    button.disabled = !draft;
    updateChatSearchStatus();
    renderComposerContext();
    return;
  }
  if (prevSearch) {
    prevSearch.hidden = true;
    prevSearch.disabled = true;
  }
  if (nextSearch) {
    nextSearch.hidden = true;
    nextSearch.disabled = true;
  }
  if (attach) {
    attach.textContent = "+";
    attach.setAttribute("aria-label", "添加文件");
    attach.setAttribute("title", "添加文件");
  }
  updateChatSearchStatus();
  const stopMode = isComposerStopMode();
  button.textContent = stopMode ? "Stop" : "Send";
  button.classList.toggle("stop-mode", stopMode);
  if (stopMode) button.disabled = false;
  renderComposerContext();
}
