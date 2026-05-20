"use strict";

const crypto = require("node:crypto");
const { createCurriculumReferenceService } = require("./curriculum-reference-service");
const { createLearnerProfileService } = require("./learner-profile-service");
const { createLearningAiReliabilityGuardService } = require("./learning-ai-reliability-guard-service");
const { createLearningEvaluationService } = require("./learning-evaluation-service");
const { createLearningFoundationImportService } = require("./learning-foundation-import-service");
const { createLearningGoalService } = require("./learning-goal-service");
const { createLearningInteractionSessionService } = require("./learning-interaction-session-service");
const { createLearningDailyPlanService } = require("./learning-daily-plan-service");
const { createLearningParentReportService } = require("./learning-parent-report-service");
const { createLearningParentReviewQueueService } = require("./learning-parent-review-queue-service");
const { createLearningParentReviewRequestService } = require("./learning-parent-review-request-service");
const { createLearningPlanDecompositionService } = require("./learning-plan-decomposition-service");
const { createLearningRewardSettlementService } = require("./learning-reward-settlement-service");
const { createLearningSkillTaxonomyService } = require("./learning-skill-taxonomy-service");
const { createLearningSourceBootstrapService } = require("./learning-source-bootstrap-service");
const { createLearningSourceDirectoryService } = require("./learning-source-directory-service");
const { createLearningSourceService } = require("./learning-source-service");
const { createLearningTaskCardService, stableTaskCardId } = require("./learning-task-card-service");
const { createLearningTemplateRegistryService } = require("./learning-template-registry-service");
const { assertNoPrivateLearningPayload } = require("./learning-record-privacy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;；、]+/);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(cleanString(dateIso))
    ? new Date(`${dateIso}T00:00:00.000Z`)
    : new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeProgramInput(input = {}, deps = {}) {
  assertNoPrivateLearningPayload(input, "learning program");
  const taxonomy = deps.taxonomy;
  const domain = taxonomy.normalizeDomain(input.domain || input.subject || "english");
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId || input.performerWorkspaceId) || workspaceId;
  const focusAreas = taxonomy.normalizeFocusAreas(
    input.focusAreas || input.focus_areas || input.scope || input.learningScope || [],
    { domain },
  );
  const startDate = cleanString(input.startDate || input.start_date) || todayIso();
  const durationDays = clampInt(input.durationDays || input.duration_days, 7, 366, 28);
  const sourceBasisRefs = uniqueStrings(input.sourceBasisRefs || input.source_basis_refs);
  const curriculumRefs = uniqueStrings(input.curriculumRefs || input.curriculum_refs);
  return {
    programId: cleanString(input.programId || input.id) || createId("lprogram"),
    workspaceId,
    learnerId,
    learnerName: cleanString(input.learnerName || input.displayName) || (learnerId === "weixin_stephen" ? "\u51e1\u51e1" : learnerId),
    title: cleanString(input.title) || "\u51e1\u51e1\u82f1\u8bed\u5feb\u901f\u63d0\u5347\u8ba1\u5212",
    domain,
    focusAreas,
    goalSummary: cleanString(input.goalSummary || input.goal || input.requirements) || "Build a balanced English growth loop across input, output, repair, and reward.",
    requirements: cleanString(input.requirements || input.goal || input.goalSummary),
    startDate,
    endDate: cleanString(input.endDate || input.end_date) || addDaysIso(startDate, durationDays - 1),
    durationDays,
    daysPerWeek: clampInt(input.daysPerWeek || input.days_per_week, 1, 7, 5),
    minutesPerDay: clampInt(input.minutesPerDay || input.minutes_per_day, 10, 90, 30),
    timeOfDay: cleanString(input.timeOfDay || input.time_of_day) || "19:30",
    intensity: cleanString(input.intensity) || "normal",
    status: cleanString(input.status) || "active",
    sourceBasisRefs,
    curriculumRefs: curriculumRefs.length ? curriculumRefs : taxonomy.defaultCurriculumRefs(domain, focusAreas),
    constraints: Object.assign({
      noRawChildContentInLogs: true,
      directDatabase: "sqlite",
    }, input.constraints && typeof input.constraints === "object" ? input.constraints : {}),
    reviewPolicy: Object.assign({
      parentReviewRequired: true,
      blockOnMissingSource: true,
      blockOnUnsupportedTaskType: true,
    }, input.reviewPolicy && typeof input.reviewPolicy === "object" ? input.reviewPolicy : {}),
  };
}

function summarizeDraft(draft = {}) {
  const dailyPlans = Array.isArray(draft.dailyPlans) ? draft.dailyPlans : [];
  return {
    draftId: draft.draftId,
    programId: draft.programId,
    status: draft.status,
    weekStart: draft.weekStart,
    weekEnd: draft.weekEnd,
    taskCount: draft.taskCount,
    reliability: draft.reliability || null,
    dailyPlans: dailyPlans.map((day) => ({
      date: day.date,
      dayIndex: day.dayIndex,
      plannedMinutes: day.plannedMinutes,
      tasks: (day.tasks || []).map((task) => ({
        taskId: task.taskId,
        title: task.title,
        taskCardType: task.taskCardType,
        skillIds: task.skillIds,
        templateId: task.templateId,
        plannedMinutes: task.plannedMinutes,
        confidence: task.confidence,
      })),
    })),
  };
}

function assertDraftCanBeRebuilt(repository, draft = {}) {
  if (!draft?.draftId) return { taskCards: [], publications: [] };
  const taskCards = repository.listTaskCards({ draftId: draft.draftId, limit: 300 });
  const publications = typeof repository.listPublications === "function"
    ? repository.listPublications({ draftId: draft.draftId, limit: 20 })
    : [];
  const unsafeTask = taskCards.find((task) => !["planned", "review_required", "blocked"].includes(String(task.status || "")));
  const unsafeDraftStatus = ["published", "publish_failed"].includes(String(draft.status || ""));
  if (unsafeTask || unsafeDraftStatus || publications.length) {
    const err = new Error("Learning draft already has published or executable records");
    err.status = 409;
    throw err;
  }
  return { taskCards, publications };
}

function publishResultCards(result = {}) {
  if (Array.isArray(result?.kanbanResult?.cards)) return result.kanbanResult.cards;
  if (Array.isArray(result?.cards)) return result.cards;
  return [];
}

function publicKanbanCardId(entry = {}) {
  return cleanString(entry.card?.id || entry.cardId || entry.id || entry.todoId || entry.todo_id);
}

function createLearningProgramService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertProgram !== "function") {
    throw new Error("learning program service requires repository");
  }
  const taxonomy = options.taxonomy || createLearningSkillTaxonomyService();
  const templateRegistry = options.templateRegistry || createLearningTemplateRegistryService();
  const decompositionService = options.decompositionService || createLearningPlanDecompositionService({
    extractJsonObject: options.extractJsonObject,
    findWorkspace: options.findWorkspace,
    hermesModelText: options.hermesModelText,
    listSources: (filters) => sourceService.list(filters),
    model: options.automationCreateModel || options.model,
    requireModel: options.requireModelForPlanDecomposition === true,
    sanitizePolicy: options.sanitizePolicy,
    templateRegistry,
  });
  const reliabilityGuard = options.reliabilityGuard || createLearningAiReliabilityGuardService();
  const reviewQueue = options.reviewQueue || createLearningParentReviewQueueService({ repository });
  const publishService = options.publishService || null;
  const sourceService = options.sourceService || createLearningSourceService({ repository });
  const sourceDirectoryService = options.sourceDirectoryService || createLearningSourceDirectoryService({
    sourceService,
    dataDir: options.dataDir,
    ownerDriveRoot: options.ownerDriveRoot,
    bindings: options.sourceDirectoryBindings,
  });
  const goalService = options.goalService || createLearningGoalService({ repository, taxonomy });
  const curriculumReferenceService = options.curriculumReferenceService || createCurriculumReferenceService({ repository });
  const learnerProfileService = options.learnerProfileService || createLearnerProfileService({ repository });
  const taskCardService = options.taskCardService || createLearningTaskCardService({ repository });
  const dailyPlanService = options.dailyPlanService || createLearningDailyPlanService({ taskCardService });
  const interactionSessionService = options.interactionSessionService || createLearningInteractionSessionService({ repository });
  const parentReviewRequestService = options.parentReviewRequestService || createLearningParentReviewRequestService({ repository });
  const evaluationService = options.evaluationService || createLearningEvaluationService({ repository, reviewRequestService: parentReviewRequestService });
  const rewardSettlementService = options.rewardSettlementService || createLearningRewardSettlementService({
    repository,
    learningCoinService: options.learningCoinService || null,
    parentReviewRequestService,
  });
  const foundationImportService = options.foundationImportService || createLearningFoundationImportService({
    repository,
    sourceService,
    goalService,
  });
  const sourceBootstrapService = options.sourceBootstrapService || createLearningSourceBootstrapService({
    sourceDirectoryService,
    goalService,
    learnerProfileService,
    listPrograms,
    createProgram,
    updateProgram,
  });
  const parentReportService = options.parentReportService || createLearningParentReportService({ repository });

  function createProgram(input = {}) {
    const program = normalizeProgramInput(input, { taxonomy });
    const explicitCurriculumRefs = uniqueStrings(input.curriculumRefs || input.curriculum_refs);
    if (!explicitCurriculumRefs.length) {
      program.curriculumRefs = curriculumReferenceService.referenceIds({
        domain: program.domain,
        focusAreas: program.focusAreas,
        limit: 5,
      });
    }
    if (!program.sourceBasisRefs.length) {
      const existingRefs = sourceService.basisRefs({
        learnerId: program.learnerId,
        workspaceId: program.workspaceId,
        limit: 20,
      });
      const goalRefs = goalService.list({
        learnerId: program.learnerId,
        workspaceId: program.workspaceId,
        status: "active",
        limit: 20,
      }).map((goal) => goal.goalRef).filter(Boolean);
      program.sourceBasisRefs = uniqueStrings(existingRefs.concat(goalRefs)).slice(0, 40);
      if (!program.sourceBasisRefs.length) {
        const parentSource = sourceService.save({
          workspaceId: program.workspaceId,
          learnerId: program.learnerId,
          sourceType: "parent_config",
          title: program.title,
          summary: program.goalSummary,
          confidence: 0.75,
          tags: ["program_seed"],
        });
        program.sourceBasisRefs = [parentSource.sourceRef];
      }
    }
    return repository.upsertProgram(program);
  }

  function updateProgram(programId, patch = {}) {
    const current = repository.getProgram(programId);
    if (!current) {
      const err = new Error("Learning program not found");
      err.status = 404;
      throw err;
    }
    return repository.upsertProgram(normalizeProgramInput(Object.assign({}, current, patch, { programId }), { taxonomy }));
  }

  function listPrograms(filters = {}) {
    return repository.listPrograms(filters);
  }

  function listSources(filters = {}) {
    return sourceService.list(filters);
  }

  function listGoals(filters = {}) {
    return goalService.list(filters);
  }

  function getProgram(programId) {
    return repository.getProgram(programId);
  }

  async function draftPlan(programId) {
    const program = getProgram(programId);
    if (!program) {
      const err = new Error("Learning program not found");
      err.status = 404;
      throw err;
    }
    const built = await decompositionService.buildDraft(program);
    const draftBase = Object.assign({}, built, {
      draftId: createId("ldraft"),
      programId: program.programId,
      learnerId: program.learnerId,
      workspaceId: program.workspaceId,
      status: "draft",
    });
    const reliability = reliabilityGuard.evaluatePlanDraft({ program, draft: draftBase });
    const draft = repository.savePlanDraft(Object.assign({}, draftBase, {
      reliability,
      status: reliability.publishBlocked ? "blocked" : (reliability.parentReviewRequired ? "review_required" : "ready"),
    }));
    const taskCards = taskCardService.materializeDraft({ program, draft });
    let reviewItem = null;
    if (reliability.parentReviewRequired) {
      reviewItem = reviewQueue.createReviewItem({
        programId: program.programId,
        draftId: draft.draftId,
        learnerId: program.learnerId,
        workspaceId: program.workspaceId,
        status: "pending",
        reason: reliability.publishBlocked ? "blocked_by_reliability_guard" : "parent_review_required",
        summary: `${program.title}: ${draft.taskCount} planned tasks, ${reliability.riskFlags.length} reliability flags.`,
        riskFlags: reliability.riskFlags,
        allowedActions: reliability.allowedActions,
      });
    }
    return { ok: true, program, draft, taskCards, reviewItem };
  }

  async function rebuildDraftPlan(programId, input = {}) {
    const program = getProgram(programId);
    if (!program) {
      const err = new Error("Learning program not found");
      err.status = 404;
      throw err;
    }
    const currentDraft = input.draftId ? repository.getPlanDraft(input.draftId) : repository.latestDraftForProgram(programId);
    const removed = {
      draftId: currentDraft?.draftId || "",
      taskCards: 0,
      reviewItems: 0,
    };
    if (currentDraft) {
      const safety = assertDraftCanBeRebuilt(repository, currentDraft);
      removed.taskCards = safety.taskCards.length;
      removed.reviewItems = repository.listReviewItems({ learnerId: program.learnerId, status: "pending", limit: 200 })
        .filter((item) => item.draftId === currentDraft.draftId).length;
      repository.deletePlanDraft(currentDraft.draftId);
    }
    const rebuilt = await draftPlan(programId);
    return Object.assign({ rebuilt: true, removed }, rebuilt);
  }

  async function publishProgram(programId, input = {}) {
    if (!publishService || typeof publishService.publish !== "function") {
      const err = new Error("Learning program publish service is not configured");
      err.status = 503;
      throw err;
    }
    const program = getProgram(programId);
    if (!program) {
      const err = new Error("Learning program not found");
      err.status = 404;
      throw err;
    }
    const draft = input.draftId ? repository.getPlanDraft(input.draftId) : repository.latestDraftForProgram(programId);
    if (!draft) {
      const err = new Error("Learning plan draft not found");
      err.status = 404;
      throw err;
    }
    if (draft.reliability?.publishBlocked) {
      const err = new Error("Learning draft is blocked by reliability guard");
      err.status = 409;
      throw err;
    }
    if (String(draft.status || "") === "published") {
      const taskCards = taskCardService.materializeDraft({ program, draft });
      const existingPublication = typeof repository.listPublications === "function"
        ? repository.listPublications({ draftId: draft.draftId, limit: 1 })[0] || null
        : null;
      const linkedTaskCards = linkPublishedKanbanCards({ draft, taskCards, publication: existingPublication });
      const publishedSessions = ensurePublishedTaskSessions(linkedTaskCards, input);
      return {
        ok: true,
        alreadyPublished: true,
        program,
        draft,
        publication: existingPublication,
        result: { ok: true, alreadyPublished: true },
        taskCards: linkedTaskCards,
        publishedSessions,
      };
    }
    const pendingReviews = reviewQueue.list({ learnerId: program.learnerId, status: "pending", limit: 50 })
      .filter((item) => item.programId === program.programId && item.draftId === draft.draftId);
    if (pendingReviews.length && !input.force) {
      const err = new Error("Learning draft still needs parent review");
      err.status = 409;
      throw err;
    }
    const result = await publishService.publish({ program, draft });
    const resultDraft = result?.draft && result.draft.draftId === draft.draftId ? result.draft : draft;
    const now = new Date().toISOString();
    const savedDraft = repository.savePlanDraft(Object.assign({}, resultDraft, {
      status: result.ok ? "published" : "publish_failed",
      publishedAt: result.ok ? now : resultDraft.publishedAt,
    }));
    const publication = repository.savePublication({
      publicationId: createId("lpub"),
      programId: program.programId,
      draftId: draft.draftId,
      learnerId: program.learnerId,
      workspaceId: program.workspaceId,
      status: result.ok ? "published" : "failed",
      kanbanResult: result.kanbanResult || result,
      createdAt: now,
    });
    const taskCards = result.ok ? taskCardService.materializeDraft({ program, draft: savedDraft }) : [];
    const linkedTaskCards = result.ok ? linkPublishedKanbanCards({ draft: savedDraft, taskCards, publication }) : taskCards;
    const publishedSessions = result.ok ? ensurePublishedTaskSessions(linkedTaskCards, input) : [];
    return { ok: result.ok, program, draft: savedDraft, publication, result, taskCards: linkedTaskCards, publishedSessions };
  }

  function reviewQueueList(filters = {}) {
    return reviewQueue.list(filters);
  }

  function linkPublishedKanbanCards(input = {}) {
    const draft = input.draft || {};
    const taskCards = Array.isArray(input.taskCards) ? input.taskCards : [];
    const resultCards = publishResultCards(input.publication || {});
    if (!taskCards.length || !resultCards.length) return taskCards;
    const updated = taskCards.slice();
    resultCards.forEach((entry, index) => {
      const cardId = publicKanbanCardId(entry);
      if (!cardId) return;
      const clientId = cleanString(entry.clientId || entry.caseCardId || entry.card?.kanbanCaseCardId || entry.card?.caseCardId);
      const stableId = clientId && draft.draftId ? stableTaskCardId(draft.draftId, clientId) : "";
      const stableIndex = stableId ? updated.findIndex((task) => task.taskCardId === stableId) : -1;
      const taskIndex = stableIndex >= 0 ? stableIndex : index;
      const task = updated[taskIndex];
      if (!task?.taskCardId || task.kanbanCardId === cardId) return;
      updated[taskIndex] = repository.upsertTaskCard(Object.assign({}, task, { kanbanCardId: cardId }));
    });
    return updated;
  }

  function ensurePublishedTaskSessions(taskCards = [], input = {}) {
    if (input.autoStartSessions === false || input.auto_start_sessions === false) return [];
    const sessions = [];
    for (const task of Array.isArray(taskCards) ? taskCards : []) {
      if (!task?.taskCardId || String(task.status || "") !== "published") continue;
      const existing = repository.listInteractionSessions({ taskCardId: task.taskCardId, limit: 1 })[0];
      if (existing) {
        sessions.push(existing);
        continue;
      }
      sessions.push(interactionSessionService.startSession(task.taskCardId, {
        actor: cleanString(input.actor || input.principalId) || "system",
        summary: `Published learning task: ${task.title || task.taskCardId}`,
      }));
    }
    return sessions;
  }

  async function decideReview(reviewId, decisionInput = {}) {
    const reviewItem = reviewQueue.decide(reviewId, decisionInput);
    const decision = cleanString(decisionInput.decision || decisionInput.status);
    const response = {
      reviewItem,
      autoPublish: null,
    };
    if (decision !== "approved" || !reviewItem?.programId || !reviewItem?.draftId) return response;
    const draft = repository.getPlanDraft(reviewItem.draftId);
    const program = getProgram(reviewItem.programId);
    if (!draft || !program || draft.reliability?.publishBlocked) return response;
    const remainingReviews = reviewQueue.list({ learnerId: program.learnerId, status: "pending", limit: 50 })
      .filter((item) => item.programId === program.programId && item.draftId === draft.draftId);
    if (remainingReviews.length) return response;
    response.autoPublish = await publishProgram(program.programId, {
      draftId: draft.draftId,
      principalId: decisionInput.principalId,
      actor: decisionInput.principalId || "owner",
      autoStartSessions: decisionInput.autoStartSessions !== false,
    });
    return response;
  }

  function overview(input = {}) {
    const learnerId = cleanString(input.learnerId || input.studentId) || "";
    const workspaceId = cleanString(input.workspaceId) || "";
    const programs = repository.listPrograms({ learnerId, workspaceId, limit: input.limit || 20 });
    const latestDrafts = programs.map((program) => repository.latestDraftForProgram(program.programId)).filter(Boolean).map(summarizeDraft);
    const reviewItems = repository.listReviewItems({ learnerId, status: "pending", limit: 20 });
    const sources = sourceService.list({ learnerId, workspaceId, limit: 30 });
    const sourceDirectories = sourceDirectoryService.listBindings({ learnerId, workspaceId });
    const goals = goalService.list({ learnerId, workspaceId, limit: 30 });
    const profile = learnerProfileService.get({ learnerId, workspaceId });
    const curriculumReferences = curriculumReferenceService.listReferences({ limit: 20 });
    const taskCards = taskCardService.list({ learnerId, workspaceId, limit: input.limit || 20 });
    const executableTasks = taskCardService.listExecutorQueue({ learnerId, workspaceId, limit: input.limit || 20 });
    const interactionSessions = interactionSessionService.list({ learnerId, workspaceId, limit: input.limit || 20 });
    const evaluations = evaluationService.list({ learnerId, workspaceId, limit: input.limit || 20 });
    const taskSubmissions = typeof repository.listTaskSubmissions === "function"
      ? repository.listTaskSubmissions({ learnerId, workspaceId, limit: input.limit || 20 })
      : [];
    const taskReflections = typeof repository.listTaskReflections === "function"
      ? repository.listTaskReflections({ learnerId, workspaceId, limit: input.limit || 20 })
      : [];
    const currentDailyPlan = dailyPlanService.dailyPlan({ learnerId, workspaceId, days: input.days || 7, limit: input.limit || 50 });
    const parentReviewRequests = parentReviewRequestService.list({ learnerId, workspaceId, status: input.reviewStatus || "pending", limit: input.limit || 20 });
    const rewardSettlements = rewardSettlementService.list({ learnerId, workspaceId, limit: input.limit || 20 });
    return {
      counts: repository.counts({ learnerId }),
      programs,
      latestDrafts,
      reviewItems,
      sources,
      sourceDirectories,
      goals,
      dailyPlan: currentDailyPlan,
      taskCards,
      executableTasks,
      interactionSessions,
      evaluations,
      taskSubmissions,
      taskReflections,
      parentReviewRequests,
      rewardSettlements,
      learnerProfile: profile.profile,
      skillStates: profile.skillStates,
      curriculumReferences,
      taxonomy: {
        domains: ["english", "math", "programming"],
        englishSkills: taxonomy.skillSummary(taxonomy.normalizeFocusAreas([], { domain: "english" })),
      },
      templates: templateRegistry.listTemplates({ domain: "english" }).map((template) => ({
        id: template.id,
        taskCardType: template.taskCardType,
        skillIds: template.skillIds,
        outputContract: template.outputContract,
      })),
    };
  }

  function saveSource(input = {}) {
    return sourceService.save(input);
  }

  function listSourceDirectories(filters = {}) {
    return sourceDirectoryService.listBindings(filters);
  }

  function importSourceDirectory(input = {}) {
    return sourceDirectoryService.importSummaries(input);
  }

  function bootstrapFromSourceDirectory(input = {}) {
    return sourceBootstrapService.bootstrap(input);
  }

  function saveGoal(input = {}) {
    return goalService.save(input);
  }

  function updateGoal(goalId, patch = {}) {
    return goalService.update(goalId, patch);
  }

  function getLearnerProfile(input = {}) {
    return learnerProfileService.get(input);
  }

  function rebuildLearnerProfile(input = {}) {
    return learnerProfileService.rebuild(input);
  }

  function listCurriculumReferences(filters = {}) {
    return curriculumReferenceService.listReferences(filters);
  }

  function listTaskCards(filters = {}) {
    return taskCardService.list(filters);
  }

  function listExecutorTaskQueue(filters = {}) {
    return taskCardService.listExecutorQueue(filters);
  }

  function dailyPlan(filters = {}) {
    return dailyPlanService.dailyPlan(filters);
  }

  function getTaskCard(taskCardId) {
    return taskCardService.get(taskCardId);
  }

  function getTaskCardForKanbanCard(kanbanCardId, filters = {}) {
    const id = cleanString(kanbanCardId);
    if (!id) return null;
    return repository.listTaskCards(Object.assign({}, filters, { kanbanCardId: id, limit: 1 }))[0] || null;
  }

  function startTaskSession(taskCardId, input = {}) {
    return interactionSessionService.startSession(taskCardId, input);
  }

  function listInteractionSessions(filters = {}) {
    return interactionSessionService.list(filters);
  }

  function getInteractionSession(sessionId) {
    return interactionSessionService.get(sessionId);
  }

  function advanceInteractionSession(sessionId, input = {}) {
    return interactionSessionService.advanceSession(sessionId, input);
  }

  function recordEvaluation(sessionId, input = {}) {
    return evaluationService.recordEvaluation(sessionId, input);
  }

  function listEvaluations(filters = {}) {
    return evaluationService.list(filters);
  }

  function listTaskSubmissions(filters = {}) {
    return typeof repository.listTaskSubmissions === "function" ? repository.listTaskSubmissions(filters) : [];
  }

  function listTaskReflections(filters = {}) {
    return typeof repository.listTaskReflections === "function" ? repository.listTaskReflections(filters) : [];
  }

  function settleEvaluationReward(evaluationId, input = {}) {
    return rewardSettlementService.settleEvaluationReward(evaluationId, input);
  }

  function listRewardSettlements(filters = {}) {
    return rewardSettlementService.list(filters);
  }

  function getRewardSettlement(rewardSettlementId) {
    return rewardSettlementService.get(rewardSettlementId);
  }

  function listParentReviewRequests(filters = {}) {
    return parentReviewRequestService.list(filters);
  }

  function decideParentReviewRequest(reviewRequestId, input = {}) {
    return parentReviewRequestService.decide(reviewRequestId, input);
  }

  function importFoundationData(input = {}) {
    return foundationImportService.importFoundation(input);
  }

  function generateParentReport(input = {}) {
    return parentReportService.generateReport(input);
  }

  return {
    createProgram,
    dailyPlan,
    decideParentReviewRequest,
    decideReview,
    draftPlan,
    rebuildDraftPlan,
    generateParentReport,
    getProgram,
    getLearnerProfile,
    getInteractionSession,
    getRewardSettlement,
    getTaskCard,
    getTaskCardForKanbanCard,
    importFoundationData,
    importSourceDirectory,
    listEvaluations,
    listExecutorTaskQueue,
    listInteractionSessions,
    listParentReviewRequests,
    listPrograms,
    listRewardSettlements,
    listTaskReflections,
    listTaskSubmissions,
    listGoals,
    listSourceDirectories,
    listSources,
    listTaskCards,
    listCurriculumReferences,
    overview,
    publishProgram,
    rebuildLearnerProfile,
    recordEvaluation,
    settleEvaluationReward,
    repository,
    reviewQueue: reviewQueueList,
    saveGoal,
    saveSource,
    startTaskSession,
    advanceInteractionSession,
    bootstrapFromSourceDirectory,
    updateGoal,
    updateProgram,
  };
}

module.exports = {
  createLearningProgramService,
  normalizeProgramInput,
  summarizeDraft,
};
