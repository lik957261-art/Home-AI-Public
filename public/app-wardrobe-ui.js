"use strict";

const WARDROBE_ROUTE_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d)/i;
const WARDROBE_DIRECTORY_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\u8863\u6a71)/i;

function wardrobeRouteText(item = {}) {
  return [
    item.id,
    item.projectId,
    item.subprojectId,
    item.label,
    item.name,
    item.root,
    item.path,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function itemLooksWardrobe(item = {}) {
  return WARDROBE_ROUTE_PATTERN.test(wardrobeRouteText(item));
}

function itemLooksWardrobeDirectory(item = {}) {
  return WARDROBE_DIRECTORY_PATTERN.test(wardrobeRouteText(item));
}

function wardrobeChildRouteText(child = {}) {
  const rootTail = String(child.root || child.path || "").trim().replaceAll("\\", "/").replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  return [
    child.id,
    child.projectId,
    child.subprojectId,
    child.label,
    child.name,
    rootTail,
    ...(Array.isArray(child.aliases) ? child.aliases : []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function selectedWorkspaceToolsets() {
  const workspace = (state.workspaces || []).find((item) => item.id === state.selectedWorkspaceId) || null;
  const values = [
    ...(Array.isArray(workspace?.localConfig?.allowedToolsets) ? workspace.localConfig.allowedToolsets : []),
    ...(Array.isArray(workspace?.bindings?.allowedToolsets) ? workspace.bindings.allowedToolsets : []),
  ];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function workspaceAllowsWardrobeToolset() {
  return selectedWorkspaceToolsets().includes("wardrobe");
}

function wardrobePluginListedForCurrentWorkspace() {
  if (typeof embeddedPluginListedForWorkspace !== "function") return false;
  return embeddedPluginListedForWorkspace("wardrobe");
}

function refreshWardrobePluginListWhenStale() {
  if (typeof embeddedPluginListState !== "function" || typeof refreshEmbeddedPluginList !== "function") return;
  const record = embeddedPluginListState();
  const workspaceId = state.selectedWorkspaceId || "owner";
  const retryReady = record.workspaceId !== workspaceId || Date.now() - Number(record.lastAttemptAt || 0) > 15000;
  if (!record.loading && retryReady) refreshEmbeddedPluginList().catch(() => {});
}

function wardrobePluginNavigationAvailable() {
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (state.auth?.isOwner && workspaceId === "owner") return true;
  if (wardrobePluginListedForCurrentWorkspace()) return true;
  refreshWardrobePluginListWhenStale();
  return false;
}

function wardrobeDirectoryCandidates() {
  const candidates = [];
  (state.projects || []).forEach((project) => {
    if (!project?.root) return;
    if (itemLooksWardrobeDirectory(project)) {
      candidates.push({ project, child: null, score: 4 });
    }
    (project.children || []).forEach((child) => {
      if (!child?.root) return;
      const text = wardrobeChildRouteText(child);
      if (!WARDROBE_DIRECTORY_PATTERN.test(text)) return;
      candidates.push({ project, child, score: 4 });
    });
  });
  return candidates.sort((a, b) => b.score - a.score);
}

function wardrobeDirectoryAttachment() {
  const candidate = wardrobeDirectoryCandidates()[0] || null;
  if (!candidate) return null;
  const label = candidate.child
    ? `${projectDisplayLabel(candidate.project)} / ${candidate.child.label || candidate.child.id}`
    : projectDisplayLabel(candidate.project);
  if (typeof directoryAttachmentFromRoute === "function") {
    return directoryAttachmentFromRoute(
      candidate.project.id,
      candidate.child?.id || "",
      candidate.child?.root || candidate.project.root,
      label,
    );
  }
  return {
    projectId: candidate.project.id,
    subprojectId: candidate.child?.id || "",
    label,
    root: candidate.child?.root || candidate.project.root,
    path: candidate.child?.root || candidate.project.root,
  };
}

function wardrobeEntryAvailable() {
  if (wardrobePluginNavigationAvailable()) return true;
  if ((state.selectedWorkspaceId || "owner") !== "owner") return false;
  return Boolean(wardrobeDirectoryAttachment() || workspaceAllowsWardrobeToolset());
}

function updateWardrobeNavigationAvailability() {
  const available = wardrobeEntryAvailable();
  state.wardrobeAvailable = available;
  const button = $("bottomWardrobeMode");
  const nav = $("bottomNav");
  const keepPluginContextButton = typeof pluginTopicDefForViewMode === "function"
    && typeof pluginTopicBottomButtonId === "function"
    && pluginTopicBottomButtonId(pluginTopicDefForViewMode(state.viewMode)) === "bottomWardrobeMode";
  const keepPinnedBottomButton = typeof pluginBottomTabPinned === "function"
    && pluginBottomTabPinned("wardrobe");
  const keepBottomButton = keepPluginContextButton || keepPinnedBottomButton;
  if (button) {
    button.hidden = !keepBottomButton;
    button.setAttribute("aria-hidden", keepBottomButton ? "false" : "true");
  }
  nav?.classList.remove("wardrobe-visible");
  if (typeof setBottomPluginMenuItemAvailability === "function") setBottomPluginMenuItemAvailability("wardrobe", available);
  if (typeof updateBottomPluginMenuAvailability === "function") updateBottomPluginMenuAvailability();
  $("app")?.classList.toggle("wardrobe-capable", available);
  return available;
}

function currentWardrobePluginManifest() {
  const workspaceId = state.selectedWorkspaceId || "owner";
  const manifest = state.wardrobePluginManifest || null;
  return wardrobePluginManifestMatchesLaunchContext(manifest, workspaceId) ? manifest : null;
}

function wardrobePluginProxyEntryWorkspaceMatches(entryUrl = "", workspaceId = "") {
  const targetWorkspaceId = String(workspaceId || "owner").trim() || "owner";
  try {
    const parsed = new URL(String(entryUrl || ""), window.location?.href || undefined);
    if (!parsed.pathname.startsWith("/api/hermes-plugins/wardrobe/proxy")) return true;
    const entryWorkspaceId = parsed.searchParams.get("workspaceId") || parsed.searchParams.get("workspace_id") || "";
    return entryWorkspaceId === targetWorkspaceId;
  } catch (_) {
    return false;
  }
}

function wardrobePluginManifestMatchesLaunchContext(manifest = state.wardrobePluginManifest || null, workspaceId = state.selectedWorkspaceId || "owner") {
  return Boolean(
    manifest
    && manifest.workspaceId === workspaceId
    && wardrobePluginProxyEntryWorkspaceMatches(manifest?.entry?.url, workspaceId)
  );
}

function wardrobePluginAvailable(manifest = currentWardrobePluginManifest()) {
  return Boolean(manifest?.available && manifest?.entry?.url && manifest?.kind === "embedded_app");
}

function wardrobePluginUsesLaunchToken(manifest = currentWardrobePluginManifest()) {
  const entryUrl = String(manifest?.entry?.url || "");
  return manifest?.embed?.tokenStatus === "launch_token_issued" || /[?&]launch=/.test(entryUrl);
}

function wardrobeLaunchTokenIsFreshForFrame() {
  if (!state.wardrobePluginManifestFreshForFrame) return false;
  const fetchedAt = Number(state.wardrobePluginManifestFetchedAt || 0);
  return fetchedAt > 0 && Date.now() - fetchedAt < 60000;
}

function wardrobePluginBlockedByPageSecurity(manifest = currentWardrobePluginManifest()) {
  if (manifest?.embed?.blockedByFrameAncestors) return true;
  if (!wardrobePluginAvailable(manifest)) return false;
  try {
    const pageProtocol = window.location?.protocol || "";
    const entryProtocol = new URL(manifest.entry.url, window.location?.href || undefined).protocol;
    return pageProtocol === "https:" && entryProtocol === "http:";
  } catch (_) {
    return true;
  }
}

function wardrobePluginEntryOrigin(manifest = currentWardrobePluginManifest()) {
  const value = String(manifest?.entry?.origin || manifest?.entry?.url || "").trim();
  if (!value) return "";
  try {
    return new URL(value, window.location?.href || undefined).origin;
  } catch (_) {
    return "";
  }
}

function normalizeWardrobePluginOpenRoute(route = {}) {
  const value = route && typeof route === "object" ? route : {};
  const out = {};
  ["pluginActionId", "pluginRoute", "pluginItemId", "pluginThreadId", "pluginTaskId", "sourceTurnId"].forEach((key) => {
    const text = String(value[key] || "").trim().slice(0, 180);
    if (text) out[key] = text;
  });
  return out;
}

function setWardrobePluginOpenRoute(route = {}) {
  const normalized = normalizeWardrobePluginOpenRoute(route);
  state.wardrobePluginOpenRoute = Object.keys(normalized).length ? normalized : null;
  if (state.wardrobePluginOpenRoute) state.wardrobePluginCanGoBack = true;
  return Boolean(state.wardrobePluginOpenRoute);
}

function wardrobePluginEntryUrlForFrame(entryUrl = "") {
  const route = state.wardrobePluginOpenRoute;
  if (!entryUrl || !route) return entryUrl;
  try {
    const parsed = new URL(entryUrl, window.location?.href || undefined);
    Object.entries(route).forEach(([key, value]) => parsed.searchParams.set(key, value));
    parsed.searchParams.set("pluginId", "wardrobe");
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) {
    return entryUrl;
  }
}

function wardrobePluginMessageOriginAllowed(event) {
  const expected = wardrobePluginEntryOrigin();
  return Boolean(expected && event?.origin === expected);
}

function updateWardrobePluginNavigationState(payload = {}) {
  state.wardrobePluginCanGoBack = Boolean(payload.canGoBack);
  state.wardrobePluginNavigationRoute = payload.route && typeof payload.route === "object" ? payload.route : null;
  state.wardrobePluginNavigationLastAt = Date.now();
  updateNavigationControls();
}

function handleWardrobePluginMessage(event) {
  const data = event?.data || {};
  if (!data) return;
  if (!wardrobePluginMessageOriginAllowed(event)) return;
  if (data.type === "wardrobe.plugin.navigation") {
    updateWardrobePluginNavigationState(data);
    return;
  }
  if (data.type === "wardrobe.plugin.refresh_required") {
    refreshWardrobePluginFrameFromFreshManifest();
  }
}

function ensureWardrobePluginNavigationBridge() {
  if (state.wardrobePluginBridgeBound) return;
  state.wardrobePluginBridgeBound = true;
  window.addEventListener("message", handleWardrobePluginMessage);
}

function wardrobePluginBackActive() {
  return state.viewMode === "wardrobe" && Boolean(state.wardrobePluginCanGoBack);
}

function rememberWardrobePluginReturnRoute() {
  if (typeof captureEmbeddedPluginReturnRoute !== "function") return false;
  const route = captureEmbeddedPluginReturnRoute({ id: "wardrobe", viewMode: "wardrobe" });
  if (!route) return false;
  state.wardrobePluginReturnRoute = route;
  return true;
}

function wardrobePluginOuterBackActive() {
  return state.viewMode === "wardrobe" && Boolean(state.wardrobePluginReturnRoute);
}

function restoreWardrobePluginReturnRoute() {
  const route = state.wardrobePluginReturnRoute;
  if (!route) return false;
  state.wardrobePluginReturnRoute = null;
  state.wardrobePluginCanGoBack = false;
  parkWardrobePluginShell();
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
  state.selectedAutomationId = route.selectedAutomationId || "";
  state.selectedActionInboxItemId = route.selectedActionInboxItemId || "";
  state.selectedLearningTaskCardId = route.selectedLearningTaskCardId || "";
  state.learningGrowthSettingsOpen = Boolean(route.learningGrowthSettingsOpen);
  state.directoryPath = route.directoryPath || "";
  state.directoryRootPath = route.directoryRootPath || "";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebSingleWindowMode", state.singleWindowMode || "chat");
  localStorage.setItem("hermesWebProject", state.selectedProjectId || "");
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId || "");
  applyViewMode();
  loadSelectedView().catch(showError);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
  return true;
}

function wardrobePluginHost() {
  let host = $("wardrobePluginHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "wardrobePluginHost";
  host.className = "wardrobe-plugin-host";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  const main = document.querySelector(".main");
  const conversation = $("conversation");
  if (main && conversation?.parentNode === main) main.insertBefore(host, conversation);
  else document.body.appendChild(host);
  return host;
}

function setWardrobePluginHostVisible(visible) {
  const host = wardrobePluginHost();
  if (typeof clearKeyboardViewportMetrics === "function" && visible) clearKeyboardViewportMetrics();
  host.hidden = !visible;
  host.setAttribute("aria-hidden", visible ? "false" : "true");
  host.classList.toggle("active", visible);
  $("app")?.classList.toggle("wardrobe-plugin-host-active", visible);
}

function currentWardrobePluginShell() {
  return state.wardrobePluginShellNode || wardrobePluginHost().querySelector(".wardrobe-plugin-shell");
}

function parkWardrobePluginShell() {
  const shell = currentWardrobePluginShell();
  if (!shell) return false;
  setWardrobePluginHostVisible(false);
  state.wardrobePluginShellNode = shell;
  return true;
}

function attachWardrobePluginShell(entryUrl) {
  const shell = currentWardrobePluginShell();
  if (!shell) return false;
  const frame = shell.querySelector(".wardrobe-plugin-frame");
  if (!frame || frame.getAttribute("src") !== entryUrl) return false;
  if (shell.parentNode !== wardrobePluginHost()) wardrobePluginHost().appendChild(shell);
  setWardrobePluginHostVisible(true);
  state.wardrobePluginShellNode = shell;
  bindWardrobePluginFrameHealth(frame);
  return true;
}

function discardWardrobePluginShell() {
  const shell = currentWardrobePluginShell();
  shell?.remove();
  state.wardrobePluginShellNode = null;
  state.wardrobePluginCanGoBack = false;
  state.wardrobePluginNavigationRoute = null;
  state.wardrobePluginNavigationLastAt = 0;
  state.wardrobePluginFrameHealthSeq = (state.wardrobePluginFrameHealthSeq || 0) + 1;
}

function wardrobeFrameSrcUsesLaunchToken(frame) {
  return /[?&]launch=/.test(String(frame?.getAttribute?.("src") || ""));
}

function refreshWardrobePluginFrameFromFreshManifest() {
  const conversation = $("conversation");
  if (!conversation || state.wardrobePluginLoading) return;
  const now = Date.now();
  const cooldownMs = Number(state.wardrobePluginRefreshCooldownMs || 60000);
  if (cooldownMs > 0 && now - Number(state.wardrobePluginLastRefreshRequestedAt || 0) < cooldownMs) {
    state.wardrobePluginLastRefreshSuppressedAt = now;
    return;
  }
  state.wardrobePluginLastRefreshRequestedAt = now;
  discardWardrobePluginShell();
  showWardrobePluginLoadingSurface();
  loadWardrobePluginManifest({ force: true }).catch(showError);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function scheduleWardrobePluginLaunchHealthCheck(frame, loadedAt = Date.now()) {
  if (!frame || !wardrobeFrameSrcUsesLaunchToken(frame)) return;
  const seq = (state.wardrobePluginFrameHealthSeq || 0) + 1;
  state.wardrobePluginFrameHealthSeq = seq;
  window.setTimeout(() => {
    if (seq !== state.wardrobePluginFrameHealthSeq) return;
    if (state.viewMode !== "wardrobe") return;
    if (currentWardrobePluginShell()?.querySelector(".wardrobe-plugin-frame") !== frame) return;
    if (!wardrobeFrameSrcUsesLaunchToken(frame)) return;
    if (Number(state.wardrobePluginNavigationLastAt || 0) >= loadedAt) return;
    refreshWardrobePluginFrameFromFreshManifest();
  }, 7000);
}

function bindWardrobePluginFrameHealth(frame) {
  if (!frame || frame.dataset.wardrobePluginHealthBound) return;
  frame.dataset.wardrobePluginHealthBound = "1";
  frame.addEventListener("load", () => {
    frame.closest(".wardrobe-plugin-shell")?.classList.remove("is-loading");
    scheduleWardrobePluginLaunchHealthCheck(frame, Date.now());
  });
  scheduleWardrobePluginLaunchHealthCheck(frame, Date.now());
}

function sendWardrobePluginBack() {
  const frame = currentWardrobePluginShell()?.querySelector(".wardrobe-plugin-frame");
  const origin = state.wardrobePluginFrameOrigin || wardrobePluginEntryOrigin();
  if (!frame?.contentWindow || !origin) return false;
  const requestedAt = Date.now();
  const seq = (state.wardrobePluginBackRequestSeq || 0) + 1;
  state.wardrobePluginBackRequestSeq = seq;
  frame.contentWindow.postMessage({ type: "hermes.plugin.back", version: 1 }, origin);
  window.setTimeout(() => {
    if (state.viewMode !== "wardrobe") return;
    if (state.wardrobePluginBackRequestSeq !== seq) return;
    if (Number(state.wardrobePluginNavigationLastAt || 0) > requestedAt) return;
    state.wardrobePluginCanGoBack = false;
    const pluginContextBack = typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive();
    if (state.wardrobePluginReturnRoute && !pluginContextBack) {
      restoreWardrobePluginReturnRoute();
      return;
    }
    updateNavigationControls();
  }, 1600);
  return true;
}

function sendWardrobePluginBackOrReturn() {
  if (sendWardrobePluginBack()) return true;
  if (typeof pluginContextBackNavigationActive === "function" && pluginContextBackNavigationActive()) return false;
  return restoreWardrobePluginReturnRoute();
}

function renderWardrobePluginSecurityNotice(manifest) {
  const entryOrigin = manifest?.entry?.origin || manifest?.entry?.url || "";
  const reason = manifest?.embed?.blockedByFrameAncestors
    ? "\u8863\u6a71\u63d2\u4ef6\u5165\u53e3\u8fd8\u6ca1\u6709\u5141\u8bb8\u5f53\u524d Home AI \u57df\u540d\u5d4c\u5165\u3002\u9700\u8981\u5728\u8863\u6a71\u63d2\u4ef6\u670d\u52a1\u91cc\u653e\u884c\u8fd9\u4e2a origin\u3002"
    : "\u5f53\u524d Home AI \u662f HTTPS \u9875\u9762\uff0c\u4e0d\u80fd\u5d4c\u5165 HTTP \u8863\u6a71\u5165\u53e3\u3002\u9700\u8981\u914d\u7f6e HTTPS \u63d2\u4ef6 manifest / entry\u3002";
  return `
    <div class="wardrobe-plugin-notice">
      <strong>\u63d2\u4ef6\u5165\u53e3\u672a\u5d4c\u5165</strong>
      <span>${escapeHtml(reason)}</span>
      ${entryOrigin ? `<small>${escapeHtml(entryOrigin)}</small>` : ""}
    </div>`;
}

function renderWardrobePluginUnavailable(manifest = currentWardrobePluginManifest()) {
  const code = manifest?.code || "wardrobe_plugin_unavailable";
  const warning = manifest?.warning || "\u5f53\u524d\u8863\u6a71\u63d2\u4ef6 manifest \u4e0d\u53ef\u7528\u3002";
  const securityNotice = wardrobePluginBlockedByPageSecurity(manifest) ? renderWardrobePluginSecurityNotice(manifest) : "";
  return `
    <section class="wardrobe-view">
      ${securityNotice}
      <div class="wardrobe-plugin-notice secondary">
        <strong>${escapeHtml(code)}</strong>
        <span>${escapeHtml(warning)}</span>
        <button class="small-button" type="button" data-wardrobe-plugin-refresh>\u91cd\u8bd5</button>
      </div>
    </section>`;
}

function renderWardrobePluginFrame(manifest, entryUrl = String(manifest?.entry?.url || "")) {
  return `
    <div class="wardrobe-plugin-shell is-loading">
      <iframe
        class="wardrobe-plugin-frame"
        title="${escapeHtml(manifest.title || "\u8863\u6a71")}"
        src="${escapeHtml(entryUrl)}"
        loading="eager"
        referrerpolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals"
      ></iframe>
    </div>`;
}

function renderWardrobePluginLoading() {
  return "";
}

function showWardrobePluginLoadingSurface() {
  const conversation = $("conversation");
  if (conversation) conversation.innerHTML = "";
  if (!currentWardrobePluginShell()) wardrobePluginHost().innerHTML = "";
  setWardrobePluginHostVisible(true);
}

async function loadWardrobePluginManifest(options = {}) {
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (!options.force && state.wardrobePluginLoading) return;
  if (!options.force && state.wardrobePluginChecked && wardrobePluginManifestMatchesLaunchContext(state.wardrobePluginManifest, workspaceId)) return;
  state.wardrobePluginLoading = true;
  try {
    const params = new URLSearchParams({ workspaceId, appOrigin: window.location.origin });
    const manifest = await api(`/api/hermes-plugins/wardrobe/manifest?${params.toString()}`);
    state.wardrobePluginManifest = Object.assign({ workspaceId }, manifest);
    state.wardrobePluginManifestFetchedAt = Date.now();
    state.wardrobePluginManifestFreshForFrame = wardrobePluginUsesLaunchToken(state.wardrobePluginManifest);
  } catch (err) {
    state.wardrobePluginManifest = {
      ok: false,
      available: false,
      workspaceId,
      code: "wardrobe_plugin_manifest_failed",
      warning: err?.message || String(err),
    };
    state.wardrobePluginManifestFetchedAt = 0;
    state.wardrobePluginManifestFreshForFrame = false;
  } finally {
    state.wardrobePluginChecked = true;
    state.wardrobePluginLoading = false;
    if (state.viewMode === "wardrobe") renderWardrobeView();
  }
}

function bindWardrobePluginControls() {
  $("conversation")?.querySelector("[data-wardrobe-plugin-refresh]")?.addEventListener("click", () => {
    loadWardrobePluginManifest({ force: true }).catch(showError);
  });
}

function renderWardrobeView() {
  ensureWardrobePluginNavigationBridge();
  updateWardrobeNavigationAvailability();
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = `<div class="empty-state small">\u8863\u6a71\u63d2\u4ef6</div>`;
  $("threadTitle").textContent = "\u6211\u7684\u8863\u6a71";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "\u8863\u6a71\u63d2\u4ef6" });
  const conversation = $("conversation");
  if (!conversation) return;
  const pluginManifest = currentWardrobePluginManifest();
  if (wardrobePluginAvailable(pluginManifest)) {
    if (!wardrobePluginBlockedByPageSecurity(pluginManifest)) {
      const entryUrl = wardrobePluginEntryUrlForFrame(String(pluginManifest.entry?.url || ""));
      const entryOrigin = wardrobePluginEntryOrigin(pluginManifest);
      state.wardrobePluginFrameOrigin = entryOrigin;
      const currentFrame = currentWardrobePluginShell()?.querySelector(".wardrobe-plugin-frame");
      const currentFrameUsesEntry = Boolean(currentFrame && currentFrame.getAttribute("src") === entryUrl);
      const launchFrameCanBePreserved = !wardrobePluginUsesLaunchToken(pluginManifest)
        || wardrobeLaunchTokenIsFreshForFrame()
        || Number(state.wardrobePluginNavigationLastAt || 0) > 0
        || currentFrameUsesEntry;
      if (!launchFrameCanBePreserved) {
        refreshWardrobePluginFrameFromFreshManifest();
        return;
      }
      if (attachWardrobePluginShell(entryUrl)) {
        updateNavigationControls();
        ensureVerticalScrollAffordance();
        return;
      }
      if (wardrobePluginUsesLaunchToken(pluginManifest) && !wardrobeLaunchTokenIsFreshForFrame()) {
        discardWardrobePluginShell();
        showWardrobePluginLoadingSurface();
        if (!state.wardrobePluginLoading) loadWardrobePluginManifest({ force: true }).catch(showError);
        updateNavigationControls();
        ensureVerticalScrollAffordance();
        return;
      }
      discardWardrobePluginShell();
      conversation.innerHTML = "";
      wardrobePluginHost().innerHTML = renderWardrobePluginFrame(pluginManifest, entryUrl);
      setWardrobePluginHostVisible(true);
      state.wardrobePluginFrameUrl = entryUrl;
      state.wardrobePluginShellNode = wardrobePluginHost().querySelector(".wardrobe-plugin-shell");
      bindWardrobePluginFrameHealth(wardrobePluginHost().querySelector(".wardrobe-plugin-frame"));
      if (wardrobePluginUsesLaunchToken(pluginManifest)) state.wardrobePluginManifestFreshForFrame = false;
      updateNavigationControls();
      ensureVerticalScrollAffordance();
      return;
    }
  }
  if (state.wardrobePluginLoading && !pluginManifest) {
    showWardrobePluginLoadingSurface();
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  if (!state.wardrobePluginChecked || !wardrobePluginManifestMatchesLaunchContext()) {
    if (state.wardrobePluginShellNode) discardWardrobePluginShell();
    showWardrobePluginLoadingSurface();
    loadWardrobePluginManifest().catch(showError);
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  setWardrobePluginHostVisible(false);
  conversation.innerHTML = renderWardrobePluginUnavailable(pluginManifest);
  bindWardrobePluginControls();
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}
