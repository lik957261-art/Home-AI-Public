"use strict";

function normalizeChatGroupFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.assign({ enabled: false }, value)
    : { enabled: false };
}

function normalizeExternalIngressFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : null;
}

function normalizeExternalDeliveryFallback(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.assign({}, value) : null;
}

function latestMessageTimestamp(messages) {
  return (messages || []).reduce((latest, message) => {
    const value = message?.completedAt || message?.failedAt || message?.cancelledAt || message?.updatedAt || message?.createdAt || "";
    return String(value) > String(latest || "") ? value : latest;
  }, "");
}

function messageChronologyRank(message) {
  if (message?.role === "user") return 0;
  if (message?.role === "assistant") return 1;
  return 2;
}

function sortMessagesChronologically(messages) {
  return [...(messages || [])].sort((a, b) => (
    String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""))
    || messageChronologyRank(a) - messageChronologyRank(b)
    || String(a?.submittedAt || a?.queuedAt || "").localeCompare(String(b?.submittedAt || b?.queuedAt || ""))
    || String(a?.id || "").localeCompare(String(b?.id || ""))
  ));
}

function updateThreadChronology(thread) {
  if (!thread || typeof thread !== "object") return;
  const latest = latestMessageTimestamp(thread.messages);
  if (latest) thread.updatedAt = latest;
  const earliest = (thread.messages || [])
    .map((message) => message?.createdAt || "")
    .filter(Boolean)
    .sort()[0];
  if (earliest && String(earliest) < String(thread.createdAt || "")) {
    thread.createdAt = earliest;
  }
}

function isWeixinSingleWindowThread(thread) {
  return Boolean(thread?.singleWindow && thread?.externalIngress?.source === "weixin");
}

function messageBelongsToWeixinWindow(message) {
  return Boolean(
    message?.externalIngress?.source === "weixin"
    || message?.externalDelivery?.source === "weixin"
    || message?.runOptions?.gatewayRouting?.source === "weixin"
  );
}

function sourceField(source, camelName, snakeName) {
  return source?.[camelName] || source?.[snakeName] || "";
}

function createWeixinWindowMigrationService(options = {}) {
  const getState = typeof options.state === "function"
    ? options.state
    : () => options.state;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}_${Date.now().toString(36)}`);
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const normalizeChatGroup = typeof options.normalizeChatGroup === "function"
    ? options.normalizeChatGroup
    : normalizeChatGroupFallback;
  const normalizeExternalIngress = typeof options.normalizeExternalIngress === "function"
    ? options.normalizeExternalIngress
    : normalizeExternalIngressFallback;
  const normalizeExternalDelivery = typeof options.normalizeExternalDelivery === "function"
    ? options.normalizeExternalDelivery
    : normalizeExternalDeliveryFallback;
  const createSingleWindowThread = typeof options.createSingleWindowThread === "function"
    ? options.createSingleWindowThread
    : ((workspaceId, overrides = {}) => Object.assign({
      id: makeId("thread"),
      title: "Single Window",
      workspaceId,
      singleWindow: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
      events: [],
    }, overrides));
  const weixinIngressProvider = options.weixinIngressProvider || null;
  const singleWindowChatTaskGroupId = String(options.singleWindowChatTaskGroupId || "chat");

  function stateObject() {
    const state = getState();
    if (!state || typeof state !== "object") throw new Error("weixin window migration service requires state");
    if (!Array.isArray(state.threads)) state.threads = [];
    if (!Array.isArray(state.artifacts)) state.artifacts = [];
    return state;
  }

  function isGroupChatThread(thread) {
    return Boolean(normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner").enabled);
  }

  function weixinThreadSeed(workspaceId, source = {}) {
    const now = nowIso();
    let threadKey = String(sourceField(source, "threadKey", "thread_key")).trim();
    if (
      !threadKey
      && (sourceField(source, "accountId", "account_id")
        || sourceField(source, "chatId", "chat_id")
        || sourceField(source, "userId", "user_id"))
      && weixinIngressProvider
      && typeof weixinIngressProvider.threadKey === "function"
    ) {
      try {
        threadKey = weixinIngressProvider.threadKey(source);
      } catch (_) {
        threadKey = "";
      }
    }
    return normalizeExternalIngress({
      source: "weixin",
      threadKey,
      eventId: sourceField(source, "eventId", "event_id"),
      accountId: sourceField(source, "accountId", "account_id"),
      chatId: sourceField(source, "chatId", "chat_id"),
      userId: sourceField(source, "userId", "user_id"),
      principalId: sourceField(source, "principalId", "principal_id"),
      workspaceId,
      senderLabel: sourceField(source, "senderLabel", "sender_label"),
      status: source.status || "window",
      createdAt: source.createdAt || source.created_at || now,
      updatedAt: source.updatedAt || source.updated_at || now,
    });
  }

  function findWeixinSingleWindowThreadForWorkspace(workspaceId, state = stateObject()) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    return (state.threads || [])
      .filter((thread) => (
        thread?.workspaceId === id
        && isWeixinSingleWindowThread(thread)
        && !isGroupChatThread(thread)
      ))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  }

  function createWeixinSingleWindowThread(workspaceId, seed = {}) {
    return createSingleWindowThread(workspaceId, {
      title: "Weixin",
      hermesSessionId: `web_weixin_${makeId("session")}`,
      externalIngress: weixinThreadSeed(workspaceId, seed),
    });
  }

  function sourceThreadHasActiveRun(sourceThread) {
    return Boolean(
      (sourceThread.activeRunIds || []).length
      || (sourceThread.messages || []).some((message) => ["queued", "running"].includes(message?.status))
    );
  }

  function migrateWeixinMessagesToDedicatedThread(workspaceId, targetThread = null) {
    const id = String(workspaceId || "").trim();
    if (!id) return null;
    const state = stateObject();
    let target = targetThread || findWeixinSingleWindowThreadForWorkspace(id, state);
    let changed = false;

    for (const sourceThread of state.threads || []) {
      if (
        !sourceThread?.singleWindow
        || sourceThread.workspaceId !== id
        || isGroupChatThread(sourceThread)
        || isWeixinSingleWindowThread(sourceThread)
      ) {
        continue;
      }
      if (sourceThreadHasActiveRun(sourceThread)) continue;
      const moveMessages = (sourceThread.messages || []).filter(messageBelongsToWeixinWindow);
      if (!moveMessages.length) continue;
      if (!target) {
        target = createWeixinSingleWindowThread(id, moveMessages[0]?.externalIngress || moveMessages[0]?.externalDelivery || {});
        state.threads.unshift(target);
      }

      const moveIds = new Set(moveMessages.map((message) => String(message?.id || "")).filter(Boolean));
      const existingIds = new Set((target.messages || []).map((message) => String(message?.id || "")));
      const movedMessages = [];
      const keptMessages = [];
      for (const message of sourceThread.messages || []) {
        const messageId = String(message?.id || "");
        if (!moveIds.has(messageId)) {
          keptMessages.push(message);
          continue;
        }
        if (messageId && existingIds.has(messageId)) continue;
        const moved = Object.assign({}, message, {
          taskGroupId: singleWindowChatTaskGroupId,
          singleWindowMode: "chat",
        });
        if (moved.externalDelivery) {
          moved.externalDelivery = normalizeExternalDelivery(Object.assign({}, moved.externalDelivery, {
            threadId: target.id,
            taskGroupId: singleWindowChatTaskGroupId,
            updatedAt: moved.externalDelivery.updatedAt || moved.updatedAt || nowIso(),
          }));
        }
        movedMessages.push(moved);
        if (messageId) existingIds.add(messageId);
      }

      target.messages = sortMessagesChronologically([...(target.messages || []), ...movedMessages]);
      updateThreadChronology(target);
      sourceThread.messages = keptMessages;
      updateThreadChronology(sourceThread);
      for (const artifact of state.artifacts || []) {
        if (moveIds.has(String(artifact.messageId || ""))) artifact.threadId = target.id;
      }
      changed = true;
    }

    if (changed) {
      saveState(state, { reason: "weixin-single-window-split", forceBackup: true });
    }
    return target;
  }

  return {
    createWeixinSingleWindowThread,
    findWeixinSingleWindowThreadForWorkspace,
    isGroupChatThread,
    isWeixinSingleWindowThread,
    messageBelongsToWeixinWindow,
    migrateWeixinMessagesToDedicatedThread,
    sourceThreadHasActiveRun,
    updateThreadChronology,
    weixinThreadSeed,
  };
}

module.exports = {
  createWeixinWindowMigrationService,
  isWeixinSingleWindowThread,
  latestMessageTimestamp,
  messageBelongsToWeixinWindow,
  sortMessagesChronologically,
  updateThreadChronology,
};
