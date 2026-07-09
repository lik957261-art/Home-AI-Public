"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-directory-topics-ui.js"), "utf8");

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const storage = new Map();
  const context = {
    console,
    Promise,
    Set,
    Map,
    Date,
    state: {
      selectedWorkspaceId: "owner",
      projects: [
        { id: "docs", label: "Docs", root: "/docs", children: [{ id: "child", label: "Child" }] },
      ],
    },
    window: {
      __homeAiImportDirectoryTopicModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    taskGroupOwnerWorkspaceId(group) { return group?.ownerWorkspaceId || "owner"; },
    comparableDirectoryPath(value) { return String(value || "").replaceAll("\\", "/").toLowerCase(); },
    directoryRouteDisplayPath(route, fallback) { return route?.label || fallback || ""; },
    projectDisplayLabel(project) { return project?.label || project?.id || ""; },
    isPluginTopicTaskGroup(group) { return Boolean(group?.pluginTopic); },
    taskDirectoryRoutes(group) { return Array.isArray(group?.directoryRoutes) ? group.directoryRoutes : []; },
    topicReceiptSummaryTitleFromGroup(group) { return group?.lastReceiptTitle || ""; },
    escapeHtml(value) { return String(value || ""); },
    formatTime(value) { return value ? "time" : ""; },
    __calls: calls,
    __storage: storage,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-directory-topics-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic directory topics adapter declares bounded ESM import path", () => {
    assert.match(source, /DIRECTORY_TOPIC_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/directory-topic-model\/directory-topic-model\.js/);
    assert.match(source, /__homeAiImportDirectoryTopicModel/);
    assert.match(source, /importDirectoryTopicModel/);
    assert.match(source, /currentDirectoryTopicModel/);
    assert.match(source, /collectionsForEntriesPlan/);
    assert.match(source, /rootBucketsForCollectionsPlan/);
    assert.match(source, /storageSetMutationPlan/);
  });

  await test("classic directory topics adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      ownerWorkspaceKeyPlan() {
        modelCalls.push("owner");
        return "model-owner";
      },
      routeKeyPlan() {
        modelCalls.push("route-key");
        return "model-key";
      },
      routeLabelPlan() {
        modelCalls.push("route-label");
        return "Model Label";
      },
      displayPathPartsPlan(label) {
        modelCalls.push("path-parts");
        return String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
      },
      primaryRoutePlan(group) {
        modelCalls.push("primary");
        return group.directoryRoute || null;
      },
      collectionsForEntriesPlan(entries) {
        modelCalls.push(["collections", entries.map((entry) => entry.key)]);
        return [{
          key: "model-key",
          route: entries[0].route,
          label: "Model Label",
          groups: [entries[0].group],
          defaultGroup: entries[0].group,
          updatedAt: entries[0].group.updatedAt,
        }];
      },
      collectionGroupIdsPlan(collections) {
        modelCalls.push("ids");
        return new Set(collections.flatMap((collection) => collection.groups.map((group) => group.id)));
      },
      displayPartsPlan(group, options) {
        modelCalls.push(["display", options.receiptTitle]);
        return { title: group.title, summary: options.receiptTitle, fullTitle: `${group.title}｜${options.receiptTitle}` };
      },
      rootBucketsForCollectionsPlan(collections) {
        modelCalls.push("buckets");
        return [{
          key: "bucket",
          label: "Bucket",
          collections,
          topicCount: 1,
          defaultGroup: collections[0].defaultGroup,
          updatedAt: collections[0].updatedAt,
        }];
      },
      isCollapsedPlan(input) {
        modelCalls.push(["collapsed", input.key]);
        return false;
      },
      storageSetMutationPlan(input) {
        modelCalls.push(["storage", input.key, input.collapsed]);
        return {
          collapsedDirectories: new Set(input.collapsed ? [input.key] : []),
          expandedDirectories: new Set(input.collapsed ? [] : [input.key]),
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    const collections = vm.runInContext(`
      directoryTopicCollectionsForGroups([
        { id: "g1", title: "Topic", lastReceiptTitle: "Receipt", updatedAt: "2026-07-03T00:00:00.000Z", directoryRoute: { projectId: "docs", root: "/docs", label: "Docs" } }
      ])
    `, context);
    assert.equal(collections[0].key, "model-key");
    assert.deepEqual([...vm.runInContext("directoryTopicCollectionGroupIds", context)(collections)], ["g1"]);
    const display = vm.runInContext("directoryTopicDisplayParts", context)(collections[0].defaultGroup);
    assert.equal(display.fullTitle, "Topic｜Receipt");
    const html = vm.runInContext("renderDirectoryTopicCards", context)(collections);
    assert.match(html, /Bucket/);
    vm.runInContext('setDirectoryTopicCollapsed("model-key", true)', context);
    assert.equal(context.__storage.get("hermesDirectoryTopicCollapsed"), "[\"model-key\"]");
    assert.ok(modelCalls.some((call) => Array.isArray(call) && call[0] === "collections"));
    assert.ok(modelCalls.some((call) => Array.isArray(call) && call[0] === "storage"));
  });

  await test("classic directory topics fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}));
    const collections = vm.runInContext(`
      directoryTopicCollectionsForGroups([
        { id: "g1", title: "Topic", updatedAt: "2026-07-03T00:00:00.000Z", directoryRoute: { workspaceId: "owner", projectId: "docs", root: "/docs", label: "Docs" } }
      ])
    `, context);
    assert.equal(collections.length, 1);
    assert.equal(collections[0].key, "owner|docs||/docs");
    assert.deepEqual([...vm.runInContext("directoryTopicCollectionGroupIds", context)(collections)], ["g1"]);
    assert.equal(vm.runInContext("directoryTopicIsCollapsed", context)(collections[0], 0, new Set(), new Set()), false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
