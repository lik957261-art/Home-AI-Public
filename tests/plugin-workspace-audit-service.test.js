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

async function testBuildsProductRealityManualAuditAndRequestsRun() {
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
      auditRequestCardService: {
        sendTaskCard(payload) {
          calls.push({ type: "task-card", payload });
          return Promise.resolve({
            ok: true,
            sourceThreadId: "home-ai-current",
            targetThreadId: "plugin-audit-current",
            cardIds: ["ttc_audit_1"],
            targetThread: { title: "Plugin Workspace Audit", cwd: "/Users/example/path" },
            result: { ok: true, cardCount: 1 },
          });
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
    assert.equal(result.audit.auditMode, "product_reality");
    assert.equal(result.audit.triggerMode, "manual");
    assert.equal(result.draft.profile, "hm-owner-openai-xhigh");
    assert.match(result.draft.prompt, /product reality alignment/);
    assert.match(result.draft.prompt, /agent\.reasoning_effort=xhigh/);
    assert.match(result.draft.prompt, /delivery\.reasoningEffort=xhigh/);
    assert.match(result.draft.prompt, /injectionRuntime\.reasoningEffort=xhigh/);
    assert.match(result.draft.prompt, /deep-product-reality-audit-contract\.md/);
    assert.match(result.draft.prompt, /Product Thesis and Core Journey Matrix/);
    assert.match(result.draft.prompt, /Challenge the design itself/);
    assert.match(result.draft.prompt, /surface_product_reality/);
    assert.match(result.draft.prompt, /Do not stop after one or two convenient small findings/);
    assert.match(result.draft.prompt, /Return Card Required/);
    assert.match(result.draft.prompt, /closure verification/);
    assert.equal(result.requestCard.targetThreadId, "plugin-audit-current");
    assert.deepEqual(result.requestCard.cardIds, ["ttc_audit_1"]);
    assert.equal(result.source.name, "codex_mobile_task_card");
    assert.equal(result.source.dispatch, "central_audit_thread");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "task-card");
    assert.equal(calls[0].payload.targetThreadTitle, "Plugin Workspace Audit");
    assert.equal(calls[0].payload.reasoningEffort, "xhigh");
    assert.match(calls[0].payload.body, /Home AI is only the request trigger/);
    assert.match(calls[0].payload.body, /central `Plugin Workspace Audit` thread only/);
    assert.match(calls[0].payload.body, /Required reasoning effort: `xhigh`/);
    assert.match(calls[0].payload.body, /delivery\.reasoningEffort=xhigh/);
    assert.match(calls[0].payload.body, /injectionRuntime\.reasoningEffort=xhigh/);
    assert.match(calls[0].payload.body, /hm-owner-openai-xhigh/);
    assert.match(calls[0].payload.body, /Domain\/State Contract Review/);
    assert.match(calls[0].payload.body, /Design Critique/);
    assert.match(calls[0].payload.body, /Deployment-only plugin residuals belong to the plugin implementation thread/);
    assert.match(calls[0].payload.body, /deploy:macos -- --plugin <plugin-id>/);
    assert.match(calls[0].payload.body, /Return Card Required/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testBuildsHomeAiPlatformAuditAndRequestsPlatformThread() {
  const dir = tempDir();
  const calls = [];
  try {
    const service = createPluginWorkspaceAuditService({
      auditTargets: { "home-ai": { path: dir, pathRef: "test-home-ai-registry" } },
      nowIso: () => "2026-06-26T00:00:00.000Z",
      auditRequestCardService: {
        sendTaskCard(payload) {
          calls.push({ type: "task-card", payload });
          return Promise.resolve({
            ok: true,
            sourceThreadId: "home-ai-current",
            targetThreadId: "platform-audit-current",
            cardIds: ["ttc_platform_audit_1"],
            targetThread: { title: "Home AI Platform Audit", cwd: "/Users/example/path" },
            result: { ok: true, cardCount: 1 },
          });
        },
      },
    });
    const result = await service.triggerManualAudit({
      workspaceId: "owner",
      ownerPrincipalId: "principal-owner",
      pluginId: "home-ai",
      instructions: "Audit host Action Inbox routing.",
    });
    assert.equal(result.ok, true);
    assert.equal(result.audit.pluginId, "home-ai");
    assert.equal(result.audit.pluginTitle, "Home AI 宿主");
    assert.equal(result.audit.targetKind, "platform");
    assert.equal(result.audit.targetThreadTitle, "Home AI Platform Audit");
    assert.equal(result.audit.workspacePathRef, "test-home-ai-registry");
    assert.equal(result.requestCard.targetThreadId, "platform-audit-current");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.auditKind, "platform");
    assert.equal(calls[0].payload.targetThreadTitle, "Home AI Platform Audit");
    assert.equal(calls[0].payload.reasoningEffort, "xhigh");
    assert.match(calls[0].payload.body, /central `Home AI Platform Audit` thread only/);
    assert.doesNotMatch(calls[0].payload.body, /central `Plugin Workspace Audit` thread only/);
    assert.match(calls[0].payload.body, /target_kind: platform/);
    assert.match(calls[0].payload.body, /platform_title: Home AI/);
    assert.match(result.draft.prompt, /Home AI host\/platform workspace/);
    assert.match(result.draft.prompt, /audit-thread-governance-contract\.md/);
    assert.match(result.draft.prompt, /Do not use `\.agent-context\/HANDOFF\.md`/);
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
      latestDeliverable: {
        name: "run.md",
        url: "/api/automations/output?jobId=job-1&file=run.md",
        mime: "text/markdown; charset=utf-8",
      },
      latestDocumentName: "run.md",
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
  assert.equal(calls[0].sourceRef.auditMode, "product_reality");
  assert.equal(calls[0].sourceRef.findingCount, 2);
  assert.equal(calls[0].dedupeKey, "plugin-audit:owner:codex-mobile:product_reality:review");
  assert.equal(calls[0].sourceRef.latestDeliverable.name, "run.md");
  assert.equal(calls[0].sourceRef.latestDeliverable.url, "/api/automations/output?jobId=job-1&file=run.md");
  assert.equal(calls[0].sourceRef.latestDocumentName, "run.md");
  assert.equal(calls[0].sourceRef.rawDiff, undefined);
  assert.equal(calls[0].summary, "2 high-risk findings.");
}

(async () => {
  await testBuildsReadonlyAuditDraftForConfiguredPlugin();
  await testBuildsProductRealityManualAuditAndRequestsRun();
  await testBuildsHomeAiPlatformAuditAndRequestsPlatformThread();
  await testRejectsUnconfiguredTargetAndNonReadonlyMode();
  testAuditInboxProjectionIsSummaryOnly();
  console.log("plugin-workspace-audit-service tests passed");
})();
