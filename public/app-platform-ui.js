"use strict";

const hermesApiClient = AppApiClient.createApiClient({
  getAccessKey: () => state.key,
  getClientVersion: () => state.clientVersion,
  onClientVersion: (payload, source) => handleClientVersion(payload, source),
  onUnauthorized: () => {
    clearStoredAccessKey();
    showLogin("Access Key 已失效，请重新输入。");
  },
});

async function api(path, options = {}) {
  return hermesApiClient(path, options);
}
function clearStoredAccessKey() {
  state.key = "";
  localStorage.removeItem("hermesWebKey");
  document.cookie = "hermes_web_key=; Path=/; Max-Age=0; SameSite=Lax";
}

function storeAccessKey(key) {
  const value = String(key || "").trim();
  if (!value) return;
  state.key = value;
  localStorage.setItem("hermesWebKey", value);
  document.cookie = `hermes_web_key=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function logoutCurrentAccount() {
  if (!window.confirm("\u9000\u51fa\u5f53\u524d\u8d26\u53f7\uff1f\u672c\u673a\u5c06\u6e05\u9664\u5df2\u4fdd\u5b58\u7684 Access Key\uff0c\u4e0d\u4f1a\u64a4\u9500\u670d\u52a1\u5668\u4e0a\u7684 key\u3002")) return;
  closeTopMoreMenu?.();
  closeSidebar?.();
  state.settingsOpen = false;
  state.auth = null; state.workspaces = [];
  clearStoredAccessKey();
  showLogin("\u5df2\u9000\u51fa\u8d26\u53f7\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165 Access Key\u3002");
}

function handleClientVersionFromResponse(response) {
  return AppApiClient.handleClientVersionFromResponse(response, {
    getClientVersion: () => state.clientVersion,
    onClientVersion: (payload, source) => handleClientVersion(payload, source),
    source: "response",
  });
}

function setBootSplashText(message = "正在载入工作区") {
  const text = $("bootSplashText");
  if (text) text.textContent = message;
}

function showBootSplash(message = "正在载入工作区") {
  setBootSplashText(message);
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("bootSplash")?.classList.remove("hidden");
}

function hideBootSplash() {
  $("bootSplash")?.classList.add("hidden");
}
async function hasCookieSession() {
  const res = await fetch("/api/status", { cache: "no-store" });
  return res.status !== 401;
}

function showLogin(message = "") {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginError").textContent = message;
}

function showApp() {
  hideBootSplash();
  $("setup")?.classList.add("hidden");
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  updateMobileBottomNavReservation();
  restoreVisibleAppScroll();
}

function showSetup(message = "") {
  hideBootSplash();
  $("app")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("setup")?.classList.remove("hidden");
  state.setupError = message || "";
  renderSetup();
}

function renderSetup() {
  const error = $("setupError");
  if (error) error.textContent = state.setupError || "";
  const result = $("setupResult");
  const key = $("setupKey");
  if (result) result.hidden = !state.setupOwnerKey; if (key) key.textContent = state.setupOwnerKey || "";
  const submit = $("setupSubmit");
  if (submit) submit.hidden = Boolean(state.setupOwnerKey);
}

async function createOwnerSetup() {
  state.setupError = "";
  renderSetup();
  const result = await fetch("/api/setup/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then(async (res) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Owner setup failed");
    return payload;
  });
  state.setupOwnerKey = result.key || "";
  storeAccessKey(state.setupOwnerKey);
  renderSetup();
}

async function enterAfterSetup() {
  if (!state.setupOwnerKey) return;
  showBootSplash("正在打开 Hermes Mobile");
  await bootstrap();
  showApp();
}

async function login(key) {
  await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Access key is not valid");
  });
  storeAccessKey(key);
  showBootSplash("正在打开 Hermes Mobile");
  try {
    await bootstrap();
    showApp();
  } catch (err) {
    showLogin(err.message || String(err));
  }
}

async function bootstrap() {
  renderClientVersion();
  await loadStatus();
  await checkClientVersion("bootstrap").catch(() => {});
  checkAppUpdate("login").catch(() => {});
  await loadPushStatus().catch(() => updatePushButton());
  await loadWorkspaces();
  if (!applyInitialRouteFromUrl()) applyDefaultLaunchView();
  await syncPushSubscriptionContext().catch(() => {});
  await loadProjects();
  await loadSelectedView();
  startClientRefreshChecks();
  connectEvents();
}

function normalizedRouteView(value, fallback = "") {
  const view = String(value || "").trim().toLowerCase();
  if (view === "inbox" || view === "action-inbox" || view === "actions") return "inbox";
  if (view === "automation" || view === "automations" || view === "cron") return "automation";
  if (view === "learning" || view === "coins" || view === "rewards" || view === "redeem") return "learning";
  if (view === "todo" || view === "todos") return "todos";
  if (view === "directory" || view === "directories" || view === "projects") return "projects";
  if (view === "task" || view === "tasks") return "tasks";
  if (view === "single" || view === "stream") return "single";
  return fallback;
}

function sameOriginRouteUrl(value) {
  try {
    const parsed = new URL(value || "/", window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch (_) {
    return null;
  }
}

function routeParamsHaveHermesOwnedDetailTarget(params) {
  if (!params) return false;
  const targetKeys = [
    "automationId",
    "inboxItemId",
    "actionInboxItemId",
    "sourceInboxItemId",
    "todoId",
    "taskCardId",
    "taskGroupId",
    "taskId",
    "messageId",
    "projectId",
    "subprojectId",
    "directoryPath",
    "directoryRoot",
  ];
  return targetKeys.some((key) => String(params.get(key) || "").trim());
}

function replaceBlockedBrowserShellRoute() {
  try {
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", "/?source=pwa");
  } catch (_) {}
}

function requireHermesAppWindowForRoute(params) {
  if (!routeParamsHaveHermesOwnedDetailTarget(params)) return true;
  if (typeof requireHermesAppWindowForNavigation === "function") {
    const allowed = requireHermesAppWindowForNavigation();
    if (!allowed) replaceBlockedBrowserShellRoute();
    return allowed;
  }
  return true;
}

function applyRouteParams(params) {
  const automationId = String(params.get("automationId") || "").trim(); const inboxItemId = String(params.get("inboxItemId") || params.get("actionInboxItemId") || "").trim();
  const automationReturnTo = String(params.get("returnTo") || params.get("return_route") || "").trim().toLowerCase();
  const automationReturnScope = String(params.get("returnScope") || params.get("return_scope") || "").trim().toLowerCase();
  const automationReturnInboxItemId = String(params.get("sourceInboxItemId") || params.get("source_inbox_item_id") || "").trim();
  const todoId = String(params.get("todoId") || "").trim(); const taskCardId = String(params.get("taskCardId") || "").trim();
  const taskGroupId = String(params.get("taskGroupId") || params.get("taskId") || "").trim();
  const messageId = String(params.get("messageId") || "").trim();
  const projectId = String(params.get("projectId") || "").trim();
  const subprojectId = String(params.get("subprojectId") || "").trim();
  const directoryPath = String(params.get("directoryPath") || "").trim();
  const directoryRoot = String(params.get("directoryRoot") || "").trim();
  const readingQuizRequested = ["1", "true", "yes"].includes(String(params.get("readingQuiz") || params.get("reading_quiz") || "").trim().toLowerCase());
  const assessmentExamRequested = ["1", "true", "yes"].includes(String(params.get("assessmentExam") || params.get("assessment_exam") || "").trim().toLowerCase());
  const weixinChatRequested = ["1", "true", "yes"].includes(String(params.get("weixinChat") || params.get("weixin_chat") || "").trim().toLowerCase());
  const groupChatRequested = ["1", "true", "yes"].includes(String(params.get("groupChat") || params.get("group_chat") || "").trim().toLowerCase());
  let routeView = normalizedRouteView(params.get("view") || params.get("viewMode"), inboxItemId ? "inbox" : automationId ? "automation" : taskCardId ? "learning" : todoId ? "todos" : taskGroupId ? "tasks" : (groupChatRequested || weixinChatRequested) ? "single" : "");
  const workspaceId = String(params.get("workspaceId") || "").trim();
  if (workspaceId && routeView === "learning" && taskCardId) {
    setLearningGrowthLearnerWorkspaceId(workspaceId);
  } else if (workspaceId && state.workspaces.some((item) => item.id === workspaceId)) {
    state.selectedWorkspaceId = workspaceId;
    localStorage.setItem("hermesWebWorkspace", workspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = workspaceId;
  }
  if (routeView) {
    state.viewMode = routeView;
    localStorage.setItem("hermesWebViewMode", routeView);
    Object.assign(state, { currentTaskGroupId: "", currentThread: null, currentThreadId: "" });
  }
  if (routeView === "automation" && automationId) {
    const returnRoute = automationReturnTo === "inbox" ? "inbox" : "";
    Object.assign(state, { selectedAutomationId: automationId, automationReturnRoute: returnRoute, automationReturnScope: returnRoute && automationReturnScope === "detail" ? "detail" : "", automationReturnInboxItemId: returnRoute ? automationReturnInboxItemId : "", automationRouteTargetId: automationId, automationRouteTargetPending: true, automationOutputHistoryOpen: false, automationCreateOpen: false, automationEditOpen: false, automationEditJobId: "" });
    if ($("threadSearch")) $("threadSearch").value = "";
  }
  if (routeView === "inbox" && inboxItemId) { Object.assign(state, { selectedActionInboxItemId: inboxItemId, actionInboxDetail: null }); if ($("threadSearch")) $("threadSearch").value = ""; }
  if (routeView === "todos" && todoId) {
    state.selectedTodoId = todoId;
    state.todoRouteMissingTargetId = "";
    state.pendingReadingQuizTodoId = readingQuizRequested ? todoId : "";
    state.pendingAssessmentExamTodoId = assessmentExamRequested ? todoId : "";
  } else if (routeView === "learning" && taskCardId) {
    state.selectedLearningTaskCardId = taskCardId;
    state.selectedTodoId = "";
    state.pendingReadingQuizTodoId = "";
    state.pendingAssessmentExamTodoId = "";
  } else if (routeView) {
    state.pendingReadingQuizTodoId = "";
    state.pendingAssessmentExamTodoId = "";
  }
  if (routeView === "projects") {
    state.directoryReturnRoute = null;
    state.sharedDirectoryManagerOpen = false;
    if (projectId) {
      state.selectedProjectId = projectId;
      localStorage.setItem("hermesWebProject", projectId);
      if ($("projectSelect")) $("projectSelect").value = projectId;
    }
    if (subprojectId || params.has("subprojectId")) {
      persistSelectedSubproject(subprojectId);
    }
    if (directoryPath) {
      resetDirectoryPath(directoryPath, { rootPath: directoryRoot || directoryRootForPath(directoryPath, directoryPath) });
    } else {
      resetDirectoryPath();
    }
  }
  if (routeView === "tasks" && taskGroupId) {
    state.currentTaskGroupId = taskGroupId;
    setRouteScrollTarget(taskGroupId, messageId);
  } else if (routeView && routeView !== "tasks") {
    clearRouteScrollTarget();
  }
  if (routeView === "single") {
    setSingleWindowMode("chat");
    if (weixinChatRequested) {
      state.weixinChatOpen = true;
      state.groupChatOpen = false;
      localStorage.setItem("hermesWebWeixinChatOpen", "1");
      localStorage.setItem("hermesWebGroupChatOpen", "0");
    } else if (groupChatRequested) {
      state.weixinChatOpen = false;
      state.groupChatOpen = true;
      localStorage.setItem("hermesWebWeixinChatOpen", "0");
      localStorage.setItem("hermesWebGroupChatOpen", "1");
    } else {
      state.weixinChatOpen = false;
      localStorage.setItem("hermesWebWeixinChatOpen", "0");
    }
  }
  return Boolean(routeView || inboxItemId || automationId || todoId || taskGroupId || groupChatRequested || weixinChatRequested || readingQuizRequested || assessmentExamRequested);
}

function applyRouteFromUrl(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return false;
  const params = new URLSearchParams(parsed.search || "");
  if (!requireHermesAppWindowForRoute(params)) return false;
  return applyRouteParams(params);
}

function applyInitialRouteFromUrl() {
  return applyRouteFromUrl(window.location.href);
}

function replaceTodoDetailRouteFlag(todoId, flagName) {
  const id = String(todoId || "").trim();
  const flag = String(flagName || "").trim();
  if (!id || !flag || state.viewMode !== "todos") return;
  try {
    const params = new URLSearchParams(window.location.search || "");
    params.set("view", "todos");
    params.set("workspaceId", state.selectedWorkspaceId || "owner");
    params.set("todoId", id);
    if (flag === "assessmentExam") params.delete("readingQuiz");
    if (flag === "readingQuiz") params.delete("assessmentExam");
    params.set(flag, "1");
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", `/?${params.toString()}`);
  } catch (_) {}
}

async function openNotificationRoute(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return;
  const params = new URLSearchParams(parsed.search || "");
  if (!requireHermesAppWindowForRoute(params)) return;
  if (!applyRouteParams(params)) return;
  suppressComposerAutoFocus(1200);
  blurComposerInput();
  try {
    window.TaskDocumentPreviewUi?.closeArtifactPreviewOverlays?.();
  } catch (_) {}
  closeSidebar();
  closeTopMoreMenu();
  try {
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", `${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch (_) {
    // Route state is already applied; URL replacement is only for reload/back consistency.
  }
  await loadSelectedView();
}

function applyDefaultLaunchView() { state.viewMode = "single";
  setSingleWindowMode("chat");
  state.weixinChatOpen = false;
  state.currentTaskGroupId = "";
  state.skillDetail = null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
}

function restoreVisibleAppScroll() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isSingleWindowChatView()) return;
      const conversation = $("conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  });
}

function applyReasoningInfo(info = {}) {
  if (!info || typeof info !== "object") return;
  const options = normalizeReasoningOptions(info.efforts || info.options || []);
  state.reasoningOptions = options;
  const defaultEffort = String(info.defaultEffort || "").trim().toLowerCase();
  state.defaultReasoningEffort = options.some((item) => item.value === defaultEffort)
    ? defaultEffort
    : (state.defaultReasoningEffort || "medium");
  state.defaultReasoningSource = String(info.source || state.defaultReasoningSource || "");
  state.assistantLabel = String(info.assistantLabel || info.model?.label || state.assistantLabel || "AI").trim() || "AI";
  state.defaultModel = String(info.model?.default || info.defaultModel || state.defaultModel || "").trim();
  state.modelProvider = String(info.model?.provider || info.provider || state.modelProvider || "").trim();
  updateTaskReasoningControl();
  renderComposerContext();
  if (typeof updateGroupMentionMenu === "function") updateGroupMentionMenu();
  if (typeof renderSettingsOverlay === "function") renderSettingsOverlay();
}

async function loadStatus() {
  const status = await api("/api/status").catch((err) => ({ ok: false, error: err.message }));
  $("connectionState").textContent = status.ok ? "Hermes OK" : `Hermes unavailable: ${status.error || "unknown"}`;
  if (status.clientVersion) handleClientVersion(status.clientVersion, "status");
  state.gatewayPool = status.gatewayPool || null;
  state.concurrency = status.concurrency || null;
  state.ownerElevation = status.ownerElevation || state.ownerElevation || null;
  if (status.display && typeof status.display === "object") {
    const names = Array.isArray(status.display.ownerDriveRootNames)
      ? status.display.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    state.displayConfig = {
      ownerDriveRootNames: names.length ? names : state.displayConfig.ownerDriveRootNames,
      ownerRootFallbackLabel: String(status.display.ownerRootFallbackLabel || state.displayConfig.ownerRootFallbackLabel || "Hermes Owner"),
    };
  }
  if (status.reasoning) applyReasoningInfo(status.reasoning);
  if (status.push) {
    state.pushStatus = status.push;
    updatePushButton();
  }
}

function normalizeClientVersion(value) {
  return String(value || "").trim();
}

function compactClientVersion(value) {
  const version = normalizeClientVersion(value);
  const match = version.match(/^\d{8}-(\d{4})$/);
  if (match) return match[1];
  if (version.length > 8) return version.slice(-8);
  return version;
}

function renderClientVersion() {
  const badge = $("clientVersion");
  if (!badge) return;
  const version = normalizeClientVersion(state.clientVersion);
  const update = state.appUpdate || {};
  const updateAvailable = Boolean(update.updateAvailable);
  badge.textContent = updateAvailable ? "更新" : (version ? `v${compactClientVersion(version)}` : "");
  badge.title = updateAvailable
    ? `Update available: ${update.latestVersion || update.latestCommit || "latest"}`
    : (version ? `Client version ${version}` : "");
  badge.classList.toggle("update-available", updateAvailable);
  badge.toggleAttribute("data-update-available", updateAvailable);
}

async function checkAppUpdate(reason = "login") {
  if (!state.auth?.isOwner || state.appUpdateChecking) return null;
  state.appUpdateChecking = true;
  try {
    const query = new URLSearchParams({ reason });
    const result = await api(`/api/app-update/status?${query.toString()}`);
    state.appUpdate = result;
    renderClientVersion();
    return result;
  } catch (err) {
    state.appUpdate = { ok: false, updateAvailable: false, warning: err.message || String(err) };
    renderClientVersion();
    return null;
  } finally {
    state.appUpdateChecking = false;
  }
}

function isSelfUpdateUnsupported(result) {
  const message = String(result?.warning || result?.error || "");
  return result?.repository?.available === false || /not a git checkout/i.test(message);
}

function appUpdateToastKind(result) {
  if (!result) return "";
  if (result.ok && (result.updated || result.upToDate)) return "success";
  if (isSelfUpdateUnsupported(result)) return "";
  if (result.error || result.warning || result.repository?.clean === false) return "error";
  return "";
}

function appUpdateMessage(result) {
  if (!result) return "Update status is unavailable.";
  if (isSelfUpdateUnsupported(result)) return "当前安装方式不支持应用内更新。";
  if (result.error) return result.error;
  if (result.warning) return result.warning;
  if (result.updated) return result.message || "Updated.";
  if (result.upToDate) return "Already up to date.";
  if (!result.updateAvailable) return "No update is available.";
  if (result.repository && result.repository.clean === false) return "Working tree is not clean; update was not applied.";
  return "Update is not available for this installation.";
}

async function applyAppUpdateFromBadge() {
  if (!state.auth?.isOwner || state.appUpdateApplying) return;
  if (!state.appUpdate?.updateAvailable) {
    await checkAppUpdate("manual");
    if (!state.appUpdate?.updateAvailable) {
      showPushToast(appUpdateMessage(state.appUpdate), appUpdateToastKind(state.appUpdate));
      return;
    }
  }
  state.appUpdateApplying = true;
  renderClientVersion();
  try {
    const result = await api("/api/app-update/apply", { method: "POST", body: JSON.stringify({}) });
    state.appUpdate = result;
    renderClientVersion();
    showPushToast(appUpdateMessage(result), appUpdateToastKind(result));
    if (result.updated) {
      await checkClientVersion("update-applied").catch(() => {});
    }
  } catch (err) {
    showPushToast(err.message || "Update failed.", "error");
  } finally {
    state.appUpdateApplying = false;
    renderClientVersion();
  }
}

function gatewayPoolSummary(pool = state.gatewayPool) {
  if (!pool || typeof pool !== "object") return { label: "Gateway Pool: unknown", detail: "" };
  const workers = Array.isArray(pool.workers) ? pool.workers : [];
  const healthy = workers.filter((worker) => worker.healthy === true).length;
  const workerCount = Number(pool.workerCount ?? workers.length) || workers.length;
  if (!pool.enabled) {
    return {
      label: "Gateway Pool: fallback",
      detail: pool.error || pool.reason || pool.fallbackApiBase || "",
      healthy,
      workerCount,
    };
  }
  return {
    label: `Gateway Pool: ${healthy}/${workerCount} healthy`,
    detail: pool.mode ? `mode ${pool.mode}` : "",
    healthy,
    workerCount,
  };
}

function concurrencySummary(concurrency = state.concurrency) {
  if (!concurrency || typeof concurrency !== "object") return "";
  const active = Number(concurrency.activeGlobal || 0);
  const maxGlobal = Number(concurrency.maxGlobal || 0);
  const maxPerWorkspace = Number(concurrency.maxPerWorkspace || 0);
  const parts = [`active ${active}`];
  if (maxGlobal) parts.push(`global ${maxGlobal}`);
  if (maxPerWorkspace) parts.push(`workspace ${maxPerWorkspace}`);
  return parts.join(" / ");
}

function renderGatewayPoolMiniStatus(pool = state.gatewayPool, concurrency = state.concurrency) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const summary = gatewayPoolSummary(pool);
  const concurrencyText = concurrencySummary(concurrency);
  return `<section class="workspace-gateway-status">
    <div class="workspace-gateway-title">${escapeHtml(summary.label)}</div>
    ${summary.detail ? `<div class="workspace-gateway-meta">${escapeHtml(summary.detail)}</div>` : ""}
    ${concurrencyText ? `<div class="workspace-gateway-meta">Run limit: ${escapeHtml(concurrencyText)}</div>` : ""}
  </section>`;
}

function ownerElevationDurationOptions() {
  const options = Array.isArray(state.ownerElevation?.durationOptionsMinutes)
    ? state.ownerElevation.durationOptionsMinutes.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
  return options.length ? options : [5, 15, 30, 60];
}

function ownerElevationActive() {
  const elevation = state.ownerElevation || {};
  const expiresAt = Date.parse(elevation.expiresAt || "");
  return Boolean(
    state.auth?.isOwner
    && state.selectedWorkspaceId === "owner"
    && elevation.active
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

function ownerElevationRemainingLabel() {
  if (!ownerElevationActive()) return "";
  const expiresAt = Date.parse(state.ownerElevation?.expiresAt || "");
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
  return `${minutes} 分钟后到期`;
}

function ownerElevationSelectedDuration() {
  const options = ownerElevationDurationOptions();
  const raw = Number($("ownerElevationDuration")?.value || state.ownerElevationDurationMinutes || state.ownerElevation?.defaultDurationMinutes || options[0]);
  return options.includes(raw) ? raw : (state.ownerElevation?.defaultDurationMinutes || options[0]);
}

function renderOwnerElevationPanel() {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") return "";
  const elevation = state.ownerElevation || {};
  const available = elevation.available !== false;
  const active = ownerElevationActive();
  const durationOptions = ownerElevationDurationOptions();
  if (!durationOptions.includes(state.ownerElevationDurationMinutes)) {
    state.ownerElevationDurationMinutes = elevation.defaultDurationMinutes || durationOptions[0];
  }
  const selectedDuration = state.ownerElevationDurationMinutes;
  const label = active ? "高权限运行" : "普通权限";
  const meta = active
    ? `后续 Owner 请求会路由到 maintenance Gateway，${ownerElevationRemainingLabel()}。`
    : "后续 Owner 请求默认走普通低权限 Gateway。";
  const options = durationOptions.map((minutes) => (
    `<option value="${escapeHtml(minutes)}"${minutes === selectedDuration ? " selected" : ""}>${escapeHtml(minutes)} 分钟</option>`
  )).join("");
  const disabled = available ? "" : " disabled";
  const reason = !available && elevation.reason ? `<div class="workspace-permission-warning">${escapeHtml(elevation.reason)}</div>` : "";
  return `<section class="workspace-permission-panel ${active ? "active" : ""}">
    <div class="workspace-permission-head">
      <div>
        <div class="workspace-permission-title">当前权限</div>
        <div class="workspace-permission-state">${escapeHtml(label)}</div>
      </div>
      <span class="workspace-permission-badge">${active ? "HIGH" : "LOW"}</span>
    </div>
    <div class="workspace-permission-meta">${escapeHtml(meta)}</div>
    <div class="workspace-permission-actions">
      <select id="ownerElevationDuration" class="workspace-permission-select"${disabled}>${options}</select>
      <button class="workspace-permission-primary" type="button" data-owner-elevation-grant${disabled}>高权限运行</button>
      ${active ? `<button class="workspace-permission-secondary" type="button" data-owner-elevation-revoke>结束</button>` : ""}
    </div>
    <div class="workspace-permission-hint">只在授权时间内生效；到期后自动恢复普通权限。</div>
    ${reason}
  </section>`;
}

function wireOwnerElevationPanel(root) {
  root.querySelector("#ownerElevationDuration")?.addEventListener("change", (event) => {
    const minutes = Number(event.target.value || 0);
    if (Number.isFinite(minutes) && minutes > 0) {
      state.ownerElevationDurationMinutes = minutes;
      localStorage.setItem("hermesOwnerElevationMinutes", String(minutes));
    }
  });
  root.querySelector("[data-owner-elevation-grant]")?.addEventListener("click", () => activateOwnerElevation().catch(showError));
  root.querySelector("[data-owner-elevation-revoke]")?.addEventListener("click", () => revokeOwnerElevation().catch(showError));
}

function openOwnerElevationApprovalDialog(options = {}) {
  const overlay = $("ownerElevationApprovalOverlay");
  if (!overlay) return Promise.resolve(false);
  const title = String(options.title || "Owner Approval");
  const message = String(options.message || "This request needs Owner approval.");
  const detail = String(options.detail || "").trim();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.classList.add("hidden");
      overlay.innerHTML = "";
      resolve(Boolean(value));
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    overlay.innerHTML = `<section class="access-key-sheet owner-elevation-approval-sheet">
      <header class="access-key-header">
        <div>
          <div id="ownerElevationApprovalTitle" class="access-key-title">${escapeHtml(title)}</div>
          <div class="access-key-subtitle">High-privilege Gateway approval</div>
        </div>
      </header>
      <div class="owner-elevation-approval-body">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
      ${detail ? `<div class="owner-elevation-approval-detail">${escapeHtml(detail)}</div>` : ""}
      <div class="owner-elevation-approval-actions">
        <button class="owner-elevation-cancel" type="button" data-owner-elevation-approval-cancel>Cancel</button>
        <button class="owner-elevation-approve" type="button" data-owner-elevation-approval-approve>Approve</button>
      </div>
    </section>`;
    overlay.classList.remove("hidden");
    overlay.querySelector("[data-owner-elevation-approval-approve]")?.addEventListener("click", () => finish(true));
    overlay.querySelector("[data-owner-elevation-approval-cancel]")?.addEventListener("click", () => finish(false));
    document.addEventListener("keydown", onKeydown);
  });
}

async function activateOwnerElevation(durationMinutes = ownerElevationSelectedDuration(), options = {}) {
  if (!state.auth?.isOwner) throw new Error("Owner access is required");
  const minutes = Number(durationMinutes) || ownerElevationSelectedDuration();
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: `Approve high-privilege Gateway routing for ${minutes} minutes? Owner requests during this window will use the maintenance Gateway.`,
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation", {
    method: "POST",
    body: JSON.stringify({ durationMinutes: minutes }),
  });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("高权限运行已授权", "success");
  return true;
}

async function revokeOwnerElevation() {
  const result = await api("/api/owner-elevation", { method: "DELETE" });
  state.ownerElevation = result.ownerElevation || state.ownerElevation;
  renderWorkspaceAccessPanel();
  showPushToast("已恢复普通权限", "success");
}

function clearOwnerElevationOnce() {
  state.ownerElevationOnceToken = "";
  state.ownerElevationOnceExpiresAt = "";
}

function ownerElevationOnceActive() {
  const expiresAt = Date.parse(state.ownerElevationOnceExpiresAt || "");
  return Boolean(
    state.ownerElevationOnceToken
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
  );
}

async function activateOwnerElevationOnce(options = {}) {
  if (!state.auth?.isOwner || state.selectedWorkspaceId !== "owner") {
    throw new Error("Owner access is required");
  }
  if (options.confirm !== false) {
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: options.message || "Approve high-privilege Gateway routing for this message only? The approval is consumed after this send.",
    });
    if (!ok) return false;
  }
  const result = await api("/api/owner-elevation/once", { method: "POST", body: JSON.stringify({}) });
  const grant = result.ownerElevationOnce || {};
  state.ownerElevationOnceToken = String(grant.token || "");
  state.ownerElevationOnceExpiresAt = String(grant.expiresAt || "");
  if (!state.ownerElevationOnceToken) throw new Error("Owner high-privilege authorization token was not returned");
  return true;
}
