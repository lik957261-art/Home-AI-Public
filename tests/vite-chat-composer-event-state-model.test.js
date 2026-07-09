"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-event-state-model.mjs");

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

  await test("composer event-state model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("plans selected thread matching without private payloads", () => {
    assert.equal(model.threadMatchesSelectionPlan({
      threadExists: true,
      selectedWorkspaceId: "owner",
      threadWorkspaceId: "workspace_b",
      threadGroupMemberIds: ["owner"],
      viewMode: "single",
      threadSingleWindow: true,
      search: "budget",
      threadTitle: "Budget thread",
      threadPreview: "private preview ignored by assertion",
    }), true);

    assert.equal(model.threadMatchesSelectionPlan({
      threadExists: true,
      selectedWorkspaceId: "owner",
      threadWorkspaceId: "workspace_b",
      threadGroupMemberIds: [],
      viewMode: "single",
      threadSingleWindow: true,
      search: "",
    }), false);

    assert.equal(model.threadMatchesSelectionPlan({
      threadExists: true,
      viewMode: "tasks",
      threadSingleWindow: true,
      currentThreadId: "thread_1",
      threadId: "thread_1",
      taskGroupMatches: false,
      search: "",
    }), false);
  });

  await test("plans thread summary and current message upsert actions", () => {
    assert.deepEqual(model.threadSummaryUpsertPlan({
      threadExists: true,
      existingIndex: 2,
      matchesSelection: false,
    }), {
      version: model.CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      action: "remove",
      shouldRenderThreads: true,
    });

    assert.deepEqual(model.threadSummaryUpsertPlan({
      threadExists: true,
      existingIndex: -1,
      matchesSelection: true,
    }), {
      version: model.CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      action: "insert",
      shouldRenderThreads: true,
    });

    assert.deepEqual(model.currentMessageUpsertPlan({
      currentThreadExists: true,
      messageExists: true,
      viewMode: "tasks",
      currentThreadSingleWindow: true,
      sharedTopicThread: false,
    }), {
      version: model.CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      shouldUpsert: true,
      shouldRememberTaskListThread: true,
      shouldOfferOwnerElevation: true,
      shouldRenderThreads: true,
      shouldInvalidateProjection: true,
    });
  });

  await test("plans cached chat-scope message targets", () => {
    assert.deepEqual(model.cachedChatScopeMessagePlan({
      threadId: "thread_chat",
      messageExists: true,
      groupThreadMatches: true,
      privateThreadMatches: false,
      singleWindowChatView: true,
    }), {
      version: model.CHAT_COMPOSER_EVENT_STATE_MODEL_VERSION,
      shouldUpdateGroupChat: true,
      shouldUpdatePrivateChat: false,
      touched: true,
      shouldRenderChatScopeHeader: true,
    });

    assert.equal(model.cachedChatScopeMessagePlan({
      threadId: "",
      messageExists: true,
      groupThreadMatches: true,
      singleWindowChatView: true,
    }).touched, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
