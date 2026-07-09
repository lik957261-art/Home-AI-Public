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
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-artifact-helper-model.mjs",
  )).href;
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
  await test("task artifact helper model remains browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-artifact-helper-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
  });

  await test("task artifact helper model classifies primary document artifacts", async () => {
    const model = await loadModel();
    assert.equal(model.artifactKind({ name: "summary.md", mime: "text/markdown" }), "markdown");
    assert.equal(model.artifactKind({ name: "slides.pptx" }), "presentation");
    assert.equal(model.artifactKind({ name: "sheet.xlsx" }), "spreadsheet");
    assert.equal(model.artifactKind({ name: "notes.json" }), "text");
    assert.equal(model.isMarkdownArtifact({ name: "summary.md" }), true);
    assert.equal(model.isTaskListPrimaryDocument({ name: "slides.pptx" }), true);
    assert.equal(model.isTaskListPrimaryDocument({ name: "image.jpg" }), false);
  });

  await test("task artifact helper model prefers markdown twin and stable display order", async () => {
    const model = await loadModel();
    const artifacts = [
      { id: "pdf", name: "Report.pdf" },
      { id: "md", name: "Report.md", mime: "text/markdown" },
      { id: "ppt", name: "Slides.pptx" },
      { id: "txt", name: "Notes.txt" },
    ];
    const display = model.displayArtifacts(artifacts);
    assert.deepEqual(display.map((artifact) => artifact.id), ["md", "txt", "ppt"]);
    assert.equal(model.latestTaskListDocumentPlan(artifacts)?.id, "md");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
