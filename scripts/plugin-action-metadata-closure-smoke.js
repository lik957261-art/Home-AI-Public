#!/usr/bin/env node
"use strict";

const {
  runPluginActionMetadataClosure,
  runWardrobeReferenceClosure,
} = require("../adapters/plugin-action-metadata-closure-service");

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

async function main() {
  const action = argValue("--action", "all");
  const options = {
    action,
    nowIso: argValue("--now", "2026-07-01T08:00:00.000Z"),
  };
  const result = action === "wardrobe-outfit-wear-intent"
    ? await runWardrobeReferenceClosure(options)
    : await runPluginActionMetadataClosure(options);
  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "ok" : "failed"} actionFamilies=${result.actionFamilyCount || result.familyCount || 1} ${result.passedStageCount}/${result.stageCount}`);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  const payload = { ok: false, error: err?.message || String(err) };
  if (hasFlag("--json")) console.error(JSON.stringify(payload, null, 2));
  else console.error(payload.error);
  process.exitCode = 1;
});
