const PWA_PUSH_STATUS_MODEL_VERSION = "20260704-vite-pwa-push-status-model-v1";

const VALID_PERMISSIONS = new Set(["default", "granted", "denied"]);
const VALID_DISPLAY_MODES = new Set(["browser", "standalone", "fullscreen", "minimal-ui", "native-shell"]);

function cleanString(value, max = 1000) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 1000));
}

function normalizeClientVersion(value) {
  return cleanString(value, 160).trim();
}

function compactClientVersion(value) {
  const version = normalizeClientVersion(value);
  const match = version.match(/^\d{8}-(\d{4})$/);
  if (match) return match[1];
  if (version.length > 8) return version.slice(-8);
  return version;
}

function normalizePermission(permission = "default") {
  const value = cleanString(permission, 40).trim().toLowerCase();
  return VALID_PERMISSIONS.has(value) ? value : "default";
}

function normalizeDisplayMode(displayMode = "browser") {
  const value = cleanString(displayMode, 40).trim().toLowerCase();
  return VALID_DISPLAY_MODES.has(value) ? value : "browser";
}

function normalizeCapabilities(input = {}) {
  return {
    secureContext: input.secureContext !== false,
    serviceWorker: input.serviceWorker !== false,
    pushManager: input.pushManager !== false,
    notification: input.notification !== false,
    iosClient: Boolean(input.iosClient),
    standalone: Boolean(input.standalone),
    displayMode: normalizeDisplayMode(input.displayMode || (input.standalone ? "standalone" : "browser")),
    permission: normalizePermission(input.permission || "default"),
    serverEnabled: input.serverEnabled !== false,
    publicKey: cleanString(input.publicKey || "preview_public_key", 160),
    hasSubscription: Boolean(input.hasSubscription),
    attempted: Math.max(0, Number(input.attempted || 0) || 0),
    sent: Math.max(0, Number(input.sent || 0) || 0),
    failed: Math.max(0, Number(input.failed || 0) || 0),
  };
}

function pwaWindowRequiredText() {
  return "iOS 需要从 Safari 添加到主屏幕后使用 Web Push。";
}

function pwaRequirementHint(input = {}) {
  const standalone = Boolean(input.standalone);
  const installed = Boolean(input.installed);
  const secureContext = input.secureContext !== false;
  const serviceWorker = input.serviceWorker !== false;
  const serviceWorkerReady = Boolean(input.serviceWorkerReady);
  const serviceWorkerError = cleanString(input.serviceWorkerError || "", 240).trim();
  if (standalone || installed) return "当前已经以桌面应用模式运行。";
  if (!secureContext) return "当前连接不是安全上下文。多数浏览器要求 HTTPS 或 localhost 才能安装 PWA 和启用 Service Worker。";
  if (!serviceWorker) return "当前浏览器不支持 Service Worker，不能完整安装为 PWA。";
  if (serviceWorkerReady) return "Service Worker 已就绪，应用壳可缓存，离线时可以打开登录页和静态界面。";
  if (serviceWorkerError) return serviceWorkerError;
  return "正在准备 PWA 安装能力。";
}

function pwaInstallButtonPlan(input = {}) {
  const standalone = Boolean(input.standalone);
  const installed = Boolean(input.installed);
  const promptAvailable = Boolean(input.promptAvailable);
  const disabled = Boolean(standalone || installed);
  return {
    hidden: false,
    disabled,
    text: disabled ? "已安装" : (promptAvailable ? "安装应用" : "安装说明"),
    requirementHint: pwaRequirementHint(input),
    action: disabled ? "installed" : (promptAvailable ? "prompt" : "instructions"),
  };
}

function pushUnavailableReason(input = {}) {
  const caps = normalizeCapabilities(input);
  if (!caps.secureContext) return "当前链接不是 HTTPS 安全上下文，Web Push 不可用。";
  if (!caps.serviceWorker) return "当前浏览器不支持 Service Worker。";
  if (!caps.pushManager) return "当前浏览器或安装方式不支持 Web Push。iOS 需要从 Safari 添加到主屏幕后使用。";
  if (!caps.notification) return "当前浏览器不支持通知权限。";
  if (caps.iosClient && !caps.standalone) return pwaWindowRequiredText();
  if (!caps.serverEnabled || !caps.publicKey) return "服务端 Web Push 尚未配置。";
  if (caps.permission === "denied") return "通知权限已被系统拒绝，需要在浏览器或 iOS 设置里重新允许。";
  return "";
}

function pushButtonPlan(input = {}) {
  const caps = normalizeCapabilities(input);
  const reason = pushUnavailableReason(caps);
  if (reason) {
    return {
      hidden: false,
      disabled: false,
      text: "!",
      title: reason,
      ariaLabel: reason,
      tone: "warning",
      action: "blocked",
    };
  }
  if (caps.permission === "granted" && caps.hasSubscription) {
    return {
      hidden: false,
      disabled: false,
      text: "🔔",
      title: "重新启用通知",
      ariaLabel: "重新启用通知",
      tone: "enabled",
      action: "renew",
    };
  }
  return {
    hidden: false,
    disabled: false,
    text: "🔔",
    title: "启用通知",
    ariaLabel: "启用通知",
    tone: "available",
    action: "enable",
  };
}

function pushDeliverySummary(input = {}) {
  const caps = normalizeCapabilities(input);
  return {
    attempted: caps.attempted,
    sent: caps.sent,
    failed: caps.failed,
    ok: caps.attempted > 0 && caps.failed === 0 && caps.sent >= caps.attempted,
    text: caps.attempted
      ? `PWA 测试通知已交给系统：${caps.sent}/${caps.attempted}`
      : "当前工作区没有可用 PWA 通知订阅。",
  };
}

function clientVersionBadgePlan(input = {}) {
  const version = normalizeClientVersion(input.clientVersion || "");
  const serverVersion = normalizeClientVersion(input.serverClientVersion || "");
  const update = input.appUpdate && typeof input.appUpdate === "object" ? input.appUpdate : {};
  const clientRefreshAvailable = Boolean(version && serverVersion && serverVersion !== version);
  const updateAvailable = Boolean(update.updateAvailable);
  const plugins = Array.isArray(update.plugins) ? update.plugins : [];
  const pluginCount = plugins.filter((plugin) => plugin?.updateAvailable).length;
  const updateTarget = update.appUpdateAvailable && pluginCount
    ? `Home AI + ${pluginCount} plugin${pluginCount > 1 ? "s" : ""}`
    : (pluginCount ? `${pluginCount} plugin${pluginCount > 1 ? "s" : ""}` : "Home AI");
  return {
    text: clientRefreshAvailable ? "刷新" : (updateAvailable ? "更新" : (version ? `v${compactClientVersion(version)}` : "")),
    title: updateAvailable
      ? `Update available: ${updateTarget}`
      : (clientRefreshAvailable ? `Client update available: ${serverVersion}` : (version ? `Client version ${version}` : "")),
    updateAvailable: Boolean(updateAvailable || clientRefreshAvailable),
    clientRefreshAvailable,
    appUpdateAvailable: updateAvailable,
    serverVersion,
    clientVersion: version,
  };
}

function createPwaPushStatusState(input = {}) {
  const capabilities = normalizeCapabilities(input);
  const button = pushButtonPlan(capabilities);
  const delivery = pushDeliverySummary(capabilities);
  return {
    version: PWA_PUSH_STATUS_MODEL_VERSION,
    capabilities,
    unavailableReason: pushUnavailableReason(capabilities),
    button,
    delivery,
    updatedAt: cleanString(input.updatedAt || new Date(0).toISOString(), 80),
  };
}

function transitionPwaPushScenario(current = {}, scenario = "available") {
  const base = current.capabilities || {};
  if (scenario === "ios_browser") {
    return createPwaPushStatusState({
      ...base,
      iosClient: true,
      standalone: false,
      displayMode: "browser",
      permission: "default",
      hasSubscription: false,
    });
  }
  if (scenario === "denied") {
    return createPwaPushStatusState({
      ...base,
      permission: "denied",
      hasSubscription: false,
    });
  }
  if (scenario === "subscribed") {
    return createPwaPushStatusState({
      ...base,
      permission: "granted",
      hasSubscription: true,
      attempted: 1,
      sent: 1,
      failed: 0,
    });
  }
  if (scenario === "server_missing") {
    return createPwaPushStatusState({
      ...base,
      serverEnabled: false,
      publicKey: "",
      hasSubscription: false,
    });
  }
  return createPwaPushStatusState({
    ...base,
    secureContext: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    serverEnabled: true,
    publicKey: "preview_public_key",
    permission: "default",
    hasSubscription: false,
  });
}

export {
  PWA_PUSH_STATUS_MODEL_VERSION,
  clientVersionBadgePlan,
  compactClientVersion,
  createPwaPushStatusState,
  normalizeCapabilities,
  normalizeClientVersion,
  normalizeDisplayMode,
  normalizePermission,
  pwaInstallButtonPlan,
  pwaRequirementHint,
  pushButtonPlan,
  pushDeliverySummary,
  pushUnavailableReason,
  pwaWindowRequiredText,
  transitionPwaPushScenario,
};
