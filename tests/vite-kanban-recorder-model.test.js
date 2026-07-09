"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/kanban-recorder-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("kanban recorder model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/kanban-recorder-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval|MediaRecorder)\b/);
    assert.doesNotMatch(source, /\b(?:Blob|File|URL)\b/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /KANBAN_RECORDER_MODEL_VERSION/);
  });

  await test("plans recorder extension, filenames, durations, and permission errors", () => {
    assert.equal(model.recordingExtensionPlan("audio/mp4"), "m4a");
    assert.equal(model.recordingExtensionPlan("audio/ogg;codecs=opus"), "ogg");
    assert.equal(model.recordingExtensionPlan(""), "webm");
    assert.equal(model.recorderSafeIdPlan("../card-123!?"), "card-123");
    assert.equal(model.recordingFileNamePlan({
      prefix: "growth-retell",
      id: "../task-123",
      fallbackId: "task",
      mime: "audio/mp4",
      nowMs: 12345,
    }), "growth-retell-task-123-12345.m4a");
    assert.equal(model.recordingDurationMsPlan({ status: "recording", startedAt: 1000, elapsedMs: 2000 }, 4500), 5500);
    assert.equal(model.recordingDurationLabelPlan(65000), "1:05");
    assert.equal(model.recordingPermissionMessagePlan({ name: "NotAllowedError" }), "麦克风权限未开启，请允许权限后重试。");
    assert.equal(model.recordingPermissionMessagePlan({ name: "NotFoundError" }), "未找到可用麦克风，请检查设备后重试。");
  });

  await test("plans status text and finish/error patches", () => {
    assert.equal(model.recordingStatusTextPlan({}, {
      supported: true,
      idleText: "开始录音。",
    }), "开始录音。");
    assert.equal(model.recordingStatusTextPlan({ status: "recording" }, {
      durationLabel: "0:03",
    }), "正在录音 0:03");
    assert.equal(model.recordingStatusTextPlan({ status: "ready" }, {
      durationLabel: "0:09",
      readyPrefix: "已录好复盘",
    }), "已录好复盘 0:09");
    assert.deepEqual(model.recordingFinishPlan({ chunks: [], elapsedMs: 1200 }, { noAudioError: "empty" }), {
      ok: false,
      reason: "empty_recording",
      chunks: [],
      elapsedMs: 1200,
      errorPatch: { status: "error", error: "empty", elapsedMs: 1200 },
    });
    const chunk = { size: 3, type: "audio/webm" };
    assert.deepEqual(model.recordingFinishPlan({ chunks: [chunk], elapsedMs: 3000 }), {
      ok: true,
      chunks: [chunk],
      elapsedMs: 3000,
      mimeType: "audio/webm",
    });
    assert.deepEqual(model.recordingErrorPatchPlan({ status: "recording", startedAt: 0, elapsedMs: 500 }, { name: "SecurityError" }), {
      status: "error",
      elapsedMs: 500,
      error: "麦克风权限未开启，请允许权限后重试。",
    });
  });

  await test("plans submitted recorder cleanup by submitted file identity", () => {
    const file = { name: "recording.webm" };
    assert.equal(model.shouldClearSubmittedRecordingPlan({ file }, file), true);
    assert.equal(model.shouldClearSubmittedRecordingPlan({ file: {} }, file), false);
    assert.equal(model.shouldClearSubmittedRecordingPlan({}, file), false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
