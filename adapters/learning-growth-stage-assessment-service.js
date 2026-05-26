"use strict";

const crypto = require("node:crypto");
const {
  CARD_ROLES,
  defaultCompletionPolicyForRole,
  defaultDurationRangeForRole,
  defaultRewardCoinsForRole,
  capabilityClusterIdForCard,
} = require("./learning-growth-card-role-service");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;]+/);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function stableDigest(parts) {
  return crypto.createHash("sha256").update(parts.map(cleanString).join("|")).digest("hex").slice(0, 18);
}

function createNotFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function createLearningGrowthStageAssessmentService(options = {}) {
  const learningProgramService = options.learningProgramService;
  const repository = options.repository || learningProgramService?.repository || null;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!learningProgramService || !repository || typeof repository.upsertTaskCard !== "function") {
    throw new Error("learning growth stage assessment service requires learningProgramService and repository");
  }

  function resolveProgram(input = {}) {
    const programId = cleanString(input.programId);
    if (programId) {
      const program = learningProgramService.getProgram(programId);
      if (!program) throw createNotFound("Learning program not found");
      return program;
    }
    const programs = learningProgramService.listPrograms({
      learnerId: cleanString(input.learnerId || input.workspaceId),
      workspaceId: cleanString(input.workspaceId),
      limit: 1,
    });
    if (!programs.length) throw createNotFound("Learning program not found");
    return programs[0];
  }

  function ensureDraft(program, input = {}) {
    const draftId = cleanString(input.draftId);
    if (draftId && typeof repository.getPlanDraft === "function") {
      const existing = repository.getPlanDraft(draftId);
      if (existing) return existing;
    }
    const latest = typeof repository.latestDraftForProgram === "function" ? repository.latestDraftForProgram(program.programId) : null;
    if (latest) return latest;
    if (typeof repository.savePlanDraft !== "function") throw createNotFound("Learning plan draft not found");
    const at = now().toISOString();
    return repository.savePlanDraft({
      draftId: `lgstage_draft_${stableDigest([program.programId, at])}`,
      programId: program.programId,
      learnerId: program.learnerId,
      workspaceId: program.workspaceId,
      status: "published",
      weekStart: todayIso(now()),
      weekEnd: todayIso(now()),
      dailyPlans: [],
      reliability: { guardLevel: "manual_stage_assessment", publishBlocked: false, parentReviewRequired: false },
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    });
  }

  function buildAssessmentCard(program, draft, input = {}, cycle = {}) {
    const at = now().toISOString();
    const skillIds = asArray(input.skillIds || input.skillId || cycle.skillIds).map(cleanString).filter(Boolean).slice(0, 6);
    const domain = cleanString(input.domain || program.domain || "english");
    const duration = defaultDurationRangeForRole(CARD_ROLES.STAGE_ASSESSMENT);
    const rewardCoins = Number(input.rewardCoins || defaultRewardCoinsForRole(CARD_ROLES.STAGE_ASSESSMENT)) || 300;
    const taskCardId = cleanString(input.taskCardId) || `lgstage_${stableDigest([program.programId, draft.draftId, cleanString(input.capabilityClusterId || skillIds.join(",")), at])}`;
    const base = {
      taskCardId,
      programId: program.programId,
      draftId: draft.draftId,
      learnerId: program.learnerId,
      workspaceId: program.workspaceId,
      title: cleanString(input.title) || "Stage assessment challenge",
      domain,
      taskCardType: "challenge_card",
      cardRole: CARD_ROLES.STAGE_ASSESSMENT,
      status: "published",
      plannedDate: todayIso(now()),
      plannedMinutes: Math.max(duration.min, Math.min(duration.max, Number(input.plannedMinutes || duration.max) || duration.max)),
      skillIds,
      templateId: cleanString(input.templateId || "growth-stage-assessment-v1"),
      interactionStateMachine: [
        "receive_task",
        "learner_attempt",
        "ai_evaluation",
        "spoken_reflection",
        "reward_settlement",
        "next_task_feedback",
      ],
      sourceBasisRefs: asArray(input.sourceBasisRefs || program.sourceBasisRefs).slice(0, 12),
      curriculumRefs: asArray(input.curriculumRefs || program.curriculumRefs).slice(0, 12),
      privacyLevel: "summary_only",
      defaultRewardCoins: rewardCoins,
      configuredRewardCoins: rewardCoins,
      rewardCapCoins: rewardCoins,
      rewardPolicy: {
        maxCoins: rewardCoins,
        rewardCapCoins: rewardCoins,
        defaultCoins: rewardCoins,
        reason: "stage_assessment_completion",
      },
      completionPolicy: defaultCompletionPolicyForRole(CARD_ROLES.STAGE_ASSESSMENT),
      masteryEvidenceWeight: 1,
      capabilityClusterId: cleanString(input.capabilityClusterId || cycle.capabilityClusterId) || capabilityClusterIdForCard({ domain, skillIds }),
      stageAssessmentCycleId: cleanString(cycle.cycleId || input.cycleId),
      activationState: "active",
      activationReason: cleanString(input.activationReason || cycle.activationReason || "executor_challenge"),
      activationSource: cleanString(input.activationSource || "executor"),
      summary: compactLearningSummary(input.summary || "Formal stage assessment generated from the native Growth board.", 500),
      learnerInstruction: compactLearningSummary(input.learnerInstruction || "Complete the stage assessment carefully. This card uses the formal submit, AI evaluation, spoken reflection, and reward flow.", 900),
      instruction: compactLearningSummary(input.learnerInstruction || input.instruction || "Complete the stage assessment using the formal Growth task flow.", 900),
      taskModel: {
        version: "growth-stage-assessment-v1",
        activityType: "weekly_challenge",
        taskCardType: "challenge_card",
        interactionStateMachine: [
          "receive_task",
          "learner_attempt",
          "ai_evaluation",
          "spoken_reflection",
          "reward_settlement",
          "next_task_feedback",
        ],
        learnerInstruction: compactLearningSummary(input.learnerInstruction || input.instruction || "Complete this stage assessment in the formal Growth task flow.", 900),
        deliverables: ["stage assessment answer", "AI evaluation", "spoken reflection"],
        acceptance: ["formal answer submitted", "AI evaluation recorded", "spoken reflection accepted", "reward settlement recorded"],
      },
      createdAt: at,
      updatedAt: at,
    };
    return repository.upsertTaskCard(base);
  }

  function challenge(input = {}) {
    assertNoPrivateLearningPayload(input, "learning growth stage assessment challenge");
    const program = resolveProgram(input);
    const draft = ensureDraft(program, input);
    const cycle = repository.upsertStageAssessmentCycle({
      cycleId: cleanString(input.cycleId) || createId("lgcycle"),
      learnerId: program.learnerId,
      learnerWorkspaceId: program.learnerId,
      workspaceId: program.workspaceId,
      programId: program.programId,
      capabilityClusterId: cleanString(input.capabilityClusterId) || capabilityClusterIdForCard({ domain: input.domain || program.domain, skillIds: input.skillIds }),
      status: "active",
      triggerType: "executor_challenge",
      activationReason: cleanString(input.reason || "executor_ready"),
      activatedByPrincipalId: cleanString(input.actorPrincipalId || input.principalId || "executor"),
      activatedAt: now().toISOString(),
      dueAt: cleanString(input.dueAt),
      raw: { source: "learning_growth_stage_assessment_service" },
    });
    const taskCard = buildAssessmentCard(program, draft, input, cycle);
    const savedCycle = repository.upsertStageAssessmentCycle(Object.assign({}, cycle, {
      status: "active",
      taskCardId: taskCard.taskCardId,
      activatedAt: cycle.activatedAt || now().toISOString(),
    }));
    return { ok: true, cycle: savedCycle, taskCard };
  }

  function activate(cycleId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning growth stage assessment activation");
    const cycle = repository.getStageAssessmentCycle(cycleId);
    if (!cycle) throw createNotFound("Learning growth stage assessment cycle not found");
    const program = resolveProgram(Object.assign({}, input, {
      programId: cycle.programId,
      learnerId: cycle.learnerId,
      workspaceId: cycle.workspaceId,
    }));
    const draft = ensureDraft(program, input);
    const taskCard = cycle.taskCardId ? repository.getTaskCard(cycle.taskCardId) : null;
    const card = taskCard
      ? repository.upsertTaskCard(Object.assign({}, taskCard, { status: "published", activationState: "active" }))
      : buildAssessmentCard(program, draft, input, cycle);
    const savedCycle = repository.upsertStageAssessmentCycle(Object.assign({}, cycle, {
      status: "active",
      taskCardId: card.taskCardId,
      activationReason: cleanString(input.reason || cycle.activationReason || "owner_activation"),
      activationSource: cleanString(input.activationSource || "owner"),
      activatedByPrincipalId: cleanString(input.actorPrincipalId || input.principalId || cycle.activatedByPrincipalId),
      activatedAt: now().toISOString(),
    }));
    return { ok: true, cycle: savedCycle, taskCard: card };
  }

  return {
    activate,
    challenge,
  };
}

module.exports = {
  createLearningGrowthStageAssessmentService,
};
