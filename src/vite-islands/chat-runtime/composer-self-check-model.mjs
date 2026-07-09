const CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION = "20260704-vite-chat-composer-self-check-model-v1";
const COMPOSER_SELF_CHECK_DEFAULT_DELAY_MS = 2400;
const COMPOSER_SELF_CHECK_DEFAULT_MAX_REPORTS_PER_SESSION = 8;

function composerSelfCheckCleanValue(value, maxLength = 120) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function composerSelfCheckTokenValue(value, fallback = "unknown", maxLength = 80) {
  const token = composerSelfCheckCleanValue(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function composerSelfCheckMessagesForThread(thread = {}) {
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function composerSelfCheckActiveRunIdsForThread(thread = {}) {
  const ids = [];
  if (thread?.activeRunId) ids.push(String(thread.activeRunId));
  if (Array.isArray(thread?.activeRunIds)) {
    thread.activeRunIds.forEach((id) => {
      const text = String(id || "").trim();
      if (text && !ids.includes(text)) ids.push(text);
    });
  }
  return Object.freeze(ids);
}

function composerSelfCheckDuplicateLocalUserServerCountForThread(thread = {}) {
  const messages = composerSelfCheckMessagesForThread(thread);
  const serverKeys = new Set();
  for (const message of messages) {
    if (!message || message.localPendingSend || String(message.role || "") !== "user") continue;
    const key = [
      composerSelfCheckCleanValue(message.taskGroupId || "", 100),
      composerSelfCheckCleanValue(message.messageKind || "", 40),
      composerSelfCheckCleanValue(message.content || "", 260),
    ].join("\u0000");
    if (key.trim()) serverKeys.add(key);
  }
  let duplicateCount = 0;
  for (const message of messages) {
    if (!message?.localPendingSend || String(message.role || "") !== "user") continue;
    const key = [
      composerSelfCheckCleanValue(message.taskGroupId || "", 100),
      composerSelfCheckCleanValue(message.messageKind || "", 40),
      composerSelfCheckCleanValue(message.content || "", 260),
    ].join("\u0000");
    if (serverKeys.has(key)) duplicateCount += 1;
  }
  return duplicateCount;
}

function composerSelfCheckThreadContextPlan(input = {}) {
  const fields = input.fields || {};
  return Object.freeze({
    signal_id: "composer_runtime_feedback",
    signal_domain: "composer_runtime",
    module: "app-composer-self-check-ui",
    view_mode: composerSelfCheckTokenValue(input.viewMode || "", "", 80),
    single_window_mode: composerSelfCheckTokenValue(input.singleWindowMode || "", "", 80),
    thread_status: composerSelfCheckTokenValue(input.threadStatus || "", "", 80),
    message_status: composerSelfCheckTokenValue(fields.messageStatus || "", "", 80),
    message_role: composerSelfCheckTokenValue(fields.messageRole || "", "", 40),
  });
}

function composerSelfCheckPayloadPlan(input = {}) {
  const fields = input.fields || {};
  const counts = input.counts || {};
  const safeErrorCode = composerSelfCheckTokenValue(input.errorCode, "composer_runtime_invariant_failed", 100);
  return Object.freeze({
    schema_version: "homeai.composerSelfCheck.v1",
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: "self_check_composer_runtime",
    severity_hint: "H2",
    evidence_confidence: 0.82,
    error_code: safeErrorCode,
    route: "/system/self-check",
    build_id: String(input.clientVersion || ""),
    workspaceId: input.workspaceId || "owner",
    thread_id: input.threadId || "",
    counts: Object.freeze(Object.assign({
      message_count: Number(input.messageCount) || 0,
      active_run_count: Number(input.activeRunCount) || 0,
    }, counts)),
    context: composerSelfCheckThreadContextPlan(input),
    breadcrumbs: Object.freeze([Object.freeze({
      kind: "composer_self_check",
      code: safeErrorCode,
      status: "failed",
      fields: Object.freeze({
        message_id: composerSelfCheckTokenValue(fields.messageId || "", "", 120),
        run_id: composerSelfCheckTokenValue(fields.runId || "", "", 120),
        reason: composerSelfCheckTokenValue(fields.reason || "", "", 80),
        refresh_in_flight: Boolean(input.refreshInFlight),
        composer_send_in_flight: Boolean(input.composerSendInFlight),
        user_scroll_protected: Boolean(input.userScrollProtected),
      }),
    })]),
  });
}

function composerSelfCheckReportKeyPlan(input = {}) {
  const key = [
    composerSelfCheckTokenValue(input.errorCode, "unknown", 100),
    composerSelfCheckTokenValue(input.threadId || "", "", 120),
    composerSelfCheckTokenValue(input.messageId || "", "", 120),
    composerSelfCheckTokenValue(input.runId || "", "", 120),
  ].join(":");
  const reportedCount = Number(input.reportedCount) || 0;
  const maxReports = Number(input.maxReports) || COMPOSER_SELF_CHECK_DEFAULT_MAX_REPORTS_PER_SESSION;
  return Object.freeze({
    version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
    key,
    allowedByLimit: reportedCount < maxReports,
  });
}

function composerTerminalSelfCheckPlan(input = {}) {
  if (!input.terminal || input.messageRole !== "assistant") {
    return Object.freeze({ version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION, issues: Object.freeze([]), reports: Object.freeze([]) });
  }
  const issues = [];
  const reports = [];
  const runId = String(input.runId || "");
  const activeRunIds = Array.isArray(input.activeRunIds) ? input.activeRunIds.map((id) => String(id || "")) : [];
  const fields = Object.freeze({
    messageId: input.messageId || "",
    runId,
    messageStatus: input.messageStatus || "",
    messageRole: input.messageRole || "",
  });
  if (runId && activeRunIds.includes(runId)) {
    issues.push("composer_terminal_active_run_stuck");
    reports.push(Object.freeze({
      errorCode: "composer_terminal_active_run_stuck",
      fields,
      counts: Object.freeze({ active_run_count: activeRunIds.length }),
    }));
  }
  if (input.messageStatus === "done" && composerSelfCheckCleanValue(input.content || "", 32) && !input.hasReceipt) {
    issues.push("composer_terminal_receipt_missing");
    reports.push(Object.freeze({
      errorCode: "composer_terminal_receipt_missing",
      fields,
      counts: Object.freeze({ receipt_count: 0 }),
    }));
  }
  const duplicateCount = Number(input.duplicateCount) || 0;
  if (duplicateCount > 0) {
    issues.push("composer_duplicate_local_server_user_message");
    reports.push(Object.freeze({
      errorCode: "composer_duplicate_local_server_user_message",
      fields,
      counts: Object.freeze({ duplicate_count: duplicateCount }),
    }));
  }
  return Object.freeze({
    version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
    issues: Object.freeze(issues),
    reports: Object.freeze(reports),
  });
}

function composerSelfCheckSchedulePlan(input = {}) {
  if (!input.terminal || input.messageRole !== "assistant") {
    return Object.freeze({ version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION, shouldSchedule: false, delayMs: 0 });
  }
  const parsed = Number(input.delayMs);
  const delayMs = Number.isFinite(parsed)
    ? Math.max(0, parsed)
    : COMPOSER_SELF_CHECK_DEFAULT_DELAY_MS;
  return Object.freeze({
    version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
    shouldSchedule: true,
    delayMs,
  });
}

function composerProtectedScrollBypassPlan(input = {}) {
  const shouldReport = Boolean(input.protectedScroll);
  return Object.freeze({
    version: CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
    shouldReport,
    errorCode: "composer_scroll_protection_bypassed",
    fields: Object.freeze({
      messageStatus: "unknown",
      messageRole: "assistant",
      reason: composerSelfCheckTokenValue(input.reason || "terminal_receipt_refresh", "unknown", 80),
    }),
    counts: Object.freeze({ protected_scroll_bypass_count: 1 }),
  });
}

export {
  CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
  COMPOSER_SELF_CHECK_DEFAULT_DELAY_MS,
  COMPOSER_SELF_CHECK_DEFAULT_MAX_REPORTS_PER_SESSION,
  composerProtectedScrollBypassPlan,
  composerSelfCheckActiveRunIdsForThread,
  composerSelfCheckCleanValue,
  composerSelfCheckDuplicateLocalUserServerCountForThread,
  composerSelfCheckMessagesForThread,
  composerSelfCheckPayloadPlan,
  composerSelfCheckReportKeyPlan,
  composerSelfCheckSchedulePlan,
  composerSelfCheckThreadContextPlan,
  composerSelfCheckTokenValue,
  composerTerminalSelfCheckPlan,
};
