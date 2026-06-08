"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CONTRACT_VERSION = "20260606-v1";

const REQUIRED_CENTRAL_DOCS = [
  "plugin-workspace-platform-contract.md",
  "plugin-mobile-ui-visual-contract.md",
  "macos-production-access.md",
  "mcp-tool-upgrade-closure.md",
  "macos-ios-simulator-appium.md",
  "reference-memory-graph-v1.md",
  "reference-memory-graph-harness-plan.md",
];

const REQUIRED_POINTER_TEXT = [
  `Home AI platform contract version: \`${CONTRACT_VERSION}\``,
  "`plugin_id`",
  "`workspace_path_windows`",
  "`production_source_path_macos`",
  "`production_data_root_macos`",
  "`windows_dev_base_url`",
  "`macos_production_base_url`",
  "`launchd_label`",
  "`manifest_url`",
  "`mcp_command`",
  "`mcp_schema_endpoint`",
  "`deploy_command`",
  "`reference_contract_status`",
  "`mobile_visual_harness_status`",
  "`ios_live_debug_available`",
  "Do not record raw",
];

const RUNTIME_URL_FIELDS = [
  "windows_dev_base_url",
  "macos_production_base_url",
  "manifest_url",
];

const FORBIDDEN_PLUGIN_RUNTIME_DOMAINS = [
  /hermes-xuxin\.synology\.me/i,
  /wardrobe-xuxin\.synology\.me/i,
  /tail62e8ce\.ts\.net/i,
];

const PLUGINS = [
  {
    id: "finance",
    title: "Finance",
    dirName: "\u8d22\u52a1",
    port: 8791,
    macSourcePaths: ["/Users/hermes-host/HermesMobile/plugins/finance"],
    launchdLabel: "com.hermesmobile.plugin.finance",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    optionalHttpProbes: [
      { name: "client_version", path: "/api/finance/client-version", requireText: ["ok"] },
      {
        name: "mcp_schema",
        path: "/api/finance/mcp/schemas",
        requireText: ["finance.create_transaction"],
        authMayBeRequired: true,
      },
    ],
  },
  {
    id: "wardrobe",
    title: "Wardrobe",
    dirName: "\u7537\u88c5\u8863\u6a71",
    port: 8765,
    macSourcePaths: ["/Users/hermes-host/HermesMobile/plugins/wardrobe"],
    launchdLabel: "com.hermesmobile.plugin.wardrobe",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    optionalHttpProbes: [],
  },
  {
    id: "note",
    title: "Note",
    dirName: "Note",
    port: 4181,
    macSourcePaths: ["/Users/hermes-host/HermesMobile/plugins/note"],
    launchdLabel: "com.hermesmobile.plugin.note",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    optionalHttpProbes: [],
  },
  {
    id: "email",
    title: "Email",
    dirName: "email",
    port: 5175,
    macSourcePaths: ["/Users/hermes-host/HermesMobile/plugins/email"],
    launchdLabel: "com.hermesmobile.plugin.email",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    optionalHttpProbes: [],
  },
  {
    id: "health",
    title: "Health",
    dirName: "healthy",
    port: 4877,
    macSourcePaths: ["/Users/hermes-host/HermesMobile/plugins/healthy"],
    launchdLabel: "com.hermesmobile.plugin.health",
    manifestPath: "/api/v1/hermes/plugin/manifest",
    optionalHttpProbes: [],
  },
];

function parseArgs(argv) {
  const out = {
    repoRoot: path.resolve(__dirname, ".."),
    workspaceRoot: "",
    plugins: [],
    probeMac: false,
    requireMacOk: false,
    sshAlias: "homeai-mac",
    timeoutMs: 10_000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") out.repoRoot = path.resolve(argv[++index] || out.repoRoot);
    else if (arg === "--workspace-root") out.workspaceRoot = path.resolve(argv[++index] || "");
    else if (arg === "--plugin") out.plugins.push(...splitCsv(argv[++index] || ""));
    else if (arg === "--probe-mac") out.probeMac = true;
    else if (arg === "--require-mac-ok") out.requireMacOk = true;
    else if (arg === "--ssh-alias") out.sshAlias = argv[++index] || out.sshAlias;
    else if (arg === "--timeout-ms") out.timeoutMs = readPositiveInt(argv[++index], out.timeoutMs);
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.workspaceRoot) out.workspaceRoot = path.resolve(out.repoRoot, "..");
  return out;
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function printHelp() {
  console.log([
    "Usage: node scripts/plugin-workspace-platform-contract-check.js [options]",
    "",
    "Options:",
    "  --plugin <ids>         Comma-separated plugin ids. Defaults to all standard inserted plugins.",
    "  --workspace-root <dir> Parent directory containing plugin workspaces.",
    "  --repo-root <dir>      Home AI repository root.",
    "  --probe-mac            Run read-only Mac source/launchd/HTTP probes through SSH.",
    "  --require-mac-ok       Fail when a read-only Mac probe fails.",
    "  --ssh-alias <alias>    SSH alias for Mac production. Default: homeai-mac.",
    "  --json                 Print bounded JSON.",
  ].join("\n"));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function includesAll(text, needles) {
  return needles.filter((needle) => !String(text || "").includes(needle));
}

function forbiddenSecretMatches(text) {
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{20,}/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    /\bpassword\s*[:=]\s*[^\s`'"]{8,}/i,
    /\b(access[_ -]?key|workspace[_ -]?key|token|cookie)\s*[:=]\s*[A-Za-z0-9._~+/=-]{20,}/i,
  ];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
}

function pointerFieldValue(text, field) {
  const escapedField = String(field || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^\\|\\s*`" + escapedField + "`\\s*\\|\\s*`([^`]+)`\\s*\\|", "m");
  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : "";
}

function checkPointerRuntimeUrls(plugin, text) {
  const issues = [];
  const expected = {
    windows_dev_base_url: `http://127.0.0.1:${plugin.port}`,
    macos_production_base_url: `http://127.0.0.1:${plugin.port}`,
    manifest_url: `http://127.0.0.1:${plugin.port}${plugin.manifestPath}`,
  };
  for (const field of RUNTIME_URL_FIELDS) {
    const value = pointerFieldValue(text, field);
    if (!value) continue;
    if (value !== expected[field]) issues.push(`runtime_url_not_loopback:${field}`);
  }
  for (const pattern of FORBIDDEN_PLUGIN_RUNTIME_DOMAINS) {
    if (pattern.test(text)) issues.push(`pointer_forbidden_runtime_domain:${pattern.source}`);
  }
  return issues;
}

function selectedPlugins(options) {
  const ids = options.plugins.length ? new Set(options.plugins) : null;
  const selected = PLUGINS.filter((plugin) => !ids || ids.has(plugin.id));
  if (ids) {
    const known = new Set(PLUGINS.map((plugin) => plugin.id));
    const unknown = [...ids].filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Unknown plugin id(s): ${unknown.join(", ")}`);
  }
  return selected;
}

function checkPointer(plugin, options) {
  const workspacePath = resolvePluginWorkspacePath(plugin, options);
  const pointerPath = path.join(workspacePath, "docs", "HOME_AI_PLATFORM_CONTRACT.md");
  const handoffPath = path.join(workspacePath, ".agent-context", "HANDOFF.md");
  const result = {
    plugin: plugin.id,
    workspacePath,
    pointerPath,
    pointerExists: exists(pointerPath),
    handoffPointer: false,
    issues: [],
    warnings: [],
  };
  if (!result.pointerExists) {
    result.issues.push("pointer_missing");
    return result;
  }
  const text = readText(pointerPath);
  for (const missing of includesAll(text, REQUIRED_POINTER_TEXT)) {
    result.issues.push(`pointer_missing_text:${missing}`);
  }
  for (const missing of includesAll(text, REQUIRED_CENTRAL_DOCS)) {
    result.issues.push(`pointer_missing_central_doc:${missing}`);
  }
  if (!text.includes(`| \`plugin_id\` | \`${plugin.id}\` |`)) {
    result.issues.push(`plugin_id_mismatch:${plugin.id}`);
  }
  if (!text.includes(plugin.launchdLabel)) {
    result.issues.push(`launchd_label_missing:${plugin.launchdLabel}`);
  }
  if (!text.includes(`http://127.0.0.1:${plugin.port}`)) {
    result.issues.push(`macos_loopback_missing:${plugin.port}`);
  }
  if (!plugin.macSourcePaths.some((sourcePath) => text.includes(sourcePath))) {
    result.issues.push(`mac_source_path_missing:${plugin.macSourcePaths.join("|")}`);
  }
  for (const match of forbiddenSecretMatches(text)) {
    result.issues.push(`pointer_secret_pattern:${match}`);
  }
  result.issues.push(...checkPointerRuntimeUrls(plugin, text));
  if (exists(handoffPath)) {
    const handoff = readText(handoffPath);
    result.handoffPointer = handoff.includes("Home AI Platform Contract Pointer") && handoff.includes(CONTRACT_VERSION);
  }
  if (!result.handoffPointer) result.warnings.push("handoff_pointer_missing");
  return result;
}

function macDevDirName(plugin) {
  if (plugin.id === "health") return "healthy";
  return plugin.id;
}

function resolvePluginWorkspacePath(plugin, options) {
  const candidates = [
    path.join(options.workspaceRoot, plugin.dirName),
    path.join(options.workspaceRoot, "plugins", macDevDirName(plugin)),
    path.join(options.workspaceRoot, macDevDirName(plugin)),
  ];
  return candidates.find((candidate) => exists(candidate)) || candidates[0];
}

function checkCentralDocs(options, plugins) {
  const statusPath = path.join(options.repoRoot, "docs", "IMPLEMENTATION_NOTES", "plugin-workspace-contract-rollout-status.md");
  const platformContractPath = path.join(options.repoRoot, "docs", "PLATFORM_CONTRACTS", "plugin-workspace-platform-contract.md");
  const testMatrixPath = path.join(options.repoRoot, "docs", "TEST_MATRIX.md");
  const docsIndexPath = path.join(options.repoRoot, "docs", "DOCS_INDEX.md");
  const files = [statusPath, platformContractPath, testMatrixPath, docsIndexPath];
  const result = { issues: [], warnings: [], files };
  for (const file of files) {
    if (!exists(file)) {
      result.issues.push(`central_doc_missing:${path.relative(options.repoRoot, file)}`);
    }
  }
  if (result.issues.length) return result;
  const statusText = readText(statusPath);
  const platformText = readText(platformContractPath);
  const matrixText = readText(testMatrixPath);
  const indexText = readText(docsIndexPath);
  for (const plugin of plugins) {
    if (!statusText.includes(plugin.title) || !statusText.includes("docs/HOME_AI_PLATFORM_CONTRACT.md")) {
      result.issues.push(`status_missing_plugin:${plugin.id}`);
    }
  }
  if (!/Codex Mobile Web[\s\S]{0,120}special insertion/.test(statusText)) {
    result.issues.push("codex_exclusion_missing");
  }
  for (const text of [statusText, platformText, matrixText, indexText]) {
    for (const match of forbiddenSecretMatches(text)) {
      result.issues.push(`central_secret_pattern:${match}`);
    }
  }
  for (const required of [
    "plugin-workspace-platform-contract.md",
    "plugin-mobile-ui-visual-contract.md",
    "plugin-workspace-platform-contract-check.js",
    "plugin-workspace-platform-contract-check.test.js",
  ]) {
    const joined = `${statusText}\n${platformText}\n${matrixText}\n${indexText}`;
    if (!joined.includes(required)) result.warnings.push(`checker_doc_reference_missing:${required}`);
  }
  return result;
}

function sshRun(alias, args, timeoutMs) {
  const result = spawnSync("ssh", [alias, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status,
    ok: result.status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function macPathProbe(plugin, options) {
  const attempts = plugin.macSourcePaths.map((sourcePath) => {
    const result = sshRun(options.sshAlias, ["/bin/test", "-d", sourcePath], options.timeoutMs);
    return { path: sourcePath, exists: result.ok };
  });
  return {
    ok: attempts.some((attempt) => attempt.exists),
    attempts,
  };
}

function macLaunchdProbe(plugin, options) {
  const result = sshRun(options.sshAlias, ["/bin/launchctl", "print", `system/${plugin.launchdLabel}`], options.timeoutMs);
  return {
    ok: result.ok,
    label: plugin.launchdLabel,
    checked: true,
  };
}

function macHttpProbe(plugin, options, probe) {
  const url = `http://127.0.0.1:${plugin.port}${probe.path}`;
  const marker = "HOMEAI_HTTP_STATUS:";
  const result = sshRun(options.sshAlias, ["/usr/bin/curl", "-sS", "--max-time", "5", "-w", `${marker}%{http_code}`, url], options.timeoutMs);
  const output = result.stdout || "";
  const markerIndex = output.lastIndexOf(marker);
  const body = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
  const httpStatus = markerIndex >= 0 ? Number(output.slice(markerIndex + marker.length).trim()) : 0;
  const authRequired = Boolean(probe.authMayBeRequired && (
    httpStatus === 401 ||
    httpStatus === 403 ||
    (httpStatus === 400 && /workspace|key|auth|credential/i.test(body))
  ));
  const httpOk = result.ok && httpStatus >= 200 && httpStatus < 300;
  const missing = httpOk ? includesAll(body, probe.requireText || []) : [];
  return {
    name: probe.name,
    ok: authRequired || (httpOk && missing.length === 0),
    status: result.status,
    httpStatus,
    authRequired,
    url: `http://127.0.0.1:${plugin.port}${probe.path}`,
    bodyLength: body.length,
    missingText: missing,
  };
}

function macProbe(plugin, options) {
  const manifestProbe = {
    name: "manifest",
    path: plugin.manifestPath,
    requireText: [plugin.id],
  };
  const probes = [manifestProbe, ...plugin.optionalHttpProbes].map((probe) => macHttpProbe(plugin, options, probe));
  const pathResult = macPathProbe(plugin, options);
  const launchdResult = macLaunchdProbe(plugin, options);
  return {
    plugin: plugin.id,
    ok: pathResult.ok && launchdResult.ok && probes.every((probe) => probe.ok),
    sourcePath: pathResult,
    launchd: launchdResult,
    http: probes,
  };
}

function buildReport(options) {
  const plugins = selectedPlugins(options);
  const pointerChecks = plugins.map((plugin) => checkPointer(plugin, options));
  const central = checkCentralDocs(options, plugins);
  const mac = options.probeMac ? plugins.map((plugin) => macProbe(plugin, options)) : [];
  const issues = [
    ...central.issues.map((issue) => `central:${issue}`),
    ...pointerChecks.flatMap((check) => check.issues.map((issue) => `${check.plugin}:${issue}`)),
  ];
  if (options.requireMacOk) {
    issues.push(...mac.filter((item) => !item.ok).map((item) => `${item.plugin}:mac_probe_failed`));
  }
  return {
    ok: issues.length === 0,
    contractVersion: CONTRACT_VERSION,
    checkedPlugins: plugins.map((plugin) => plugin.id),
    excludedPlugins: ["codex-mobile"],
    central,
    plugins: pointerChecks,
    mac,
    issues,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`plugin workspace platform contract ok=${report.ok}`);
    console.log(`checked=${report.checkedPlugins.join(",")}`);
    if (report.issues.length) console.log(`issues=${report.issues.join(",")}`);
    if (report.mac.length) {
      for (const item of report.mac) {
        console.log(`mac ${item.plugin} ok=${item.ok}`);
      }
    }
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  CONTRACT_VERSION,
  PLUGINS,
  buildReport,
  parseArgs,
};
