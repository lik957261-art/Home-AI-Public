"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const source = read("public/app-runtime-facade-ui.js");

test("classic runtime facade imports the Vite ESM owner model without delaying init", () => {
  assert.match(source, /RUNTIME_FACADE_COMPAT_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/runtime-facade-compat-model\/runtime-facade-compat-model\.js/);
  assert.match(source, /function importRuntimeFacadeCompatModel/);
  assert.match(source, /function currentRuntimeFacadeCompatModel/);
  assert.match(source, /function runtimeFacadeCompatModelFunction/);
  assert.match(source, /__homeAiImportRuntimeFacadeCompatModel/);
  assert.match(source, /importRuntimeFacadeCompatModel\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /Object\.defineProperty\(root, "HomeAiRuntimeFacade"/);
});

test("classic runtime facade delegates pure compatibility plans with sync fallbacks", () => {
  for (const marker of [
    "safeRuntimeStringPlan",
    "normalizeNativeShellParamPlan",
    "nativeShareFileCountPlan",
    "searchParamEntriesPlan",
    "runtimeScopedStorageKeyPlan",
    "routeSnapshotPlan",
    "runtimeSnapshotPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes runtime facade compat model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /runtimeFacadeCompatModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/runtime-facade-compat-model\.mjs/);
  assert.match(viteConfig, /"runtime-facade-compat-model": runtimeFacadeCompatModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
