"use strict";

const assert = require("node:assert/strict");
const {
  createOwnerSystemConsoleService,
  normalizeSignal,
  severityForStatus,
  worstStatus,
} = require("../adapters/owner-system-console-service");

function runtimeSloModel(overrides = {}) {
  return Object.assign({
    ok: true,
    modelVersion: "test-runtime-slo",
    signalCount: 21,
    unmappedSignalIds: [],
    dimensions: [
      {
        id: "availability",
        signalIds: [
          "system_resource_health",
          "gateway_profile_health",
          "deploy_lane_liveness",
          "plugin_proxy_latency",
          "media_preview_health",
          "native_bridge_capability",
          "notification_delivery",
          "install_upgrade_canary",
          "public_upgrade_rehearsal",
        ],
      },
      {
        id: "accuracy",
        signalIds: [
          "mcp_schema_closure",
          "composer_runtime_feedback",
          "gateway_document_tool_capability",
          "plugin_proxy_workspace_boundary",
          "plugin_manifest_health",
          "plugin_action_metadata_health",
        ],
      },
      {
        id: "autonomy",
        signalIds: [
          "task_card_dispatch",
          "plugin_deploy_contract_closure",
          "audit_thread_liveness",
          "automation_cron_health",
          "production_self_diagnostics",
          "runtime_slo_coverage",
        ],
      },
    ],
    policy: {
      closureRequiresReadback: true,
      noRestartAsClosure: true,
      noSilentFallback: true,
      selfCheckAutomationMayAutoDispatch: true,
      ownerGateForFeatureOrCapabilityRequests: true,
    },
  }, overrides);
}

async function testRollupFromSystemStatusAndRuntimeSlo() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({
      schemaVersion: 1,
      overallStatus: "warning",
      cpu: { overallPercent: 76 },
      memory: { percentUsed: 55 },
      signals: [
        {
          signalId: "host_cpu_pressure",
          category: "host_cpu",
          status: "warning",
          summary: "CPU load is high",
          boundedEvidence: { overallPercent: 76, rawPath: "/private/path/must-not-be-here" },
          lastCheckedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    }),
  });

  const overview = await service.overview();
  assert.equal(overview.ok, false);
  assert.equal(overview.consoleVersion, "20260701-owner-system-console-v1");
  assert.equal(overview.overallStatus, "warning");
  assert.equal(overview.overallSeverity, "H2");
  assert.equal(overview.dimensions.length, 3);
  assert.equal(overview.dimensions.find((item) => item.category === "availability").status, "warning");
  assert.equal(overview.dimensions.find((item) => item.category === "accuracy").status, "ok");
  assert.equal(overview.dimensions.find((item) => item.category === "autonomy").status, "ok");
  assert.equal(overview.qualityProgram.status, "warning");
  assert.equal(overview.qualityProgramEvidence.status, "unknown");
  assert.equal(overview.qualityProgram.gaps.some((item) => item.requirementId === "clean_target_live_canary"), true);
  assert.equal(overview.criticalSignals.some((item) => item.signalId === "host_cpu_pressure"), true);
  assert.equal(JSON.stringify(overview).includes("/private/path"), false);
  assert.equal(overview.systemStatus.signals[0].boundedEvidence.rawPath, "redacted");
  assert.equal(overview.pages.find((item) => item.id === "system-status").status, "warning");
  assert.deepEqual(overview.policy, {
    ownerOnly: true,
    readOnlyMvp: true,
    actionExecutionEnabled: false,
    boundedMetadataOnly: true,
  });
}

async function testAdvisoryCodexMobileRssWarningDoesNotDegradeOverview() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:10.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({
      schemaVersion: 1,
      overallStatus: "warning",
      cpu: { overallPercent: 12, status: "ok" },
      memory: { percentUsed: 18, status: "ok" },
      disk: { usedPercent: 20, status: "ok" },
      signals: [
        {
          signalId: "codex_mobile_runtime_pressure",
          category: "plugin_runtime",
          status: "warning",
          summary: "Codex Mobile RSS is high while host memory pressure is healthy.",
          boundedEvidence: {
            advisoryOnly: true,
            totalCpuPercent: 2,
            totalRssBytes: 4 * 1024 ** 3,
          },
          lastCheckedAt: "2026-07-01T00:00:10.000Z",
        },
      ],
    }),
  });

  const overview = await service.overview();
  assert.equal(overview.overallStatus, "ok");
  assert.equal(overview.ok, true);
  assert.equal(overview.systemStatus.overallStatus, "warning");
  assert.equal(overview.dimensions.find((item) => item.category === "availability").status, "ok");
  assert.equal(overview.pages.find((item) => item.id === "system-status").status, "ok");
  assert.equal(
    overview.criticalSignals.some((item) => item.signalId === "codex_mobile_runtime_pressure"),
    false,
  );
  assert.equal(
    overview.systemStatus.signals.some((item) => item.signalId === "codex_mobile_runtime_pressure" && item.boundedEvidence.advisoryOnly === true),
    true,
  );
}

async function testNonAdvisoryCodexMobileWarningStillDegradesOverview() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:20.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({
      schemaVersion: 1,
      overallStatus: "warning",
      cpu: { overallPercent: 12, status: "ok" },
      memory: { percentUsed: 18, status: "ok" },
      disk: { usedPercent: 20, status: "ok" },
      signals: [
        {
          signalId: "codex_mobile_runtime_pressure",
          category: "plugin_runtime",
          status: "warning",
          summary: "Codex Mobile CPU is high.",
          boundedEvidence: {
            advisoryOnly: false,
            maxProcessCpuPercent: 24,
          },
          lastCheckedAt: "2026-07-01T00:00:20.000Z",
        },
      ],
    }),
  });

  const overview = await service.overview();
  assert.equal(overview.overallStatus, "warning");
  assert.equal(overview.dimensions.find((item) => item.category === "availability").status, "warning");
  assert.equal(
    overview.criticalSignals.some((item) => item.signalId === "codex_mobile_runtime_pressure"),
    true,
  );
}

async function testRuntimeSloCoverageAffectsAccuracyAndAutonomy() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel({
      ok: false,
      unmappedSignalIds: ["missing_signal"],
      policy: {
        selfCheckAutomationMayAutoDispatch: false,
        ownerGateForFeatureOrCapabilityRequests: true,
      },
    }),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
  });

  const overview = await service.overview();
  assert.equal(overview.overallStatus, "degraded");
  assert.equal(overview.dimensions.find((item) => item.category === "accuracy").status, "degraded");
  assert.equal(overview.dimensions.find((item) => item.category === "autonomy").status, "warning");
  assert.equal(overview.criticalSignals.some((item) => item.signalId === "owner_console_accuracy"), true);
  assert.equal(overview.qualityProgram.workstreams.find((item) => item.id === "runtime_slo_diagnostic_closure").status, "degraded");
}

async function testQualityProgramBuilderCanBeInjected() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    qualityProgramBuilder: ({ runtimeSloModel }) => ({
      status: "ok",
      progressPercent: 100,
      runtimeSloModelVersion: runtimeSloModel.modelVersion,
      workstreams: [],
      gaps: [],
    }),
  });
  const overview = await service.overview();
  assert.equal(overview.qualityProgram.status, "ok");
  assert.equal(overview.qualityProgram.progressPercent, 100);
  assert.equal(overview.qualityProgram.runtimeSloModelVersion, "test-runtime-slo");
}

async function testQualityEvidenceFeedsQualityProgramWithoutRunningChecks() {
  let collected = 0;
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectQualityProgramEvidence: async () => {
      collected += 1;
      return {
        evidenceVersion: "20260701-owner-3a-quality-evidence-v2",
        status: "ok",
        signals: [],
        extraEvidence: {
          installUpgradeCanaryObservedStatus: "ok",
          cleanInstallCanaryStatus: "ok",
          cleanTargetCanary: {
            mode: "execute",
            freshInstallRehearsalOk: true,
            freshInstallTempRemoved: true,
            publicUpgradePlanOk: true,
            publicUpgradePlanTempRootOnly: true,
            productionWrites: false,
          },
          wardrobeReferenceActionStatus: "ok",
        },
      };
    },
  });
  const overview = await service.overview();
  assert.equal(collected, 1);
  assert.equal(overview.qualityProgramEvidence.status, "ok");
  assert.equal(
    overview.qualityProgram.gaps.some((item) => item.requirementId === "install_upgrade_canary_observed"),
    false,
  );
  assert.equal(
    overview.qualityProgram.gaps.some((item) => item.requirementId === "wardrobe_reference_action_contract"),
    false,
  );
  assert.equal(overview.qualityProgram.gaps.some((item) => item.requirementId === "clean_target_live_canary"), false);
  assert.equal(overview.qualityProgram.gaps.some((item) => item.requirementId === "deterministic_action_generalization"), true);
}

async function testQualityEvidenceClosesDeterministicActionGeneralization() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectQualityProgramEvidence: async () => ({
      evidenceVersion: "20260701-owner-3a-quality-evidence-v2",
      status: "ok",
      signals: [],
      extraEvidence: {
        installUpgradeCanaryObservedStatus: "ok",
        cleanInstallCanaryStatus: "ok",
        cleanTargetCanary: {
          mode: "execute",
          freshInstallRehearsalOk: true,
          freshInstallTempRemoved: true,
          publicUpgradePlanOk: true,
          publicUpgradePlanTempRootOnly: true,
          productionWrites: false,
        },
        wardrobeReferenceActionStatus: "ok",
        pluginActionReference: {
          pluginId: "wardrobe",
          actionKind: "wardrobeOutfitWearIntent",
        },
        deterministicActionGeneralizationStatus: "ok",
        deterministicActionGeneralization: {
          actionFamilyCount: 3,
          generalizedActionFamilyCount: 2,
          actionClassCount: 3,
          actionClasses: ["mcp_intent_action", "owner_task_card_action", "manifest_route_action"],
        },
      },
    }),
  });
  const overview = await service.overview();
  assert.equal(overview.qualityProgram.status, "ok");
  assert.equal(overview.qualityProgram.progressPercent, 100);
  assert.equal(overview.qualityProgram.gaps.some((item) => item.requirementId === "deterministic_action_generalization"), false);
  const actionWorkstream = overview.qualityProgram.workstreams.find((item) => item.id === "gateway_message_action_contract");
  const generalization = actionWorkstream.requirements.find((item) => item.id === "deterministic_action_generalization");
  assert.equal(generalization.boundedEvidence.actionFamilyCount, 3);
  assert.deepEqual(generalization.boundedEvidence.actionClasses, [
    "mcp_intent_action",
    "owner_task_card_action",
    "manifest_route_action",
  ]);
}

async function testAutonomousDeliveryDispatchControlAffectsAutonomy() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectAutonomousDeliveryControl: async () => ({
      status: "degraded",
      workspaceId: "owner",
      counts: { failed: 1, deferredConflict: 2, dispatching: 0, sent: 1 },
      items: [{
        caseId: "delivery_1",
        sliceId: "slice_1",
        sliceKey: "note_repair",
        dispatchStatus: "failed",
        failureCode: "target_thread_not_visible",
        targetWorkspacePath: "/Users/example/path",
      }],
      policy: { readOnlySummary: true, retryViaActionInbox: true },
    }),
    collectAutonomousDeliveryLoop: async () => ({
      status: "warning",
      workspaceId: "owner",
      counts: {
        open: 3,
        dispatched: 2,
        waitingReturn: 1,
        blocked: 0,
        duplicateSuppressed: 2,
        verifiedClosed: 4,
      },
      items: [{
        caseId: "delivery_1",
        status: "running",
        dispatchStatus: "sent",
        blockedReason: "/Users/example/path",
      }],
      policy: { boundedMetadataOnly: true, duplicateSuppressionVisible: true },
    }),
  });

  const overview = await service.overview();
  assert.equal(overview.ok, false);
  assert.equal(overview.overallStatus, "degraded");
  assert.equal(overview.dimensions.find((item) => item.category === "autonomy").status, "degraded");
  assert.equal(overview.autonomousDeliveryControl.status, "degraded");
  assert.equal(overview.autonomousDeliveryControl.counts.failed, 1);
  assert.equal(overview.autonomousDeliveryLoop.status, "warning");
  assert.equal(overview.autonomousDeliveryLoop.counts.waitingReturn, 1);
  assert.equal(overview.autonomousDeliveryLoop.counts.duplicateSuppressed, 2);
  assert.equal(overview.criticalSignals.some((item) => item.signalId === "owner_console_autonomous_delivery_dispatch"), true);
  assert.equal(overview.criticalSignals.some((item) => item.signalId === "owner_console_autonomous_delivery_loop"), true);
  assert.doesNotMatch(JSON.stringify(overview), /must-not-leak/);
}

async function testLoopEngineeringStatusFeedsAutonomyAndCriticalSignals() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-03T10:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectQualityProgramEvidence: async () => ({}),
    collectLoopEngineeringStatus: async () => ({
      status: "blocked",
      counts: { open: 1, blocked: 1, waitingReturn: 1, duplicateSuppressed: 0, verifiedClosed: 2 },
      itemCount: 1,
      items: [{
        loopId: "loop_home_ai_1",
        target: "home-ai",
        status: "blocked",
        currentRole: "implementation",
        blockedReason: "/Users/example/path",
      }],
      policy: { readOnlySummary: true, codexMobileRuntime: true },
    }),
  });
  const overview = await service.overview({ ownerAuth: { workspaceId: "owner" } });
  assert.equal(overview.overallStatus, "blocked");
  assert.equal(overview.loopEngineeringStatus.status, "blocked");
  assert.equal(overview.loopEngineeringStatus.counts.waitingReturn, 1);
  assert.equal(overview.dimensions.find((item) => item.category === "autonomy").status, "blocked");
  assert.equal(overview.criticalSignals.some((item) => item.signalId === "owner_console_loop_engineering_runtime"), true);
  assert.doesNotMatch(JSON.stringify(overview), /must-not-leak/);
}

async function testRejectedLoopEngineeringRowIsAdvisoryWarningNotBlocked() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-06T03:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({
      overallStatus: "warning",
      signals: [{
        signalId: "codex_mobile_runtime_pressure",
        category: "plugin_runtime",
        status: "warning",
        summary: "Codex Mobile RSS pressure is visible but host memory is healthy.",
      }],
    }),
    collectQualityProgramEvidence: async () => ({}),
    collectLoopEngineeringStatus: async () => ({
      status: "blocked",
      counts: { open: 1, blocked: 1, waitingReturn: 0, duplicateSuppressed: 0, verifiedClosed: 2 },
      itemCount: 1,
      items: [{
        loopId: "loop_e5148ad7ed0b6fae",
        target: "home-ai",
        status: "rejected",
        blockedReason: "at_loop_dispatch_failed",
        updatedAt: "2026-07-04T16:13:44.493Z",
      }],
      policy: { readOnlySummary: true, codexMobileRuntime: true },
    }),
  });

  const overview = await service.overview({ ownerAuth: { workspaceId: "owner" } });
  assert.equal(overview.overallStatus, "warning");
  assert.equal(overview.loopEngineeringStatus.status, "warning");
  assert.equal(overview.loopEngineeringStatus.counts.blocked, 0);
  assert.equal(overview.loopEngineeringStatus.counts.advisoryBlocked, 1);
  assert.equal(overview.dimensions.find((item) => item.category === "autonomy").status, "warning");
  const signal = overview.criticalSignals.find((item) => item.signalId === "owner_console_loop_engineering_runtime");
  assert.equal(signal.status, "warning");
  assert.equal(signal.severity, "H2");
  assert.match(signal.summary, /信息性提醒/);
}

async function testAutonomousDeliveryCoordinatorCollectorUsesOwnerAuthWorkspace() {
  const calls = [];
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectQualityProgramEvidence: async () => ({}),
    autonomousDeliveryCoordinatorService: {
      async dispatchControlSummary(args) {
        calls.push(["control", args.workspaceId]);
        return {
          status: "ok",
          workspaceId: args.workspaceId,
          counts: {},
          items: [],
        };
      },
      async deliveryLoopStatusSummary(args) {
        calls.push(["loop", args.workspaceId]);
        return {
          status: "ok",
          workspaceId: args.workspaceId,
          counts: {},
          items: [],
        };
      },
    },
  });

  const overview = await service.overview({ ownerAuth: { workspaceId: "mk" } });
  assert.equal(overview.autonomousDeliveryControl.workspaceId, "mk");
  assert.equal(overview.autonomousDeliveryLoop.workspaceId, "mk");
  assert.deepEqual(calls, [
    ["control", "mk"],
    ["loop", "mk"],
  ]);

  const noContextCalls = [];
  const noContextService = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    collectSystemStatus: async () => ({ overallStatus: "ok", signals: [] }),
    collectQualityProgramEvidence: async () => ({}),
    autonomousDeliveryCoordinatorService: {
      async dispatchControlSummary(args) {
        noContextCalls.push(["control", args.workspaceId]);
        return { status: "ok", workspaceId: args.workspaceId, counts: {}, items: [] };
      },
      async deliveryLoopStatusSummary(args) {
        noContextCalls.push(["loop", args.workspaceId]);
        return { status: "ok", workspaceId: args.workspaceId, counts: {}, items: [] };
      },
    },
  });
  await noContextService.overview();
  assert.deepEqual(noContextCalls, []);
}

async function testDefaultSystemResourceCollectorFeedsAvailability() {
  const commandCalls = [];
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    appRoot: "/",
    dataDir: "/",
    runtimeRoot: "/",
    systemResourceOs: {
      cpus: () => [{}, {}, {}, {}],
      freemem: () => 8 * 1024 ** 3,
      loadavg: () => [0.4, 0.5, 0.6],
      totalmem: () => 16 * 1024 ** 3,
      uptime: () => 3600,
    },
    process: { uptime: () => 120 },
    ownerSystemConsoleLaunchdLabels: ["com.hermesmobile.listener"],
    systemResourceRunCommand: async ({ command }) => {
      commandCalls.push(command);
      if (command === "/usr/bin/top") {
        return { ok: true, status: 0, stdout: "CPU usage: 8.00% user, 4.00% sys, 88.00% idle\n" };
      }
      if (command === "/bin/ps") {
        return { ok: true, status: 0, stdout: " 101 2.5 /usr/bin/node\n 102 1.5 /usr/bin/launchd\n" };
      }
      if (command === "/usr/bin/memory_pressure") {
        return { ok: true, status: 0, stdout: "System-wide memory free percentage: 65%\n" };
      }
      if (command === "/usr/sbin/sysctl") {
        return { ok: true, status: 0, stdout: "vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M\n" };
      }
      if (command === "/bin/df") {
        return {
          ok: true,
          status: 0,
          stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk1s1 100000000 50000000 50000000 50% /\n",
        };
      }
      if (command === "/bin/launchctl") {
        return { ok: true, status: 0, stdout: "state = running\npid = 42\n" };
      }
      return { ok: false, status: 127, stdout: "", stderr: "unexpected command" };
    },
  });

  const overview = await service.overview();
  assert.equal(overview.systemStatus.overallStatus, "ok");
  assert.equal(overview.dimensions.find((item) => item.category === "availability").status, "ok");
  assert.equal(
    overview.systemStatus.signals.some((item) => item.signalId === "owner_console_system_resource_not_collected"),
    false,
  );
  assert.ok(commandCalls.includes("/usr/bin/top"));
  assert.ok(commandCalls.includes("/bin/df"));
}

async function testSystemStatusFallbackWhenCollectorMissing() {
  const service = createOwnerSystemConsoleService({
    nowIso: () => "2026-07-01T00:00:00.000Z",
    runtimeSloModelBuilder: () => runtimeSloModel(),
    disableDefaultSystemResourceStatusService: true,
  });
  const systemStatus = await service.systemStatus();
  assert.equal(systemStatus.overallStatus, "unknown");
  assert.equal(systemStatus.signals[0].signalId, "owner_console_system_resource_not_collected");
  assert.equal(systemStatus.signals[0].status, "unknown");
}

function testSignalNormalizationAndStatusRanking() {
  assert.equal(worstStatus(["ok", "warning", "stale"]), "warning");
  assert.equal(worstStatus(["ok", "blocked", "degraded"]), "blocked");
  assert.equal(severityForStatus("degraded"), "H1");
  assert.equal(severityForStatus("warning"), "H2");
  const signal = normalizeSignal({
    signal_id: "example_signal",
    category: "host_cpu",
    status: "healthy",
    evidence: { count: 1, list: ["a", "b"], nested: { ok: true } },
    action_requires_owner_confirmation: true,
  });
  assert.equal(signal.status, "ok");
  assert.equal(signal.severity, "H3");
  assert.equal(signal.actionRequiresOwnerConfirmation, true);
  assert.deepEqual(signal.boundedEvidence.nested, { ok: true });
}

async function run() {
  testSignalNormalizationAndStatusRanking();
  await testRollupFromSystemStatusAndRuntimeSlo();
  await testAdvisoryCodexMobileRssWarningDoesNotDegradeOverview();
  await testNonAdvisoryCodexMobileWarningStillDegradesOverview();
  await testRuntimeSloCoverageAffectsAccuracyAndAutonomy();
  await testQualityProgramBuilderCanBeInjected();
  await testQualityEvidenceFeedsQualityProgramWithoutRunningChecks();
  await testQualityEvidenceClosesDeterministicActionGeneralization();
  await testAutonomousDeliveryDispatchControlAffectsAutonomy();
  await testLoopEngineeringStatusFeedsAutonomyAndCriticalSignals();
  await testRejectedLoopEngineeringRowIsAdvisoryWarningNotBlocked();
  await testAutonomousDeliveryCoordinatorCollectorUsesOwnerAuthWorkspace();
  await testDefaultSystemResourceCollectorFeedsAvailability();
  await testSystemStatusFallbackWhenCollectorMissing();
  console.log("owner system console service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
