"use strict";

const fs = require("node:fs");
const { createLearningGrowthNativeBackfillService } = require("../adapters/learning-growth-native-backfill-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dataDir: process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || "",
    dbPath: process.env.HERMES_MOBILE_LEARNING_DB_PATH || process.env.HERMES_WEB_LEARNING_DB_PATH || "",
    cardsJson: "",
    dryRun: true,
    limit: 200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--data-dir") out.dataDir = next();
    else if (arg === "--db-path") out.dbPath = next();
    else if (arg === "--cards-json") out.cardsJson = next();
    else if (arg === "--limit") out.limit = Number(next()) || out.limit;
    else if (arg === "--write") out.dryRun = false;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/backfill-learning-growth-native-records.js --cards-json <cards.json> [--write]",
    "",
    "Options:",
    "  --data-dir <dir>      Hermes Mobile data dir. Defaults to HERMES_WEB_DATA_DIR/HERMES_MOBILE_DATA_DIR.",
    "  --db-path <path>      Learning-growth sqlite path override.",
    "  --cards-json <file>   JSON response containing Growth Kanban cards.",
    "  --limit <n>           Result limit hint. Default: 200.",
    "  --dry-run             Default. Count records without writing.",
    "  --write               Apply the summary-only native backfill.",
    "",
    "The script prints only counts and ids/status summaries. It must not print full learner submissions, transcripts, prompts, questions, or raw paths.",
  ].join("\n"));
}

function readJsonFile(filePath) {
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractCards(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.cards)) return payload.cards;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

(async () => {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const repository = createLearningProgramRepository({
    dataDir: args.dataDir || undefined,
    dbPath: args.dbPath || undefined,
  });
  try {
    repository.migrate();
    const learningProgramService = createLearningProgramService({ repository });
    const payload = readJsonFile(args.cardsJson);
    const cards = extractCards(payload).slice(0, Math.max(1, Math.min(500, Number(args.limit || 200) || 200)));
    const service = createLearningGrowthNativeBackfillService({ learningProgramService });
    const result = await service.backfill({ cards, dryRun: args.dryRun, limit: args.limit });
    const summary = {
      ok: result.ok,
      counts: result.counts,
      results: result.results.map((item) => ({
        kanbanCardId: item.kanbanCardId,
        taskCardId: item.taskCardId || "",
        status: item.status,
        reason: item.reason || "",
        hasSubmission: Boolean(item.hasSubmission),
        hasEvaluation: Boolean(item.hasEvaluation),
        hasReflection: Boolean(item.hasReflection),
        hasArtifact: Boolean(item.hasArtifact),
      })),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    repository.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
