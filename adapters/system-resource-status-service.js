"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SYSTEM_RESOURCE_THRESHOLDS = deepFreeze({
  cpu: {
    warningOverallPercent: 75,
    degradedOverallPercent: 90,
    warningSustainedOverallPercent: 75,
    degradedSustainedOverallPercent: 90,
    warningLoadPerCore: 1.5,
    degradedLoadPerCore: 2.5,
    warningSustainedLoadPerCore: 1.5,
    degradedSustainedLoadPerCore: 2.5,
  },
  memory: {
    warningPercentUsed: 80,
    degradedPercentUsed: 92,
    warningSwapPercentUsed: 25,
    degradedSwapPercentUsed: 50,
  },
  disk: {
    warningPercentUsed: 80,
    degradedPercentUsed: 90,
    warningFreeBytes: 20 * 1024 ** 3,
    degradedFreeBytes: 10 * 1024 ** 3,
  },
  codexMobile: {
    warningProcessCpuPercent: 20,
    degradedProcessCpuPercent: 60,
    warningProcessRssBytes: 1024 ** 3,
    degradedProcessRssBytes: 2 * 1024 ** 3,
    warningTotalRssBytes: 1536 * 1024 ** 2,
    degradedTotalRssBytes: 3 * 1024 ** 3,
    warningLogBytes: 512 * 1024 ** 2,
    degradedLogBytes: 1024 * 1024 ** 2,
    warningLogGrowthBytesPerSecond: 256 * 1024,
    degradedLogGrowthBytesPerSecond: 2 * 1024 * 1024,
  },
});

const DEFAULT_LAUNCHD_LABELS = Object.freeze([
  "com.hermesmobile.listener",
  "com.hermesmobile.bridge-host",
  "com.hermesmobile.workspace-system-helper",
  "com.hermesmobile.plugin.codex-mobile",
]);

const STATUS_RANK = Object.freeze({
  ok: 0,
  unknown: 1,
  warning: 2,
  degraded: 3,
});

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nowIsoFrom(input) {
  if (typeof input === "function") {
    const value = input();
    if (value) return String(value);
  }
  return new Date().toISOString();
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function roundNumber(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value, 0) * factor) / factor;
}

function roundPercent(value) {
  return Math.round(finiteNumber(value, 0));
}

function cleanLabel(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 120);
}

function uniqueLabels(labels = []) {
  const out = [];
  const seen = new Set();
  for (const label of labels) {
    const clean = cleanLabel(label);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function higherStatus(left, right) {
  return (STATUS_RANK[right] || 0) > (STATUS_RANK[left] || 0) ? right : left;
}

function severityForStatus(status) {
  if (status === "degraded") return "H1";
  if (status === "warning") return "H2";
  return "H3";
}

function classifyPercent(percent, warning, degraded) {
  const value = finiteNumber(percent, 0);
  if (value >= degraded) return "degraded";
  if (value >= warning) return "warning";
  return "ok";
}

function parseTopCpuUsage(text) {
  const source = String(text || "");
  const lineMatch = source.match(/CPU usage:\s*([^\n\r]+)/i);
  if (!lineMatch) return null;
  const line = lineMatch[1];
  const field = (name) => {
    const match = line.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)%\\s*${name}`, "i"));
    return match ? finiteNumber(match[1], NaN) : NaN;
  };
  const idle = field("idle");
  if (Number.isFinite(idle)) return Math.max(0, Math.min(100, roundNumber(100 - idle, 2)));
  const user = field("user");
  const sys = field("sys");
  if (Number.isFinite(user) || Number.isFinite(sys)) {
    return Math.max(0, Math.min(100, roundNumber((Number.isFinite(user) ? user : 0) + (Number.isFinite(sys) ? sys : 0), 2)));
  }
  return null;
}

function processLabelFromComm(value) {
  const command = String(value || "").trim().split(/\s+/)[0] || "";
  const basename = command.split(/[\\/]/).filter(Boolean).pop() || command;
  return cleanLabel(basename || "unknown_process", "unknown_process");
}

function parsePsCpuProcesses(text, limit = 5) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([0-9]+)\s+([0-9]+(?:\.[0-9]+)?)\s+(.+?)\s*$/);
    if (!match) continue;
    const pid = Math.round(nonNegativeNumber(match[1]));
    const cpuPercent = roundNumber(match[2], 1);
    const label = processLabelFromComm(match[3]);
    if (!pid || cpuPercent <= 0 || !label) continue;
    rows.push({ pid, label, cpuPercent });
  }
  rows.sort((left, right) => right.cpuPercent - left.cpuPercent || left.label.localeCompare(right.label));
  return rows.slice(0, Math.max(0, Math.min(20, Math.round(nonNegativeNumber(limit, 5)))));
}

function parsePsCommandProcesses(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([0-9]+)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+)\s+(\S+)\s+(.+?)\s*$/);
    if (!match) continue;
    const pid = Math.round(nonNegativeNumber(match[1]));
    const cpuPercent = roundNumber(match[2], 1);
    const rssBytes = Math.round(nonNegativeNumber(match[3]) * 1024);
    const elapsed = cleanLabel(match[4], "unknown_elapsed");
    const command = String(match[5] || "");
    if (!pid || !command) continue;
    rows.push({ pid, cpuPercent, rssBytes, elapsed, command });
  }
  return rows;
}

function parseLaunchdPid(stdout) {
  const match = String(stdout || "").match(/\b(?:pid|processIdentifier)\s*=\s*([1-9][0-9]*)\b/i);
  return match ? Math.round(nonNegativeNumber(match[1])) : 0;
}

function codexMobileProcessRole(row, launchdPid = 0) {
  const command = String(row?.command || "");
  if (!command) return null;
  if (row.pid === launchdPid) {
    return { role: "listener", label: "Codex Mobile listener" };
  }
  if (/codex-mobile-web\/server\.js\b/i.test(command) || /plugins\/codex-mobile-web\/server\.js\b/i.test(command)) {
    return { role: "listener", label: "Codex Mobile listener" };
  }
  if (/\bcodex-app-server-mux\.js\b/i.test(command)) {
    return { role: "app_server_mux", label: "Codex app-server mux" };
  }
  if (/\bcodex\b[\s\S]*\bapp-server\b/i.test(command)) {
    return { role: "codex_app_server", label: "Codex app-server" };
  }
  if (/\bcodex-mobile-mcp-server\.js\b/i.test(command)) {
    return { role: "mcp_server", label: "Codex Mobile MCP" };
  }
  return null;
}

function hostMemoryPressureHealthy(memory = {}) {
  const status = String(memory?.status || "").toLowerCase();
  if (status !== "ok") return false;
  const pressure = memory?.pressure || {};
  const swap = memory?.swap || {};
  const pressureStatus = String(pressure.status || "").toLowerCase();
  const swapStatus = String(swap.status || "").toLowerCase();
  const pressureHealthy = !pressure.available || pressureStatus === "ok";
  const swapHealthy = !swap.available || swapStatus === "ok";
  return pressureHealthy && swapHealthy;
}

function codexMobileRssStatusForHostMemory(rssStatus, memory) {
  if (rssStatus === "degraded" && hostMemoryPressureHealthy(memory)) return "warning";
  return rssStatus;
}

function codexMobileRssOnlyWarningAdvisory(codexMobile, thresholds, memory) {
  if (!codexMobile || codexMobile.status !== "warning") return false;
  if (!hostMemoryPressureHealthy(memory)) return false;
  if (codexMobile.maxProcessCpuPercent >= thresholds.codexMobile.warningProcessCpuPercent) return false;
  if (codexMobile.logs?.status && !["ok", "unknown"].includes(codexMobile.logs.status)) return false;
  return codexMobile.maxProcessRssBytes >= thresholds.codexMobile.warningProcessRssBytes
    || codexMobile.totalRssBytes >= thresholds.codexMobile.warningTotalRssBytes;
}

function classifyCodexMobileProcess(row, thresholds, memory) {
  const cpuStatus = row.cpuPercent >= thresholds.codexMobile.degradedProcessCpuPercent
    ? "degraded"
    : (row.cpuPercent >= thresholds.codexMobile.warningProcessCpuPercent ? "warning" : "ok");
  const rssStatus = row.rssBytes >= thresholds.codexMobile.degradedProcessRssBytes
    ? "degraded"
    : (row.rssBytes >= thresholds.codexMobile.warningProcessRssBytes ? "warning" : "ok");
  return higherStatus(cpuStatus, codexMobileRssStatusForHostMemory(rssStatus, memory));
}

function normalizeCodexMobileLogPaths(options = {}) {
  const env = options.env || {};
  const envConfigured = [env.HOMEAI_CODEX_MOBILE_LOG_PATH, env.CODEX_MOBILE_LOG_PATH].filter(Boolean);
  const configured = Array.isArray(options.codexMobileLogPaths)
    ? options.codexMobileLogPaths
    : (options.codexMobileLogPath ? [options.codexMobileLogPath] : []);
  const home = options.env?.HOME || process.env.HOME || "";
  const shouldUseDefaultPaths = configured.length === 0
    && envConfigured.length === 0
    && !options.runCommand;
  const defaults = shouldUseDefaultPaths
    ? [
        home ? path.join(home, ".codex-mobile-web", "logs", "codex-mobile-web.out.log") : "",
        "/Users/example/path",
      ]
    : [];
  const out = [];
  const seen = new Set();
  for (const candidate of [...configured, ...envConfigured, ...defaults]) {
    const value = String(candidate || "");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collectCodexMobileLogs(options, thresholds, previousSample, checkedAtMs) {
  const fsImpl = options.fs || fs;
  const files = [];
  for (const logPath of normalizeCodexMobileLogPaths(options)) {
    try {
      const stat = fsImpl.statSync(logPath);
      if (!stat || !stat.isFile?.()) continue;
      const sizeBytes = Math.round(nonNegativeNumber(stat.size));
      const name = cleanLabel(path.basename(logPath), "codex-mobile.log");
      const status = sizeBytes >= thresholds.codexMobile.degradedLogBytes
        ? "degraded"
        : (sizeBytes >= thresholds.codexMobile.warningLogBytes ? "warning" : "ok");
      files.push({ name, sizeBytes, status });
    } catch (_) {
      // Log paths are optional. Absence is bounded by available=false below.
    }
  }
  const totalSizeBytes = files.reduce((sum, item) => sum + item.sizeBytes, 0);
  const maxSizeBytes = files.reduce((max, item) => Math.max(max, item.sizeBytes), 0);
  const previous = previousSample && Number.isFinite(previousSample.checkedAtMs) ? previousSample : null;
  const elapsedSeconds = previous ? Math.max(0, (checkedAtMs - previous.checkedAtMs) / 1000) : 0;
  const growthBytesPerSecond = previous && elapsedSeconds > 0
    ? roundNumber(Math.max(0, totalSizeBytes - previous.totalSizeBytes) / elapsedSeconds, 1)
    : 0;
  const growthStatus = previous && elapsedSeconds > 0
    ? (growthBytesPerSecond >= thresholds.codexMobile.degradedLogGrowthBytesPerSecond
        ? "degraded"
        : (growthBytesPerSecond >= thresholds.codexMobile.warningLogGrowthBytesPerSecond ? "warning" : "ok"))
    : "ok";
  const sizeStatus = files.reduce((status, item) => higherStatus(status, item.status), files.length ? "ok" : "unknown");
  return {
    available: files.length > 0,
    files,
    fileCount: files.length,
    totalSizeBytes,
    maxSizeBytes,
    growthAvailable: Boolean(previous && elapsedSeconds > 0),
    growthBytesPerSecond,
    status: files.length ? higherStatus(sizeStatus, growthStatus) : "unknown",
    nextSample: { checkedAtMs, totalSizeBytes },
  };
}

async function collectCodexMobileRuntime(options, runCommand, thresholds, launchd, previousLogSample, checkedAtMs, memory) {
  const codexLaunchd = (launchd?.services || []).find((service) => service.label === "com.hermesmobile.plugin.codex-mobile");
  const launchdPid = Math.round(nonNegativeNumber(codexLaunchd?.pid));
  const processResult = await runCommandSafe(
    runCommand,
    "/bin/ps",
    ["-axo", "pid=,pcpu=,rss=,etime=,command="],
    { timeoutMs: 5000, maxBuffer: 1024 * 1024 },
  );
  const processes = processResult.ok
    ? parsePsCommandProcesses(processResult.stdout)
        .map((row) => {
          const role = codexMobileProcessRole(row, launchdPid);
          if (!role) return null;
          const bounded = {
            pid: row.pid,
            role: role.role,
            label: role.label,
            cpuPercent: row.cpuPercent,
            rssBytes: row.rssBytes,
            elapsed: row.elapsed,
          };
          bounded.status = classifyCodexMobileProcess(bounded, thresholds, memory);
          return bounded;
        })
        .filter(Boolean)
    : [];
  processes.sort((left, right) => right.cpuPercent - left.cpuPercent || right.rssBytes - left.rssBytes || left.role.localeCompare(right.role));
  const totalCpuPercent = roundNumber(processes.reduce((sum, item) => sum + item.cpuPercent, 0), 1);
  const totalRssBytes = Math.round(processes.reduce((sum, item) => sum + item.rssBytes, 0));
  const maxProcessCpuPercent = processes.reduce((max, item) => Math.max(max, item.cpuPercent), 0);
  const maxProcessRssBytes = processes.reduce((max, item) => Math.max(max, item.rssBytes), 0);
  const processStatus = processes.reduce((status, item) => higherStatus(status, item.status), processResult.ok ? "ok" : "unknown");
  const totalRssStatus = totalRssBytes >= thresholds.codexMobile.degradedTotalRssBytes
    ? "degraded"
    : (totalRssBytes >= thresholds.codexMobile.warningTotalRssBytes ? "warning" : "ok");
  const boundedTotalRssStatus = codexMobileRssStatusForHostMemory(totalRssStatus, memory);
  const logs = collectCodexMobileLogs(options, thresholds, previousLogSample, checkedAtMs);
  const status = higherStatus(higherStatus(processStatus, boundedTotalRssStatus), logs.available ? logs.status : "ok");
  const codexMobile = {
    status,
    available: processResult.ok || logs.available,
    source: processResult.ok ? "ps_command" : "unavailable",
    processCount: processes.length,
    processes: processes.slice(0, 8),
    totalCpuPercent,
    totalRssBytes,
    maxProcessCpuPercent,
    maxProcessRssBytes,
    launchdPid: launchdPid || 0,
    logs: Object.assign({}, logs, { nextSample: undefined }),
    nextLogSample: logs.nextSample,
  };
  codexMobile.advisoryOnly = codexMobileRssOnlyWarningAdvisory(codexMobile, thresholds, memory);
  return {
    ...codexMobile,
  };
}

function commandAvailable(runCommand) {
  return typeof runCommand === "function";
}

async function runCommandSafe(runCommand, command, args = [], options = {}) {
  if (!commandAvailable(runCommand)) {
    return { ok: false, status: 127, stdout: "", stderr: "", errorCode: "command_runner_unavailable" };
  }
  try {
    const result = runCommand.length <= 1
      ? await runCommand({ command, args: args.slice(), timeoutMs: options.timeoutMs })
      : await runCommand(command, args.slice(), Object.assign({}, options));
    return {
      ok: typeof result?.ok === "boolean" ? result.ok : finiteNumber(result?.status ?? result?.code, 0) === 0,
      status: finiteNumber(result?.status ?? result?.code, 0),
      stdout: String(result?.stdout || ""),
      stderr: String(result?.stderr || ""),
      errorCode: "",
    };
  } catch (error) {
    return {
      ok: false,
      status: finiteNumber(error?.status ?? error?.code, 1),
      stdout: String(error?.stdout || ""),
      stderr: String(error?.stderr || error?.message || ""),
      errorCode: "command_failed",
    };
  }
}

function defaultRunCommand(command, args, options) {
  const safeArgs = Array.isArray(args) ? args : [];
  const safeOptions = options || {};
  return new Promise((resolve) => {
    execFile(command, safeArgs, {
      timeout: safeOptions.timeoutMs || safeOptions.timeout || 5000,
      maxBuffer: safeOptions.maxBuffer || 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      resolve({
        ok: !error,
        status: error?.code || 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
      });
    });
  });
}

async function collectCpu(osImpl, runCommand, thresholds) {
  const load = typeof osImpl?.loadavg === "function" ? osImpl.loadavg() : [];
  const cpus = typeof osImpl?.cpus === "function" ? osImpl.cpus() : [];
  const availableParallelism = typeof osImpl?.availableParallelism === "function"
    ? osImpl.availableParallelism()
    : 0;
  const coreCount = Math.max(1, cpus.length || finiteNumber(availableParallelism, 0) || 1);
  const loadAverage = {
    oneMinute: roundNumber(load[0], 2),
    fiveMinute: roundNumber(load[1], 2),
    fifteenMinute: roundNumber(load[2], 2),
  };
  const loadPerCore = {
    oneMinute: roundNumber(loadAverage.oneMinute / coreCount, 3),
    fiveMinute: roundNumber(loadAverage.fiveMinute / coreCount, 3),
    fifteenMinute: roundNumber(loadAverage.fifteenMinute / coreCount, 3),
  };
  const topResult = await runCommandSafe(
    runCommand,
    "/usr/bin/top",
    ["-l", "1", "-n", "0", "-stats", "pid"],
    { timeoutMs: 5000, maxBuffer: 64 * 1024 },
  );
  const parsedCpuPercent = topResult.ok ? parseTopCpuUsage(topResult.stdout) : null;
  const processResult = await runCommandSafe(
    runCommand,
    "/bin/ps",
    ["-axo", "pid=,pcpu=,comm="],
    { timeoutMs: 5000, maxBuffer: 256 * 1024 },
  );
  const topProcesses = processResult.ok ? parsePsCpuProcesses(processResult.stdout, 5) : [];
  const overallPercent = Number.isFinite(parsedCpuPercent) ? roundPercent(parsedCpuPercent) : 0;
  const sustainedPercent = overallPercent;
  const oneMinuteStatus = higherStatus(
    classifyPercent(overallPercent, thresholds.cpu.warningOverallPercent, thresholds.cpu.degradedOverallPercent),
    loadPerCore.oneMinute >= thresholds.cpu.degradedLoadPerCore
      ? "degraded"
      : (loadPerCore.oneMinute >= thresholds.cpu.warningLoadPerCore ? "warning" : "ok"),
  );
  const sustainedStatus = higherStatus(
    classifyPercent(sustainedPercent, thresholds.cpu.warningSustainedOverallPercent, thresholds.cpu.degradedSustainedOverallPercent),
    Math.max(loadPerCore.fiveMinute, loadPerCore.fifteenMinute) >= thresholds.cpu.degradedSustainedLoadPerCore
      ? "degraded"
      : (Math.max(loadPerCore.fiveMinute, loadPerCore.fifteenMinute) >= thresholds.cpu.warningSustainedLoadPerCore ? "warning" : "ok"),
  );
  const status = higherStatus(oneMinuteStatus, sustainedStatus);
  return {
    status,
    loadAverage,
    coreCount,
    loadPerCore,
    overallPercent,
    sustainedPercent,
    percentSource: Number.isFinite(parsedCpuPercent) ? "top_cpu_usage" : "unavailable",
    processAttribution: {
      available: processResult.ok,
      source: processResult.ok ? "ps_comm_cpu" : "unavailable",
      topProcesses,
      topProcessCount: topProcesses.length,
      topProcessTotalPercent: roundNumber(topProcesses.reduce((sum, row) => sum + row.cpuPercent, 0), 1),
    },
  };
}

function parseByteUnit(value, unit) {
  const number = finiteNumber(value, NaN);
  if (!Number.isFinite(number)) return 0;
  const normalized = String(unit || "B").trim().toUpperCase();
  const multiplier = normalized.startsWith("T")
    ? 1024 ** 4
    : normalized.startsWith("G")
      ? 1024 ** 3
      : normalized.startsWith("M")
        ? 1024 ** 2
        : normalized.startsWith("K")
          ? 1024
          : 1;
  return Math.round(number * multiplier);
}

function parseSwapUsage(text) {
  const source = String(text || "");
  const field = (name) => {
    const match = source.match(new RegExp(`${name}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*([KMGT]?B?)`, "i"));
    return match ? parseByteUnit(match[1], match[2] || "B") : 0;
  };
  const totalBytes = field("total");
  const usedBytes = field("used");
  const freeBytes = field("free");
  const percentUsed = totalBytes > 0 ? roundPercent((usedBytes / totalBytes) * 100) : 0;
  return {
    available: totalBytes > 0,
    totalBytes,
    usedBytes,
    freeBytes,
    percentUsed,
  };
}

function parseMemoryPressure(text) {
  const source = String(text || "");
  const match = source.match(/System-wide memory free percentage:\s*([0-9]+(?:\.[0-9]+)?)%/i);
  if (!match) {
    return {
      available: false,
      freePercent: 0,
      usedPercent: 0,
    };
  }
  const freePercent = Math.max(0, Math.min(100, roundPercent(match[1])));
  return {
    available: true,
    freePercent,
    usedPercent: Math.max(0, Math.min(100, 100 - freePercent)),
  };
}

async function collectMemory(osImpl, runCommand, thresholds) {
  const totalBytes = nonNegativeNumber(typeof osImpl?.totalmem === "function" ? osImpl.totalmem() : 0);
  const residentFreeBytes = Math.min(totalBytes, nonNegativeNumber(typeof osImpl?.freemem === "function" ? osImpl.freemem() : 0));
  const residentUsedBytes = Math.max(0, totalBytes - residentFreeBytes);
  const residentPercentUsed = totalBytes > 0 ? roundPercent((residentUsedBytes / totalBytes) * 100) : 0;
  const pressureResult = await runCommandSafe(runCommand, "/usr/bin/memory_pressure", [], { timeoutMs: 3000, maxBuffer: 64 * 1024 });
  const pressure = pressureResult.ok
    ? parseMemoryPressure(pressureResult.stdout)
    : { available: false, freePercent: 0, usedPercent: 0 };
  const percentUsed = pressure.available ? pressure.usedPercent : residentPercentUsed;
  const freeBytes = pressure.available && totalBytes > 0
    ? Math.round(totalBytes * (pressure.freePercent / 100))
    : residentFreeBytes;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const memoryStatus = classifyPercent(percentUsed, thresholds.memory.warningPercentUsed, thresholds.memory.degradedPercentUsed);
  const swapResult = await runCommandSafe(runCommand, "/usr/sbin/sysctl", ["vm.swapusage"], { timeoutMs: 3000 });
  const swap = swapResult.ok
    ? parseSwapUsage(swapResult.stdout)
    : {
        available: false,
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        percentUsed: 0,
      };
  const swapStatus = swap.available
    ? classifyPercent(swap.percentUsed, thresholds.memory.warningSwapPercentUsed, thresholds.memory.degradedSwapPercentUsed)
    : "ok";
  return {
    status: higherStatus(memoryStatus, swapStatus),
    totalBytes,
    usedBytes,
    freeBytes,
    availableBytes: freeBytes,
    percentUsed,
    residentUsedBytes,
    residentFreeBytes,
    residentPercentUsed,
    percentSource: pressure.available ? "memory_pressure" : "os_freemem",
    pressure: Object.assign({}, pressure, {
      status: pressure.available
        ? classifyPercent(pressure.usedPercent, thresholds.memory.warningPercentUsed, thresholds.memory.degradedPercentUsed)
        : "unknown",
    }),
    swap: Object.assign({}, swap, { status: swapStatus }),
  };
}

function parseDfKOutput(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^Filesystem\s+/i.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const totalKb = nonNegativeNumber(parts[1]);
    const usedKb = nonNegativeNumber(parts[2]);
    const availableKb = nonNegativeNumber(parts[3]);
    const percentUsed = roundPercent(String(parts[4]).replace(/%$/, ""));
    if (!totalKb && !usedKb && !availableKb) continue;
    rows.push({
      key: `${parts[0]}|${parts[parts.length - 1]}`,
      totalKb,
      usedKb,
      availableKb,
      percentUsed,
    });
  }
  return rows;
}

function classifyDiskRow(row, thresholds) {
  const percentStatus = classifyPercent(
    row.percentUsed,
    thresholds.disk.warningPercentUsed,
    thresholds.disk.degradedPercentUsed,
  );
  const availableBytes = nonNegativeNumber(row.availableKb) * 1024;
  const freeStatus = availableBytes <= thresholds.disk.degradedFreeBytes
    ? "degraded"
    : (availableBytes <= thresholds.disk.warningFreeBytes ? "warning" : "ok");
  return higherStatus(percentStatus, freeStatus);
}

function diskTargets(options = {}) {
  const targets = [
    { label: "app", path: options.appRoot },
    { label: "data", path: options.dataRoot },
    { label: "runtime", path: options.runtimeRoot },
    { label: "root", path: "/" },
  ];
  const out = [];
  const seenLabels = new Set();
  for (const target of targets) {
    const label = cleanLabel(target.label);
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    out.push({ label, path: String(target.path || "/") });
  }
  return out;
}

async function collectDisk(options, runCommand, thresholds) {
  const targets = diskTargets(options);
  const result = await runCommandSafe(
    runCommand,
    "/bin/df",
    ["-k", ...targets.map((target) => target.path)],
    { timeoutMs: 5000 },
  );
  if (!result.ok) {
    return {
      status: "unknown",
      filesystems: [],
      errorCode: result.errorCode || "df_unavailable",
    };
  }
  const rows = parseDfKOutput(result.stdout);
  const byKey = new Map();
  rows.forEach((row, index) => {
    const label = targets[index]?.label || `disk_${index + 1}`;
    const key = row.key || label;
    const rowStatus = classifyDiskRow(row, thresholds);
    if (!byKey.has(key)) {
      byKey.set(key, {
        label,
        labels: [label],
        status: rowStatus,
        totalKb: row.totalKb,
        usedKb: row.usedKb,
        availableKb: row.availableKb,
        availableBytes: row.availableKb * 1024,
        percentUsed: row.percentUsed,
      });
      return;
    }
    const current = byKey.get(key);
    current.labels = uniqueLabels([...current.labels, label]);
    current.label = current.labels.join(",");
    current.status = higherStatus(current.status, rowStatus);
    current.percentUsed = Math.max(current.percentUsed, row.percentUsed);
    current.availableKb = Math.min(current.availableKb, row.availableKb);
    current.availableBytes = current.availableKb * 1024;
  });
  const filesystems = Array.from(byKey.values()).sort((left, right) => left.label.localeCompare(right.label));
  const maxPercentUsed = filesystems.reduce((max, row) => Math.max(max, row.percentUsed), 0);
  const minAvailableBytes = filesystems.reduce((min, row) => Math.min(min, row.availableBytes), Number.POSITIVE_INFINITY);
  return {
    status: filesystems.reduce((status, row) => higherStatus(status, row.status), filesystems.length ? "ok" : "unknown"),
    filesystems,
    filesystemCount: filesystems.length,
    maxPercentUsed,
    availableBytes: Number.isFinite(minAvailableBytes) ? minAvailableBytes : 0,
    errorCode: "",
  };
}

function parseLaunchdStatus(stdout, commandOk) {
  if (!commandOk) return "unknown";
  const text = String(stdout || "");
  if (/\bstate\s*=\s*running\b/i.test(text)) return "running";
  if (/\b(pid|processIdentifier)\s*=\s*[1-9][0-9]*/i.test(text)) return "running";
  if (/\bstate\s*=\s*(waiting|stopped|exited|not\s+running)\b/i.test(text)) return "stopped";
  if (/\blast exit code\s*=\s*[1-9][0-9]*/i.test(text)) return "stopped";
  return "unknown";
}

async function collectLaunchd(labels, runCommand) {
  const safeLabels = uniqueLabels(labels && labels.length ? labels : DEFAULT_LAUNCHD_LABELS);
  const services = [];
  for (const label of safeLabels) {
    const result = await runCommandSafe(runCommand, "/bin/launchctl", ["print", `system/${label}`], { timeoutMs: 3000 });
    const pid = parseLaunchdPid(result.stdout);
    services.push({
      label,
      status: parseLaunchdStatus(result.stdout, result.ok),
      ...(pid ? { pid } : {}),
    });
  }
  const status = services.reduce((current, service) => {
    if (service.status === "unknown") return higherStatus(current, "unknown");
    if (service.status === "stopped") return higherStatus(current, "warning");
    return current;
  }, services.length ? "ok" : "unknown");
  return { status, services };
}

function collectUptime(osImpl, processImpl) {
  const hostSeconds = Math.round(nonNegativeNumber(typeof osImpl?.uptime === "function" ? osImpl.uptime() : 0));
  const processSeconds = Math.round(nonNegativeNumber(typeof processImpl?.uptime === "function" ? processImpl.uptime() : 0));
  return {
    hostSeconds,
    processSeconds,
    listenerSeconds: processSeconds,
  };
}

function makeSignal(input) {
  const status = input.status || "unknown";
  return {
    signalId: cleanLabel(input.signalId, "unknown_signal"),
    category: cleanLabel(input.category, "system_resource"),
    status,
    severity: severityForStatus(status),
    summary: String(input.summary || "").slice(0, 240),
    boundedEvidence: input.boundedEvidence || {},
    lastCheckedAt: input.lastCheckedAt,
    source: cleanLabel(input.source, "system-resource-status-service"),
    recommendedAction: String(input.recommendedAction || "").slice(0, 240),
    actionRequiresOwnerConfirmation: Boolean(input.actionRequiresOwnerConfirmation),
  };
}

function buildSignals(snapshot, checkedAt) {
  const signals = [
    makeSignal({
      signalId: "system_cpu_load",
      label: "CPU 负载",
      category: "host_cpu",
      status: snapshot.cpu.status,
      summary: snapshot.cpu.status === "ok" ? "CPU 负载在配置阈值内。" : "CPU 负载高于配置阈值。",
      boundedEvidence: {
        overallPercent: snapshot.cpu.overallPercent,
        sustainedPercent: snapshot.cpu.sustainedPercent,
        coreCount: snapshot.cpu.coreCount,
        loadPerCore: snapshot.cpu.loadPerCore,
        attributionAvailable: snapshot.cpu.processAttribution.available,
        topProcesses: snapshot.cpu.processAttribution.topProcesses,
        topProcessTotalPercent: snapshot.cpu.processAttribution.topProcessTotalPercent,
      },
      lastCheckedAt: checkedAt,
      source: "os.loadavg",
      recommendedAction: snapshot.cpu.status === "ok"
        ? "无需处理。"
        : "先检查活跃 Worker，并在重启服务前暂缓非关键任务。",
      actionRequiresOwnerConfirmation: snapshot.cpu.status !== "ok",
    }),
    makeSignal({
      signalId: "system_memory_usage",
      label: "内存使用",
      category: "host_memory",
      status: snapshot.memory.status,
      summary: snapshot.memory.status === "ok" ? "内存使用在配置阈值内。" : "内存使用高于配置阈值。",
      boundedEvidence: {
        percentUsed: snapshot.memory.percentUsed,
        residentPercentUsed: snapshot.memory.residentPercentUsed,
        percentSource: snapshot.memory.percentSource,
        pressureFreePercent: snapshot.memory.pressure.freePercent,
        swapPercentUsed: snapshot.memory.swap.percentUsed,
        swapAvailable: snapshot.memory.swap.available,
      },
      lastCheckedAt: checkedAt,
      source: "os.memory",
      recommendedAction: snapshot.memory.status === "ok"
        ? "无需处理。"
        : "先检查高内存 Worker，再决定是否停止或重启服务。",
      actionRequiresOwnerConfirmation: snapshot.memory.status !== "ok",
    }),
    makeSignal({
      signalId: "system_disk_usage",
      label: "磁盘使用",
      category: "host_disk",
      status: snapshot.disk.status,
      summary: snapshot.disk.status === "ok" ? "磁盘使用在配置阈值内。" : "磁盘使用需要 Owner 检查。",
      boundedEvidence: {
        labels: snapshot.disk.filesystems.map((item) => item.label),
        maxPercentUsed: snapshot.disk.maxPercentUsed,
        minAvailableBytes: snapshot.disk.availableBytes,
        filesystemCount: snapshot.disk.filesystems.length,
      },
      lastCheckedAt: checkedAt,
      source: "df-k",
      recommendedAction: snapshot.disk.status === "ok"
        ? "无需处理。"
        : "删除数据前先检查保留备份、日志和 Runtime 产物。",
      actionRequiresOwnerConfirmation: snapshot.disk.status !== "ok" && snapshot.disk.status !== "unknown",
    }),
    makeSignal({
      signalId: "system_launchd_services",
      label: "关键服务",
      category: "service",
      status: snapshot.launchd.status,
      summary: snapshot.launchd.status === "ok" ? "已纳入检查的 launchd 服务正在运行。" : "一个或多个 launchd 服务已停止或状态未知。",
      boundedEvidence: {
        services: snapshot.launchd.services.map((service) => ({
          label: service.label,
          status: service.status,
        })),
      },
      lastCheckedAt: checkedAt,
      source: "launchd",
      recommendedAction: snapshot.launchd.status === "ok"
        ? "无需处理。"
        : "重启或修改 launchd 服务前先确认 Owner 意图。",
      actionRequiresOwnerConfirmation: snapshot.launchd.status !== "ok",
    }),
    makeSignal({
      signalId: "codex_mobile_runtime_pressure",
      label: "Codex Mobile Runtime",
      category: "plugin_runtime",
      status: snapshot.codexMobile.status,
      summary: snapshot.codexMobile.status === "ok"
        ? "Codex Mobile 进程和日志增长在配置阈值内。"
        : "Codex Mobile 进程或日志增长高于配置阈值。",
      boundedEvidence: {
        processCount: snapshot.codexMobile.processCount,
        totalCpuPercent: snapshot.codexMobile.totalCpuPercent,
        totalRssBytes: snapshot.codexMobile.totalRssBytes,
        maxProcessCpuPercent: snapshot.codexMobile.maxProcessCpuPercent,
        maxProcessRssBytes: snapshot.codexMobile.maxProcessRssBytes,
        processes: snapshot.codexMobile.processes.map((process) => ({
          role: process.role,
          label: process.label,
          cpuPercent: process.cpuPercent,
          rssBytes: process.rssBytes,
          status: process.status,
        })),
        logAvailable: snapshot.codexMobile.logs.available,
        logFileCount: snapshot.codexMobile.logs.fileCount,
        logTotalSizeBytes: snapshot.codexMobile.logs.totalSizeBytes,
        logGrowthAvailable: snapshot.codexMobile.logs.growthAvailable,
        logGrowthBytesPerSecond: snapshot.codexMobile.logs.growthBytesPerSecond,
        advisoryOnly: Boolean(snapshot.codexMobile.advisoryOnly),
      },
      lastCheckedAt: checkedAt,
      source: "ps-command-codex-mobile",
      recommendedAction: snapshot.codexMobile.status === "ok"
        ? "无需处理。"
        : "先检查 Codex Mobile task-card heartbeat / Watchdog 状态，再考虑重启或派发修复。",
      actionRequiresOwnerConfirmation: snapshot.codexMobile.status !== "ok",
    }),
  ];
  return signals;
}

function mergeThresholds(thresholds = {}) {
  return deepFreeze({
    cpu: Object.assign({}, DEFAULT_SYSTEM_RESOURCE_THRESHOLDS.cpu, thresholds.cpu || {}),
    memory: Object.assign({}, DEFAULT_SYSTEM_RESOURCE_THRESHOLDS.memory, thresholds.memory || {}),
    disk: Object.assign({}, DEFAULT_SYSTEM_RESOURCE_THRESHOLDS.disk, thresholds.disk || {}),
    codexMobile: Object.assign({}, DEFAULT_SYSTEM_RESOURCE_THRESHOLDS.codexMobile, thresholds.codexMobile || {}),
  });
}

function createSystemResourceStatusService(options = {}) {
  const osImpl = options.os || require("node:os");
  const processImpl = options.process || globalThis.process || {};
  const thresholds = mergeThresholds(options.thresholds || {});
  const runCommand = options.runCommand || defaultRunCommand;
  const launchdLabels = options.launchdLabels || DEFAULT_LAUNCHD_LABELS;
  let previousCodexMobileLogSample = null;

  async function collect() {
    const checkedAt = nowIsoFrom(options.nowIso);
    const [cpu, memory, disk, launchd] = await Promise.all([
      collectCpu(osImpl, runCommand, thresholds),
      collectMemory(osImpl, runCommand, thresholds),
      collectDisk(options, runCommand, thresholds),
      collectLaunchd(launchdLabels, runCommand),
    ]);
    const checkedAtMs = Date.parse(checkedAt);
    const codexMobile = await collectCodexMobileRuntime(
      options,
      runCommand,
      thresholds,
      launchd,
      previousCodexMobileLogSample,
      Number.isFinite(checkedAtMs) ? checkedAtMs : Date.now(),
      memory,
    );
    previousCodexMobileLogSample = codexMobile.nextLogSample;
    delete codexMobile.nextLogSample;
    const uptime = collectUptime(osImpl, processImpl);
    const snapshot = {
      ok: true,
      schemaVersion: 1,
      status: "ok",
      overallStatus: "ok",
      checkedAt,
      collectedAt: checkedAt,
      cpu,
      memory,
      disk,
      uptime,
      launchd,
      codexMobile,
      services: [
        ...launchd.services.map((service) => ({
          name: service.label,
          status: service.status === "running" ? "ok" : (service.status === "stopped" ? "warning" : "unknown"),
          state: service.status,
          critical: true,
          summary: "launchd 服务",
        })),
        {
          name: "Codex Mobile Runtime",
          status: codexMobile.status,
          state: codexMobile.available ? "observed" : "not_collected",
          critical: codexMobile.status !== "ok",
          summary: `processes=${codexMobile.processCount} rss=${codexMobile.totalRssBytes}`,
        },
      ],
      signals: [],
    };
    snapshot.status = [cpu.status, memory.status, disk.status, launchd.status, codexMobile.status]
      .reduce((status, item) => higherStatus(status, item), "ok");
    snapshot.overallStatus = snapshot.status;
    snapshot.ok = snapshot.status !== "degraded";
    snapshot.signals = buildSignals(snapshot, checkedAt);
    return snapshot;
  }

  return Object.freeze({ collect });
}

module.exports = {
  DEFAULT_SYSTEM_RESOURCE_THRESHOLDS,
  createSystemResourceStatusService,
};
