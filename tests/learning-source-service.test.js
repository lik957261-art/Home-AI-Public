"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningSourceService, normalizeLearningSourceInput } = require("../adapters/learning-source-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-source-service-"));
}

function testNormalizeAndSave() {
  const normalized = normalizeLearningSourceInput({
    workspaceId: "weixin_stephen",
    sourceType: "school",
    title: "School",
    summary: "Summary",
    confidence: 2,
    tags: "english,writing",
  });
  assert.equal(normalized.learnerId, "weixin_stephen");
  assert.equal(normalized.sourceType, "school");
  assert.equal(normalized.confidence, 1);
  assert.deepEqual(normalized.tags, ["english", "writing"]);

  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningSourceService({ repository });
  const source = service.save(Object.assign({}, normalized, { rawTranscript: "hidden" }));
  assert.equal(source.sourceRef, `school:${source.sourceId}`);
  assert.equal(service.basisRefs({ learnerId: "weixin_stephen" })[0], source.sourceRef);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).sources, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testNormalizeAndSave();
console.log("learning source service tests passed");
