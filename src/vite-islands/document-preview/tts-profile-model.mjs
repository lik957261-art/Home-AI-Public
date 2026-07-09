const TTS_PROFILE_MODEL_VERSION = "20260705-vite-tts-profile-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function cleanId(value) {
  return cleanString(value, 240);
}

function formatTtsProfileBytes(bytes) {
  const value = Math.max(0, Number(bytes || 0));
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatTtsProfileDuration(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function previewTtsProfilePrompt(text) {
  return String(text || "").replace(/<\|endofprompt\|>/g, "").trim();
}

function ttsProfileWorkspaceIdPlan(input = {}) {
  const defaultWorkspaceId = "owner"; // fallback-governance:tts-profile-existing-classic-owner-default
  return cleanId(input.selectedWorkspaceId || input.authWorkspaceId || input.defaultWorkspaceId || defaultWorkspaceId) || defaultWorkspaceId;
}

function ttsProfileListRequestPlan(input = {}) {
  const workspaceId = ttsProfileWorkspaceIdPlan(input);
  return Object.freeze({
    method: "GET",
    path: `/api/v1/home-ai/tts/profiles?workspaceId=${encodeURIComponent(workspaceId)}`,
    workspaceId,
  });
}

function ttsProfileSaveValidationPlan(input = {}) {
  if (!cleanString(input.label, 240)) {
    return Object.freeze({ ok: false, statusText: "请填写 Profile 名称。" });
  }
  if (!cleanString(input.promptText, 12000)) {
    return Object.freeze({ ok: false, statusText: "请填写与录音一致的逐字稿。" });
  }
  if (!input.hasAudio) {
    return Object.freeze({ ok: false, statusText: "请先录音或上传 wav。" });
  }
  return Object.freeze({
    ok: true,
    progressText: "正在保存 TTS Profile",
    successText: "TTS Profile 已保存",
  });
}

function ttsProfileSaveRequestPlan(input = {}) {
  const workspaceId = ttsProfileWorkspaceIdPlan(input);
  return Object.freeze({
    path: "/api/v1/home-ai/tts/profiles",
    options: Object.freeze({
      method: "POST",
      timeoutMs: 60000,
      body: Object.freeze({
        workspaceId,
        label: cleanString(input.label, 240),
        profile_id: cleanId(input.profileId),
        prompt_text: cleanString(input.promptText, 12000),
        audio_base64: String(input.audioBase64 || ""),
        set_default: Boolean(input.setDefault),
      }),
    }),
  });
}

function ttsProfileDefaultRequestPlan(input = {}) {
  const workspaceId = ttsProfileWorkspaceIdPlan(input);
  const profileId = cleanId(input.profileId);
  return Object.freeze({
    ok: Boolean(profileId),
    path: profileId ? `/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/default` : "",
    options: Object.freeze({
      method: "POST",
      body: Object.freeze({ workspaceId }),
    }),
    successText: "默认 TTS Profile 已更新",
  });
}

function ttsProfileDeleteRequestPlan(input = {}) {
  const workspaceId = ttsProfileWorkspaceIdPlan(input);
  const profileId = cleanId(input.profileId);
  return Object.freeze({
    ok: Boolean(profileId),
    path: profileId ? `/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/delete` : "",
    options: Object.freeze({
      method: "POST",
      body: Object.freeze({ workspaceId }),
    }),
    successText: "TTS Profile 已删除",
  });
}

function ttsProfileFileSelectionPlan(input = {}) {
  const name = cleanString(input.name || "tts-profile-upload.wav", 500) || "tts-profile-upload.wav";
  const type = cleanString(input.type, 240).toLowerCase();
  const wav = /\.wav$/i.test(name) || type.includes("wav");
  if (!wav) {
    return Object.freeze({
      ok: false,
      statusText: "请上传 wav 文件。",
      name,
      durationMs: 0,
    });
  }
  return Object.freeze({
    ok: true,
    statusText: "已选择 wav 文件",
    name,
    durationMs: 0,
  });
}

function ttsProfileRowPlan(profile = {}, helpers = {}) {
  const updatedAt = profile.updated_at || "";
  const updated = updatedAt && typeof helpers.formatTime === "function"
    ? cleanString(helpers.formatTime(updatedAt), 240)
    : cleanString(updatedAt, 240);
  const profileId = cleanId(profile.profile_id);
  const mode = cleanString(profile.mode || "zero_shot", 120);
  const bytes = formatTtsProfileBytes(profile.prompt_audio_bytes || 0);
  return Object.freeze({
    profileId,
    title: cleanString(profile.label || profileId || "", 240),
    metaPrimary: `${profileId}${updated ? ` · ${updated}` : ""}`,
    metaSecondary: `${mode} · ${bytes}`,
    preview: previewTtsProfilePrompt(profile.prompt_text || ""),
    isDefault: Boolean(profile.is_default),
    defaultLabel: "默认",
    setDefaultLabel: "设为默认",
    deleteLabel: "删除",
  });
}

function ttsProfileRowsViewPlan(input = {}, helpers = {}) {
  if (input.loading) {
    return Object.freeze({ state: "loading", statusText: "正在读取 TTS Profile...", rows: Object.freeze([]) });
  }
  if (input.error) {
    return Object.freeze({ state: "error", statusText: cleanString(input.error, 1000), rows: Object.freeze([]) });
  }
  const profiles = Array.isArray(input.profiles) ? input.profiles : [];
  const rows = profiles.map((profile) => ttsProfileRowPlan(profile, helpers));
  if (!rows.length) {
    return Object.freeze({
      state: "empty",
      statusText: "还没有 TTS Profile。录一段 15-25 秒的旁白 prompt 后保存。",
      rows: Object.freeze([]),
    });
  }
  return Object.freeze({ state: "ready", rows: Object.freeze(rows) });
}

function ttsProfileAudioMetaPlan(input = {}) {
  if (!input.audio) return Object.freeze({ text: "未选择音频", hasAudio: false, durationVisible: false });
  const name = cleanString(input.audio.name || "prompt.wav", 500) || "prompt.wav";
  const size = formatTtsProfileBytes(input.audio.size);
  const durationMs = Math.max(0, Number(input.audio.durationMs) || 0);
  return Object.freeze({
    text: durationMs ? `${name} · ${size} · ${formatTtsProfileDuration(durationMs)}` : `${name} · ${size}`,
    hasAudio: true,
    durationVisible: Boolean(durationMs),
  });
}

function ttsProfileManagerViewPlan(input = {}) {
  const recorder = input.recorder || {};
  const recording = Boolean(recorder.recording);
  const audioMeta = ttsProfileAudioMetaPlan({ audio: input.audio });
  return Object.freeze({
    recording,
    audioMeta,
    startRecordingDisabled: recording,
    startRecordingLabel: recording ? "录制中" : "开始录音",
    stopRecordingDisabled: !recording,
    clearAudioDisabled: !audioMeta.hasAudio,
    saveDisabled: Boolean(input.saving),
    saveLabel: input.saving ? "保存中" : "保存 Profile",
    setDefaultChecked: input.draftSetDefault !== false,
    statusText: cleanString(input.status, 1000),
  });
}

export {
  TTS_PROFILE_MODEL_VERSION,
  cleanString,
  formatTtsProfileBytes,
  formatTtsProfileDuration,
  previewTtsProfilePrompt,
  ttsProfileWorkspaceIdPlan,
  ttsProfileListRequestPlan,
  ttsProfileSaveValidationPlan,
  ttsProfileSaveRequestPlan,
  ttsProfileDefaultRequestPlan,
  ttsProfileDeleteRequestPlan,
  ttsProfileFileSelectionPlan,
  ttsProfileRowPlan,
  ttsProfileRowsViewPlan,
  ttsProfileAudioMetaPlan,
  ttsProfileManagerViewPlan,
};
