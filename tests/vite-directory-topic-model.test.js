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
    "src/vite-islands/navigation-shell/directory-topic-model.mjs",
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
  await test("directory topic model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/directory-topic-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans route keys, labels, and collection grouping", async () => {
    const model = await loadModel();
    const route = { workspaceId: "owner", projectId: "docs", subprojectId: "child", root: "/Users/example/path" };
    assert.equal(model.routeKeyPlan(route, null), "owner|docs|child|/users/example/path");
    assert.equal(model.routeLabelPlan(route, { displayLabel: "Docs / Child" }), "Docs / Child");

    const groups = [
      { id: "b", title: "Beta", updatedAt: "2026-07-02T00:00:00.000Z" },
      { id: "a", title: "Alpha", updatedAt: "2026-07-03T00:00:00.000Z" },
      { id: "x", title: "No route", updatedAt: "2026-07-04T00:00:00.000Z" },
    ];
    const collections = model.collectionsForEntriesPlan([
      { group: groups[0], route, key: "owner|docs|child|/users/example/path", label: "Docs / Child" },
      { group: groups[1], route, key: "owner|docs|child|/users/example/path", label: "Docs / Child" },
      { group: groups[2], route: null, key: "", label: "" },
    ]);
    assert.equal(collections.length, 1);
    assert.equal(collections[0].defaultGroup.id, "a");
    assert.deepEqual(collections[0].groups.map((group) => group.id), ["a", "b"]);
    assert.deepEqual([...model.collectionGroupIdsPlan(collections)].sort(), ["a", "b"]);
  });

  await test("plans root buckets and display parts", async () => {
    const model = await loadModel();
    const collection = {
      key: "owner|docs|child|/docs",
      label: "Docs / Child",
      route: { workspaceId: "owner", projectId: "docs", subprojectId: "child", root: "/docs" },
      groups: [
        { id: "topic_a", title: "Topic", lastReceiptTitle: "Receipt", updatedAt: "2026-07-03T00:00:00.000Z" },
      ],
      defaultGroup: { id: "topic_a", updatedAt: "2026-07-03T00:00:00.000Z" },
      updatedAt: "2026-07-03T00:00:00.000Z",
    };
    const rootInfo = model.routeRootInfoPlan(collection, {
      project: { id: "docs", label: "Docs", root: "/docs", children: [{ id: "child", label: "Child" }] },
      projectLabel: "Docs",
      displayLabel: "Docs / Child",
      comparableRoot: "/docs",
    });
    assert.equal(rootInfo.key, "owner|docs||/docs");
    assert.equal(rootInfo.label, "Docs");
    assert.equal(rootInfo.childLabel, "Child");
    assert.equal(rootInfo.isChild, true);
    const buckets = model.rootBucketsForCollectionsPlan([Object.assign({}, collection, { rootInfo })]);
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].topicCount, 1);
    assert.equal(buckets[0].collections[0].rootInfo.childLabel, "Child");
    assert.deepEqual(model.displayPartsPlan(collection.groups[0], { receiptTitle: "Receipt" }), {
      title: "Topic",
      summary: "Receipt",
      fullTitle: "Topic｜Receipt",
    });
  });

  await test("plans collapse state and storage set mutations", async () => {
    const model = await loadModel();
    assert.equal(model.collapsedByDefaultPlan(0, 1), false);
    assert.equal(model.collapsedByDefaultPlan(1, 1), true);
    assert.equal(model.isCollapsedPlan({
      key: "docs",
      index: 5,
      collapsedDirectories: [],
      expandedDirectories: ["docs"],
    }), false);
    const collapsed = new Set(["old"]);
    const expanded = new Set(["docs"]);
    const plan = model.storageSetMutationPlan({
      key: "docs",
      collapsed: true,
      collapsedDirectories: collapsed,
      expandedDirectories: expanded,
    });
    assert.deepEqual([...plan.collapsedDirectories].sort(), ["docs", "old"]);
    assert.deepEqual([...plan.expandedDirectories], []);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
