"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-self-check-model.mjs");

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("composer self-check model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("normalizes values, run ids, and duplicate local/server messages", () => {
    assert.equal(model.composerSelfCheckCleanValue("  hello\nworld  "), "hello world");
    assert.equal(model.composerSelfCheckTokenValue("bad token!*", "fallback"), "bad_token");
    assert.deepEqual(model.composerSelfCheckActiveRunIdsForThread({
      activeRunId: "run_a",
      activeRunIds: ["run_a", "run_b", "", null],
    }), ["run_a", "run_b"]);
    assert.equal(model.composerSelfCheckDuplicateLocalUserServerCountForThread({
      messages: [
        { role: "user", content: "private text", taskGroupId: "g1", messageKind: "chat" },
        { role: "user", content: "private text", taskGroupId: "g1", messageKind: "chat", localPendingSend: true },
      ],
    }), 1);
  });

  await test("builds bounded self-check payload without raw message text", () => {
    const payload = model.composerSelfCheckPayloadPlan({
      errorCode: "composer_terminal_receipt_missing",
      clientVersion: "client-test",
      workspaceId: "owner",
      threadId: "thread_1",
      messageCount: 3,
      activeRunCount: 1,
      viewMode: "single",
      singleWindowMode: "chat",
      threadStatus: "idle",
      refreshInFlight: true,
      composerSendInFlight: false,
      userScrollProtected: true,
      fields: {
        messageId: "assistant_1",
        runId: "run_1",
        messageStatus: "done",
        messageRole: "assistant",
        reason: "terminal receipt",
        content: "private assistant content",
      },
      counts: { receipt_count: 0 },
    });

    assert.equal(payload.schema_version, "homeai.composerSelfCheck.v1");
    assert.equal(payload.diagnostic_type, "self_check_signal_failed");
    assert.equal(payload.category, "self_check_composer_runtime");
    assert.equal(payload.error_code, "composer_terminal_receipt_missing");
    assert.equal(payload.counts.message_count, 3);
    assert.equal(payload.counts.active_run_count, 1);
    assert.equal(payload.counts.receipt_count, 0);
    assert.equal(payload.breadcrumbs[0].fields.message_id, "assistant_1");
    assert.equal(payload.breadcrumbs[0].fields.user_scroll_protected, true);
    assert.doesNotMatch(JSON.stringify(payload), /private assistant content/);
  });

  await test("plans terminal issues, report keys, scheduling, and protected scroll", () => {
    const terminalPlan = model.composerTerminalSelfCheckPlan({
      terminal: true,
      messageId: "assistant_1",
      runId: "run_1",
      activeRunIds: ["run_1"],
      messageStatus: "done",
      messageRole: "assistant",
      content: "answer",
      hasReceipt: false,
      duplicateCount: 2,
    });
    assert.deepEqual(terminalPlan.issues, [
      "composer_terminal_active_run_stuck",
      "composer_terminal_receipt_missing",
      "composer_duplicate_local_server_user_message",
    ]);
    assert.equal(terminalPlan.reports.length, 3);
    assert.deepEqual(model.composerTerminalSelfCheckPlan({
      terminal: false,
      messageRole: "assistant",
    }).issues, []);

    assert.deepEqual(model.composerSelfCheckReportKeyPlan({
      errorCode: "bad code",
      threadId: "thread one",
      messageId: "message one",
      runId: "run one",
      reportedCount: 7,
      maxReports: 8,
    }), {
      version: model.CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
      key: "bad_code:thread_one:message_one:run_one",
      allowedByLimit: true,
    });
    assert.equal(model.composerSelfCheckReportKeyPlan({ reportedCount: 8, maxReports: 8 }).allowedByLimit, false);

    assert.equal(model.composerSelfCheckSchedulePlan({
      terminal: true,
      messageRole: "assistant",
    }).delayMs, 2400);
    assert.deepEqual(model.composerSelfCheckSchedulePlan({
      terminal: false,
      messageRole: "assistant",
    }).shouldSchedule, false);

    assert.deepEqual(model.composerProtectedScrollBypassPlan({
      protectedScroll: true,
      reason: "terminal receipt",
    }), {
      version: model.CHAT_COMPOSER_SELF_CHECK_MODEL_VERSION,
      shouldReport: true,
      errorCode: "composer_scroll_protection_bypassed",
      fields: {
        messageStatus: "unknown",
        messageRole: "assistant",
        reason: "terminal_receipt",
      },
      counts: { protected_scroll_bypass_count: 1 },
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
