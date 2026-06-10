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
  window.__hermesBootTouched = Date.now();
  const text = $("bootSplashText");
  if (text) text.textContent = message;
  const meta = $("bootSplashMeta");
  if (meta) {
    const stage = String(state.startupStage || "").trim();
    const version = state.clientVersion || document.documentElement?.dataset?.clientVersion || "";
    meta.textContent = stage ? `client ${version} · ${stage}` : `client ${version}`;
  }
}

function showBootSplash(message = "正在载入工作区") {
  setBootSplashText(message);
  $("bootRetry")?.classList.add("hidden");
  $("bootResetClient")?.classList.add("hidden");
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("bootSplash")?.classList.remove("hidden");
}

function hideBootSplash() {
  window.__hermesBootCompleted = true;
  $("bootRetry")?.classList.add("hidden");
  $("bootResetClient")?.classList.add("hidden");
  $("bootHardReset")?.classList.add("hidden");
  $("bootSplash")?.classList.add("hidden");
}

function startupErrorMessage(err) {
  const message = String(err?.message || err || "").trim();
  const stage = String(state.startupStage || "").trim();
  const stageText = stage ? `（${stage}）` : "";
  if (/unauthorized/i.test(message)) return message;
  if (/failed to fetch|network|load failed|request timed out|timeout/i.test(message)) {
    return `\u65e0\u6cd5\u8f7d\u5165\u5de5\u4f5c\u533a${stageText}\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002`;
  }
  return message
    ? `\u65e0\u6cd5\u8f7d\u5165\u5de5\u4f5c\u533a${stageText}\uff1a${message}`
    : `\u65e0\u6cd5\u8f7d\u5165\u5de5\u4f5c\u533a${stageText}\uff0c\u8bf7\u91cd\u8bd5\u3002`;
}

function showStartupRecovery(err) {
  setBootSplashText(startupErrorMessage(err));
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("bootSplash")?.classList.remove("hidden");
  $("bootRetry")?.classList.remove("hidden");
  $("bootResetClient")?.classList.remove("hidden");
  $("bootHardReset")?.classList.remove("hidden");
  maybeAutoResetClientAfterStartupFailure(err);
}

function startupAutoResetKey() {
  return `hermesStartupAutoReset:${state.clientVersion || "unknown"}`;
}

function shouldAutoResetClientAfterStartupFailure(err) {
  const message = String(err?.message || err || "");
  if (/unauthorized/i.test(message)) return false;
  if (typeof clientVersionTargetFromUrl === "function") {
    const targetVersion = clientVersionTargetFromUrl();
    if (targetVersion && targetVersion === normalizeClientVersion(state.clientVersion)) return false;
  }
  try {
    return sessionStorage.getItem(startupAutoResetKey()) !== "1";
  } catch (_) {
    return false;
  }
}

function maybeAutoResetClientAfterStartupFailure(err) {
  if (typeof resetClientAndReload !== "function") return;
  if (!shouldAutoResetClientAfterStartupFailure(err)) return;
  try {
    sessionStorage.setItem(startupAutoResetKey(), "1");
  } catch (_) {
    return;
  }
  window.setTimeout(() => {
    resetClientAndReload("startup_failed");
  }, 900);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function bootstrapWithRetry(options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3) || 3);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await bootstrap();
      return;
    } catch (err) {
      lastError = err;
      if (/unauthorized/i.test(String(err?.message || err || ""))) throw err;
      if (attempt >= attempts) break;
      setBootSplashText(`\u6b63\u5728\u91cd\u65b0\u8f7d\u5165\u5de5\u4f5c\u533a (${attempt + 1}/${attempts})`);
      await sleep(700 * attempt);
    }
  }
  throw lastError || new Error("Workspace bootstrap failed");
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
  if (typeof scheduleClientLayoutDiagnostics === "function") scheduleClientLayoutDiagnostics("show_login", [0, 300, 1200]);
}

function showApp() {
  hideBootSplash();
  state.mobileBrowserShellBlocked = false;
  window.__hermesMobileBrowserShellBlocked = false;
  document.body?.classList?.remove?.("preflight-mobile-browser-shell");
  document.getElementById("mobileBrowserShellPreflight")?.remove?.();
  $("setup")?.classList.add("hidden");
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("app").classList.remove("mobile-browser-shell-blocked");
  restoreVisibleAppScroll();
  if (typeof settleMobileBottomNavReservation === "function") settleMobileBottomNavReservation("app_show");
  else updateMobileBottomNavReservation();
  if (typeof scheduleClientLayoutDiagnostics === "function") scheduleClientLayoutDiagnostics("show_app", [0, 300, 1200, 2600]);
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
  showBootSplash("正在打开 Home AI");
  await bootstrap();
  if (!state.mobileBrowserShellBlocked) showApp();
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
  showBootSplash("正在打开 Home AI");
  try {
    await bootstrap();
    if (!state.mobileBrowserShellBlocked) showApp();
  } catch (err) {
    showLogin(err.message || String(err));
  }
}

async function bootstrap() {
  state.startupStage = "\u72b6\u6001";
  renderClientVersion();
  await startupPerfStep("status", () => loadStatus());
  state.startupStage = "\u7248\u672c";
  await startupPerfStep("client-version", () => checkClientVersion("bootstrap")).catch(() => {});
  checkAppUpdate("login").catch(() => {});
  state.startupStage = "\u63a8\u9001";
  await startupPerfStep("push-status", () => loadPushStatus({ subscription: false })).catch(() => updatePushButton());
  if (blockMobileBrowserShellAppLaunch()) return;
  state.startupStage = "\u5de5\u4f5c\u533a";
  await startupPerfStep("workspaces", () => loadWorkspaces());
  if (!applyInitialRouteFromUrl() && !applyRestoredAppRouteSnapshot()) applyDefaultLaunchView();
  state.startupStage = "\u9879\u76ee";
  await startupPerfStep("push-context", () => syncPushSubscriptionContext()).catch(() => {});
  await startupPerfStep("projects", () => loadProjects());
  state.startupStage = "\u89c6\u56fe";
  await startupPerfStep(`selected-view:${state.viewMode || "unknown"}`, () => loadSelectedView());
  restoreAppRouteSnapshotPosition();
  state.startupStage = "";
  startClientRefreshChecks();
  await startupPerfStep("connect-events", () => Promise.resolve(connectEvents()));
  if (typeof refreshPushSubscriptionAfterStartup === "function") refreshPushSubscriptionAfterStartup();
}

function normalizedRouteView(value, fallback = "") {
  const view = String(value || "").trim().toLowerCase();
  if (view === "inbox" || view === "action-inbox" || view === "actions") return "inbox";
  if (view === "automation" || view === "automations" || view === "cron") return "automation";
  if (view === "learning" || view === "coins" || view === "rewards" || view === "redeem") return "learning";
  if (view === "wardrobe" || view === "closet" || view === "outfit") return "wardrobe";
  if (view === "codex" || view === "codex-mobile") return "codex";
  if (view === "finance" || view === "accounting" || view === "ledger") return "finance";
  if (view === "email" || view === "mail" || view === "mailbox") return "email";
  if (view === "health") return "health";
  if (view === "note" || view === "notes") return "note";
  if (view === "growth" || view === "education") return "growth";
  if (view === "todo" || view === "todos") return "todos";
  if (view === "directory" || view === "directories" || view === "projects") return "projects";
  if (view === "task" || view === "tasks") return "tasks";
  if (view === "single" || view === "stream") return "single";
  return fallback;
}

function pluginContextIdFromTaskGroupId(taskGroupId = "") {
  const match = String(taskGroupId || "").trim().match(/^plugin:(.+)$/);
  return match ? match[1].trim() : "";
}

function routePluginContextId(params, routeView = "", taskGroupId = "") {
  if (!params) return "";
  const explicit = String(
    params.get("pluginContextNavPluginId")
    || params.get("pluginContextId")
    || params.get("pluginContext")
    || "",
  ).trim();
  const candidates = [
    explicit,
    pluginContextIdFromTaskGroupId(taskGroupId),
    params.get("pluginId") || "",
    routeView,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const knownPluginTopics = new Set(["wardrobe", "finance", "email", "health", "note", "growth"]);
  for (const candidate of candidates) {
    const id = candidate === "codex-mobile" || candidate === "codex" ? "" : candidate;
    if (!id) continue;
    if (typeof pluginTopicDefById === "function") {
      const def = pluginTopicDefById(id);
      if (def && !def.builtinKind) return def.id;
    }
    if (knownPluginTopics.has(id)) return id;
  }
  return "";
}

function sameOriginRouteUrl(value) {
  try {
    const parsed = new URL(value || "/", window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch (_) {
    return null;
  }
}

function normalizeHermesAppShellPath(pathname = "") {
  const value = String(pathname || "/").trim() || "/";
  if (value === "/" || value === "/index.html") return "/";
  const clean = value.split(/[?#]/)[0] || "/";
  if (clean.includes(".")) return "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function hermesAppShellPath(pathname = "") {
  const current = normalizeHermesAppShellPath(window.location?.pathname || "/");
  const requestedValue = String(pathname || "").trim();
  if (!requestedValue || requestedValue === "/" || requestedValue === "/index.html") return current;
  const requested = normalizeHermesAppShellPath(requestedValue);
  return requested === "/" && current !== "/" ? current : requested;
}

function hermesAppShellRouteForParams(params, options = {}) {
  const nextParams = new URLSearchParams(params || "");
  if (!nextParams.has("source")) nextParams.set("source", "pwa");
  const search = nextParams.toString();
  return `${hermesAppShellPath(options.pathname)}${search ? `?${search}` : ""}`;
}

function hermesAppShellRouteForUrl(value) {
  const parsed = value instanceof URL ? value : sameOriginRouteUrl(value);
  if (!parsed) return hermesAppShellRouteForParams(new URLSearchParams());
  const params = new URLSearchParams(parsed.search || "");
  return `${hermesAppShellRouteForParams(params, { pathname: parsed.pathname })}${parsed.hash || ""}`;
}

function recordNavigationDiagnostic(eventName, fields = {}) {
  try {
    const key = "hermesNavigationDiagnostics";
    const entry = Object.assign({
      at: new Date().toISOString(),
      event: String(eventName || "").slice(0, 80),
      clientVersion: state.clientVersion || document.documentElement?.dataset?.clientVersion || "",
      viewMode: state.viewMode || "",
      standalone: hermesRouteStandaloneAppWindow(),
      browserShell: hermesRouteMobileBrowserShell(),
      preflightBlocked: window.__hermesMobileBrowserShellBlocked === true,
      width: Math.round(Number(window.innerWidth || window.visualViewport?.width || window.screen?.width || 0) || 0),
      touch: Number(navigator.maxTouchPoints || 0) || 0,
    }, fields || {});
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const rows = Array.isArray(existing) ? existing : [];
    rows.push(entry);
    localStorage.setItem(key, JSON.stringify(rows.slice(-40)));
  } catch (_) {}
}

function navigationDiagnosticSummary() {
  try {
    const raw = localStorage.getItem("hermesNavigationDiagnostics") || "[]";
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

async function copyNavigationDiagnostics() {
  const rows = navigationDiagnosticSummary();
  const text = JSON.stringify(rows, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    showPushToast?.("导航诊断已复制", "success");
    return;
  }
  window.prompt("复制导航诊断", text);
}

function hermesRouteStandaloneAppWindow() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigator.standalone === true,
  );
}

function hermesRouteMobileBrowserShell() {
  if (hermesRouteStandaloneAppWindow()) return false;
  const ua = navigator.userAgent || "";
  const mobileUa = /iPad|iPhone|iPod|Android|Mobile/i.test(ua)
    || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
  const touchCapable = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  const widths = [
    window.innerWidth,
    window.visualViewport?.width,
    window.screen?.width,
    window.screen?.availWidth,
  ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  const narrowViewport = widths.length ? Math.min(...widths) <= 900 : false;
  return Boolean(mobileUa || coarsePointer || touchCapable || narrowViewport);
}

function shouldBlockMobileBrowserShellApp() {
  return window.__hermesMobileBrowserShellBlocked === true;
}

function mobileBrowserShellBlockedTitle() {
  return "\u8bf7\u4ece\u4e3b\u5c4f\u5e55\u5e94\u7528\u6253\u5f00";
}

function mobileBrowserShellBlockedMessage() {
  return "\u5f53\u524d\u9875\u9762\u6b63\u5728\u79fb\u52a8\u6d4f\u89c8\u5668\u58f3\u4e2d\u8fd0\u884c\u3002Home AI \u4e0d\u5728\u8fd9\u4e2a\u58f3\u91cc\u663e\u793a\u6536\u4ef6\u7bb1\u3001\u81ea\u52a8\u5316\u8be6\u60c5\u6216\u6587\u4ef6\u9884\u89c8\uff1b\u8bf7\u70b9\u5de6\u4e0a\u89d2\u5173\u95ed\uff0c\u7136\u540e\u4ece\u4e3b\u5c4f\u5e55 Home AI \u56fe\u6807\u6253\u5f00\u3002";
}

function mobileBrowserShellDiagnosticText() {
  const mode = hermesRouteStandaloneAppWindow() ? "standalone" : "browser";
  const width = Math.round(Number(window.innerWidth || window.visualViewport?.width || window.screen?.width || 0) || 0);
  const touch = Number(navigator.maxTouchPoints || 0) || 0;
  return `client=${state.clientVersion || ""} mode=${mode} width=${width} touch=${touch}`;
}

function showMobileBrowserShellBlocked() {
  state.mobileBrowserShellBlocked = true;
  recordNavigationDiagnostic("mobile_browser_shell_blocked", { source: window.__hermesMobileBrowserShellBlocked === true ? "index_preflight" : "app_router" });
  replaceBlockedBrowserShellRoute();
  hideBootSplash();
  document.body?.classList?.remove?.("preflight-mobile-browser-shell");
  document.getElementById("mobileBrowserShellPreflight")?.remove?.();
  $("setup")?.classList.add("hidden");
  $("login")?.classList.add("hidden");
  const app = $("app");
  if (app) {
    app.classList?.remove?.("hidden");
    app.classList?.add?.("mobile-browser-shell-blocked");
  }
  try {
    const title = $("threadTitle");
    const meta = $("threadMeta");
    const list = $("threadList");
    const conversation = $("conversation");
    const connectionState = $("connectionState");
    if (title) title.textContent = "Home AI";
    if (meta) meta.textContent = mobileBrowserShellBlockedTitle();
    if (list) list.innerHTML = "";
    if (connectionState) connectionState.textContent = "\u6d4f\u89c8\u5668\u58f3\u5df2\u963b\u6b62";
    if (conversation) {
      conversation.innerHTML = `
        <section class="mobile-browser-shell-block" role="alert">
          <div class="mobile-browser-shell-block-mark">H</div>
          <h1>${escapeHtml(mobileBrowserShellBlockedTitle())}</h1>
          <p>${escapeHtml(mobileBrowserShellBlockedMessage())}</p>
          <code class="mobile-browser-shell-block-diagnostic">${escapeHtml(mobileBrowserShellDiagnosticText())}</code>
          <div class="mobile-browser-shell-block-actions">
            <button class="secondary-small" type="button" data-mobile-browser-shell-copy>${"\u590d\u5236\u8bca\u65ad"}</button>
            <button class="secondary-small" type="button" data-mobile-browser-shell-close>${"\u8fd4\u56de Home AI"}</button>
          </div>
        </section>
      `;
      conversation.querySelector("[data-mobile-browser-shell-copy]")?.addEventListener("click", () => {
        copyNavigationDiagnostics().catch(() => {});
      });
      conversation.querySelector("[data-mobile-browser-shell-close]")?.addEventListener("click", () => {
        state.mobileBrowserShellBlocked = false;
        window.__hermesMobileBrowserShellBlocked = false;
        replaceBlockedBrowserShellRoute();
        applyDefaultLaunchView();
        showApp();
        loadSelectedView?.();
      });
      conversation.scrollTop = 0;
    }
    if (typeof configureComposer === "function") configureComposer({ enabled: false, placeholder: "Home AI" });
  } catch (_) {}
}

function blockMobileBrowserShellAppLaunch() {
  if (window.__hermesMobileBrowserShellDetected === true || hermesRouteMobileBrowserShell()) {
    recordNavigationDiagnostic("mobile_browser_shell_app_launch_allowed", {
      source: window.__hermesMobileBrowserShellDetected === true ? "index_detection" : "app_router",
    });
  }
  if (!shouldBlockMobileBrowserShellApp()) return false;
  recordNavigationDiagnostic("legacy_mobile_browser_shell_block_recovered", {});
  state.mobileBrowserShellBlocked = false;
  window.__hermesMobileBrowserShellBlocked = false;
  document.body?.classList?.remove?.("preflight-mobile-browser-shell");
  document.getElementById("mobileBrowserShellPreflight")?.remove?.();
  return false;
}

function showHermesAppWindowRequiredMessage() {
  const message = typeof hermesAppWindowRequiredText === "function"
    ? hermesAppWindowRequiredText()
    : "Please reopen Home AI from the Home Screen app before opening internal detail pages.";
  try {
    const connectionState = $("connectionState");
    if (connectionState) connectionState.textContent = message;
  } catch (_) {}
  try {
    if (typeof showPushToast === "function") showPushToast(message, "error");
  } catch (_) {}
  try {
    window.alert(message);
  } catch (_) {}
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
    window.history.replaceState(nextState, "", hermesAppShellRouteForParams(new URLSearchParams()));
  } catch (_) {}
}

function requireHermesAppWindowForRoute(params) {
  if (!routeParamsHaveHermesOwnedDetailTarget(params)) return true;
  if (hermesRouteMobileBrowserShell()) {
    recordNavigationDiagnostic("mobile_browser_shell_internal_route_allowed", {});
    return true;
  }
  if (typeof requireHermesAppWindowForNavigation === "function") {
    const allowed = requireHermesAppWindowForNavigation();
    if (!allowed) replaceBlockedBrowserShellRoute();
    return allowed;
  }
  return true;
}

function currentHermesOwnedDetailRouteParams() {
  const params = new URLSearchParams();
  if (state.viewMode === "automation" && state.selectedAutomationId) {
    params.set("view", "automation");
    params.set("automationId", state.selectedAutomationId);
  } else if (state.viewMode === "inbox" && state.selectedActionInboxItemId) {
    params.set("view", "inbox");
    params.set("inboxItemId", state.selectedActionInboxItemId);
  } else if (state.viewMode === "todos" && state.selectedTodoId) {
    params.set("view", "todos");
    params.set("todoId", state.selectedTodoId);
  } else if (state.viewMode === "learning" && state.selectedLearningTaskCardId) {
    params.set("view", "learning");
    params.set("taskCardId", state.selectedLearningTaskCardId);
  } else if (state.viewMode === "tasks" && state.currentTaskGroupId) {
    params.set("view", "tasks");
    params.set("taskGroupId", state.currentTaskGroupId);
  }
  return routeParamsHaveHermesOwnedDetailTarget(params) ? params : null;
}

function clearHermesOwnedDetailStateAfterBrowserShellBlock() {
  const returnToInbox = state.viewMode === "automation"
    && (state.automationReturnRoute === "inbox" || state.automationReturnInboxItemId);
  if (state.viewMode === "automation") {
    Object.assign(state, {
      selectedAutomationId: "",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    });
    if (returnToInbox) state.viewMode = "inbox";
  } else if (state.viewMode === "inbox") {
    state.selectedActionInboxItemId = "";
  } else if (state.viewMode === "todos") {
    state.selectedTodoId = "";
  } else if (state.viewMode === "learning") {
    state.selectedLearningTaskCardId = "";
  } else if (state.viewMode === "tasks") {
    Object.assign(state, { currentTaskGroupId: "", currentThread: null, currentThreadId: "" });
  }
  state.automationReturnRoute = "";
  state.automationReturnScope = "";
  state.automationReturnInboxItemId = "";
  localStorage.setItem("hermesWebViewMode", state.viewMode || "single");
}

function guardHermesOwnedSelectedDetailNavigation() {
  const params = currentHermesOwnedDetailRouteParams();
  if (!params) return true;
  if (requireHermesAppWindowForRoute(params)) return true;
  clearHermesOwnedDetailStateAfterBrowserShellBlock();
  showMobileBrowserShellBlocked();
  return false;
}

function applyRouteParams(params) {
  const automationId = String(params.get("automationId") || "").trim(); const inboxItemId = String(params.get("inboxItemId") || params.get("actionInboxItemId") || "").trim();
  const automationReturnTo = String(params.get("returnTo") || params.get("return_route") || "").trim().toLowerCase();
  const automationReturnScope = String(params.get("returnScope") || params.get("return_scope") || "").trim().toLowerCase();
  const automationReturnInboxItemId = String(params.get("sourceInboxItemId") || params.get("source_inbox_item_id") || "").trim();
  const todoId = String(params.get("todoId") || "").trim(); const taskCardId = String(params.get("taskCardId") || "").trim();
  const taskGroupId = String(params.get("taskGroupId") || params.get("taskId") || "").trim();
  const messageId = String(params.get("messageId") || "").trim();
  const routeThreadId = String(params.get("threadId") || params.get("thread_id") || "").trim();
  const projectId = String(params.get("projectId") || "").trim();
  const subprojectId = String(params.get("subprojectId") || "").trim();
  const directoryPath = String(params.get("directoryPath") || "").trim();
  const directoryRoot = String(params.get("directoryRoot") || "").trim();
  const readingQuizRequested = ["1", "true", "yes"].includes(String(params.get("readingQuiz") || params.get("reading_quiz") || "").trim().toLowerCase());
  const assessmentExamRequested = ["1", "true", "yes"].includes(String(params.get("assessmentExam") || params.get("assessment_exam") || "").trim().toLowerCase());
  const weixinChatRequested = ["1", "true", "yes"].includes(String(params.get("weixinChat") || params.get("weixin_chat") || "").trim().toLowerCase());
  const groupChatRequested = ["1", "true", "yes"].includes(String(params.get("groupChat") || params.get("group_chat") || "").trim().toLowerCase());
  let routeView = normalizedRouteView(params.get("view") || params.get("viewMode"), inboxItemId ? "inbox" : automationId ? "automation" : taskCardId ? "learning" : todoId ? "todos" : taskGroupId ? "tasks" : (groupChatRequested || weixinChatRequested) ? "single" : "");
  const pluginContextNavPluginId = routePluginContextId(params, routeView, taskGroupId);
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
    state.pluginContextNavPluginId = pluginContextNavPluginId;
  }
  if (routeView === "codex" && typeof setCodexPluginOpenRoute === "function") {
    setCodexPluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "wardrobe" && typeof setWardrobePluginOpenRoute === "function") {
    setWardrobePluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "finance" && typeof setFinancePluginOpenRoute === "function") {
    setFinancePluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "email" && typeof setEmailPluginOpenRoute === "function") {
    setEmailPluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "health" && typeof setHealthPluginOpenRoute === "function") {
    setHealthPluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "note" && typeof setNotePluginOpenRoute === "function") {
    setNotePluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (routeView === "growth" && typeof setGrowthPluginOpenRoute === "function") {
    setGrowthPluginOpenRoute({
      pluginRoute: params.get("pluginRoute") || params.get("route") || "",
      pluginItemId: params.get("pluginItemId") || params.get("itemId") || "",
      pluginThreadId: params.get("pluginThreadId") || params.get("threadId") || "",
      pluginTaskId: params.get("pluginTaskId") || params.get("taskId") || "",
      sourceTurnId: params.get("sourceTurnId") || params.get("turnId") || "",
    });
  }
  if (["codex", "finance", "email", "health", "note", "growth"].includes(routeView) && typeof restoreEmbeddedPluginReturnRouteFromSnapshotParams === "function") {
    restoreEmbeddedPluginReturnRouteFromSnapshotParams(params, routeView);
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
    if (routeThreadId) state.currentThreadId = routeThreadId;
    if (messageId) {
      setRouteScrollTarget(taskGroupId || (groupChatRequested ? "group-chat" : "chat"), messageId);
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
    window.history.replaceState(nextState, "", hermesAppShellRouteForParams(params));
  } catch (_) {}
}

async function openHermesInternalRoute(value) {
  recordNavigationDiagnostic("open_hermes_internal_route_start", { route: String(value || "").slice(0, 240) });
  const parsed = sameOriginRouteUrl(value);
  if (!parsed) {
    recordNavigationDiagnostic("open_hermes_internal_route_reject", { reason: "not_same_origin", route: String(value || "").slice(0, 240) });
    return;
  }
  const params = new URLSearchParams(parsed.search || "");
  if (!requireHermesAppWindowForRoute(params)) {
    recordNavigationDiagnostic("open_hermes_internal_route_blocked", { route: `${parsed.pathname}${parsed.search}${parsed.hash}` });
    return;
  }
  if (!applyRouteParams(params)) {
    recordNavigationDiagnostic("open_hermes_internal_route_noop", { route: `${parsed.pathname}${parsed.search}${parsed.hash}` });
    return;
  }
  suppressComposerAutoFocus(1200);
  blurComposerInput();
  try {
    window.TaskDocumentPreviewUi?.closeArtifactPreviewOverlays?.();
  } catch (_) {}
  closeSidebar();
  closeTopMoreMenu();
  const nextRoute = hermesAppShellRouteForUrl(parsed);
  try {
    const nextState = Object.assign({}, window.history.state || {}, { hermesWebBase: true });
    window.history.replaceState(nextState, "", nextRoute);
  } catch (_) {
    // Route state is already applied; URL replacement is only for reload/back consistency.
  }
  persistAppRouteSnapshot("internal_route");
  recordNavigationDiagnostic("open_hermes_internal_route_applied", {
    route: nextRoute,
    nextViewMode: state.viewMode || "",
    selectedAutomationId: state.selectedAutomationId || "",
    selectedActionInboxItemId: state.selectedActionInboxItemId || "",
    automationReturnRoute: state.automationReturnRoute || "",
  });
  await loadSelectedView({ forceTaskListReload: true, skipSingleWindowCache: true });
}

async function openNotificationRoute(value) {
  return openHermesInternalRoute(value);
}

function applyDefaultLaunchView() {
  state.viewMode = "tasks";
  setSingleWindowMode("chat");
  state.weixinChatOpen = false;
  state.currentTaskGroupId = "";
  state.skillDetail = null;
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
}

function restoreVisibleAppScroll() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!isSingleWindowChatView()) return;
      const conversation = $("conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    }));
}

function applyReasoningInfo(info = {}) {
  if (!info || typeof info !== "object") return;
  const options = normalizeReasoningOptions(info.efforts || info.options || []);
  state.reasoningOptions = options;
  state.runtimeModelOptions = Array.isArray(info.modelOptions) ? info.modelOptions : [];
  state.defaultModelId = String(info.defaultModelId || state.defaultModelId || "").trim();
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
  $("connectionState").textContent = status.ok ? "Home AI OK" : `Home AI unavailable: ${status.error || "unknown"}`;
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
      ownerRootFallbackLabel: String(status.display.ownerRootFallbackLabel || state.displayConfig.ownerRootFallbackLabel || "Owner"),
    };
  }
  if (status.reasoning) applyReasoningInfo(status.reasoning);
  if (status.push) { state.pushStatus = status.push; updatePushButton(); }
}
