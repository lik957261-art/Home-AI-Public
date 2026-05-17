"use strict";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasOwn(record, key) {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function count(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    if (Number.isFinite(Number(value.totalTasks))) return Number(value.totalTasks);
    if (Number.isFinite(Number(value.count))) return Number(value.count);
    return Object.keys(value).length;
  }
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function check(id, label, ready, details = {}) {
  return {
    id,
    label,
    status: ready ? "ready" : "needs_data",
    ready: Boolean(ready),
    details,
  };
}

function percent(checks) {
  const items = asArray(checks);
  if (!items.length) return 100;
  return Math.round((items.filter((item) => item.ready).length / items.length) * 100);
}

function containsPrivateLearningPayload(value) {
  const text = JSON.stringify(value || {});
  return /rawTranscript|fullTranscript|answerKey|questionText|learnerAnswer|childAnswer|rawPrompt|apiKey|pushEndpoint|authorization|cookie/i.test(text);
}

function buildSystemChecks(programs = {}, coins = {}) {
  const hasPrograms = programs && typeof programs === "object";
  return [
    check("sqlite-learning-domain", "SQLite learning domain services", hasPrograms && hasOwn(programs, "counts"), {
      hasCounts: hasOwn(programs, "counts"),
    }),
    check("foundation-services", "Source, goal, profile, and curriculum services", hasPrograms
      && hasOwn(programs, "sources")
      && hasOwn(programs, "goals")
      && hasOwn(programs, "learnerProfile")
      && hasOwn(programs, "curriculumReferences"), {
        hasSourcesField: hasOwn(programs, "sources"),
        hasGoalsField: hasOwn(programs, "goals"),
        hasProfileField: hasOwn(programs, "learnerProfile"),
        hasCurriculumField: hasOwn(programs, "curriculumReferences"),
      }),
    check("planning-services", "Program, draft, task-card, and daily-plan services", hasPrograms
      && hasOwn(programs, "programs")
      && hasOwn(programs, "latestDrafts")
      && hasOwn(programs, "taskCards")
      && hasOwn(programs, "dailyPlan"), {
        hasProgramsField: hasOwn(programs, "programs"),
        hasDraftsField: hasOwn(programs, "latestDrafts"),
        hasTaskCardsField: hasOwn(programs, "taskCards"),
        hasDailyPlanField: hasOwn(programs, "dailyPlan"),
      }),
    check("execution-loop-services", "Task session and evaluation services", hasPrograms
      && hasOwn(programs, "interactionSessions")
      && hasOwn(programs, "evaluations"), {
        hasSessionsField: hasOwn(programs, "interactionSessions"),
        hasEvaluationsField: hasOwn(programs, "evaluations"),
      }),
    check("review-reward-services", "Parent review, reward settlement, and coin subsystem", hasPrograms
      && hasOwn(programs, "reviewItems")
      && hasOwn(programs, "parentReviewRequests")
      && hasOwn(programs, "rewardSettlements")
      && Boolean(coins && typeof coins === "object"), {
        hasReviewQueueField: hasOwn(programs, "reviewItems"),
        hasParentReviewField: hasOwn(programs, "parentReviewRequests"),
        hasRewardSettlementField: hasOwn(programs, "rewardSettlements"),
        hasCoinSummary: Boolean(coins && typeof coins === "object"),
      }),
    check("privacy-minimal-projection", "Summary-only privacy projection", !containsPrivateLearningPayload(programs), {
      privatePayloadDetected: containsPrivateLearningPayload(programs),
    }),
  ];
}

function buildLearnerDataChecks(programs = {}, coins = {}) {
  const dailySummary = programs?.dailyPlan?.summary || {};
  return [
    check("source-goal-data", "At least one source and one goal", count(programs.sources) > 0 && count(programs.goals) > 0, {
      sources: count(programs.sources),
      goals: count(programs.goals),
    }),
    check("program-config-data", "At least one learning program", count(programs.programs) > 0, {
      programs: count(programs.programs),
    }),
    check("draft-or-task-data", "Plan draft or task cards exist", count(programs.latestDrafts) > 0 || count(programs.taskCards) > 0, {
      drafts: count(programs.latestDrafts),
      taskCards: count(programs.taskCards),
    }),
    check("daily-plan-data", "Daily plan has executable tasks", count(dailySummary.totalTasks) > 0 || count(programs.dailyPlan?.nextTask) > 0, {
      totalTasks: count(dailySummary.totalTasks),
      hasNextTask: Boolean(programs.dailyPlan?.nextTask),
    }),
    check("interaction-session-data", "At least one interaction session", count(programs.interactionSessions) > 0, {
      sessions: count(programs.interactionSessions),
    }),
    check("evaluation-data", "At least one summary-only evaluation", count(programs.evaluations) > 0, {
      evaluations: count(programs.evaluations),
    }),
    check("reward-or-review-data", "Reward settlement, review request, or coin history exists", count(programs.rewardSettlements) > 0
      || count(programs.parentReviewRequests) > 0
      || count(coins?.ledger) > 0
      || count(coins?.balances?.earnedCoins) > 0, {
        rewardSettlements: count(programs.rewardSettlements),
        parentReviewRequests: count(programs.parentReviewRequests),
        ledgerRows: count(coins?.ledger),
        earnedCoins: count(coins?.balances?.earnedCoins),
      }),
  ];
}

function nextActionsFromChecks(checks) {
  return asArray(checks)
    .filter((item) => !item.ready)
    .map((item) => ({ checkId: item.id, reason: item.label }))
    .slice(0, 12);
}

function createLearningV1ReadinessService() {
  function evaluate(input = {}) {
    const programs = input.programs || {};
    const coins = input.coins || {};
    const systemChecks = buildSystemChecks(programs, coins);
    const learnerDataChecks = buildLearnerDataChecks(programs, coins);
    const systemReadinessPercent = percent(systemChecks);
    const learnerDataReadinessPercent = percent(learnerDataChecks);
    const systemReady = systemReadinessPercent === 100;
    const learnerDataReady = learnerDataReadinessPercent === 100;
    const operationalTestReady = systemReady && learnerDataReady;
    return {
      version: "learning-growth-v1",
      status: operationalTestReady ? "operational_ready" : (systemReady ? "system_ready" : "blocked"),
      operationalTestReady,
      systemReady,
      learnerDataReady,
      systemReadinessPercent,
      learnerDataReadinessPercent,
      summary: {
        systemReadyChecks: systemChecks.filter((item) => item.ready).length,
        systemTotalChecks: systemChecks.length,
        learnerReadyChecks: learnerDataChecks.filter((item) => item.ready).length,
        learnerTotalChecks: learnerDataChecks.length,
      },
      checks: {
        system: systemChecks,
        learnerData: learnerDataChecks,
      },
      nextActions: nextActionsFromChecks(systemChecks.concat(learnerDataChecks)),
    };
  }

  return { evaluate };
}

module.exports = {
  buildLearnerDataChecks,
  buildSystemChecks,
  createLearningV1ReadinessService,
};
