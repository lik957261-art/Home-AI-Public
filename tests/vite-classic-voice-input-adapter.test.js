"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-voice-input-ui.js"), "utf8");

function createHarness(options = {}) {
  const calls = [];
  const fakeSessionModule = options.fakeSessionModule || null;
  const fakeAudioModule = options.fakeAudioModule || null;
  function Recorder() {}
  Recorder.isTypeSupported = (type) => type === "audio/webm";
  const bodyClassList = {
    add() {},
    remove() {},
    toggle() {},
  };
  const document = {
    body: {
      classList: bodyClassList,
      appendChild() {},
    },
    documentElement: { dataset: {} },
    addEventListener() {},
    createElement() {
      return {
        classList: bodyClassList,
        dataset: {},
        setAttribute() {},
        appendChild() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      };
    },
    getSelection() {
      return { removeAllRanges() {} };
    },
  };
  const window = {
    document,
    location: { search: "" },
    addEventListener() {},
    getComputedStyle() {
      return {};
    },
    __homeAiImportVoiceInputSessionController(importPath) {
      calls.push(["session-import", importPath]);
      return Promise.resolve(fakeSessionModule);
    },
    __homeAiImportVoiceInputAudioCaptureAdapter(importPath) {
      calls.push(["audio-import", importPath]);
      return Promise.resolve(fakeAudioModule);
    },
  };
  const context = {
    console,
    Promise,
    Date,
    DataView,
    Float32Array,
    Math,
    MediaRecorder: options.withMediaRecorder === false ? undefined : Recorder,
    Uint8Array,
    URLSearchParams,
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    clearInterval() {},
    clearTimeout() {},
    document,
    embeddedPluginVoiceInputAvailable() {
      return false;
    },
    globalThis: null,
    navigator: {},
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 0);
    },
    state: {
      auth: { workspaceId: "owner" },
      selectedWorkspaceId: "owner",
      voiceInput: { status: "idle", chunks: [] },
    },
    window,
    setInterval() {
      return 1;
    },
    setTimeout(callback) {
      return Number(Boolean(callback));
    },
    $() {
      return null;
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__voiceInputHarness = {
  VOICE_INPUT_SESSION_CONTROLLER_ESM_PATH,
  VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_ESM_PATH,
  importVoiceInputSessionController,
  importVoiceInputAudioCaptureAdapter,
  currentVoiceInputSessionControllerModule,
  currentVoiceInputAudioCaptureAdapterModule,
  voiceInputStatusLabel,
  voiceInputPreferredMimeType,
  voiceInputStreamingConfigured,
  voiceInputStreamingSampleRate,
  voiceInputBytesToBase64,
  voiceInputDownsampleToPcm16,
  voiceInputStreamIsLive,
  voiceInputOverlayActiveStatus,
  voiceInputRecordingVisible,
  voiceInputTerminalHideDelay,
};`, context, { filename: "app-voice-input-ui.js" });
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
  await test("classic voice input adapter declares bounded ESM import paths", () => {
    assert.match(source, /VOICE_INPUT_SESSION_CONTROLLER_ESM_PATH/);
    assert.match(source, /\/vite-islands\/voice-input-session-controller\/voice-input-session-controller\.js/);
    assert.match(source, /VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_ESM_PATH/);
    assert.match(source, /\/vite-islands\/voice-input-audio-capture-adapter\/voice-input-audio-capture-adapter\.js/);
    assert.match(source, /__homeAiImportVoiceInputSessionController/);
    assert.match(source, /__homeAiImportVoiceInputAudioCaptureAdapter/);
    assert.match(source, /currentVoiceInputSessionControllerModule/);
    assert.match(source, /currentVoiceInputAudioCaptureAdapterModule/);
  });

  await test("classic adapter imports and delegates deterministic session and audio helpers", async () => {
    const fakeSessionModule = {
      statusLabel(status) {
        return `session-label:${status}`;
      },
      isActiveStatus(status) {
        return status === "model-active";
      },
      terminalHideDelay(status) {
        return status === "model-terminal" ? 77 : 0;
      },
    };
    const fakeAudioModule = {
      preferredRecordingMimeType() {
        return "audio/model";
      },
      streamingConfigured() {
        return true;
      },
      normalizeStreamingSampleRate() {
        return 24000;
      },
      bytesToBase64() {
        return "model-base64";
      },
      downsampleToPcm16() {
        return new Uint8Array([1, 2, 3, 4]);
      },
      streamIsLive() {
        return true;
      },
    };
    const harness = createHarness({ fakeSessionModule, fakeAudioModule });
    const api = harness.__voiceInputHarness;
    assert.equal(api.VOICE_INPUT_SESSION_CONTROLLER_ESM_PATH, "/vite-islands/voice-input-session-controller/voice-input-session-controller.js");
    assert.equal(api.VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_ESM_PATH, "/vite-islands/voice-input-audio-capture-adapter/voice-input-audio-capture-adapter.js");

    assert.equal(await api.importVoiceInputSessionController(harness.window), fakeSessionModule);
    assert.equal(await api.importVoiceInputAudioCaptureAdapter(harness.window), fakeAudioModule);
    assert.equal(api.currentVoiceInputSessionControllerModule(), fakeSessionModule);
    assert.equal(api.currentVoiceInputAudioCaptureAdapterModule(), fakeAudioModule);
    assert.deepEqual(harness.__calls, [
      ["session-import", "/vite-islands/voice-input-session-controller/voice-input-session-controller.js"],
      ["audio-import", "/vite-islands/voice-input-audio-capture-adapter/voice-input-audio-capture-adapter.js"],
    ]);

    assert.equal(api.voiceInputStatusLabel("recording"), "session-label:recording");
    assert.equal(api.voiceInputOverlayActiveStatus("model-active"), true);
    assert.equal(api.voiceInputRecordingVisible({ status: "model-active" }), true);
    assert.equal(api.voiceInputTerminalHideDelay("model-terminal"), 77);
    assert.equal(api.voiceInputPreferredMimeType(), "audio/model");
    assert.equal(api.voiceInputStreamingConfigured({}), true);
    assert.equal(api.voiceInputStreamingSampleRate({}), 24000);
    assert.equal(api.voiceInputBytesToBase64(new Uint8Array([1])), "model-base64");
    assert.deepEqual([...api.voiceInputDownsampleToPcm16(new Float32Array([0]), 16000, 16000)], [1, 2, 3, 4]);
    assert.equal(api.voiceInputStreamIsLive({}), true);
  });

  await test("classic adapter preserves fallback behavior before ESM modules load", () => {
    const harness = createHarness();
    const api = harness.__voiceInputHarness;
    assert.equal(api.currentVoiceInputSessionControllerModule(), null);
    assert.equal(api.currentVoiceInputAudioCaptureAdapterModule(), null);
    assert.equal(api.voiceInputStatusLabel("recording"), "正在录音");
    assert.equal(api.voiceInputOverlayActiveStatus("recording"), true);
    assert.equal(api.voiceInputTerminalHideDelay("failed"), 4200);
    assert.equal(api.voiceInputPreferredMimeType(), "audio/webm");
    assert.equal(api.voiceInputStreamingConfigured({ provider: { streaming: { configured: true } } }), true);
    assert.equal(api.voiceInputStreamingSampleRate({ provider: { streaming: { sampleRate: 4000 } } }), 8000);
    assert.equal(api.voiceInputBytesToBase64(new Uint8Array([72, 111, 109, 101])), "SG9tZQ==");
    assert.equal(api.voiceInputStreamIsLive({ getAudioTracks: () => [{ readyState: "live" }] }), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
