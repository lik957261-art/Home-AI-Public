"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-access-key-manager-ui.js"), "utf8");

function noop() {}

function createOverlay() {
  return {
    innerHTML: "",
    classList: {
      toggle() {},
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createPayloadRoot() {
  const inputs = {
    "#workspaceOnboardingWorkspaceId": { value: " Family One! " },
    "#workspaceOnboardingDisplayName": { value: "Family One" },
  };
  return {
    querySelector(selector) {
      return inputs[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="workspaceOnboardingPlugin"]:checked') {
        return [{ value: "finance" }, { value: "wardrobe" }];
      }
      return [];
    },
  };
}

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const overlay = createOverlay();
  const context = {
    console,
    Date,
    Math,
    Promise,
    URLSearchParams,
    state: {
      accessKeyManagerOpen: true,
      accessKeysAuth: { isOwner: true, source: "test", canRotateGlobal: true },
      auth: { isOwner: true, workspaceId: "owner" },
      selectedWorkspaceId: "owner",
      accessKeyWorkspaceId: "owner",
      accessKeys: [{ workspaceId: "family", workspaceLabel: "Family", hasKey: true, updatedAt: "2026-07-05T00:00:00Z" }],
      generatedAccessKey: null,
      workspaces: [
        { id: "owner", label: "Owner" },
        {
          id: "family",
          label: "Family",
          source: "local-workspace",
          localConfig: { defaultWorkspace: "/classic/root", allowedToolsets: ["classic"] },
          accessKeyStatus: { hasKey: true, updatedAt: "2026-07-05T00:00:00Z" },
        },
      ],
      workspaceOnboardingDraft: null,
      workspaceOnboardingResult: null,
      workspaceOnboardingPlan: null,
      workspaceOnboardingRun: null,
      workspaceOnboardingLoading: false,
      workspaceOnboardingError: "",
      workspaceOnboardingPendingAction: "",
      accessKeysLoading: false,
      accessKeysError: "",
    },
    window: {
      isSecureContext: true,
      requestAnimationFrame(callback) {
        if (typeof callback === "function") callback();
      },
      __homeAiImportAccessKeyManagerModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    document: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
    },
    localStorage: {
      setItem() {},
    },
    navigator: {
      clipboard: { writeText: async () => {} },
    },
    $(id) {
      if (id === "accessKeyOverlay") return overlay;
      return null;
    },
    currentWorkspace() {
      return context.state.workspaces[0];
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    formatTime(value) {
      return `time:${value}`;
    },
    splitConfigList(value) {
      if (Array.isArray(value)) return value;
      return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
    },
    joinConfigList(value) {
      return Array.isArray(value) ? value.join("\n") : "";
    },
    wireWorkspaceCreateDefaults: noop,
    api: async () => ({}),
    closeTopMoreMenu: noop,
    closeSidebar: noop,
    showError(error) {
      calls.push(["showError", error?.message || String(error)]);
    },
    showLogin(message) {
      calls.push(["showLogin", message]);
    },
    showPushToast(message) {
      calls.push(["toast", message]);
    },
    storeAccessKey(value) {
      calls.push(["store-key", value]);
    },
    clearStoredAccessKey(options = {}) {
      calls.push(["clear-key", options]);
    },
    loadWorkspaces: async () => {},
    loadProjects: async () => {},
    __calls: calls,
    __overlay: overlay,
  };
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__accessKeyHarness = {
  ACCESS_KEY_MANAGER_MODEL_ESM_PATH,
  importAccessKeyManagerModel,
  currentAccessKeyManagerModel,
  accessKeyWorkspaceRootLabel,
  accessKeyWorkspaceToolsets,
  accessKeyWorkspaceRecord,
  generatedAccessKeyMatchesTarget,
  accessKeyManagerViewState,
  workspaceOnboardingStatusLabel,
  workspaceOnboardingStatusTone,
  workspaceOnboardingEvidenceTitle,
  accessKeyListRequest,
  workspaceOnboardingPayload,
  slugWorkspaceOnboardingId,
  rememberWorkspaceOnboardingDraft,
  workspaceOnboardingPlanMatchesPayload,
  createWorkspaceOnboardingRunState,
  failWorkspaceOnboardingRunState,
  redactedWorkspaceOnboardingResult,
  generateWorkspaceAccessKey,
  renderAccessKeyManager,
};`, context, { filename: "app-access-key-manager-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic access-key manager adapter declares bounded ESM markers", () => {
    assert.match(source, /ACCESS_KEY_MANAGER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/access-key-manager-model\/access-key-manager-model\.js/);
    assert.match(source, /function importAccessKeyManagerModel/);
    assert.match(source, /function currentAccessKeyManagerModel/);
    assert.match(source, /__homeAiImportAccessKeyManagerModel/);
    assert.match(source, /accessKeyManagerViewPlan/);
    assert.match(source, /workspaceOnboardingPayloadPlan/);
  });

  await test("classic adapter delegates access-key plans after ESM import", async () => {
    const modelCalls = [];
    const fakeModel = {
      workspaceRootLabelPlan(workspace) {
        modelCalls.push(["root", workspace.id]);
        return "/model/root";
      },
      workspaceToolsetsPlan(workspace) {
        modelCalls.push(["toolsets", workspace.id]);
        return ["model-tool"];
      },
      workspaceKeyRecordPlan(input) {
        modelCalls.push(["record", input.workspace.id, input.keyRecord.workspaceId]);
        return { workspaceId: "family", workspaceLabel: "Model Family", hasKey: false, updatedAt: "" };
      },
      generatedAccessKeyTargetPlan(input) {
        modelCalls.push(["generated-target", input.target.workspaceId]);
        return { visible: true };
      },
      accessKeyManagerViewPlan(input) {
        modelCalls.push(["view", input.workspaces.length]);
        return {
          isOwnerAccessManager: true,
          localWorkspaces: [{ id: "family", label: "Model Family", source: "local-workspace" }],
          deploymentWorkspaces: [],
          orphanAccessKeys: [],
          generatedAccessKeyPlacement: { visibleAsLooseBlock: false },
          title: "Model Owner",
          subtitle: "Model subtitle",
          emptyText: "Model empty",
        };
      },
      workspaceOnboardingStatusLabelPlan(status) {
        modelCalls.push(["status-label", status]);
        return `label:${status}`;
      },
      workspaceOnboardingStatusTonePlan(status) {
        modelCalls.push(["status-tone", status]);
        return `tone-${status}`;
      },
      workspaceOnboardingEvidenceTitlePlan(input) {
        modelCalls.push(["evidence-title", input.status, input.hasResult]);
        return "Model evidence";
      },
      accessKeyListRequestPlan(input) {
        modelCalls.push(["request", input.workspaceId]);
        return { path: "/model/access-keys", workspaceId: input.workspaceId, requestAllWorkspaceKeys: true };
      },
      workspaceOnboardingPayloadPlan(input) {
        modelCalls.push(["payload", input.rawWorkspaceId, input.pluginIds.join(",")]);
        return { ok: true, payload: { workspaceId: "model-workspace", displayName: "Model", pluginIds: input.pluginIds, runSmokes: true } };
      },
      slugWorkspaceOnboardingIdPlan(value) {
        modelCalls.push(["slug", value]);
        return "model-slug";
      },
      rememberWorkspaceOnboardingDraftPlan(payload) {
        modelCalls.push(["remember", payload.workspaceId]);
        return { workspaceId: "remembered", displayName: "Remembered", pluginIds: [] };
      },
      workspaceOnboardingPlanMatchesPayloadPlan(input) {
        modelCalls.push(["matches", input.plan.workspaceId, input.payload.workspaceId]);
        return true;
      },
      createWorkspaceOnboardingRunStatePlan(input) {
        modelCalls.push(["run", input.payload.workspaceId]);
        return { status: "model-running" };
      },
      failWorkspaceOnboardingRunStatePlan(input) {
        modelCalls.push(["fail", input.error]);
        return { status: "model-failed", error: input.error };
      },
      redactedWorkspaceOnboardingResultPlan(result) {
        modelCalls.push(["redact", Boolean(result.credentials?.homeAiAccessKey)]);
        return { credentials: { homeAiAccessKey: true }, redacted: true };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    const harness = context.__accessKeyHarness;

    assert.equal(harness.currentAccessKeyManagerModel(), fakeModel);
    assert.equal(context.__calls[0][0], "import");
    assert.equal(context.__calls[0][1], "/vite-islands/access-key-manager-model/access-key-manager-model.js");
    assert.equal(harness.accessKeyWorkspaceRootLabel({ id: "family" }), "/model/root");
    assert.deepEqual(harness.accessKeyWorkspaceToolsets({ id: "family" }), ["model-tool"]);
    assert.equal(harness.accessKeyWorkspaceRecord(
      { id: "family" },
      { workspaceId: "family" },
    ).workspaceLabel, "Model Family");
    context.state.generatedAccessKey = { kind: "workspace", workspaceId: "family" };
    assert.equal(harness.generatedAccessKeyMatchesTarget({ kind: "workspace", workspaceId: "family" }), true);
    assert.equal(harness.accessKeyManagerViewState({
      isOwnerAccessManager: true,
      workspaces: context.state.workspaces,
      accessKeys: context.state.accessKeys,
    }).title, "Model Owner");
    assert.equal(harness.workspaceOnboardingStatusLabel("ok"), "label:ok");
    assert.equal(harness.workspaceOnboardingStatusTone("ok"), "tone-ok");
    assert.equal(harness.workspaceOnboardingEvidenceTitle({ status: "ok" }), "Model evidence");
    assert.equal(harness.accessKeyListRequest({ workspaceId: "owner" }).path, "/model/access-keys");
    assert.equal(harness.workspaceOnboardingPayload(createPayloadRoot()).workspaceId, "model-workspace");
    assert.equal(harness.slugWorkspaceOnboardingId("Family One"), "model-slug");
    harness.rememberWorkspaceOnboardingDraft({ workspaceId: "family" });
    assert.equal(context.state.workspaceOnboardingDraft.workspaceId, "remembered");
    assert.equal(harness.workspaceOnboardingPlanMatchesPayload({ workspaceId: "a" }, { workspaceId: "b" }), true);
    assert.equal(harness.createWorkspaceOnboardingRunState({}, { workspaceId: "family" }).status, "model-running");
    assert.equal(harness.failWorkspaceOnboardingRunState({}, "failure").status, "model-failed");
    assert.deepEqual(harness.redactedWorkspaceOnboardingResult({
      credentials: { homeAiAccessKey: "raw-key" },
    }), { credentials: { homeAiAccessKey: true }, redacted: true });
    assert.ok(modelCalls.some((item) => item[0] === "payload"));
  });

  await test("classic adapter keeps synchronous behavior when no ESM model is available", async () => {
    const context = createHarness(null);
    await flushImport();
    const harness = context.__accessKeyHarness;
    assert.equal(harness.currentAccessKeyManagerModel(), null);
    assert.equal(harness.accessKeyWorkspaceRootLabel(context.state.workspaces[1]), "/classic/root");
    assert.deepEqual(harness.accessKeyWorkspaceToolsets(context.state.workspaces[1]), ["classic"]);
    assert.equal(harness.accessKeyWorkspaceRecord(context.state.workspaces[1], null).hasKey, true);
    assert.equal(harness.accessKeyListRequest({ workspaceId: "family" }).path, "/api/access-keys?workspaceId=family");
    assert.equal(harness.workspaceOnboardingPayload(createPayloadRoot()).workspaceId, "family_one");
    assert.equal(harness.slugWorkspaceOnboardingId("Family One!"), "family_one");
    assert.equal(harness.workspaceOnboardingStatusLabel("manual_required"), "需人工处理");
    const redacted = harness.redactedWorkspaceOnboardingResult({
      credentials: { homeAiAccessKey: "raw-key" },
    });
    assert.equal(redacted.credentials.homeAiAccessKey, true);
  });

  await test("workspace key relogin keeps one-time generated key visible", async () => {
    const context = createHarness(null);
    await flushImport();
    context.state.accessKeys = [{ workspaceId: "family", workspaceLabel: "Family", hasKey: false }];
    context.api = async (requestPath, options = {}) => {
      context.__calls.push(["api", requestPath, options.method || "GET"]);
      return { key: "new-family-key", requiresReLogin: true };
    };

    await context.__accessKeyHarness.generateWorkspaceAccessKey("family");

    assert.deepEqual(JSON.parse(JSON.stringify(context.state.generatedAccessKey)), {
      kind: "workspace",
      key: "new-family-key",
      label: "Family Home AI Access Key",
      workspaceId: "family",
      focus: true,
    });
    assert.equal(context.state.accessKeyRequiresLogin, true);
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.__calls.find((entry) => entry[0] === "clear-key"))),
      ["clear-key", { preserveGeneratedAccessKey: true, preserveAccessKeyRequiresLogin: true }],
    );
  });

  await test("classic render path consumes model view plans without owning side effects", async () => {
    const fakeModel = {
      accessKeyManagerViewPlan() {
        return {
          isOwnerAccessManager: true,
          localWorkspaces: [{ id: "family", label: "Model Family", source: "local-workspace" }],
          deploymentWorkspaces: [],
          orphanAccessKeys: [],
          generatedAccessKeyPlacement: { visibleAsLooseBlock: false },
          title: "Model Owner",
          subtitle: "Model subtitle",
        };
      },
      workspaceKeyRecordPlan() {
        return { workspaceId: "family", workspaceLabel: "Model Family", hasKey: true, updatedAt: "2026-07-05T00:00:00Z" };
      },
      workspaceRootLabelPlan() {
        return "/model/root";
      },
      workspaceToolsetsPlan() {
        return ["model-tool"];
      },
      generatedAccessKeyTargetPlan() {
        return { visible: false };
      },
      workspaceOnboardingEvidenceTitlePlan() {
        return "Model evidence";
      },
      workspaceOnboardingStatusTonePlan(status) {
        return status || "pending";
      },
      workspaceOnboardingStatusLabelPlan(status) {
        return status || "未知";
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    context.__accessKeyHarness.renderAccessKeyManager();
    assert.match(context.__overlay.innerHTML, /Model Owner/);
    assert.match(context.__overlay.innerHTML, /Model subtitle/);
    assert.match(context.__overlay.innerHTML, /Model Family/);
    assert.match(context.__overlay.innerHTML, /\/model\/root/);
    assert.match(context.__overlay.innerHTML, /model-tool/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
