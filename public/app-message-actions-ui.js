"use strict";

const CONVERSATION_USER_SCROLL_PROTECT_MS = 5000;

function conversationBottomOffset(el = $("conversation")) {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

function isNearBottom(threshold = 96) {
  return conversationBottomOffset() < threshold;
}

function conversationIsAtBottom(el = $("conversation"), threshold = 24) {
  return conversationBottomOffset(el) <= threshold;
}

function clearConversationReadAnchor() {
  state.conversationReadAnchorMessageId = "";
  state.conversationReadAnchorScrollTop = 0;
  state.conversationReadAnchorSetAt = 0;
}

function conversationUserScrollProtectActive() {
  return Date.now() < Number(state.conversationUserScrollProtectUntil || 0);
}

function markConversationUserScrollIntent(event = null) {
  const conversation = $("conversation");
  if (!conversation) return false;
  if (event?.target && event.target !== conversation && !conversation.contains(event.target)) return false;
  const now = Date.now();
  const protectUntil = now + CONVERSATION_USER_SCROLL_PROTECT_MS;
  state.conversationUserScrollProtectUntil = Math.max(Number(state.conversationUserScrollProtectUntil || 0), protectUntil);
  state.suppressChatAutoBottomUntil = Math.max(Number(state.suppressChatAutoBottomUntil || 0), protectUntil);
  state.conversationViewportBottomFollowUntil = 0;
  state.conversationPinnedToBottom = false;
  window.clearTimeout(state.conversationBottomStickTimer);
  updateConversationJumpBottomButton();
  return true;
}

function clearConversationUserScrollProtection() {
  state.conversationUserScrollProtectUntil = 0;
}

function conversationReadAnchorActive(conversation = $("conversation")) {
  const id = String(state.conversationReadAnchorMessageId || "").trim();
  if (!id || !conversation) return false;
  if (conversationIsAtBottom(conversation)) {
    clearConversationReadAnchor();
    return false;
  }
  return true;
}

function setConversationReadAnchor(messageId = "", scrollTop = 0) {
  const id = String(messageId || "").trim();
  if (!id) {
    clearConversationReadAnchor();
    return;
  }
  state.conversationReadAnchorMessageId = id;
  state.conversationReadAnchorScrollTop = Math.max(0, Number(scrollTop) || 0);
  state.conversationReadAnchorSetAt = Date.now();
  state.suppressChatAutoBottomUntil = Math.max(
    Number(state.suppressChatAutoBottomUntil || 0),
    Date.now() + 60000
  );
  state.conversationPinnedToBottom = false;
  window.clearTimeout(state.conversationBottomStickTimer);
}

function restoreConversationReadAnchorScroll(conversation = $("conversation")) {
  if (!conversationReadAnchorActive(conversation)) return false;
  const id = String(state.conversationReadAnchorMessageId || "").trim();
  if (id && typeof messageElementById === "function" && !messageElementById(id)) {
    clearConversationReadAnchor();
    return false;
  }
  const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
  const targetTop = Math.max(0, Math.min(maxTop, Number(state.conversationReadAnchorScrollTop || 0) || 0));
  conversation.scrollTop = targetTop;
  state.conversationPinnedToBottom = false;
  updateConversationJumpBottomButton();
  return true;
}

function shouldForceChatStickToBottom() {
  return !conversationReadAnchorActive()
    && !conversationUserScrollProtectActive()
    && isSingleWindowChatView()
    && Date.now() >= Number(state.suppressChatAutoBottomUntil || 0)
    && Date.now() < Number(state.forceChatStickToBottomUntil || 0);
}

function conversationViewportRefreshApplies() {
  if (isChatSearchMode()) return false;
  return isSingleWindowChatView() || isTaskDetailView();
}

function shouldStickConversationOnViewportChange() {
  return conversationViewportRefreshApplies();
}

function shouldFollowConversationBottomDuringViewport() {
  if (conversationReadAnchorActive()) return false;
  if (conversationUserScrollProtectActive()) return false;
  return shouldForceChatStickToBottom()
    || Date.now() < Number(state.conversationViewportBottomFollowUntil || 0)
    || state.conversationPinnedToBottom
    || isNearBottom(180);
}

function scrollConversationToBottom() {
  const conversation = $("conversation");
  if (!conversation) return;
  clearConversationReadAnchor();
  conversation.scrollTop = conversation.scrollHeight;
  state.conversationPinnedToBottom = true;
  updateConversationJumpBottomButton();
}

function scrollConversationToBottomSmooth() {
  const conversation = $("conversation");
  if (!conversation) return;
  clearConversationUserScrollProtection();
  clearConversationReadAnchor();
  const top = conversation.scrollHeight;
  if (typeof conversation.scrollTo === "function") {
    conversation.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } else {
    conversation.scrollTop = top;
  }
  state.conversationPinnedToBottom = true;
  window.setTimeout(updateConversationJumpBottomButton, prefersReducedMotion() ? 0 : 260);
}

function repaintConversationAfterViewportChange(conversation) {
  if (!conversation) return;
  conversation.style.transform = "translateZ(0)";
  void conversation.offsetHeight;
  requestAnimationFrame(() => {
    if (document.body.contains(conversation)) conversation.style.transform = "";
  });
}

function resetConversationScrollLayer(conversation, pinned) {
  if (!conversation || Date.now() > Number(state.conversationViewportLayerResetUntil || 0)) return;
  if (conversation.dataset.viewportLayerResetting === "1") return;
  const restoreTop = pinned
    ? conversation.scrollHeight
    : Math.max(0, Math.min(
      Math.max(0, conversation.scrollHeight - conversation.clientHeight),
      conversation.scrollTop
    ));
  conversation.dataset.viewportLayerResetting = "1";
  conversation.classList.add("conversation-layer-reset");
  conversation.style.webkitOverflowScrolling = "auto";
  conversation.style.overflowY = "hidden";
  conversation.scrollTop = restoreTop;
  void conversation.offsetHeight;
  requestAnimationFrame(() => {
    if (!document.body.contains(conversation)) {
      delete conversation.dataset.viewportLayerResetting;
      return;
    }
    const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
    const nudgedTop = pinned ? conversation.scrollHeight : Math.min(maxTop, restoreTop + 1);
    conversation.scrollTop = nudgedTop;
    void conversation.offsetHeight;
    requestAnimationFrame(() => {
      conversation.classList.remove("conversation-layer-reset");
      conversation.style.webkitOverflowScrolling = "";
      conversation.style.overflowY = "";
      conversation.scrollTop = pinned ? conversation.scrollHeight : restoreTop;
      delete conversation.dataset.viewportLayerResetting;
      updateConversationJumpBottomButton();
    });
  });
}

function clearConversationViewportLayerReset(conversation = $("conversation")) {
  if (!conversation) return;
  conversation.classList.remove("conversation-layer-reset");
  conversation.style.webkitOverflowScrolling = "";
  conversation.style.overflowY = "";
  delete conversation.dataset.viewportLayerResetting;
}

function clearConversationViewportRefreshTimers() {
  for (const timer of state.conversationViewportRefreshTimers || []) window.clearTimeout(timer);
  state.conversationViewportRefreshTimers = [];
  window.clearTimeout(state.conversationViewportRefreshTimer);
  state.conversationViewportRefreshTimer = 0;
}

function scheduleConversationViewportRefresh(conversation = $("conversation"), options = {}) {
  if (!conversation || !conversationViewportRefreshApplies()) return;
  if (!conversation.querySelector("[data-message-id], .chat-history-pager, .empty-state")) return;
  if (options.resetTimers !== false) clearConversationViewportRefreshTimers();
  const orientationSettle = Boolean(options.orientationSettle);
  const refresh = () => {
    if (!conversationViewportRefreshApplies() || !document.body.contains(conversation)) return;
    const top = conversation.scrollTop;
    const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
    const pinned = shouldFollowConversationBottomDuringViewport();
    conversation.style.overflowAnchor = "none";
    void conversation.offsetHeight;
    if (pinned) {
      conversation.scrollTop = conversation.scrollHeight;
      state.conversationPinnedToBottom = true;
    } else if (maxTop > 0) {
      const clampedTop = Math.max(0, Math.min(maxTop, top));
      conversation.scrollTop = Math.min(maxTop, clampedTop + 1);
      conversation.scrollTop = clampedTop;
    } else {
      conversation.scrollTop = 0;
    }
    repaintConversationAfterViewportChange(conversation);
    if (orientationSettle && Date.now() > Number(state.conversationViewportLayerResetDoneUntil || 0)) {
      state.conversationViewportLayerResetDoneUntil = Date.now() + 1800;
      resetConversationScrollLayer(conversation, pinned);
    }
    requestAnimationFrame(() => {
      conversation.style.overflowAnchor = "";
      updateConversationJumpBottomButton();
    });
  };
  if (orientationSettle) {
    state.conversationViewportRefreshTimers.push(window.setTimeout(refresh, 260));
    state.conversationViewportRefreshTimers.push(window.setTimeout(refresh, 720));
    return;
  }
  window.clearTimeout(state.conversationViewportRefreshTimer);
  state.conversationViewportRefreshTimer = window.setTimeout(refresh, 160);
}

function recoverConversationViewportAfterOrientation(conversation = $("conversation")) {
  if (!conversationViewportRefreshApplies()) return;
  if (!conversation || !document.body.contains(conversation)) return;
  if (typeof keyboardViewportShouldClearAfterOrientation === "function" && keyboardViewportShouldClearAfterOrientation()) {
    clearKeyboardViewportMetrics();
  } else {
    updateKeyboardViewportMetrics();
  }
  clearConversationViewportLayerReset(conversation);
  updateMobileBottomNavReservation();
  repaintConversationAfterViewportChange(conversation);
  scheduleMessageScrollButtonVisibility(conversation);
  scheduleMessageScrollButtonVisibilitySettle(conversation, [120, 360]);
}

function scheduleConversationOrientationRecovery(conversation = $("conversation")) {
  if (!conversation || !conversationViewportRefreshApplies()) return;
  [1180, 1800].forEach((delay) => {
    window.setTimeout(() => recoverConversationViewportAfterOrientation($("conversation")), delay);
  });
}

function conversationJumpBottomApplies() {
  if (isChatSearchMode()) return false;
  return isTaskDetailView() || isSingleWindowChatView() || (isSingleWindowView() && state.singleWindowMode === "task");
}

function conversationJumpBottomShouldShow(conversation = $("conversation")) {
  return Boolean(
    conversation
    && conversationJumpBottomApplies()
    && conversation.scrollHeight > conversation.clientHeight + 1
    && !conversationIsAtBottom(conversation)
  );
}

function hideInlineMessageStartScrollButtons(conversation = $("conversation")) {
  if (!conversation) return;
  conversation.querySelectorAll('.message-scroll-button[data-scroll-position="start"]').forEach((button) => {
    button.classList.toggle("hidden", true);
    button.classList.toggle("floating", false);
    positionFloatingMessageScrollButton(button, false);
    button.tabIndex = -1;
    button.setAttribute("aria-hidden", "true");
  });
}

function setConversationJumpBottomGlyph(button, glyph) {
  if (!button) return;
  const target = button.querySelector?.("[data-conversation-jump-glyph]") || button.querySelector?.("span");
  if (target) target.innerHTML = glyph;
}

function setConversationJumpButtonMode(button, mode, messageId = "") {
  if (!button) return;
  const startMode = mode === "message-start";
  button.dataset.scrollMode = startMode ? "message-start" : "bottom";
  button.dataset.scrollMessage = startMode ? String(messageId || "") : "";
  button.setAttribute("aria-label", startMode ? "Jump to reply start" : "Jump to bottom");
  button.setAttribute("title", startMode ? "Start" : "Bottom");
  setConversationJumpBottomGlyph(button, startMode ? "&#8593;" : "&#8595;");
}

function conversationReplyStartTargetId(conversation = $("conversation")) {
  if (!conversation || !conversationIsAtBottom(conversation)) return "";
  const id = String(state.messageScrollReplyStartTargetId || "").trim();
  if (!id) return "";
  const target = messageElementById(id);
  if (!target || !conversation.contains?.(target)) return "";
  return id;
}

function updateConversationJumpBottomButton() {
  const button = $("conversationJumpBottom");
  const conversation = $("conversation");
  if (!button) return;
  const showBottom = conversationJumpBottomShouldShow(conversation);
  const shouldShow = Boolean(showBottom);
  setConversationJumpButtonMode(button, "bottom", "");
  button.classList.toggle("hidden", !shouldShow);
  button.disabled = !shouldShow;
  button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
}

function wireConversationJumpBottomButton() {
  const button = $("conversationJumpBottom");
  if (!button || button.dataset.boundJumpBottom) return;
  button.dataset.boundJumpBottom = "1";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.scrollMode === "message-start" && button.dataset.scrollMessage) {
      scrollMessageIntoView(button.dataset.scrollMessage, "start");
      return;
    }
    scrollConversationToBottomSmooth();
  });
}

function scheduleConversationBottomStick() {
  if (Date.now() < Number(state.suppressChatAutoBottomUntil || 0)) return;
  if (conversationReadAnchorActive()) return;
  if (conversationUserScrollProtectActive()) return;
  window.clearTimeout(state.conversationBottomStickTimer);
  state.suppressConversationPinUntil = Date.now() + 700;
  const stick = () => {
    if (!shouldStickConversationOnViewportChange()) return;
    if (conversationUserScrollProtectActive()) return;
    scrollConversationToBottom();
    scheduleMessageScrollButtonVisibility($("conversation"));
  };
  requestAnimationFrame(() => {
    stick();
    requestAnimationFrame(stick);
  });
  state.conversationBottomStickTimer = window.setTimeout(stick, 260);
}

function handleConversationScrollState() {
  const conversation = $("conversation");
  scheduleMessageScrollButtonVisibility(conversation);
  if (conversation && conversationIsAtBottom(conversation)) {
    clearConversationReadAnchor();
  } else if (conversationReadAnchorActive(conversation)) {
    state.conversationReadAnchorScrollTop = Math.max(0, Number(conversation.scrollTop || 0) || 0);
    state.conversationPinnedToBottom = false;
  }
  if (Date.now() < Number(state.conversationViewportSettleUntil || 0)) {
    updateConversationJumpBottomButton();
    return;
  }
  if (Date.now() < state.suppressConversationPinUntil) return;
  state.conversationPinnedToBottom = conversationReadAnchorActive(conversation) ? false : isNearBottom();
  maybeLoadOlderChatMessages();
  maybeLoadOlderTaskMessages();
  updateConversationJumpBottomButton();
}

function maybeLoadOlderChatMessages() {
  const conversation = $("conversation");
  if (!conversation || !isSingleWindowChatView() || isChatSearchMode()) return;
  if (shouldForceChatStickToBottom()) return;
  if (state.olderChatMessagesLoading) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  if (!oldestLoadedChatMessageId()) return;
  if (conversation.scrollTop > CHAT_HISTORY_LOAD_TOP_PX) return;
  loadOlderChatMessages().catch(showError);
}

async function loadOlderChatMessages() {
  if (!state.currentThreadId || !isSingleWindowChatView() || state.olderChatMessagesLoading) return;
  const before = oldestLoadedChatMessageId();
  if (!before) return;
  const page = state.currentThread?.messagesPage || {};
  if (page.hasMoreBefore === false) return;
  state.olderChatMessagesLoading = true;
  renderCurrentThread({ stickToBottom: false });
  try {
    const params = chatMessagePageParams({ before, limit: CHAT_MESSAGE_PAGE_LIMIT });
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
    mergeCurrentThreadMessages(result.messages || [], result.page || null);
  } finally {
    state.olderChatMessagesLoading = false;
    renderCurrentThread({ stickToBottom: false });
  }
}

function taskDetailPageHasMoreBefore(page = state.currentThread?.messagesPage || {}) {
  const mode = String(page.mode || "").trim().toLowerCase();
  if (!["tasks", "task"].includes(mode)) return false;
  if (String(page.taskGroupId || "") !== String(state.currentTaskGroupId || "")) return false;
  if (page.hasMoreBefore === false) return false;
  return Boolean(page.oldestMessageId || Number(page.total || 0) > taskGroupMessagesForThread(state.currentThread, state.currentTaskGroupId).length);
}

function oldestLoadedTaskMessageId(thread = state.currentThread, taskGroupId = state.currentTaskGroupId) {
  return taskGroupMessagesForThread(thread, taskGroupId)[0]?.id || "";
}

function maybeLoadOlderTaskMessages() {
  const conversation = $("conversation");
  if (!conversation || !isTaskDetailView() || isChatSearchMode()) return;
  if (state.olderTaskMessagesLoading) return;
  if (!taskDetailPageHasMoreBefore()) return;
  if (!oldestLoadedTaskMessageId()) return;
  if (conversation.scrollTop > CHAT_HISTORY_LOAD_TOP_PX) return;
  loadOlderTaskMessages().catch(showError);
}

async function loadOlderTaskMessages() {
  if (!state.currentThreadId || !isTaskDetailView() || isChatSearchMode() || state.olderTaskMessagesLoading) return;
  const before = oldestLoadedTaskMessageId();
  if (!before || !taskDetailPageHasMoreBefore()) return;
  state.olderTaskMessagesLoading = true;
  renderCurrentThread({ stickToBottom: false });
  try {
    const params = taskMessagePageParams({ before, limit: taskDetailMessagePageLimit() });
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/messages?${params}`);
    mergeCurrentThreadMessages(result.messages || [], result.page || null);
  } finally {
    state.olderTaskMessagesLoading = false;
    renderCurrentThread({ stickToBottom: false });
  }
}

function handleViewportLayoutChange(event = null) {
  const type = String(event?.type || "");
  const orientationEvent = type === "orientationchange" || type === "change";
  if (!orientationEvent && nativeShellViewportLayoutChangeIsNoise()) return;
  if (orientationEvent && conversationViewportRefreshApplies()) {
    state.conversationViewportSettleUntil = Date.now() + 900;
    state.conversationViewportLayerResetUntil = Date.now() + 1100;
    if (conversationReadAnchorActive()) {
      state.conversationPinnedToBottom = false;
    } else {
      state.conversationViewportBottomFollowUntil = Date.now() + 1100;
      state.conversationPinnedToBottom = true;
    }
  }
  updateKeyboardViewportMetrics();
  updateMobileBottomNavReservation();
  if (typeof settleEmbeddedPluginViewportBroadcast === "function") {
    settleEmbeddedPluginViewportBroadcast(orientationEvent ? "host_orientation_viewport" : "host_visual_viewport");
  }
  updateNavigationControls();
  refreshComposerContextSoon(0);
  scheduleMessageScrollButtonVisibility($("conversation"));
  updateConversationJumpBottomButton();
  scheduleConversationViewportRefresh($("conversation"), { resetTimers: orientationEvent, orientationSettle: orientationEvent });
  if (orientationEvent) scheduleConversationOrientationRecovery($("conversation"));
  if (!shouldStickConversationOnViewportChange()) return;
  if (!shouldFollowConversationBottomDuringViewport()) return;
  scheduleConversationBottomStick();
}

function nativeShellViewportLayoutSnapshot() {
  const viewport = window.visualViewport;
  const keyboard = typeof stableKeyboardViewportMetrics === "function"
    ? stableKeyboardViewportMetrics(visualViewportKeyboardMetrics())
    : null;
  return {
    width: Math.round(Number(viewport?.width || window.innerWidth || 0)),
    height: Math.round(Number(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0)),
    offsetTop: Math.round(Number(viewport?.offsetTop || 0)),
    offsetLeft: Math.round(Number(viewport?.offsetLeft || 0)),
    innerWidth: Math.round(Number(window.innerWidth || 0)),
    innerHeight: Math.round(Number(window.innerHeight || 0)),
    scrollX: Math.round(Number(window.scrollX || document.documentElement?.scrollLeft || document.body?.scrollLeft || 0)),
    scrollY: Math.round(Number(window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0)),
    keyboardLikely: Boolean(keyboard?.keyboardLikely),
  };
}

function nativeShellViewportLayoutChangeIsNoise() {
  if (typeof nativeShellEmbeddedPluginViewportActive !== "function" || !nativeShellEmbeddedPluginViewportActive()) return false;
  const next = nativeShellViewportLayoutSnapshot();
  const previous = state.nativeShellViewportLayoutSnapshot || null;
  if (!previous) {
    state.nativeShellViewportLayoutSnapshot = next;
    return false;
  }
  const stable = previous.keyboardLikely === next.keyboardLikely
    && Math.abs(previous.width - next.width) <= 3
    && Math.abs(previous.height - next.height) <= 3
    && Math.abs(previous.offsetTop - next.offsetTop) <= 3
    && Math.abs(previous.offsetLeft - next.offsetLeft) <= 3
    && Math.abs(previous.innerWidth - next.innerWidth) <= 3
    && Math.abs(previous.innerHeight - next.innerHeight) <= 3
    && Math.abs(previous.scrollX - next.scrollX) <= 3
    && Math.abs(previous.scrollY - next.scrollY) <= 3;
  if (!stable) state.nativeShellViewportLayoutSnapshot = next;
  return stable;
}

function messageElementById(messageId) {
  const conversation = $("conversation");
  if (!conversation || !messageId) return null;
  return [...conversation.querySelectorAll("[data-message-id]")]
    .find((item) => item.dataset.messageId === messageId) || null;
}

function clearRouteScrollTarget() {
  state.routeScrollTaskGroupId = "";
  state.routeScrollMessageId = "";
}

function setRouteScrollTarget(taskGroupId, messageId = "") {
  state.routeScrollTaskGroupId = String(taskGroupId || "").trim();
  state.routeScrollMessageId = String(messageId || "").trim();
}

function routeScrollMessageIdForTaskGroup(group) {
  if (!group || !state.routeScrollTaskGroupId || state.routeScrollTaskGroupId !== group.id) return "";
  const messages = Array.isArray(group.messages) ? group.messages : [];
  const requested = state.routeScrollMessageId;
  if (requested && messages.some((message) => message.id === requested)) return requested;
  if (requested) return "";
  return [...messages].reverse().find((message) => message?.id)?.id || "";
}

function consumeTaskRouteScrollTarget(group) {
  const messageId = routeScrollMessageIdForTaskGroup(group);
  if (!messageId) return false;
  clearRouteScrollTarget();
  scrollRouteMessageIntoViewStable(messageId, "start");
  return true;
}

function consumeChatRouteScrollTarget(messages = []) {
  if (!isSingleWindowChatView() || !state.routeScrollMessageId) return false;
  const activeTaskGroupId = activeChatTaskGroupId();
  if (state.routeScrollTaskGroupId && state.routeScrollTaskGroupId !== activeTaskGroupId) return false;
  const requested = String(state.routeScrollMessageId || "");
  const messageId = messages.some((message) => String(message?.id || "") === requested)
    ? requested
    : "";
  if (!messageId) return false;
  clearRouteScrollTarget();
  scrollRouteMessageIntoViewStable(messageId, "start");
  return true;
}

function scrollRouteMessageIntoViewStable(messageId, position = "start") {
  const id = String(messageId || "").trim();
  if (!id) return;
  const align = () => scrollMessageIntoView(id, position);
  requestAnimationFrame(align);
  window.setTimeout(align, 180);
  window.setTimeout(align, 560);
}

function scrollMessageIntoView(messageId, position = "start") {
  const conversation = $("conversation");
  const target = messageElementById(messageId);
  if (!conversation || !target) return;
  state.suppressChatAutoBottomUntil = Date.now() + 5000;
  state.conversationPinnedToBottom = false;
  window.clearTimeout(state.conversationBottomStickTimer);
  const conversationRect = conversation.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const maxTop = Math.max(0, conversation.scrollHeight - conversation.clientHeight);
  const rawTop = position === "end"
    ? conversation.scrollTop + targetRect.bottom - conversationRect.top - conversation.clientHeight + 8
    : conversation.scrollTop + targetRect.top - conversationRect.top - 8;
  const top = Math.max(0, Math.min(maxTop, rawTop));
  if (position === "start") setConversationReadAnchor(messageId, top);
  else clearConversationReadAnchor();
  conversation.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  window.setTimeout(updateConversationJumpBottomButton, prefersReducedMotion() ? 0 : 260);
}

function renderMessageScrollButton(message, position) {
  if (message?.role !== "assistant" || !message?.id) return "";
  const end = position === "end";
  return `<button class="message-scroll-button hidden" type="button" data-scroll-message="${escapeHtml(message.id)}" data-scroll-position="${end ? "end" : "start"}" aria-label="${end ? "Jump to reply end" : "Jump to reply start"}" title="${end ? "End" : "Start"}" aria-hidden="true" tabindex="-1"><span class="message-scroll-glyph">${end ? "&#8595;" : "&#8593;"}</span></button>`;
}

function messageScrollEligibleByContent(message = {}) {
  if (message?.role !== "assistant" || !message?.id) return false;
  if (message.revokedAt) return false;
  const content = String(message.content || "");
  if (!content.trim()) return false;
  const estimatedLines = content.split(/\r\n|\r|\n/).reduce((total, line) => {
    const cjk = (line.match(/[\u2e80-\u9fff\uac00-\ud7af]/g) || []).length;
    const ascii = Math.max(0, line.length - cjk);
    const units = cjk + (ascii * 0.55);
    return total + Math.max(1, Math.ceil(units / 18));
  }, 0);
  return estimatedLines > 22;
}

function canUseMessageReplyActions(message) {
  return Boolean(message?.role === "assistant" && message?.id && !message.revokedAt);
}

function renderMessageCopyButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-copy-message="${escapeHtml(message.id)}" aria-label="Copy full reply" title="Copy full reply"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="5" width="11" height="11" rx="2.5"></rect><rect x="5" y="8" width="11" height="11" rx="2.5"></rect></svg></button>`;
}

function renderMessageImageButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-share-message-image="${escapeHtml(message.id)}" aria-label="Share reply image" title="Share reply image"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11"></path><path d="M8.5 7.5 12 4l3.5 3.5"></path><path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"></path></svg></button>`;
}

function renderMessageNoteButton(message) {
  if (!canUseMessageReplyActions(message)) return "";
  return `<button class="message-mini-action-button" type="button" data-save-message-note="${escapeHtml(message.id)}" aria-label="保存到 Note" title="保存到 Note"><svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3.5-2-3.5 2-3.5-2L5 21V5a2 2 0 0 1 2-2Z"></path><path d="M9 8h6"></path><path d="M9 12h5"></path></svg></button>`;
}

function renderMessageActionStrip(message, scrollPosition) {
  const controls = [
    renderMessageScrollButton(message, scrollPosition),
    renderMessageCopyButton(message),
    renderMessageImageButton(message),
    renderMessageNoteButton(message),
  ].filter(Boolean).join("");
  return controls ? `<span class="message-action-strip">${controls}</span>` : "";
}

function renderMessageGatewayDiagnostic(message) {
  return "";
}

function wardrobeOutfitWearActionState(message = {}) {
  return message?.pluginActions?.wardrobeOutfitWearIntent
    || message?.pluginActions?.outfit_wear_intent
    || message?.plugin_actions?.wardrobeOutfitWearIntent
    || message?.plugin_actions?.outfit_wear_intent
    || message?.wardrobeOutfitWearIntent
    || message?.outfit_wear_intent
    || message?.outfitWearIntent
    || message?.metadata?.wardrobeOutfitWearIntent
    || message?.metadata?.outfit_wear_intent
    || message?.metadata?.outfitWearIntent
    || message?.rawJson?.pluginActions?.wardrobeOutfitWearIntent
    || message?.rawJson?.pluginActions?.outfit_wear_intent
    || message?.rawJson?.plugin_actions?.wardrobeOutfitWearIntent
    || message?.rawJson?.plugin_actions?.outfit_wear_intent
    || message?.rawJson?.wardrobeOutfitWearIntent
    || message?.rawJson?.outfit_wear_intent
    || message?.rawJson?.outfitWearIntent
    || null;
}

function wardrobeOutfitWearActionDiagnostic(message = {}) {
  return message?.pluginActionDiagnostics?.wardrobeOutfitWearIntent
    || message?.pluginActionDiagnostics?.outfit_wear_intent
    || message?.plugin_action_diagnostics?.wardrobeOutfitWearIntent
    || message?.plugin_action_diagnostics?.outfit_wear_intent
    || null;
}

function wardrobeOutfitWearActionLabel(action = {}) {
  const status = String(action.status || "").trim();
  if (status === "running") return "写入中";
  if (status === "needs_confirmation") return "确认替换";
  if (status === "stored") {
    const outfitId = String(action.outfitId || action.outfit_id || "").trim();
    const verified = action.readbackVerified || action.readback_verified;
    return `已入库${outfitId ? ` #${outfitId}` : ""}${verified ? " · 已验证" : ""}`;
  }
  if (status === "error") return "写入失败";
  return "入库";
}

function wardrobeOutfitWearDiagnosticLabel(diagnostic = {}) {
  const reason = String(diagnostic.reason || diagnostic.code || "").trim();
  if (reason === "expired") return "已过期";
  if (reason === "prepare_tool_output_not_attached" || diagnostic.code === "intent_metadata_missing") return "需重新生成";
  return "不可入库";
}

function renderWardrobeOutfitWearAction(message = {}) {
  const action = wardrobeOutfitWearActionState(message);
  const diagnostic = wardrobeOutfitWearActionDiagnostic(message);
  if (!action && diagnostic) {
    const reason = String(diagnostic.reason || diagnostic.code || "intent_unavailable").trim();
    const title = reason === "expired"
      ? "衣橱入库动作已过期，请重新生成搭配建议"
      : "这条消息暂时没有可执行的衣橱入库动作";
    return `<button class="message-wardrobe-action" type="button" data-wardrobe-outfit-status="blocked" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" disabled>
      <svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 7.5 12 4l4 3.5"></path><path d="M6.5 8.5 9 7l3 2 3-2 2.5 1.5L16 20H8L6.5 8.5Z"></path><path d="M9 15h6"></path></svg>
      <span>${escapeHtml(wardrobeOutfitWearDiagnosticLabel(diagnostic))}</span>
    </button>`;
  }
  if (!action || action.kind !== "outfit_wear_intent") return "";
  const status = String(action.status || "").trim();
  if (!["ready", "running", "needs_confirmation", "stored", "error"].includes(status)) return "";
  const disabled = status === "running" || status === "stored" || status === "error" || action.executable === false;
  const intent = action.intent || {};
  const wearDate = String(intent.wear_date || intent.wearDate || "").trim();
  const itemCount = Array.isArray(intent.items) ? intent.items.length : 0;
  const title = status === "stored"
    ? `已写入衣橱穿着记录${action.outfitId ? ` #${action.outfitId}` : ""}${action.readbackVerified ? " · 已回读验证" : ""}`
    : `写入衣橱穿着记录${wearDate ? ` ${wearDate}` : ""}${itemCount ? ` · ${itemCount}件` : ""}`;
  const statusAttr = status ? ` data-wardrobe-outfit-status="${escapeHtml(status)}"` : "";
  const label = wardrobeOutfitWearActionLabel(action);
  return `<button class="message-wardrobe-action" type="button" data-wardrobe-outfit-wear-message="${escapeHtml(message.id || "")}"${statusAttr} title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${disabled ? " disabled" : ""}>
    <svg class="message-line-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 7.5 12 4l4 3.5"></path><path d="M6.5 8.5 9 7l3 2 3-2 2.5 1.5L16 20H8L6.5 8.5Z"></path><path d="M10 20v-7"></path><path d="M14 20v-7"></path></svg>
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function renderMessageFooter(message, usage) {
  const actions = renderMessageActionStrip(message, "start");
  const gatewayDiagnostic = renderMessageGatewayDiagnostic(message);
  const wardrobeAction = renderWardrobeOutfitWearAction(message);
  const skills = renderMessageSkillPanel(message, state.currentThread);
  const runProgressHistory = typeof renderMessageRunProgressHistory === "function"
    ? renderMessageRunProgressHistory(state.currentThread, message)
    : "";
  if (!actions && !usage && !wardrobeAction && !skills && !gatewayDiagnostic && !runProgressHistory) return "";
  const meta = `${gatewayDiagnostic}${usage}${wardrobeAction}${skills}${runProgressHistory}`;
  return `<div class="message-footer-row">${actions}<div class="message-footer-meta">${meta}</div></div>`;
}

function eventClientPoint(event) {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function suppressTransientActivations(ms = 700) {
  state.suppressTransientActivationUntil = Math.max(state.suppressTransientActivationUntil || 0, Date.now() + ms);
}

function transientActivationSuppressed() {
  return Date.now() < (state.suppressTransientActivationUntil || 0);
}

function suppressTransientActivationEvent(event) {
  if (!transientActivationSuppressed()) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  return true;
}

function eventInAttachFileHitZone(event) {
  const button = $("attachFile");
  if (!button || button.disabled) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const rect = button.getBoundingClientRect();
  const slop = 6;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function eventInTopNavHitZone(event) {
  const button = $("openMenu");
  if (!button || button.disabled || button.hidden) return false;
  const rect = button.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const point = eventClientPoint(event);
  if (!point) return false;
  const slop = 10;
  return point.x >= rect.left - slop
    && point.x <= rect.right + slop
    && point.y >= rect.top - slop
    && point.y <= rect.bottom + slop;
}

function activateTopNavButton() {
  if (typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive()) {
    if (typeof closeDirectoryTopicDraft === "function") closeDirectoryTopicDraft();
    return;
  }
  if (isSkillDetailView()) {
    closeSkillDetail();
    return;
  }
  if (isTaskDetailView()) {
    openTaskList();
    return;
  }
  if (isTodoDetailView()) {
    openTodoList();
    return;
  }
  if (kanbanComposerOpen()) {
    openTodoList();
    return;
  }
  if (typeof automationDetailInboxReturnActive === "function" && automationDetailInboxReturnActive()) {
    closeAutomationSecondarySurface();
    return;
  }
  if (isAutomationDetailView()) {
    openAutomationList();
    return;
  }
  if (typeof automationSecondaryReturnActive === "function" && automationSecondaryReturnActive()) {
    closeAutomationSecondarySurface();
    return;
  }
  if (isActionInboxDetailView() || isActionInboxCreateView()) {
    openActionInboxOverview();
    return;
  }
  if (state.viewMode === "projects" && directoryActivePath()) {
    navigateDirectoryUp({ animateEntry: true }).catch(showError);
    return;
  }
  openSidebar();
}

function handleTopNavActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInTopNavHitZone(event)) return false;
  const recentActivation = Date.now() - (state.topNavActivationAt || 0) < 500;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (recentActivation) return true;
  state.topNavActivationAt = Date.now();
  activateTopNavButton();
  return true;
}

function openAttachFilePicker() {
  const input = $("fileInput");
  if (!input) return;
  if (typeof markSystemFilePickerOpened === "function") markSystemFilePickerOpened();
  else state.attachFilePickerActivationAt = Date.now();
  input.value = "";
  input.click();
}

function handleAttachFileActivation(event, options = {}) {
  const fromHitZone = Boolean(options.fromHitZone);
  if (fromHitZone && !eventInAttachFileHitZone(event)) return false;
  const recentActivation = Date.now() - (state.attachFilePickerActivationAt || 0) < 650;
  if (recentActivation && !state.chatSearchOpen) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return true;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (state.chatSearchOpen) {
    $("attachFile").dataset.searchCloseHandled = "1";
    closeChatSearch();
    return true;
  }
  if (state.attachFileMenuOpen) closeAttachFileMenu();
  else openAttachFileMenu();
  return true;
}

function wireMessageScrollButtons(root) {
  root?.querySelectorAll?.("[data-scroll-message]").forEach((button) => {
    if (button.dataset.boundScrollMessage) return;
    button.dataset.boundScrollMessage = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollMessageIntoView(button.dataset.scrollMessage || "", button.dataset.scrollPosition || "start");
    });
  });
  applyMessageScrollButtonVisibility(root);
}

function currentMessageById(messageId) {
  const id = String(messageId || "");
  if (!id) return null;
  return (state.currentThread?.messages || []).find((message) => message?.id === id) || null;
}

async function confirmWardrobeOutfitReplace(action = {}) {
  if (typeof openAppConfirmDialog !== "function") return false;
  const intent = action.intent || {};
  const wearDate = String(intent.wear_date || intent.wearDate || "").trim();
  return openAppConfirmDialog({
    title: "确认替换",
    message: `这一天已有穿着记录${wearDate ? `（${wearDate}）` : ""}。`,
    detail: "确认后会用这条推荐替换当天记录。",
    confirmLabel: "确认替换",
    cancelLabel: "取消",
  });
}

function applyWardrobeOutfitWearActionResponse(result = {}) {
  if (result.thread && typeof upsertThreadSummary === "function") {
    upsertThreadSummary(result.thread);
  }
  if (result.message && typeof upsertMessage === "function") {
    upsertMessage(result.message);
  }
  return result.actionState || result.message?.pluginActions?.wardrobeOutfitWearIntent || null;
}

async function executeWardrobeOutfitWearMessageAction(messageId, options = {}) {
  const message = currentMessageById(messageId);
  if (!message || !state.currentThread?.id) throw new Error("未找到可执行的衣橱消息");
  const action = wardrobeOutfitWearActionState(message);
  if (!action || action.kind !== "outfit_wear_intent") throw new Error("这条消息没有可执行的衣橱入库动作");
  const needsConfirmation = String(action.status || "") === "needs_confirmation";
  if (needsConfirmation && !options.confirmReplace) {
    const confirmed = await confirmWardrobeOutfitReplace(action);
    if (!confirmed) return null;
    return executeWardrobeOutfitWearMessageAction(messageId, { confirmReplace: true });
  }
  const result = await api("/api/plugin-conversation/actions/wardrobe/outfit-wear-intent", {
    method: "POST",
    body: JSON.stringify({
      threadId: state.currentThread.id,
      messageId,
      workspaceId: state.currentThread.workspaceId || state.selectedWorkspaceId || "",
      confirmReplace: Boolean(options.confirmReplace),
      mode: options.confirmReplace ? "replace" : "create_only",
    }),
  });
  const nextAction = applyWardrobeOutfitWearActionResponse(result);
  if (String(nextAction?.status || "") === "needs_confirmation" && !options.confirmReplace) {
    const confirmed = await confirmWardrobeOutfitReplace(nextAction);
    if (confirmed) return executeWardrobeOutfitWearMessageAction(messageId, { confirmReplace: true });
  }
  if (result?.ok === false) throw new Error(result.error || "衣橱入库失败");
  return result;
}

function wireMessageReplyActionButtons(root) {
  root?.querySelectorAll?.("[data-wardrobe-outfit-wear-message]").forEach((button) => {
    if (button.dataset.boundWardrobeOutfitWear) return;
    button.dataset.boundWardrobeOutfitWear = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await executeWardrobeOutfitWearMessageAction(button.dataset.wardrobeOutfitWearMessage || "");
      } catch (err) {
        showError(err);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  });
  root?.querySelectorAll?.("[data-copy-message]").forEach((button) => {
    if (button.dataset.boundCopyMessage) return;
    button.dataset.boundCopyMessage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await copyMessageContent(button.dataset.copyMessage || "");
      } catch (err) {
        showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
  root?.querySelectorAll?.("[data-share-message-image]").forEach((button) => {
    if (button.dataset.boundShareMessageImage) return;
    button.dataset.boundShareMessageImage = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await shareMessageImage(button.dataset.shareMessageImage || "");
      } catch (err) {
        if (err?.name !== "AbortError") showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
  root?.querySelectorAll?.("[data-save-message-note]").forEach((button) => {
    if (button.dataset.boundSaveMessageNote) return;
    button.dataset.boundSaveMessageNote = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await saveMessageToNote(button.dataset.saveMessageNote || "");
      } catch (err) {
        if (err?.name !== "AbortError") showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function positionMessageFooterPanel(details, panelSelector) {
  if (!details?.open) return;
  const panel = details.querySelector(panelSelector);
  if (!panel) return;
  panel.style.setProperty("--usage-panel-shift", "0px");
  requestAnimationFrame(() => {
    if (!details.open) return;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    if (!viewportWidth) return;
    const rect = panel.getBoundingClientRect();
    const margin = 10;
    let shift = 0;
    if (rect.right > viewportWidth - margin) shift -= rect.right - (viewportWidth - margin);
    if (rect.left + shift < margin) shift += margin - (rect.left + shift);
    panel.style.setProperty("--usage-panel-shift", `${Math.round(shift)}px`);
  });
}

function positionUsagePanel(details) { positionMessageFooterPanel(details, ".usage-details"); }

function positionMessageSkillPanel(details) { positionMessageFooterPanel(details, ".message-skill-details"); }

function positionRunProgressHistoryPanel(details) {
  if (!details?.open) return;
  const panel = details.querySelector(".run-progress-history-details");
  if (!panel) return;
  panel.style.setProperty("--usage-panel-shift", "0px");
  panel.style.removeProperty("--run-progress-history-top");
  panel.style.removeProperty("--run-progress-history-bottom");
  panel.style.removeProperty("--run-progress-history-max-height");
  requestAnimationFrame(() => {
    if (!details.open) return;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return;
    const margin = 12;
    const mobile = viewportWidth <= 720;
    if (mobile) {
      const anchor = (details.querySelector("summary") || details).getBoundingClientRect();
      const baseTop = margin;
      const bottomAboveAnchor = Math.max(margin, viewportHeight - Math.max(0, anchor.top) + 10);
      const availableAboveAnchor = viewportHeight - baseTop - bottomAboveAnchor;
      const maxAvailableHeight = Math.max(220, Math.min(460, Math.round(viewportHeight * 0.68), Math.max(220, availableAboveAnchor)));
      const contentPanel = panel.querySelector(".run-progress-panel");
      const contentRect = contentPanel?.getBoundingClientRect?.();
      const contentHeight = Math.ceil(contentRect?.height || contentPanel?.scrollHeight || panel.scrollHeight || maxAvailableHeight) + 16;
      const targetHeight = Math.min(maxAvailableHeight, Math.max(180, contentHeight));
      const top = availableAboveAnchor >= targetHeight
        ? Math.max(margin, Math.min(margin + 8, Math.max(margin, anchor.top - targetHeight - 10)))
        : margin;
      const maxHeight = Math.max(180, Math.min(maxAvailableHeight, viewportHeight - top - margin));
      panel.style.setProperty("--run-progress-history-top", `${Math.round(top)}px`);
      panel.style.setProperty("--run-progress-history-bottom", "auto");
      panel.style.setProperty("--run-progress-history-max-height", `${Math.round(maxHeight)}px`);
      return;
    }
    const rect = panel.getBoundingClientRect();
    const marginDesktop = 10;
    let shift = 0;
    if (rect.right > viewportWidth - marginDesktop) shift -= rect.right - (viewportWidth - marginDesktop);
    if (rect.left + shift < marginDesktop) shift += marginDesktop - (rect.left + shift);
    panel.style.setProperty("--usage-panel-shift", `${Math.round(shift)}px`);
  });
}

function closeOpenUsagePanels(root = document) {
  root.querySelectorAll?.(".usage[open]")?.forEach((details) => {
    details.open = false;
  });
}

function closeOpenMessageSkillPanels(root = document) {
  root.querySelectorAll?.(".message-skills[open]")?.forEach((details) => {
    details.open = false;
  });
}

function closeOpenRunProgressHistoryPanels(root = document) {
  root.querySelectorAll?.(".run-progress-history[open]")?.forEach((details) => {
    details.open = false;
  });
}

function wireMessageFooterPopupDismiss() {
  if (document.documentElement.dataset.messageFooterPopupDismissBound) return;
  document.documentElement.dataset.messageFooterPopupDismissBound = "1";
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".usage, .message-skills, .run-progress-history")) return;
    closeOpenUsagePanels();
    closeOpenMessageSkillPanels();
    closeOpenRunProgressHistoryPanels();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOpenUsagePanels();
    closeOpenMessageSkillPanels();
    closeOpenRunProgressHistoryPanels();
  });
}

function wireUsagePanels(root) {
  wireMessageFooterPopupDismiss();
  root?.querySelectorAll?.(".usage").forEach((details) => {
    if (details.dataset.boundUsagePanel) return;
    details.dataset.boundUsagePanel = "1";
    details.addEventListener("toggle", () => {
      if (details.open) closeOpenMessageSkillPanels();
      if (details.open) closeOpenRunProgressHistoryPanels();
      positionUsagePanel(details);
    });
  });
}

function wireMessageSkillPanels(root) {
  wireMessageFooterPopupDismiss();
  root?.querySelectorAll?.(".message-skills").forEach((details) => {
    if (details.dataset.boundSkillPanel) return;
    details.dataset.boundSkillPanel = "1";
    details.addEventListener("toggle", () => {
      if (details.open) closeOpenUsagePanels();
      if (details.open) closeOpenRunProgressHistoryPanels();
      positionMessageSkillPanel(details);
    });
  });
}

function wireRunProgressHistoryPanels(root) {
  wireMessageFooterPopupDismiss();
  root?.querySelectorAll?.(".run-progress-history").forEach((details) => {
    if (details.dataset.boundRunProgressHistoryPanel) return;
    details.dataset.boundRunProgressHistoryPanel = "1";
    details.addEventListener("toggle", () => {
      if (details.open) closeOpenUsagePanels();
      if (details.open) closeOpenMessageSkillPanels();
      positionRunProgressHistoryPanel(details);
    });
  });
}

function updateMessageScrollButtonVisibility(root) {
  const conversation = $("conversation");
  if (!conversation || !root?.querySelectorAll) return;
  const viewportHeight = Math.max(0, conversation.clientHeight || window.innerHeight || 0);
  const conversationRect = conversation.getBoundingClientRect?.() || { top: 0, left: 0, right: 0, bottom: viewportHeight };
  let replyStartTargetId = "";
  const articles = [
    ...(root.matches?.(".message[data-message-id]") ? [root] : []),
    ...root.querySelectorAll(".message[data-message-id]"),
  ];
  articles.forEach((article) => {
    const articleRect = article.getBoundingClientRect?.() || { top: 0, left: 0, right: 0, bottom: 0 };
    const messageBody = article.querySelector?.(".message-body") || null;
    const messageHeight = Math.max(
      articleRect.height || 0,
      article.offsetHeight || 0,
      article.scrollHeight || 0,
      messageBody?.offsetHeight || 0,
      messageBody?.scrollHeight || 0
    );
    const wasShown = article.dataset.messageScrollButtonVisible === "1";
    const previouslyEligible = article.dataset.messageScrollEligible === "1";
    const hasRunProgress = Boolean(article.querySelector(".run-progress-panel.inline:not(.terminal)"));
    const measured = viewportHeight > 0 && messageHeight > 0;
    const canReturnToStart = messageScrollCanReturnToStart(articleRect, conversationRect);
    const canJumpToEnd = messageScrollCanJumpToEnd(articleRect, conversationRect);
    const showThreshold = Math.max(180, viewportHeight - 24);
    const hideThreshold = Math.max(160, viewportHeight - 96);
    const measuredLong = measured && messageHeight > showThreshold;
    const contentEligible = previouslyEligible || measuredLong || wasShown;
    if (contentEligible) article.dataset.messageScrollEligible = "1";
    const suppressForActiveRun = hasRunProgress && !contentEligible && !wasShown;
    const shouldShow = viewportHeight > 0 && !suppressForActiveRun && (
      canReturnToStart
      || canJumpToEnd
      || measuredLong
      || (!measured && contentEligible)
      || (contentEligible && messageHeight > hideThreshold)
    );
    if (shouldShow) article.dataset.messageScrollButtonVisible = "1";
    else delete article.dataset.messageScrollButtonVisible;
    article.querySelectorAll(".message-scroll-button").forEach((button) => {
      const isStartButton = String(button.dataset.scrollPosition || "start") !== "end";
      const footerVisible = messageScrollFooterVisible(articleRect, conversationRect);
      const atBottom = conversationIsAtBottom(conversation);
      const startFooterVisible = Boolean(
        isStartButton
        && contentEligible
        && canReturnToStart
        && footerVisible
      );
      const endVisible = Boolean(!isStartButton && !atBottom && shouldShow && canJumpToEnd);
      const buttonVisible = isStartButton ? startFooterVisible : endVisible;
      const shouldFloat = false;
      button.classList.toggle("hidden", !buttonVisible);
      button.classList.toggle("floating", shouldFloat);
      positionFloatingMessageScrollButton(button, shouldFloat, articleRect, conversationRect);
      button.tabIndex = buttonVisible ? 0 : -1;
      button.setAttribute("aria-hidden", buttonVisible ? "false" : "true");
    });
  });
  state.messageScrollReplyStartTargetId = replyStartTargetId;
  updateConversationJumpBottomButton();
}

function messageScrollVisibilityTarget(root) {
  const conversation = $("conversation");
  if (!root) return conversation;
  if (root === conversation) return conversation;
  if (document.body.contains(root)) return root;
  return conversation || root;
}

function rememberMessageScrollVisibilityTarget(root) {
  const target = root || $("conversation");
  if (!state.messageScrollVisibilityRoot) {
    state.messageScrollVisibilityRoot = target;
    return;
  }
  const conversation = $("conversation");
  const current = state.messageScrollVisibilityRoot;
  if (!current || !document.body.contains(current) || target === conversation) {
    state.messageScrollVisibilityRoot = target;
  }
}

function applyMessageScrollButtonVisibility(root) {
  const target = messageScrollVisibilityTarget(root || state.messageScrollVisibilityRoot || $("conversation"));
  if (!target) return;
  updateConversationJumpBottomButton();
  updateMessageScrollButtonVisibility(target);
}

function scheduleMessageScrollButtonVisibilitySettle(root, delays = [100, 280, 900, 1600]) {
  const target = root || $("conversation");
  for (const delay of delays) {
    window.setTimeout(() => applyMessageScrollButtonVisibility(target), Math.max(0, delay));
  }
}

function messageScrollCanReturnToStart(articleRect, conversationRect) {
  const visibleTop = Math.max(articleRect.top || 0, conversationRect.top || 0);
  const visibleBottom = Math.min(articleRect.bottom || 0, conversationRect.bottom || 0);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  if (visibleHeight < 72) return false;
  const startPassed = (articleRect.top || 0) < (conversationRect.top || 0) + 28;
  const stillInsideMessage = (articleRect.bottom || 0) > (conversationRect.top || 0) + 96;
  return Boolean(startPassed && stillInsideMessage);
}

function messageScrollCanJumpToEnd(articleRect, conversationRect) {
  const visibleTop = Math.max(articleRect.top || 0, conversationRect.top || 0);
  const visibleBottom = Math.min(articleRect.bottom || 0, conversationRect.bottom || 0);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  if (visibleHeight < 72) return false;
  const endBelow = (articleRect.bottom || 0) > (conversationRect.bottom || 0) - 28;
  const alreadyInsideMessage = (articleRect.top || 0) < (conversationRect.bottom || 0) - 96;
  return Boolean(endBelow && alreadyInsideMessage);
}

function messageScrollFooterVisible(articleRect, conversationRect) {
  const articleBottom = articleRect.bottom || 0;
  const conversationTop = conversationRect.top || 0;
  const conversationBottom = conversationRect.bottom || 0;
  const footerSafeBottom = conversationBottom - 8;
  return Boolean(
    articleBottom >= conversationTop + 96
    && articleBottom <= footerSafeBottom
  );
}

function positionFloatingMessageScrollButton(button, shouldFloat, articleRect, conversationRect) {
  if (!button) return;
  if (!shouldFloat) {
    [
      "position",
      "left",
      "top",
      "right",
      "bottom",
      "z-index",
      "width",
      "min-width",
      "height",
      "min-height",
      "padding",
      "display",
      "place-items",
      "color",
      "background",
      "border",
      "border-radius",
      "box-shadow",
      "font-size",
      "font-weight",
      "line-height",
      "backdrop-filter",
    ].forEach((property) => button.style.removeProperty(property));
    return;
  }
  button.style.setProperty("position", "fixed");
  button.style.setProperty("right", "max(20px, env(safe-area-inset-right))");
  button.style.setProperty("bottom", "calc(72px + env(safe-area-inset-bottom))");
  button.style.setProperty("z-index", "38");
  button.style.setProperty("width", "30px");
  button.style.setProperty("min-width", "30px");
  button.style.setProperty("height", "30px");
  button.style.setProperty("min-height", "30px");
  button.style.setProperty("padding", "0");
  button.style.setProperty("display", "grid");
  button.style.setProperty("place-items", "center");
  button.style.setProperty("color", "rgba(49, 91, 88, 0.78)");
  button.style.setProperty("background", "rgba(247, 250, 249, 0.86)");
  button.style.setProperty("border", "1px solid rgba(103, 129, 127, 0.20)");
  button.style.setProperty("border-radius", "50%");
  button.style.setProperty("box-shadow", "0 6px 18px rgba(31, 43, 51, 0.10)");
  button.style.setProperty("font-size", "16px");
  button.style.setProperty("font-weight", "560");
  button.style.setProperty("line-height", "1");
  button.style.setProperty("backdrop-filter", "blur(12px)");
}

function scheduleMessageScrollButtonVisibility(root) {
  rememberMessageScrollVisibilityTarget(root);
  if (state.messageScrollVisibilityScheduled) return;
  state.messageScrollVisibilityScheduled = true;
  requestAnimationFrame(() => {
    state.messageScrollVisibilityScheduled = false;
    const target = state.messageScrollVisibilityRoot;
    state.messageScrollVisibilityRoot = null;
    applyMessageScrollButtonVisibility(target);
  });
}
