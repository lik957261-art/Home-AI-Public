"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createLearningGrowthSubmissionService,
  resolveSubmissionGuard,
  submissionAttemptPolicy,
  validateSubmissionText,
} = require("../adapters/learning-growth-submission-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-submission-"));
}

function seedGrowthProgram(repository) {
  repository.upsertProgram({
    programId: "program-growth",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_grammar"],
    goalSummary: "summary only",
    startDate: "2026-05-18",
    endDate: "2026-05-25",
    daysPerWeek: 5,
    minutesPerDay: 20,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["source:growth-summary"],
    curriculumRefs: ["cefr-b1"],
    constraints: {},
    reviewPolicy: {},
  });
  repository.savePlanDraft({
    draftId: "draft-growth",
    programId: "program-growth",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "published",
    weekStart: "2026-05-18",
    weekEnd: "2026-05-25",
    dailyPlans: [],
  });
  repository.upsertTaskCard({
    taskCardId: "task-growth",
    programId: "program-growth",
    draftId: "draft-growth",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    kanbanCardId: "t_growth",
    title: "Grammar task",
    domain: "english",
    taskCardType: "single_subject",
    status: "published",
    plannedDate: "2026-05-18",
    plannedMinutes: 15,
    skillIds: ["english_grammar"],
    templateId: "english-grammar-v1",
    interactionStateMachine: ["receive_task", "learner_attempt", "ai_evaluation", "reward_settlement"],
    sourceBasisRefs: ["source:growth-summary"],
    curriculumRefs: ["cefr-b1"],
    privacyLevel: "summary_only",
  });
}

async function testGenericGrammarSubmissionUsesTaskModelAndReport() {
  const calls = [];
  const reports = [];
  const materialized = [];
  const service = createLearningGrowthSubmissionService({
    reportService: {
      writeReport(input) {
        reports.push(input);
        return {
          path: "C:\\tmp\\growth-grammar-feedback.md",
          name: "growth-grammar-feedback.md",
          mime: "text/markdown; charset=utf-8",
          size: 180,
        };
      },
    },
    directoryMaterializationService: {
      materializeTaskEvaluation(input) {
        materialized.push(input);
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_grammar",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "grammar",
              skillId: "english_grammar_in_expression",
              learnerInstruction: "Repair four grammar sentences and explain the pattern.",
              submissionContract: {
                firstSubmissionKind: "grammar_repair",
                revisionSubmissionKind: "grammar_variant_repair",
              },
            },
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, I repaired the sentence because the verb form was wrong.",
    "Then I wrote another school example with the same pattern.",
    "I changed the ending because the old sentence did not match the subject.",
    "Finally, I can explain that the verb must agree with the subject.",
  ].join("\n");
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_grammar",
    text,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.activityType, "grammar");
  assert.equal(result.evaluation.report.name, "growth-grammar-feedback.md");
  assert.equal(calls[1].input.submissionKind, "grammar_repair");
  assert.equal(calls[2].input.learningGrowthEvaluation.activityType, "grammar");
  assert.equal(materialized[0].evaluation.activityType, "grammar");
  assert.equal(reports[0].evaluation.activityType, "grammar");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /First, I repaired/);
}

async function testTooShortSubmissionIsRejectedBeforeMutation() {
  const calls = [];
  const service = createLearningGrowthSubmissionService({
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_short",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "writing",
              skillId: "english_short_writing",
            },
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true };
      },
    },
  });
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_short",
    text: "Q",
    author: "child",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.submissionGuard.activityType, "writing");
  assert.equal(result.submissionGuard.minChars, 300);
  assert.equal(result.submissionStats.chars, 1);
  assert.deepEqual(calls.map((call) => call.type), ["list"]);
  assert.equal(validateSubmissionText("Q", resolveSubmissionGuard({ activityType: "writing" })).ok, false);
}

async function testPendingSameSubmissionIsReusedForRetry() {
  const calls = [];
  const text = [
    "First, I repaired the grammar because the verb must match the subject.",
    "Then I added a school example and explained why the article changes.",
    "Finally, I wrote the corrected sentence and reflected on the pattern.",
    "I also checked the subject, the tense, and the article before I wrote the final answer.",
    "This makes the grammar repair clearer and shows the pattern in a new sentence.",
  ].join("\n");
  const service = createLearningGrowthSubmissionService({
    reportService: { writeReport: () => null },
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_retry",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningGrowthSubmissionStatus: "submitted",
            learningGrowthSubmissionKind: "grammar_repair",
            learningGrowthSubmissionText: text,
            learningGrowthEvaluationStatus: "pending",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "grammar",
              skillId: "english_grammar",
              submissionContract: { firstSubmissionKind: "grammar_repair" },
            },
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_retry",
    text,
    author: "child",
  });
  assert.equal(result.ok, true);
  const mutations = calls.filter((call) => call.type === "mutate").map((call) => call.input);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].author, "learning-growth-evaluator");
  assert.equal(Boolean(mutations[0].learningGrowthEvaluation), true);
}

async function testModelFeedbackServiceIsActivityGeneric() {
  const service = createLearningGrowthSubmissionService({
    aiFeedbackService: {
      async analyze(input) {
        assert.equal(input.evaluation.activityType, "presentation");
        return {
          ok: true,
          feedback: {
            modelAssisted: true,
            summary: "Presentation feedback is specific.",
            strengths: ["The outline has a clear order."],
            focusAreas: ["Add one concrete school example."],
            criterionFeedback: [{
              dimension: "audience evidence",
              observation: "The order is clear but the audience example is still general.",
              action: "Name the activity and audience.",
            }],
            sentenceFeedback: [{
              evidence: "clear order",
              issue: "The evidence is still general.",
              fix: "Name the activity and the audience.",
              example: "I will explain our science poster to Grade 7 classmates.",
            }],
            rewriteChecklist: ["Add one audience-specific detail."],
            reflectionPrompts: ["What detail did I add?"],
            nextPractice: "Rehearse with opening, two points, and closing.",
          },
        };
      },
    },
    reportService: {
      writeReport(input) {
        assert.equal(input.evaluation.feedbackMethod, "model_assisted");
        return {
          path: "C:\\tmp\\growth-presentation-feedback.md",
          name: "growth-presentation-feedback.md",
          mime: "text/markdown; charset=utf-8",
          size: 180,
        };
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_presentation",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "presentation",
              skillId: "english_presentation",
              learnerInstruction: "Prepare a presentation outline with opening, two points, and closing.",
            },
          }],
        };
      },
      async mutateCard(input) {
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, my presentation explains a school project to my classmates.",
    "Because the audience needs a clear reason, I compare two choices and give one example.",
    "Then I improve the closing sentence and connect it back to the opening.",
    "Finally, I changed my outline because the old version did not show enough evidence.",
    "I also add one detail about how classmates will listen, ask questions, and remember the final point.",
  ].join("\n");
  const result = await service.submitTask({
    workspaceId: "child",
    cardId: "t_presentation",
    text,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.feedbackMethod, "model_assisted");
  assert.equal(result.evaluation.summary, "Presentation feedback is specific.");
  assert.equal(result.evaluation.feedbackSections.criterionFeedback[0].dimension, "audience evidence");
  assert.equal(result.evaluation.feedbackSections.sentenceFeedback[0].example, "I will explain our science poster to Grade 7 classmates.");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /my presentation explains/);
}

async function testRecentSubmissionCanBeWithdrawn() {
  const calls = [];
  const service = createLearningGrowthSubmissionService({
    now: () => new Date("2026-05-18T10:04:00.000Z").getTime(),
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_recent",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            kanbanStatus: "ready",
            learningGrowthSubmissionAt: "2026-05-18T10:00:00.000Z",
            learningGrowthSubmissionStatus: "submitted",
            learningGrowthRewardStatus: "not_eligible",
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const result = await service.withdrawSubmission({
    workspaceId: "child",
    cardId: "t_recent",
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "withdrawn");
  assert.equal(calls.at(-1).input.action, "clear_learning_growth_submission");
}

async function testExpiredSubmissionCannotBeWithdrawn() {
  const calls = [];
  const service = createLearningGrowthSubmissionService({
    now: () => new Date("2026-05-18T10:06:01.000Z").getTime(),
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_expired",
            workspaceId: "child",
            kanbanCaseTemplate: "learning-growth",
            kanbanStatus: "ready",
            learningGrowthSubmissionAt: "2026-05-18T10:00:00.000Z",
            learningGrowthSubmissionStatus: "submitted",
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true };
      },
    },
  });
  const result = await service.withdrawSubmission({
    workspaceId: "child",
    cardId: "t_expired",
    author: "child",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.deepEqual(calls.map((call) => call.type), ["list"]);
}

async function testFinalGenericGrowthSubmissionRequiresSpokenReflectionBeforeSettlement() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const grants = [];
  const mutations = [];
  try {
    seedGrowthProgram(repository);
    const programService = createLearningProgramService({
      repository,
      learningCoinService: {
        grantCoins(input) {
          grants.push(input);
          return {
            entry: {
              entryId: `coin-${grants.length}`,
              id: `coin-${grants.length}`,
              studentId: input.studentId,
              workspaceId: input.workspaceId,
              coinDelta: input.coinAmount,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              createdAt: "2026-05-18T10:00:00.000Z",
            },
            balances: { availableCoins: input.coinAmount },
            duplicate: false,
          };
        },
      },
    });
    const completionNotices = [];
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      reportService: {
        writeReport() {
          return {
            path: "C:\\tmp\\growth-grammar-feedback.md",
            name: "growth-grammar-feedback.md",
            mime: "text/markdown; charset=utf-8",
            size: 180,
          };
        },
      },
      kanbanCardProvider: {
        async listCards() {
          return {
            ok: true,
            data: [{
              id: "t_growth",
              workspaceId: "weixin_stephen",
              kanbanCaseTemplate: "learning-growth",
              learningTaskCardId: "task-growth",
              learningGrowthEvaluationStatus: "draft_feedback",
              learningTaskModel: {
                version: "learning-task-model-v1",
                activityType: "grammar",
                skillId: "english_grammar",
                learnerInstruction: "Repair grammar and explain why.",
              },
            }],
          };
        },
        async mutateCard(input) {
          mutations.push(input);
          return { ok: true, id: input.cardId, action: input.action };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const text = [
      "First, I repair the grammar because the verb must match the subject.",
      "Then I add a school example and explain why the article changes.",
      "Finally, I write the corrected sentence and reflect on the pattern.",
    ].join("\n");
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      cardId: "t_growth",
      stage: "final",
      text,
      author: "weixin_stephen",
    });
    assert.equal(result.ok, true, result.error || JSON.stringify(result));
    assert.equal(result.status, "reflection_required");
    assert.equal(result.evaluation.nextStep, "spoken_reflection_required");
    assert.equal(result.evaluation.finalPassingScore, 80);
    assert.equal(result.evaluation.passingScore, 80);
    assert.equal(result.evaluation.reflectionGateEnabled, true);
    assert.equal(result.evaluation.settlementAfterReflection, true);
    assert.equal(result.evaluation.settlementBlockedByReflection, true);
    assert.equal(result.evaluation.reflectionPolicy.required, true);
    assert.equal(result.reward.status, "reflection_required");
    assert.equal(result.result.completed, false);
    assert.equal(grants.length, 0);
    assert.equal(mutations.some((call) => call.action === "complete"), false);
    assert.equal(repository.listRewardSettlements({ learnerId: "weixin_stephen", limit: 1 }).length, 0);
    assert.equal(repository.listTaskSubmissions({ learnerId: "weixin_stephen", limit: 1 }).length, 1);
    assert.equal(repository.listEvaluations({ learnerId: "weixin_stephen", limit: 1 }).length, 1);
    assert.equal(repository.listEvaluations({ learnerId: "weixin_stephen", limit: 1 })[0].status, "reflection_required");
    assert.equal(result.result.nativeSubmission.status, "submitted");
    assert.equal(result.result.nativeEvaluation.status, "reflection_required");
    assert.equal(completionNotices.length, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testAcceptedSpokenReflectionSettlesCoinsAndCompletesCard() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const grants = [];
  const mutations = [];
  try {
    seedGrowthProgram(repository);
    const programService = createLearningProgramService({
      repository,
      learningCoinService: {
        grantCoins(input) {
          grants.push(input);
          return {
            entry: {
              entryId: `coin-${grants.length}`,
              studentId: input.studentId,
              workspaceId: input.workspaceId,
              coinDelta: input.coinAmount,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
            },
            duplicate: false,
          };
        },
      },
    });
    const completionNotices = [];
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      kanbanCardProvider: {
        async listCards() {
          return {
            ok: true,
            data: [{
              id: "t_growth",
              workspaceId: "weixin_stephen",
              kanbanCaseTemplate: "learning-growth",
              learningTaskCardId: "task-growth",
              learningGrowthEvaluationId: "eval-growth",
              learningGrowthEvaluationStatus: "reflection_required",
              learningGrowthNextStep: "spoken_reflection_required",
              learningGrowthScore: 80,
              learningGrowthMaxScore: 100,
              learningGrowthRewardCoins: 30,
              learningGrowthFeedbackSummary: "Grammar repair is mostly correct.",
              learningGrowthFocusAreas: ["subject verb agreement"],
              learningGrowthReflectionPrompts: ["Name the grammar mistake.", "Explain the next check."],
              learningTaskModel: {
                version: "learning-task-model-v1",
                activityType: "grammar",
                skillId: "english_grammar",
              },
            }],
          };
        },
        async mutateCard(input) {
          mutations.push(input);
          return { ok: true, id: input.cardId, action: input.action };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const result = await service.submitReflection({
      workspaceId: "weixin_stephen",
      cardId: "t_growth",
      author: "weixin_stephen",
      audio: { name: "reflection.webm", mime: "audio/webm", size: 1200 },
      transcript: [
        "My main mistake was subject verb agreement.",
        "I fixed it because the verb should match the subject in the sentence.",
        "Next time I will check the subject first and practice the corrected pattern.",
      ].join(" "),
    });
    assert.equal(result.ok, true, result.error || JSON.stringify(result));
    assert.equal(result.status, "completed");
    assert.equal(result.reflection.status, "accepted");
    assert.equal(result.evaluation.reflection.status, "accepted");
    assert.equal(result.evaluation.finalPassingScore, 80);
    assert.equal(result.evaluation.reflectionGateEnabled, true);
    assert.equal(result.evaluation.settlementAfterReflection, true);
    assert.equal(result.evaluation.settlementBlockedByReflection, false);
    assert.equal(result.evaluation.score > 80, true);
    assert.equal(result.reward.status, "settled");
    assert.equal(grants.length, 1);
    assert.equal(grants[0].studentId, "weixin_stephen");
    assert.equal(grants[0].workspaceId, "weixin_stephen");
    assert.equal(grants[0].sourceType, "learning-growth-evaluation");
    const nativeReflection = repository.listTaskReflections({ learnerId: "weixin_stephen", limit: 1 })[0];
    assert.equal(Boolean(nativeReflection), true);
    assert.equal(nativeReflection.evidenceRefs.length, 2);
    assert.equal(nativeReflection.evidenceRefs[1].startsWith("transcript:"), true);
    assert.equal(repository.listEvaluations({ learnerId: "weixin_stephen", limit: 1 }).length, 1);
    assert.equal(repository.listRewardSettlements({ learnerId: "weixin_stephen", limit: 1 }).length, 1);
    assert.equal(result.result.nativeReflection.status, "accepted");
    assert.equal(mutations.some((call) => call.action === "comment" && call.learningGrowthEvaluation?.reflection?.status === "accepted"), true);
    assert.equal(mutations.some((call) => call.action === "complete"), true);
    assert.equal(completionNotices.length, 1);
    assert.equal(completionNotices[0].taskCardId, "task-growth");
    assert.equal(completionNotices[0].workspaceId, "weixin_stephen");
    assert.equal(completionNotices[0].reflection.status, "accepted");
    assert.equal(Object.prototype.hasOwnProperty.call(completionNotices[0], "transcript"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(completionNotices[0], "submissionText"), false);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testScoreReachedDraftFeedbackAcceptsReflection() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const grants = [];
  const mutations = [];
  try {
    seedGrowthProgram(repository);
    const programService = createLearningProgramService({
      repository,
      learningCoinService: {
        grantCoins(input) {
          grants.push(input);
          return {
            entry: {
              entryId: `coin-${grants.length}`,
              studentId: input.studentId,
              workspaceId: input.workspaceId,
              coinDelta: input.coinAmount,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
            },
            duplicate: false,
          };
        },
      },
    });
    const session = programService.startTaskSession("task-growth", {
      actor: "weixin_stephen",
      summary: "Draft feedback reached the score line and is waiting for reflection.",
    });
    programService.recordEvaluation(session.sessionId, {
      evaluationId: "eval-draft-reflect",
      status: "draft_feedback",
      score: 90,
      maxScore: 100,
      passed: false,
      confidence: 0.86,
      summary: "First draft reached the score line but still needs reflection.",
      revisionRequirements: ["Explain one improvement before completion."],
      finalPassingScore: 80,
      passingScore: 80,
      reward: {
        eligible: true,
        coinAmount: 30,
        minCoinAmount: 0,
        maxCoinAmount: 30,
      },
      nextStep: "rewrite_and_reflect",
    });
    const completionNotices = [];
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      kanbanCardProvider: {
        async listCards() {
          return {
            ok: true,
            data: [{
              id: "t_growth",
              workspaceId: "weixin_stephen",
              kanbanCaseTemplate: "learning-growth",
              learningTaskCardId: "task-growth",
              learningGrowthEvaluationId: "eval-draft-reflect",
              learningGrowthEvaluationStatus: "draft_feedback",
              learningGrowthNextStep: "rewrite_and_reflect",
              learningGrowthScore: 90,
              learningGrowthMaxScore: 100,
              learningGrowthFinalPassingScore: 80,
              learningGrowthRewardCoins: 30,
              learningGrowthFeedbackSummary: "First draft reached the score line but still needs reflection.",
              learningGrowthReflectionPrompts: ["Name one improvement.", "Explain the next check."],
              learningTaskModel: {
                version: "learning-task-model-v1",
                activityType: "writing",
                skillId: "english_short_writing",
              },
            }],
          };
        },
        async mutateCard(input) {
          mutations.push(input);
          return { ok: true, id: input.cardId, action: input.action };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const result = await service.submitReflection({
      workspaceId: "weixin_stephen",
      cardId: "t_growth",
      author: "weixin_stephen",
      audio: { name: "reflection.webm", mime: "audio/webm", size: 1200 },
      transcript: [
        "My main mistake was that one reason was not clear enough.",
        "I fixed it because the example should prove my opinion.",
        "Next time I will check the opinion, reason, and example before submitting.",
      ].join(" "),
    });
    assert.equal(result.ok, true, result.error || JSON.stringify(result));
    assert.equal(result.status, "completed");
    assert.equal(result.reflection.status, "accepted");
    assert.equal(result.evaluation.score, 90);
    assert.equal(result.evaluation.settlementBlockedByReflection, false);
    assert.equal(result.reward.status, "settled");
    assert.equal(grants.length, 1);
    assert.equal(mutations.some((call) => call.action === "comment" && call.learningGrowthEvaluation?.reflection?.status === "accepted"), true);
    assert.equal(mutations.some((call) => call.action === "complete"), true);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testThreeSeriousAttemptReflectionAlwaysSettlesAfterRecording() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const grants = [];
  const mutations = [];
  try {
    seedGrowthProgram(repository);
    const programService = createLearningProgramService({
      repository,
      learningCoinService: {
        grantCoins(input) {
          grants.push(input);
          return {
            entry: {
              entryId: `coin-${grants.length}`,
              studentId: input.studentId,
              workspaceId: input.workspaceId,
              coinDelta: input.coinAmount,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
            },
            duplicate: false,
          };
        },
      },
    });
    const session = programService.startTaskSession("task-growth", {
      actor: "weixin_stephen",
      summary: "Third serious attempt is waiting for spoken reflection.",
    });
    programService.recordEvaluation(session.sessionId, {
      evaluationId: "eval-three-serious",
      status: "reflection_required",
      score: 55,
      passed: true,
      confidence: 0.82,
      verificationMethod: "model_assisted_growth_task_evaluation",
      evidenceRefs: ["submission:summary", "completion-policy:three-serious-submissions"],
      sourceBasisRefs: ["source:growth-summary"],
      summary: "Serious third attempt completed the current card; weaknesses carry forward.",
      revisionRequirements: ["Retell in clearer order next time."],
      completionDecision: "complete_current_card",
      completionPolicy: {
        mode: "card_completion",
        attemptNo: 3,
        seriousSubmission: true,
        threeSeriousSubmissionsComplete: true,
      },
      remainingWeaknesses: ["Retell in clearer order next time."],
      reflectionPolicy: {
        required: true,
        mode: "spoken",
        reflectionWeight: 0.3,
        taskWeight: 0.7,
      },
      reward: {
        eligible: true,
        coinAmount: 60,
        minCoinAmount: 0,
        maxCoinAmount: 100,
      },
      nextStep: "spoken_reflection_required",
    });
    const completionNotices = [];
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      kanbanCardProvider: {
        async listCards() {
          return {
            ok: true,
            data: [{
              id: "t_growth",
              workspaceId: "weixin_stephen",
              kanbanCaseTemplate: "learning-growth",
              learningTaskCardId: "task-growth",
              learningGrowthEvaluationId: "eval-three-serious",
              learningGrowthEvaluationStatus: "reflection_required",
              learningGrowthNextStep: "spoken_reflection_required",
              learningGrowthScore: 55,
              learningGrowthMaxScore: 100,
              learningGrowthRewardCoins: 60,
              learningGrowthFeedbackSummary: "Serious third attempt completed the current card.",
              learningGrowthRevisionRequirements: ["Retell in clearer order next time."],
              learningTaskModel: {
                version: "learning-task-model-v1",
                activityType: "speaking",
                skillId: "english_speaking_retell",
              },
            }],
          };
        },
        async mutateCard(input) {
          mutations.push(input);
          return { ok: true, id: input.cardId, action: input.action };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const result = await service.submitReflection({
      workspaceId: "weixin_stephen",
      cardId: "t_growth",
      author: "weixin_stephen",
      audio: { name: "reflection.webm", mime: "audio/webm", size: 1200 },
      transcript: "ok",
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.reflection.status, "accepted");
    assert.equal(result.reflection.checks.completionPolicyAccepted, true);
    assert.equal(result.evaluation.score, 55);
    assert.equal(result.evaluation.passed, true);
    assert.equal(result.evaluation.completionPolicy.threeSeriousSubmissionsComplete, true);
    assert.equal(result.reward.status, "settled");
    assert.equal(grants.length, 1);
    assert.equal(grants[0].coinAmount, 60);
    assert.equal(repository.listEvaluations({ taskCardId: "task-growth", limit: 1 })[0].status, "completed");
    assert.equal(repository.listRewardSettlements({ learnerId: "weixin_stephen", limit: 1 }).length, 1);
    assert.equal(mutations.some((call) => call.action === "complete"), true);
    assert.equal(completionNotices.length, 1);
    assert.equal(completionNotices[0].taskCardId, "task-growth");
    assert.equal(completionNotices[0].workspaceId, "weixin_stephen");
    assert.equal(completionNotices[0].reflection.status, "accepted");
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeTaskSubmissionWorksWithoutKanbanLink() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-only",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native grammar task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_grammar"],
      templateId: "english-grammar-v1",
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
        learnerInstruction: "Repair grammar and explain why.",
        questionItems: [
          {
            id: "q1",
            type: "multiple_choice",
            title: "Question 1",
            stem: "Which sentence uses the correct tense?",
            choices: [{ id: "A", text: "He go yesterday." }, { id: "B", text: "He went yesterday." }],
          },
          {
            id: "q2",
            type: "written",
            title: "Question 2",
            stem: "Explain the rule.",
          },
        ],
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      evaluationService: {
        async evaluate() {
          return {
            evaluationId: "eval-native-only",
            status: "needs_revision",
            activityType: "grammar",
            skillId: "english_grammar",
            score: 72,
            maxScore: 100,
            passed: false,
            confidence: 0.73,
            summary: "summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: ["verb tense"], reflectionPrompts: [] },
            revisionRequirements: ["repair tense"],
            reward: { eligible: false },
          };
        },
      },
      reportService: {
        writeReport() {
          return {
            path: "C:\\tmp\\native-growth-feedback.md",
            name: "native-growth-feedback.md",
            mime: "text/markdown; charset=utf-8",
            size: 180,
          };
        },
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-only",
      text: [
        "1. Question 1",
        "选择：B",
        "理由：The time signal yesterday needs the past tense.",
        "I choose this option because the sentence describes a completed action in the past, and the corrected verb form must match that time signal.",
        "",
        "2. Question 2",
        "推理：I compare the time signal and the verb form before writing the final answer.",
        "Then I check whether the subject and verb still agree, explain the rule in my own words, and write a final correction plan.",
      ].join("\n"),
      structuredAnswers: [
        { questionId: "q1", type: "multiple_choice", title: "Question 1", choice: "B", reason: "The time signal yesterday needs the past tense." },
        { questionId: "q2", type: "written", title: "Question 2", response: "I compare the time signal and the verb form before writing the final answer." },
      ],
      author: "weixin_stephen",
    });
    assert.equal(result.ok, true);
    assert.equal(result.cardId, "task-native-only");
    assert.equal(result.result.nativeSubmission.status, "submitted");
    const savedSubmission = repository.listTaskSubmissions({ taskCardId: "task-native-only", limit: 1 })[0];
    assert.equal(savedSubmission.status, "submitted");
    assert.equal(savedSubmission.structuredResponses[0].choice, "B");
    assert.match(savedSubmission.structuredResponses[1].response, /verb form/);
    assert.match(savedSubmission.displayText, /Question 1/);
    const savedEvaluation = repository.listEvaluations({ taskCardId: "task-native-only", limit: 1 })[0];
    assert.match(savedEvaluation.status, /needs_(revision|review)/);
    assert.deepEqual(savedEvaluation.revisionRequirements, ["repair tense"]);
    assert.deepEqual(savedEvaluation.feedbackSections.focusAreas, ["verb tense"]);
    assert.equal(repository.listTaskArtifacts({ taskCardId: "task-native-only", limit: 1 }).length, 1);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeTaskSubmissionCanAcceptBeforeEvaluation() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const scheduled = [];
  const notifications = [];
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-async",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native async task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_grammar"],
      templateId: "english-grammar-v1",
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
        learnerInstruction: "Repair grammar and explain why.",
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      scheduleBackgroundTask(task) {
        scheduled.push(task);
      },
      notifyEvaluationComplete(input) {
        notifications.push(input);
        return Promise.resolve({ ok: true });
      },
      evaluationService: {
        async evaluate() {
          return {
            evaluationId: "eval-native-async",
            status: "needs_revision",
            activityType: "grammar",
            skillId: "english_grammar",
            score: 70,
            maxScore: 100,
            passed: false,
            confidence: 0.75,
            summary: "summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: ["verb tense"], reflectionPrompts: [] },
            revisionRequirements: ["repair tense"],
            reward: { eligible: false },
          };
        },
      },
      reportService: { writeReport: () => null },
    });
    const text = [
      "First, I compare the time signal and the verb form before choosing the answer.",
      "Then I explain why the corrected sentence needs a past tense verb.",
      "Finally, I write one more example and check subject verb agreement carefully.",
    ].join("\n");
    const accepted = await service.submitTaskAsync({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-async",
      text,
      author: "weixin_stephen",
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.status, "accepted");
    assert.equal(scheduled.length, 1);
    assert.equal(repository.listGrowthEvaluationJobs({ status: "pending", limit: 2 }).length, 1);
    assert.equal(repository.listTaskSubmissions({ taskCardId: "task-native-async", limit: 1 }).length, 1);
    assert.equal(repository.listEvaluations({ taskCardId: "task-native-async", limit: 1 }).length, 0);
    await scheduled[0]();
    assert.equal(repository.listEvaluations({ taskCardId: "task-native-async", limit: 1 })[0].evaluationId, "eval-native-async");
    assert.equal(repository.listGrowthEvaluationJobs({ status: "done", limit: 2 })[0].submissionId, accepted.result.nativeSubmission.submissionId);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].taskCardId, "task-native-async");
    assert.equal(notifications[0].evaluation.evaluationId, "eval-native-async");
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testPersistedAsyncSubmissionIsRecoveredByNewService() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const notifications = [];
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-recover",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native recover task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_grammar"],
      templateId: "english-grammar-v1",
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    const baseOptions = {
      learningProgramService: programService,
      scheduleBackgroundTask() {},
      notifyEvaluationComplete(input) {
        notifications.push(input);
        return Promise.resolve({ ok: true });
      },
      evaluationService: {
        async evaluate(input) {
          assert.match(input.text, /subject[\s\S]*verb|verb[\s\S]*subject/);
          return {
            evaluationId: "eval-native-recovered",
            status: "needs_revision",
            activityType: "grammar",
            skillId: "english_grammar",
            score: 72,
            maxScore: 100,
            passed: false,
            confidence: 0.75,
            summary: "recovered summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: ["agreement"], reflectionPrompts: [] },
            revisionRequirements: ["repair agreement"],
            reward: { eligible: false },
          };
        },
      },
      reportService: { writeReport: () => null },
    };
    const firstService = createLearningGrowthSubmissionService(baseOptions);
    const text = [
      "First, I identify the subject and check whether the verb agrees with it.",
      "Then I explain the tense and write a corrected example for school.",
      "Finally, I check subject verb agreement one more time before submitting.",
      "I also compare the original sentence with the corrected sentence and explain the grammar rule in my own words.",
      "This shows that I can notice the mistake, repair it, and apply the same pattern to a new example.",
    ].join("\n");
    const accepted = await firstService.submitTaskAsync({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-recover",
      text,
      author: "weixin_stephen",
    });
    assert.equal(accepted.ok, true);
    assert.equal(repository.listEvaluations({ taskCardId: "task-native-recover", limit: 1 }).length, 0);
    assert.equal(repository.listGrowthEvaluationJobs({ status: "pending", limit: 2 }).length, 1);

    const recoveredService = createLearningGrowthSubmissionService(baseOptions);
    const processed = await recoveredService.processEvaluationQueue();
    assert.equal(processed.processed, 1);
    assert.equal(repository.listEvaluations({ taskCardId: "task-native-recover", limit: 1 })[0].evaluationId, "eval-native-recovered");
    assert.equal(repository.listGrowthEvaluationJobs({ status: "done", limit: 2 })[0].submissionId, accepted.result.nativeSubmission.submissionId);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].submissionId, accepted.result.nativeSubmission.submissionId);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeRevisionSubmissionUsesPersistedEvaluationState() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-revision",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native revision task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_grammar"],
      templateId: "english-grammar-v1",
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
        learnerInstruction: "Repair grammar and explain why.",
        submissionContract: {
          firstSubmissionKind: "grammar_first",
          revisionSubmissionKind: "grammar_revision",
        },
      },
      privacyLevel: "summary_only",
    });
    repository.saveInteractionSession({
      sessionId: "session-native-revision",
      taskCardId: "task-native-revision",
      programId: "program-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      status: "needs_review",
      currentStep: "mistake_explanation",
      summary: "draft feedback recorded",
    });
    repository.saveEvaluation({
      evaluationId: "eval-native-revision-draft",
      taskCardId: "task-native-revision",
      sessionId: "session-native-revision",
      programId: "program-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      status: "needs_repair",
      score: 68,
      passed: false,
      confidence: 0.86,
      summary: "needs revision",
      nextStep: "rewrite_and_reflect",
      createdAt: "2026-05-18T10:00:00.000Z",
    });
    const stages = [];
    const programService = createLearningProgramService({ repository });
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      evaluationService: {
        async evaluate(input) {
          stages.push(input.stage);
          return {
            evaluationId: "eval-native-revision-final",
            status: "needs_revision",
            activityType: "grammar",
            skillId: "english_grammar",
            score: 76,
            maxScore: 100,
            passed: false,
            confidence: 0.82,
            summary: "summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: ["add clearer evidence"], reflectionPrompts: [] },
            revisionRequirements: ["add clearer evidence"],
            reward: { eligible: false },
          };
        },
      },
      reportService: { writeReport: () => null },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-revision",
      text: [
        "First, I compare the old sentence with the corrected sentence and explain the verb pattern.",
        "Then I add a new school example so the correction is not only copied from the first answer.",
        "Finally, I reflect that my revision changes the evidence and makes the grammar rule clearer.",
      ].join("\n"),
      author: "weixin_stephen",
    });
    assert.equal(result.ok, true);
    assert.equal(stages[0], "final");
    const savedSubmission = repository.listTaskSubmissions({ taskCardId: "task-native-revision", limit: 1 })[0];
    assert.equal(savedSubmission.stage, "final");
    assert.equal(savedSubmission.submissionKind, "grammar_revision");
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeSpeakingSubmissionUsesAudioTranscription() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const savedAudio = [];
  const evaluated = [];
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-speaking",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native speaking retell task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_speaking_retell"],
      templateId: "english-speaking-retell-v1",
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "speaking",
        skillId: "english_speaking_retell",
        learnerInstruction: "Read a short passage and record an English retell.",
      },
      privacyLevel: "summary_only",
    });
    const transcript = [
      "First I introduce the main idea and retell the event in my own words.",
      "Then I explain one important detail and connect it with the reason in the text.",
      "After that I mention the result and keep the order clear for the listener.",
      "Finally I say what the character learns and use complete English sentences with enough detail.",
    ].join(" ");
    const programService = createLearningProgramService({ repository });
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      saveSubmissionAudioUpload(workspaceId, cardId, audio) {
        savedAudio.push({ workspaceId, cardId, audio });
        return {
          path: "C:\\tmp\\native-speaking-retell.webm",
          name: audio.filename,
          mime: audio.type,
          size: 1234,
        };
      },
      async transcribeSubmissionAudio(audioPath) {
        assert.equal(audioPath, "C:\\tmp\\native-speaking-retell.webm");
        return { text: transcript };
      },
      evaluationService: {
        async evaluate(input) {
          evaluated.push(input);
          assert.equal(input.text, transcript);
          assert.equal(input.submissionAudio.kind, "audio");
          return {
            evaluationId: "eval-native-speaking",
            status: "needs_revision",
            activityType: "speaking",
            skillId: "english_speaking_retell",
            score: 74,
            maxScore: 100,
            passed: false,
            confidence: 0.76,
            summary: "summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: ["retell order"], reflectionPrompts: [] },
            revisionRequirements: ["add one missing detail"],
            evidenceRefs: ["submission:summary"],
            reward: { eligible: false },
          };
        },
      },
      reportService: {
        writeReport() {
          return {
            path: "C:\\tmp\\native-speaking-feedback.md",
            name: "native-speaking-feedback.md",
            mime: "text/markdown; charset=utf-8",
            size: 180,
          };
        },
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-speaking",
      filename: "retell.webm",
      type: "audio/webm",
      dataBase64: "ZmFrZS1hdWRpbw==",
      durationMs: 32000,
      author: "weixin_stephen",
    });
    assert.equal(result.ok, true);
    assert.equal(savedAudio.length, 1);
    assert.equal(evaluated.length, 1);
    assert.equal(result.submissionAudio.kind, "audio");
    assert.match(result.submissionAudio.url, /^\/api\/learning\/task-submissions\/[^/]+\/audio$/);
    assert.equal(result.evaluation.evidenceRefs.some((ref) => /^audio:/.test(ref)), true);
    const nativeSubmission = repository.listTaskSubmissions({ taskCardId: "task-native-speaking", limit: 1 })[0];
    assert.equal(nativeSubmission.audio.url, result.submissionAudio.url);
    assert.equal(nativeSubmission.raw.audio.kind, "audio");
    assert.equal(nativeSubmission.raw.audio.digest, result.submissionAudio.digest);
    assert.equal(nativeSubmission.raw.audio.url, result.submissionAudio.url);
    assert.doesNotMatch(JSON.stringify(nativeSubmission.raw), /First I introduce/);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeSpeakingSubmissionRequiresAudio() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-speaking-missing-audio",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native speaking retell task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      skillIds: ["english_speaking_retell"],
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "speaking",
        skillId: "english_speaking_retell",
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    let evaluated = false;
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      evaluationService: {
        async evaluate() {
          evaluated = true;
          return { status: "passed" };
        },
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-speaking-missing-audio",
      text: "This text fallback should not be accepted for a speaking retell.",
      author: "weixin_stephen",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(evaluated, false);
    assert.equal(repository.listTaskSubmissions({ taskCardId: "task-native-speaking-missing-audio", limit: 1 }).length, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNativeSpeakingSubmissionRequiresServerTranscription() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-native-speaking-no-transcribe",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Native speaking retell task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      skillIds: ["english_speaking_retell"],
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "speaking",
        skillId: "english_speaking_retell",
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    let evaluated = false;
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      saveSubmissionAudioUpload() {
        return {
          path: "C:\\tmp\\native-speaking-retell.webm",
          name: "retell.webm",
          mime: "audio/webm",
          size: 1234,
        };
      },
      evaluationService: {
        async evaluate() {
          evaluated = true;
          return { status: "passed" };
        },
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-native-speaking-no-transcribe",
      filename: "retell.webm",
      type: "audio/webm",
      dataBase64: "ZmFrZS1hdWRpbw==",
      transcript: "A client transcript must not bypass server transcription.",
      author: "weixin_stephen",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(evaluated, false);
    assert.equal(repository.listTaskSubmissions({ taskCardId: "task-native-speaking-no-transcribe", limit: 1 }).length, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testCompletedNativeTaskPreparesNextSequenceTask() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const sequenceCalls = [];
  const completionNotices = [];
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard({
      taskCardId: "task-growth",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      kanbanCardId: "t_growth",
      title: "Grammar task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-18",
      plannedMinutes: 15,
      skillIds: ["english_grammar"],
      templateId: "english-grammar-v1",
      sourceBasisRefs: ["source:growth-summary"],
      curriculumRefs: ["cefr-b1"],
      privacyLevel: "summary_only",
      sequenceIndex: 1,
    });
    repository.upsertTaskCard({
      taskCardId: "task-growth-next",
      programId: "program-growth",
      draftId: "draft-growth",
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      title: "Next grammar task",
      domain: "english",
      taskCardType: "single_subject",
      status: "published",
      plannedDate: "2026-05-19",
      sequenceIndex: 2,
      skillIds: ["english_grammar"],
      taskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
      },
      privacyLevel: "summary_only",
    });
    const programService = createLearningProgramService({ repository });
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      evaluationService: {
        async evaluate() {
          return {
            evaluationId: "eval-sequence",
            status: "passed",
            activityType: "grammar",
            skillId: "english_grammar",
            score: 91,
            maxScore: 100,
            passed: true,
            confidence: 0.84,
            summary: "summary only feedback",
            feedbackMethod: "test",
            feedbackSections: { focusAreas: [], reflectionPrompts: [] },
            revisionRequirements: [],
            reward: { eligible: false },
          };
        },
      },
      reflectionService: {
        requiresReflection() {
          return false;
        },
      },
      reportService: { writeReport: () => null },
      sequenceService: {
        async prepareNextAfterCompletion(input) {
          sequenceCalls.push(input);
          return {
            ok: true,
            status: "next_task_prepared",
            previousTaskCardId: input.taskCardId,
            taskCardId: "task-growth-next",
            sequenceIndex: 2,
          };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-growth",
      text: [
        "First, I correct the grammar because the subject and verb need to match.",
        "Then I explain the pattern with a new school sentence and check the tense.",
        "Finally, I compare the old answer with my new answer and write a clear rule.",
        "I will use this rule before I submit the next grammar task.",
      ].join("\n"),
      author: "weixin_stephen",
    });
    assert.equal(result.ok, true);
    assert.equal(result.result.completed, true);
    assert.equal(result.nextTask.status, "next_task_prepared");
    assert.equal(result.result.nextTask.taskCardId, "task-growth-next");
    assert.equal(sequenceCalls.length, 1);
    assert.equal(sequenceCalls[0].taskCardId, "task-growth");
    assert.equal(completionNotices.length, 1);
    assert.equal(completionNotices[0].taskCardId, "task-growth");
    assert.equal(completionNotices[0].nextTask.taskCardId, "task-growth-next");
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testLockedSequenceTaskRejectsSubmissionBeforeModelWork() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({
    dbPath: path.join(root, "learning-growth.sqlite3"),
  });
  try {
    seedGrowthProgram(repository);
    repository.upsertTaskCard(Object.assign({}, repository.getTaskCard("task-growth"), {
      nextCompletionAllowedAt: "2026-05-21T08:00:00.000Z",
    }));
    const programService = createLearningProgramService({ repository });
    let evaluationCalls = 0;
    const service = createLearningGrowthSubmissionService({
      learningProgramService: programService,
      now: () => Date.parse("2026-05-20T09:00:00.000Z"),
      evaluationService: {
        async evaluate() {
          evaluationCalls += 1;
          return { passed: true };
        },
      },
      sequenceService: {
        completionGateForTask(task, options) {
          assert.equal(task.taskCardId, "task-growth");
          assert.equal(options.nowIso, "2026-05-20T09:00:00.000Z");
          return {
            ok: false,
            status: "completion_window_locked",
            nextCompletionAllowedAt: task.nextCompletionAllowedAt,
            retryAfterSeconds: 82800,
          };
        },
      },
    });
    const result = await service.submitTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-growth",
      text: [
        "First, I correct the grammar because the subject and verb need to match.",
        "Then I explain the pattern with a new school sentence and check the tense.",
        "Finally, I compare the old answer with my new answer and write a clear rule.",
        "I will use this rule before I submit the next grammar task.",
      ].join("\n"),
      author: "weixin_stephen",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.completionGate.status, "completion_window_locked");
    assert.equal(result.completionGate.nextCompletionAllowedAt, "2026-05-21T08:00:00.000Z");
    assert.equal(evaluationCalls, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testOwnerManualPassRecordsEvaluationAndSettlementPath() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({
    dbPath: path.join(root, "learning-growth.sqlite3"),
  });
  try {
    seedGrowthProgram(repository);
    const programService = createLearningProgramService({ repository });
    const growthProgramService = Object.assign({}, programService, {
      settleEvaluationReward(evaluationId, input) {
        return { rewardSettlementId: "settle-manual", evaluationId, status: "settled", input };
      },
    });
    const mutations = [];
    const completionNotices = [];
    const service = createLearningGrowthSubmissionService({
      learningProgramService: growthProgramService,
      kanbanCardProvider: {
        async listCards() {
          return { ok: true, data: [{ id: "t_growth", workspaceId: "weixin_stephen", kanbanCaseTemplate: "learning-growth" }] };
        },
        async mutateCard(input) {
          mutations.push(input);
          return { ok: true, action: input.action };
        },
      },
      notifyTaskComplete(input) {
        completionNotices.push(input);
        return Promise.resolve({ ok: true });
      },
    });
    const result = await service.manualPassTask({
      workspaceId: "weixin_stephen",
      taskCardId: "task-growth",
      author: "owner",
      reason: "summary only manual pass",
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.evaluation.completionDecision, "owner_manual_pass");
    assert.equal(result.rewardSettlement.status, "settled");
    assert.equal(programService.listEvaluations({ taskCardId: "task-growth", limit: 1 })[0].verification.method, "owner_manual_pass");
    assert.equal(mutations.some((item) => item.action === "complete"), true);
    assert.equal(completionNotices.length, 1);
    assert.equal(completionNotices[0].taskCardId, "task-growth");
    assert.equal(completionNotices[0].evaluation.completionDecision, "owner_manual_pass");
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testSubmissionAttemptPolicyRejectsRapidAndTinyRepeatSubmissions() {
  const previous = {
    submittedAt: "2026-05-23T09:00:00.000Z",
    displayText: [
      "First, I wrote a full correction with the calculation and the reason.",
      "Then I checked the previous mistake and explained the new method.",
      "Finally, I wrote the next practice point for the same problem type.",
    ].join(" "),
  };
  const rapid = submissionAttemptPolicy({
    records: [previous],
    nowMs: Date.parse("2026-05-23T09:03:00.000Z"),
    text: previous.displayText + " One more word.",
    minIntervalMs: 5 * 60 * 1000,
  });
  assert.equal(rapid.canSubmit, false);
  assert.equal(rapid.reason, "submission_cooldown");
  assert.equal(rapid.seriousSubmission, false);

  const tinyChange = submissionAttemptPolicy({
    records: [previous],
    nowMs: Date.parse("2026-05-23T09:08:00.000Z"),
    text: previous.displayText + " ok",
    minIntervalMs: 5 * 60 * 1000,
  });
  assert.equal(tinyChange.canSubmit, false);
  assert.equal(tinyChange.reason, "submission_too_similar");
}

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires a learningProgramService or kanbanCardProvider/,
  );
}

(async () => {
  testDependencyValidation();
  await testGenericGrammarSubmissionUsesTaskModelAndReport();
  await testTooShortSubmissionIsRejectedBeforeMutation();
  await testPendingSameSubmissionIsReusedForRetry();
  await testModelFeedbackServiceIsActivityGeneric();
  await testRecentSubmissionCanBeWithdrawn();
  await testExpiredSubmissionCannotBeWithdrawn();
  await testFinalGenericGrowthSubmissionRequiresSpokenReflectionBeforeSettlement();
  await testAcceptedSpokenReflectionSettlesCoinsAndCompletesCard();
  await testScoreReachedDraftFeedbackAcceptsReflection();
  await testThreeSeriousAttemptReflectionAlwaysSettlesAfterRecording();
  await testNativeTaskSubmissionWorksWithoutKanbanLink();
  await testNativeTaskSubmissionCanAcceptBeforeEvaluation();
  await testPersistedAsyncSubmissionIsRecoveredByNewService();
  await testNativeRevisionSubmissionUsesPersistedEvaluationState();
  await testNativeSpeakingSubmissionUsesAudioTranscription();
  await testNativeSpeakingSubmissionRequiresAudio();
  await testNativeSpeakingSubmissionRequiresServerTranscription();
  await testCompletedNativeTaskPreparesNextSequenceTask();
  await testLockedSequenceTaskRejectsSubmissionBeforeModelWork();
  await testOwnerManualPassRecordsEvaluationAndSettlementPath();
  testSubmissionAttemptPolicyRejectsRapidAndTinyRepeatSubmissions();
  console.log("learning growth submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
