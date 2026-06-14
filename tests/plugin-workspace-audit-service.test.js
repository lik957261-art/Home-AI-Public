"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPluginWorkspaceAuditService } = require("../adapters/plugin-workspace-audit-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-audit-"));
}

async function testBuildsReadonlyAuditDraftForConfiguredPlugin() {
  const dir = tempDir();
  try {
    const service = createPluginWorkspaceAuditService({
      auditTargets: { "codex-mobile": { path: dir, pathRef: "test-registry" } },
      nowIso: () => "2026-06-14T00:00:00.000Z",
      pluginService: {
        list(input) {
          assert.equal(input.workspaceId, "owner");
          return [{ id: "codex-mobile", title: "Codex" }];
        },
      },
      resolveAutomationCronProfile(payload) {
        assert.equal(payload.job.kind, "plugin_workspace_audit");
        return "hm-owner-openai-1";
      },
    });
    const draft = await service.buildAuditDraft({
      workspaceId: "owner",
      ownerPrincipalId: "principal-owner",
      pluginId: "codex-mobile",
      schedule: "0 22 * * 0",
      auditMode: "dirty_diff",
      instructions: "Focus on recent route changes.",
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.job.kind, "plugin_workspace_audit");
    assert.equal(draft.job.readonly, true);
    assert.equal(draft.job.profile, "hm-owner-openai-1");
    assert.equal(draft.job.audit.workspacePath, fs.realpathSync.native(dir));
    assert.equal(draft.job.audit.workspacePathRef, "test-registry");
    assert.match(draft.job.prompt, /Do not edit files/);
    assert.deepEqual(draft.job.enabled_toolsets, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testBuildsAlignmentManualAuditAndRequestsRun() {
  const dir = tempDir();
  const calls = [];
  try {
    const service = createPluginWorkspaceAuditService({
      auditTargets: { "codex-mobile": { path: dir, pathRef: "test-registry" } },
      nowIso: () => "2026-06-14T00:00:00.000Z",
      pluginService: {
        list() {
          return [{ id: "codex-mobile", title: "Codex" }];
        },
      },
      resolveAutomationCronProfile() {
        return "hm-owner-openai-1";
      },
      automationProvider: {
        createJob(payload) {
          calls.push({ type: "create", payload });
          return Promise.resolve({ ok: true, job: { id: "audit-manual-1" }, source: { name: "hermes_cron" } });
        },
        mutateJob(payload) {
          calls.push({ type: "mutate", payload });
          return Promise.resolve({ ok: true, job: { id: payload.jobId, state: "scheduled" }, source: { name: "hermes_cron", runMode: "next_tick" } });
        },
      },
    });
    const result = await service.triggerManualAudit({
      workspaceId: "owner",
      ownerPrincipalId: "principal-owner",
      pluginId: "codex-mobile",
      instructions: "Check product goals.",
    });
    assert.equal(result.ok, true);
    assert.equal(result.audit.auditMode, "alignment");
    assert.equal(result.audit.triggerMode, "manual");
    assert.match(result.draft.prompt, /design-goal alignment/);
    assert.equal(calls[0].type, "create");
    assert.equal(calls[0].payload.job.schedule, "1m");
    assert.equal(calls[0].payload.job.repeat, 1);
    assert.equal(calls[1].type, "mutate");
    assert.equal(calls[1].payload.action, "run");
    assert.equal(calls[1].payload.jobId, "audit-manual-1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testRejectsUnconfiguredTargetAndNonReadonlyMode() {
  const service = createPluginWorkspaceAuditService({
    pluginService: {
      list() {
        return [{ id: "wardrobe", title: "衣橱" }];
      },
    },
  });
  const missing = await service.buildAuditDraft({
    workspaceId: "owner",
    pluginId: "wardrobe",
    schedule: "0 22 * * 0",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "plugin_audit_target_unconfigured");

  const nonReadonly = await service.buildAuditDraft({
    workspaceId: "owner",
    pluginId: "wardrobe",
    schedule: "0 22 * * 0",
    readonly: false,
  });
  assert.equal(nonReadonly.ok, false);
  assert.equal(nonReadonly.code, "plugin_audit_readonly_required");
}

function testAuditInboxProjectionIsSummaryOnly() {
  const calls = [];
  const service = createPluginWorkspaceAuditService({
    actionInboxService: {
      upsertSourceItem(payload) {
        calls.push(payload);
        return { ok: true, item: payload };
      },
    },
  });
  const result = service.upsertAuditInboxItem({
    workspaceId: "owner",
    pluginId: "codex-mobile",
    auditRunId: "run-1",
    severity: "high",
    findingCount: 2,
    title: "Codex audit needs review",
    summary: "2 high-risk findings.",
    sourceRef: {
      reportUrl: "/api/automations/output?jobId=job-1&file=run.md",
      rawDiff: "must not be copied",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sourceType, "automation");
  assert.equal(calls[0].itemType, "review");
  assert.equal(calls[0].priority, "high");
  assert.equal(calls[0].sourceRef.kind, "plugin_workspace_audit");
  assert.equal(calls[0].sourceRef.pluginId, "codex-mobile");
  assert.equal(calls[0].sourceRef.auditRunId, "run-1");
  assert.equal(calls[0].sourceRef.findingCount, 2);
  assert.equal(calls[0].sourceRef.rawDiff, undefined);
  assert.equal(calls[0].summary, "2 high-risk findings.");
}

(async () => {
  await testBuildsReadonlyAuditDraftForConfiguredPlugin();
  await testBuildsAlignmentManualAuditAndRequestsRun();
  await testRejectsUnconfiguredTargetAndNonReadonlyMode();
  testAuditInboxProjectionIsSummaryOnly();
  console.log("plugin-workspace-audit-service tests passed");
})();
