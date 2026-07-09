"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-self-check-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const apiCalls = [];
  const timers = [];
  const context = {
    console,
    Promise,
    Set,
    JSON,
    globalThis: null,
    window: {
      __homeAiImportChatComposerSelfCheckModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
      setTimeout(callback, delayMs) {
        timers.push({ callback, delayMs });
        return timers.length;
      },
    },
    document: {
      documentElement: { dataset: { clientVersion: "client-v-test" } },
      querySelector() {
        return null;
      },
    },
    state: {
      key: "test-key",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_self_check",
      viewMode: "single",
      singleWindowMode: "chat",
      currentThreadRefreshInFlight: false,
      composerSendInFlight: false,
      currentThread: {
        id: "thread_self_check",
        status: "idle",
        activeRunIds: [],
        messages: [],
      },
    },
    async api(url, request = {}) {
      apiCalls.push({ url, body: JSON.parse(request.body || "{}") });
      return { ok: true };
    },
    composerMessageTerminalStatus(message = {}) {
      return ["done", "failed", "cancelled"].includes(String(message.status || ""));
    },
    conversationUserScrollProtectActive() {
      return Boolean(options.userScrollProtected);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-self-check-ui.js" });
  return { apiCalls, context, timers };
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
  await test("classic composer self-check adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_SELF_CHECK_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-self-check-model\/chat-composer-self-check-model\.js/);
    assert.match(source, /__homeAiImportChatComposerSelfCheckModel/);
    assert.match(source, /currentChatComposerSelfCheckModel/);
    assert.match(source, /composerSelfCheckPayloadPlan/);
    assert.match(source, /composerTerminalSelfCheckPlan/);
    assert.match(source, /composerProtectedScrollBypassPlan/);
  });

  await test("classic adapter consumes ESM model for report key and payload planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerSelfCheckTokenValue(value, fallback = "unknown") {
        return String(value || fallback).replace(/\s+/g, "_");
      },
      composerSelfCheckMessagesForThread(thread = {}) {
        modelCalls.push(["messages", thread.id]);
        return thread.messages || [];
      },
      composerSelfCheckActiveRunIdsForThread(thread = {}) {
        modelCalls.push(["runs", thread.id]);
        return thread.activeRunIds || [];
      },
      composerSelfCheckReportKeyPlan(input) {
        modelCalls.push(["key", input.errorCode, input.threadId]);
        return { key: "model-key", allowedByLimit: true };
      },
      composerSelfCheckPayloadPlan(input) {
        modelCalls.push(["payload", input.errorCode, input.messageCount, input.activeRunCount]);
        return {
          schema_version: "model.payload",
          error_code: input.errorCode,
          counts: input.counts,
          breadcrumbs: [{ fields: input.fields }],
        };
      },
    };
    const { apiCalls, context } = createHarness(fakeModel);
    context.state.currentThread.activeRunIds = ["run_1"];
    context.state.currentThread.messages = [{ id: "m1" }, { id: "m2" }];
    await context.importChatComposerSelfCheckModel(context.window);

    const reported = context.reportComposerSelfCheckIssue("custom issue", {
      messageId: "assistant_1",
      runId: "run_1",
    }, {
      custom_count: 1,
    });

    assert.equal(reported, true);
    assert.equal(context.importedPath, "/vite-islands/chat-composer-self-check-model/chat-composer-self-check-model.js");
    assert.deepEqual(apiCalls, [{
      url: "/api/v1/home-ai/diagnostics/events",
      body: {
        schema_version: "model.payload",
        error_code: "custom_issue",
        counts: { custom_count: 1 },
        breadcrumbs: [{ fields: { messageId: "assistant_1", runId: "run_1" } }],
      },
    }]);
    assert.deepEqual(modelCalls, [
      ["key", "custom issue", "thread_self_check"],
      ["messages", "thread_self_check"],
      ["runs", "thread_self_check"],
      ["payload", "custom_issue", 2, 1],
    ]);
  });

  await test("classic adapter consumes ESM model for terminal self-check reports", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerTerminalSelfCheckPlan(input) {
        modelCalls.push(["terminal", input.messageId, input.messageStatus, input.hasReceipt, input.duplicateCount]);
        return {
          issues: ["model_issue"],
          reports: [{
            errorCode: "model_issue",
            fields: {
              messageId: input.messageId,
              runId: input.runId,
              messageStatus: input.messageStatus,
              messageRole: input.messageRole,
            },
            counts: { model_count: 1 },
          }],
        };
      },
    };
    const { apiCalls, context } = createHarness(fakeModel);
    context.state.currentThread.messages = [{
      id: "assistant_terminal",
      role: "assistant",
      status: "done",
      content: "private content",
      runId: "run_terminal",
    }];
    await context.importChatComposerSelfCheckModel(context.window);

    const issues = context.runComposerTerminalSelfCheck(context.state.currentThread.messages[0]);

    assert.deepEqual(Array.from(issues), ["model_issue"]);
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].body.error_code, "model_issue");
    assert.equal(apiCalls[0].body.counts.model_count, 1);
    assert.deepEqual(modelCalls, [["terminal", "assistant_terminal", "done", false, 0]]);
    assert.doesNotMatch(JSON.stringify(apiCalls), /private content/);
  });

  await test("classic adapter consumes ESM model for scheduling and protected scroll bypass", async () => {
    const fakeModel = {
      composerSelfCheckSchedulePlan(input) {
        assert.equal(input.terminal, true);
        assert.equal(input.messageRole, "assistant");
        return { shouldSchedule: true, delayMs: 123 };
      },
      composerProtectedScrollBypassPlan(input) {
        assert.equal(input.protectedScroll, true);
        return {
          shouldReport: true,
          errorCode: "composer_scroll_protection_bypassed",
          fields: {
            messageStatus: "unknown",
            messageRole: "assistant",
            reason: "model_reason",
          },
          counts: { protected_scroll_bypass_count: 1 },
        };
      },
    };
    const { apiCalls, context, timers } = createHarness(fakeModel, { userScrollProtected: true });
    await context.importChatComposerSelfCheckModel(context.window);

    assert.equal(context.scheduleComposerTerminalSelfCheck({
      id: "assistant_terminal",
      role: "assistant",
      status: "done",
    }), true);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 123);

    assert.equal(context.composerSelfCheckReportProtectedScrollBypass("raw reason"), true);
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].body.error_code, "composer_scroll_protection_bypassed");
    assert.equal(apiCalls[0].body.breadcrumbs[0].fields.reason, "model_reason");
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { apiCalls, context, timers } = createHarness({});
    const scheduled = context.scheduleComposerTerminalSelfCheck({
      id: "assistant_terminal",
      role: "assistant",
      status: "done",
      content: "text",
    });

    assert.equal(scheduled, true);
    assert.equal(timers[0].delayMs, 2400);
    const reported = context.reportComposerSelfCheckIssue("fallback issue", {
      messageId: "assistant_terminal",
    }, {
      fallback_count: 1,
    });
    assert.equal(reported, true);
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].body.diagnostic_type, "self_check_signal_failed");
    assert.equal(apiCalls[0].body.counts.fallback_count, 1);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
