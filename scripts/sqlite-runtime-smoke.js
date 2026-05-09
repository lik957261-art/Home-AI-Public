"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");

const REPO_ROOT = path.resolve(__dirname, "..");

function usage() {
  return [
    "Usage:",
    "  node scripts/sqlite-runtime-smoke.js --data-dir <dir> --db <sqlite> [--port <port>] [--report <file>]",
    "",
    "Starts a temporary Hermes Mobile listener with HERMES_WEB_SERVICE_STORE=sqlite,",
    "auth disabled, Web Push disabled, local Todo/Automation, and verifies it can",
    "load threads from SQLite and persist a push receipt back into SQLite.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { port: 19041 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--data-dir") out.dataDir = argv[++i];
    else if (arg === "--db") out.db = argv[++i];
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--report") out.report = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function requireDir(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} is not an existing directory: ${resolved}`);
  }
  return resolved;
}

function requireFile(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} is not an existing file: ${resolved}`);
  }
  return resolved;
}

async function fetchJson(url, options = {}) {
  const timeout = AbortSignal.timeout(options.timeoutMs || 5000);
  const response = await fetch(url, Object.assign({}, options, { signal: timeout }));
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

async function waitReady(baseUrl, child) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`listener exited early with code ${child.exitCode}`);
    }
    try {
      await fetchJson(`${baseUrl}/api/client-version?clientVersion=sqlite-smoke`, { timeoutMs: 1000 });
      return true;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`listener did not become ready: ${lastError?.message || "timeout"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const dataDir = requireDir(args.dataDir, "--data-dir");
  const dbPath = requireFile(args.db, "--db");
  if (!Number.isInteger(args.port) || args.port < 1024 || args.port > 65535) {
    throw new Error("--port must be between 1024 and 65535");
  }
  const reportPath = args.report ? path.resolve(args.report) : "";
  if (reportPath) fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const env = Object.assign({}, process.env, {
    HERMES_WEB_HOST: "127.0.0.1",
    HERMES_WEB_PORT: String(args.port),
    HERMES_WEB_DATA_DIR: dataDir,
    HERMES_WEB_DB_PATH: dbPath,
    HERMES_WEB_SERVICE_STORE: "sqlite",
    HERMES_WEB_TODO_BACKEND: "local",
    HERMES_WEB_AUTOMATION_BACKEND: "local",
    HERMES_WEB_DISABLE_AUTH: "1",
    HERMES_WEB_PUSH_ENABLED: "0",
    HERMES_WEB_HERMES_API_TIMEOUT_MS: "1000",
  });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk.toString("utf8")}`.slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8000);
  });

  const baseUrl = `http://127.0.0.1:${args.port}`;
  const receiptMarkKey = `sqlite-smoke-${Date.now().toString(36)}`;
  let report = null;
  try {
    await waitReady(baseUrl, child);
    const threads = await fetchJson(`${baseUrl}/api/threads`, { timeoutMs: 5000 });
    const todos = await fetchJson(`${baseUrl}/api/todos?workspaceId=owner&includeCompleted=1`, { timeoutMs: 5000 });
    const automations = await fetchJson(`${baseUrl}/api/automations?workspaceId=owner&includeDisabled=1`, { timeoutMs: 5000 });
    const receipt = await fetchJson(`${baseUrl}/api/push/receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          title: "SQLite smoke",
          data: {
            messageType: "sqlite_runtime_smoke",
            principalId: "owner",
            workspaceId: "owner",
            markKey: receiptMarkKey,
          },
        },
        notification: { shown: true },
        foreground: false,
      }),
      timeoutMs: 5000,
    });

    const store = createMobileSqliteStore({ dbPath });
    const integrity = store.integrityReport();
    const receiptFound = Number(store.open()
      .prepare("SELECT COUNT(*) AS count FROM push_receipts WHERE mark_key = ?")
      .get(receiptMarkKey)?.count || 0);
    store.close();

    report = {
      ok: integrity.ok && receiptFound === 1,
      generatedAt: new Date().toISOString(),
      dataDir,
      dbPath,
      port: args.port,
      threadSummaries: Array.isArray(threads.data) ? threads.data.length : 0,
      todoSource: todos.source || "",
      automationSource: automations.source?.name || "",
      receiptCreated: Boolean(receipt.ok),
      receiptFound,
      integrity,
    };
    if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log([
      `ok=${report.ok}`,
      `threads=${report.threadSummaries}`,
      `todoSource=${report.todoSource}`,
      `automationSource=${report.automationSource}`,
      `receiptFound=${report.receiptFound}`,
      `dbOk=${report.integrity.ok}`,
    ].join("\n"));
    if (!report.ok) process.exitCode = 2;
  } finally {
    if (child.exitCode === null) child.kill();
    if (reportPath && report && (stdout || stderr)) {
      const logPath = `${reportPath}.listener-log.json`;
      fs.writeFileSync(logPath, `${JSON.stringify({ stdout, stderr }, null, 2)}\n`, "utf8");
    }
  }
}

main().catch((err) => {
  console.error(err?.message || String(err));
  console.error(usage());
  process.exit(1);
});
