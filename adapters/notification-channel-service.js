"use strict";

function normalizeNotificationChannel(value, fallback = "both") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (text === "web_push" || text === "web-push" || text === "web" || text === "pwa") return "web_push";
  if (
    text === "native_ios_apns"
    || text === "native-ios-apns"
    || text === "native"
    || text === "ios"
    || text === "apns"
  ) {
    return "native_ios_apns";
  }
  if (text === "both" || text === "all" || text === "dual" || text === "web_push_and_native_ios_apns") return "both";
  return fallback;
}

function payloadNotificationChannel(payload = {}, sendOptions = {}, fallback = "both") {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  return normalizeNotificationChannel(
    sendOptions.notificationChannel
      || sendOptions.channel
      || data.notificationChannel
      || data.notification_channel
      || data.channel,
    fallback,
  );
}

function createNotificationChannelService(options = {}) {
  const sendWebPushNotification = typeof options.sendWebPushNotification === "function"
    ? options.sendWebPushNotification
    : (async () => ({ enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0 }));
  const sendNativeNotification = typeof options.sendNativeNotification === "function"
    ? options.sendNativeNotification
    : (async () => null);

  function successfulNativeWorkspaceIds(nativeResults = []) {
    const ids = new Set();
    for (const result of Array.isArray(nativeResults) ? nativeResults : []) {
      if (!result || Number(result.sent || 0) <= 0) continue;
      const workspaceId = String(result.workspaceId || result.workspace_id || "").trim();
      if (workspaceId) ids.add(workspaceId);
    }
    return [...ids];
  }

  async function sendNotification(payload = {}, sendOptions = {}) {
    const channel = payloadNotificationChannel(payload, sendOptions, "both");
    if (channel === "web_push") return sendWebPushNotification(payload, sendOptions);
    if (channel === "native_ios_apns") {
      const nativeResults = await sendNativeNotification(payload, sendOptions);
      return {
        enabled: Boolean(nativeResults),
        attempted: 0,
        sent: 0,
        failed: 0,
        removed: 0,
        notificationChannel: "native_ios_apns",
        native: nativeResults || [],
      };
    }
    const nativeResults = await sendNativeNotification(payload, sendOptions);
    const suppressIosWebPushWorkspaceIds = successfulNativeWorkspaceIds(nativeResults);
    const webResult = await sendWebPushNotification(payload, suppressIosWebPushWorkspaceIds.length
      ? Object.assign({}, sendOptions, { suppressIosWebPushWorkspaceIds })
      : sendOptions);
    return nativeResults ? Object.assign({}, webResult, { native: nativeResults }) : webResult;
  }

  return Object.freeze({ sendNotification });
}

module.exports = {
  createNotificationChannelService,
  normalizeNotificationChannel,
  payloadNotificationChannel,
};
