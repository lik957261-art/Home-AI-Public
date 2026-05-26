"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunner, parseSseFrame } = require("../adapters/gateway-runner");

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status || 200,
    statusText: init.statusText || "OK",
    headers: Object.assign({ "content-type": "application/json" }, init.headers || {}),
  });
}

async function testRequestAddsAuthAndJsonBody() {
  const calls = [];
  const runner = createGatewayRunner({
    apiBase: () => "http://gateway.example.test/",
    apiKey: () => "secret-key",
    timeoutMs: () => 5000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true });
    },
  });
  const result = await runner.request("v1/example", { method: "POST", body: { a: 1 } });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, "http://gateway.example.test/v1/example");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-key");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.body, JSON.stringify({ a: 1 }));
}

async function testStatusToleratesMissingCapabilities() {
  const calls = [];
  const runner = createGatewayRunner({
    apiBase: "http://gateway.example.test",
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/health")) return jsonResponse({ status: "ok" });
      if (url.endsWith("/health/detailed")) return jsonResponse({ active_agents: 0 });
      return jsonResponse({ error: "missing" }, { status: 404, statusText: "Not Found" });
    },
  });
  const status = await runner.status();
  assert.equal(status.ok, true);
  assert.deepEqual(status.health, { status: "ok" });
  assert.equal(status.capabilities.error, "missing");
  assert.equal(calls.length, 3);
}

async function testStreamResponsesPreservesEvents() {
  const events = [];
  const runner = createGatewayRunner({
    apiBase: "http://gateway.example.test",
    fetchImpl: async () => new Response([
      "event: response.created\n",
      "data: {\"response\":{\"id\":\"resp_1\"},\"extra\":\"keep\"}\n\n",
      "event: response.output_text.delta\n",
      "data: {\"delta\":\"hi\"}\n\n",
    ].join(""), { headers: { "content-type": "text/event-stream" } }),
  });
  await runner.streamResponses({ input: "hello", stream: true }, { onEvent: (event) => events.push(event) });
  assert.deepEqual(events, [
    { response: { id: "resp_1" }, extra: "keep", event: "response.created" },
    { delta: "hi", event: "response.output_text.delta" },
  ]);
}

async function testStreamResponsesEmitsJsonResponse() {
  const events = [];
  const runner = createGatewayRunner({
    apiBase: "http://gateway.example.test",
    fetchImpl: async () => jsonResponse({ output_text: "{\"ok\":true}" }),
  });
  await runner.streamResponses({ input: "hello", stream: false }, { onEvent: (event) => events.push(event) });
  assert.deepEqual(events, [{ output_text: "{\"ok\":true}" }]);
}

async function testRunOperationsUseGatewayOverride() {
  const urls = [];
  const auth = [];
  const runner = createGatewayRunner({
    apiBase: "http://primary.example.test",
    apiKey: "primary-key",
    fetchImpl: async (url, options) => {
      urls.push(url);
      auth.push(options.headers.Authorization);
      return jsonResponse({ ok: true });
    },
  });
  await runner.checkRun("resp_1", { gatewayUrl: "http://runner-a.example.test/", apiKey: "worker-key" });
  await runner.stopRun("resp_1", { gatewayUrl: "http://runner-a.example.test/" });
  assert.deepEqual(urls, [
    "http://runner-a.example.test/v1/runs/resp_1",
    "http://runner-a.example.test/v1/runs/resp_1/stop",
  ]);
  assert.deepEqual(auth, ["Bearer worker-key", "Bearer primary-key"]);
}

function testParseSseFrame() {
  assert.deepEqual(parseSseFrame("event: x\ndata: {\"a\":1}\n"), { a: 1, event: "x" });
  assert.equal(parseSseFrame(": ping\n\n"), null);
  assert.equal(parseSseFrame("event: bad\ndata: not-json\n"), null);
}

(async () => {
  testParseSseFrame();
  await testRequestAddsAuthAndJsonBody();
  await testStatusToleratesMissingCapabilities();
  await testStreamResponsesPreservesEvents();
  await testStreamResponsesEmitsJsonResponse();
  await testRunOperationsUseGatewayOverride();
  console.log("gateway-runner tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
