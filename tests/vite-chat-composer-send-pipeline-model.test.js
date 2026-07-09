"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/composer-send-pipeline-model.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
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
  await test("composer send pipeline model stays browser-global free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/vite-islands/chat-runtime/composer-send-pipeline-model.mjs"), "utf8");
    assert.match(source, /CHAT_COMPOSER_SEND_PIPELINE_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("notification channel projects native iOS shell markers", async () => {
    const model = await loadModule();
    assert.equal(model.composerClientNotificationChannel({}), "web_push");
    assert.equal(model.composerClientNotificationChannel({ nativeShellQuery: "ios" }), "native_ios_apns");
    assert.equal(model.composerClientNotificationChannel({ documentNativeShell: "ios" }), "native_ios_apns");
    assert.equal(model.composerClientNotificationChannel({ documentNativeShellClass: true }), "native_ios_apns");
    assert.equal(model.composerClientNotificationChannel({ storageNativeShell: "ios" }), "native_ios_apns");
  });

  await test("request plan mirrors single-window group chat and ChatGPT Pro fields", async () => {
    const model = await loadModule();
    const pendingArtifacts = [{ id: "a1" }];
    const plan = model.createClassicComposerSendRequestPlan({
      text: " @chatgpt pro summarize ",
      pendingArtifacts,
      workspaceId: "owner",
      notificationChannel: "native_ios_apns",
      searchSourceFields: { source: "web" },
      aiMention: { chatGptPro: true, mentionsAi: true },
      chatGptProRequested: true,
      chatGptProOnceApproved: true,
      ownerElevationOnceToken: "once_123",
      viewMode: "single",
      singleWindowMode: "chat",
      groupChatView: true,
      singleWindowGroupChatTaskGroupId: "group-chat",
      singleWindowChatTaskGroupId: "chat",
      chatMessageInitialLimit: 80,
      reasoningEffort: "high",
      model: "gpt-test",
      provider: "openai",
      environmentContext: { native: true },
    });

    assert.equal(plan.body.text, "@chatgpt pro summarize");
    assert.equal(plan.body.artifacts, pendingArtifacts);
    assert.equal(plan.body.notificationChannel, "native_ios_apns");
    assert.equal(plan.body.maintenanceMode, true);
    assert.equal(plan.body.ownerElevationOnceToken, "once_123");
    assert.equal(plan.body.elevationScope, "chatgpt_pro_generate");
    assert.equal(plan.body.chatGptProGenerate, true);
    assert.equal(plan.body.requiredTool, "chatgpt_pro_generate");
    assert.equal(plan.body.singleWindowMode, "chat");
    assert.equal(plan.body.taskGroupId, "group-chat");
    assert.equal(plan.body.messageKind, "ai");
    assert.equal(plan.body.reasoning_effort, "high");
    assert.equal(plan.body.model, "gpt-test");
    assert.equal(plan.body.provider, "openai");
    assert.deepEqual(plan.body.environmentContext, { native: true });
    assert.equal(plan.createsNewTask, false);
    assert.equal(JSON.parse(plan.serializedBody).taskGroupId, "group-chat");
  });

  await test("request plan attaches plugin topic and pending directory semantics", async () => {
    const model = await loadModule();
    const existingTask = model.createClassicComposerSendRequestPlan({
      text: "同步插件上下文",
      pendingArtifacts: [],
      workspaceId: "owner",
      viewMode: "tasks",
      currentTaskGroupId: "plugin:movie",
      aiMention: { mentionsAi: false },
      pluginTopicDirectory: { projectId: "dir_movie", name: "Movie" },
      pluginTopicInstruction: "Use Movie tools.",
      sharedTopicGroup: true,
      taskDetailMessageInitialLimit: 30,
    });
    assert.equal(existingTask.body.taskGroupId, "plugin:movie");
    assert.deepEqual(existingTask.body.directory, { projectId: "dir_movie", name: "Movie" });
    assert.equal(existingTask.body.instructions, "Use Movie tools.");
    assert.equal(existingTask.body.singleWindowMode, "chat");
    assert.equal(existingTask.body.messageKind, "plain");
    assert.equal(existingTask.createsNewTask, false);

    const newTask = model.createClassicComposerSendRequestPlan({
      text: "新目录话题",
      workspaceId: "owner",
      viewMode: "tasks",
      directoryTopicDraftSend: true,
      pendingTaskDirectory: { projectId: "dir_new" },
    });
    assert.equal(newTask.createsNewTask, true);
    assert.equal(newTask.consumedPendingDirectory, true);
    assert.deepEqual(newTask.body.directory, { projectId: "dir_new" });
  });

  await test("request plan carries Owner-only MoA fields without ChatGPT Pro tool flags", async () => {
    const model = await loadModule();
    const plan = model.createClassicComposerSendRequestPlan({
      text: "@MOA compare routes",
      workspaceId: "owner",
      aiMention: { mentionsAi: true, moa: true, ownerElevationRequired: true },
      ownerModelElevationRequired: true,
      ownerModelOnceApproved: true,
      ownerElevationOnceToken: "once_moa",
      model: "default",
      provider: "moa",
      viewMode: "single",
      singleWindowMode: "chat",
      singleWindowChatTaskGroupId: "chat-default",
    });

    assert.equal(plan.body.maintenanceMode, true);
    assert.equal(plan.body.maintenance_mode, true);
    assert.equal(plan.body.elevationScope, "owner_high_privilege");
    assert.equal(plan.body.ownerElevationOnceToken, "once_moa");
    assert.equal(plan.body.model, "default");
    assert.equal(plan.body.provider, "moa");
    assert.equal(plan.body.chatGptProGenerate, undefined);
    assert.equal(plan.body.requiredTool, undefined);
    assert.equal(plan.ownerModelElevationRequired, true);
  });

  await test("elevated retry preserves ChatGPT Pro scope and one-time token", async () => {
    const model = await loadModule();
    const plan = model.createElevatedRetryBody({
      requestBody: {
        text: "retry",
        chatGptProGenerate: true,
        elevationScope: "owner_high_privilege",
      },
      elevationScope: "shared_skill_write",
      ownerElevationOnceToken: "once_retry",
    });
    assert.equal(plan.body.maintenanceMode, true);
    assert.equal(plan.body.maintenance_mode, true);
    assert.equal(plan.body.elevationScope, "chatgpt_pro_generate");
    assert.equal(plan.body.ownerElevationOnceToken, "once_retry");
    assert.equal(JSON.parse(plan.serializedBody).ownerElevationOnceToken, "once_retry");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
