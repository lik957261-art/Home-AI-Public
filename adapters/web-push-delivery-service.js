"use strict";

const fs = require("node:fs");
const path = require("node:path");

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultDedupe(items = []) {
  return [...new Set(items)];
}

function defaultNormalizeStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return defaultDedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function defaultHashValue(value) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function boolEnabled(value, fallback = true) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return !/^(0|false|no|off)$/i.test(text);
}

function numeric(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getProvider(value) {
  return typeof value === "function" ? value() : value;
}

function createWebPushDeliveryService(options = {}) {
  const env = options.env || process.env;
  const webpush = options.webpush;
  const state = typeof options.state === "function" ? options.state : (() => options.state || {});
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const loadRuntimeConfig = typeof options.loadRuntimeConfig === "function" ? options.loadRuntimeConfig : (() => ({}));
  const effectiveWebPushVapidPath = typeof options.effectiveWebPushVapidPath === "function"
    ? options.effectiveWebPushVapidPath
    : (() => options.webPushVapidPath || "");
  const effectiveWebPushSubject = typeof options.effectiveWebPushSubject === "function"
    ? options.effectiveWebPushSubject
    : (() => options.webPushSubject || "mailto:hermes-mobile@example.invalid");
  const normalizeStringList = typeof options.normalizeStringList === "function"
    ? options.normalizeStringList
    : defaultNormalizeStringList;
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const hashValue = typeof options.hashValue === "function" ? options.hashValue : defaultHashValue;
  const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const compactText = typeof options.compactText === "function"
    ? options.compactText
    : ((value, max = 200) => String(value || "").slice(0, max));
  const appRouteUrl = typeof options.appRouteUrl === "function"
    ? options.appRouteUrl
    : ((params = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        const text = String(value ?? "").trim();
        if (text) query.set(key, text);
      }
      const serialized = query.toString();
      return serialized ? `/?${serialized}` : "/";
    });
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : ((workspaceId) => String(workspaceId || "owner"));
  const workspaceIdForPrincipal = typeof options.workspaceIdForPrincipal === "function"
    ? options.workspaceIdForPrincipal
    : ((principalId) => String(principalId || "owner"));
  const workspaceLabel = typeof options.workspaceLabel === "function"
    ? options.workspaceLabel
    : ((workspaceId) => String(workspaceId || ""));
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : (() => null);
  const chatGroupMemberWorkspaceIds = typeof options.chatGroupMemberWorkspaceIds === "function"
    ? options.chatGroupMemberWorkspaceIds
    : (() => []);
  const isWeixinSingleWindowThread = typeof options.isWeixinSingleWindowThread === "function"
    ? options.isWeixinSingleWindowThread
    : (() => false);
  const singleWindowChatTaskGroupId = String(options.singleWindowChatTaskGroupId || "chat");
  const singleWindowGroupChatTaskGroupId = String(options.singleWindowGroupChatTaskGroupId || "group-chat");
  const loadCatalog = typeof options.loadCatalog === "function" ? options.loadCatalog : (() => ({ workspaces: [] }));
  const publicTodo = typeof options.publicTodo === "function" ? options.publicTodo : ((value) => value || {});
  const useKanbanTodoBackend = typeof options.useKanbanTodoBackend === "function" ? options.useKanbanTodoBackend : (() => false);
  const maybeReconcileKanbanDependencyBlocks = typeof options.maybeReconcileKanbanDependencyBlocks === "function"
    ? options.maybeReconcileKanbanDependencyBlocks
    : (async () => ({ ok: true, skipped: true }));
  const logger = options.logger || console;
  const timers = Object.assign({ setTimeout, setInterval }, options.timers || {});
  const webPushEnabled = options.webPushEnabled !== undefined
    ? Boolean(options.webPushEnabled)
    : boolEnabled(env.HERMES_WEB_PUSH_ENABLED || env.WEB_PUSH_ENABLED, true);
  const webPushSubject = options.webPushSubject || env.WEB_PUSH_SUBJECT || env.HERMES_WEB_PUSH_SUBJECT || "mailto:hermes-mobile@example.invalid";
  const todoPushEnabled = options.todoPushEnabled !== undefined
    ? Boolean(options.todoPushEnabled)
    : boolEnabled(env.HERMES_WEB_TODO_PUSH_ENABLED, true);
  const todoPushIntervalMs = numeric(options.todoPushIntervalMs, numeric(env.HERMES_WEB_TODO_PUSH_INTERVAL_MS, 60000));
  const todoPushStartDelayMs = numeric(options.todoPushStartDelayMs, 120000);
  const todoPushRecentCreateMinutes = numeric(options.todoPushRecentCreateMinutes, numeric(env.HERMES_WEB_TODO_PUSH_RECENT_CREATE_MINUTES, 30));
  const todoPushReceiptRetryMinutes = numeric(options.todoPushReceiptRetryMinutes, numeric(env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_MINUTES, 3));
  const todoPushReceiptRetryLimit = numeric(options.todoPushReceiptRetryLimit, numeric(env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_LIMIT, 3));
  const kanbanBlockedPushDelayMinutes = numeric(options.kanbanBlockedPushDelayMinutes, 0);
  const automationPushEnabled = options.automationPushEnabled !== undefined
    ? Boolean(options.automationPushEnabled)
    : boolEnabled(env.HERMES_WEB_AUTOMATION_PUSH_ENABLED, true);
  const automationPushIntervalMs = numeric(options.automationPushIntervalMs, numeric(env.HERMES_WEB_AUTOMATION_PUSH_INTERVAL_MS, 60000));
  const automationPushStartDelayMs = numeric(options.automationPushStartDelayMs, 120000);
  const automationDeliverableExtensions = new Set(Array.from(options.automationDeliverableExtensions || [".md", ".pdf", ".doc", ".docx", ".xlsx", ".pptx"]).map((item) => String(item).toLowerCase()));
  const automationDeliverableLookbackMs = numeric(options.automationDeliverableLookbackMs, 30 * 60 * 1000);
  const automationDeliverableFutureGraceMs = numeric(options.automationDeliverableFutureGraceMs, 30 * 60 * 1000);
  const automationInitialLookbackMs = numeric(options.automationInitialLookbackMs, 24 * 60 * 60 * 1000);
  let webPushConfig = null;
  let todoWebPushRunning = false;
  let automationWebPushRunning = false;

  function currentState() {
    return state() || {};
  }

  function todoProvider() {
    return getProvider(options.todoProvider);
  }

  function automationProvider() {
    return getProvider(options.automationProvider);
  }

  function scopedPushPrincipalIds(principalIds) {
    const principals = normalizeStringList(principalIds);
    if (!principals.length) return ["owner"];
    if (principals.includes("owner")) return ["owner"];
    return [principals[principals.length - 1]];
  }

  function scopedPushWorkspaceIds(principalId, workspaceIds = [], opts = {}) {
    const principal = String(principalId || "owner").trim() || "owner";
    if (principal === "owner") return ["owner"];
    const workspaceId = opts.skipCatalogLookups
      ? (normalizeStringList(workspaceIds)[0] || principal)
      : (workspaceIdForPrincipal(principal) || normalizeStringList(workspaceIds)[0] || "");
    return workspaceId ? [workspaceId] : [];
  }

  function normalizePushDelivery(item) {
    if (!item || typeof item !== "object") return null;
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const result = item.result && typeof item.result === "object" ? item.result : {};
    return {
      id: String(item.id || makeId("pushdel")).slice(0, 80),
      sentAt: String(item.sentAt || nowIso()),
      title: String(payload.title || item.title || "").slice(0, 160),
      tag: String(payload.tag || item.tag || "").slice(0, 240),
      messageType: String(data.messageType || item.messageType || "").slice(0, 80),
      principalIds: normalizeStringList(item.principalIds || item.principalId || []),
      workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
      taskGroupId: String(data.taskGroupId || "").slice(0, 120),
      messageId: String(data.messageId || "").slice(0, 120),
      todoId: String(data.todoId || "").slice(0, 120),
      automationId: String(data.automationId || "").slice(0, 120),
      attempted: Number(result.attempted || item.attempted || 0),
      sent: Number(result.sent || item.sent || 0),
      failed: Number(result.failed || item.failed || 0),
      removed: Number(result.removed || item.removed || 0),
    };
  }

  function normalizePushReceipt(item) {
    if (!item || typeof item !== "object") return null;
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const notification = item.notification && typeof item.notification === "object" ? item.notification : {};
    return {
      id: String(item.id || makeId("receipt")),
      receivedAt: String(item.receivedAt || nowIso()),
      version: String(item.version || "").slice(0, 80),
      foreground: Boolean(item.foreground),
      shown: notification.shown !== false,
      error: String(notification.error || "").slice(0, 500),
      title: String(payload.title || "").slice(0, 160),
      tag: String(payload.tag || "").slice(0, 240),
      markKey: String(data.markKey || item.markKey || "").slice(0, 240),
      todoId: String(data.todoId || item.todoId || "").slice(0, 120),
      testId: String(data.testId || item.testId || "").slice(0, 120),
      messageType: String(data.messageType || item.messageType || "").slice(0, 80),
      principalId: String(data.principalId || item.principalId || "").slice(0, 120),
      workspaceId: String(data.workspaceId || item.workspaceId || "").slice(0, 120),
      url: String(data.url || "").slice(0, 500),
    };
  }

  function normalizePushSubscription(item, opts = {}) {
    if (!item || typeof item !== "object") return null;
    const subscription = item.subscription && typeof item.subscription === "object" ? item.subscription : item;
    const endpoint = String(subscription.endpoint || item.endpoint || "").trim();
    if (!endpoint) return null;
    const now = nowIso();
    const workspaceIds = normalizeStringList(item.workspaceIds || item.workspaceId || item.workspaces);
    const principalIds = normalizeStringList(item.principalIds || item.principalId || item.principals || (workspaceIds.length ? workspacePrincipal(workspaceIds[0]) : "owner"));
    const scopedPrincipalIds = scopedPushPrincipalIds(principalIds);
    const scopedWorkspaceIds = scopedPushWorkspaceIds(scopedPrincipalIds[0], workspaceIds, opts);
    return {
      id: String(item.id || `push_${hashValue(endpoint).slice(0, 16)}`),
      endpointHash: hashValue(endpoint),
      subscription,
      deviceLabel: String(item.deviceLabel || "").slice(0, 120),
      userAgent: String(item.userAgent || "").slice(0, 240),
      principalIds: scopedPrincipalIds,
      workspaceIds: scopedWorkspaceIds,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      lastSuccessAt: item.lastSuccessAt || null,
      lastError: item.lastError || null,
      disabledAt: item.disabledAt || null,
    };
  }

  function pushSubscriptionScopeSignature(items) {
    return JSON.stringify((Array.isArray(items) ? items : []).map((item) => {
      const subscription = item?.subscription && typeof item.subscription === "object" ? item.subscription : item;
      const endpoint = String(subscription?.endpoint || item?.endpoint || "").trim();
      return {
        endpointHash: String(item?.endpointHash || (endpoint ? hashValue(endpoint) : "")),
        principalIds: normalizeStringList(item?.principalIds || item?.principalId || item?.principals),
        workspaceIds: normalizeStringList(item?.workspaceIds || item?.workspaceId || item?.workspaces),
      };
    }).sort((a, b) => a.endpointHash.localeCompare(b.endpointHash)));
  }

  function loadVapidConfig() {
    const envPublic = env.WEB_PUSH_VAPID_PUBLIC_KEY || env.HERMES_WEB_VAPID_PUBLIC_KEY || "";
    const envPrivate = env.WEB_PUSH_VAPID_PRIVATE_KEY || env.HERMES_WEB_VAPID_PRIVATE_KEY || "";
    const envSubject = env.WEB_PUSH_SUBJECT || env.HERMES_WEB_PUSH_SUBJECT || "";
    if (envPublic && envPrivate) {
      return { publicKey: envPublic, privateKey: envPrivate, subject: envSubject || webPushSubject, source: "env" };
    }
    const runtime = loadRuntimeConfig();
    const vapidPath = effectiveWebPushVapidPath(runtime);
    const subject = effectiveWebPushSubject(runtime);
    try {
      if (fs.existsSync(vapidPath)) {
        const parsed = JSON.parse(fs.readFileSync(vapidPath, "utf8"));
        if (parsed.publicKey && parsed.privateKey) {
          return {
            publicKey: String(parsed.publicKey),
            privateKey: String(parsed.privateKey),
            subject: String(parsed.subject || subject),
            source: vapidPath,
          };
        }
      }
    } catch (_) {}
    if (!webPushEnabled || !webpush?.generateVAPIDKeys) return null;
    const keys = webpush.generateVAPIDKeys();
    const generated = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
    try {
      fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
      fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch (_) {
      // Keep the generated pair in memory for this process if persistence fails.
    }
    return Object.assign({ source: fs.existsSync(vapidPath) ? vapidPath : "memory" }, generated);
  }

  function initializeWebPush() {
    if (!webPushEnabled) {
      webPushConfig = null;
      return null;
    }
    const config = loadVapidConfig();
    if (!config?.publicKey || !config?.privateKey || !webpush?.setVapidDetails) {
      webPushConfig = null;
      return null;
    }
    try {
      webpush.setVapidDetails(config.subject || webPushSubject, config.publicKey, config.privateKey);
      webPushConfig = config;
      return config;
    } catch (err) {
      logger.error?.(`Hermes Mobile Push disabled: ${err.message || String(err)}`);
      webPushConfig = null;
      return null;
    }
  }

  function generateWebPushVapidConfig(options = {}) {
    if (!webPushEnabled) {
      const err = new Error("Web Push is disabled");
      err.status = 409;
      throw err;
    }
    if (env.WEB_PUSH_VAPID_PUBLIC_KEY || env.HERMES_WEB_VAPID_PUBLIC_KEY || env.WEB_PUSH_VAPID_PRIVATE_KEY || env.HERMES_WEB_VAPID_PRIVATE_KEY) {
      const err = new Error("Web Push VAPID keys are configured by environment variables");
      err.status = 409;
      throw err;
    }
    if (!webpush?.generateVAPIDKeys) {
      const err = new Error("Web Push VAPID generator is unavailable");
      err.status = 500;
      throw err;
    }
    const runtime = loadRuntimeConfig();
    const vapidPath = effectiveWebPushVapidPath(runtime);
    if (fs.existsSync(vapidPath) && !options.overwrite) {
      const err = new Error("VAPID key file already exists");
      err.status = 409;
      throw err;
    }
    const keys = webpush.generateVAPIDKeys();
    const generated = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: effectiveWebPushSubject(runtime),
    };
    fs.mkdirSync(path.dirname(vapidPath), { recursive: true });
    fs.writeFileSync(vapidPath, JSON.stringify(generated, null, 2), { encoding: "utf8", mode: 0o600 });
    initializeWebPush();
    return {
      source: vapidPath,
      publicKey: generated.publicKey,
      subject: generated.subject,
    };
  }

  function getWebPushConfig() {
    return webPushConfig;
  }

  function pushSubscriptionCount() {
    return (currentState().pushSubscriptions || []).filter((item) => item && !item.disabledAt).length;
  }

  function publicPushStatus() {
    return {
      enabled: Boolean(webPushConfig),
      publicKey: webPushConfig?.publicKey || "",
      subject: webPushConfig?.subject || "",
      subscriptionCount: pushSubscriptionCount(),
    };
  }

  function recordPushReceipt(body = {}) {
    const normalized = normalizePushReceipt(Object.assign({}, body, {
      id: makeId("receipt"),
      receivedAt: nowIso(),
    }));
    if (!normalized) return null;
    const store = currentState();
    store.pushReceipts = [...(store.pushReceipts || []), normalized].slice(-200);
    saveState();
    if (normalized.markKey && normalized.principalId) {
      markTodoWebPush({
        markKey: normalized.markKey,
        todoId: normalized.todoId,
        principalId: normalized.principalId,
        messageType: normalized.messageType || "message",
      }, normalized.shown ? "shown" : "receipt_failed", {
        countAttempt: false,
        error: normalized.error || "",
      }).catch((err) => {
        logger.error?.(`Hermes Todo Web Push receipt mark failed: ${err.message || String(err)}`);
      });
    }
    return normalized;
  }

  function savePushSubscription(subscription, meta = {}) {
    const workspaceId = String(meta.workspaceId || "").trim();
    const principalId = String(meta.principalId || (workspaceId ? workspacePrincipal(workspaceId) : "") || "").trim();
    const normalized = normalizePushSubscription({
      subscription,
      deviceLabel: meta.deviceLabel,
      userAgent: meta.userAgent,
      workspaceIds: workspaceId ? [workspaceId] : [],
      principalIds: principalId ? [principalId] : [],
    });
    if (!normalized) throw new Error("Invalid push subscription");
    const store = currentState();
    store.pushSubscriptions = store.pushSubscriptions || [];
    const index = store.pushSubscriptions.findIndex((item) => item.endpointHash === normalized.endpointHash);
    if (index >= 0) {
      const existing = store.pushSubscriptions[index];
      store.pushSubscriptions[index] = Object.assign({}, store.pushSubscriptions[index], normalized, {
        createdAt: existing.createdAt || normalized.createdAt,
        updatedAt: nowIso(),
        disabledAt: null,
        lastError: null,
        principalIds: normalized.principalIds || [],
        workspaceIds: normalized.workspaceIds || [],
      });
    } else {
      store.pushSubscriptions.push(normalized);
    }
    saveState();
    const saved = store.pushSubscriptions.find((item) => item.endpointHash === normalized.endpointHash) || normalized;
    return {
      id: saved.id,
      endpointHash: saved.endpointHash,
      principalIds: saved.principalIds || [],
      workspaceIds: saved.workspaceIds || [],
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
    if (!webPushConfig) return { enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0 };
    const targetPrincipals = normalizeStringList(opts.principalIds || opts.principalId || []);
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
    const result = { enabled: true, attempted: subscriptions.length, sent, failed, removed };
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

  function confirmedTodoPushMarkKeys() {
    const keys = new Set();
    for (const receipt of currentState().pushReceipts || []) {
      if (!receipt || receipt.shown === false) continue;
      const markKey = String(receipt.markKey || "").trim();
      if (!markKey) continue;
      keys.add(markKey);
    }
    return [...keys];
  }

  function todoDetailUrl(event) {
    const principalId = event?.principalId || "";
    return appRouteUrl({
      view: "todos",
      workspaceId: event?.workspaceId || workspaceIdForPrincipal(principalId),
      todoId: event?.todoId || "",
      messageType: event?.messageType || "",
      localDate: event?.localDate || "",
    });
  }

  function todoPushPayload(event) {
    const principalId = event?.principalId || "";
    const workspaceId = event?.workspaceId || workspaceIdForPrincipal(principalId);
    const todoId = event?.todoId || "";
    const messageType = event?.messageType || "";
    const title = compactText(event?.title || "\u5f85\u529e\u63d0\u9192", 80) || "\u5f85\u529e\u63d0\u9192";
    const body = compactText(event?.body || "", 220).replace(/\s+/g, " ").trim() || "\u5f85\u529e\u6709\u66f4\u65b0";
    return {
      title,
      body,
      tag: event?.tag || `hermes-todo-${event?.markKey || event?.todoId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data: Object.assign({}, event?.data || {}, {
        url: todoDetailUrl(Object.assign({}, event, { workspaceId, principalId, todoId, messageType })),
        viewMode: "todos",
        workspaceId,
        todoId,
        principalId,
        messageType,
        localDate: event?.localDate || "",
        markKey: event?.markKey || "",
        requireInteraction: true,
      }),
    };
  }

  async function markTodoWebPush(event, status, opts = {}) {
    if (!event?.markKey || !event?.principalId) return null;
    const provider = todoProvider();
    if (!provider?.markWebPush) return null;
    return provider.markWebPush({
      markKey: event.markKey,
      todoId: event.todoId || "",
      principalId: event.principalId,
      messageType: event.messageType || "message",
      localDate: event.localDate || "",
      status: status || "sent",
      countAttempt: opts.countAttempt !== false,
      error: opts.error || "",
    }).catch((err) => {
      logger.error?.(`Hermes Todo Web Push mark failed: ${err.message || String(err)}`);
      return null;
    });
  }

  async function deliverTodoWebPushEvent(event) {
    const result = await sendPushNotification(todoPushPayload(event), {
      principalId: event.principalId,
      urgency: event.urgency || "high",
      ttl: 24 * 60 * 60,
    });
    if (result.attempted > 0) {
      await markTodoWebPush(event, result.sent > 0 ? "sent" : "failed");
    }
    return Object.assign({}, result, {
      markKey: event.markKey || "",
      principalId: event.principalId || "",
      messageType: event.messageType || "",
    });
  }

  async function runTodoWebPushTick(opts = {}) {
    if (!todoPushEnabled) return { ok: true, enabled: false, events: [], deliveries: [] };
    const principals = activePushPrincipals();
    const reconcileResults = [];
    if (useKanbanTodoBackend()) {
      const workspaceIds = dedupe((principals.length ? principals : ["owner"]).map((principalId) => workspaceIdForPrincipal(principalId))).slice(0, 20);
      for (const workspaceId of workspaceIds) {
        try {
          reconcileResults.push(await maybeReconcileKanbanDependencyBlocks(workspaceId, { limit: 500 }));
        } catch (err) {
          reconcileResults.push({ ok: false, workspaceId, error: err.message || String(err) });
        }
      }
    }
    if (!webPushConfig || !principals.length) {
      return { ok: true, enabled: Boolean(webPushConfig), principals, reconcileResults, events: [], deliveries: [] };
    }
    const provider = todoProvider();
    const pending = await provider.pendingPushes({
      sourcePrincipal: "owner",
      principals,
      limit: opts.limit || 100,
      recentCreateMinutes: todoPushRecentCreateMinutes,
      confirmedMarkKeys: confirmedTodoPushMarkKeys(),
      retryWithoutReceiptMinutes: todoPushReceiptRetryMinutes,
      retryLimit: todoPushReceiptRetryLimit,
      blockedNotificationDelayMinutes: kanbanBlockedPushDelayMinutes,
    });
    const events = Array.isArray(pending.events) ? pending.events : [];
    if (opts.dryRun) {
      return {
        ok: true,
        enabled: true,
        principals,
        events: events.map((event) => Object.assign({}, event, { payload: todoPushPayload(event) })),
        reconcileResults,
        deliveries: [],
      };
    }
    const deliveries = [];
    for (const event of events) {
      try {
        deliveries.push(await deliverTodoWebPushEvent(event));
      } catch (err) {
        deliveries.push({
          markKey: event?.markKey || "",
          principalId: event?.principalId || "",
          messageType: event?.messageType || "",
          error: err.message || String(err),
        });
      }
    }
    return { ok: true, enabled: true, principals, reconcileResults, events, deliveries };
  }

  function scheduleBackgroundWebPushDispatcher(tick, interval, initialDelay) {
    const startDelay = Math.max(0, Number(initialDelay) || 0);
    timers.setTimeout(() => {
      tick();
      timers.setInterval(tick, interval);
    }, startDelay);
  }

  function startTodoWebPushDispatcher() {
    const interval = Math.max(15000, Number(todoPushIntervalMs) || 60000);
    if (!todoPushEnabled) return;
    const tick = () => {
      if (todoWebPushRunning) return;
      todoWebPushRunning = true;
      runTodoWebPushTick()
        .catch((err) => logger.error?.(`Hermes Todo Web Push tick failed: ${err.message || String(err)}`))
        .finally(() => {
          todoWebPushRunning = false;
        });
    };
    scheduleBackgroundWebPushDispatcher(tick, interval, todoPushStartDelayMs);
  }

  function automationOwnerPrincipal(job) {
    return String(job?.ownerPrincipalId || "").trim() || "owner";
  }

  function automationTitleForPush(job) {
    return compactText(job?.name || job?.id || "Hermes CRON", 120).replace(/\s+/g, " ").trim() || "Hermes CRON";
  }

  function automationTimeMs(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function automationDeliverableExtension(doc) {
    return path.extname(String(doc?.name || "")).toLowerCase();
  }

  function automationDeliverableTimeMs(doc) {
    return Math.max(
      automationTimeMs(doc?.runOutputUpdatedAt),
      automationTimeMs(doc?.updatedAt),
    );
  }

  function automationLatestDeliverableTimeMs(job) {
    return Math.max(0, ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments : []).map(automationDeliverableTimeMs));
  }

  function automationListSortByLatestDeliverable(left, right) {
    const leftDelivery = automationLatestDeliverableTimeMs(left);
    const rightDelivery = automationLatestDeliverableTimeMs(right);
    if (leftDelivery !== rightDelivery) return rightDelivery - leftDelivery;
    const leftNext = automationTimeMs(left?.nextRunAt);
    const rightNext = automationTimeMs(right?.nextRunAt);
    if (Boolean(leftNext) !== Boolean(rightNext)) return leftNext ? -1 : 1;
    if (leftNext && rightNext && leftNext !== rightNext) return leftNext - rightNext;
    return String(left?.name || left?.id || "").localeCompare(String(right?.name || right?.id || ""));
  }

  function automationPushMarkDeliverableTimeMs(mark) {
    if (!mark || typeof mark !== "object") return 0;
    return Math.max(
      automationTimeMs(mark.deliverableTimeAt),
      automationTimeMs(mark.deliverableUpdatedAt),
      automationTimeMs(mark.runOutputUpdatedAt),
    );
  }

  function automationLatestDeliverableForPush(job, existingMark = null) {
    const lastRunMs = automationTimeMs(job?.lastRunAt);
    if (!lastRunMs) return null;
    const previousDeliverableMs = automationPushMarkDeliverableTimeMs(existingMark);
    const nowWithGrace = Date.now() + automationDeliverableFutureGraceMs;
    const candidates = (Array.isArray(job?.outputDocuments) ? job.outputDocuments : [])
      .filter((doc) => {
        const ext = automationDeliverableExtension(doc);
        if (!automationDeliverableExtensions.has(ext)) return false;
        if (!doc?.url || Number(doc?.size || 0) <= 0) return false;
        const docTimeMs = automationDeliverableTimeMs(doc);
        if (!docTimeMs) return false;
        // Web Push is tied to Markdown/PDF/Office file freshness, not CRON execution time.
        if (previousDeliverableMs && docTimeMs <= previousDeliverableMs) return false;
        if (docTimeMs < lastRunMs - automationDeliverableLookbackMs) return false;
        if (docTimeMs > nowWithGrace) return false;
        return true;
      })
      .sort((left, right) => automationDeliverableTimeMs(right) - automationDeliverableTimeMs(left));
    return candidates[0] || null;
  }

  function automationPushSignature(job, latestDoc = null) {
    const lastRunAt = String(job?.lastRunAt || "").trim();
    if (!lastRunAt) return "";
    const docSignature = latestDoc ? [
      String(latestDoc.name || "").trim(),
      String(latestDoc.updatedAt || "").trim(),
      String(latestDoc.runOutputUpdatedAt || "").trim(),
      String(latestDoc.url || "").trim(),
    ].join(":") : "no-deliverable";
    return [
      lastRunAt,
      String(job?.lastStatus || "").trim(),
      String(job?.status || "").trim(),
      String(job?.lastError || "").trim(),
      String(job?.lastDeliveryError || "").trim(),
      docSignature,
    ].join("|");
  }

  function automationPushMarkSignature(mark) {
    if (!mark) return "";
    if (typeof mark === "string") return mark;
    if (typeof mark === "object") return String(mark.signature || "");
    return "";
  }

  function isRecentInitialAutomationDeliverable(latestDoc = null) {
    const docTimeMs = automationDeliverableTimeMs(latestDoc);
    if (!docTimeMs) return false;
    return Date.now() - docTimeMs <= Math.max(0, automationInitialLookbackMs);
  }

  function setAutomationPushMark(job, signature, latestDoc = null) {
    const store = currentState();
    store.automationPushMarks = store.automationPushMarks || {};
    store.automationPushMarks[String(job?.id || "")] = {
      signature,
      lastRunAt: String(job?.lastRunAt || ""),
      lastStatus: String(job?.lastStatus || job?.status || ""),
      deliverableName: latestDoc ? String(latestDoc.name || "") : "",
      deliverableUpdatedAt: latestDoc ? String(latestDoc.updatedAt || "") : "",
      runOutputUpdatedAt: latestDoc ? String(latestDoc.runOutputUpdatedAt || "") : "",
      deliverableTimeAt: latestDoc ? new Date(automationDeliverableTimeMs(latestDoc)).toISOString() : "",
      updatedAt: nowIso(),
    };
  }

  function automationPushEventForJob(job, latestDoc, signature) {
    const jobId = String(job?.id || "").trim();
    if (!jobId || !String(job?.lastRunAt || "").trim()) return null;
    if (!latestDoc) return null;
    const principalId = automationOwnerPrincipal(job);
    const workspaceId = workspaceIdForPrincipal(principalId);
    const failed = /error|fail/i.test(String(job?.lastStatus || job?.status || "")) || Boolean(job?.lastError || job?.lastDeliveryError);
    const title = failed ? "\u81ea\u52a8\u5316\u4efb\u52a1\u5931\u8d25" : "\u81ea\u52a8\u5316\u4efb\u52a1\u5b8c\u6210";
    const body = compactText([
      automationTitleForPush(job),
      `\u4ea4\u4ed8\u6587\u4ef6: ${latestDoc.name}`,
    ].filter(Boolean).join("\n"), 220);
    const params = new URLSearchParams({ view: "automation", workspaceId, automationId: jobId });
    return {
      jobId,
      principalId,
      workspaceId,
      signature,
      latestDoc,
      payload: {
        title,
        body,
        tag: `hermes-automation-${jobId}-${hashValue(signature).slice(0, 12)}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        vibrate: [200, 100, 200],
        data: {
          url: `/?${params.toString()}`,
          viewMode: "automation",
          workspaceId,
          automationId: jobId,
          principalId,
          messageType: failed ? "automation_failed" : "automation_completed",
          lastRunAt: job.lastRunAt || "",
          status: job.lastStatus || job.status || "",
          requireInteraction: true,
        },
      },
    };
  }

  async function runAutomationWebPushTick(opts = {}) {
    if (!automationPushEnabled) return { ok: true, enabled: false, events: [], initialized: [], deliveries: [] };
    const principals = activePushPrincipals();
    if (!webPushConfig || !principals.length) {
      return { ok: true, enabled: Boolean(webPushConfig), principals, events: [], initialized: [], deliveries: [] };
    }
    const provider = automationProvider();
    const result = await provider.listJobs({ includeDisabled: true, bypassCache: true, limit: 0 });
    if (!result?.ok) {
      return { ok: false, enabled: true, principals, events: [], initialized: [], deliveries: [], error: result?.error || "Hermes CRON bridge failed" };
    }
    const store = currentState();
    store.automationPushMarks = store.automationPushMarks || {};
    const principalSet = new Set(principals);
    const events = [];
    const initialized = [];
    let marksChanged = false;
    const limit = Math.max(1, Number(opts.limit || 100));
    for (const job of result.jobs || []) {
      const jobId = String(job?.id || "").trim();
      const principalId = automationOwnerPrincipal(job);
      if (!jobId || !principalSet.has(principalId)) continue;
      const existingMark = store.automationPushMarks[jobId];
      const latestDoc = automationLatestDeliverableForPush(job, existingMark);
      if (!latestDoc) continue;
      const signature = automationPushSignature(job, latestDoc);
      if (!signature) continue;
      const existing = automationPushMarkSignature(existingMark);
      if (existing === signature) continue;
      const event = automationPushEventForJob(job, latestDoc, signature);
      if (!event) continue;
      if (!existing && !opts.includeInitial && !isRecentInitialAutomationDeliverable(latestDoc)) {
        initialized.push({ jobId, principalId, signature });
        if (!opts.dryRun) {
          setAutomationPushMark(job, signature, latestDoc);
          marksChanged = true;
        }
        continue;
      }
      events.push(event);
      if (events.length >= limit) break;
    }
    if (opts.dryRun) return { ok: true, enabled: true, principals, events, initialized, deliveries: [] };
    const deliveries = [];
    for (const event of events) {
      const delivery = await sendPushNotification(event.payload, {
        principalId: event.principalId,
        urgency: "high",
        ttl: 24 * 60 * 60,
      });
      deliveries.push(Object.assign({}, delivery, {
        jobId: event.jobId,
        principalId: event.principalId,
        workspaceId: event.workspaceId,
      }));
      setAutomationPushMark({ id: event.jobId, lastRunAt: event.payload.data.lastRunAt, lastStatus: event.payload.data.status }, event.signature, event.latestDoc);
      marksChanged = true;
    }
    if (marksChanged) saveState();
    return { ok: true, enabled: true, principals, events, initialized, deliveries };
  }

  function startAutomationWebPushDispatcher() {
    const interval = Math.max(15000, Number(automationPushIntervalMs) || 60000);
    if (!automationPushEnabled) return;
    const tick = () => {
      if (automationWebPushRunning) return;
      automationWebPushRunning = true;
      runAutomationWebPushTick()
        .catch((err) => logger.error?.(`Hermes Automation Web Push tick failed: ${err.message || String(err)}`))
        .finally(() => {
          automationWebPushRunning = false;
        });
    };
    scheduleBackgroundWebPushDispatcher(tick, interval, automationPushStartDelayMs);
  }

  function notifyTodoCreated(result, sourcePrincipal = "") {
    const todo = publicTodo(result || {});
    if (!todo.id || !todo.assignee) return;
    if (sourcePrincipal && todo.assignee === sourcePrincipal) return;
    const event = {
      markKey: `todo:${todo.id}:created_by_other`,
      todoId: todo.id,
      principalId: todo.assignee,
      messageType: "created_by_other",
      title: "\u65b0\u589e\u5f85\u529e",
      body: `\u65b0\u589e\u5f85\u529e:\n${todo.content}\n\u622a\u6b62: ${todo.dueLocal || todo.dueAt || ""}`,
      tag: `hermes-todo-${todo.id}-created-by-other`,
      data: { viewMode: "todos", todoId: todo.id, principalId: todo.assignee, messageType: "created_by_other" },
    };
    deliverTodoWebPushEvent(event).catch((err) => {
      logger.error?.(`Hermes Todo Web Push send failed: ${err.message || String(err)}`);
    });
  }

  function taskReceiptStartMessageId(thread, message) {
    const taskGroupId = String(message?.taskGroupId || "").trim();
    if (!taskGroupId) return String(message?.id || "").trim();
    const first = (thread?.messages || []).find((item) => item?.taskGroupId === taskGroupId && item?.id);
    return String(first?.id || message?.id || "").trim();
  }

  function taskDetailUrl(thread, message) {
    return appRouteUrl({
      view: "tasks",
      workspaceId: thread?.workspaceId || "owner",
      taskGroupId: message?.taskGroupId || "",
      messageId: taskReceiptStartMessageId(thread, message),
    });
  }

  function terminalNotificationRoute(thread, message) {
    const workspaceId = thread?.workspaceId || "owner";
    if (thread?.singleWindow && message?.taskGroupId === singleWindowChatTaskGroupId) {
      const params = { view: "single", workspaceId };
      if (isWeixinSingleWindowThread(thread)) params.weixinChat = "1";
      return {
        url: appRouteUrl(params),
        viewMode: "single",
      };
    }
    return {
      url: taskDetailUrl(thread, message),
      viewMode: "tasks",
    };
  }

  function taskPromptForMessage(thread, message) {
    const taskGroupId = message?.taskGroupId || "";
    const user = [...(thread?.messages || [])]
      .reverse()
      .find((item) => item.role === "user" && (!taskGroupId || item.taskGroupId === taskGroupId));
    return compactText(String(user?.content || thread?.title || "Hermes task"), 120).replace(/\s+/g, " ").trim();
  }

  function notificationBodyForMessage(thread, message, fallback) {
    const prompt = taskPromptForMessage(thread, message);
    const summary = compactText(String(message?.content || "").replace(/^Task ID:\s*\S+/i, "").trim(), 140)
      .replace(/MEDIA:\s*\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return summary || prompt || fallback;
  }

  function normalizeMentionAlias(value) {
    return String(value || "")
      .replace(/^@+/, "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function trimMentionToken(value) {
    return String(value || "")
      .replace(/^[\s@]+/, "")
      .replace(/[.,，。？！；、，]、\\>"'`]+$/g, "")
      .trim();
  }

  function groupMentionCandidates(thread) {
    return chatGroupMemberWorkspaceIds(thread).map((workspaceId) => {
      const workspace = findWorkspace(workspaceId) || {};
      const principalId = workspacePrincipal(workspaceId);
      const label = workspaceLabel(workspaceId);
      const aliases = dedupe([
        workspaceId,
        principalId,
        label,
        workspace.label,
        workspace.name,
      ].map((item) => String(item || "").trim()).filter(Boolean));
      return { workspaceId, principalId, label, aliases };
    });
  }

  function groupMentionWorkspaceIds(thread, text, senderWorkspaceId = "") {
    const candidates = groupMentionCandidates(thread);
    if (!candidates.length || !String(text || "").includes("@")) return [];
    const byAlias = new Map();
    for (const candidate of candidates) {
      for (const alias of candidate.aliases || []) {
        const normalized = normalizeMentionAlias(alias);
        if (normalized) byAlias.set(normalized, candidate.workspaceId);
      }
    }
    const mentioned = new Set();
    const source = String(text || "").replace(/\u00a0/g, " ");
    const tokenPattern = /@([^\s@]{1,80})/g;
    let match = null;
    while ((match = tokenPattern.exec(source))) {
      const token = normalizeMentionAlias(trimMentionToken(match[1] || ""));
      const workspaceId = token ? byAlias.get(token) : "";
      if (workspaceId && workspaceId !== senderWorkspaceId) mentioned.add(workspaceId);
    }
    return [...mentioned];
  }

  function notifyGroupChatMentions(thread, userMessage) {
    if (!thread?.singleWindow || userMessage?.taskGroupId !== singleWindowGroupChatTaskGroupId) {
      return Promise.resolve([]);
    }
    const mentionedWorkspaceIds = groupMentionWorkspaceIds(thread, userMessage.content || "", userMessage.senderWorkspaceId || "");
    if (!mentionedWorkspaceIds.length) return Promise.resolve([]);
    const senderLabel = userMessage.senderLabel || workspaceLabel(userMessage.senderWorkspaceId || "") || "Hermes Mobile";
    const body = compactText(String(userMessage.content || "").replace(/\s+/g, " ").trim(), 180);
    const jobs = mentionedWorkspaceIds.map((workspaceId) => {
      const principalId = workspacePrincipal(workspaceId);
      return sendPushNotification({
        title: "\u7fa4\u804a @\u4f60",
        body: `${senderLabel}: ${body || "\u6709\u4eba\u5728\u7fa4\u804a\u4e2d\u63d0\u5230\u4e86\u4f60"}`,
        tag: `hermes-group-mention-${thread.id}-${userMessage.id}-${workspaceId}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        vibrate: [200, 100, 200],
        data: {
          url: appRouteUrl({ view: "single", workspaceId, groupChat: "1", threadId: thread.id, messageId: userMessage.id }),
          viewMode: "single",
          workspaceId,
          principalId,
          messageType: "group_mention",
          threadId: thread.id,
          messageId: userMessage.id,
          senderWorkspaceId: userMessage.senderWorkspaceId || "",
          requireInteraction: true,
        },
      }, {
        principalIds: [principalId],
        urgency: "high",
        ttl: 24 * 60 * 60,
      });
    });
    return Promise.all(jobs).catch((err) => {
      logger.error?.(`Hermes group mention Web Push send failed: ${err.message || String(err)}`);
      return [];
    });
  }

  function notifyTaskTerminal(thread, message, status) {
    if (thread?.singleWindow && message?.taskGroupId === singleWindowGroupChatTaskGroupId) return Promise.resolve(null);
    const principalId = workspacePrincipal(thread?.workspaceId || "owner");
    const workspaceId = thread?.workspaceId || workspaceIdForPrincipal(principalId) || "owner";
    const messageType = status === "failed" ? "task_failed" : "task_completed";
    const title = status === "failed" ? "\u4efb\u52a1\u5931\u8d25" : "\u4efb\u52a1\u5b8c\u6210";
    const fallback = status === "failed" ? (message?.error || "Task failed") : "Task completed";
    const body = notificationBodyForMessage(thread, message, fallback);
    const route = terminalNotificationRoute(thread, message);
    return sendPushNotification({
      title,
      body,
      tag: `hermes-task-${message?.id || message?.runId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data: {
        url: route.url,
        viewMode: route.viewMode,
        workspaceId,
        principalId,
        messageType,
        threadId: thread?.id || "",
        taskGroupId: message?.taskGroupId || "",
        messageId: taskReceiptStartMessageId(thread, message),
        runId: message?.runId || "",
        status,
        requireInteraction: true,
      },
    }, {
      principalIds: [principalId],
      urgency: "high",
      ttl: 24 * 60 * 60,
    }).catch((err) => {
      logger.error?.(`Hermes Mobile Push send failed: ${err.message || String(err)}`);
      return null;
    });
  }

  function workspaceIdForPrincipalFromCatalog(principalId) {
    const principal = String(principalId || "owner").trim() || "owner";
    const workspace = (loadCatalog().workspaces || []).find((item) => {
      const itemPrincipal = String(item?.policy?.principal_id || item?.id || "").trim() || "owner";
      return item.id === principal || itemPrincipal === principal;
    });
    return workspace?.id || (principal === "owner" ? "owner" : principal);
  }

  initializeWebPush();

  return {
    activePushPrincipals,
    appRouteUrl,
    automationListSortByLatestDeliverable,
    automationLatestDeliverableForPush,
    automationLatestDeliverableTimeMs,
    automationPushEventForJob,
    automationPushSignature,
    confirmedTodoPushMarkKeys,
    deliverTodoWebPushEvent,
    generateWebPushVapidConfig,
    getWebPushConfig,
    initializeWebPush,
    loadVapidConfig,
    markTodoWebPush,
    notificationBodyForMessage,
    normalizePushDelivery,
    normalizePushReceipt,
    normalizePushSubscription,
    notifyGroupChatMentions,
    notifyTaskTerminal,
    notifyTodoCreated,
    publicPushStatus,
    pushSubscriptionScopeSignature,
    recordPushReceipt,
    removePushSubscription,
    runAutomationWebPushTick,
    runTodoWebPushTick,
    savePushSubscription,
    scheduleBackgroundWebPushDispatcher,
    sendPushNotification,
    setAutomationPushMark,
    startAutomationWebPushDispatcher,
    startTodoWebPushDispatcher,
    taskDetailUrl,
    todoPushPayload,
    terminalNotificationRoute,
    todoDetailUrl,
    workspaceIdForPrincipalFromCatalog,
  };
}

module.exports = {
  createWebPushDeliveryService,
};
