"use strict";

const assert = require("node:assert/strict");
const {
  createWorkspaceConsoleService,
  codexWorkspaceStatus,
  localWorkspaceStatus,
  normalizeCodexWorkspaceTargets,
  remoteWorkspaceStatus,
  worstStatus,
} = require("../adapters/workspace-console-service");

function remoteEntry(overrides = {}) {
  return {
    workspace: {
      workspaceId: "remote-vite-game",
      nodeId: "node-a",
      nodeName: "Remote Game Node",
      projectRootLabel: "vite-game",
      projectType: "vite-game",
      contractVersion: "remote-managed-workspace-v1",
      lastHeartbeatAt: "2026-07-08T03:00:00.000Z",
      session: {
        state: "connected",
        lastSeenAt: "2026-07-08T03:00:00.000Z",
        mode: "poll",
        activeLongPollCount: 1,
      },
    },
    activeTaskCardCount: 1,
    activeTaskCards: [
      {
        taskCardId: "ttc_remote_1",
        status: "acknowledged",
        title: "Bounded remote task",
        summary: "Short status",
        updatedAt: "2026-07-08T03:02:00.000Z",
      },
    ],
    latestDailySummary: {
      at: "2026-07-08T02:00:00.000Z",
      summary: "Daily summary ready",
      endpointBody: "must not surface",
    },
    escalationCount: 0,
    latestEscalation: null,
    ...overrides,
  };
}

async function testSummaryUsesCodexWorkspaceSectionsAndHidesLocalProjection() {
  const service = createWorkspaceConsoleService({
    nowIso: () => "2026-07-08T04:00:00.000Z",
    codexWorkspaceTargets: {
      "home-ai": {
        label: "Home AI",
        targetWorkspace: "/Users/example/path",
        targetThreadTitlePrefix: "Home AI",
        workerLaneTitle: "Home AI Worker Lane A",
      },
      music: {
        label: "Music",
        targetWorkspace: "/Users/example/path",
        targetThreadId: "019f_music",
        targetThreadTitle: "Music",
        workerLaneTitlePrefix: "Music Worker",
      },
    },
    codexWorkspaceActivity: {
      music: {
        activeTaskCardCount: 2,
        pendingApprovalCount: 1,
        latestTerminalReturn: {
          taskCardId: "ttc_music",
          status: "completed",
          title: "Music completed",
          endpointBody: "must not surface",
        },
        latestDailySummary: {
          at: "2026-07-08T02:00:00.000Z",
          status: "ready",
          summary: "Music daily summary",
        },
      },
    },
    listLocalWorkspaces: () => [
      {
        id: "owner",
        label: "Home AI local account",
        role: "owner",
        source: "local-workspace",
        defaultWorkspace: "/Users/example/path",
        accessKeyStatus: { hasKey: true },
        workDirectories: [{ path: "/Users/example/path" }],
        bindings: [{ pluginId: "note" }],
      },
    ],
    remoteManagedWorkspaceService: {
      status: () => ({
        ok: true,
        controlPlane: {
          outboundOnly: true,
          sessionDesign: "bounded_long_poll",
          enrollment: { state: "ok" },
        },
        workspaces: [remoteEntry()],
      }),
    },
  });

  const summary = await service.summary();
  assert.equal(summary.consoleVersion, "20260708-codex-workspace-console-v2");
  assert.equal(summary.generatedAt, "2026-07-08T04:00:00.000Z");
  assert.equal(summary.sections.local, undefined);
  assert.equal(summary.sections.remote, undefined);
  assert.equal(summary.sections.localCodex.title, "本机 Codex 工作区");
  assert.equal(summary.sections.remoteCodex.title, "远程 Codex 工作区");
  assert.equal(summary.counts.localCodex, summary.sections.localCodex.items.length);
  assert.equal(summary.counts.remoteCodex, 1);
  assert.ok(summary.sections.localCodex.items.some((item) => item.id === "home-ai"));
  const music = summary.sections.localCodex.items.find((item) => item.id === "music");
  assert.equal(music.kind, "local_codex");
  assert.equal(music.activeTaskCardCount, 2);
  assert.equal(music.pendingApprovalCount, 1);
  assert.equal(music.latestTerminalReturn.taskCardId, "ttc_music");
  assert.equal(JSON.stringify(music).includes("endpointBody"), false);
  assert.equal(summary.sections.remoteCodex.items[0].kind, "remote_codex");
  assert.equal(summary.sections.remoteCodex.items[0].status, "online");
  assert.equal(summary.sections.remoteCodex.controlPlane.sessionDesign, "bounded_long_poll");
  assert.equal(summary.diagnostics.adminLocalWorkspaceProjection.hidden, true);
  assert.equal(summary.diagnostics.adminLocalWorkspaceProjection.intendedSurface, "navigation_workspace_plugin_management_rebuild");
  assert.equal(summary.diagnostics.adminLocalWorkspaceProjection.count, 1);
  assert.equal(JSON.stringify(summary).includes("/Users/example/path"), false);
  assert.equal(summary.policy.ownerOnly, true);
  assert.equal(summary.policy.actionExecutionEnabled, false);
}

function testCodexWorkspaceTargetRegistryDeduplicatesAliasesAndReportsMissingLane() {
  const targets = normalizeCodexWorkspaceTargets({
    healthy: {
      label: "Health duplicate",
      targetWorkspace: "/Users/example/path",
      targetThreadTitle: "健康",
    },
    custom: {
      label: "Custom",
      targetWorkspace: "/Users/example/path",
    },
  });
  assert.equal(targets.filter((item) => item.pluginId === "health").length, 1);
  assert.ok(targets.some((item) => item.pluginId === "codex-mobile"));

  const row = codexWorkspaceStatus({
    pluginId: "custom",
    label: "Custom",
    targetWorkspace: "/Users/example/path",
  });
  assert.equal(row.kind, "local_codex");
  assert.equal(row.status, "warning");
  assert.ok(row.issueCodes.includes("codex_workspace_thread_unresolved"));
  assert.ok(row.issueCodes.includes("worker_lane_missing"));
  assert.equal(row.cwdLabel, ".../private/custom");
  assert.equal(JSON.stringify(row).includes("/Users/example/path"), false);
}

function testRemoteEscalationCanBlockCodexRowWithoutLeakingPayloads() {
  const row = remoteWorkspaceStatus(remoteEntry({
    escalationCount: 1,
    latestEscalation: {
      severity: "high",
      summary: "Needs owner attention",
      endpointBody: "private body",
    },
  }));
  assert.equal(row.kind, "remote_codex");
  assert.equal(row.status, "blocked");
  assert.equal(row.escalationCount, 1);
  assert.equal(row.latestEscalation.summary, "Needs owner attention");
  assert.equal(JSON.stringify(row).includes("endpointBody"), false);
}

function testLocalProjectionStillExistsAsBoundedHiddenBuildingBlock() {
  const row = localWorkspaceStatus({
    id: "child",
    label: "Child",
    defaultWorkspace: "/Users/example/path",
    accessKeyStatus: { hasKey: true },
    workDirectories: [{ path: "/Users/example/path" }],
    bindings: [],
  });
  assert.equal(row.status, "ok");
  assert.equal(row.kind, "local");
  assert.equal(row.identityLabel, ".../private/ChildWorkspace");
  assert.equal(JSON.stringify(row).includes("/Users/example/path"), false);
}

function testWorstStatusOrdering() {
  assert.equal(worstStatus(["online", "ok"]), "ok");
  assert.equal(worstStatus(["online", "stale"]), "stale");
  assert.equal(worstStatus(["offline", "pending"]), "offline");
  assert.equal(worstStatus(["blocked", "offline"]), "blocked");
}

async function main() {
  await testSummaryUsesCodexWorkspaceSectionsAndHidesLocalProjection();
  testCodexWorkspaceTargetRegistryDeduplicatesAliasesAndReportsMissingLane();
  testRemoteEscalationCanBlockCodexRowWithoutLeakingPayloads();
  testLocalProjectionStillExistsAsBoundedHiddenBuildingBlock();
  testWorstStatusOrdering();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
