"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const {
  createNativeBoardKanbanMigrationService,
  isLearningKanbanCard,
  safeTodoFromCard,
} = require("../adapters/native-board-kanban-migration-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "native-board-migration-"));
}

function seedLearning(repository) {
  repository.upsertProgram({
    programId: "program-growth",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_short_writing"],
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
}

function growthCard() {
  return {
    id: "kanban-growth-1",
    workspaceId: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "Short writing task",
    status: "open",
    kanbanCaseTemplate: "learning-growth",
    learningProgramId: "program-growth",
    learningDraftId: "draft-growth",
    learningGrowthEvaluationId: "eval-growth-1",
    learningGrowthEvaluationStatus: "reflection_required",
    learningGrowthScore: 84,
    learningGrowthPassed: true,
    learningGrowthFeedbackSummary: "summary only",
    learningGrowthReportPath: "C:\\private\\report.md",
    learningGrowthReportName: "feedback.md",
  };
}

function todoCard() {
  return {
    id: "kanban-todo-1",
    workspaceId: "owner",
    assignee: "owner",
    content: "Family task",
    status: "open",
    learningGrowthSubmissionText: "must not be copied",
    localPath: "C:\\private\\file.txt",
  };
}

function legacyLearningCardWithoutProgram() {
  return {
    id: "kanban-learning-legacy-1",
    workspaceId: "weixin_stephen",
    assignee: "weixin_stephen",
    content: "Legacy reading task",
    status: "open",
    kanbanCaseTemplate: "reading",
    learningGrowthSubmissionText: "must not be copied",
    localPath: "C:\\private\\legacy.md",
  };
}

async function testMigrationCreatesNativeTaskAndTodo() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const mobileStore = createMobileSqliteStore({ dataDir: root, dbPath: path.join(root, "mobile.sqlite3") });
  try {
    seedLearning(repository);
    mobileStore.migrate();
    const service = createNativeBoardKanbanMigrationService({
      learningProgramService: createLearningProgramService({ repository }),
      repository,
      mobileStore,
    });
    const result = await service.migrate({ cards: [growthCard(), legacyLearningCardWithoutProgram(), todoCard()], dryRun: false });
    assert.equal(result.ok, true);
    assert.equal(result.counts.learning, 2);
    assert.equal(result.counts.learningCreated, 1);
    assert.equal(result.counts.learningArchived, 1);
    assert.equal(result.counts.learningSkipped, 0);
    assert.equal(result.counts.growthBackfilled, 1);
    assert.equal(result.counts.nativeTodos, 2);
    const task = repository.listTaskCards({ kanbanCardId: "kanban-growth-1", limit: 1 })[0];
    assert.equal(task.kanbanCardId, "kanban-growth-1");
    assert.equal(repository.listEvaluations({ taskCardId: task.taskCardId }).length, 1);
    assert.equal(repository.listTaskArtifacts({ taskCardId: task.taskCardId })[0].name, "feedback.md");
    const todo = mobileStore.getTodoItem("kanban-todo-1");
    assert.equal(todo.content, "Family task");
    const archived = mobileStore.getTodoItem("kanban-learning-legacy-1");
    assert.equal(archived.content, "Legacy reading task");
    assert.equal(result.results.find((item) => item.kanbanCardId === "kanban-learning-legacy-1").target, "native-todo-archive");
    const serialized = JSON.stringify({ task, todo, archived, artifacts: repository.listTaskArtifacts({ taskCardId: task.taskCardId }) });
    assert.doesNotMatch(serialized, /must not be copied|C:\\private/);
  } finally {
    repository.close();
    mobileStore.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testClassificationAndTodoSanitization() {
  assert.equal(isLearningKanbanCard(growthCard()), true);
  assert.equal(isLearningKanbanCard(todoCard()), false);
  const todo = safeTodoFromCard(todoCard());
  assert.equal(todo.source, "official_kanban_migrated");
  assert.equal(JSON.stringify(todo).includes("learningGrowthSubmissionText"), false);
}

(async () => {
  testClassificationAndTodoSanitization();
  await testMigrationCreatesNativeTaskAndTodo();
  console.log("native board kanban migration service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
