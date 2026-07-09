"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/document-preview/tts-profile-model.mjs");
const source = fs.readFileSync(modelPath, "utf8");

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
  const model = await import(`file://${modelPath}`);

  await test("tts profile model stays browser-boundary free", () => {
    assert.equal(model.TTS_PROFILE_MODEL_VERSION, "20260705-vite-tts-profile-model-v1");
    assert.doesNotMatch(source, /(?:^|[^\w-])window(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /(?:^|[^\w-])document(?:[^\w-]|$)/);
    assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bnavigator\b|\bspeechSynthesis\b|\bAudioContext\b|\bwebkitAudioContext\b/);
    assert.doesNotMatch(source, /\bFileReader\b|\bBlob\b|createObjectURL|revokeObjectURL|\bbtoa\b/);
  });

  await test("formatting and prompt preview plans preserve classic labels", () => {
    assert.equal(model.formatTtsProfileBytes(0), "0 B");
    assert.equal(model.formatTtsProfileBytes(1024), "1 KB");
    assert.equal(model.formatTtsProfileBytes(1536), "2 KB");
    assert.equal(model.formatTtsProfileBytes(1024 * 1024 * 1.25), "1.3 MB");
    assert.equal(model.formatTtsProfileDuration(0), "0:00");
    assert.equal(model.formatTtsProfileDuration(65000), "1:05");
    assert.equal(model.previewTtsProfilePrompt("hello<|endofprompt|>"), "hello");
  });

  await test("workspace and request plans stay data-only", () => {
    assert.equal(model.ttsProfileWorkspaceIdPlan({ selectedWorkspaceId: "child", authWorkspaceId: "owner" }), "child");
    assert.equal(model.ttsProfileWorkspaceIdPlan({ authWorkspaceId: "owner" }), "owner");
    assert.equal(model.ttsProfileWorkspaceIdPlan({}), "owner");

    assert.deepEqual(model.ttsProfileListRequestPlan({ workspaceId: "owner" }), {
      method: "GET",
      path: "/api/v1/home-ai/tts/profiles?workspaceId=owner",
      workspaceId: "owner",
    });

    const save = model.ttsProfileSaveRequestPlan({
      workspaceId: "owner",
      label: "Documentary Host",
      profileId: "voice_1",
      promptText: "prompt text",
      audioBase64: "data:audio/wav;base64,abc",
      setDefault: true,
    });
    assert.equal(save.path, "/api/v1/home-ai/tts/profiles");
    assert.equal(save.options.method, "POST");
    assert.equal(save.options.timeoutMs, 60000);
    assert.deepEqual(save.options.body, {
      workspaceId: "owner",
      label: "Documentary Host",
      profile_id: "voice_1",
      prompt_text: "prompt text",
      audio_base64: "data:audio/wav;base64,abc",
      set_default: true,
    });

    assert.deepEqual(model.ttsProfileDefaultRequestPlan({ workspaceId: "owner", profileId: "voice 1" }), {
      ok: true,
      path: "/api/v1/home-ai/tts/profiles/voice%201/default",
      options: { method: "POST", body: { workspaceId: "owner" } },
      successText: "默认 TTS Profile 已更新",
    });
    assert.deepEqual(model.ttsProfileDeleteRequestPlan({ workspaceId: "owner", profileId: "voice 1" }), {
      ok: true,
      path: "/api/v1/home-ai/tts/profiles/voice%201/delete",
      options: { method: "POST", body: { workspaceId: "owner" } },
      successText: "TTS Profile 已删除",
    });
  });

  await test("validation and file selection plans match existing UI states", () => {
    assert.deepEqual(model.ttsProfileSaveValidationPlan({ label: "", promptText: "p", hasAudio: true }), {
      ok: false,
      statusText: "请填写 Profile 名称。",
    });
    assert.deepEqual(model.ttsProfileSaveValidationPlan({ label: "l", promptText: "", hasAudio: true }), {
      ok: false,
      statusText: "请填写与录音一致的逐字稿。",
    });
    assert.deepEqual(model.ttsProfileSaveValidationPlan({ label: "l", promptText: "p", hasAudio: false }), {
      ok: false,
      statusText: "请先录音或上传 wav。",
    });
    assert.equal(model.ttsProfileSaveValidationPlan({ label: "l", promptText: "p", hasAudio: true }).ok, true);
    assert.deepEqual(model.ttsProfileFileSelectionPlan({ name: "voice.mp3", type: "audio/mpeg" }), {
      ok: false,
      statusText: "请上传 wav 文件。",
      name: "voice.mp3",
      durationMs: 0,
    });
    assert.equal(model.ttsProfileFileSelectionPlan({ name: "voice.wav", type: "audio/wav" }).ok, true);
  });

  await test("row and manager view plans return escaped-data-free view state", () => {
    const rows = model.ttsProfileRowsViewPlan({
      profiles: [{
        profile_id: "voice_1",
        label: "Documentary",
        mode: "zero_shot",
        prompt_audio_bytes: 2048,
        prompt_text: "Prompt<|endofprompt|>",
        updated_at: "2026-07-05T00:00:00Z",
        is_default: true,
      }],
    }, {
      formatTime: () => "today",
    });
    assert.equal(rows.state, "ready");
    assert.equal(rows.rows[0].metaPrimary, "voice_1 · today");
    assert.equal(rows.rows[0].metaSecondary, "zero_shot · 2 KB");
    assert.equal(rows.rows[0].preview, "Prompt");
    assert.equal(rows.rows[0].isDefault, true);

    const manager = model.ttsProfileManagerViewPlan({
      recorder: { recording: true },
      audio: { name: "prompt.wav", size: 4096, durationMs: 65000 },
      saving: true,
      status: "正在保存 TTS Profile",
      draftSetDefault: false,
    });
    assert.equal(manager.recording, true);
    assert.equal(manager.audioMeta.text, "prompt.wav · 4 KB · 1:05");
    assert.equal(manager.startRecordingLabel, "录制中");
    assert.equal(manager.stopRecordingDisabled, false);
    assert.equal(manager.saveLabel, "保存中");
    assert.equal(manager.setDefaultChecked, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
