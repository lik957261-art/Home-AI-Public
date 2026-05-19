"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthWritingSubmissionService,
} = require("../adapters/learning-growth-writing-submission-service");

async function testSubmitWritingStoresAsKanbanComment() {
  const calls = [];
  const grants = [];
  const materialized = [];
  const progressSyncs = [];
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-feedback.md", name: "growth-writing-feedback.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    directoryMaterializationService: {
      materializeWritingEvaluation(input) {
        materialized.push(input);
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
    progressSyncService: {
      syncAfterMaterialization(input) {
        progressSyncs.push(input);
        return { ok: true, importedSources: 3, profileRebuilt: true, programsRefreshed: 1 };
      },
    },
    learningCoinService: {
      grantCoins(input) {
        grants.push(input);
        return { entry: { entryId: "coin-1" } };
      },
    },
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_growth",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const draft = [
    "Last week I joined a class activity about teamwork.",
    "First, I thought the task was simple, but our group had many different ideas.",
    "Because we did not want to waste time, I wrote down three steps and asked each classmate to choose one job.",
    "Then we checked the poster together and fixed the unclear sentences.",
    "Finally, we finished it on time, and I learned that clear communication makes a hard task easier.",
    "I also noticed that a specific example helps the reader understand what each student actually did.",
    "For that reason, I will describe the role, the problem, and the final result more clearly in my next version.",
  ].join(" ");
  const result = await service.submitWriting({
    workspaceId: "child",
    cardId: "t_growth",
    text: draft,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "draft_feedback");
  assert.equal(result.evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(result.evaluation.passed, false);
  assert.equal(result.reward.status, "not_eligible");
  assert.equal(result.result.completed, false);
  assert.equal(result.result.materialized.summaryPath, "summary.md");
  assert.equal(result.evaluation.report.name, "growth-writing-feedback.md");
  assert.equal(grants.length, 0);
  assert.equal(materialized.length, 1);
  assert.equal(materialized[0].cardId, "t_growth");
  assert.equal(materialized[0].evaluation.status, "draft_feedback");
  assert.equal(progressSyncs.length, 1);
  assert.equal(progressSyncs[0].materialized.summaryPath, "summary.md");
  assert.equal(result.result.progressSync.importedSources, 3);
  assert.deepEqual(calls[0], {
    type: "list",
    input: {
      workspaceId: "child",
      scope: "mine",
      includeCompleted: true,
      limit: 1,
      search: "",
      targetId: "t_growth",
    },
  });
  assert.equal(calls[1].input.learningGrowthSubmission, true);
  assert.equal(calls[1].input.submissionKind, "writing_draft");
  assert.equal(calls[2].input.learningGrowthEvaluation.status, "draft_feedback");
  assert.match(calls[2].input.comment, /AI 写作批改/);
  assert.match(calls[2].input.comment, /修改要求/);
  assert.match(calls[2].input.comment, /MEDIA:/);
  assert.doesNotMatch(JSON.stringify(result.evaluation), /Last week I joined/);
}

async function testFinalRewriteSettlesAndCompletes() {
  const calls = [];
  const grants = [];
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-final.md", name: "growth-writing-final.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    learningCoinService: {
      grantCoins(input) {
        grants.push(input);
        return { entry: { entryId: "coin-final" } };
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_growth",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
            learningGrowthEvaluationStatus: "draft_feedback",
          }],
        };
      },
      async mutateCard(input) {
        calls.push(input);
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, I joined a school activity with my classmates.",
    "Because the poster needed many details, I wrote a plan and checked each part.",
    "Then I asked my group to add examples and fix unclear sentences.",
    "Finally, we finished on time, and I learned that teamwork needs clear communication and careful revision.",
    "I changed the middle sentence because it needed a clearer example.",
    "I also added one reflection sentence so the final version explains the reason for my revision.",
    "The new detail shows the classroom problem, my action, and the result more clearly than the first draft.",
  ].join(" ");
  const result = await service.submitWriting({ workspaceId: "child", cardId: "t_growth", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.evaluation.nextStep, "completed");
  assert.equal(result.evaluation.passed, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(result.reward.entryId, "coin-final");
  assert.equal(result.result.completed, true);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].studentId, "child");
  assert.equal(calls[0].submissionKind, "writing_revision");
  assert.equal(calls[1].learningGrowthEvaluation.status, "completed");
  assert.equal(calls[2].action, "complete");
  assert.match(calls[2].comment, /金币/);
  assert.match(calls[2].comment, /最终结论/);
  assert.match(calls[2].comment, /Markdown/);
  assert.doesNotMatch(calls[2].comment, /[�]/);
}

async function testModelFeedbackEnhancesPublicEvaluation() {
  const calls = [];
  const service = createLearningGrowthWritingSubmissionService({
    aiFeedbackService: {
      async analyze(input) {
        assert.equal(input.stage, "draft");
        return {
          ok: true,
          feedback: {
            modelAssisted: true,
            summary: "AI draft feedback is specific.",
            strengths: ["Clear topic sentence."],
            focusAreas: ["Add a concrete classroom example."],
            sentenceFeedback: [{
              evidence: "teamwork is good",
              issue: "Too general.",
              whyItMatters: "The reader cannot see the scene.",
              fix: "Name the activity and the role.",
              example: "Teamwork helped our group finish the science poster.",
            }],
            rewriteChecklist: ["Rewrite one reason sentence with a concrete example."],
            reflectionPrompts: ["What detail did I add?"],
            nextPractice: "Use a three-line outline before writing.",
          },
        };
      },
    },
    reportService: {
      writeReport(input) {
        assert.equal(input.evaluation.feedbackMethod, "model_assisted");
        return { path: "C:\\tmp\\growth-writing-ai.md", name: "growth-writing-ai.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_growth_ai",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
          }],
        };
      },
      async mutateCard(input) {
        calls.push(input);
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "Last week I joined a class activity about teamwork.",
    "First, I wrote down three steps and asked each classmate to choose one job.",
    "Finally, we finished the poster on time, and I learned that good communication can make a hard task easier.",
    "I added a classroom detail about checking unclear sentences because the reader needs to see what changed.",
    "This revision also explains why the activity helped me practice planning, cooperation, and careful English writing.",
    "For the next version, I would keep the same order and add one stronger example from the group discussion.",
  ].join(" ");
  const result = await service.submitWriting({ workspaceId: "child", cardId: "t_growth_ai", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.feedbackMethod, "model_assisted");
  assert.equal(result.evaluation.aiFeedbackStatus, "completed");
  assert.equal(result.evaluation.summary, "AI draft feedback is specific.");
  assert.equal(result.evaluation.feedbackSections.sentenceFeedback[0].example, "Teamwork helped our group finish the science poster.");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /Last week I joined/);
  assert.equal(calls[1].learningGrowthEvaluation.feedbackSections.sentenceFeedback.length, 1);
}

async function testRejectsMissingNonGrowthAndOversizedSubmissions() {
  const service = createLearningGrowthWritingSubmissionService({
    maxSubmissionChars: 1000,
    reportService: { writeReport() { throw new Error("report should not run"); } },
    kanbanCardProvider: {
      async listCards() {
        return { ok: true, data: [{ id: "t_reading", kanbanCaseTemplate: "reading" }] };
      },
      async mutateCard() {
        throw new Error("mutate should not run");
      },
    },
  });
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "" })).status, 400);
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "x".repeat(1001) })).status, 413);
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "draft" })).status, 409);
}

async function testUsesLearningProgramSettlementWhenTaskLinked() {
  const calls = [];
  const programCalls = [];
  const program = {
    programId: "program-1",
    sourceBasisRefs: ["source:1"],
    constraints: {},
  };
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-program.md", name: "growth-writing-program.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    directoryMaterializationService: {
      materializeTaskEvaluation() {
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
    getLearningProgramService: () => ({
      getTaskCard(taskCardId) {
        programCalls.push(["getTaskCard", taskCardId]);
        return null;
      },
      getTaskCardForKanbanCard(kanbanCardId, filters) {
        programCalls.push(["getTaskCardForKanbanCard", kanbanCardId, filters]);
        return {
          taskCardId: "ltask_from_kanban",
          title: "Writing task",
          sourceBasisRefs: ["source:1"],
        };
      },
      listInteractionSessions(filters) {
        programCalls.push(["listInteractionSessions", filters]);
        return [];
      },
      startTaskSession(taskCardId) {
        programCalls.push(["startTaskSession", taskCardId]);
        return { sessionId: "session-1" };
      },
      recordEvaluation(sessionId, input) {
        programCalls.push(["recordEvaluation", sessionId, input]);
        return { evaluationId: input.evaluationId, passed: input.passed, verification: { status: "verified" } };
      },
      settleEvaluationReward(evaluationId, input) {
        programCalls.push(["settleEvaluationReward", evaluationId, input]);
        return { status: "settled", ledgerEntry: { entryId: "ledger-1" } };
      },
      importSourceDirectory(input) {
        programCalls.push(["importSourceDirectory", input]);
        return {
          counts: { importedSources: 1 },
          sources: [{ sourceRef: "cleaned_history:growth-progress" }],
        };
      },
      rebuildLearnerProfile(input) {
        programCalls.push(["rebuildLearnerProfile", input]);
        return { profile: { learnerId: input.learnerId, profileSummary: "sources=4" } };
      },
      getProgram(programId) {
        programCalls.push(["getProgram", programId]);
        return program;
      },
      updateProgram(programId, patch) {
        programCalls.push(["updateProgram", programId, patch]);
        Object.assign(program, patch);
        return program;
      },
    }),
    learningCoinService: {
      grantCoins() {
        throw new Error("direct coin fallback should not run");
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_growth",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            learningProgramId: "program-1",
            learningDraftId: "draft-1",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
            learningGrowthEvaluationStatus: "draft_feedback",
          }],
        };
      },
      async mutateCard(input) {
        calls.push(input);
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, I joined a school activity with my classmates.",
    "Because the poster needed many details, I wrote a plan and checked each part.",
    "Then I asked my group to add examples and fix unclear sentences.",
    "Finally, we finished on time, and I learned that teamwork needs clear communication and careful revision.",
    "I added one more reflection sentence because the report should show what changed and why the change helped.",
    "The final version explains the problem, action, and result in a clearer order for the reader.",
  ].join(" ");
  const result = await service.submitWriting({ workspaceId: "child", cardId: "t_growth", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(result.reward.entryId, "ledger-1");
  assert.ok(programCalls.some((call) => call[0] === "recordEvaluation"));
  assert.ok(programCalls.some((call) => call[0] === "getTaskCardForKanbanCard"));
  assert.ok(programCalls.some((call) => call[0] === "importSourceDirectory"));
  assert.ok(programCalls.some((call) => call[0] === "rebuildLearnerProfile"));
  assert.ok(program.sourceBasisRefs.includes("cleaned_history:growth-progress"));
  assert.equal(calls.at(-1).action, "complete");
}

async function testGenericVocabularyTaskUsesTaskModelContract() {
  const calls = [];
  const materialized = [];
  const reports = [];
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport(input) {
        reports.push(input);
        return { path: "C:\\tmp\\growth-vocabulary-feedback.md", name: "growth-vocabulary-feedback.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    directoryMaterializationService: {
      materializeTaskEvaluation(input) {
        materialized.push(input);
        return { directory: "learning-plan-dir", summaryPath: "summary.md" };
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_vocab",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            learningTaskModel: {
              version: "learning-task-model-v1",
              activityType: "vocabulary",
              skillId: "english_vocabulary_active_use",
              learnerInstruction: "Use target vocabulary in school examples.",
              submissionContract: {
                firstSubmissionKind: "vocabulary_sentences",
                revisionSubmissionKind: "vocabulary_repair",
              },
            },
          }],
        };
      },
      async mutateCard(input) {
        calls.push(input);
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  assert.equal(typeof service.submitTask, "function");
  const text = [
    "I observe the class carefully.",
    "The teacher reminded us to compare two ideas.",
    "I improved my sentence because the first version was too general.",
    "Next time I will add evidence before I answer.",
    "Finally, I can use the word accurately in a school example.",
    "I also explain why the word fits the situation, so my answer is not only a short list of sentences.",
  ].join("\n");
  const result = await service.submitTask({ workspaceId: "child", cardId: "t_vocab", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.evaluation.activityType, "vocabulary");
  assert.equal(result.evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(calls[0].submissionKind, "vocabulary_sentences");
  assert.equal(calls[1].learningGrowthEvaluation.activityType, "vocabulary");
  assert.equal(materialized.length, 1);
  assert.equal(reports[0].evaluation.activityType, "vocabulary");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /I observe the class carefully/);
}

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthWritingSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires kanbanCardProvider list\/mutate/,
  );
}

(async () => {
  testDependencyValidation();
  await testSubmitWritingStoresAsKanbanComment();
  await testModelFeedbackEnhancesPublicEvaluation();
  await testFinalRewriteSettlesAndCompletes();
  await testUsesLearningProgramSettlementWhenTaskLinked();
  await testGenericVocabularyTaskUsesTaskModelContract();
  await testRejectsMissingNonGrowthAndOversizedSubmissions();
  console.log("learning growth writing submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
