"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildMultipartBody,
  createVoiceInputAsrProvider,
  mergedInitialPrompt,
  normalizeProviderResult,
  parseComparisonBackends,
  providerStatusFromConfig,
  providerProtocolFromConfig,
} = require("../adapters/voice-input-asr-provider");

async function testDisabledByDefaultWithoutUrl() {
  const provider = createVoiceInputAsrProvider({ env: {}, enabled: true });
  assert.deepEqual(provider.status(), {
    enabled: false,
    configured: false,
    backend: "disabled",
    hasUrl: false,
    protocol: "json-base64",
    comparison: [],
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

async function testOpenAiMultipartProviderPostsFileUpload() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-asr-openai-provider-"));
  const audioPath = path.join(tempDir, "sample.webm");
  fs.writeFileSync(audioPath, Buffer.from("audio"));
  const calls = [];
  const provider = createVoiceInputAsrProvider({
    backend: "whisper-large-v3-turbo",
    enabled: true,
    env: {},
    url: "http://127.0.0.1:8001/v1/audio/transcriptions",
    fetchImpl(url, request) {
      calls.push({ url, request });
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ text: "你好", language: "zh", language_probability: 0.91, duration: 1.5 });
        },
      });
    },
  });
  const result = await provider.transcribeAudio({
    audioPath,
    durationMs: 1000,
    mimeType: "audio/webm",
    localeHint: "zh-CN",
    requestId: "req_1",
  });
  assert.equal(result.text, "你好");
  assert.equal(result.language, "zh");
  assert.equal(result.confidence, 0.91);
  assert.equal(result.durationMs, 1500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8001/v1/audio/transcriptions");
  assert.ok(calls[0].request.body);
  assert.notEqual(String(calls[0].request.headers?.["Content-Type"] || ""), "application/json");
  if (typeof calls[0].request.body?.entries === "function") {
    const fields = Object.fromEntries(Array.from(calls[0].request.body.entries()).filter(([key]) => key !== "file"));
    assert.equal(fields.language, "zh");
    assert.equal(fields.task, "transcribe");
    assert.equal(fields.condition_on_previous_text, "true");
    assert.equal(fields.vad_filter, "false");
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function testOpenAiMultipartProviderDefaultsToChineseTranscribeHints() {
  const payload = await buildMultipartBody({
    audioBase64: Buffer.from("abc").toString("base64"),
    mimeType: "audio/webm",
  }, {
    language: "zh",
    task: "transcribe",
    initialPrompt: "以下是普通话语音转写，请使用简体中文，并加入合适的中文标点符号。",
    conditionOnPreviousText: true,
    vadFilter: false,
  });
  const bodyText = typeof payload.body === "string" || Buffer.isBuffer(payload.body)
    ? String(payload.body)
    : "";
  if (bodyText) {
    assert.match(bodyText, /name="language"\r\n\r\nzh/);
    assert.match(bodyText, /name="task"\r\n\r\ntranscribe/);
    assert.match(bodyText, /name="initial_prompt"/);
    assert.match(bodyText, /name="condition_on_previous_text"\r\n\r\ntrue/);
    assert.match(bodyText, /name="vad_filter"\r\n\r\nfalse/);
  } else {
    assert.ok(payload.body);
  }
}

function testMergedInitialPromptKeepsDefaultAndDynamicHints() {
  const prompt = mergedInitialPrompt({
    initialPrompt: "可能出现的人名：吴萍。",
  }, {
    initialPrompt: "请使用简体中文和中文标点。",
  });
  assert.match(prompt, /请使用简体中文/);
  assert.match(prompt, /吴萍/);
}

async function testMultipartFallbackBodyBuilder() {
  const payload = await buildMultipartBody({
    audioBase64: Buffer.from("abc").toString("base64"),
    mimeType: "audio/webm",
    language: "zh-CN",
  });
  assert.ok(payload.body);
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
  assert.equal(providerProtocolFromConfig({ backend: "whisper-local", url: "http://127.0.0.1:9010/asr" }), "json-base64");
  assert.equal(providerProtocolFromConfig({ backend: "whisper-large-v3-turbo", url: "http://127.0.0.1:8001/v1/audio/transcriptions" }), "openai-multipart");
}

function testComparisonBackendCompactNames() {
  const rows = parseComparisonBackends("whisper-large-v3-turbo,funasr-local,sensevoice-local");
  assert.deepEqual(rows.map((row) => [row.backend, row.protocol, row.url]), [
    ["whisper-large-v3-turbo", "openai-multipart", "http://127.0.0.1:8001/v1/audio/transcriptions"],
    ["funasr-local", "openai-multipart", "http://127.0.0.1:8002/v1/audio/transcriptions"],
    ["sensevoice-local", "openai-multipart", "http://127.0.0.1:8003/v1/audio/transcriptions"],
  ]);
}

async function testComparisonBackendsReturnBoundedRows() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-asr-compare-provider-"));
  const audioPath = path.join(tempDir, "sample.webm");
  fs.writeFileSync(audioPath, Buffer.from("audio"));
  const calls = [];
  const provider = createVoiceInputAsrProvider({
    backend: "whisper-large-v3-turbo",
    enabled: true,
    env: {},
    url: "http://127.0.0.1:8001/v1/audio/transcriptions",
    comparisonBackends: [
      { backend: "whisper-large-v3-turbo", protocol: "openai-multipart", url: "http://127.0.0.1:8001/v1/audio/transcriptions" },
      { backend: "funasr-local", protocol: "openai-multipart", url: "http://127.0.0.1:8002/v1/audio/transcriptions" },
      { backend: "sensevoice-local", protocol: "openai-multipart", url: "http://127.0.0.1:8003/v1/audio/transcriptions" },
    ],
    fetchImpl(url) {
      calls.push(url);
      return Promise.resolve({
        ok: !url.includes("8003"),
        status: url.includes("8003") ? 503 : 200,
        json() {
          return Promise.resolve({ text: url.includes("8002") ? "吴萍" : "无凭", language: "zh", backend: url.includes("8002") ? "funasr-local" : "whisper-large-v3-turbo" });
        },
      });
    },
  });
  const status = provider.status();
  assert.equal(status.comparison.length, 3);
  const result = await provider.transcribeAudioWithComparison({
    audioPath,
    durationMs: 1000,
    mimeType: "audio/webm",
    localeHint: "zh-CN",
    requestId: "req_1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].status, "ok");
  assert.equal(result.results[1].backend, "funasr-local");
  assert.equal(result.results[2].status, "error");
  assert.equal(calls.length, 3);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function run() {
  await testDisabledByDefaultWithoutUrl();
  await testHttpProviderPostsBoundedPayload();
  await testOpenAiMultipartProviderPostsFileUpload();
  await testOpenAiMultipartProviderDefaultsToChineseTranscribeHints();
  testMergedInitialPromptKeepsDefaultAndDynamicHints();
  await testMultipartFallbackBodyBuilder();
  testProviderStatusAndNormalization();
  testComparisonBackendCompactNames();
  await testComparisonBackendsReturnBoundedRows();
  console.log("voice input asr provider tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
