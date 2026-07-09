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
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/navigation-shell/runtime-facade-compat-model.mjs")).href;
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
  await test("runtime facade compat model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/runtime-facade-compat-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch|location|history)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("normalizes native shell and share payload facts", async () => {
    const model = await loadModel();
    assert.equal(model.normalizeNativeShellParamPlan(" IOS "), "ios");
    assert.equal(model.normalizeNativeShellParamPlan("android"), "android");
    assert.equal(model.normalizeNativeShellParamPlan("mac"), "");
    assert.equal(model.nativeShareFileCountPlan([{ name: "a" }, { name: "b" }]), 2);
    assert.equal(model.nativeShareFileCountPlan({ files: [{ name: "a" }] }), 1);
  });

  await test("plans search params and scoped storage keys", async () => {
    const model = await loadModel();
    assert.deepEqual(model.searchParamEntriesPlan("?nativeShell=ios&name=A+B"), [
      ["nativeShell", "ios"],
      ["name", "A B"],
    ]);
    assert.equal(model.runtimeScopedStorageKeyPlan({ scope: " diag/test ", key: "a b:c" }), "homeai.diagtest.abc");
  });

  await test("plans route and facade snapshots", async () => {
    const model = await loadModel();
    const route = model.routeSnapshotPlan({ href: "https://h.local/a?b=1", pathname: "/a", search: "?b=1", hash: "#x" });
    assert.deepEqual(route, { href: "https://h.local/a?b=1", pathname: "/a", search: "?b=1", hash: "#x" });
    const snapshot = model.runtimeSnapshotPlan({ version: "v1", hasAccessKey: true, route });
    assert.equal(snapshot.version, "v1");
    assert.equal(snapshot.mode, "classic-shell-compat");
    assert.equal(snapshot.hasAccessKey, true);
    assert.deepEqual(snapshot.route, route);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
