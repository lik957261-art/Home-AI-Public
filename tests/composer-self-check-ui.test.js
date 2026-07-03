"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-self-check-ui.js"), "utf8");

function createContext(overrides = {}) {
  const apiCalls = [];
  const context = {
    console,
    Date,
    Math,
    Set,
    state: {
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_composer",
      viewMode: "single",
      singleWindowMode: "chat",
      currentThreadRefreshInFlight: false,
      composerSendInFlight: false,
      currentThread: {
        id: "thread_composer",
        status: "idle",
        activeRunId: "",
        activeRunIds: [],
        messages: [],
      },
    },
    document: {
      documentElement: { dataset: { clientVersion: "client-v974" } },
      querySelector() {
        return null;
      },
    },
    window: {
      setTimeout(handler, delayMs) {
        context.scheduledTimers.push({ handler, delayMs });
        return context.scheduledTimers.length;
      },
    },
    scheduledTimers: [],
    async api(url, options = {}) {
      apiCalls.push({ url, body: JSON.parse(options.body || "{}") });
      return { ok: true, case_id: "diagcase_composer" };
    },
    composerMessageTerminalStatus(message = {}) {
      return ["done", "failed", "cancelled"].includes(String(message?.status || ""));
    },
    conversationUserScrollProtectActive() {
      return false;
    },
  };
  Object.assign(context, overrides);
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-self-check-ui.js" });
  context.apiCalls = apiCalls;
  return context;
}

function testTerminalReceiptMissingReportsSelfCheckEvent() {
  const context = createContext();
  context.state.currentThread.messages = [{
    id: "assistant_terminal",
    role: "assistant",
    status: "done",
    content: "private assistant content",
    runId: "run_terminal",
  }];
  const issues = context.runComposerTerminalSelfCheck(context.state.currentThread.messages[0]);
  assert.deepEqual(Array.from(issues), ["composer_terminal_receipt_missing"]);
  assert.equal(context.apiCalls.length, 1);
  const payload = context.apiCalls[0].body;
  assert.equal(context.apiCalls[0].url, "/api/v1/home-ai/diagnostics/events");
  assert.equal(payload.plugin_id, "home-ai");
  assert.equal(payload.source_surface, "home-ai-self-check");
  assert.equal(payload.diagnostic_type, "self_check_signal_failed");
  assert.equal(payload.category, "self_check_composer_runtime");
  assert.equal(payload.error_code, "composer_terminal_receipt_missing");
  assert.equal(payload.severity_hint, "H2");
  assert.equal(payload.evidence_confidence, 0.82);
  assert.equal(payload.build_id, "client-v974");
  assert.equal(payload.context.signal_id, "composer_runtime_feedback");
  assert.equal(payload.counts.receipt_count, 0);
  assert.doesNotMatch(JSON.stringify(payload), /private assistant content/);
}

function testTerminalRunAndDuplicatePendingReportsBoundedCounts() {
  const context = createContext();
  context.state.currentThread.activeRunIds = ["run_stuck"];
  context.state.currentThread.messages = [
    {
      id: "assistant_terminal",
      role: "assistant",
      status: "done",
      content: "assistant text",
      runId: "run_stuck",
      usage: { total_tokens: 10 },
    },
    {
      id: "server_user",
      role: "user",
      status: "done",
      content: "private duplicated user content",
      taskGroupId: "group_1",
    },
    {
      id: "local_user",
      role: "user",
      status: "done",
      content: "private duplicated user content",
      taskGroupId: "group_1",
      localPendingSend: true,
      localPendingSendId: "local_1",
    },
  ];
  const issues = context.runComposerTerminalSelfCheck(context.state.currentThread.messages[0]);
  assert.deepEqual(Array.from(issues), [
    "composer_terminal_active_run_stuck",
    "composer_duplicate_local_server_user_message",
  ]);
  assert.equal(context.apiCalls.length, 2);
  assert.equal(context.apiCalls[0].body.error_code, "composer_terminal_active_run_stuck");
  assert.equal(context.apiCalls[0].body.counts.active_run_count, 1);
  assert.equal(context.apiCalls[1].body.error_code, "composer_duplicate_local_server_user_message");
  assert.equal(context.apiCalls[1].body.counts.duplicate_count, 1);
  assert.doesNotMatch(JSON.stringify(context.apiCalls), /private duplicated user content|assistant text/);
}

function testProtectedScrollBypassReportsOnlyMetadata() {
  const context = createContext({
    conversationUserScrollProtectActive() {
      return true;
    },
  });
  const reported = context.composerSelfCheckReportProtectedScrollBypass("terminal_receipt_refresh");
  assert.equal(reported, true);
  assert.equal(context.apiCalls.length, 1);
  const payload = context.apiCalls[0].body;
  assert.equal(payload.error_code, "composer_scroll_protection_bypassed");
  assert.equal(payload.counts.protected_scroll_bypass_count, 1);
  assert.equal(payload.breadcrumbs[0].fields.reason, "terminal_receipt_refresh");
  assert.equal(payload.breadcrumbs[0].fields.user_scroll_protected, true);
}

function testScheduleUsesBoundedDelay() {
  const context = createContext();
  const scheduled = context.scheduleComposerTerminalSelfCheck({
    id: "assistant_terminal",
    role: "assistant",
    status: "done",
    content: "text",
  });
  assert.equal(scheduled, true);
  assert.equal(context.scheduledTimers.length, 1);
  assert.equal(context.scheduledTimers[0].delayMs, 2400);
}

testTerminalReceiptMissingReportsSelfCheckEvent();
testTerminalRunAndDuplicatePendingReportsBoundedCounts();
testProtectedScrollBypassReportsOnlyMetadata();
testScheduleUsesBoundedDelay();

console.log("composer self-check UI tests passed");
