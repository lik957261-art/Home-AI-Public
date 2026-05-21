"use strict";

const crypto = require("node:crypto");
const {
  calculateLearningCardReward,
} = require("./learning-card-reward-policy-service");
const {
  growthNextStepForStage,
} = require("./learning-growth-task-interaction-state-service");

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
    card.learningTaskModel?.learnerInstruction,
    card.description,
    card.content,
  ].map(cleanString).filter(Boolean).join("\n");
  const explicit = text.match(/(\d{2,3})\s*(?:-|–|—|~|to|至|到)\s*(\d{2,3})\s*(?:words?|词|个词)?/i);
  if (explicit) {
    const min = Math.max(20, Math.min(300, Number(explicit[1]) || 80));
    const max = Math.max(min, Math.min(500, Number(explicit[2]) || min + 80));
    return { min, max };
  }
  const single = text.match(/(?:at least|不少于|至少)\s*(\d{2,3})\s*(?:words?|词|个词)/i);
  if (single) {
    const min = Math.max(20, Math.min(300, Number(single[1]) || 80));
    return { min, max: Math.max(min + 60, min * 2) };
  }
  const sentenceRange = text.match(/(\d)\s*(?:-|–|—|~|to|至|到)\s*(\d)\s*(?:English\s*)?(?:sentences?|句)/i);
  if (sentenceRange) {
    const minSentences = Math.max(3, Number(sentenceRange[1]) || 6);
    const maxSentences = Math.max(minSentences, Number(sentenceRange[2]) || minSentences + 2);
    return { min: Math.max(50, minSentences * 10), max: Math.max(140, maxSentences * 24) };
  }
  if (/summary|reflection|复盘|总结|answer/i.test(text)) return { min: 40, max: 180 };
  return { min: 80, max: 220 };
}

function keywordOverlap(card = {}, text = "") {
  const goal = [
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.learningTaskModel?.learnerInstruction,
    card.description,
    card.content,
  ].map(cleanString).join(" ").toLowerCase();
  const answer = String(text || "").toLowerCase();
  const candidates = [...new Set((goal.match(/[a-z]{5,}/g) || [])
    .filter((word) => !["task", "instruction", "complete", "growth", "minutes", "planned", "words", "english", "draft"].includes(word))
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
  if (count < Math.ceil(target.min * 0.5)) issues.push({ code: "too_short", severity: "block", message: `本次英文词数只有 ${count} 个，先补足到至少 ${target.min} 个词。` });
  else if (count < target.min) issues.push({ code: "below_target_length", severity: "revision", message: `篇幅偏短，建议补充到 ${target.min}-${target.max} 个英文词。` });
  if (ratio < 0.75) issues.push({ code: "low_english_ratio", severity: "revision", message: "英文占比偏低，本卡需要以英文作答为主体。" });
  if (sentences < 3) issues.push({ code: "few_sentences", severity: "revision", message: "句子数量偏少，至少写出开头、展开和收束三部分。" });
  if (!/[.!?]\s*$/.test(text)) issues.push({ code: "missing_sentence_end", severity: "minor", message: "最后一句需要用英文句号、问号或感叹号收尾。" });
  if (!/[A-Z]/.test(text.slice(0, 3)) && /^[a-z]/.test(text)) issues.push({ code: "capitalization", severity: "minor", message: "开头首字母大小写需要修正。" });
  const repeated = wordList.some((word, index) => index > 1 && word.toLowerCase() === wordList[index - 1].toLowerCase() && word.toLowerCase() === wordList[index - 2].toLowerCase());
  if (repeated) issues.push({ code: "repeated_words", severity: "minor", message: "有连续重复词，提交前需要通读修正。" });
  return issues;
}

function revisionRequirements(issues = [], score = 0, stage = "final") {
  const requirements = issues
    .filter((issue) => issue.severity !== "minor" || score < 85)
    .map((issue) => issue.message)
    .slice(0, 5);
  if (stage === "draft") {
    requirements.push(
      "改写时先确认是否同时回答了观点、理由、具体例子和本卡要求的词汇/句式。",
      "至少重写两处句子：一处让理由更清楚，一处让例子更具体。",
      "最后补一句复盘：我改了什么，为什么这样改。",
    );
  } else if (!requirements.length && score < 90) {
    requirements.push("下一次把理由或细节再展开一层，避免只写结论。");
  } else if (!requirements.length) {
    requirements.push("最终稿达到本卡通过线；下一次重点提高表达层次和具体细节。");
  }
  return [...new Set(requirements)].slice(0, 6);
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

function rewardCoinsForScore(score, input = {}) {
  return calculateLearningCardReward(Object.assign({}, input, {
    score,
    passed: Number(score) >= 70,
  })).coinAmount;
}

function normalizeEvaluationStage(value, fallback = "final") {
  const text = cleanString(value).toLowerCase();
  if (["draft", "first_draft", "initial"].includes(text)) return "draft";
  if (["final", "rewrite", "revision", "resubmission"].includes(text)) return "final";
  return fallback === "draft" ? "draft" : "final";
}

function feedbackSections(scored = {}, requirements = [], stage = "final") {
  const strengths = [];
  if (scored.wordCount >= scored.targetMinWords) strengths.push("篇幅已达到本次任务的基本要求。");
  if (scored.sentenceCount >= 3) strengths.push("已写出多个句子，可以继续打磨连接和层次。");
  if (scored.score >= 70) strengths.push("任务贴合度达到练习基线，下一步重点是把表达改得更清楚。");
  if (!strengths.length) strengths.push("已完成一次可批改的写作提交，可以在下一版里补足信息。");

  const focusAreas = (asArray(requirements).length
    ? asArray(requirements)
    : ["检查任务要求是否都已回应。", "把最重要的一个理由或细节写得更具体。"])
    .concat(stage === "draft" ? ["改写不是重新随便写一篇；要针对上面的反馈做可见修改。"] : [])
    .slice(0, 6);
  const rewriteChecklist = stage === "draft"
    ? [
      "先保留首稿里最清楚的一到两句，不要整篇推倒重来。",
      "把观点句、理由句、例子句分清楚，避免多个意思挤在一个句子里。",
      "至少补一个具体学校或日常生活细节，让读者知道发生了什么。",
      "把一个普通词替换成更准确的 active vocabulary，并检查搭配。",
      "最后写一句复盘：我改了什么，为什么这样改。",
    ]
    : [
      "保留这次最终稿中最清楚的表达，作为下次写作的可复用句式。",
      "下次写同类短文前，先列出观点、理由、例子三行提纲。",
      "继续检查大写、句号、连接词和结尾是否完整。",
    ];
  return {
    strengths,
    focusAreas,
    rewriteChecklist,
    reflectionPrompts: [
      "我这次最重要的一处修改是什么？",
      "下次写同类文章时，我要先注意哪一点？",
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
    const requirements = revisionRequirements(scored.issues, scored.score, stage);
    const passed = stage === "final" && scored.passed;
    const status = stage === "draft" ? "draft_feedback" : (passed ? "completed" : "needs_revision");
    const at = now().toISOString();
    const reward = calculateLearningCardReward({
      card,
      evaluation: { stage, score: scored.score, passed },
      stage,
      score: scored.score,
      passed,
      evaluatedAt: at,
      completedAt: at,
    });
    const coinAmount = reward.coinAmount;
    const summary = stage === "draft"
      ? `首稿已批改：${scored.score}/100。这不是最终结论；请按“重点修改”和“改写清单”完成一版 Rewritten，并补一句复盘后再提交。`
      : (passed
        ? `最终批改完成：${scored.score}/100。本卡已达到通过线；最终结论、改写成效和下一次训练重点会写入 Markdown 交付报告。`
        : `改写仍需继续：${scored.score}/100。请根据批改报告再提交一版，重点补足阻碍通过的项目。`);
    const nextStep = growthNextStepForStage(stage, passed);
    return {
      evaluationId: createEvaluationId(cardId, text),
      submissionDigest: submissionDigest(text),
      stage,
      status,
      score: scored.score,
      maxScore: scored.maxScore,
      passed,
      confidence: scored.confidence,
      summary,
      wordCount: scored.wordCount,
      sentenceCount: scored.sentenceCount,
      targetMinWords: scored.targetMinWords,
      targetMaxWords: scored.targetMaxWords,
      revisionRequirements: requirements,
      feedbackSections: feedbackSections(scored, requirements, stage),
      nextStep,
      verificationMethod: "deterministic_template",
      evidenceRefs: ["learning-growth-writing-rubric:v2", `writing-stage:${stage}`, `word-count-band:${Math.floor(scored.wordCount / 20) * 20}`],
      reward: {
        eligible: passed && coinAmount > 0,
        coinAmount,
        minCoinAmount: reward.minCoins,
        maxCoinAmount: reward.maxCoins,
        breakdown: reward.breakdown,
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
