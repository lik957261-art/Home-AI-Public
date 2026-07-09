"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-app/runtime/runtime-state-event-bus.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
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
  const runtime = await loadModule();

  await test("event bus emits bounded events to direct and wildcard subscribers", () => {
    const direct = [];
    const wildcard = [];
    const bus = runtime.createRuntimeEventBus({
      now: () => "2026-07-04T00:00:00.000Z",
      maxRecentEvents: 2,
    });
    const offDirect = bus.on("route:changed", (event) => direct.push(event));
    bus.on("*", (event) => wildcard.push(event.type));

    const event = bus.emit("route:changed", { url: "/tasks", privateValue: "not-a-secret-fixture" });
    bus.emit("feedback:toast", { message: "ok" });
    offDirect();
    bus.emit("route:changed", { url: "/topics" });

    assert.equal(event.type, "route:changed");
    assert.equal(event.timestamp, "2026-07-04T00:00:00.000Z");
    assert.deepEqual(direct.map((item) => item.detail.url), ["/tasks"]);
    assert.deepEqual(wildcard, ["route:changed", "feedback:toast", "route:changed"]);
    assert.deepEqual(bus.snapshot().recentEvents.map((item) => item.type), ["feedback:toast", "route:changed"]);
    assert.throws(() => {
      event.detail.extra = true;
    }, /Cannot add property|read only|not extensible/);
  });

  await test("event bus isolates handler failures and keeps emitting", () => {
    const errors = [];
    const seen = [];
    const bus = runtime.createRuntimeEventBus({
      onError: (error, event) => errors.push(`${event.type}:${error.message}`),
    });
    bus.on("state:changed", () => {
      throw new Error("handler_failed");
    });
    bus.on("state:changed", (event) => seen.push(event.detail.patch.value));

    bus.emit("state:changed", { patch: { value: 7 } });

    assert.deepEqual(errors, ["state:changed:handler_failed"]);
    assert.deepEqual(seen, [7]);
  });

  await test("state store emits patch, update, replace, and bounded snapshots", () => {
    const events = [];
    const bus = runtime.createRuntimeEventBus({ now: () => "now" });
    const store = runtime.createRuntimeStateStore({ viewMode: "tasks" }, bus);
    bus.on("*", (event) => events.push({ type: event.type, detail: event.detail }));

    store.set({ selectedThreadId: "thread-1" }, { source: "test_set" });
    store.update((state) => ({ viewMode: `${state.viewMode}:detail` }), { source: "test_update" });
    store.replace({ viewMode: "system-console" }, { source: "test_replace" });

    assert.equal(store.get("viewMode"), "system-console");
    assert.deepEqual(store.get(), { viewMode: "system-console" });
    assert.deepEqual(events.map((event) => event.type), [
      "state:changed",
      "state:changed",
      "state:replaced",
    ]);
    assert.equal(events[0].detail.patch.selectedThreadId, "thread-1");
    assert.equal(events[0].detail.source, "test_set");
    assert.equal(events[2].detail.previousKeyCount, 2);
    assert.deepEqual(store.snapshot(), { viewMode: "system-console" });
  });

  await test("legacy aliases remain available for runtime facade compatibility", () => {
    assert.equal(runtime.createEventBus, runtime.createRuntimeEventBus);
    assert.equal(runtime.createStateStore, runtime.createRuntimeStateStore);
    const bus = runtime.createEventBus();
    const store = runtime.createStateStore({}, bus);
    assert.equal(typeof bus.emit, "function");
    assert.equal(typeof store.set, "function");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
