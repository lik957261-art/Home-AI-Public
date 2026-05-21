"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthProgressSyncService,
} = require("../adapters/learning-growth-progress-sync-service");

function testSyncImportsProgressSourcesProfileAndProgramRefs() {
  const calls = [];
  const program = {
    programId: "program-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    status: "active",
    sourceBasisRefs: ["cleaned_history:old"],
    constraints: { existing: true },
  };
  const service = createLearningGrowthProgressSyncService({
    nowIso: () => "2026-05-18T10:00:00.000Z",
  });
  const result = service.syncAfterMaterialization({
    programService: {
      importSourceDirectory(input) {
        calls.push(["importSourceDirectory", input]);
        return {
          counts: { sources: 4, importedSources: 4 },
          binding: { bindingId: "learning-materials:weixin_stephen" },
          sources: [
            { sourceRef: "cleaned_history:summary" },
            { sourceType: "cleaned_history", sourceId: "progress" },
            { sourceRef: "learner_profile_signal:stage" },
          ],
        };
      },
      rebuildLearnerProfile(input) {
        calls.push(["rebuildLearnerProfile", input]);
        return {
          profile: {
            learnerId: input.learnerId,
            profileSummary: "sources=4; activeGoals=1; programs=1; trackedSkills=8",
          },
        };
      },
      getProgram(programId) {
        calls.push(["getProgram", programId]);
        return program;
      },
      updateProgram(programId, patch) {
        calls.push(["updateProgram", programId, patch]);
        Object.assign(program, patch);
        return program;
      },
    },
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    programId: "program-1",
    card: {
      learningProgramId: "program-1",
      workspaceId: "weixin_stephen",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.importedSources, 4);
  assert.equal(result.profileRebuilt, true);
  assert.equal(result.programsRefreshed, 1);
  assert.ok(result.sourceRefs.includes("cleaned_history:progress"));
  assert.ok(program.sourceBasisRefs.includes("cleaned_history:summary"));
  assert.ok(program.sourceBasisRefs.includes("learner_profile_signal:stage"));
  assert.equal(program.constraints.existing, true);
  assert.equal(program.constraints.growthProgressSignalsSyncedAt, "2026-05-18T10:00:00.000Z");
  assert.deepEqual(calls[0], ["importSourceDirectory", { workspaceId: "weixin_stephen", learnerId: "weixin_stephen" }]);
  assert.doesNotMatch(JSON.stringify(result), /answerText|rawTranscript|questionText|answerKey|prompt|localPath|endpoint/);
}

function testSyncIsBestEffortWhenServiceUnavailable() {
  const service = createLearningGrowthProgressSyncService();
  const result = service.syncAfterMaterialization({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
  });
  assert.equal(result.ok, false);
  assert.ok(result.skipped.includes("learning_program_service_unavailable"));
}

function testSyncKeepsSubmissionFlowAliveOnImportError() {
  const service = createLearningGrowthProgressSyncService();
  const result = service.syncAfterMaterialization({
    programService: {
      importSourceDirectory() {
        throw new Error("temporary source scan failure");
      },
      rebuildLearnerProfile() {
        return { profile: { learnerId: "weixin_stephen", profileSummary: "sources=3" } };
      },
    },
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
  });
  assert.equal(result.ok, false);
  assert.equal(result.profileRebuilt, true);
  assert.equal(result.errors[0].step, "import_source_directory");
}

testSyncImportsProgressSourcesProfileAndProgramRefs();
testSyncIsBestEffortWhenServiceUnavailable();
testSyncKeepsSubmissionFlowAliveOnImportError();
console.log("learning growth progress sync service tests passed");
