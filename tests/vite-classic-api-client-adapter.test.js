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

const source = read("public/app-api-client.js");

test("classic API client imports the Vite ESM model when available", () => {
  assert.match(source, /API_CLIENT_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/api-client-model\/api-client-model\.js/);
  assert.match(source, /function importApiClientModel/);
  assert.match(source, /function currentApiClientModel/);
  assert.match(source, /__homeAiImportApiClientModel/);
});

test("classic API client delegates pure plans and keeps UMD compatibility", () => {
  for (const marker of [
    "normalizeHeadersPlan",
    "apiRequestPlan",
    "clientVersionResponsePlan",
    "httpErrorPlan",
    "timeoutErrorPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /module\.exports = factory\(\)/);
  assert.match(source, /root\.HermesAppApiClient = factory\(\)/);
  assert.match(source, /fetchImpl\(path, fetchOptions\)/);
  assert.match(source, /syncAccessKeyCookie\(accessKey\)/);
  assert.match(source, /new AbortController\(\)/);
});

test("Vite config exposes API client model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /apiClientModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/api-client-model\.mjs/);
  assert.match(viteConfig, /"api-client-model": apiClientModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
