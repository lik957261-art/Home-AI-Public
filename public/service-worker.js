"use strict";

const HERMES_SW_VERSION = "20260601-wardrobe-tab-auth-v414";
const HERMES_CACHE_PREFIX = "hermes-mobile-shell-";
const HERMES_MAX_SHELL_CACHES = 3;
const HERMES_APP_SHELL_CACHE = `hermes-mobile-shell-${HERMES_SW_VERSION}`;
const HERMES_APP_SHELL_URLS = [
  "/",
  "/hermes-mobile/",
  "/index.html",
  "/client-reset.html",
  "/styles.css?v=20260601-wardrobe-tab-auth-v414",
  "/markdown-viewer.html?v=20260601-wardrobe-tab-auth-v414",
  "/app-task-artifact-helpers.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-story-helpers.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-reading-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-coins-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-program-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-task-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-reflection-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-api-client.js?v=20260601-wardrobe-tab-auth-v414",
  "/app.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-shell-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-task-groups-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-navigation-view-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-chat-composer-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-composer-source-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-composer-context-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-run-progress-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-navigation-search-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-task-preview-helpers-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-task-preview-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-sidebar-task-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-message-skill-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-message-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-platform-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-platform-status-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-pwa-settings-push-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-pwa-push-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-workspace-admin-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-access-key-manager-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-plugin-admin-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-share-image-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-draft-thread-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-directory-automation-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-shared-directory-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-embedded-plugin-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-wardrobe-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-action-inbox-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-automation-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-native-growth-submission-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-ai-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-reward-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-settings-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-teaching-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-learning-growth-controller.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-automation-controller-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-automation-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-thread-state-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-group-topic-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-core-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-story-core-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-todo-core-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-render-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-list-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-learning-panel-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-recorder-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-todo-detail-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-composer-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-card-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-kanban-study-actions-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-thread-message-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-thread-list-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-thread-directory-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-thread-card-message-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-long-message-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-rich-text-directory-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-message-usage-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-events-composer-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-event-stream-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-upload-sidebar-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-composer-send-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-wire-start-ui.js?v=20260601-wardrobe-tab-auth-v414",
  "/app-start.js?v=20260601-wardrobe-tab-auth-v414",
  "/fixed-viewport.js?v=20260505-1135",
  "/markdown-renderer-client.js?v=20260601-wardrobe-tab-auth-v414",
  "/file-viewer.html",
  "/pdf-viewer.html",
  "/manifest.json",
  "/manifest-20260509.json",
  "/icons/hermes-mobile-icon-192-20260509.png",
  "/icons/hermes-mobile-icon-512-20260509.png",
  "/icons/hermes-mobile-badge-72-20260509.png",
  "/icons/favicon-32-20260509.png",
  "/icons/apple-touch-icon-180-20260509.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(HERMES_APP_SHELL_CACHE);
    await Promise.allSettled(HERMES_APP_SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (response && response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const shellKeys = keys.filter((key) => key.startsWith(HERMES_CACHE_PREFIX));
      const removable = shellKeys
        .filter((key) => key !== HERMES_APP_SHELL_CACHE)
        .slice(0, Math.max(0, shellKeys.length - HERMES_MAX_SHELL_CACHES));
      await Promise.all(removable
        .map((key) => caches.delete(key)));
      await Promise.all(shellKeys
        .filter((key) => key !== HERMES_APP_SHELL_CACHE && !removable.includes(key))
        .map(async (key) => deleteCachedViewerShell(await caches.open(key))));
    } catch (_) {
      // Cache cleanup is best-effort.
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "HERMES_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

function isApiOrEventRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname === "/events";
}

function isCacheableStaticRequest(url) {
  return /\.(?:css|js|json|png|svg|ico|html|wasm)$/i.test(url.pathname)
    || url.pathname === "/"
    || url.pathname === "/index.html";
}

function isCriticalStaticRequest(url) {
  return /\.(?:css|js)$/i.test(url.pathname);
}

async function matchCachedStatic(request) {
  return (await caches.match(request))
    || (await caches.match(request, { ignoreSearch: true }))
    || null;
}

function isViewerShellRequest(url) {
  return url.pathname === "/file-viewer.html"
    || url.pathname === "/pdf-viewer.html"
    || url.pathname === "/markdown-viewer.html";
}

async function deleteCachedViewerShell(cache) {
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((request) => {
      try {
        return isViewerShellRequest(new URL(request.url));
      } catch (_) {
        return false;
      }
    })
    .map((request) => cache.delete(request)));
}

async function networkFirst(request, fallbackUrl = "/") {
  const cache = await caches.open(HERMES_APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    return (await caches.match(request))
      || (fallbackUrl ? await caches.match(fallbackUrl) : null)
      || new Response("Hermes Mobile is offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}

async function networkFirstStatic(request) {
  const cache = await caches.open(HERMES_APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    return (await matchCachedStatic(request))
      || new Response("Hermes Mobile static asset is unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}

async function networkFirstViewerShell(request) {
  const cache = await caches.open(HERMES_APP_SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) cache.put("/file-viewer.html", response.clone()).catch(() => {});
    return response;
  } catch (_) {
    return (await cache.match("/file-viewer.html"))
      || new Response("Hermes Mobile file viewer is unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(HERMES_APP_SHELL_CACHE);
  const cached = await matchCachedStatic(request);
  const refresh = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => null);
  return cached || await refresh || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiOrEventRequest(url)) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }
  if (isViewerShellRequest(url)) {
    event.respondWith(networkFirstViewerShell(request));
    return;
  }
  if (isCriticalStaticRequest(url)) {
    event.respondWith(networkFirstStatic(request));
    return;
  }
  if (isCacheableStaticRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function sameOriginWindowClients() {
  const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return allClients.filter((client) => {
    try {
      return new URL(client.url).origin === self.location.origin;
    } catch (_) {
      return false;
    }
  });
}

function isForegroundClient(client) {
  return client.focused === true || client.visibilityState === "visible";
}

function isAppShellClient(client) {
  try {
    if (!isTopLevelWindowClient(client)) return false;
    const url = new URL(client.url || "", self.location.origin);
    if (url.origin !== self.location.origin) return false;
    return url.pathname === "/" || url.pathname === "/hermes-mobile/" || url.pathname === "/index.html";
  } catch (_) {
    return false;
  }
}

function isTopLevelWindowClient(client) {
  const frameType = String(client?.frameType || "");
  return !frameType || frameType === "top-level" || frameType === "auxiliary";
}

function notificationRouteFlagEnabled(value) {
  if (value === true) return true;
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function routeUrlForNotificationData(rawData = {}) {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const explicitUrl = String(data.url || "").trim();
  const params = new URLSearchParams();
  const workspaceId = String(data.workspaceId || data.principalId || "owner").trim() || "owner";
  const requestedView = String(data.viewMode || data.view || "").trim().toLowerCase();
  const messageType = String(data.messageType || "").trim().toLowerCase();
  const taskGroupId = String(data.taskGroupId || "").trim();
  const weixinChat = notificationRouteFlagEnabled(data.weixinChat);
  const groupChat = notificationRouteFlagEnabled(data.groupChat);
  const pluginId = String(data.pluginId || "").trim();
  if ((messageType === "plugin_notification" || pluginId) && (requestedView !== "inbox" || !data.inboxItemId)) {
    const pluginView = pluginId === "codex-mobile" ? "codex" : pluginId === "wardrobe" ? "wardrobe" : pluginId === "finance" ? "finance" : requestedView;
    params.set("view", requestedView || pluginView || "plugins");
    params.set("workspaceId", workspaceId);
    if (pluginId) params.set("pluginId", pluginId);
    ["pluginRoute", "pluginItemId", "pluginThreadId", "pluginTaskId", "sourceTurnId", "messageId"].forEach((key) => {
      const value = String(data[key] || "").trim();
      if (value) params.set(key, value);
    });
    const sourceInboxItemId = String(data.sourceInboxItemId || data.inboxItemId || "").trim();
    if (sourceInboxItemId) params.set("sourceInboxItemId", sourceInboxItemId);
    return appShellRouteForParams(params);
  }
  const automationNotification = Boolean(data.automationId)
    && (requestedView === "automation" || messageType.startsWith("automation_"));
  if (automationNotification) {
    params.set("view", "automation");
    params.set("workspaceId", workspaceId);
    params.set("automationId", String(data.automationId));
    const sourceInboxItemId = String(data.sourceInboxItemId || data.inboxItemId || "").trim();
    if (sourceInboxItemId || data.returnTo) {
      params.set("returnTo", String(data.returnTo || "inbox"));
      params.set("returnScope", String(data.returnScope || "detail"));
      if (sourceInboxItemId) params.set("sourceInboxItemId", sourceInboxItemId);
    }
    return appShellRouteForParams(params);
  }
  if (data.inboxItemId) {
    params.set("view", "inbox");
    params.set("workspaceId", workspaceId);
    params.set("inboxItemId", String(data.inboxItemId));
    return appShellRouteForParams(params);
  }
  if (data.automationId) {
    params.set("view", "automation");
    params.set("workspaceId", workspaceId);
    params.set("automationId", String(data.automationId));
    return appShellRouteForParams(params);
  }
  if (data.todoId) {
    params.set("view", "todos");
    params.set("workspaceId", workspaceId);
    params.set("todoId", String(data.todoId));
    return appShellRouteForParams(params);
  }
  if (data.taskCardId) {
    params.set("view", "learning");
    params.set("workspaceId", workspaceId);
    params.set("taskCardId", String(data.taskCardId));
    if (data.evaluationId) params.set("evaluationId", String(data.evaluationId));
    if (data.submissionId) params.set("submissionId", String(data.submissionId));
    return appShellRouteForParams(params);
  }
  if (
    requestedView === "single"
    || weixinChat
    || groupChat
    || taskGroupId === "chat"
    || taskGroupId === "group-chat"
  ) {
    params.set("view", "single");
    params.set("workspaceId", workspaceId);
    if (weixinChat) params.set("weixinChat", "1");
    if (groupChat || taskGroupId === "group-chat") params.set("groupChat", "1");
    if (data.threadId) params.set("threadId", String(data.threadId));
    if (data.messageId) params.set("messageId", String(data.messageId));
    return appShellRouteForParams(params);
  }
  if (taskGroupId) {
    params.set("view", "tasks");
    params.set("workspaceId", workspaceId);
    params.set("taskGroupId", taskGroupId);
    if (data.messageId) params.set("messageId", String(data.messageId));
    return appShellRouteForParams(params);
  }
  if (requestedView) {
    params.set("view", requestedView);
    params.set("workspaceId", workspaceId);
    if (data.threadId) params.set("threadId", String(data.threadId));
    if (data.messageId) params.set("messageId", String(data.messageId));
    return appShellRouteForParams(params);
  }
  return explicitUrl || "/";
}

function normalizeAppShellPath(pathname = "") {
  const value = String(pathname || "/").trim() || "/";
  if (value === "/" || value === "/index.html") return "/";
  const clean = value.split(/[?#]/)[0] || "/";
  if (clean.includes(".")) return "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function appShellRouteForParams(params, shellPath = "/") {
  const nextParams = new URLSearchParams(params || "");
  if (!nextParams.has("source")) nextParams.set("source", "pwa");
  const search = nextParams.toString();
  return `${normalizeAppShellPath(shellPath)}${search ? `?${search}` : ""}`;
}

function postNotificationOpenToClient(client, targetUrl, notificationData) {
  try {
    client.postMessage({
      type: "hermes.notification.open",
      version: HERMES_SW_VERSION,
      url: targetUrl,
      data: notificationData,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function appWindowRouteForUrl(url, client = null) {
  try {
    const parsed = url instanceof URL ? url : new URL(url || "/", self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    let clientShellPath = "";
    try {
      clientShellPath = client?.url ? new URL(client.url, self.location.origin).pathname : "";
    } catch (_) {
      clientShellPath = "";
    }
    const shellPath = clientShellPath ? normalizeAppShellPath(clientShellPath) : normalizeAppShellPath(parsed.pathname);
    if (isViewerShellRequest(parsed)) {
      const returnUrl = parsed.searchParams.get("return") || "";
      if (returnUrl) return appWindowRouteForUrl(new URL(returnUrl, self.location.origin), client);
      return appShellRouteForParams(new URLSearchParams(), shellPath);
    }
    const params = new URLSearchParams(parsed.search || "");
    return `${appShellRouteForParams(params, shellPath)}${parsed.hash || ""}`;
  } catch (_) {
    return appShellRouteForParams(new URLSearchParams());
  }
}

async function postPushReceipt(payload, notification, foreground) {
  try {
    await fetch("/api/push/receipt", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: HERMES_SW_VERSION,
        foreground: Boolean(foreground),
        payload,
        notification,
      }),
    });
  } catch (_) {
    // Receipt failures must not block system notifications.
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "\u901a\u77e5";
  const notificationData = Object.assign({}, data.data || {});
  notificationData.url = routeUrlForNotificationData(notificationData);
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/hermes-mobile-icon-192-20260509.png",
    badge: data.badge || "/icons/hermes-mobile-badge-72-20260509.png",
    tag: data.tag || data.data?.taskGroupId || "hermes-task",
    renotify: data.renotify !== false,
    requireInteraction: Boolean(data.requireInteraction || data.data?.requireInteraction || data.data?.messageType === "test"),
    silent: data.silent === true,
    timestamp: Number(data.timestamp || Date.now()),
    data: notificationData,
  };
  if (Array.isArray(data.vibrate)) options.vibrate = data.vibrate;
  event.waitUntil((async () => {
    const windowClients = await sameOriginWindowClients();
    let notificationResult = { shown: false };
    try {
      await self.registration.showNotification(title, options);
      notificationResult = { shown: true };
    } catch (err) {
      notificationResult = { shown: false, error: err?.message || String(err) };
    }
    const foreground = windowClients.some(isForegroundClient);
    await postPushReceipt(data, notificationResult, foreground);
    if (foreground) {
      for (const client of windowClients) {
        try {
          client.postMessage({
            type: "hermes.push.received",
            foreground,
            version: HERMES_SW_VERSION,
            payload: data,
            notification: notificationResult,
          });
        } catch (_) {
          // Ignore clients that cannot receive messages.
        }
      }
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const rawTargetUrl = routeUrlForNotificationData(notificationData);
  const parsedTargetUrl = new URL(rawTargetUrl, self.location.origin);
  const targetUrl = parsedTargetUrl.origin === self.location.origin ? parsedTargetUrl.href : `${self.location.origin}/`;
  event.waitUntil((async () => {
    const windowClients = await sameOriginWindowClients();
    const topLevelClients = windowClients.filter(isTopLevelWindowClient);
    for (const client of topLevelClients.filter(isAppShellClient)) {
      postNotificationOpenToClient(client, targetUrl, notificationData);
      await client.focus();
      return;
    }
    for (const client of topLevelClients) {
      let targetClient = client;
      const targetWindowRoute = appWindowRouteForUrl(parsedTargetUrl, client);
      if ("navigate" in client) {
        try {
          targetClient = await client.navigate(targetWindowRoute) || client;
        } catch (_) {
          targetClient = client;
        }
      }
      postNotificationOpenToClient(targetClient, targetUrl, notificationData);
      await targetClient.focus();
      return;
    }
    const targetWindowRoute = appWindowRouteForUrl(parsedTargetUrl);
    await self.clients.openWindow(targetWindowRoute);
  })());
});
