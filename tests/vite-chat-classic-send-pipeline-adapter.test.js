"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-send-pipeline-ui.js"), "utf8");

function createHarness(fakeModel) {
  const context = {
    console,
    Date,
    URLSearchParams,
    globalThis: null,
    state: {
      currentTaskGroupId: "",
      ownerElevationOnceToken: "once_classic",
      pendingArtifacts: [{ id: "artifact_1" }],
      pendingTaskDirectory: null,
      selectedWorkspaceId: "owner",
      singleWindowMode: "chat",
      viewMode: "single",
    },
    document: {
      documentElement: {
        dataset: {},
        classList: { contains: () => false },
      },
    },
    localStorage: { getItem: () => "" },
    window: {
      location: { search: "" },
      __homeAiImportComposerSendPipelineModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    ownerElevationActive: () => false,
    isGroupChatView: () => false,
    selectedSharedTopicGroup: () => null,
    taskDetailMessageInitialLimit: () => 30,
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
    SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat-default",
    CHAT_MESSAGE_INITIAL_LIMIT: 80,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-send-pipeline-ui.js" });
  return context;
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
  await test("classic send pipeline adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_SEND_PIPELINE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-send-pipeline-model\/chat-composer-send-pipeline-model\.js/);
    assert.match(source, /__homeAiImportComposerSendPipelineModel/);
    assert.match(source, /currentChatComposerSendPipelineModel/);
    assert.match(source, /classicComposerSendRequestPlan/);
    assert.match(source, /classicElevatedComposerSendBodyPlan/);
    assert.match(source, /ownerModelElevationRequired/);
    assert.match(source, /ownerModelOnceApproved/);
  });

  await test("classic helper consumes loaded ESM model for channel, request, and elevation plans", async () => {
    const calls = [];
    const fakeModel = {
      composerClientNotificationChannel(input) {
        calls.push(["channel", input.nativeShellQuery || ""]);
        return "native_ios_apns";
      },
      createClassicComposerSendRequestPlan(input) {
        calls.push(["request", input.text]);
        return {
          body: {
            text: input.text,
            marker: "esm_request",
            notificationChannel: input.notificationChannel,
          },
          createsNewTask: false,
          consumedPendingDirectory: false,
          serializedBody: JSON.stringify({ text: input.text, marker: "esm_request" }),
        };
      },
      createElevatedRetryBody(input) {
        calls.push(["elevated", input.elevationScope]);
        return {
          body: Object.assign({}, input.requestBody, {
            marker: "esm_elevated",
            ownerElevationOnceToken: input.ownerElevationOnceToken,
          }),
          serializedBody: JSON.stringify({ marker: "esm_elevated" }),
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerSendPipelineModel(context.window);

    assert.equal(context.currentClientNotificationChannel(), "native_ios_apns");
    const requestPlan = context.classicComposerSendRequestPlan(context.composerSendPipelinePlanInput({
      text: "发送",
      aiMention: {},
      searchSourceFields: null,
      chatGptProRequested: false,
    }));
    assert.equal(requestPlan.body.marker, "esm_request");
    assert.equal(requestPlan.serializedBody, JSON.stringify({ text: "发送", marker: "esm_request" }));

    const elevatedPlan = context.classicElevatedComposerSendBodyPlan({
      requestBody: requestPlan.body,
      elevationScope: "owner_high_privilege",
      ownerElevationOnceToken: "once_model",
    });
    assert.equal(elevatedPlan.body.marker, "esm_elevated");
    assert.equal(elevatedPlan.body.ownerElevationOnceToken, "once_model");
    assert.deepEqual(calls.map((entry) => entry[0]), ["channel", "channel", "request", "elevated"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
