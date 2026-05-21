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

function collectStructuredNativeGrowthAnswers(form) {
  const blocks = Array.from(form?.querySelectorAll?.("[data-learning-native-growth-question]") || []);
  if (!blocks.length) return null;
  const answers = [];
  for (const block of blocks) {
    const questionId = String(block.dataset.learningNativeGrowthQuestion || "").trim();
    const type = String(block.dataset.questionType || "").trim();
    const title = String(block.dataset.questionTitle || questionId).trim();
    if (type === "multiple_choice") {
      const selected = block.querySelector("[data-learning-native-growth-question-choice]:checked");
      const reason = String(block.querySelector("[data-learning-native-growth-question-reason]")?.value || "").trim();
      if (!selected) return { ok: false, error: `${title} \u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u9009\u9879\u3002` };
      if (!reason) return { ok: false, error: `${title} \u8bf7\u8865\u4e00\u53e5\u7b80\u77ed\u7406\u7531\u3002` };
      answers.push({ questionId, type, title, choice: String(selected.value || "").trim(), reason });
    } else {
      const response = String(block.querySelector("[data-learning-native-growth-question-response]")?.value || "").trim();
      if (!response) return { ok: false, error: `${title} \u8bf7\u5199\u51fa\u63a8\u7406\u8fc7\u7a0b\u3002` };
      answers.push({ questionId, type: "written", title, response });
    }
  }
  const text = answers.map((answer, index) => {
    const heading = `${index + 1}. ${answer.title || answer.questionId}`;
    if (answer.type === "multiple_choice") {
      return `${heading}\n\u9009\u62e9\uff1a${answer.choice}\n\u7406\u7531\uff1a${answer.reason}`;
    }
    return `${heading}\n\u63a8\u7406\uff1a${answer.response}`;
  }).join("\n\n");
  return { ok: true, answers, text };
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
    const structured = collectStructuredNativeGrowthAnswers(form);
    if (structured) {
      if (!structured.ok) {
        if (stateNode) stateNode.textContent = structured.error;
        showPushToast(structured.error, "error");
        return;
      }
      body = Object.assign(learningLearnerBody(), {
        text: structured.text,
        structuredAnswers: structured.answers,
      });
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

async function submitNativeGrowthReflection(event, taskCardId) {
  event?.preventDefault?.();
  const form = event?.target;
  if (!form || !taskCardId) return;
  const stateNode = form.querySelector("[data-learning-native-growth-reflection-state]");
  const button = form.querySelector("[data-learning-submit-native-growth-reflection]");
  const recording = state.learningNativeGrowthSubmissionRecorders?.[taskCardId] || {};
  if (!recording.file) {
    if (stateNode) stateNode.textContent = "\u8bf7\u5148\u5f55\u5236\u8bed\u97f3\u590d\u76d8\uff0c\u518d\u63d0\u4ea4\u7ed3\u7b97\u3002";
    showPushToast("\u8bf7\u5148\u5f55\u5236\u8bed\u97f3\u590d\u76d8", "error");
    return;
  }
  const submittedFile = recording.file;
  if (button) button.disabled = true;
  if (stateNode) stateNode.textContent = "\u5f55\u97f3\u590d\u76d8\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u8f6c\u5199\u5e76\u7ed3\u7b97...";
  try {
    const body = Object.assign(learningLearnerBody(), {
      filename: submittedFile.name || `growth-reflection-${taskCardId}.webm`,
      type: submittedFile.type || recording.mimeType || "audio/webm",
      dataBase64: await fileToBase64(submittedFile),
      durationMs: recording.elapsedMs || 0,
    });
    const response = await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/growth-reflection`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth reflection submission failed");
    const latest = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
    if (latest?.file === submittedFile) {
      if (latest.url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(latest.url);
      delete state.learningNativeGrowthSubmissionRecorders[taskCardId];
    }
    if (stateNode) stateNode.textContent = "\u8bed\u97f3\u590d\u76d8\u5df2\u5b8c\u6210\uff0c\u9875\u9762\u6b63\u5728\u5237\u65b0\u3002";
    showPushToast("\u8bed\u97f3\u590d\u76d8\u5df2\u5b8c\u6210", "success");
    await loadLearningCoins({ limit: 30 });
  } catch (err) {
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    if (button) button.disabled = false;
  }
}
