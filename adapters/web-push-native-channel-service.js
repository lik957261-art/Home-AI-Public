"use strict";

function getProvider(value) {
  return typeof value === "function" ? value() : value;
}

function normalizeNativeChannel(value, defaultChannel = "native") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return defaultChannel;
  if (["native_ios_apns", "native-ios-apns", "ios", "apns"].includes(text)) return "native_ios_apns";
  if (["native_android_fcm", "native-android-fcm", "android", "fcm"].includes(text)) return "native_android_fcm";
  if (["both", "all", "native"].includes(text)) return "native";
  return defaultChannel;
}

function nativeShellForChannel(channel) {
  return channel === "native_android_fcm" ? "android" : "ios";
}

function createWebPushNativeChannelService(options = {}) {
  const appRouteUrl = typeof options.appRouteUrl === "function"
    ? options.appRouteUrl
    : (() => "/");
  const compactText = typeof options.compactText === "function"
    ? options.compactText
    : ((value, max = 200) => String(value || "").slice(0, max));
  const logger = options.logger || console;
  const normalizeStringList = typeof options.normalizeStringList === "function"
    ? options.normalizeStringList
    : ((value) => (Array.isArray(value) ? value : (value ? [value] : [])).map((item) => String(item || "").trim()).filter(Boolean));
  const workspaceIdForPrincipal = typeof options.workspaceIdForPrincipal === "function"
    ? options.workspaceIdForPrincipal
    : ((principalId) => String(principalId || "owner"));

  function nativeNotificationService() {
    return getProvider(options.nativeNotificationService);
  }

  async function sendNativeNotification(payload = {}, sendOptions = {}) {
    const native = nativeNotificationService();
    if (!native || typeof native.sendToWorkspace !== "function") return null;
    const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
    const requestedChannel = normalizeNativeChannel(sendOptions.notificationChannel || sendOptions.channel || data.notificationChannel || data.channel, "native");
    const workspaceIds = new Set();
    if (data.workspaceId) workspaceIds.add(String(data.workspaceId));
    if (sendOptions.workspaceId) workspaceIds.add(String(sendOptions.workspaceId));
    for (const principalId of normalizeStringList(sendOptions.principalIds || sendOptions.principalId || [])) {
      const workspaceId = workspaceIdForPrincipal(principalId);
      if (workspaceId) workspaceIds.add(workspaceId);
    }
    if (!workspaceIds.size) workspaceIds.add("owner");
    const nativeResults = [];
    const nativeData = Object.assign({}, data, { channel: requestedChannel, notificationChannel: requestedChannel });
    for (const workspaceId of workspaceIds) {
      try {
        const explicitDeepLink = data.url || payload.deepLink || payload.url || "";
        const result = await native.sendToWorkspace({
          workspaceId,
          title: payload.title || data.title || "Home AI",
          body: payload.body || data.body || "",
          deepLink: explicitDeepLink || (requestedChannel === "native" ? "" : appRouteUrl({ source: "pwa", nativeShell: nativeShellForChannel(requestedChannel), workspaceId })),
          notificationChannel: requestedChannel,
          data: nativeData,
        });
        nativeResults.push(Object.assign({ workspaceId }, result || {}));
      } catch (err) {
        logger.warn?.(`Native notification bridge failed: ${compactText(err?.message || err, 240)}`);
        nativeResults.push({ ok: false, channel: requestedChannel, attempted: 0, sent: 0, failed: 0, error: "native_notification_failed" });
      }
    }
    return nativeResults;
  }

  return { sendNativeNotification };
}

module.exports = { createWebPushNativeChannelService };
