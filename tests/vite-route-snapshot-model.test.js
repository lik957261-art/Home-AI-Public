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
    "src/vite-islands/navigation-shell/route-snapshot-model.mjs",
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
  await test("route snapshot model remains browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/route-snapshot-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot|document|localStorage|sessionStorage)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });

  await test("route snapshot model bounds values and explicit launch targets", async () => {
    const model = await loadModel();
    assert.equal(model.boundedRouteSnapshotValuePlan("  abcdef  ", 3), "abc");
    assert.equal(model.boundedRouteSnapshotValuePlan(null, 3), "");
    assert.equal(model.routeParamsHaveExplicitLaunchTargetPlan(new URLSearchParams("messageId=m1")), true);
    assert.equal(model.routeParamsHaveExplicitLaunchTargetPlan(new URLSearchParams("returnView=tasks")), false);
  });

  await test("route snapshot model encodes embedded plugin return route entries", async () => {
    const model = await loadModel();
    const plan = model.embeddedPluginReturnRouteSnapshotEntries({
      viewMode: "tasks",
      currentTaskGroupId: "tg_1",
      currentThreadId: "thread_1",
      directoryPath: `/root/${"x".repeat(700)}`,
      todoCreateOpen: true,
      sharedDirectoryManagerOpen: true,
      conversationScrollTop: 42.7,
    });
    assert.equal(plan.ok, true);
    const params = new URLSearchParams(plan.entries);
    assert.equal(params.get("returnView"), "tasks");
    assert.equal(params.get("returnTaskGroupId"), "tg_1");
    assert.equal(params.get("returnThreadId"), "thread_1");
    assert.equal(params.get("returnDirectoryPath").length, 600);
    assert.equal(params.get("returnTodoCreate"), "1");
    assert.equal(params.get("returnSharedDirectoryManager"), "1");
    assert.equal(params.get("returnConversationScrollTop"), "43");
  });

  await test("route snapshot model decodes embedded plugin return routes", async () => {
    const model = await loadModel();
    assert.deepEqual(model.embeddedPluginReturnRouteFromSnapshotParamsPlan(new URLSearchParams(""), {
      normalizedView: "codex",
    }), {
      viewMode: "tasks",
      singleWindowMode: "chat",
    });
    const route = model.embeddedPluginReturnRouteFromSnapshotParamsPlan(new URLSearchParams([
      ["returnView", "projects"],
      ["returnDirectoryPath", `/root/${"y".repeat(700)}`],
      ["returnInboxCreate", "yes"],
      ["returnConversationScrollTop", "12.8"],
    ]));
    assert.equal(route.viewMode, "projects");
    assert.equal(route.directoryPath.length, 600);
    assert.equal(route.actionInboxCreateOpen, true);
    assert.equal(route.conversationScrollTop, 13);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
