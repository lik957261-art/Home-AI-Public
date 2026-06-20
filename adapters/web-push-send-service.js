"use strict";

function defaultNormalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function defaultHashValue(value) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : (value ? [String(value).trim()].filter(Boolean) : []);
}

function pushSubscriptionLooksLikeIphone(item = {}) {
  const values = [
    item.deviceLabel,
    item.device_label,
    item.platform,
    item.userAgent,
    item.user_agent,
    item.clientContext?.platform,
    item.clientContext?.deviceLabel,
    item.clientContext?.userAgent,
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => value.includes("iphone"));
}

function createWebPushSendService(options = {}) {
  const webpush = options.webpush;
  const state = typeof options.state === "function" ? options.state : (() => options.state || {});
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const webPushConfig = typeof options.webPushConfig === "function" ? options.webPushConfig : (() => options.webPushConfig || null);
  const normalizeStringList = typeof options.normalizeStringList === "function" ? options.normalizeStringList : defaultNormalizeStringList;
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : defaultHashValue;
  const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const normalizePushDelivery = typeof options.normalizePushDelivery === "function" ? options.normalizePushDelivery : ((item) => item);
  const pushSubscriptionSkipReason = typeof options.pushSubscriptionSkipReason === "function" ? options.pushSubscriptionSkipReason : (() => "");
  const shouldSkipPushSubscriptionForClient = typeof options.shouldSkipPushSubscriptionForClient === "function"
    ? options.shouldSkipPushSubscriptionForClient
    : ((item) => Boolean(pushSubscriptionSkipReason(item)));

  function currentState() {
    return state() || {};
  }

  function pushSubscriptionCount() {
    return (currentState().pushSubscriptions || []).filter((item) => item && !item.disabledAt && !shouldSkipPushSubscriptionForClient(item)).length;
  }

  function publicPushStatus() {
    const config = webPushConfig();
    return {
      enabled: Boolean(config),
      publicKey: config?.publicKey || "",
      subject: config?.subject || "",
      subscriptionCount: pushSubscriptionCount(),
    };
  }

  function removePushSubscription(subscriptionOrEndpoint) {
    const endpoint = typeof subscriptionOrEndpoint === "string"
      ? subscriptionOrEndpoint
      : String(subscriptionOrEndpoint?.endpoint || "");
    if (!endpoint) return false;
    const hash = hashValue(endpoint);
    const store = currentState();
    const before = (store.pushSubscriptions || []).length;
    store.pushSubscriptions = (store.pushSubscriptions || []).filter((item) => item.endpointHash !== hash);
    if (store.pushSubscriptions.length !== before) saveState();
    return store.pushSubscriptions.length !== before;
  }

  async function sendPushNotification(payload, opts = {}) {
    if (!webPushConfig()) return { enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0 };
    const targetPrincipals = normalizeStringList(opts.principalIds || opts.principalId || []);
    const suppressIosWebPushWorkspaceIds = new Set(normalizeStringList(opts.suppressIosWebPushWorkspaceIds || []));
    const store = currentState();
    const subscriptions = (store.pushSubscriptions || []).filter((item) => {
      if (!item || item.disabledAt || !item.subscription?.endpoint) return false;
      if (!targetPrincipals.length) return true;
      const principals = normalizeStringList(item.principalIds || "owner");
      return principals.some((principal) => targetPrincipals.includes(principal));
    });
    let sent = 0;
    let failed = 0;
    let removed = 0;
    const now = nowIso();
    const body = JSON.stringify(payload);
    for (const item of subscriptions) {
      const workspaceIds = stringList(item.workspaceIds || item.workspaceId || item.workspace_id);
      if (
        suppressIosWebPushWorkspaceIds.size
        && pushSubscriptionLooksLikeIphone(item)
        && workspaceIds.some((workspaceId) => suppressIosWebPushWorkspaceIds.has(workspaceId))
      ) {
        item.lastError = "skipped_native_ios_apns_preferred";
        item.updatedAt = now;
        continue;
      }
      const skipReason = pushSubscriptionSkipReason(item);
      if (skipReason) {
        item.lastError = skipReason;
        item.updatedAt = now;
        continue;
      }
      try {
        await webpush.sendNotification(item.subscription, body, {
          TTL: opts.ttl || 60 * 60,
          urgency: opts.urgency || "normal",
        });
        item.lastSuccessAt = now;
        item.lastError = null;
        item.updatedAt = now;
        sent += 1;
      } catch (err) {
        failed += 1;
        item.lastError = err.message || String(err);
        item.updatedAt = now;
        if (err.statusCode === 404 || err.statusCode === 410) {
          item.disabledAt = now;
          removed += 1;
        }
      }
    }
    const attempted = sent + failed;
    const skipped = Math.max(0, subscriptions.length - attempted);
    const result = { enabled: true, attempted, sent, failed, removed };
    if (skipped) result.skipped = skipped;
    store.pushDeliveries = [...(store.pushDeliveries || []), normalizePushDelivery({
      id: makeId("pushdel"),
      sentAt: now,
      payload,
      principalIds: targetPrincipals,
      result,
    })].filter(Boolean).slice(-200);
    saveState();
    return result;
  }

  function activePushPrincipals() {
    const principals = new Set();
    for (const item of currentState().pushSubscriptions || []) {
      if (!item || item.disabledAt || !item.subscription?.endpoint) continue;
      for (const principal of normalizeStringList(item.principalIds || "owner")) principals.add(principal);
    }
    return [...principals];
  }

  return {
    activePushPrincipals,
    publicPushStatus,
    pushSubscriptionCount,
    removePushSubscription,
    sendPushNotification,
  };
}

module.exports = {
  createWebPushSendService,
};
