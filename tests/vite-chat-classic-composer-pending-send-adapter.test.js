"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-pending-send-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const calls = [];
  const state = Object.assign({
    currentThread: {
      id: "thread_chat",
      messages: [],
    },
    viewMode: "single",
    singleWindowMode: "chat",
    pendingArtifacts: [],
    forceChatStickToBottomUntil: 0,
    conversationViewportBottomFollowUntil: 0,
    conversationViewportSettleUntil: 0,
    conversationPinnedToBottom: false,
  }, options.state || {});
  const context = {
    console,
    Date,
    Math,
    Promise,
    Set,
    Array,
    state,
    globalThis: null,
    window: {
      __homeAiImportChatComposerPendingSendModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    renderCalls: [],
    bottomStickCalls: 0,
    activeChatTaskGroupId() {
      calls.push(["activeChatTaskGroupId"]);
      return "chat-default";
    },
    renderCurrentThread(options = {}) {
      context.renderCalls.push(options);
    },
    scheduleConversationBottomStick() {
      context.bottomStickCalls += 1;
    },
    isSingleWindowChatView() {
      return state.viewMode === "single" && state.singleWindowMode === "chat";
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.pendingSendAdapterTestApi = {
  importChatComposerPendingSendModel,
  currentChatComposerPendingSendModel,
  optimisticSendTaskGroupId,
  optimisticSendShouldAppendAssistant,
  appendOptimisticSendMessages,
  clearOptimisticSendMessages,
};`, context, { filename: "app-composer-pending-send-ui.js" });
  return { context, state, calls };
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
  await test("classic pending-send adapter declares bounded Composer ESM model path", () => {
    assert.match(source, /CHAT_COMPOSER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-model\/chat-composer-model\.js/);
    assert.match(source, /__homeAiImportChatComposerPendingSendModel/);
    assert.match(source, /importChatComposerPendingSendModel/);
    assert.match(source, /currentChatComposerPendingSendModel/);
    assert.match(source, /createOptimisticSendPlan/);
    assert.match(source, /applyOptimisticSendPlan/);
    assert.match(source, /clearOptimisticSendPlan/);
  });

  await test("classic adapter consumes ESM model for optimistic append and viewport timing", async () => {
    const modelCalls = [];
    const fakeModel = {
      optimisticSendTaskGroupId(input) {
        modelCalls.push(["taskGroup", input.activeChatTaskGroupId]);
        return input.activeChatTaskGroupId;
      },
      optimisticSendShouldAppendAssistant(input) {
        modelCalls.push(["shouldAppend", input.body.messageKind]);
        return true;
      },
      createOptimisticSendPlan(input) {
        modelCalls.push(["create", input.threadId, input.text, input.viewMode, input.singleWindowMode, input.activeChatTaskGroupId, input.pendingArtifacts.length]);
        assert.match(input.baseId, /^local_send_\d+_[a-z0-9]+$/);
        return {
          ok: true,
          threadId: input.threadId,
          messages: [
            { id: `${input.baseId}_user`, role: "user", content: input.text, taskGroupId: input.activeChatTaskGroupId },
            { id: `${input.baseId}_assistant`, role: "assistant", status: "queued", taskGroupId: input.activeChatTaskGroupId },
          ],
          token: {
            threadId: input.threadId,
            ids: [`${input.baseId}_user`, `${input.baseId}_assistant`],
            localPendingSendId: input.baseId,
          },
          viewport: {
            forceStickToBottomMs: 321,
            bottomFollowMs: 123,
            settleMs: 45,
          },
        };
      },
      applyOptimisticSendPlan(thread, plan) {
        modelCalls.push(["apply", thread.id, plan.messages.length]);
        return Object.assign({}, thread, { messages: thread.messages.concat(plan.messages) });
      },
    };
    const { context, state, calls } = createHarness(fakeModel, {
      state: { pendingArtifacts: [{ id: "artifact_1" }] },
    });
    await context.pendingSendAdapterTestApi.importChatComposerPendingSendModel(context.window);

    assert.equal(context.pendingSendAdapterTestApi.optimisticSendTaskGroupId({}), "chat-default");
    assert.equal(context.pendingSendAdapterTestApi.optimisticSendShouldAppendAssistant({ messageKind: "ai" }), true);
    const token = context.pendingSendAdapterTestApi.appendOptimisticSendMessages({ messageKind: "ai" }, "hello");

    assert.ok(token);
    assert.equal(token.ids.size, 2);
    assert.equal(state.currentThread.messages.length, 2);
    assert.equal(state.currentThread.messages[0].content, "hello");
    assert.equal(state.currentThread.messages[1].status, "queued");
    assert.ok(state.forceChatStickToBottomUntil > 0);
    assert.ok(state.conversationViewportBottomFollowUntil > 0);
    assert.ok(state.conversationViewportSettleUntil > 0);
    assert.equal(state.conversationPinnedToBottom, true);
    assert.deepEqual(JSON.parse(JSON.stringify(context.renderCalls)), [{ stickToBottom: true }]);
    assert.equal(context.bottomStickCalls, 1);
    assert.deepEqual(calls[0], ["import", "/vite-islands/chat-composer-model/chat-composer-model.js"]);
    assert.deepEqual(modelCalls.map((call) => call[0]), ["taskGroup", "shouldAppend", "create", "apply"]);
  });

  await test("classic adapter consumes ESM model for rollback without extra render", async () => {
    const fakeModel = {
      clearOptimisticSendPlan(thread, token) {
        assert.deepEqual(token.ids, ["local_user", "local_assistant"]);
        return Object.assign({}, thread, {
          messages: thread.messages.filter((message) => !token.ids.includes(message.id)),
        });
      },
    };
    const { context, state } = createHarness(fakeModel, {
      state: {
        currentThread: {
          id: "thread_chat",
          messages: [
            { id: "existing", role: "user" },
            { id: "local_user", role: "user" },
            { id: "local_assistant", role: "assistant" },
          ],
        },
      },
    });
    await context.pendingSendAdapterTestApi.importChatComposerPendingSendModel(context.window);

    const cleared = context.pendingSendAdapterTestApi.clearOptimisticSendMessages({
      threadId: "thread_chat",
      ids: new Set(["local_user", "local_assistant"]),
      localPendingSendId: "local",
    }, { render: false });

    assert.equal(cleared, true);
    assert.deepEqual(state.currentThread.messages, [{ id: "existing", role: "user" }]);
    assert.deepEqual(context.renderCalls, []);
  });

  await test("classic fallback remains synchronous before ESM model is loaded", () => {
    const { context, state } = createHarness(null);
    const token = context.pendingSendAdapterTestApi.appendOptimisticSendMessages({ messageKind: "plain" }, "plain note");

    assert.ok(token);
    assert.equal(state.currentThread.messages.length, 1);
    assert.equal(state.currentThread.messages[0].content, "plain note");
    assert.equal(state.currentThread.messages[0].taskGroupId, "chat-default");
    assert.equal(context.pendingSendAdapterTestApi.clearOptimisticSendMessages(token), true);
    assert.equal(state.currentThread.messages.length, 0);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
