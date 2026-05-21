"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createCurriculumReferenceService } = require("../adapters/curriculum-reference-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "curriculum-reference-service-"));
}

function testSeedAndSelect() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createCurriculumReferenceService({ repository });
  const englishRefs = service.listReferences({ domain: "english" });
  assert.ok(englishRefs.length >= 3);
  assert.ok(englishRefs.every((ref) => ref.copyrightPolicy === "reference_only_no_copied_questions"));
  assert.ok(englishRefs.some((ref) => ref.stage === "grade7-language-5_5-6"));
  assert.ok(englishRefs.some((ref) => ref.stage === "grade7"));
  assert.doesNotMatch(JSON.stringify(englishRefs), /Grade 4-5|grade4-5|upper-primary/);
  const selected = service.selectReferences({
    domain: "english",
    focusAreas: ["english_short_writing"],
    limit: 2,
  });
  assert.equal(selected.length, 2);
  assert.ok(selected.some((ref) => ref.focusAreas.includes("english_short_writing")));
  assert.equal(repository.counts().curriculumReferences >= 5, true);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testSeedAndSelect();
console.log("curriculum reference service tests passed");
