"use strict";

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values, limit = 6) {
  return [...new Set(asArray(values).map((value) => cleanString(value)).filter(Boolean))].slice(0, limit);
}

function masteryWeaknesses(profile = {}) {
  return asArray(profile.weaknesses || profile.skillStates)
    .filter((state) => state.status === "needs_repair" || numberValue(state.negativeEvidenceCount) > numberValue(state.positiveEvidenceCount))
    .sort((a, b) => numberValue(b.negativeEvidenceCount) - numberValue(a.negativeEvidenceCount));
}

function masteryStrengths(profile = {}) {
  return asArray(profile.strengths || profile.skillStates)
    .filter((state) => state.status === "mastered" || numberValue(state.positiveEvidenceCount) > numberValue(state.negativeEvidenceCount))
    .sort((a, b) => numberValue(b.confidence) - numberValue(a.confidence));
}

function repeatedRecentStrategy(recentTrajectory = [], strategy) {
  return asArray(recentTrajectory).slice(0, 3).filter((item) => item.strategy === strategy).length;
}

function latestScore(evaluation = {}) {
  return numberValue(evaluation.score, 0);
}

function reflectionAccepted(reflection = {}) {
  const status = cleanString(reflection.status || reflection.result || reflection.decision).toLowerCase();
  return ["accepted", "passed", "complete", "completed", "done"].includes(status) || reflection.accepted === true;
}

function inferGradeReference(currentTask = {}, masteryProfile = {}) {
  return cleanString(
    currentTask.gradeReference
      || currentTask.taskModel?.gradeReference
      || masteryProfile.gradeReference
      || "international_pathway",
  );
}

function createLearningGrowthNextCardStrategyService() {
  function recommendNextCardStrategy(input = {}) {
    const masteryProfile = input.masteryProfile || {};
    const recentTrajectory = asArray(input.recentTrajectory);
    const latestEvaluation = input.latestEvaluation || {};
    const latestReflection = input.latestReflection || {};
    const currentTask = input.currentTask || {};
    const weaknesses = masteryWeaknesses(masteryProfile);
    const strengths = masteryStrengths(masteryProfile);
    const score = latestScore(latestEvaluation);
    const scoreKnown = latestEvaluation && latestEvaluation.score !== undefined && latestEvaluation.score !== null;
    const threeAttemptCompletion = cleanString(latestEvaluation.completionDecision).toLowerCase() === "complete_current_card"
      && latestEvaluation.completionPolicy?.threeSeriousSubmissionsComplete === true;
    let strategy = "stabilize";
    let difficultyBand = "steady";
    let difficultyAdjustment = "same_level_targeted";
    let supportLevel = "light_guidance";
    let transferLevel = "same_context";
    let reason = "Use the current capability profile to stabilize the next learning step.";

    if ((scoreKnown && score < 70) || threeAttemptCompletion || weaknesses.length >= 2) {
      strategy = "repair";
      difficultyBand = "repair";
      difficultyAdjustment = "same_level_narrower_scope";
      supportLevel = "guided";
      transferLevel = "same_context";
      reason = "Recent evidence shows a weak or fragile skill; narrow the next card and repair it before stretching.";
    } else if (repeatedRecentStrategy(recentTrajectory, "repair") >= 2) {
      strategy = "stabilize";
      difficultyBand = "steady";
      difficultyAdjustment = "same_level_stabilize";
      supportLevel = "light_guidance";
      reason = "Recent cards already focused on repair; check stability before increasing difficulty.";
    } else if (scoreKnown && score >= 85 && reflectionAccepted(latestReflection) && strengths.length >= 1) {
      strategy = "stretch";
      difficultyBand = "stretch";
      difficultyAdjustment = "above_current_grade_when_ready";
      supportLevel = "independent_with_light_prompt";
      transferLevel = "near_transfer";
      reason = "Recent evidence is strong enough to stretch beyond the current school-grade reference when appropriate.";
    } else if (strengths.length >= 1 && weaknesses.length === 0) {
      strategy = "transfer";
      difficultyBand = "steady";
      difficultyAdjustment = "same_or_near_level_new_context";
      supportLevel = "light_guidance";
      transferLevel = "near_transfer";
      reason = "Current skill looks stable; test whether it transfers to a nearby context.";
    }

    const targetSkillIds = strategy === "stretch"
      ? unique(strengths.map((state) => state.skillId), 2)
      : unique(weaknesses.map((state) => state.skillId).concat(asArray(currentTask.skillIds), currentTask.taskModel?.skillId), 2);
    const supportSkillIds = unique(strengths.map((state) => state.skillId).filter((skillId) => !targetSkillIds.includes(skillId)), 2);

    return {
      strategy,
      targetSkillIds,
      supportSkillIds,
      difficultyAdjustment,
      difficultyBand,
      gradeReference: inferGradeReference(currentTask, masteryProfile),
      allowAboveGrade: true,
      supportLevel,
      transferLevel,
      reason,
      evidenceBasis: {
        latestScore: scoreKnown ? score : null,
        weaknessCount: weaknesses.length,
        strengthCount: strengths.length,
        recentTrajectory: recentTrajectory.slice(0, 5).map((item) => ({
          taskCardId: item.taskCardId,
          strategy: item.strategy,
          difficultyBand: item.difficultyBand,
        })),
      },
    };
  }

  return {
    recommendNextCardStrategy,
  };
}

module.exports = {
  createLearningGrowthNextCardStrategyService,
};
