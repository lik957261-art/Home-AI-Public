"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/live-event-source-client.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("live EventSource client keeps browser boundary injected", async () => {
    const source = read("src/vite-islands/chat-runtime/live-event-source-client.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /new\s+EventSource\b/);
    assert.doesNotMatch(source, /\bEventSource\s*\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("builds classic-compatible /api/events URL with bounded query", async () => {
    const client = await loadClient();
    assert.equal(client.buildChatEventSourceUrl(), "/api/events");
    assert.equal(
      client.buildChatEventSourceUrl({
        key: "owner key",
        clientVersion: "20260702",
      }),
      "/api/events?key=owner+key&clientVersion=20260702",
    );
    const plan = client.chatEventSourceConnectionPlan({
      key: "owner key",
      clientVersion: "20260702",
    });
    assert.equal(plan.url, "/api/events?key=owner+key&clientVersion=20260702");
    assert.equal(plan.hasKey, true);
    assert.equal(plan.hasClientVersion, true);
  });

  await test("plans classic frame parsing and connection status text", async () => {
    const client = await loadClient();
    const parsed = client.chatEventFramePayloadPlan({
      data: JSON.stringify({ type: "thread.updated", threadId: "t1" }),
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.payload, { type: "thread.updated", threadId: "t1" });
    const invalid = client.chatEventFramePayloadPlan({ data: "{\"type\":" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.diagnostic.code, "event_stream_invalid_json");
    assert.match(invalid.errorMessage, /JSON|Unexpected|Expected/i);
    const empty = client.chatEventFramePayloadPlan({ data: "" });
    assert.equal(empty.ok, false);
    assert.equal(empty.diagnostic.code, "event_stream_empty_frame");
    assert.equal(client.chatEventConnectionStatusPlan({ status: "reconnecting" }).text, "Reconnecting");
    assert.equal(client.chatEventConnectionStatusPlan({ status: "connected" }).text, "Home AI OK");
  });

  await test("missing EventSource factory fails closed with diagnostic", async () => {
    const client = await loadClient();
    const statuses = [];
    const transport = client.createChatEventSourceClient({
      clientVersion: "v1",
      onStatus: (status) => statuses.push(status),
    });
    const result = transport.start();
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.diagnostic.code, "event_source_factory_missing");
    assert.equal(transport.source(), null);
    assert.equal(statuses.at(-1).status, "blocked");
  });

  await test("applies message frames and reports reconnect diagnostics", async () => {
    const client = await loadClient();
    const created = [];
    const statuses = [];
    const results = [];
    const frames = [];
    const transport = client.createChatEventSourceClient({
      key: "preview",
      clientVersion: "v1",
      eventSourceFactory(url) {
        const source = {
          url,
          readyState: 0,
          onopen: null,
          onmessage: null,
          onerror: null,
          closeCalled: false,
          close() {
            source.closeCalled = true;
            source.readyState = 2;
          },
        };
        created.push(source);
        return source;
      },
      applyFrame(frame) {
        frames.push(frame);
        return { ok: true, applied: true, eventType: "message.delta" };
      },
      onStatus: (status) => statuses.push(status),
      onResult: (result) => results.push(result),
    });
    const started = transport.start();
    assert.equal(started.ok, true);
    assert.equal(created[0].url, "/api/events?key=preview&clientVersion=v1");
    created[0].onopen({ type: "open" });
    created[0].onmessage({ data: "{\"type\":\"message.delta\"}" });
    created[0].onerror({ message: "network" });
    transport.close("test_close");
    assert.equal(frames.length, 1);
    assert.equal(results[0].applied, true);
    assert.equal(results[1].diagnostic.code, "event_source_reconnecting");
    assert.equal(created[0].closeCalled, true);
    assert.deepEqual(
      statuses.map((status) => status.status),
      ["disconnected", "connecting", "connected", "connected", "reconnecting", "disconnected"],
    );
  });

  await test("restart closes the previous injected source before reconnecting", async () => {
    const client = await loadClient();
    const created = [];
    const transport = client.createChatEventSourceClient({
      eventSourceFactory(url) {
        const source = {
          url,
          onopen: null,
          onmessage: null,
          onerror: null,
          closeCalled: false,
          close() {
            source.closeCalled = true;
          },
        };
        created.push(source);
        return source;
      },
      applyFrame() {
        return { ok: true };
      },
    });
    transport.start({ clientVersion: "v1" });
    transport.start({ clientVersion: "v2" });
    assert.equal(created.length, 2);
    assert.equal(created[0].closeCalled, true);
    assert.equal(created[1].url, "/api/events?clientVersion=v2");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
