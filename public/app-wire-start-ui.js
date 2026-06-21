"use strict";

function preparePrimaryNavigationChange() {
  state.primaryNavigationSeq = (Number(state.primaryNavigationSeq || 0) || 0) + 1;
  if (typeof hideActivePluginHostsForPrimaryNavigation === "function") hideActivePluginHostsForPrimaryNavigation();
  if (typeof parkCurrentMainConversationSurfaceForNavigation === "function") parkCurrentMainConversationSurfaceForNavigation();
  if (typeof cancelScheduledSelectedViewLoad === "function") cancelScheduledSelectedViewLoad();
  if (typeof cancelCurrentThreadNavigationRefreshes === "function") cancelCurrentThreadNavigationRefreshes();
  if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
  if (typeof closeTopMoreMenu === "function") closeTopMoreMenu();
  if (typeof closeTaskCardMenus === "function") closeTaskCardMenus();
  if (typeof closeDirectoryEntryMenus === "function") closeDirectoryEntryMenus();
  if (typeof closeGlobalPluginDockForNavigation === "function") closeGlobalPluginDockForNavigation();
  state.pluginContextNavPluginId = "";
  state.directoryPluginContextActive = false;
  if (typeof closeSidebar === "function" && typeof isMobileLayout === "function" && isMobileLayout()) closeSidebar();
}

function markBottomNavigationInteraction(reason = "bottom_nav") {
  state.bottomNavigationInteractionSeq = (Number(state.bottomNavigationInteractionSeq || 0) || 0) + 1;
  state.bottomNavigationInteractionReason = String(reason || "bottom_nav").slice(0, 80);
  state.bottomNavigationInteractionUntil = Date.now() + 480;
  const nav = $("bottomNav");
  if (nav) {
    nav.classList.add("bottom-nav-interacting");
    window.clearTimeout(state.bottomNavigationInteractionTimer || 0);
    state.bottomNavigationInteractionTimer = window.setTimeout(() => {
      if (Date.now() >= Number(state.bottomNavigationInteractionUntil || 0)) {
        nav.classList.remove("bottom-nav-interacting");
      }
    }, 520);
  }
  return state.bottomNavigationInteractionSeq;
}

function wireBottomNavigationInteractionGuard() {
  const nav = $("bottomNav");
  if (!nav || nav.dataset.bottomNavigationInteractionGuardBound === "1") return;
  nav.dataset.bottomNavigationInteractionGuardBound = "1";
  const mark = (event) => {
    const button = event.target?.closest?.(".bottom-tab");
    if (!button || button.closest("#bottomNav") !== nav || button.disabled || button.hidden) return;
    markBottomNavigationInteraction(button.id || "bottom_nav");
  };
  nav.addEventListener("pointerdown", mark, { capture: true, passive: true });
  nav.addEventListener("click", mark, { capture: true });
}

function cancelScheduledSelectedViewLoad() {
  const frame = Number(state.scheduledSelectedViewLoadFrame || 0) || 0;
  if (frame && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frame);
  state.scheduledSelectedViewLoadFrame = 0;
  const timer = Number(state.scheduledSelectedViewLoadTimer || 0) || 0;
  if (timer) window.clearTimeout(timer);
  state.scheduledSelectedViewLoadTimer = 0;
}

function scheduleSelectedViewLoad(options = {}) {
  if (typeof cancelScheduledSelectedViewLoad === "function") cancelScheduledSelectedViewLoad();
  const loadOptions = Object.assign({}, options);
  const afterPaint = Boolean(loadOptions.afterPaint);
  delete loadOptions.afterPaint;
  const run = () => {
    state.scheduledSelectedViewLoadTimer = 0;
    if (typeof loadSelectedView !== "function") return;
    loadSelectedView(loadOptions).catch(showError);
  };
  if (afterPaint && typeof window.requestAnimationFrame === "function") {
    state.scheduledSelectedViewLoadFrame = window.requestAnimationFrame(() => {
      state.scheduledSelectedViewLoadFrame = 0;
      state.scheduledSelectedViewLoadTimer = window.setTimeout(run, 0);
    });
    return;
  }
  state.scheduledSelectedViewLoadTimer = window.setTimeout(run, 0);
}

function applyPrimaryNavigationViewShell() {
  if (typeof applyViewMode === "function") applyViewMode();
  let restoredMainSurface = false;
  if (typeof restoreMainConversationSurfaceForCurrentViewShell === "function") {
    restoredMainSurface = restoreMainConversationSurfaceForCurrentViewShell();
  }
  let renderedCachedTaskList = false;
  if (!restoredMainSurface && state.viewMode === "tasks" && !state.currentTaskGroupId && typeof restoreTaskListThreadFromCache === "function") {
    const restoreScrollTop = typeof taskListReturnScrollTop === "function" ? taskListReturnScrollTop() : 0;
    renderedCachedTaskList = restoreTaskListThreadFromCache({ stickToBottom: false, restoreScrollTop });
  }
  let renderedCachedSingleWindow = false;
  if (!restoredMainSurface && state.viewMode === "single" && state.singleWindowMode === "chat" && typeof renderCachedSingleWindowThreadForCurrentViewShell === "function") {
    renderedCachedSingleWindow = renderCachedSingleWindowThreadForCurrentViewShell({ stickToBottom: true });
  }
  if (!restoredMainSurface && !renderedCachedSingleWindow && state.viewMode === "single" && state.singleWindowMode === "chat" && typeof configureComposer === "function") {
    if (typeof renderSingleWindowChatPendingShell === "function") {
      renderSingleWindowChatPendingShell({ reason: "primary_navigation_no_cache" });
    } else {
      configureComposer({ enabled: false, shellLocked: true });
    }
  }
  if (typeof scheduleGlobalPluginDockRefresh === "function") scheduleGlobalPluginDockRefresh("primary_navigation");
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  return { renderedCachedTaskList };
}

function schedulePrimaryNavigationViewLoad(options = {}) {
  const shell = applyPrimaryNavigationViewShell() || {};
  if (shell.renderedCachedTaskList && options.skipTaskListWindowRefresh) return;
  scheduleSelectedViewLoad(Object.assign({ afterPaint: true }, options));
}

function openPinnedPluginBottomTab(viewMode, rememberReturnRoute = null) {
  const fromViewMode = state.viewMode;
  clearQuotedReply({ render: false });
  if (typeof discardDirectoryTopicDraftState === "function") discardDirectoryTopicDraftState();
  if (typeof rememberReturnRoute === "function") rememberReturnRoute();
  state.viewMode = viewMode;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  if (typeof applyViewMode === "function") applyViewMode();
  if (typeof renderPinnedPluginNavigationShell === "function") renderPinnedPluginNavigationShell(viewMode, { fromViewMode });
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  scheduleSelectedViewLoad();
}

function pinnedPluginViewMode(value = "") {
  const mode = String(value || "");
  if (mode === "wardrobe") return true;
  return Object.values(typeof EMBEDDED_PLUGIN_DEFS === "object" ? EMBEDDED_PLUGIN_DEFS : {})
    .some((item) => item?.viewMode === mode);
}

function renderPinnedPluginNavigationShell(viewMode = state.viewMode, options = {}) {
  const mode = String(viewMode || "");
  const def = Object.values(typeof EMBEDDED_PLUGIN_DEFS === "object" ? EMBEDDED_PLUGIN_DEFS : {})
    .find((item) => item?.viewMode === mode) || null;
  const fromPlugin = pinnedPluginViewMode(options.fromViewMode);
  if (fromPlugin) return;
  const title = def?.title || (mode === "wardrobe" ? "衣橱" : "");
  const list = $("threadList");
  if (list) list.innerHTML = title ? `<div class="empty-state small">${escapeHtml(title)} 插件</div>` : "";
  if ($("threadTitle")) $("threadTitle").textContent = title;
  if ($("threadMeta")) $("threadMeta").textContent = "";
  if ($("interruptRun")) $("interruptRun").disabled = true;
  if (typeof configureComposer === "function") configureComposer({ enabled: false, hidden: true, placeholder: title ? `${title} 插件` : "插件" });
  const conversation = $("conversation");
  if (conversation) {
    conversation.innerHTML = "";
    conversation.scrollTop = 0;
  }
  if (mode === "wardrobe" && typeof showWardrobePluginLoadingSurface === "function") {
    showWardrobePluginLoadingSurface();
  } else if (def && typeof showEmbeddedPluginLoadingSurface === "function") {
    showEmbeddedPluginLoadingSurface(def);
  }
  if (typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance(conversation);
}

function openTopicRootFromPrimaryNavigation(options = {}) {
  if (typeof hideActivePluginHostsForPluginTopicNavigation === "function") hideActivePluginHostsForPluginTopicNavigation();
  clearQuotedReply({ render: false });
  if (typeof discardDirectoryTopicDraftState === "function") discardDirectoryTopicDraftState();
  if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  if (options.clearCurrentThread) {
    state.currentThread = null;
    state.currentThreadId = "";
  }
  schedulePrimaryNavigationViewLoad({ skipTaskListWindowRefresh: true });
}

function wireUi() {
  wireBottomNavigationInteractionGuard();
  wireBackNavigationGuard();
  wireSidebarTouchScroll();
  wireRightSwipeGuard();
  wireSidebarSwipe();
  wireConversationScrollFeedback();
  wireConversationJumpBottomButton();
  $("refreshNow")?.addEventListener("click", reloadForClientUpdate);
  $("refreshLater")?.addEventListener("click", () => {
    state.refreshNoticeDismissedVersion = state.serverClientVersion;
    hideRefreshNotice();
  });
  $("bootRetry")?.addEventListener("click", () => {
    reloadForClientUpdate();
  });
  $("bootResetClient")?.addEventListener("click", () => {
    resetClientAndReload("manual", { hard: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleAppBackgrounded();
      return;
    }
    handleAppForegrounded();
    checkClientVersion("visible").catch(() => {});
  });
  window.addEventListener("pagehide", handleAppBackgrounded);
  window.addEventListener("pageshow", handleAppForegrounded);
  window.addEventListener("focus", () => {
    handleAppForegrounded();
    checkClientVersion("focus").catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.pwaInstallPrompt = event;
    updateTopMoreControls();
    renderPwaInstallOverlay();
  });
  window.addEventListener("appinstalled", () => {
    state.pwaInstalled = true;
    state.pwaInstallPrompt = null;
    closePwaInstall();
    updateTopMoreControls();
    showPushToast("Home AI 已安装。", "success");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "hermes.client-version.updated") {
        handleClientVersion({
          version: event.data.version || "",
          clientVersion: state.clientVersion,
        }, "service-worker");
        return;
      }
      if (event.data?.type === "hermes.notification.open") {
        openNotificationRoute(event.data.url || event.data.data?.url || "/").catch(showError);
        return;
      }
      if (event.data?.type === "hermes.push.received") {
        handleForegroundPushMessage(event.data);
        checkClientVersion("push").catch(() => {});
      }
    });
  }
  window.HomeAINativeNotifications = {
    open(payload = {}) {
      const route = String(payload.deepLink || payload.url || payload.clickUrl || payload.targetUrl || "").trim();
      if (!route) return Promise.resolve(false);
      return openNotificationRoute(route).then(() => true);
    },
  };
  const pendingNativeNotifications = Array.isArray(window.__homeAIPendingNativeNotifications)
    ? window.__homeAIPendingNativeNotifications.splice(0)
    : [];
  pendingNativeNotifications.forEach((payload) => {
    window.HomeAINativeNotifications.open(payload).catch(showError);
  });
  $("setupForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOwnerSetup().catch((err) => {
      state.setupError = err.message || String(err);
      renderSetup();
    });
  });
  $("copySetupKey")?.addEventListener("click", () => copyTextToClipboard(state.setupOwnerKey || "").catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("enterAfterSetup")?.addEventListener("click", () => enterAfterSetup().catch((err) => {
    state.setupError = err.message || String(err);
    renderSetup();
  }));
  $("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("loginKey").value.trim()).catch((err) => showLogin(err.message));
  });
  $("workspaceSelect").addEventListener("change", async (event) => {
    clearQuotedReply({ render: false });
    clearTaskDirectoryFilter({ render: false });
    state.selectedWorkspaceId = event.target.value;
    if (typeof resetEmbeddedPluginsForWorkspaceChange === "function") resetEmbeddedPluginsForWorkspaceChange();
    state.privateChatThread = null;
    state.weixinChatThread = null;
    state.weixinChatThreadId = "";
    state.weixinChatAvailable = false;
    state.groupChatThread = null;
    state.groupChatThreadId = "";
    state.groupChatAvailable = false;
    resetLearningCoinsState();
    localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
    renderWorkspaceAccessPanel();
    state.directoryThreadId = "";
    state.directoryThreadWorkspaceId = "";
    await loadProjects();
    resetDirectoryPath();
    await loadSelectedView();
    syncPushSubscriptionContext().catch(() => {});
  });
  $("projectSelect").addEventListener("change", async (event) => {
    state.selectedProjectId = event.target.value;
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
    renderSubprojects();
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("subprojectSelect").addEventListener("change", async (event) => {
    persistSelectedSubproject(event.target.value);
    resetDirectoryPath();
    state.currentThread = null;
    state.currentThreadId = "";
    if (state.viewMode === "projects") {
      await loadDirectoryView({ resetPath: true });
      return;
    }
    await loadThreads();
    renderCurrentThread({ stickToBottom: true });
  });
  $("taskManagementMode")?.addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    if (!(state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task"))) {
      state.viewMode = "tasks";
      localStorage.setItem("hermesWebViewMode", state.viewMode);
      state.currentTaskGroupId = "";
      schedulePrimaryNavigationViewLoad({ skipTaskListWindowRefresh: true });
    }
  });
  $("chatManagementMode")?.addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    schedulePrimaryNavigationViewLoad({ skipTaskListWindowRefresh: true });
  });
  $("inboxManagementMode")?.addEventListener("click", async () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    state.viewMode = "inbox";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomTasksMode")?.addEventListener("click", () => {
    if (typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive()) {
      if (typeof closeDirectoryTopicDraft === "function") closeDirectoryTopicDraft();
      return;
    }
    preparePrimaryNavigationChange();
    openTopicRootFromPrimaryNavigation();
  });
  $("bottomChatMode")?.addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    schedulePrimaryNavigationViewLoad();
  });
  $("bottomInboxMode")?.addEventListener("click", async () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    state.viewMode = "inbox";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("singleMode").addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    schedulePrimaryNavigationViewLoad();
  });
  $("singleTaskMode")?.addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    state.viewMode = "single";
    setSingleWindowMode("task");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    schedulePrimaryNavigationViewLoad();
  });
  $("tasksMode").addEventListener("click", () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    if (typeof normalizeMobileViewportAfterViewChange === "function") normalizeMobileViewportAfterViewChange();
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    schedulePrimaryNavigationViewLoad({ skipTaskListWindowRefresh: true });
  });
  $("projectsMode").addEventListener("click", async () => {
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomProjectsMode")?.addEventListener("click", async () => {
    if (typeof isDirectoryTopicDraftActive === "function" && isDirectoryTopicDraftActive()) {
      if (typeof closeDirectoryTopicDraft === "function") closeDirectoryTopicDraft();
      return;
    }
    if (state.directoryPluginContextActive && state.viewMode === "projects") {
      if (typeof updateNavigationControls === "function") updateNavigationControls();
      return;
    }
    preparePrimaryNavigationChange();
    clearQuotedReply({ render: false });
    state.directoryReturnRoute = null;
    state.viewMode = "projects";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("automationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.automationReturnRoute = "";
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomAutomationMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "automation";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.automationReturnRoute = "";
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("learningMode")?.addEventListener("click", () => openPinnedPluginBottomTab("growth", typeof rememberGrowthPluginReturnRoute === "function" ? rememberGrowthPluginReturnRoute : null));
  $("bottomLearningMode")?.addEventListener("click", () => openPinnedPluginBottomTab("growth", typeof rememberGrowthPluginReturnRoute === "function" ? rememberGrowthPluginReturnRoute : null));
  $("todosMode").addEventListener("click", () => {
    preparePrimaryNavigationChange();
    openTopicRootFromPrimaryNavigation({ clearCurrentThread: true });
  });
  $("bottomTodosMode")?.addEventListener("click", () => {
    preparePrimaryNavigationChange();
    openTopicRootFromPrimaryNavigation({ clearCurrentThread: true });
  });
  $("bottomWardrobeMode")?.addEventListener("click", () => openPinnedPluginBottomTab("wardrobe", typeof rememberWardrobePluginReturnRoute === "function" ? rememberWardrobePluginReturnRoute : null));
  $("bottomCodexMode")?.addEventListener("click", () => openPinnedPluginBottomTab("codex", typeof rememberCodexPluginReturnRoute === "function" ? rememberCodexPluginReturnRoute : null));
  $("bottomFinanceMode")?.addEventListener("click", () => openPinnedPluginBottomTab("finance", typeof rememberFinancePluginReturnRoute === "function" ? rememberFinancePluginReturnRoute : null));
  $("bottomEmailMode")?.addEventListener("click", () => openPinnedPluginBottomTab("email", typeof rememberEmailPluginReturnRoute === "function" ? rememberEmailPluginReturnRoute : null));
  $("bottomHealthMode")?.addEventListener("click", () => openPinnedPluginBottomTab("health", typeof rememberHealthPluginReturnRoute === "function" ? rememberHealthPluginReturnRoute : null));
  $("bottomNoteMode")?.addEventListener("click", () => openPinnedPluginBottomTab("note", typeof rememberNotePluginReturnRoute === "function" ? rememberNotePluginReturnRoute : null));
  $("bottomGrowthMode")?.addEventListener("click", () => openPinnedPluginBottomTab("growth", typeof rememberGrowthPluginReturnRoute === "function" ? rememberGrowthPluginReturnRoute : null));
  $("bottomMoiraMode")?.addEventListener("click", () => openPinnedPluginBottomTab("moira", typeof rememberMoiraPluginReturnRoute === "function" ? rememberMoiraPluginReturnRoute : null));
  $("bottomMusicMode")?.addEventListener("click", () => openPinnedPluginBottomTab("music", typeof rememberMusicPluginReturnRoute === "function" ? rememberMusicPluginReturnRoute : null));
  if (typeof wirePinnedPluginBottomTabUnpin === "function") {
    [
      ["bottomWardrobeMode", "wardrobe"],
      ["bottomCodexMode", "codex-mobile"],
      ["bottomFinanceMode", "finance"],
      ["bottomEmailMode", "email"],
      ["bottomHealthMode", "health"],
      ["bottomNoteMode", "note"],
      ["bottomGrowthMode", "growth"],
      ["bottomMoiraMode", "moira"],
      ["bottomMusicMode", "music"],
    ].forEach(([buttonId, pluginId]) => wirePinnedPluginBottomTabUnpin($(buttonId), pluginId));
  }
  $("threadSearch").addEventListener("input", () => {
    updateSearchButton();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadSelectedView().catch(showError), 250);
  });
  $("workspaceEntry")?.addEventListener("click", focusWorkspaceEntry);
  $("directoryEntry").addEventListener("click", () => {
    openCurrentDirectoryEntry().catch(showError);
  });
  $("topInstallPwa")?.addEventListener("click", openPwaInstall);
  $("newThread").addEventListener("click", () => createThread().catch(showError));
  $("pushToggle").addEventListener("click", () => handlePushButton().catch(showError));
  $("topMoreButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("topMoreMenu");
    const button = $("topMoreButton");
    if (!menu || !button) return;
    const open = Boolean(menu.hidden);
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("topMoreMenu")?.addEventListener("click", (event) => event.stopPropagation());
  $("topToggleTaskView")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    if (isSingleWindowView()) {
      state.viewMode = "tasks";
    } else {
      state.viewMode = "single";
      setSingleWindowMode("task");
    }
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    await loadSelectedView();
  });
  $("topToggleSingleMode")?.addEventListener("click", async () => {
    closeTopMoreMenu();
    clearQuotedReply({ render: false });
    state.currentTaskGroupId = "";
    setSingleWindowMode(state.singleWindowMode === "chat" ? "task" : "chat");
    await loadSelectedView();
  });
  $("topClearDirectoryFilter")?.addEventListener("click", () => {
    clearTaskDirectoryFilter();
  });
  $("topManageAccessKeys")?.addEventListener("click", () => {
    openAccessKeyManager({ workspaceId: state.selectedWorkspaceId }).catch(showError);
  });
  $("topNewDirectoryFolder")?.addEventListener("click", () => {
    closeTopMoreMenu();
    createDirectoryFolder().catch(showError);
  });
  $("topManageSharedDirectories")?.addEventListener("click", () => {
    openSharedDirectoryManager().catch(showError);
  });
  $("topNewTodo")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openActionInboxCreate();
  });
  $("topNewActionInbox")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openActionInboxCreate();
  });
  $("topOpenActionInboxItem")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openCurrentActionInboxItemLink().catch(showError);
  });
  $("topCompleteActionInboxItem")?.addEventListener("click", () => {
    closeTopMoreMenu();
    mutateActionInboxItem("complete").catch(showError);
  });
  $("topSnoozeActionInboxItem")?.addEventListener("click", () => {
    closeTopMoreMenu();
    mutateActionInboxItem("snooze", { availableAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).catch(showError);
  });
  $("topDismissActionInboxItem")?.addEventListener("click", () => {
    closeTopMoreMenu();
    mutateActionInboxItem("dismiss").catch(showError);
  });
  $("topCopyNavigationDiagnostics")?.addEventListener("click", () => {
    closeTopMoreMenu();
    copyNavigationDiagnostics().catch(showError);
  });
  $("topOpenAutomation")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openAutomationSurface({ returnTo: state.viewMode === "inbox" ? "inbox" : "" }).catch(showError);
  });
  $("topNewAutomation")?.addEventListener("click", () => {
    closeTopMoreMenu();
    if (state.viewMode === "automation") openAutomationCreate();
    else openAutomationSurface({ create: true, returnTo: state.viewMode === "inbox" ? "inbox" : "" }).catch(showError);
  });
  $("topNewPluginAudit")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openActionInboxPluginAuditCreate();
  });
  $("topEditAutomation")?.addEventListener("click", () => {
    openAutomationEdit();
  });
  $("topToggleAutomationPause")?.addEventListener("click", () => {
    toggleAutomationPause().catch(showError);
  });
  $("topDeleteAutomation")?.addEventListener("click", () => {
    deleteAutomationJob().catch(showError);
  });
  $("topLearningSettings")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openLearningGrowthSettingsPage();
  });
  $("topLearningGrowthHistory")?.addEventListener("click", () => {
    closeTopMoreMenu();
    const taskCardId = String(state.selectedLearningTaskCardId || "").trim();
    if (taskCardId) openLearningGrowthHistory(taskCardId, learningGrowthLearnerWorkspaceId()).catch(showError);
  });
  $("topDeleteTodo")?.addEventListener("click", () => {
    deleteTodo(state.selectedTodoId).catch(showError);
  });
  $("topRenameTask")?.addEventListener("click", () => {
    closeTopMoreMenu();
    renameTaskGroup(state.currentTaskGroupId).catch(showError);
  });
  $("topSearchChat")?.addEventListener("click", () => {
    openChatSearch();
  });
  $("topVoiceLearning")?.addEventListener("click", () => {
    closeTopMoreMenu();
    openVoiceLearningPanel();
  });
  $("topToggleGroupChat")?.addEventListener("click", () => {
    toggleGroupChat().catch(showError);
  });
  $("topToggleWeixinChat")?.addEventListener("click", () => {
    toggleWeixinChat().catch(showError);
  });
  $("topManageGroupMembers")?.addEventListener("click", () => {
    openGroupChatMembers().catch(showError);
  });
  $("topToggleReadingFullscreen")?.addEventListener("click", () => {
    setReadingFullscreen(!state.readingFullscreen);
  });
    $("readingFullscreenExit")?.addEventListener("click", () => {
    setReadingFullscreen(false);
  });
  $("readingFullscreenEnter")?.addEventListener("click", () => {
    setReadingFullscreen(true);
  });
  $("topSettingsButton")?.addEventListener("click", () => openSettings({ returnToSidebar: true }));
  $("clientVersion")?.addEventListener("click", handleClientVersionBadgeClick);
  document.addEventListener("click", closeTopMoreMenu);
  document.addEventListener("click", () => closeTaskCardMenus());
  document.addEventListener("click", () => closeDirectoryEntryMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.readingFullscreen) setReadingFullscreen(false);
  });
  $("openMenu").addEventListener("click", (event) => handleTopNavActivation(event));
  $("closeMenu").addEventListener("click", closeSidebar);
  $("sidebarBack")?.addEventListener("click", sidebarBackToMenu);
  if (typeof initializeVoiceInputUi === "function") initializeVoiceInputUi();
  $("sendMessage").addEventListener("click", (event) => {
    if (typeof handleVoiceInputSendClick === "function" && handleVoiceInputSendClick(event)) return;
    void sendMessage(event);
  });
  $("composerSearchSource")?.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-composer-source-toggle]");
    if (!option) return;
    event.preventDefault();
    chooseComposerSearchSource(option.dataset.composerSourceToggle || "local");
  });
  $("composerSourceMenu")?.addEventListener("pointerdown", (event) => {
    const option = event.target.closest?.("[data-composer-source]");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    chooseComposerSearchSource(option.dataset.composerSource || "local");
  });
  $("groupMentionMenu")?.addEventListener("pointerdown", (event) => {
    const option = event.target.closest?.("[data-group-mention-index]");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    suppressTransientActivations(700);
    void chooseGroupMention(Number(option.dataset.groupMentionIndex || 0));
  });
  $("groupMentionMenu")?.addEventListener("pointerup", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("groupMentionMenu")?.addEventListener("touchend", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true, passive: false });
  $("groupMentionMenu")?.addEventListener("click", (event) => {
    if (transientActivationSuppressed()) suppressTransientActivationEvent(event);
  }, { capture: true });
  $("interruptRun").addEventListener("click", interruptRun);
  $("messageInput").addEventListener("input", (event) => {
    autoSizeComposerEditor(event.target);
    if (isChatSearchMode()) updateChatSearchDraft(getComposerText());
    else {
      updateComposerAction();
      updateGroupMentionMenu();
      updateComposerSourceControl();
    }
  });
  $("messageInput").addEventListener("keydown", handleComposerKeydown);
  $("messageInput").addEventListener("paste", pastePlainText);
  $("messageInput").addEventListener("compositionstart", () => {
    state.composerComposing = true;
  });
  $("messageInput").addEventListener("compositionend", () => {
    state.composerComposing = false;
    clearComposerSendAfterCompositionFallback();
    updateComposerAction();
    updateGroupMentionMenu();
    updateComposerSourceControl();
    if (state.composerSendAfterComposition) {
      state.composerSendAfterComposition = false;
      setTimeout(() => void sendMessage(), 0);
    }
  });
  $("messageInput").addEventListener("focus", () => {
    state.composerFocused = true;
    refreshKeyboardViewportDuringFocus();
    refreshComposerContextSoon(0);
    refreshComposerContextSoon(160);
    refreshComposerContextSoon(360);
  });
  $("messageInput").addEventListener("blur", () => {
    state.composerFocused = false;
    refreshKeyboardViewportSoon(80);
    refreshKeyboardViewportSoon(260);
    refreshComposerContextSoon(80);
  });
  $("conversation")?.addEventListener("scroll", (event) => {
    handleConversationScrollState(event);
    if (typeof rememberTaskListScrollPosition === "function") rememberTaskListScrollPosition();
    if (typeof scheduleAppRouteSnapshot === "function") scheduleAppRouteSnapshot("scroll", 500);
  }, { passive: true });
  navigator.virtualKeyboard?.addEventListener("geometrychange", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("resize", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("scroll", handleViewportLayoutChange);
  window.addEventListener("scroll", handleViewportLayoutChange, { passive: true });
  window.addEventListener("resize", handleViewportLayoutChange);
  window.addEventListener("orientationchange", handleViewportLayoutChange);
  window.screen?.orientation?.addEventListener?.("change", handleViewportLayoutChange);
  document.addEventListener("pointerdown", (event) => {
    if (!state.groupMentionOpen) return;
    if ($("composer")?.contains(event.target)) return;
    closeGroupMentionMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!state.composerSourceMenuOpen) return;
    if ($("composer")?.contains(event.target)) return;
    closeComposerSourceMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeComposerSourceMenu();
  });
  document.addEventListener("click", (event) => {
    suppressTransientActivationEvent(event);
  }, { capture: true });
  document.addEventListener("pointerup", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (event.pointerType === "mouse") return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true });
  document.addEventListener("touchend", (event) => {
    if (suppressTransientActivationEvent(event)) return;
    if (window.PointerEvent) return;
    if (handleTopNavActivation(event, { fromHitZone: true })) return;
    handleAttachFileActivation(event, { fromHitZone: true });
  }, { capture: true, passive: false });
  $("attachFile").addEventListener("click", (event) => {
    if ($("attachFile").dataset.searchCloseHandled === "1") {
      delete $("attachFile").dataset.searchCloseHandled;
      event.preventDefault();
      return;
    }
    handleAttachFileActivation(event);
  });
  $("chatSearchPrev")?.addEventListener("click", () => moveChatSearch(-1));
  $("chatSearchNext")?.addEventListener("click", () => moveChatSearch(1));
  $("fileInput").addEventListener("change", (event) => {
    const input = event.target;
    const files = [...input.files];
    input.value = "";
    if (!files.length) return;
    uploadFiles(files).catch(showError);
  });
}

async function start() {
  startupPerfStart("start");
  applyThemePreference();
  startThemePreferenceWatcher();
  applyFontFamilyPreference();
  applyFontSizePreference();
  wireUi();
  state.pwaInstalled = isStandalonePwa();
  ensurePwaServiceWorker({ timeoutMs: 8000 }).catch(() => {});
  showBootSplash("正在连接 Home AI");
  try {
    const config = await startupPerfStep("public-config", () => withTimeout(
      fetch("/api/public-config", { cache: "no-store" }).then((res) => res.json()),
      12000,
      "载入公开配置超时",
    ));
    state.setupRequired = Boolean(config.setupRequired);
    if (state.setupRequired) {
      finishStartupPerf("setup-required");
      showSetup();
      return;
    }
    if (config.authRequired && !state.key) {
      if (!(await hasCookieSession().catch(() => false))) {
        finishStartupPerf("login-required");
        showLogin();
        return;
      }
    }
    setBootSplashText("Loading workspace");
    await startupPerfStep("bootstrap-with-retry", () => withTimeout(bootstrapWithRetry(), 26000, "Workspace bootstrap timed out"));
    showApp();
    if (typeof initializeVoiceLearningUi === "function") initializeVoiceLearningUi();
    finishStartupPerf("ok");
  } catch (err) {
    finishStartupPerf("error", { error: String(err?.message || err || "").slice(0, 180) });
    showError(err);
    if (/unauthorized/i.test(err.message)) showLogin();
    else showStartupRecovery(err);
  }
}

async function startFromBootRecovery() {
  startupPerfStart("boot-recovery");
  showBootSplash("正在连接 Home AI");
  const config = await startupPerfStep("public-config", () => withTimeout(
    fetch("/api/public-config", { cache: "no-store" }).then((res) => res.json()),
    12000,
    "Public config load timed out",
  ));
  state.setupRequired = Boolean(config.setupRequired);
  if (state.setupRequired) {
    finishStartupPerf("setup-required");
    showSetup();
    return;
  }
  if (config.authRequired && !state.key) {
    if (!(await hasCookieSession().catch(() => false))) {
      finishStartupPerf("login-required");
      showLogin();
      return;
    }
  }
  setBootSplashText("Loading workspace");
  await startupPerfStep("bootstrap-with-retry", () => withTimeout(bootstrapWithRetry(), 26000, "Workspace bootstrap timed out"));
  showApp();
  if (typeof initializeVoiceLearningUi === "function") initializeVoiceLearningUi();
  finishStartupPerf("ok");
}
