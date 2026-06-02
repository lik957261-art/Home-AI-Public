"use strict";

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

const HERMES_CLIENT_VERSION_AUTO_RESET_SOURCES = new Set([
  "bootstrap",
  "status",
  "response",
  "visible",
  "focus",
  "timer",
  "push",
  "service-worker",
  "update-applied",
]);

function clientVersionAutoResetKey(serverVersion) {
  return `hermesClientVersionAutoReset:${serverVersion}`;
}

function shouldAutoResetForClientVersionMismatch(serverVersion, source = "") {
  const version = normalizeClientVersion(serverVersion);
  if (!version || !HERMES_CLIENT_VERSION_AUTO_RESET_SOURCES.has(String(source || ""))) return false;
  try {
    const key = clientVersionAutoResetKey(version);
    if (window.sessionStorage?.getItem(key) === "1") return false;
    window.sessionStorage?.setItem(key, "1");
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleClientVersionAutoReset(serverVersion, source = "") {
  if (!shouldAutoResetForClientVersionMismatch(serverVersion, source)) return false;
  showBootSplash("正在更新客户端");
  window.setTimeout(() => {
    reloadForClientUpdate(`client-version-${String(source || "mismatch").slice(0, 40)}`);
  }, 120);
  return true;
}

function handleClientVersion(info, source = "") {
  const serverVersion = normalizeClientVersion(info?.version || info?.clientVersion || "");
  if (!serverVersion) return;
  state.serverClientVersion = serverVersion;
  const clientVersion = normalizeClientVersion(state.clientVersion);
  if (clientVersion && serverVersion !== clientVersion) {
    showRefreshNotice(serverVersion, source);
    scheduleClientVersionAutoReset(serverVersion, source);
    return;
  }
  hideRefreshNotice();
}

async function checkClientVersion(reason = "manual") {
  const query = new URLSearchParams();
  if (state.clientVersion) query.set("clientVersion", state.clientVersion);
  if (reason) query.set("reason", reason);
  const info = await api(`/api/client-version?${query.toString()}`);
  handleClientVersion(info, reason || "poll");
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

function reloadWithoutBfcache(reason = "") {
  const url = new URL(window.location.href);
  url.searchParams.set("_hmv", String(Date.now()));
  if (reason) url.searchParams.set("reason", String(reason).slice(0, 80));
  window.location.replace(url.href);
}

function resetClientAndReload(reason = "", options = {}) {
  const params = new URLSearchParams({ _hmv: String(Date.now()) });
  if (reason) params.set("reason", String(reason).slice(0, 80));
  if (options?.hard) params.set("hard", "1");
  window.location.replace(`/client-reset.html?${params.toString()}`);
}

function reloadForClientUpdate(reason = "") {
  showBootSplash("正在更新客户端");
  if (!("serviceWorker" in navigator)) {
    reloadWithoutBfcache(reason);
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
    .finally(() => reloadWithoutBfcache(reason));
}

function isStandalonePwa() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigator.standalone === true,
  );
}

function currentDisplayMode() {
  if (window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true) return "standalone";
  if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) return "fullscreen";
  if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) return "minimal-ui";
  return "browser";
}

function isIosPushClient() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && /Mobile\/\S+.*Safari/i.test(ua));
}

function mobileBrowserShellClient() {
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

function pushClientContext() {
  return {
    displayMode: currentDisplayMode(),
    standalone: isStandalonePwa(),
    clientVersion: state.clientVersion || document.documentElement?.dataset?.clientVersion || "",
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",
    origin: window.location.origin || "",
    host: window.location.host || "",
    path: window.location.pathname || "/",
  };
}

function hermesBrowserShellNavigationBlocked() {
  return mobileBrowserShellClient() && !isStandalonePwa();
}

function hermesAppWindowRequiredText() {
  return "\u8bf7\u4ece\u4e3b\u5c4f\u5e55\u7684 Hermes Mobile \u5e94\u7528\u6253\u5f00\u540e\u518d\u8fdb\u5165\u8be6\u60c5\uff0c\u4e0d\u8981\u5728 Safari/\u6d4f\u89c8\u5668\u6846\u4e2d\u6253\u5f00\u5185\u90e8\u9875\u9762\u3002";
}

function requireHermesAppWindowForNavigation() {
  if (!hermesBrowserShellNavigationBlocked()) return true;
  const message = hermesAppWindowRequiredText();
  try {
    const connectionState = $("connectionState");
    if (connectionState) connectionState.textContent = message;
  } catch (_) {}
  try {
    showPushToast(message, "error");
  } catch (_) {}
  try {
    window.alert(message);
  } catch (_) {}
  return false;
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

function themeModeOption(value) {
  const id = String(value || "").trim();
  return THEME_MODE_OPTIONS.find((option) => option.id === id) || THEME_MODE_OPTIONS[0];
}

function normalizeThemePreference(value) {
  return themeModeOption(value).id;
}

function applyThemePreference(value = state.themeMode) {
  const option = themeModeOption(value);
  state.themeMode = option.id;
  if (window.hermesMobileTheme?.apply) {
    window.hermesMobileTheme.apply(option.id);
  } else {
    document.documentElement.dataset.theme = option.id;
  }
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

function setThemePreference(value) {
  const option = themeModeOption(value);
  state.themeMode = option.id;
  localStorage.setItem("hermesWebTheme", option.id);
  applyThemePreference(option.id);
  renderSettingsOverlay();
}

function setDefaultComposerModelPreference(value) {
  const option = composerModelOption(value);
  state.defaultComposerModelId = option.id;
  if (option.id === DEFAULT_COMPOSER_MODEL_ID) {
    localStorage.removeItem("hermesDefaultComposerModel");
  } else {
    localStorage.setItem("hermesDefaultComposerModel", option.id);
  }
  renderSettingsOverlay();
  renderComposerContext();
  if (typeof updateGroupMentionMenu === "function") updateGroupMentionMenu();
}

function startThemePreferenceWatcher() {
  if (!window.matchMedia || state.themePreferenceWatcherStarted) return;
  state.themePreferenceWatcherStarted = true;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => {
    if (normalizeThemePreference(state.themeMode) === "system") applyThemePreference("system");
  };
  if (media.addEventListener) media.addEventListener("change", onSystemThemeChange);
  else if (media.addListener) media.addListener(onSystemThemeChange);
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
  const currentTheme = normalizeThemePreference(state.themeMode);
  const currentFamily = normalizeFontFamilyPreference(state.fontFamily);
  const currentModel = selectedDefaultComposerModelOption().id;
  const themeOptions = THEME_MODE_OPTIONS.map((option) => {
    const active = option.id === currentTheme;
    return `<button class="theme-mode-option${active ? " active" : ""}" type="button" data-theme-mode-option="${escapeHtml(option.id)}">
      <span class="theme-mode-option-name">${escapeHtml(option.label)}</span>
      <span class="theme-mode-option-meta">${escapeHtml(option.description || "")}</span>
    </button>`;
  }).join("");
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
  const modelOptions = composerModelOptions().map((option) => {
    const active = option.id === currentModel;
    const modelMeta = [option.model || "\u8fd0\u884c\u65f6\u9ed8\u8ba4", option.provider].filter(Boolean).join(" / ");
    return `<button class="default-model-option${active ? " active" : ""}" type="button" data-default-model-option="${escapeHtml(option.id)}">
      <span class="default-model-option-name">${escapeHtml(option.label)}</span>
      <span class="default-model-option-meta">${escapeHtml(modelMeta || option.description || "")}</span>
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
      <div class="settings-row-title">外观</div>
      <div class="theme-mode-options" role="group" aria-label="外观">
        ${themeOptions}
      </div>
      <div class="settings-row-title">字体大小</div>
      <div class="font-size-options" role="group" aria-label="字体大小">
        ${options}
      </div>
      <div class="settings-row-title">字体</div>
      <div class="font-family-options" role="group" aria-label="字体">
        ${familyOptions}
      </div>
      <div class="settings-row-title">\u9ed8\u8ba4\u6a21\u578b</div>
      <div class="default-model-options" role="group" aria-label="\u9ed8\u8ba4\u6a21\u578b">
        ${modelOptions}
      </div>
      <div class="settings-row-title">\u8d26\u53f7</div>
      <div class="settings-account-actions">
        <button class="settings-logout-button" type="button" data-settings-logout>\u9000\u51fa\u8d26\u53f7</button>
        <span>\u53ea\u6e05\u9664\u5f53\u524d\u8bbe\u5907\u4fdd\u5b58\u7684 Access Key\uff0c\u670d\u52a1\u5668\u4e0a\u7684 key \u4e0d\u4f1a\u88ab\u64a4\u9500\u3002</span>
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
  overlay.querySelectorAll("[data-theme-mode-option]").forEach((button) => {
    button.addEventListener("click", () => setThemePreference(button.dataset.themeModeOption || DEFAULT_THEME_MODE));
  });
  overlay.querySelectorAll("[data-font-size-option]").forEach((button) => {
    button.addEventListener("click", () => setFontSizePreference(button.dataset.fontSizeOption || DEFAULT_FONT_SIZE));
  });
  overlay.querySelectorAll("[data-font-family-option]").forEach((button) => {
    button.addEventListener("click", () => setFontFamilyPreference(button.dataset.fontFamilyOption || DEFAULT_FONT_FAMILY));
  });
  overlay.querySelectorAll("[data-default-model-option]").forEach((button) => {
    button.addEventListener("click", () => setDefaultComposerModelPreference(button.dataset.defaultModelOption || DEFAULT_COMPOSER_MODEL_ID));
  });
  overlay.querySelector("[data-settings-logout]")?.addEventListener("click", logoutCurrentAccount);
}

function openSettings(options = {}) {
  closeTopMoreMenu();
  state.settingsReturnToSidebar = Boolean(options.returnToSidebar || $("sidebar")?.classList.contains("open"));
  closeSidebar();
  state.settingsOpen = true;
  renderSettingsOverlay();
}

function closeSettings() {
  const returnToSidebar = Boolean(state.settingsReturnToSidebar);
  state.settingsOpen = false;
  state.settingsReturnToSidebar = false;
  renderSettingsOverlay();
  if (returnToSidebar && typeof openSidebar === "function") openSidebar({ resetScroll: false });
}
