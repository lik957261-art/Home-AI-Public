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

test("Vite config builds a dedicated production bootstrap entry", () => {
  const config = read("vite.config.js");
  assert.match(config, /homeAiProductionBootstrapEntry/);
  assert.match(config, /src\/vite-app\/production-bootstrap\.mjs/);
  assert.match(config, /"home-ai-production-bootstrap": homeAiProductionBootstrapEntry/);
});

test("production bootstrap preserves classic facade and installs focus guard", () => {
  const source = read("src/vite-app/production-bootstrap.mjs");
  assert.match(source, /vite-production-bootstrap/);
  assert.match(source, /createHomeAiRuntimeFacade/);
  assert.match(source, /createEditableFocusLifecycleGuard/);
  assert.match(source, /classicFacadePreserved/);
  assert.match(source, /data-home-ai-shell-mode/);
  assert.match(source, /HomeAiViteProduction/);
  assert.doesNotMatch(source, /home-ai-app-preview/);
  assert.doesNotMatch(source, /Vite App Preview/);
});

test("source switch selects Vite with documented rollback metadata", () => {
  const config = JSON.parse(read("config/home-ai-shell-mode.json"));
  assert.equal(config.shellMode, "vite");
  assert.equal(config.cutoverVersion, "20260703-vite-production-cutover-v1");
  assert.match(config.rollback, /classic/);
  assert.doesNotMatch(JSON.stringify(config), /Bearer|launchToken|sk-/);
});

test("built production bootstrap artifact exists after Vite build", () => {
  const builtPath = "public/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js";
  assert.equal(fs.existsSync(path.join(repoRoot, builtPath)), true, "run npm run build:vite before this test");
  const output = read(builtPath);
  assert.match(output, /HomeAiViteProduction/);
  assert.match(output, /vite-production-bootstrap/);
  assert.doesNotMatch(output, /Vite App Preview/);
});

if (process.exitCode) process.exit(process.exitCode);
