"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-native-environment-ui.js"), "utf8");

function createHarness(fakeModel) {
  const timers = [];
  const context = {
    console,
    Date,
    Promise,
    URLSearchParams,
    JSON,
    globalThis: null,
    state: {
      selectedWorkspaceId: "mk",
    },
    document: {
      visibilityState: "visible",
      documentElement: {
        dataset: {
          nativeShell: "ios",
          nativeEnvironmentContext: "1",
        },
        classList: { contains: (name) => name === "native-shell-ios" },
      },
      addEventListener() {},
    },
    localStorage: {
      getItem(key) {
        if (key === "homeAI.nativeShell") return "ios";
        if (key === "homeAI.nativeEnvironmentContext") return "1";
        return "";
      },
    },
    window: {
      location: { search: "?nativeShell=ios" },
      HomeAINativeEnvironmentCapability: { environmentContext: true },
      HomeAINativeEnvironment: {
        requests: [],
        getContext(request) {
          this.requests.push(request);
          return Promise.resolve({ source: "native", targetAt: request.targetAt });
        },
      },
      __homeAiImportComposerNativeEnvironmentModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
      addEventListener() {},
      setInterval() {
        return 1;
      },
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
    apiCalls: [],
    api(route, options) {
      context.apiCalls.push({ route, options });
      return Promise.resolve({ ok: true });
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-native-environment-ui.js" });
  context.timers = timers;
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
  await test("classic native environment adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-native-environment-model\/chat-composer-native-environment-model\.js/);
    assert.match(source, /__homeAiImportComposerNativeEnvironmentModel/);
    assert.match(source, /currentChatComposerNativeEnvironmentModel/);
    assert.match(source, /nativeEnvironmentBridgeAvailabilityPlan/);
    assert.match(source, /createNativeEnvironmentContextRequestPlan/);
    assert.match(source, /nativeEnvironmentSnapshotUploadBodyPlan/);
  });

  await test("classic helpers consume loaded ESM model for bridge and request planning", async () => {
    const calls = [];
    const fakeModel = {
      nativeEnvironmentBridgeAvailabilityPlan(input) {
        calls.push(["availability", input.nativeShellQuery]);
        return { available: true };
      },
      nativeEnvironmentContextTargetAtPlan(input) {
        calls.push(["target", input.text]);
        return { targetAt: "2026-07-05T09:00:00.000Z" };
      },
      nativeEnvironmentContextPurposePlan(input) {
        calls.push(["purpose", input.text || input.body?.taskGroupId || ""]);
        return { purpose: "wardrobe_outfit" };
      },
      createNativeEnvironmentContextRequestPlan(input) {
        calls.push(["request", input.text]);
        return {
          shouldRequest: true,
          purpose: "wardrobe_outfit",
          targetAt: "2026-07-05T09:00:00.000Z",
          request: {
            targetAt: "2026-07-05T09:00:00.000Z",
            forceRefresh: false,
            precise: false,
            purpose: "wardrobe_outfit",
          },
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerNativeEnvironmentModel(context.window);

    assert.equal(context.nativeEnvironmentContextBridgeAvailable(), true);
    assert.equal(context.nativeEnvironmentContextTargetAt("tomorrow morning"), "2026-07-05T09:00:00.000Z");
    assert.equal(context.nativeEnvironmentContextPurpose({ taskGroupId: "plugin:wardrobe" }, ""), "wardrobe_outfit");
    const result = await context.requestNativeEnvironmentContextForSend(
      { taskGroupId: "plugin:wardrobe" },
      "tomorrow morning",
    );

    assert.equal(context.importedPath, "/vite-islands/chat-composer-native-environment-model/chat-composer-native-environment-model.js");
    assert.equal(result.purpose, "wardrobe_outfit");
    assert.equal(result.targetAt, "2026-07-05T09:00:00.000Z");
    assert.deepEqual(context.window.HomeAINativeEnvironment.requests.at(-1), {
      targetAt: "2026-07-05T09:00:00.000Z",
      forceRefresh: false,
      precise: false,
      purpose: "wardrobe_outfit",
    });
    assert.deepEqual(calls.map((entry) => entry[0]), ["availability", "target", "purpose", "availability", "request"]);
  });

  await test("snapshot refresh uses ESM throttle and upload body planning while classic owns API side effect", async () => {
    const calls = [];
    const fakeModel = {
      nativeEnvironmentBridgeAvailabilityPlan() {
        calls.push("availability");
        return { available: true };
      },
      nativeEnvironmentSnapshotRefreshPlan(input) {
        calls.push(`refresh:${input.forceUpload}`);
        return { shouldRefresh: true };
      },
      nativeEnvironmentSnapshotUploadBodyPlan(input) {
        calls.push(`upload:${input.workspaceId}`);
        return {
          body: {
            workspaceId: input.workspaceId,
            deviceId: input.deviceId,
            environmentContext: Object.assign({}, input.context, { purpose: input.purpose }),
            marker: "esm_upload_body",
          },
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerNativeEnvironmentModel(context.window);

    const result = await context.refreshNativeEnvironmentSnapshotForSend({
      forceUpload: true,
      forceRefresh: true,
      purpose: "model_tool_snapshot",
    });

    assert.equal(result.source, "native");
    assert.equal(context.apiCalls.length, 1);
    assert.equal(context.apiCalls[0].route, "/api/native/environment-context");
    assert.deepEqual(JSON.parse(context.apiCalls[0].options.body), {
      workspaceId: "mk",
      deviceId: "native-ios-current",
      environmentContext: {
        source: "native",
        purpose: "model_tool_snapshot",
      },
      marker: "esm_upload_body",
    });
    assert.deepEqual(calls, ["availability", "refresh:true", "upload:mk"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
