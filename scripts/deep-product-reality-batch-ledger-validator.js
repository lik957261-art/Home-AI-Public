#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  validateDeepProductRealityBatchLedger,
} = require("../adapters/deep-product-reality-batch-ledger-service");

function usage() {
  return [
    "Usage:",
    "  node scripts/deep-product-reality-batch-ledger-validator.js --json-file <ledger.json> --requested-plugins <ids> --json",
    "  node scripts/deep-product-reality-batch-ledger-validator.js --body-file <return.md> --requested-plugins <ids> --json",
    "",
    "Options:",
    "  --json-file <path>        Read ledger JSON. Use '-' for stdin.",
    "  --body-file <path>        Read return-card Markdown and extract fenced ledger JSON. Use '-' for stdin.",
    "  --requested-plugins <ids> Comma-separated requested plugin ids.",
    "  --no-require-xhigh        Do not require xhigh reasoning evidence.",
    "  --json                    Print JSON output.",
    "  --help                    Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { jsonFile: "", bodyFile: "", requestedPlugins: "", requireXhigh: true, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json-file") options.jsonFile = next();
    else if (arg === "--body-file") options.bodyFile = next();
    else if (arg === "--requested-plugins") options.requestedPlugins = next();
    else if (arg === "--no-require-xhigh") options.requireXhigh = false;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function readJson(filePath) {
  const target = String(filePath || "").trim();
  if (!target) throw new Error("json_file_required");
  const raw = target === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(target), "utf8");
  return JSON.parse(raw);
}

function readText(filePath) {
  const target = String(filePath || "").trim();
  if (!target) throw new Error("body_file_required");
  return target === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(target), "utf8");
}

function parseLedgerJsonFromMarkdown(markdown) {
  const text = String(markdown || "");
  const fencePattern = /```(?:json|ledger_json|batch_ledger_json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fencePattern.exec(text)) !== null) {
    const candidate = String(match[1] || "").trim();
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && (parsed.coverage || parsed.batch_status || parsed.batchStatus)) return parsed;
    } catch (_) {
      // Continue scanning later fenced blocks.
    }
  }
  throw new Error("ledger_json_block_not_found");
}

function printText(result) {
  const lines = [
    `ok=${result.ok}`,
    `status=${result.status}`,
  ];
  for (const issue of result.issues) {
    lines.push(`issue=${issue.code}${issue.pluginId ? `:${issue.pluginId}` : ""}`);
  }
  for (const warning of result.warnings) {
    lines.push(`warning=${warning.code}${warning.pluginId ? `:${warning.pluginId}` : ""}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.jsonFile && options.bodyFile) throw new Error("choose_json_file_or_body_file");
  const input = options.bodyFile
    ? parseLedgerJsonFromMarkdown(readText(options.bodyFile))
    : readJson(options.jsonFile);
  const result = validateDeepProductRealityBatchLedger(input, {
    requestedPlugins: options.requestedPlugins,
    requireXhigh: options.requireXhigh,
  });
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printText(result);
  if (!result.ok) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
