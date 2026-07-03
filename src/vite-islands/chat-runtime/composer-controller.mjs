import {
  applyOptimisticSendPlan,
  buildComposerActionState,
  clearOptimisticSendPlan,
  createOptimisticSendPlan,
} from "./composer-model.mjs";
import {
  interruptComposerRun,
  sendComposerMessage,
} from "./composer-api-client.mjs";

const CHAT_COMPOSER_CONTROLLER_VERSION = "20260703-vite-chat-composer-controller-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeArtifacts(value) {
  return Array.isArray(value) ? value.filter(isObject).slice(0, 20) : [];
}

function noop() {}

function nowIsoFrom(input) {
  if (typeof input === "function") return cleanString(input(), 80);
  return cleanString(input || new Date(0).toISOString(), 80);
}

function statusPayload(status = {}, defaults = {}) {
  return Object.freeze({
    status: cleanString(status.status || defaults.status || "idle", 80),
    message: cleanString(status.message || defaults.message || "", 400),
    source: cleanString(status.source || defaults.source || "", 120),
    runId: cleanString(status.runId || defaults.runId || "", 180),
    error: cleanString(status.error || defaults.error || "", 240),
  });
}

function extractRunId(result = {}) {
  return cleanString(result.run?.run_id || result.run?.id || (Array.isArray(result.runIds) ? result.runIds[0] : "") || "", 180);
}

function mergeComposerResultThread(baseThread = {}, resultThread = {}, token = null) {
  const cleared = token ? clearOptimisticSendPlan(baseThread, token) : Object.assign({}, baseThread);
  const existingMessages = Array.isArray(cleared.messages) ? cleared.messages : [];
  const resultMessages = Array.isArray(resultThread.messages) ? resultThread.messages : [];
  const seen = new Set(existingMessages.map((message) => cleanString(message?.id || "", 180)).filter(Boolean));
  const mergedMessages = existingMessages.concat(resultMessages.filter((message) => {
    const id = cleanString(message?.id || "", 180);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }));
  return Object.freeze(Object.assign({}, cleared, resultThread, {
    messages: Object.freeze(mergedMessages),
  }));
}

function createComposerController(options = {}) {
  const source = cleanString(options.source || "vite_chat_composer_controller", 120);
  const getThread = typeof options.getThread === "function" ? options.getThread : () => ({});
  const setThread = typeof options.setThread === "function" ? options.setThread : noop;
  const getDraft = typeof options.getDraft === "function" ? options.getDraft : () => "";
  const setDraft = typeof options.setDraft === "function" ? options.setDraft : noop;
  const getPendingArtifacts = typeof options.getPendingArtifacts === "function" ? options.getPendingArtifacts : () => [];
  const clearPendingArtifacts = typeof options.clearPendingArtifacts === "function" ? options.clearPendingArtifacts : noop;
  const getNextIndex = typeof options.getNextIndex === "function" ? options.getNextIndex : () => 0;
  const setNextIndex = typeof options.setNextIndex === "function" ? options.setNextIndex : noop;
  const setOptimisticToken = typeof options.setOptimisticToken === "function" ? options.setOptimisticToken : noop;
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : (status) => status;
  const messages = Object.assign({
    sending: "Sending Composer message",
    sent: "Composer message readback returned",
    sendFailed: "Composer send failed",
    blocked: "Composer send unavailable",
    stopping: "Stopping Composer run",
    stopped: "Composer run stopped",
    interruptFailed: "Composer interrupt failed",
  }, isObject(options.statusMessages) ? options.statusMessages : {});
  const events = Object.assign({
    sendStarted: "composer.send_started",
    sendResult: "composer.send_result",
    sendError: "composer.send_error",
    interruptResult: "composer.interrupt_result",
  }, isObject(options.eventNames) ? options.eventNames : {});
  const patchTypes = Object.assign({
    sendStarted: "composer_send_started",
    sendResult: "composer_send_result",
    sendError: "composer_send_error",
    interruptResult: "composer_interrupt_result",
  }, isObject(options.patchTypes) ? options.patchTypes : {});

  function report(status = {}, defaults = {}) {
    return onStatus(statusPayload(status, Object.assign({ source }, defaults)));
  }

  function readThread(input = {}) {
    return input.thread || getThread() || {};
  }

  function buildSendBody(input = {}) {
    const draftText = cleanString(input.text !== undefined ? input.text : getDraft(), 240000);
    const artifacts = normalizeArtifacts(input.pendingArtifacts !== undefined ? input.pendingArtifacts : getPendingArtifacts());
    const body = Object.assign({}, isObject(input.body) ? input.body : {}, {
      text: draftText,
      artifacts,
      workspaceId: cleanString(input.body?.workspaceId || input.workspaceId || "owner", 120) || "owner",
      notificationChannel: cleanString(input.body?.notificationChannel || input.notificationChannel || "web_push", 80) || "web_push",
    });
    return Object.freeze(body);
  }

  async function send(input = {}) {
    const thread = readThread(input);
    const requestBody = buildSendBody(input);
    const nextIndex = Number(input.nextIndex ?? getNextIndex()) || 0;
    const baseId = cleanString(input.baseId || `${options.baseIdPrefix || "local_send_vite"}_${nextIndex + 1}`, 180);
    const plan = createOptimisticSendPlan({
      thread,
      threadId: thread.id,
      text: requestBody.text,
      pendingArtifacts: requestBody.artifacts,
      viewMode: input.viewMode || "single",
      singleWindowMode: input.singleWindowMode || requestBody.singleWindowMode || "task",
      activeChatTaskGroupId: input.activeChatTaskGroupId || "",
      baseId,
      nowIso: nowIsoFrom(input.nowIso || options.nowIso),
      queuedAt: nowIsoFrom(input.queuedAt || options.queuedAtIso || input.nowIso || options.nowIso),
      body: requestBody,
    });
    if (!plan.ok) {
      const status = report({
        status: "blocked",
        message: `${messages.blocked}: ${plan.code || "unknown"}`,
        error: plan.code || "composer_send_unavailable",
      });
      return Object.freeze({ ok: false, status, plan, thread, result: null });
    }

    setDraft("");
    setNextIndex(nextIndex + 1);
    setOptimisticToken(plan.token);
    report({ status: "sending", message: messages.sending });
    setThread(applyOptimisticSendPlan(thread, plan), {
      action: patchTypes.sendStarted,
      eventType: events.sendStarted,
      patch: {
        type: patchTypes.sendStarted,
        messageCount: plan.messages.length,
        tokenId: plan.token.localPendingSendId,
      },
    });

    try {
      const result = await sendComposerMessage({
        api: options.api,
        threadId: thread.id,
        body: requestBody,
        timeoutMs: input.timeoutMs || options.timeoutMs,
      });
      setOptimisticToken(null);
      if (input.clearPendingArtifacts !== false) clearPendingArtifacts();
      const mergedThread = mergeComposerResultThread(readThread(input), result?.thread || {}, plan.token);
      setThread(mergedThread, {
        action: patchTypes.sendResult,
        eventType: events.sendResult,
        patch: {
          type: patchTypes.sendResult,
          source: cleanString(result?.source || "", 120),
          runId: extractRunId(result),
        },
      });
      const status = report({
        status: "sent",
        message: messages.sent,
        source: cleanString(result?.source || source, 120),
        runId: extractRunId(result),
      });
      return Object.freeze({ ok: true, status, plan, thread: mergedThread, result });
    } catch (error) {
      setOptimisticToken(null);
      const rolledBackThread = clearOptimisticSendPlan(readThread(input), plan.token);
      const code = cleanString(error?.code || error?.message || "send_failed", 240);
      setThread(rolledBackThread, {
        action: patchTypes.sendError,
        eventType: events.sendError,
        patch: {
          type: patchTypes.sendError,
          code,
        },
      });
      const status = report({
        status: "error",
        message: messages.sendFailed,
        error: code,
      });
      return Object.freeze({ ok: false, status, plan, thread: rolledBackThread, result: null, error });
    }
  }

  async function interrupt(input = {}) {
    const thread = readThread(input);
    try {
      report({ status: "stopping", message: messages.stopping });
      const result = await interruptComposerRun({
        api: options.api,
        threadId: input.threadId || thread.id,
        body: isObject(input.body) ? input.body : {},
        timeoutMs: input.timeoutMs || options.timeoutMs,
      });
      const mergedThread = mergeComposerResultThread(thread, result?.thread || {});
      setThread(mergedThread, {
        action: patchTypes.interruptResult,
        eventType: events.interruptResult,
        patch: {
          type: patchTypes.interruptResult,
          runCount: Array.isArray(result?.runIds) ? result.runIds.length : 0,
        },
      });
      const status = report({
        status: "stopped",
        message: messages.stopped,
        source: cleanString(result?.source || source, 120),
        runId: extractRunId(result),
      });
      return Object.freeze({ ok: true, status, thread: mergedThread, result });
    } catch (error) {
      const status = report({
        status: "error",
        message: messages.interruptFailed,
        error: cleanString(error?.code || error?.message || "interrupt_failed", 240),
      });
      return Object.freeze({ ok: false, status, thread, result: null, error });
    }
  }

  return Object.freeze({
    version: CHAT_COMPOSER_CONTROLLER_VERSION,
    actionState: buildComposerActionState,
    send,
    interrupt,
  });
}

export {
  CHAT_COMPOSER_CONTROLLER_VERSION,
  createComposerController,
  mergeComposerResultThread,
};
