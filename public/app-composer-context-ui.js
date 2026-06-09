"use strict";

function isMinimalWindowView() {
  return isTaskDetailView() || isTodoDetailView() || isSkillDetailView();
}

function activeThreadRunIds(thread = state.currentThread) {
  if (!thread) return [];
  return thread.activeRunIds || (thread.activeRunId ? [thread.activeRunId] : []);
}

function activeTaskRunIds() {
  if (!isTaskDetailView()) return [];
  const pluginGroups = typeof pluginTopicGroupsForTaskList === "function" ? pluginTopicGroupsForTaskList(state.currentThread) : [];
  const selected = taskListGroupsForThread(state.currentThread).concat(pluginGroups).find((group) => group.id === state.currentTaskGroupId);
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
  return "";
}

function activeComposerAssistantMessage() {
  return [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
  )) || null;
}

function composerReasoningCompactText(value = "") {
  const effort = validTaskReasoningEffort(value || "") || String(value || "").trim().toLowerCase();
  return effort ? taskReasoningCompactLabel({ value: effort }) : defaultReasoningCompactLabel();
}

function composerModelReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const active = activeComposerAssistantMessage();
  if (active) {
    const model = String(active.model || active.runOptions?.model || state.defaultModel || assistantDisplayLabel()).trim();
    const effort = String(active.reasoningEffort || active.reasoning_effort || active.runOptions?.reasoning_effort || state.defaultReasoningEffort || "").trim();
    return [model, composerReasoningCompactText(effort)].filter(Boolean).join(" · ");
  }
  const text = getComposerText();
  const mentionInfo = composerAiMentionInfo(text);
  const selected = mentionInfo.modelExplicit
    ? composerModelOptions().find((option) => option.model === mentionInfo.model && option.provider === mentionInfo.provider) || composerModelOptions()[0]
    : selectedDefaultComposerModelOption();
  const model = String(selected.label || selected.model || state.defaultModel || assistantDisplayLabel()).trim();
  const effort = selectedComposerReasoningEffort(text) || state.defaultReasoningEffort || "";
  return [model, composerReasoningCompactText(effort)].filter(Boolean).join(" · ");
}

function composerModelLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const mentionInfo = composerAiMentionInfo(getComposerText());
  const selected = mentionInfo.modelExplicit
    ? composerModelOptions().find((option) => option.model === mentionInfo.model && option.provider === mentionInfo.provider) || composerModelOptions()[0]
    : selectedDefaultComposerModelOption();
  if (!mentionInfo.modelExplicit && selected.id === DEFAULT_COMPOSER_MODEL_ID) return null;
  return { label: `\u6a21\u578b ${selected.label}`, tone: selected.model ? "active" : "" };
}

function composerSearchSourceLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeInfo = activeRunSearchSourceInfo();
  if (!activeInfo || activeInfo.source === "local") return null;
  return { label: `\u4fe1\u6e90 ${activeInfo.label}`, tone: "active" };
}

function activeRunSearchSourceInfo() {
  const active = [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
    && (message.searchSource || message.runOptions?.searchSource)
  ));
  if (!active) return null;
  const source = active.searchSource || active.runOptions?.searchSource || "";
  const option = composerSearchSourceOption(source);
  if (option.source === COMPOSER_SEARCH_SOURCE_LOCAL) return null;
  return option;
}

function messageUsesHighPermissionGateway(message = {}) {
  const securityLevel = String(message.gatewaySecurityLevel || message.gateway_security_level || "").trim();
  return Boolean(
    message.gatewayMaintenance
    || message.gateway_maintenance
    || /^owner[-_]maintenance$/i.test(securityLevel)
  );
}

function messageGatewayDisplayName(message = {}) {
  const direct = String(
    message.gatewayName
    || message.gateway_name
    || message.gatewayProfile
    || message.gateway_profile
    || message.gatewaySource
    || message.gateway_source
    || "",
  ).trim();
  if (direct) return direct;
  const url = String(message.gatewayUrl || message.gateway_url || "").trim();
  if (!url) return "";
  try {
    return new URL(url).host || url;
  } catch (_err) {
    return url;
  }
}

function activeRunGatewayPermissionLabel() {
  const active = activeComposerAssistantMessage();
  if (!active) return null;
  const gatewayName = messageGatewayDisplayName(active);
  return gatewayName ? { label: gatewayName, tone: "active" } : null;
}

function composerGatewayPermissionLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeLabel = activeRunGatewayPermissionLabel();
  if (activeLabel) return activeLabel;
  return null;
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

function clearKeyboardViewportMetrics() {
  const root = document.documentElement;
  state.keyboardViewportActive = false;
  state.keyboardContextMode = false;
  state.keyboardContextTopPx = 0;
  root.classList.remove("keyboard-viewport-active");
  root.style.removeProperty("--app-viewport-height");
  root.style.removeProperty("--app-viewport-offset-top");
  root.style.removeProperty("--keyboard-bottom-inset");
  root.style.removeProperty("--keyboard-context-top");
  $("composer")?.classList.remove("keyboard-context-mode");
}

function keyboardViewportShouldClearAfterOrientation() {
  if (!state.keyboardViewportActive) return false;
  const input = $("messageInput");
  const composerActuallyFocused = Boolean(input && document.activeElement === input);
  if (!state.composerFocused || !composerActuallyFocused) return true;
  const metrics = visualViewportKeyboardMetrics();
  return !metrics?.keyboardLikely;
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
    clearKeyboardViewportMetrics();
  }
  if (typeof scheduleEmbeddedPluginViewportBroadcast === "function") {
    scheduleEmbeddedPluginViewportBroadcast(active ? "host_keyboard" : "host_keyboard_clear", 0);
  }
  return active;
}

function mobileBottomCssPx(name, fallback = 0) {
  const value = window.getComputedStyle?.(document.documentElement)?.getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clientLayoutDiagnosticSessionId() {
  const key = "hermesClientLayoutDiagnosticSession";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing.slice(0, 80);
    const id = `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, id);
    return id;
  } catch (_) {
    return `layout-${Date.now().toString(36)}`;
  }
}

function clientLayoutDiagnosticRect(node) {
  const rect = node?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function clientLayoutDiagnosticClassList(node) {
  try {
    return Array.from(node?.classList || []).slice(0, 32);
  } catch (_) {
    return [];
  }
}

function clientLayoutDiagnosticMeasureLength(lengthValue) {
  if (!document.body || !lengthValue) return null;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:1px",
    `height:${lengthValue}`,
    "padding:0",
    "margin:0",
    "border:0",
    "pointer-events:none",
    "visibility:hidden",
  ].join(";");
  try {
    document.body.appendChild(probe);
    return clientLayoutDiagnosticRect(probe);
  } catch (_) {
    return null;
  } finally {
    probe.remove?.();
  }
}

function clientLayoutDiagnosticSafeAreaProbe() {
  if (!document.body) return null;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:1px",
    "height:1px",
    "padding-top:env(safe-area-inset-top)",
    "padding-right:env(safe-area-inset-right)",
    "padding-bottom:env(safe-area-inset-bottom)",
    "padding-left:env(safe-area-inset-left)",
    "margin:0",
    "border:0",
    "pointer-events:none",
    "visibility:hidden",
  ].join(";");
  try {
    document.body.appendChild(probe);
    const styles = window.getComputedStyle?.(probe);
    const number = (name) => {
      const parsed = Number.parseFloat(styles?.getPropertyValue(name) || "");
      return Number.isFinite(parsed) ? Math.round(parsed) : 0;
    };
    return {
      top: number("padding-top"),
      right: number("padding-right"),
      bottom: number("padding-bottom"),
      left: number("padding-left"),
    };
  } catch (_) {
    return null;
  } finally {
    probe.remove?.();
  }
}

function clientLayoutDiagnosticViewportUnits() {
  return {
    vh: clientLayoutDiagnosticMeasureLength("100vh"),
    dvh: clientLayoutDiagnosticMeasureLength("100dvh"),
    lvh: clientLayoutDiagnosticMeasureLength("100lvh"),
    svh: clientLayoutDiagnosticMeasureLength("100svh"),
  };
}

function clientLayoutDiagnosticChrome(app, main, bottomNav) {
  const root = document.documentElement;
  const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const bottomStyles = bottomNav ? window.getComputedStyle?.(bottomNav) : null;
  const appStyles = app ? window.getComputedStyle?.(app) : null;
  const mainStyles = main ? window.getComputedStyle?.(main) : null;
  const bodyBefore = window.getComputedStyle?.(document.body, "::before");
  return {
    statusBarStyle: statusMeta?.getAttribute("content") || "",
    themeColor: themeMeta?.getAttribute("content") || "",
    dataTheme: root?.dataset?.theme || "",
    effectiveTheme: root?.dataset?.effectiveTheme || "",
    rootClasses: clientLayoutDiagnosticClassList(root),
    bodyClasses: clientLayoutDiagnosticClassList(document.body),
    appClasses: clientLayoutDiagnosticClassList(app),
    mainClasses: clientLayoutDiagnosticClassList(main),
    safeAreaProbe: clientLayoutDiagnosticSafeAreaProbe(),
    viewportUnits: clientLayoutDiagnosticViewportUnits(),
    bodyBefore: {
      display: bodyBefore?.getPropertyValue("display") || "",
      height: bodyBefore?.getPropertyValue("height") || "",
      top: bodyBefore?.getPropertyValue("top") || "",
      backgroundColor: bodyBefore?.getPropertyValue("background-color") || "",
    },
    appStyle: {
      position: appStyles?.getPropertyValue("position") || "",
      height: appStyles?.getPropertyValue("height") || "",
      minHeight: appStyles?.getPropertyValue("min-height") || "",
      paddingBottom: appStyles?.getPropertyValue("padding-bottom") || "",
    },
    mainStyle: {
      position: mainStyles?.getPropertyValue("position") || "",
      top: mainStyles?.getPropertyValue("top") || "",
      bottom: mainStyles?.getPropertyValue("bottom") || "",
      height: mainStyles?.getPropertyValue("height") || "",
    },
    bottomNavStyle: {
      display: bottomStyles?.getPropertyValue("display") || "",
      position: bottomStyles?.getPropertyValue("position") || "",
      bottom: bottomStyles?.getPropertyValue("bottom") || "",
      height: bottomStyles?.getPropertyValue("height") || "",
      minHeight: bottomStyles?.getPropertyValue("min-height") || "",
      paddingTop: bottomStyles?.getPropertyValue("padding-top") || "",
      paddingBottom: bottomStyles?.getPropertyValue("padding-bottom") || "",
      transform: bottomStyles?.getPropertyValue("transform") || "",
    },
  };
}

function clientLayoutDiagnosticCss() {
  const styles = window.getComputedStyle?.(document.documentElement);
  const pick = (name) => styles?.getPropertyValue(name)?.trim?.() || "";
  return {
    mobileBottomSafeArea: pick("--mobile-bottom-safe-area"),
    mobileBottomContentSafeArea: pick("--mobile-bottom-nav-content-safe-area"),
    mobileBottomNavHeight: pick("--mobile-bottom-nav-height"),
    mobileBottomNavBottom: pick("--mobile-bottom-nav-bottom"),
    mobileBottomNavBottomRuntime: pick("--mobile-bottom-nav-bottom-runtime"),
    mobileBottomNavOffsetHeightRuntime: pick("--mobile-bottom-nav-offset-height-runtime"),
    mobileBottomNavReservedHeightRuntime: pick("--mobile-bottom-nav-reserved-height-runtime"),
    mobileBottomStackHeightRuntime: pick("--mobile-bottom-stack-height-runtime"),
    mobileBottomNavOverflowClamp: pick("--mobile-bottom-nav-overflow-clamp"),
    mobileBottomNavUnderflowClamp: pick("--mobile-bottom-nav-underflow-clamp"),
    pluginContextBottomNavHeight: pick("--plugin-context-bottom-nav-height"),
    pluginContextMainTop: pick("--plugin-context-main-top"),
    pluginContextMainBottom: pick("--plugin-context-main-bottom"),
  };
}

function captureClientLayoutDiagnostic(reason = "layout") {
  const visual = window.visualViewport;
  const app = $("app");
  const main = app?.querySelector?.(".main");
  const conversation = $("conversation");
  const pluginFrame = document.querySelector(".embedded-plugin-frame.active, .wardrobe-plugin-frame");
  const bottomNav = $("bottomNav");
  return {
    event: "client_layout",
    reason: String(reason || "layout").slice(0, 80),
    sessionId: clientLayoutDiagnosticSessionId(),
    clientVersion: document.documentElement?.dataset?.clientVersion || "",
    atClient: new Date().toISOString(),
    viewMode: state.viewMode || "",
    singleWindowMode: state.singleWindowMode || "",
    pluginContextNavPluginId: state.pluginContextNavPluginId || "",
    directoryPluginContextActive: Boolean(state.directoryPluginContextActive),
    standalone: Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true),
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches),
    userAgent: navigator.userAgent || "",
    devicePixelRatio: Number(window.devicePixelRatio || 1) || 1,
    screen: {
      width: Math.round(window.screen?.width || 0),
      height: Math.round(window.screen?.height || 0),
      availWidth: Math.round(window.screen?.availWidth || 0),
      availHeight: Math.round(window.screen?.availHeight || 0),
    },
    viewport: {
      innerWidth: Math.round(window.innerWidth || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      outerWidth: Math.round(window.outerWidth || 0),
      outerHeight: Math.round(window.outerHeight || 0),
      scrollX: Math.round(window.scrollX || 0),
      scrollY: Math.round(window.scrollY || 0),
      visualWidth: Math.round(visual?.width || 0),
      visualHeight: Math.round(visual?.height || 0),
      visualOffsetTop: Math.round(visual?.offsetTop || 0),
      visualOffsetLeft: Math.round(visual?.offsetLeft || 0),
      visualScale: Number.isFinite(visual?.scale) ? Number(visual.scale) : 1,
      documentClientWidth: Math.round(document.documentElement?.clientWidth || 0),
      documentClientHeight: Math.round(document.documentElement?.clientHeight || 0),
      bodyClientHeight: Math.round(document.body?.clientHeight || 0),
    },
    chrome: clientLayoutDiagnosticChrome(app, main, bottomNav),
    css: clientLayoutDiagnosticCss(),
    rects: {
      rootElement: clientLayoutDiagnosticRect(document.documentElement),
      body: clientLayoutDiagnosticRect(document.body),
      app: clientLayoutDiagnosticRect(app),
      main: clientLayoutDiagnosticRect(main),
      topbar: clientLayoutDiagnosticRect(document.querySelector(".topbar")),
      conversation: clientLayoutDiagnosticRect(conversation),
      bottomNav: clientLayoutDiagnosticRect(bottomNav),
      topicPluginDock: clientLayoutDiagnosticRect($("topicPluginDock")),
      embeddedPluginHost: clientLayoutDiagnosticRect(document.querySelector(".embedded-plugin-host.active, .wardrobe-plugin-host.active")),
      pluginFrame: clientLayoutDiagnosticRect(pluginFrame),
    },
    bottomLayoutMetrics: window.__hermesMobileBottomLayoutMetrics || null,
    bottomLayoutLastSettle: window.__hermesMobileBottomLayoutLastSettle || null,
    pluginContextViewportMetrics: window.__hermesPluginContextViewportMetrics || null,
  };
}

function sendClientLayoutDiagnostic(reason = "layout") {
  try {
    const payload = captureClientLayoutDiagnostic(reason);
    const headers = {
      "Content-Type": "application/json",
      "X-Hermes-Web-Client-Version": payload.clientVersion || "",
    };
    if (state.key) headers["X-Hermes-Web-Key"] = state.key;
    fetch("/api/client-layout-diagnostics", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
    return payload;
  } catch (_) {
    return null;
  }
}

function scheduleClientLayoutDiagnostics(reason = "layout", delays = [0, 240, 900, 1800]) {
  const uniqueDelays = [...new Set((delays || []).map((delay) => Math.max(0, Number(delay || 0) || 0)))];
  uniqueDelays.forEach((delay) => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        sendClientLayoutDiagnostic(`${reason}:${delay}`);
      });
    }, delay);
  });
}

function updateMobileBottomNavReservation() {
  const root = document.documentElement;
  const app = $("app");
  const nav = $("bottomNav");
  const clearBottomStackMetrics = () => {
    window.__hermesMobileBottomLayoutMetrics = null;
    root.style.removeProperty("--mobile-bottom-nav-bottom-runtime");
    root.style.removeProperty("--mobile-bottom-nav-offset-height-runtime");
    root.style.removeProperty("--mobile-bottom-nav-reserved-height-runtime");
    root.style.removeProperty("--topic-plugin-dock-bottom-runtime");
    root.style.removeProperty("--topic-plugin-dock-reserved-height-runtime");
    root.style.removeProperty("--mobile-bottom-stack-height-runtime");
  };
  if (!nav || !isMobileLayout()) {
    clearBottomStackMetrics();
    updatePluginContextViewportReservation();
    return;
  }
  if (nav.hidden || window.getComputedStyle?.(nav).display === "none") {
    clearBottomStackMetrics();
    updatePluginContextViewportReservation();
    return;
  }
  const rect = nav.getBoundingClientRect?.();
  const rectHeight = Math.ceil(rect?.height || 0);
  const rectWidth = Math.ceil(rect?.width || 0);
  const navLaidOut = Boolean(rect && rectHeight > 0 && rectWidth > 0 && rect.bottom > 0);
  const contentHeight = Math.ceil(nav.scrollHeight || 0);
  const visualViewportHeight = Math.ceil(window.visualViewport?.height || 0);
  const innerHeight = Math.ceil(window.innerHeight || 0);
  const documentHeight = Math.ceil(document.documentElement?.clientHeight || 0);
  const layoutViewportHeight = Math.max(innerHeight, documentHeight, visualViewportHeight);
  const viewportHeight = layoutViewportHeight;
  const comfortInset = Math.max(0, Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-comfort-inset", 0)));
  const navBottomOverflowRaw = navLaidOut && viewportHeight ? Math.ceil(Math.max(0, rect.bottom - viewportHeight)) : 0;
  const navBottomOverflowClamp = Math.max(0, Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-overflow-clamp", 0)));
  const navBottomOverflow = Math.min(navBottomOverflowRaw, navBottomOverflowClamp);
  const currentNavBottom = Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-bottom-runtime", comfortInset));
  const currentNavBottomDrop = navLaidOut ? Math.max(0, -currentNavBottom) : 0;
  const navBottomUnderflowRaw = navLaidOut && viewportHeight ? Math.ceil(Math.max(0, viewportHeight - rect.bottom + currentNavBottomDrop)) : 0;
  const navBottomUnderflowClamp = Math.max(0, Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-underflow-clamp", 0)));
  const navBottomUnderflow = Math.min(navBottomUnderflowRaw, navBottomUnderflowClamp);
  const navBottom = navBottomOverflow + comfortInset - navBottomUnderflow;
  const visibleOffset = navLaidOut && viewportHeight ? Math.ceil(Math.max(0, viewportHeight - rect.top)) : rectHeight;
  const offset = Math.max(44, rectHeight, contentHeight, visibleOffset || rectHeight);
  const reserve = Math.max(76, navBottom + rectHeight + 10, navBottom + contentHeight + 10);
  const navVisualLift = Math.max(0, Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-visual-lift", 0)));
  const dock = $("topicPluginDock");
  const dockVisible = Boolean(
    app?.classList.contains("task-list-mode")
    && dock
    && !dock.hidden
    && window.getComputedStyle?.(dock).display !== "none"
  );
  const dockHeight = dockVisible
    ? Math.max(0, Math.ceil(dock.getBoundingClientRect?.().height || 0), Math.ceil(dock.scrollHeight || 0))
    : 0;
  const dockBottom = offset;
  const stackHeight = dockVisible ? Math.max(reserve, dockBottom + dockHeight + 2) : reserve;
  const bottomLayoutMetrics = {
    viewportHeight,
    visualViewportHeight,
    innerHeight,
    documentHeight,
    layoutViewportHeight,
    navBottomOverflowRaw,
    navBottomOverflowClamp,
    navBottomOverflow,
    navBottomUnderflowRaw,
    navBottomUnderflowClamp,
    navBottomUnderflow,
    navBottom,
    comfortInset,
    navLaidOut,
    navRect: rect ? {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    } : null,
    navOffset: offset,
    navReserve: reserve,
    navVisualLift,
    dockVisible,
    dockHeight,
    dockBottom,
    stackHeight,
  };
  window.__hermesMobileBottomLayoutMetrics = bottomLayoutMetrics;
  root.style.setProperty("--mobile-bottom-nav-bottom-runtime", `${navBottom}px`);
  root.style.setProperty("--mobile-bottom-nav-offset-height-runtime", `${offset}px`);
  root.style.setProperty("--mobile-bottom-nav-reserved-height-runtime", `${reserve}px`);
  if (dockVisible) {
    root.style.setProperty("--topic-plugin-dock-bottom-runtime", `${dockBottom}px`);
    root.style.setProperty("--topic-plugin-dock-reserved-height-runtime", `${stackHeight}px`);
  } else {
    root.style.removeProperty("--topic-plugin-dock-bottom-runtime");
    root.style.removeProperty("--topic-plugin-dock-reserved-height-runtime");
  }
  root.style.setProperty("--mobile-bottom-stack-height-runtime", `${stackHeight}px`);
  renderMobileBottomLayoutDebug(bottomLayoutMetrics);
  updatePluginContextViewportReservation();
}

function settleMobileBottomNavReservation(reason = "layout", delays = [0, 40, 120, 260, 520, 1000, 1800]) {
  if (!isMobileLayout()) return false;
  const normalizedDelays = [...new Set((delays || [])
    .map((delay) => Math.max(0, Number(delay || 0) || 0))
    .filter((delay) => Number.isFinite(delay)))];
  const run = (delay) => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          updateMobileBottomNavReservation();
          window.__hermesMobileBottomLayoutLastSettle = {
            reason: String(reason || "layout").slice(0, 80),
            delay,
            at: Date.now(),
            metrics: window.__hermesMobileBottomLayoutMetrics || null,
          };
          if (delay === 0 || delay >= 240) sendClientLayoutDiagnostic(`settle:${reason}:${delay}`);
        });
      });
    }, delay);
  };
  normalizedDelays.forEach(run);
  return true;
}

function mobileBottomLayoutDebugEnabled() {
  try {
    return new URLSearchParams(window.location.search || "").get("layoutDebug") === "1"
      || localStorage.getItem("hermesLayoutDebug") === "1";
  } catch (_) {
    return false;
  }
}

function renderMobileBottomLayoutDebug(metrics = {}) {
  if (!mobileBottomLayoutDebugEnabled()) return;
  let panel = document.getElementById("mobileBottomLayoutDebug");
  if (!panel) {
    panel = document.createElement("pre");
    panel.id = "mobileBottomLayoutDebug";
    panel.style.cssText = [
      "position:fixed",
      "left:8px",
      "right:8px",
      "top:8px",
      "z-index:3000",
      "max-height:38vh",
      "overflow:auto",
      "margin:0",
      "padding:8px",
      "border:1px solid rgba(31,43,51,.18)",
      "border-radius:8px",
      "background:rgba(248,249,248,.94)",
      "color:#17212a",
      "font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      "white-space:pre-wrap",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(panel);
  }
  const dock = $("topicPluginDock");
  const grid = document.querySelector(".capability-quick-grid");
  const quick = Array.from(document.querySelectorAll(".capability-quick-action"));
  const rectOf = (node) => {
    const rect = node?.getBoundingClientRect?.();
    return rect ? {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
    } : null;
  };
  panel.textContent = JSON.stringify({
    version: document.documentElement.getAttribute("data-client-version"),
    visualViewport: {
      width: Math.round(window.visualViewport?.width || window.innerWidth || 0),
      height: Math.round(window.visualViewport?.height || window.innerHeight || 0),
      offsetTop: Math.round(window.visualViewport?.offsetTop || 0),
    },
    css: {
      navBottom: getComputedStyle(document.documentElement).getPropertyValue("--mobile-bottom-nav-bottom-runtime").trim(),
      navOffset: getComputedStyle(document.documentElement).getPropertyValue("--mobile-bottom-nav-offset-height-runtime").trim(),
      dockBottom: getComputedStyle(document.documentElement).getPropertyValue("--topic-plugin-dock-bottom-runtime").trim(),
      stack: getComputedStyle(document.documentElement).getPropertyValue("--mobile-bottom-stack-height-runtime").trim(),
    },
    measured: metrics,
    quickCount: quick.length,
    grid: rectOf(grid),
    firstQuick: rectOf(quick[0]),
    lastQuick: rectOf(quick[quick.length - 1]),
    dock: rectOf(dock),
    bottomNav: rectOf($("bottomNav")),
  }, null, 2);
}

function updatePluginContextViewportReservation() {
  const root = document.documentElement;
  const app = $("app");
  const nav = $("bottomNav");
  const active = Boolean(
    app?.classList.contains("plugin-context-nav-mode")
    && !app.classList.contains("embedded-plugin-preview-fullscreen-active")
    && (
      app.classList.contains("wardrobe-plugin-host-active")
      || app.classList.contains("embedded-plugin-host-active")
    )
  );
  if (!active || !nav || nav.hidden || window.getComputedStyle?.(nav).display === "none") {
    root.style.removeProperty("--plugin-context-main-bottom");
    if (typeof scheduleEmbeddedPluginViewportBroadcast === "function") scheduleEmbeddedPluginViewportBroadcast("plugin_context_inactive", 0);
    return;
  }
  const navRect = nav.getBoundingClientRect?.();
  const navHeight = Math.ceil(navRect?.height || 0);
  const appHeight = Math.ceil(app.getBoundingClientRect?.().height || 0);
  const visualViewportHeight = Math.ceil(window.visualViewport?.height || 0);
  const innerHeight = Math.ceil(window.innerHeight || 0);
  const documentHeight = Math.ceil(document.documentElement?.clientHeight || 0);
  const layoutViewportHeight = Math.max(innerHeight, documentHeight, visualViewportHeight);
  const viewportHeight = layoutViewportHeight || appHeight || 0;
  const viewportOverflowRaw = Math.max(0, appHeight - viewportHeight);
  const viewportOverflowClamp = Math.max(0, Math.ceil(mobileBottomCssPx("--mobile-bottom-nav-overflow-clamp", 0)));
  const viewportOverflow = Math.min(viewportOverflowRaw, viewportOverflowClamp);
  const navVisibleTopInset = navRect && viewportHeight ? Math.ceil(Math.max(0, viewportHeight - navRect.top)) : navHeight;
  const bottomInset = Math.max(0, navVisibleTopInset + viewportOverflow);
  window.__hermesPluginContextViewportMetrics = {
    visualViewportHeight,
    innerHeight,
    documentHeight,
    layoutViewportHeight,
    viewportHeight,
    appHeight,
    navHeight,
    navVisibleTopInset,
    navRect: navRect ? {
      top: Math.round(navRect.top),
      bottom: Math.round(navRect.bottom),
      height: Math.round(navRect.height),
    } : null,
    viewportOverflowRaw,
    viewportOverflowClamp,
    viewportOverflow,
    bottomInset,
  };
  if (bottomInset > 0) root.style.setProperty("--plugin-context-main-bottom", `${bottomInset}px`);
  else root.style.removeProperty("--plugin-context-main-bottom");
  if (typeof scheduleEmbeddedPluginViewportBroadcast === "function") scheduleEmbeddedPluginViewportBroadcast("plugin_context_viewport", 0);
}

function normalizeMobileViewportAfterViewChange() {
  state.composerFocused = false;
  clearKeyboardViewportMetrics();
  settleMobileBottomNavReservation("view_change", [0, 80, 240, 520]);
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
  const gatewayPermissionLabel = composerGatewayPermissionLabel();
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
  const searchSourceLabel = composerSearchSourceLabel();
  if (searchSourceLabel?.label) items.push(searchSourceLabel);
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
    || Boolean(activeRunSearchSourceInfo())
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
