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

function normalizeEvaluationStage(value, fallback = "final") {
  const text = cleanString(value).toLowerCase();
  if (["draft", "first_draft", "initial"].includes(text)) return "draft";
  if (["final", "rewrite", "revision", "resubmission"].includes(text)) return "final";
  return fallback === "draft" ? "draft" : "final";
}

function learningNextStep(stage, passed) {
  if (stage === "draft") return "rewrite_and_reflect";
  return passed ? "completed" : "revise_and_resubmit";
}

function feedbackSections(scored = {}, requirements = [], stage = "final") {
  const strengths = [];
  if (scored.wordCount >= scored.targetMinWords) strengths.push("\u7bc7\u5e45\u5df2\u8fbe\u5230\u672c\u6b21\u4efb\u52a1\u7684\u57fa\u672c\u8981\u6c42\u3002");
  if (scored.sentenceCount >= 3) strengths.push("\u5df2\u5199\u51fa\u591a\u4e2a\u53e5\u5b50\uff0c\u53ef\u4ee5\u7ee7\u7eed\u6253\u78e8\u8fde\u63a5\u548c\u5c42\u6b21\u3002");
  if (scored.score >= 70) strengths.push("\u4efb\u52a1\u8d34\u5408\u5ea6\u8fbe\u5230\u7ec3\u4e60\u57fa\u7ebf\uff0c\u4e0b\u4e00\u6b65\u91cd\u70b9\u662f\u628a\u8868\u8fbe\u6539\u5f97\u66f4\u6e05\u695a\u3002");
  if (!strengths.length) strengths.push("\u5df2\u5b8c\u6210\u4e00\u6b21\u53ef\u6279\u6539\u7684\u5199\u4f5c\u63d0\u4ea4\uff0c\u53ef\u4ee5\u5728\u4e0b\u4e00\u7248\u91cc\u8865\u8db3\u4fe1\u606f\u3002");
  const focusAreas = asArray(requirements).length
    ? asArray(requirements)
    : ["\u68c0\u67e5\u4efb\u52a1\u8981\u6c42\u662f\u5426\u90fd\u6709\u56de\u5e94\u3002", "\u628a\u6700\u91cd\u8981\u7684\u4e00\u4e2a\u7406\u7531\u6216\u7ec6\u8282\u5199\u5f97\u66f4\u5177\u4f53\u3002"];
  const rewriteChecklist = [
    "\u4fdd\u7559\u539f\u6587\u4e2d\u6700\u6e05\u695a\u7684\u53e5\u5b50\u3002",
    "\u6839\u636e\u4e0a\u9762\u4fee\u6539\u8981\u6c42\u81f3\u5c11\u6539\u5199\u4e24\u5904\u3002",
    "\u8865\u4e00\u53e5\u590d\u76d8\uff1a\u6211\u6539\u4e86\u4ec0\u4e48\uff0c\u4e3a\u4ec0\u4e48\u8fd9\u6837\u6539\u3002",
  ];
  if (stage === "final") rewriteChecklist.push("\u6700\u540e\u68c0\u67e5\u5927\u5199\u3001\u53e5\u53f7\u548c\u7ed3\u5c3e\u662f\u5426\u5b8c\u6574\u3002");
  return {
    strengths,
    focusAreas,
    rewriteChecklist,
    reflectionPrompts: [
      "\u6211\u8fd9\u6b21\u6700\u91cd\u8981\u7684\u4e00\u5904\u4fee\u6539\u662f\u4ec0\u4e48\uff1f",
      "\u4e0b\u6b21\u5199\u540c\u7c7b\u6587\u7ae0\u65f6\uff0c\u6211\u8981\u5148\u6ce8\u610f\u54ea\u4e00\u70b9\uff1f",
    ],
  };
}

function createLearningGrowthWritingEvaluationService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function evaluate(input = {}) {
    const card = input.card || {};
    const text = String(input.text || "");
    const cardId = cleanString(input.cardId || card.id || card.todoId || card.todo_id);
    const stage = normalizeEvaluationStage(input.stage || input.submissionStage || input.submissionKind, "final");
    const scored = scoreWriting({ text, card });
    const requirements = revisionRequirements(scored.issues, scored.score);
    const passed = stage === "final" && scored.passed;
    const status = stage === "draft" ? "draft_feedback" : (passed ? "completed" : "needs_revision");
    const coinAmount = passed ? rewardCoinsForScore(scored.score) : 0;
    const at = now().toISOString();
    const learningSummary = stage === "draft"
      ? `\u8349\u7a3f\u5df2\u6279\u6539\uff1a${scored.score}/100\u3002\u4e0b\u4e00\u6b65\u8bf7\u6309\u6e05\u5355\u6539\u5199\uff0c\u5e76\u8865\u4e00\u53e5\u590d\u76d8\u540e\u518d\u63d0\u4ea4\u3002`
      : (passed
        ? `\u5199\u4f5c\u5df2\u901a\u8fc7\uff1a${scored.score}/100\u3002\u5df2\u5b8c\u6210\u6539\u5199\u548c\u590d\u76d8\uff0c\u91d1\u5e01\u7ed3\u7b97\u4ee5\u670d\u52a1\u5c42\u8bb0\u5f55\u4e3a\u51c6\u3002`
        : `\u5199\u4f5c\u9700\u8981\u7ee7\u7eed\u4fee\u6539\uff1a${scored.score}/100\u3002\u8bf7\u6839\u636e\u6279\u6539\u62a5\u544a\u518d\u63d0\u4ea4\u4e00\u7248\u3002`);
    const nextStep = learningNextStep(stage, passed);
    const summary = scored.passed
      ? `写作已通过：${scored.score}/100。重点继续保持任务贴合度和句子完整度。`
      : `写作需要修改：${scored.score}/100。先按修改要求补足内容后再提交。`;
    return {
      evaluationId: createEvaluationId(cardId, text),
      submissionDigest: submissionDigest(text),
      stage,
      status,
      score: scored.score,
      maxScore: scored.maxScore,
      passed,
      confidence: scored.confidence,
      summary: learningSummary,
      wordCount: scored.wordCount,
      sentenceCount: scored.sentenceCount,
      targetMinWords: scored.targetMinWords,
      targetMaxWords: scored.targetMaxWords,
      revisionRequirements: requirements,
      feedbackSections: feedbackSections(scored, requirements, stage),
      nextStep,
      verificationMethod: "deterministic_template",
      evidenceRefs: ["learning-growth-writing-rubric:v1", `writing-stage:${stage}`, `word-count-band:${Math.floor(scored.wordCount / 20) * 20}`],
      reward: {
        eligible: passed && coinAmount > 0,
        coinAmount,
        reason: passed ? "learning_growth_writing_passed" : "revision_required_before_reward",
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
  normalizeEvaluationStage,
  rewardCoinsForScore,
  scoreWriting,
  targetWordRange,
};
