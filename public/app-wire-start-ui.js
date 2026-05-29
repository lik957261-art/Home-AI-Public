"use strict";

function wireUi() {
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
    startFromBootRecovery().catch(showStartupRecovery);
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
    showPushToast("Hermes Mobile 已安装。", "success");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
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
  $("taskManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    if (!(state.viewMode === "tasks" || (state.viewMode === "single" && state.singleWindowMode === "task"))) {
      state.viewMode = "tasks";
      localStorage.setItem("hermesWebViewMode", state.viewMode);
      state.currentTaskGroupId = "";
      await loadSelectedView();
    }
  });
  $("chatManagementMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomTasksMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomChatMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("bottomInboxMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "inbox";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("singleMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("chat");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("singleTaskMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "single";
    setSingleWindowMode("task");
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("tasksMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "tasks";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    await loadSelectedView();
  });
  $("projectsMode").addEventListener("click", async () => {
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
  $("learningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomLearningMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("todosMode").addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomTodosMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "learning";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomWardrobeMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "wardrobe";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
  $("bottomCodexMode")?.addEventListener("click", async () => {
    clearQuotedReply({ render: false });
    state.viewMode = "codex";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
    await loadSelectedView();
  });
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
    openTodoCreate();
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
  $("topSettingsButton")?.addEventListener("click", openSettings);
  $("clientVersion")?.addEventListener("click", applyAppUpdateFromBadge);
  document.addEventListener("click", closeTopMoreMenu);
  document.addEventListener("click", () => closeTaskCardMenus());
  document.addEventListener("click", () => closeDirectoryEntryMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.readingFullscreen) setReadingFullscreen(false);
  });
  $("openMenu").addEventListener("click", (event) => handleTopNavActivation(event));
  $("closeMenu").addEventListener("click", closeSidebar);
  $("sidebarBack")?.addEventListener("click", sidebarBackToMenu);
  $("sendMessage").addEventListener("click", () => void sendMessage());
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
  $("conversation")?.addEventListener("scroll", handleConversationScrollState, { passive: true });
  navigator.virtualKeyboard?.addEventListener("geometrychange", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("resize", handleViewportLayoutChange);
  window.visualViewport?.addEventListener("scroll", handleViewportLayoutChange);
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
  applyThemePreference();
  startThemePreferenceWatcher();
  applyFontFamilyPreference();
  applyFontSizePreference();
  wireUi();
  state.pwaInstalled = isStandalonePwa();
  ensurePwaServiceWorker({ timeoutMs: 8000 }).catch(() => {});
  showBootSplash("正在连接 Hermes Mobile");
  try {
    const config = await fetch("/api/public-config").then((res) => res.json());
    state.setupRequired = Boolean(config.setupRequired);
    if (state.setupRequired) {
      showSetup();
      return;
    }
    if (config.authRequired && !state.key) {
      if (!(await hasCookieSession().catch(() => false))) {
        showLogin();
        return;
      }
    }
    setBootSplashText("正在载入工作区");
    await bootstrapWithRetry();
    showApp();
  } catch (err) {
    showError(err);
    if (/unauthorized/i.test(err.message)) showLogin();
    else showStartupRecovery(err);
  }
}

async function startFromBootRecovery() {
  showBootSplash("正在连接 Hermes Mobile");
  const config = await fetch("/api/public-config", { cache: "no-store" }).then((res) => res.json());
  state.setupRequired = Boolean(config.setupRequired);
  if (state.setupRequired) {
    showSetup();
    return;
  }
  if (config.authRequired && !state.key) {
    if (!(await hasCookieSession().catch(() => false))) {
      showLogin();
      return;
    }
  }
  setBootSplashText("正在载入工作区");
  await bootstrapWithRetry();
  showApp();
}
