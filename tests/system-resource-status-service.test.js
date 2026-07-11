"use strict";

const assert = require("node:assert/strict");

const {
  DEFAULT_SYSTEM_RESOURCE_THRESHOLDS,
  createSystemResourceStatusService,
} = require("../adapters/system-resource-status-service");

const TEST_DISK_THRESHOLDS = {
  disk: {
    warningFreeBytes: 0,
    degradedFreeBytes: 0,
  },
};

function fakeOs(overrides = {}) {
  return {
    loadavg: () => overrides.loadavg || [0.2, 0.2, 0.2],
    cpus: () => Array.from({ length: overrides.cores || 4 }, () => ({})),
    totalmem: () => overrides.totalmem ?? 1000,
    freemem: () => overrides.freemem ?? 500,
    uptime: () => overrides.uptime ?? 3600,
  };
}

function createRunner(handler) {
  const calls = [];
  const runCommand = async (command, args, options) => {
    calls.push({ command, args, options });
    return handler(command, args, options);
  };
  runCommand.calls = calls;
  return runCommand;
}

function quietRunner() {
  return createRunner((command, args) => {
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n/dev/disk1s1 1000 100 900 10% /\n/dev/disk1s1 1000 100 900 10% /\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    if (command.endsWith("top")) {
      return { ok: true, status: 0, stdout: "CPU usage: 20.00% user, 5.00% sys, 75.00% idle\n", stderr: "" };
    }
    if (command.endsWith("ps")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 123 12.5 /opt/homebrew/bin/node",
          " 456 5.2 /usr/bin/python3",
          " 789 0.0 /bin/idle",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("launchctl")) {
      return { ok: true, status: 0, stdout: "state = running\npid = 123\n", stderr: "" };
    }
    return { ok: false, status: 1, stdout: "", stderr: `unexpected ${args.join(" ")}` };
  });
}

async function testCpuThresholdClassification() {
  const degraded = createSystemResourceStatusService({
    os: fakeOs({ loadavg: [4, 3.7, 3.6], cores: 4 }),
    runCommand: createRunner((command) => {
      if (command.endsWith("top")) {
        return { ok: true, status: 0, stdout: "CPU usage: 61.00% user, 35.00% sys, 4.00% idle\n", stderr: "" };
      }
      return quietRunner()(command, [], {});
    }),
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:00:00.000Z",
    process: { uptime: () => 42 },
  });
  const degradedSnapshot = await degraded.collect();
  assert.equal(degradedSnapshot.cpu.coreCount, 4);
  assert.equal(degradedSnapshot.cpu.overallPercent, 96);
  assert.equal(degradedSnapshot.cpu.percentSource, "top_cpu_usage");
  assert.equal(degradedSnapshot.cpu.loadPerCore.oneMinute, 1);
  assert.equal(degradedSnapshot.cpu.status, "degraded");
  assert.equal(degradedSnapshot.cpu.processAttribution.available, true);
  assert.equal(degradedSnapshot.cpu.processAttribution.topProcesses[0].label, "node");
  assert.equal(degradedSnapshot.cpu.processAttribution.topProcesses[0].cpuPercent, 12.5);

  const loadWarning = createSystemResourceStatusService({
    os: fakeOs({ loadavg: [7, 6.4, 6.4], cores: 4 }),
    runCommand: quietRunner(),
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:01:00.000Z",
    process: { uptime: () => 42 },
  });
  const loadWarningSnapshot = await loadWarning.collect();
  assert.equal(loadWarningSnapshot.cpu.overallPercent, 25);
  assert.equal(loadWarningSnapshot.cpu.sustainedPercent, 25);
  assert.equal(loadWarningSnapshot.cpu.loadPerCore.oneMinute, 1.75);
  assert.equal(loadWarningSnapshot.cpu.status, "warning");

  const loadDegraded = createSystemResourceStatusService({
    os: fakeOs({ loadavg: [11, 10.4, 10.4], cores: 4 }),
    runCommand: quietRunner(),
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:01:30.000Z",
    process: { uptime: () => 42 },
  });
  const loadDegradedSnapshot = await loadDegraded.collect();
  assert.equal(loadDegradedSnapshot.cpu.overallPercent, 25);
  assert.equal(loadDegradedSnapshot.cpu.loadPerCore.oneMinute, 2.75);
  assert.equal(loadDegradedSnapshot.cpu.status, "degraded");
}

async function testCpuProcessAttributionIsBoundedAndSanitized() {
  const runner = createRunner((command) => {
    if (command.endsWith("top")) {
      return { ok: true, status: 0, stdout: "CPU usage: 50.00% user, 10.00% sys, 40.00% idle\n", stderr: "" };
    }
    if (command.endsWith("ps")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 321 42.4 /private/secret/node --token=abc123",
          " 222 13.7 /Applications/Home AI.app/Contents/MacOS/Home AI",
          " 111 0.4 /usr/sbin/syslogd",
        ].join("\n"),
        stderr: "",
      };
    }
    return quietRunner()(command, [], {});
  });
  const service = createSystemResourceStatusService({
    os: fakeOs({ loadavg: [6, 6, 6], cores: 4 }),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:01:45.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.cpu.processAttribution.available, true);
  assert.equal(snapshot.cpu.processAttribution.source, "ps_comm_cpu");
  assert.deepEqual(
    snapshot.cpu.processAttribution.topProcesses.map((item) => item.label),
    ["node", "Home", "syslogd"],
  );
  assert.equal(snapshot.cpu.processAttribution.topProcesses[0].cpuPercent, 42.4);
  assert.equal(snapshot.cpu.processAttribution.topProcessTotalPercent, 56.5);
  const cpuSignal = snapshot.signals.find((item) => item.signalId === "system_cpu_load");
  assert.equal(cpuSignal.boundedEvidence.attributionAvailable, true);
  assert.equal(cpuSignal.boundedEvidence.topProcesses[0].label, "node");
  const json = JSON.stringify(snapshot.cpu);
  assert.equal(json.includes("/private/secret"), false);
  assert.equal(json.includes("token"), false);
  assert.equal(json.includes("abc123"), false);
}

async function testMemoryThresholdClassificationAndSwapParser() {
  const runner = createRunner((command) => {
    if (command.endsWith("memory_pressure")) {
      return { ok: true, status: 0, stdout: "memory pressure unavailable", stderr: "" };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 4.00G  used = 1.00G  free = 3.00G  (encrypted)", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "state = running\n", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    os: fakeOs({ totalmem: 1000, freemem: 50 }),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:02:00.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.memory.totalBytes, 1000);
  assert.equal(snapshot.memory.usedBytes, 950);
  assert.equal(snapshot.memory.freeBytes, 50);
  assert.equal(snapshot.memory.percentUsed, 95);
  assert.equal(snapshot.memory.status, "degraded");
  assert.equal(snapshot.memory.swap.available, true);
  assert.equal(snapshot.memory.swap.totalBytes, 4 * 1024 ** 3);
  assert.equal(snapshot.memory.swap.usedBytes, 1024 ** 3);
  assert.equal(snapshot.memory.swap.percentUsed, 25);
  assert.equal(snapshot.memory.swap.status, "warning");
}

async function testMacMemoryPressureOverridesResidentMemoryForStatus() {
  const runner = createRunner((command) => {
    if (command.endsWith("memory_pressure")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          "The system has 68719476736 (4194304 pages with a page size of 16384).",
          "System-wide memory free percentage: 83%",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "state = running\n", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    os: fakeOs({ totalmem: 1000, freemem: 50 }),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:02:30.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.memory.residentPercentUsed, 95);
  assert.equal(snapshot.memory.pressure.available, true);
  assert.equal(snapshot.memory.pressure.freePercent, 83);
  assert.equal(snapshot.memory.percentSource, "memory_pressure");
  assert.equal(snapshot.memory.percentUsed, 17);
  assert.equal(snapshot.memory.usedBytes, 170);
  assert.equal(snapshot.memory.freeBytes, 830);
  assert.equal(snapshot.memory.status, "ok");
  assert.equal(snapshot.signals.find((item) => item.signalId === "system_memory_usage").status, "ok");
}

async function testDiskParserUsesBoundedLabelsWithoutRawPaths() {
  const runner = createRunner((command) => {
    if (command.endsWith("df")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          "Filesystem 1024-blocks Used Available Capacity Mounted on",
          "/dev/disk1s1 1000 500 500 50% /private/shared",
          "/dev/disk1s1 1000 500 500 50% /private/shared",
          "/dev/disk2s1 2000 1800 200 90% /private/runtime-root",
          "/dev/disk3s1 10000 1000 9000 10% /",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "state = running\n", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    appRoot: "/private/app-root",
    dataRoot: "/private/data-root",
    runtimeRoot: "/private/runtime-root",
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:03:00.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  const json = JSON.stringify(snapshot.disk);
  assert.equal(json.includes("/private"), false);
  assert.equal(json.includes("/dev/disk"), false);
  assert.equal(snapshot.disk.filesystems.some((item) => item.label === "app,data"), true);
  assert.equal(snapshot.disk.filesystems.some((item) => item.labels.includes("runtime") && item.status === "degraded"), true);
  assert.equal(snapshot.disk.maxPercentUsed, 90);
  assert.equal(snapshot.disk.filesystemCount, 3);
  assert.deepEqual(
    snapshot.disk.filesystems.flatMap((item) => item.labels).sort(),
    ["app", "data", "root", "runtime"],
  );
}

async function testDiskFreeSpaceThresholds() {
  const runner = createRunner((command) => {
    if (command.endsWith("df")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          "Filesystem 1024-blocks Used Available Capacity Mounted on",
          "/dev/disk1s1 100000000 1000 9000000 1% /private/app-root",
          "/dev/disk1s1 100000000 1000 9000000 1% /private/app-root",
          "/dev/disk1s1 100000000 1000 9000000 1% /private/app-root",
          "/dev/disk1s1 100000000 1000 9000000 1% /private/app-root",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "state = running\n", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    appRoot: "/private/app-root",
    dataRoot: "/private/data-root",
    runtimeRoot: "/private/runtime-root",
    os: fakeOs(),
    runCommand: runner,
    nowIso: () => "2026-07-01T00:03:30.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.disk.status, "degraded");
  assert.equal(snapshot.disk.maxPercentUsed, 1);
  assert.equal(snapshot.disk.availableBytes, 9000000 * 1024);
}

async function testLaunchdParserReportsBoundedStatuses() {
  const runner = createRunner((command, args) => {
    if (command.endsWith("launchctl")) {
      const label = String(args[1] || "");
      if (label.endsWith("homeai")) return { ok: true, status: 0, stdout: "state = running\npid = 99\n", stderr: "" };
      if (label.endsWith("gateway")) return { ok: true, status: 0, stdout: "state = waiting\nlast exit code = 0\n", stderr: "" };
      return { ok: false, status: 3, stdout: "", stderr: "service not found" };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    launchdLabels: ["com.hermesmobile.homeai", "com.hermesmobile.gateway", "com.hermesmobile.missing"],
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:04:00.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.deepEqual(snapshot.launchd.services, [
    { label: "com.hermesmobile.homeai", status: "running", pid: 99 },
    { label: "com.hermesmobile.gateway", status: "stopped" },
    { label: "com.hermesmobile.missing", status: "unknown" },
  ]);
  const json = JSON.stringify(snapshot.launchd);
  assert.equal(json.includes("launchctl"), false);
  assert.equal(json.includes("print"), false);
  assert.equal(json.includes("system/"), false);
  assert.equal(json.includes("service not found"), false);
}

async function testCodexMobileRuntimeAttributionIsBoundedAndSanitized() {
  const runner = createRunner((command, args) => {
    if (command.endsWith("launchctl")) {
      const label = String(args[1] || "");
      if (label.endsWith("plugin.codex-mobile")) return { ok: true, status: 0, stdout: "state = running\npid = 902\n", stderr: "" };
      return { ok: true, status: 0, stdout: "state = running\npid = 123\n", stderr: "" };
    }
    if (command.endsWith("ps") && String(args.join(" ")).includes("rss")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 900 61.0 4026032 28:25 /Users/example/path app-server --api-key secret-value",
          " 901 0.1 988320 28:25 /Users/example/path app-server",
          " 902 3.0 1921504 02:52 /Users/example/path --launch-token must-not-leak",
          " 903 0.0 85040 27:41 /Users/example/path --key-file /secret/path",
          " 904 91.0 2048 00:01 /private/other-service --token abc",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("ps")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 900 29.0 /Users/example/path",
          " 902 3.0 /Users/example/path",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    if (command.endsWith("top")) {
      return { ok: true, status: 0, stdout: "CPU usage: 10.00% user, 5.00% sys, 85.00% idle\n", stderr: "" };
    }
    return { ok: true, status: 0, stdout: "", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    codexMobileLogPath: "/private/logs/codex-mobile-web.out.log",
    fs: {
      statSync(filePath) {
        assert.equal(filePath, "/private/logs/codex-mobile-web.out.log");
        return { isFile: () => true, size: 900 * 1024 ** 2 };
      },
    },
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:04:20.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.codexMobile.available, true);
  assert.equal(snapshot.codexMobile.status, "degraded");
  assert.equal(snapshot.codexMobile.processCount, 4);
  assert.equal(snapshot.codexMobile.totalCpuPercent, 64.1);
  assert.deepEqual(
    snapshot.codexMobile.processes.map((item) => item.role),
    ["codex_app_server", "listener", "app_server_mux", "mcp_server"],
  );
  assert.equal(snapshot.codexMobile.processes[0].label, "Codex app-server");
  assert.equal(snapshot.codexMobile.logs.available, true);
  assert.equal(snapshot.codexMobile.logs.files[0].name, "codex-mobile-web.out.log");
  assert.equal(snapshot.codexMobile.logs.totalSizeBytes, 900 * 1024 ** 2);
  assert.equal(snapshot.signals.some((item) => item.signalId === "codex_mobile_runtime_pressure" && item.status === "degraded"), true);
  assert.equal(snapshot.services.some((item) => item.name === "Codex Mobile Runtime" && item.status === "degraded"), true);
  const json = JSON.stringify(snapshot.codexMobile);
  assert.equal(json.includes("/Users/"), false);
  assert.equal(json.includes("/private/"), false);
  assert.equal(json.includes("secret-value"), false);
  assert.equal(json.includes("launch-token"), false);
  assert.equal(json.includes("key-file"), false);
  assert.equal(json.includes("must-not-leak"), false);
}

async function testCodexMobileRssOnlyPressureIsWarningWhenHostMemoryHealthy() {
  const runner = createRunner((command, args) => {
    if (command.endsWith("launchctl")) {
      const label = String(args[1] || "");
      if (label.endsWith("plugin.codex-mobile")) return { ok: true, status: 0, stdout: "state = running\npid = 902\n", stderr: "" };
      return { ok: true, status: 0, stdout: "state = running\npid = 123\n", stderr: "" };
    }
    if (command.endsWith("memory_pressure")) {
      return {
        ok: true,
        status: 0,
        stdout: "System-wide memory free percentage: 94%",
        stderr: "",
      };
    }
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    if (command.endsWith("top")) {
      return { ok: true, status: 0, stdout: "CPU usage: 5.00% user, 2.00% sys, 93.00% idle\n", stderr: "" };
    }
    if (command.endsWith("ps") && String(args.join(" ")).includes("rss")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 900 10.0 4026032 28:25 /Users/example/path app-server --api-key secret-value",
          " 902 0.1 2500000 02:52 /Users/example/path --launch-token must-not-leak",
          " 903 0.0 85040 27:41 /Users/example/path --key-file /secret/path",
        ].join("\n"),
        stderr: "",
      };
    }
    if (command.endsWith("ps")) {
      return {
        ok: true,
        status: 0,
        stdout: [
          " 900 10.0 /Users/example/path",
          " 902 0.1 /Users/example/path",
        ].join("\n"),
        stderr: "",
      };
    }
    return { ok: true, status: 0, stdout: "", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    os: fakeOs({ totalmem: 1000, freemem: 50 }),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:04:24.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.memory.status, "ok");
  assert.equal(snapshot.memory.percentSource, "memory_pressure");
  assert.equal(snapshot.memory.pressure.freePercent, 94);
  assert.equal(snapshot.codexMobile.status, "warning");
  assert.equal(snapshot.codexMobile.advisoryOnly, true);
  assert.equal(snapshot.status, "warning");
  assert.equal(snapshot.ok, true);
  const runtimeSignal = snapshot.signals.find((item) => item.signalId === "codex_mobile_runtime_pressure");
  assert.equal(runtimeSignal.status, "warning");
  assert.equal(runtimeSignal.boundedEvidence.advisoryOnly, true);
  const json = JSON.stringify(snapshot.codexMobile);
  assert.equal(json.includes("secret-value"), false);
  assert.equal(json.includes("must-not-leak"), false);
  assert.equal(json.includes("/Users/"), false);
}

async function testCodexMobileRuntimeLogGrowthUsesBoundedSecondSample() {
  let size = 1024;
  let now = "2026-07-01T00:04:25.000Z";
  const runner = createRunner((command, args) => {
    if (command.endsWith("launchctl")) return { ok: true, status: 0, stdout: "state = running\npid = 902\n", stderr: "" };
    if (command.endsWith("ps") && String(args.join(" ")).includes("rss")) {
      return { ok: true, status: 0, stdout: " 902 0.1 1000 00:02 /Users/example/path", stderr: "" };
    }
    if (command.endsWith("ps")) return { ok: true, status: 0, stdout: " 902 0.1 node\n", stderr: "" };
    if (command.endsWith("sysctl")) return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    if (command.endsWith("df")) return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    if (command.endsWith("top")) return { ok: true, status: 0, stdout: "CPU usage: 2.00% user, 1.00% sys, 97.00% idle\n", stderr: "" };
    return { ok: true, status: 0, stdout: "", stderr: "" };
  });
  const service = createSystemResourceStatusService({
    codexMobileLogPath: "/private/logs/codex-mobile-web.out.log",
    fs: {
      statSync() {
        return { isFile: () => true, size };
      },
    },
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => now,
    process: { uptime: () => 42 },
  });
  const first = await service.collect();
  assert.equal(first.codexMobile.logs.growthAvailable, false);
  size += 10 * 1024;
  now = "2026-07-01T00:04:35.000Z";
  const second = await service.collect();
  assert.equal(second.codexMobile.logs.growthAvailable, true);
  assert.equal(second.codexMobile.logs.growthBytesPerSecond, 1024);
}

async function testDefaultLaunchdLabelsUseStableResidentServices() {
  const runner = quietRunner();
  const service = createSystemResourceStatusService({
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:04:30.000Z",
    process: { uptime: () => 42 },
  });
  await service.collect();
  const launchdTargets = runner.calls
    .filter((call) => call.command.endsWith("launchctl"))
    .map((call) => call.args[1]);
  assert.deepEqual(launchdTargets, [
    "system/com.hermesmobile.listener",
    "system/com.hermesmobile.bridge-host",
    "system/com.hermesmobile.workspace-system-helper",
    "system/com.hermesmobile.plugin.codex-mobile",
  ]);
  assert.equal(launchdTargets.some((target) => target.includes("com.hermesmobile.homeai")), false);
  assert.equal(launchdTargets.some((target) => target === "system/com.hermesmobile.gateway"), false);
  assert.equal(launchdTargets.some((target) => target === "system/com.hermesmobile.cron"), false);
}

async function testObjectStyleCommandRunnerStillWorks() {
  const calls = [];
  const runner = async ({ command, args, timeoutMs }) => {
    calls.push({ command, args, timeoutMs });
    if (command.endsWith("sysctl")) {
      return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M", stderr: "" };
    }
    if (command.endsWith("df")) {
      return { ok: true, status: 0, stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 1000 100 900 10% /\n", stderr: "" };
    }
    if (command.endsWith("launchctl")) {
      return { ok: true, status: 0, stdout: "state = running\npid = 123\n", stderr: "" };
    }
    return { ok: false, status: 1, stdout: "", stderr: "" };
  };
  const service = createSystemResourceStatusService({
    os: fakeOs(),
    runCommand: runner,
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:04:45.000Z",
    process: { uptime: () => 42 },
  });
  const snapshot = await service.collect();
  assert.equal(snapshot.disk.status, "ok");
  assert.equal(snapshot.launchd.status, "ok");
  assert.equal(calls.some((call) => call.command.endsWith("df") && Array.isArray(call.args)), true);
  assert.equal(calls.some((call) => call.command.endsWith("launchctl") && String(call.args[1]).startsWith("system/")), true);
}

async function testNormalizedSignalShapeAndPrivacyBoundary() {
  const service = createSystemResourceStatusService({
    appRoot: "/secret/app",
    dataRoot: "/secret/data",
    runtimeRoot: "/secret/runtime",
    os: fakeOs(),
    runCommand: quietRunner(),
    thresholds: TEST_DISK_THRESHOLDS,
    nowIso: () => "2026-07-01T00:05:00.000Z",
    process: { uptime: () => 84 },
  });
  const snapshot = await service.collect();
  assert.equal(DEFAULT_SYSTEM_RESOURCE_THRESHOLDS.memory.degradedPercentUsed, 92);
  assert.equal(snapshot.uptime.hostSeconds, 3600);
  assert.equal(snapshot.uptime.processSeconds, 84);
  assert.equal(snapshot.uptime.listenerSeconds, 84);
  assert.equal(snapshot.signals.length >= 4, true);
  for (const signal of snapshot.signals) {
    assert.equal(typeof signal.signalId, "string");
    assert.equal(typeof signal.category, "string");
    assert.match(signal.status, /^(ok|warning|degraded|unknown)$/);
    assert.equal(typeof signal.severity, "string");
    assert.equal(typeof signal.summary, "string");
    assert.equal(typeof signal.boundedEvidence, "object");
    assert.equal(signal.lastCheckedAt, "2026-07-01T00:05:00.000Z");
    assert.equal(typeof signal.source, "string");
    assert.equal(typeof signal.recommendedAction, "string");
    assert.equal(typeof signal.actionRequiresOwnerConfirmation, "boolean");
  }
  const json = JSON.stringify(snapshot);
  assert.equal(json.includes("/secret/"), false);
  assert.equal(json.includes("token"), false);
  assert.equal(json.includes("launchctl print"), false);
  assert.equal(json.includes("df -k"), false);
}

async function main() {
  await testCpuThresholdClassification();
  await testCpuProcessAttributionIsBoundedAndSanitized();
  await testMemoryThresholdClassificationAndSwapParser();
  await testMacMemoryPressureOverridesResidentMemoryForStatus();
  await testDiskParserUsesBoundedLabelsWithoutRawPaths();
  await testDiskFreeSpaceThresholds();
  await testLaunchdParserReportsBoundedStatuses();
  await testCodexMobileRuntimeAttributionIsBoundedAndSanitized();
  await testCodexMobileRssOnlyPressureIsWarningWhenHostMemoryHealthy();
  await testCodexMobileRuntimeLogGrowthUsesBoundedSecondSample();
  await testDefaultLaunchdLabelsUseStableResidentServices();
  await testObjectStyleCommandRunnerStillWorks();
  await testNormalizedSignalShapeAndPrivacyBoundary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
