#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_DEBUG_URL = "http://127.0.0.1:19073/";
const DEFAULT_OUTPUT_ROOT = path.join(process.cwd(), "tmp", "visual-polish-runs");
const DEFAULT_CODEX_TASK_CARD_SCRIPT = "/Users/example/path";
const DEFAULT_PLUGINS = [
  "finance",
  "music",
  "wardrobe",
  "note",
  "health",
  "growth",
  "moira",
  "email",
  "codex-mobile",
];
const PLUGIN_ID_ALIASES = Object.freeze({
  healthy: "health",
});
const PLUGIN_OWNER_ALIASES = Object.freeze({
  health: "healthy",
});
const HOST_SCENARIOS = [
  "directory-dark-status",
  "dark-admin-surfaces",
  "dark-growth-surfaces",
  "plugin-topic-dock-return-stability",
  "global-plugin-dock-gesture-stability",
];
const PLUGIN_SCENARIOS = [
  "embedded-plugin-shell",
  "embedded-plugin-keyboard-composer",
  "plugin-drawer-action-gestures",
];

function usage() {
  return [
    "Usage:",
    "  node scripts/visual-polish-controller.js plan [--all-default-plugins|--plugin-id <id> ...]",
    "  node scripts/visual-polish-controller.js ingest --report <ios-pwa-report.json> ... [--source-thread <id>] [--target-thread <owner=id-or-title>]",
    "  node scripts/visual-polish-controller.js send-cards --controller-report <report.json> --source-thread <id> --target-thread <owner=id-or-title>",
    "",
    "Options:",
    "  --debug-url <url>             Home AI live iOS PWA debug server URL.",
    "  --output-dir <dir>            Output directory. Default: tmp/visual-polish-runs/<run-id>.",
    "  --plugin-id <id>              Plugin id. Repeatable.",
    "  --all-default-plugins         Include the default registered plugin set.",
    "  --report <file>               iOS PWA visual harness JSON report. Repeatable.",
    "  --controller-report <file>    Report produced by this controller.",
    "  --source-thread <id>          Codex source thread id for direct task-card sending.",
    "  --target-thread <owner=target>  Owner target thread id or exact title. Repeatable.",
    "  --pending                     Send normal pending cards instead of direct auto-approval.",
    "  --codex-task-card-script <file>  Codex Mobile task-card wrapper path.",
    "  --json                        Print JSON summary.",
  ].join("\n");
}

function cleanString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function unique(values) {
  return [...new Set(values.map((item) => cleanString(item, 120)).filter(Boolean))];
}

function runtimePluginId(pluginId) {
  const id = cleanString(pluginId, 120);
  return PLUGIN_ID_ALIASES[id] || id;
}

function ownerForPluginId(pluginId) {
  const runtimeId = runtimePluginId(pluginId);
  return PLUGIN_OWNER_ALIASES[runtimeId] || runtimeId;
}

function parseOwnerTarget(value) {
  const text = cleanString(value, 500);
  const index = text.indexOf("=");
  if (index <= 0) throw new Error(`invalid target thread mapping: ${value}`);
  return {
    owner: cleanString(text.slice(0, index), 120),
    target: cleanString(text.slice(index + 1), 300),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !String(argv[0]).startsWith("--") ? argv.shift() : "plan";
  const options = {
    mode,
    debugUrl: DEFAULT_DEBUG_URL,
    outputDir: "",
    runId: "",
    pluginIds: [],
    allDefaultPlugins: false,
    reports: [],
    controllerReport: "",
    sourceThreadId: "",
    targetThreads: {},
    pending: false,
    codexTaskCardScript: DEFAULT_CODEX_TASK_CARD_SCRIPT,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--debug-url") options.debugUrl = normalizeBaseUrl(next());
    else if (arg === "--output-dir") options.outputDir = path.resolve(next());
    else if (arg === "--run-id") options.runId = slug(next(), 80);
    else if (arg === "--plugin-id") options.pluginIds.push(next());
    else if (arg === "--all-default-plugins") options.allDefaultPlugins = true;
    else if (arg === "--report") options.reports.push(path.resolve(next()));
    else if (arg === "--controller-report") options.controllerReport = path.resolve(next());
    else if (arg === "--source-thread") options.sourceThreadId = next();
    else if (arg === "--target-thread") {
      const parsed = parseOwnerTarget(next());
      options.targetThreads[parsed.owner] = parsed.target;
    } else if (arg === "--pending") options.pending = true;
    else if (arg === "--codex-task-card-script") options.codexTaskCardScript = path.resolve(next());
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!options.debugUrl) options.debugUrl = DEFAULT_DEBUG_URL;
  if (!options.runId) options.runId = timestampId();
  if (!options.outputDir) options.outputDir = path.join(DEFAULT_OUTPUT_ROOT, options.runId);
  options.pluginIds = unique([
    ...(options.allDefaultPlugins ? DEFAULT_PLUGINS : []),
    ...options.pluginIds,
  ]);
  return options;
}

function normalizeBaseUrl(value) {
  const parsed = new URL(String(value || DEFAULT_DEBUG_URL));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("debug_url_must_be_http");
  return parsed.href.endsWith("/") ? parsed.href : `${parsed.href}/`;
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, "").replace(/T/, "-").replace(/Z$/, "Z");
}

function slug(value, max = 120) {
  return cleanString(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function redact(value) {
  const text = String(value || "");
  try {
    const parsed = new URL(text);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/key|token|secret|password|cookie|launch|auth|authorization|bearer/i.test(key)) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return parsed.toString().slice(0, 800);
  } catch (_) {
    return text
      .replace(/([?&][^=]*(?:key|token|secret|password|cookie|launch|auth|authorization|bearer)[^=]*=)[^&\s]+/ig, "$1REDACTED")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/ig, "$1REDACTED")
      .slice(0, 800);
  }
}

function visualCommand({ scenario, pluginId = "", debugUrl = DEFAULT_DEBUG_URL }) {
  const parts = ["npm", "run", "ios:pwa:visual", "--", "--scenario", scenario];
  if (pluginId) parts.push("--plugin-id", pluginId);
  if (scenario === "plugin-drawer-action-gestures" && pluginId === "finance") {
    parts.push("--plugin-action-id", "record");
  }
  parts.push("--debug-url", debugUrl, "--json");
  return parts;
}

function shellQuote(parts) {
  return parts.map((part) => {
    const text = String(part);
    if (/^[A-Za-z0-9_/:=.,@+-]+$/.test(text)) return text;
    return `'${text.replace(/'/g, "'\\''")}'`;
  }).join(" ");
}

function buildPlan(options = {}) {
  const debugUrl = normalizeBaseUrl(options.debugUrl || DEFAULT_DEBUG_URL);
  const pluginIds = unique(options.pluginIds || []);
  const scenarios = [];
  for (const scenario of HOST_SCENARIOS) {
    scenarios.push({
      owner: "home-ai",
      scenario,
      pluginId: "",
      command: shellQuote(visualCommand({ scenario, debugUrl })),
    });
  }
  for (const rawPluginId of pluginIds) {
    const pluginId = runtimePluginId(rawPluginId);
    const pluginOwner = ownerForPluginId(pluginId);
    for (const scenario of PLUGIN_SCENARIOS) {
      scenarios.push({
        owner: scenario === "plugin-drawer-action-gestures" ? "home-ai" : pluginOwner,
        scenario,
        pluginId,
        command: shellQuote(visualCommand({ scenario, pluginId, debugUrl })),
      });
    }
  }
  return {
    ok: true,
    kind: "visual_polish_plan",
    runId: options.runId || timestampId(),
    debugUrl: redact(debugUrl),
    scenarioCount: scenarios.length,
    pluginIds,
    scenarios,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function failedAssertions(report = {}) {
  return Array.isArray(report.assertions) ? report.assertions.filter((item) => item && item.pass === false) : [];
}

const ENVIRONMENT_FAILURE_ASSERTIONS = new Set([
  "app_url_provided_for_client_version_check",
  "client_freshness_ready",
  "client_version_matches_expected",
  "screenshot_meets_min_bytes",
  "app_visible_for_visual_assertions",
]);

function isEnvironmentFailureReport(report = {}) {
  if (String(report.failureKind || "") === "environment") return true;
  const failed = failedAssertions(report).map((item) => String(item.name || ""));
  if (failed.some((name) => ENVIRONMENT_FAILURE_ASSERTIONS.has(name))) return true;
  return /visual_debug_server_unavailable|debug_lane_lease|ios_visual_harness_lock_timeout|client_freshness|app_url_required|webview_context_missing|screenshot_failed/i.test(String(report.error || ""));
}

function codeFromReport(report = {}) {
  const failed = failedAssertions(report);
  if (failed.length) return cleanString(failed[0].name, 160);
  if (report.error) return slug(report.error, 160);
  return report.ok === false ? "visual_harness_failed" : "visual_harness_unknown";
}

function classifyOwner(report = {}) {
  const scenario = cleanString(report.scenario, 160);
  const pluginId = cleanString(report.pluginId, 120);
  const haystack = JSON.stringify({
    scenario,
    assertions: failedAssertions(report).map((item) => item.name || item.details || item.message),
    error: report.error || "",
  }).toLowerCase();
  if (!pluginId) return "home-ai";
  if (/bottom|dock|nav|route|apphidden|client_version|screenshot|lease|auth|session|global_plugin/.test(haystack)) return "home-ai";
  if (/plugin-drawer-action-gestures/.test(scenario)) return /iframe|embedded|plugin content|plugin_content/.test(haystack) ? ownerForPluginId(pluginId) : "home-ai";
  if (/^embedded-plugin-/.test(scenario)) return ownerForPluginId(pluginId);
  return "home-ai";
}

function classifySeverity(report = {}) {
  const haystack = JSON.stringify({
    error: report.error || "",
    failed: failedAssertions(report),
    metrics: report.metrics || {},
  }).toLowerCase();
  if (/blank|white|apphidden|nav.*missing|route.*stuck|screenshot.*missing|screenshot_meets_min_bytes|fatal/.test(haystack)) return "high";
  if (/overlap|overflow|bottom|dock|composer|keyboard|flicker|frame|iframe|viewport|jank|stable/.test(haystack)) return "medium";
  return "low";
}

function boundedEvidence(report = {}) {
  return {
    report: redact(report.__sourceFile || ""),
    screenshot: redact(report.screenshot?.path || ""),
    scenario: cleanString(report.scenario, 160),
    pluginId: cleanString(report.pluginId, 120),
    debugUrl: redact(report.debugUrl || ""),
    appUrl: redact(report.appUrl || ""),
    failedAssertions: failedAssertions(report).slice(0, 5).map((item) => ({
      name: cleanString(item.name, 160),
      details: redact(JSON.stringify(item.details || item.message || {}).slice(0, 1000)),
    })),
    error: redact(report.error || ""),
  };
}

function cardTitle(card = {}) {
  const target = card.owner === "home-ai" ? "Home AI" : card.owner;
  return `[Visual QA] ${target} ${card.scenario} ${card.issueCode}`;
}

function cardBody(card = {}) {
  const evidence = card.evidence || {};
  const reverify = shellQuote(visualCommand({
    scenario: card.scenario,
    pluginId: card.pluginId,
    debugUrl: card.debugUrl || DEFAULT_DEBUG_URL,
  }));
  return [
    "## Scope",
    "",
    `Owner: ${card.owner}`,
    `Scenario: ${card.scenario}`,
    card.pluginId ? `Plugin: ${card.pluginId}` : "Plugin: n/a",
    `Severity: ${card.severity}`,
    "",
    "## Evidence",
    "",
    `Report: ${evidence.report || "n/a"}`,
    `Screenshot: ${evidence.screenshot || "n/a"}`,
    evidence.error ? `Error: ${evidence.error}` : "",
    "",
    "Failed assertions:",
    ...(evidence.failedAssertions || []).map((item) => `- ${item.name}${item.details ? `: ${item.details}` : ""}`),
    "",
    "## Expected Fix",
    "",
    "Repair the owned UI surface so the visual harness passes without broad local workarounds. Keep host-owned shell geometry in Home AI and plugin-owned iframe layout in the plugin workspace.",
    "",
    "## Acceptance",
    "",
    "```sh",
    reverify,
    "```",
  ].filter((line) => line !== "").join("\n");
}

function idempotencyFor(card = {}) {
  const hash = crypto.createHash("sha256")
    .update(JSON.stringify({
      owner: card.owner,
      scenario: card.scenario,
      pluginId: card.pluginId,
      issueCode: card.issueCode,
    }))
    .digest("hex")
    .slice(0, 18);
  return `visual-polish:${card.owner}:${hash}`;
}

function cardRequest(card = {}, options = {}) {
  const target = options.targetThreads?.[card.owner] || options.targetThreads?.default || "";
  const request = {
    sourceThreadId: options.sourceThreadId || "",
    targetThreadIds: target ? [target] : [],
    title: card.title,
    summary: `${card.severity} visual issue in ${card.scenario}`,
    body: card.body,
    idempotencyKey: card.idempotencyKey,
    requestId: card.idempotencyKey,
    workflowMode: "autonomous",
    workflowId: "home-ai-visual-polish-controller",
    pending: Boolean(options.pending),
    autoApprove: !options.pending,
  };
  if (request.targetThreadIds.length === 1) request.targetThreadId = request.targetThreadIds[0];
  return request;
}

function buildCardFromReport(report = {}, options = {}) {
  const owner = classifyOwner(report);
  const issueCode = codeFromReport(report);
  const scenario = cleanString(report.scenario, 160) || "unknown";
  const pluginId = cleanString(report.pluginId, 120);
  const severity = classifySeverity(report);
  const card = {
    owner,
    pluginId,
    scenario,
    issueCode,
    severity,
    debugUrl: redact(normalizeBaseUrl(options.debugUrl || report.debugUrl || DEFAULT_DEBUG_URL)),
    evidence: boundedEvidence(report),
  };
  card.title = cardTitle(card);
  card.body = cardBody(card);
  card.idempotencyKey = idempotencyFor(card);
  card.request = cardRequest(card, options);
  return card;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${value}\n`, "utf8");
}

function ingestReports(options = {}) {
  if (!options.reports?.length) throw new Error("at least one --report is required");
  const cards = [];
  const accepted = [];
  for (const file of options.reports) {
    const report = Object.assign({}, readJson(file), { __sourceFile: file });
    const environmentFailure = isEnvironmentFailureReport(report);
    accepted.push({
      file: redact(file),
      ok: Boolean(report.ok),
      scenario: report.scenario || "",
      pluginId: report.pluginId || "",
      failureKind: environmentFailure ? "environment" : String(report.failureKind || ""),
    });
    if (report.ok === false && !environmentFailure) cards.push(buildCardFromReport(report, options));
  }
  const output = {
    ok: true,
    kind: "visual_polish_ingest",
    runId: options.runId || timestampId(),
    generatedAt: new Date().toISOString(),
    sourceThreadId: options.sourceThreadId || "",
    reports: accepted,
    cardCount: cards.length,
    skippedEnvironmentFailureCount: accepted.filter((item) => item.failureKind === "environment").length,
    cards,
  };
  writeControllerOutput(output, options);
  return output;
}

function writeControllerOutput(output, options = {}) {
  const outDir = path.resolve(options.outputDir || path.join(DEFAULT_OUTPUT_ROOT, output.runId || timestampId()));
  const cardsDir = path.join(outDir, "task-cards");
  ensureDir(cardsDir);
  for (const card of output.cards || []) {
    const base = `${slug(card.owner)}-${slug(card.scenario)}-${slug(card.issueCode)}`;
    writeText(path.join(cardsDir, `${base}.md`), card.body);
    writeJson(path.join(cardsDir, `${base}.request.json`), card.request);
  }
  writeJson(path.join(outDir, "report.json"), output);
  writeText(path.join(outDir, "summary.md"), summaryMarkdown(output));
  output.outputDir = outDir;
  output.reportPath = path.join(outDir, "report.json");
}

function summaryMarkdown(output = {}) {
  const lines = [
    "# Visual Polish Controller",
    "",
    `Run: ${output.runId || ""}`,
    `Cards: ${(output.cards || []).length}`,
    `Environment failures skipped: ${Number(output.skippedEnvironmentFailureCount || 0)}`,
    "",
  ];
  for (const card of output.cards || []) {
    lines.push(`- ${card.severity} ${card.owner} ${card.scenario}: ${card.issueCode}`);
  }
  return lines.join("\n");
}

function sendCards(options = {}) {
  if (!options.controllerReport) throw new Error("--controller-report is required");
  if (!options.sourceThreadId) throw new Error("--source-thread is required for send-cards");
  const report = readJson(options.controllerReport);
  const cards = Array.isArray(report.cards) ? report.cards : [];
  const results = [];
  for (const card of cards) {
    const request = cardRequest(Object.assign({}, card, {
      body: card.body || cardBody(card),
      idempotencyKey: card.idempotencyKey || idempotencyFor(card),
      title: card.title || cardTitle(card),
    }), options);
    if (!request.targetThreadIds.length) {
      results.push({ ok: false, owner: card.owner, error: "target_thread_not_configured" });
      continue;
    }
    if (request.targetThreadIds.some((targetThreadId) => String(targetThreadId || "").trim() === String(request.sourceThreadId || "").trim())) {
      results.push({
        ok: true,
        skipped: true,
        owner: card.owner,
        reason: "source_thread_self_target",
        targetThreadIds: request.targetThreadIds,
      });
      continue;
    }
    const requestFile = path.join(os.tmpdir(), `homeai-visual-card-${process.pid}-${results.length}.json`);
    fs.writeFileSync(requestFile, `${JSON.stringify(request, null, 2)}\n`, "utf8");
    try {
      const stdout = childProcess.execFileSync(process.execPath, [options.codexTaskCardScript, "--json-file", requestFile], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      results.push({ ok: true, owner: card.owner, response: safeParseJson(stdout) });
    } catch (err) {
      results.push({
        ok: false,
        owner: card.owner,
        error: redact(err.stderr || err.stdout || err.message || String(err)),
      });
    } finally {
      fs.rmSync(requestFile, { force: true });
    }
  }
  return {
    ok: results.every((item) => item.ok),
    kind: "visual_polish_send_cards",
    sent: results.filter((item) => item.ok && !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

function safeParseJson(text) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (_) {
    return { raw: redact(text || "") };
  }
}

function printHuman(output = {}) {
  if (output.kind === "visual_polish_plan") {
    console.log(`visual polish plan scenarios=${output.scenarioCount}`);
    for (const item of output.scenarios) console.log(item.command);
    return;
  }
  if (output.kind === "visual_polish_ingest") {
    console.log(`visual polish ingest cards=${output.cardCount}`);
    if (output.reportPath) console.log(`report=${output.reportPath}`);
    return;
  }
  if (output.kind === "visual_polish_send_cards") {
    console.log(`visual polish send-cards sent=${output.sent} failed=${output.failed}`);
  }
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  let output;
  if (options.mode === "plan") output = buildPlan(options);
  else if (options.mode === "ingest") output = ingestReports(options);
  else if (options.mode === "send-cards") output = sendCards(options);
  else throw new Error(`unknown mode: ${options.mode}`);
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else printHuman(output);
  if (output.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PLUGINS,
  HOST_SCENARIOS,
  PLUGIN_SCENARIOS,
  buildCardFromReport,
  buildPlan,
  cardRequest,
  classifyOwner,
  classifySeverity,
  ingestReports,
  isEnvironmentFailureReport,
  ownerForPluginId,
  parseArgs,
  redact,
  runtimePluginId,
  sendCards,
  visualCommand,
};
