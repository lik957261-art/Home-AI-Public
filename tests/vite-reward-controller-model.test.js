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
    "src/vite-islands/navigation-shell/learning-growth-reward-controller-model.mjs",
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
  await test("learning growth reward model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-reward-controller-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("reward policy plan normalizes ids and request payloads", async () => {
    const model = await loadModel();
    const plan = model.learningRewardPolicySubmitPlan({
      rawIds: " card-a, card b ,, card/c ",
      formKey: "series-a",
      maxCoinsValue: "99.7",
    });
    assert.equal(plan.valid, true);
    assert.deepEqual(plan.ids, ["card-a", "card b", "card/c"]);
    assert.equal(plan.rewardCapCoins, 100);
    assert.equal(plan.savingText, "正在保存系列奖励...");
    assert.equal(plan.successText, "已更新 3 张卡片。");
    assert.deepEqual(plan.requests.map((request) => request.method), ["PATCH", "PATCH", "PATCH"]);
    assert.deepEqual(plan.requests.map((request) => request.body), [
      { rewardCapCoins: 100 },
      { rewardCapCoins: 100 },
      { rewardCapCoins: 100 },
    ]);
    assert.equal(plan.requests[1].url, "/api/learning/task-cards/card%20b/reward-policy");
  });

  await test("reward policy plan rejects invalid max coins without requests", async () => {
    const model = await loadModel();
    const plan = model.learningRewardPolicySubmitPlan({
      rawIds: "card-a",
      maxCoinsValue: "0",
    });
    assert.equal(plan.valid, false);
    assert.equal(plan.empty, false);
    assert.equal(plan.errorText, "金币数必须是正整数。");
    assert.deepEqual(plan.requests, []);
  });

  await test("reward policy plan treats empty ids as no-op", async () => {
    const model = await loadModel();
    const plan = model.learningRewardPolicySubmitPlan({
      rawIds: " , ",
      maxCoinsValue: "30",
    });
    assert.equal(plan.valid, false);
    assert.equal(plan.empty, true);
    assert.deepEqual(plan.ids, []);
    assert.deepEqual(plan.requests, []);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
