"use strict";

const TTS_PROFILE_MODEL_ESM_PATH = "/vite-islands/tts-profile-model/tts-profile-model.js";
const TTS_PROFILE_SAMPLE_TEXT = "这是一段为高保真音乐演示准备的旁白。请保持声音沉稳，语速适中，停顿自然。";
let ttsProfileModel = null;
let ttsProfileModelPromise = null;

function importTtsProfileModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (ttsProfileModel) return Promise.resolve(ttsProfileModel);
  if (!ttsProfileModelPromise) {
    const importer = typeof rootRef.__homeAiImportTtsProfileModel === "function"
      ? rootRef.__homeAiImportTtsProfileModel
      : (path) => import(path);
    ttsProfileModelPromise = Promise.resolve()
      .then(() => importer(TTS_PROFILE_MODEL_ESM_PATH))
      .then((model) => {
        ttsProfileModel = model || null;
        return ttsProfileModel;
      })
      .catch((error) => {
        ttsProfileModelPromise = null;
        throw error;
      });
  }
  return ttsProfileModelPromise;
}

function currentTtsProfileModel() {
  return ttsProfileModel;
}

if (typeof window !== "undefined") {
  importTtsProfileModel().catch(() => null);
}

function ensureTtsProfileState() {
  if (!state.ttsProfiles) state.ttsProfiles = [];
  return state;
}

function ttsProfileWorkspaceId() {
  return currentTtsProfileModel()?.ttsProfileWorkspaceIdPlan?.({
    selectedWorkspaceId: state.selectedWorkspaceId,
    authWorkspaceId: state.auth?.workspaceId,
    defaultWorkspaceId: "owner", // fallback-governance:tts-profile-existing-classic-owner-default
  }) || state.selectedWorkspaceId || state.auth?.workspaceId || "owner"; // fallback-governance:tts-profile-existing-classic-owner-default
}

function classicTtsProfileFormatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function ttsProfileFormatBytes(bytes) {
  return currentTtsProfileModel()?.formatTtsProfileBytes?.(bytes) || classicTtsProfileFormatBytes(bytes);
}

function classicTtsProfileFormatDuration(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ttsProfileFormatDuration(ms) {
  return currentTtsProfileModel()?.formatTtsProfileDuration?.(ms) || classicTtsProfileFormatDuration(ms);
}

function classicTtsProfilePromptPreview(text) {
  return String(text || "").replace(/<\|endofprompt\|>/g, "").trim();
}

function ttsProfilePromptPreview(text) {
  return currentTtsProfileModel()?.previewTtsProfilePrompt?.(text) || classicTtsProfilePromptPreview(text);
}

function ttsProfileListRequestPlan() {
  const workspaceId = ttsProfileWorkspaceId();
  return currentTtsProfileModel()?.ttsProfileListRequestPlan?.({ workspaceId }) || {
    method: "GET",
    path: `/api/v1/home-ai/tts/profiles?workspaceId=${encodeURIComponent(workspaceId)}`,
    workspaceId,
  };
}

function ttsProfileSaveValidationPlan(input = {}) {
  const modelPlan = currentTtsProfileModel()?.ttsProfileSaveValidationPlan?.(input);
  if (modelPlan) return modelPlan;
  if (!input.label) return { ok: false, statusText: "请填写 Profile 名称。" };
  if (!input.promptText) return { ok: false, statusText: "请填写与录音一致的逐字稿。" };
  if (!input.hasAudio) return { ok: false, statusText: "请先录音或上传 wav。" };
  return { ok: true, progressText: "正在保存 TTS Profile", successText: "TTS Profile 已保存" };
}

function ttsProfileSaveRequestPlan(input = {}) {
  const modelPlan = currentTtsProfileModel()?.ttsProfileSaveRequestPlan?.(input);
  if (modelPlan) return modelPlan;
  return {
    path: "/api/v1/home-ai/tts/profiles",
    options: {
      method: "POST",
      timeoutMs: 60000,
      body: {
        workspaceId: input.workspaceId,
        label: input.label,
        profile_id: input.profileId,
        prompt_text: input.promptText,
        audio_base64: input.audioBase64,
        set_default: Boolean(input.setDefault),
      },
    },
  };
}

function ttsProfileDefaultRequestPlan(profileId) {
  const workspaceId = ttsProfileWorkspaceId();
  return currentTtsProfileModel()?.ttsProfileDefaultRequestPlan?.({ workspaceId, profileId }) || {
    ok: Boolean(profileId),
    path: profileId ? `/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/default` : "",
    options: { method: "POST", body: { workspaceId } },
    successText: "默认 TTS Profile 已更新",
  };
}

function ttsProfileDeleteRequestPlan(profileId) {
  const workspaceId = ttsProfileWorkspaceId();
  return currentTtsProfileModel()?.ttsProfileDeleteRequestPlan?.({ workspaceId, profileId }) || {
    ok: Boolean(profileId),
    path: profileId ? `/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/delete` : "",
    options: { method: "POST", body: { workspaceId } },
    successText: "TTS Profile 已删除",
  };
}

function ttsProfileFileSelectionPlan(file) {
  return currentTtsProfileModel()?.ttsProfileFileSelectionPlan?.({
    name: file?.name,
    type: file?.type,
    size: file?.size,
  }) || {
    ok: /\.wav$/i.test(file?.name || "") || String(file?.type || "").includes("wav"),
    statusText: /\.wav$/i.test(file?.name || "") || String(file?.type || "").includes("wav")
      ? "已选择 wav 文件"
      : "请上传 wav 文件。",
    name: file?.name || "tts-profile-upload.wav",
    durationMs: 0,
  };
}

function ttsProfileCaptureDraft(overlay = $("ttsProfileOverlay")) {
  if (!overlay) return;
  const label = overlay.querySelector("#ttsProfileLabel");
  const profileId = overlay.querySelector("#ttsProfileId");
  const promptText = overlay.querySelector("#ttsProfilePromptText");
  const setDefault = overlay.querySelector("#ttsProfileSetDefault");
  if (label) state.ttsProfileDraftLabel = label.value || "";
  if (profileId) state.ttsProfileDraftId = profileId.value || "";
  if (promptText) state.ttsProfileDraftPromptText = promptText.value || "";
  if (setDefault) state.ttsProfileDraftSetDefault = Boolean(setDefault.checked);
}

function ttsProfileClearDraftForm() {
  state.ttsProfileDraftLabel = "";
  state.ttsProfileDraftId = "";
  state.ttsProfileDraftPromptText = "";
  state.ttsProfileDraftSetDefault = true;
}

function ttsProfileRevokeDraftAudio() {
  if (state.ttsProfileDraftAudio?.url) {
    try { URL.revokeObjectURL(state.ttsProfileDraftAudio.url); } catch (_) {}
  }
  state.ttsProfileDraftAudio = null;
}

function ttsProfileSetDraftAudio(blob, name = "tts-profile-prompt.wav", durationMs = 0) {
  ttsProfileRevokeDraftAudio();
  state.ttsProfileDraftAudio = {
    blob,
    name,
    durationMs: Math.max(0, Number(durationMs) || 0),
    size: Number(blob?.size || 0),
    url: URL.createObjectURL(blob),
  };
}

function ttsProfileBytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, input.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function ttsProfileMergeFloatChunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function ttsProfileEncodeWav(samples, sampleRate) {
  const input = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const channels = 1;
  const bytesPerSample = 2;
  const dataBytes = input.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let index = 0; index < input.length; index += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function ttsProfileBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

function closeTtsProfileManager() {
  state.ttsProfileManagerOpen = false;
  state.ttsProfilesError = "";
  state.ttsProfileStatus = "";
  ttsProfileClearDraftForm();
  ttsProfileStopRecording({ keepAudio: false }).catch(() => {});
  ttsProfileRevokeDraftAudio();
  renderTtsProfileManager();
}

async function openTtsProfileManager() {
  ensureTtsProfileState();
  state.ttsProfileManagerOpen = true;
  state.ttsProfilesError = "";
  state.ttsProfileStatus = "";
  renderTtsProfileManager();
  await loadTtsProfiles();
}

async function loadTtsProfiles() {
  state.ttsProfilesLoading = true;
  state.ttsProfilesError = "";
  renderTtsProfileManager();
  try {
    const requestPlan = ttsProfileListRequestPlan();
    const payload = await api(requestPlan.path);
    state.ttsProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  } catch (err) {
    state.ttsProfilesError = err?.message || "TTS Profile 读取失败";
  } finally {
    state.ttsProfilesLoading = false;
    renderTtsProfileManager();
  }
}

async function ttsProfileStartRecording() {
  ttsProfileCaptureDraft();
  if (state.ttsProfileRecorder?.recording) return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextCtor) {
    state.ttsProfileStatus = "当前浏览器不支持录制 WAV，请上传一段 wav 文件。";
    renderTtsProfileManager();
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  const chunks = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(gain);
  gain.connect(audioContext.destination);
  state.ttsProfileRecorder = {
    recording: true,
    stream,
    audioContext,
    source,
    processor,
    gain,
    chunks,
    sampleRate: audioContext.sampleRate || 48000,
    startedAt: Date.now(),
  };
  state.ttsProfileStatus = "正在录制 prompt 音频";
  renderTtsProfileManager();
}

async function ttsProfileStopRecording(options = {}) {
  ttsProfileCaptureDraft();
  const recorder = state.ttsProfileRecorder;
  if (!recorder) return;
  state.ttsProfileRecorder = null;
  try { recorder.source?.disconnect?.(); } catch (_) {}
  try { recorder.processor?.disconnect?.(); } catch (_) {}
  try { recorder.gain?.disconnect?.(); } catch (_) {}
  try { recorder.stream?.getTracks?.().forEach((track) => track.stop()); } catch (_) {}
  try { await recorder.audioContext?.close?.(); } catch (_) {}
  if (options.keepAudio === false || !recorder.chunks?.length) {
    state.ttsProfileStatus = options.keepAudio === false ? "" : "没有形成有效录音";
    renderTtsProfileManager();
    return;
  }
  const samples = ttsProfileMergeFloatChunks(recorder.chunks);
  const blob = ttsProfileEncodeWav(samples, recorder.sampleRate || 48000);
  ttsProfileSetDraftAudio(blob, "tts-profile-recording.wav", Date.now() - Number(recorder.startedAt || Date.now()));
  state.ttsProfileStatus = "录音已准备，可以保存为 Profile";
  renderTtsProfileManager();
}

function ttsProfileWireOverlay(overlay) {
  overlay.querySelector("[data-close-tts-profiles]")?.addEventListener("click", closeTtsProfileManager);
  overlay.querySelector("[data-reload-tts-profiles]")?.addEventListener("click", () => loadTtsProfiles().catch(showError));
  overlay.querySelector("[data-start-tts-profile-recording]")?.addEventListener("click", () => ttsProfileStartRecording().catch(showError));
  overlay.querySelector("[data-stop-tts-profile-recording]")?.addEventListener("click", () => ttsProfileStopRecording({ keepAudio: true }).catch(showError));
  overlay.querySelector("[data-clear-tts-profile-audio]")?.addEventListener("click", () => {
    ttsProfileCaptureDraft(overlay);
    ttsProfileRevokeDraftAudio();
    state.ttsProfileStatus = "";
    renderTtsProfileManager();
  });
  overlay.querySelector("[data-tts-profile-file]")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    ttsProfileCaptureDraft(overlay);
    const plan = ttsProfileFileSelectionPlan(file);
    if (!plan.ok) {
      state.ttsProfileStatus = plan.statusText || "请上传 wav 文件。";
      renderTtsProfileManager();
      return;
    }
    ttsProfileSetDraftAudio(file, plan.name || file.name || "tts-profile-upload.wav", plan.durationMs || 0);
    state.ttsProfileStatus = plan.statusText || "已选择 wav 文件";
    renderTtsProfileManager();
  });
  overlay.querySelector("[data-save-tts-profile]")?.addEventListener("click", () => saveTtsProfileFromOverlay(overlay).catch(showError));
  overlay.querySelectorAll("[data-set-default-tts-profile]").forEach((button) => {
    button.addEventListener("click", () => setDefaultTtsProfile(button.dataset.setDefaultTtsProfile || "").catch(showError));
  });
  overlay.querySelectorAll("[data-delete-tts-profile]").forEach((button) => {
    button.addEventListener("click", () => deleteTtsProfile(button.dataset.deleteTtsProfile || "").catch(showError));
  });
}

async function saveTtsProfileFromOverlay(overlay) {
  ttsProfileCaptureDraft(overlay);
  const label = String(overlay.querySelector("#ttsProfileLabel")?.value || "").trim();
  const profileId = String(overlay.querySelector("#ttsProfileId")?.value || "").trim();
  const promptText = String(overlay.querySelector("#ttsProfilePromptText")?.value || "").trim();
  const setDefault = Boolean(overlay.querySelector("#ttsProfileSetDefault")?.checked);
  const audio = state.ttsProfileDraftAudio;
  const validation = ttsProfileSaveValidationPlan({
    label,
    promptText,
    hasAudio: Boolean(audio?.blob),
  });
  if (!validation.ok) {
    state.ttsProfileStatus = validation.statusText || "";
    renderTtsProfileManager();
    return;
  }
  state.ttsProfileSaving = true;
  state.ttsProfileStatus = validation.progressText || "正在保存 TTS Profile";
  renderTtsProfileManager();
  try {
    const audioBase64 = await ttsProfileBlobToDataUrl(audio.blob);
    const workspaceId = ttsProfileWorkspaceId();
    const requestPlan = ttsProfileSaveRequestPlan({
      workspaceId,
      label,
      profileId,
      promptText,
      audioBase64,
      setDefault,
    });
    await api(requestPlan.path, {
      ...requestPlan.options,
      body: JSON.stringify(requestPlan.options?.body || {}),
    });
    ttsProfileRevokeDraftAudio();
    ttsProfileClearDraftForm();
    overlay.querySelector("#ttsProfileLabel")?.setAttribute("value", "");
    if (overlay.querySelector("#ttsProfileLabel")) overlay.querySelector("#ttsProfileLabel").value = "";
    if (overlay.querySelector("#ttsProfileId")) overlay.querySelector("#ttsProfileId").value = "";
    if (overlay.querySelector("#ttsProfilePromptText")) overlay.querySelector("#ttsProfilePromptText").value = "";
    if (overlay.querySelector("#ttsProfileSetDefault")) overlay.querySelector("#ttsProfileSetDefault").checked = true;
    state.ttsProfileStatus = validation.successText || "TTS Profile 已保存";
    await loadTtsProfiles();
  } finally {
    state.ttsProfileSaving = false;
    renderTtsProfileManager();
  }
}

async function setDefaultTtsProfile(profileId) {
  const requestPlan = ttsProfileDefaultRequestPlan(profileId);
  if (!requestPlan.ok) return;
  await api(requestPlan.path, {
    ...requestPlan.options,
    body: JSON.stringify(requestPlan.options?.body || {}),
  });
  state.ttsProfileStatus = requestPlan.successText || "默认 TTS Profile 已更新";
  await loadTtsProfiles();
}

async function deleteTtsProfile(profileId) {
  const requestPlan = ttsProfileDeleteRequestPlan(profileId);
  if (!requestPlan.ok) return;
  await api(requestPlan.path, {
    ...requestPlan.options,
    body: JSON.stringify(requestPlan.options?.body || {}),
  });
  state.ttsProfileStatus = requestPlan.successText || "TTS Profile 已删除";
  await loadTtsProfiles();
}

function renderTtsProfileRowPlan(row = {}) {
  return `<article class="tts-profile-row">
      <div class="tts-profile-row-main">
        <div class="tts-profile-row-title">${escapeHtml(row.title || row.profileId || "")}</div>
        <div class="tts-profile-row-meta">${escapeHtml(row.metaPrimary || "")}</div>
        <div class="tts-profile-row-meta">${escapeHtml(row.metaSecondary || "")}</div>
        ${row.preview ? `<div class="tts-profile-preview">${escapeHtml(row.preview)}</div>` : ""}
      </div>
      <div class="tts-profile-row-actions">
        ${row.isDefault ? `<span class="tts-profile-default">${escapeHtml(row.defaultLabel || "默认")}</span>` : `<button type="button" data-set-default-tts-profile="${escapeHtml(row.profileId || "")}">${escapeHtml(row.setDefaultLabel || "设为默认")}</button>`}
        <button type="button" data-delete-tts-profile="${escapeHtml(row.profileId || "")}">${escapeHtml(row.deleteLabel || "删除")}</button>
      </div>
    </article>`;
}

function renderTtsProfileRows() {
  const modelPlan = currentTtsProfileModel()?.ttsProfileRowsViewPlan?.({
    loading: state.ttsProfilesLoading,
    error: state.ttsProfilesError,
    profiles: Array.isArray(state.ttsProfiles) ? state.ttsProfiles : [],
  }, { formatTime: typeof formatTime === "function" ? formatTime : (value) => value });
  if (modelPlan) {
    if (modelPlan.state === "loading") return `<div class="tts-profile-empty">${escapeHtml(modelPlan.statusText || "正在读取 TTS Profile...")}</div>`;
    if (modelPlan.state === "error") return `<div class="tts-profile-empty error">${escapeHtml(modelPlan.statusText || "")}</div>`;
    if (modelPlan.state === "empty") return `<div class="tts-profile-empty">${escapeHtml(modelPlan.statusText || "还没有 TTS Profile。录一段 15-25 秒的旁白 prompt 后保存。")}</div>`;
    return (modelPlan.rows || []).map(renderTtsProfileRowPlan).join("");
  }
  if (state.ttsProfilesLoading) return `<div class="tts-profile-empty">正在读取 TTS Profile...</div>`;
  if (state.ttsProfilesError) return `<div class="tts-profile-empty error">${escapeHtml(state.ttsProfilesError)}</div>`;
  const profiles = Array.isArray(state.ttsProfiles) ? state.ttsProfiles : [];
  if (!profiles.length) return `<div class="tts-profile-empty">还没有 TTS Profile。录一段 15-25 秒的旁白 prompt 后保存。</div>`;
  return profiles.map((profile) => {
    const updated = profile.updated_at ? formatTime(profile.updated_at) : "";
    const preview = ttsProfilePromptPreview(profile.prompt_text || "");
    return `<article class="tts-profile-row">
      <div class="tts-profile-row-main">
        <div class="tts-profile-row-title">${escapeHtml(profile.label || profile.profile_id || "")}</div>
        <div class="tts-profile-row-meta">${escapeHtml(profile.profile_id || "")}${updated ? ` · ${escapeHtml(updated)}` : ""}</div>
        <div class="tts-profile-row-meta">${escapeHtml(profile.mode || "zero_shot")} · ${escapeHtml(ttsProfileFormatBytes(profile.prompt_audio_bytes || 0))}</div>
        ${preview ? `<div class="tts-profile-preview">${escapeHtml(preview)}</div>` : ""}
      </div>
      <div class="tts-profile-row-actions">
        ${profile.is_default ? `<span class="tts-profile-default">默认</span>` : `<button type="button" data-set-default-tts-profile="${escapeHtml(profile.profile_id || "")}">设为默认</button>`}
        <button type="button" data-delete-tts-profile="${escapeHtml(profile.profile_id || "")}">删除</button>
      </div>
    </article>`;
  }).join("");
}

function renderTtsProfileManager() {
  const overlay = $("ttsProfileOverlay");
  if (!overlay) return;
  if (state.ttsProfileManagerOpen && overlay.innerHTML) ttsProfileCaptureDraft(overlay);
  overlay.classList.toggle("hidden", !state.ttsProfileManagerOpen);
  if (!state.ttsProfileManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const recorder = state.ttsProfileRecorder;
  const audio = state.ttsProfileDraftAudio;
  const viewPlan = currentTtsProfileModel()?.ttsProfileManagerViewPlan?.({
    recorder,
    audio,
    saving: state.ttsProfileSaving,
    status: state.ttsProfileStatus,
    draftSetDefault: state.ttsProfileDraftSetDefault,
  });
  const recording = viewPlan ? viewPlan.recording : Boolean(recorder?.recording);
  const audioMeta = viewPlan?.audioMeta?.text || (audio
    ? `${audio.name || "prompt.wav"} · ${ttsProfileFormatBytes(audio.size)}${audio.durationMs ? ` · ${ttsProfileFormatDuration(audio.durationMs)}` : ""}`
    : "未选择音频");
  const startRecordingDisabled = viewPlan ? viewPlan.startRecordingDisabled : recording;
  const startRecordingLabel = viewPlan?.startRecordingLabel || (recording ? "录制中" : "开始录音");
  const stopRecordingDisabled = viewPlan ? viewPlan.stopRecordingDisabled : !recording;
  const clearAudioDisabled = viewPlan ? viewPlan.clearAudioDisabled : !audio;
  const saveDisabled = viewPlan ? viewPlan.saveDisabled : Boolean(state.ttsProfileSaving);
  const saveLabel = viewPlan?.saveLabel || (state.ttsProfileSaving ? "保存中" : "保存 Profile");
  const setDefaultChecked = viewPlan ? viewPlan.setDefaultChecked : state.ttsProfileDraftSetDefault !== false;
  const statusText = viewPlan?.statusText || state.ttsProfileStatus || "";
  overlay.innerHTML = `
    <div class="access-key-sheet tts-profile-sheet">
      <header class="access-key-header">
        <div>
          <div id="ttsProfileTitle" class="access-key-title">TTS Profile</div>
          <div class="access-key-subtitle">为当前工作区保存 CosyVoice prompt 音色；Music 旁白可以直接引用默认 Profile。</div>
        </div>
        <button class="access-key-close" type="button" data-close-tts-profiles>完成</button>
      </header>
      <section class="tts-profile-create">
        <div class="tts-profile-create-head">
          <div>
            <div class="access-key-row-title">新建 Profile</div>
            <div class="access-key-row-meta">建议录制 15-25 秒，语速稳定，环境安静。逐字稿必须和录音一致。</div>
          </div>
          <button type="button" data-reload-tts-profiles>刷新</button>
        </div>
        <div class="tts-profile-grid">
          <label>
            <span>名称</span>
            <input id="ttsProfileLabel" type="text" autocomplete="off" value="${escapeHtml(state.ttsProfileDraftLabel || "")}" placeholder="纪录片旁白">
          </label>
          <label>
            <span>Profile ID</span>
            <input id="ttsProfileId" type="text" autocomplete="off" value="${escapeHtml(state.ttsProfileDraftId || "")}" placeholder="zh_hifi_documentary_host_v1">
          </label>
        </div>
        <label class="tts-profile-field">
          <span>逐字稿</span>
          <textarea id="ttsProfilePromptText" rows="4" placeholder="${escapeHtml(TTS_PROFILE_SAMPLE_TEXT)}">${escapeHtml(state.ttsProfileDraftPromptText || "")}</textarea>
        </label>
        <div class="tts-profile-audio-panel">
          <div class="tts-profile-audio-meta">${escapeHtml(audioMeta)}</div>
          ${audio?.url ? `<audio controls src="${escapeHtml(audio.url)}"></audio>` : ""}
          <div class="tts-profile-actions">
            <button type="button" data-start-tts-profile-recording${startRecordingDisabled ? " disabled" : ""}>${escapeHtml(startRecordingLabel)}</button>
            <button type="button" data-stop-tts-profile-recording${stopRecordingDisabled ? " disabled" : ""}>停止</button>
            <label class="tts-profile-file-button">
              <span>上传 WAV</span>
              <input data-tts-profile-file type="file" accept="audio/wav,.wav">
            </label>
            <button type="button" data-clear-tts-profile-audio${clearAudioDisabled ? " disabled" : ""}>清除音频</button>
          </div>
        </div>
        <label class="tts-profile-default-toggle">
          <input id="ttsProfileSetDefault" type="checkbox"${setDefaultChecked ? " checked" : ""}>
          <span>设为当前工作区默认 HiFi 旁白音色</span>
        </label>
        <div class="tts-profile-save-row">
          <button class="primary-small" type="button" data-save-tts-profile${saveDisabled ? " disabled" : ""}>${escapeHtml(saveLabel)}</button>
          ${statusText ? `<span class="tts-profile-status">${escapeHtml(statusText)}</span>` : ""}
        </div>
      </section>
      <section class="tts-profile-list">
        <div class="access-key-row-title">当前 Profile</div>
        ${renderTtsProfileRows()}
      </section>
    </div>`;
  ttsProfileWireOverlay(overlay);
}
