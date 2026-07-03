#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  buildCoverageAudit,
  buildDiagnosticSubmitClosureReport,
  buildProductionObservations,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
} = require("../adapters/home-ai-self-improving-loop-service");
const {
  auditRuntimeSloModel,
  buildRuntimeSloModel,
} = require("../adapters/home-ai-runtime-slo-service");
const {
  buildOwner3AQualityEvidence,
} = require("../adapters/owner-3a-quality-evidence-service");
const { createSystemResourceStatusService } = require("../adapters/system-resource-status-service");
const {
  DEFAULT_DEPLOY_THREAD_TITLES,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  createCodexThreadTaskCardService,
} = require("../adapters/codex-thread-task-card-service");

const DEFAULT_SELF_LOOP_WORKSPACE = "owner";
const APP_ROOT = path.resolve(__dirname, "..");

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
    runtimeSloModel: false,
    runtimeSloAudit: false,
    collectProductionObservations: false,
    submitDiagnostics: false,
    auditScope: "none",
    observations: [],
    observationsFile: "",
    observationsJson: "",
    statusSmokeJson: "",
    systemResourceStatusJson: "",
    cronAuditJson: "",
    productionDiagnosticsJson: "",
    publicUpgradeRehearsalJson: "",
    installUpgradeCanaryJson: "",
    runtimeSloAuditJson: "",
    pluginActionMetadataClosureJson: "",
    mcpSchemaClosureJson: "",
    threadLivenessJson: "",
    pluginManifestHealthJson: "",
    notificationDeliveryJson: "",
    nativeBridgeCapabilityJson: "",
    pluginProxyLatencyJson: "",
    gatewayCapabilityAvailabilityJson: "",
    uiRuntimeHealthJson: "",
    qualityEvidenceOutput: process.env.HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT || process.env.HERMES_OWNER_3A_QUALITY_EVIDENCE_FILE || "",
    base: process.env.HERMES_SELF_LOOP_BASE || process.env.HERMES_MOBILE_SMOKE_BASE || "http://127.0.0.1:8797",
    threadCwd: process.env.HOMEAI_SELF_LOOP_THREAD_CWD || process.env.HERMES_MOBILE_SOURCE_APP_ROOT || "",
    accessKeyFile: process.env.HERMES_SELF_LOOP_ACCESS_KEY_FILE || process.env.HERMES_WEB_AUTH_KEY_PATH || "",
    expectedVersion: process.env.HERMES_SELF_LOOP_EXPECTED_VERSION || "",
    root: process.env.HERMES_MOBILE_ROOT || "/Users/example/path",
    workspaceId: process.env.HERMES_SELF_LOOP_WORKSPACE_ID || DEFAULT_SELF_LOOP_WORKSPACE,
    collectorContext: process.env.HERMES_SELF_LOOP_COLLECTOR_CONTEXT || "auto",
    statusSince: process.env.HERMES_SELF_LOOP_STATUS_SINCE || "",
    statusWindowHours: 24,
    maxActiveGlobal: 64,
    skipStatusSmoke: false,
    skipSystemResourceStatus: false,
    skipCronAudit: false,
    skipProductionDiagnostics: false,
    skipPublicUpgradeRehearsal: false,
    skipInstallUpgradeCanary: false,
    skipRuntimeSloAudit: false,
    skipPluginActionMetadataClosure: false,
    skipMcpSchemaClosure: false,
    skipThreadLiveness: false,
    skipPluginManifestHealth: false,
    skipNotificationDelivery: false,
    skipNativeBridgeCapability: false,
    diagnosticIssuesNonfatal: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--matrix") out.matrixOnly = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--create-audit-cards") out.createAuditCards = true;
    else if (arg === "--coverage-audit") out.coverageAudit = true;
    else if (arg === "--runtime-slo-model") out.runtimeSloModel = true;
    else if (arg === "--runtime-slo-audit") out.runtimeSloAudit = true;
    else if (arg === "--collect-production-observations") out.collectProductionObservations = true;
    else if (arg === "--submit-diagnostics") out.submitDiagnostics = true;
    else if (arg === "--audit-scope") out.auditScope = clean(argv[++index] || "all", 40);
    else if (arg === "--observations-file") out.observationsFile = argv[++index] || "";
    else if (arg === "--observations-json") out.observationsJson = argv[++index] || "";
    else if (arg === "--status-smoke-json") out.statusSmokeJson = argv[++index] || "";
    else if (arg === "--system-resource-status-json") out.systemResourceStatusJson = argv[++index] || "";
    else if (arg === "--cron-audit-json") out.cronAuditJson = argv[++index] || "";
    else if (arg === "--production-diagnostics-json") out.productionDiagnosticsJson = argv[++index] || "";
    else if (arg === "--public-upgrade-rehearsal-json") out.publicUpgradeRehearsalJson = argv[++index] || "";
    else if (arg === "--install-upgrade-canary-json") out.installUpgradeCanaryJson = argv[++index] || "";
    else if (arg === "--runtime-slo-audit-json") out.runtimeSloAuditJson = argv[++index] || "";
    else if (arg === "--plugin-action-metadata-closure-json") out.pluginActionMetadataClosureJson = argv[++index] || "";
    else if (arg === "--mcp-schema-closure-json") out.mcpSchemaClosureJson = argv[++index] || "";
    else if (arg === "--thread-liveness-json") out.threadLivenessJson = argv[++index] || "";
    else if (arg === "--plugin-manifest-health-json") out.pluginManifestHealthJson = argv[++index] || "";
    else if (arg === "--notification-delivery-json") out.notificationDeliveryJson = argv[++index] || "";
    else if (arg === "--native-bridge-capability-json") out.nativeBridgeCapabilityJson = argv[++index] || "";
    else if (arg === "--plugin-proxy-latency-json") out.pluginProxyLatencyJson = argv[++index] || "";
    else if (arg === "--gateway-capability-availability-json") out.gatewayCapabilityAvailabilityJson = argv[++index] || "";
    else if (arg === "--ui-runtime-health-json") out.uiRuntimeHealthJson = argv[++index] || "";
    else if (arg === "--quality-evidence-output") out.qualityEvidenceOutput = argv[++index] || "";
    else if (arg === "--base") out.base = clean(argv[++index] || out.base, 400);
    else if (arg === "--thread-cwd") out.threadCwd = clean(argv[++index] || out.threadCwd, 400);
    else if (arg === "--access-key-file" || arg === "--key-file") out.accessKeyFile = argv[++index] || "";
    else if (arg === "--expected-version") out.expectedVersion = clean(argv[++index] || "", 120);
    else if (arg === "--root") out.root = clean(argv[++index] || out.root, 400);
    else if (arg === "--workspace-id") out.workspaceId = clean(argv[++index] || out.workspaceId, 120);
    else if (arg === "--collector-context") out.collectorContext = clean(argv[++index] || out.collectorContext, 40);
    else if (arg === "--status-since") out.statusSince = clean(argv[++index] || "", 120);
    else if (arg === "--status-window-hours") out.statusWindowHours = Number(argv[++index] || out.statusWindowHours);
    else if (arg === "--max-active-global") out.maxActiveGlobal = Number(argv[++index] || out.maxActiveGlobal);
    else if (arg === "--skip-status-smoke") out.skipStatusSmoke = true;
    else if (arg === "--skip-system-resource-status") out.skipSystemResourceStatus = true;
    else if (arg === "--skip-cron-audit") out.skipCronAudit = true;
    else if (arg === "--skip-production-diagnostics") out.skipProductionDiagnostics = true;
    else if (arg === "--skip-public-upgrade-rehearsal") out.skipPublicUpgradeRehearsal = true;
    else if (arg === "--skip-install-upgrade-canary") out.skipInstallUpgradeCanary = true;
    else if (arg === "--skip-runtime-slo-audit") out.skipRuntimeSloAudit = true;
    else if (arg === "--skip-plugin-action-metadata-closure") out.skipPluginActionMetadataClosure = true;
    else if (arg === "--skip-mcp-schema-closure") out.skipMcpSchemaClosure = true;
    else if (arg === "--skip-thread-liveness") out.skipThreadLiveness = true;
    else if (arg === "--skip-plugin-manifest-health") out.skipPluginManifestHealth = true;
    else if (arg === "--skip-notification-delivery") out.skipNotificationDelivery = true;
    else if (arg === "--skip-native-bridge-capability") out.skipNativeBridgeCapability = true;
    else if (arg === "--diagnostic-issues-nonfatal") out.diagnosticIssuesNonfatal = true;
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
    "  --system-resource-status-json <json>",
    "                                 Test/replay input for Owner System Console resource status payload.",
    "  --cron-audit-json <json>        Test/replay input for macos-automation-cron-audit payload.",
    "  --production-diagnostics-json <json>",
    "                                 Test/replay input for production-self-diagnostics payload.",
    "  --public-upgrade-rehearsal-json <json>",
    "                                 Test/replay input for public upgrade rehearsal payload.",
    "  --install-upgrade-canary-json <json>",
    "                                 Test/replay input for install/upgrade canary payload.",
    "  --runtime-slo-audit-json <json>",
    "                                 Test/replay input for Runtime SLO audit payload.",
    "  --plugin-action-metadata-closure-json <json>",
    "                                 Test/replay input for plugin action metadata aggregate closure payload.",
    "  --mcp-schema-closure-json <json>",
    "                                 Test/replay input for MCP schema closure payload.",
    "  --thread-liveness-json <json>",
    "                                 Test/replay input for audit/deploy/task-card thread liveness payload.",
    "  --plugin-manifest-health-json <json>",
    "                                 Test/replay input for plugin manifest/proxy health payload.",
    "  --notification-delivery-json <json>",
    "                                 Test/replay input for Web Push notification delivery audit payload.",
    "  --native-bridge-capability-json <json>",
    "                                 Test/replay input for native bridge capability payload.",
    "  --plugin-proxy-latency-json <json>",
    "                                 Replay bounded embedded plugin proxy timing payload.",
    "  --gateway-capability-availability-json <json>",
    "                                 Replay bounded low-permission Gateway document tool capability payload.",
    "  --ui-runtime-health-json <json>",
    "                                 Replay bounded composer/media/native/plugin-action runtime health payload.",
    "  --quality-evidence-output <file>",
    "                                 Persist bounded Owner Console 3A evidence from collected production observations.",
    "  --submit-diagnostics            Submit generated diagnostic events to AI Ops intake.",
    "  --base <url>                    Home AI base URL, default http://127.0.0.1:8797.",
    "  --thread-cwd <path>             Codex thread/deploy-lane discovery cwd.",
    "  --access-key-file <file>        Owner web key file for status smoke or diagnostic submit.",
    "  --expected-version <version>    Expected client version for production status smoke.",
    "  --root <path>                   Mac production root for cron audit.",
    "  --workspace-id <id>             Workspace id for diagnostic submit, default owner.",
    "  --collector-context <auto|source|production>",
    "                                 Classify protected production read failures by runner context.",
    "  --status-since <iso>            Cron status lower bound.",
    "  --status-window-hours <hours>   Cron status lookback when --status-since is omitted.",
    "  --skip-public-upgrade-rehearsal",
    "                                 Do not run the published public repo upgrade rehearsal collector.",
    "  --skip-install-upgrade-canary",
    "                                 Do not run the install/upgrade canary collector.",
    "  --skip-system-resource-status  Do not collect Owner System Console resource status.",
    "  --skip-runtime-slo-audit       Do not run the Runtime SLO coverage collector.",
    "  --skip-plugin-action-metadata-closure",
    "                                 Do not run the plugin action metadata aggregate closure collector.",
    "  --skip-mcp-schema-closure      Do not run the MCP schema closure collector.",
    "  --skip-thread-liveness         Do not run Codex Mobile thread/lane discovery collectors.",
    "  --skip-plugin-manifest-health  Do not run plugin manifest/proxy host probes.",
    "  --skip-notification-delivery   Do not run Web Push notification delivery audit.",
    "  --skip-native-bridge-capability",
    "                                 Do not emit the native bridge capability observation.",
    "  --diagnostic-issues-nonfatal   Keep process exit 0 when the only failure is a collected",
    "                                 diagnostic signal; used by the scheduled wrapper.",
    "  --create-audit-cards           Build daily audit request cards.",
    "  --coverage-audit               Audit recent incident coverage and closure readback requirements.",
    "  --runtime-slo-model            Print the maintained 3A Runtime SLO model.",
    "  --runtime-slo-audit            Audit 3A Runtime SLO coverage and repair routing.",
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
  const scriptPath = path.isAbsolute(script) ? script : path.join(APP_ROOT, script);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: APP_ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  return parseChildJson(result, source);
}

function writeQualityEvidenceFile(filePath, payload) {
  if (!filePath) return false;
  const target = path.resolve(filePath);
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch (_) {
      // Best-effort permission tightening; write/rename success is the invariant.
    }
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      // Ignore cleanup failures; report the bounded write failure below.
    }
    throw new Error("quality_evidence_output_write_failed");
  }
}

async function collectSystemResourceStatus(options) {
  const service = createSystemResourceStatusService({
    appRoot: `${String(options.root || "").replace(/\/+$/, "")}/app`,
    dataRoot: `${String(options.root || "").replace(/\/+$/, "")}/data`,
    runtimeRoot: `${String(options.root || "").replace(/\/+$/, "")}/runtime`,
  });
  try {
    return await service.collect();
  } catch (err) {
    return {
      ok: false,
      status: "unknown",
      overallStatus: "unknown",
      error: clean(err?.message || "system_resource_status_collect_failed", 160),
    };
  }
}

function skippedCollectorPayload(reason) {
  return {
    ok: false,
    skipped: true,
    reason: clean(reason || "collector_skipped", 160),
  };
}

function accessKeyFileState(options, source) {
  const prefix = clean(source || "collector", 80);
  if (!options.accessKeyFile) return { ok: false, error: `${prefix}_access_key_file_missing` };
  try {
    const key = readAccessKey(options.accessKeyFile);
    return { ok: true, key };
  } catch (err) {
    const code = err?.message === "access_key_file_empty"
      ? `${prefix}_access_key_file_empty`
      : `${prefix}_access_key_file_unreadable`;
    return { ok: false, error: code };
  }
}

function sourceSkippedOrFailure(options, reason) {
  if (resolveCollectorContext(options.collectorContext) === "source") {
    return skippedCollectorPayload(reason);
  }
  return { ok: false, error: clean(reason || "collector_failed", 160) };
}

function markerCheck(relativePath, marker) {
  const filePath = path.join(APP_ROOT, relativePath);
  let body = "";
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { relativePath, marker, ok: false, code: "source_file_unreadable" };
  }
  return { relativePath, marker, ok: body.includes(marker) };
}

function collectPluginProxyWorkspaceBoundary() {
  const checks = [
    markerCheck("server-routes/hermes-plugin-api-routes.js", "health_proxy_workspace_required"),
    markerCheck("server-routes/hermes-plugin-api-routes.js", "x-hermes-plugin-workspace-id"),
    markerCheck("server-routes/hermes-plugin-api-routes.js", "x-hermes-plugin-actor-workspace-id"),
    markerCheck("tests/hermes-plugin-api-routes.test.js", "health write without an explicit workspace must not reach upstream"),
    markerCheck("tests/hermes-plugin-api-routes.test.js", "Bearer browser-supplied-value"),
    markerCheck("tests/hermes-plugin-api-routes.test.js", "x-hermes-plugin-workspace-id"),
    markerCheck("tests/hermes-plugin-api-routes.test.js", "x-hermes-plugin-actor-workspace-id"),
  ];
  const issues = checks
    .filter((item) => !item.ok)
    .map((item) => ({ code: "plugin_proxy_workspace_marker_missing", marker: item.marker }));
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    routeKind: "source_contract_smoke",
    checkCount: checks.length,
    missingWorkspaceFailsClosed: checks.some((item) => item.ok && item.marker === "health_proxy_workspace_required"),
    workspaceHeaderPropagated: checks.filter((item) => item.ok && item.marker === "x-hermes-plugin-workspace-id").length >= 2,
    actorHeaderPropagated: checks.filter((item) => item.ok && item.marker === "x-hermes-plugin-actor-workspace-id").length >= 2,
    browserAuthOverwritten: checks.some((item) => item.ok && item.marker === "Bearer browser-supplied-value"),
    issues,
  };
}

function threadTitle(thread) {
  return clean(thread?.title || thread?.name || thread?.threadTitle || thread?.thread_title, 160);
}

function threadStatus(thread) {
  const status = thread?.status;
  if (typeof status === "string") return clean(status.toLowerCase(), 80);
  if (status && typeof status.type === "string") return clean(status.type.toLowerCase(), 80);
  return "unknown";
}

function safeThreadSummary(thread) {
  if (!thread) return null;
  return {
    title: threadTitle(thread),
    status: threadStatus(thread),
  };
}

function threadLivenessCwdCandidates(options = {}) {
  const candidates = [
    options.threadCwd,
    process.env.HOMEAI_SELF_LOOP_THREAD_CWD,
    process.env.HERMES_MOBILE_SOURCE_APP_ROOT,
    APP_ROOT,
    "/Users/example/path",
  ];
  const out = [];
  const seen = new Set();
  for (const item of candidates) {
    const value = String(item || "").trim();
    if (!value) continue;
    const normalized = path.resolve(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function threadDiscoverySummaryForCwd(threads = [], cwd = "") {
  const deployTitleSet = new Set(DEFAULT_DEPLOY_THREAD_TITLES);
  const deployLanes = threads
    .filter((thread) => deployTitleSet.has(threadTitle(thread)) && threadStatus(thread) !== "completed")
    .map(safeThreadSummary)
    .filter(Boolean);
  const platformAudit = threads.find((thread) => threadTitle(thread) === DEFAULT_PLATFORM_AUDIT_THREAD_TITLE) || null;
  const pluginAudit = threads.find((thread) => threadTitle(thread) === DEFAULT_PLUGIN_AUDIT_THREAD_TITLE) || null;
  return {
    cwd,
    deployLanes,
    platformAudit,
    pluginAudit,
    score: deployLanes.length + Number(Boolean(platformAudit)) + Number(Boolean(pluginAudit)),
  };
}

async function collectThreadLiveness(options) {
  let service = options.threadTaskCardService;
  try {
    if (!service) service = createCodexThreadTaskCardService({ timeoutMs: 5000 });
  } catch (err) {
    return skippedCollectorPayload(clean(err?.code || err?.message || "codex_thread_service_unavailable", 160));
  }
  try {
    let selected = null;
    const checkedCwds = [];
    for (const cwd of threadLivenessCwdCandidates(options)) {
      const threads = await service.listThreads({ cwd, limit: 200 });
      const summary = threadDiscoverySummaryForCwd(threads, cwd);
      checkedCwds.push({ basename: path.basename(cwd), score: summary.score });
      if (!selected || summary.score > selected.score) selected = summary;
      if (summary.score >= 3) break;
    }
    if (!selected) selected = threadDiscoverySummaryForCwd([], APP_ROOT);
    const { deployLanes, platformAudit, pluginAudit } = selected;
    let sourceThread = null;
    try {
      sourceThread = await service.findSourceThread({ cwd: selected.cwd });
    } catch (_) {
      sourceThread = null;
    }
    return {
      ok: true,
      deployLaneCount: deployLanes.length,
      deployLanes,
      assignedRouteCount: deployLanes.length,
      auditThreadCount: Number(Boolean(platformAudit)) + Number(Boolean(pluginAudit)),
      platformAuditVisible: Boolean(platformAudit),
      pluginAuditVisible: Boolean(pluginAudit),
      sourceThreadVisible: Boolean(sourceThread),
      sourceThreadRequired: false,
      targetThreadVisible: deployLanes.length > 0 || Boolean(platformAudit) || Boolean(pluginAudit),
      checkedRouteCount: deployLanes.length + Number(Boolean(platformAudit)) + Number(Boolean(pluginAudit)),
      checkedCwds,
      selectedCwdBasename: path.basename(selected.cwd),
      dryRunOnly: true,
    };
  } catch (err) {
    return skippedCollectorPayload(clean(err?.code || err?.safe?.code || err?.message || "thread_liveness_collect_failed", 160));
  }
}

async function fetchJsonWithKey(url, key, timeoutMs = 5000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "X-Hermes-Web-Key": key },
      signal: controller ? controller.signal : undefined,
    });
    const elapsedMs = Date.now() - startedAt;
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {
      payload = {};
    }
    return { ok: response.ok && payload?.ok !== false, status: response.status, elapsedMs, payload };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function collectPluginManifestHealth(options) {
  const keyState = accessKeyFileState(options, "plugin_manifest");
  if (!keyState.ok) return skippedCollectorPayload(keyState.error);
  const key = keyState.key;
  const base = String(options.base || "").replace(/\/+$/, "");
  if (!base) return skippedCollectorPayload("plugin_manifest_base_missing");
  const fixedPluginIds = [
    "finance",
    "wardrobe",
    "note",
    "email",
    "health",
    "growth",
    "moira",
    "music",
    "movie",
    "codex-mobile",
  ];
  const rows = [];
  let listOk = false;
  try {
    const list = await fetchJsonWithKey(`${base}/api/hermes-plugins?workspaceId=${encodeURIComponent(options.workspaceId || DEFAULT_SELF_LOOP_WORKSPACE)}`, key);
    listOk = list.ok;
  } catch (_) {
    listOk = false;
  }
  for (const pluginId of fixedPluginIds) {
    try {
      const result = await fetchJsonWithKey(
        `${base}/api/hermes-plugins/${encodeURIComponent(pluginId)}/manifest?workspaceId=${encodeURIComponent(options.workspaceId || DEFAULT_SELF_LOOP_WORKSPACE)}`,
        key,
      );
      const manifest = result.payload || {};
      rows.push({
        pluginId,
        ok: result.ok,
        status: result.status,
        elapsedMs: result.elapsedMs,
        available: manifest.available === true,
        versionPresent: Boolean(manifest.version),
        actionCount: Array.isArray(manifest.actions) ? manifest.actions.length : 0,
      });
    } catch (err) {
      rows.push({
        pluginId,
        ok: false,
        status: 0,
        elapsedMs: 0,
        error: clean(err?.name || err?.message || "plugin_manifest_fetch_failed", 120),
      });
    }
  }
  const failedCount = rows.filter((row) => !row.ok).length;
  return {
    ok: failedCount === 0,
    listOk,
    pluginCount: rows.length,
    availableCount: rows.filter((row) => row.available).length,
    failedCount,
    actionCount: rows.reduce((sum, row) => sum + (Number(row.actionCount) || 0), 0),
    maxElapsedMs: rows.reduce((max, row) => Math.max(max, Number(row.elapsedMs) || 0), 0),
    rows,
  };
}

function collectGatewayCapabilityAvailability(options) {
  const root = String(options.root || "").replace(/\/+$/, "");
  const manifest = path.join(root, "data", "gateway-pool-manifest-mac.json");
  try {
    fs.accessSync(manifest, fs.constants.R_OK);
  } catch (err) {
    return sourceSkippedOrFailure(options, "gateway_manifest_unreadable_for_schema_smoke");
  }
  const runtimeSource = path.join(root, "runtime", "hermes-agent-official", "source");
  const runtimeOverrides = path.join(root, "app", "gateway-runtime-overrides");
  const runtimePython = path.join(root, "runtime", "hermes-agent-official", "venv", "bin", "python");
  const result = runNodeJson("scripts/gateway-tool-schema-smoke.js", [
    "--manifest", manifest,
    "--schema-only",
    "--profile-plugin-schema-only",
    "--runtime-source", runtimeSource,
    "--runtime-overrides", runtimeOverrides,
    "--runtime-python", runtimePython,
    "--timeout-ms", "30000",
  ], "gateway_document_tool_capability");
  if (result.ok === false) return result;
  return Object.assign({}, result, {
    workspaceId: options.workspaceId || DEFAULT_SELF_LOOP_WORKSPACE,
    profile: "profile_plugin_schema",
    requiredTools: Array.isArray(result.requiredTools) ? result.requiredTools : [],
    missingTools: [],
    missingToolCount: 0,
  });
}

async function collectProductionPayloads(options) {
  const out = {};
  if (!options.skipSystemResourceStatus) {
    if (options.systemResourceStatusJson) {
      out.systemResourceStatus = parseJsonObject(options.systemResourceStatusJson, "system_resource_status");
    } else {
      out.systemResourceStatus = await collectSystemResourceStatus(options);
    }
  }
  if (!options.skipStatusSmoke) {
    if (options.statusSmokeJson) {
      out.statusSmoke = parseJsonObject(options.statusSmokeJson, "status_smoke");
    } else {
      const keyState = accessKeyFileState(options, "production_status_smoke");
      if (!keyState.ok) {
        out.statusSmoke = sourceSkippedOrFailure(options, keyState.error);
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
  if (!options.skipPublicUpgradeRehearsal) {
    if (options.publicUpgradeRehearsalJson) {
      out.publicUpgradeRehearsal = parseJsonObject(options.publicUpgradeRehearsalJson, "public_upgrade_rehearsal");
    } else {
      out.publicUpgradeRehearsal = runNodeJson("scripts/homeai-public-upgrade-rehearsal.js", ["--execute", "--json"], "public_upgrade_rehearsal");
    }
  } else {
    out.publicUpgradeRehearsal = skippedCollectorPayload("public_upgrade_rehearsal_skipped_by_option");
  }
  if (!options.skipInstallUpgradeCanary) {
    if (options.installUpgradeCanaryJson) {
      out.installUpgradeCanary = parseJsonObject(options.installUpgradeCanaryJson, "install_upgrade_canary");
    } else {
      out.installUpgradeCanary = runNodeJson("scripts/homeai-install-upgrade-canary.js", ["--execute", "--json"], "install_upgrade_canary");
    }
  } else {
    out.installUpgradeCanary = skippedCollectorPayload("install_upgrade_canary_skipped_by_option");
  }
  if (!options.skipRuntimeSloAudit) {
    if (options.runtimeSloAuditJson) {
      out.runtimeSloAudit = parseJsonObject(options.runtimeSloAuditJson, "runtime_slo_audit");
    } else {
      out.runtimeSloAudit = runNodeJson("scripts/homeai-self-improving-loop.js", ["--runtime-slo-audit", "--json"], "runtime_slo_audit");
    }
  }
  if (!options.skipPluginActionMetadataClosure) {
    if (options.pluginActionMetadataClosureJson) {
      out.pluginActionMetadataClosure = parseJsonObject(options.pluginActionMetadataClosureJson, "plugin_action_metadata_closure");
    } else {
      out.pluginActionMetadataClosure = runNodeJson("scripts/plugin-action-metadata-closure-smoke.js", ["--json"], "plugin_action_metadata_closure");
    }
  }
  if (!options.skipMcpSchemaClosure) {
    if (options.mcpSchemaClosureJson) {
      out.mcpSchemaClosure = parseJsonObject(options.mcpSchemaClosureJson, "mcp_schema_closure");
    } else {
      out.mcpSchemaClosure = runNodeJson("scripts/mcp-tool-upgrade-closure-smoke.js", ["--json"], "mcp_schema_closure");
    }
  }
  if (!options.skipThreadLiveness) {
    const threadLiveness = options.threadLivenessJson
      ? parseJsonObject(options.threadLivenessJson, "thread_liveness")
      : await collectThreadLiveness(options);
    out.deployLaneDiscovery = threadLiveness;
    out.taskCardDispatchState = threadLiveness;
    out.auditThreadDiscovery = threadLiveness;
  }
  out.pluginDeployContractClosure = runNodeJson(
    "scripts/deploy-upgrade-lane-closure-smoke.js",
    ["--json"],
    "plugin_deploy_contract_closure",
  );
  if (!options.skipPluginManifestHealth) {
    out.pluginManifestHealth = options.pluginManifestHealthJson
      ? parseJsonObject(options.pluginManifestHealthJson, "plugin_manifest_health")
      : await collectPluginManifestHealth(options);
  }
  if (!options.skipNotificationDelivery) {
    if (options.notificationDeliveryJson) {
      out.notificationDelivery = parseJsonObject(options.notificationDeliveryJson, "notification_delivery");
    } else {
      const keyState = accessKeyFileState(options, "notification_delivery");
      if (!keyState.ok && resolveCollectorContext(options.collectorContext) === "source") {
        out.notificationDelivery = skippedCollectorPayload(keyState.error);
      } else {
      out.notificationDelivery = runNodeJson("scripts/macos-web-push-production-audit.js", [
        "--root", options.root,
        "--base", options.base,
        ...(options.accessKeyFile ? ["--access-key-file", options.accessKeyFile] : []),
        "--json",
      ], "notification_delivery");
      }
    }
  }
  if (!options.skipNativeBridgeCapability) {
    out.nativeBridgeCapability = options.nativeBridgeCapabilityJson
      ? parseJsonObject(options.nativeBridgeCapabilityJson, "native_bridge_capability")
      : skippedCollectorPayload("native_bridge_runtime_not_attached");
  }
  if (options.pluginProxyLatencyJson) {
    out.pluginProxyLatency = parseJsonObject(options.pluginProxyLatencyJson, "plugin_proxy_latency");
  }
  if (options.gatewayCapabilityAvailabilityJson) {
    out.gatewayCapabilityAvailability = parseJsonObject(options.gatewayCapabilityAvailabilityJson, "gateway_capability_availability");
  } else {
    out.gatewayCapabilityAvailability = collectGatewayCapabilityAvailability(options);
  }
  out.pluginProxyWorkspaceBoundary = collectPluginProxyWorkspaceBoundary();
  if (options.uiRuntimeHealthJson) {
    out.uiRuntimeHealth = parseJsonObject(options.uiRuntimeHealthJson, "ui_runtime_health");
  } else {
    out.uiRuntimeHealth = skippedCollectorPayload("ui_runtime_health_live_telemetry_not_attached");
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
  const runtimeSlos = report.slos || report.model?.slos || [];
  if (runtimeSlos.length) {
    lines.push("", "## Runtime SLOs", "");
    for (const slo of runtimeSlos) {
      lines.push(`- ${slo.severity} \`${slo.signalId}\` (${slo.dimension}): ${slo.title}`);
    }
  }
  const runtimeIssues = report.issues || [];
  if (runtimeIssues.length && report.modelVersion) {
    lines.push("", "## Runtime SLO Issues", "");
    for (const issue of runtimeIssues) {
      lines.push(`- ${issue.severity || "H2"} \`${issue.code}\`: ${issue.signalId || issue.dimension || "unknown"}`);
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
  if (options.runtimeSloModel) {
    const model = buildRuntimeSloModel();
    process.stdout.write(options.markdown ? renderMarkdown(model) : `${JSON.stringify(model, null, 2)}\n`);
    if (!model.ok) process.exitCode = 1;
    return;
  }
  if (options.runtimeSloAudit) {
    const audit = auditRuntimeSloModel();
    process.stdout.write(options.markdown ? renderMarkdown(audit) : `${JSON.stringify(audit, null, 2)}\n`);
    if (!audit.ok) process.exitCode = 1;
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
  const collectionPayloads = options.collectProductionObservations ? await collectProductionPayloads(options) : {};
  const productionCollection = options.collectProductionObservations
    ? buildProductionObservations(Object.assign({
      maxActiveGlobal: options.maxActiveGlobal,
      collectorContext: options.collectorContext,
    }, collectionPayloads))
    : { ok: true, schemaVersion: 1, observationCount: 0, observations: [] };
  const qualityProgramEvidence = buildOwner3AQualityEvidence({
    installUpgradeCanary: collectionPayloads.installUpgradeCanary,
    pluginActionMetadataClosure: collectionPayloads.pluginActionMetadataClosure,
    productionCollection,
  });
  const qualityEvidenceOutputWritten = writeQualityEvidenceFile(options.qualityEvidenceOutput, qualityProgramEvidence);
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
      signalReport: productionCollection.signalReport || null,
      reportedSignalCount: productionCollection.signalReport?.reportedSignalCount || 0,
      observedSignalCount: productionCollection.signalReport?.observedSignalCount || 0,
      notCollectedSignalCount: productionCollection.signalReport?.notCollectedSignalCount || 0,
      failedSignalCount: productionCollection.signalReport?.failedSignalCount || 0,
      collectorContext: options.collectorContext,
      signals: productionCollection.observations.map((item) => ({
        signalId: item.signalId,
        status: item.status,
        errorCode: item.errorCode || "",
        diagnosticEligible: item.diagnosticEligible !== false,
        count: Number.isFinite(Number(item.count)) ? Number(item.count) : 0,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      })),
    },
    dispatchResults: [],
    diagnosticSubmitResults: [],
    diagnosticSubmitClosure: buildDiagnosticSubmitClosureReport({
      enabled: false,
      events: [],
      submitResults: [],
    }),
    qualityProgramEvidence,
    qualityEvidenceOutputWritten,
    coverageAudit: coverageAudit || { enabled: false },
  });
  if (coverageAudit) output.ok = output.ok && coverageAudit.ok;
  if (options.submitDiagnostics) {
    output.diagnosticSubmitResults = await submitDiagnosticEvents(report.evaluation.diagnosticEvents, options);
    output.diagnosticSubmitClosure = buildDiagnosticSubmitClosureReport({
      enabled: true,
      events: report.evaluation.diagnosticEvents,
      submitResults: output.diagnosticSubmitResults,
    });
    output.ok = output.ok && output.diagnosticSubmitResults.every((item) => item.ok);
    output.ok = output.ok && output.diagnosticSubmitClosure.ok;
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
  if (
    options.diagnosticIssuesNonfatal
    && output.evaluation?.ok === false
    && (!coverageAudit || coverageAudit.ok)
    && output.auditRequests?.ok !== false
    && output.diagnosticSubmitClosure?.ok !== false
    && output.diagnosticSubmitResults.every((item) => item.ok)
    && output.dispatchResults.every((item) => item.ok)
  ) {
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: clean(err?.message || String(err), 500) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  collectThreadLiveness,
  parseArgs,
  readObservations,
  renderMarkdown,
  resolveCollectorContext,
  threadLivenessCwdCandidates,
};
