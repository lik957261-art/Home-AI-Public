"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/kanban-story-helpers-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("kanban story helpers model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/kanban-story-helpers-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /KANBAN_STORY_HELPERS_MODEL_VERSION/);
  });

  await test("plans compact text, timestamps, status, and parsed plan sections", () => {
    assert.equal(model.compactDisplayTextPlan(" a\n b ", 10), "a b");
    assert.equal(model.compactDisplayTextPlan("1234567890", 5), "1234...");
    assert.equal(model.todoSortTimestampPlan({ updatedAt: "2026-07-05 10:00:00" }), Date.parse("2026-07-05T10:00:00"));
    assert.equal(model.normalizedKanbanStatusPlan({ status: "completed" }), "done");
    const todo = {
      description: [
        "Multi-Agent plan: Build report",
        "",
        "Source request:",
        "Analyze source",
        "",
        "Expected deliverables:",
        "- draft.md",
      ].join("\n"),
    };
    assert.deepEqual(model.parsedKanbanPlanDescriptionPlan(todo), {
      summary: "Build report",
      sourceText: "Analyze source",
      cardGoal: "",
      deliverables: ["draft.md"],
      acceptance: [],
      dependsOn: [],
    });
  });

  await test("plans case info, story keys, status summaries, and conclusions", () => {
    const todo = {
      id: "card-1",
      content: "Implement feature",
      kanbanCaseId: "case-1",
      kanbanCaseMode: "multi-agent",
      kanbanCaseCardIndex: 2,
      kanbanCaseDeliverables: ["a.md", "b.md"],
    };
    assert.deepEqual(model.kanbanCardCaseInfoPlan(todo), {
      id: "case-1",
      mode: "multi-agent",
      caseTemplate: "",
      sourceText: "",
      summary: "Implement feature",
      cardId: "card-1",
      cardIndex: 2,
      cardCount: 0,
      cardGoal: "",
      dependsOn: [],
      deliverables: ["a.md", "b.md"],
      acceptance: [],
    });
    const group = {
      id: "case-1",
      mode: "multi-agent",
      cards: [
        { todo: { id: "a", kanbanStatus: "done", updatedAt: "2026-01-01T00:00:00Z" } },
        { todo: { id: "b", kanbanStatus: "archived", updatedAt: "2026-01-02T00:00:00Z" } },
      ],
    };
    assert.equal(model.kanbanStoryCaseKeyPlan(group), "multi-agent:case-1");
    assert.equal(model.kanbanArchiveStatusSummaryPlan(group), "done 1 / archived 1");
    assert.equal(model.kanbanArchiveConclusionPlan(group), "Done 1 / Archived 1");
    assert.equal(model.kanbanArchiveConclusionPlan(group, {
      feedbackForTodo: (item) => item.id === "b" ? "Finished with evidence." : "",
    }), "Finished with evidence.");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
