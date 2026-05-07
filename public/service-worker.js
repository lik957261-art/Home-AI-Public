"use strict";

const HERMES_SW_VERSION = "20260507-push-title-cleanup";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-72.png",
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
  const rawTargetUrl = event.notification.data?.url || "/";
  const parsedTargetUrl = new URL(rawTargetUrl, self.location.origin);
  const targetUrl = parsedTargetUrl.origin === self.location.origin ? parsedTargetUrl.href : `${self.location.origin}/`;
  event.waitUntil((async () => {
    const windowClients = await sameOriginWindowClients();
    for (const client of windowClients) {
      if ("navigate" in client) {
        try {
          await client.navigate(targetUrl);
        } catch (_) {
          // Fall through to focusing the existing client.
        }
      }
      await client.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
