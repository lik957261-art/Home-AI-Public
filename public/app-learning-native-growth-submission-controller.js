"use strict";

const LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_ESM_PATH = "/vite-islands/learning-native-growth-submission-model/learning-native-growth-submission-model.js";
let learningNativeGrowthSubmissionModel = null;
let learningNativeGrowthSubmissionModelPromise = null;

function importLearningNativeGrowthSubmissionModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (learningNativeGrowthSubmissionModel) return Promise.resolve(learningNativeGrowthSubmissionModel);
  if (!learningNativeGrowthSubmissionModelPromise) {
    const importer = typeof rootRef.__homeAiImportLearningNativeGrowthSubmissionModel === "function"
      ? rootRef.__homeAiImportLearningNativeGrowthSubmissionModel
      : (path) => import(path);
    learningNativeGrowthSubmissionModelPromise = Promise.resolve()
      .then(() => importer(LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_ESM_PATH))
      .then((model) => {
        learningNativeGrowthSubmissionModel = model || null;
        return learningNativeGrowthSubmissionModel;
      })
      .catch((error) => {
        learningNativeGrowthSubmissionModelPromise = null;
        throw error;
      });
  }
  return learningNativeGrowthSubmissionModelPromise;
}

function currentLearningNativeGrowthSubmissionModel() {
  return learningNativeGrowthSubmissionModel;
}

function learningNativeGrowthSubmissionModelFunction(name) {
  const model = currentLearningNativeGrowthSubmissionModel();
  return model && typeof model[name] === "function" ? model[name] : null;
}

if (typeof window !== "undefined") {
  importLearningNativeGrowthSubmissionModel().catch(() => null);
}

function learningNativeGrowthSubmissionStats(text) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("learningNativeGrowthSubmissionStatsPlan");
  if (modelFn) return modelFn(text);
  const value = String(text || "").trim();
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  };
}

function nativeGrowthDraftStorageId(value) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthDraftStorageIdPlan");
  if (modelFn) return modelFn(value);
  return String(value || "").trim().replace(/[^a-z0-9_-]+/gi, "_").slice(0, 160) || "default";
}

function nativeGrowthDraftWorkspaceId(form) {
  return String(
    form?.dataset?.workspaceId
    || state?.selectedWorkspaceId
    || state?.auth?.workspaceId
    || "owner",
  ).trim() || "owner";
}

function nativeGrowthTextDraftStorageKey(form, taskCardId) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthDraftStorageKeyPlan");
  if (modelFn) return modelFn({ type: "text", workspaceId: nativeGrowthDraftWorkspaceId(form), taskCardId });
  return `hermesNativeGrowthTextDraft:${nativeGrowthDraftStorageId(nativeGrowthDraftWorkspaceId(form))}:${nativeGrowthDraftStorageId(taskCardId)}`;
}

function nativeGrowthStructuredDraftStorageKey(form, taskCardId) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthDraftStorageKeyPlan");
  if (modelFn) return modelFn({ type: "structured", workspaceId: nativeGrowthDraftWorkspaceId(form), taskCardId });
  return `hermesNativeGrowthStructuredDraft:${nativeGrowthDraftStorageId(nativeGrowthDraftWorkspaceId(form))}:${nativeGrowthDraftStorageId(taskCardId)}`;
}

function readNativeGrowthDraft(key) {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (_) {
    return null;
  }
}

function writeNativeGrowthDraft(key, value) {
  if (!key || typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function clearNativeGrowthDraft(key) {
  if (!key || typeof localStorage === "undefined") return;
  localStorage.removeItem(key);
}

function nativeGrowthRequirementText(form, stats = null) {
  const minWords = Number(form?.dataset?.minWords || 0) || 0;
  const minChars = Number(form?.dataset?.minChars || 0) || 0;
  if (window.HermesLearningGrowthTaskUi?.submissionRequirementLabel) {
    return window.HermesLearningGrowthTaskUi.submissionRequirementLabel({ minWords, minChars }, stats);
  }
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthRequirementPlan");
  if (modelFn) return modelFn({ minWords, minChars, stats }).text;
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

function captureStructuredNativeGrowthDraft(form) {
  const blocks = Array.from(form?.querySelectorAll?.("[data-learning-native-growth-question]") || []);
  if (!blocks.length) return null;
  const modelFn = learningNativeGrowthSubmissionModelFunction("structuredNativeGrowthAnswersPlan");
  if (modelFn) {
    const plan = modelFn(blocks.map(nativeGrowthQuestionBlockSnapshot));
    const draftFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthStructuredDraftPlan");
    return draftFn ? draftFn(plan?.draftAnswers || {}, new Date().toISOString()) : { answers: plan?.draftAnswers || {}, updatedAt: new Date().toISOString() };
  }
  const answers = {};
  for (const block of blocks) {
    const questionId = String(block.dataset.learningNativeGrowthQuestion || "").trim();
    const type = String(block.dataset.questionType || "").trim();
    if (!questionId) continue;
    if (type === "multiple_choice") {
      const selected = block.querySelector("[data-learning-native-growth-question-choice]:checked");
      const reason = String(block.querySelector("[data-learning-native-growth-question-reason]")?.value || "");
      answers[questionId] = {
        type,
        choice: String(selected?.value || "").trim(),
        reason,
      };
      continue;
    }
    answers[questionId] = {
      type: "written",
      response: String(block.querySelector("[data-learning-native-growth-question-response]")?.value || ""),
    };
  }
  return { answers, updatedAt: new Date().toISOString() };
}

function applyStructuredNativeGrowthDraft(form, draft) {
  if (!form || !draft?.answers || typeof draft.answers !== "object") return;
  const blocks = Array.from(form.querySelectorAll("[data-learning-native-growth-question]"));
  for (const block of blocks) {
    const questionId = String(block.dataset.learningNativeGrowthQuestion || "").trim();
    const saved = draft.answers[questionId];
    if (!saved) continue;
    if (saved.type === "multiple_choice") {
      block.querySelectorAll("[data-learning-native-growth-question-choice]").forEach((input) => {
        input.checked = String(input.value || "").trim() === String(saved.choice || "").trim();
      });
      const reason = block.querySelector("[data-learning-native-growth-question-reason]");
      if (reason && !String(reason.value || "").trim()) reason.value = String(saved.reason || "");
      continue;
    }
    const response = block.querySelector("[data-learning-native-growth-question-response]");
    if (response && !String(response.value || "").trim()) response.value = String(saved.response || "");
  }
}

function restoreNativeGrowthSubmissionDraft(form, taskCardId) {
  if (!form || !taskCardId) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  if (input) {
    const draft = readNativeGrowthDraft(nativeGrowthTextDraftStorageKey(form, taskCardId));
    if (draft && typeof draft.text === "string" && !String(input.value || "").trim()) input.value = draft.text;
    updateNativeGrowthSubmissionCount(form);
  }
  const blocks = form.querySelectorAll("[data-learning-native-growth-question]");
  if (blocks.length) {
    const draft = readNativeGrowthDraft(nativeGrowthStructuredDraftStorageKey(form, taskCardId));
    applyStructuredNativeGrowthDraft(form, draft);
  }
}

function persistNativeGrowthSubmissionDraft(form, taskCardId) {
  if (!form || !taskCardId) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  if (input) {
    const draftFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthTextDraftPlan");
    writeNativeGrowthDraft(nativeGrowthTextDraftStorageKey(form, taskCardId), draftFn
      ? draftFn(input.value, new Date().toISOString())
      : { text: String(input.value || ""), updatedAt: new Date().toISOString() });
    updateNativeGrowthSubmissionCount(form);
  }
  const blocks = form.querySelectorAll("[data-learning-native-growth-question]");
  if (blocks.length) {
    writeNativeGrowthDraft(
      nativeGrowthStructuredDraftStorageKey(form, taskCardId),
      captureStructuredNativeGrowthDraft(form),
    );
  }
}

function clearNativeGrowthSubmissionDraft(form, taskCardId) {
  if (!taskCardId) return;
  clearNativeGrowthDraft(nativeGrowthTextDraftStorageKey(form, taskCardId));
  clearNativeGrowthDraft(nativeGrowthStructuredDraftStorageKey(form, taskCardId));
}

function clearNativeGrowthAnswerEditing(taskCardId) {
  if (!taskCardId || !state.learningNativeGrowthAnswerEditing) return;
  delete state.learningNativeGrowthAnswerEditing[taskCardId];
}

function collectStructuredNativeGrowthAnswers(form) {
  const blocks = Array.from(form?.querySelectorAll?.("[data-learning-native-growth-question]") || []);
  if (!blocks.length) return null;
  const modelFn = learningNativeGrowthSubmissionModelFunction("structuredNativeGrowthAnswersPlan");
  if (modelFn) return modelFn(blocks.map(nativeGrowthQuestionBlockSnapshot));
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

function nativeGrowthQuestionBlockSnapshot(block) {
  const questionId = String(block?.dataset?.learningNativeGrowthQuestion || "").trim();
  const type = String(block?.dataset?.questionType || "").trim();
  const title = String(block?.dataset?.questionTitle || questionId).trim();
  if (type === "multiple_choice") {
    const selected = block.querySelector("[data-learning-native-growth-question-choice]:checked");
    return {
      questionId,
      type,
      title,
      choice: String(selected?.value || "").trim(),
      reason: String(block.querySelector("[data-learning-native-growth-question-reason]")?.value || ""),
    };
  }
  return {
    questionId,
    type: "written",
    title,
    response: String(block.querySelector("[data-learning-native-growth-question-response]")?.value || ""),
  };
}

const NATIVE_GROWTH_SUBMISSION_SETTLED_STATUSES = new Set([
  "passed",
  "needs_repair",
  "needs_revision",
  "reflection_required",
  "completed",
  "failed",
  "rejected",
]);

const NATIVE_GROWTH_REFLECTION_SETTLED_STATUSES = new Set([
  "accepted",
  "completed",
  "complete",
  "rejected",
  "failed",
  "error",
]);

function nativeGrowthRecordTime(record = {}) {
  const value = String(record.createdAt || record.created_at || record.updatedAt || record.submittedAt || "").trim();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nativeGrowthSubmissionStateCard(taskCardId) {
  const id = String(taskCardId || "");
  const growth = state.learningGrowth || {};
  const programs = growth.programs || {};
  const groups = [
    growth.board?.cards,
    programs.executableTasks,
    programs.taskCards,
  ];
  for (const group of groups) {
    const card = (Array.isArray(group) ? group : []).find((item) => String(item?.taskCardId || item?.id || "") === id);
    if (card) return card;
  }
  return null;
}

function nativeGrowthLatestRecordForTask(records = [], taskCardId = "") {
  const id = String(taskCardId || "");
  return (Array.isArray(records) ? records : [])
    .filter((record) => String(record?.taskCardId || record?.task_card_id || "") === id)
    .slice()
    .sort((a, b) => String(b.submittedAt || b.createdAt || b.updatedAt || "").localeCompare(String(a.submittedAt || a.createdAt || a.updatedAt || "")))[0] || null;
}

function nativeGrowthSubmissionSettledResult(taskCardId, startedAtMs = 0) {
  const card = nativeGrowthSubmissionStateCard(taskCardId);
  const evaluation = card?.latestEvaluation || null;
  if (!evaluation) return null;
  const status = String(evaluation.status || "").trim();
  if (!NATIVE_GROWTH_SUBMISSION_SETTLED_STATUSES.has(status)) return null;
  const evaluatedAt = nativeGrowthRecordTime(evaluation);
  if (startedAtMs && evaluatedAt && evaluatedAt + 30000 < startedAtMs) return null;
  return { card, evaluation, status };
}

function nativeGrowthSubmissionReceivedResult(taskCardId, startedAtMs = 0) {
  const card = nativeGrowthSubmissionStateCard(taskCardId);
  const submission = card?.latestSubmission || card?.nativeState?.latestSubmission || null;
  if (!submission) return null;
  const submittedAt = nativeGrowthRecordTime(submission);
  if (startedAtMs && submittedAt && submittedAt + 30000 < startedAtMs) return null;
  return { card, submission, status: String(submission.status || "submitted") };
}

function nativeGrowthReflectionSettledResult(taskCardId, startedAtMs = 0) {
  const growth = state.learningGrowth || {};
  const programs = growth.programs || {};
  const card = nativeGrowthSubmissionStateCard(taskCardId);
  const reflection = card?.latestReflection
    || card?.nativeState?.latestReflection
    || nativeGrowthLatestRecordForTask(programs.taskReflections || growth.taskReflections || [], taskCardId);
  if (!reflection) return null;
  const status = String(reflection.status || "").trim().toLowerCase();
  if (!NATIVE_GROWTH_REFLECTION_SETTLED_STATUSES.has(status)) return null;
  const reflectedAt = nativeGrowthRecordTime(reflection);
  if (startedAtMs && reflectedAt && reflectedAt + 30000 < startedAtMs) return null;
  return { card, reflection, status };
}

function nativeGrowthSubmissionCompletionText(result = {}) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthSubmissionCompletionTextPlan");
  if (modelFn) return modelFn(result);
  const evaluation = result.evaluation || result || {};
  const status = String(evaluation.status || result.status || "").trim();
  const score = Number(evaluation.score || 0);
  const scoreText = Number.isFinite(score) && score > 0 ? `\uff08${Math.round(score)} \u5206\uff09` : "";
  if (status === "reflection_required") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u4e0b\u4e00\u6b65\u9700\u8981\u5f55\u97f3\u590d\u76d8\u3002`;
  if (status === "needs_repair" || status === "needs_revision") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u8fd9\u6b21\u4ecd\u9700\u8981\u4fee\u6539\u540e\u518d\u63d0\u4ea4\u3002`;
  if (status === "passed" || status === "completed") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u7ed3\u679c\u5df2\u5237\u65b0\u3002`;
  return "\u5df2\u627e\u5230\u6700\u65b0 AI \u6279\u6539\u7ed3\u679c\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002";
}

function nativeGrowthReflectionCompletionText(result = {}) {
  const modelFn = learningNativeGrowthSubmissionModelFunction("nativeGrowthReflectionCompletionTextPlan");
  if (modelFn) return modelFn(result);
  const reflection = result.reflection || result || {};
  const status = String(reflection.status || result.status || "").trim().toLowerCase();
  const score = Number(reflection.score || 0);
  const maxScore = Number(reflection.maxScore || reflection.max_score || 100) || 100;
  const scoreText = Number.isFinite(score) && score > 0 ? `\uff08${Math.round(score)}/${Math.round(maxScore)}\uff09` : "";
  if (status === "accepted" || status === "completed" || status === "complete") return `\u8bed\u97f3\u590d\u76d8\u5df2\u901a\u8fc7${scoreText}\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002`;
  if (status === "rejected") return `\u8bed\u97f3\u590d\u76d8\u5df2\u5904\u7406\uff0c\u4f46\u8fd9\u6b21\u8fd8\u6ca1\u6709\u901a\u8fc7${scoreText}\uff1b\u8bf7\u6309\u53cd\u9988\u91cd\u65b0\u5f55\u4e00\u6bb5\u590d\u76d8\u3002`;
  if (status === "failed" || status === "error") return "\u8bed\u97f3\u590d\u76d8\u5904\u7406\u5931\u8d25\uff1b\u53ef\u91cd\u65b0\u5f55\u97f3\u540e\u518d\u63d0\u4ea4\u3002";
  return "\u5df2\u627e\u5230\u6700\u65b0\u590d\u76d8\u7ed3\u679c\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002";
}

async function refreshNativeGrowthSubmissionResult(taskCardId, startedAtMs = 0) {
  if (typeof loadLearningCoins !== "function") return nativeGrowthSubmissionSettledResult(taskCardId, startedAtMs);
  await loadLearningCoins({ limit: 80 });
  const result = nativeGrowthSubmissionSettledResult(taskCardId, startedAtMs);
  if (result) {
    if (state.learningNativeGrowthSubmissionSubmitting) delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
    clearNativeGrowthAnswerEditing(taskCardId);
    if (typeof renderLearningCoinsView === "function") renderLearningCoinsView();
  }
  return result;
}

async function refreshNativeGrowthReflectionResult(taskCardId, startedAtMs = 0) {
  if (typeof loadLearningCoins !== "function") return nativeGrowthReflectionSettledResult(taskCardId, startedAtMs);
  await loadLearningCoins({ limit: 80 });
  const result = nativeGrowthReflectionSettledResult(taskCardId, startedAtMs);
  if (result && typeof renderLearningCoinsView === "function") renderLearningCoinsView();
  return result;
}

function startNativeGrowthSubmissionResultPolling(taskCardId, startedAtMs = 0, stateNode = null) {
  if (typeof setInterval !== "function" || typeof loadLearningCoins !== "function") return { stop() {} };
  state.learningNativeGrowthSubmissionPollers = state.learningNativeGrowthSubmissionPollers || {};
  const existing = state.learningNativeGrowthSubmissionPollers[taskCardId];
  if (existing && typeof existing.stop === "function") existing.stop();
  let stopped = false;
  let inFlight = false;
  let attempts = 0;
  let timer = 0;
  let receiptShown = false;
  const stop = () => {
    stopped = true;
    if (timer && typeof clearInterval === "function") clearInterval(timer);
    if (state.learningNativeGrowthSubmissionPollers?.[taskCardId]?.stop === stop) delete state.learningNativeGrowthSubmissionPollers[taskCardId];
  };
  const check = async () => {
    if (stopped || inFlight) return;
    attempts += 1;
    if (attempts > 30) {
      if (state.learningNativeGrowthSubmissionSubmitting) delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
      if (stateNode) stateNode.textContent = receiptShown
        ? "\u4f5c\u7b54\u5df2\u6536\u5230\uff0cAI \u6279\u6539\u4ecd\u5728\u8fdb\u884c\uff1b\u53ef\u8fd4\u56de\u770b\u677f\u540e\u518d\u6253\u5f00\u8fd9\u5f20\u5361\u67e5\u770b\u6700\u65b0\u72b6\u6001\u3002"
        : "\u670d\u52a1\u7aef\u6682\u672a\u786e\u8ba4\u6536\u5230\u8fd9\u6b21\u4f5c\u7b54\uff1b\u8349\u7a3f\u5df2\u4fdd\u7559\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002";
      if (typeof renderLearningCoinsView === "function") renderLearningCoinsView();
      stop();
      return;
    }
    inFlight = true;
    try {
      const result = await refreshNativeGrowthSubmissionResult(taskCardId, startedAtMs);
      if (result) {
        if (stateNode) stateNode.textContent = nativeGrowthSubmissionCompletionText(result);
        if (typeof showPushToast === "function") showPushToast("\u6700\u65b0 AI \u6279\u6539\u5df2\u5237\u65b0", "success");
        stop();
      } else {
        const receipt = nativeGrowthSubmissionReceivedResult(taskCardId, startedAtMs);
        if (receipt) {
          receiptShown = true;
          if (stateNode) stateNode.textContent = "\u4f5c\u7b54\u5df2\u6536\u5230\uff0c\u6b63\u5728\u7b49\u5f85 AI \u6279\u6539\u548c\u751f\u6210\u53cd\u9988\uff1b\u53ef\u4fdd\u6301\u672c\u9875\u9762\u6216\u7a0d\u540e\u5237\u65b0\u67e5\u770b\u3002";
        } else if (attempts >= 9) {
          if (state.learningNativeGrowthSubmissionSubmitting) delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
          if (stateNode) stateNode.textContent = "\u670d\u52a1\u7aef\u6682\u672a\u786e\u8ba4\u6536\u5230\u8fd9\u6b21\u4f5c\u7b54\uff1b\u8349\u7a3f\u5df2\u4fdd\u7559\uff0c\u53ef\u91cd\u8bd5\u63d0\u4ea4\u3002";
          if (typeof renderLearningCoinsView === "function") renderLearningCoinsView();
          stop();
        }
      }
    } catch (_) {
      // Keep the foreground submit request responsible for user-facing errors.
    } finally {
      inFlight = false;
    }
  };
  timer = setInterval(check, 10000);
  state.learningNativeGrowthSubmissionPollers[taskCardId] = { stop };
  setTimeout(check, 12000);
  return state.learningNativeGrowthSubmissionPollers[taskCardId];
}

function startNativeGrowthReflectionResultPolling(taskCardId, startedAtMs = 0, stateNode = null, button = null) {
  if (typeof setInterval !== "function" || typeof loadLearningCoins !== "function") return { stop() {} };
  state.learningNativeGrowthReflectionPollers = state.learningNativeGrowthReflectionPollers || {};
  const existing = state.learningNativeGrowthReflectionPollers[taskCardId];
  if (existing && typeof existing.stop === "function") existing.stop();
  let stopped = false;
  let inFlight = false;
  let attempts = 0;
  let timer = 0;
  const stop = () => {
    stopped = true;
    if (timer && typeof clearInterval === "function") clearInterval(timer);
    if (state.learningNativeGrowthReflectionPollers?.[taskCardId]?.stop === stop) delete state.learningNativeGrowthReflectionPollers[taskCardId];
  };
  const check = async () => {
    if (stopped || inFlight) return;
    attempts += 1;
    if (attempts > 24) {
      if (stateNode) stateNode.textContent = "\u590d\u76d8\u5f55\u97f3\u5df2\u63d0\u4ea4\uff0c\u4f46\u6682\u672a\u62ff\u5230\u6700\u7ec8\u5904\u7406\u72b6\u6001\uff1b\u8fd4\u56de\u540e\u518d\u6253\u5f00\u8fd9\u5f20\u5361\u4f1a\u663e\u793a\u6700\u65b0\u7ed3\u679c\u3002";
      if (button) button.disabled = false;
      stop();
      return;
    }
    inFlight = true;
    try {
      const result = await refreshNativeGrowthReflectionResult(taskCardId, startedAtMs);
      if (result) {
        if (stateNode) stateNode.textContent = nativeGrowthReflectionCompletionText(result);
        if (button) button.disabled = false;
        if (typeof showPushToast === "function") showPushToast(result.status === "rejected" ? "\u590d\u76d8\u672a\u901a\u8fc7\uff0c\u9700\u8981\u91cd\u5f55" : "\u590d\u76d8\u7ed3\u679c\u5df2\u5237\u65b0", result.status === "rejected" ? "warning" : "success");
        stop();
      }
    } catch (_) {
      // Foreground submit still owns user-facing network errors.
    } finally {
      inFlight = false;
    }
  };
  timer = setInterval(check, 8000);
  state.learningNativeGrowthReflectionPollers[taskCardId] = { stop };
  setTimeout(check, 10000);
  return state.learningNativeGrowthReflectionPollers[taskCardId];
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
  const existingSubmitting = state.learningNativeGrowthSubmissionSubmitting[taskCardId];
  const existingStartedAt = Number(existingSubmitting?.startedAtMs || 0);
  const existingLockMs = requiresAudio ? 5 * 60 * 1000 : 15 * 1000;
  if (existingSubmitting && existingStartedAt && Date.now() - existingStartedAt >= existingLockMs) {
    delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
  }
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
  const startedAtMs = Date.now();
  let keepPolling = false;
  let settledByRefresh = false;
  state.learningNativeGrowthSubmissionSubmitting[taskCardId] = { startedAtMs };
  if (button) button.disabled = true;
  if (stateNode) stateNode.textContent = requiresAudio ? "\u6b63\u5728\u53d1\u9001\u5f55\u97f3\uff0c\u670d\u52a1\u7aef\u786e\u8ba4\u524d\u5c1a\u672a\u4fdd\u5b58\uff1b\u8bf7\u4fdd\u6301\u672c\u9875\u9762\u6253\u5f00\u3002" : "\u6b63\u5728\u53d1\u9001\u4f5c\u7b54\uff0c\u670d\u52a1\u7aef\u786e\u8ba4\u524d\u5c1a\u672a\u4fdd\u5b58\uff1b\u8bf7\u4fdd\u6301\u672c\u9875\u9762\u6253\u5f00\u3002";
  const poller = startNativeGrowthSubmissionResultPolling(taskCardId, startedAtMs, stateNode);
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
      timeoutMs: 180000,
      body: JSON.stringify(body),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth task submission failed");
    if (response.async || response.status === "accepted") {
      clearNativeGrowthSubmissionDraft(form, taskCardId);
      delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
      if (stateNode) stateNode.textContent = "\u4f5c\u7b54\u5df2\u6536\u5230\uff0cAI \u6279\u6539\u5df2\u8f6c\u5165\u540e\u53f0\uff1b\u5b8c\u6210\u540e\u4f1a\u63a8\u9001\u901a\u77e5\uff0c\u70b9\u51fb\u53ef\u76f4\u8fbe\u6279\u6539\u5185\u5bb9\u3002";
      showPushToast("\u4f5c\u7b54\u5df2\u6536\u5230\uff0c\u7b49\u5f85 AI \u6279\u6539", "success");
      await loadLearningCoins({ limit: 80 });
      if (button) button.disabled = false;
      keepPolling = true;
      return;
    }
    const latest = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
    if (submittedFile && latest?.file === submittedFile) {
      if (latest.url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(latest.url);
      delete state.learningNativeGrowthSubmissionRecorders[taskCardId];
    }
    clearNativeGrowthSubmissionDraft(form, taskCardId);
    clearNativeGrowthAnswerEditing(taskCardId);
    delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
    if (stateNode) stateNode.textContent = nativeGrowthSubmissionCompletionText(response.evaluation || {});
    showPushToast("AI \u6279\u6539\u5df2\u5b8c\u6210", "success");
    await loadLearningCoins({ limit: 80 });
  } catch (err) {
    const refreshed = await refreshNativeGrowthSubmissionResult(taskCardId, startedAtMs).catch(() => null);
    if (refreshed) {
      settledByRefresh = true;
      clearNativeGrowthSubmissionDraft(form, taskCardId);
      clearNativeGrowthAnswerEditing(taskCardId);
      if (stateNode) stateNode.textContent = nativeGrowthSubmissionCompletionText(refreshed);
      showPushToast("\u6700\u65b0 AI \u6279\u6539\u5df2\u5237\u65b0", "success");
      return;
    }
    if (!err?.status) {
      keepPolling = true;
      if (stateNode) stateNode.textContent = "\u63d0\u4ea4\u8bf7\u6c42\u4e2d\u65ad\uff0c\u670d\u52a1\u7aef\u5c1a\u672a\u786e\u8ba4\u4fdd\u5b58\uff1b\u6b63\u5728\u81ea\u52a8\u67e5\u627e\u662f\u5426\u5df2\u6536\u5230\u4f5c\u7b54...";
      showPushToast("\u63d0\u4ea4\u5c1a\u672a\u786e\u8ba4\uff0c\u6b63\u5728\u67e5\u627e\u670d\u52a1\u7aef\u56de\u6267", "warning");
      return;
    }
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    if (!keepPolling && poller && typeof poller.stop === "function") poller.stop();
    if (!keepPolling && !settledByRefresh && state.learningNativeGrowthSubmissionSubmitting) delete state.learningNativeGrowthSubmissionSubmitting[taskCardId];
    if (button && !keepPolling) button.disabled = false;
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
  const startedAtMs = Date.now();
  let keepPolling = false;
  const poller = startNativeGrowthReflectionResultPolling(taskCardId, startedAtMs, stateNode, button);
  try {
    const body = Object.assign(learningLearnerBody(), {
      filename: submittedFile.name || `growth-reflection-${taskCardId}.webm`,
      type: submittedFile.type || recording.mimeType || "audio/webm",
      dataBase64: await fileToBase64(submittedFile),
      durationMs: recording.elapsedMs || 0,
    });
    const response = await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/growth-reflection`, {
      method: "POST",
      timeoutMs: 180000,
      body: JSON.stringify(body),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth reflection submission failed");
    const latest = state.learningNativeGrowthSubmissionRecorders?.[taskCardId];
    if (latest?.file === submittedFile) {
      if (latest.url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(latest.url);
      delete state.learningNativeGrowthSubmissionRecorders[taskCardId];
    }
    await loadLearningCoins({ limit: 80 });
    const refreshed = nativeGrowthReflectionSettledResult(taskCardId, startedAtMs) || (response.reflection ? { reflection: response.reflection, status: response.reflection.status } : null);
    if (stateNode) stateNode.textContent = refreshed ? nativeGrowthReflectionCompletionText(refreshed) : "\u8bed\u97f3\u590d\u76d8\u5df2\u5904\u7406\uff0c\u9875\u9762\u6b63\u5728\u5237\u65b0\u3002";
    showPushToast(refreshed?.status === "rejected" ? "\u590d\u76d8\u672a\u901a\u8fc7\uff0c\u9700\u8981\u91cd\u5f55" : "\u8bed\u97f3\u590d\u76d8\u5df2\u5904\u7406", refreshed?.status === "rejected" ? "warning" : "success");
  } catch (err) {
    const refreshed = await refreshNativeGrowthReflectionResult(taskCardId, startedAtMs).catch(() => null);
    if (refreshed) {
      if (stateNode) stateNode.textContent = nativeGrowthReflectionCompletionText(refreshed);
      showPushToast(refreshed.status === "rejected" ? "\u590d\u76d8\u672a\u901a\u8fc7\uff0c\u9700\u8981\u91cd\u5f55" : "\u590d\u76d8\u7ed3\u679c\u5df2\u5237\u65b0", refreshed.status === "rejected" ? "warning" : "success");
      return;
    }
    if (!err?.status || err?.code === "request_timeout") {
      keepPolling = true;
      if (stateNode) stateNode.textContent = "\u590d\u76d8\u63d0\u4ea4\u8bf7\u6c42\u8fd8\u6ca1\u6709\u8fd4\u56de\uff0c\u6b63\u5728\u81ea\u52a8\u5237\u65b0\u6700\u65b0\u5904\u7406\u72b6\u6001...";
      showPushToast("\u6b63\u5728\u67e5\u627e\u590d\u76d8\u5904\u7406\u7ed3\u679c", "warning");
      return;
    }
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    if (!keepPolling && poller && typeof poller.stop === "function") poller.stop();
    if (button && !keepPolling) button.disabled = false;
  }
}
