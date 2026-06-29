#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  buildCoverageAudit,
  buildProductionObservations,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
} = require("../adapters/home-ai-self-improving-loop-service");
const { createCodexThreadTaskCardService } = require("../adapters/codex-thread-task-card-service");

const DEFAULT_SELF_LOOP_WORKSPACE = "owner";

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv) {
  const out = {
    matrixOnly: false,
    json: false,
    markdown: false,
    execute: false,
    createAuditCards: false,
    coverageAudit: false,
    collectProductionObservations: false,
    submitDiagnostics: false,
    auditScope: "none",
    observations: [],
    observationsFile: "",
    observationsJson: "",
    statusSmokeJson: "",
    cronAuditJson: "",
    productionDiagnosticsJson: "",
    base: process.env.HERMES_SELF_LOOP_BASE || process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    accessKeyFile: process.env.HERMES_SELF_LOOP_ACCESS_KEY_FILE || process.env.HERMES_WEB_AUTH_KEY_PATH || "",
    expectedVersion: process.env.HERMES_SELF_LOOP_EXPECTED_VERSION || "",
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    workspaceId: process.env.HERMES_SELF_LOOP_WORKSPACE_ID || DEFAULT_SELF_LOOP_WORKSPACE,
    collectorContext: process.env.HERMES_SELF_LOOP_COLLECTOR_CONTEXT || "auto",
    statusSince: process.env.HERMES_SELF_LOOP_STATUS_SINCE || "",
    statusWindowHours: 24,
    maxActiveGlobal: 64,
    skipStatusSmoke: false,
    skipCronAudit: false,
    skipProductionDiagnostics: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--matrix") out.matrixOnly = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--create-audit-cards") out.createAuditCards = true;
    else if (arg === "--coverage-audit") out.coverageAudit = true;
    else if (arg === "--collect-production-observations") out.collectProductionObservations = true;
    else if (arg === "--submit-diagnostics") out.submitDiagnostics = true;
    else if (arg === "--audit-scope") out.auditScope = clean(argv[++index] || "all", 40);
    else if (arg === "--observations-file") out.observationsFile = argv[++index] || "";
    else if (arg === "--observations-json") out.observationsJson = argv[++index] || "";
    else if (arg === "--status-smoke-json") out.statusSmokeJson = argv[++index] || "";
    else if (arg === "--cron-audit-json") out.cronAuditJson = argv[++index] || "";
    else if (arg === "--production-diagnostics-json") out.productionDiagnosticsJson = argv[++index] || "";
    else if (arg === "--base") out.base = clean(argv[++index] || out.base, 400);
    else if (arg === "--access-key-file" || arg === "--key-file") out.accessKeyFile = argv[++index] || "";
    else if (arg === "--expected-version") out.expectedVersion = clean(argv[++index] || "", 120);
    else if (arg === "--root") out.root = clean(argv[++index] || out.root, 400);
    else if (arg === "--workspace-id") out.workspaceId = clean(argv[++index] || out.workspaceId, 120);
    else if (arg === "--collector-context") out.collectorContext = clean(argv[++index] || out.collectorContext, 40);
    else if (arg === "--status-since") out.statusSince = clean(argv[++index] || "", 120);
    else if (arg === "--status-window-hours") out.statusWindowHours = Number(argv[++index] || out.statusWindowHours);
    else if (arg === "--max-active-global") out.maxActiveGlobal = Number(argv[++index] || out.maxActiveGlobal);
    else if (arg === "--skip-status-smoke") out.skipStatusSmoke = true;
    else if (arg === "--skip-cron-audit") out.skipCronAudit = true;
    else if (arg === "--skip-production-diagnostics") out.skipProductionDiagnostics = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  if (out.createAuditCards && out.auditScope === "none") out.auditScope = "all";
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/homeai-self-improving-loop.js [options]",
    "",
    "Options:",
    "  --matrix                       Print the maintained self-check signal matrix.",
    "  --observations-json <json>     Evaluate bounded observation records.",
    "  --observations-file <file>     Read bounded observation records from JSON.",
    "  --collect-production-observations",
    "                                 Run bounded production collectors and evaluate their observations.",
    "  --status-smoke-json <json>      Test/replay input for production-status-smoke payload.",
    "  --cron-audit-json <json>        Test/replay input for macos-automation-cron-audit payload.",
    "  --production-diagnostics-json <json>",
    "                                 Test/replay input for production-self-diagnostics payload.",
    "  --submit-diagnostics            Submit generated diagnostic events to AI Ops intake.",
    "  --base <url>                    Home AI base URL, default http://127.0.0.1:8797.",
    "  --access-key-file <file>        Owner web key file for status smoke or diagnostic submit.",
    "  --expected-version <version>    Expected client version for production status smoke.",
    "  --root <path>                   Mac production root for cron audit.",
    "  --workspace-id <id>             Workspace id for diagnostic submit, default owner.",
    "  --collector-context <auto|source|production>",
    "                                 Classify protected production read failures by runner context.",
    "  --status-since <iso>            Cron status lower bound.",
    "  --status-window-hours <hours>   Cron status lookback when --status-since is omitted.",
    "  --create-audit-cards           Build daily audit request cards.",
    "  --coverage-audit               Audit recent incident coverage and closure readback requirements.",
    "  --audit-scope <all|platform|plugin|none>",
    "  --execute                      Send audit request cards through Codex Mobile.",
    "  --json                         Print JSON output.",
    "  --markdown                     Print Markdown summary.",
  ].join("\n"));
}

function parseObservationPayload(value, source) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error(`${source}_json_invalid`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.observations)) return parsed.observations;
  throw new Error(`${source}_observations_array_required`);
}

function parseJsonObject(value, source) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (err) {
    throw new Error(`${source}_json_invalid`);
  }
  throw new Error(`${source}_json_object_required`);
}

function readObservations(options) {
  if (options.observationsJson) return parseObservationPayload(options.observationsJson, "observations");
  if (options.observationsFile) {
    return parseObservationPayload(fs.readFileSync(options.observationsFile, "utf8"), "observations_file");
  }
  return [];
}

function isoHoursAgo(hours) {
  const value = Math.max(1, Math.min(168, Number(hours) || 24));
  return new Date(Date.now() - value * 60 * 60 * 1000).toISOString();
}

function resolveCollectorContext(value = "auto") {
  const raw = clean(value || "auto", 40).toLowerCase();
  if (["source", "local", "dev", "manual"].includes(raw)) return "source";
  if (["production", "prod", "scheduled", "cron"].includes(raw)) return "production";
  if (process.env.HOMEAI_PRODUCTION_CONTEXT === "1" || process.env.HERMES_SELF_LOOP_PRODUCTION_CONTEXT === "1") {
    return "production";
  }
  let username = "";
  try {
    username = os.userInfo().username || "";
  } catch (err) {
    username = "";
  }
  if (username === "hermes-host" || username === "root") return "production";
  return "source";
}

function parseChildJson(result, source) {
  const text = String(result.stdout || result.stderr || "").trim();
  let parseError = "";
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        if (result.status !== 0 && parsed.ok !== false) parsed.ok = false;
        return parsed;
      }
    } catch (err) {
      parseError = clean(err?.name || "json_parse_failed", 80);
    }
  }
  const firstLine = clean(text.split(/\r?\n/).find(Boolean) || "", 180);
  const boundedError = /^[A-Za-z0-9._:-]{3,180}$/.test(firstLine) ? firstLine : `${source}_command_failed`;
  return {
    ok: false,
    error: boundedError,
    status: Number.isFinite(result.status) ? result.status : -1,
    parseError,
  };
}

function runNodeJson(script, args = [], source = "collector") {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  return parseChildJson(result, source);
}

function collectProductionPayloads(options) {
  const out = {};
  if (!options.skipStatusSmoke) {
    if (options.statusSmokeJson) {
      out.statusSmoke = parseJsonObject(options.statusSmokeJson, "status_smoke");
    } else if (!options.accessKeyFile) {
      out.statusSmoke = { ok: false, error: "production_status_smoke_access_key_file_missing" };
    } else {
      const args = [
        "--base", options.base,
        "--access-key-file", options.accessKeyFile,
        "--max-active-global", String(Number.isFinite(options.maxActiveGlobal) ? options.maxActiveGlobal : 0),
        "--json",
      ];
      if (options.expectedVersion) args.push("--expected-version", options.expectedVersion);
      out.statusSmoke = runNodeJson("scripts/production-status-smoke.js", args, "production_status_smoke");
    }
  }
  if (!options.skipCronAudit) {
    if (options.cronAuditJson) {
      out.cronAudit = parseJsonObject(options.cronAuditJson, "cron_audit");
    } else {
      const statusSince = options.statusSince || isoHoursAgo(options.statusWindowHours);
      out.cronAudit = runNodeJson("scripts/macos-automation-cron-audit.js", [
        "--root", options.root,
        "--strict-config",
        "--strict-source",
        "--strict-status",
        "--status-since", statusSince,
        "--json",
      ], "automation_cron_audit");
    }
  }
  if (!options.skipProductionDiagnostics) {
    if (options.productionDiagnosticsJson) {
      out.productionDiagnostics = parseJsonObject(options.productionDiagnosticsJson, "production_diagnostics");
    } else {
      out.productionDiagnostics = runNodeJson("scripts/production-self-diagnostics.js", ["--json"], "production_self_diagnostics");
    }
  }
  return out;
}

function readAccessKey(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const key = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (!key) throw new Error("access_key_file_empty");
  return key;
}

async function submitDiagnosticEvents(events, options) {
  if (!events.length) return [];
  if (!options.accessKeyFile) throw new Error("diagnostic_submit_access_key_file_missing");
  const key = readAccessKey(options.accessKeyFile);
  const base = String(options.base || "").replace(/\/+$/, "");
  const workspace = options.workspaceId || DEFAULT_SELF_LOOP_WORKSPACE;
  const results = [];
  for (const event of events) {
    const body = Object.assign({}, event, { workspaceId: workspace });
    try {
      const response = await fetch(`${base}/api/v1/home-ai/diagnostics/events?workspaceId=${encodeURIComponent(workspace)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Web-Key": key,
        },
        body: JSON.stringify(body),
      });
      let payload = {};
      let parseError = "";
      try {
        payload = await response.json();
      } catch (err) {
        parseError = clean(err?.name || "json_parse_failed", 80);
      }
      results.push({
        ok: response.ok && payload.ok !== false,
        status: response.status,
        case_id: clean(payload.case_id || "", 160),
        event_id: clean(payload.event_id || "", 160),
        owner_notified: Boolean(payload.owner_notification?.notified),
        auto_dispatched: Boolean(payload.owner_notification?.auto_dispatched),
        task_card_id: clean(payload.owner_notification?.task_card_id || "", 160),
        reason: clean(payload.error || payload.code || payload.owner_notification?.reason || parseError, 160),
      });
    } catch (err) {
      results.push({
        ok: false,
        status: 0,
        reason: clean(err?.message || "diagnostic_submit_failed", 160),
      });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    "# Home AI Self-Improving Loop",
    "",
    `- matrix_version: \`${report.matrixVersion}\``,
    `- status: \`${report.status || "matrix"}\``,
    `- signal_count: ${report.matrix?.signalCount ?? report.signalCount ?? 0}`,
    `- issue_count: ${report.evaluation?.issueCount ?? 0}`,
    `- audit_request_count: ${report.auditRequests?.cardCount ?? 0}`,
    "",
    "## Signals",
    "",
  ];
  const signals = report.matrix?.signals || report.signals || [];
  for (const signal of signals) {
    lines.push(`- \`${signal.id}\` (${signal.severity}): ${signal.title}`);
  }
  if (report.evaluation?.issues?.length) {
    lines.push("", "## Issues", "");
    for (const issue of report.evaluation.issues) {
      lines.push(`- ${issue.severity} \`${issue.signalId}\`: ${issue.code}`);
    }
  }
  const coverageRequirements = report.coverageAudit?.requirements || report.requirements || [];
  if (coverageRequirements.length) {
    lines.push("", "## Coverage Audit", "");
    for (const item of coverageRequirements) {
      lines.push(`- ${item.severity} \`${item.id}\`: ${item.status}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function dispatchAuditCards(cards) {
  const service = createCodexThreadTaskCardService();
  const results = [];
  for (const card of cards) {
    try {
      const sent = await service.sendTaskCard(card);
      results.push({
        ok: true,
        title: card.title,
        auditKind: card.auditKind,
        cardIds: sent.cardIds,
        sourceThreadId: sent.sourceThreadId,
        targetThreadId: sent.targetThreadId,
      });
    } catch (err) {
      results.push({
        ok: false,
        title: card.title,
        auditKind: card.auditKind,
        code: clean(err?.code || err?.safe?.code || "task_card_send_failed", 120),
        error: clean(err?.message || String(err), 300),
      });
    }
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.collectorContext = resolveCollectorContext(options.collectorContext);
  if (options.matrixOnly) {
    const matrix = buildSignalMatrix();
    process.stdout.write(options.markdown ? renderMarkdown(matrix) : `${JSON.stringify(matrix, null, 2)}\n`);
    return;
  }
  const coverageAudit = options.coverageAudit ? buildCoverageAudit() : null;
  if (
    coverageAudit
    && !options.collectProductionObservations
    && !options.createAuditCards
    && !options.observationsFile
    && !options.observationsJson
    && !options.submitDiagnostics
  ) {
    process.stdout.write(options.markdown ? renderMarkdown(coverageAudit) : `${JSON.stringify(coverageAudit, null, 2)}\n`);
    if (!coverageAudit.ok) process.exitCode = 1;
    return;
  }
  const collectionPayloads = options.collectProductionObservations ? collectProductionPayloads(options) : {};
  const productionCollection = options.collectProductionObservations
    ? buildProductionObservations(Object.assign({
      maxActiveGlobal: options.maxActiveGlobal,
      collectorContext: options.collectorContext,
    }, collectionPayloads))
    : { ok: true, schemaVersion: 1, observationCount: 0, observations: [] };
  const observations = [...readObservations(options), ...productionCollection.observations];
  const report = buildSelfImprovingLoopReport({
    observations,
    includeAuditRequests: options.createAuditCards,
    auditScope: options.auditScope,
  });
  const output = Object.assign({}, report, {
    execute: Boolean(options.execute),
    productionCollection: {
      enabled: Boolean(options.collectProductionObservations),
      ok: productionCollection.ok,
      observationCount: productionCollection.observationCount,
      skippedObservationCount: productionCollection.skippedObservationCount || 0,
      collectorContext: options.collectorContext,
      signals: productionCollection.observations.map((item) => ({
        signalId: item.signalId,
        status: item.status,
        errorCode: item.errorCode || "",
        diagnosticEligible: item.diagnosticEligible !== false,
      })),
    },
    dispatchResults: [],
    diagnosticSubmitResults: [],
    coverageAudit: coverageAudit || { enabled: false },
  });
  if (coverageAudit) output.ok = output.ok && coverageAudit.ok;
  if (options.submitDiagnostics) {
    output.diagnosticSubmitResults = await submitDiagnosticEvents(report.evaluation.diagnosticEvents, options);
    output.ok = output.ok && output.diagnosticSubmitResults.every((item) => item.ok);
  }
  if (options.execute && options.createAuditCards) {
    output.dispatchResults = await dispatchAuditCards(report.auditRequests.cards);
    output.ok = output.ok && output.dispatchResults.every((item) => item.ok);
  }
  if (options.markdown) {
    process.stdout.write(renderMarkdown(output));
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
  if (!output.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: clean(err?.message || String(err), 500) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  readObservations,
  renderMarkdown,
  resolveCollectorContext,
};
