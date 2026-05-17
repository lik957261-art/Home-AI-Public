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
  if (result) result.hidden = !state.setupOwnerKey;
  if (key) key.textContent = state.setupOwnerKey || "";
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

function applyRouteParams(params) {
  const automationId = String(params.get("automationId") || "").trim();
  const todoId = String(params.get("todoId") || "").trim();
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
  let routeView = normalizedRouteView(params.get("view") || params.get("viewMode"), automationId ? "automation" : todoId ? "todos" : taskGroupId ? "tasks" : (groupChatRequested || weixinChatRequested) ? "single" : ""); if (state.auth && !state.auth.isOwner && routeView && routeView !== "learning") routeView = "learning";
  const workspaceId = String(params.get("workspaceId") || "").trim();
  if (workspaceId && state.workspaces.some((item) => item.id === workspaceId)) {
    state.selectedWorkspaceId = workspaceId;
    localStorage.setItem("hermesWebWorkspace", workspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = workspaceId;
  }
  if (routeView) {
    state.viewMode = routeView;
    localStorage.setItem("hermesWebViewMode", routeView);
    state.currentTaskGroupId = "";
    state.currentThread = null;
    state.currentThreadId = "";
  }
  if (routeView === "automation" && automationId) {
    state.selectedAutomationId = automationId;
    state.automationOutputHistoryOpen = false;
  }
  if (routeView === "todos" && todoId) {
    state.selectedTodoId = todoId;
    state.todoRouteMissingTargetId = "";
    state.pendingReadingQuizTodoId = readingQuizRequested ? todoId : "";
    state.pendingAssessmentExamTodoId = assessmentExamRequested ? todoId : "";
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
  return Boolean(routeView || automationId || todoId || taskGroupId || groupChatRequested || weixinChatRequested || readingQuizRequested || assessmentExamRequested);
}

function applyRouteFromUrl(value) {
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) return false;
  return applyRouteParams(new URLSearchParams(parsed.search || ""));
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
  if (!applyRouteParams(new URLSearchParams(parsed.search || ""))) return;
  suppressComposerAutoFocus(1200);
  blurComposerInput();
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

function applyDefaultLaunchView() { state.viewMode = state.auth?.isOwner ? "single" : "learning";
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
      message: "Approve high-privilege Gateway routing for this message only? The approval is consumed after this send.",
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

function refreshNoticeText(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  return version ? `客户端已更新到 v${version}` : "客户端已更新";
}

function showRefreshNotice(serverVersion) {
  const version = normalizeClientVersion(serverVersion);
  if (!version || version === state.refreshNoticeDismissedVersion) return;
  const notice = $("refreshNotice");
  if (!notice) return;
  $("refreshNoticeText").textContent = refreshNoticeText(version);
  notice.classList.remove("hidden");
}

function hideRefreshNotice() {
  $("refreshNotice")?.classList.add("hidden");
}

function handleClientVersion(info, source = "") {
  const serverVersion = normalizeClientVersion(info?.version || info?.clientVersion || "");
  if (!serverVersion) return;
  state.serverClientVersion = serverVersion;
  const clientVersion = normalizeClientVersion(state.clientVersion);
  if (clientVersion && serverVersion !== clientVersion) {
    showRefreshNotice(serverVersion, source);
    return;
  }
  hideRefreshNotice();
}

async function checkClientVersion(reason = "manual") {
  const query = new URLSearchParams();
  if (state.clientVersion) query.set("clientVersion", state.clientVersion);
  if (reason) query.set("reason", reason);
  const info = await api(`/api/client-version?${query.toString()}`);
  handleClientVersion(info, "poll");
  if (info.reasoning) applyReasoningInfo(info.reasoning);
  return info;
}

function startClientRefreshChecks() {
  if (state.refreshCheckTimer) clearInterval(state.refreshCheckTimer);
  state.refreshCheckTimer = setInterval(() => {
    checkClientVersion("timer").catch(() => {});
  }, 60000);
}

function waitForServiceWorkerControllerChange(timeoutMs = 3500) {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

function reloadWithoutBfcache() {
  const url = new URL(window.location.href);
  url.searchParams.set("_hmv", String(Date.now()));
  window.location.replace(url.href);
}

function reloadForClientUpdate() {
  showBootSplash("正在更新客户端");
  if (!("serviceWorker" in navigator)) {
    reloadWithoutBfcache();
    return;
  }
  navigator.serviceWorker.getRegistration("/")
    .then(async (registration) => {
      if (!registration) return;
      await registration.update?.();
      const worker = registration.waiting || registration.installing;
      if (worker) {
        try {
          worker.postMessage({ type: "HERMES_SKIP_WAITING" });
        } catch (_) {
          // Continue with a timed reload if the worker cannot receive the message.
        }
      }
      await waitForServiceWorkerControllerChange();
    })
    .catch(() => {})
    .finally(reloadWithoutBfcache);
}

function isStandalonePwa() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigator.standalone === true,
  );
}

function pwaPlatformHint() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return "在 iPhone/iPad 上，用 Safari 打开本页，点系统分享按钮，然后选择“添加到主屏幕”。安装后再从桌面图标打开。";
  }
  if (/Android/i.test(ua)) {
    return "在 Android 上，用 Chrome 或 Edge 打开本页，点浏览器菜单里的“安装应用”或“添加到主屏幕”。";
  }
  return "在支持 PWA 的浏览器里打开本页，使用地址栏或浏览器菜单中的“安装应用”。";
}

function pwaRequirementHint() {
  if (isStandalonePwa()) return "当前已经以桌面应用模式运行。";
  if (!window.isSecureContext) return "当前连接不是安全上下文。多数浏览器要求 HTTPS 或 localhost 才能安装 PWA 和启用 Service Worker。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker，不能完整安装为 PWA。";
  if (state.pwaServiceWorkerReady) return "Service Worker 已就绪，应用壳可缓存，离线时可以打开登录页和静态界面。";
  if (state.pwaServiceWorkerError) return state.pwaServiceWorkerError;
  return "正在准备 PWA 安装能力。";
}

async function ensurePwaServiceWorker(options = {}) {
  if (!("serviceWorker" in navigator)) {
    state.pwaServiceWorkerError = "当前浏览器不支持 Service Worker。";
    updateTopMoreControls();
    return null;
  }
  try {
    const registration = await withTimeout(
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }),
      options.timeoutMs || 8000,
      "Service Worker 注册超时",
    );
    registration.update().catch(() => {});
    state.pwaServiceWorkerReady = true;
    state.pwaServiceWorkerError = "";
    updateTopMoreControls();
    return registration;
  } catch (err) {
    state.pwaServiceWorkerReady = false;
    state.pwaServiceWorkerError = err.message || String(err);
    updateTopMoreControls();
    return null;
  }
}

function pwaInstallButtonLabel() {
  if (isStandalonePwa() || state.pwaInstalled) return "已安装";
  return state.pwaInstallPrompt ? "安装应用" : "安装说明";
}

function updatePwaInstallControls() {
  const button = $("topInstallPwa");
  if (!button) return;
  button.hidden = false;
  button.disabled = Boolean(isStandalonePwa() || state.pwaInstalled);
  button.textContent = pwaInstallButtonLabel();
}

function renderPwaInstallOverlay() {
  const overlay = $("pwaInstallOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.pwaInstallOpen);
  if (!state.pwaInstallOpen) {
    overlay.innerHTML = "";
    return;
  }
  const canPrompt = Boolean(state.pwaInstallPrompt && !isStandalonePwa());
  overlay.innerHTML = `<section class="access-key-sheet pwa-install-sheet">
    <header class="access-key-header">
      <div>
        <div id="pwaInstallTitle" class="access-key-title">安装 Hermes Mobile</div>
        <div class="access-key-subtitle">${escapeHtml(pwaRequirementHint())}</div>
      </div>
      <button class="access-key-close" type="button" data-close-pwa-install>完成</button>
    </header>
    <section class="pwa-install-panel">
      <div class="pwa-install-icon" aria-hidden="true">H</div>
      <div>
        <div class="access-key-row-title">桌面应用模式</div>
        <div class="access-key-row-meta">安装后可以从主屏幕/桌面打开，使用独立窗口，并继续使用 Hermes Mobile 的通知和离线应用壳。</div>
      </div>
    </section>
    ${canPrompt ? `<button class="pwa-install-primary" type="button" data-run-pwa-install>安装应用</button>` : ""}
    <section class="pwa-install-instructions">
      <div class="access-key-row-title">手动安装</div>
      <div class="access-key-note">${escapeHtml(pwaPlatformHint())}</div>
    </section>
  </section>`;
  overlay.querySelector("[data-close-pwa-install]")?.addEventListener("click", closePwaInstall);
  overlay.querySelector("[data-run-pwa-install]")?.addEventListener("click", () => runPwaInstallPrompt().catch(showError));
}

function openPwaInstall() {
  closeTopMoreMenu();
  state.pwaInstallOpen = true;
  renderPwaInstallOverlay();
}

function closePwaInstall() {
  state.pwaInstallOpen = false;
  renderPwaInstallOverlay();
}

async function runPwaInstallPrompt() {
  const prompt = state.pwaInstallPrompt;
  if (!prompt) {
    showPushToast(pwaPlatformHint(), "");
    return;
  }
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  state.pwaInstallPrompt = null;
  if (choice?.outcome === "accepted") {
    state.pwaInstalled = true;
    closePwaInstall();
    showPushToast("Hermes Mobile 已提交安装。", "success");
  } else {
    renderPwaInstallOverlay();
  }
  updateTopMoreControls();
}

function fontSizeOption(value) {
  const normalized = normalizeFontSizePreference(value);
  return FONT_SIZE_OPTIONS.find((option) => option.id === normalized) || FONT_SIZE_OPTIONS[1];
}

function normalizeFontSizePreference(value) {
  const id = String(value || "").trim();
  return FONT_SIZE_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_SIZE;
}

function fontFamilyOption(value) {
  const normalized = normalizeFontFamilyPreference(value);
  return FONT_FAMILY_OPTIONS.find((option) => option.id === normalized) || FONT_FAMILY_OPTIONS[0];
}

function normalizeFontFamilyPreference(value) {
  const id = String(value || "").trim();
  return FONT_FAMILY_OPTIONS.some((option) => option.id === id) ? id : DEFAULT_FONT_FAMILY;
}

function applyFontSizePreference(value = state.fontSize) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  document.documentElement.dataset.fontSize = option.id;
  document.documentElement.style.setProperty("--app-font-scale", String(option.scale));
  window.setTimeout(updateMobileBottomNavReservation, 0);
}

function applyFontFamilyPreference(value = state.fontFamily) {
  const option = fontFamilyOption(value);
  state.fontFamily = option.id;
  document.documentElement.dataset.fontFamily = option.id;
  document.documentElement.style.setProperty("--app-font-family", option.family);
}

function setFontSizePreference(value) {
  const option = fontSizeOption(value);
  state.fontSize = option.id;
  localStorage.setItem("hermesWebFontSize", option.id);
  applyFontSizePreference(option.id);
  renderSettingsOverlay();
}

function setFontFamilyPreference(value) {
  const option = fontFamilyOption(value);
  state.fontFamily = option.id;
  localStorage.setItem("hermesWebFontFamily", option.id);
  applyFontFamilyPreference(option.id);
  renderSettingsOverlay();
}

function renderSettingsOverlay() {
  const overlay = $("settingsOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.settingsOpen);
  if (!state.settingsOpen) {
    overlay.innerHTML = "";
    return;
  }
  const current = normalizeFontSizePreference(state.fontSize);
  const currentFamily = normalizeFontFamilyPreference(state.fontFamily);
  const options = FONT_SIZE_OPTIONS.map((option) => {
    const active = option.id === current;
    return `<button class="font-size-option${active ? " active" : ""}" type="button" data-font-size-option="${escapeHtml(option.id)}" style="--font-preview-scale:${option.scale}">
      <span class="font-size-option-name">${escapeHtml(option.label)}</span>
      <span class="font-size-option-sample">Aa</span>
    </button>`;
  }).join("");
  const familyOptions = FONT_FAMILY_OPTIONS.map((option) => {
    const active = option.id === currentFamily;
    return `<button class="font-family-option${active ? " active" : ""}" type="button" data-font-family-option="${escapeHtml(option.id)}" style="--font-preview-family:${escapeHtml(option.family)}">
      <span class="font-family-option-sample">${escapeHtml(option.sample)}</span>
      <span class="font-family-option-name">${escapeHtml(option.label)}</span>
    </button>`;
  }).join("");
  overlay.innerHTML = `<section class="access-key-sheet settings-sheet">
    <header class="access-key-header">
      <div>
        <div id="settingsTitle" class="access-key-title">设置</div>
        <div class="access-key-subtitle">当前设备显示偏好</div>
      </div>
      <button class="access-key-close" type="button" data-close-settings>完成</button>
    </header>
    <section class="settings-panel">
      <div class="settings-row-title">字体大小</div>
      <div class="font-size-options" role="group" aria-label="字体大小">
        ${options}
      </div>
      <div class="settings-row-title">字体</div>
      <div class="font-family-options" role="group" aria-label="字体">
        ${familyOptions}
      </div>
      <div class="settings-preview">
        <div class="settings-preview-title">Hermes Mobile</div>
        <div class="settings-preview-body">聊天、话题、目录、看板、Markdown 阅读和自动化页面会使用这个显示偏好。</div>
      </div>
    </section>
  </section>`;
  if (!overlay.dataset.settingsBackdropBound) {
    overlay.dataset.settingsBackdropBound = "1";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettings();
    });
  }
  overlay.querySelector("[data-close-settings]")?.addEventListener("click", closeSettings);
  overlay.querySelectorAll("[data-font-size-option]").forEach((button) => {
    button.addEventListener("click", () => setFontSizePreference(button.dataset.fontSizeOption || DEFAULT_FONT_SIZE));
  });
  overlay.querySelectorAll("[data-font-family-option]").forEach((button) => {
    button.addEventListener("click", () => setFontFamilyPreference(button.dataset.fontFamilyOption || DEFAULT_FONT_FAMILY));
  });
}

function openSettings() {
  closeTopMoreMenu();
  closeSidebar();
  state.settingsOpen = true;
  renderSettingsOverlay();
}

function closeSettings() {
  state.settingsOpen = false;
  renderSettingsOverlay();
}

function pushSupported() {
  return Boolean(
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window,
  );
}

function pushUnavailableReason() {
  if (!window.isSecureContext) return "当前链接不是 HTTPS 安全上下文，Web Push 不可用。";
  if (!("serviceWorker" in navigator)) return "当前浏览器不支持 Service Worker。";
  if (!("PushManager" in window)) return "当前浏览器或安装方式不支持 Web Push。iOS 需要从 Safari 添加到主屏幕后使用。";
  if (!("Notification" in window)) return "当前浏览器不支持通知权限。";
  if (state.pushStatus && (!state.pushStatus.enabled || !state.pushStatus.publicKey)) return "服务端 Web Push 尚未配置。";
  if (Notification.permission === "denied") return "通知权限已被系统拒绝，需要在浏览器或 iOS 设置里重新允许。";
  return "";
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message || "操作超时")), timeoutMs);
    }),
  ]);
}

function showPushToast(message, kind = "") {
  const toast = $("pushToast");
  if (!toast) return;
  if (state.pushToastTimer) clearTimeout(state.pushToastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  if (kind) toast.classList.add(kind);
  if (kind !== "error") {
    state.pushToastTimer = window.setTimeout(() => toast.classList.add("hidden"), kind === "success" ? 4200 : 6500);
  }
}

function setPushProgress(message, kind = "") {
  $("connectionState").textContent = message;
  showPushToast(message, kind);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getServiceWorkerRegistration(options = {}) {
  const progress = options.onProgress || (() => {});
  progress("正在准备通知服务");
  const registration = await ensurePwaServiceWorker({ timeoutMs: 8000 });
  if (!registration) throw new Error(state.pwaServiceWorkerError || "Service Worker 注册失败");
  try {
    progress("正在等待通知服务");
    return await withTimeout(navigator.serviceWorker.ready, 8000, "Service Worker 启动超时");
  } catch (_) {
    return registration;
  }
}

async function loadPushStatus() {
  state.pushStatus = await api("/api/push/vapid-public-key");
  if (pushSupported()) {
    try {
      const registration = await getServiceWorkerRegistration();
      state.pushSubscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
    } catch (_) {
      state.pushSubscription = null;
    }
  }
  updatePushButton();
}

async function syncPushSubscriptionContext() {
  if (!pushSupported()) return null;
  if (!state.pushSubscription || Notification.permission !== "granted") return null;
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) return null;
  const result = await withTimeout(api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: state.pushSubscription.toJSON(),
      deviceLabel: navigator.platform || navigator.userAgent || "device",
      workspaceId: state.selectedWorkspaceId || "owner",
    }),
  }), 8000, "同步通知订阅超时");
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  return result;
}

function updatePushButton() {
  const button = $("pushToggle");
  if (!button) return;
  button.hidden = false;
  button.disabled = false;
  button.classList.remove("enabled", "warning");
  const unavailableReason = pushUnavailableReason();
  if (unavailableReason) {
    button.textContent = "!";
    button.title = unavailableReason;
    button.setAttribute("aria-label", unavailableReason);
    button.classList.add("warning");
    return;
  }
  if (Notification.permission === "granted" && state.pushSubscription) {
    button.textContent = "🔔";
    button.title = "重新启用通知";
    button.setAttribute("aria-label", "重新启用通知");
    button.classList.add("enabled");
    return;
  }
  button.textContent = "🔔";
  button.title = "启用通知";
  button.setAttribute("aria-label", "启用通知");
}

async function enablePushNotifications(options = {}) {
  const forceRenew = Boolean(options.forceRenew);
  const progress = options.onProgress || (() => {});
  if (!pushSupported()) throw new Error("Web Push requires HTTPS, Service Worker, PushManager, and Notification support.");
  progress("正在检查通知权限");
  const permission = Notification.permission === "granted"
    ? "granted"
    : await withTimeout(Notification.requestPermission(), 15000, "通知权限请求超时");
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  progress("正在读取推送配置");
  if (!state.pushStatus?.publicKey) await withTimeout(loadPushStatus(), 10000, "读取推送配置超时");
  if (!state.pushStatus?.enabled || !state.pushStatus.publicKey) throw new Error("Web Push is not configured on the server.");
  const registration = await getServiceWorkerRegistration({ onProgress: progress });
  progress("正在读取当前订阅");
  let subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
  let previousSubscription = null;
  if (forceRenew && subscription) {
    previousSubscription = subscription;
    progress("正在更新旧订阅");
    try {
      await withTimeout(previousSubscription.unsubscribe(), 8000, "浏览器旧订阅取消超时");
      subscription = null;
    } catch (_) {
      subscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "重新读取通知订阅超时").catch(() => previousSubscription);
    }
  }
  if (!subscription) {
    progress("正在创建新订阅");
    subscription = await withTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.pushStatus.publicKey),
    }), 15000, "创建通知订阅超时，请关闭后重新打开 Hermes Mobile 再试");
  }
  state.pushSubscription = subscription;
  progress("正在同步订阅");
  await syncPushSubscriptionContext();
  if (previousSubscription?.endpoint && previousSubscription.endpoint !== subscription.endpoint) {
    await withTimeout(api("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: previousSubscription.endpoint }),
    }), 8000, "同步旧订阅删除超时").catch(() => null);
  }
  return subscription;
}

async function testPushNotification() {
  const result = await api("/api/push/test", { method: "POST", body: JSON.stringify({ workspaceId: state.selectedWorkspaceId || "owner" }) });
  state.pushStatus = result.push || state.pushStatus;
  updatePushButton();
  const delivery = result.result || {};
  const attempted = Number(delivery.attempted || 0);
  const sent = Number(delivery.sent || 0);
  const failed = Number(delivery.failed || 0);
  if (!attempted) {
    throw new Error(`当前工作区没有可用通知订阅：${result?.target?.principalId || state.selectedWorkspaceId || "unknown"}`);
  }
  if (failed || sent < attempted) {
    throw new Error(`测试通知发送不完整：${sent}/${attempted}，失败 ${failed}`);
  }
  return result;
}

function pushTestResultText(result) {
  const delivery = result?.result || {};
  return `测试已交给系统通知：${delivery.sent || 0}/${delivery.attempted || 0}`;
}

function shouldRunLocalPushProbe() {
  return /Android/i.test(navigator.userAgent || "");
}

async function runLocalNotificationProbe(result) {
  if (!shouldRunLocalPushProbe()) return { skipped: true };
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return { skipped: true, error: "通知权限不是 granted" };
  }
  const registration = await getServiceWorkerRegistration();
  const workspaceId = result?.target?.workspaceId || state.selectedWorkspaceId || "owner";
  const testId = result?.target?.testId || `local_${Date.now()}`;
  await registration.showNotification("\u672c\u673a\u901a\u77e5\u6d4b\u8bd5", {
    body: "如果这条只在下拉菜单里，请把 Android 通知类别设为提醒/弹出，而不是静默。",
    tag: `hermes-web-local-probe-${testId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    data: {
      messageType: "local-probe",
      workspaceId,
      url: `/?view=tasks&workspaceId=${encodeURIComponent(workspaceId)}`,
    },
  });
  return { shown: true };
}

function pushCompletionText(result, localProbe) {
  let text = pushTestResultText(result);
  if (localProbe?.shown) text += "；Android 本机通知探测已调用";
  if (localProbe?.error) text += `；本机通知探测失败：${localProbe.error}`;
  return text;
}

function handleForegroundPushMessage(eventData = {}) {
  const payload = eventData.payload || {};
  const messageType = payload?.data?.messageType || payload?.data?.data?.messageType;
  if (eventData.notification?.shown === false) {
    showPushToast(`系统通知展示失败：${eventData.notification.error || "unknown"}`, "error");
    return;
  }
  if (messageType === "test") {
    showPushToast("前台已收到测试推送；系统通知应同时出现在通知栏。", "success");
  }
}

const handleForegroundPushMessageBase = handleForegroundPushMessage;
handleForegroundPushMessage = function handleForegroundPushMessageWithBusinessToast(eventData = {}) {
  handleForegroundPushMessageBase(eventData);
  if (eventData.notification?.shown === false) return;
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const messageType = data.messageType || nestedData.messageType;
  const pushThreadId = String(data.threadId || nestedData.threadId || "").trim();
  const pushWorkspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  if (
    ["task_completed", "task_failed"].includes(messageType)
    && (
      currentThreadHasPendingMessages()
      || (pushThreadId && pushThreadId === state.currentThreadId)
      || (!pushThreadId && state.currentThreadId && (!pushWorkspaceId || pushWorkspaceId === state.selectedWorkspaceId))
    )
  ) {
    requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 80 });
  }
  // Do not duplicate real Web Push notifications with an in-app toast.
  // The system notification is the user-visible delivery surface; this handler
  // only refreshes current views when the push relates to the open thread.
};

async function handlePushButton() {
  const button = $("pushToggle");
  if (!button || button.disabled) return;
  const previous = {
    text: button.textContent,
    title: button.title,
    aria: button.getAttribute("aria-label") || "",
  };
  button.disabled = true;
  button.textContent = "...";
  button.title = "Working";
  button.setAttribute("aria-label", "Working");
  button.classList.add("active");
  try {
    const unavailableReason = pushUnavailableReason();
    if (unavailableReason) {
      $("connectionState").textContent = unavailableReason;
      showPushToast(unavailableReason, "error");
      window.alert(unavailableReason);
    } else if (Notification.permission === "granted" && state.pushSubscription) {
      await enablePushNotifications({ forceRenew: true, onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已重新启用，${pushCompletionText(result, localProbe)}`, "success");
    } else {
      await enablePushNotifications({ onProgress: setPushProgress });
      setPushProgress("正在发送测试通知");
      const result = await withTimeout(testPushNotification(), 10000, "测试通知发送超时");
      const localProbe = await withTimeout(runLocalNotificationProbe(result), 8000, "本机通知探测超时").catch((err) => ({ error: err.message || String(err) }));
      setPushProgress(`通知已启用，${pushCompletionText(result, localProbe)}`, "success");
    }
  } catch (err) {
    showPushToast(err.message || String(err), "error");
    showError(err);
  } finally {
    button.disabled = false;
    button.classList.remove("active");
    if (button.textContent === "...") {
      button.textContent = previous.text;
      button.title = previous.title;
      button.setAttribute("aria-label", previous.aria);
    }
    updatePushButton();
  }
}
