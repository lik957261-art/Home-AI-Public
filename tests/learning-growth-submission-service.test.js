"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createLearningGrowthSubmissionService,
  resolveSubmissionGuard,
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
    assert.equal(result.ok, true);
    assert.equal(result.status, "reflection_required");
    assert.equal(result.evaluation.nextStep, "spoken_reflection_required");
    assert.equal(result.evaluation.reflectionPolicy.required, true);
    assert.equal(result.reward.status, "reflection_required");
    assert.equal(result.result.completed, false);
    assert.equal(grants.length, 0);
    assert.equal(mutations.some((call) => call.action === "complete"), false);
    assert.equal(repository.listRewardSettlements({ learnerId: "weixin_stephen", limit: 1 }).length, 0);
    assert.equal(repository.listEvaluations({ learnerId: "weixin_stephen", limit: 1 }).length, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testAcceptedSpokenReflectionSettlesCoinsAndCompletesCard() {
  const grants = [];
  const mutations = [];
  const service = createLearningGrowthSubmissionService({
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
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_reflection",
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
  });
  const result = await service.submitReflection({
    workspaceId: "weixin_stephen",
    cardId: "t_reflection",
    author: "weixin_stephen",
    audio: { name: "reflection.webm", mime: "audio/webm", size: 1200 },
    transcript: [
      "My main mistake was subject verb agreement.",
      "I fixed it because the verb should match the subject in the sentence.",
      "Next time I will check the subject first and practice the corrected pattern.",
    ].join(" "),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.reflection.status, "accepted");
  assert.equal(result.evaluation.reflection.status, "accepted");
  assert.equal(result.evaluation.score > 80, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(grants.length, 1);
  assert.equal(grants[0].studentId, "weixin_stephen");
  assert.equal(grants[0].workspaceId, "weixin_stephen");
  assert.equal(grants[0].sourceType, "learning-growth-task-evaluation");
  assert.equal(mutations.some((call) => call.action === "comment" && call.learningGrowthEvaluation?.reflection?.status === "accepted"), true);
  assert.equal(mutations.some((call) => call.action === "complete"), true);
}

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires kanbanCardProvider list\/mutate/,
  );
}

(async () => {
  testDependencyValidation();
  await testGenericGrammarSubmissionUsesTaskModelAndReport();
  await testTooShortSubmissionIsRejectedBeforeMutation();
  await testModelFeedbackServiceIsActivityGeneric();
  await testRecentSubmissionCanBeWithdrawn();
  await testExpiredSubmissionCannotBeWithdrawn();
  await testFinalGenericGrowthSubmissionRequiresSpokenReflectionBeforeSettlement();
  await testAcceptedSpokenReflectionSettlesCoinsAndCompletesCard();
  console.log("learning growth submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
