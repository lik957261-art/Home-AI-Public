"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeThreadViewFacadeService } = require("../adapters/mobile-runtime-thread-view-facade-service");

const delegateNames = [
  "threadSummary",
  "taskGroupsForThread",
  "messageOwnerWorkspaceId",
  "taskGroupOwnerWorkspaceId",
  "taskGroupTaskId",
  "taskGroupPrompt",
  "taskGroupTitle",
  "taskGroupPreview",
  "taskGroupStatus",
  "taskGroupHaystack",
  "textIncludesPath",
  "taskGroupMatchesProject",
  "singleWindowProjectTaskSummaries",
  "messagesForThreadMode",
  "messagePageTaskGroupId",
  "threadMessagesPage",
  "searchThreadMessages",
  "compactThread",
  "compactThreadWithMessagePage",
  "compactMessage",
];

function makeThreadViewService(calls) {
  return Object.fromEntries(delegateNames.map((methodName) => [
    methodName,
    (...args) => {
      calls.push({ methodName, args });
      return { methodName, args };
    },
  ]));
}

function testRequiresThreadViewFactory() {
  assert.throws(
    () => createMobileRuntimeThreadViewFacadeService({ createThreadViewService: "bad" }),
    /requires createThreadViewService/
  );
}

function testLazilyCreatesThreadViewServiceOnceAndDelegates() {
  const calls = [];
  const state = { threads: [] };
  const factoryOptions = [];
  const facade = createMobileRuntimeThreadViewFacadeService({
    compactArtifactsForMessage: () => [],
    compactText: (value) => `compact:${value}`,
    comparablePath: (value) => `path:${value}`,
    createThreadViewService(options) {
      factoryOptions.push(options);
      return makeThreadViewService(calls);
    },
    findThreadForMessage: () => ({ id: "thread1" }),
    isSingleWindowConversationTaskGroupId: () => false,
    maxApiTextChars: 123,
    maxStoredEventsPerThread: 3,
    normalizeTaskGroupMeta: () => ({ normalized: true }),
    projectSearchLabels: () => ["label"],
    publicChatGroup: () => ({ enabled: false }),
    publicExternalIngress: () => null,
    publicWeixinOutboundDelivery: () => null,
    sanitizeTaskTitle: (value) => String(value || "").trim(),
    searchableText: (value) => String(value || "").toLowerCase(),
    singleWindowChatTaskGroupId: "chat",
    singleWindowGroupChatTaskGroupId: "group-chat",
    singleWindowProjectId: "single-window",
    state: () => state,
    threadMessageInitialLimit: 31,
    threadMessageSearchLimit: 91,
  });

  assert.equal(factoryOptions.length, 0);
  assert.deepEqual(facade.threadMessagesPage({ id: "thread1" }, { limit: 2 }), {
    methodName: "threadMessagesPage",
    args: [{ id: "thread1" }, { limit: 2 }],
  });
  assert.deepEqual(facade.compactMessage({ id: "message1" }, { id: "thread1" }), {
    methodName: "compactMessage",
    args: [{ id: "message1" }, { id: "thread1" }],
  });
  assert.equal(facade.getThreadViewService(), facade.getThreadViewService());
  assert.equal(factoryOptions.length, 1);
  assert.equal(factoryOptions[0].maxApiTextChars, 123);
  assert.equal(factoryOptions[0].maxStoredEventsPerThread, 3);
  assert.equal(factoryOptions[0].singleWindowProjectId, "single-window");
  assert.strictEqual(factoryOptions[0].state(), state);
  assert.deepEqual(calls.map((call) => call.methodName), ["threadMessagesPage", "compactMessage"]);
}

function testAddsThreadEventsWithPreviewCompactionAndRetention() {
  const facade = createMobileRuntimeThreadViewFacadeService({
    createThreadViewService: () => makeThreadViewService([]),
    compactText(value, maxChars) {
      const text = String(value || "");
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    },
    maxEventPreviewChars: 5,
    maxStoredEventsPerThread: 2,
  });
  const thread = { events: [{ event: "old" }] };
  facade.addThreadEvent(thread, { type: "first", run_id: "run1", preview: { tool: "x", value: 1 } });
  facade.addThreadEvent(thread, { event: "second", runId: "run2", text: "abcdef", error: true });

  assert.deepEqual(thread.events.map((event) => event.event), ["first", "second"]);
  assert.equal(thread.events[0].runId, "run1");
  assert.equal(thread.events[0].preview, "{\"too");
  assert.equal(thread.events[1].runId, "run2");
  assert.equal(thread.events[1].preview, "abcde");
  assert.equal(thread.events[1].error, true);
}

testRequiresThreadViewFactory();
testLazilyCreatesThreadViewServiceOnceAndDelegates();
testAddsThreadEventsWithPreviewCompactionAndRetention();

console.log("mobile runtime thread view facade service tests passed");
