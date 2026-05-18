"use strict";

const crypto = require("node:crypto");
const {
  calculateLearningCardReward,
} = require("./learning-card-reward-policy-service");
const {
  createLearningGrowthWritingEvaluationService,
  normalizeEvaluationStage,
} = require("./learning-growth-writing-evaluation-service");
const {
  inferLearningTaskModelFromCard,
} = require("./learning-task-model-service");
const {
  activityCoachingContract,
} = require("./learning-growth-task-coaching-contract-service");
const {
  growthNextStepForStage,
} = require("./learning-growth-task-interaction-state-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function words(text) {
  return String(text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
}

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function createEvaluationId(cardId, text, activityType) {
  const digest = crypto
    .createHash("sha256")
    .update(`${cleanString(cardId)}\0${cleanString(activityType)}\0${String(text || "")}`)
    .digest("hex")
    .slice(0, 16);
  return `lgte_${digest}`;
}

function submissionDigest(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function activityLabel(activityType) {
  const value = cleanString(activityType);
  if (value === "reading") return "Reading comprehension";
  if (value === "listening") return "Listening key points";
  if (value === "speaking") return "Speaking retell";
  if (value === "pronunciation") return "Pronunciation shadowing";
  if (value === "vocabulary") return "Active vocabulary";
  if (value === "grammar") return "Grammar in expression";
  if (value === "rewriting") return "Rewrite improvement";
  if (value === "presentation") return "Presentation rehearsal";
  if (value === "weekly_challenge") return "Weekly integrated challenge";
  return value || "Learning task";
}

function activityThreshold(activityType) {
  if (activityType === "listening") return { minWords: 20, minLines: 3 };
  if (activityType === "speaking") return { minWords: 25, minLines: 2 };
  if (activityType === "pronunciation") return { minWords: 12, minLines: 1 };
  if (activityType === "vocabulary") return { minWords: 30, minLines: 5 };
  if (activityType === "grammar") return { minWords: 24, minLines: 4 };
  if (activityType === "rewriting") return { minWords: 28, minLines: 3 };
  if (activityType === "presentation") return { minWords: 45, minLines: 3 };
  if (activityType === "weekly_challenge") return { minWords: 50, minLines: 3 };
  return { minWords: 35, minLines: 2 };
}

function lineCount(text) {
  const lines = String(text || "")
    .split(/\r?\n|[;；]/)
    .map(cleanString)
    .filter(Boolean);
  return lines.length || (cleanString(text) ? 1 : 0);
}

function keywordOverlap(model = {}, text = "") {
  const instruction = [
    model.title,
    model.activityType,
    model.learnerInstruction,
    ...(asArray(model.acceptance)),
    ...(asArray(model.deliverables)),
  ].map(cleanString).join(" ").toLowerCase();
  const answer = String(text || "").toLowerCase();
  const candidates = [...new Set((instruction.match(/[a-z]{5,}/g) || [])
    .filter((word) => !["english", "growth", "submit", "after", "first", "task", "feedback", "evaluation"].includes(word))
    .slice(0, 10))];
  if (!candidates.length) return 0.75;
  const matched = candidates.filter((word) => answer.includes(word)).length;
  return matched / candidates.length;
}

function genericIssues(input = {}) {
  const text = String(input.text || "");
  const model = input.model || {};
  const activityType = cleanString(model.activityType || input.activityType || "practice");
  const threshold = activityThreshold(activityType);
  const wordCount = words(text).length;
  const lines = lineCount(text);
  const issues = [];
  if (wordCount < Math.ceil(threshold.minWords * 0.5)) {
    issues.push({
      code: "too_short",
      severity: "block",
      message: `${activityLabel(activityType)} answer is too short; add concrete evidence before final evaluation.`,
    });
  } else if (wordCount < threshold.minWords) {
    issues.push({
      code: "below_target_detail",
      severity: "revision",
      message: `${activityLabel(activityType)} needs more detail before it is a reliable learning signal.`,
    });
  }
  if (lines < threshold.minLines) {
    issues.push({
      code: "missing_required_parts",
      severity: "revision",
      message: `Include at least ${threshold.minLines} clear parts so the AI can evaluate the task goal, repair, and reflection.`,
    });
  }
  if (keywordOverlap(model, text) < 0.2) {
    issues.push({
      code: "low_task_alignment",
      severity: "revision",
      message: "The answer does not yet show enough connection to this card's specific instruction.",
    });
  }
  return issues;
}

function scoreGeneric(input = {}) {
  const text = String(input.text || "");
  const model = input.model || {};
  const activityType = cleanString(model.activityType || input.activityType || "practice");
  const threshold = activityThreshold(activityType);
  const wordCount = words(text).length;
  const lines = lineCount(text);
  const overlap = keywordOverlap(model, text);
  const issues = genericIssues({ text, model, activityType });
  const detailScore = Math.min(30, (wordCount / Math.max(1, threshold.minWords)) * 30);
  const structureScore = Math.min(20, (lines / Math.max(1, threshold.minLines)) * 20);
  const alignmentScore = Math.min(25, Math.max(0.25, overlap) * 25);
  const reflectionScore = /\b(because|so|then|first|finally|again|improve|change|fix|next)\b/i.test(text) ? 15 : 6;
  const mechanicsScore = /[.!?。！？]\s*$/.test(text) ? 10 : 5;
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "block" ? 25 : 8), 0);
  const score = clampScore(detailScore + structureScore + alignmentScore + reflectionScore + mechanicsScore - penalty);
  return {
    activityType,
    score,
    maxScore: 100,
    passed: !issues.some((issue) => issue.severity === "block") && score >= 70,
    wordCount,
    lineCount: lines,
    issues,
    confidence: issues.some((issue) => issue.severity === "block") ? 0.78 : 0.86,
  };
}

function requirementsFor(scored = {}, stage = "final") {
  const requirements = asArray(scored.issues)
    .filter((issue) => issue.severity !== "minor")
    .map((issue) => issue.message)
    .slice(0, 5);
  if (stage === "draft") {
    requirements.push(
      "Revise at least one concrete part after AI feedback; do not only resubmit the same text.",
      "Add one short reflection sentence: what changed and why.",
    );
  } else if (!requirements.length && scored.score < 90) {
    requirements.push("Next time, make the evidence more specific and show one clear repair step.");
  } else if (!requirements.length) {
    requirements.push("This card passed; reuse the strongest expression or repair method in the next task.");
  }
  return [...new Set(requirements)].slice(0, 6);
}

function feedbackSections(model = {}, scored = {}, requirements = [], stage = "final") {
  const activityType = cleanString(scored.activityType || model.activityType);
  const label = activityLabel(activityType);
  const contract = activityCoachingContract(activityType);
  const strengths = [];
  if (scored.wordCount >= activityThreshold(activityType).minWords) strengths.push(`${label} has enough detail for feedback.`);
  if (scored.lineCount >= activityThreshold(activityType).minLines) strengths.push("The answer is split into clear parts.");
  if (scored.score >= 70) strengths.push("The task goal is sufficiently visible for this card.");
  if (!strengths.length) strengths.push("A first attempt is recorded and can now be improved.");
  const criterionFeedback = contract.rubricDimensions.slice(0, 4).map((dimension, index) => ({
    dimension,
    observation: index === 0
      ? `${label} is evaluated against this card's task goal.`
      : `This ${dimension} dimension should be visible in the revised answer.`,
    action: contract.requiredEvidence[index] || contract.revisionMoves[index] || contract.sentenceFix,
  }));
  return {
    strengths,
    focusAreas: [...new Set(asArray(requirements).concat(contract.requiredEvidence.slice(0, 2)))].slice(0, 6),
    criterionFeedback,
    rewriteChecklist: stage === "draft"
      ? contract.revisionMoves
      : contract.finalTransferMoves,
    reflectionPrompts: contract.reflectionPrompts,
    nextPractice: stage === "draft"
      ? `Submit a revised version with visible changes: ${contract.revisionMoves.slice(0, 2).join(" ")}`
      : contract.nextPractice,
    sentenceFeedback: asArray(scored.issues).slice(0, 4).map((issue) => ({
      issue: issue.message,
      fix: contract.sentenceFix,
      example: contract.exampleSentence,
    })),
  };
}

function createLearningGrowthTaskEvaluationService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const writingService = options.writingEvaluationService || createLearningGrowthWritingEvaluationService({ now });

  function evaluate(input = {}) {
    const card = input.card || {};
    const model = inferLearningTaskModelFromCard(card, input);
    const activityType = cleanString(model.activityType || "practice");
    if (activityType === "writing") {
      const writing = writingService.evaluate(input);
      return Object.assign({}, writing, {
        activityType,
        skillId: cleanString(model.skillId),
        taskModelVersion: cleanString(model.version),
      });
    }
    const stage = normalizeEvaluationStage(input.stage || input.submissionStage || input.submissionKind, "final");
    const scored = scoreGeneric({ text: input.text, model, activityType });
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
    const requirements = requirementsFor(scored, stage);
    const label = activityLabel(activityType);
    const summary = stage === "draft"
      ? `${label} draft feedback: ${scored.score}/100. Revise with visible changes before final settlement.`
      : (passed
        ? `${label} final evaluation completed: ${scored.score}/100. The card passed and can settle rewards through the service layer.`
        : `${label} still needs revision: ${scored.score}/100. Submit a revised version with clearer evidence and repair.`);
    return {
      evaluationId: createEvaluationId(input.cardId || card.id || card.todoId || "", input.text, activityType),
      submissionDigest: submissionDigest(input.text),
      stage,
      status,
      activityType,
      skillId: cleanString(model.skillId),
      taskModelVersion: cleanString(model.version),
      score: scored.score,
      maxScore: scored.maxScore,
      passed,
      confidence: scored.confidence,
      summary,
      wordCount: scored.wordCount,
      lineCount: scored.lineCount,
      revisionRequirements: requirements,
      feedbackSections: feedbackSections(model, scored, requirements, stage),
      nextStep: growthNextStepForStage(stage, passed),
      verificationMethod: "deterministic_growth_task_template",
      evidenceRefs: [
        `learning-growth-task-rubric:v1`,
        `activity:${activityType}`,
        `stage:${stage}`,
      ],
      reward: {
        eligible: passed && reward.coinAmount > 0,
        coinAmount: reward.coinAmount,
        minCoinAmount: reward.minCoins,
        maxCoinAmount: reward.maxCoins,
        breakdown: reward.breakdown,
        reason: passed ? `learning_growth_${activityType}_passed` : "revision_required_before_reward",
      },
      evaluatedAt: at,
    };
  }

  return { evaluate };
}

module.exports = {
  activityLabel,
  createLearningGrowthTaskEvaluationService,
  scoreGeneric,
};
