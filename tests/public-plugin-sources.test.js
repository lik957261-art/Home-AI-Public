"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "public-plugin-sources.json"), "utf8"));

const EXPECTED_PLUGIN_IDS = [
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "health",
  "note",
  "music",
  "wardrobe",
];

const EXPECTED_PUBLIC_DEFAULTS = [
  "email",
  "finance",
  "growth",
  "health",
  "note",
  "wardrobe",
];

function assertHttpsPublicRepoUrl(url) {
  assert.match(url, /^https:\/\/github\.com\/pentiumxp\/[A-Za-z0-9_.-]+\.git$/);
  assert.doesNotMatch(url, /^git@/);
  assert.doesNotMatch(url, /Home-AI\.git$/);
}

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.owner, "pentiumxp");
assert.equal(manifest.homeAi.id, "home-ai");
assert.equal(manifest.homeAi.sourceDir, "app");
assertHttpsPublicRepoUrl(manifest.homeAi.repositoryUrl);
assert.equal(manifest.homeAi.repositoryUrl, "https://github.com/pentiumxp/Home-AI-Public.git");

const plugins = manifest.plugins || [];
assert.deepEqual(plugins.map((plugin) => plugin.id), EXPECTED_PLUGIN_IDS);
assert.deepEqual(plugins.filter((plugin) => plugin.publicDefault).map((plugin) => plugin.id), EXPECTED_PUBLIC_DEFAULTS);

for (const plugin of plugins) {
  assert.ok(plugin.sourceDir);
  assert.equal(plugin.ref, "main");
  assertHttpsPublicRepoUrl(plugin.repositoryUrl);
  assert.match(plugin.launchdLabel, /^com\.hermesmobile\.plugin\./);
  assert.match(plugin.manifestUrl, /^http:\/\/127\.0\.0\.1:\d+\/api\/v1\/hermes\/plugin\/manifest$/);
}

const codex = plugins.find((plugin) => plugin.id === "codex-mobile-web");
assert.equal(codex.publicDefault, false);
assert.equal(codex.special, true);

const music = plugins.find((plugin) => plugin.id === "music");
assert.equal(music.publicDefault, false);
assert.equal(music.special, true);

console.log("public plugin source manifest tests passed");
