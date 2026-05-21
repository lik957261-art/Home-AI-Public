"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningFoundationImportService } = require("../adapters/learning-foundation-import-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-foundation-import-"));
}

async function testImportsSummaryOnlyFoundationData() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningFoundationImportService({ repository });

  const result = service.importFoundation({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    sources: [{ sourceType: "school", title: "School summary", summary: "Summary only.", tags: ["english"] }],
    goals: [{ title: "English output", domain: "english", focusAreas: ["speaking"], targetSummary: "Summary only." }],
    curriculumReferences: [{ title: "Public reference", domain: "english", summary: "Reference metadata only." }],
    profile: { displayName: "Fanfan", profileSummary: "Summary only.", strengths: ["reading"] },
    skillStates: [{ skillId: "english_speaking_retell", level: "baseline", confidence: 0.7 }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { sources: 1, goals: 1, curriculumReferences: 1, profiles: 1, skillStates: 1 });
  assert.equal(repository.listSources({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listGoals({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.listCurriculumReferences({ domain: "english" }).length, 1);
  assert.equal(repository.getLearnerProfile("weixin_stephen").displayName, "Fanfan");
  assert.equal(repository.listSkillStates({ learnerId: "weixin_stephen" })[0].skillId, "english_speaking_retell");

  assert.throws(
    () => service.importFoundation({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", sources: [{ title: "bad", answer: "private" }] }),
    /summary-only fields/,
  );

  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

(async () => {
  await testImportsSummaryOnlyFoundationData();
  console.log("learning foundation import service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
