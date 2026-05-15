"use strict";

const assert = require("node:assert/strict");
const {
  createKanbanOutputProjectionService,
  defaultCompactText,
  defaultDateStringFromTaskLike,
} = require("../adapters/kanban-output-projection-service");

function makeService(overrides = {}) {
  const calls = {
    extract: [],
    resolve: [],
  };
  const service = createKanbanOutputProjectionService(Object.assign({
    extractArtifactPaths(text) {
      calls.extract.push(text);
      return String(text || "")
        .split(/\s+/)
        .filter((item) => item.startsWith("file:"))
        .map((item) => item.slice("file:".length));
    },
    resolveKanbanOutputFile(workspaceId, rawPath, auth) {
      calls.resolve.push({ workspaceId, rawPath, auth });
      const path = String(rawPath || "");
      if (!path || path.includes("hidden")) return { status: 404, error: "File not found" };
      return {
        file: {
          name: path.split(/[\\/]/).pop(),
          displayPath: `Display/${path}`,
          mime: path.endsWith(".pdf") ? "application/pdf" : "text/plain; charset=utf-8",
          size: path.length,
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
      };
    },
  }, overrides));
  return { service, calls };
}

function run() {
  assert.equal(defaultDateStringFromTaskLike(1778790000), "2026-05-14T20:20:00.000Z");
  assert.equal(defaultDateStringFromTaskLike("not-a-date"), "not-a-date");
  assert.match(defaultCompactText("x".repeat(20), 10), /\[truncated: 20 chars total\]/);

  const { service, calls } = makeService();
  const file = service.publicKanbanOutputFile("child one", "reports/final.pdf");
  assert.deepEqual(calls.resolve.at(-1), { workspaceId: "child one", rawPath: "reports/final.pdf", auth: null });
  assert.deepEqual(file, {
    name: "final.pdf",
    path: "reports/final.pdf",
    displayPath: "Display/reports/final.pdf",
    mime: "application/pdf",
    size: "reports/final.pdf".length,
    updatedAt: "2026-05-15T00:00:00.000Z",
    url: "/api/kanban/cards/output?workspaceId=child+one&path=reports%2Ffinal.pdf",
  });
  assert.equal(service.publicKanbanOutputFile("child", "hidden.pdf"), null);

  const cover = service.publicKanbanCoverFile("child", {
    path: "covers/cover.txt",
    name: "Cover Title",
    mime: "text/cover",
    size: "42",
  });
  assert.equal(cover.role, "cover");
  assert.equal(cover.name, "Cover Title");
  assert.equal(cover.mime, "text/cover");
  assert.equal(cover.size, 42);
  assert.equal(cover.path, "covers/cover.txt");
  assert.equal(service.publicKanbanCoverFile("child", { path: "hidden-cover.pdf" }), null);
  assert.equal(service.publicKanbanCoverFile("child", ""), null);

  const manyPaths = Array.from({ length: 15 }, (_, index) => `file:out-${index}.txt`).join(" ");
  const outputs = service.publicKanbanOutputsFromText("child", manyPaths);
  assert.equal(outputs.length, 12);
  assert.equal(outputs[0].path, "out-0.txt");
  assert.equal(outputs[11].path, "out-11.txt");
  assert.equal(service.publicKanbanOutputsFromText("", manyPaths).length, 0);

  const comments = Array.from({ length: 13 }, (_, index) => ({
    author: `author-${index}`,
    text: index === 12 ? "latest comment file:comment.pdf" : `comment ${index}`,
    created_at: 1778790000 + index,
  }));
  const events = Array.from({ length: 21 }, (_, index) => ({
    kind: index === 0 ? "" : `kind-${index}`,
    payload: index === 20 ? { summary: "event summary file:event.pdf" } : {},
    createdAt: "2026-05-15T01:00:00Z",
  }));
  const runs = Array.from({ length: 9 }, (_, index) => ({
    id: `run-${index}`,
    profile: `profile-${index}`,
    status: index === 8 ? "completed" : "running",
    outcome: index === 8 ? "success" : "",
    summary: index === 8 ? "latest run summary file:run-summary.pdf" : `run summary ${index}`,
    metadata: { outputs: index === 2 ? ["run-output.pdf", "run-output.pdf"] : [] },
    started_at: 1778790100 + index,
    endedAt: index === 8 ? "2026-05-15T02:00:00Z" : "",
  }));
  const detail = service.publicKanbanCardDetail("child", {
    comments,
    events,
    runs,
    log: "tail file:log.pdf",
  });
  assert.equal(detail.summary, "latest run summary file:run-summary.pdf");
  assert.deepEqual(
    detail.outputs.map((item) => item.path),
    ["run-output.pdf", "comment.pdf", "run-summary.pdf", "log.pdf"],
  );
  assert.equal(detail.comments.length, 12);
  assert.equal(detail.comments[0].author, "author-1");
  assert.equal(detail.comments[11].createdAt, "2026-05-14T20:20:12.000Z");
  assert.equal(detail.events.length, 20);
  assert.equal(detail.events.at(-1).preview, "event summary file:event.pdf");
  assert.equal(detail.runs.length, 8);
  assert.equal(detail.runs[0].id, "run-1");
  assert.equal(detail.runs.at(-1).endedAt, "2026-05-15T02:00:00.000Z");
  assert.equal(detail.logTail, "tail file:log.pdf");

  const eventPreview = service.eventPreviewText({ message: "fallback message" });
  assert.equal(eventPreview, "fallback message");
}

run();
console.log("kanban-output-projection-service contract passed.");
