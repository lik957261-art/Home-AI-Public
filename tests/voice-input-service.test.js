"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVoiceInputCorrectionService } = require("../adapters/voice-input-correction-service");
const { createVoiceInputService, likelyNoSpeechTranscript } = require("../adapters/voice-input-service");

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

async function testLikelyNoSpeechTranscriptIsRejected() {
  const harness = createHarness({
    transcript: "点点点点点点点点点点点点点点点点点点点点点点请按订阅，订阅，转发，打赏支持明镜与点点栏目",
  });
  try {
    assert.equal(likelyNoSpeechTranscript("吴萍。", 900), false);
    assert.equal(likelyNoSpeechTranscript("点点点点点点点点点点点点", 500), true);
    await assert.rejects(() => harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 500,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    }), /没有检测到有效语音/);
    assert.equal(harness.runtimeState.voiceInput.audit[0].event, "transcribe_rejected");
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

function testLearnSentTextStoresOnlyPhrasebookAndAuditMetadata() {
  const harness = createHarness();
  try {
    const learned = harness.service.learnSentText({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      pluginId: "codex-mobile",
      threadId: "thread_1",
      text: "今天用 Home AI 处理 Codex Mobile handoff。",
    });
    assert.equal(learned.ok, true);
    assert.equal(learned.recorded.some((entry) => entry.term === "Home AI"), true);
    assert.equal(learned.thresholds.phraseActiveSupportCount, 2);
    assert.equal(learned.thresholds.correctionAutoApplySupportCount, 3);
    assert.equal(harness.runtimeState.voiceInput.audit[0].event, "sent_text");
    assert.equal(harness.runtimeState.voiceInput.audit[0].recordedCount, learned.recorded.length);
    const stateJson = JSON.stringify(harness.runtimeState);
    assert.equal(stateJson.includes("今天用 Home AI 处理 Codex Mobile handoff。"), false);
    assert.equal(harness.service.status({ actorId: "owner", workspaceId: "owner" }).phrasebookCount > 0, true);
  } finally {
    harness.cleanup();
  }
}

async function testPhrasebookAppliesSystemSeedAliasesDuringTranscribe() {
  const harness = createHarness({ transcript: "打开 home ai 和 mcp" });
  try {
    harness.correctionService.seedSystemPhrasebook({ actorId: "owner", workspaceId: "owner", surfaceType: "chat" });
    const result = await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    assert.equal(result.text, "打开 Home AI 和 MCP");
    assert.equal(result.corrections.phrasebookApplied.length >= 2, true);
  } finally {
    harness.cleanup();
  }
}

async function testActivePhrasebookIsSentAsAsrPromptHint() {
  const harness = createHarness({ transcript: "吴萍" });
  try {
    harness.service.learnSentText({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      text: "吴萍",
    });
    harness.service.learnSentText({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      text: "吴萍",
    });
    await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    assert.match(harness.providerCalls[0].initialPrompt, /吴萍/);
    assert.match(harness.providerCalls[0].initialPrompt, /优先按这些词转写/);
  } finally {
    harness.cleanup();
  }
}

async function testComparisonTranscribeReturnsCorrectedEngineRows() {
  const harness = createHarness({
    asrProvider: {
      status() {
        return {
          enabled: true,
          configured: true,
          backend: "whisper-large-v3-turbo",
          hasUrl: true,
          comparison: [
            { backend: "whisper-large-v3-turbo", configured: true },
            { backend: "funasr-local", configured: true },
            { backend: "sensevoice-local", configured: true },
          ],
        };
      },
      transcribeAudio() {
        throw new Error("single backend should not be used for comparison");
      },
      transcribeAudioWithComparison(input) {
        harness.providerCalls.push(input);
        assert.equal(fs.existsSync(input.audioPath), true);
        return Promise.resolve({
          ok: true,
          results: [
            { status: "ok", backend: "whisper-large-v3-turbo", text: "无凭", language: "zh", elapsedMs: 15 },
            { status: "ok", backend: "funasr-local", text: "吴萍", language: "zh", elapsedMs: 18 },
            { status: "error", backend: "sensevoice-local", error: "backend_failed", elapsedMs: 20 },
          ],
        });
      },
    },
  });
  try {
    harness.service.learnSentText({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      text: "吴萍",
    });
    harness.service.learnSentText({
      actorId: "owner",
      workspaceId: "owner",
      surfaceType: "chat",
      text: "吴萍",
    });
    const result = await harness.service.transcribe({
      actorId: "owner",
      workspaceId: "owner",
      audioBase64: audioBase64(),
      comparison: true,
      durationMs: 1000,
      mimeType: "audio/webm",
      surfaceType: "chat",
      threadId: "thread_1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.backend, "whisper-large-v3-turbo");
    assert.equal(result.text, "吴萍");
    assert.equal(result.comparison.length, 3);
    assert.equal(result.comparison[0].text, "吴萍");
    assert.equal(result.comparison[0].rawText, "无凭");
    assert.equal(result.comparison[1].text, "吴萍");
    assert.equal(result.comparison[2].status, "error");
    assert.equal(result.comparison[2].text, "");
    assert.equal(harness.runtimeState.voiceInput.audit[0].event, "transcribe_comparison");
    assert.equal(harness.runtimeState.voiceInput.audit[0].comparisonCount, 3);
    assert.equal(JSON.stringify(harness.runtimeState).includes("无凭"), false);
  } finally {
    harness.cleanup();
  }
}

async function run() {
  await testTranscribeDeletesTemporaryAudioAndReturnsEditableText();
  await testLikelyNoSpeechTranscriptIsRejected();
  await testCommitLearnsOnlyShortCorrectionPair();
  await testCommitRequiresSameActorAndWorkspace();
  await testDisabledProviderFailsBeforeAudioPersistence();
  await testValidationRejectsUnsafeAudio();
  testLearnSentTextStoresOnlyPhrasebookAndAuditMetadata();
  await testPhrasebookAppliesSystemSeedAliasesDuringTranscribe();
  await testActivePhrasebookIsSentAsAsrPromptHint();
  await testComparisonTranscribeReturnsCorrectedEngineRows();
  console.log("voice input service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
