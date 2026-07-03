"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/voice-input-status/model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function loadSessionController() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/voice-input-status/session-controller.mjs",
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
  await test("Vite config builds a development voice input status island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /voice-input-status/);
    assert.match(configText, /\/vite-voice-input-status-preview\//);
    assert.match(configText, /src\/vite-islands\/voice-input-status\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/voice-input-status/index.html");
    const builtPreview = read("public/vite-preview/voice-input-status.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/voice-input-status\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/voice-input-status\/voice-input-status\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/voice-input-status/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/voice-input-status/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/voice-input-status/);
  });

  await test("source uses runtime facade and avoids classic shell globals", async () => {
    const source = read("src/vite-islands/voice-input-status/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /createVoiceInputSessionController/);
    assert.match(source, /voiceAudioCaptureReadiness/);
    assert.match(source, /audioCaptureReadiness/);
    assert.match(source, /HomeAiRuntimeFacade/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /HomeAIViteVoiceInputStatusPreview/);
    assert.match(source, /sessionSnapshot/);
    assert.match(source, /expirePendingGuard/);
    assert.match(source, /autoHide/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
    assert.doesNotMatch(source, /navigator\.mediaDevices/);
    assert.doesNotMatch(source, /new MediaRecorder/);
  });

  await test("session controller models press lifecycle without media APIs", async () => {
    const controller = await loadSessionController();
    const started = controller.beginVoicePressSession({}, {}, 1000);
    assert.equal(started.state.status, "pending");
    assert.equal(started.effects.scheduleLongPressMs, 420);
    assert.equal(started.effects.schedulePendingGuardMs, 1520);
    const longPress = controller.triggerVoiceLongPress(started.state, 1420);
    assert.equal(longPress.state.status, "checking");
    assert.equal(longPress.effects.startRecording, true);
    const released = controller.releaseVoicePressSession(Object.assign({}, longPress.state, {
      status: "recording",
    }), 3000);
    assert.equal(released.state.status, "finalizing");
    assert.equal(released.effects.stopRecording, true);
    const hidden = controller.evaluateVoiceSessionTimeouts({
      status: "inserted",
      terminalHideAt: 2000,
    }, 2100);
    assert.equal(hidden.state.status, "idle");
    assert.equal(hidden.state.hidden, true);
  });

  await test("model matches bounded voice pending and terminal behavior", async () => {
    const model = await loadModel();
    assert.equal(model.LONG_PRESS_MS, 420);
    assert.equal(model.PENDING_GUARD_MS, 1520);
    assert.equal(model.statusLabel("pending"), "继续按住开始录音");
    assert.equal(model.statusDetail({ status: "pending" }), "等待长按阈值");
    assert.equal(model.statusDetail({ status: "recording", recordingStartedAt: 1000 }, 4600), "00:03");
    assert.equal(model.terminalHideDelay("inserted"), 1400);
    assert.equal(model.terminalHideDelay("failed"), 4200);
    assert.equal(model.normalizeNativeStatus("started"), "recording");
    assert.equal(model.normalizeNativeStatus("final"), "inserting");
    assert.deepEqual(
      model.pendingGuardOutcome({ status: "pending", panelOpenedAt: 1000 }, 2600),
      { shouldCancel: true, reason: "未检测到持续按住" },
    );
  });

  await test("model creates a cancellable status view model without DOM access", async () => {
    const model = await loadModel();
    const viewModel = model.buildVoiceStatusViewModel({
      status: "transcribing",
      voiceSessionId: "voice_preview_session_12345678",
      nativeStatus: { source: "native-shell" },
      partialCount: 2,
      statusUpdatedAt: 1000,
    }, {
      now: 2000,
      expanded: true,
      debug: true,
    });
    assert.equal(viewModel.status, "transcribing");
    assert.equal(viewModel.visible, true);
    assert.equal(viewModel.busy, true);
    assert.equal(viewModel.canCancel, true);
    assert.equal(viewModel.expanded, true);
    assert.equal(viewModel.debug, true);
    assert.match(viewModel.meta, /session 12345678/);
    assert.match(viewModel.meta, /native-shell/);
    assert.match(viewModel.meta, /partial 2/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/voice-input-status/voice-input-status.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/voice-input-status/voice-input-status.js");
    assert.match(output, /语音输入状态/);
    assert.match(output, /等待长按阈值/);
    assert.match(output, /开始长按/);
    assert.match(output, /pending 超时/);
    assert.match(output, /音频捕获 ESM/);
    assert.match(output, /audioCaptureReadiness/);
    assert.match(output, /HomeAIViteVoiceInputStatusPreview/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
