"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  bestPublication,
  kanbanPlanId,
  materialize,
  parseArgs,
  reportParts,
} = require("../scripts/materialize-learning-growth-directory");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "growth-dir-backfill-"));
}

function testParseArgs() {
  const parsed = parseArgs([
    "--data-dir", "C:\\Data",
    "--workspace-id", "learner",
    "--learner-id", "learner",
    "--limit", "12",
    "--dry-run",
  ]);
  assert.equal(parsed.dataDir, "C:\\Data");
  assert.equal(parsed.workspaceId, "learner");
  assert.equal(parsed.learnerId, "learner");
  assert.equal(parsed.limit, 12);
  assert.equal(parsed.dryRun, true);
}

function testReportParts() {
  const root = path.join(tempDir(), "artifacts");
  const reportPath = path.join(root, "case-1", "t_1", "report-writing-feedback.md");
  assert.deepEqual(reportParts(root, reportPath), {
    caseId: "case-1",
    cardId: "t_1",
    fileName: "report-writing-feedback.md",
  });
}

function testBestPublicationPrefersKanbanPlanId() {
  const selected = bestPublication([
    {
      publicationId: "wrapper-without-plan",
      createdAt: "2026-05-18T02:00:00.000Z",
      kanbanResult: { ok: true, source: "learning-program" },
    },
    {
      publicationId: "with-plan",
      createdAt: "2026-05-18T01:00:00.000Z",
      kanbanResult: { plan: { id: "case-1" } },
    },
  ]);
  assert.equal(selected.publicationId, "with-plan");
  assert.equal(kanbanPlanId({ kanbanResult: { plan: { id: "nested-case" } } }), "nested-case");
}

function fakeRepository() {
  return {
    listPrograms() {
      return [{
        programId: "program-1",
        workspaceId: "weixin_stephen",
        learnerId: "weixin_stephen",
        title: "Fanfan English Growth",
      }];
    },
    listPlanDrafts() {
      return [{
        draftId: "draft-1",
        programId: "program-1",
        learnerId: "weixin_stephen",
        workspaceId: "weixin_stephen",
        status: "published",
        weekStart: "2026-05-18",
        dailyPlans: [],
      }];
    },
    listPublications() {
      return [{
        publicationId: "pub-1",
        draftId: "draft-1",
        kanbanResult: { plan: { id: "case-1" } },
        createdAt: "2026-05-18T00:00:00.000Z",
      }];
    },
    listTaskCards() {
      return [{
        taskCardId: "task-1",
        programId: "program-1",
        draftId: "draft-1",
        learnerId: "weixin_stephen",
        workspaceId: "weixin_stephen",
        kanbanCardId: "t_1",
        title: "Writing task",
      }];
    },
    listEvaluations() {
      return [{
        evaluationId: "eval-1",
        taskCardId: "task-1",
        status: "completed",
        score: 91,
        passed: true,
        summary: "Structured summary only.",
        createdAt: "2026-05-18T01:00:00.000Z",
      }];
    },
  };
}

function testMaterializeCallsProgramAndReportMaterializers() {
  const dataDir = tempDir();
  const artifactReport = path.join(dataDir, "artifacts", "kanban-reading", "weixin_stephen", "case-1", "t_1", "task-writing-feedback.md");
  fs.mkdirSync(path.dirname(artifactReport), { recursive: true });
  fs.writeFileSync(artifactReport, "# Report\n", "utf8");
  const calls = { programs: [], reports: [] };
  const counts = materialize({
    dataDir,
    repository: fakeRepository(),
    materializer: {
      materializeProgram(input) {
        calls.programs.push(input);
        return {};
      },
      materializeWritingEvaluation(input) {
        calls.reports.push(input);
        return {};
      },
    },
  });
  assert.equal(counts.programsScanned, 1);
  assert.equal(counts.programsMaterialized, 1);
  assert.equal(counts.reportFilesScanned, 1);
  assert.equal(counts.reportsMaterialized, 1);
  assert.equal(calls.programs[0].program.programId, "program-1");
  assert.equal(calls.reports[0].cardId, "t_1");
  assert.equal(calls.reports[0].evaluation.score, 91);
  assert.equal(calls.reports[0].report.name, "task-writing-feedback.md");
}

function testDryRunDoesNotWriteThroughMaterializer() {
  const dataDir = tempDir();
  const report = path.join(dataDir, "artifacts", "kanban-reading", "weixin_stephen", "case-1", "t_1", "task-writing-feedback.md");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, "# Report\n", "utf8");
  const counts = materialize({
    dataDir,
    dryRun: true,
    repository: fakeRepository(),
    materializer: {
      materializeProgram() {
        throw new Error("dry-run should not write program files");
      },
      materializeWritingEvaluation() {
        throw new Error("dry-run should not write report files");
      },
    },
  });
  assert.equal(counts.programsMaterialized, 1);
  assert.equal(counts.reportsMaterialized, 1);
}

testParseArgs();
testReportParts();
testBestPublicationPrefersKanbanPlanId();
testMaterializeCallsProgramAndReportMaterializers();
testDryRunDoesNotWriteThroughMaterializer();
console.log("materialize learning growth directory tests passed");
