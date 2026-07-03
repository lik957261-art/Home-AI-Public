"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadAdapter() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/voice-input-status/audio-capture-adapter.mjs",
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

function fakeTrack(state = "live") {
  return {
    readyState: state,
    stopped: false,
    listeners: {},
    stop() {
      this.stopped = true;
      this.readyState = "ended";
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
}

(async () => {
  const adapter = await loadAdapter();

  await test("audio capture adapter is browser-global free", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/vite-islands/voice-input-status/audio-capture-adapter.mjs"),
      "utf8",
    );
    assert.match(source, /VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION/);
    assert.match(source, /createRecordingSession/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /navigator\.mediaDevices/);
    assert.doesNotMatch(source, /new MediaRecorder/);
    assert.doesNotMatch(source, /window\.AudioContext/);
    assert.doesNotMatch(source, /window\.webkitAudioContext/);
    assert.doesNotMatch(source, /\bbtoa\(/);
    assert.doesNotMatch(source, /\bBuffer\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /localStorage/);
  });

  await test("readiness and mime selection use injected browser capabilities", () => {
    function Recorder() {}
    Recorder.isTypeSupported = (type) => type === "audio/webm";
    function AudioContextCtor() {}
    const readiness = adapter.voiceAudioCaptureReadiness({
      mediaDevices: { getUserMedia() {} },
      recorderCtor: Recorder,
      audioContextCtor: AudioContextCtor,
      serviceStatus: { provider: { streaming: { configured: true, sampleRate: 24000 } } },
    });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.streamingReady, true);
    assert.equal(readiness.streamingConfigured, true);
    assert.equal(readiness.mimeType, "audio/webm");
    assert.equal(readiness.sampleRate, 24000);
  });

  await test("held microphone stream stops replaced tracks and records ended callback", () => {
    const previousTrack = fakeTrack("live");
    const nextTrack = fakeTrack("live");
    const previous = { getAudioTracks: () => [previousTrack] };
    const next = { getAudioTracks: () => [nextTrack] };
    const ended = [];
    const result = adapter.attachHeldMicrophoneStream(previous, next, {
      now: () => 1234,
      onEnded: (event) => ended.push(event),
    });
    assert.equal(previousTrack.stopped, true);
    assert.equal(result.stoppedPrevious, 1);
    assert.equal(result.live, true);
    assert.equal(typeof nextTrack.listeners.ended, "function");
    nextTrack.listeners.ended();
    assert.equal(ended.length, 1);
    assert.equal(ended[0].lostAt, 1234);
  });

  await test("injected microphone acquisition fails closed without mediaDevices", async () => {
    await assert.rejects(
      () => adapter.acquireMicrophoneStream({}),
      /microphone_capture_unsupported/,
    );
  });

  await test("recording session wraps injected recorder without global media APIs", () => {
    const calls = [];
    function Recorder(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      calls.push({ action: "construct", options });
    }
    Recorder.prototype.start = function start(ms) {
      this.state = "recording";
      calls.push({ action: "start", ms });
    };
    Recorder.prototype.stop = function stop() {
      this.state = "inactive";
      calls.push({ action: "stop" });
      this.onstop?.();
    };
    const stopped = [];
    const session = adapter.createRecordingSession({
      recorderCtor: Recorder,
      stream: { id: "stream-1" },
      mimeType: "audio/webm",
      onStop: (chunks) => stopped.push(chunks),
    });
    session.start(1000);
    session.recorder.ondataavailable({ data: { size: 12, name: "chunk-1" } });
    session.stop();
    assert.equal(session.chunks.length, 1);
    assert.equal(stopped.length, 1);
    assert.deepEqual(calls.map((call) => call.action), ["construct", "start", "stop"]);
    assert.deepEqual(calls[0].options, { mimeType: "audio/webm" });
  });

  await test("PCM conversion, base64, and streaming buffer match classic capture semantics", () => {
    const pcm = adapter.downsampleToPcm16(new Float32Array([-1, -0.5, 0, 0.5, 1]), 16000, 16000);
    assert.equal(pcm.length, 10);
    const view = new DataView(pcm.buffer);
    assert.equal(view.getInt16(0, true), -32768);
    assert.equal(view.getInt16(4, true), 0);
    assert.equal(view.getInt16(8, true), 32767);
    assert.equal(adapter.bytesToBase64(new Uint8Array([72, 111, 109, 101])), "SG9tZQ==");

    const streaming = adapter.createStreamingBuffer({ sampleRate: 8000, voiceSessionId: "voice-session" });
    assert.equal(adapter.streamingTargetSamples(streaming), 2400);
    adapter.appendPcmToStreamingBuffer(streaming, new Uint8Array(2400 * 2));
    assert.equal(adapter.streamingShouldFlush(streaming), true);
    const chunk = adapter.takeStreamingChunk(streaming);
    assert.equal(chunk.length, 4800);
    assert.equal(streaming.bufferedSamples, 0);
  });

  await test("audio frame helper appends downsampled PCM and reports flush readiness", () => {
    const streaming = adapter.createStreamingBuffer({ sampleRate: 8000 });
    const result = adapter.appendAudioFrameToStreamingBuffer(
      streaming,
      new Float32Array(4800).fill(0.25),
      16000,
    );
    assert.equal(result.pcm.length, 4800);
    assert.equal(result.bufferedSamples, 2400);
    assert.equal(result.shouldFlush, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
