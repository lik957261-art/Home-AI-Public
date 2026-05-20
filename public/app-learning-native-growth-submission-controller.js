"use strict";

function learningNativeGrowthSubmissionStats(text) {
  const value = String(text || "").trim();
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  };
}

function nativeGrowthRequirementText(form, stats = null) {
  const minWords = Number(form?.dataset?.minWords || 0) || 0;
  const minChars = Number(form?.dataset?.minChars || 0) || 0;
  if (window.HermesLearningGrowthTaskUi?.submissionRequirementLabel) {
    return window.HermesLearningGrowthTaskUi.submissionRequirementLabel({ minWords, minChars }, stats);
  }
  if (!stats) return `\u81f3\u5c11 ${minWords} \u4e2a\u82f1\u6587\u8bcd / ${minChars} \u4e2a\u6709\u6548\u5b57\u7b26`;
  const missingWords = Math.max(0, minWords - Number(stats.words || 0));
  const missingChars = Math.max(0, minChars - Number(stats.chars || 0));
  if (!missingWords && !missingChars) return `\u5df2\u8fbe\u6807\uff1a\u5f53\u524d ${stats.words} \u8bcd / ${stats.chars} \u5b57\u7b26\u3002`;
  return `\u672a\u8fbe\u6807\uff1a\u8fd8\u5dee ${missingWords} \u4e2a\u82f1\u6587\u8bcd / ${missingChars} \u4e2a\u6709\u6548\u5b57\u7b26\uff1b\u5f53\u524d ${stats.words} \u8bcd / ${stats.chars} \u5b57\u7b26\u3002`;
}

function updateNativeGrowthSubmissionCount(form) {
  if (!form) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  const count = form.querySelector("[data-learning-native-growth-submission-count]");
  if (!input || !count) return;
  const stats = learningNativeGrowthSubmissionStats(input.value);
  const minWords = Number(form.dataset.minWords || 0) || 0;
  const minChars = Number(form.dataset.minChars || 0) || 0;
  const ready = (!minWords || stats.words >= minWords) && (!minChars || stats.chars >= minChars);
  count.textContent = nativeGrowthRequirementText(form, stats);
  count.classList.toggle("is-ready", ready);
  count.classList.toggle("is-short", !ready);
}

async function submitNativeGrowthTask(event, taskCardId) {
  event?.preventDefault?.();
  const form = event?.target;
  if (!form || !taskCardId) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  const stateNode = form.querySelector("[data-learning-native-growth-submission-state]");
  const button = form.querySelector("[data-learning-submit-native-growth]");
  const requiresAudio = form.dataset.requiresAudio === "1";
  const text = String(input?.value || "").trim();
  let body = null;
  let submittedFile = null;
  state.learningNativeGrowthSubmissionSubmitting = state.learningNativeGrowthSubmissionSubmitting || {};
  if (state.learningNativeGrowthSubmissionSubmitting[taskCardId]) {
    if (stateNode) stateNode.textContent = requiresAudio ? "\u5f55\u97f3\u6b63\u5728\u63d0\u4ea4\u548c\u8f6c\u5199\u4e2d\uff0c\u8bf7\u7a0d\u7b49\u3002" : "\u4f5c\u7b54\u6b63\u5728\u63d0\u4ea4\u4e2d\uff0c\u8bf7\u7a0d\u7b49\u3002";
    return;
  }
  if (requiresAudio) {
    const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
    if (!recording.file) {
      if (stateNode) stateNode.textContent = "\u8bf7\u5148\u5f55\u5236\u82f1\u8bed\u590d\u8ff0\uff0c\u518d\u63d0\u4ea4\u7ed9 AI \u6279\u6539\u3002";
      showPushToast("\u8bf7\u5148\u5f55\u5236\u82f1\u8bed\u590d\u8ff0", "error");
      return;
    }
    submittedFile = recording.file;
    body = { recording };
  } else {
    updateNativeGrowthSubmissionCount(form);
    const stats = learningNativeGrowthSubmissionStats(text);
    const minWords = Number(form.dataset.minWords || 0) || 0;
    const minChars = Number(form.dataset.minChars || 0) || 0;
    if ((!text) || (minWords && stats.words < minWords) || (minChars && stats.chars < minChars)) {
      if (stateNode) stateNode.textContent = nativeGrowthRequirementText(form, stats);
      showPushToast("\u4f5c\u7b54\u957f\u5ea6\u8fd8\u4e0d\u591f\uff0c\u5148\u8865\u5230\u8981\u6c42\u518d\u63d0\u4ea4\u3002", "error");
      return;
    }
    body = Object.assign(learningLearnerBody(), { text });
  }
  state.learningNativeGrowthSubmissionSubmitting[taskCardId] = true;
  if (button) button.disabled = true;
  if (stateNode) stateNode.textContent = requiresAudio ? "\u5f55\u97f3\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u8f6c\u5199\u5e76\u7b49\u5f85 AI \u6279\u6539..." : "\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u7b49\u5f85 AI \u6279\u6539\u548c\u751f\u6210\u53cd\u9988...";
  try {
    if (requiresAudio && submittedFile) {
      body = Object.assign(learningLearnerBody(), {
        filename: submittedFile.name || `growth-retell-${taskCardId}.webm`,
        type: submittedFile.type || body.recording?.mimeType || "audio/webm",
        dataBase64: await fileToBase64(submittedFile),
        durationMs: body.recording?.elapsedMs || 0,
      });
    }
    const response = await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/growth-submission`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth task submission failed");
    const latest = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
    if (submittedFile && latest?.file === submittedFile) {
      if (latest.url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(latest.url);
      delete state.learningNativeGrowthSubmissionRecorders[taskCardId];
    }
    if (stateNode) stateNode.textContent = response.evaluation?.status === "reflection_required"
      ? "AI \u6279\u6539\u5b8c\u6210\uff0c\u4e0b\u4e00\u6b65\u9700\u8981\u5f55\u97f3\u590d\u76d8\u3002"
      : "AI \u6279\u6539\u5b8c\u6210\uff0c\u9875\u9762\u6b63\u5728\u5237\u65b0\u3002";
    showPushToast("AI \u6279\u6539\u5df2\u5b8c\u6210", "success");
    await loadLearningCoins({ limit: 30 });
  } catch (err) {
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
    if (button) button.disabled = false;
  }
}
