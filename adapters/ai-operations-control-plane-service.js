"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HARNESS_RANK = Object.freeze({ H3: 1, H2: 2, H1: 3 });
const DEFAULT_LANE_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_LANES = Object.freeze([
  Object.freeze({ id: "ios-pwa-1", liveDebugPort: 19073, appiumPort: 4723, wdaLocalPort: 8101, mjpegServerPort: 9100 }),
  Object.freeze({ id: "ios-pwa-2", liveDebugPort: 19074, appiumPort: 4724, wdaLocalPort: 8102, mjpegServerPort: 9101 }),
  Object.freeze({ id: "ios-pwa-3", liveDebugPort: 19075, appiumPort: 4725, wdaLocalPort: 8103, mjpegServerPort: 9102 }),
]);

const MODULE_RULES = Object.freeze([
  Object.freeze({
    id: "ai-operations-control-plane",
    title: "AI Operations Control Plane",
    harnessClass: "H1",
    keywords: [/ai operations?/i, /control plane/i, /context pack/i, /evidence ledger/i, /incident cassette/i, /required checks?/i, /lane alloc/i],
    paths: [/ai-ops-control-plane/i, /ai-operations-control-plane/i],
    docs: [
      "docs/MODULES/ai-operations-control-plane.md",
      "docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md",
      "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md",
      "docs/TEST_MATRIX.md",
    ],
    boundaries: ["adapters/ai-operations-control-plane-service.js", "scripts/ai-ops-control-plane.js"],
    checks: [
      "node tests/ai-operations-control-plane-service.test.js",
      "node tests/ai-ops-control-plane-cli.test.js",
      "node tests/architecture-code-test-harness-map.test.js",
      "node tests/architecture-refactor-boundary.test.js",
    ],
  }),
  Object.freeze({
    id: "visual-debug",
    title: "Mobile Visual Debug And PWA Harness",
    harnessClass: "H2",
    visualLane: true,
    keywords: [/visual/i, /pwa/i, /simulator/i, /appium/i, /wda/i, /mjpeg/i, /keyboard/i, /safe[- ]?area/i, /bottom/i],
    paths: [/^public\//, /^scripts\/ios-pwa-/, /plugin-mobile-ui-visual-contract/, /macos-ios-simulator-appium/],
    docs: [
      "docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md",
      "docs/RUNBOOKS/macos-ios-simulator-appium.md",
      "docs/TEST_MATRIX.md",
    ],
    boundaries: ["scripts/ios-pwa-live-debug-server.js", "scripts/ios-pwa-visual-harness.js", "public/app-*.js"],
    checks: [
      "node tests/ios-pwa-live-debug-server.test.js",
      "node tests/ios-pwa-visual-harness.test.js",
    ],
  }),
  Object.freeze({
    id: "static-client",
    title: "Static PWA Client And Cache",
    harnessClass: "H2",
    keywords: [/static client/i, /service worker/i, /client version/i, /cache/i],
    paths: [/^public\/index\.html$/, /^public\/service-worker\.js$/, /^public\/directory-viewer\.html$/, /^public\/app-/, /^public\/styles\.css$/],
    docs: [
      "docs/MODULES/static-client.md",
      "docs/RUNBOOKS/static-client-cache-version.md",
      "docs/FRONTEND_STATE_MAP.md",
      "docs/TEST_MATRIX.md",
    ],
    boundaries: ["public/index.html", "public/service-worker.js", "public/directory-viewer.html", "public/app-*.js", "public/styles.css"],
    checks: [
      "node tests/task-list-ui.test.js",
      "node tests/static-cache-version-harness.test.js",
    ],
  }),
  Object.freeze({
    id: "plugin-platform",
    title: "Plugin Platform, Topics, Provisioning, And MCP",
    harnessClass: "H1",
    keywords: [/mcp/i, /workspace grant/i, /plugin grant/i, /provision/i, /toolset/i, /schema/i, /plugin authorization/i],
    paths: [/^server-routes\/hermes-plugin/, /^server-routes\/plugin-topic/, /^adapters\/.*plugin/i, /^scripts\/plugin-workspace/],
    docs: [
      "docs/MODULES/plugins.md",
      "docs/MODULES/plugin-topics.md",
      "docs/IMPLEMENTATION_NOTES/plugin-capability-activation.md",
      "docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md",
      "docs/RUNBOOKS/mcp-tool-upgrade-closure.md",
    ],
    boundaries: ["adapters/hermes-plugin-service.js", "adapters/plugin-*-service.js", "server-routes/hermes-plugin-api-routes.js"],
    checks: [
      "node tests/hermes-plugin-service.test.js",
      "node tests/hermes-plugin-authorization-service.test.js",
      "node tests/plugin-capability-activation-service.test.js",
      "node tests/plugin-workspace-platform-contract-check.test.js",
    ],
  }),
  Object.freeze({
    id: "gateway-runtime",
    title: "Gateway Runtime, Run Lifecycle, And Runtime Config",
    harnessClass: "H1",
    keywords: [/gateway/i, /worker/i, /profile/i, /run lifecycle/i, /runtime config/i, /skill/i],
    paths: [/gateway/i, /runtime-config/i, /^scripts\/macos-gateway/, /^scripts\/build-gateway/],
    docs: [
      "docs/MODULES/gateway-pool.md",
      "docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md",
      "docs/IMPLEMENTATION_NOTES/runtime-architecture-optimization-priorities.md",
      "docs/TEST_MATRIX.md",
    ],
    boundaries: ["adapters/gateway-*.js", "adapters/runtime-config-*.js", "scripts/*gateway*.js"],
    checks: [
      "node tests/gateway-run-lifecycle-service.test.js",
      "node tests/gateway-run-start-service.test.js",
      "node tests/gateway-run-stream-service.test.js",
      "node tests/runtime-config-provider.test.js",
    ],
  }),
  Object.freeze({
    id: "deployment",
    title: "Mac Production Deployment And Closure",
    harnessClass: "H1",
    deployment: true,
    keywords: [/deploy/i, /production/i, /launchd/i, /sudo/i, /backup/i, /smoke/i],
    paths: [/deploy/i, /production/i, /^scripts\/macos-production/, /^docs\/RUNBOOKS\/macos-production/, /^docs\/PLATFORM_CONTRACTS\/macos-dev-to-production/],
    docs: [
      "docs/MODULES/deployment.md",
      "docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md",
      "docs/RUNBOOKS/macos-production-closure-validation.md",
      "docs/RUNBOOKS/macos-production-access.md",
    ],
    boundaries: ["scripts/deploy-macos-production.js", "scripts/production-status-smoke.js", "scripts/macos-production-closure-validation.js"],
    checks: [
      "node --check scripts/deploy-macos-production.js",
      "node tests/macos-production-deploy-script.test.js",
      "node tests/production-status-smoke-harness.test.js",
    ],
  }),
  Object.freeze({
    id: "architecture-docs",
    title: "Architecture Documentation And Harness Map",
    harnessClass: "H3",
    keywords: [/architecture/i, /docs/i, /contract/i, /matrix/i],
    paths: [/^docs\//, /^tests\/architecture-code-test-harness-map\.test\.js$/],
    docs: [
      "docs/DOCS_INDEX.md",
      "docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md",
      "docs/IMPLEMENTATION_NOTES/harness-required-matrix.md",
      "docs/TEST_MATRIX.md",
    ],
    boundaries: ["docs/**/*.md", "tests/architecture-code-test-harness-map.test.js"],
    checks: [
      "node tests/architecture-code-test-harness-map.test.js",
    ],
  }),
]);

const SENSITIVE_KEY_RE = /password|passwd|secret|token|cookie|authorization|access[_ -]?key|workspace[_ -]?key|launch[_ -]?key|oauth|bearer/i;
const SECRET_VALUE_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}|(sk-[A-Za-z0-9_-]{12,})|((?:token|key|password)\s*[:= ]\s*)[A-Za-z0-9._~+/=-]{12,}/gi;

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeChangedFiles(changedFiles) {
  return unique((changedFiles || []).map((file) => String(file || "").trim().replace(/\\/g, "/")).filter(Boolean));
}

function maxHarnessClass(classes) {
  return (classes || []).reduce((best, item) => {
    const current = String(item || "H3").toUpperCase();
    return HARNESS_RANK[current] > HARNESS_RANK[best] ? current : best;
  }, "H3");
}

function matchesRule(rule, taskText, changedFiles) {
  const text = String(taskText || "");
  if ((rule.keywords || []).some((pattern) => pattern.test(text))) return true;
  return changedFiles.some((file) => (rule.paths || []).some((pattern) => pattern.test(file)));
}

function inferRules(input = {}) {
  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const taskText = String(input.taskText || input.task || "");
  const matched = MODULE_RULES.filter((rule) => matchesRule(rule, taskText, changedFiles));
  if (matched.length) return matched;
  if (changedFiles.length && changedFiles.every((file) => /^docs\//.test(file))) {
    return MODULE_RULES.filter((rule) => rule.id === "architecture-docs");
  }
  return [MODULE_RULES.find((rule) => rule.id === "architecture-docs")];
}

function checkItem(command, reason, options = {}) {
  return {
    command,
    reason,
    kind: options.kind || "test",
    required: options.required !== false,
  };
}

function selectRequiredChecks(input = {}) {
  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const taskText = String(input.taskText || input.task || "");
  const rules = inferRules({ taskText, changedFiles });
  const checks = [];
  const docs = [];
  const modules = [];
  const boundaries = [];
  let visualLaneRequired = false;
  let deploymentRequired = false;

  for (const rule of rules) {
    modules.push(rule.title);
    docs.push(...(rule.docs || []));
    boundaries.push(...(rule.boundaries || []));
    checks.push(...(rule.checks || []).map((command) => checkItem(command, rule.id)));
    visualLaneRequired = visualLaneRequired || Boolean(rule.visualLane);
    deploymentRequired = deploymentRequired || Boolean(rule.deployment);
  }

  for (const file of changedFiles.filter((item) => item.endsWith(".js"))) {
    checks.push(checkItem(`node --check ${file}`, `syntax:${file}`, { kind: "syntax" }));
  }
  if (changedFiles.some((file) => /^public\//.test(file))) {
    checks.push(checkItem("node tests/static-cache-version-harness.test.js", "static-client-cache", { kind: "test" }));
    checks.push(checkItem("node scripts/ai-ops-control-plane.js evidence append --kind visual --status info --summary \"record visual artifact\" --json", "visual-evidence-ledger", { kind: "evidence", required: false }));
  }
  if (visualLaneRequired) {
    checks.push(checkItem("node scripts/ai-ops-control-plane.js lane allocate --plugin-id <plugin-id> --requester <thread-id> --json", "visual-lane-allocation", { kind: "lane" }));
  }
  if (deploymentRequired || /deploy|production/i.test(taskText)) {
    deploymentRequired = true;
    checks.push(checkItem("npm run --silent deploy:macos -- --target home-ai --json", "deployment-plan", { kind: "deploy-plan" }));
  }
  checks.push(checkItem("git diff --check", "diff-hygiene", { kind: "hygiene" }));

  return {
    ok: true,
    harnessClass: maxHarnessClass(rules.map((rule) => rule.harnessClass)),
    modules: unique(modules),
    requiredDocs: unique(docs),
    allowedBoundaries: unique(boundaries),
    requiredChecks: uniqueChecks(checks),
    visualLaneRequired,
    deploymentRequired,
    changedFiles,
  };
}

function uniqueChecks(checks) {
  const seen = new Set();
  const out = [];
  for (const check of checks) {
    if (!check?.command || seen.has(check.command)) continue;
    seen.add(check.command);
    out.push(check);
  }
  return out;
}

function buildTaskContextPack(input = {}) {
  const taskText = String(input.taskText || input.task || "").trim();
  const plan = selectRequiredChecks(input);
  const blockedIf = [
    "required_docs_not_read",
    "focused_checks_not_run",
    "dirty_worktree_not_classified",
  ];
  if (plan.visualLaneRequired) blockedIf.push("visual_lane_not_allocated");
  if (plan.deploymentRequired) blockedIf.push("production_deploy_not_verified");
  return {
    ok: true,
    task: taskText,
    harnessClass: plan.harnessClass,
    modules: plan.modules,
    requiredDocs: plan.requiredDocs,
    allowedBoundaries: plan.allowedBoundaries,
    requiredChecks: plan.requiredChecks,
    visualLane: {
      required: plan.visualLaneRequired,
      allocatorCommand: plan.visualLaneRequired
        ? "node scripts/ai-ops-control-plane.js lane allocate --plugin-id <plugin-id> --requester <thread-id> --json"
        : "",
    },
    deployment: {
      required: plan.deploymentRequired,
      planCommand: plan.deploymentRequired
        ? "npm run --silent deploy:macos -- --target home-ai --json"
        : "",
    },
    blockedIf,
    evidence: {
      ledgerCommand: "node scripts/ai-ops-control-plane.js evidence append --kind test --status passed --summary <summary> --json",
      incidentCommand: "node scripts/ai-ops-control-plane.js incident create --symptom <symptom> --json",
    },
  };
}

function nowIso(inputNow) {
  if (inputNow instanceof Date) return inputNow.toISOString();
  if (inputNow) return new Date(inputNow).toISOString();
  return new Date().toISOString();
}

function epochMs(inputNow) {
  if (inputNow instanceof Date) return inputNow.getTime();
  if (inputNow) return new Date(inputNow).getTime();
  return Date.now();
}

function ensureDirFor(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  ensureDirFor(file);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function laneCommands(lane) {
  return {
    health: [
      `curl -fsS http://127.0.0.1:${lane.appiumPort}/status`,
      `curl -fsS http://127.0.0.1:${lane.wdaLocalPort}/status`,
      `lsof -nP -iTCP:${lane.liveDebugPort} -sTCP:LISTEN`,
    ],
    startAppium: `APPIUM_PORT=${lane.appiumPort} bash "$HOME/.homeai-qa/scripts/macos-ios-appium-start.sh"`,
    startLiveDebug: [
      "cd /Users/hermes-dev/HermesMobileDev/app",
      `npm run ios:pwa:debug -- --port ${lane.liveDebugPort} --appium-url http://127.0.0.1:${lane.appiumPort} --wda-local-port ${lane.wdaLocalPort} --mjpeg-server-port ${lane.mjpegServerPort}`,
    ].join(" && "),
    debugUrl: `http://127.0.0.1:${lane.liveDebugPort}/`,
  };
}

function normalizeLaneState(state) {
  const lanes = {};
  for (const lane of DEFAULT_LANES) {
    lanes[lane.id] = { ...lane, lease: null };
  }
  for (const [id, value] of Object.entries(state?.lanes || {})) {
    lanes[id] = { ...(lanes[id] || {}), ...value, id, lease: value.lease || null };
  }
  return { schemaVersion: 1, lanes };
}

function cleanExpiredLeases(state, nowMs) {
  for (const lane of Object.values(state.lanes || {})) {
    const expiresAtMs = Date.parse(lane.lease?.expiresAt || "");
    if (lane.lease && Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      lane.lease = null;
    }
  }
  return state;
}

function allocateVisualLane(input = {}) {
  const stateFile = input.stateFile || path.join(process.env.HOME || ".", ".homeai-qa", "ai-ops-lanes.json");
  const nowMs = epochMs(input.now);
  const ttlMs = Number.isFinite(Number(input.ttlMs)) ? Number(input.ttlMs) : DEFAULT_LANE_TTL_MS;
  const state = cleanExpiredLeases(normalizeLaneState(readJsonFile(stateFile, {})), nowMs);
  const preferredLaneId = String(input.laneId || input.preferredLaneId || "").trim();
  const candidates = Object.values(state.lanes).filter((lane) => !preferredLaneId || lane.id === preferredLaneId);
  const lane = candidates.find((item) => !item.lease) || null;
  if (!lane) {
    return {
      ok: false,
      error: "lane_unavailable",
      stateFile,
      activeLeases: Object.values(state.lanes).filter((item) => item.lease).map(publicLane),
    };
  }
  const leaseId = input.leaseId || `lane-${crypto.randomUUID()}`;
  lane.udid = input.udid || lane.udid || "";
  lane.lease = {
    id: leaseId,
    pluginId: String(input.pluginId || "unknown"),
    requester: String(input.requester || "unknown"),
    createdAt: nowIso(input.now),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
  writeJsonFile(stateFile, state);
  return { ok: true, stateFile, lane: publicLane(lane) };
}

function releaseVisualLane(input = {}) {
  const stateFile = input.stateFile || path.join(process.env.HOME || ".", ".homeai-qa", "ai-ops-lanes.json");
  const state = normalizeLaneState(readJsonFile(stateFile, {}));
  const leaseId = String(input.leaseId || "").trim();
  const laneId = String(input.laneId || "").trim();
  for (const lane of Object.values(state.lanes)) {
    if ((leaseId && lane.lease?.id === leaseId) || (laneId && lane.id === laneId)) {
      const released = publicLane(lane);
      lane.lease = null;
      writeJsonFile(stateFile, state);
      return { ok: true, stateFile, released };
    }
  }
  return { ok: false, error: "lane_lease_not_found", stateFile, leaseId, laneId };
}

function listVisualLanes(input = {}) {
  const stateFile = input.stateFile || path.join(process.env.HOME || ".", ".homeai-qa", "ai-ops-lanes.json");
  const nowMs = epochMs(input.now);
  const state = cleanExpiredLeases(normalizeLaneState(readJsonFile(stateFile, {})), nowMs);
  if (input.writeCleaned) writeJsonFile(stateFile, state);
  return { ok: true, stateFile, lanes: Object.values(state.lanes).map(publicLane) };
}

function publicLane(lane) {
  const base = {
    id: lane.id,
    udid: lane.udid || "",
    liveDebugPort: Number(lane.liveDebugPort),
    appiumPort: Number(lane.appiumPort),
    wdaLocalPort: Number(lane.wdaLocalPort),
    mjpegServerPort: Number(lane.mjpegServerPort),
    debugUrl: `http://127.0.0.1:${lane.liveDebugPort}/`,
    lease: lane.lease || null,
  };
  return { ...base, commands: laneCommands(base) };
}

function redactSensitiveValue(value, key = "") {
  if (value == null) return value;
  if (SENSITIVE_KEY_RE.test(String(key || ""))) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitiveValue(item));
  if (typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      out[childKey] = redactSensitiveValue(childValue, childKey);
    }
    return out;
  }
  if (typeof value === "string") {
    const bounded = value.length > 800 ? `${value.slice(0, 800)}...[truncated]` : value;
    return bounded.replace(SECRET_VALUE_RE, (match, bearer) => bearer ? `${bearer}[REDACTED]` : "[REDACTED]");
  }
  return value;
}

function appendEvidenceRecord(input = {}) {
  const ledgerPath = input.ledgerPath || path.join(process.env.HOME || ".", ".homeai-qa", "evidence-ledger.jsonl");
  const timestamp = nowIso(input.now);
  const record = {
    id: input.id || `evidence-${crypto.randomUUID()}`,
    timestamp,
    kind: String(input.kind || "info"),
    status: String(input.status || "info"),
    summary: redactSensitiveValue(String(input.summary || "")),
    command: redactSensitiveValue(String(input.command || "")),
    commit: String(input.commit || ""),
    artifactPaths: unique(input.artifactPaths || []).map((item) => String(item).slice(0, 500)),
    metadata: redactSensitiveValue(input.metadata || {}),
  };
  ensureDirFor(ledgerPath);
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
  return { ok: true, ledgerPath, record };
}

function listEvidenceRecords(input = {}) {
  const ledgerPath = input.ledgerPath || path.join(process.env.HOME || ".", ".homeai-qa", "evidence-ledger.jsonl");
  if (!fs.existsSync(ledgerPath)) return { ok: true, ledgerPath, records: [] };
  const records = fs.readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { id: "", parseError: String(err?.message || err).slice(0, 120) };
      }
    });
  return { ok: true, ledgerPath, records };
}

function verifyEvidenceLedger(input = {}) {
  const listed = listEvidenceRecords(input);
  const records = listed.records || [];
  const requiredKinds = unique(input.requiredKinds || []);
  const requiredStatuses = unique(input.requiredStatuses || []);
  const commitPrefix = String(input.commitPrefix || "");
  const missingKinds = requiredKinds.filter((kind) => !records.some((record) => record.kind === kind));
  const missingStatuses = requiredStatuses.filter((status) => !records.some((record) => record.status === status));
  const commitMatched = commitPrefix
    ? records.some((record) => String(record.commit || "").startsWith(commitPrefix))
    : true;
  const issues = [];
  if (missingKinds.length) issues.push(`evidence_kind_missing:${missingKinds.join(",")}`);
  if (missingStatuses.length) issues.push(`evidence_status_missing:${missingStatuses.join(",")}`);
  if (!commitMatched) issues.push(`evidence_commit_missing:${commitPrefix}`);
  return { ok: issues.length === 0, ledgerPath: listed.ledgerPath, recordCount: records.length, issues };
}

function sanitizeSlug(value) {
  return String(value || "incident").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "incident";
}

function createIncidentCassette(input = {}) {
  const dir = input.dir || path.join(process.env.HOME || ".", ".homeai-qa", "incidents");
  const timestamp = nowIso(input.now).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const slug = sanitizeSlug(input.issueCode || input.symptom || "incident");
  const id = `incident-${timestamp}-${slug}`;
  const cassette = {
    schemaVersion: 1,
    id,
    timestamp: nowIso(input.now),
    symptom: redactSensitiveValue(String(input.symptom || "")),
    issueCode: String(input.issueCode || "unclassified"),
    workspaceId: String(input.workspaceId || ""),
    pluginId: String(input.pluginId || ""),
    route: String(input.route || ""),
    surface: String(input.surface || ""),
    clientVersion: String(input.clientVersion || ""),
    gateway: redactSensitiveValue(input.gateway || {}),
    reproductionSteps: (input.reproductionSteps || []).map((step) => redactSensitiveValue(String(step))).slice(0, 20),
    expectedChecks: unique(input.expectedChecks || []),
    artifactPaths: unique(input.artifactPaths || []).map((item) => String(item).slice(0, 500)),
    metadata: redactSensitiveValue(input.metadata || {}),
    privacy: {
      rawLogsIncluded: false,
      rawSecretsIncluded: false,
      privateContentIncluded: false,
    },
  };
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  writeJsonFile(file, cassette);
  return { ok: true, id, file, cassette };
}

function listIncidentCassettes(input = {}) {
  const dir = input.dir || path.join(process.env.HOME || ".", ".homeai-qa", "incidents");
  if (!fs.existsSync(dir)) return { ok: true, dir, incidents: [] };
  const incidents = fs.readdirSync(dir)
    .filter((name) => /^incident-.*\.json$/.test(name))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      const data = readJsonFile(file, {});
      return { id: data.id || name.replace(/\.json$/, ""), file, issueCode: data.issueCode || "", pluginId: data.pluginId || "", workspaceId: data.workspaceId || "" };
    });
  return { ok: true, dir, incidents };
}

module.exports = {
  DEFAULT_LANES,
  MODULE_RULES,
  allocateVisualLane,
  appendEvidenceRecord,
  buildTaskContextPack,
  createIncidentCassette,
  listEvidenceRecords,
  listIncidentCassettes,
  listVisualLanes,
  redactSensitiveValue,
  releaseVisualLane,
  selectRequiredChecks,
  verifyEvidenceLedger,
};
