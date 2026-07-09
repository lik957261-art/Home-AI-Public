"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/access-key-manager-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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

  await test("access-key manager model stays browser-global free", () => {
    const source = read("src/vite-islands/navigation-shell/access-key-manager-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /ACCESS_KEY_MANAGER_MODEL_VERSION/);
  });

  await test("view plan groups owner workspaces and access-key placement", () => {
    const plan = model.accessKeyManagerViewPlan({
      isOwnerAccessManager: true,
      generatedAccessKey: { kind: "workspace", workspaceId: "local-a" },
      workspaces: [
        { id: "owner" },
        { id: "local-a", source: "local-workspace" },
        { id: "deployed-a", source: "config" },
      ],
      accessKeys: [
        { workspaceId: "local-a", hasKey: true },
        { workspaceId: "missing-a", hasKey: true },
      ],
    });
    assert.equal(plan.title, "Owner 管理");
    assert.deepEqual(plan.localWorkspaces.map((item) => item.id), ["local-a"]);
    assert.deepEqual(plan.deploymentWorkspaces.map((item) => item.id), ["deployed-a"]);
    assert.deepEqual(plan.orphanAccessKeys.map((item) => item.workspaceId), ["missing-a"]);
    assert.equal(plan.generatedAccessKeyPlacement.generatedInWorkspaceRow, true);
    assert.equal(plan.generatedAccessKeyPlacement.visibleAsLooseBlock, false);

    const nonOwner = model.accessKeyManagerViewPlan({ isOwnerAccessManager: false });
    assert.equal(nonOwner.title, "Access Key");
    assert.deepEqual(nonOwner.localWorkspaces, []);
  });

  await test("workspace record and generated-key target plans normalize inputs", () => {
    assert.equal(model.workspaceRootLabelPlan({ localConfig: { defaultWorkspace: "/data/root" } }), "/data/root");
    assert.deepEqual(model.workspaceToolsetsPlan({
      localConfig: { allowedToolsets: [" finance ", "", "wardrobe"] },
    }), ["finance", "wardrobe"]);
    assert.deepEqual(model.workspaceKeyRecordPlan({
      workspace: {
        id: "family",
        label: "Family",
        accessKeyStatus: { hasKey: true, updatedAt: "2026-07-05T00:00:00Z" },
      },
    }), {
      workspaceId: "family",
      workspaceLabel: "Family",
      hasKey: true,
      updatedAt: "2026-07-05T00:00:00Z",
    });
    assert.equal(model.generatedAccessKeyTargetPlan({
      generatedAccessKey: { kind: "workspace", workspaceId: "family" },
      target: { kind: "workspace", workspaceId: "family" },
    }).visible, true);
    assert.equal(model.generatedAccessKeyTargetPlan({
      generatedAccessKey: { kind: "workspace", workspaceId: "family" },
      target: { kind: "workspace", workspaceId: "owner" },
    }).visible, false);
  });

  await test("onboarding payload and state plans stay deterministic and redacted", () => {
    const payloadPlan = model.workspaceOnboardingPayloadPlan({
      rawWorkspaceId: " 李 玉双 ",
      displayName: "李玉双",
      pluginIds: ["finance", "wardrobe"],
    });
    assert.equal(payloadPlan.ok, false);
    assert.equal(payloadPlan.payload, null);
    assert.match(payloadPlan.errorMessage, /工作区 ID/);
    assert.equal(model.workspaceOnboardingPayloadPlan({ rawWorkspaceId: "family one" }).payload.workspaceId, "family_one");
    assert.equal(model.slugWorkspaceOnboardingIdPlan(" Family One! "), "family_one");
    assert.deepEqual(model.rememberWorkspaceOnboardingDraftPlan({
      workspaceId: "family",
      label: "Family",
      pluginIds: ["finance"],
    }), {
      workspaceId: "family",
      displayName: "Family",
      pluginIds: ["finance"],
    });
    assert.equal(model.workspaceOnboardingPlanMatchesPayloadPlan({
      plan: { workspaceId: "family", displayName: "Family", pluginIds: ["finance"] },
      payload: { workspaceId: "family", displayName: "Family", pluginIds: ["finance"] },
    }), true);
    const run = model.createWorkspaceOnboardingRunStatePlan({
      plan: { steps: [{ id: "mac-user" }, { id: "plugins" }], macUser: "family" },
      payload: { workspaceId: "family", displayName: "Family", pluginIds: ["finance"] },
    });
    assert.equal(run.status, "running");
    assert.equal(run.steps[0].status, "running");
    assert.equal(run.steps[1].progressHint, "等待后端回执");
    const failed = model.failWorkspaceOnboardingRunStatePlan({ run, error: "network" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.steps[0].error, "network");
    const redacted = model.redactedWorkspaceOnboardingResultPlan({
      credentials: { homeAiAccessKey: "raw-secret-key" },
    });
    assert.deepEqual(redacted.credentials, { homeAiAccessKey: true });
  });

  await test("request and confirmation plans return bounded metadata only", () => {
    assert.deepEqual(model.accessKeyListRequestPlan({ workspaceId: "owner" }), {
      path: "/api/access-keys",
      workspaceId: "owner",
      requestAllWorkspaceKeys: true,
    });
    assert.deepEqual(model.accessKeyListRequestPlan({ workspaceId: "family one" }), {
      path: "/api/access-keys?workspaceId=family%20one",
      workspaceId: "family one",
      requestAllWorkspaceKeys: false,
    });
    assert.equal(model.workspaceExistsPlan({
      workspaceId: "family one",
      canonicalWorkspaceId: "family_one",
      workspaces: [{ id: "family_one" }],
    }), true);
    assert.match(model.ownerAccessKeyConfirmationPlan().message, /Owner Access Key/);
    assert.equal(model.workspaceAccessKeyConfirmationPlan({
      action: "rotate",
      label: "Family",
    }).confirmLabel, "更换 Key");
    assert.equal(model.workspaceAccessKeyConfirmationPlan({
      action: "revoke",
      label: "Family",
    }).danger, true);
    assert.equal(model.deleteWorkspaceConfirmationPlan({ workspaceId: "family" }).confirmLabel, "删除");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
