"use strict";

const { createWebPushAutomationProjectionService } = require("./web-push-automation-projection-service");
const {
  createWebPushDeliveryNormalizationService,
  normalizeWebPushOrigin,
} = require("./web-push-delivery-normalization-service");
const { createWebPushNativeChannelService } = require("./web-push-native-channel-service");
const { createWebPushSendService } = require("./web-push-send-service");
const { createWebPushVapidService } = require("./web-push-vapid-service");
const { createNotificationChannelService, normalizeNotificationChannel } = require("./notification-channel-service");

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
  const automationDeliverableLookbackMs = numeric(options.automationDeliverableLookbackMs, 30 * 60 * 1000);
  const automationDeliverableFutureGraceMs = numeric(options.automationDeliverableFutureGraceMs, 30 * 60 * 1000);
  const automationInitialLookbackMs = numeric(options.automationInitialLookbackMs, 24 * 60 * 60 * 1000);
  const configuredDeploymentOrigin = () => normalizeWebPushOrigin(
    typeof options.deploymentOrigin === "function"
      ? options.deploymentOrigin()
      : (options.deploymentOrigin
        || env.HERMES_MOBILE_PUBLIC_ORIGIN
        || env.HERMES_WEB_PUBLIC_ORIGIN
        || env.HERMES_PUBLIC_ORIGIN
        || env.PUBLIC_ORIGIN
        || ""),
  );
  const webPushNormalizationService = createWebPushDeliveryNormalizationService({
    dedupe,
    deploymentOrigin: configuredDeploymentOrigin,
    findWorkspace,
    hashValue,
    loadCatalog,
    makeId,
    normalizeOrigin: normalizeWebPushOrigin,
    normalizeStringList,
    nowIso,
    workspaceIdForPrincipal,
    workspacePrincipal,
  });
  const {
    assertPushSubscriptionClientAllowed,
    normalizePushDelivery,
    normalizePushReceipt,
    normalizePushSubscription,
    notificationRecipientWorkspaceIdsForWorkspace,
    pushSubscriptionScopeSignature,
    pushSubscriptionSkipReason,
    shouldSkipPushSubscriptionForClient,
  } = webPushNormalizationService;
  let todoWebPushRunning = false;
  let automationWebPushRunning = false;

  function currentState() {
    return state() || {};
  }

  const webPushAutomationProjectionService = createWebPushAutomationProjectionService({
    appRouteUrl,
    automationDeliverableExtensions: options.automationDeliverableExtensions,
    automationDeliverableFutureGraceMs,
    automationDeliverableLookbackMs,
    automationInitialLookbackMs,
    compactText,
    hashValue,
    nowIso,
    state: currentState,
    workspaceIdForPrincipal,
  });
  const {
    automationDeliverableSourceRef,
    automationDetailRouteUrl,
    automationJobLooksScheduledTodo,
    automationLatestDeliverableForPush,
    automationLatestDeliverableTimeMs,
    automationListSortByLatestDeliverable,
    automationOwnerPrincipal,
    automationPushEventForJob,
    automationPushMarkSignature,
    automationPushSignature,
    automationRunFailed,
    isRecentInitialAutomationEvent,
    setAutomationPushMark,
  } = webPushAutomationProjectionService;

  const webPushVapidService = createWebPushVapidService({
    effectiveWebPushSubject,
    effectiveWebPushVapidPath,
    env,
    loadRuntimeConfig,
    logger,
    webpush,
    webPushEnabled,
    webPushSubject,
  });
  const {
    generateWebPushVapidConfig,
    getWebPushConfig,
    initializeWebPush,
    loadVapidConfig,
  } = webPushVapidService;

  const webPushSendService = createWebPushSendService({
    hashValue,
    makeId,
    normalizePushDelivery,
    normalizeStringList,
    nowIso,
    pushSubscriptionSkipReason,
    saveState,
    shouldSkipPushSubscriptionForClient,
    state: currentState,
    webpush,
    webPushConfig: getWebPushConfig,
  });
  const {
    activePushPrincipals,
    publicPushStatus,
    removePushSubscription,
    sendPushNotification: sendWebPushNotification,
  } = webPushSendService;

  const webPushNativeChannelService = createWebPushNativeChannelService({ appRouteUrl, compactText, logger, nativeNotificationService: options.nativeNotificationService, normalizeStringList, workspaceIdForPrincipal });
  const notificationChannelService = createNotificationChannelService({
    sendNativeNotification: (...args) => webPushNativeChannelService.sendNativeNotification(...args),
    sendWebPushNotification,
  });
  const sendPushNotification = (...args) => notificationChannelService.sendNotification(...args);

  function todoProvider() { return getProvider(options.todoProvider); }
  function automationProvider() { return getProvider(options.automationProvider); }
  function actionInboxService() { return getProvider(options.actionInboxService); }

  async function upsertActionInboxSourceItem(input = {}) {
    const service = actionInboxService();
    if (!service || typeof service.upsertSourceItem !== "function") return null;
    try {
      const result = await Promise.resolve(service.upsertSourceItem(input));
      return result?.ok ? result.item : null;
    } catch (err) {
      logger.warn?.(`Hermes Action Inbox source upsert failed: ${err.message || String(err)}`);
      return null;
    }
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
    const clientContext = assertPushSubscriptionClientAllowed(meta);
    const normalized = normalizePushSubscription({
      subscription,
      deviceLabel: meta.deviceLabel,
      userAgent: meta.userAgent,
      clientContext,
      displayMode: clientContext.displayMode,
      standalone: clientContext.standalone,
      clientVersion: clientContext.clientVersion,
      platform: clientContext.platform,
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

  function hasSentPushDeliveryForTag(tag, messageType = "") {
    const wantedTag = String(tag || "").trim();
    if (!wantedTag) return false;
    const wantedType = String(messageType || "").trim();
    return (currentState().pushDeliveries || []).some((delivery) => {
      if (!delivery || typeof delivery !== "object") return false;
      if (String(delivery.tag || "").trim() !== wantedTag) return false;
      if (wantedType && String(delivery.messageType || "").trim() !== wantedType) return false;
      return Number(delivery.sent || 0) > 0;
    });
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
    const config = getWebPushConfig();
    if (!config || !principals.length) {
      return { ok: true, enabled: Boolean(config), principals, reconcileResults, events: [], deliveries: [] };
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

  async function runAutomationWebPushTick(opts = {}) {
    if (!automationPushEnabled) return { ok: true, enabled: false, events: [], initialized: [], deliveries: [] };
    const principals = activePushPrincipals();
    const config = getWebPushConfig();
    if (!config || !principals.length) {
      return { ok: true, enabled: Boolean(config), principals, events: [], initialized: [], deliveries: [] };
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
      const failed = automationRunFailed(job);
      const scheduledTodo = automationJobLooksScheduledTodo(job);
      const latestDoc = automationLatestDeliverableForPush(job, existingMark);
      if (!latestDoc && !failed && !scheduledTodo) continue;
      const existingSameRun = existingMark && typeof existingMark === "object"
        && String(existingMark.lastRunAt || "").trim() === String(job?.lastRunAt || "").trim();
      if (scheduledTodo && !latestDoc && !failed && existingSameRun) continue;
      const signature = automationPushSignature(job, latestDoc);
      if (!signature) continue;
      const existing = automationPushMarkSignature(existingMark);
      if (existing === signature) continue;
      const event = automationPushEventForJob(job, latestDoc, signature);
      if (!event) continue;
      if (!existing && !opts.includeInitial && !isRecentInitialAutomationEvent(job, latestDoc)) {
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
      const originalUrl = automationDetailRouteUrl({ workspaceId: event.workspaceId, automationId: event.jobId });
      const inboxItem = await upsertActionInboxSourceItem({
        workspaceId: event.workspaceId,
        assigneeWorkspaceId: event.workspaceId,
        sourceType: "automation",
        sourceId: event.jobId,
        sourceRef: {
          automationId: event.jobId,
          signature: event.signature,
          automationTitle: String(event.payload?.data?.automationTitle || event.payload?.title || "").trim(),
          latestDocumentName: event.latestDoc?.name || "",
          latestDeliverable: automationDeliverableSourceRef(event.latestDoc),
          scheduledTodo: Boolean(event.scheduledTodo),
          schedule: String(event.payload?.data?.schedule || "").trim(),
        },
        itemType: /failed/i.test(String(event.payload?.data?.messageType || "")) ? "error" : (event.scheduledTodo ? "todo" : "delivery"),
        status: "open",
        priority: /failed/i.test(String(event.payload?.data?.messageType || "")) ? "high" : (event.scheduledTodo ? "high" : "normal"),
        title: event.payload?.title || "",
        summary: event.payload?.body || "",
        actionLabel: "\u67e5\u770b",
        deepLink: originalUrl,
        dedupeKey: `automation:${event.jobId}:${event.signature}`,
      });
      if (inboxItem?.id && event.payload?.data) {
        const automationUrl = automationDetailRouteUrl({
          workspaceId: event.workspaceId,
          automationId: event.jobId,
          inboxItemId: inboxItem.id,
        });
        event.payload.data.originalUrl = automationUrl;
        event.payload.data.inboxItemId = inboxItem.id;
        event.payload.data.sourceInboxItemId = inboxItem.id;
        event.payload.data.returnTo = "inbox";
        event.payload.data.returnScope = "detail";
        event.payload.data.viewMode = "automation";
        event.payload.data.url = automationUrl;
      }
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

  async function notifyLearningGrowthEvaluationComplete(input = {}) {
    const taskCardId = String(input.taskCardId || "").trim();
    const workspaceId = String(input.workspaceId || "").trim() || "owner";
    if (!taskCardId) return null;
    const principalId = workspacePrincipal(workspaceId);
    const evaluation = input.evaluation && typeof input.evaluation === "object" ? input.evaluation : {};
    const score = Number(evaluation.score || 0);
    const scoreText = Number.isFinite(score) && score > 0 ? ` (${Math.round(score)}分)` : "";
    const failed = String(input.error || "").trim();
    const status = String(evaluation.status || "").trim();
    const event = {
      title: failed ? "Growth 批改未完成" : "Growth 批改完成",
      body: failed
        ? "一次 Growth 作答已收到，但 AI 批改未完成；请打开卡片查看状态。"
        : `AI 批改已完成${scoreText}；点击查看这张卡的批改内容。`,
      tag: `hermes-learning-growth-${taskCardId}-${input.submissionId || status || "evaluation"}`,
      data: {
        viewMode: "growth",
        workspaceId,
        principalId,
        taskCardId,
        submissionId: input.submissionId || "",
        evaluationId: evaluation.evaluationId || "",
        messageType: failed ? "learning_growth_evaluation_failed" : "learning_growth_evaluation_completed",
      },
    };
    const originalUrl = appRouteUrl({ view: "growth", workspaceId, pluginRoute: "card", pluginItemId: taskCardId });
    const inboxItem = await upsertActionInboxSourceItem({
      workspaceId,
      assigneeWorkspaceId: workspaceId,
      sourceType: "growth",
      sourceId: taskCardId,
      sourceRef: {
        taskCardId,
        submissionId: input.submissionId || "",
        evaluationId: evaluation.evaluationId || "",
        status,
      },
      itemType: failed ? "error" : "review",
      status: "open",
      priority: failed ? "high" : "normal",
      title: event.title,
      summary: event.body,
      actionLabel: "\u67e5\u770b",
      deepLink: originalUrl,
      dedupeKey: `growth:${taskCardId}:${input.submissionId || evaluation.evaluationId || status || "evaluation"}`,
    });
    const data = Object.assign({}, event.data, {
      url: originalUrl,
    });
    if (inboxItem?.id) {
      data.originalUrl = originalUrl;
      data.inboxItemId = inboxItem.id;
      data.viewMode = "inbox";
      data.url = appRouteUrl({ view: "inbox", workspaceId, inboxItemId: inboxItem.id });
    }
    return sendPushNotification({
      title: event.title,
      body: event.body,
      tag: event.tag,
      renotify: true,
      requireInteraction: true,
      timestamp: Date.now(),
      data,
    }, {
      principalId,
      urgency: "high",
      ttl: 24 * 60 * 60,
    }).catch((err) => {
      logger.error?.(`Hermes Learning Growth Web Push send failed: ${err.message || String(err)}`);
      return null;
    });
  }

  function growthCompletionSummary(input = {}) {
    const evaluation = input.evaluation && typeof input.evaluation === "object" ? input.evaluation : {};
    const reward = input.reward && typeof input.reward === "object" ? input.reward : evaluation.reward || {};
    const reflection = input.reflection && typeof input.reflection === "object" ? input.reflection : null;
    const score = Number(evaluation.score || 0);
    const scoreText = Number.isFinite(score) && score > 0 ? `评分 ${Math.round(score)} 分` : "";
    const rewardStatus = String(reward.status || "").trim();
    const rewardText = rewardStatus === "settled"
      ? `奖励已结算${Number(reward.coinAmount || 0) ? ` ${Number(reward.coinAmount || 0)} 金币` : ""}`
      : (rewardStatus ? `奖励状态 ${rewardStatus}` : "");
    const reflectionText = reflection ? `反思${String(reflection.status || "").trim() === "accepted" ? "已通过" : "已记录"}` : "";
    const parts = [scoreText, reflectionText, rewardText].filter(Boolean);
    return compactText(parts.length ? parts.join("；") : "学习任务已完成。", 220);
  }

  async function notifyLearningGrowthTaskComplete(input = {}) {
    const taskCardId = String(input.taskCardId || "").trim();
    const taskWorkspaceId = String(input.workspaceId || "").trim() || "owner";
    if (!taskCardId) return null;
    const evaluation = input.evaluation && typeof input.evaluation === "object" ? input.evaluation : {};
    const reward = input.reward && typeof input.reward === "object" ? input.reward : evaluation.reward || {};
    const reflection = input.reflection && typeof input.reflection === "object" ? input.reflection : null;
    const completion = input.completion && typeof input.completion === "object" ? input.completion : {};
    const taskTitle = compactText(input.taskTitle || input.title || taskCardId, 80);
    const title = taskTitle ? `Growth 完成：${taskTitle}` : "Growth 任务完成";
    const body = growthCompletionSummary({ evaluation, reward, reflection });
    const sourceId = taskCardId;
    const evaluationId = String(evaluation.evaluationId || "").trim();
    const reflectionId = String(reflection?.reflectionId || reflection?.id || "").trim();
    const completionId = String(completion.completionId || completion.id || "").trim();
    const dedupeSuffix = evaluationId || reflectionId || completionId || "completed";
    const originalUrl = appRouteUrl({ view: "growth", workspaceId: taskWorkspaceId, pluginRoute: "card", pluginItemId: taskCardId });
    const recipients = notificationRecipientWorkspaceIdsForWorkspace(taskWorkspaceId);
    const deliveries = [];
    const inboxItems = [];
    for (const recipientWorkspaceId of recipients) {
      const principalId = workspacePrincipal(recipientWorkspaceId);
      const inboxItem = await upsertActionInboxSourceItem({
        workspaceId: recipientWorkspaceId,
        assigneeWorkspaceId: recipientWorkspaceId,
        sourceType: "growth",
        sourceId,
        sourceRef: {
          taskWorkspaceId,
          taskCardId,
          cardId: input.cardId || "",
          learnerId: input.learnerId || "",
          evaluationId,
          reflectionId,
          rewardStatus: reward.status || "",
          completed: true,
        },
        itemType: "info",
        status: "open",
        priority: "normal",
        title,
        summary: body,
        actionLabel: "\u6253\u5f00",
        deepLink: originalUrl,
        dedupeKey: `growth-completion:${taskWorkspaceId}:${taskCardId}:${dedupeSuffix}`,
      });
      if (inboxItem?.id) inboxItems.push({ workspaceId: recipientWorkspaceId, itemId: inboxItem.id });
      const data = {
        url: inboxItem?.id ? appRouteUrl({ view: "inbox", workspaceId: recipientWorkspaceId, inboxItemId: inboxItem.id }) : originalUrl,
        originalUrl,
        viewMode: inboxItem?.id ? "inbox" : "growth",
        workspaceId: recipientWorkspaceId,
        taskWorkspaceId,
        principalId,
        taskCardId,
        cardId: input.cardId || "",
        evaluationId,
        reflectionId,
        messageType: "learning_growth_task_completed",
        requireInteraction: true,
      };
      if (inboxItem?.id) data.inboxItemId = inboxItem.id;
      const delivery = await sendPushNotification({
        title,
        body,
        tag: `hermes-learning-growth-complete-${taskWorkspaceId}-${taskCardId}-${dedupeSuffix}`,
        renotify: true,
        requireInteraction: true,
        timestamp: Date.now(),
        data,
      }, {
        principalId,
        urgency: "high",
        ttl: 24 * 60 * 60,
      }).catch((err) => {
        logger.error?.(`Hermes Learning Growth completion Web Push send failed: ${err.message || String(err)}`);
        return { enabled: false, attempted: 0, sent: 0, failed: 0, removed: 0, error: err.message || String(err) };
      });
      deliveries.push(Object.assign({}, delivery, { workspaceId: recipientWorkspaceId, principalId, inboxItemId: inboxItem?.id || "" }));
    }
    return { ok: true, taskCardId, workspaceId: taskWorkspaceId, recipients, inboxItems, deliveries };
  }

  function taskReceiptMessageId(_thread, message) {
    return String(message?.id || "").trim();
  }

  function taskDetailUrl(thread, message) {
    return appRouteUrl({
      view: "tasks",
      workspaceId: thread?.workspaceId || "owner",
      taskGroupId: message?.taskGroupId || "",
      messageId: taskReceiptMessageId(thread, message),
    });
  }

  function terminalNotificationRoute(thread, message) {
    const workspaceId = thread?.workspaceId || "owner";
    if (thread?.singleWindow && message?.taskGroupId === singleWindowChatTaskGroupId) {
      const params = {
        view: "single",
        workspaceId,
        threadId: thread?.id || "",
        messageId: taskReceiptMessageId(thread, message),
      };
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
    const senderLabel = userMessage.senderLabel || workspaceLabel(userMessage.senderWorkspaceId || "") || "Home AI";
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

  async function notifyTaskTerminal(thread, message, status) {
    if (thread?.singleWindow && message?.taskGroupId === singleWindowGroupChatTaskGroupId) return Promise.resolve(null);
    const principalId = workspacePrincipal(thread?.workspaceId || "owner");
    const workspaceId = thread?.workspaceId || workspaceIdForPrincipal(principalId) || "owner";
    const messageType = status === "failed" ? "task_failed" : "task_completed";
    const title = status === "failed" ? "\u4efb\u52a1\u5931\u8d25" : "\u4efb\u52a1\u5b8c\u6210";
    const fallback = status === "failed" ? (message?.error || "Task failed") : "Task completed";
    const body = notificationBodyForMessage(thread, message, fallback);
    const route = terminalNotificationRoute(thread, message);
    const data = {
      url: route.url,
      viewMode: route.viewMode,
      workspaceId,
      principalId,
      messageType,
      threadId: thread?.id || "",
      taskGroupId: message?.taskGroupId || "",
      messageId: taskReceiptMessageId(thread, message),
      runId: message?.runId || "",
      status,
      requireInteraction: true,
    };
    const notificationChannel = normalizeNotificationChannel(message?.notificationChannel || message?.notification_channel || message?.runOptions?.notificationChannel || message?.runOptions?.notification_channel, "");
    if (notificationChannel) data.notificationChannel = notificationChannel;
    const tag = `hermes-task-${message?.id || message?.runId || Date.now()}`;
    if (hasSentPushDeliveryForTag(tag, messageType)) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        duplicate: true,
        tag,
        messageType,
        messageId: data.messageId,
      });
    }
    return sendPushNotification({
      title,
      body,
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data,
    }, {
      principalIds: [principalId],
      notificationChannel: notificationChannel || "both",
      urgency: "high",
      ttl: 24 * 60 * 60,
    }).catch((err) => {
      logger.error?.(`Home AI Push send failed: ${err.message || String(err)}`);
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
    notifyLearningGrowthEvaluationComplete,
    notifyLearningGrowthTaskComplete,
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
