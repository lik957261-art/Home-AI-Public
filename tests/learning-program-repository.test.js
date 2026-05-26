"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
  createLearningProgramRepository,
  stripPrivateLearningFields,
} = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-program-repo-"));
}

function sampleProgram() {
  return {
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_reading_comprehension", "english_speaking_retell"],
    goalSummary: "Fast English growth",
    startDate: "2026-05-16",
    endDate: "2026-06-12",
    daysPerWeek: 5,
    minutesPerDay: 30,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
    constraints: { noRawChildContentInLogs: true },
    reviewPolicy: { parentReviewRequired: true },
  };
}

function testMigrationAndPersistence() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  repository.migrate();
  const integrity = repository.integritySummary();
  assert.equal(integrity.schemaVersion, CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION);
  assert.equal(integrity.quickCheck, "ok");

  const program = repository.upsertProgram(sampleProgram());
  assert.equal(program.programId, "program-1");
  assert.equal(program.learnerId, "weixin_stephen");
  assert.deepEqual(program.focusAreas, ["english_reading_comprehension", "english_speaking_retell"]);

  const draft = repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "review_required",
    weekStart: "2026-05-16",
    weekEnd: "2026-05-20",
    dailyPlans: [{ date: "2026-05-16", tasks: [{ taskId: "t1" }, { taskId: "t2" }] }],
    reliability: { publishBlocked: false, parentReviewRequired: true },
  });
  assert.equal(draft.taskCount, 2);

  const taskCard = repository.upsertTaskCard({
    taskCardId: "task-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "Speaking task",
    domain: "english",
    taskCardType: "single_subject",
    status: "planned",
    plannedDate: "2026-05-16",
    plannedMinutes: 15,
    skillIds: ["english_speaking_retell"],
    templateId: "english-speaking-retell-v1",
    interactionStateMachine: ["receive_task", "learner_attempt", "ai_evaluation"],
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
    privacyLevel: "summary_only",
    reliability: { confidence: 0.8 },
    learnerAnswer: "must not be exposed",
  });
  assert.equal(taskCard.taskCardId, "task-1");
  assert.equal(taskCard.learnerAnswer, "[redacted]");
  assert.equal(taskCard.cardRole, "teaching");
  assert.equal(taskCard.completionPolicy.mode, "lightweight_teaching_check");
  assert.equal(taskCard.rewardPolicy.maxCoins, 100);
  assert.deepEqual(taskCard.expectedDurationMinutes, { min: 10, max: 15 });
  assert.ok(taskCard.teachingFlow.lesson.explanation);

  const signal = repository.saveExperienceSignal({
    signalId: "signal-1",
    taskCardId: "task-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    learnerWorkspaceId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    cardRole: "teaching",
    capabilityClusterId: taskCard.capabilityClusterId,
    signalType: "too_hard",
    intensity: 1,
    summary: "summary only",
    rawAnswer: "must not be exposed",
  });
  assert.equal(signal.signalId, "signal-1");
  assert.equal(signal.rawAnswer, "[redacted]");
  assert.equal(repository.summarizeExperienceSignals({ taskCardId: "task-1" }).counts.too_hard, 1);

  const cycle = repository.upsertStageAssessmentCycle({
    cycleId: "cycle-1",
    learnerId: "weixin_stephen",
    learnerWorkspaceId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    programId: "program-1",
    capabilityClusterId: taskCard.capabilityClusterId,
    status: "scheduled",
    triggerType: "system",
  });
  assert.equal(cycle.cycleId, "cycle-1");
  assert.equal(repository.listStageAssessmentCycles({ learnerId: "weixin_stephen" }).length, 1);

  const session = repository.saveInteractionSession({
    sessionId: "session-1",
    taskCardId: "task-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "active",
    currentStep: "learner_attempt",
    stepHistory: [{ step: "receive_task", summary: "started" }],
    summary: "summary only",
    rawTranscript: "must not be exposed",
  });
  assert.equal(session.sessionId, "session-1");
  assert.equal(session.rawTranscript, "[redacted]");

  const evaluation = repository.saveEvaluation({
    evaluationId: "eval-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "passed",
    score: 82,
    passed: true,
    confidence: 0.81,
    summary: "summary only",
    skillResults: [{ skillId: "english_speaking_retell", score: 82 }],
    rewardPolicy: { coinLedgerWrite: "disabled_in_evaluation_service" },
    sourceBasisRefs: ["parent_config:program-1"],
    questionText: "must not be exposed",
  });
  assert.equal(evaluation.evaluationId, "eval-1");
  assert.equal(evaluation.questionText, "[redacted]");
  const refreshedEvaluation = repository.saveEvaluation(Object.assign({}, evaluation, {
    status: "needs_repair",
    score: 68,
    passed: false,
    confidence: 0.86,
    summary: "updated summary only",
    createdAt: "2026-05-16T10:05:00.000Z",
  }));
  assert.equal(refreshedEvaluation.evaluationId, "eval-1");
  assert.equal(refreshedEvaluation.createdAt, "2026-05-16T10:05:00.000Z");
  assert.equal(refreshedEvaluation.score, 68);
  assert.equal(repository.listEvaluations({ taskCardId: "task-1", limit: 1 })[0].createdAt, "2026-05-16T10:05:00.000Z");
  assert.equal(repository.listEvaluations({ taskCardId: "task-1" }).length, 1);

  const submission = repository.saveTaskSubmission({
    submissionId: "submission-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    stage: "draft",
    submissionKind: "learner_attempt",
    attemptNo: 1,
    status: "submitted",
    summary: "learner attempt received",
    textDigest: "digest-submission",
    textChars: 320,
    textWords: 82,
    kanbanCardId: "kanban-1",
    kanbanCommentRef: "comment-1",
    submittedAt: "2026-05-16T10:00:00.000Z",
    submissionText: "must not be exposed",
    audio: { name: "attempt.webm", mime: "audio/webm", size: 1234 },
  });
  assert.equal(submission.submissionId, "submission-1");
  assert.equal(submission.submissionText, "[redacted]");
  assert.equal(submission.textChars, 320);
  assert.equal(submission.audio.url, "/api/learning/task-submissions/submission-1/audio");

  const reflection = repository.saveTaskReflection({
    reflectionId: "reflection-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    evaluationId: "eval-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "accepted",
    mode: "spoken",
    score: 86,
    maxScore: 100,
    summary: "reflection understood the mistake",
    transcriptDigest: "digest-transcript",
    audioDigest: "digest-audio",
    evidenceRefs: ["audio:digest-audio"],
    submittedAt: "2026-05-16T10:10:00.000Z",
    transcript: "must not be exposed",
  });
  assert.equal(reflection.reflectionId, "reflection-1");
  assert.equal(reflection.transcript, "[redacted]");
  assert.equal(reflection.audioDigest, "digest-audio");

  const artifact = repository.saveTaskArtifact({
    artifactId: "artifact-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    evaluationId: "eval-1",
    submissionId: "submission-1",
    reflectionId: "reflection-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    artifactType: "feedback_report",
    title: "Feedback report",
    name: "feedback.md",
    mime: "text/markdown",
    size: 1024,
    refDigest: "digest-artifact-ref",
    refName: "feedback.md",
    status: "generated",
    summary: "feedback report generated",
    raw: {
      source: "test",
      localPath: "must not be exposed",
    },
  });
  assert.equal(artifact.artifactId, "artifact-1");
  assert.equal(artifact.refDigest, "digest-artifact-ref");
  assert.equal(artifact.localPath, "[redacted]");

  const reviewRequest = repository.saveReviewRequest({
    reviewRequestId: "review-request-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    programId: "program-1",
    requestType: "evaluation_review",
    resourceType: "evaluation",
    resourceId: "eval-1",
    idempotencyKey: "evaluation:eval-1:verification",
    status: "pending",
    reason: "model_only_verification",
    summary: "summary only",
    riskFlags: [{ code: "model_only_verification" }],
    allowedActions: ["approve", "reject"],
    sourceBasisRefs: ["parent_config:program-1"],
    answerText: "must not be exposed",
  });
  assert.equal(reviewRequest.reviewRequestId, "review-request-1");
  assert.equal(reviewRequest.answerText, "[redacted]");

  const rewardSettlement = repository.saveRewardSettlement({
    rewardSettlementId: "settle-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    programId: "program-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    evaluationId: "eval-1",
    status: "settled",
    coinAmount: 15,
    reason: "summary only reward",
    sourceType: "learning-growth-evaluation",
    sourceId: "eval-1",
    idempotencyKey: "learning-growth:evaluation:eval-1:reward",
    ledgerEntry: { id: "coin-1", coinDelta: 15 },
    answerText: "must not be exposed",
  });
  assert.equal(rewardSettlement.rewardSettlementId, "settle-1");
  assert.equal(rewardSettlement.answerText, "[redacted]");

  const review = repository.saveReviewItem({
    reviewId: "review-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "pending",
    reason: "parent_review_required",
    summary: "review needed",
    riskFlags: [{ code: "missing_curriculum_refs" }],
    allowedActions: ["parent_review", "publish"],
  });
  assert.equal(review.status, "pending");
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).pendingReviewItems, 1);

  const publication = repository.savePublication({
    publicationId: "pub-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "published",
    kanbanResult: { ok: true, cards: [{ clientId: "safe-id" }] },
  });
  assert.equal(publication.status, "published");
  const source = repository.upsertSource({
    sourceId: "source-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sourceType: "school",
    title: "School summary",
    summary: "Teacher summary only.",
    confidence: 0.8,
    sourceDate: "2026-05-16",
    tags: ["school"],
    refs: [],
    rawTranscript: "must not be exposed",
  });
  assert.equal(source.sourceRef, "school:source-1");
  assert.equal(source.rawTranscript, "[redacted]");

  const goal = repository.upsertGoal({
    goalId: "goal-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English output",
    domain: "english",
    focusAreas: ["english_short_writing"],
    targetSummary: "Improve short writing.",
    priority: 80,
    horizon: "short_term",
    startDate: "2026-05-16",
    targetDate: "2026-06-16",
    status: "active",
    successMetrics: ["weekly writing repair"],
    constraints: {},
    sourceBasisRefs: [source.sourceRef],
  });
  assert.equal(goal.goalRef, "goal:goal-1");

  const curriculum = repository.upsertCurriculumReference({
    referenceId: "cefr-test",
    domain: "english",
    title: "CEFR test reference",
    stage: "bridge",
    summary: "reference only",
    focusAreas: ["english_short_writing"],
    tags: ["cefr"],
  });
  assert.equal(curriculum.referenceId, "cefr-test");

  const skill = repository.upsertSkillState({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    skillId: "english_short_writing",
    domain: "english",
    level: "baseline",
    confidence: 0.66,
    lastEvidenceRef: source.sourceRef,
    sourceBasisRefs: [source.sourceRef, goal.goalRef],
  });
  assert.equal(skill.skillId, "english_short_writing");

  const profile = repository.upsertLearnerProfile({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    displayName: "Fanfan",
    profileSummary: "sources=1; goals=1",
    strengths: [],
    weaknesses: ["english_short_writing"],
    priorities: [{ goalId: goal.goalId }],
    skillStateSummary: [{ skillId: skill.skillId }],
    sourceBasisRefs: [source.sourceRef, goal.goalRef],
  });
  assert.equal(profile.learnerId, "weixin_stephen");

  assert.equal(repository.listPrograms({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listSources({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listGoals({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listSkillStates({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listCurriculumReferences({ domain: "english" }).length, 1);
  assert.equal(repository.listTaskCards({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listInteractionSessions({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listEvaluations({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listTaskSubmissions({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listTaskReflections({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listTaskArtifacts({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.getTaskSubmission("submission-1").kanbanCommentRef, "comment-1");
  assert.equal(repository.getTaskReflection("reflection-1").evaluationId, "eval-1");
  assert.equal(repository.getTaskArtifact("artifact-1").name, "feedback.md");
  assert.equal(repository.listReviewRequests({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listRewardSettlements({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.getRewardSettlement("settle-1").coinAmount, 15);
  const aiRecommendation = repository.saveTaskSeriesRecommendation({
    recommendationRunId: "ai-rec-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    domain: "english",
    modelStatus: "completed",
    analysisSummary: "summary-only analysis",
    recommendedSeries: [{ templateId: "english-speaking-retell-v1", skillId: "english_speaking_retell" }],
    learnerAnswer: "must not be exposed",
  });
  assert.equal(aiRecommendation.recommendationRunId, "ai-rec-1");
  assert.equal(aiRecommendation.learnerAnswer, "[redacted]");
  assert.equal(repository.latestTaskSeriesRecommendation({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen", domain: "english" }).recommendationRunId, "ai-rec-1");
  assert.equal(repository.latestDraftForProgram("program-1").draftId, "draft-1");
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).sources, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).goals, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).profiles, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).skillStates, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskCards, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).interactionSessions, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).evaluations, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskSubmissions, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskReflections, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskArtifacts, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).reviewRequests, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).rewardSettlements, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskSeriesRecommendations, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testPrivateFieldStripping() {
  const stripped = stripPrivateLearningFields({
    summary: "safe",
    rawTranscript: "child full transcript",
    learnerAnswer: "child full answer",
    nested: {
      questionText: "full question",
      sourceBasisRefs: ["safe-ref"],
      answerKey: ["A"],
    },
  });
  assert.equal(stripped.summary, "safe");
  assert.equal(stripped.rawTranscript, "[redacted]");
  assert.equal(stripped.learnerAnswer, "[redacted]");
  assert.equal(stripped.nested.questionText, "[redacted]");
  assert.equal(stripped.nested.answerKey, "[redacted]");
  assert.deepEqual(stripped.nested.sourceBasisRefs, ["safe-ref"]);
}

testMigrationAndPersistence();
testPrivateFieldStripping();

console.log("learning program repository tests passed");
