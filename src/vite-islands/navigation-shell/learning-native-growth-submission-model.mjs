"use strict";

export const LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_VERSION = "20260705-learning-native-growth-submission-model-v1";

export const NATIVE_GROWTH_SUBMISSION_SETTLED_STATUSES = Object.freeze([
  "passed",
  "needs_repair",
  "needs_revision",
  "reflection_required",
  "completed",
  "failed",
  "rejected",
]);

export const NATIVE_GROWTH_REFLECTION_SETTLED_STATUSES = Object.freeze([
  "accepted",
  "completed",
  "complete",
  "rejected",
  "failed",
  "error",
]);

function clean(value) {
  return String(value || "").trim();
}

export function learningNativeGrowthSubmissionStatsPlan(text = "") {
  const value = clean(text);
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  };
}

export function nativeGrowthDraftStorageIdPlan(value = "") {
  return clean(value).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 160) || "default";
}

export function nativeGrowthDraftStorageKeyPlan({ type = "text", workspaceId = "owner", taskCardId = "" } = {}) {
  const prefix = type === "structured" ? "hermesNativeGrowthStructuredDraft" : "hermesNativeGrowthTextDraft";
  return `${prefix}:${nativeGrowthDraftStorageIdPlan(workspaceId)}:${nativeGrowthDraftStorageIdPlan(taskCardId)}`;
}

export function nativeGrowthTextDraftPlan(text = "", nowIso = "") {
  return { text: String(text || ""), updatedAt: clean(nowIso) };
}

export function nativeGrowthStructuredDraftPlan(answers = {}, nowIso = "") {
  return { answers: answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {}, updatedAt: clean(nowIso) };
}

export function nativeGrowthRequirementPlan({ minWords = 0, minChars = 0, stats = null } = {}) {
  const wordsRequired = Number(minWords || 0) || 0;
  const charsRequired = Number(minChars || 0) || 0;
  if (!stats) return { ready: false, text: `\u81f3\u5c11 ${wordsRequired} \u4e2a\u82f1\u6587\u8bcd / ${charsRequired} \u4e2a\u6709\u6548\u5b57\u7b26` };
  const words = Number(stats.words || 0) || 0;
  const chars = Number(stats.chars || 0) || 0;
  const missingWords = Math.max(0, wordsRequired - words);
  const missingChars = Math.max(0, charsRequired - chars);
  const ready = !missingWords && !missingChars;
  return {
    ready,
    text: ready
      ? `\u5df2\u8fbe\u6807\uff1a\u5f53\u524d ${words} \u8bcd / ${chars} \u5b57\u7b26\u3002`
      : `\u672a\u8fbe\u6807\uff1a\u8fd8\u5dee ${missingWords} \u4e2a\u82f1\u6587\u8bcd / ${missingChars} \u4e2a\u6709\u6548\u5b57\u7b26\uff1b\u5f53\u524d ${words} \u8bcd / ${chars} \u5b57\u7b26\u3002`,
  };
}

export function structuredNativeGrowthAnswersPlan(rawBlocks = []) {
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
  if (!blocks.length) return null;
  const answers = [];
  const draftAnswers = {};
  for (const block of blocks) {
    const questionId = clean(block.questionId);
    const type = clean(block.type);
    const title = clean(block.title || questionId);
    if (!questionId) continue;
    if (type === "multiple_choice") {
      const choice = clean(block.choice);
      const reason = clean(block.reason);
      draftAnswers[questionId] = { type, choice, reason: String(block.reason || "") };
      if (!choice) return { ok: false, error: `${title} \u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u9009\u9879\u3002`, draftAnswers };
      if (!reason) return { ok: false, error: `${title} \u8bf7\u8865\u4e00\u53e5\u7b80\u77ed\u7406\u7531\u3002`, draftAnswers };
      answers.push({ questionId, type, title, choice, reason });
      continue;
    }
    const response = clean(block.response);
    draftAnswers[questionId] = { type: "written", response: String(block.response || "") };
    if (!response) return { ok: false, error: `${title} \u8bf7\u5199\u51fa\u63a8\u7406\u8fc7\u7a0b\u3002`, draftAnswers };
    answers.push({ questionId, type: "written", title, response });
  }
  const text = answers.map((answer, index) => {
    const heading = `${index + 1}. ${answer.title || answer.questionId}`;
    if (answer.type === "multiple_choice") return `${heading}\n\u9009\u62e9\uff1a${answer.choice}\n\u7406\u7531\uff1a${answer.reason}`;
    return `${heading}\n\u63a8\u7406\uff1a${answer.response}`;
  }).join("\n\n");
  return { ok: true, answers, draftAnswers, text };
}

export function nativeGrowthSubmissionCompletionTextPlan(result = {}) {
  const evaluation = result.evaluation || result || {};
  const status = clean(evaluation.status || result.status);
  const score = Number(evaluation.score || 0);
  const scoreText = Number.isFinite(score) && score > 0 ? `\uff08${Math.round(score)} \u5206\uff09` : "";
  if (status === "reflection_required") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u4e0b\u4e00\u6b65\u9700\u8981\u5f55\u97f3\u590d\u76d8\u3002`;
  if (status === "needs_repair" || status === "needs_revision") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u8fd9\u6b21\u4ecd\u9700\u8981\u4fee\u6539\u540e\u518d\u63d0\u4ea4\u3002`;
  if (status === "passed" || status === "completed") return `AI \u6279\u6539\u5b8c\u6210${scoreText}\uff0c\u7ed3\u679c\u5df2\u5237\u65b0\u3002`;
  return "\u5df2\u627e\u5230\u6700\u65b0 AI \u6279\u6539\u7ed3\u679c\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002";
}

export function nativeGrowthReflectionCompletionTextPlan(result = {}) {
  const reflection = result.reflection || result || {};
  const status = clean(reflection.status || result.status).toLowerCase();
  const score = Number(reflection.score || 0);
  const maxScore = Number(reflection.maxScore || reflection.max_score || 100) || 100;
  const scoreText = Number.isFinite(score) && score > 0 ? `\uff08${Math.round(score)}/${Math.round(maxScore)}\uff09` : "";
  if (status === "accepted" || status === "completed" || status === "complete") return `\u8bed\u97f3\u590d\u76d8\u5df2\u901a\u8fc7${scoreText}\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002`;
  if (status === "rejected") return `\u8bed\u97f3\u590d\u76d8\u5df2\u5904\u7406\uff0c\u4f46\u8fd9\u6b21\u8fd8\u6ca1\u6709\u901a\u8fc7${scoreText}\uff1b\u8bf7\u6309\u53cd\u9988\u91cd\u65b0\u5f55\u4e00\u6bb5\u590d\u76d8\u3002`;
  if (status === "failed" || status === "error") return "\u8bed\u97f3\u590d\u76d8\u5904\u7406\u5931\u8d25\uff1b\u53ef\u91cd\u65b0\u5f55\u97f3\u540e\u518d\u63d0\u4ea4\u3002";
  return "\u5df2\u627e\u5230\u6700\u65b0\u590d\u76d8\u7ed3\u679c\uff0c\u9875\u9762\u5df2\u5237\u65b0\u3002";
}
