"use strict";

const CHAT_COMPOSER_SELF_CHECK_MODEL_ESM_PATH = "/vite-islands/chat-composer-self-check-model/chat-composer-self-check-model.js";
const COMPOSER_SELF_CHECK_DELAY_MS = 2400;
const COMPOSER_SELF_CHECK_MAX_REPORTS_PER_SESSION = 8;
const composerSelfCheckReportedKeys = new Set();
let chatComposerSelfCheckModel = null;
let chatComposerSelfCheckModelPromise = null;

function importChatComposerSelfCheckModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerSelfCheckModel) return Promise.resolve(chatComposerSelfCheckModel);
  if (!chatComposerSelfCheckModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerSelfCheckModel === "function"
      ? rootRef.__homeAiImportChatComposerSelfCheckModel
      : (path) => import(path);
    chatComposerSelfCheckModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_SELF_CHECK_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerSelfCheckModel = model || null;
        return chatComposerSelfCheckModel;
      })
      .catch((error) => {
        chatComposerSelfCheckModelPromise = null;
        throw error;
      });
  }
  return chatComposerSelfCheckModelPromise;
}

function currentChatComposerSelfCheckModel() {
  return chatComposerSelfCheckModel;
}

if (typeof window !== "undefined") {
  importChatComposerSelfCheckModel().catch(() => null);
}

function composerSelfCheckClean(value, maxLength = 120) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckCleanValue === "function") {
    return model.composerSelfCheckCleanValue(value, maxLength);
  }
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function composerSelfCheckToken(value, defaultValue = "unknown", maxLength = 80) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckTokenValue === "function") {
    return model.composerSelfCheckTokenValue(value, defaultValue, maxLength);
  }
  const token = composerSelfCheckClean(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || defaultValue;
}

function composerSelfCheckMessages(thread = state.currentThread) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckMessagesForThread === "function") {
    return model.composerSelfCheckMessagesForThread(thread);
  }
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function composerSelfCheckActiveRunIds(thread = state.currentThread) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckActiveRunIdsForThread === "function") {
    return model.composerSelfCheckActiveRunIdsForThread(thread);
  }
  const ids = [];
  if (thread?.activeRunId) ids.push(String(thread.activeRunId));
  if (Array.isArray(thread?.activeRunIds)) {
    thread.activeRunIds.forEach((id) => {
      const text = String(id || "").trim();
      if (text && !ids.includes(text)) ids.push(text);
    });
  }
  return ids;
}

function composerSelfCheckMessageById(messageId, thread = state.currentThread) {
  const id = String(messageId || "");
  if (!id) return null;
  return composerSelfCheckMessages(thread).find((message) => String(message?.id || "") === id) || null;
}

function composerSelfCheckCssEscape(value = "") {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function composerSelfCheckVisibleReceipt(messageId) {
  try {
    const id = composerSelfCheckCssEscape(messageId);
    const article = document.querySelector?.(`.message[data-message-id="${id}"]`);
    if (!article) return false;
    return Boolean(article.querySelector?.(".usage, .message-skills, .run-progress-history, .gateway-diagnostic, [data-wardrobe-outfit-action]"));
  } catch (_) {
    return false;
  }
}

function composerSelfCheckMessageHasReceipt(message = {}) {
  return Boolean(
    message?.usage
    || message?.gatewayDiagnostic
    || message?.gateway_diagnostic
    || message?.wardrobeAction
    || message?.wardrobe_action
    || (Array.isArray(message?.skillEvents) && message.skillEvents.length)
    || composerSelfCheckVisibleReceipt(message?.id),
  );
}

function composerSelfCheckDuplicateLocalUserServerCount(thread = state.currentThread) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckDuplicateLocalUserServerCountForThread === "function") {
    return model.composerSelfCheckDuplicateLocalUserServerCountForThread(thread);
  }
  const messages = composerSelfCheckMessages(thread);
  const serverKeys = new Set();
  for (const message of messages) {
    if (!message || message.localPendingSend || String(message.role || "") !== "user") continue;
    const key = [
      composerSelfCheckClean(message.taskGroupId || "", 100),
      composerSelfCheckClean(message.messageKind || "", 40),
      composerSelfCheckClean(message.content || "", 260),
    ].join("\u0000");
    if (key.trim()) serverKeys.add(key);
  }
  let duplicateCount = 0;
  for (const message of messages) {
    if (!message?.localPendingSend || String(message.role || "") !== "user") continue;
    const key = [
      composerSelfCheckClean(message.taskGroupId || "", 100),
      composerSelfCheckClean(message.messageKind || "", 40),
      composerSelfCheckClean(message.content || "", 260),
    ].join("\u0000");
    if (serverKeys.has(key)) duplicateCount += 1;
  }
  return duplicateCount;
}

function composerSelfCheckThreadContext(fields = {}) {
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckThreadContextPlan === "function") {
    return model.composerSelfCheckThreadContextPlan({
      fields,
      viewMode: state.viewMode || "",
      singleWindowMode: state.singleWindowMode || "",
      threadStatus: state.currentThread?.status || "",
    });
  }
  return {
    signal_id: "composer_runtime_feedback",
    signal_domain: "composer_runtime",
    module: "app-composer-self-check-ui",
    view_mode: composerSelfCheckToken(state.viewMode || "", "", 80),
    single_window_mode: composerSelfCheckToken(state.singleWindowMode || "", "", 80),
    thread_status: composerSelfCheckToken(state.currentThread?.status || "", "", 80),
    message_status: composerSelfCheckToken(fields.messageStatus || "", "", 80),
    message_role: composerSelfCheckToken(fields.messageRole || "", "", 40),
  };
}

function composerSelfCheckBuildPayload(errorCode, fields = {}, counts = {}) {
  const safeErrorCode = composerSelfCheckToken(errorCode, "composer_runtime_invariant_failed", 100);
  const clientVersion = typeof document !== "undefined" ? document.documentElement?.dataset?.clientVersion || "" : "";
  const threadId = state.currentThreadId || state.currentThread?.id || "";
  const messageCount = composerSelfCheckMessages().length;
  const activeRunCount = composerSelfCheckActiveRunIds().length;
  const refreshInFlight = Boolean(state.currentThreadRefreshInFlight);
  const composerSendInFlight = Boolean(state.composerSendInFlight);
  const userScrollProtected = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const model = currentChatComposerSelfCheckModel();
  if (typeof model?.composerSelfCheckPayloadPlan === "function") {
    return model.composerSelfCheckPayloadPlan({
      errorCode: safeErrorCode,
      fields,
      counts,
      clientVersion,
      workspaceId: state.selectedWorkspaceId || "",
      threadId,
      messageCount,
      activeRunCount,
      viewMode: state.viewMode || "",
      singleWindowMode: state.singleWindowMode || "",
      threadStatus: state.currentThread?.status || "",
      refreshInFlight,
      composerSendInFlight,
      userScrollProtected,
    });
  }
  return {
    schema_version: "homeai.composerSelfCheck.v1",
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_composer_runtime",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    error_code: safeErrorCode,
    route: "/system/self-check",
    build_id: clientVersion,
    workspaceId: state.selectedWorkspaceId || "owner",
    thread_id: threadId,
    counts: Object.assign({
      message_count: messageCount,
      active_run_count: activeRunCount,
    }, counts),
    context: composerSelfCheckThreadContext(fields),
    breadcrumbs: [{
      kind: "composer_self_check",
      code: safeErrorCode,
      status: "failed",
      fields: {
        message_id: composerSelfCheckToken(fields.messageId || "", "", 120),
        run_id: composerSelfCheckToken(fields.runId || "", "", 120),
        reason: composerSelfCheckToken(fields.reason || "", "", 80),
        refresh_in_flight: refreshInFlight,
        composer_send_in_flight: composerSendInFlight,
        user_scroll_protected: userScrollProtected,
      },
    }],
  };
}

function reportComposerSelfCheckIssue(errorCode, fields = {}, counts = {}) {
  try {
    const model = currentChatComposerSelfCheckModel();
    const keyPlan = typeof model?.composerSelfCheckReportKeyPlan === "function"
      ? model.composerSelfCheckReportKeyPlan({
        errorCode,
        threadId: state.currentThreadId || state.currentThread?.id || "",
        messageId: fields.messageId || "",
        runId: fields.runId || "",
        reportedCount: composerSelfCheckReportedKeys.size,
        maxReports: COMPOSER_SELF_CHECK_MAX_REPORTS_PER_SESSION,
      })
      : {
        key: [
          composerSelfCheckToken(errorCode, "unknown", 100),
          composerSelfCheckToken(state.currentThreadId || state.currentThread?.id || "", "", 120),
          composerSelfCheckToken(fields.messageId || "", "", 120),
          composerSelfCheckToken(fields.runId || "", "", 120),
        ].join(":"),
        allowedByLimit: composerSelfCheckReportedKeys.size < COMPOSER_SELF_CHECK_MAX_REPORTS_PER_SESSION,
      };
    if (!keyPlan.allowedByLimit) return false;
    const key = keyPlan.key;
    if (composerSelfCheckReportedKeys.has(key)) return false;
    composerSelfCheckReportedKeys.add(key);
    const payload = composerSelfCheckBuildPayload(errorCode, fields, counts);
    if (typeof api === "function") {
      api("/api/v1/home-ai/diagnostics/events", {
        method: "POST",
        body: JSON.stringify(payload),
      }).catch(() => {});
      return true;
    }
    if (typeof fetch === "function") {
      const headers = { "Content-Type": "application/json" };
      if (state.key) headers["X-Hermes-Web-Key"] = state.key;
      fetch("/api/v1/home-ai/diagnostics/events", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
        cache: "no-store",
      }).catch(() => {});
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function runComposerTerminalSelfCheck(message = {}) {
  if (!composerMessageTerminalStatus(message) || message.role !== "assistant") return [];
  const current = composerSelfCheckMessageById(message.id) || message;
  const runId = String(current.runId || message.runId || "");
  const activeRunIds = composerSelfCheckActiveRunIds();
  const messageStatus = String(current.status || message.status || "");
  const duplicateCount = composerSelfCheckDuplicateLocalUserServerCount();
  const model = currentChatComposerSelfCheckModel();
  const plan = typeof model?.composerTerminalSelfCheckPlan === "function"
    ? model.composerTerminalSelfCheckPlan({
      terminal: true,
      messageId: current.id,
      runId,
      activeRunIds,
      messageStatus,
      messageRole: current.role || message.role,
      content: current.content || message.content || "",
      hasReceipt: composerSelfCheckMessageHasReceipt(current),
      duplicateCount,
    })
    : null;
  if (plan) {
    (Array.isArray(plan.reports) ? plan.reports : []).forEach((report) => {
      reportComposerSelfCheckIssue(report.errorCode, report.fields, report.counts);
    });
    return Array.isArray(plan.issues) ? plan.issues : [];
  }
  const issues = [];
  if (runId && activeRunIds.includes(runId)) {
    issues.push("composer_terminal_active_run_stuck");
    reportComposerSelfCheckIssue("composer_terminal_active_run_stuck", {
      messageId: current.id,
      runId,
      messageStatus: current.status,
      messageRole: current.role,
    }, {
      active_run_count: activeRunIds.length,
    });
  }
  if (
    messageStatus === "done"
    && composerSelfCheckClean(current.content || message.content || "", 32)
    && !composerSelfCheckMessageHasReceipt(current)
  ) {
    issues.push("composer_terminal_receipt_missing");
    reportComposerSelfCheckIssue("composer_terminal_receipt_missing", {
      messageId: current.id,
      runId,
      messageStatus,
      messageRole: current.role,
    }, {
      receipt_count: 0,
    });
  }
  if (duplicateCount > 0) {
    issues.push("composer_duplicate_local_server_user_message");
    reportComposerSelfCheckIssue("composer_duplicate_local_server_user_message", {
      messageId: current.id,
      runId,
      messageStatus: current.status,
      messageRole: current.role,
    }, {
      duplicate_count: duplicateCount,
    });
  }
  return issues;
}

function scheduleComposerTerminalSelfCheck(message = {}, options = {}) {
  const terminal = composerMessageTerminalStatus(message);
  const model = currentChatComposerSelfCheckModel();
  const schedulePlan = typeof model?.composerSelfCheckSchedulePlan === "function"
    ? model.composerSelfCheckSchedulePlan({
      terminal,
      messageRole: message.role,
      delayMs: options.delayMs,
    })
    : null;
  if (schedulePlan && !schedulePlan.shouldSchedule) return false;
  if (!schedulePlan && (!terminal || message.role !== "assistant")) return false;
  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : COMPOSER_SELF_CHECK_DELAY_MS;
  window.setTimeout(() => runComposerTerminalSelfCheck(message), schedulePlan ? schedulePlan.delayMs : delayMs);
  return true;
}

function composerSelfCheckReportProtectedScrollBypass(reason = "terminal_receipt_refresh") {
  const protectedScroll = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  const model = currentChatComposerSelfCheckModel();
  const plan = typeof model?.composerProtectedScrollBypassPlan === "function"
    ? model.composerProtectedScrollBypassPlan({ protectedScroll, reason })
    : {
      shouldReport: protectedScroll,
      errorCode: "composer_scroll_protection_bypassed",
      fields: {
        messageStatus: "unknown",
        messageRole: "assistant",
        reason: composerSelfCheckToken(reason, "unknown", 80),
      },
      counts: {
        protected_scroll_bypass_count: 1,
      },
    };
  if (!plan.shouldReport) return false;
  reportComposerSelfCheckIssue(plan.errorCode, plan.fields, plan.counts);
  return true;
}
