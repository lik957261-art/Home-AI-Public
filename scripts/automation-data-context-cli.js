"use strict";

const path = require("node:path");
const { createDataContextService } = require("../adapters/data-context-service");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--type") args.type = argv[++index];
    else if (arg === "--db") args.dbPath = argv[++index];
    else if (arg === "--data-dir") args.dataDir = argv[++index];
    else if (arg === "--out") args.outputPath = argv[++index];
    else if (arg === "--date") args.date = argv[++index];
    else if (arg === "--max-threads") args.maxThreads = Number(argv[++index] || 0);
    else if (arg === "--max-messages-per-thread") args.maxMessagesPerThread = Number(argv[++index] || 0);
    else if (arg === "--max-excerpt-chars") args.maxExcerptChars = Number(argv[++index] || 0);
    else if (arg === "--json") args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs();
  const dataDir = args.dataDir
    || process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || path.join(process.cwd(), "data");
  const dbPath = args.dbPath || path.join(dataDir, "hermes-mobile.sqlite3");
  const service = createDataContextService({ dbPath });
  const result = service.prepare({
    type: args.type,
    date: args.date,
    outputPath: args.outputPath,
    maxThreads: args.maxThreads,
    maxMessagesPerThread: args.maxMessagesPerThread,
    maxExcerptChars: args.maxExcerptChars,
  });
  if (args.json) {
    console.log(JSON.stringify({
      ok: true,
      type: result.type,
      outputPath: result.outputPath || "",
      audit: result.context.audit,
      targetDate: result.context.targetDate,
    }, null, 2));
  } else if (result.outputPath) {
    console.log(result.outputPath);
  } else {
    process.stdout.write(result.markdown);
  }
}

try {
  main();
} catch (err) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: err.message || String(err), code: err.code || "data_context_error" }, null, 2));
  } else {
    console.error(err.message || String(err));
  }
  process.exit(1);
}
