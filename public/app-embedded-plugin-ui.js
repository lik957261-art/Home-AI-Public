"use strict";

const EMBEDDED_PLUGIN_DEFS = Object.freeze({
  "codex-mobile": Object.freeze({
    id: "codex-mobile",
    viewMode: "codex",
    title: "Codex",
    label: "Codex",
    bottomButtonId: "bottomCodexMode",
    appClass: "codex-mode",
    hostId: "codexPluginHost",
    navVisibleClass: "codex-visible",
    navigationEventType: "codex-mobile.plugin.navigation",
    backResultEventType: "codex-mobile.plugin.back_result",
    refreshRequiredEventType: "codex-mobile.plugin.refresh_required",
    manifestPath: "/api/hermes-plugins/codex-mobile/manifest",
  }),
  finance: Object.freeze({
    id: "finance",
    viewMode: "finance",
    title: "\u8bb0\u8d26",
    label: "\u8bb0\u8d26",
    bottomButtonId: "bottomFinanceMode",
    appClass: "finance-mode",
    hostId: "financePluginHost",
    navVisibleClass: "finance-visible",
    navigationEventType: "finance.plugin.navigation",
    backResultEventType: "finance.plugin.back_result",
    refreshRequiredEventType: "finance.plugin.refresh_required",
    manifestPath: "/api/hermes-plugins/finance/manifest",
  }),
  email: Object.freeze({
    id: "email",
    viewMode: "email",
    title: "\u90ae\u7bb1",
    label: "\u90ae\u7bb1",
    bottomButtonId: "bottomEmailMode",
    appClass: "email-mode",
    hostId: "emailPluginHost",
    navVisibleClass: "email-visible",
    navigationEventType: "email.plugin.navigation",
    backResultEventType: "email.plugin.back_result",
    refreshRequiredEventType: "email.plugin.refresh_required",
    manifestPath: "/api/hermes-plugins/email/manifest",
  }),
  health: Object.freeze({
    id: "health",
    viewMode: "health",
    title: "\u5065\u5eb7",
    label: "\u5065\u5eb7",
    bottomButtonId: "bottomHealthMode",
    appClass: "health-mode",
    hostId: "healthPluginHost",
    navVisibleClass: "health-visible",
    navigationEventType: "health.plugin.navigation",
    backResultEventType: "health.plugin.back_result",
    refreshRequiredEventType: "health.plugin.refresh_required",
    manifestPath: "/api/hermes-plugins/health/manifest",
  }),
  note: Object.freeze({
    id: "note",
    viewMode: "note",
    title: "\u7b14\u8bb0",
    label: "\u7b14\u8bb0",
    bottomButtonId: "bottomNoteMode",
    appClass: "note-mode",
    hostId: "notePluginHost",
    navVisibleClass: "note-visible",
    navigationEventType: "note.plugin.navigation",
    backResultEventType: "note.plugin.back_result",
    refreshRequiredEventType: "note.plugin.refresh_required",
    manifestPath: "/api/hermes-plugins/note/manifest",
  }),
});

function embeddedPluginRecord(pluginId) {
  state.embeddedPlugins = state.embeddedPlugins || {};
  if (!state.embeddedPlugins[pluginId]) {
    state.embeddedPlugins[pluginId] = {
      manifest: null,
      manifestAppearanceKey: "",
      manifestFetchedAt: 0,
      manifestFreshForFrame: false,
      frameOrigin: "",
      shellNode: null,
      canGoBack: false,
      previewFullscreen: false,
      navigationRoute: null,
      navigationLastAt: 0,
      bridgeBound: false,
      frameHealthSeq: 0,
      viewportMessageTimer: 0,
      loading: false,
      checked: false,
    };
  }
  return state.embeddedPlugins[pluginId];
}

function embeddedPluginDefByView(viewMode = state.viewMode) {
  return Object.values(EMBEDDED_PLUGIN_DEFS).find((item) => item.viewMode === viewMode) || null;
}

function embeddedPluginCurrentManifest(def, appearanceKey = embeddedPluginAppearanceKey()) {
  const record = embeddedPluginRecord(def.id);
  const workspaceId = state.selectedWorkspaceId || "owner";
  return embeddedPluginManifestMatchesLaunchContext(record, workspaceId, appearanceKey) ? record.manifest : null;
}

function embeddedPluginProxyEntryWorkspaceMatches(entryUrl = "", workspaceId = "") {
  const targetWorkspaceId = String(workspaceId || "owner").trim() || "owner";
  try {
    const parsed = new URL(String(entryUrl || ""), window.location?.href || undefined);
    if (!parsed.pathname.startsWith("/api/hermes-plugins/")) return true;
    const entryWorkspaceId = parsed.searchParams.get("workspaceId") || parsed.searchParams.get("workspace_id") || "";
    return entryWorkspaceId === targetWorkspaceId;
  } catch (_) {
    return false;
  }
}

function embeddedPluginAvailable(manifest) {
  return Boolean(manifest?.available && manifest?.entry?.url && manifest?.kind === "embedded_app");
}

function embeddedPluginListState() {
  if (!state.embeddedPluginList || typeof state.embeddedPluginList !== "object") {
    state.embeddedPluginList = {
      workspaceId: "",
      loading: false,
      loaded: false,
      pluginIds: [],
      requestSeq: 0,
      lastAttemptAt: 0,
      error: "",
    };
  }
  return state.embeddedPluginList;
}

async function refreshEmbeddedPluginList(options = {}) {
  const record = embeddedPluginListState();
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (!options.force && record.loading) return record;
  if (!options.force && record.loaded && record.workspaceId === workspaceId) return record;
  const seq = Number(record.requestSeq || 0) + 1;
  record.requestSeq = seq;
  record.workspaceId = workspaceId;
  record.loading = true;
  record.lastAttemptAt = Date.now();
  record.error = "";
  try {
    const params = new URLSearchParams({ workspaceId });
    const result = await api(`/api/hermes-plugins?${params.toString()}`);
    if (record.requestSeq !== seq || record.workspaceId !== workspaceId) return record;
    record.pluginIds = (result.plugins || [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean);
    record.loaded = true;
  } catch (err) {
    if (record.requestSeq === seq && record.workspaceId === workspaceId) {
      record.pluginIds = [];
      record.loaded = false;
      record.error = err?.message || String(err);
    }
  } finally {
    if (record.requestSeq === seq && record.workspaceId === workspaceId) {
      record.loading = false;
      updateNavigationControls();
    }
  }
  return record;
}

function embeddedPluginListedForWorkspace(pluginId) {
  const record = embeddedPluginListState();
  const workspaceId = embeddedPluginCurrentWorkspaceId();
  return Boolean(
    record.loaded
    && record.workspaceId === workspaceId
    && record.pluginIds.includes(pluginId)
  );
}

function embeddedPluginCurrentWorkspaceId() {
  return state.selectedWorkspaceId || "owner";
}

function codexPluginNavigationAvailable() {
  return Boolean(state.auth?.isOwner && embeddedPluginCurrentWorkspaceId() === "owner");
}

function embeddedPluginNavigationAvailable(def) {
  if (def?.id === "codex-mobile") return codexPluginNavigationAvailable();
  if (state.auth?.isOwner && embeddedPluginCurrentWorkspaceId() === "owner") return true;
  const available = embeddedPluginListedForWorkspace(def?.id || "");
  const record = embeddedPluginListState();
  const workspaceId = embeddedPluginCurrentWorkspaceId();
  const retryReady = record.workspaceId !== workspaceId || Date.now() - Number(record.lastAttemptAt || 0) > 15000;
  if (!available && !record.loading && retryReady) refreshEmbeddedPluginList().catch(() => {});
  return available;
}

function embeddedPluginUsesLaunchToken(manifest) {
  const entryUrl = String(manifest?.entry?.url || "");
  return manifest?.embed?.tokenStatus === "launch_token_issued" || /[?&](?:launch|codexPluginLaunch)=/.test(entryUrl);
}

function embeddedPluginLaunchTokenFreshForFrame(def) {
  const record = embeddedPluginRecord(def.id);
  if (!record.manifestFreshForFrame) return false;
  const fetchedAt = Number(record.manifestFetchedAt || 0);
  return fetchedAt > 0 && Date.now() - fetchedAt < 60000;
}

function embeddedPluginEntryOrigin(def, manifest = embeddedPluginCurrentManifest(def)) {
  const value = String(manifest?.entry?.origin || manifest?.entry?.url || "").trim();
  if (!value) return "";
  try {
    return new URL(value, window.location?.href || undefined).origin;
  } catch (_) {
    return "";
  }
}

function embeddedPluginBlockedByPageSecurity(def, manifest = embeddedPluginCurrentManifest(def)) {
  if (manifest?.embed?.blockedByFrameAncestors) return true;
  if (!embeddedPluginAvailable(manifest)) return false;
  try {
    const pageProtocol = window.location?.protocol || "";
    const entryProtocol = new URL(manifest.entry.url, window.location?.href || undefined).protocol;
    return pageProtocol === "https:" && entryProtocol === "http:";
  } catch (_) {
    return true;
  }
}

function embeddedPluginMessageOriginAllowed(def, event) {
  const record = embeddedPluginRecord(def.id);
  const expected = record.frameOrigin || embeddedPluginEntryOrigin(def, record.manifest) || embeddedPluginEntryOrigin(def);
  return Boolean(expected && event?.origin === expected);
}

function normalizeEmbeddedPluginOpenRoute(route = {}) {
  const value = route && typeof route === "object" ? route : {};
  const out = {};
  ["pluginRoute", "pluginItemId", "pluginThreadId", "pluginTaskId"].forEach((key) => {
    const text = String(value[key] || "").trim().slice(0, 180);
    if (text) out[key] = text;
  });
  return out;
}

function setEmbeddedPluginOpenRoute(def, route = {}) {
  if (!def) return false;
  const normalized = normalizeEmbeddedPluginOpenRoute(route);
  embeddedPluginRecord(def.id).openRoute = Object.keys(normalized).length ? normalized : null;
  return Boolean(embeddedPluginRecord(def.id).openRoute);
}

function embeddedPluginEntryUrlForFrame(def, manifest) {
  const entryUrl = String(manifest?.entry?.url || "");
  const route = embeddedPluginRecord(def.id).openRoute;
  if (!entryUrl || !route) return entryUrl;
  try {
    const parsed = new URL(entryUrl, window.location?.href || undefined);
    Object.entries(route).forEach(([key, value]) => parsed.searchParams.set(key, value));
    parsed.searchParams.set("pluginId", def.id);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) {
    return entryUrl;
  }
}

function embeddedPluginAppearanceForLaunch() {
  const themeMode = ["system", "dark", "light"].includes(String(state.themeMode || "").trim())
    ? String(state.themeMode || "").trim()
    : "system";
  const theme = themeMode === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light")
    : themeMode;
  const rawFontSize = String(state.fontSize || "").trim();
  const fontSize = rawFontSize === "standard"
    ? "default"
    : (["small", "default", "large", "xlarge", "xxlarge"].includes(rawFontSize) ? rawFontSize : "default");
  return { theme, fontSize };
}

function embeddedPluginAppearanceKey(appearance = embeddedPluginAppearanceForLaunch()) {
  const theme = ["system", "dark", "light"].includes(String(appearance.theme || "").trim())
    ? String(appearance.theme || "").trim()
    : "system";
  const rawFontSize = String(appearance.fontSize || "").trim();
  const fontSize = rawFontSize === "standard"
    ? "default"
    : (["small", "default", "large", "xlarge", "xxlarge"].includes(rawFontSize) ? rawFontSize : "default");
  return `${theme}/${fontSize}`;
}

function embeddedPluginManifestMatchesLaunchContext(record, workspaceId, appearanceKey = embeddedPluginAppearanceKey()) {
  const fetchedAt = Number(record?.manifestFetchedAt || 0);
  const maxAgeMs = Number(record?.manifestMaxAgeMs || 60000);
  const freshEnough = !embeddedPluginUsesLaunchToken(record?.manifest)
    || (fetchedAt > 0 && Date.now() - fetchedAt < maxAgeMs);
  return Boolean(
    record?.checked
    && record?.manifest?.workspaceId === workspaceId
    && record?.manifestAppearanceKey === appearanceKey
    && freshEnough
    && embeddedPluginProxyEntryWorkspaceMatches(record?.manifest?.entry?.url, workspaceId)
  );
}

function updateEmbeddedPluginNavigationState(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  record.canGoBack = Boolean(payload.canGoBack);
  record.previewFullscreen = embeddedPluginPreviewFullscreenRequested(payload);
  record.navigationRoute = payload.route && typeof payload.route === "object" ? payload.route : null;
  record.navigationLastAt = Date.now();
  updateNavigationControls();
}

function embeddedPluginPreviewFullscreenRequested(payload = {}) {
  const preview = payload.preview && typeof payload.preview === "object" ? payload.preview : {};
  return Boolean(
    payload.previewFullscreen
    || payload.fullscreenPreview
    || payload.imagePreviewFullscreen
    || payload.fullscreen === true
    || preview.fullscreen === true
    || preview.mode === "fullscreen"
    || preview.kind === "image"
  );
}

function updateEmbeddedPluginPreviewFullscreenState(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  record.previewFullscreen = embeddedPluginPreviewFullscreenRequested(payload);
  record.navigationLastAt = Date.now();
  updateNavigationControls();
}

function updateEmbeddedPluginBackResultState(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  record.navigationLastAt = Date.now();
  if (payload.route && typeof payload.route === "object") record.navigationRoute = payload.route;
  if (Object.prototype.hasOwnProperty.call(payload, "previewFullscreen") || Object.prototype.hasOwnProperty.call(payload, "fullscreenPreview")) {
    record.previewFullscreen = embeddedPluginPreviewFullscreenRequested(payload);
  }
  if (payload.handled) {
    updateNavigationControls();
    return;
  }
  record.canGoBack = false;
  record.previewFullscreen = false;
  updateNavigationControls();
}

function embeddedPluginRefreshRequiredEventType(def) {
  return def?.refreshRequiredEventType || `${def?.id || "plugin"}.plugin.refresh_required`;
}

function embeddedPluginRouteFromRefreshPayload(payload = {}) {
  const route = payload.route && typeof payload.route === "object" ? payload.route : payload;
  return normalizeEmbeddedPluginOpenRoute({
    pluginRoute: route.pluginRoute || route.name || route.routeName || "",
    pluginItemId: route.pluginItemId || route.itemId || route.turnId || route.taskId || "",
    pluginThreadId: route.pluginThreadId || route.threadId || "",
    pluginTaskId: route.pluginTaskId || route.taskId || "",
  });
}

function requestEmbeddedPluginRefresh(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  const now = Date.now();
  if (record.loading) {
    record.lastRefreshSuppressedAt = now;
    return false;
  }
  const warmupMs = Number(def?.refreshWarmupSuppressMs || 10000);
  if (warmupMs > 0 && record.shellNode && now - Number(record.frameCreatedAt || 0) < warmupMs && !payload.force) {
    record.lastRefreshSuppressedAt = now;
    return false;
  }
  const cooldownMs = Number(def?.refreshCooldownMs || 60000);
  if (cooldownMs > 0 && now - Number(record.lastRefreshRequestedAt || 0) < cooldownMs) {
    record.lastRefreshSuppressedAt = now;
    return false;
  }
  record.lastRefreshRequestedAt = now;
  const route = embeddedPluginRouteFromRefreshPayload(payload);
  if (Object.keys(route).length) record.openRoute = route;
  record.canGoBack = false;
  record.previewFullscreen = false;
  record.navigationRoute = null;
  record.navigationLastAt = 0;
  record.manifestFreshForFrame = false;
  record.checked = false;
  if (state.viewMode !== def.viewMode) {
    discardEmbeddedPluginShell(def);
    return true;
  }
  refreshEmbeddedPluginFrameFromFreshManifest(def);
  return true;
}

function requestEmbeddedPluginHealthRefresh(def, payload = {}) {
  return requestEmbeddedPluginRefresh(def, Object.assign({ reason: "launch_health_timeout" }, payload));
}

function captureEmbeddedPluginReturnRoute(def) {
  if (!def || state.viewMode === def.viewMode || embeddedPluginDefByView(state.viewMode)) return null;
  return {
    viewMode: state.viewMode || "single",
    pluginContextNavPluginId: state.pluginContextNavPluginId || "",
    singleWindowMode: state.singleWindowMode || "chat",
    selectedProjectId: state.selectedProjectId || "",
    selectedSubprojectId: state.selectedSubprojectId || "",
    currentThread: state.currentThread || null,
    currentThreadId: state.currentThreadId || "",
    currentTaskGroupId: state.currentTaskGroupId || "",
    threads: state.threads || [],
    selectedTodoId: state.selectedTodoId || "",
    todoCreateOpen: Boolean(state.todoCreateOpen),
    selectedAutomationId: state.selectedAutomationId || "",
    automationReturnRoute: state.automationReturnRoute || "",
    automationReturnScope: state.automationReturnScope || "",
    automationReturnInboxItemId: state.automationReturnInboxItemId || "",
    automationRouteTargetId: state.automationRouteTargetId || "",
    automationRouteTargetPending: Boolean(state.automationRouteTargetPending),
    automationCreateOpen: Boolean(state.automationCreateOpen),
    automationEditOpen: Boolean(state.automationEditOpen),
    automationEditJobId: state.automationEditJobId || "",
    automationOutputHistoryOpen: Boolean(state.automationOutputHistoryOpen),
    selectedActionInboxItemId: state.selectedActionInboxItemId || "",
    actionInboxCreateOpen: Boolean(state.actionInboxCreateOpen),
    skillDetail: state.skillDetail || null,
    learningGrowthWorkspaceId: state.learningGrowthWorkspaceId || "",
    selectedLearningTaskCardId: state.selectedLearningTaskCardId || "",
    learningGrowthBoardLane: state.learningGrowthBoardLane || "",
    learningGrowthSettingsOpen: Boolean(state.learningGrowthSettingsOpen),
    learningGrowthActiveTab: state.learningGrowthActiveTab || "",
    directoryPath: state.directoryPath || "",
    directoryRootPath: state.directoryRootPath || "",
    sharedDirectoryManagerOpen: Boolean(state.sharedDirectoryManagerOpen),
    conversationScrollTop: $("conversation")?.scrollTop || 0,
    searchText: $("threadSearch")?.value || "",
  };
}

function rememberEmbeddedPluginReturnRoute(def) {
  const route = captureEmbeddedPluginReturnRoute(def);
  if (!route) return false;
  embeddedPluginRecord(def.id).returnRoute = route;
  return true;
}

function embeddedPluginOuterBackActive(def = embeddedPluginDefByView()) {
  if (!def) return false;
  return state.viewMode === def.viewMode && Boolean(embeddedPluginRecord(def.id).returnRoute);
}

function restoreEmbeddedPluginReturnRoute(def = embeddedPluginDefByView()) {
  if (!def) return false;
  const record = embeddedPluginRecord(def.id);
  const route = record.returnRoute;
  if (!route) return false;
  record.returnRoute = null;
  record.canGoBack = false;
  record.previewFullscreen = false;
  parkEmbeddedPluginShell(def);
  state.viewMode = route.viewMode || "single";
  state.pluginContextNavPluginId = route.pluginContextNavPluginId || "";
  state.singleWindowMode = route.singleWindowMode || state.singleWindowMode || "chat";
  state.selectedProjectId = route.selectedProjectId || state.selectedProjectId || "";
  state.selectedSubprojectId = route.selectedSubprojectId || "";
  state.currentThread = route.currentThread || null;
  state.currentThreadId = route.currentThreadId || "";
  state.currentTaskGroupId = route.currentTaskGroupId || "";
  state.threads = route.threads || [];
  state.selectedTodoId = route.selectedTodoId || "";
  state.todoCreateOpen = Boolean(route.todoCreateOpen);
  state.selectedAutomationId = route.selectedAutomationId || "";
  state.automationReturnRoute = route.automationReturnRoute || "";
  state.automationReturnScope = route.automationReturnScope || "";
  state.automationReturnInboxItemId = route.automationReturnInboxItemId || "";
  state.automationRouteTargetId = route.automationRouteTargetId || "";
  state.automationRouteTargetPending = Boolean(route.automationRouteTargetPending);
  state.automationCreateOpen = Boolean(route.automationCreateOpen);
  state.automationEditOpen = Boolean(route.automationEditOpen);
  state.automationEditJobId = route.automationEditJobId || "";
  state.automationOutputHistoryOpen = Boolean(route.automationOutputHistoryOpen);
  state.selectedActionInboxItemId = route.selectedActionInboxItemId || "";
  state.actionInboxCreateOpen = Boolean(route.actionInboxCreateOpen);
  state.skillDetail = route.skillDetail || null;
  state.learningGrowthWorkspaceId = route.learningGrowthWorkspaceId || state.learningGrowthWorkspaceId || "";
  state.selectedLearningTaskCardId = route.selectedLearningTaskCardId || "";
  state.learningGrowthBoardLane = route.learningGrowthBoardLane || state.learningGrowthBoardLane || "";
  state.learningGrowthSettingsOpen = Boolean(route.learningGrowthSettingsOpen);
  state.learningGrowthActiveTab = route.learningGrowthActiveTab || state.learningGrowthActiveTab || "";
  state.directoryPath = route.directoryPath || "";
  state.directoryRootPath = route.directoryRootPath || "";
  state.sharedDirectoryManagerOpen = Boolean(route.sharedDirectoryManagerOpen);
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebSingleWindowMode", state.singleWindowMode || "chat");
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId || "";
  if (typeof renderSubprojects === "function") renderSubprojects();
  if ($("threadSearch")) $("threadSearch").value = route.searchText || "";
  updateSearchButton();
  applyViewMode();
  if (state.viewMode === "projects" && typeof renderDirectoryView === "function") renderDirectoryView();
  else if (state.viewMode === "todos" && typeof renderTodos === "function") renderTodos();
  else if (state.viewMode === "automation" && typeof renderAutomationView === "function") renderAutomationView();
  else if (state.viewMode === "inbox" && typeof renderActionInboxView === "function") renderActionInboxView();
  else if (state.viewMode === "learning" && typeof renderLearningCoinsView === "function") renderLearningCoinsView();
  else {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
    if (!isSkillDetailView()) setComposerEnabled(state.viewMode === "single" || state.viewMode === "tasks");
  }
  const scrollTop = Number(route.conversationScrollTop || 0) || 0;
  if (scrollTop > 0) requestAnimationFrame(() => {
    const conversation = $("conversation");
    if (conversation) conversation.scrollTop = scrollTop;
  });
  updateNavigationControls();
  ensureVerticalScrollAffordance();
  return true;
}

function ensureEmbeddedPluginNavigationBridge(def) {
  const record = embeddedPluginRecord(def.id);
  if (record.bridgeBound) return;
  record.bridgeBound = true;
  window.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (!data) return;
    if (!embeddedPluginMessageOriginAllowed(def, event)) return;
    if (data.type === def.navigationEventType) {
      updateEmbeddedPluginNavigationState(def, data);
      return;
    }
    if (data.type === "hermes.plugin.preview" || data.type === "hermes.plugin.fullscreen" || data.type === `${def.id}.plugin.preview`) {
      updateEmbeddedPluginPreviewFullscreenState(def, data);
      return;
    }
    if (def.backResultEventType && data.type === def.backResultEventType) {
      updateEmbeddedPluginBackResultState(def, data);
      return;
    }
    if (data.type === embeddedPluginRefreshRequiredEventType(def)) {
      requestEmbeddedPluginRefresh(def, Object.assign({ force: true }, data));
    }
  });
}

function embeddedPluginBackActive(def = embeddedPluginDefByView()) {
  if (!def) return false;
  return state.viewMode === def.viewMode && Boolean(embeddedPluginRecord(def.id).canGoBack);
}

function embeddedPluginPreviewFullscreenActive(def = embeddedPluginDefByView()) {
  if (!def) return false;
  return state.viewMode === def.viewMode && Boolean(embeddedPluginRecord(def.id).previewFullscreen);
}

function embeddedPluginActiveFrame(def = embeddedPluginDefByView()) {
  if (!def) return null;
  return currentEmbeddedPluginShell(def)?.querySelector(".embedded-plugin-frame") || null;
}

function embeddedPluginRectPayload(node) {
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

function embeddedPluginCssPx(name) {
  const value = window.getComputedStyle?.(document.documentElement)?.getPropertyValue(name);
  const number = Number.parseFloat(value || "");
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function embeddedPluginViewportPayload(def, frame, reason = "layout") {
  const visual = window.visualViewport;
  const layoutWidth = Math.round(window.innerWidth || document.documentElement?.clientWidth || 0);
  const layoutHeight = Math.round(window.innerHeight || document.documentElement?.clientHeight || 0);
  const visualWidth = Math.round(visual?.width || layoutWidth || 0);
  const visualHeight = Math.round(visual?.height || layoutHeight || 0);
  const visualOffsetTop = Math.round(visual?.offsetTop || 0);
  const visualOffsetLeft = Math.round(visual?.offsetLeft || 0);
  const keyboard = typeof visualViewportKeyboardMetrics === "function" ? visualViewportKeyboardMetrics() : null;
  const nav = $("bottomNav");
  const footerVisible = Boolean(nav && !nav.hidden && window.getComputedStyle?.(nav).display !== "none");
  const bottomLayout = window.__hermesMobileBottomLayoutMetrics || {};
  return {
    type: "hermes.plugin.viewport",
    version: 1,
    pluginId: def.id,
    workspaceId: embeddedPluginCurrentWorkspaceId(),
    reason: String(reason || "layout").slice(0, 60),
    viewport: {
      width: visualWidth,
      height: visualHeight,
      offsetTop: visualOffsetTop,
      offsetLeft: visualOffsetLeft,
      scale: Number.isFinite(visual?.scale) ? Number(visual.scale) : 1,
      layoutWidth,
      layoutHeight,
    },
    keyboard: {
      visible: Boolean(keyboard?.keyboardLikely),
      bottomInset: Math.max(0, Math.round(keyboard?.bottomInset || 0)),
      offsetTop: Math.max(0, Math.round(keyboard?.offsetTop || 0)),
      height: Math.max(0, Math.round(keyboard?.bottomInset || 0)),
    },
    iframe: embeddedPluginRectPayload(frame),
    host: embeddedPluginRectPayload(embeddedPluginHost(def)),
    footer: {
      visible: footerVisible,
      rect: footerVisible ? embeddedPluginRectPayload(nav) : null,
      bottom: embeddedPluginCssPx("--mobile-bottom-nav-bottom-runtime"),
      offsetHeight: embeddedPluginCssPx("--mobile-bottom-nav-offset-height-runtime"),
      reservedHeight: embeddedPluginCssPx("--mobile-bottom-nav-reserved-height-runtime"),
      stackHeight: embeddedPluginCssPx("--mobile-bottom-stack-height-runtime"),
      pluginContextBottom: embeddedPluginCssPx("--plugin-context-main-bottom"),
      measuredStackHeight: Math.max(0, Math.round(bottomLayout.stackHeight || 0)),
    },
  };
}

function sendEmbeddedPluginViewportMetrics(def = embeddedPluginDefByView(), reason = "layout") {
  if (!def || state.viewMode !== def.viewMode) return false;
  const frame = embeddedPluginActiveFrame(def);
  const record = embeddedPluginRecord(def.id);
  const origin = record.frameOrigin || embeddedPluginEntryOrigin(def, record.manifest) || embeddedPluginEntryOrigin(def);
  if (!frame?.contentWindow || !origin) return false;
  frame.contentWindow.postMessage(embeddedPluginViewportPayload(def, frame, reason), origin);
  record.lastViewportMessageAt = Date.now();
  return true;
}

function resetEmbeddedPluginHostScroll(reason = "layout") {
  const def = embeddedPluginDefByView();
  if (!def || state.viewMode !== def.viewMode) return false;
  if (!embeddedPluginActiveFrame(def)) return false;
  const scrollX = Math.round(window.scrollX || document.documentElement?.scrollLeft || document.body?.scrollLeft || 0);
  const scrollY = Math.round(window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0);
  if (!scrollX && !scrollY) return false;
  window.scrollTo(0, 0);
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }
  embeddedPluginRecord(def.id).lastHostScrollResetAt = Date.now();
  embeddedPluginRecord(def.id).lastHostScrollResetReason = String(reason || "layout").slice(0, 60);
  return true;
}

function scheduleEmbeddedPluginViewportBroadcast(reason = "layout", delay = 0) {
  const def = embeddedPluginDefByView();
  if (!def || state.viewMode !== def.viewMode) return false;
  const record = embeddedPluginRecord(def.id);
  if (record.viewportMessageTimer) window.clearTimeout(record.viewportMessageTimer);
  record.viewportMessageTimer = window.setTimeout(() => {
    record.viewportMessageTimer = 0;
    resetEmbeddedPluginHostScroll(reason);
    sendEmbeddedPluginViewportMetrics(def, reason);
  }, Math.max(0, Number(delay || 0)));
  return true;
}

function settleEmbeddedPluginViewportBroadcast(reason = "layout") {
  const def = embeddedPluginDefByView();
  if (!def || state.viewMode !== def.viewMode) return false;
  [0, 40, 80, 180, 360, 700, 1200].forEach((delay) => {
    window.setTimeout(() => {
      resetEmbeddedPluginHostScroll(reason);
      sendEmbeddedPluginViewportMetrics(def, reason);
    }, delay);
  });
  return true;
}

function embeddedPluginHost(def) {
  let host = $(def.hostId);
  if (host) return host;
  host = document.createElement("div");
  host.id = def.hostId;
  host.className = "embedded-plugin-host";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  const main = document.querySelector(".main");
  const conversation = $("conversation");
  if (main && conversation?.parentNode === main) main.insertBefore(host, conversation);
  else document.body.appendChild(host);
  return host;
}

function setEmbeddedPluginHostVisible(def, visible) {
  const host = embeddedPluginHost(def);
  if (typeof clearKeyboardViewportMetrics === "function" && visible) clearKeyboardViewportMetrics();
  host.hidden = !visible;
  host.setAttribute("aria-hidden", visible ? "false" : "true");
  host.classList.toggle("active", visible);
  $("app")?.classList.toggle(`${def.viewMode}-plugin-host-active`, visible);
  $("app")?.classList.toggle("embedded-plugin-host-active", visible);
  if (visible) scheduleEmbeddedPluginViewportBroadcast("host_visible", 0);
}

function currentEmbeddedPluginShell(def) {
  const record = embeddedPluginRecord(def.id);
  return record.shellNode || embeddedPluginHost(def).querySelector(".embedded-plugin-shell");
}

function parkEmbeddedPluginShell(def) {
  const shell = currentEmbeddedPluginShell(def);
  setEmbeddedPluginHostVisible(def, false);
  if (!shell) return false;
  embeddedPluginRecord(def.id).shellNode = shell;
  return true;
}

function attachEmbeddedPluginShell(def, entryUrl) {
  const shell = currentEmbeddedPluginShell(def);
  if (!shell) return false;
  const frame = shell.querySelector(".embedded-plugin-frame");
  if (!frame || frame.getAttribute("src") !== entryUrl) return false;
  if (shell.parentNode !== embeddedPluginHost(def)) embeddedPluginHost(def).appendChild(shell);
  setEmbeddedPluginHostVisible(def, true);
  embeddedPluginRecord(def.id).shellNode = shell;
  bindEmbeddedPluginFrameHealth(def, frame);
  scheduleEmbeddedPluginViewportBroadcast("frame_attach", 0);
  return true;
}

function discardEmbeddedPluginShell(def) {
  const record = embeddedPluginRecord(def.id);
  currentEmbeddedPluginShell(def)?.remove();
  Object.assign(record, {
    shellNode: null,
    canGoBack: false,
    previewFullscreen: false,
    navigationRoute: null,
    navigationLastAt: 0,
    frameHealthSeq: (record.frameHealthSeq || 0) + 1,
    renderedEntryUrl: "",
  });
}

function resetEmbeddedPluginsForWorkspaceChange() {
  Object.values(EMBEDDED_PLUGIN_DEFS).forEach((def) => {
    const record = embeddedPluginRecord(def.id);
    discardEmbeddedPluginShell(def);
    Object.assign(record, {
      manifest: null,
      manifestAppearanceKey: "",
      manifestFetchedAt: 0,
      manifestFreshForFrame: false,
      frameOrigin: "",
      openRoute: null,
      returnRoute: null,
      checked: false,
      loading: false,
      previewFullscreen: false,
    });
    embeddedPluginHost(def).innerHTML = "";
    setEmbeddedPluginHostVisible(def, false);
  });
  const list = embeddedPluginListState();
  Object.assign(list, {
    workspaceId: "",
    loaded: false,
    loading: false,
    pluginIds: [],
  });
}

function embeddedPluginFrameSrcUsesLaunchToken(frame) {
  return /[?&](?:launch|codexPluginLaunch)=/.test(String(frame?.getAttribute?.("src") || ""));
}

function refreshEmbeddedPluginFrameFromFreshManifest(def) {
  const record = embeddedPluginRecord(def.id);
  if (!$("conversation") || record.loading) return;
  const hasShell = Boolean(currentEmbeddedPluginShell(def));
  if (hasShell) setEmbeddedPluginHostVisible(def, true);
  else showEmbeddedPluginLoadingSurface(def);
  loadEmbeddedPluginManifest(def, { force: true }).catch(showError);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function scheduleEmbeddedPluginLaunchHealthCheck(def, frame, loadedAt = Date.now()) {
  if (!frame || !embeddedPluginFrameSrcUsesLaunchToken(frame)) return;
  const record = embeddedPluginRecord(def.id);
  const seq = (record.frameHealthSeq || 0) + 1;
  record.frameHealthSeq = seq;
  const timeoutMs = Math.max(0, Number(def?.launchHealthTimeoutMs || 30000));
  if (!timeoutMs) return;
  window.setTimeout(() => {
    if (seq !== record.frameHealthSeq) return;
    if (state.viewMode !== def.viewMode) return;
    if (currentEmbeddedPluginShell(def)?.querySelector(".embedded-plugin-frame") !== frame) return;
    if (!embeddedPluginFrameSrcUsesLaunchToken(frame)) return;
    if (Number(record.navigationLastAt || 0) >= loadedAt) return;
    requestEmbeddedPluginHealthRefresh(def);
  }, timeoutMs);
}

function bindEmbeddedPluginFrameHealth(def, frame) {
  if (!frame || frame.dataset.embeddedPluginHealthBound) return;
  frame.dataset.embeddedPluginHealthBound = "1";
  frame.addEventListener("load", () => {
    frame.closest(".embedded-plugin-shell")?.classList.remove("is-loading");
    scheduleEmbeddedPluginLaunchHealthCheck(def, frame, Date.now());
    [0, 80, 240].forEach((delay) => window.setTimeout(() => sendEmbeddedPluginViewportMetrics(def, "frame_load"), delay));
  });
}

function sendEmbeddedPluginBack(def = embeddedPluginDefByView()) {
  if (!def) return false;
  const frame = currentEmbeddedPluginShell(def)?.querySelector(".embedded-plugin-frame");
  const record = embeddedPluginRecord(def.id);
  const origin = record.frameOrigin || embeddedPluginEntryOrigin(def);
  if (!frame?.contentWindow || !origin) return false;
  const requestedAt = Date.now();
  const seq = (record.backRequestSeq || 0) + 1;
  record.backRequestSeq = seq;
  frame.contentWindow.postMessage({ type: "hermes.plugin.back", version: 1 }, origin);
  window.setTimeout(() => {
    if (state.viewMode !== def.viewMode) return;
    if (record.backRequestSeq !== seq) return;
    if (Number(record.navigationLastAt || 0) > requestedAt) return;
    record.canGoBack = false;
    record.previewFullscreen = false;
    const pluginContextBack = typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive();
    if (record.returnRoute && !pluginContextBack) {
      restoreEmbeddedPluginReturnRoute(def);
      return;
    }
    updateNavigationControls();
  }, 1600);
  return true;
}

function renderEmbeddedPluginSecurityNotice(def, manifest) {
  const entryOrigin = manifest?.entry?.origin || manifest?.entry?.url || "";
  const reason = manifest?.embed?.blockedByFrameAncestors
    ? `${def.title} 插件入口还没有允许当前 Home AI 域名嵌入。需要在插件服务里放行这个 origin。`
    : `当前 Home AI 是 HTTPS 页面，不能嵌入 HTTP ${def.title} 入口。需要配置 HTTPS 插件 manifest / entry。`;
  return `
    <div class="embedded-plugin-notice">
      <strong>插件入口未嵌入</strong>
      <span>${escapeHtml(reason)}</span>
      ${entryOrigin ? `<small>${escapeHtml(entryOrigin)}</small>` : ""}
    </div>`;
}

function renderEmbeddedPluginUnavailable(def, manifest = embeddedPluginCurrentManifest(def)) {
  const code = manifest?.code || `${def.id}_plugin_unavailable`;
  const warning = manifest?.warning || `当前 ${def.title} 插件 manifest 不可用。`;
  const securityNotice = embeddedPluginBlockedByPageSecurity(def, manifest) ? renderEmbeddedPluginSecurityNotice(def, manifest) : "";
  return `
    <section class="embedded-plugin-view">
      ${securityNotice}
      <div class="embedded-plugin-notice secondary">
        <strong>${escapeHtml(code)}</strong>
        <span>${escapeHtml(warning)}</span>
        <button class="small-button" type="button" data-embedded-plugin-refresh="${escapeHtml(def.id)}">重试</button>
      </div>
    </section>`;
}

function renderEmbeddedPluginFrame(def, manifest) {
  return `
    <div class="embedded-plugin-shell is-loading" data-plugin-id="${escapeHtml(def.id)}">
      <iframe
        class="embedded-plugin-frame"
        title="${escapeHtml(manifest.title || def.title)}"
        src="${escapeHtml(manifest.entry.url)}"
        loading="eager"
        referrerpolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals"
      ></iframe>
    </div>`;
}

function showEmbeddedPluginLoadingSurface(def) {
  const conversation = $("conversation");
  if (conversation) conversation.innerHTML = "";
  if (!currentEmbeddedPluginShell(def)) embeddedPluginHost(def).innerHTML = "";
  setEmbeddedPluginHostVisible(def, true);
}

async function loadEmbeddedPluginManifest(def, options = {}) {
  const record = embeddedPluginRecord(def.id);
  const workspaceId = state.selectedWorkspaceId || "owner";
  const appearance = embeddedPluginAppearanceForLaunch();
  const appearanceKey = embeddedPluginAppearanceKey(appearance);
  if (!options.force && record.loading) return;
  if (!options.force && embeddedPluginManifestMatchesLaunchContext(record, workspaceId, appearanceKey)) return;
  record.loading = true;
  try {
    const params = new URLSearchParams({
      workspaceId,
      appOrigin: window.location.origin,
      appearanceTheme: appearance.theme,
      appearanceFontSize: appearance.fontSize,
    });
    const manifest = await api(`${def.manifestPath}?${params.toString()}`);
    record.manifest = Object.assign({ workspaceId }, manifest);
    record.manifestAppearanceKey = appearanceKey;
    record.manifestFetchedAt = Date.now();
    record.manifestFreshForFrame = embeddedPluginUsesLaunchToken(record.manifest);
  } catch (err) {
    record.manifest = {
      ok: false,
      available: false,
      workspaceId,
      code: `${def.id}_plugin_manifest_failed`,
      warning: err?.message || String(err),
    };
    record.manifestAppearanceKey = "";
    record.manifestFetchedAt = 0;
    record.manifestFreshForFrame = false;
  } finally {
    record.checked = true;
    record.loading = false;
    if (state.viewMode === def.viewMode) renderEmbeddedPluginView(def);
  }
}

function bindEmbeddedPluginControls(def) {
  $("conversation")?.querySelector(`[data-embedded-plugin-refresh="${def.id}"]`)?.addEventListener("click", () => {
    loadEmbeddedPluginManifest(def, { force: true }).catch(showError);
  });
}

function renderEmbeddedPluginView(def) {
  ensureEmbeddedPluginNavigationBridge(def);
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = `<div class="empty-state small">${escapeHtml(def.title)} 插件</div>`;
  $("threadTitle").textContent = def.label || def.title;
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: `${def.title} 插件` });
  const conversation = $("conversation");
  if (!conversation) return;
  const record = embeddedPluginRecord(def.id);
  const pluginManifest = embeddedPluginCurrentManifest(def);
  if (embeddedPluginAvailable(pluginManifest) && !embeddedPluginBlockedByPageSecurity(def, pluginManifest)) {
    const entryUrl = embeddedPluginEntryUrlForFrame(def, pluginManifest);
    record.frameOrigin = embeddedPluginEntryOrigin(def, pluginManifest);
    const currentFrame = currentEmbeddedPluginShell(def)?.querySelector(".embedded-plugin-frame");
    const currentFrameUsesEntry = Boolean(currentFrame && currentFrame.getAttribute("src") === entryUrl);
    const currentShellWasRenderedForEntry = Boolean(record.renderedEntryUrl && record.renderedEntryUrl === entryUrl);
    const launchFrameCanBePreserved = !embeddedPluginUsesLaunchToken(pluginManifest)
      || embeddedPluginLaunchTokenFreshForFrame(def)
      || (Number(record.navigationLastAt || 0) > 0 && currentShellWasRenderedForEntry)
      || currentFrameUsesEntry;
    if (!launchFrameCanBePreserved) {
      refreshEmbeddedPluginFrameFromFreshManifest(def);
      return;
    }
    if (attachEmbeddedPluginShell(def, entryUrl)) {
      updateNavigationControls();
      ensureVerticalScrollAffordance();
      return;
    }
    if (embeddedPluginUsesLaunchToken(pluginManifest) && !embeddedPluginLaunchTokenFreshForFrame(def)) {
      discardEmbeddedPluginShell(def);
      showEmbeddedPluginLoadingSurface(def);
      if (!record.loading) loadEmbeddedPluginManifest(def, { force: true }).catch(showError);
      updateNavigationControls();
      ensureVerticalScrollAffordance();
      return;
    }
    discardEmbeddedPluginShell(def);
    conversation.innerHTML = "";
    embeddedPluginHost(def).innerHTML = renderEmbeddedPluginFrame(def, pluginManifest);
    setEmbeddedPluginHostVisible(def, true);
    record.shellNode = embeddedPluginHost(def).querySelector(".embedded-plugin-shell");
    record.renderedEntryUrl = entryUrl;
    record.frameCreatedAt = Date.now();
    bindEmbeddedPluginFrameHealth(def, embeddedPluginHost(def).querySelector(".embedded-plugin-frame"));
    scheduleEmbeddedPluginViewportBroadcast("frame_render", 0);
    if (embeddedPluginUsesLaunchToken(pluginManifest)) record.manifestFreshForFrame = false;
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  if (record.loading && !pluginManifest) {
    showEmbeddedPluginLoadingSurface(def);
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  if (!embeddedPluginManifestMatchesLaunchContext(record, state.selectedWorkspaceId || "owner")) {
    if (record.shellNode) discardEmbeddedPluginShell(def);
    showEmbeddedPluginLoadingSurface(def);
    loadEmbeddedPluginManifest(def).catch(showError);
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  setEmbeddedPluginHostVisible(def, false);
  conversation.innerHTML = renderEmbeddedPluginUnavailable(def, pluginManifest);
  bindEmbeddedPluginControls(def);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function updateCodexPluginNavigationAvailability() {
  const button = $("bottomCodexMode");
  const nav = $("bottomNav");
  const available = codexPluginNavigationAvailable();
  if (button) {
    button.hidden = !available;
    button.setAttribute("aria-hidden", available ? "false" : "true");
  }
  nav?.classList.toggle("codex-visible", available);
  return available;
}

function codexPluginBackActive() {
  return embeddedPluginBackActive(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function codexPluginOuterBackActive() {
  return embeddedPluginOuterBackActive(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function rememberCodexPluginReturnRoute() {
  return rememberEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function setCodexPluginOpenRoute(route = {}) {
  return setEmbeddedPluginOpenRoute(EMBEDDED_PLUGIN_DEFS["codex-mobile"], route);
}

function restoreCodexPluginReturnRoute() {
  return restoreEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function sendCodexPluginBack() {
  return sendEmbeddedPluginBack(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function sendCodexPluginBackOrReturn() {
  if (sendCodexPluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreCodexPluginReturnRoute();
}

function parkCodexPluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function renderCodexPluginView() {
  updateCodexPluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function updateFinancePluginNavigationAvailability() {
  const def = EMBEDDED_PLUGIN_DEFS.finance;
  const button = $(def.bottomButtonId);
  const nav = $("bottomNav");
  const available = embeddedPluginNavigationAvailable(def);
  const keepPluginContextButton = typeof pluginTopicDefForViewMode === "function"
    && typeof pluginTopicBottomButtonId === "function"
    && pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)) === def.bottomButtonId;
  if (button) {
    button.hidden = !keepPluginContextButton;
    button.setAttribute("aria-hidden", keepPluginContextButton ? "false" : "true");
  }
  nav?.classList.remove(def.navVisibleClass);
  if (typeof setBottomPluginMenuItemAvailability === "function") setBottomPluginMenuItemAvailability("finance", available);
  if (typeof updateBottomPluginMenuAvailability === "function") updateBottomPluginMenuAvailability();
  return available;
}

function financePluginBackActive() {
  return embeddedPluginBackActive(EMBEDDED_PLUGIN_DEFS.finance);
}

function financePluginOuterBackActive() {
  return embeddedPluginOuterBackActive(EMBEDDED_PLUGIN_DEFS.finance);
}

function rememberFinancePluginReturnRoute() {
  return rememberEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.finance);
}

function setFinancePluginOpenRoute(route = {}) {
  return setEmbeddedPluginOpenRoute(EMBEDDED_PLUGIN_DEFS.finance, route);
}

function restoreFinancePluginReturnRoute() {
  return restoreEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.finance);
}

function sendFinancePluginBack() {
  return sendEmbeddedPluginBack(EMBEDDED_PLUGIN_DEFS.finance);
}

function sendFinancePluginBackOrReturn() {
  if (sendFinancePluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreFinancePluginReturnRoute();
}

function parkFinancePluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS.finance);
}

function renderFinancePluginView() {
  updateFinancePluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS.finance);
}

function updateEmailPluginNavigationAvailability() {
  const def = EMBEDDED_PLUGIN_DEFS.email;
  const button = $(def.bottomButtonId);
  const nav = $("bottomNav");
  const available = embeddedPluginNavigationAvailable(def);
  const keepPluginContextButton = typeof pluginTopicDefForViewMode === "function"
    && typeof pluginTopicBottomButtonId === "function"
    && pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)) === def.bottomButtonId;
  if (button) {
    button.hidden = !keepPluginContextButton;
    button.setAttribute("aria-hidden", keepPluginContextButton ? "false" : "true");
  }
  nav?.classList.remove(def.navVisibleClass);
  if (typeof setBottomPluginMenuItemAvailability === "function") setBottomPluginMenuItemAvailability("email", available);
  if (typeof updateBottomPluginMenuAvailability === "function") updateBottomPluginMenuAvailability();
  return available;
}

function emailPluginBackActive() {
  return embeddedPluginBackActive(EMBEDDED_PLUGIN_DEFS.email);
}

function emailPluginOuterBackActive() {
  return embeddedPluginOuterBackActive(EMBEDDED_PLUGIN_DEFS.email);
}

function rememberEmailPluginReturnRoute() {
  return rememberEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.email);
}

function setEmailPluginOpenRoute(route = {}) {
  return setEmbeddedPluginOpenRoute(EMBEDDED_PLUGIN_DEFS.email, route);
}

function restoreEmailPluginReturnRoute() {
  return restoreEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.email);
}

function sendEmailPluginBack() {
  return sendEmbeddedPluginBack(EMBEDDED_PLUGIN_DEFS.email);
}

function sendEmailPluginBackOrReturn() {
  if (sendEmailPluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreEmailPluginReturnRoute();
}

function parkEmailPluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS.email);
}

function renderEmailPluginView() {
  updateEmailPluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS.email);
}

function updateHealthPluginNavigationAvailability() {
  const def = EMBEDDED_PLUGIN_DEFS.health;
  const button = $(def.bottomButtonId);
  const nav = $("bottomNav");
  const available = embeddedPluginNavigationAvailable(def);
  const keepPluginContextButton = typeof pluginTopicDefForViewMode === "function"
    && typeof pluginTopicBottomButtonId === "function"
    && pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)) === def.bottomButtonId;
  if (button) {
    button.hidden = !keepPluginContextButton;
    button.setAttribute("aria-hidden", keepPluginContextButton ? "false" : "true");
  }
  nav?.classList.remove(def.navVisibleClass);
  if (typeof setBottomPluginMenuItemAvailability === "function") setBottomPluginMenuItemAvailability("health", available);
  if (typeof updateBottomPluginMenuAvailability === "function") updateBottomPluginMenuAvailability();
  return available;
}

function healthPluginBackActive() {
  return embeddedPluginBackActive(EMBEDDED_PLUGIN_DEFS.health);
}

function healthPluginOuterBackActive() {
  return embeddedPluginOuterBackActive(EMBEDDED_PLUGIN_DEFS.health);
}

function rememberHealthPluginReturnRoute() {
  return rememberEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.health);
}

function setHealthPluginOpenRoute(route = {}) {
  return setEmbeddedPluginOpenRoute(EMBEDDED_PLUGIN_DEFS.health, route);
}

function restoreHealthPluginReturnRoute() {
  return restoreEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.health);
}

function sendHealthPluginBack() {
  return sendEmbeddedPluginBack(EMBEDDED_PLUGIN_DEFS.health);
}

function sendHealthPluginBackOrReturn() {
  if (sendHealthPluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreHealthPluginReturnRoute();
}

function parkHealthPluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS.health);
}

function renderHealthPluginView() {
  updateHealthPluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS.health);
}

function updateNotePluginNavigationAvailability() {
  const def = EMBEDDED_PLUGIN_DEFS.note;
  const button = $(def.bottomButtonId);
  const nav = $("bottomNav");
  const available = embeddedPluginNavigationAvailable(def);
  const keepPluginContextButton = typeof pluginTopicDefForViewMode === "function"
    && typeof pluginTopicBottomButtonId === "function"
    && pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)) === def.bottomButtonId;
  if (button) {
    button.hidden = !keepPluginContextButton;
    button.setAttribute("aria-hidden", keepPluginContextButton ? "false" : "true");
  }
  nav?.classList.remove(def.navVisibleClass);
  if (typeof setBottomPluginMenuItemAvailability === "function") setBottomPluginMenuItemAvailability("note", available);
  if (typeof updateBottomPluginMenuAvailability === "function") updateBottomPluginMenuAvailability();
  return available;
}

function notePluginBackActive() {
  return embeddedPluginBackActive(EMBEDDED_PLUGIN_DEFS.note);
}

function notePluginOuterBackActive() {
  return embeddedPluginOuterBackActive(EMBEDDED_PLUGIN_DEFS.note);
}

function rememberNotePluginReturnRoute() {
  return rememberEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.note);
}

function setNotePluginOpenRoute(route = {}) {
  return setEmbeddedPluginOpenRoute(EMBEDDED_PLUGIN_DEFS.note, route);
}

function restoreNotePluginReturnRoute() {
  return restoreEmbeddedPluginReturnRoute(EMBEDDED_PLUGIN_DEFS.note);
}

function sendNotePluginBack() {
  return sendEmbeddedPluginBack(EMBEDDED_PLUGIN_DEFS.note);
}

function sendNotePluginBackOrReturn() {
  if (sendNotePluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreNotePluginReturnRoute();
}

function parkNotePluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS.note);
}

function renderNotePluginView() {
  updateNotePluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS.note);
}
