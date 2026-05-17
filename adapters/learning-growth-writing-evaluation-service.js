"use strict";

const crypto = require("node:crypto");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function createEvaluationId(cardId, text) {
  const digest = crypto.createHash("sha256").update(`${cleanString(cardId)}\0${String(text || "")}`).digest("hex").slice(0, 16);
  return `lgwe_${digest}`;
}

function submissionDigest(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function words(text) {
  return String(text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
}

function sentenceCount(text) {
  const matches = String(text || "").match(/[.!?]+(?:\s|$)/g) || [];
  return matches.length;
}

function letterRatio(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact) return 0;
  const letters = compact.match(/[A-Za-z]/g) || [];
  return letters.length / compact.length;
}

function targetWordRange(card = {}) {
  const text = [
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.description,
    card.content,
  ].map(cleanString).filter(Boolean).join("\n");
  const explicit = text.match(/(\d{2,3})\s*(?:-|to|~|至|到)\s*(\d{2,3})\s*(?:words?|词|字)/i);
  if (explicit) {
    const min = Math.max(20, Math.min(300, Number(explicit[1]) || 80));
    const max = Math.max(min, Math.min(500, Number(explicit[2]) || min + 80));
    return { min, max };
  }
  const single = text.match(/(?:at least|不少于|至少)\s*(\d{2,3})\s*(?:words?|词|字)/i);
  if (single) {
    const min = Math.max(20, Math.min(300, Number(single[1]) || 80));
    return { min, max: Math.max(min + 60, min * 2) };
  }
  if (/summary|reflection|复盘|总结|answer/i.test(text)) return { min: 40, max: 180 };
  return { min: 80, max: 220 };
}

function keywordOverlap(card = {}, text = "") {
  const goal = [
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.description,
    card.content,
  ].map(cleanString).join(" ").toLowerCase();
  const answer = String(text || "").toLowerCase();
  const candidates = [...new Set((goal.match(/[a-z]{5,}/g) || [])
    .filter((word) => !["task", "instruction", "complete", "growth", "minutes", "planned", "words"].includes(word))
    .slice(0, 12))];
  if (!candidates.length) return 1;
  const matched = candidates.filter((word) => answer.includes(word)).length;
  return matched / candidates.length;
}

function writingIssues(input = {}) {
  const text = String(input.text || "");
  const wordList = words(text);
  const count = wordList.length;
  const sentences = sentenceCount(text);
  const ratio = letterRatio(text);
  const target = input.target || { min: 80, max: 220 };
  const issues = [];
  if (count < Math.ceil(target.min * 0.5)) issues.push({ code: "too_short", severity: "block", message: `本次作答只有 ${count} 个英文词，先补足到至少 ${target.min} 个词。` });
  else if (count < target.min) issues.push({ code: "below_target_length", severity: "revision", message: `篇幅偏短，建议补充到 ${target.min}-${target.max} 个英文词。` });
  if (ratio < 0.75) issues.push({ code: "low_english_ratio", severity: "revision", message: "英文占比偏低，批改只接受以英文为主体的作答。" });
  if (sentences < 3) issues.push({ code: "few_sentences", severity: "revision", message: "句子数量偏少，至少写出开头、展开和收束三部分。" });
  if (!/[.!?]\s*$/.test(text)) issues.push({ code: "missing_sentence_end", severity: "minor", message: "最后一句需要使用英文句号、问号或感叹号收尾。" });
  if (!/[A-Z]/.test(text.slice(0, 3)) && /^[a-z]/.test(text)) issues.push({ code: "capitalization", severity: "minor", message: "句首大小写需要修正。" });
  const repeated = wordList.some((word, index) => index > 1 && word.toLowerCase() === wordList[index - 1].toLowerCase() && word.toLowerCase() === wordList[index - 2].toLowerCase());
  if (repeated) issues.push({ code: "repeated_words", severity: "minor", message: "有连续重复词，提交前需要通读修正。" });
  return issues;
}

function revisionRequirements(issues = [], score = 0) {
  const requirements = issues
    .filter((issue) => issue.severity !== "minor" || score < 85)
    .map((issue) => issue.message)
    .slice(0, 5);
  if (!requirements.length && score < 90) {
    requirements.push("下一版把理由或细节再展开一层，避免只写结论。");
  }
  return requirements;
}

function scoreWriting(input = {}) {
  const text = String(input.text || "");
  const card = input.card || {};
  const target = targetWordRange(card);
  const wordCount = words(text).length;
  const sentences = sentenceCount(text);
  const ratio = letterRatio(text);
  const overlap = keywordOverlap(card, text);
  const issues = writingIssues({ text, target });
  const lengthScore = Math.min(25, (wordCount / Math.max(1, target.min)) * 25);
  const sentenceScore = Math.min(15, sentences * 4);
  const englishScore = Math.min(15, ratio * 15);
  const alignmentScore = Math.min(15, Math.max(0.35, overlap) * 15);
  const structureScore = /\b(first|because|then|also|however|finally|for example|in conclusion)\b/i.test(text) ? 15 : 8;
  const mechanicsPenalty = issues.reduce((sum, issue) => sum + (issue.severity === "block" ? 22 : issue.severity === "revision" ? 8 : 3), 0);
  const score = clampScore(15 + lengthScore + sentenceScore + englishScore + alignmentScore + structureScore - mechanicsPenalty);
  const blocked = issues.some((issue) => issue.severity === "block");
  const passed = !blocked && score >= 70;
  return {
    score,
    maxScore: 100,
    passed,
    wordCount,
    sentenceCount: sentences,
    targetMinWords: target.min,
    targetMaxWords: target.max,
    issues,
    confidence: blocked ? 0.82 : 0.88,
  };
}

function rewardCoinsForScore(score) {
  if (score >= 95) return 20;
  if (score >= 85) return 15;
  if (score >= 70) return 10;
  return 0;
}

function createLearningGrowthWritingEvaluationService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function evaluate(input = {}) {
    const card = input.card || {};
    const text = String(input.text || "");
    const cardId = cleanString(input.cardId || card.id || card.todoId || card.todo_id);
    const scored = scoreWriting({ text, card });
    const requirements = revisionRequirements(scored.issues, scored.score);
    const status = scored.passed ? "completed" : "needs_revision";
    const coinAmount = rewardCoinsForScore(scored.score);
    const at = now().toISOString();
    const summary = scored.passed
      ? `写作已通过：${scored.score}/100。重点继续保持任务贴合度和句子完整度。`
      : `写作需要修改：${scored.score}/100。先按修改要求补足内容后再提交。`;
    return {
      evaluationId: createEvaluationId(cardId, text),
      submissionDigest: submissionDigest(text),
      status,
      score: scored.score,
      maxScore: scored.maxScore,
      passed: scored.passed,
      confidence: scored.confidence,
      summary,
      wordCount: scored.wordCount,
      sentenceCount: scored.sentenceCount,
      targetMinWords: scored.targetMinWords,
      targetMaxWords: scored.targetMaxWords,
      revisionRequirements: requirements,
      verificationMethod: "deterministic_template",
      evidenceRefs: ["learning-growth-writing-rubric:v1", `word-count-band:${Math.floor(scored.wordCount / 20) * 20}`],
      reward: {
        eligible: scored.passed && coinAmount > 0,
        coinAmount,
        reason: scored.passed ? "learning_growth_writing_passed" : "revision_required_before_reward",
      },
      evaluatedAt: at,
    };
  }

  return {
    evaluate,
  };
}

module.exports = {
  createLearningGrowthWritingEvaluationService,
  rewardCoinsForScore,
  scoreWriting,
  targetWordRange,
};
