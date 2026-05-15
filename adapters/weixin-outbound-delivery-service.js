"use strict";

function createWeixinOutboundDeliveryService(options = {}) {
  const state = typeof options.state === "function" ? options.state : (() => ({ threads: [] }));
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const normalizeExternalDelivery = typeof options.normalizeExternalDelivery === "function"
    ? options.normalizeExternalDelivery
    : ((value) => (value && typeof value === "object" ? Object.assign({}, value) : null));
  const deliveryId = typeof options.deliveryId === "function" ? options.deliveryId : ((threadId, messageId) => `${threadId}:${messageId}`);
  const compactText = typeof options.compactText === "function" ? options.compactText : ((text, limit = 1000) => String(text || "").slice(0, limit));
  const maxMessageChars = Math.max(1, Number(options.maxMessageChars || 12000) || 12000);
  const retryLimit = Math.max(0, Number(options.retryLimit || 0) || 0);
  const retryBaseMs = Math.max(1, Number(options.retryBaseMs || 30_000) || 30_000);
  const retryMaxMs = Math.max(retryBaseMs, Number(options.retryMaxMs || 30 * 60_000) || 30 * 60_000);
  const egressDecide = typeof options.egressDecide === "function"
    ? options.egressDecide
    : (() => ({ allowed: true }));
  const isStaleHttpToolAvailabilityClaim = typeof options.isStaleHttpToolAvailabilityClaim === "function"
    ? options.isStaleHttpToolAvailabilityClaim
    : (() => false);
  const isStaleImageToolAvailabilityClaim = typeof options.isStaleImageToolAvailabilityClaim === "function"
    ? options.isStaleImageToolAvailabilityClaim
    : (() => false);
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : ((thread) => thread);
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : ((message) => message);

  function deliveryTimeMs(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function deliveryRetryCount(delivery) {
    return Math.max(0, Number(delivery?.retryCount || delivery?.retry_count || 0) || 0);
  }

  function deliveryRetryDelayMs(retryCount) {
    const exponent = Math.max(0, Math.min(8, (Number(retryCount) || 1) - 1));
    return Math.min(retryMaxMs, retryBaseMs * (2 ** exponent));
  }

  function isInboundWakeRequiredFailure(ack = {}) {
    const text = [
      ack?.error,
      ack?.rawStatus,
      ack?.raw_status,
      ack?.message,
    ].map((item) => String(item || "")).join("\n");
    return /(?:^|[^A-Za-z0-9_])ret(?:urn)?(?:code)?\s*[:=]\s*-2(?:[^0-9]|$)/i.test(text)
      || /(?:^|[^A-Za-z0-9_])ret\s*(?:\u7b49\u4e8e|\u4e3a|\u662f)\s*-2(?:[^0-9]|$)/i.test(text)
      || /(?:^|[^A-Za-z0-9_])ret\s+-2(?:[^0-9]|$)/i.test(text);
  }

  function isDeliveryRetryable(delivery, nowMs = Date.now()) {
    if (!delivery || delivery.source !== "weixin" || delivery.status !== "failed") return false;
    if (delivery.retryAfterInbound || delivery.retry_after_inbound) return false;
    if (retryLimit <= 0) return false;
    const count = deliveryRetryCount(delivery);
    if (count >= retryLimit) return false;
    const nextRetryMs = deliveryTimeMs(delivery.nextRetryAt || delivery.next_retry_at || "");
    return !nextRetryMs || nextRetryMs <= nowMs;
  }

  function deliveryMatchesStatusFilter(delivery, status, nowMs = Date.now()) {
    if (!delivery || delivery.source !== "weixin") return false;
    if (!status || status === "all") return true;
    if (status === "pending") return delivery.status === "pending" || isDeliveryRetryable(delivery, nowMs);
    if (status === "retryable" || status === "retry") return isDeliveryRetryable(delivery, nowMs);
    if (status === "failed") return delivery.status === "failed" || delivery.status === "waiting_inbound";
    return delivery.status === status;
  }

  function deliveryMatchesInboundEvent(delivery, event, workspaceId) {
    if (!delivery || !event) return false;
    const deliveryWorkspaceId = String(delivery.workspaceId || delivery.workspace_id || "").trim();
    if (deliveryWorkspaceId && workspaceId && deliveryWorkspaceId !== workspaceId) return false;
    const deliveryAccountId = String(delivery.accountId || delivery.account_id || "").trim();
    const eventAccountId = String(event.accountId || event.account_id || "").trim();
    if (deliveryAccountId && eventAccountId && deliveryAccountId !== eventAccountId) return false;
    const deliveryChatId = String(delivery.chatId || delivery.chat_id || "").trim();
    const eventChatId = String(event.chatId || event.chat_id || "").trim();
    if (deliveryChatId && eventChatId) return deliveryChatId === eventChatId;
    const deliveryUserId = String(delivery.userId || delivery.user_id || "").trim();
    const eventUserId = String(event.userId || event.user_id || "").trim();
    if (deliveryUserId && eventUserId) return deliveryUserId === eventUserId;
    const deliveryRoute = deliveryChatId || deliveryUserId;
    const eventRoute = eventChatId || eventUserId;
    if (deliveryRoute && eventRoute) return deliveryRoute === eventRoute;
    return Boolean(deliveryAccountId && eventAccountId && deliveryAccountId === eventAccountId);
  }

  function publicDelivery(thread, message) {
    const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
    if (!delivery) return null;
    return {
      deliveryId: delivery.deliveryId || deliveryId(thread.id, message.id),
      source: "weixin",
      status: delivery.status || "pending",
      accountId: delivery.accountId || "",
      chatId: delivery.chatId || "",
      userId: delivery.userId || "",
      eventId: delivery.eventId || "",
      workspaceId: delivery.workspaceId || thread.workspaceId || "",
      threadId: thread.id,
      messageId: message.id,
      taskGroupId: message.taskGroupId || "",
      taskId: message.taskId || message.runId || "",
      content: String(delivery.content || message.content || message.error || "").trim(),
      artifacts: Array.isArray(delivery.artifacts) ? delivery.artifacts : (Array.isArray(message.artifacts) ? message.artifacts : []),
      terminalStatus: delivery.terminalStatus || message.status || "",
      queuedAt: delivery.queuedAt || delivery.updatedAt || message.updatedAt || "",
      retryCount: deliveryRetryCount(delivery),
      nextRetryAt: delivery.nextRetryAt || delivery.next_retry_at || "",
      lastAttemptAt: delivery.lastAttemptAt || delivery.last_attempt_at || "",
      retryAfterInbound: Boolean(delivery.retryAfterInbound || delivery.retry_after_inbound),
      retryExhausted: Boolean(delivery.retryExhausted || delivery.retry_exhausted),
      error: delivery.error || "",
      updatedAt: delivery.updatedAt || message.updatedAt || "",
    };
  }

  function skippedDelivery(existing, thread, message, terminalStatus, updatedAt, id, error) {
    const next = normalizeExternalDelivery(Object.assign({}, existing, {
      deliveryId: id,
      status: "skipped",
      terminalStatus,
      content: "",
      error,
      artifacts: [],
      threadId: thread.id,
      messageId: message.id,
      taskGroupId: message.taskGroupId || "",
      taskId: message.taskId || message.runId || "",
      workspaceId: thread.workspaceId,
      queuedAt: existing.queuedAt || updatedAt,
      updatedAt,
    }));
    message.externalDelivery = next;
    return next;
  }

  function enqueueForTerminalMessage(thread, message, terminalStatus) {
    const existing = normalizeExternalDelivery(message?.externalDelivery || null);
    if (!existing || existing.source !== "weixin") return null;
    if (["sent", "skipped"].includes(existing.status)) return existing;
    const updatedAt = nowIso();
    const id = existing.deliveryId || deliveryId(thread.id, message.id);
    if (terminalStatus === "failed") {
      return skippedDelivery(existing, thread, message, terminalStatus, updatedAt, id, compactText(message.error || message.content || "Hermes run failed", 1000));
    }
    const content = String(message.content || "").trim();
    if (message?.elevationRequired || isStaleHttpToolAvailabilityClaim(content) || isStaleImageToolAvailabilityClaim(content)) {
      return skippedDelivery(
        existing,
        thread,
        message,
        terminalStatus,
        updatedAt,
        id,
        message?.elevationRequired
          ? "internal_owner_elevation_request_not_external_delivered"
          : "internal_tool_schema_failure_not_external_delivered",
      );
    }
    const artifacts = Array.isArray(message.artifacts) ? message.artifacts : [];
    const egressDecision = egressDecide({
      source: "weixin",
      destination: "weixin",
      operation: "origin_reply",
      workspaceId: thread.workspaceId,
      actorWorkspaceId: thread.workspaceId,
      targetWorkspaceId: thread.workspaceId,
      originReply: true,
      sendsFileContent: artifacts.length > 0,
      contentKinds: artifacts.length ? ["artifact"] : ["text"],
      targetType: "weixin_outbound",
      targetId: existing.eventId || id,
    });
    if (!egressDecision.allowed) {
      return skippedDelivery(existing, thread, message, terminalStatus, updatedAt, id, egressDecision.reason);
    }
    const next = normalizeExternalDelivery(Object.assign({}, existing, {
      deliveryId: id,
      status: "pending",
      terminalStatus,
      content: compactText(content, maxMessageChars),
      artifacts,
      threadId: thread.id,
      messageId: message.id,
      taskGroupId: message.taskGroupId || "",
      taskId: message.taskId || message.runId || "",
      workspaceId: thread.workspaceId,
      queuedAt: existing.queuedAt || updatedAt,
      updatedAt,
    }));
    message.externalDelivery = next;
    return next;
  }

  function allMessages() {
    const out = [];
    for (const thread of state().threads || []) {
      for (const message of thread.messages || []) out.push({ thread, message });
    }
    return out;
  }

  function pendingDeliveries(filters = {}) {
    const status = String(filters.status || "pending").trim().toLowerCase();
    const accountId = String(filters.accountId || "").trim();
    const limit = Math.max(1, Math.min(100, Number(filters.limit || 20) || 20));
    const filterNowMs = Number(filters.nowMs);
    const nowMs = Number.isFinite(filterNowMs) ? filterNowMs : Date.now();
    const out = [];
    for (const { thread, message } of allMessages()) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      if (!delivery || delivery.source !== "weixin") continue;
      if (!deliveryMatchesStatusFilter(delivery, status, nowMs)) continue;
      if (accountId && delivery.accountId !== accountId) continue;
      const projected = publicDelivery(thread, message);
      if (projected) out.push(projected);
    }
    return out
      .sort((a, b) => String(a.queuedAt || a.nextRetryAt || a.updatedAt).localeCompare(String(b.queuedAt || b.nextRetryAt || b.updatedAt)))
      .slice(0, limit);
  }

  function broadcastMessageUpdate(thread, message) {
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message, thread), thread: threadSummary(thread) });
  }

  function ackDelivery(deliveryIdValue, ack = {}) {
    const id = String(deliveryIdValue || "").trim();
    if (!id) return null;
    for (const { thread, message } of allMessages()) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      const candidateId = delivery?.deliveryId || deliveryId(thread.id, message.id);
      if (!delivery || candidateId !== id) continue;
      const acknowledgedAt = ack.acknowledgedAt || nowIso();
      const failureRetryCount = ack.status === "failed" ? deliveryRetryCount(delivery) + 1 : deliveryRetryCount(delivery);
      const waitForInbound = ack.status === "failed" && isInboundWakeRequiredFailure(ack);
      const retryExhausted = ack.status === "failed"
        && !waitForInbound
        && retryLimit > 0
        && failureRetryCount >= retryLimit;
      const retryBaseTimeMs = deliveryTimeMs(acknowledgedAt) || Date.now();
      const nextRetryAt = ack.status === "failed" && !waitForInbound && !retryExhausted && retryLimit > 0
        ? new Date(retryBaseTimeMs + deliveryRetryDelayMs(failureRetryCount)).toISOString()
        : "";
      message.externalDelivery = normalizeExternalDelivery(Object.assign({}, delivery, {
        deliveryId: candidateId,
        status: waitForInbound ? "waiting_inbound" : ack.status,
        providerMessageId: ack.status === "sent" ? ack.providerMessageId : "",
        error: ack.status === "sent" ? "" : ack.error,
        rawStatus: ack.rawStatus,
        acknowledgedAt,
        lastAttemptAt: acknowledgedAt,
        failedAt: ack.status === "failed" ? acknowledgedAt : "",
        sentAt: ack.status === "sent" ? acknowledgedAt : "",
        retryCount: failureRetryCount,
        retryAfterInbound: waitForInbound,
        retryExhausted,
        nextRetryAt,
        updatedAt: acknowledgedAt,
      }));
      message.updatedAt = acknowledgedAt;
      thread.updatedAt = message.updatedAt;
      saveState();
      const projected = publicDelivery(thread, message);
      broadcastMessageUpdate(thread, message);
      return projected;
    }
    return null;
  }

  function wakeForInboundEvent(event, workspaceId) {
    const awakenedAt = nowIso();
    const woke = [];
    for (const { thread, message } of allMessages()) {
      const delivery = normalizeExternalDelivery(message?.externalDelivery || null);
      if (!delivery || delivery.source !== "weixin") continue;
      const waitingInbound = delivery.status === "waiting_inbound" || delivery.retryAfterInbound || delivery.retry_after_inbound;
      if (!waitingInbound) continue;
      if (!deliveryMatchesInboundEvent(delivery, event, workspaceId)) continue;
      message.externalDelivery = normalizeExternalDelivery(Object.assign({}, delivery, {
        status: "pending",
        retryAfterInbound: false,
        retryWakeAt: awakenedAt,
        retryWakeEventId: event?.eventId || "",
        nextRetryAt: "",
        updatedAt: awakenedAt,
      }));
      message.updatedAt = awakenedAt;
      thread.updatedAt = awakenedAt;
      woke.push({ thread, message });
    }
    if (!woke.length) return { count: 0, deliveryIds: [] };
    saveState();
    const deliveryIds = [];
    for (const item of woke) {
      const projected = publicDelivery(item.thread, item.message);
      if (projected?.deliveryId) deliveryIds.push(projected.deliveryId);
      broadcastMessageUpdate(item.thread, item.message);
    }
    return { count: woke.length, deliveryIds };
  }

  return {
    ackDelivery,
    deliveryMatchesInboundEvent,
    deliveryRetryCount,
    deliveryRetryDelayMs,
    enqueueForTerminalMessage,
    isDeliveryRetryable,
    isInboundWakeRequiredFailure,
    pendingDeliveries,
    publicDelivery,
    wakeForInboundEvent,
  };
}

module.exports = {
  createWeixinOutboundDeliveryService,
};
