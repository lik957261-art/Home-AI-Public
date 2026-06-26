"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createCosyVoiceCommandProvider, createHomeAiTtsService, normalizeSynthesizeInput } = require("../adapters/home-ai-tts-service");
const { HOME_AI_TTS_PROMPT_END_MARKER } = require("../adapters/home-ai-tts-profile-service");

async function withTempDir(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "home-ai-tts-service-test-"));
  try {
    await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function fakeProvider() {
  const calls = [];
  return {
    calls,
    async synthesize(input) {
      calls.push(input);
      await fsp.writeFile(input.outputPath, Buffer.from(`RIFF fake wav ${input.text}`));
      return { provider: "fake_tts", durationSeconds: 1.25 };
    },
  };
}

function fakeWav(label = "prompt") {
  const payload = Buffer.from(`fake wav ${label}`);
  const buffer = Buffer.alloc(44 + payload.length);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(payload.length, 40);
  payload.copy(buffer, 44);
  return buffer;
}

(async () => {
  assert.equal(normalizeSynthesizeInput({ text: " hi " }).voice, "zh_hifi_host");
  assert.equal(normalizeSynthesizeInput({ text: " hi ", target_loudness_lufs: 0 }).targetLoudnessLufs, -10);
  assert.throws(() => normalizeSynthesizeInput({ text: "" }), /tts_text_required/);
  assert.throws(() => normalizeSynthesizeInput({ text: "x", format: "exe" }), /tts_format_not_supported/);

  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const service = createHomeAiTtsService({
      dataDir: dir,
      provider,
      now: () => new Date("2026-06-22T10:00:00.000Z"),
    });
    const first = await service.synthesize({
      text: "下一首主要听空间定位和中高频耐听度。",
      voice: "zh_hifi_host",
      language: "zh-CN",
      format: "wav",
      target_loudness_lufs: -18,
      purpose: "music_demo_narration",
      metadata: { plugin_id: "music", demo_id: "demo_1", track_index: 2 },
    });
    assert.equal(first.ok, true);
    assert.match(first.asset_id, /^tts_[a-f0-9]{24}$/);
    assert.equal(first.mime_type, "audio/wav");
    assert.equal(first.status, "ready");
    assert.equal(first.duration_seconds, 1.25);
    assert.equal(fs.existsSync(first.local_path), true);
    assert.equal(fs.existsSync(first.roon_watched_path), true);
    assert.equal(provider.calls.length, 1);

    const cached = await service.synthesize({
      text: "下一首主要听空间定位和中高频耐听度。",
      voice: "zh_hifi_host",
      language: "zh-CN",
      format: "wav",
      target_loudness_lufs: -18,
      purpose: "music_demo_narration",
      metadata: { plugin_id: "music", demo_id: "demo_1", track_index: 2 },
    });
    assert.equal(cached.asset_id, first.asset_id);
    assert.equal(cached.cached, true);
    assert.equal(provider.calls.length, 1);

    const listed = service.listAssets({ plugin_id: "music", demo_id: "demo_1" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].asset_id, first.asset_id);

    const batch = await service.synthesizeDemoPlan({
      demo_id: "demo_2",
      tracks: [
        { index: 1, intro_script: "第一首先听人声结像。", listen_points: ["人声", "空间"], recommended_volume: "50%" },
        { index: 2, intro_script: "" },
      ],
    });
    assert.equal(batch.ok, true);
    assert.equal(batch.assets.length, 2);
    assert.deepEqual(batch.narrations, batch.assets);
    assert.equal(batch.assets[0].status, "ready");
    assert.equal(batch.assets[1].status, "skipped");

    const deleted = await service.deleteAsset(first.asset_id);
    assert.equal(deleted.deleted, true);
    assert.equal(fs.existsSync(first.local_path), false);
    assert.equal(fs.existsSync(first.roon_watched_path), false);
    service.close();
  });

  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const service = createHomeAiTtsService({
      dataDir: dir,
      provider,
      now: () => new Date("2026-06-23T06:00:00.000Z"),
    });
    const profile = await service.createProfile({
      workspace_id: "owner",
      profile_id: "zh_hifi_documentary_host_v1",
      label: "Documentary Host",
      prompt_text: "这是一段高保真音乐演示旁白。",
      audio_base64: fakeWav("one").toString("base64"),
      set_default: true,
    });
    assert.equal(profile.profile_id, "zh_hifi_documentary_host_v1");
    assert.equal(profile.is_default, true);
    assert.equal(profile.prompt_text.endsWith(HOME_AI_TTS_PROMPT_END_MARKER), true);
    assert.equal(service.listProfiles({ workspace_id: "owner" }).length, 1);

    const first = await service.synthesize({
      text: "下一首先听空间定位。",
      voice: "zh_hifi_host",
      language: "zh-CN",
      format: "wav",
      purpose: "music_demo_narration",
      metadata: { workspace_id: "owner", plugin_id: "music" },
    });
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].ttsProfile.profile_id, "zh_hifi_documentary_host_v1");
    assert.equal(provider.calls[0].ttsProfile.promptText.endsWith(HOME_AI_TTS_PROMPT_END_MARKER), true);
    assert.equal(first.metadata.tts_profile_id, "zh_hifi_documentary_host_v1");

    await service.createProfile({
      workspace_id: "owner",
      profile_id: "zh_hifi_documentary_host_v1",
      label: "Documentary Host",
      prompt_text: "这是一段更新后的高保真音乐演示旁白。",
      audio_base64: fakeWav("two").toString("base64"),
      set_default: true,
    });
    const second = await service.synthesize({
      text: "下一首先听空间定位。",
      voice: "zh_hifi_host",
      language: "zh-CN",
      format: "wav",
      purpose: "music_demo_narration",
      metadata: { workspace_id: "owner", plugin_id: "music" },
    });
    assert.notEqual(second.asset_id, first.asset_id);
    assert.equal(provider.calls.length, 2);

    const deleted = await service.deleteProfile({ workspace_id: "owner", profile_id: "zh_hifi_documentary_host_v1" });
    assert.equal(deleted.deleted, true);
    assert.equal(service.listProfiles({ workspace_id: "owner" }).length, 0);
    service.close();
  });

  await withTempDir(async (dir) => {
    const bridge = path.join(dir, "fake-cosyvoice-bridge.js");
    await fsp.writeFile(bridge, `
const fs = require("node:fs");
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => raw += chunk);
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  fs.writeFileSync(output, Buffer.from("RIFF cosyvoice " + payload.text));
  process.stdout.write("cosyvoice noisy log\\n");
  process.stdout.write(JSON.stringify({ ok: true, provider: "cosyvoice:test", duration_seconds: 2.5 }));
});
`, "utf8");
    const service = createHomeAiTtsService({
      dataDir: dir,
      provider: createCosyVoiceCommandProvider({
        python: process.execPath,
        script: bridge,
        cacheDir: path.join(dir, "cache"),
        modelDir: path.join(dir, "model"),
        promptAudio: path.join(dir, "prompt.wav"),
        promptText: "示例提示音频文本。",
        mode: "zero_shot",
      }),
    });
    const asset = await service.synthesize({
      text: "下一首听 Chinese vocal 与 piano 的结像。",
      voice: "zh_hifi_host",
      language: "zh-CN",
      format: "wav",
      purpose: "music_demo_narration",
      metadata: { plugin_id: "music", demo_id: "cosyvoice_test", track_index: 1 },
    });
    assert.equal(asset.provider, "cosyvoice:test");
    assert.equal(asset.duration_seconds, 2.5);
    assert.equal(fs.existsSync(asset.local_path), true);
    service.close();
  });

  console.log("home-ai-tts-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
