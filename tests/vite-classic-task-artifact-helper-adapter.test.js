"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-task-artifact-helpers.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    Array,
    Set,
    Map,
    globalThis: null,
    window: {
      __homeAiImportTaskArtifactHelperModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-task-artifact-helpers.js" });
  return { context, calls, helpers: context.HermesTaskArtifactHelpers };
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
  await test("classic task artifact helper declares bounded ESM import path", () => {
    assert.match(source, /TASK_ARTIFACT_HELPER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/task-artifact-helper-model\/task-artifact-helper-model\.js/);
    assert.match(source, /__homeAiImportTaskArtifactHelperModel/);
    assert.match(source, /importTaskArtifactHelperModel/);
    assert.match(source, /currentTaskArtifactHelperModel/);
    assert.match(source, /latestTaskListDocumentPlan/);
    assert.match(source, /displayArtifacts/);
  });

  await test("classic helper consumes ESM model for artifact projection", async () => {
    const modelCalls = [];
    const fakeModel = {
      artifactKind(artifact) {
        modelCalls.push(["kind", artifact.name]);
        return artifact.name.endsWith(".md") ? "markdown" : "file";
      },
      artifactDisplayName(artifact) {
        modelCalls.push(["name", artifact.name]);
        return `model:${artifact.name}`;
      },
      artifactStem(artifact) {
        modelCalls.push(["stem", artifact.name]);
        return artifact.name.replace(/\.[^.]+$/, "").toLowerCase();
      },
      artifactDisplayRank(artifact) {
        modelCalls.push(["rank", artifact.name]);
        return artifact.name.endsWith(".md") ? 0 : 3;
      },
      isMarkdownArtifact(artifact) {
        modelCalls.push(["markdown", artifact.name]);
        return artifact.name.endsWith(".md");
      },
      isTaskListPrimaryDocument(artifact) {
        modelCalls.push(["primary", artifact.name]);
        return artifact.name.endsWith(".md");
      },
      latestTaskListDocumentPlan(artifacts) {
        modelCalls.push(["latest", artifacts.length]);
        return artifacts[0] || null;
      },
      displayArtifacts(artifacts) {
        modelCalls.push(["display", artifacts.length]);
        return artifacts.slice().reverse();
      },
    };
    const { helpers, calls } = createHarness(fakeModel);
    await helpers.importTaskArtifactHelperModel();

    assert.equal(helpers.artifactKind({ name: "a.md" }), "markdown");
    assert.equal(helpers.artifactDisplayName({ name: "a.md" }), "model:a.md");
    assert.equal(helpers.artifactStem({ name: "a.md" }), "a");
    assert.equal(helpers.artifactDisplayRank({ name: "a.md" }), 0);
    assert.equal(helpers.isMarkdownArtifact({ name: "a.md" }), true);
    assert.equal(helpers.isTaskListPrimaryDocument({ name: "a.md" }), true);
    const latest = helpers.latestTaskListDocument({ messages: [{ artifacts: [{ id: "one", name: "one.md" }] }] });
    assert.equal(latest.id, "one");
    assert.deepEqual(helpers.displayArtifacts([{ id: "one" }, { id: "two" }]).map((artifact) => artifact.id), ["two", "one"]);
    assert.deepEqual(calls[0], ["import", "/vite-islands/task-artifact-helper-model/task-artifact-helper-model.js"]);
    assert.ok(modelCalls.some((call) => call[0] === "latest"));
    assert.ok(modelCalls.some((call) => call[0] === "display"));
  });

  await test("classic helper fallback remains usable without loaded ESM model", () => {
    const { helpers } = createHarness(null);
    assert.equal(helpers.artifactKind({ name: "deck.pptx" }), "presentation");
    assert.equal(helpers.isTaskListPrimaryDocument({ name: "report.pdf" }), true);
    assert.equal(helpers.latestTaskListDocument({
      messages: [{ artifacts: [{ id: "pdf", name: "report.pdf" }, { id: "md", name: "report.md" }] }],
    })?.id, "md");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
