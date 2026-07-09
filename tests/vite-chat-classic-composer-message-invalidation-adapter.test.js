"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-message-invalidation-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerMessageInvalidationModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      currentThread: {
        activeRunId: "run_fallback",
      },
    },
    streamRenderCalls: [],
    runProgressCalls: [],
    refreshCalls: [],
    selfCheckCalls: [],
    protectedBypassCalls: [],
    fullRenderCalls: 0,
    scheduleStreamingMessageRender(message = {}) {
      context.streamRenderCalls.push({ id: message.id, status: message.status });
      return options.streamRendered !== false;
    },
    scheduleRunProgressRenderForRun(runId) {
      context.runProgressCalls.push(runId);
    },
    scheduleRenderCurrentThread() {
      context.fullRenderCalls += 1;
    },
    requestCurrentThreadRefresh(refreshOptions = {}) {
      context.refreshCalls.push(refreshOptions);
    },
    scheduleComposerTerminalSelfCheck(message = {}) {
      context.selfCheckCalls.push({ id: message.id, status: message.status });
    },
    composerTerminalReceiptStickToBottom() {
      return options.stickToBottom !== false;
    },
    conversationUserScrollProtectActive() {
      return Boolean(options.userScrollProtected);
    },
    composerSelfCheckReportProtectedScrollBypass(reason) {
      context.protectedBypassCalls.push(reason);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-message-invalidation-ui.js" });
  return context;
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
  await test("classic message invalidation adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-message-invalidation-model\/chat-composer-message-invalidation-model\.js/);
    assert.match(source, /__homeAiImportChatComposerMessageInvalidationModel/);
    assert.match(source, /currentChatComposerMessageInvalidationModel/);
    assert.match(source, /composerMessageProjectionPlan/);
    assert.match(source, /composerTerminalReceiptRefreshPlan/);
  });

  await test("classic adapter consumes ESM model for patched active projection", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerMessageTerminalStatusPlan(message = {}) {
        modelCalls.push(["terminal", message.status]);
        return false;
      },
      composerMessageActiveStatusPlan(message = {}) {
        modelCalls.push(["active", message.status]);
        return true;
      },
      composerMessageProjectionPlan(input = {}) {
        modelCalls.push(["projection", input.existingIndex, input.messageRole, input.streamRendered, input.active]);
        return {
          result: "patched",
          shouldScheduleFullRender: false,
          shouldRequestTerminalReceiptRefresh: false,
          shouldScheduleRunProgress: true,
          runProgressRunId: input.runId || input.fallbackRunId,
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerMessageInvalidationModel(context.window);

    const result = context.invalidateComposerMessageProjection({
      id: "assistant_streaming",
      role: "assistant",
      status: "running",
      runId: "",
      content: "private streamed text",
    }, { existingIndex: 1 });

    assert.equal(context.importedPath, "/vite-islands/chat-composer-message-invalidation-model/chat-composer-message-invalidation-model.js");
    assert.equal(result, "patched");
    assert.deepEqual(context.streamRenderCalls, [{ id: "assistant_streaming", status: "running" }]);
    assert.deepEqual(context.runProgressCalls, ["run_fallback"]);
    assert.equal(context.fullRenderCalls, 0);
    assert.equal(context.refreshCalls.length, 0);
    assert.doesNotMatch(JSON.stringify(modelCalls), /private streamed text/);
  });

  await test("classic adapter consumes ESM model for terminal receipt refresh", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerMessageTerminalStatusPlan(message = {}) {
        return message.status === "done";
      },
      composerMessageActiveStatusPlan() {
        return false;
      },
      composerMessageProjectionPlan(input = {}) {
        return {
          result: "scheduled",
          shouldScheduleFullRender: true,
          shouldRequestTerminalReceiptRefresh: input.terminal,
          shouldScheduleRunProgress: false,
          runProgressRunId: "",
        };
      },
      composerTerminalReceiptRefreshPlan(input = {}) {
        modelCalls.push(["refresh", input.terminal, input.stickToBottom, input.userScrollProtected, input.delayMs]);
        return {
          shouldRefresh: true,
          refreshOptions: {
            stickToBottom: false,
            delayMs: 55,
          },
          shouldReportProtectedScrollBypass: true,
          shouldScheduleSelfCheck: true,
        };
      },
    };
    const context = createHarness(fakeModel, { streamRendered: false, userScrollProtected: true });
    await context.importChatComposerMessageInvalidationModel(context.window);

    const result = context.invalidateComposerMessageProjection({
      id: "assistant_done",
      role: "assistant",
      status: "done",
      runId: "run_done",
      content: "private final text",
    }, { existingIndex: 1, delayMs: 20 });

    assert.equal(result, "scheduled");
    assert.equal(context.fullRenderCalls, 1);
    assert.deepEqual(context.refreshCalls, [{ stickToBottom: false, delayMs: 55 }]);
    assert.deepEqual(context.protectedBypassCalls, ["terminal_receipt_refresh"]);
    assert.deepEqual(context.selfCheckCalls, [{ id: "assistant_done", status: "done" }]);
    assert.deepEqual(modelCalls, [["refresh", true, true, true, 20]]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const context = createHarness({});
    const result = context.invalidateComposerMessageProjection({
      id: "assistant_running",
      role: "assistant",
      status: "running",
      runId: "run_active",
    }, { existingIndex: 0 });

    assert.equal(result, "patched");
    assert.deepEqual(context.runProgressCalls, ["run_active"]);
    assert.equal(context.fullRenderCalls, 0);
    assert.equal(context.refreshCalls.length, 0);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
