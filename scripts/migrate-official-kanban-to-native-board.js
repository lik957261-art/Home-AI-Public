"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createNativeBoardKanbanMigrationService } = require("../adapters/native-board-kanban-migration-service");

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dataDir: process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || "",
    learningDbPath: process.env.HERMES_MOBILE_LEARNING_DB_PATH || process.env.HERMES_WEB_LEARNING_DB_PATH || "",
    mobileDbPath: process.env.HERMES_WEB_DB_PATH || "",
    cardsJson: "",
    dryRun: true,
    limit: 200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--data-dir") out.dataDir = next();
    else if (arg === "--learning-db-path") out.learningDbPath = next();
    else if (arg === "--mobile-db-path") out.mobileDbPath = next();
    else if (arg === "--cards-json") out.cardsJson = next();
    else if (arg === "--limit") out.limit = Number(next()) || out.limit;
    else if (arg === "--write") out.dryRun = false;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  if (!out.mobileDbPath && out.dataDir) out.mobileDbPath = path.join(out.dataDir, "hermes-mobile.sqlite3");
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/migrate-official-kanban-to-native-board.js --cards-json <cards.json> [--write]",
    "",
    "Options:",
    "  --data-dir <dir>              Hermes Mobile data dir.",
    "  --learning-db-path <path>     Learning-growth sqlite path override.",
    "  --mobile-db-path <path>       Hermes Mobile sqlite path override. Defaults to <data-dir>/hermes-mobile.sqlite3.",
    "  --cards-json <file>           JSON response containing official Kanban cards.",
    "  --limit <n>                   Result limit hint. Default: 200.",
    "  --dry-run                     Default. Count records without writing.",
    "  --write                       Apply summary-only migration to native DBs.",
    "",
    "The script prints counts and ids/status summaries only. It does not print full learner content or raw card JSON.",
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
  if (Array.isArray(payload?.todos)) return payload.todos;
  return [];
}

(async () => {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const learningRepository = createLearningProgramRepository({
    dataDir: args.dataDir || undefined,
    dbPath: args.learningDbPath || undefined,
  });
  const mobileStore = createMobileSqliteStore({
    dataDir: args.dataDir || undefined,
    dbPath: args.mobileDbPath || undefined,
  });
  try {
    learningRepository.migrate();
    mobileStore.migrate();
    const payload = readJsonFile(args.cardsJson);
    const cards = extractCards(payload).slice(0, Math.max(1, Math.min(500, Number(args.limit || 200) || 200)));
    const service = createNativeBoardKanbanMigrationService({
      learningProgramService: createLearningProgramService({ repository: learningRepository }),
      repository: learningRepository,
      mobileStore,
    });
    const result = await service.migrate({ cards, dryRun: args.dryRun, limit: args.limit });
    console.log(JSON.stringify({
      ok: result.ok,
      counts: result.counts,
      results: result.results.map((item) => ({
        kanbanCardId: item.kanbanCardId || "",
        target: item.target || "",
        taskCardId: item.taskCardId || "",
        todoId: item.todoId || "",
        status: item.status || "",
        reason: item.reason || "",
        backfilled: Boolean(item.backfilled),
      })),
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    learningRepository.close();
    mobileStore.close();
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
