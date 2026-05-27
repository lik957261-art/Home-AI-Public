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
  const currentModel = selectedDefaultComposerModelOption().id;
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
  if (isIosPushClient() && !isStandalonePwa()) return hermesAppWindowRequiredText();
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
  const clientContext = pushClientContext();
  const result = await withTimeout(api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: state.pushSubscription.toJSON(),
      deviceLabel: navigator.platform || navigator.userAgent || "device",
      workspaceId: state.selectedWorkspaceId || "owner",
      clientContext,
      displayMode: clientContext.displayMode,
      standalone: clientContext.standalone,
      clientVersion: clientContext.clientVersion,
      platform: clientContext.platform,
      userAgent: clientContext.userAgent,
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
  const unavailableReason = pushUnavailableReason();
  if (unavailableReason) throw new Error(unavailableReason);
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
  const routeParams = new URLSearchParams({ view: "tasks", workspaceId });
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
      url: typeof hermesAppShellRouteForParams === "function"
        ? hermesAppShellRouteForParams(routeParams)
        : `?${routeParams.toString()}`,
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
  if (typeof refreshAutomationAfterPush === "function") refreshAutomationAfterPush(eventData).catch(showError);
  if (typeof refreshActionInboxAfterPush === "function") refreshActionInboxAfterPush(eventData).catch(showError);
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
