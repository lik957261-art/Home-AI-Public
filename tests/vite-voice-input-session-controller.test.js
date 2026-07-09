"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadController() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/voice-input-status/session-controller.mjs",
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
  const controller = await loadController();

  await test("voice session controller source is browser-global free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/vite-islands/voice-input-status/session-controller.mjs"), "utf8");
    assert.match(source, /VOICE_INPUT_SESSION_CONTROLLER_VERSION/);
    assert.match(source, /createVoiceInputSessionController/);
    assert.equal(typeof controller.statusLabel, "function");
    assert.equal(typeof controller.isActiveStatus, "function");
    assert.equal(typeof controller.terminalHideDelay, "function");
    assert.equal(controller.statusLabel("recording"), "正在录音");
    assert.equal(controller.isActiveStatus("recording"), true);
    assert.equal(controller.terminalHideDelay("failed"), 4200);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /navigator\.mediaDevices/);
    assert.doesNotMatch(source, /MediaRecorder/);
  });

  await test("begin press arms pending long-press and guard timers", () => {
    const result = controller.beginVoicePressSession({}, { target: { kind: "native" } }, 1000);
    assert.equal(result.state.status, "pending");
    assert.equal(result.state.pointerActive, true);
    assert.equal(result.state.longPressArmed, true);
    assert.equal(result.state.pressStartedAt, 1000);
    assert.equal(result.effects.scheduleLongPressMs, 420);
    assert.equal(result.effects.schedulePendingGuardMs, 1520);
    assert.equal(result.effects.startRecording, false);
  });

  await test("release before threshold cancels pending gesture", () => {
    const started = controller.beginVoicePressSession({}, {}, 1000).state;
    const result = controller.releaseVoicePressSession(started, 1200);
    assert.equal(result.state.status, "cancelled");
    assert.equal(result.state.statusDetail, "语音手势已取消");
    assert.equal(result.state.longPressArmed, false);
    assert.equal(result.effects.action, "cancel_pending");
    assert.equal(result.effects.clearLongPress, true);
    assert.equal(result.effects.cancelRecording, false);
  });

  await test("long press starts recording path through checking status", () => {
    const started = controller.beginVoicePressSession({}, {}, 1000).state;
    const result = controller.triggerVoiceLongPress(started, 1420);
    assert.equal(result.state.status, "checking");
    assert.equal(result.state.longPressTriggered, true);
    assert.equal(result.state.longPressArmed, false);
    assert.equal(result.effects.startRecording, true);
  });

  await test("release after long press requests stop recording", () => {
    const started = controller.beginVoicePressSession({}, {}, 1000).state;
    const checking = controller.triggerVoiceLongPress(started, 1420).state;
    const result = controller.releaseVoicePressSession(Object.assign({}, checking, {
      status: "recording",
      recordingStartedAt: 1500,
    }), 4200);
    assert.equal(result.state.status, "finalizing");
    assert.equal(result.state.pointerActive, false);
    assert.equal(result.effects.action, "stop_recording");
    assert.equal(result.effects.stopRecording, true);
  });

  await test("pending guard cancels stale waiting gesture", () => {
    const started = controller.beginVoicePressSession({}, {}, 1000).state;
    const result = controller.evaluateVoiceSessionTimeouts(started, 2600);
    assert.equal(result.state.status, "cancelled");
    assert.equal(result.state.statusDetail, "未检测到持续按住");
    assert.equal(result.effects.action, "pending_guard_cancel");
  });

  await test("native terminal status schedules and applies auto hide", () => {
    const inserted = controller.applyVoiceSessionStatus({}, {
      status: "inserted",
      voiceSessionId: "voice_session_abcdef12",
    }, 1000);
    assert.equal(inserted.state.status, "inserted");
    assert.equal(inserted.state.voiceSessionId, "voice_session_abcdef12");
    assert.equal(inserted.effects.scheduleTerminalHideMs, 1400);
    assert.equal(inserted.state.terminalHideAt, 2400);

    const hidden = controller.evaluateVoiceSessionTimeouts(inserted.state, 2500);
    assert.equal(hidden.state.status, "idle");
    assert.equal(hidden.state.hidden, true);
    assert.equal(hidden.effects.action, "terminal_auto_hide");
  });

  await test("controller owns injected timers without browser APIs", () => {
    let now = 1000;
    let nextTimerId = 1;
    const timers = new Map();
    const events = [];
    const session = controller.createVoiceInputSessionController({
      now: () => now,
      setTimer: (fn, ms) => {
        const id = nextTimerId;
        nextTimerId += 1;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
      onChange: (state, effects) => events.push({ status: state.status, action: effects.action }),
    });

    session.beginPress();
    assert.equal(session.snapshot().status, "pending");
    assert.equal(timers.size, 2);
    const longPress = [...timers.values()].find((timer) => timer.ms === 420);
    assert.ok(longPress);
    now = 1420;
    longPress.fn();
    assert.equal(session.snapshot().status, "checking");
    assert.equal(events.at(-1).action, "long_press");
    session.applyStatus({ status: "inserted" });
    assert.equal(session.snapshot().status, "inserted");
    assert.ok([...timers.values()].some((timer) => timer.ms === 1400));
    session.dispose();
    assert.equal(timers.size, 0);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
