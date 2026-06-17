"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = "/Users/example/path";
const DEFAULT_BASE = "http://127.0.0.1:8797";
const AUTH_PROCESS_PATTERN = "[a]uth add xai-oauth|[m]acos-grok-xai-reauth";
const macPath = path.posix;
const MAC_BASE_SCHEMA_TOOLS = [
  "http_request",
  "weather",
  "mobile_web_search",
  "mobile_web_extract",
  "image_generate",
  "chatgpt_image_edit",
  "chatgpt_image_erase",
  "docx_extract_text",
  "audio_transcribe",
];

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    app: "",
    node: "",
    base: process.env.HERMES_MOBILE_SMOKE_BASE || DEFAULT_BASE,
    ownerKeyFile: "",
    ingressKeyFile: "",
    manifest: "",
    runtimeSource: "",
    runtimeOverrides: "",
    runtimePython: "",
    expectedVersion: "",
    agentSchemaTimeoutMs: 180000,
    runTimeoutMs: 300000,
    commandTimeoutMs: 360000,
    concurrentOwnerRuns: 2,
    skipSchema: false,
    skipPluginDirectory: false,
    skipBoundDirectory: false,
    skipWardrobeBinding: false,
    skipDeepseek: false,
    skipWeixin: false,
    skipConcurrency: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--app") out.app = argv[++index] || out.app;
    else if (arg === "--node") out.node = argv[++index] || out.node;
    else if (arg === "--base") out.base = argv[++index] || out.base;
    else if (arg === "--owner-key-file") out.ownerKeyFile = argv[++index] || out.ownerKeyFile;
    else if (arg === "--ingress-key-file") out.ingressKeyFile = argv[++index] || out.ingressKeyFile;
    else if (arg === "--manifest") out.manifest = argv[++index] || out.manifest;
    else if (arg === "--runtime-source") out.runtimeSource = argv[++index] || out.runtimeSource;
    else if (arg === "--runtime-overrides") out.runtimeOverrides = argv[++index] || out.runtimeOverrides;
    else if (arg === "--runtime-python") out.runtimePython = argv[++index] || out.runtimePython;
    else if (arg === "--expected-version") out.expectedVersion = argv[++index] || out.expectedVersion;
    else if (arg === "--agent-schema-timeout-ms") out.agentSchemaTimeoutMs = Number(argv[++index] || out.agentSchemaTimeoutMs);
    else if (arg === "--run-timeout-ms") out.runTimeoutMs = Number(argv[++index] || out.runTimeoutMs);
    else if (arg === "--command-timeout-ms") out.commandTimeoutMs = Number(argv[++index] || out.commandTimeoutMs);
    else if (arg === "--concurrent-owner-runs") out.concurrentOwnerRuns = Number(argv[++index] || out.concurrentOwnerRuns);
    else if (arg === "--skip-schema") out.skipSchema = true;
    else if (arg === "--skip-plugin-directory") out.skipPluginDirectory = true;
    else if (arg === "--skip-bound-directory") out.skipBoundDirectory = true;
    else if (arg === "--skip-wardrobe-binding") out.skipWardrobeBinding = true;
    else if (arg === "--skip-deepseek") out.skipDeepseek = true;
    else if (arg === "--skip-weixin") out.skipWeixin = true;
    else if (arg === "--skip-concurrency") out.skipConcurrency = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-production-closure-validation.js [options]",
        "  --root <dir>              Mac production root, default /Users/example/path",
        "  --app <dir>               Live app path, default <root>/app",
        "  --node <file>             Pinned Node path, default <root>/runtime/node-current/bin/node",
        "  --base <url>              Home AI origin, default http://127.0.0.1:8797",
        "  --owner-key-file <file>   Owner Web key file; path and contents are not printed",
        "  --ingress-key-file <file> Weixin ingress key file; path and contents are not printed",
        "  --expected-version <value> Expected served client version; default reads <app>/public/index.html",
        "  --skip-schema             Skip native Gateway schema probes",
        "  --skip-plugin-directory   Skip plugin delivery-directory creation and preview smoke",
        "  --skip-bound-directory    Skip all-workspace directory-topic binding preview smokes",
        "  --skip-wardrobe-binding   Skip Wardrobe manifest/binding/proxy content smoke",
        "  --skip-deepseek           Skip product-route DeepSeek provider smokes",
        "  --skip-weixin             Skip Weixin ingress heartbeat smoke",
        "  --skip-concurrency        Skip two-run Owner/OpenAI concurrency smoke",
        "  --json                    Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  out.app = out.app || macPath.join(out.root, "app");
  out.node = out.node || macPath.join(out.root, "runtime", "node-current", "bin", "node");
  out.base = String(out.base || DEFAULT_BASE).replace(/\/+$/, "");
  out.ownerKeyFile = out.ownerKeyFile || macPath.join(out.root, "data", "secrets", "owner-web-key.secret");
  out.ingressKeyFile = out.ingressKeyFile || macPath.join(out.root, "data", "weixin-ingress.secret");
  out.manifest = out.manifest || macPath.join(out.root, "data", "gateway-pool-manifest-mac.json");
  out.runtimeSource = out.runtimeSource || macPath.join(out.root, "runtime", "hermes-agent-official", "source");
  out.runtimeOverrides = out.runtimeOverrides || macPath.join(out.app, "gateway-runtime-overrides");
  out.runtimePython = out.runtimePython || macPath.join(out.root, "runtime", "hermes-agent-official", "venv", "bin", "python");
  if (!Number.isFinite(out.agentSchemaTimeoutMs) || out.agentSchemaTimeoutMs <= 0) out.agentSchemaTimeoutMs = 180000;
  if (!Number.isFinite(out.runTimeoutMs) || out.runTimeoutMs <= 0) out.runTimeoutMs = 300000;
  if (!Number.isFinite(out.commandTimeoutMs) || out.commandTimeoutMs <= 0) out.commandTimeoutMs = 360000;
  if (!Number.isFinite(out.concurrentOwnerRuns) || out.concurrentOwnerRuns < 1) out.concurrentOwnerRuns = 2;
  return out;
}

function readAppClientVersion(options) {
  const indexPath = macPath.join(options.app, "public", "index.html");
  let text = "";
  try {
    text = fs.readFileSync(indexPath, "utf8");
  } catch (_err) {
    throw new Error("macos_closure_app_client_version_unreadable");
  }
  const version = String(text.match(/data-client-version="([^"]+)"/)?.[1] || "").trim();
  if (!version) throw new Error("macos_closure_app_client_version_missing");
  return version;
}

function resolveExpectedVersion(options) {
  return String(options.expectedVersion || "").trim() || readAppClientVersion(options);
}

function scriptPath(options, scriptName) {
  return macPath.join(options.app, "scripts", scriptName);
}

function requiredTools(...groups) {
  return groups.flat().join(",");
}

function sanitize(text, options) {
  let out = String(text || "");
  const replacements = [
    [options.ownerKeyFile, "<owner-key-file>"],
    [options.ingressKeyFile, "<weixin-ingress-key-file>"],
    [options.root, "<HERMES_MOBILE_ROOT>"],
    [options.app, "<HERMES_MOBILE_APP>"],
  ];
  for (const [needle, replacement] of replacements) {
    if (!needle) continue;
    out = out.split(needle).join(replacement);
  }
  return out.replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9._-]{12,}\b/g, "<redacted-token>");
}

function compactErrorText(value, options) {
  const text = sanitize(value, options).trim();
  if (!text) return "";
  return text.split(/\r?\n/).slice(-8).join("\n").slice(0, 2000);
}

function parseJsonOutput(label, stdout, options) {
  const text = String(stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} returned non-json output: ${compactErrorText(text, options) || err.message}`);
  }
}

function runCommand(label, command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: Object.assign({}, process.env, { NO_COLOR: "1" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label} timed out after ${options.commandTimeoutMs}ms`));
    }, options.commandTimeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} failed with exit ${code}: ${compactErrorText(stderr || stdout, options)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runNodeJson(label, options, scriptName, args) {
  const result = await runCommand(label, options.node, [scriptPath(options, scriptName), ...args], options);
  return parseJsonOutput(label, result.stdout, options);
}

function productionStatusArgs(options) {
  const args = [
    "--access-key-file", options.ownerKeyFile,
    "--base", options.base,
    "--max-active-global", "0",
    "--json",
  ];
  if (options.expectedVersion) args.push("--expected-version", options.expectedVersion);
  return args;
}

function assertNoOauthProcess() {
  const result = spawnSync("/usr/bin/pgrep", ["-af", AUTH_PROCESS_PATTERN], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    throw new Error("macos_closure_oauth_reauth_process_present");
  }
}

function compactStatus(status) {
  return {
    ok: Boolean(status.ok),
    activeGlobal: Number(status.activeGlobal ?? -1),
    clientVersion: status.clientVersion || "",
    gatewayPool: status.gatewayPool || {},
    authHeader: status.authHeader || "",
    wrongHeaderDenied: Boolean(status.wrongHeaderDenied),
    wrongHeaderStatus: Number(status.wrongHeaderStatus || 0),
    originTitle: status.originIdentity?.title || "",
    ownerKeySource: status.originIdentity?.ownerKeySource || "",
  };
}

function isAllowedProfileAuditWarning(value) {
  return /^telemetry_(state_db|response_store)_missing:/.test(String(value || ""));
}

function compactProfileAudit(profile) {
  const warnings = Array.isArray(profile.warnings) ? profile.warnings : [];
  const blockingWarnings = warnings.filter((warning) => !isAllowedProfileAuditWarning(warning));
  return {
    ok: Boolean(profile.ok),
    issueCount: (profile.issues || []).length,
    warningCount: warnings.length,
    blockingWarningCount: blockingWarnings.length,
    allowedWarningCount: warnings.length - blockingWarnings.length,
    workerCount: profile.manifest?.workerCount || 0,
    activeWorkspaceKeys: profile.activeWorkspaceKeys || [],
    staleSkillProfiles: profile.staleSkillProfiles || [],
  };
}

function compactAcl(acl) {
  const rows = Array.isArray(acl.results) ? acl.results : [];
  return {
    ok: Boolean(acl.ok),
    checkedCount: rows.length,
    failedCount: rows.filter((row) => row.status === "failed").length,
    denyCheckCount: rows.filter((row) => row.expectedDenied).length,
  };
}

function compactRuntimePython(options) {
  const configuredPath = String(options.runtimePython || "").trim();
  const summary = {
    ok: false,
    configuredPath,
    realPath: "",
    executable: false,
    issue: "",
  };
  if (!configuredPath) {
    summary.issue = "runtime_python_path_missing";
    return summary;
  }
  if (/^\/Users\/(xuxin|hermes-dev)\//.test(configuredPath)) {
    summary.issue = "runtime_python_resolves_to_developer_home";
    return summary;
  }
  try {
    summary.realPath = fs.realpathSync(configuredPath);
  } catch (_err) {
    summary.issue = "runtime_python_unreadable";
    return summary;
  }
  if (/^\/Users\/(xuxin|hermes-dev)\//.test(summary.realPath)) {
    summary.issue = "runtime_python_resolves_to_developer_home";
    return summary;
  }
  try {
    fs.accessSync(summary.realPath, fs.constants.X_OK);
    summary.executable = true;
  } catch (_err) {
    summary.issue = "runtime_python_not_executable";
    return summary;
  }
  summary.ok = true;
  return summary;
}

function compactSchema(name, data) {
  return {
    name,
    ok: Boolean(data.ok),
    requiredTools: data.requiredTools || [],
    workers: (data.workers || []).map((worker) => ({
      worker: worker.worker || "",
      evidence: worker.evidence || "",
      toolCount: Number(worker.toolCount || 0),
      agentSchemaToolCount: Number(worker.agentSchemaToolCount || 0),
    })),
  };
}

function compactGatewaySmoke(data) {
  return {
    ok: Boolean(data.ok),
    expectedProfile: data.request?.expectedProfile || "",
    gatewayProfile: data.run?.gatewayProfile || data.run?.gatewayName || "",
    gatewaySource: data.run?.gatewaySource || "",
    maintenance: Boolean(data.run?.gatewayMaintenance),
    category: data.run?.gatewayMaintenanceCategory || "",
  };
}

function compactWeixin(weixin) {
  return {
    ok: Boolean(weixin.ok),
    mode: weixin.mode || "",
    ingressAuthHeader: weixin.ingressAuthHeader || "",
    wrongHeaderDenied: Boolean(weixin.wrongHeaderDenied),
    wrongHeaderStatus: Number(weixin.wrongHeaderStatus || 0),
    workspaces: (weixin.workspaces || []).map((row) => ({
      workspaceId: row.workspaceId,
      status: row.status,
      heartbeat: Boolean(row.heartbeat),
      skipped: Boolean(row.skipped),
      reason: row.reason || "",
      responseWorkspaceId: row.responseWorkspaceId || "",
      hasRun: Boolean(row.hasRun),
      hasThread: Boolean(row.hasThread),
      hasMessage: Boolean(row.hasMessage),
    })),
  };
}

function compactPluginDirectory(pluginDirectory) {
  return {
    ok: Boolean(pluginDirectory.ok),
    authHeader: pluginDirectory.authHeader || "",
    workspaceCount: Number(pluginDirectory.workspaceCount || 0),
    pluginFolders: pluginDirectory.pluginFolders || [],
    rows: (pluginDirectory.rows || []).map((row) => ({
      workspaceId: row.workspaceId || "",
      label: row.label || "",
      ok: Boolean(row.ok),
      base: row.base || "",
      projectCount: Number(row.projectCount || 0),
      hasThread: Boolean(row.hasThread),
      rootCreate: row.rootCreate || null,
      preview: row.preview || null,
      pluginCreates: row.pluginCreates || [],
    })),
  };
}

function compactBoundDirectory(boundDirectory) {
  return {
    ok: Boolean(boundDirectory.ok),
    allWorkspaces: Boolean(boundDirectory.allWorkspaces),
    includeChat: Boolean(boundDirectory.includeChat),
    simulateUiRoute: Boolean(boundDirectory.simulateUiRoute),
    workspaceCount: Number(boundDirectory.workspaceCount || 0),
    results: (boundDirectory.results || []).map((row) => ({
      workspaceId: row.workspaceId || "",
      ok: Boolean(row.ok),
      skipped: Boolean(row.skipped),
      skipReason: row.skipReason || "",
      uniquePaths: Number(row.uniquePaths || 0),
      okCount: Number(row.okCount || 0),
      failed: Number(row.failed || 0),
      failures: (row.failures || []).slice(0, 3).map((failure) => ({
        label: failure.label || "",
        projectId: failure.projectId || "",
        subprojectId: failure.subprojectId || "",
        path: failure.path || "",
        status: Number(failure.status || 0),
        error: failure.error || "",
      })),
    })),
  };
}

function compactWardrobeBinding(wardrobeBinding) {
  return {
    ok: Boolean(wardrobeBinding.ok),
    authHeader: wardrobeBinding.authHeader || "",
    expectedOrigin: wardrobeBinding.expectedOrigin || "",
    legacyOrigin: wardrobeBinding.legacyOrigin || "",
    bindingCount: Number(wardrobeBinding.bindingCount || 0),
    bindings: (wardrobeBinding.bindings || []).map((row) => ({
      path: row.path || "",
      ok: Boolean(row.ok),
      configReadable: Boolean(row.configReadable),
      workspaceId: row.workspaceId || "",
      hermesWorkspaceId: row.hermesWorkspaceId || "",
      apiBaseOrigin: row.apiBaseOrigin || "",
      keyShape: row.keyShape || {},
      legacyOriginPresent: Boolean(row.legacyOriginPresent),
    })),
    workspaces: (wardrobeBinding.workspaces || []).map((row) => ({
      workspaceId: row.workspaceId || "",
      ok: Boolean(row.ok),
      manifest: row.manifest || {},
      entry: row.entry || {},
      bootstrap: row.bootstrap || {},
    })),
  };
}

async function runSchema(options, name, profile, telemetryRoot, requiredTools) {
  const data = await runNodeJson(`schema:${name}`, options, "gateway-tool-schema-smoke.js", [
    "--manifest", options.manifest,
    "--profile", profile,
    "--schema-only",
    "--agent-schema-mode", "native",
    "--telemetry-root", telemetryRoot,
    "--runtime-source", options.runtimeSource,
    "--runtime-overrides", options.runtimeOverrides,
    "--runtime-python", options.runtimePython,
    "--agent-schema-timeout-ms", String(options.agentSchemaTimeoutMs),
    "--require", requiredTools,
  ]);
  return compactSchema(name, data);
}

async function runOwnerConcurrency(options) {
  const args = [
    "--base", options.base,
    "--key-file", options.ownerKeyFile,
    "--workspace", "owner",
    "--timeout-ms", String(options.runTimeoutMs),
  ];
  const runs = await Promise.all(Array.from({ length: options.concurrentOwnerRuns }, (_, index) => (
    runNodeJson(`owner-openai-concurrency:${index + 1}`, options, "gateway-pool-production-smoke.js", args)
  )));
  const postStatus = compactStatus(await runNodeJson("post-concurrency-status", options, "production-status-smoke.js", productionStatusArgs(options)));
  return {
    ok: runs.every((run) => run.ok && run.run?.status === "done" && run.run?.gatewaySource === "worker_pool")
      && postStatus.ok && postStatus.activeGlobal === 0,
    runs: runs.map((run, index) => ({
      index: index + 1,
      ok: Boolean(run.ok),
      status: run.run?.status || "",
      gatewayProfile: run.run?.gatewayProfile || run.run?.gatewayName || "",
      gatewaySource: run.run?.gatewaySource || "",
      maintenance: Boolean(run.run?.gatewayMaintenance),
    })),
    statusAfter: postStatus,
  };
}

async function runClosure(options) {
  assertNoOauthProcess();
  options.expectedVersion = resolveExpectedVersion(options);
  const status = compactStatus(await runNodeJson("status", options, "production-status-smoke.js", productionStatusArgs(options)));
  const profileAudit = compactProfileAudit(await runNodeJson("profile-audit", options, "macos-production-profile-audit.js", [
    "--root", options.root,
    "--json",
  ]));
  const runtimePython = compactRuntimePython(options);
  const acl = compactAcl(await runNodeJson("acl", options, "macos-worker-filesystem-access-harness.js", [
    "--root", options.root,
    "--json",
  ]));

  const pluginDirectory = options.skipPluginDirectory ? null : compactPluginDirectory(await runNodeJson("plugin-directory", options, "macos-plugin-directory-production-smoke.js", [
    "--root", options.root,
    "--base", options.base,
    "--access-key-file", options.ownerKeyFile,
    "--json",
  ]));

  const boundDirectory = options.skipBoundDirectory ? null : {
    path: compactBoundDirectory(await runNodeJson("bound-directory-path", options, "macos-bound-directory-preview-smoke.js", [
      "--root", options.root,
      "--all-workspaces",
      "--json",
    ])),
    uiRoute: compactBoundDirectory(await runNodeJson("bound-directory-ui-route", options, "macos-bound-directory-preview-smoke.js", [
      "--root", options.root,
      "--all-workspaces",
      "--simulate-ui-route",
      "--json",
    ])),
  };

  const wardrobeBinding = options.skipWardrobeBinding ? null : compactWardrobeBinding(await runNodeJson("wardrobe-binding", options, "macos-wardrobe-binding-production-smoke.js", [
    "--root", options.root,
    "--base", options.base,
    "--access-key-file", options.ownerKeyFile,
    "--json",
  ]));

  const schemas = options.skipSchema ? [] : [
    await runSchema(
      options,
      "wuping",
      "hm-wuping-openai-1",
      "/Users/example/path",
      requiredTools(MAC_BASE_SCHEMA_TOOLS, [
        "mcp_wardrobe_wardrobe_search_items",
        "mcp_wardrobe_wardrobe_write_history",
        "mcp_finance_list_ledgers",
        "mcp_note_notes_create",
        "mcp_email_search_messages",
      ]),
    ),
    await runSchema(
      options,
      "owner",
      "hm-owner-openai-1",
      "/Users/example/path",
      requiredTools(MAC_BASE_SCHEMA_TOOLS, [
        "mcp_health_records_get_summary",
        "mcp_note_notes_create",
      ]),
    ),
    await runSchema(
      options,
      "test",
      "hm-test-openai-1",
      "/Users/example/path",
      requiredTools(MAC_BASE_SCHEMA_TOOLS, [
        "mcp_wardrobe_wardrobe_search_items",
        "mcp_finance_list_ledgers",
      ]),
    ),
  ];

  const deepseek = options.skipDeepseek ? null : {
    user: compactGatewaySmoke(await runNodeJson("deepseek-user", options, "gateway-pool-production-smoke.js", [
      "--base", options.base,
      "--key-file", options.ownerKeyFile,
      "--workspace", "owner",
      "--model", "deepseek-chat",
      "--provider", "deepseek",
      "--expected-profile", "deepseekgw1",
      "--timeout-ms", String(options.runTimeoutMs),
    ])),
    maintenance: compactGatewaySmoke(await runNodeJson("deepseek-maintenance", options, "gateway-pool-production-smoke.js", [
      "--base", options.base,
      "--key-file", options.ownerKeyFile,
      "--workspace", "owner",
      "--model", "deepseek-chat",
      "--provider", "deepseek",
      "--maintenance",
      "--expected-profile", "deepseekmaint1",
      "--timeout-ms", String(options.runTimeoutMs),
    ])),
  };

  const weixin = options.skipWeixin ? null : compactWeixin(await runNodeJson("weixin", options, "weixin-ingress-production-smoke.js", [
    "--base", options.base,
    "--ingress-key-file", options.ingressKeyFile,
    "--json",
  ]));

  const concurrency = options.skipConcurrency ? null : await runOwnerConcurrency(options);
  const finalStatus = compactStatus(await runNodeJson("final-status", options, "production-status-smoke.js", productionStatusArgs(options)));
  assertNoOauthProcess();

  const ok = status.ok
    && status.activeGlobal === 0
    && status.clientVersion === options.expectedVersion
    && status.wrongHeaderDenied
    && profileAudit.ok
    && profileAudit.issueCount === 0
    && profileAudit.blockingWarningCount === 0
    && runtimePython.ok
    && acl.ok
    && acl.failedCount === 0
    && (!pluginDirectory || (pluginDirectory.ok && pluginDirectory.rows.every((row) => row.ok)))
    && (!boundDirectory || (boundDirectory.path.ok && boundDirectory.uiRoute.ok))
    && (!wardrobeBinding || (wardrobeBinding.ok && wardrobeBinding.bindings.every((row) => row.ok) && wardrobeBinding.workspaces.every((row) => row.ok)))
    && schemas.every((row) => row.ok)
    && (!deepseek || (deepseek.user.ok && deepseek.user.gatewayProfile === "deepseekgw1" && !deepseek.user.maintenance
      && deepseek.maintenance.ok && deepseek.maintenance.gatewayProfile === "deepseekmaint1" && deepseek.maintenance.maintenance))
    && (!weixin || (weixin.ok && weixin.wrongHeaderDenied && weixin.workspaces.every((row) => (
      row.heartbeat && !row.skipped && row.reason === "weixin_ingress_heartbeat" && !row.hasRun && !row.hasThread && !row.hasMessage
    ))))
    && (!concurrency || concurrency.ok)
    && finalStatus.ok
    && finalStatus.activeGlobal === 0
    && finalStatus.clientVersion === options.expectedVersion;

  return {
    ok,
    expectedVersion: options.expectedVersion,
    scope: {
      grokXai: "deferred_manual_oauth_not_included",
      schema: options.skipSchema ? "skipped" : "included",
      pluginDirectory: options.skipPluginDirectory ? "skipped" : "included",
      boundDirectory: options.skipBoundDirectory ? "skipped" : "included",
      wardrobeBinding: options.skipWardrobeBinding ? "skipped" : "included",
      deepseek: options.skipDeepseek ? "skipped" : "included",
      weixin: options.skipWeixin ? "skipped" : "included",
      ownerConcurrency: options.skipConcurrency ? "skipped" : "included",
    },
    oauthAuthProcess: "absent",
    status,
    profileAudit,
    runtimePython,
    acl,
    pluginDirectory,
    boundDirectory,
    wardrobeBinding,
    schemas,
    deepseek,
    weixin,
    concurrency,
    finalStatus,
  };
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    try {
      const summary = await runClosure(options);
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`ok=${summary.ok} activeGlobal=${summary.finalStatus.activeGlobal} workerCount=${summary.status.gatewayPool?.workerCount ?? ""}`);
      }
      if (!summary.ok) process.exit(1);
    } catch (err) {
      console.error(err?.message || String(err));
      process.exit(1);
    }
  })();
}

module.exports = {
  AUTH_PROCESS_PATTERN,
  compactAcl,
  compactGatewaySmoke,
  compactBoundDirectory,
  compactProfileAudit,
  compactRuntimePython,
  compactSchema,
  compactStatus,
  compactWeixin,
  compactPluginDirectory,
  compactWardrobeBinding,
  isAllowedProfileAuditWarning,
  parseArgs,
  productionStatusArgs,
  readAppClientVersion,
  resolveExpectedVersion,
  runClosure,
  sanitize,
};
