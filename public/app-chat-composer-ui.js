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
  const existingMessages = new Map((existingThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of existingThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  const sortedMessages = sortedThreadMessages(messages);
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, sortedMessages)
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

function composerAiMentionOptions() {
  const label = assistantDisplayLabel();
  const modelLabel = state.defaultModel || label;
  const defaultEffort = validTaskReasoningEffort(state.defaultReasoningEffort) || "medium";
  const options = [{
    workspaceId: "assistant-default",
    label,
    virtual: true,
    mentionText: `@${label}`,
    description: [modelLabel, `\u9ed8\u8ba4 ${defaultReasoningLabel()}`].filter(Boolean).join(" / "),
    reasoningEffort: "",
  }];
  for (const option of configuredReasoningOptions()) {
    if (option.value === defaultEffort) continue;
    const shortLabel = option.shortLabel || option.label || option.value;
    options.push({
      workspaceId: `assistant-${option.value}`,
      label: `${label} ${shortLabel}`,
      virtual: true,
      mentionText: `@${label} ${shortLabel}`,
      description: [modelLabel, reasoningEffortLabel(option.value)].filter(Boolean).join(" / "),
      reasoningEffort: option.value,
    });
  }
  return options;
}

function assistantMentionAliases() {
  return new Set([
    "ai",
    assistantDisplayLabel(),
    state.defaultModel,
    state.modelProvider,
    "chatgpt",
  ].map(normalizeMentionSearch).filter(Boolean));
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
  const aliases = assistantMentionAliases();
  const pattern = /(^|[\s([{\u3000\uff08\uff3b\u3010\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])[@\uff20]\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+)(?:\s*[-_:\uFF1A]?\s*([A-Za-z0-9_.\-\u4e00-\u9fff]+))?(?=$|[\s)\]}\u3000\uff09\uff3d\u3011\uff0c,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u3001])/ig;
  let mentionsAi = false;
  let reasoningEffort = "";
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    if (!aliases.has(normalizeMentionSearch(match[2]))) continue;
    mentionsAi = true;
    const effort = reasoningEffortFromAiAlias(match[3] || "");
    if (effort) reasoningEffort = effort;
  }
  return { mentionsAi, reasoningEffort };
}

function groupChatMentionsAi(text) {
  return composerAiMentionInfo(text).mentionsAi;
}

function isMinimalWindowView() {
  return isTaskDetailView() || isTodoDetailView() || isSkillDetailView();
}

function activeThreadRunIds(thread = state.currentThread) {
  if (!thread) return [];
  return thread.activeRunIds || (thread.activeRunId ? [thread.activeRunId] : []);
}

function activeTaskRunIds() {
  if (!isTaskDetailView()) return [];
  const selected = taskListGroupsForThread(state.currentThread).find((group) => group.id === state.currentTaskGroupId);
  return (selected?.messages || [])
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function activeComposerRunIds() {
  if (isTaskDetailView()) return activeTaskRunIds();
  if (isSingleWindowChatView()) return activeChatRunIds();
  if (isSingleWindowView()) return activeThreadRunIds();
  return [];
}

function composerWorkspaceLabel() {
  const workspace = currentWorkspace();
  return String(workspace?.label || workspace?.id || state.selectedWorkspaceId || "").trim();
}

function composerPermissionLabel() {
  if (state.auth?.isOwner) return "Owner";
  if (state.auth?.workspaceId) return "\u4f4e\u6743\u9650";
  return "\u672a\u767b\u5f55";
}

function composerTargetLabel() {
  if (isChatSearchMode()) return "";
  if (isWeixinChatView()) return "\u5fae\u4fe1";
  if (isGroupChatView()) return "\u7fa4\u804a";
  if (isSingleWindowChatView()) return "\u804a\u5929";
  if (isSingleWindowView()) return "\u4efb\u52a1\u6d41";
  if (state.viewMode === "tasks") return state.currentTaskGroupId ? "话题回复" : "新话题";
  return "";
}

function composerReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const explicit = selectedComposerReasoningEffort(getComposerText());
  const compact = explicit ? taskReasoningCompactLabel({ value: explicit }) : defaultReasoningCompactLabel();
  return `\u63a8\u7406 ${compact}`;
}

function messageUsesHighPermissionGateway(message = {}) {
  const securityLevel = String(message.gatewaySecurityLevel || message.gateway_security_level || "").trim();
  return Boolean(
    message.gatewayMaintenance
    || message.gateway_maintenance
    || /^owner[-_]maintenance$/i.test(securityLevel)
  );
}

function activeRunGatewayPermissionLabel() {
  const active = [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
  ));
  if (!active) return null;
  return messageUsesHighPermissionGateway(active)
    ? { label: "Gateway 权限 高", tone: "active" }
    : { label: "Gateway 权限 低" };
}

function composerGatewayPermissionLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeLabel = activeRunGatewayPermissionLabel();
  if (activeLabel) return activeLabel;
  if (ownerElevationComposerAvailable() && ownerElevationOnceTagInfo(getComposerText())) {
    return { label: "Gateway 权限 高（本次）", tone: "active" };
  }
  if (ownerElevationActive()) {
    return { label: "Gateway 权限 高（限时）", tone: "active" };
  }
  return { label: "Gateway 权限 低" };
}

function composerDirectoryLabel() {
  if (state.pendingTaskDirectory?.projectId) {
    return String(state.pendingTaskDirectory.label || state.pendingTaskDirectory.projectId || "").trim();
  }
  if (isTaskListView() && state.taskDirectoryFilter?.projectId) {
    return taskDirectoryFilterLabel(state.taskDirectoryFilter);
  }
  return "";
}

function composerStatusMessages() {
  if (isTaskDetailView()) return currentTaskGroup()?.messages || [];
  if (isTaskWindowView()) return state.currentThread?.messages || [];
  if (isSingleWindowChatView()) return chatMessagesForThread(state.currentThread);
  if (isSingleWindowView()) return state.currentThread?.messages || [];
  return [];
}

function composerRunCounts() {
  const counts = { queued: 0, running: 0 };
  composerStatusMessages().forEach((message) => {
    if (message?.status === "running") counts.running += 1;
    if (message?.status === "queued") counts.queued += 1;
  });
  const activeFallback = activeComposerRunIds().length;
  if (!counts.running && activeFallback) counts.running = activeFallback;
  return counts;
}

function nativeKeyboardGeometry() {
  const keyboard = navigator.virtualKeyboard;
  const rect = keyboard?.boundingRect;
  if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
  const top = Number.isFinite(rect.y) ? rect.y : rect.top;
  if (!Number.isFinite(top) || top <= 0) return null;
  return { top, height: rect.height };
}

function visualViewportKeyboardMetrics() {
  const viewport = window.visualViewport;
  if (!viewport) return null;
  const layoutHeight = Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0,
    0,
  );
  const height = Math.round(viewport.height || 0);
  if (!layoutHeight || !height) return null;
  const offsetTop = Math.max(0, Math.round(viewport.offsetTop || 0));
  const bottomInset = Math.max(0, Math.round(layoutHeight - height - offsetTop));
  const keyboardLikely = bottomInset > 80 || height < layoutHeight * 0.82;
  return { height, offsetTop, bottomInset, keyboardLikely };
}

function updateKeyboardViewportMetrics() {
  const root = document.documentElement;
  const metrics = visualViewportKeyboardMetrics();
  const active = Boolean(state.composerFocused && isMobileLayout() && metrics?.keyboardLikely);
  state.keyboardViewportActive = active;
  root.classList.toggle("keyboard-viewport-active", active);
  if (active) {
    root.style.setProperty("--app-viewport-height", `${Math.max(240, metrics.height)}px`);
    root.style.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
    root.style.setProperty("--keyboard-bottom-inset", `${metrics.bottomInset}px`);
    if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  } else {
    root.style.removeProperty("--app-viewport-height");
    root.style.removeProperty("--app-viewport-offset-top");
    root.style.removeProperty("--keyboard-bottom-inset");
  }
  return active;
}

function updateMobileBottomNavReservation() {
  const root = document.documentElement;
  const nav = $("bottomNav");
  if (!nav || !isMobileLayout()) {
    root.style.removeProperty("--mobile-bottom-nav-reserved-height-runtime");
    return;
  }
  const rectHeight = Math.ceil(nav.getBoundingClientRect?.().height || 0);
  const contentHeight = Math.ceil(nav.scrollHeight || 0);
  const compact = isMobileLandscapeCompactLayout();
  const reserve = compact
    ? Math.max(62, rectHeight + 8, contentHeight + 8)
    : Math.max(96, rectHeight + 12, contentHeight + 12);
  root.style.setProperty("--mobile-bottom-nav-reserved-height-runtime", `${reserve}px`);
}

function refreshKeyboardViewportSoon(delay = 0) {
  window.setTimeout(() => {
    const active = updateKeyboardViewportMetrics();
    if (active) scheduleConversationBottomStick();
  }, Math.max(0, delay));
}

function refreshKeyboardViewportDuringFocus() {
  [0, 80, 180, 360, 700, 1100].forEach(refreshKeyboardViewportSoon);
}

function updateKeyboardContextMetrics() {
  const geometry = nativeKeyboardGeometry();
  const top = geometry ? Math.max(8, Math.round(geometry.top - 44)) : 0;
  state.keyboardContextTopPx = top;
  state.keyboardContextMode = Boolean(state.composerFocused && isMobileLayout() && geometry);
  document.documentElement.style.setProperty("--keyboard-context-top", `${top}px`);
  $("composer")?.classList.toggle("keyboard-context-mode", state.keyboardContextMode);
}

function refreshComposerContextSoon(delay = 0) {
  window.setTimeout(() => {
    updateKeyboardContextMetrics();
    renderComposerContext();
  }, Math.max(0, delay));
}

function composerContextItems(counts = composerRunCounts()) {
  if (isChatSearchMode()) return [];
  const items = [];
  const workspaceLabel = composerWorkspaceLabel();
  if (workspaceLabel) {
    items.push({ label: `${workspaceLabel} \u00b7 ${composerPermissionLabel()}`, tone: "primary" });
  }
  const targetLabel = composerTargetLabel();
  if (targetLabel) items.push({ label: targetLabel });
  const gatewayPermissionLabel = composerGatewayPermissionLabel();
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
  const reasoningLabel = composerReasoningLabel();
  if (reasoningLabel) items.push({ label: reasoningLabel });
  const directoryLabel = composerDirectoryLabel();
  if (directoryLabel) items.push({ label: `\u76ee\u5f55 ${directoryLabel}`, tone: "directory" });
  if (state.pendingArtifacts.length) {
    items.push({ label: `\u9644\u4ef6 ${state.pendingArtifacts.length}`, tone: "active" });
  }
  if (state.quotedReply) items.push({ label: "\u5f15\u7528\u56de\u590d", tone: "active" });
  if (counts.running) items.push({ label: `\u8fd0\u884c\u4e2d ${counts.running}`, tone: "active" });
  if (counts.queued) items.push({ label: `\u6392\u961f ${counts.queued}`, tone: "active" });
  return items.slice(0, 8);
}

function shouldShowComposerContext(items, counts) {
  if (!items.length || isChatSearchMode()) return false;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return false;
  return Boolean(
    state.composerFocused
    || composerHasDraft()
    || state.pendingArtifacts.length
    || state.quotedReply
    || state.pendingTaskDirectory?.projectId
    || (isTaskListView() && state.taskDirectoryFilter?.projectId)
    || counts.running
    || counts.queued
  );
}

function renderComposerContext() {
  const bar = $("composerContext");
  const composer = $("composer");
  if (!bar || !composer) return;
  updateKeyboardContextMetrics();
  const counts = composerRunCounts();
  const items = composerContextItems(counts);
  const visible = shouldShowComposerContext(items, counts);
  composer.classList.toggle("context-visible", visible);
  composer.classList.toggle("keyboard-context-mode", visible && state.keyboardContextMode);
  if (!visible) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = items.map((item) => {
    const tone = item.tone ? ` ${item.tone}` : "";
    return `<span class="composer-context-chip${tone}" title="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span></span>`;
  }).join("");
}

function normalizeRunEvent(event = {}, fallbackRunId = "") {
  return {
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: String(event.runId || event.run_id || fallbackRunId || ""),
    tool: event.tool || null,
    preview: String(event.preview || event.text || event.error || ""),
    duration: event.duration || null,
    error: Boolean(event.error),
  };
}

function runEventKey(event) {
  return [
    event.runId || "",
    event.timestamp || "",
    event.event || "",
    event.tool || "",
    event.preview || "",
  ].join("|");
}

function appendRunEventToCurrentThread(payload) {
  if (!state.currentThread || payload.threadId !== state.currentThread.id) return;
  const event = normalizeRunEvent(payload.event || {}, payload.runId || "");
  state.currentThread.events = Array.isArray(state.currentThread.events) ? state.currentThread.events : [];
  const key = runEventKey(event);
  if (!state.currentThread.events.some((item) => runEventKey(normalizeRunEvent(item)) === key)) {
    state.currentThread.events.push(event);
    state.currentThread.events = state.currentThread.events.slice(-80);
  }
  if (payload.thread) {
    state.currentThread.status = payload.thread.status || state.currentThread.status;
    state.currentThread.activeRunId = payload.thread.activeRunId;
    state.currentThread.activeRunIds = payload.thread.activeRunIds || [];
    state.currentThread.updatedAt = payload.thread.updatedAt || state.currentThread.updatedAt;
  }
  if (state.viewMode === "tasks") renderThreads();
  scheduleRenderCurrentThread();
}

function runEventTimeLabel(event) {
  const raw = Number(event?.timestamp || 0);
  const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function runEventTitle(event) {
  const name = String(event?.event || "event");
  const tool = String(event?.tool || "").trim();
  if (name === "response.output_item.added") return tool ? `开始 ${tool}` : "开始处理";
  if (name === "response.output_item.done") return tool ? `完成 ${tool}` : "阶段完成";
  if (name === "response.output_text.done") return "生成回复";
  if (name === "response.completed" || name === "run.completed") return "处理完成";
  if (name === "response.failed" || name === "run.failed") return "处理失败";
  return tool ? `${tool} · ${name.replace(/^response\./, "")}` : name.replace(/^response\./, "");
}

function runProgressEvents(thread, runIds) {
  const runSet = new Set((runIds || []).map(String).filter(Boolean));
  if (!thread || !runSet.size) return [];
  return (Array.isArray(thread.events) ? thread.events : [])
    .map((event) => normalizeRunEvent(event))
    .filter((event) => !event.runId || runSet.has(String(event.runId)))
    .slice(-4);
}

function renderRunProgressPanel(thread, runIds) {
  return "";
  const ids = (runIds || []).filter(Boolean);
  if (!ids.length) return "";
  const events = runProgressEvents(thread, ids);
  const rows = events.length
    ? events.slice().reverse().map((event) => `
      <div class="run-progress-row${event.error ? " error" : ""}">
        <span class="run-progress-dot" aria-hidden="true"></span>
        <span class="run-progress-main">${escapeHtml(runEventTitle(event))}</span>
        <span class="run-progress-time">${escapeHtml(runEventTimeLabel(event))}</span>
        ${event.preview ? `<span class="run-progress-preview">${escapeHtml(event.preview)}</span>` : ""}
      </div>`).join("")
    : `<div class="run-progress-row"><span class="run-progress-dot" aria-hidden="true"></span><span class="run-progress-main">等待模型反馈</span></div>`;
  return `<aside class="run-progress-panel" aria-live="polite">
    <div class="run-progress-head">
      <span>运行中</span>
      <span>${escapeHtml(ids.length > 1 ? `${ids.length} runs` : shortTaskDisplayId(ids[0]))}</span>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function composerHasDraft() {
  if (isChatSearchMode()) return false;
  return Boolean(getComposerText().trim() || state.pendingArtifacts.length);
}

function isComposerStopMode() {
  if (isChatSearchMode()) return false;
  if (!activeComposerRunIds().length) return false;
  if (isSingleWindowView() && composerHasDraft()) return false;
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
