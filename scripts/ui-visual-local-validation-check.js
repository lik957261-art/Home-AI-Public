#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const {
  buildUiVisualLocalValidation,
} = require("../adapters/ui-visual-local-validation-service");

function requireValue(value, flag) {
  if (!value || String(value).startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function readJsonValue(value, flag) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  const text = raw.startsWith("@")
    ? fs.readFileSync(raw.slice(1), "utf8")
    : raw;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${flag}_invalid_json:${err.message || String(err)}`);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    changedFiles: [],
    evidence: {},
    uiImpact: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--changed-file" || arg === "--changedFile") {
      index += 1;
      options.changedFiles.push(requireValue(argv[index], arg));
    } else if (arg === "--evidence-json" || arg === "--ui-visual-evidence-json") {
      index += 1;
      options.evidence = readJsonValue(requireValue(argv[index], arg), arg);
    } else if (arg === "--evidence-file" || arg === "--ui-visual-evidence") {
      index += 1;
      options.evidence = readJsonValue(`@${requireValue(argv[index], arg)}`, arg);
    } else if (arg === "--ui-impact" || arg === "--visible-ui-impact") {
      options.uiImpact = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/ui-visual-local-validation-check.js --changed-file <path> [--evidence-file <json>] [--json]",
    "",
    "Validates the pre-deploy UI local-test and visual evidence packet.",
    "Outputs bounded JSON and exits nonzero when UI evidence is required but missing or failing.",
  ].join("\n");
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = buildUiVisualLocalValidation(options);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      error: String(err?.message || err),
      source: "ui_visual_local_validation_cli",
    }, null, 2));
    process.exitCode = 2;
  }
}

module.exports = {
  parseArgs,
  readJsonValue,
};
