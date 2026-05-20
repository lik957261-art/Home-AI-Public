"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningGrowthNativeBackfillService } = require("../adapters/learning-growth-native-backfill-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-backfill-"));
}

function seed(repository) {
  repository.upsertProgram({
    programId: "program-growth",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_grammar"],
    goalSummary: "summary only",
    startDate: "2026-05-20",
    endDate: "2026-05-27",
    daysPerWeek: 5,
    minutesPerDay: 20,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["source:growth"],
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
    status: "published",
    privacyLevel: "summary_only",
  });
}

function legacyCard() {
  return {
    id: "t_growth",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    kanbanCaseTemplate: "learning-growth",
    learningTaskCardId: "task-growth",
    learningGrowthSubmissionStatus: "submitted",
    learningGrowthSubmissionKind: "learner_attempt",
    learningGrowthSubmissionAt: "2026-05-20T08:00:00.000Z",
    learningGrowthSubmissionText: "This full learner answer is used only to compute a digest and must not be stored.",
    learningGrowthEvaluationId: "eval-growth",
    learningGrowthEvaluationStatus: "reflection_required",
    learningGrowthEvaluationAt: "2026-05-20T08:02:00.000Z",
    learningGrowthScore: 84,
    learningGrowthMaxScore: 100,
    learningGrowthPassed: true,
    learningGrowthFeedbackSummary: "summary only feedback",
    learningGrowthNextStep: "spoken_reflection_required",
    learningGrowthReportPath: "C:\\tmp\\growth-feedback.md",
    learningGrowthReportName: "growth-feedback.md",
    learningGrowthFocusAreas: ["verb tense"],
    learningGrowthReflectionStatus: "accepted",
    learningGrowthReflectionMode: "spoken",
    learningGrowthReflectionAt: "2026-05-20T08:05:00.000Z",
    learningGrowthReflectionScore: 88,
    learningGrowthReflectionSummary: "understood the error",
    learningGrowthReflectionTranscriptDigest: "digest-transcript",
    learningGrowthReflectionAudioDigest: "digest-audio",
    learningGrowthReflectionEvidenceRefs: ["audio:digest-audio"],
  };
}

async function testDryRunDoesNotWriteRecords() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seed(repository);
    const service = createLearningGrowthNativeBackfillService({
      learningProgramService: createLearningProgramService({ repository }),
    });
    const result = await service.backfill({ cards: [legacyCard()] });
    assert.equal(result.ok, true);
    assert.equal(result.counts.dryRun, true);
    assert.equal(result.counts.submissions, 1);
    assert.equal(result.counts.evaluations, 1);
    assert.equal(result.counts.reflections, 1);
    assert.equal(result.counts.artifacts, 1);
    assert.equal(repository.listTaskSubmissions({ taskCardId: "task-growth" }).length, 0);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testBackfillWritesSummaryOnlyNativeRecords() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  try {
    seed(repository);
    const service = createLearningGrowthNativeBackfillService({
      learningProgramService: createLearningProgramService({ repository }),
    });
    const result = await service.backfill({ cards: [legacyCard()], dryRun: false });
    assert.equal(result.ok, true);
    assert.equal(result.results[0].status, "backfilled");
    assert.equal(repository.listTaskSubmissions({ taskCardId: "task-growth" }).length, 1);
    assert.equal(repository.listEvaluations({ taskCardId: "task-growth" })[0].status, "reflection_required");
    assert.equal(repository.listTaskReflections({ taskCardId: "task-growth" })[0].status, "accepted");
    const artifact = repository.listTaskArtifacts({ taskCardId: "task-growth" })[0];
    assert.equal(artifact.name, "growth-feedback.md");
    const serialized = JSON.stringify({
      submissions: repository.listTaskSubmissions({ taskCardId: "task-growth" }),
      artifacts: repository.listTaskArtifacts({ taskCardId: "task-growth" }),
    });
    assert.doesNotMatch(serialized, /full learner answer|C:\\tmp\\growth-feedback/);
  } finally {
    repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(async () => {
  await testDryRunDoesNotWriteRecords();
  await testBackfillWritesSummaryOnlyNativeRecords();
  console.log("learning growth native backfill service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
