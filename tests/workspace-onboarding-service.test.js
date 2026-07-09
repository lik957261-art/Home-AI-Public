"use strict";

const assert = require("node:assert/strict");
const {
  createWorkspaceOnboardingService,
  macUserForWorkspaceId,
  publicPlan,
  slugWorkspaceId,
} = require("../adapters/workspace-onboarding-service");

function makeService(overrides = {}) {
  const calls = {
    executor: [],
    gateway: [],
    grants: [],
    keys: [],
    upserts: [],
  };
  const workspaces = new Map();
  const service = createWorkspaceOnboardingService(Object.assign({
    defaultPluginIds: ["wardrobe", "note"],
    ensureWorkspaceGateway(input) {
      calls.gateway.push(input);
      return {
        ok: true,
        profiles: ["lowgw31", "lowgw32", "deepseekgw31"],
        restartRequired: true,
        profileBindingRefreshed: true,
      };
    },
    findWorkspace(workspaceId) {
      return workspaces.get(workspaceId) || null;
    },
    hermesPluginService: {
      grantWorkspace(input) {
        calls.grants.push(input);
        if (input.pluginId === "health") {
          return {
            ok: false,
            error: "health_owner_key_missing",
            provisioning: {
              status: "provisioning_failed",
              error: "health_owner_key_missing",
              accessKey: "should-not-leak",
            },
          };
        }
        return {
          ok: true,
          provisioning: {
            status: "active",
            accessKey: "should-not-leak",
            configCreated: true,
          },
        };
      },
    },
    liveRoot: "/Users/example/path",
    nowIso: () => "2026-06-08T00:00:00.000Z",
    rotateWorkspaceAccessKey(workspaceId, options) {
      calls.keys.push({ workspaceId, options });
      return {
        key: `hm-key-${workspaceId}`,
        record: { workspaceId, status: "present", updatedAt: "2026-06-08T00:00:00.000Z" },
      };
    },
    systemProvisioningExecutor: {
      runStep(action, context) {
        calls.executor.push({ action, workspaceId: context.workspaceId, macUser: context.macUser });
        return { ok: true, action, checked: true };
      },
    },
    upsertLocalWorkspace(input, actor) {
      calls.upserts.push({ input, actor });
      const record = {
        id: input.workspaceId,
        label: input.label,
        source: "local-workspace",
      };
      workspaces.set(record.id, record);
      return record;
    },
  }, overrides));
  return { calls, service };
}

function testPlanNormalizesWorkspaceAndSteps() {
  const plan = publicPlan({
    workspaceId: "Li Yu Shuang",
    label: "Li Yu Shuang",
    pluginIds: ["wardrobe", "note", "wardrobe"],
  });
  assert.equal(slugWorkspaceId("Li Yu Shuang"), "li_yu_shuang");
  assert.equal(macUserForWorkspaceId("weixin_wuping"), "hm-weixin-wuping");
  assert.equal(plan.ok, true);
  assert.equal(plan.workspaceId, "li_yu_shuang");
  assert.equal(plan.macUser, "hm-li-yu-shuang");
  assert.deepEqual(plan.pluginIds, ["wardrobe", "note"]);
  assert.deepEqual(plan.steps.map((step) => step.id), [
    "workspace.record",
    "home_ai.access_key",
    "mac.user",
    "mac.roots",
    "mac.acl",
    "gateway.profiles",
    "plugin.wardrobe",
    "plugin.note",
    "mac.launchd",
    "validation.smokes",
  ]);
}

function testPlanDefaultsToAllDeployableWorkspacePlugins() {
  const plan = publicPlan({
    workspaceId: "Public Setup User",
  });
  assert.deepEqual(plan.pluginIds, ["wardrobe", "health", "finance", "email", "note", "growth"]);
  assert.deepEqual(
    plan.steps.filter((step) => step.category === "plugin").map((step) => step.id),
    ["plugin.wardrobe", "plugin.health", "plugin.finance", "plugin.email", "plugin.note", "plugin.growth"],
  );
}

async function testApplyBlocksBeforeSideEffectsWithoutSystemExecutor() {
  const { calls, service } = makeService({ systemProvisioningExecutor: null });
  const result = await service.applyOnboarding({
    workspaceId: "xulu",
    pluginIds: ["wardrobe"],
  }, { actor: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedBeforeSideEffects, true);
  assert.equal(calls.upserts.length, 0);
  assert.equal(calls.keys.length, 0);
  assert.equal(calls.gateway.length, 0);
  assert.equal(calls.grants.length, 0);
  assert.equal(result.steps.find((step) => step.id === "mac.user").status, "blocked");
}

async function testApplyRunsWorkspaceGatewaySystemAndPlugins() {
  const { calls, service } = makeService();
  const result = await service.applyOnboarding({
    workspaceId: "xulu",
    label: "Xu Lu",
    pluginIds: ["wardrobe", "note"],
  }, { actor: "owner-principal" });

  assert.equal(result.ok, true);
  assert.equal(result.status, "active");
  assert.equal(result.workspace.id, "xulu");
  assert.equal(result.credentials.homeAiAccessKey, "hm-key-xulu");
  assert.deepEqual(calls.upserts, [{
    input: { workspaceId: "xulu", label: "Xu Lu", username: "xulu" },
    actor: "owner-principal",
  }]);
  assert.equal(calls.keys[0].workspaceId, "xulu");
  assert.deepEqual(calls.keys[0].options, {
    actor: "owner-principal",
    preserveExisting: true,
    reason: "workspace_onboarding",
  });
  assert.deepEqual(calls.gateway, [{ workspaceId: "xulu", refreshProfileBinding: true, macUser: "hm-xulu" }]);
  assert.deepEqual(calls.executor.map((call) => call.action), [
    "ensure_mac_user",
    "ensure_workspace_roots",
    "repair_workspace_acl",
    "ensure_launchd_services",
    "run_workspace_onboarding_smokes",
  ]);
  assert.deepEqual(calls.grants.map((call) => call.pluginId), ["wardrobe", "note"]);
  assert.deepEqual(calls.grants.map((call) => call.skipGatewayRefresh), [true, true]);
  assert.equal(result.steps.find((step) => step.id === "plugin.wardrobe").provisioning.accessKey, true);
}

async function testApplyPreservesExistingWorkspaceAccessKeyOnRetry() {
  const { calls, service } = makeService({
    rotateWorkspaceAccessKey(workspaceId, options) {
      calls.keys.push({ workspaceId, options });
      return {
        key: "",
        preservedExisting: true,
        record: { workspaceId, hasKey: true, updatedAt: "2026-06-08T00:00:00.000Z" },
      };
    },
  });
  const result = await service.applyOnboarding({
    workspaceId: "twh",
    label: "TWH",
    pluginIds: ["wardrobe"],
  }, { actor: "owner-principal" });

  assert.equal(result.ok, true);
  assert.equal(result.credentials.homeAiAccessKey, undefined);
  assert.deepEqual(calls.keys, [{
    workspaceId: "twh",
    options: {
      actor: "owner-principal",
      preserveExisting: true,
      reason: "workspace_onboarding",
    },
  }]);
  const step = result.steps.find((item) => item.id === "home_ai.access_key");
  assert.equal(step.accessKeyCreated, false);
  assert.equal(step.accessKeyPreserved, true);
  assert.equal(step.accessKeyStatus.hasKey, true);
}

async function testPluginFailureIsBoundedAndDoesNotStopLaterPlugins() {
  const { calls, service } = makeService();
  const result = await service.applyOnboarding({
    workspaceId: "xuyan",
    pluginIds: ["health", "note"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "provisioning_failed");
  assert.deepEqual(calls.grants.map((call) => call.pluginId), ["health", "note"]);
  const health = result.steps.find((step) => step.id === "plugin.health");
  assert.equal(health.status, "failed");
  assert.equal(health.error, "health_owner_key_missing");
  assert.equal(health.provisioning.accessKey, true);
  assert.equal(result.steps.find((step) => step.id === "plugin.note").status, "ok");
}

async function testValidationFailurePreservesBoundedSystemDiagnostics() {
  const { service } = makeService({
    systemProvisioningExecutor: {
      runStep(action, context) {
        if (action === "run_workspace_onboarding_smokes") {
          return {
            ok: false,
            error: "worker_acl_harness_failed",
            acl: {
              status: 1,
              smokeOk: false,
              stdout: "{\"ok\":false}",
              stderr: "",
            },
            ignoredIssues: ["legacy_workspace_acl_issue"],
          };
        }
        return { ok: true, action, workspaceId: context.workspaceId };
      },
    },
  });
  const result = await service.applyOnboarding({
    workspaceId: "twh",
    pluginIds: ["note"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "provisioning_failed");
  const validation = result.steps.find((step) => step.id === "validation.smokes");
  assert.equal(validation.status, "failed");
  assert.equal(validation.error, "worker_acl_harness_failed");
  assert.equal(validation.acl.status, 1);
  assert.deepEqual(validation.ignoredIssues, ["legacy_workspace_acl_issue"]);
}

async function run() {
  testPlanNormalizesWorkspaceAndSteps();
  testPlanDefaultsToAllDeployableWorkspacePlugins();
  await testApplyBlocksBeforeSideEffectsWithoutSystemExecutor();
  await testApplyRunsWorkspaceGatewaySystemAndPlugins();
  await testApplyPreservesExistingWorkspaceAccessKeyOnRetry();
  await testPluginFailureIsBoundedAndDoesNotStopLaterPlugins();
  await testValidationFailurePreservesBoundedSystemDiagnostics();
  console.log("workspace onboarding service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
