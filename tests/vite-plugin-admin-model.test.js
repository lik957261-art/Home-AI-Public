"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

async function loadModel() {
  return import(path.join(repoRoot, "src/vite-islands/plugin-host/plugin-admin-model.mjs"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("plugin admin model stays browser-boundary free", () => {
    const source = read("src/vite-islands/plugin-host/plugin-admin-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.match(source, /PLUGIN_ADMIN_MODEL_VERSION/);
  });

  await test("workspace rows normalize owner first and retry provisioning actions", () => {
    const plan = model.pluginAdminWorkspaceRowsPlan({
      plugin: {
        id: "finance",
        authorizedWorkspaceIds: ["family", "owner"],
        workspaceAuthorizations: [
          { workspaceId: "family", provisioningStatus: "provisioning_failed", provisioningError: "Needs setup" },
        ],
      },
      workspaces: [
        { id: "family", label: "Family" },
        { id: "owner", label: "Owner" },
      ],
    });
    assert.equal(plan.visible, true);
    assert.deepEqual(plan.rows.map((row) => row.workspaceId), ["owner", "family"]);
    assert.equal(plan.rows[0].statusText, "已开通");
    assert.equal(plan.rows[0].actionLabel, "撤销");
    assert.equal(plan.rows[0].currentlyAuthorized, true);
    assert.equal(plan.rows[1].statusText, "authorized / provisioning_failed");
    assert.equal(plan.rows[1].actionLabel, "重试");
    assert.equal(plan.rows[1].currentlyAuthorized, false);
    assert.equal(plan.rows[1].statusTitle, "Needs setup");
  });

  await test("owner-only plugins suppress workspace rows", () => {
    const plan = model.pluginAdminWorkspaceRowsPlan({
      plugin: { id: "codex-mobile", allowWorkspaceGrant: false },
      workspaces: [{ id: "owner", label: "Owner" }],
    });
    assert.equal(plan.visible, false);
    assert.equal(plan.rows.length, 0);
  });

  await test("manager view projects loading empty and expanded card states", () => {
    const loading = model.pluginAdminManagerViewPlan({ loading: true, plugins: [] });
    assert.equal(loading.bodyState, "loading");
    assert.equal(loading.loadingText, "正在读取插件授权...");

    const view = model.pluginAdminManagerViewPlan({
      expandedId: "finance",
      plugins: [
        {
          id: "finance",
          title: "记账",
          riskLevel: "workspace-private",
          authorizedWorkspaceIds: ["owner"],
          provisioning: { supported: true },
        },
      ],
      workspaces: [{ id: "owner", label: "Owner" }],
    });
    assert.equal(view.bodyState, "list");
    assert.equal(view.cards[0].expanded, true);
    assert.equal(view.cards[0].metaText, "finance · 工作区私有 · 非 Owner 已开通 1");
    assert.deepEqual(view.cards[0].contractLabels, [
      "Owner 也需要开通建档",
      "Owner 手动开通各工作区",
      "开通后插件侧绑定/建档",
    ]);
    assert.equal(view.cards[0].workspaceRows.rows.length, 1);
  });

  await test("toggle request plan produces bounded grant and revoke requests", () => {
    const grant = model.pluginAdminToggleRequestPlan({
      pluginId: "finance",
      workspaceId: "family space",
      displayName: "Family",
      currentlyAuthorized: false,
    });
    assert.equal(grant.ok, true);
    assert.equal(grant.method, "POST");
    assert.equal(grant.path, "/api/hermes-plugins/finance/workspaces");
    assert.deepEqual(grant.body, { workspaceId: "family space", displayName: "Family" });

    const revoke = model.pluginAdminToggleRequestPlan({
      pluginId: "movie plugin",
      workspaceId: "family",
      currentlyAuthorized: true,
    });
    assert.equal(revoke.ok, true);
    assert.equal(revoke.method, "DELETE");
    assert.equal(revoke.path, "/api/hermes-plugins/movie%20plugin/workspaces/family");
    assert.equal(revoke.body, null);

    const missing = model.pluginAdminToggleRequestPlan({ pluginId: "", workspaceId: "" });
    assert.equal(missing.ok, false);
  });

  await test("owner gate remains pure", () => {
    assert.equal(model.pluginAdminOwnerGatePlan({ isOwner: true }).allowed, true);
    const denied = model.pluginAdminOwnerGatePlan({ isOwner: false });
    assert.equal(denied.allowed, false);
    assert.equal(denied.errorMessage, "Owner access is required");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
