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
    "src/vite-islands/navigation-shell/navigation-search-model.mjs",
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
  await test("navigation search model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/navigation-search-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("normalizes single-window mode with classic-compatible semantics", async () => {
    const model = await loadModel();
    assert.equal(model.normalizeSingleWindowModePlan("task"), "task");
    assert.equal(model.normalizeSingleWindowModePlan("topic"), "chat");
    assert.equal(model.normalizeSingleWindowModePlan(""), "chat");
  });

  await test("plans chat-search availability and searchable message matches", async () => {
    const model = await loadModel();
    assert.equal(model.chatSearchAvailablePlan({
      singleWindowChatView: true,
      taskDetailView: false,
      hasCurrentThread: true,
    }), true);
    assert.equal(model.chatSearchAvailablePlan({
      singleWindowChatView: false,
      taskDetailView: false,
      hasCurrentThread: true,
    }), false);
    const result = model.chatSearchMatchesPlan({
      available: true,
      query: "report",
      messages: [
        { id: "m1", role: "user", content: "quarterly report" },
        { id: "m2", role: "assistant", content: "nothing" },
        { id: "m3", role: "assistant", artifacts: [{ name: "report.pdf", path: "/tmp/report.pdf" }] },
      ],
      index: 9,
      previousTotalMatches: 5,
    });
    assert.deepEqual(result.matches, ["m1", "m3"]);
    assert.equal(result.index, 0);
    assert.equal(result.totalMatches, 5);
  });

  await test("plans commit, move, and status projection without DOM state", async () => {
    const model = await loadModel();
    assert.deepEqual(model.chatSearchCommitActionPlan({
      draft: "report",
      currentQuery: "report",
      matchCount: 2,
      draftChangedSinceSearch: false,
    }).action, "move_next");
    assert.equal(model.chatSearchMoveIndexPlan({ index: 1, delta: 1, total: 3 }).index, 2);
    assert.equal(model.chatSearchMoveIndexPlan({ index: 0, delta: -1, total: 3 }).index, 2);
    assert.deepEqual(model.chatSearchStatusPlan({
      searchMode: true,
      query: "report",
      changed: false,
      loading: false,
      matchCount: 2,
      index: 0,
      totalMatches: 5,
    }), {
      statusHidden: false,
      statusText: "1/2+",
      navVisible: true,
      navEnabled: true,
    });
    assert.equal(model.chatSearchStatusPlan({
      searchMode: true,
      query: "report",
      changed: true,
      loading: false,
      matchCount: 2,
    }).statusHidden, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
