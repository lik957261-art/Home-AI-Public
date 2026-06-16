"use strict";

function getProvider(value) {
  return typeof value === "function" ? value() : value;
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
    const workspaceIds = new Set();
    if (data.workspaceId) workspaceIds.add(String(data.workspaceId));
    if (sendOptions.workspaceId) workspaceIds.add(String(sendOptions.workspaceId));
    for (const principalId of normalizeStringList(sendOptions.principalIds || sendOptions.principalId || [])) {
      const workspaceId = workspaceIdForPrincipal(principalId);
      if (workspaceId) workspaceIds.add(workspaceId);
    }
    if (!workspaceIds.size) workspaceIds.add("owner");
    const nativeResults = [];
    const nativeData = Object.assign({}, data, { channel: "native_ios_apns" });
    for (const workspaceId of workspaceIds) {
      try {
        nativeResults.push(await native.sendToWorkspace({
          workspaceId,
          title: payload.title || data.title || "Home AI",
          body: payload.body || data.body || "",
          deepLink: data.url || payload.deepLink || payload.url || appRouteUrl({ source: "pwa", nativeShell: "ios", workspaceId }),
          data: nativeData,
        }));
      } catch (err) {
        logger.warn?.(`Native notification bridge failed: ${compactText(err?.message || err, 240)}`);
        nativeResults.push({ ok: false, channel: "native_ios_apns", attempted: 0, sent: 0, failed: 0, error: "native_notification_failed" });
      }
    }
    return nativeResults;
  }

  return { sendNativeNotification };
}

module.exports = { createWebPushNativeChannelService };
