"use strict";

const HERMES_SW_VERSION = "20260510-model-permission-approval";
const HERMES_CACHE_PREFIX = "hermes-mobile-shell-";
const HERMES_MAX_SHELL_CACHES = 3;
const HERMES_APP_SHELL_CACHE = `hermes-mobile-shell-${HERMES_SW_VERSION}`;
const HERMES_APP_SHELL_URLS = [
  "/",
  "/hermes-mobile/",
  "/index.html",
  "/styles.css?v=20260510-1345",
  "/app.js?v=20260510-1345",
  "/fixed-viewport.js?v=20260505-1135",
  "/file-viewer.html",
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

function routeUrlForNotificationData(rawData = {}) {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const explicitUrl = String(data.url || "").trim();
  if (explicitUrl && explicitUrl !== "/") return explicitUrl;
  const params = new URLSearchParams();
  const workspaceId = String(data.workspaceId || data.principalId || "owner").trim() || "owner";
  if (data.automationId) {
    params.set("view", "automation");
    params.set("workspaceId", workspaceId);
    params.set("automationId", String(data.automationId));
    return `/?${params.toString()}`;
  }
  if (data.todoId) {
    params.set("view", "todos");
    params.set("workspaceId", workspaceId);
    params.set("todoId", String(data.todoId));
    return `/?${params.toString()}`;
  }
  if (data.taskGroupId) {
    params.set("view", "tasks");
    params.set("workspaceId", workspaceId);
    params.set("taskGroupId", String(data.taskGroupId));
    if (data.messageId) params.set("messageId", String(data.messageId));
    return `/?${params.toString()}`;
  }
  if (data.viewMode || data.view) {
    params.set("view", String(data.viewMode || data.view));
    params.set("workspaceId", workspaceId);
    return `/?${params.toString()}`;
  }
  return explicitUrl || "/";
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
  const rawTargetUrl = event.notification.data?.url || "/";
  const parsedTargetUrl = new URL(rawTargetUrl, self.location.origin);
  const targetUrl = parsedTargetUrl.origin === self.location.origin ? parsedTargetUrl.href : `${self.location.origin}/`;
  event.waitUntil((async () => {
    const windowClients = await sameOriginWindowClients();
    for (const client of windowClients) {
      let targetClient = client;
      if ("navigate" in client) {
        try {
          targetClient = await client.navigate(targetUrl) || client;
        } catch (_) {
          targetClient = client;
        }
      }
      try {
        targetClient.postMessage({
          type: "hermes.notification.open",
          version: HERMES_SW_VERSION,
          url: targetUrl,
          data: notificationData,
        });
      } catch (_) {
        // A full navigation may replace the client before it can receive the fallback message.
      }
      await targetClient.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
