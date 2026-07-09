const VOICE_LEARNING_MODEL_VERSION = "20260705-vite-voice-learning-model-v1";

function numericThreshold(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function thresholdsPlan(thresholds = {}) {
  return {
    phraseThreshold: numericThreshold(thresholds.phraseActiveSupportCount, 2),
    correctionThreshold: numericThreshold(thresholds.correctionAutoApplySupportCount, 3),
  };
}

function voiceLearningStatusLabel(entry, thresholds = {}) {
  const support = Math.max(0, Number(entry?.supportCount || 0) || 0);
  const { phraseThreshold } = thresholdsPlan(thresholds);
  if (entry?.status === "active") return `已应用 · ${support}/${phraseThreshold}`;
  if (entry?.status === "disabled") return `已停用 · ${support}/${phraseThreshold}`;
  return `建议中 · ${support}/${phraseThreshold}`;
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

function voiceLearningRecordedKeywordRowsPlan(result = {}) {
  const recorded = Array.isArray(result?.recorded) ? result.recorded : [];
  const thresholds = result?.thresholds || {};
  return recorded.map((entry) => ({
    term: String(entry?.term || ""),
    statusLabel: voiceLearningStatusLabel(entry, thresholds),
  }));
}

function voiceLearningAssistantViewPlan(result = {}) {
  const rows = voiceLearningRecordedKeywordRowsPlan(result);
  const { phraseThreshold, correctionThreshold } = thresholdsPlan(result?.thresholds || {});
  return {
    title: "学习完成",
    thresholdText: `本次抽取 ${rows.length} 个关键词。关键词激活阈值 ${phraseThreshold} 次；纠错自动应用阈值 ${correctionThreshold} 次。`,
    emptyText: "这段内容没有抽取到安全关键词。",
    rows,
  };
}

function voiceLearningComparisonRowsPlan(result = {}) {
  const rows = Array.isArray(result?.comparison) ? result.comparison : [];
  const selectedBackend = String(result?.backend || "");
  return rows.map((row) => {
    const backend = String(row?.backend || "");
    const ok = row?.status === "ok";
    const selected = Boolean(selectedBackend && backend === selectedBackend);
    const corrections = row?.corrections || {};
    const appliedCount = (Array.isArray(corrections.applied) ? corrections.applied.length : 0)
      + (Array.isArray(corrections.phrasebookApplied) ? corrections.phrasebookApplied.length : 0);
    const suggestionCount = Array.isArray(corrections.suggestions) ? corrections.suggestions.length : 0;
    const meta = ok
      ? `${Math.max(0, Number(row?.elapsedMs || 0) || 0)}ms · 修正 ${appliedCount} · 候选 ${suggestionCount}`
      : `${String(row?.status || "unavailable")} · ${String(row?.error || "不可用")}`;
    return {
      backend,
      engineLabel: voiceLearningEngineLabel(backend),
      selected,
      ok,
      meta: `${meta}${selected ? " · 已插入" : ""}`,
      text: ok ? String(row?.text || "") : "未返回可用文本",
    };
  });
}

function voiceLearningComparisonViewPlan(result = {}) {
  const rows = voiceLearningComparisonRowsPlan(result);
  return {
    visible: rows.length > 0,
    title: "语音转写对比",
    description: "已把默认后端结果插入下方输入框。你可以修改后 Send，只训练语音学习，不进入模型。",
    rows,
  };
}

function voiceLearningLearnRequestPlan(input = {}) {
  const text = String(input.text || "").trim();
  if (!text) {
    return {
      ok: false,
      reason: "empty_text",
    };
  }
  return {
    ok: true,
    path: "/api/voice-input/learn-sent-text",
    method: "POST",
    timeoutMs: 15000,
    body: {
      text,
      workspaceId: String(input.workspaceId || ""),
      surfaceType: String(input.surfaceType || ""),
      pluginId: String(input.pluginId || ""),
      threadId: String(input.threadId || ""),
      language: String(input.language || ""),
      receiptMode: String(input.receiptMode || "phrasebook"),
    },
  };
}

function voiceLearningModeEntriesPlan(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    role: entry?.role === "user" ? "user" : "assistant",
    text: String(entry?.text || ""),
    html: String(entry?.html || ""),
  }));
}

export {
  VOICE_LEARNING_MODEL_VERSION,
  thresholdsPlan,
  voiceLearningAssistantViewPlan,
  voiceLearningComparisonRowsPlan,
  voiceLearningComparisonViewPlan,
  voiceLearningEngineLabel,
  voiceLearningLearnRequestPlan,
  voiceLearningModeEntriesPlan,
  voiceLearningRecordedKeywordRowsPlan,
  voiceLearningStatusLabel,
};
