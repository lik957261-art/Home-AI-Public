"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/workspace-admin-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("workspace admin model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/workspace-admin-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("plans workspace access rows and labels", async () => {
    const model = await loadModel();
    const workspace = {
      id: "family",
      label: "Family",
      workDirectories: [{ path: "/Users/example/path" }],
      accessKeyStatus: { hasKey: true, kind: "owner", source: "file" },
      tongbaoWallet: { availableBalance: 12, heldBalance: 2 },
      bindings: {
        channels: [{ label: "Email", outboundStatus: "verified", contextTokenAvailable: false }],
        interfaces: [{ label: "Drive", category: "SMB", detail: "read" }],
      },
    };
    assert.equal(model.pathTailName("C:\\Users\\demo\\"), "demo");
    assert.equal(model.workspaceRootDirectoryName(workspace), "HermesWorkspace");
    assert.equal(model.workspaceAccessKeyStatusLabel(workspace), "已生成 · file");
    assert.deepEqual(model.workspaceTongbaoLineView(workspace), {
      label: "通宝",
      value: "12",
      heldText: " · 冻结 2",
    });
    assert.deepEqual(model.workspaceBindingChipLabels(workspace), [
      "Email · 已验证 · Context 未绑定",
      "Drive · SMB · read",
    ]);
    assert.deepEqual(
      model.workspaceAccessRowsPlan({
        workspaces: [{ id: "owner" }, workspace],
        selectedWorkspaceId: "",
        auth: { workspaceIds: ["family"] },
      }),
      [workspace],
    );
  });

  await test("plans runtime model, reasoning, worker, and MoA values", async () => {
    const model = await loadModel();
    const config = {
      defaultModelId: "deepseek:chat",
      modelOptions: [
        { id: "openai:gpt", provider: "openai", familyLabel: "OpenAI", variantLabel: "GPT" },
        { id: "deepseek:chat", provider: "deepseek", familyLabel: "DeepSeek", variantLabel: "Chat" },
      ],
      gatewayWorkerSettings: { ownerMinWarm: 2 },
      gatewayWorkerEffectiveSettings: { workspaceMinWarm: 1 },
      moaConfig: { presets: [{ id: "default" }] },
    };
    assert.deepEqual(model.runtimeModelFamilyOptionsPlan(config), [
      { id: "openai", label: "OpenAI", selected: false },
      { id: "deepseek", label: "DeepSeek", selected: true },
    ]);
    assert.deepEqual(model.runtimeModelOptionsPlan(config, "deepseek"), [
      { id: "deepseek:chat", label: "Chat", selected: true },
    ]);
    assert.deepEqual(model.runtimeReasoningOptionsPlan([{ value: "medium", label: "Medium" }], "", "medium"), [
      { value: "medium", label: "Medium", selected: true },
    ]);
    assert.equal(model.runtimeGatewayWorkerValue(config, "ownerMinWarm", {}), "2");
    assert.equal(model.runtimeGatewayWorkerValue(config, "workspaceMinWarm", {}), "1");
    assert.equal(model.runtimeGatewayWorkerValue({}, "idleTtlMinutes", { idleTtlMs: 1800000 }), "30");
    assert.equal(model.runtimeGatewayWorkerInputsPlan(config, {})[0].value, "2");
    assert.equal(model.runtimeMoaPresetText(config), "[\n  {\n    \"id\": \"default\"\n  }\n]");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
