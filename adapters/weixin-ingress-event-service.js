"use strict";

function compactFallback(value) {
  return value;
}

function deliveryTimeMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function messageContentForWeixinIngress(event) {
  const lines = [];
  if (event?.text) lines.push(event.text);
  for (const item of event?.attachments || []) {
    if (item.path) lines.push(`MEDIA:${item.path}`);
    else if (item.url) lines.push(`Attachment: ${item.name || "file"} ${item.url}`);
    else if (item.name) lines.push(`Attachment: ${item.name}`);
  }
  return lines.join("\n\n").trim();
}

function isAttachmentOnlyWeixinEvent(event) {
  return !String(event?.text || "").trim() && Array.isArray(event?.attachments) && event.attachments.length > 0;
}

function pendingAttachmentInstructionLines(messages) {
  const lines = [];
  for (const message of messages || []) {
    const content = String(message?.content || "");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("MEDIA:")) lines.push(`- ${trimmed.slice("MEDIA:".length).trim()}`);
    }
  }
  return lines;
}

function instructionsForWeixinIngress(event, pendingAttachmentMessages = []) {
  const lines = [
    "This request arrived from Hermes Mobile's Weixin ingress sidecar.",
    "Hermes Mobile owns outbound delivery back to the origin chat. Do not call send_message, Weixin, or other external chat delivery tools unless the user explicitly asks to send something to a third party.",
    "Produce the final reply for Hermes Mobile to deliver. If you create user-facing files, include MEDIA:/absolute/path lines in the final answer.",
    `Ingress route: account=${event?.accountId || "unknown"}, chat=${event?.chatId || event?.userId || "unknown"}.`,
  ];
  const pendingLines = pendingAttachmentInstructionLines(pendingAttachmentMessages);
  if (pendingLines.length) {
    lines.push(
      "The same Weixin route sent the following attachment-only message(s) immediately before this text. Treat these media files as attached to the latest user instruction, not as separate completed tasks:",
      ...pendingLines.slice(0, 20),
    );
  }
  return lines.join("\n");
}

function createWeixinIngressEventService(options = {}) {
  const weixinIngressProvider = options.weixinIngressProvider;
  if (!weixinIngressProvider || typeof weixinIngressProvider.normalizeInboundEvent !== "function") {
    throw new TypeError("weixin ingress event service requires weixinIngressProvider.normalizeInboundEvent");
  }
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : (() => null);
  const findExistingIngressEvent = typeof options.findExistingIngressEvent === "function" ? options.findExistingIngressEvent : (() => null);
  const wakeOutboundForInbound = typeof options.wakeOutboundForInbound === "function" ? options.wakeOutboundForInbound : (() => ({ count: 0, deliveryIds: [] }));
  const classifyMaintenanceIntent = typeof options.classifyMaintenanceIntent === "function" ? options.classifyMaintenanceIntent : (() => null);
  const ensureThreadForEvent = typeof options.ensureThreadForEvent === "function" ? options.ensureThreadForEvent : (() => null);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}_${Date.now().toString(36)}`);
  const senderInfoForWorkspace = typeof options.senderInfoForWorkspace === "function"
    ? options.senderInfoForWorkspace
    : ((workspaceId) => ({
      senderWorkspaceId: workspaceId || "owner",
      senderPrincipalId: workspaceId || "owner",
      senderLabel: workspaceId || "owner",
    }));
  const normalizeExternalIngress = typeof options.normalizeExternalIngress === "function" ? options.normalizeExternalIngress : compactFallback;
  const normalizeExternalDelivery = typeof options.normalizeExternalDelivery === "function" ? options.normalizeExternalDelivery : compactFallback;
  const deliveryMatchesInboundEvent = typeof options.deliveryMatchesInboundEvent === "function" ? options.deliveryMatchesInboundEvent : (() => false);
  const attachmentContextWindowMs = Math.max(0, Number(options.attachmentContextWindowMs || 0) || 0);
  const taskGroupHasRunningRun = typeof options.taskGroupHasRunningRun === "function" ? options.taskGroupHasRunningRun : (() => false);
  const runConcurrencyError = typeof options.runConcurrencyError === "function" ? options.runConcurrencyError : (() => null);
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : compactFallback;
  const compactThread = typeof options.compactThread === "function" ? options.compactThread : compactFallback;
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : compactFallback;
  const startRunForThread = typeof options.startRunForThread === "function" ? options.startRunForThread : null;
  const userFacingRunError = typeof options.userFacingRunError === "function" ? options.userFacingRunError : ((err) => err?.message || String(err));
  const enqueueTerminalDelivery = typeof options.enqueueTerminalDelivery === "function" ? options.enqueueTerminalDelivery : (() => {});
  const removeThreadActiveRun = typeof options.removeThreadActiveRun === "function" ? options.removeThreadActiveRun : (() => {});
  const taskGroupId = String(options.taskGroupId || "chat");

  function pendingAttachmentMessagesForEvent(thread, event, nowMs = Date.now()) {
    const messages = [];
    if (!thread || !event || attachmentContextWindowMs <= 0) return messages;
    for (const message of [...(thread.messages || [])].reverse()) {
      const ingress = normalizeExternalIngress(message?.externalIngress || null);
      if (!ingress || ingress.source !== "weixin") continue;
      if (ingress.status !== "waiting_instruction") continue;
      if (!deliveryMatchesInboundEvent(ingress, event, ingress.workspaceId || thread.workspaceId || "")) continue;
      const createdMs = deliveryTimeMs(message.submittedAt || message.createdAt || ingress.createdAt || ingress.updatedAt || "");
      if (createdMs && nowMs - createdMs > attachmentContextWindowMs) continue;
      if (!String(message.content || "").includes("MEDIA:")) continue;
      messages.unshift(message);
    }
    return messages;
  }

  function consumePendingAttachmentMessages(thread, event, consumedAt = nowIso()) {
    const pending = pendingAttachmentMessagesForEvent(thread, event, deliveryTimeMs(consumedAt) || Date.now());
    for (const message of pending) {
      message.externalIngress = normalizeExternalIngress(Object.assign({}, message.externalIngress || {}, {
        status: "consumed_by_instruction",
        consumedAt,
        consumedByEventId: event?.eventId || "",
        updatedAt: consumedAt,
      }));
      message.updatedAt = consumedAt;
    }
    return pending;
  }

  function broadcastThreadAndMessage(thread, message) {
    broadcast({ type: "thread.updated", thread: threadSummary(thread) });
    broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message), thread: threadSummary(thread) });
  }

  function baseUserMessage(event, workspaceId, senderInfo, ingressMeta, createdAt) {
    return {
      id: makeId("msg"),
      role: "user",
      content: messageContentForWeixinIngress(event),
      status: "done",
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      artifacts: [],
      taskGroupId,
      messageKind: "ai",
      senderWorkspaceId: senderInfo.senderWorkspaceId,
      senderPrincipalId: senderInfo.senderPrincipalId,
      senderLabel: event.senderLabel || senderInfo.senderLabel,
      actorWorkspaceId: workspaceId,
      externalIngress: ingressMeta,
      singleWindowMode: "chat",
    };
  }

  async function start(body) {
    const event = weixinIngressProvider.normalizeInboundEvent(body);
    if (weixinIngressProvider.isInboundHeartbeatEvent(event)) {
      const workspaceId = weixinIngressProvider.resolveWorkspaceId(event);
      const workspace = workspaceId ? findWorkspace(workspaceId) : null;
      const awakenedOutbound = workspace ? wakeOutboundForInbound(event, workspaceId) : { count: 0, deliveryIds: [] };
      return {
        ok: true,
        heartbeat: true,
        eventId: event.eventId,
        workspaceId: workspaceId || "",
        skipped: !workspace,
        reason: workspace ? "weixin_ingress_heartbeat" : "unmatched_workspace_route",
        awakenedOutbound,
      };
    }

    const duplicate = findExistingIngressEvent(event.eventId);
    if (duplicate) {
      const workspaceId = weixinIngressProvider.resolveWorkspaceId(event) || duplicate.thread?.workspaceId || "";
      const workspace = workspaceId ? findWorkspace(workspaceId) : null;
      const awakenedOutbound = workspace ? wakeOutboundForInbound(event, workspaceId) : { count: 0, deliveryIds: [] };
      return {
        ok: true,
        duplicate: true,
        eventId: event.eventId,
        awakenedOutbound,
        thread: compactThread(duplicate.thread),
        message: compactMessage(duplicate.message),
      };
    }

    const workspaceId = weixinIngressProvider.resolveWorkspaceId(event);
    if (!workspaceId || !findWorkspace(workspaceId)) {
      return {
        ok: true,
        skipped: true,
        reason: "unmatched_workspace_route",
        eventId: event.eventId,
      };
    }

    const awakenedOutbound = wakeOutboundForInbound(event, workspaceId);
    const attachmentOnly = isAttachmentOnlyWeixinEvent(event);
    if (!attachmentOnly) {
      const maintenanceIntent = classifyMaintenanceIntent(messageContentForWeixinIngress(event));
      if (maintenanceIntent) {
        const err = new Error(maintenanceIntent.message);
        err.status = 403;
        err.result = { code: maintenanceIntent.category, operatorRequired: true };
        throw err;
      }
    }

    const thread = ensureThreadForEvent(event, workspaceId);
    const createdAt = nowIso();
    const senderInfo = senderInfoForWorkspace(workspaceId);
    const ingressStatus = attachmentOnly ? "waiting_instruction" : "received";
    const ingressMeta = normalizeExternalIngress(Object.assign({}, event, {
      threadKey: weixinIngressProvider.threadKey(event),
      workspaceId,
      status: ingressStatus,
      createdAt,
      updatedAt: createdAt,
    }));

    if (attachmentOnly) {
      const userMessage = Object.assign(baseUserMessage(event, workspaceId, senderInfo, ingressMeta, createdAt), {
        awaitingInstruction: true,
      });
      thread.messages.push(userMessage);
      thread.status = (thread.activeRunIds || []).length ? "running" : "idle";
      thread.updatedAt = createdAt;
      saveState();
      broadcastThreadAndMessage(thread, userMessage);
      return {
        ok: true,
        duplicate: false,
        awaitingInstruction: true,
        eventId: event.eventId,
        awakenedOutbound,
        run: { status: "waiting_instruction", taskGroupId },
        thread: compactThread(thread),
      };
    }

    const pendingAttachmentMessages = consumePendingAttachmentMessages(thread, event, createdAt);
    const queueBehindActiveRun = taskGroupHasRunningRun(thread, taskGroupId);
    if (!queueBehindActiveRun) {
      const concurrencyError = runConcurrencyError(workspaceId);
      if (concurrencyError) throw concurrencyError;
    }

    const userMessage = baseUserMessage(event, workspaceId, senderInfo, ingressMeta, createdAt);
    const assistantMessage = {
      id: makeId("msg"),
      role: "assistant",
      content: "",
      status: "queued",
      runId: null,
      createdAt,
      updatedAt: createdAt,
      queuedAt: createdAt,
      artifacts: [],
      taskGroupId,
      messageKind: "ai",
      senderWorkspaceId: "hermes",
      senderPrincipalId: "hermes",
      senderLabel: "Hermes",
      actorWorkspaceId: workspaceId,
      singleWindowMode: "chat",
      externalDelivery: normalizeExternalDelivery({
        source: "weixin",
        status: "waiting",
        accountId: event.accountId,
        chatId: event.chatId,
        userId: event.userId,
        eventId: event.eventId,
        workspaceId,
        createdAt,
        updatedAt: createdAt,
      }),
    };
    const runOptions = {
      singleWindowMode: "chat",
      actorWorkspaceId: workspaceId,
      instructions: instructionsForWeixinIngress(event, pendingAttachmentMessages),
      gatewayRouting: {
        source: "weixin",
        workspaceId,
        accountId: event.accountId,
        chatId: event.chatId || event.userId || "",
      },
    };
    assistantMessage.runOptions = runOptions;
    thread.messages.push(userMessage, assistantMessage);
    thread.status = queueBehindActiveRun && (thread.activeRunIds || []).length ? "running" : "queued";
    thread.updatedAt = createdAt;
    saveState();
    broadcastThreadAndMessage(thread, userMessage);
    broadcastThreadAndMessage(thread, assistantMessage);
    if (queueBehindActiveRun) {
      return { ok: true, duplicate: false, eventId: event.eventId, awakenedOutbound, run: { status: "queued", taskGroupId }, thread: compactThread(thread) };
    }

    try {
      if (typeof startRunForThread !== "function") throw new Error("Weixin ingress run starter is not configured");
      const run = await startRunForThread(thread, userMessage, assistantMessage, runOptions);
      return { ok: true, duplicate: false, eventId: event.eventId, awakenedOutbound, run, thread: compactThread(thread) };
    } catch (err) {
      const failedAt = nowIso();
      assistantMessage.status = "failed";
      assistantMessage.error = userFacingRunError(err);
      assistantMessage.failedAt = failedAt;
      assistantMessage.updatedAt = failedAt;
      enqueueTerminalDelivery(thread, assistantMessage, "failed");
      removeThreadActiveRun(thread, assistantMessage.runId, "failed");
      thread.updatedAt = failedAt;
      saveState();
      broadcast({ type: "run.failed", threadId: thread.id, message: compactMessage(assistantMessage), thread: threadSummary(thread) });
      return {
        ok: false,
        accepted: true,
        eventId: event.eventId,
        awakenedOutbound,
        error: assistantMessage.error,
        run: { status: "failed", taskGroupId },
        thread: compactThread(thread),
      };
    }
  }

  return Object.freeze({
    consumePendingAttachmentMessages,
    instructionsForWeixinIngress,
    messageContentForWeixinIngress,
    pendingAttachmentMessagesForEvent,
    start,
  });
}

module.exports = {
  createWeixinIngressEventService,
  instructionsForWeixinIngress,
  isAttachmentOnlyWeixinEvent,
  messageContentForWeixinIngress,
  pendingAttachmentInstructionLines,
};
