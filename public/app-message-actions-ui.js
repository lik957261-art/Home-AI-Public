"use strict";

function conversationBottomOffset(el = $("conversation")) {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

function isNearBottom(threshold = 96) {
  return conversationBottomOffset() < threshold;
}

function shouldForceChatStickToBottom() {
  return isSingleWindowChatView()
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
  return shouldForceChatStickToBottom()
    || Date.now() < Number(state.conversationViewportBottomFollowUntil || 0)
    || state.conversationPinnedToBottom
    || isNearBottom(180);
}

function scrollConversationToBottom() {
  const conversation = $("conversation");
  if (!conversation) return;
  conversation.scrollTop = conversation.scrollHeight;
  state.conversationPinnedToBottom = true;
  updateConversationJumpBottomButton();
}

function scrollConversationToBottomSmooth() {
  const conversation = $("conversation");
  if (!conversation) return;
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

function clearConversationViewportRefreshTimers() {
  for (const timer of state.conversationViewportRefreshTimers || []) window.clearTimeout(timer);
  state.conversationViewportRefreshTimers = [];
}

function scheduleConversationViewportRefresh(conversation = $("conversation"), options = {}) {
  if (!conversation || !conversationViewportRefreshApplies()) return;
  if (!conversation.querySelector("[data-message-id], .chat-history-pager, .empty-state")) return;
  if (options.resetTimers !== false) clearConversationViewportRefreshTimers();
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
    requestAnimationFrame(() => {
      conversation.style.overflowAnchor = "";
      updateConversationJumpBottomButton();
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(refresh));
  for (const delay of [80, 180, 360, 720, 1200]) {
    state.conversationViewportRefreshTimers.push(window.setTimeout(refresh, delay));
  }
}

function conversationJumpBottomApplies() {
  if (isChatSearchMode()) return false;
  return isTaskDetailView() || isSingleWindowChatView() || (isSingleWindowView() && state.singleWindowMode === "task");
}

function updateConversationJumpBottomButton() {
  const button = $("conversationJumpBottom");
  const conversation = $("conversation");
  if (!button) return;
  const shouldShow = Boolean(
    conversation
    && conversationJumpBottomApplies()
    && conversation.scrollHeight > conversation.clientHeight + 120
    && conversationBottomOffset(conversation) > 240
  );
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
    scrollConversationToBottomSmooth();
  });
}

function scheduleConversationBottomStick() {
  if (Date.now() < Number(state.suppressChatAutoBottomUntil || 0)) return;
  window.clearTimeout(state.conversationBottomStickTimer);
  state.suppressConversationPinUntil = Date.now() + 700;
  const stick = () => {
    if (!shouldStickConversationOnViewportChange()) return;
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
  if (Date.now() < Number(state.conversationViewportSettleUntil || 0)) {
    updateConversationJumpBottomButton();
    return;
  }
  if (Date.now() < state.suppressConversationPinUntil) return;
  state.conversationPinnedToBottom = isNearBottom();
  maybeLoadOlderChatMessages();
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

function handleViewportLayoutChange(event = null) {
  const type = String(event?.type || "");
  const orientationEvent = type === "orientationchange" || type === "change";
  if (orientationEvent && conversationViewportRefreshApplies()) {
    state.conversationViewportSettleUntil = Date.now() + 1400;
    state.conversationViewportBottomFollowUntil = Date.now() + 1600;
    state.conversationPinnedToBottom = true;
  }
  updateKeyboardViewportMetrics();
  updateMobileBottomNavReservation();
  updateNavigationControls();
  refreshComposerContextSoon(0);
  scheduleMessageScrollButtonVisibility($("conversation"));
  updateConversationJumpBottomButton();
  scheduleConversationViewportRefresh($("conversation"), { resetTimers: orientationEvent });
  if (!shouldStickConversationOnViewportChange()) return;
  if (!shouldFollowConversationBottomDuringViewport()) return;
  scheduleConversationBottomStick();
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
  return [...messages].reverse().find((message) => message?.id)?.id || "";
}

function consumeTaskRouteScrollTarget(group) {
  const messageId = routeScrollMessageIdForTaskGroup(group);
  if (!messageId) return false;
  clearRouteScrollTarget();
  requestAnimationFrame(() => {
    scrollMessageIntoView(messageId, "start");
  });
  return true;
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
  conversation.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  window.setTimeout(updateConversationJumpBottomButton, prefersReducedMotion() ? 0 : 260);
}

function renderMessageScrollButton(message, position) {
  if (message?.role !== "assistant" || !message?.id) return "";
  const end = position === "end";
  return `<button class="message-scroll-button hidden" type="button" data-scroll-message="${escapeHtml(message.id)}" data-scroll-position="${end ? "end" : "start"}" aria-label="${end ? "Jump to reply end" : "Jump to reply start"}" title="${end ? "End" : "Start"}" aria-hidden="true" tabindex="-1"><span class="message-scroll-glyph">${end ? "&#8595;" : "&#8593;"}</span></button>`;
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

function renderMessageActionStrip(message, scrollPosition) {
  const controls = [
    renderMessageScrollButton(message, scrollPosition),
    renderMessageCopyButton(message),
    renderMessageImageButton(message),
  ].filter(Boolean).join("");
  return controls ? `<span class="message-action-strip">${controls}</span>` : "";
}

function renderMessageGatewayDiagnostic(message) {
  return "";
}

function renderMessageFooter(message, usage) {
  const actions = renderMessageActionStrip(message, "start");
  const gatewayDiagnostic = renderMessageGatewayDiagnostic(message);
  const skills = renderMessageSkillPanel(message, state.currentThread);
  if (!actions && !usage && !skills && !gatewayDiagnostic) return "";
  const meta = `${gatewayDiagnostic}${usage}${skills}`;
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
  if (isAutomationDetailView()) {
    openAutomationList();
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
  state.attachFilePickerActivationAt = Date.now();
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
  openAttachFilePicker();
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
}

function currentMessageById(messageId) {
  const id = String(messageId || "");
  if (!id) return null;
  return (state.currentThread?.messages || []).find((message) => message?.id === id) || null;
}

function wireMessageReplyActionButtons(root) {
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
}

async function forwardArtifactToWeixin(button) {
  const artifactId = String(button?.dataset?.forwardArtifactWeixin || "").trim();
  if (!artifactId) return;
  const result = await api("/api/weixin/forward-file", {
    method: "POST",
    body: JSON.stringify({
      artifactId,
      threadId: state.currentThreadId || "",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  });
  if (result?.thread) rememberChatScopeThread(result.thread);
  if (result?.message) {
    const resultThreadId = result?.thread?.id || result?.delivery?.threadId || "";
    if (resultThreadId && resultThreadId !== state.currentThreadId) {
      upsertCachedChatScopeMessage(resultThreadId, result.message, result.thread || null);
    } else {
      upsertMessage(result.message);
    }
  }
  showPushToast("\u5df2\u52a0\u5165\u5fae\u4fe1\u8f6c\u53d1\u961f\u5217", "success");
}

function wireArtifactWeixinButtons(root) {
  root?.querySelectorAll?.("[data-forward-artifact-weixin]").forEach((button) => {
    if (button.dataset.boundForwardArtifactWeixin) return;
    button.dataset.boundForwardArtifactWeixin = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await forwardArtifactToWeixin(button);
      } catch (err) {
        showError(err);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function positionUsagePanel(details) {
  if (!details?.open) return;
  const panel = details.querySelector(".usage-details");
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

function closeOpenUsagePanels(root = document) {
  root.querySelectorAll?.(".usage[open]")?.forEach((details) => {
    details.open = false;
  });
}

function wireUsageOutsideDismiss() {
  if (document.documentElement.dataset.usageOutsideDismissBound) return;
  document.documentElement.dataset.usageOutsideDismissBound = "1";
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".usage")) return;
    closeOpenUsagePanels();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenUsagePanels();
  });
}

function wireUsagePanels(root) {
  wireUsageOutsideDismiss();
  root?.querySelectorAll?.(".usage").forEach((details) => {
    if (details.dataset.boundUsagePanel) return;
    details.dataset.boundUsagePanel = "1";
    details.addEventListener("toggle", () => positionUsagePanel(details));
  });
}

function updateMessageScrollButtonVisibility(root) {
  const conversation = $("conversation");
  if (!conversation || !root?.querySelectorAll) return;
  const viewportHeight = Math.max(0, conversation.clientHeight || window.innerHeight || 0);
  root.querySelectorAll(".message[data-message-id]").forEach((article) => {
    const messageHeight = article.getBoundingClientRect().height || article.offsetHeight || 0;
    const wasShown = article.dataset.messageScrollButtonVisible === "1";
    const hasRunProgress = Boolean(article.querySelector(".run-progress-panel.inline"));
    const showThreshold = Math.max(420, viewportHeight - 28);
    const hideThreshold = Math.max(360, viewportHeight - 140);
    const shouldShow = viewportHeight > 0 && !hasRunProgress && (
      messageHeight > showThreshold
      || (wasShown && messageHeight > hideThreshold)
    );
    if (shouldShow) article.dataset.messageScrollButtonVisible = "1";
    else delete article.dataset.messageScrollButtonVisible;
    article.querySelectorAll(".message-scroll-button").forEach((button) => {
      button.classList.toggle("hidden", !shouldShow);
      button.tabIndex = shouldShow ? 0 : -1;
      button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
  });
}

function scheduleMessageScrollButtonVisibility(root) {
  const target = root || $("conversation");
  if (state.messageScrollVisibilityScheduled) return;
  state.messageScrollVisibilityScheduled = true;
  requestAnimationFrame(() => {
    state.messageScrollVisibilityScheduled = false;
    updateMessageScrollButtonVisibility(target);
    updateConversationJumpBottomButton();
  });
}
