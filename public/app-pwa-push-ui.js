"use strict";

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

function clearPushToastAction(toast) {
  toast.onclick = null;
  toast.onkeydown = null;
  toast.classList.remove("actionable");
  toast.removeAttribute("role");
  toast.removeAttribute("tabindex");
  toast.removeAttribute("aria-label");
}

function showPushToast(message, kind = "", options = {}) {
  const toast = $("pushToast");
  if (!toast) return;
  if (state.pushToastTimer) clearTimeout(state.pushToastTimer);
  clearPushToastAction(toast);
  toast.textContent = "";
  const text = document.createElement("span");
  text.className = "push-toast-text";
  text.textContent = message;
  toast.append(text);
  const action = typeof options?.onClick === "function";
  if (action) {
    const actionLabel = document.createElement("span");
    actionLabel.className = "push-toast-action";
    actionLabel.textContent = String(options.actionLabel || "\u6253\u5f00");
    toast.append(actionLabel);
    toast.classList.add("actionable");
    toast.setAttribute("role", "button");
    toast.tabIndex = 0;
    toast.setAttribute("aria-label", String(options.ariaLabel || message || ""));
    const runAction = (event) => {
      event?.preventDefault?.();
      options.onClick(event);
      toast.classList.add("hidden");
    };
    toast.onclick = runAction;
    toast.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      runAction(event);
    };
  }
  toast.classList.remove("hidden", "success", "error");
  if (kind) toast.classList.add(kind);
  if (kind !== "error") {
    const durationMs = Number.isFinite(options?.durationMs) && options.durationMs > 0
      ? Math.max(800, Math.min(10000, Number(options.durationMs)))
      : (kind === "success" ? 4200 : 6500);
    state.pushToastTimer = window.setTimeout(() => toast.classList.add("hidden"), durationMs);
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

async function loadPushStatus(options = {}) {
  state.pushStatus = await api("/api/push/vapid-public-key");
  if (options.subscription !== false && pushSupported()) {
    try {
      const registration = await getServiceWorkerRegistration();
      state.pushSubscription = await withTimeout(registration.pushManager.getSubscription(), 6000, "读取通知订阅超时");
    } catch (_) {
      state.pushSubscription = null;
    }
  }
  updatePushButton();
}

function refreshPushSubscriptionAfterStartup() {
  window.setTimeout(() => {
    loadPushStatus({ subscription: true })
      .then(() => syncPushSubscriptionContext())
      .catch(() => updatePushButton());
  }, 0);
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
    }), 15000, "创建通知订阅超时，请关闭后重新打开 Home AI 再试");
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
  const webAttempted = Number(delivery.attempted || 0);
  const webSent = Number(delivery.sent || 0);
  const webFailed = Number(delivery.failed || 0);
  if (!webAttempted) {
    throw new Error(`当前工作区没有可用 PWA 通知订阅：${result?.target?.principalId || state.selectedWorkspaceId || "unknown"}`);
  }
  if (webFailed || webSent < webAttempted) {
    throw new Error(`PWA 测试通知发送不完整：${webSent}/${webAttempted}`);
  }
  return result;
}

function pushTestResultText(result) {
  const delivery = result?.result || {};
  return `PWA 测试通知已交给系统：${delivery.sent || 0}/${delivery.attempted || 0}`;
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

function pushShouldRefreshCurrentThread(messageType, pushThreadId, pushWorkspaceId) {
  if (!["single", "tasks"].includes(state.viewMode)) return false;
  if (pushWorkspaceId && pushWorkspaceId !== state.selectedWorkspaceId) return false;
  if (pushThreadId && pushThreadId !== state.currentThreadId) return false;
  if (["task_completed", "task_failed"].includes(String(messageType || ""))) return true;
  return currentThreadHasPendingMessages();
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
  const pushTaskGroupId = String(data.taskGroupId || nestedData.taskGroupId || "").trim();
  const pushWorkspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  const terminalTaskPush = ["task_completed", "task_failed"].includes(messageType);
  const samePushWorkspace = !pushWorkspaceId || pushWorkspaceId === state.selectedWorkspaceId;
  if (typeof refreshAutomationAfterPush === "function") refreshAutomationAfterPush(eventData).catch(showError);
  if (typeof refreshActionInboxAfterPush === "function") refreshActionInboxAfterPush(eventData).catch(showError);
  if (
    pushShouldRefreshCurrentThread(messageType, pushThreadId, pushWorkspaceId)
    && samePushWorkspace
    && (
      currentThreadHasPendingMessages()
      || (pushTaskGroupId && state.viewMode === "tasks" && state.currentTaskGroupId === pushTaskGroupId)
      || (pushThreadId && pushThreadId === state.currentThreadId)
      || (!pushThreadId && state.currentThreadId && (!pushWorkspaceId || pushWorkspaceId === state.selectedWorkspaceId))
    )
  ) {
    requestCurrentThreadRefresh({ stickToBottom: !pushTaskGroupId || state.currentTaskGroupId !== pushTaskGroupId, delayMs: 80 });
  } else if (
    terminalTaskPush
    && samePushWorkspace
    && state.viewMode === "tasks"
    && !state.currentTaskGroupId
    && typeof loadSelectedView === "function"
  ) {
    loadSelectedView({ forceTaskListReload: true, skipSingleWindowCache: true, skipTaskListWindowRefresh: true }).catch(showError);
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
      await openAppMessageDialog({ title: "通知不可用", message: unavailableReason });
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
