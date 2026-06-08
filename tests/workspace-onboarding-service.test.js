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
    liveRoot: "/Users/hermes-host/HermesMobile",
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
  assert.deepEqual(calls.gateway, [{ workspaceId: "xulu", refreshProfileBinding: true }]);
  assert.deepEqual(calls.executor.map((call) => call.action), [
    "ensure_mac_user",
    "ensure_workspace_roots",
    "repair_workspace_acl",
    "ensure_launchd_services",
    "run_workspace_onboarding_smokes",
  ]);
  assert.deepEqual(calls.grants.map((call) => call.pluginId), ["wardrobe", "note"]);
  assert.equal(result.steps.find((step) => step.id === "plugin.wardrobe").provisioning.accessKey, true);
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

async function run() {
  testPlanNormalizesWorkspaceAndSteps();
  await testApplyBlocksBeforeSideEffectsWithoutSystemExecutor();
  await testApplyRunsWorkspaceGatewaySystemAndPlugins();
  await testPluginFailureIsBoundedAndDoesNotStopLaterPlugins();
  console.log("workspace onboarding service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
