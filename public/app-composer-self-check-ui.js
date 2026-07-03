"use strict";

const COMPOSER_SELF_CHECK_DELAY_MS = 2400;
const COMPOSER_SELF_CHECK_MAX_REPORTS_PER_SESSION = 8;
const composerSelfCheckReportedKeys = new Set();

function composerSelfCheckClean(value, maxLength = 120) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function composerSelfCheckToken(value, fallback = "unknown", maxLength = 80) {
  const token = composerSelfCheckClean(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function composerSelfCheckMessages(thread = state.currentThread) {
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function composerSelfCheckActiveRunIds(thread = state.currentThread) {
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
    thread_id: state.currentThreadId || state.currentThread?.id || "",
    counts: Object.assign({
      message_count: composerSelfCheckMessages().length,
      active_run_count: composerSelfCheckActiveRunIds().length,
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
        refresh_in_flight: Boolean(state.currentThreadRefreshInFlight),
        composer_send_in_flight: Boolean(state.composerSendInFlight),
        user_scroll_protected: typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive(),
      },
    }],
  };
}

function reportComposerSelfCheckIssue(errorCode, fields = {}, counts = {}) {
  try {
    if (composerSelfCheckReportedKeys.size >= COMPOSER_SELF_CHECK_MAX_REPORTS_PER_SESSION) return false;
    const key = [
      composerSelfCheckToken(errorCode, "unknown", 100),
      composerSelfCheckToken(state.currentThreadId || state.currentThread?.id || "", "", 120),
      composerSelfCheckToken(fields.messageId || "", "", 120),
      composerSelfCheckToken(fields.runId || "", "", 120),
    ].join(":");
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
  const issues = [];
  const runId = String(current.runId || message.runId || "");
  const activeRunIds = composerSelfCheckActiveRunIds();
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
    String(current.status || message.status || "") === "done"
    && composerSelfCheckClean(current.content || message.content || "", 32)
    && !composerSelfCheckMessageHasReceipt(current)
  ) {
    issues.push("composer_terminal_receipt_missing");
    reportComposerSelfCheckIssue("composer_terminal_receipt_missing", {
      messageId: current.id,
      runId,
      messageStatus: current.status,
      messageRole: current.role,
    }, {
      receipt_count: 0,
    });
  }
  const duplicateCount = composerSelfCheckDuplicateLocalUserServerCount();
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
  if (!composerMessageTerminalStatus(message) || message.role !== "assistant") return false;
  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : COMPOSER_SELF_CHECK_DELAY_MS;
  window.setTimeout(() => runComposerTerminalSelfCheck(message), delayMs);
  return true;
}

function composerSelfCheckReportProtectedScrollBypass(reason = "terminal_receipt_refresh") {
  const protectedScroll = typeof conversationUserScrollProtectActive === "function" && conversationUserScrollProtectActive();
  if (!protectedScroll) return false;
  reportComposerSelfCheckIssue("composer_scroll_protection_bypassed", {
    messageStatus: "unknown",
    messageRole: "assistant",
    reason: composerSelfCheckToken(reason, "unknown", 80),
  }, {
    protected_scroll_bypass_count: 1,
  });
  return true;
}
