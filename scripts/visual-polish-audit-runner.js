#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_PLUGINS,
  buildPlan,
  ingestReports,
  sendCards,
} = require("./visual-polish-controller");

const DEFAULT_OUTPUT_ROOT = "/Users/example/path";
const DEFAULT_DEBUG_URL = "http://127.0.0.1:19073/";
const DEFAULT_APP_URL = "http://127.0.0.1:8797/?source=pwa";
const PRODUCTION_TASK_CARD_SCRIPT = "/Users/hermes-host/HermesMobile/plugins/codex-mobile-web/scripts/create-thread-task-card.js";
const DEV_TASK_CARD_SCRIPT = "/Users/hermes-dev/HermesMobileDev/plugins/codex-mobile-web/scripts/create-thread-task-card.js";

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function usage() {
  return [
    "Usage:",
    "  node scripts/visual-polish-audit-runner.js --scope <host|plugin|all> [--plugin-id <id> ...] --source-thread <id> --target-thread <owner=id>",
    "",
    "Runs Home AI visual harness scenarios, ingests failed reports, and sends bounded",
    "cross-thread task cards through Codex Mobile. It does not edit code.",
  ].join("\n");
}

function parseOwnerTarget(value) {
  const text = clean(value, 500);
  const index = text.indexOf("=");
  if (index <= 0) throw new Error(`invalid target mapping: ${value}`);
  return {
    owner: clean(text.slice(0, index), 120),
    target: clean(text.slice(index + 1), 300),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    jobKey: clean(process.env.HOMEAI_VISUAL_AUDIT_JOB_KEY || "", 120),
    configFile: clean(process.env.HOMEAI_VISUAL_AUDIT_CONFIG_FILE || "", 2000),
    scope: clean(process.env.HOMEAI_VISUAL_AUDIT_SCOPE || "host", 40) || "host",
    debugUrl: clean(process.env.HOMEAI_VISUAL_AUDIT_DEBUG_URL || DEFAULT_DEBUG_URL, 500) || DEFAULT_DEBUG_URL,
    appUrl: clean(process.env.HOMEAI_VISUAL_AUDIT_APP_URL || "", 1000),
    expectedClientVersion: clean(process.env.HOMEAI_VISUAL_AUDIT_EXPECTED_CLIENT_VERSION || "", 200),
    outputRoot: clean(process.env.HOMEAI_VISUAL_AUDIT_OUTPUT_ROOT || DEFAULT_OUTPUT_ROOT, 2000) || DEFAULT_OUTPUT_ROOT,
    runId: "",
    pluginIds: [],
    scenarioNames: [],
    sourceThreadId: clean(process.env.HOMEAI_VISUAL_AUDIT_SOURCE_THREAD_ID || "", 300),
    targetThreads: {},
    codexTaskCardScript: clean(process.env.HOMEAI_VISUAL_AUDIT_CODEX_TASK_CARD_SCRIPT || "", 2000),
    pending: false,
    json: false,
    recordVideo: /^(1|true|yes|on)$/i.test(clean(process.env.HOMEAI_VISUAL_AUDIT_RECORD_VIDEO || "", 40)),
  };
  for (const item of String(process.env.HOMEAI_VISUAL_AUDIT_PLUGIN_IDS || "").split(/[,\s]+/)) {
    const pluginId = clean(item, 120);
    if (pluginId) options.pluginIds.push(pluginId);
  }
  for (const item of String(process.env.HOMEAI_VISUAL_AUDIT_SCENARIOS || "").split(/[,\s]+/)) {
    const scenario = clean(item, 160);
    if (scenario) options.scenarioNames.push(scenario);
  }
  for (const item of String(process.env.HOMEAI_VISUAL_AUDIT_TARGET_THREADS || "").split(/[,\n;，；]+/u)) {
    if (!clean(item)) continue;
    const parsed = parseOwnerTarget(item);
    options.targetThreads[parsed.owner] = parsed.target;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--job-key") options.jobKey = clean(next(), 120);
    else if (arg === "--config-file") options.configFile = path.resolve(next());
    else if (arg === "--scope") options.scope = clean(next(), 40);
    else if (arg === "--debug-url") options.debugUrl = clean(next(), 500);
    else if (arg === "--app-url") options.appUrl = clean(next(), 1000);
    else if (arg === "--expected-client-version") options.expectedClientVersion = clean(next(), 200);
    else if (arg === "--output-root") options.outputRoot = path.resolve(next());
    else if (arg === "--run-id") options.runId = slug(next(), 80);
    else if (arg === "--plugin-id") options.pluginIds.push(clean(next(), 120));
    else if (arg === "--scenario") options.scenarioNames.push(clean(next(), 160));
    else if (arg === "--source-thread") options.sourceThreadId = clean(next(), 300);
    else if (arg === "--codex-task-card-script") options.codexTaskCardScript = path.resolve(next());
    else if (arg === "--target-thread") {
      const parsed = parseOwnerTarget(next());
      options.targetThreads[parsed.owner] = parsed.target;
    } else if (arg === "--pending") options.pending = true;
    else if (arg === "--record-video") options.recordVideo = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  options.pluginIds = [...new Set(options.pluginIds.filter(Boolean))];
  options.scenarioNames = [...new Set(options.scenarioNames.filter(Boolean))];
  applyConfig(options);
  if (!options.appUrl) options.appUrl = DEFAULT_APP_URL;
  if (!options.expectedClientVersion) options.expectedClientVersion = readClientVersionFromIndex();
  if (!options.codexTaskCardScript) {
    options.codexTaskCardScript = fs.existsSync(PRODUCTION_TASK_CARD_SCRIPT) ? PRODUCTION_TASK_CARD_SCRIPT : DEV_TASK_CARD_SCRIPT;
  }
  if (!options.runId) options.runId = timestampId();
  return options;
}

function readClientVersionFromIndex() {
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
    const match = /data-client-version="([^"]+)"/.exec(html);
    return clean(match && match[1], 200);
  } catch (_) {
    return "";
  }
}

function readConfig(filePath) {
  const file = clean(filePath, 2000) || (process.env.HERMES_MOBILE_ROOT
    ? path.join(process.env.HERMES_MOBILE_ROOT, "data", "visual-polish-task-cards.json")
    : "");
  if (!file || !fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function listFromConfig(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 160)).filter(Boolean);
  return String(value || "").split(/[,\s]+/).map((item) => clean(item, 160)).filter(Boolean);
}

function applyConfig(options) {
  const config = readConfig(options.configFile);
  const jobs = config.jobs && typeof config.jobs === "object" && !Array.isArray(config.jobs) ? config.jobs : {};
  const job = options.jobKey && jobs[options.jobKey] && typeof jobs[options.jobKey] === "object" && !Array.isArray(jobs[options.jobKey])
    ? jobs[options.jobKey]
    : {};
  if (job.scope && !process.env.HOMEAI_VISUAL_AUDIT_SCOPE) options.scope = clean(job.scope, 40) || options.scope;
  if (!options.sourceThreadId) options.sourceThreadId = clean(job.sourceThreadId || config.sourceThreadId || "", 300);
  if (!options.appUrl) options.appUrl = clean(job.appUrl || config.appUrl || "", 1000);
  if (!options.expectedClientVersion) {
    options.expectedClientVersion = clean(job.expectedClientVersion || config.expectedClientVersion || "", 200);
  }
  if (!options.pluginIds.length) options.pluginIds = listFromConfig(job.pluginIds || job.plugins || job.pluginId);
  if (!options.scenarioNames.length) options.scenarioNames = listFromConfig(job.scenarios || job.scenarioNames);
  const targets = Object.assign(
    {},
    config.targetThreads && typeof config.targetThreads === "object" && !Array.isArray(config.targetThreads) ? config.targetThreads : {},
    job.targetThreads && typeof job.targetThreads === "object" && !Array.isArray(job.targetThreads) ? job.targetThreads : {},
  );
  for (const [owner, target] of Object.entries(targets)) {
    const key = clean(owner, 120);
    const value = clean(target, 300);
    if (key && value && !options.targetThreads[key]) options.targetThreads[key] = value;
  }
}

function cacheFreshAppUrl(options = {}) {
  const raw = clean(options.appUrl || DEFAULT_APP_URL, 1000) || DEFAULT_APP_URL;
  const url = new URL(raw);
  if (!url.searchParams.has("source")) url.searchParams.set("source", "pwa");
  url.searchParams.set("resetClient", "1");
  url.searchParams.set("hard", "1");
  url.searchParams.set("reason", "visual-audit");
  url.searchParams.set("_hmv", clean(options.runId, 80) || timestampId());
  if (options.expectedClientVersion) url.searchParams.set("targetVersion", options.expectedClientVersion);
  return url.toString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, "").replace(/T/, "-").replace(/Z$/, "Z");
}

function slug(value, max = 120) {
  return clean(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function checkDebugServer(debugUrl, timeoutMs = 3000) {
  const url = new URL("/api/lease", debugUrl);
  const result = childProcess.spawnSync("/usr/bin/curl", [
    "-fsS",
    "--max-time",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    url.toString(),
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs + 1000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    error: result.status === 0 ? "" : clean(result.stderr || result.stdout || `curl_exit_${result.status}`, 500),
  };
}

function scopePlugins(options) {
  if (options.scope === "host") return [];
  if (options.pluginIds.length) return options.pluginIds;
  if (options.scope === "plugin") return ["music", "finance", "wardrobe", "health", "growth", "note", "email", "codex-mobile"];
  if (options.scope === "all") return DEFAULT_PLUGINS;
  return options.pluginIds;
}

function plannedScenarios(options) {
  const plan = buildPlan({
    runId: options.runId,
    debugUrl: options.debugUrl,
    pluginIds: scopePlugins(options),
  });
  let scenarios = plan.scenarios || [];
  if (options.scope === "plugin" && !options.scenarioNames.length) {
    scenarios = scenarios.filter((item) => item.pluginId);
  }
  if (options.scope === "host" && !options.scenarioNames.length) {
    scenarios = scenarios.filter((item) => !item.pluginId || item.owner === "home-ai");
  }
  if (options.scenarioNames.length) {
    const wanted = new Set(options.scenarioNames);
    scenarios = scenarios.filter((item) => wanted.has(item.scenario));
  }
  return scenarios;
}

function argsForScenario(scenario, options, artifactDir) {
  const lockDir = path.join(options.outputRoot, "locks");
  ensureDir(lockDir);
  const lockFile = path.join(lockDir, `ios-pwa-visual-${slug(options.debugUrl, 80)}.lock`);
  const args = [
    "scripts/ios-pwa-visual-harness.js",
    "--scenario",
    scenario.scenario,
    "--debug-url",
    options.debugUrl,
    "--app-url",
    cacheFreshAppUrl(options),
    "--open-wait-ms",
    String(Math.max(5000, Number(options.openWaitMs || 0) || 0)),
    "--artifact-dir",
    artifactDir,
    "--lock-file",
    lockFile,
    "--json",
  ];
  if (options.expectedClientVersion) args.push("--expected-client-version", options.expectedClientVersion);
  if (scenario.pluginId) args.push("--plugin-id", scenario.pluginId);
  if (scenario.scenario === "plugin-drawer-action-gestures" && scenario.pluginId === "finance") {
    args.push("--plugin-action-id", "record");
  }
  return args;
}

function startVideoRecording(scenario, options, outDir) {
  if (!options.recordVideo) return null;
  const videoDir = path.join(outDir, "videos");
  ensureDir(videoDir);
  const base = `${slug(scenario.owner)}-${slug(scenario.scenario)}${scenario.pluginId ? `-${slug(scenario.pluginId)}` : ""}`;
  const videoFile = path.join(videoDir, `${base}.mp4`);
  try {
    const child = childProcess.spawn("xcrun", ["simctl", "io", "booted", "recordVideo", videoFile], {
      cwd: process.cwd(),
      stdio: "ignore",
      detached: false,
    });
    return { child, videoFile };
  } catch (err) {
    return { error: clean(err?.message || err, 500), videoFile };
  }
}

function stopVideoRecording(recording) {
  if (!recording || !recording.child) return recording || null;
  try {
    process.kill(recording.child.pid, "SIGINT");
  } catch (err) {
    recording.error = clean(err?.message || err, 500);
  }
  childProcess.spawnSync("/bin/sh", ["-c", "sleep 2"], { stdio: "ignore" });
  try {
    process.kill(recording.child.pid, 0);
    process.kill(recording.child.pid, "SIGTERM");
  } catch (_) {
    // Already exited.
  }
  childProcess.spawnSync("/bin/sh", ["-c", "sleep 0.5"], { stdio: "ignore" });
  try {
    process.kill(recording.child.pid, 0);
    process.kill(recording.child.pid, "SIGKILL");
  } catch (_) {
    // Already exited.
  }
  if (recording.child.exitCode == null) {
    try {
      recording.child.unref();
    } catch (_) {
      // Best effort cleanup; video evidence is optional.
    }
  }
  recording.exists = Boolean(recording.videoFile && fs.existsSync(recording.videoFile));
  return recording;
}

function runScenario(scenario, options, outDir) {
  const artifactDir = path.join(outDir, "artifacts");
  ensureDir(artifactDir);
  const args = argsForScenario(scenario, options, artifactDir);
  const recording = startVideoRecording(scenario, options, outDir);
  const result = childProcess.spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: Number(process.env.HOMEAI_VISUAL_AUDIT_SCENARIO_TIMEOUT_MS || 120000) || 120000,
    maxBuffer: 10 * 1024 * 1024,
    env: Object.assign({}, process.env, {
      NO_COLOR: "1",
      TERM: "dumb",
    }),
  });
  const video = stopVideoRecording(recording);
  const base = `${slug(scenario.owner)}-${slug(scenario.scenario)}${scenario.pluginId ? `-${slug(scenario.pluginId)}` : ""}`;
  const stdoutFile = path.join(outDir, `${base}.stdout.txt`);
  const stderrFile = path.join(outDir, `${base}.stderr.txt`);
  fs.writeFileSync(stdoutFile, result.stdout || "", "utf8");
  fs.writeFileSync(stderrFile, result.stderr || "", "utf8");
  let report;
  try {
    report = JSON.parse(result.stdout || "{}");
  } catch (_) {
    report = {
      ok: false,
      scenario: scenario.scenario,
      pluginId: scenario.pluginId,
      debugUrl: options.debugUrl,
      error: clean(result.stderr || result.stdout || `visual_harness_exit_${result.status}`, 1000),
    };
  }
  if (result.status !== 0 && report.ok !== false) {
    report.ok = false;
    report.error = clean(result.stderr || `visual_harness_exit_${result.status}`, 1000);
  }
  report.__runner = {
    owner: scenario.owner,
    command: [process.execPath, ...args].join(" "),
    status: result.status,
    stdoutFile,
    stderrFile,
  };
  if (video) {
    report.__runner.videoFile = video.videoFile;
    report.__runner.videoExists = Boolean(video.exists);
    if (video.error) report.__runner.videoError = video.error;
  }
  const reportFile = path.join(outDir, `${base}.report.json`);
  writeJson(reportFile, report);
  return { scenario, ok: report.ok !== false, reportFile, report };
}

function outputMarkdown(output) {
  const lines = [
    "# Home AI Visual Polish Audit",
    "",
    `Run: ${output.runId}`,
    `Scope: ${output.scope}`,
    `Scenarios: ${output.results.length}`,
    `Failures: ${output.failedReports.length}`,
    `Cards sent: ${output.sendCards?.sent || 0}`,
    `Cards skipped: ${output.sendCards?.skipped || 0}`,
    "",
  ];
  for (const item of output.results) {
    lines.push(`- ${item.ok ? "PASS" : "FAIL"} ${item.scenario.owner} ${item.scenario.scenario}${item.scenario.pluginId ? ` (${item.scenario.pluginId})` : ""}`);
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.sourceThreadId) throw new Error("source_thread_required");
  const outDir = path.join(options.outputRoot, options.runId);
  ensureDir(outDir);
  const debugStatus = checkDebugServer(options.debugUrl);
  if (!debugStatus.ok) {
    const output = {
      ok: true,
      skipped: true,
      reason: "visual_debug_server_unavailable",
      debugUrl: options.debugUrl,
      debugStatus,
      kind: "visual_polish_audit_run",
      runId: options.runId,
      scope: options.scope,
      outputDir: outDir,
      scenarioCount: 0,
      failureCount: 0,
      failedReports: [],
      results: [],
      ingest: { ok: true, cardCount: 0, cards: [] },
      sendCards: { ok: true, sent: 0, failed: 0, results: [] },
    };
    writeJson(path.join(outDir, "run.json"), output);
    fs.writeFileSync(path.join(outDir, "summary.md"), `${outputMarkdown(output)}\n\nSkipped: visual debug server unavailable.\n`, "utf8");
    if (options.json) console.log(JSON.stringify(output, null, 2));
    else console.log(`${outputMarkdown(output)}\n\nSkipped: visual debug server unavailable.\n\nMEDIA:${path.join(outDir, "summary.md")}`);
    return;
  }
  const scenarios = plannedScenarios(options);
  const results = scenarios.map((scenario) => runScenario(scenario, options, outDir));
  const failedReports = results.filter((item) => !item.ok).map((item) => item.reportFile);
  const ingest = failedReports.length
    ? ingestReports({
      reports: failedReports,
      outputDir: path.join(outDir, "controller"),
      runId: options.runId,
      sourceThreadId: options.sourceThreadId,
      targetThreads: options.targetThreads,
      debugUrl: options.debugUrl,
      pending: options.pending,
    })
    : { ok: true, cardCount: 0, cards: [] };
  let sendResult = { ok: true, sent: 0, failed: 0, results: [] };
  if (ingest.cardCount) {
    for (const card of ingest.cards || []) {
      card.body = [
        card.body,
        "",
        "## Runtime Preference",
        "",
        "Use ChatGPT 5.5 X Hi with high reasoning if the target Codex Mobile thread supports it. If that model is unavailable, use the highest configured reasoning model for this thread.",
        "",
        "Only fix UI and interaction issues proven by the visual evidence. Do not change plugin business logic, data behavior, non-visual features, or unrelated text.",
      ].join("\n");
    }
    writeJson(path.join(outDir, "controller", "report.json"), ingest);
    sendResult = sendCards({
      controllerReport: path.join(outDir, "controller", "report.json"),
      sourceThreadId: options.sourceThreadId,
      targetThreads: options.targetThreads,
      codexTaskCardScript: options.codexTaskCardScript,
      pending: options.pending,
    });
  }
  const output = {
    ok: true,
    kind: "visual_polish_audit_run",
    runId: options.runId,
    scope: options.scope,
    outputDir: outDir,
    scenarioCount: scenarios.length,
    failureCount: failedReports.length,
    failedReports,
    results: results.map((item) => ({
      ok: item.ok,
      reportFile: item.reportFile,
      scenario: item.scenario,
      error: item.report.error || "",
    })),
    ingest,
    sendCards: sendResult,
  };
  writeJson(path.join(outDir, "run.json"), output);
  fs.writeFileSync(path.join(outDir, "summary.md"), `${outputMarkdown(output)}\n`, "utf8");
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else console.log(`${outputMarkdown(output)}\n\nMEDIA:${path.join(outDir, "summary.md")}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: clean(err?.message || err, 1000) };
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  applyConfig,
  argsForScenario,
  clean,
  outputMarkdown,
  parseArgs,
  plannedScenarios,
  readConfig,
  checkDebugServer,
  scopePlugins,
  slug,
  timestampId,
};
