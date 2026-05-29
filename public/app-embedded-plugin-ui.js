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
    manifestPath: "/api/hermes-plugins/codex-mobile/manifest",
  }),
});

function embeddedPluginRecord(pluginId) {
  state.embeddedPlugins = state.embeddedPlugins || {};
  if (!state.embeddedPlugins[pluginId]) {
    state.embeddedPlugins[pluginId] = {
      manifest: null,
      manifestFetchedAt: 0,
      manifestFreshForFrame: false,
      frameOrigin: "",
      shellNode: null,
      canGoBack: false,
      navigationRoute: null,
      navigationLastAt: 0,
      bridgeBound: false,
      frameHealthSeq: 0,
      loading: false,
      checked: false,
    };
  }
  return state.embeddedPlugins[pluginId];
}

function embeddedPluginDefByView(viewMode = state.viewMode) {
  return Object.values(EMBEDDED_PLUGIN_DEFS).find((item) => item.viewMode === viewMode) || null;
}

function embeddedPluginCurrentManifest(def) {
  const record = embeddedPluginRecord(def.id);
  const workspaceId = state.selectedWorkspaceId || "owner";
  return record.manifest?.workspaceId === workspaceId ? record.manifest : null;
}

function embeddedPluginAvailable(manifest) {
  return Boolean(manifest?.available && manifest?.entry?.url && manifest?.kind === "embedded_app");
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
  const expected = embeddedPluginEntryOrigin(def);
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

function updateEmbeddedPluginNavigationState(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  record.canGoBack = Boolean(payload.canGoBack);
  record.navigationRoute = payload.route && typeof payload.route === "object" ? payload.route : null;
  record.navigationLastAt = Date.now();
  updateNavigationControls();
}

function updateEmbeddedPluginBackResultState(def, payload = {}) {
  const record = embeddedPluginRecord(def.id);
  record.navigationLastAt = Date.now();
  if (payload.route && typeof payload.route === "object") record.navigationRoute = payload.route;
  if (payload.handled) {
    updateNavigationControls();
    return;
  }
  record.canGoBack = false;
  updateNavigationControls();
}

function captureEmbeddedPluginReturnRoute(def) {
  if (!def || state.viewMode === def.viewMode || embeddedPluginDefByView(state.viewMode)) return null;
  return {
    viewMode: state.viewMode || "single",
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
  parkEmbeddedPluginShell(def);
  state.viewMode = route.viewMode || "single";
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
    if (def.backResultEventType && data.type === def.backResultEventType) {
      updateEmbeddedPluginBackResultState(def, data);
    }
  });
}

function embeddedPluginBackActive(def = embeddedPluginDefByView()) {
  if (!def) return false;
  return state.viewMode === def.viewMode && Boolean(embeddedPluginRecord(def.id).canGoBack);
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
  host.hidden = !visible;
  host.setAttribute("aria-hidden", visible ? "false" : "true");
  host.classList.toggle("active", visible);
  $("app")?.classList.toggle(`${def.viewMode}-plugin-host-active`, visible);
  $("app")?.classList.toggle("embedded-plugin-host-active", visible);
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
  return true;
}

function discardEmbeddedPluginShell(def) {
  const record = embeddedPluginRecord(def.id);
  currentEmbeddedPluginShell(def)?.remove();
  Object.assign(record, {
    shellNode: null,
    canGoBack: false,
    navigationRoute: null,
    navigationLastAt: 0,
    frameHealthSeq: (record.frameHealthSeq || 0) + 1,
  });
}

function embeddedPluginFrameSrcUsesLaunchToken(frame) {
  return /[?&](?:launch|codexPluginLaunch)=/.test(String(frame?.getAttribute?.("src") || ""));
}

function refreshEmbeddedPluginFrameFromFreshManifest(def) {
  const record = embeddedPluginRecord(def.id);
  if (!$("conversation") || record.loading) return;
  discardEmbeddedPluginShell(def);
  showEmbeddedPluginLoadingSurface(def);
  loadEmbeddedPluginManifest(def, { force: true }).catch(showError);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function scheduleEmbeddedPluginLaunchHealthCheck(def, frame, loadedAt = Date.now()) {
  if (!frame || !embeddedPluginFrameSrcUsesLaunchToken(frame)) return;
  const record = embeddedPluginRecord(def.id);
  const seq = (record.frameHealthSeq || 0) + 1;
  record.frameHealthSeq = seq;
  window.setTimeout(() => {
    if (seq !== record.frameHealthSeq) return;
    if (state.viewMode !== def.viewMode) return;
    if (currentEmbeddedPluginShell(def)?.querySelector(".embedded-plugin-frame") !== frame) return;
    if (!embeddedPluginFrameSrcUsesLaunchToken(frame)) return;
    if (Number(record.navigationLastAt || 0) >= loadedAt) return;
    refreshEmbeddedPluginFrameFromFreshManifest(def);
  }, 7000);
}

function bindEmbeddedPluginFrameHealth(def, frame) {
  if (!frame || frame.dataset.embeddedPluginHealthBound) return;
  frame.dataset.embeddedPluginHealthBound = "1";
  frame.addEventListener("load", () => {
    scheduleEmbeddedPluginLaunchHealthCheck(def, frame, Date.now());
  });
  scheduleEmbeddedPluginLaunchHealthCheck(def, frame, Date.now());
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
    if (record.returnRoute) {
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
    ? `${def.title} 插件入口还没有允许当前 Hermes 域名嵌入。需要在插件服务里放行这个 origin。`
    : `当前 Hermes 是 HTTPS 页面，不能嵌入 HTTP ${def.title} 入口。需要配置 HTTPS 插件 manifest / entry。`;
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
    <div class="embedded-plugin-shell" data-plugin-id="${escapeHtml(def.id)}">
      <iframe
        class="embedded-plugin-frame"
        title="${escapeHtml(manifest.title || def.title)}"
        src="${escapeHtml(manifest.entry.url)}"
        loading="eager"
        referrerpolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
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
  if (!options.force && record.loading) return;
  if (!options.force && record.checked && record.manifest?.workspaceId === workspaceId) return;
  record.loading = true;
  try {
    const params = new URLSearchParams({ workspaceId, appOrigin: window.location.origin });
    const manifest = await api(`${def.manifestPath}?${params.toString()}`);
    record.manifest = Object.assign({ workspaceId }, manifest);
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
    const launchFrameCanBePreserved = !embeddedPluginUsesLaunchToken(pluginManifest)
      || embeddedPluginLaunchTokenFreshForFrame(def)
      || Number(record.navigationLastAt || 0) > 0;
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
    bindEmbeddedPluginFrameHealth(def, embeddedPluginHost(def).querySelector(".embedded-plugin-frame"));
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
  if (!record.checked || record.manifest?.workspaceId !== (state.selectedWorkspaceId || "owner")) {
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
  const available = Boolean(state.auth?.isOwner);
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
  return restoreCodexPluginReturnRoute();
}

function parkCodexPluginShell() {
  return parkEmbeddedPluginShell(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}

function renderCodexPluginView() {
  updateCodexPluginNavigationAvailability();
  renderEmbeddedPluginView(EMBEDDED_PLUGIN_DEFS["codex-mobile"]);
}
