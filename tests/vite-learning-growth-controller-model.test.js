"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/navigation-shell/learning-growth-controller-model.mjs")).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("learning growth controller model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-controller-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans owner and workspace learner scope consistently", async () => {
    const model = await loadModel();
    assert.equal(model.learningGrowthLearnerWorkspaceIdPlan({
      selectedWorkspaceId: "owner",
      listedWorkspaceIds: ["weixin_stephen"],
      isOwner: true,
      defaultLearnerWorkspaceId: "weixin_stephen",
    }), "weixin_stephen");
    assert.equal(model.learningGrowthLearnerWorkspaceIdPlan({
      selectedWorkspaceId: "child",
      authWorkspaceId: "child",
      accessibleWorkspaceIds: ["child"],
      isOwner: false,
    }), "child");
    assert.equal(model.learningGrowthScopeKeyPlan({ workspaceId: "child", learnerId: "child" }), "child:child");
  });

  await test("plans request params and reset patch without mutating state", async () => {
    const model = await loadModel();
    assert.equal(String(model.learningCoinRequestParamsPlan({ workspaceId: "kid", studentId: "kid", limit: 12 })), "workspaceId=kid&studentId=kid&limit=12");
    assert.equal(String(model.learningGrowthMasteryRequestParamsPlan({ workspaceId: "kid", learnerId: "kid", limit: 7 })), "workspaceId=kid&learnerId=kid&limit=7");
    const patch = model.resetLearningGrowthStatePatchPlan("kid:kid");
    assert.equal(patch.learningCoinScopeKey, "kid:kid");
    assert.equal(patch.learningGrowth, null);
    assert.deepEqual(patch.learningGrowthTeachingDrafts, {});
  });

  await test("plans learning program, foundation import, and reward payloads", async () => {
    const model = await loadModel();
    const scope = { workspaceId: "kid", learnerId: "kid", learnerName: "Learner" };
    const program = model.learningProgramFormBodyPlan({
      title: "English month",
      goalSummary: "Read daily",
      focusAreas: ["reading", "writing"],
      sourceBasisRefs: ["book-a"],
    }, scope);
    assert.equal(program.workspaceId, "kid");
    assert.equal(program.domain, "english");
    assert.equal(program.requirements, "Read daily");
    assert.deepEqual(program.focusAreas, ["reading", "writing"]);

    const imported = model.learningFoundationImportBodyPlan({
      sourcesText: "manual_note | Book | Summary | tag-a, tag-b",
      goalsText: "english | Goal | Target | reading;writing",
      profileSummary: "Profile",
    }, scope);
    assert.equal(imported.sources[0].title, "Book");
    assert.deepEqual(imported.sources[0].tags, ["tag-a", "tag-b"]);
    assert.equal(imported.goals[0].targetSummary, "Target");
    assert.equal(imported.profile.displayName, "Learner");

    const reward = model.learningRewardFormBodyPlan({ title: "Park", coinCost: "30", rmbValue: "12.5", description: "Outdoor" });
    assert.deepEqual(reward, { title: "Park", coinCost: 30, description: "Outdoor", rmbCents: 1250 });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
