"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-event-stream-ui.js"), "utf8");

function createHarness(fakeClient = null) {
  const calls = [];
  const sources = [];
  function FakeEventSource(url) {
    this.url = url;
    this.closed = false;
    this.onmessage = null;
    this.onerror = null;
    this.close = () => {
      this.closed = true;
      calls.push(["close", url]);
    };
    sources.push(this);
  }
  const connectionState = { textContent: "" };
  const context = {
    console,
    Promise,
    URLSearchParams,
    EventSource: FakeEventSource,
    globalThis: null,
    window: {
      __homeAiImportChatEventStreamClient(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeClient);
      },
    },
    state: {
      key: "owner key",
      clientVersion: "v1",
      events: null,
    },
    $(id) {
      if (id === "connectionState") return connectionState;
      return null;
    },
    applyEvent(payload) {
      calls.push(["applyEvent", payload]);
    },
    showError(error) {
      calls.push(["showError", error?.message || String(error)]);
    },
    __calls: calls,
    __sources: sources,
    __connectionState: connectionState,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__eventStreamHarness = {
  CHAT_EVENT_STREAM_CLIENT_ESM_PATH,
  importChatEventStreamClient,
  currentChatEventStreamClient,
  chatEventStreamUrl,
  applyChatEventStreamFrame,
  eventStreamStatusText,
  connectEvents,
};`, context, { filename: "app-event-stream-ui.js" });
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
  await test("classic event-stream adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_EVENT_STREAM_CLIENT_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-live-event-source-client\/chat-live-event-source-client\.js/);
    assert.match(source, /__homeAiImportChatEventStreamClient/);
    assert.match(source, /importChatEventStreamClient/);
    assert.match(source, /currentChatEventStreamClient/);
    assert.match(source, /chatEventSourceConnectionPlan/);
    assert.match(source, /chatEventFramePayloadPlan/);
    assert.match(source, /chatEventConnectionStatusPlan/);
  });

  await test("classic adapter consumes ESM plans while retaining EventSource and applyEvent ownership", async () => {
    const fakeClient = {
      chatEventSourceConnectionPlan(input) {
        return {
          url: `/model-events?key=${encodeURIComponent(input.key)}&clientVersion=${encodeURIComponent(input.clientVersion)}`,
        };
      },
      chatEventFramePayloadPlan(event) {
        return {
          ok: true,
          payload: { type: "model.frame", raw: event.data },
        };
      },
      chatEventConnectionStatusPlan(input) {
        return { text: `Model ${input.status}` };
      },
    };
    const context = createHarness(fakeClient);
    await context.__eventStreamHarness.importChatEventStreamClient(context.window);
    assert.equal(context.__eventStreamHarness.CHAT_EVENT_STREAM_CLIENT_ESM_PATH, "/vite-islands/chat-live-event-source-client/chat-live-event-source-client.js");
    assert.equal(context.__eventStreamHarness.chatEventStreamUrl(), "/model-events?key=owner%20key&clientVersion=v1");
    context.__eventStreamHarness.connectEvents();
    assert.equal(context.state.events.url, "/model-events?key=owner%20key&clientVersion=v1");
    context.state.events.onmessage({ data: "{\"type\":\"ignored-by-model\"}" });
    context.state.events.onerror({});
    assert.deepEqual(context.__calls.find((call) => call[0] === "applyEvent"), [
      "applyEvent",
      { type: "model.frame", raw: "{\"type\":\"ignored-by-model\"}" },
    ]);
    assert.equal(context.__connectionState.textContent, "Model reconnecting");
    assert.equal(context.__sources.length, 1);
  });

  await test("classic adapter preserves URL, frame, error, and close behavior before model load", async () => {
    const context = createHarness(null);
    await context.__eventStreamHarness.importChatEventStreamClient(context.window);
    const previous = { closeCalled: false, close() { this.closeCalled = true; } };
    context.state.events = previous;
    context.__eventStreamHarness.connectEvents();
    assert.equal(previous.closeCalled, true);
    assert.equal(context.state.events.url, "/api/events?key=owner+key&clientVersion=v1");
    context.state.events.onmessage({ data: JSON.stringify({ type: "thread.updated", threadId: "t1" }) });
    assert.deepEqual(JSON.parse(JSON.stringify(context.__calls.find((call) => call[0] === "applyEvent"))), [
      "applyEvent",
      { type: "thread.updated", threadId: "t1" },
    ]);
    context.state.events.onmessage({ data: "{\"type\":" });
    assert.ok(context.__calls.some((call) => call[0] === "showError"));
    context.state.events.onerror({});
    assert.equal(context.__connectionState.textContent, "Reconnecting");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
