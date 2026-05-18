"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const { createKanbanCaseShareService } = require("../adapters/kanban-case-share-service");
const { createKanbanCaseTopicBackfillService } = require("../adapters/kanban-case-topic-backfill-service");
const { createKanbanCaseTopicDeliveryService } = require("../adapters/kanban-case-topic-delivery-service");
const { createKanbanCaseTopicService } = require("../adapters/kanban-case-topic-service");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const defaultDataDir = process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || (process.platform === "win32" ? "C:\\ProgramData\\HermesMobile\\data" : "");
  const out = {
    apiBase: process.env.HERMES_MOBILE_API_BASE || "http://127.0.0.1:8797",
    dataDir: defaultDataDir,
    workspaceId: "weixin_stephen",
    keyFile: "",
    limit: 500,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--api-base") out.apiBase = next();
    else if (arg === "--data-dir") out.dataDir = next();
    else if (arg === "--workspace-id") out.workspaceId = next();
    else if (arg === "--key-file") out.keyFile = next();
    else if (arg === "--limit") out.limit = Number(next()) || out.limit;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  if (!out.keyFile && out.dataDir) out.keyFile = path.join(out.dataDir, "secrets", "owner-web-key.secret");
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/backfill-kanban-case-topics.js --data-dir <HermesMobileDataDir> [options]",
    "",
    "Options:",
    "  --workspace-id <id>   Workspace/account to backfill. Default: weixin_stephen",
    "  --api-base <url>      Hermes Mobile local API. Default: http://127.0.0.1:8797",
    "  --key-file <path>     Owner web key file. Default: <data-dir>/secrets/owner-web-key.secret",
    "  --limit <n>           Kanban card list limit. Default: 500",
    "  --dry-run             Count changes without writing state or metadata",
    "",
    "The script prints only bounded case ids/counts and never prints the Owner key or report bodies.",
  ].join("\n"));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function backupFiles(files, dataDir) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const backupDir = path.join(dataDir, "backups", `kanban-case-topic-backfill-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const copied = [];
  for (const filePath of files) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const target = path.join(backupDir, path.basename(filePath));
    fs.copyFileSync(filePath, target);
    copied.push(target);
  }
  return { backupDir, copied };
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const body = options.body ? Buffer.from(options.body) : null;
    const req = transport.request(parsed, {
      method: options.method || "GET",
      headers: Object.assign({}, options.headers || {}, body ? { "Content-Length": body.length } : {}),
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let parsedBody = null;
        try {
          parsedBody = text ? JSON.parse(text) : null;
        } catch (_) {
          parsedBody = { raw: text.slice(0, 200) };
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsedBody)}`);
          err.statusCode = res.statusCode;
          reject(err);
          return;
        }
        resolve(parsedBody);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createSingleWindowThread(workspaceId, overrides = {}) {
  const now = nowIso();
  return Object.assign({
    id: makeId("thread"),
    title: "Single Window",
    workspaceId,
    projectId: "single-window",
    subprojectId: "",
    singleWindow: true,
    hermesSessionId: `web_single_${makeId("session")}`,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
  }, overrides);
}

function metadataStore(metaPath) {
  const raw = readJson(metaPath, {});
  return {
    schemaVersion: 1,
    todos: raw.todos && typeof raw.todos === "object" && !Array.isArray(raw.todos) ? raw.todos : {},
    pushMarks: raw.pushMarks && typeof raw.pushMarks === "object" && !Array.isArray(raw.pushMarks) ? raw.pushMarks : {},
    updatedAt: cleanString(raw.updatedAt),
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.dataDir) throw new Error("--data-dir is required");
  const dataDir = path.resolve(args.dataDir);
  const key = fs.readFileSync(args.keyFile, "utf8").trim();
  const metaPath = path.join(dataDir, "kanban-todo-meta.json");
  const cachePath = path.join(dataDir, "kanban-card-list-cache.json");
  const statePath = path.join(dataDir, "state.json");
  const sharePath = path.join(dataDir, "kanban-case-shares.json");
  const dbPath = path.join(dataDir, "hermes-mobile.sqlite3");
  const sqlite = fs.existsSync(dbPath) ? createMobileSqliteStore({ dbPath }) : null;

  let runtimeState = sqlite ? sqlite.exportRuntimeState() : readJson(statePath, { schemaVersion: 1, threads: [] });
  if (!Array.isArray(runtimeState.threads)) runtimeState.threads = [];
  const saveRuntimeState = (nextState) => {
    runtimeState = nextState;
    writeJson(statePath, runtimeState);
    if (sqlite) sqlite.replaceRuntimeState(runtimeState);
  };

  if (!args.dryRun) {
    const backup = backupFiles([metaPath, cachePath, statePath, sharePath, dbPath], dataDir);
    console.log(JSON.stringify({ backupDir: backup.backupDir, copied: backup.copied.length }));
  }

  const cardsUrl = new URL("/api/kanban/cards", args.apiBase);
  cardsUrl.searchParams.set("workspaceId", args.workspaceId);
  cardsUrl.searchParams.set("limit", String(args.limit));
  cardsUrl.searchParams.set("includeCompleted", "1");
  cardsUrl.searchParams.set("fresh", "1");
  const cardResponse = await requestJson(cardsUrl.toString(), {
    headers: { "X-Hermes-Web-Key": key },
  });
  const cards = Array.isArray(cardResponse.data) ? cardResponse.data : [];

  const shareService = createKanbanCaseShareService({
    sharePath,
    readJsonStore: readJson,
    writeJsonStore: writeJson,
    useSqliteServiceStore: () => Boolean(sqlite),
    mobileSqliteStore: () => sqlite,
    findWorkspace: () => true,
  });
  const topicService = createKanbanCaseTopicService({
    getState: () => runtimeState,
    saveState: saveRuntimeState,
    makeId,
    nowIso,
    readKanbanCaseShare: (...values) => shareService.readShare(...values),
    upsertSharedDirectory: () => null,
    sharedDirectoriesForWorkspace: () => [],
    workspaceDefaultRoot: () => "",
    createSingleWindowThread,
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: workspaceId,
      senderLabel: workspaceId,
    }),
  });
  const deliveryService = createKanbanCaseTopicDeliveryService({
    state: () => runtimeState,
    saveState: saveRuntimeState,
    makeId,
    nowIso,
    broadcast: () => {},
    threadSummary: (thread) => ({ id: thread.id, updatedAt: thread.updatedAt }),
  });
  const backfillService = createKanbanCaseTopicBackfillService({
    ensureKanbanCaseTopicThread: (...values) => topicService.ensureTopicThread(...values),
    upsertKanbanCaseShare: (...values) => shareService.upsertShare(...values),
    syncCompletedCard: (...values) => deliveryService.syncCompletedCard(...values),
    patchKanbanCardTopicBinding(input = {}) {
      if (args.dryRun) return { ok: true, patched: 0 };
      const store = metadataStore(metaPath);
      let patched = 0;
      const now = nowIso();
      for (const cardId of Array.isArray(input.cardIds) ? input.cardIds : []) {
        const id = cleanString(cardId);
        if (!id || !store.todos[id]) continue;
        store.todos[id] = Object.assign({}, store.todos[id], {
          topicThreadId: cleanString(input.topicThreadId),
          topicTaskGroupId: cleanString(input.topicTaskGroupId),
          sharedDirectoryPath: cleanString(input.sharedDirectoryPath),
          caseDirectoryPath: cleanString(input.caseDirectoryPath),
          updatedAt: now,
        });
        patched += 1;
      }
      writeJson(metaPath, Object.assign({}, store, { updatedAt: now }));
      try {
        fs.unlinkSync(cachePath);
      } catch (_) {}
      return { ok: true, patched };
    },
  });

  const result = await backfillService.backfillCaseTopics({
    workspaceId: args.workspaceId,
    cards,
    dryRun: args.dryRun,
    syncCompletedCards: true,
  });
  console.log(JSON.stringify({
    ok: result.ok,
    workspaceId: result.workspaceId,
    dryRun: args.dryRun,
    totalCards: cards.length,
    caseCount: result.caseCount,
    missingTopicCount: result.missingTopicCount,
    patchedCardCount: result.patchedCardCount,
    completedSynced: result.completedSynced,
    cases: result.cases.map((item) => ({
      caseId: item.caseId,
      caseMode: item.caseMode,
      cardCount: item.cardCount,
      completedCount: item.completedCount,
      hadTopicBinding: item.hadTopicBinding,
      patchedCardCount: item.patchedCardCount,
      completedSynced: item.completedSynced,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
