"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVoiceInputCorrectionService } = require("../adapters/voice-input-correction-service");
const { createVoiceInputService } = require("../adapters/voice-input-service");

function createHarness(overrides = {}) {
  const runtimeState = {};
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-input-service-"));
  let saveCount = 0;
  let idCounter = 0;
  const correctionService = createVoiceInputCorrectionService({
    state: () => runtimeState,
    saveState() {
      saveCount += 1;
    },
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    nowIso: () => "2026-06-12T00:00:00.000Z",
  });
  const providerCalls = [];
  const asrProvider = overrides.asrProvider || {
    status() {
      return { enabled: true, configured: true, backend: "test-asr", hasUrl: true };
    },
    transcribeAudio(input) {
      providerCalls.push(input);
      assert.equal(fs.existsSync(input.audioPath), true);
      return Promise.resolve({
        text: overrides.transcript || "打开摩依拉插件",
        language: "zh",
        confidence: 0.9,
        backend: "test-asr",
      });
    },
  };
  const service = createVoiceInputService({
    asrProvider,
    correctionService,
    dataDir: tempDir,
    env: {},
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    maxDurationMs: 30000,
    minDurationMs: 100,
    nowIso: () => "2026-06-12T00:00:00.000Z",
    saveState() {
      saveCount += 1;
    },
    state: () => runtimeState,
  });
  return {
    correctionService,
    providerCalls,
    runtimeState,
    service,
    tempDir,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
    get saveCount() {
      return saveCount;
    },
  };
}

function audioBase64(text = "audio") {
  return Buffer.from(text).toString("base64");
}

async function testTranscribeDeletesTemporaryAudioAndReturnsEditableText() {
  const harness = createHarness();
  try {
    const result = await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "打开摩依拉插件");
    assert.equal(result.voiceSessionId.startsWith("voice_session_"), true);
    assert.equal(harness.providerCalls.length, 1);
    const tempVoiceDir = path.join(harness.tempDir, "tmp", "voice-input");
    assert.deepEqual(fs.readdirSync(tempVoiceDir), []);
    assert.equal(harness.runtimeState.voiceInput.audit[0].event, "transcribe");
    assert.equal(JSON.stringify(harness.runtimeState).includes("打开摩依拉插件"), false);
  } finally {
    harness.cleanup();
  }
}

async function testCommitLearnsOnlyShortCorrectionPair() {
  const harness = createHarness();
  try {
    const transcribed = await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    const committed = harness.service.commitSession({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      threadId: "thread_1",
      voiceSessionId: transcribed.voiceSessionId,
      finalText: "打开星盘插件",
    });
    assert.equal(committed.ok, true);
    assert.equal(committed.recorded.length, 1);
    assert.equal(committed.recorded[0].from, "摩依拉");
    assert.equal(committed.recorded[0].to, "星盘");
    const stateJson = JSON.stringify(harness.runtimeState);
    assert.equal(stateJson.includes("打开摩依拉插件"), false);
    assert.equal(stateJson.includes("打开星盘插件"), false);
    assert.equal(stateJson.includes("摩依拉"), true);
    assert.equal(stateJson.includes("星盘"), true);
  } finally {
    harness.cleanup();
  }
}

async function testCommitRequiresSameActorAndWorkspace() {
  const harness = createHarness();
  try {
    const transcribed = await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    assert.throws(() => harness.service.commitSession({
      actorId: "child-a",
      workspaceId: "child-a",
      surfaceType: "chat",
      threadId: "thread_1",
      voiceSessionId: transcribed.voiceSessionId,
      finalText: "打开星盘插件",
    }), /voice session not found/);
    const committed = harness.service.commitSession({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      threadId: "thread_1",
      voiceSessionId: transcribed.voiceSessionId,
      finalText: "打开星盘插件",
    });
    assert.equal(committed.ok, true);
  } finally {
    harness.cleanup();
  }
}

async function testDisabledProviderFailsBeforeAudioPersistence() {
  const harness = createHarness({
    asrProvider: {
      status() {
        return { enabled: false, configured: false, backend: "disabled", hasUrl: false };
      },
      transcribeAudio() {
        throw new Error("should not run");
      },
    },
  });
  try {
    assert.equal(harness.service.status({ actorId: "owner", workspaceId: "owner" }).enabled, false);
    await assert.rejects(() => harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
    }), {
      status: 503,
      code: "voice_input_asr_unavailable",
    });
    assert.equal(fs.existsSync(path.join(harness.tempDir, "tmp", "voice-input")), false);
  } finally {
    harness.cleanup();
  }
}

async function testValidationRejectsUnsafeAudio() {
  const harness = createHarness();
  try {
    await assert.rejects(() => harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "text/plain",
    }), /voice audio mime type is not supported/);
  } finally {
    harness.cleanup();
  }
}

async function run() {
  await testTranscribeDeletesTemporaryAudioAndReturnsEditableText();
  await testCommitLearnsOnlyShortCorrectionPair();
  await testCommitRequiresSameActorAndWorkspace();
  await testDisabledProviderFailsBeforeAudioPersistence();
  await testValidationRejectsUnsafeAudio();
  console.log("voice input service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
