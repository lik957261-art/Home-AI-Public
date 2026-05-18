"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createLearningGrowthDirectoryMaterializationService,
} = require("../adapters/learning-growth-directory-materialization-service");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-materialize-"));
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function testMaterializesProgramSummaryWithoutRawAnswers() {
  const ownerRoot = makeTempRoot();
  const learningPlanRoot = path.join(ownerRoot, "Fanfan", "LearningPlan");
  fs.mkdirSync(path.join(learningPlanRoot, ".hermes-cleaned"), { recursive: true });
  fs.writeFileSync(path.join(learningPlanRoot, ".hermes-cleaned", "summary.md"), "# Existing summary\n", "utf8");
  const service = createLearningGrowthDirectoryMaterializationService({
    ownerDriveRoot: ownerRoot,
    learnerDirectories: { weixin_stephen: learningPlanRoot },
    nowIso: () => "2026-05-18T08:00:00.000Z",
  });
  const result = service.materializeProgram({
    workspaceId: "weixin_stephen",
    program: {
      programId: "program-1",
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      title: "Fanfan English Growth",
      domain: "english",
      goalSummary: "Improve English writing and speaking with weekly tasks.",
      focusAreas: ["writing", "speaking"],
    },
    draft: {
      draftId: "draft-1",
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
      dailyPlans: [{
        date: "2026-05-18",
        tasks: [{
          taskId: "task-1",
          title: "Short writing",
          taskCardType: "single_subject",
          plannedMinutes: 15,
        }],
      }],
    },
    kanbanResult: { plan: { id: "case-1" }, cards: [{ card: { id: "t_growth" } }] },
  });
  assert.ok(fs.existsSync(result.planPath));
  assert.ok(fs.existsSync(result.summaryPath));
  const plan = read(result.planPath);
  assert.match(plan, /Fanfan English Growth/);
  assert.match(plan, /Short writing/);
  assert.match(plan, /Privacy boundary/);
  assert.doesNotMatch(plan, /Last week I joined/);
  const rootSummary = read(path.join(learningPlanRoot, ".hermes-cleaned", "summary.md"));
  assert.match(rootSummary, /Existing summary/);
  assert.match(rootSummary, /hermes-mobile-learning-growth-summary:start/);
  assert.match(rootSummary, /Short writing/);
}

function testWritingEvaluationUsesVisibleDirectoryAndCopiesReport() {
  const ownerRoot = makeTempRoot();
  const learningPlanRoot = path.join(ownerRoot, "Fanfan", "LearningPlan");
  const sourceReport = path.join(ownerRoot, "artifact-root", "report.md");
  fs.mkdirSync(path.dirname(sourceReport), { recursive: true });
  fs.writeFileSync(sourceReport, "# report\n", "utf8");
  const service = createLearningGrowthDirectoryMaterializationService({
    ownerDriveRoot: ownerRoot,
    learnerDirectories: { weixin_stephen: learningPlanRoot },
    nowIso: () => "2026-05-18T08:30:00.000Z",
  });
  const reportDir = service.reportDirectoryForCard("weixin_stephen", "t_growth", {
    id: "t_growth",
    content: "Writing card",
    kanbanCaseId: "case-1",
    kanbanCaseSummary: "Fanfan English Growth",
  });
  assert.match(reportDir, /deliverables/);
  const materialized = service.materializeWritingEvaluation({
    workspaceId: "weixin_stephen",
    cardId: "t_growth",
    card: {
      id: "t_growth",
      content: "Writing card",
      kanbanCaseId: "case-1",
      kanbanCaseSummary: "Fanfan English Growth",
    },
    evaluation: {
      stage: "final",
      status: "completed",
      score: 88,
      maxScore: 100,
      passed: true,
      summary: "Final guidance summary.",
      feedbackSections: {
        focusAreas: ["Keep concrete examples."],
        nextPractice: "Use one outline first.",
      },
    },
    report: {
      path: sourceReport,
      name: "writing-feedback.md",
    },
  });
  assert.ok(fs.existsSync(materialized.summaryPath));
  assert.ok(fs.existsSync(materialized.reportPath));
  assert.match(materialized.reportPath, /writing-feedback\.md$/);
  const cleaned = read(materialized.summaryPath);
  assert.match(cleaned, /Final guidance summary/);
  assert.match(cleaned, /Keep concrete examples/);
  assert.match(cleaned, /does not store the full student answer/);
  assert.doesNotMatch(cleaned, /Last week I joined/);
}

testMaterializesProgramSummaryWithoutRawAnswers();
testWritingEvaluationUsesVisibleDirectoryAndCopiesReport();
console.log("learning growth directory materialization service tests passed");
