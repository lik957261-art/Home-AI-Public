"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_GRADE7_CURRICULUM_REFS,
  createLearningSourceBootstrapService,
  defaultEnglishFocusAreas,
  defaultGoalInput,
  defaultProgramInput,
} = require("../adapters/learning-source-bootstrap-service");

function makeBootstrapService() {
  const calls = [];
  const goals = [];
  const programs = [];
  const sourceDirectoryService = {
    importSummaries(input) {
      calls.push(["importSummaries", input]);
      return {
        ok: true,
        dryRun: Boolean(input.dryRun),
        counts: { sources: 2, importedSources: input.dryRun ? 0 : 2 },
        sources: [
          { sourceId: "source-1", sourceType: "cleaned_history", sourceRef: "cleaned_history:source-1" },
          { sourceId: "source-2", sourceType: "cleaned_history", sourceRef: "cleaned_history:source-2" },
        ],
      };
    },
  };
  const goalService = {
    list(input) {
      calls.push(["listGoals", input]);
      return goals.slice();
    },
    save(input) {
      calls.push(["saveGoal", input]);
      const goal = Object.assign({ goalId: `goal-${goals.length + 1}`, status: "active" }, input, {
        goalRef: `goal:goal-${goals.length + 1}`,
      });
      goals.push(goal);
      return goal;
    },
  };
  const learnerProfileService = {
    rebuild(input) {
      calls.push(["rebuildProfile", input]);
      return { profile: { learnerId: input.learnerId, profileSummary: "sources=2; activeGoals=1; programs=1" }, skillStates: [] };
    },
  };
  const service = createLearningSourceBootstrapService({
    sourceDirectoryService,
    goalService,
    learnerProfileService,
    listPrograms(input) {
      calls.push(["listPrograms", input]);
      return programs.slice();
    },
    createProgram(input) {
      calls.push(["createProgram", input]);
      const program = Object.assign({ programId: `program-${programs.length + 1}`, status: "active" }, input);
      programs.push(program);
      return program;
    },
    updateProgram(programId, patch) {
      calls.push(["updateProgram", programId, patch]);
      const index = programs.findIndex((program) => program.programId === programId);
      if (index < 0) throw new Error("program not found");
      programs[index] = Object.assign({}, programs[index], patch);
      return programs[index];
    },
  });
  return { calls, goals, programs, service };
}

function testDefaultContractsAreEnglishGrowthReady() {
  const focusAreas = defaultEnglishFocusAreas();
  assert.ok(focusAreas.includes("english_reading_comprehension"));
  assert.ok(focusAreas.includes("english_listening_input"));
  assert.ok(focusAreas.includes("english_speaking_retell"));
  assert.ok(focusAreas.includes("english_short_writing"));
  const goal = defaultGoalInput({}, ["cleaned_history:source-1"]);
  const program = defaultProgramInput({}, goal, ["cleaned_history:source-1"]);
  assert.equal(goal.domain, "english");
  assert.equal(program.domain, "english");
  assert.equal(program.reviewPolicy.parentReviewRequired, true);
  assert.deepEqual(program.sourceBasisRefs, ["cleaned_history:source-1"]);
  assert.deepEqual(program.curriculumRefs, DEFAULT_GRADE7_CURRICULUM_REFS);
  assert.equal(program.constraints.learnerStage.gradeBand, "grade7");
  assert.equal(program.constraints.learnerStage.languageLevel, "5.5-6");
}

function testBootstrapCreatesGoalProgramAndProfileOnce() {
  const { calls, goals, programs, service } = makeBootstrapService();
  const result = service.bootstrap({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.ok, true);
  assert.equal(result.created.sources, 2);
  assert.equal(result.created.goal, 1);
  assert.equal(result.created.program, 1);
  assert.equal(result.created.profile, 1);
  assert.equal(result.reused.goal, 0);
  assert.equal(result.reused.program, 0);
  assert.equal(goals.length, 1);
  assert.equal(programs.length, 1);
  assert.ok(result.program.focusAreas.includes("english_short_writing"));
  assert.ok(result.program.curriculumRefs.includes("school-english-grade7-current"));
  assert.ok(calls.some((call) => call[0] === "rebuildProfile"));
  assert.doesNotMatch(JSON.stringify(result), /rawTranscript|questionText|answerKey|prompt|fullTranscript/);

  const repeated = service.bootstrap({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(repeated.created.goal, 0);
  assert.equal(repeated.created.program, 0);
  assert.equal(repeated.reused.goal, 1);
  assert.equal(repeated.reused.program, 1);
  assert.equal(goals.length, 1);
  assert.equal(programs.length, 1);
}

function testBootstrapRefreshesExistingProgramStageRefs() {
  const { calls, programs, service } = makeBootstrapService();
  programs.push({
    programId: "program-existing",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    domain: "english",
    status: "active",
    curriculumRefs: ["cambridge-primary-english-reference", "school-english-current-grade"],
    sourceBasisRefs: ["old:source"],
    constraints: { old: true },
  });
  const result = service.bootstrap({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.created.program, 0);
  assert.equal(result.created.programRefreshed, 1);
  assert.equal(result.reused.program, 1);
  assert.ok(result.program.curriculumRefs.includes("school-english-grade7-current"));
  assert.equal(result.program.curriculumRefs.includes("cambridge-primary-english-reference"), false);
  assert.equal(result.program.constraints.learnerStage.gradeBand, "grade7");
  assert.ok(result.program.sourceBasisRefs.includes("old:source"));
  assert.ok(calls.some((call) => call[0] === "updateProgram"));
}

function testDryRunDoesNotPersistGoalProgramOrProfile() {
  const { calls, goals, programs, service } = makeBootstrapService();
  const result = service.bootstrap({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.created.sources, 0);
  assert.equal(result.created.goal, 0);
  assert.equal(result.created.program, 0);
  assert.equal(result.created.profile, 0);
  assert.equal(goals.length, 0);
  assert.equal(programs.length, 0);
  assert.equal(calls.some((call) => call[0] === "saveGoal"), false);
  assert.equal(calls.some((call) => call[0] === "createProgram"), false);
  assert.equal(calls.some((call) => call[0] === "rebuildProfile"), false);
}

function testBootstrapRejectsPrivatePayloadKeys() {
  const { service } = makeBootstrapService();
  assert.throws(() => service.bootstrap({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    rawTranscript: "not allowed",
  }), /summary-only fields/);
}

testDefaultContractsAreEnglishGrowthReady();
testBootstrapCreatesGoalProgramAndProfileOnce();
testBootstrapRefreshesExistingProgramStageRefs();
testDryRunDoesNotPersistGoalProgramOrProfile();
testBootstrapRejectsPrivatePayloadKeys();

console.log("learning source bootstrap service tests passed");
