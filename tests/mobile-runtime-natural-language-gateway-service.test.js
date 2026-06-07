"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeNaturalLanguageGatewayService } = require("../adapters/mobile-runtime-natural-language-gateway-service");

function makeService(overrides = {}) {
  const calls = [];
  const draftService = overrides.draftService || {
    extractJsonObject: (text) => ({ parsed: text }),
    normalizeAutomationDraft: (raw) => ({ normalized: raw }),
    interpretAutomationNaturalLanguage: async (text) => ({ interpreted: text }),
  };
  const service = createMobileRuntimeNaturalLanguageGatewayService({
    naturalLanguageDraftService: () => draftService,
    chooseGatewayRunTarget: async (request, meta) => {
      calls.push(["choose", request, meta]);
      return { apiBase: "http://gateway", apiKey: "key", schedulerRunId: "scheduler-1" };
    },
    gatewayPool: () => ({
      runnerFor(target) {
        calls.push(["runnerFor", target.apiBase]);
        return {
          async streamResponses(body, options) {
            calls.push(["stream", body, options.gatewayUrl, options.apiKey, options.signal]);
            return overrides.streamResponses(body, options);
          },
        };
      },
    }),
    releaseGatewayRunTarget: (runId, status) => calls.push(["release", runId, status]),
    responseTextFromValue: (value) => {
      if (typeof value === "string") return value;
      return value?.text || value?.content || "";
    },
    randomHex: () => "abc123",
    abortSignalTimeout: (ms) => ({ timeoutMs: ms }),
    nowMs: () => 1000,
    defaultTimeoutMs: 9000,
  });
  return { service, calls };
}

async function testDelegatesToDraftService() {
  const { service } = makeService({
    streamResponses: async () => ({ body: { getReader() {} } }),
  });
  assert.deepEqual(service.extractJsonObject("{\"ok\":true}"), { parsed: "{\"ok\":true}" });
  assert.deepEqual(service.normalizeAutomationDraft({ ok: true }), { normalized: { ok: true } });
  assert.deepEqual(await service.interpretAutomationNaturalLanguage("clean"), { interpreted: "clean" });
}

async function testHermesModelTextStreamsAndReleasesIdle() {
  const { service, calls } = makeService({
    streamResponses: async (_body, options) => {
      options.onEvent({ event: "message.delta", delta: " hello" });
      options.onEvent({ type: "response.output_text.delta", text: " world" });
      options.onEvent({ output_text: "!" });
      return { body: { getReader() {} } };
    },
  });

  const text = await service.hermesModelText({ input: "prompt" }, 1000);
  assert.equal(text, "hello world!");
  assert.deepEqual(calls[0], ["choose", { purpose: "automation_draft" }, { runId: "automation_draft_1000_abc123" }]);
  assert.equal(calls[2][4].timeoutMs, 5000);
  assert.deepEqual(calls.at(-1), ["release", "scheduler-1", "idle"]);
}

async function testHermesModelTextAppendsNonStreamResponse() {
  const { service } = makeService({
    streamResponses: async () => "final text",
  });

  assert.equal(await service.hermesModelText({ input: "prompt" }), "final text");
}

async function testHermesModelTextReleasesFailedOnError() {
  const { service, calls } = makeService({
    streamResponses: async () => {
      throw new Error("gateway failed");
    },
  });

  await assert.rejects(() => service.hermesModelText({ input: "prompt" }), /gateway failed/);
  assert.deepEqual(calls.at(-1), ["release", "scheduler-1", "failed"]);
}

async function main() {
  await testDelegatesToDraftService();
  await testHermesModelTextStreamsAndReleasesIdle();
  await testHermesModelTextAppendsNonStreamResponse();
  await testHermesModelTextReleasesFailedOnError();
  console.log("mobile runtime natural language gateway service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
