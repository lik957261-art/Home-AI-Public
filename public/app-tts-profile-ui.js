"use strict";

const TTS_PROFILE_SAMPLE_TEXT = "这是一段为高保真音乐演示准备的旁白。请保持声音沉稳，语速适中，停顿自然。";

function ensureTtsProfileState() {
  if (!state.ttsProfiles) state.ttsProfiles = [];
  return state;
}

function ttsProfileWorkspaceId() {
  return state.selectedWorkspaceId || state.auth?.workspaceId || "owner";
}

function ttsProfileFormatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function ttsProfileFormatDuration(ms) {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ttsProfilePromptPreview(text) {
  return String(text || "").replace(/<\|endofprompt\|>/g, "").trim();
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
    const workspaceId = encodeURIComponent(ttsProfileWorkspaceId());
    const payload = await api(`/api/v1/home-ai/tts/profiles?workspaceId=${workspaceId}`);
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
    const wav = /\.wav$/i.test(file.name || "") || String(file.type || "").includes("wav");
    if (!wav) {
      state.ttsProfileStatus = "请上传 wav 文件。";
      renderTtsProfileManager();
      return;
    }
    ttsProfileSetDraftAudio(file, file.name || "tts-profile-upload.wav", 0);
    state.ttsProfileStatus = "已选择 wav 文件";
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
  if (!label) {
    state.ttsProfileStatus = "请填写 Profile 名称。";
    renderTtsProfileManager();
    return;
  }
  if (!promptText) {
    state.ttsProfileStatus = "请填写与录音一致的逐字稿。";
    renderTtsProfileManager();
    return;
  }
  if (!audio?.blob) {
    state.ttsProfileStatus = "请先录音或上传 wav。";
    renderTtsProfileManager();
    return;
  }
  state.ttsProfileSaving = true;
  state.ttsProfileStatus = "正在保存 TTS Profile";
  renderTtsProfileManager();
  try {
    const audioBase64 = await ttsProfileBlobToDataUrl(audio.blob);
    const workspaceId = ttsProfileWorkspaceId();
    await api("/api/v1/home-ai/tts/profiles", {
      method: "POST",
      timeoutMs: 60000,
      body: JSON.stringify({
        workspaceId,
        label,
        profile_id: profileId,
        prompt_text: promptText,
        audio_base64: audioBase64,
        set_default: setDefault,
      }),
    });
    ttsProfileRevokeDraftAudio();
    ttsProfileClearDraftForm();
    overlay.querySelector("#ttsProfileLabel")?.setAttribute("value", "");
    if (overlay.querySelector("#ttsProfileLabel")) overlay.querySelector("#ttsProfileLabel").value = "";
    if (overlay.querySelector("#ttsProfileId")) overlay.querySelector("#ttsProfileId").value = "";
    if (overlay.querySelector("#ttsProfilePromptText")) overlay.querySelector("#ttsProfilePromptText").value = "";
    if (overlay.querySelector("#ttsProfileSetDefault")) overlay.querySelector("#ttsProfileSetDefault").checked = true;
    state.ttsProfileStatus = "TTS Profile 已保存";
    await loadTtsProfiles();
  } finally {
    state.ttsProfileSaving = false;
    renderTtsProfileManager();
  }
}

async function setDefaultTtsProfile(profileId) {
  if (!profileId) return;
  const workspaceId = ttsProfileWorkspaceId();
  await api(`/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/default`, {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.ttsProfileStatus = "默认 TTS Profile 已更新";
  await loadTtsProfiles();
}

async function deleteTtsProfile(profileId) {
  if (!profileId) return;
  const workspaceId = ttsProfileWorkspaceId();
  await api(`/api/v1/home-ai/tts/profiles/${encodeURIComponent(profileId)}/delete`, {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.ttsProfileStatus = "TTS Profile 已删除";
  await loadTtsProfiles();
}

function renderTtsProfileRows() {
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
  const recording = Boolean(recorder?.recording);
  const audio = state.ttsProfileDraftAudio;
  const audioMeta = audio
    ? `${escapeHtml(audio.name || "prompt.wav")} · ${escapeHtml(ttsProfileFormatBytes(audio.size))}${audio.durationMs ? ` · ${escapeHtml(ttsProfileFormatDuration(audio.durationMs))}` : ""}`
    : "未选择音频";
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
          <div class="tts-profile-audio-meta">${audioMeta}</div>
          ${audio?.url ? `<audio controls src="${escapeHtml(audio.url)}"></audio>` : ""}
          <div class="tts-profile-actions">
            <button type="button" data-start-tts-profile-recording${recording ? " disabled" : ""}>${recording ? "录制中" : "开始录音"}</button>
            <button type="button" data-stop-tts-profile-recording${recording ? "" : " disabled"}>停止</button>
            <label class="tts-profile-file-button">
              <span>上传 WAV</span>
              <input data-tts-profile-file type="file" accept="audio/wav,.wav">
            </label>
            <button type="button" data-clear-tts-profile-audio${audio ? "" : " disabled"}>清除音频</button>
          </div>
        </div>
        <label class="tts-profile-default-toggle">
          <input id="ttsProfileSetDefault" type="checkbox"${state.ttsProfileDraftSetDefault === false ? "" : " checked"}>
          <span>设为当前工作区默认 HiFi 旁白音色</span>
        </label>
        <div class="tts-profile-save-row">
          <button class="primary-small" type="button" data-save-tts-profile${state.ttsProfileSaving ? " disabled" : ""}>${state.ttsProfileSaving ? "保存中" : "保存 Profile"}</button>
          ${state.ttsProfileStatus ? `<span class="tts-profile-status">${escapeHtml(state.ttsProfileStatus)}</span>` : ""}
        </div>
      </section>
      <section class="tts-profile-list">
        <div class="access-key-row-title">当前 Profile</div>
        ${renderTtsProfileRows()}
      </section>
    </div>`;
  ttsProfileWireOverlay(overlay);
}
