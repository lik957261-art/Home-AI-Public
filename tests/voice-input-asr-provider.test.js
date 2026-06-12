"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createVoiceInputAsrProvider,
  normalizeProviderResult,
  providerStatusFromConfig,
} = require("../adapters/voice-input-asr-provider");

async function testDisabledByDefaultWithoutUrl() {
  const provider = createVoiceInputAsrProvider({ env: {}, enabled: true });
  assert.deepEqual(provider.status(), {
    enabled: false,
    configured: false,
    backend: "disabled",
    hasUrl: false,
  });
  await assert.rejects(() => provider.transcribeAudio({ audioBase64: "AA==" }), {
    status: 503,
    code: "asr_backend_unavailable",
  });
}

async function testHttpProviderPostsBoundedPayload() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-asr-provider-"));
  const audioPath = path.join(tempDir, "sample.webm");
  fs.writeFileSync(audioPath, Buffer.from("audio"));
  const calls = [];
  const provider = createVoiceInputAsrProvider({
    backend: "whisper-local",
    enabled: true,
    env: {},
    url: "http://127.0.0.1:9010/asr",
    fetchImpl(url, request) {
      calls.push({ url, request, body: JSON.parse(request.body) });
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ transcript: "hello world", language: "en", confidence: 0.8, backend: "test-asr" });
        },
      });
    },
  });
  const result = await provider.transcribeAudio({
    audioPath,
    durationMs: 1000,
    mimeType: "audio/webm",
    requestId: "req_1",
  });
  assert.equal(result.text, "hello world");
  assert.equal(result.language, "en");
  assert.equal(result.confidence, 0.8);
  assert.equal(result.backend, "test-asr");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:9010/asr");
  assert.equal(calls[0].body.audioBase64, Buffer.from("audio").toString("base64"));
  assert.equal(calls[0].body.mimeType, "audio/webm");
  assert.equal(calls[0].body.requestId, "req_1");
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function testProviderStatusAndNormalization() {
  assert.deepEqual(providerStatusFromConfig({ enabled: true, backend: "funasr-local", url: "http://127.0.0.1" }), {
    enabled: true,
    configured: true,
    backend: "funasr-local",
    hasUrl: true,
  });
  assert.deepEqual(normalizeProviderResult({ output_text: " text ", confidence: "0.5" }, "fallback"), {
    text: "text",
    language: "",
    confidence: 0.5,
    segments: [],
    backend: "fallback",
    durationMs: 0,
  });
}

async function run() {
  await testDisabledByDefaultWithoutUrl();
  await testHttpProviderPostsBoundedPayload();
  testProviderStatusAndNormalization();
  console.log("voice input asr provider tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
