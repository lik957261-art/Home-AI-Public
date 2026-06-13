"use strict";

const voiceLearningState = {
  active: false,
  entries: [],
};

function voiceLearningStatusLabel(entry, thresholds = {}) {
  const support = Number(entry?.supportCount || 0);
  const phraseThreshold = Number(thresholds.phraseActiveSupportCount || 2);
  if (entry?.status === "active") return `已应用 · ${support}/${phraseThreshold}`;
  if (entry?.status === "disabled") return `已停用 · ${support}/${phraseThreshold}`;
  return `建议中 · ${support}/${phraseThreshold}`;
}

function voiceLearningAssistantHtml(result) {
  const recorded = Array.isArray(result?.recorded) ? result.recorded : [];
  const thresholds = result?.thresholds || {};
  const phraseThreshold = Number(thresholds.phraseActiveSupportCount || 2);
  const correctionThreshold = Number(thresholds.correctionAutoApplySupportCount || 3);
  const rows = recorded.map((entry) => `
    <li class="voice-learning-keyword-row">
      <span class="voice-learning-keyword">${escapeHtml(entry.term || "")}</span>
      <span class="voice-learning-keyword-meta">${escapeHtml(voiceLearningStatusLabel(entry, thresholds))}</span>
    </li>
  `).join("");
  return `
    <div class="voice-learning-reply">
      <div class="voice-learning-reply-title">学习完成</div>
      <div class="voice-learning-thresholds">本次抽取 ${recorded.length} 个关键词。关键词激活阈值 ${phraseThreshold} 次；纠错自动应用阈值 ${correctionThreshold} 次。</div>
      ${rows ? `<ul class="voice-learning-keyword-list">${rows}</ul>` : '<div class="voice-learning-empty">这段内容没有抽取到安全关键词。</div>'}
    </div>
  `;
}

function voiceLearningEngineLabel(backend) {
  const labels = {
    "whisper-large-v3-turbo": "Whisper",
    "whisper-local": "Whisper",
    "funasr-local": "FunASR",
    "sensevoice-local": "SenseVoice",
  };
  return labels[String(backend || "")] || String(backend || "ASR");
}

function voiceLearningComparisonHtml(result) {
  const rows = Array.isArray(result?.comparison) ? result.comparison : [];
  if (!rows.length) return "";
  const selectedBackend = String(result?.backend || "");
  const rowHtml = rows.map((row) => {
    const ok = row?.status === "ok";
    const selected = selectedBackend && row?.backend === selectedBackend;
    const corrections = row?.corrections || {};
    const appliedCount = (corrections.applied || []).length + (corrections.phrasebookApplied || []).length;
    const suggestionCount = (corrections.suggestions || []).length;
    const meta = ok
      ? `${Math.max(0, Number(row.elapsedMs || 0) || 0)}ms · 修正 ${appliedCount} · 候选 ${suggestionCount}`
      : `${escapeHtml(row?.status || "unavailable")} · ${escapeHtml(row?.error || "不可用")}`;
    return `
      <li class="voice-learning-asr-row${selected ? " voice-learning-asr-row-selected" : ""}">
        <div class="voice-learning-asr-row-head">
          <span class="voice-learning-asr-engine">${escapeHtml(voiceLearningEngineLabel(row?.backend))}</span>
          <span class="voice-learning-asr-meta">${meta}${selected ? " · 已插入" : ""}</span>
        </div>
        <div class="voice-learning-asr-text">${ok ? escapeHtml(row.text || "") : "未返回可用文本"}</div>
      </li>
    `;
  }).join("");
  return `
    <div class="voice-learning-reply voice-learning-asr-reply">
      <div class="voice-learning-reply-title">语音转写对比</div>
      <div class="voice-learning-thresholds">已把默认后端结果插入下方输入框。你可以修改后 Send，只训练语音学习，不进入模型。</div>
      <ul class="voice-learning-asr-list">${rowHtml}</ul>
    </div>
  `;
}

function voiceLearningHandleTranscribeResult(result) {
  if (!voiceLearningModeActive()) return;
  const html = voiceLearningComparisonHtml(result);
  if (!html) return;
  voiceLearningState.entries.push({ role: "assistant", html });
  renderVoiceLearningConversation();
}

function renderVoiceLearningConversation() {
  const conversation = $("conversation");
  if (!conversation) return;
  const entries = voiceLearningState.entries.map((entry) => {
    if (entry.role === "user") {
      return `<article class="message user-message voice-learning-message"><div class="message-content">${escapeHtml(entry.text || "")}</div></article>`;
    }
    return `<article class="message assistant-message voice-learning-message"><div class="message-content">${entry.html || ""}</div></article>`;
  }).join("");
  conversation.innerHTML = `
    <section class="voice-learning-mode-banner">
      <div>
        <strong>语音学习模式</strong>
        <span>这里的输入只训练语音关键词，不发送给模型。</span>
      </div>
      <button id="voiceLearningExit" class="secondary-small" type="button">退出</button>
    </section>
    ${entries || '<div class="empty-state">在下方输入要学习的内容，Send 后服务器会返回抽取结果。</div>'}
  `;
  $("voiceLearningExit")?.addEventListener("click", closeVoiceLearningMode);
  scheduleConversationBottomStick();
}

function openVoiceLearningPanel() {
  voiceLearningState.active = true;
  voiceLearningState.entries = [];
  clearQuotedReply({ render: false });
  setComposerText("");
  renderVoiceLearningConversation();
  updateComposerAction();
  setTimeout(() => $("messageInput")?.focus(), 50);
}

function closeVoiceLearningMode() {
  voiceLearningState.active = false;
  voiceLearningState.entries = [];
  renderCurrentThread({ stickToBottom: true });
  updateComposerAction();
}

function voiceLearningModeActive() {
  return Boolean(voiceLearningState.active);
}

async function handleVoiceLearningComposerSend(text) {
  const finalText = String(text || "").trim();
  if (!finalText) return;
  const button = $("sendMessage");
  if (button) button.disabled = true;
  setComposerText("");
  voiceLearningState.entries.push({ role: "user", text: finalText });
  voiceLearningState.entries.push({ role: "assistant", html: '<div class="voice-learning-thresholds">正在学习，不会进入模型。</div>' });
  renderVoiceLearningConversation();
  try {
    const result = await api("/api/voice-input/learn-sent-text", {
      method: "POST",
      body: JSON.stringify({
        text: finalText,
        workspaceId: state.selectedWorkspaceId,
        surfaceType: "",
        pluginId: "",
        threadId: "",
        language: "",
        receiptMode: "phrasebook",
      }),
      timeoutMs: 15000,
    });
    voiceLearningState.entries[voiceLearningState.entries.length - 1] = {
      role: "assistant",
      html: voiceLearningAssistantHtml(result),
    };
    renderVoiceLearningConversation();
  } catch (err) {
    voiceLearningState.entries[voiceLearningState.entries.length - 1] = {
      role: "assistant",
      html: `<div class="voice-learning-error">${escapeHtml(err?.message || String(err))}</div>`,
    };
    renderVoiceLearningConversation();
  } finally {
    if (button) button.disabled = false;
    updateComposerAction();
  }
}

function initializeVoiceLearningUi() {}
