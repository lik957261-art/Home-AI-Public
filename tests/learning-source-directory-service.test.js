"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningSourceDirectoryService, LEARNING_MATERIALS_LABEL } = require("../adapters/learning-source-directory-service");
const { createLearningSourceService } = require("../adapters/learning-source-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-source-directory-"));
}

function writeUtf8(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function fanfanRoot(ownerRoot) {
  return path.join(ownerRoot, "Hermes-\u5f90\u6b23", "\u51e1\u51e1");
}

function createService(root) {
  const repository = createLearningProgramRepository({ dataDir: path.join(root, "data") });
  const sourceService = createLearningSourceService({ repository });
  const ownerDriveRoot = path.join(root, "owner-drive");
  const service = createLearningSourceDirectoryService({ sourceService, ownerDriveRoot });
  return { repository, service, ownerDriveRoot };
}

function seedSummaries(ownerDriveRoot) {
  const root = fanfanRoot(ownerDriveRoot);
  writeUtf8(path.join(root, ".hermes-cleaned", "summary.md"), [
    "# cumulative",
    "Cleaned historical learner evidence summary only.",
    "No full transcript or answer body is stored here.",
  ].join("\n"));
  writeUtf8(path.join(root, "\u5b66\u4e60\u8ba1\u5212", ".hermes-cleaned", "summary.md"), [
    "# learning plan",
    "Plan summary from the parent learning-plan directory.",
    "Use as source basis, not as raw child payload.",
  ].join("\n"));
  writeUtf8(path.join(root, "\u5b66\u4e60\u8ba1\u5212", ".hermes-cleaned", "learning-growth-progress.md"), [
    "# Fanfan Growth cumulative progress signals",
    "Vocabulary task completed: score 88/100; next practice is concrete examples.",
    "This is summary-only progress data.",
  ].join("\n"));
  writeUtf8(path.join(root, "\u0030\u0035_\u5b66\u4e1a\u5347\u5b66", "english-growth.md"), [
    "# profile signal",
    "Fanfan is Grade 7 / G7 and the English language level is 5.5-6.",
    "The target bridge is CEFR B1 style output.",
  ].join("\n"));
}

function testDefaultFanfanBindingImportsParentCleanedSummaries() {
  const root = tempRoot();
  const { repository, service, ownerDriveRoot } = createService(root);
  seedSummaries(ownerDriveRoot);

  const bindings = service.listBindings({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].directoryLabel, LEARNING_MATERIALS_LABEL);
  assert.equal(bindings[0].availableSummaryCount, 3);
  assert.equal(bindings[0].policy, "summary_only_cleaned_data");
  assert.doesNotMatch(JSON.stringify(bindings), /ProgramData|owner-drive|\\\\|C:/);

  const dryRun = service.importSummaries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen", dryRun: true });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.counts.sources, 4);
  assert.equal(repository.listSources({ learnerId: "weixin_stephen" }).length, 0);
  assert.ok(dryRun.sources.every((source) => source.sourceId.startsWith("lsource_dir_") || source.sourceId.startsWith("lsource_signal_")));
  assert.ok(dryRun.sources.some((source) => source.sourceType === "learner_profile_signal"));
  assert.ok(dryRun.sources.some((source) => source.refs[0].includes("learning_growth_progress_signals")));
  const signal = dryRun.sources.find((source) => source.sourceType === "learner_profile_signal");
  assert.match(signal.summary, /gradeBand=grade7/);
  assert.match(signal.summary, /languageLevel=5\.5-6/);
  assert.ok(dryRun.sources.every((source) => source.refs[0].startsWith("owner-learning-materials:weixin_stephen:")));
  assert.doesNotMatch(JSON.stringify(dryRun.sources), /owner-drive|C:/);

  const imported = service.importSummaries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(imported.counts.sources, 4);
  assert.equal(imported.counts.importedSources, 4);
  const saved = repository.listSources({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(saved.length, 4);
  assert.ok(saved.every((source) => source.tags.includes("learning_materials")));
  assert.ok(saved.some((source) => source.tags.includes("grade7") && source.tags.includes("language_level_5_5_6")));
  assert.ok(saved.every((source) => source.summary.length > 20 && source.summary.length <= 1200));
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testCustomBindingCannotReadOutsideOwnerRoot() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: path.join(root, "data") });
  const sourceService = createLearningSourceService({ repository });
  const ownerDriveRoot = path.join(root, "owner-drive");
  const service = createLearningSourceDirectoryService({
    sourceService,
    ownerDriveRoot,
    bindings: [{
      bindingId: "bad",
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      displayName: "Fanfan",
      directoryLabel: LEARNING_MATERIALS_LABEL,
      ownerRelativePath: ".",
      summaryCandidates: [{
        role: "bad",
        relativePath: "../outside/summary.md",
        sourceType: "cleaned_history",
        title: "bad",
      }],
    }],
  });
  assert.throws(() => service.listBindings({ workspaceId: "weixin_stephen" }), /outside the owner learning-materials root/);
  assert.throws(() => service.importSummaries({ bindingId: "bad" }), /outside the owner learning-materials root/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testDefaultFanfanBindingImportsParentCleanedSummaries();
testCustomBindingCannotReadOutsideOwnerRoot();

console.log("learning source directory service tests passed");
