#!/usr/bin/env node
"use strict";

const { runSelfCheckDiagnosticSubmitSmoke } = require("../adapters/self-check-diagnostic-submit-smoke-service");

function clean(value, max = 240) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseArgs(argv) {
  const out = {
    json: false,
    dataDir: "",
    keepTemp: false,
    nowIso: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") out.json = true;
    else if (arg === "--data-dir") out.dataDir = argv[++index] || "";
    else if (arg === "--keep-temp") out.keepTemp = true;
    else if (arg === "--now") out.nowIso = clean(argv[++index] || "", 80);
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/self-check-diagnostic-submit-smoke.js [options]",
    "",
    "Options:",
    "  --json             Print JSON output.",
    "  --data-dir <path>  Use a specific temporary diagnostic data directory.",
    "  --keep-temp        Keep the generated temp directory for local inspection.",
    "  --now <iso>        Fixed timestamp for deterministic smoke output.",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSelfCheckDiagnosticSubmitSmoke({
    dataDir: options.dataDir,
    cleanup: !options.keepTemp,
    nowIso: options.nowIso || undefined,
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write([
      `ok=${result.ok}`,
      `modelVersion=${result.modelVersion}`,
      `matrixVersion=${result.matrixVersion}`,
      `selfCheck=${result.selfCheck?.ok}`,
      `featureRequestGate=${result.featureRequestGate?.ok}`,
      "",
    ].join("\n"));
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: clean(err?.message || err, 500) }, null, 2)}\n`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};
